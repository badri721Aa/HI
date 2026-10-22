'use strict';
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { parseToggle, truncate } = require('../../core/utils');
const { peek, claim, owns, renderMember, postableChannel } = require('./_lib');

const PLACEHOLDERS = '`{user}` `{mention}` `{username}` `{userid}` `{server}` `{count}` `{ordinal}`';

const DEFAULTS = {
  welcome: {
    enabled: false,
    channel: null,
    message: 'Welcome {mention} to **{server}**! You are our **{ordinal}** member. 🎉',
    embed: true,
    dm: false,
    botId: null,
  },
  goodbye: {
    enabled: false,
    channel: null,
    message: '**{username}** has left **{server}**. We now have **{count}** members.',
    embed: true,
    botId: null,
  },
};

function buildPayload(member, cfg, kind, color) {
  const text = renderMember(cfg.message, member);
  const allowedMentions = { users: [member.id] };
  if (!cfg.embed) return { content: truncate(text, 2000), allowedMentions };
  return {
    content: kind === 'welcome' && /\{mention\}/.test(cfg.message) ? `<@${member.id}>` : undefined,
    embeds: [
      embed({
        color: color ?? (kind === 'welcome' ? 0x57f287 : 0xed4245),
        author: { name: member.guild.name, iconURL: member.guild.iconURL?.() || undefined },
        title: kind === 'welcome' ? '👋 Welcome!' : '👋 Goodbye!',
        description: text,
        thumbnail: member.user.displayAvatarURL?.(),
        footer: `Member count: ${member.guild.memberCount}`,
        timestamp: true,
      }),
    ],
    allowedMentions,
  };
}

async function send(member, cfg, kind, color) {
  const ch = member.guild.channels.cache.get(cfg.channel);
  if (!ch?.send) return false;
  await ch.send(buildPayload(member, cfg, kind, color));
  return true;
}

function status(cfg, kind) {
  return [
    `**Status:** ${cfg.enabled && cfg.channel ? '🟢 On' : '🔴 Off'}`,
    `**Channel:** ${cfg.channel ? `<#${cfg.channel}>` : 'not set'}`,
    `**Style:** ${cfg.embed ? 'embed' : 'plain text'}`,
    kind === 'welcome' ? `**Also DM the new member:** ${cfg.dm ? 'yes' : 'no'}` : null,
    `**Message:**\n${truncate(cfg.message, 1000)}`,
    `\n**Placeholders:** ${PLACEHOLDERS}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function makeCommands(kind) {
  const K = kind.charAt(0).toUpperCase() + kind.slice(1);
  const section = (ctx) => db.section(ctx.guild.id, kind, DEFAULTS[kind]);
  const base = { guildOnly: true, userPerms: ['ManageGuild'] };
  const cmds = [
    {
      ...base,
      name: kind,
      aliases: [`${kind}config`],
      description: `Show the ${kind} message settings`,
      async execute(ctx) {
        await ctx.info(status(section(ctx), kind), `${kind === 'welcome' ? '👋' : '🚪'} ${K} settings`);
      },
    },
    {
      ...base,
      name: `set${kind}`,
      description: `Set the ${kind} channel and turn ${kind} messages on`,
      usage: '<#channel>',
      examples: ['#general'],
      minArgs: 1,
      slash: kind === 'welcome',
      args: [{ name: 'channel', type: 'channel', description: `Channel for ${kind} messages`, required: true }],
      async execute(ctx) {
        const { channel, error } = postableChannel(ctx, ctx.args[0]);
        if (error) return ctx.fail(error);
        const cfg = section(ctx);
        cfg.channel = channel.id;
        cfg.enabled = true;
        claim(cfg, ctx.client);
        await ctx.ok(`${K} messages will be posted in ${channel}. Customise them with \`${ctx.prefix}${kind}msg\`.`);
      },
    },
    {
      ...base,
      name: `${kind}msg`,
      aliases: [`${kind}message`],
      description: `Set the ${kind} message text (supports placeholders)`,
      usage: '<message>',
      examples: [kind === 'welcome' ? 'Hey {mention}, welcome to {server}!' : 'Bye {username}!'],
      minArgs: 1,
      async execute(ctx) {
        const text = ctx.rest(0);
        if (text.length > 1500) return ctx.fail('Keep the message under 1500 characters.');
        const cfg = section(ctx);
        cfg.message = text;
        claim(cfg, ctx.client);
        await ctx.ok(`${K} message updated. Preview with \`${ctx.prefix}test${kind}\`.\nPlaceholders: ${PLACEHOLDERS}`);
      },
    },
    {
      ...base,
      name: `${kind}embed`,
      description: `Send ${kind} messages as an embed (on) or plain text (off)`,
      usage: '<on|off>',
      examples: ['off'],
      minArgs: 1,
      async execute(ctx) {
        const v = parseToggle(ctx.args[0]);
        if (v === null) return ctx.usage();
        const cfg = section(ctx);
        cfg.embed = v;
        claim(cfg, ctx.client);
        await ctx.ok(`${K} messages will be sent as ${v ? 'an embed' : 'plain text'}.`);
      },
    },
    {
      ...base,
      name: `test${kind}`,
      description: `Preview the ${kind} message using yourself`,
      async execute(ctx) {
        const cfg = section(ctx);
        const member = ctx.member;
        const payload = buildPayload(member, cfg, kind, ctx.color);
        if (cfg.channel && cfg.enabled) {
          const sent = await send(member, cfg, kind, ctx.color).catch(() => false);
          if (sent) return ctx.ok(`Test ${kind} message sent to <#${cfg.channel}>.`);
        }
        await ctx.reply({ ...payload, content: `*(preview — ${kind} is ${cfg.enabled && cfg.channel ? 'on' : 'off'})*\n${payload.content || ''}` });
      },
    },
    {
      ...base,
      name: `${kind}off`,
      description: `Turn ${kind} messages off`,
      async execute(ctx) {
        const cfg = section(ctx);
        cfg.enabled = false;
        db.save();
        await ctx.ok(`${K} messages turned off.`);
      },
    },
  ];
  if (kind === 'welcome') {
    cmds.push({
      ...base,
      name: 'welcomedm',
      description: 'Also DM the welcome message to new members (on/off)',
      usage: '<on|off>',
      examples: ['on'],
      minArgs: 1,
      async execute(ctx) {
        const v = parseToggle(ctx.args[0]);
        if (v === null) return ctx.usage();
        const cfg = section(ctx);
        cfg.dm = v;
        claim(cfg, ctx.client);
        await ctx.ok(`New members will ${v ? 'also' : 'no longer'} get the welcome message in DMs.`);
      },
    });
  }
  return cmds;
}

module.exports = {
  commands: [...makeCommands('welcome'), ...makeCommands('goodbye')],
  events: {
    async guildMemberAdd(client, member) {
      const cfg = peek(member.guild.id, 'welcome');
      if (!cfg?.enabled || !cfg.channel || !owns(cfg, client)) return;
      await send(member, cfg, 'welcome', client.botProfile.color).catch(() => {});
      if (cfg.dm && !member.user.bot) {
        await member.send({ content: truncate(renderMember(cfg.message, member), 2000), allowedMentions: { parse: [] } }).catch(() => {});
      }
    },
    async guildMemberRemove(client, member) {
      const cfg = peek(member.guild.id, 'goodbye');
      if (!cfg?.enabled || !cfg.channel || !owns(cfg, client)) return;
      if (member.partial && !member.user) return;
      await send(member, cfg, 'goodbye', client.botProfile.color).catch(() => {});
    },
  },
};
