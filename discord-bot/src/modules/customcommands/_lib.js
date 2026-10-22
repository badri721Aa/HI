'use strict';
const { pick, template } = require('../../core/utils');

/**
 * Placeholders for custom commands / tags / auto-responders:
 *   {user} {mention} {username} {userid} {avatar} {server} {membercount} {channel} {channelname}
 *   {args} {arg1} {arg2} … {random:a|b|c} {date} {time}
 */
function render(tpl, { user, member, guild, channel, args = [] }) {
  let out = String(tpl).replace(/\{random:([^}]+)\}/gi, (_, list) => pick(list.split('|')).trim());
  out = out.replace(/\{arg(\d{1,2})\}/gi, (_, n) => args[Number(n) - 1] ?? '');
  const now = new Date();
  return template(out, {
    user: member?.displayName || user.globalName || user.username,
    mention: `<@${user.id}>`,
    username: user.username,
    userid: user.id,
    avatar: user.displayAvatarURL?.() || '',
    server: guild?.name || 'DMs',
    membercount: guild?.memberCount ?? 0,
    channel: channel ? `<#${channel.id}>` : '',
    channelname: channel?.name || '',
    args: args.join(' '),
    date: now.toISOString().slice(0, 10),
    time: `${now.toISOString().slice(11, 16)} UTC`,
  }).slice(0, 2000);
}

const PLACEHOLDER_HELP = '`{user}` `{mention}` `{username}` `{server}` `{membercount}` `{channel}` `{args}` `{arg1}` `{random:a|b|c}` `{date}`';
const NAME_RE = /^[a-z0-9_-]{1,32}$/;

module.exports = { render, PLACEHOLDER_HELP, NAME_RE };
