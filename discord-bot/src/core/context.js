'use strict';
/**
 * One object for both prefix messages and slash interactions, so every command
 * is written once:
 *
 *   ctx.args            string[] (double quotes group words: "two words")
 *   ctx.rest(n)         raw text starting at argument n (keeps spacing/newlines)
 *   ctx.reply(x)        x = string | EmbedBuilder | MessageCreateOptions  -> Message
 *   ctx.ok/fail/info(text)
 *   ctx.usage()         replies with the command's usage line
 *   ctx.defer()         typing indicator / deferReply for slow work
 *   ctx.resolveUser/resolveMember/resolveChannel/resolveRole(str)
 *   ctx.author, member, guild, channel, client, bot, db, config, prefix, audio, attachments, isSlash
 */
const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('./db');
const embeds = require('./embeds');

function tokenize(raw) {
  const tokens = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(raw))) tokens.push({ value: m[1] !== undefined ? m[1] : m[2], start: m.index });
  return tokens;
}

function normalize(input) {
  if (input === undefined || input === null) return { content: '​' };
  if (typeof input === 'string' || typeof input === 'number') return { content: String(input).slice(0, 2000) || '​' };
  if (input instanceof EmbedBuilder) return { embeds: [input] };
  return { ...input };
}

class Context {
  constructor({ client, bot, command, message = null, interaction = null, raw = '', prefix = '!', attachments = [] }) {
    this.client = client;
    this.bot = bot;
    this.command = command;
    this.message = message;
    this.interaction = interaction;
    this.prefix = prefix;
    this.raw = raw;
    this.tokens = tokenize(raw);
    this.args = this.tokens.map((t) => t.value);
    this.attachments = attachments;
    this.db = db;
    this.embeds = embeds;
    this._lastReply = null;
  }

  get isSlash() {
    return !!this.interaction;
  }
  get author() {
    return this.interaction ? this.interaction.user : this.message.author;
  }
  get user() {
    return this.author;
  }
  get member() {
    return this.interaction ? this.interaction.member : this.message.member;
  }
  get guild() {
    return this.interaction ? this.interaction.guild : this.message.guild;
  }
  get channel() {
    return this.interaction ? this.interaction.channel : this.message.channel;
  }
  get registry() {
    return this.client.registry;
  }
  get audio() {
    return this.client.audio;
  }
  get config() {
    return this.guild ? db.guild(this.guild.id) : null;
  }
  get color() {
    return this.bot?.color;
  }

  rest(n = 0) {
    if (n >= this.tokens.length) return '';
    return this.raw.slice(this.tokens[n].start).trim();
  }

  async reply(input) {
    const opts = normalize(input);
    const ephemeral = opts.ephemeral;
    delete opts.ephemeral;

    if (this.interaction) {
      if (ephemeral) opts.flags = (opts.flags || 0) | MessageFlags.Ephemeral;
      const i = this.interaction;
      let msg;
      if (i.deferred && !i.replied && !this._editedDefer) {
        this._editedDefer = true;
        delete opts.flags; // ephemerality is fixed at defer time
        msg = await i.editReply(opts);
      } else if (!i.replied && !i.deferred) {
        await i.reply(opts);
        msg = await i.fetchReply().catch(() => null);
      } else {
        msg = await i.followUp(opts);
      }
      this._lastReply = msg;
      return msg;
    }

    delete opts.flags;
    try {
      this._lastReply = await this.message.reply({ allowedMentions: { repliedUser: false, parse: ['users'] }, ...opts });
    } catch {
      // Original message deleted (or no reply permission) — fall back to a plain send.
      this._lastReply = await this.message.channel.send(opts);
    }
    return this._lastReply;
  }

  async send(input) {
    return this.channel.send(normalize(input));
  }

  ok(text, title) {
    return this.reply({ embeds: [embeds.success(text, title)] });
  }
  fail(text, title) {
    return this.reply({ embeds: [embeds.error(text, title)], ephemeral: true });
  }
  info(text, title) {
    return this.reply({ embeds: [embeds.embed({ description: text, title, color: this.color })] });
  }
  warn(text, title) {
    return this.reply({ embeds: [embeds.warn(text, title)] });
  }
  usage(extra) {
    const c = this.command;
    const lines = [`**Usage:** \`${this.prefix}${c.name}${c.usage ? ` ${c.usage}` : ''}\``];
    if (c.examples?.length) lines.push(`**Example:** ${c.examples.slice(0, 3).map((e) => `\`${this.prefix}${c.name} ${e}\``).join(' • ')}`);
    if (extra) lines.unshift(extra);
    return this.reply({ embeds: [embeds.embed({ color: embeds.colors.warn, description: lines.join('\n') })], ephemeral: true });
  }

  async defer(ephemeral = false) {
    if (this.interaction) {
      if (!this.interaction.deferred && !this.interaction.replied) {
        await this.interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
      }
    } else {
      await this.channel.sendTyping?.().catch(() => {});
    }
  }

  /** Embed with the bot's colour. */
  embed(opts = {}) {
    return embeds.embed({ color: this.color, ...opts });
  }

  // ---------- resolvers ----------
  static idFrom(str, kind) {
    if (!str) return null;
    const s = String(str).trim();
    const patterns = { user: /^<@!?(\d{15,21})>$/, channel: /^<#(\d{15,21})>$/, role: /^<@&(\d{15,21})>$/ };
    const m = s.match(patterns[kind]) || s.match(/^(\d{15,21})$/);
    return m ? m[1] : null;
  }

  async resolveUser(str) {
    if (!str) return null;
    const id = Context.idFrom(str, 'user');
    if (id) return this.client.users.fetch(id).catch(() => null);
    const member = await this.resolveMember(str);
    return member ? member.user : null;
  }

  async resolveMember(str) {
    if (!str || !this.guild) return null;
    const id = Context.idFrom(str, 'user');
    if (id) return this.guild.members.fetch(id).catch(() => null);
    const q = String(str).toLowerCase().replace(/^@/, '');
    const find = (col) =>
      col.find((m) => m.user.username.toLowerCase() === q || m.displayName.toLowerCase() === q) ||
      col.find((m) => m.user.username.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q));
    const cached = find(this.guild.members.cache);
    if (cached) return cached;
    const fetched = await this.guild.members.fetch({ query: q, limit: 5 }).catch(() => null);
    return fetched ? find(fetched) || fetched.first() || null : null;
  }

  resolveChannel(str) {
    if (!str || !this.guild) return null;
    const id = Context.idFrom(str, 'channel');
    if (id) return this.guild.channels.cache.get(id) || null;
    const q = String(str).toLowerCase().replace(/^#/, '');
    return this.guild.channels.cache.find((c) => c.name.toLowerCase() === q) || null;
  }

  resolveRole(str) {
    if (!str || !this.guild) return null;
    const id = Context.idFrom(str, 'role');
    if (id) return this.guild.roles.cache.get(id) || null;
    const q = String(str).toLowerCase().replace(/^@/, '');
    return this.guild.roles.cache.find((r) => r.name.toLowerCase() === q) || this.guild.roles.cache.find((r) => r.name.toLowerCase().includes(q)) || null;
  }

  /** User from args[i], falling back to the author. */
  async targetUser(i = 0) {
    return (await this.resolveUser(this.args[i])) || this.author;
  }
  async targetMember(i = 0) {
    return (await this.resolveMember(this.args[i])) || this.member;
  }

  isOwner(userId = this.author.id) {
    return this.client.ownerIds?.has(userId) || false;
  }
}

module.exports = { Context, tokenize };
