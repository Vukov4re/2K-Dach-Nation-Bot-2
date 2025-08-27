// deploy-commands.js (ESM)
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [];

// --- Beispiel weitere Commands (kannst du lassen) ---
commands.push(new SlashCommandBuilder().setName('setuplfg').setDescription('Erstellt/prüft den 🔎│squad-suche Kanal (idempotent).'));

// --- LFG mit crossplay + squad_name (Autocomplete) ---
commands.push(
  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Erstellt eine Squad-Suche mit Buttons.')
    // --- Required Felder zuerst ---
    .addStringOption(o =>
      o.setName('modus').setDescription('Park / Rec / Pro-Am / MyTeam').setRequired(true)
        .addChoices(
          { name: 'Park', value: 'Park' },
          { name: 'Rec', value: 'Rec' },
          { name: 'Pro-Am', value: 'Pro-Am' },
          { name: 'MyTeam', value: 'MyTeam' },
        )
    )
    .addStringOption(o =>
      o.setName('plattform').setDescription('PS5 / Xbox / PC').setRequired(true)
        .addChoices(
          { name: 'PS5', value: 'PS5' },
          { name: 'Xbox', value: 'Xbox' },
          { name: 'PC', value: 'PC' },
        )
    )
    .addStringOption(o =>
      o.setName('positionen').setDescription('z. B. „PG, C“').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('slots').setDescription('Mitspieler (1–5)').setRequired(true)
        .setMinValue(1).setMaxValue(5)
    )

    // --- Danach optionale Felder ---
    .addBooleanOption(o =>
      o.setName('crossplay').setDescription('Crossplay PS5/Xbox erlauben?').setRequired(false)
    )
    .addStringOption(o =>
      o.setName('squad_name').setDescription('Wunschname (z. B. "Squad Mamba")')
        .setRequired(false).setAutocomplete(true)
    )
    .addStringOption(o =>
      o.setName('notiz').setDescription('Badges/REP/Region (optional)').setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName('ttl_minutes').setDescription('Ablaufzeit in Minuten (Standard 120)')
        .setMinValue(15).setMaxValue(1440).setRequired(false)
    )
);


// ----- Deploy-Logik -----
const token   = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId= process.env.CLIENT_ID;
const scope   = (process.env.DEPLOY_SCOPE || 'guild').toLowerCase(); // 'guild' | 'global'
const guildId = process.env.GUILD_ID || '';
const guildIdsCsv = process.env.GUILD_IDS || '';
const WIPE_GLOBAL = (process.env.WIPE_GLOBAL || 'false').toLowerCase() === 'true';

if (!token || !clientId) { console.error('❌ Missing DISCORD_TOKEN/CLIENT_ID'); process.exit(1); }

const rest = new REST({ version: '10' }).setToken(token);

async function deployGuild(gid) {
  console.log(`📤 Guild-Deploy → ${gid}`);
  const body = commands.map(c => c.toJSON());
  await rest.put(Routes.applicationGuildCommands(clientId, gid), { body });
  console.log(`✅ Guild OK (${body.length} cmds)`);
}

async function deployGlobal() {
  const body = WIPE_GLOBAL ? [] : commands.map(c => c.toJSON());
  console.log(`🌍 Global-Deploy (${WIPE_GLOBAL ? 'WIPE' : body.length + ' cmds'})`);
  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log('✅ Global OK');
}

(async () => {
  try {
    if (scope === 'global') {
      await deployGlobal();
      return;
    }
    const ids = [];
    if (guildIdsCsv.trim()) ids.push(...guildIdsCsv.split(',').map(s => s.trim()).filter(Boolean));
    if (guildId && !ids.includes(guildId)) ids.push(guildId);

    if (ids.length === 0) {
      console.error('❌ DEPLOY_SCOPE=guild aber keine GUILD_ID/GUILD_IDS gesetzt.'); process.exit(1);
    }
    for (const gid of ids) await deployGuild(gid);
  } catch (e) {
    console.error('❌ Deploy-Fehler:', e);
    process.exit(1);
  }
})();
