import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events,
  ChannelType, PermissionFlagsBits, PermissionsBitField,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} from 'discord.js';

import {
  LFG_CHANNEL_NAME,
  LFG_VOICE_CATEGORY_NAME,
  LFG_DEFAULT_TTL_MIN,
  SQUAD_NAME_POOL
} from './config/squads.js';

// ===================== Client =====================
const TOKEN = (process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
if (!TOKEN) { console.error('❌ Missing DISCORD_TOKEN/TOKEN'); process.exit(1); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

// ===================== LFG Helpers =====================
function readStateFromEmbed(msg) {
  const footer = msg.embeds?.[0]?.footer?.text || '';
  const m = footer.match(/\[\[LFG:(.+)\]\]/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function writeStateToEmbed(embed, state) {
  embed.setFooter({ text: `[[LFG:${JSON.stringify(state)}]]` });
  return embed;
}

async function ensureLfgChannel(guild) {
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === LFG_CHANNEL_NAME);
  if (!ch) ch = await guild.channels.create({ name: LFG_CHANNEL_NAME, type: ChannelType.GuildText });
  return ch;
}

async function ensureVoiceCategory(guild) {
  let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === LFG_VOICE_CATEGORY_NAME);
  if (!cat) cat = await guild.channels.create({ name: LFG_VOICE_CATEGORY_NAME, type: ChannelType.GuildCategory });
  return cat;
}

function renderLfgEmbed({ name, author, mode, platform, crossplay, positions, slots, joinedIds }) {
  const full = joinedIds.length >= slots;
  const title = full
    ? `🔒 [VOLL] ${name} – ${mode} (${platform}${crossplay ? ' • Crossplay' : ''})`
    : `🔎 ${name} – ${mode} (${platform}${crossplay ? ' • Crossplay' : ''})`;

  const desc = [
    `**Gesucht:** ${positions}`,
    `**Slots:** ${joinedIds.length}/${slots}`,
    `👤 **Host:** <@${author}>`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(full ? 0x888888 : 0x00A86B)
    .setTitle(title)
    .setDescription(desc)
    .setTimestamp();

  embed.addFields({
    name: 'Teilnehmer',
    value: joinedIds.length ? joinedIds.map(id => `• <@${id}>`).join('\n') : '— noch frei —'
  });

  return embed;
}

function buildLfgRow(messageId, locked) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lfg:join:${messageId}`).setLabel('Beitreten').setStyle(ButtonStyle.Success).setDisabled(locked),
    new ButtonBuilder().setCustomId(`lfg:leave:${messageId}`).setLabel('Verlassen').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`lfg:close:${messageId}`).setLabel('Squad auflösen').setStyle(ButtonStyle.Danger)
  );
}

// Name frei? => wir nutzen die Existenz einer Squad-Rolle als „belegt“
function isSquadNameTaken(guild, name) {
  return !!guild.roles.cache.find(r => r.name === name);
}
function normSquadName(input) {
  if (!input) return '';
  const s = input.trim();
  return s.toLowerCase().startsWith('squad ') ? s : `Squad ${s}`;
}
function isNameAllowed(name) {
  return SQUAD_NAME_POOL.includes(name);
}

async function reserveSquadName(guild, name) {
  return guild.roles.create({ name, hoist: false, mentionable: false, reason: 'LFG Squad' });
}

async function freeSquadResources(guild, state) {
  try {
    if (state.roleId) await guild.roles.delete(state.roleId).catch(() => {});
    if (state.voiceId) {
      const v = guild.channels.cache.get(state.voiceId);
      if (v) await v.delete().catch(() => {});
    }
  } catch {}
}

async function createPrivateVoiceIfFull(guild, state) {
  if (state.voiceId) return state;
  const cat = await ensureVoiceCategory(guild);
  const role = guild.roles.cache.get(state.roleId);
  if (!role) return state;

  const everyone = guild.roles.everyone;
  const voice = await guild.channels.create({
    name: state.name,
    type: ChannelType.GuildVoice,
    parent: cat.id,
    userLimit: state.slots,
    permissionOverwrites: [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
    ]
  });

  state.voiceId = voice.id;
  return state;
}

// ===================== READY =====================
client.once('ready', () => {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: '🔎 /lfg – Squad-Suche' }], status: 'online' });
});

// ===================== Autocomplete (squad_name) =====================
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isAutocomplete()) return;
  try {
    if (i.commandName !== 'lfg' || i.options.getFocused(true).name !== 'squad_name') return;

    const query = (i.options.getFocused() || '').toLowerCase();
    const free = SQUAD_NAME_POOL.filter(name => !isSquadNameTaken(i.guild, name));
    const filtered = free.filter(n => n.toLowerCase().includes(query)).slice(0, 25);

    await i.respond(filtered.map(n => ({ name: n, value: n })));
  } catch (e) {
    // ignore autocomplete errors
  }
});

// ===================== Slash Commands =====================
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  try {
    // /setuplfg
    if (i.commandName === 'setuplfg') {
      if (!i.memberPermissions.has(PermissionsBitField.Flags.Administrator))
        return i.reply({ content: '⛔ Nur Admins dürfen /setuplfg ausführen.', ephemeral: true });

      await i.deferReply({ ephemeral: true });
      const ch = await ensureLfgChannel(i.guild);

const pinText = [
  '📌 **So funktioniert die Squad-Suche**',
  '• **/lfg**: Modus, Plattform, Slots',
  '• **Optional**:',
  '  – **squad_name**: freien Namen aus der Liste wählen (Autocomplete, z. B. „Squad Mamba“)',
  '  – **crossplay**: PS5/Xbox gemeinsam zulassen (✅/❌)',
  '• **Beitreten/Verlassen** per Button',
  '• Wenn **voll** → [VOLL], **privater Voice** in „🎤 Squads“ + **privater Thread**',
  '• **Auflösen**: Host/Mods beenden den Squad (Rolle/Voice wird gelöscht, Thread archiviert)',
  `• Standard-Ablauf: **${LFG_DEFAULT_TTL_MIN} Minuten**`,
  '• Bitte respektvoll bleiben, kein Spam'
].join('\n');



      const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
      const already = recent?.find(m => m.author?.id === i.guild.members.me.id && m.content?.includes('[[LFG_PIN]]'));
      if (already) await already.edit(`${pinText}\n\n[[LFG_PIN]]`);
      else await ch.send(`${pinText}\n\n[[LFG_PIN]]`);

      return i.editReply(`✅ LFG-Kanal eingerichtet: ${ch}`);
    }

    // /lfg – Squad erstellen
    if (i.commandName === 'lfg') {
      const mode = i.options.getString('modus', true);
      const platform = i.options.getString('plattform', true);
      const crossplay = i.options.getBoolean('crossplay') ?? false;
      const positions = i.options.getString('positionen', true);
      const slots = i.options.getInteger('slots', true);
      const note = i.options.getString('notiz') || '';
      const ttlMin = i.options.getInteger('ttl_minutes') ?? LFG_DEFAULT_TTL_MIN;

      // Name prüfen
      const raw = i.options.getString('squad_name') || '';
      let name = raw ? normSquadName(raw) : '';

      if (name) {
        if (!isNameAllowed(name))
          return i.reply({ content: `❌ **${name}** ist kein erlaubter Squad-Name. Nutze einen aus dem Pool.`, ephemeral: true });
        if (isSquadNameTaken(i.guild, name))
          return i.reply({ content: `❌ **${name}** ist bereits vergeben. Bitte anderen wählen.`, ephemeral: true });
      } else {
        name = SQUAD_NAME_POOL.find(n => !isSquadNameTaken(i.guild, n));
        if (!name) return i.reply({ content: '❌ Alle Squad-Namen sind aktuell vergeben. Bitte später erneut versuchen.', ephemeral: true });
      }

      await i.deferReply({ ephemeral: true });

      // Rolle (Reservierung) + Host Rolle
      const role = await reserveSquadName(i.guild, name);
      const host = await i.guild.members.fetch(i.user.id).catch(() => null);
      if (host) await host.roles.add(role).catch(() => {});

      const ch = await ensureLfgChannel(i.guild);
      const joined = [i.user.id];

      const base = { name, author: i.user.id, mode, platform, crossplay, positions, slots };
      const embed = renderLfgEmbed({ ...base, joinedIds: joined });
      const state = { ...base, joined, roleId: role.id, voiceId: null, threadId: null, ttlMin };

      writeStateToEmbed(embed, state);

      const post = await ch.send({
        embeds: [embed],
        components: [buildLfgRow('pending', false)]
      });

      // Buttons an Message knüpfen
      await post.edit({ components: [buildLfgRow(post.id, false)] });

      // Öffentlichen Thread starten (wird später privat, wenn voll)
      const thread = await post.startThread({
        name: `[${mode}] ${name} chat`,
        autoArchiveDuration: 1440
      }).catch(() => null);

      state.threadId = thread?.id || null;
      const updateEmbed = renderLfgEmbed({ ...base, joinedIds: joined });
      writeStateToEmbed(updateEmbed, state);
      await post.edit({ embeds: [updateEmbed] });

      await i.editReply(`✅ **${name}** ist live: ${post.url}${thread ? ` (Thread: ${thread})` : ''}${note ? `\n📝 ${note}` : ''}`);

      // Auto-Expire/TTL
      setTimeout(async () => {
        try {
          const msg = await ch.messages.fetch(post.id).catch(() => null);
          if (!msg) return;
          const cur = readStateFromEmbed(msg);
          if (!cur) return;

          const emb = renderLfgEmbed({ ...cur, joinedIds: cur.joined });
          emb.setColor(0x777777).setTitle(`⏲️ [ABGELAUFEN] ${cur.name} – ${cur.mode} (${cur.platform}${cur.crossplay ? ' • Crossplay' : ''})`);
          writeStateToEmbed(emb, cur);
          await msg.edit({ embeds: [emb], components: [buildLfgRow(post.id, true)] });

          if (cur.threadId) {
            const thr = i.guild.channels.cache.get(cur.threadId);
            await thr?.setArchived(true).catch(() => {});
            await thr?.setLocked(true).catch(() => {});
          }
          await freeSquadResources(i.guild, cur);
        } catch {}
      }, ttlMin * 60 * 1000);

      return;
    }

  } catch (err) {
    console.error('interaction (command) error:', err);
    try { (i.deferred ? i.editReply : i.reply)({ content: '❌ Fehler bei der Ausführung.', ephemeral: true }); } catch {}
  }
});

// ===================== Button-Interaktionen =====================
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isButton()) return;

  try {
    if (!i.customId.startsWith('lfg:')) return;
    const [, action, msgId] = i.customId.split(':');

    const msg = await i.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return i.reply({ content: '❌ LFG-Beitrag nicht gefunden.', flags: 64 });

    const state = readStateFromEmbed(msg);
    if (!state) return i.reply({ content: '❌ Ungültiger LFG-Status.', flags: 64 });

    const guild = i.guild;
    const role = guild.roles.cache.get(state.roleId);
    const member = i.member;
    const isHost = i.user.id === state.author;
    const isMod = i.memberPermissions.has(PermissionsBitField.Flags.ManageMessages);

    const joined = new Set(state.joined || []);
    const isFull = joined.size >= state.slots;

    if (action === 'join') {
      if (joined.has(i.user.id)) return i.reply({ content: 'Du bist bereits in diesem Squad.', flags: 64 });
      if (isFull) return i.reply({ content: 'Dieser Squad ist bereits voll.', flags: 64 });
      joined.add(i.user.id);
      if (role) await member.roles.add(role).catch(() => {});
    }

    if (action === 'leave') {
      if (!joined.has(i.user.id)) return i.reply({ content: 'Du bist in diesem Squad nicht eingetragen.', flags: 64 });
      joined.delete(i.user.id);
      if (role) await member.roles.remove(role).catch(() => {});
    }

    if (action === 'close') {
      if (!isHost && !isMod) return i.reply({ content: 'Nur der Ersteller oder Mods dürfen auflösen.', flags: 64 });

      const emb = renderLfgEmbed({ ...state, joinedIds: [...joined] })
        .setColor(0x888888)
        .setTitle(`🔒 [AUFGELÖST] ${state.name} – ${state.mode} (${state.platform}${state.crossplay ? ' • Crossplay' : ''})`);
      writeStateToEmbed(emb, state);
      await msg.edit({ embeds: [emb], components: [buildLfgRow(msg.id, true)] });

      if (state.threadId) {
        const thr = guild.channels.cache.get(state.threadId);
        await thr?.setArchived(true).catch(() => {});
        await thr?.setLocked(true).catch(() => {});
      }
      await freeSquadResources(guild, state);
      return i.reply({ content: '🔒 Squad aufgelöst.', flags: 64 });
    }

    // nach Join/Leave: ggf. voll -> Voice + privater Thread
    const newState = { ...state, joined: [...joined] };
    const nowFull = newState.joined.length >= newState.slots;

    if (nowFull && !state.voiceId) {
      await createPrivateVoiceIfFull(guild, newState);

      // privaten Thread erzeugen + alten schließen
      const privThread = await i.channel.threads.create({
        name: `[${newState.mode}] ${newState.name} private`,
        autoArchiveDuration: 1440,
        type: ChannelType.PrivateThread
      }).catch(() => null);

      if (privThread) {
        newState.threadId = privThread.id;
        for (const uid of newState.joined) {
          await privThread.members.add(uid).catch(() => {});
        }
      }

      if (state.threadId) {
        const old = guild.channels.cache.get(state.threadId);
        await old?.setArchived(true).catch(() => {});
        await old?.setLocked(true).catch(() => {});
      }
    }

    const emb = renderLfgEmbed({ ...newState, joinedIds: newState.joined });
    writeStateToEmbed(emb, newState);

    await msg.edit({
      embeds: [emb],
      components: [buildLfgRow(msg.id, newState.joined.length >= newState.slots)]
    });

    return i.reply({ content: action === 'join' ? '✅ Beigetreten.' : '✅ Verlassen.', flags: 64 });
  } catch (err) {
    console.error('interaction (button) error:', err);
    try { await i.reply({ content: '❌ Fehler bei der Ausführung.', flags: 64 }); } catch {}
  }
});

// ===================== Start =====================
client.login(TOKEN);
