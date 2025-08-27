// config/roles.js

export const BASE_ROLES = {
  // Rollen
  platforms: ['PS5', 'Xbox', 'PC'],
  countries: ['Deutschland', 'Schweiz', 'Österreich'],
  positions: ['PG', 'SG', 'SF', 'PF', 'C'],
  styles: ['Casual', 'Comp/Pro-Am', 'MyCareer', 'Park/Rec', 'MyTeam'],

  // Pflicht-Rolle nach Verifizierung
  accessRole: 'Mitglied',

  // Onboarding-Kategorie & Kanäle
  categoryInfo:  '📢 Info & Regeln',
  channelRules:  '📜│regeln',
  channelNews:   '📢│ankündigungen',
  channelRoles:  '🎯│rolle-zuweisen',
  channelVerify: '🧾│rep-verifizierung',

  // Media-Bereich (NEU)
  categoryMedia: '🎥 Media',
  channelClips:  '🎬│clips',
  channelVods:   '📺│full-matches',
  channelPhotos: '📷│fotos',

  // Slowmode für Clips (Sekunden)
  clipsSlowmodeSeconds: 60,
};

export const BUTTON_LABELS = {
  platforms: ['PS5', 'Xbox', 'PC'],
  positions: ['PG', 'SG', 'SF', 'PF', 'C'],
  styles: ['Casual', 'Comp/Pro-Am', 'MyCareer', 'Park/Rec', 'MyTeam'],
  countries: ['Deutschland', 'Schweiz', 'Österreich'],
};

export const REP = {
  display: {
    rookie: 'Rookie',
    pro: 'Starter',
    'all-star': 'All-Star (Reserve)',
    superstar: 'Superstar (Reserve)',
    elite: 'Veteran',
    legend: 'Legend',
  },
  emojis: {
    rookie: '🟢',
    pro: '🔵',
    'all-star': '🟣',
    superstar: '🟠',
    elite: '🔴',
    legend: '🟡',
  },
  levels: [1, 2, 3, 4, 5],

  // Passe das Muster bei Bedarf an (z. B. `${display} Stufe ${level}`)
  makeRoleName(rankKey, level) {
    const display = this.display[rankKey] || rankKey;
    const emoji = this.emojis[rankKey] || '';
    return `${emoji} ${display} ${level}`.trim();
  }
};

// Pinned Text im Verifizierungs-Kanal
export const VERIFY_TEXT =
  '📌 **So bekommst du deinen REP-Rang:**\n' +
  '1) Poste hier einen **Screenshot** deines aktuellen REP.\n' +
  '2) Ein Mod prüft und setzt deinen Rang mit `/rep`.\n' +
  '3) Bei Upgrade später einfach wieder Screenshot posten.\n\n' +
  'ℹ️ Mods: `/rep user:@Name rank:<Rookie|Starter|All-Star (Reserve)|Superstar (Reserve)|Veteran|Legend> level:<1–5>`';

// Pinned Texte in den Media-Kanälen (NEU)
export const MEDIA_TEXT = {
  clips:
    '📌 **Clip-Regeln**\n' +
    '• Nur **Highlights** (max. ~60–90 Sek.)\n' +
    '• Pro User max. **2 Clips/Tag**\n' +
    '• **Titel:** Modus • Plattform • Position/Build (z. B. „Pro-Am | PS5 | PG 6’4“)\n' +
    '• Keine Re-Uploads/fremde Clips ohne Erlaubnis\n' +
    '• Nutzt **Threads** für Kommentare\n',
  vods:
    '📌 **VOD-Regeln**\n' +
    '• Ganze Matches bitte **als Link** (YouTube/Twitch/Streamable)\n' +
    '• **Titel:** Teams/Modus/Datum + optional Zeitstempel\n' +
    '• **max. 1 VOD/Tag/User** • Diskussion im **Thread**\n' +
    '🚫 Datei-Uploads sind hier deaktiviert – bitte nur Links posten.\n',
};
