'use strict';
const { Client, GatewayIntentBits, Partials, Events, ActivityType, Options } = require('discord.js');
const config = require('../config');
const handler = require('./handler');
const slash = require('./slash');
const { VoiceManager } = require('./voice');
const logger = require('./logger');
const db = require('./db');

const PRIVILEGED_HELP = `
  Your bot is asking for a privileged intent that is not switched on.
  Fix: https://discord.com/developers/applications -> your app -> Bot ->
       turn ON "Server Members Intent" and "Message Content Intent", then restart.
  (Continuing without them: slash commands and @mention commands still work.)`;

// Events that core wires itself; everything else modules listen to is forwarded generically.
const CORE_EVENTS = new Set(['messageCreate', 'interactionCreate', 'unknownCommand', 'clientReady', 'ready']);

function intents({ privileged }) {
  const list = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages,
  ];
  if (privileged && config.messageContentIntent) list.push(GatewayIntentBits.MessageContent);
  if (privileged && config.membersIntent) list.push(GatewayIntentBits.GuildMembers);
  return list;
}

function activityFor(client, bot) {
  if (!bot.activity) return [];
  const [typeName, ...textParts] = String(bot.activity).split('|');
  const hasType = textParts.length > 0;
  const text = (hasType ? textParts.join('|') : typeName)
    .replace('{prefix}', bot.prefix)
    .replace('{commands}', client.registry.size)
    .replace('{servers}', client.guilds.cache.size)
    .replace('{name}', bot.name);
  const type = hasType ? ActivityType[typeName] ?? ActivityType.Playing : ActivityType.Playing;
  if (type === ActivityType.Custom) return [{ name: 'custom', state: text, type }];
  return [{ name: text, type }];
}

function applyPresence(client) {
  const bot = client.botProfile;
  client.user.setPresence({ status: bot.status, activities: activityFor(client, bot) });
}

function createClient(bot, registry, { privileged = true } = {}) {
  const log = logger.child(bot.name);
  const client = new Client({
    intents: intents({ privileged }),
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
    allowedMentions: { parse: ['users'], repliedUser: false },
    makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 200 }),
    sweepers: { ...Options.DefaultSweeperSettings, messages: { interval: 3600, lifetime: 1800 } },
  });
  client.botProfile = bot;
  client.registry = registry;
  client.log = log;
  client.stats = { commands: 0, messages: 0, startedAt: Date.now() };
  client.ownerIds = new Set(config.ownerIds);
  client.audio = new VoiceManager(client);
  client.privileged = privileged;
  client.timers = [];

  client.once(Events.ClientReady, async () => {
    const saved = db.get('meta', `presence:${client.user.id}`, null); // set via !setstatus / !setactivity
    if (saved) Object.assign(bot, saved);
    log.info(`Logged in as ${client.user.tag} — ${client.guilds.cache.size} servers, ${registry.size} commands, prefix "${bot.prefix}", status "${bot.status}".`);
    applyPresence(client);
    client.timers.push(setInterval(() => applyPresence(client), 10 * 60 * 1000));
    try {
      const app = await client.application.fetch();
      if (!client.ownerIds.size) {
        if (app.owner?.members) app.owner.members.forEach((m) => client.ownerIds.add(m.id));
        else if (app.owner?.id) client.ownerIds.add(app.owner.id);
      }
    } catch (err) {
      log.warn('Could not fetch application owner:', err.message);
    }
    await slash.register(client, registry, bot);
    await client.audio.restoreAll();
    for (const task of registry.tasks) {
      if (!handler.moduleEnabled(client, task.category)) continue;
      const run = () => Promise.resolve(task.run(client)).catch((err) => log.error(`Task ${task.name} failed:`, err));
      client.timers.push(setInterval(run, Math.max(5000, task.interval || 60000)));
      run();
    }
    await handler.dispatch(client, 'clientReady');
  });

  client.on(Events.MessageCreate, (m) => handler.onMessage(client, m).catch((err) => log.error('messageCreate:', err)));
  client.on(Events.InteractionCreate, (i) => handler.onInteraction(client, i));
  client.on(Events.VoiceStateUpdate, (o, n) => client.audio.onVoiceStateUpdate(o, n));
  client.on(Events.Error, (err) => log.error('Client error:', err.message));
  client.on(Events.Warn, (w) => log.warn(w));
  client.on(Events.ShardDisconnect, (e) => log.warn(`Gateway disconnected (${e?.code}). discord.js will reconnect automatically.`));
  client.on(Events.ShardResume, () => log.info('Gateway connection resumed.'));
  client.on(Events.GuildCreate, (g) => log.info(`Joined server ${g.name} (${g.id}).`));

  for (const event of registry.events.keys()) {
    if (CORE_EVENTS.has(event)) continue;
    client.on(event, (...args) => handler.dispatch(client, event, ...args));
  }
  return client;
}

/** Resolves once logged in; rejects early if Discord refuses the privileged intents (close code 4014). */
function login(client, token) {
  return new Promise((resolve, reject) => {
    const disallowed = () => Object.assign(new Error('Used disallowed intents'), { code: 4014 });
    const onClose = (e) => e?.code === 4014 && done(disallowed());
    const onError = (err) => /disallowed intents/i.test(err?.message || '') && done(disallowed());
    const done = (err) => {
      client.off(Events.ShardDisconnect, onClose);
      client.off(Events.Error, onError);
      if (err) reject(err);
      else resolve(client);
    };
    client.on(Events.ShardDisconnect, onClose);
    client.on(Events.Error, onError);
    client.login(token).then(() => done(), done);
  });
}

/** Log in; if privileged intents are not enabled, retry without them instead of crashing. */
async function startBot(bot, registry) {
  let client = createClient(bot, registry, { privileged: true });
  try {
    await login(client, bot.token);
  } catch (err) {
    await client.destroy().catch(() => {});
    if (err.code === 4014) {
      client.log.warn(PRIVILEGED_HELP);
      client = createClient(bot, registry, { privileged: false });
      await login(client, bot.token);
    } else {
      if (err.code === 'TokenInvalid' || err.status === 401) {
        client.log.error('The token is invalid. Reset it in the Developer Portal (Bot -> Reset Token) and update your .env / bots.json.');
      }
      throw err;
    }
  }
  return client;
}

module.exports = { startBot, applyPresence };
