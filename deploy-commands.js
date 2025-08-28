// deploy-commands.js (LFG-Bot) – nur LFG-Commands, saubere Berechtigungen
import 'dotenv/config';
import {
  REST, Routes, SlashCommandBuilder, PermissionFlagsBits,
} from 'discord.js';

const TOKEN     = (process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const SCOPE     = (process.env.DEPLOY_SCOPE || 'guild').toLowerCase(); // 'guild' | 'global'
const GUILD_ID  = (process.env.GUILD_ID || '').trim();
const GUILD_IDS = (process.env.GUILD_IDS || '').trim();
const WIPE_GLOBAL = (process.env.WIPE_GLOBAL || 'false').toLowerCase() === 'true';

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ ENV fehlt: DISCORD_TOKEN/TOKEN und CLIENT_ID');
  process.exit(1);
}

const commands = [];

/* ========= setuplfg (nur Admins) ========= */
commands.push(
  new SlashCommandBuilder()
    .setName('setuplfg')
    .setDescription('Erstellt/prüft den 🔎│squad-suche Kanal (idempotent).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // nur Admins
    .setDMPermission(false) // nicht in DMs
);

/* ========= lfg (für alle) ========= */
commands.push(
  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Erstellt eine Squad-Suche.')
    .setDMPermission(false) // nur in Servern
    .addStringOption(o =>
      o.setName('modus').setDescription('Park / Rec / Pro-Am / MyTeam').setRequired(true)
        .addChoices(
          { name: 'Park', value: 'Park' },
          { name: 'Rec', value: 'Rec' },
          { name: 'Pro-Am', value: 'Pro-Am' },
          { name: 'MyTeam', value: 'MyTeam' },
          { name: 'Stage', value: 'Stage' }, 
        ))
    .addStringOption(o =>
      o.setName('plattform').setDescription('PS5 / Xbox / PC').setRequired(true)
        .addChoices(
          { name: 'PS5', value: 'PS5' },
          { name: 'Xbox', value: 'Xbox' },
          { name: 'PC', value: 'PC' },
        ))
    .addStringOption(o => o.setName('positionen').setDescription('z. B. „PG, C“').setRequired(true))
    .addIntegerOption(o => o.setName('slots').setDescription('Mitspieler (1–5)').setRequired(true).setMinValue(1).setMaxValue(5))
    .addBooleanOption(o => o.setName('crossplay').setDescription('Crossplay PS5/Xbox erlauben?').setRequired(false))
    .addStringOption(o => o.setName('squad_name').setDescription('Wunschname (Autocomplete)').setAutocomplete(true).setRequired(false))
    .addStringOption(o => o.setName('notiz').setDescription('Badges/REP/Region (optional)').setRequired(false))
    .addIntegerOption(o => o.setName('ttl_minutes').setDescription('Ablaufzeit in Minuten (Standard 120)').setMinValue(15).setMaxValue(1440).setRequired(false))
);

// /lfgadd – Mod-Tool: Mitglied manuell hinzufügen
commands.push(
  new SlashCommandBuilder()
    .setName('lfgadd')
    .setDescription('Fügt ein Mitglied manuell zu einem Squad hinzu.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addStringOption(o => o.setName('message').setDescription('Nachrichtenlink oder -ID des LFG-Posts').setRequired(true))
    .addUserOption(o => o.setName('user').setDescription('Mitglied, das hinzugefügt werden soll').setRequired(true))
    .addBooleanOption(o => o.setName('force').setDescription('Wenn voll: Slots (bis 5) automatisch erhöhen?').setRequired(false))
);

// /lfgkick – Mod-Tool: Mitglied manuell entfernen
commands.push(
  new SlashCommandBuilder()
    .setName('lfgkick')
    .setDescription('Entfernt ein Mitglied aus einem Squad.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addStringOption(o => o.setName('message').setDescription('Nachrichtenlink oder -ID des LFG-Posts').setRequired(true))
    .addUserOption(o => o.setName('user').setDescription('Mitglied, das entfernt werden soll').setRequired(true))
);

/* ========= (optional) Mod-Tools – nur ManageChannels ========= */
commands.push(
  new SlashCommandBuilder()
    .setName('lfgedit')
    .setDescription('Bearbeite einen vorhandenen LFG-Post (Name/Slots/Positions/etc.).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addStringOption(o => o.setName('message').setDescription('Nachrichtenlink oder -ID des LFG-Posts').setRequired(true))
    .addStringOption(o => o.setName('squad_name').setDescription('Neuer Squad-Name').setRequired(false))
    .addStringOption(o => o.setName('modus').setDescription('Park / Rec / Pro-Am / MyTeam')
      .addChoices({name:'Park',value:'Park'},{name:'Rec',value:'Rec'},{name:'Pro-Am',value:'Pro-Am'},{name:'MyTeam',value:'MyTeam'}).setRequired(false))
    .addStringOption(o => o.setName('plattform').setDescription('PS5 / Xbox / PC')
      .addChoices({name:'PS5',value:'PS5'},{name:'Xbox',value:'Xbox'},{name:'PC',value:'PC'}).setRequired(false))
    .addStringOption(o => o.setName('positionen').setDescription('z. B. „PG, C“').setRequired(false))
    .addIntegerOption(o => o.setName('slots').setDescription('Mitspieler (1–5)').setMinValue(1).setMaxValue(5).setRequired(false))
    .addBooleanOption(o => o.setName('crossplay').setDescription('Crossplay erlauben?').setRequired(false))
    .addIntegerOption(o => o.setName('ttl_minutes').setDescription('Neue Ablaufzeit in Minuten').setMinValue(15).setMaxValue(1440).setRequired(false))
);

commands.push(
  new SlashCommandBuilder()
    .setName('lfgroom')
    .setDescription('Erstellt manuell den privaten Voice & Thread für einen Squad.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addStringOption(o => o.setName('message').setDescription('Nachrichtenlink oder -ID des LFG-Posts').setRequired(true))
    .addBooleanOption(o => o.setName('voice').setDescription('Privaten Voice jetzt erstellen? (Default: ja)').setRequired(false))
    .addBooleanOption(o => o.setName('thread').setDescription('Privaten Thread jetzt erstellen? (Default: ja)').setRequired(false))
);

/* ========= Deploy ========= */
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function deployGuild(gid) {
  console.log(`📤 Guild-Deploy → ${gid}`);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), {
    body: commands.map(c => c.toJSON()),
  });
  console.log(`✅ Guild OK (${gid})`);
}

async function deployGlobal() {
  const body = WIPE_GLOBAL ? [] : commands.map(c => c.toJSON());
  console.log(`🌍 Global-Deploy (${WIPE_GLOBAL ? 'WIPE' : body.length + ' cmds'})`);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
  console.log('✅ Global OK');
}

(async () => {
  try {
    if (SCOPE === 'global') {
      await deployGlobal();
      return;
    }
    const ids = [];
    if (GUILD_IDS) ids.push(...GUILD_IDS.split(',').map(s => s.trim()).filter(Boolean));
    if (GUILD_ID && !ids.includes(GUILD_ID)) ids.push(GUILD_ID);
    if (!ids.length) { console.error('❌ DEPLOY_SCOPE=guild aber keine GUILD_ID/GUILD_IDS gesetzt.'); process.exit(1); }
    for (const gid of ids) await deployGuild(gid);
  } catch (e) {
    console.error('❌ Deploy-Fehler:', e);
    process.exit(1);
  }
})();
