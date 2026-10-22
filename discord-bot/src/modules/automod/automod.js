'use strict';
/**
 * AutoMod: message filters (links, invites, spam, caps, mentions, emoji, zalgo,
 * walls of text, duplicates, bad words) with a configurable punishment.
 * Members with Manage Messages (and exempt roles/channels) are never filtered.
 */
const { PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const { colors } = require('../../core/embeds');
const { parseDuration, formatDuration, truncate, chunk, parseToggle } = require('../../core/utils');
const { confirm, paginate } = require('../../core/ui');
const mod = require('../moderation/_lib');

const DEFAULTS = {
  enabled: false,
  action: 'delete', // delete | warn | timeout
  timeoutMs: 10 * 60 * 1000,
  logViolations: true,
  exemptRoles: [],
  exemptChannels: [],
  antilink: { enabled: false, allow: ['tenor.com', 'giphy.com'] },
  antiinvite: { enabled: false },
  antispam: { enabled: false, messages: 6, seconds: 5 },
  anticaps: { enabled: false, percent: 70, minLength: 12 },
  antimention: { enabled: false, max: 5 },
  antiemoji: { enabled: false, max: 10 },
  antizalgo: { enabled: false },
  antinewlines: { enabled: false, max: 15 },
  antiduplicate: { enabled: false, count: 3, seconds: 30 },
  badwords: { enabled: false, words: [] },
};

const settings = (guildId) => db.section(guildId, 'automod', DEFAULTS);

const INVITE_RE = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite|dsc\.gg)\/[\w-]+/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;
const ZALGO_RE = /[̀-ͯ҉᷀-᷿⃐-⃿︠-︯]/g;
const EMOJI_RE = /<a?:\w+:\d+>|\p{Extended_Pictographic}/gu;
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

// In-memory rate tracking (per process — fine because all bots share it).
const recent = new Map(); // guild:user -> [timestamps]
const lastContent = new Map(); // guild:user -> [{ content, at }]
const actionCooldown = new Map(); // guild:user -> until (avoid punishing the same burst repeatedly)
const noticeCooldown = new Map();

function hostOf(url) {
  try {
    return new URL(url.startsWith('www.') ? `http://${url}` : url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeForWords(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ​-‏⁠]/g, '')
    .replace(/[013457@$!]/g, (c) => LEET[c] || c);
}

function wordRegex(word) {
  const w = normalizeForWords(word).replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '\\w*' : `\\${c}`));
  return new RegExp(`(^|[^a-z0-9])${w}($|[^a-z0-9])`, 'i');
}
const regexCache = new Map();
function matchesBadWord(content, words) {
  const text = normalizeForWords(content);
  return words.find((w) => {
    let re = regexCache.get(w);
    if (!re) {
      re = wordRegex(w);
      regexCache.set(w, re);
    }
    return re.test(text);
  });
}

/** Returns { rule, detail } for the first filter the message breaks, or null. */
function detect(message, cfg) {
  const content = message.content || '';
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();

  if (cfg.badwords.enabled && cfg.badwords.words.length && content) {
    const hit = matchesBadWord(content, cfg.badwords.words);
    if (hit) return { rule: 'Blocked word', notice: 'that word isn\'t allowed here.' };
  }
  if (cfg.antiinvite.enabled && INVITE_RE.test(content)) return { rule: 'Discord invite', notice: 'invite links aren\'t allowed here.' };
  if (cfg.antilink.enabled) {
    const links = content.match(URL_RE) || [];
    const allow = cfg.antilink.allow || [];
    const bad = links.find((l) => {
      const h = hostOf(l);
      return h && !allow.some((d) => h === d || h.endsWith(`.${d}`));
    });
    if (bad) return { rule: 'Link', notice: 'links aren\'t allowed here.' };
  }
  if (cfg.antimention.enabled) {
    const n = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0);
    if (n > cfg.antimention.max) return { rule: `Mass mention (${n})`, notice: 'too many mentions.' };
  }
  if (cfg.anticaps.enabled) {
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= cfg.anticaps.minLength) {
      const pct = (letters.replace(/[^A-Z]/g, '').length / letters.length) * 100;
      if (pct >= cfg.anticaps.percent) return { rule: `Excessive caps (${Math.round(pct)}%)`, notice: 'please don\'t shout.' };
    }
  }
  if (cfg.antiemoji.enabled) {
    const n = (content.match(EMOJI_RE) || []).length;
    if (n > cfg.antiemoji.max) return { rule: `Emoji spam (${n})`, notice: 'too many emojis.' };
  }
  if (cfg.antizalgo.enabled) {
    const n = (content.match(ZALGO_RE) || []).length;
    if (n >= 10 && n / Math.max(1, content.length) > 0.2) return { rule: 'Zalgo text', notice: 'zalgo/glitch text isn\'t allowed.' };
  }
  if (cfg.antinewlines.enabled) {
    const lines = content.split('\n').length;
    if (lines > cfg.antinewlines.max) return { rule: `Wall of text (${lines} lines)`, notice: 'that message is too long.' };
  }
  if (cfg.antiduplicate.enabled && content.length >= 3) {
    const win = cfg.antiduplicate.seconds * 1000;
    const list = (lastContent.get(key) || []).filter((e) => now - e.at < win);
    list.push({ content: content.toLowerCase(), at: now });
    lastContent.set(key, list.slice(-20));
    const same = list.filter((e) => e.content === content.toLowerCase()).length;
    if (same >= cfg.antiduplicate.count) return { rule: `Repeated message (×${same})`, notice: 'please don\'t repeat yourself.' };
  }
  if (cfg.antispam.enabled) {
    const win = cfg.antispam.seconds * 1000;
    const list = (recent.get(key) || []).filter((t) => now - t < win);
    list.push(now);
    recent.set(key, list);
    if (list.length > cfg.antispam.messages) return { rule: `Spam (${list.length} msgs/${cfg.antispam.seconds}s)`, notice: 'slow down!' };
  }
  return null;
}

async function enforce(client, message, cfg, hit) {
  const guild = message.guild;
  const key = `${guild.id}:${message.author.id}`;
  const deleted = await message.delete().then(() => true).catch(() => false);

  if ((noticeCooldown.get(key) || 0) < Date.now()) {
    noticeCooldown.set(key, Date.now() + 5000);
    message.channel
      .send({ content: `${message.author}, ${hit.notice}`, allowedMentions: { users: [message.author.id] } })
      .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
      .catch(() => {});
  }

  // Only punish/log once per burst.
  if ((actionCooldown.get(key) || 0) > Date.now()) return deleted;
  actionCooldown.set(key, Date.now() + 10000);
  if (actionCooldown.size > 5000) for (const [k, v] of actionCooldown) if (v < Date.now()) actionCooldown.delete(k);

  const reason = `[AutoMod] ${hit.rule}`;
  let outcome = deleted ? 'message deleted' : 'detected';
  const member = message.member;
  try {
    if (cfg.action === 'warn') {
      await mod.dmUser(guild, message.author, 'warn', reason);
      const c = mod.createCase(guild, { type: 'warn', user: message.author, moderator: client.user, reason });
      await mod.postModlog(guild, c);
      outcome += `, warned (case #${c.id})`;
      const esc = await mod.applyWarnActions(guild, member, client.user);
      if (esc) outcome += `, auto-${esc}`;
    } else if (cfg.action === 'timeout' && member?.moderatable) {
      await member.timeout(cfg.timeoutMs, reason);
      await mod.dmUser(guild, message.author, 'timeout', reason, cfg.timeoutMs);
      const c = mod.createCase(guild, { type: 'timeout', user: message.author, moderator: client.user, reason, duration: cfg.timeoutMs });
      await mod.postModlog(guild, c);
      outcome += `, timed out ${formatDuration(cfg.timeoutMs)} (case #${c.id})`;
    }
  } catch {
    /* missing permissions — deletion still counts */
  }
  if (cfg.logViolations) {
    await mod.postModlog(
      guild,
      mod.actionEmbed(
        '🚨 AutoMod',
        `**User:** <@${message.author.id}> (${message.author.tag})\n**Channel:** <#${message.channel.id}>\n**Rule:** ${hit.rule}\n**Result:** ${outcome}\n**Content:** ${truncate(message.content || '*no text*', 600)}`,
        colors.warn,
      ),
    );
  }
  return deleted;
}

async function onMessage(client, message) {
  if (!message.guild || !message.member) return false;
  const raw = db.guild(message.guild.id).automod;
  if (!raw?.enabled) return false;
  const cfg = settings(message.guild.id);
  const perms = message.member.permissions;
  if (perms?.has(PermissionFlagsBits.ManageMessages) || perms?.has(PermissionFlagsBits.Administrator)) return false;
  if (cfg.exemptChannels.includes(message.channel.id) || cfg.exemptChannels.includes(message.channel.parentId)) return false;
  if (message.member.roles.cache.some((r) => cfg.exemptRoles.includes(r.id))) return false;
  if (!mod.claim(`am:${message.id}`)) return false; // another bot in this process handles it
  const hit = detect(message, cfg);
  if (!hit) return false;
  return enforce(client, message, cfg, hit);
}

// ---------------------------------------------------------------- commands

const onOff = (b) => (b ? '🟢 on' : '🔴 off');

function statusEmbed(ctx, cfg) {
  const f = (name, key, extra = '') => `${onOff(cfg[key].enabled)} **${name}**${extra}`;
  return ctx.embed({
    title: `🚨 AutoMod — ${cfg.enabled ? 'enabled' : 'disabled'}`,
    description: [
      f('Anti-link', 'antilink', cfg.antilink.allow.length ? ` (allowed: ${cfg.antilink.allow.join(', ')})` : ''),
      f('Anti-invite', 'antiinvite'),
      f('Anti-spam', 'antispam', ` (${cfg.antispam.messages} msgs / ${cfg.antispam.seconds}s)`),
      f('Anti-caps', 'anticaps', ` (${cfg.anticaps.percent}% of ${cfg.anticaps.minLength}+ letters)`),
      f('Anti-mention', 'antimention', ` (max ${cfg.antimention.max})`),
      f('Anti-emoji', 'antiemoji', ` (max ${cfg.antiemoji.max})`),
      f('Anti-zalgo', 'antizalgo'),
      f('Anti-newlines', 'antinewlines', ` (max ${cfg.antinewlines.max} lines)`),
      f('Anti-duplicate', 'antiduplicate', ` (${cfg.antiduplicate.count}× in ${cfg.antiduplicate.seconds}s)`),
      f('Bad words', 'badwords', ` (${cfg.badwords.words.length} words)`),
    ].join('\n'),
    fields: [
      { name: 'Action', value: cfg.action === 'timeout' ? `timeout (${formatDuration(cfg.timeoutMs)})` : cfg.action, inline: true },
      { name: 'Log to modlog', value: cfg.logViolations ? 'yes' : 'no', inline: true },
      { name: 'Exempt', value: [...cfg.exemptRoles.map((r) => `<@&${r}>`), ...cfg.exemptChannels.map((c) => `<#${c}>`)].join(' ') || 'none (plus anyone with Manage Messages)' },
    ],
    footer: `Toggle filters: ${ctx.prefix}antilink on, ${ctx.prefix}antispam on 5 5, ${ctx.prefix}badwords …`,
  });
}

/** Factory for "<filter> on|off [n] [n]" commands. */
function filterCommand(name, key, label, params = [], aliases = []) {
  const usage = `<on|off>${params.map((p) => ` [${p.name}=${DEFAULTS[key][p.key]}]`).join('')}`;
  return {
    name,
    aliases,
    description: `Toggle the ${label} filter${params.length ? ' and its limits' : ''}`,
    usage,
    examples: ['on', 'off', ...(params.length ? [`on ${params.map((p) => DEFAULTS[key][p.key]).join(' ')}`] : [])],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      if (!ctx.args[0]) return ctx.reply({ embeds: [statusEmbed(ctx, cfg)] });
      const state = parseToggle(ctx.args[0]);
      if (state === null) return ctx.usage();
      for (const [i, p] of params.entries()) {
        const raw = ctx.args[i + 1];
        if (raw === undefined) continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < p.min || n > p.max) return ctx.fail(`${p.name} must be between ${p.min} and ${p.max}.`);
        cfg[key][p.key] = Math.round(n);
      }
      cfg[key].enabled = state;
      if (state) cfg.enabled = true;
      db.save();
      const limits = params.map((p) => `${p.name}: **${cfg[key][p.key]}**`).join(', ');
      await ctx.ok(`${label} is now **${state ? 'on' : 'off'}**${limits && state ? ` (${limits})` : ''}.`);
    },
  };
}

function toggleList(ctx, list, id, label) {
  const i = list.indexOf(id);
  if (i === -1) list.push(id);
  else list.splice(i, 1);
  db.save();
  return ctx.ok(`${label} ${i === -1 ? 'is now exempt from' : 'is no longer exempt from'} AutoMod.`);
}

const commands = [
  {
    name: 'automod',
    aliases: ['am', 'automodstatus'],
    description: 'Show AutoMod status, or turn the whole system on/off',
    usage: '[on|off]',
    examples: ['', 'on', 'off'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'state', type: 'string', description: 'Turn AutoMod on or off', choices: ['on', 'off'] }],
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      if (!ctx.args[0]) return ctx.reply({ embeds: [statusEmbed(ctx, cfg)] });
      if (!mod.hasPerm(ctx, 'ManageGuild')) return ctx.fail('You need **Manage Server** to change AutoMod.');
      const state = parseToggle(ctx.args[0]);
      if (state === null) return ctx.usage();
      cfg.enabled = state;
      db.save();
      await ctx.ok(`AutoMod is now **${state ? 'enabled' : 'disabled'}**.${state ? ` Turn on filters with \`${ctx.prefix}antilink on\`, \`${ctx.prefix}antispam on\`, etc.` : ''}`);
    },
  },
  filterCommand('antilink', 'antilink', 'Anti-link', [], ['nolinks']),
  filterCommand('antiinvite', 'antiinvite', 'Anti-invite', [], ['noinvites']),
  filterCommand('antispam', 'antispam', 'Anti-spam', [
    { name: 'messages', key: 'messages', min: 2, max: 30 },
    { name: 'seconds', key: 'seconds', min: 1, max: 60 },
  ]),
  filterCommand('anticaps', 'anticaps', 'Anti-caps', [
    { name: 'percent', key: 'percent', min: 30, max: 100 },
    { name: 'minLength', key: 'minLength', min: 3, max: 200 },
  ], ['nocaps']),
  filterCommand('antimention', 'antimention', 'Anti-mass-mention', [{ name: 'max', key: 'max', min: 1, max: 50 }], ['antimentions', 'antiping']),
  filterCommand('antiemoji', 'antiemoji', 'Anti-emoji-spam', [{ name: 'max', key: 'max', min: 1, max: 100 }], ['antiemojis']),
  filterCommand('antizalgo', 'antizalgo', 'Anti-zalgo'),
  filterCommand('antinewlines', 'antinewlines', 'Anti-wall-of-text', [{ name: 'max', key: 'max', min: 2, max: 200 }], ['antiwall', 'antilines']),
  filterCommand('antiduplicate', 'antiduplicate', 'Anti-duplicate', [
    { name: 'count', key: 'count', min: 2, max: 20 },
    { name: 'seconds', key: 'seconds', min: 5, max: 600 },
  ], ['antirepeat']),
  {
    name: 'badwords',
    aliases: ['wordfilter', 'blockedwords'],
    description: 'List blocked words, or turn the bad-word filter on/off',
    usage: '[on|off]',
    examples: ['', 'on'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      if (ctx.args[0]) {
        const state = parseToggle(ctx.args[0]);
        if (state === null) return ctx.usage();
        cfg.badwords.enabled = state;
        if (state) cfg.enabled = true;
        db.save();
        return ctx.ok(`Bad-word filter is now **${state ? 'on' : 'off'}** (${cfg.badwords.words.length} words).`);
      }
      const words = cfg.badwords.words;
      if (!words.length) return ctx.info(`No blocked words yet. Add some with \`${ctx.prefix}addbadword word1, word2\`.`, `🤬 Bad words — ${onOff(cfg.badwords.enabled)}`);
      const pages = chunk(words.map((w) => `||${w}||`), 40).map((p, i, a) =>
        ctx.embed({ title: `🤬 Bad words (${words.length}) — ${onOff(cfg.badwords.enabled)}`, description: p.join(', '), footer: `Page ${i + 1}/${a.length} • * works as a wildcard` }),
      );
      await paginate(ctx, pages, { ephemeral: true });
    },
  },
  {
    name: 'addbadword',
    aliases: ['addbadwords', 'blockword'],
    description: 'Add blocked words (comma or space separated, * = wildcard)',
    usage: '<word, word…>',
    examples: ['badword', 'darn, heck*'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      const words = ctx.rest(0).split(/[,\s]+/).map((w) => w.trim().toLowerCase()).filter((w) => w && w.length <= 50);
      const added = words.filter((w) => !cfg.badwords.words.includes(w));
      if (cfg.badwords.words.length + added.length > 500) return ctx.fail('The list can hold at most 500 words.');
      cfg.badwords.words.push(...added);
      cfg.badwords.enabled = true;
      cfg.enabled = true;
      db.save();
      if (!ctx.isSlash) ctx.message.delete().catch(() => {});
      await ctx.ok(`Added **${added.length}** word(s). The filter is on (${cfg.badwords.words.length} total).`);
    },
  },
  {
    name: 'removebadword',
    aliases: ['removebadwords', 'unblockword', 'delbadword'],
    description: 'Remove words from the blocked list',
    usage: '<word, word…>',
    examples: ['badword'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      const words = new Set(ctx.rest(0).split(/[,\s]+/).map((w) => w.trim().toLowerCase()).filter(Boolean));
      const before = cfg.badwords.words.length;
      cfg.badwords.words = cfg.badwords.words.filter((w) => !words.has(w));
      db.save();
      if (!ctx.isSlash) ctx.message.delete().catch(() => {});
      await ctx.ok(`Removed **${before - cfg.badwords.words.length}** word(s).`);
    },
  },
  {
    name: 'clearbadwords',
    aliases: ['resetbadwords'],
    description: 'Remove every word from the blocked list',
    guildOnly: true,
    userPerms: ['ManageGuild'],
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      if (!cfg.badwords.words.length) return ctx.info('The list is already empty.');
      if (!(await confirm(ctx, `Delete all **${cfg.badwords.words.length}** blocked words?`))) return;
      cfg.badwords.words = [];
      db.save();
      await ctx.send({ embeds: [ctx.embed({ description: '🧽 Cleared the blocked word list.' })] });
    },
  },
  {
    name: 'allowlink',
    aliases: ['whitelistlink', 'allowdomain'],
    description: 'Allow a domain through the anti-link filter',
    usage: '<domain>',
    examples: ['youtube.com', 'https://github.com/foo'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      const d = hostOf(ctx.args[0].includes('://') ? ctx.args[0] : `http://${ctx.args[0]}`).replace(/^www\./, '');
      if (!d || !d.includes('.')) return ctx.usage('Give a domain like `youtube.com`.');
      if (cfg.antilink.allow.includes(d)) return ctx.info(`\`${d}\` is already allowed.`);
      if (cfg.antilink.allow.length >= 100) return ctx.fail('At most 100 allowed domains.');
      cfg.antilink.allow.push(d);
      db.save();
      await ctx.ok(`Links to \`${d}\` (and its subdomains) are now allowed.`);
    },
  },
  {
    name: 'disallowlink',
    aliases: ['unwhitelistlink', 'disallowdomain'],
    description: 'Remove a domain from the anti-link allow list',
    usage: '<domain>',
    examples: ['youtube.com'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      const d = ctx.args[0].toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      const i = cfg.antilink.allow.indexOf(d);
      if (i === -1) return ctx.fail(`\`${d}\` isn't on the allow list.`);
      cfg.antilink.allow.splice(i, 1);
      db.save();
      await ctx.ok(`\`${d}\` is no longer allowed.`);
    },
  },
  {
    name: 'allowedlinks',
    aliases: ['linkwhitelist', 'alloweddomains'],
    description: 'Show domains allowed through the anti-link filter',
    guildOnly: true,
    async execute(ctx) {
      const list = settings(ctx.guild.id).antilink.allow;
      await ctx.info(list.length ? list.map((d) => `• \`${d}\``).join('\n') : 'No domains allowed — every link is blocked when anti-link is on.', '🔗 Allowed domains');
    },
  },
  {
    name: 'amexemptrole',
    aliases: ['automodexemptrole', 'amignorerole'],
    description: 'Toggle a role being exempt from AutoMod',
    usage: '<role>',
    examples: ['Trusted'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const role = ctx.resolveRole(ctx.rest(0));
      if (!role) return ctx.fail('Role not found.');
      await toggleList(ctx, settings(ctx.guild.id).exemptRoles, role.id, `${role}`);
    },
  },
  {
    name: 'amexemptchannel',
    aliases: ['automodexemptchannel', 'amignorechannel'],
    description: 'Toggle a channel (or category) being exempt from AutoMod',
    usage: '<#channel>',
    examples: ['#memes'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const ch = ctx.resolveChannel(ctx.args[0]);
      if (!ch) return ctx.fail('Channel not found.');
      await toggleList(ctx, settings(ctx.guild.id).exemptChannels, ch.id, `${ch}`);
    },
  },
  {
    name: 'automodaction',
    aliases: ['amaction', 'automodpunish'],
    description: 'What AutoMod does on a violation: delete, warn, or timeout <duration>',
    usage: '<delete|warn|timeout> [duration]',
    examples: ['delete', 'warn', 'timeout 10m'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      const action = ctx.args[0].toLowerCase();
      if (!['delete', 'warn', 'timeout'].includes(action)) return ctx.usage();
      if (action === 'timeout') {
        const ms = parseDuration(ctx.args[1] || '10m');
        if (!ms || ms > 28 * 86400000) return ctx.fail('Give a timeout up to 28d, e.g. `10m`.');
        cfg.timeoutMs = ms;
      }
      cfg.action = action;
      db.save();
      await ctx.ok(`AutoMod will **${action === 'delete' ? 'delete the message' : action === 'warn' ? 'delete and warn' : `delete and time out for ${formatDuration(cfg.timeoutMs)}`}** on violations.`);
    },
  },
  {
    name: 'automodlog',
    aliases: ['amlog'],
    description: 'Turn logging of AutoMod violations to the modlog channel on/off',
    usage: '<on|off>',
    examples: ['on', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const state = parseToggle(ctx.args[0]);
      if (state === null) return ctx.usage();
      settings(ctx.guild.id).logViolations = state;
      db.save();
      await ctx.ok(`AutoMod violation logging is **${state ? 'on' : 'off'}**${state && !mod.modlogChannel(ctx.guild) ? ` — set a channel with \`${ctx.prefix}setmodlog #channel\`` : ''}.`);
    },
  },
  {
    name: 'automodreset',
    aliases: ['amreset'],
    description: 'Reset every AutoMod setting to default (filters off)',
    guildOnly: true,
    userPerms: ['ManageGuild'],
    async execute(ctx) {
      if (!(await confirm(ctx, 'Reset **all** AutoMod settings, including the bad-word list?'))) return;
      db.guild(ctx.guild.id).automod = structuredClone(DEFAULTS);
      db.save();
      await ctx.send({ embeds: [ctx.embed({ description: '♻️ AutoMod settings reset.' })] });
    },
  },
];

module.exports = { commands, events: { messageCreate: onMessage } };
module.exports.detect = detect;
module.exports.DEFAULTS = DEFAULTS;
