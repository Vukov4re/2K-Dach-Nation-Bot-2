import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import "dotenv/config";

// ======================= Bot Setup =======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ LFG-Bot eingeloggt als ${c.user.tag}`);
});

// ======================= Hilfsfunktionen =======================
function writeStateToEmbed(embed, state) {
  embed.setFooter({ text: JSON.stringify(state) });
}
function readStateFromEmbed(msg) {
  try {
    const footer = msg.embeds[0]?.footer?.text;
    return footer ? JSON.parse(footer) : null;
  } catch {
    return null;
  }
}

function renderLfgEmbed({ name, mode, platform, crossplay, slots, joinedIds }) {
  return new EmbedBuilder()
    .setTitle(`🔎 Squad-Suche – ${mode}`)
    .setDescription(
      `**Host:** ${name}\n` +
        `**Plattform:** ${platform}${crossplay ? " (Crossplay)" : ""}\n` +
        `**Slots:** ${joinedIds.length}/${slots}\n\n` +
        joinedIds.map((id) => `<@${id}>`).join("\n")
    )
    .setColor(0x00aeff)
    .setTimestamp();
}

function buildLfgRow(messageId, full) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_${messageId}`)
      .setLabel("✅ Beitreten")
      .setStyle(ButtonStyle.Success)
      .setDisabled(full),
    new ButtonBuilder()
      .setCustomId(`leave_${messageId}`)
      .setLabel("↩️ Verlassen")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`close_${messageId}`)
      .setLabel("🔒 Squad auflösen")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`room_${messageId}`)
      .setLabel("🎤 Privater Raum")
      .setStyle(ButtonStyle.Primary)
  );
}

async function freeSquadResources(guild, state) {
  try {
    if (state.roleId) {
      const r = guild.roles.cache.get(state.roleId);
      await r?.delete().catch(() => {});
    }
    if (state.voiceId) {
      const v = guild.channels.cache.get(state.voiceId);
      await v?.delete().catch(() => {});
    }
  } catch {}
}

// ======================= Slash Commands =======================
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  try {

        // -------- /announce --------
    if (i.commandName === "announce") {
      try {
        if (!i.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return i.reply({ content: "❌ Nur Admins dürfen /announce nutzen.", ephemeral: true });
        }

        await i.deferReply({ ephemeral: true });

        const ch    = i.options.getChannel("channel", true);
        const title = i.options.getString("titel", true);
        const body  = i.options.getString("nachricht", true);
        const emoji = i.options.getString("emoji") || "📢";

        const emb = new EmbedBuilder()
          .setTitle(`${emoji} ${title}`)
          .setDescription(`${body}\n\n@everyone`)
          .setColor(0xff0000)
          .setTimestamp();

        const sent = await ch.send({
          content: "@everyone",
          embeds: [emb],
          allowedMentions: { parse: ["everyone"] },
        });

        await sent.pin().catch(() => {});
        await i.editReply(`✅ Ankündigung in ${ch} gepostet und angepinnt.`);
      } catch (err) {
        console.error("announce error:", err);
        try {
          (i.deferred ? i.editReply : i.reply)({
            content: "❌ Fehler bei /announce.",
            ephemeral: true,
          });
        } catch {}
      }
    }

    // -------- /lfg --------
    if (i.commandName === "lfg") {
      const mode = i.options.getString("modus", true);
      const platform = i.options.getString("plattform", true);
      const crossplay = i.options.getBoolean("crossplay") ?? false;
      const slots = i.options.getInteger("slots") ?? 5;
      const ttlMin = i.options.getInteger("ttl_minutes") ?? 120;

      const role = await i.guild.roles.create({
        name: `Squad ${mode}`,
        mentionable: true,
      });

      const emb = renderLfgEmbed({
        name: i.user.username,
        mode,
        platform,
        crossplay,
        slots,
        joinedIds: [i.user.id],
      });

      const state = {
        hostId: i.user.id,
        mode,
        platform,
        crossplay,
        slots,
        joined: [i.user.id],
        roleId: role.id,
      };

      writeStateToEmbed(emb, state);

      const post = await i.channel.send({
        embeds: [emb],
        components: [buildLfgRow("msg", false)],
      });

      if (ttlMin > 0) {
        setTimeout(async () => {
          try {
            const msg = await i.channel.messages.fetch(post.id).catch(() => null);
            if (!msg) return;
            const cur = readStateFromEmbed(msg);
            if (!cur) return;

            const emb = renderLfgEmbed({ ...cur, joinedIds: cur.joined });
            emb
              .setColor(0x777777)
              .setTitle(
                `⏲️ [ABGELAUFEN] ${cur.name} – ${cur.mode} (${cur.platform}${
                  cur.crossplay ? " • Crossplay" : ""
                })`
              );
            writeStateToEmbed(emb, cur);

            await msg.edit({
              embeds: [emb],
              components: [buildLfgRow(post.id, true)],
            });

            if (cur.threadId) {
              const thr = i.guild.channels.cache.get(cur.threadId);
              await thr?.setArchived(true).catch(() => {});
              await thr?.setLocked(true).catch(() => {});
            }

            await freeSquadResources(i.guild, cur);
          } catch (err) {
            console.error("TTL expire error:", err);
          }
        }, ttlMin * 60 * 1000);
      }
    } // Ende /lfg

    // -------- /lfgedit --------
    if (i.commandName === "lfgedit") {
      await i.deferReply({ ephemeral: true });
      // dein Edit-Code …
    }

    // -------- /lfgadd --------
    if (i.commandName === "lfgadd") {
      try {
        await i.deferReply({ ephemeral: true });
        // dein Add-Code …
      } catch (err) {
        console.error("lfgadd error:", err);
        try {
          (i.deferred ? i.editReply : i.reply)({
            content: "❌ Fehler bei /lfgadd.",
            ephemeral: true,
          });
        } catch {}
      }
    }

    // -------- /lfgkick --------
    if (i.commandName === "lfgkick") {
      try {
        await i.deferReply({ ephemeral: true });
        // dein Kick-Code …
      } catch (err) {
        console.error("lfgkick error:", err);
        try {
          (i.deferred ? i.editReply : i.reply)({
            content: "❌ Fehler bei /lfgkick.",
            ephemeral: true,
          });
        } catch {}
      }
    }

    // -------- /lfgroom --------
    if (i.commandName === "lfgroom") {
      try {
        await i.deferReply({ ephemeral: true });
        // dein Room-Code …
      } catch (err) {
        console.error("lfgroom error:", err);
        try {
          (i.deferred ? i.editReply : i.reply)({
            content: "❌ Fehler bei /lfgroom.",
            ephemeral: true,
          });
        } catch {}
      }
    }
  } catch (err) {
    console.error("interaction (command) error:", err);
    try {
      (i.deferred ? i.editReply : i.reply)({
        content: "❌ Fehler bei der Ausführung.",
        ephemeral: true,
      });
    } catch {}
  }
}); // Ende: Slash-Commands

// ======================= Button-Interaktionen =======================
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isButton()) return;
  // dein Button-Code …
});

// ======================= Login =======================
client.login(process.env.TOKEN);
