const { Collection, Client, MessageEmbed } = require("discord.js");
const { LavasfyClient } = require("lavasfy");
const { Manager } = require("erela.js");
const fs = require("fs");
const path = require("path");
const Logger = require("./util/logger");
const prettyMilliseconds = require("pretty-ms");

class Melody extends Client {
  constructor(props) {
    super(props);
    const client = this;
    this.commands = new Collection();
    this.connections = new Map();
    this.prefix = new Map();
    this.Ready = false;
    this.logger = new Logger(path.join(__dirname, ".", "client.log"));
    this.config = require("../config");

    if (this.config.Token === "")
      return new TypeError("No bot token specified in config.js");

    this.LoadCommands();
    this.LoadEvents();

    //Utils
    this.ProgressBar = require("./util/progressbar");
    this.Pagination = require("./util/pagination");
    this.ParseHumanTime = (str) => {
      let Parsed;
      try {
        Parsed = require("./util/timeString")(str);
        return Parsed;
      } catch {
        Parsed = false;
        return Parsed;
      }
    };

    this.Lavasfy = new LavasfyClient(
      {
        clientID: this.config.Spotify.ClientID,
        clientSecret: this.config.Spotify.ClientSecret,
      },
      [
        {
          id: this.config.Lavalink.id,
          host: this.config.Lavalink.host,
          port: this.config.Lavalink.port,
          password: this.config.Lavalink.pass,
        },
      ]
    );

    this.Manager = new Manager({
      nodes: [
        {
          identifier: this.config.Lavalink.id,
          host: this.config.Lavalink.host,
          port: this.config.Lavalink.port,
          password: this.config.Lavalink.pass,
        },
      ],
      send(id, payload) {
        const guild = client.guilds.cache.get(id);
        if (guild) guild.shard.send(payload);
      },
    })
      .on("nodeConnect", (node) =>
        this.log(`Lavalink: Node ${node.options.identifier} connected`)
      )
      .on("nodeError", (node, error) =>
        this.log(
          `Lavalink: Node ${node.options.identifier} had an error: ${error.message}`
        )
      )
      .on("trackStart", (player, track) => {
        const song = player.queue.current;
        const TrackStartedEmbed = new MessageEmbed()
          .setAuthor(`Started playing ♪`, this.config.IconURL)
          .setDescription(`[${track.title}](${track.uri})`)
          .setFooter(`Requested by - ${song.requester.tag}`)
          .addField(
            "Duration",
            `${prettyMilliseconds(track.duration, {
              colonNotation: true,
            })} min`,
            true
          )
          .addField("Author", `${song.author}`, true)
          .setColor("343434");
        //TODO: .setFooter("Started playing at");
        client.channels.cache.get(player.textChannel).send(TrackStartedEmbed);
      })
      .on("queueEnd", (player) => {
        const QueueEmbed = new MessageEmbed()
          .setAuthor("The queue has ended")
          .setColor("343434");
        client.channels.cache.get(player.textChannel).send(QueueEmbed);
        if (!this.config["24/7"]) player.destroy();
      });

    this.ws.on("INTERACTION_CREATE", async (interaction) => {
      const command = interaction.data.name.toLowerCase();
      const args = interaction.data.options;

      interaction.guild = await this.guilds.fetch(interaction.guild_id); // skipcq
      interaction.send = async (message) => {
        await this.api
          .interactions(interaction.id, interaction.token)
          .callback.post({
            data: {
              type: 4,
              data:
                typeof message === "string"
                  ? { content: message }
                  : message.type && message.type === "rich"
                  ? { embeds: [message] }
                  : message,
            },
          });
        return;
      };

      const cmd = client.commands.get(command);
      if (cmd.SlashCommand && cmd.SlashCommand.run)
        cmd.SlashCommand.run(this, interaction, args);
    });
  }

  LoadCommands() {
    const musicDir = path.join(__dirname, ".", "music-cmds");
    const funDir = path.join(__dirname, ".", "fun-cmds");
    const miscDir = path.join(__dirname, ".", "misc-cmds");
    fs.readdir(musicDir, (err, files) => {
      if (err) this.log(err);
      else
        files.forEach((file) => {
          const cmd = require(musicDir + "/" + file); // skipcq
          if (!cmd.name || !cmd.description || !cmd.run)
            // skipcq
            return this.log(
              "Unable to load Command: " +
                file.split(".")[0] +
                ", Reason: File doesn't have run/name/description property"
            );
          this.commands.set(file.split(".")[0], cmd);
          this.log("Music Command Loaded: " + file.split(".")[0]); // skipcq
        });
    });
    fs.readdir(funDir, (err, files) => {
      if (err) this.log(err);
      else
        files.forEach((file) => {
          const cmd = require(funDir + "/" + file); // skipcq
          if (!cmd.name || !cmd.description || !cmd.run)
            // skipcq
            return this.log(
              "Unable to load Command: " +
                file.split(".")[0] +
                ", Reason: File doesn't have run/name/description property"
            );
          this.commands.set(file.split(".")[0], cmd);
          this.log("Fun Command Loaded: " + file.split(".")[0]); // skipcq
        });
    });
    fs.readdir(miscDir, (err, files) => {
      if (err) this.log(err);
      else
        files.forEach((file) => {
          const cmd = require(miscDir + "/" + file); // skipcq
          if (!cmd.name || !cmd.description || !cmd.run)
            // skipcq
            return this.log(
              "Unable to load Command: " +
                file.split(".")[0] +
                ", Reason: File doesn't have run/name/description property"
            );
          this.commands.set(file.split(".")[0], cmd);
          this.log("Misc Command Loaded: " + file.split(".")[0]); // skipcq
        });
    });
  }

  LoadEvents() {
    const EventsDir = path.join(__dirname, ".", "events");
    fs.readdir(EventsDir, (err, files) => {
      if (err) this.log(err);
      else
        files.forEach((file) => {
          const event = require(EventsDir + "/" + file); // skipcq
          this.on(file.split(".")[0], event.bind(null, this));
          this.logger.log("Event Loaded: " + file.split(".")[0]); // skipcq
        });
    });
  }

  log(logs) {
    this.logger.log(logs);
  }

  sendError(Channel, Error) {
    const embed = new MessageEmbed()
      .setTitle("An error occured")
      .setColor("RED")
      .setDescription(Error)
      .setFooter(
        "If you think this as a bug, please report it in the support server!"
      );

    Channel.send(embed);
  }

  sendTime(Channel, Error) {
    const embed = new MessageEmbed().setColor("RANDOM").setDescription(Error);

    Channel.send(embed);
  }
  start() {
    this.login(this.config.Token);
  }

  RegisterSlashCommands() {
    this.guilds.cache.forEach((guild) => {
      require("./util/slashCommands")(this, guild.id);
    });
  }
}

module.exports = Melody;
