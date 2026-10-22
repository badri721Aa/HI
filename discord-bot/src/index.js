'use strict';
const path = require('node:path');
const config = require('./config');
const db = require('./core/db');
const log = require('./core/logger').child('main');
const { Registry } = require('./core/registry');
const { startBot } = require('./core/bot');
const { startKeepAlive } = require('./core/keepalive');

const clients = [];

// Never die on a stray error — log it and keep running.
process.on('unhandledRejection', (err) => log.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => log.error('Uncaught exception:', err));

function shutdown(signal) {
  log.info(`${signal} received — saving data and shutting down.`);
  for (const c of clients) {
    c.audio?.destroyAll();
    c.destroy().catch(() => {});
  }
  db.flush();
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Windows raises SIGHUP when the console window is closed and ends the process a few seconds later:
// save first, because console output may already be gone. Windows only: on Linux SIGHUP keeps Node's default.
if (process.platform === 'win32') {
  process.on('SIGHUP', () => {
    db.flush();
    shutdown('SIGHUP');
  });
}

async function main() {
  const registry = new Registry().loadDir(path.join(__dirname, 'modules'));
  log.info(`Loaded ${registry.size} commands in ${registry.categories.size} categories.`);

  const bots = config.loadBots();
  if (!bots.length) {
    log.error('No bot token found. Copy .env.example to .env and set DISCORD_TOKEN (or create bots.json). See README.md.');
    process.exit(1);
  }

  if (config.port) startKeepAlive(config.port, () => clients);

  // Network trouble at startup is retried forever with backoff; only a bad token gives up.
  const dead = new Set();
  const launch = async (bot, attempt = 0) => {
    try {
      const client = await startBot(bot, registry);
      client.siblings = () => clients;
      clients.push(client);
    } catch (err) {
      if (err.code === 'TokenInvalid' || err.status === 401) {
        log.error(`Bot "${bot.name}" has an invalid token — not retrying.`);
        dead.add(bot.name);
        if (dead.size === bots.length) {
          log.error('No bot has a valid token. Exiting.');
          process.exit(1);
        }
        return;
      }
      const delay = Math.min(5 * 60 * 1000, 15000 * 2 ** attempt);
      log.warn(`Bot "${bot.name}" could not connect (${err.message}) — retrying in ${Math.round(delay / 1000)}s.`);
      setTimeout(() => launch(bot, attempt + 1), delay);
    }
  };
  for (const [i, bot] of bots.entries()) {
    // Stagger logins so many bots don't hit the gateway at the same instant.
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    await launch(bot);
  }

  // Watchdog: if a bot stays disconnected for 10 minutes, exit so the host/pm2 restarts us fresh.
  if (config.watchdog) {
    const downSince = new Map();
    setInterval(() => {
      for (const c of clients) {
        if (c.isReady()) downSince.delete(c);
        else if (!downSince.has(c)) downSince.set(c, Date.now());
        else if (Date.now() - downSince.get(c) > 10 * 60 * 1000) {
          log.error(`${c.botProfile.name} has been offline for 10 minutes — restarting process.`);
          db.flush();
          process.exit(1);
        }
      }
    }, 60 * 1000).unref();
  }

  setInterval(() => db.flush(), 5 * 60 * 1000).unref();
}

main().catch((err) => {
  log.error('Fatal startup error:', err);
  db.flush();
  process.exit(1);
});
