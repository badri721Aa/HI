'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Load .env without any dependency (Node >= 21.7).
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* no .env file — rely on real environment variables */
}

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const bool = (v, def) => (v === undefined || v === '' ? def : !['false', '0', 'no', 'off'].includes(String(v).toLowerCase()));

const config = {
  root: ROOT,
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  ownerIds: list(process.env.OWNER_IDS),
  defaultPrefix: process.env.PREFIX || '!',
  defaultStatus: process.env.BOT_STATUS || 'online',
  defaultActivity: process.env.BOT_ACTIVITY || 'Listening|{prefix}help • {commands} commands',
  port: process.env.PORT ? Number(process.env.PORT) : null,
  devGuildId: process.env.DEV_GUILD_ID || null,
  registerSlash: bool(process.env.REGISTER_SLASH, true),
  messageContentIntent: bool(process.env.MESSAGE_CONTENT_INTENT, true),
  membersIntent: bool(process.env.MEMBERS_INTENT, true),
  watchdog: bool(process.env.WATCHDOG, true),
  embedColor: parseInt(String(process.env.EMBED_COLOR || '5865F2').replace('#', ''), 16) || 0x5865f2,
  bots: [],
};

/** Resolve "env:VAR_NAME" indirection so bots.json never needs raw secrets. */
function resolveSecret(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('env:')) return process.env[value.slice(4)] || null;
  return value;
}

function normalizeProfile(p, i) {
  const modules = p.modules === undefined || p.modules === 'all' ? 'all' : list(Array.isArray(p.modules) ? p.modules.join(',') : p.modules);
  return {
    name: p.name || `Bot${i + 1}`,
    token: resolveSecret(p.token),
    prefix: p.prefix || config.defaultPrefix,
    status: p.status || config.defaultStatus,
    activity: p.activity === undefined ? config.defaultActivity : p.activity,
    modules,
    color: p.color ? parseInt(String(p.color).replace('#', ''), 16) : config.embedColor,
  };
}

function loadBots() {
  const file = path.join(ROOT, process.env.BOTS_FILE || 'bots.json');
  let profiles = [];
  if (fs.existsSync(file)) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    profiles = (Array.isArray(parsed) ? parsed : parsed.bots || []).map(normalizeProfile);
  } else {
    const tokens = list(process.env.BOT_TOKENS || process.env.DISCORD_TOKEN);
    profiles = tokens.map((token, i) => normalizeProfile({ token, name: tokens.length > 1 ? `Bot${i + 1}` : 'Bot' }, i));
  }
  const skipped = profiles.filter((p) => !p.token);
  if (skipped.length) console.warn(`[config] Skipped ${skipped.length} bot profile(s) with no token: ${skipped.map((p) => p.name).join(', ')}`);
  return profiles.filter((p) => p.token);
}

config.loadBots = loadBots;
module.exports = config;
