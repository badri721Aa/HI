'use strict';
/**
 * Offline smoke test: runs commands against a fake Discord context and reports
 * which ones throw. Network calls fail in sandboxes; those are reported as NET.
 *
 *   npm run smoke -- text,math          only these categories
 *   npm run smoke -- all                everything
 *   npm run smoke -- text --verbose     print each reply
 *   npm run smoke -- --cmd ban,kick     only these commands
 *
 * Each command runs once per entry in `examples` (or once with no args when it
 * has no examples and minArgs is 0).
 */
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = path.join(os.tmpdir(), `megabot-smoke-${process.pid}`);

const { Collection, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { EventEmitter } = require('node:events');
const { Registry } = require('../src/core/registry');
const { Context } = require('../src/core/context');
const { VoiceManager } = require('../src/core/voice');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const cmdFlag = argv.indexOf('--cmd');
const onlyCmds = cmdFlag >= 0 ? argv[cmdFlag + 1].split(',') : null;
const cats = (argv.find((a) => !a.startsWith('--') && a !== (onlyCmds && argv[cmdFlag + 1])) || 'all').split(',');

const registry = new Registry().loadDir(path.join(__dirname, '..', 'src', 'modules'));

function makeEnv() {
  const sent = [];
  const fakeMessage = (opts = {}) => {
    const m = new EventEmitter();
    Object.assign(m, {
      id: String(Date.now()) + Math.floor(Math.random() * 1000),
      content: opts.content,
      embeds: opts.embeds || [],
      components: opts.components || [],
      url: 'https://discord.com/channels/1/2/3',
      reactions: { cache: new Collection(), removeAll: async () => {} },
      edit: async (o) => {
        sent.push({ edit: true, ...(typeof o === 'string' ? { content: o } : o) });
        return m;
      },
      delete: async () => {},
      react: async () => {},
      pin: async () => {},
      createMessageComponentCollector: () => Object.assign(new EventEmitter(), { stop() {}, resetTimer() {} }),
      createReactionCollector: () => Object.assign(new EventEmitter(), { stop() {} }),
      awaitMessageComponent: async () => {
        throw Object.assign(new Error('time'), { code: 'InteractionCollectorError' });
      },
      awaitReactions: async () => new Collection(),
    });
    return m;
  };
  const user = {
    id: '111111111111111111',
    username: 'tester',
    globalName: 'Tester',
    displayName: 'Tester',
    tag: 'tester',
    bot: false,
    createdAt: new Date('2020-01-01'),
    createdTimestamp: new Date('2020-01-01').getTime(),
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    avatarURL: () => null,
    bannerURL: () => null,
    fetch: async () => user,
    send: async (o) => fakeMessage(o),
    toString: () => '<@111111111111111111>',
  };
  const everyone = { id: '222222222222222222', name: '@everyone', position: 0, members: new Collection(), toString: () => '@everyone' };
  const guild = {
    id: '222222222222222222',
    name: 'Test Server',
    memberCount: 42,
    ownerId: user.id,
    createdAt: new Date('2021-01-01'),
    createdTimestamp: new Date('2021-01-01').getTime(),
    premiumSubscriptionCount: 2,
    premiumTier: 1,
    iconURL: () => null,
    bannerURL: () => null,
    members: { cache: new Collection(), fetch: async () => new Collection(), me: null },
    channels: { cache: new Collection(), create: async () => { throw new Error('mock: cannot create channels'); } },
    roles: { cache: new Collection([[everyone.id, everyone]]), everyone },
    emojis: { cache: new Collection() },
    // fetch(user) -> ban or "Unknown Ban" (nobody is banned in the mock), fetch() -> Collection
    bans: { fetch: async (arg) => (arg && (typeof arg === 'string' || arg.user) ? Promise.reject(Object.assign(new Error('Unknown Ban'), { code: 10026 })) : new Collection()) },
    fetchOwner: async () => guild.members.cache.get(user.id),
  };
  const allPerms = new PermissionsBitField(PermissionsBitField.All);
  const member = {
    id: user.id,
    user,
    guild,
    displayName: 'Tester',
    nickname: null,
    permissions: allPerms,
    joinedAt: new Date('2022-01-01'),
    joinedTimestamp: new Date('2022-01-01').getTime(),
    premiumSince: null,
    roles: { cache: new Collection([[everyone.id, everyone]]), highest: everyone, add: async () => {}, remove: async () => {} },
    voice: { channel: null },
    displayAvatarURL: user.displayAvatarURL,
    displayHexColor: '#5865f2',
    toString: () => '<@111111111111111111>',
  };
  guild.members.cache.set(user.id, member);
  guild.members.me = member;
  const channel = {
    id: '333333333333333333',
    name: 'general',
    type: 0,
    nsfw: false,
    guild,
    topic: null,
    createdAt: new Date('2021-01-01'),
    send: async (o) => {
      sent.push(typeof o === 'string' ? { content: o } : o);
      return fakeMessage(typeof o === 'string' ? { content: o } : o);
    },
    sendTyping: async () => {},
    isTextBased: () => true,
    isVoiceBased: () => false,
    permissionsFor: () => allPerms,
    // fetch(id) -> message (none exist in the mock), fetch({ limit }) -> Collection, like discord.js
    messages: { fetch: async (arg) => (typeof arg === 'string' ? Promise.reject(Object.assign(new Error('Unknown Message'), { code: 10008 })) : new Collection()) },
    bulkDelete: async () => new Collection(),
    toString: () => '<#333333333333333333>',
  };
  guild.channels.cache.set(channel.id, channel);
  const message = {
    id: '444444444444444444',
    author: user,
    member,
    guild,
    channel,
    content: '',
    attachments: new Collection(),
    mentions: { users: new Collection(), members: new Collection(), channels: new Collection(), roles: new Collection() },
    reply: async (o) => {
      sent.push(o);
      return fakeMessage(o);
    },
    delete: async () => {},
    react: async () => {},
    createdTimestamp: Date.now(),
  };
  const client = {
    user: { id: '999999999999999999', username: 'MegaBot', tag: 'MegaBot#0001', displayAvatarURL: () => '', createdAt: new Date(), setPresence() {} },
    registry,
    botProfile: { name: 'Test', prefix: '!', modules: 'all', color: 0x5865f2, status: 'online' },
    stats: { commands: 0, messages: 0, startedAt: Date.now() - 60000 },
    ownerIds: new Set([user.id]),
    users: { fetch: async (id) => (id === user.id ? user : null), cache: new Collection([[user.id, user]]) },
    guilds: { cache: new Collection([[guild.id, guild]]) },
    channels: { cache: new Collection([[channel.id, channel]]), fetch: async (id) => (id === channel.id ? channel : null) },
    ws: { ping: 42 },
    uptime: 60000,
    readyAt: new Date(),
    isReady: () => true,
    application: { id: '999999999999999999', commands: { set: async () => new Collection() } },
    log: { info() {}, warn() {}, error() {} },
  };
  client.audio = new VoiceManager(client);
  return { sent, message, client };
}

const isNet = (err) =>
  err?.status ||
  ['TimeoutError', 'AbortError'].includes(err?.name) ||
  /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|getaddrinfo|socket|network|HTTP \d{3}/i.test(`${err?.message} ${err?.cause?.code || ''} ${err?.cause?.message || ''}`);

const summarize = (o) => {
  if (!o) return '';
  if (typeof o === 'string') return o;
  const parts = [];
  if (o.content) parts.push(o.content);
  for (const e of o.embeds || []) {
    const d = e instanceof EmbedBuilder ? e.data : e;
    parts.push(`[embed] ${d.title || ''} ${d.description || ''} ${(d.fields || []).map((f) => `${f.name}: ${f.value}`).join(' | ')}`.trim());
  }
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 300);
};

(async () => {
  const results = { ok: 0, handled: 0, net: 0, fail: 0, timeout: 0 };
  const failures = [];
  const list = [...registry.commands.values()].filter((c) => (onlyCmds ? onlyCmds.includes(c.name) : cats.includes('all') || cats.includes(c.category)));
  for (const cmd of list) {
    const runs = cmd.examples?.length ? cmd.examples : cmd.minArgs ? [] : [''];
    for (const example of runs) {
      const { sent, message, client } = makeEnv();
      const ctx = new Context({ client, bot: client.botProfile, command: cmd, message, raw: example, prefix: '!' });
      let outcome;
      try {
        await Promise.race([cmd.execute(ctx), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { smokeTimeout: true })), 5000))]);
        outcome = 'ok';
      } catch (err) {
        if (err?.smokeTimeout) outcome = 'timeout';
        else if (err?.userMessage) {
          outcome = 'handled'; // intentional user-facing error (the handler shows err.userMessage)
          sent.push({ content: `[user error] ${err.userMessage}` });
        } else if (isNet(err)) outcome = 'net';
        else {
          outcome = 'fail';
          failures.push(`${cmd.source} → !${cmd.name} ${example}\n    ${(err?.stack || String(err)).split('\n').slice(0, 3).join('\n    ')}`);
        }
      }
      results[outcome]++;
      if (verbose || outcome === 'fail') console.log(`${outcome.toUpperCase().padEnd(7)} !${cmd.name} ${example}  →  ${sent.map(summarize).join(' || ')}`);
    }
  }
  console.log(`\nRan ${list.length} commands: ${results.ok} ok, ${results.handled} user-facing errors, ${results.net} network-blocked, ${results.timeout} timed out, ${results.fail} failed.`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(' -', f);
  }
  process.exit(failures.length ? 1 : 0);
})();
