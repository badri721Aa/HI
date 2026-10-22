'use strict';
/**
 * A curated directory of 30 well-known, Discord-verified public bots — each one
 * covers a different job. Bots cannot add other bots to a server (Discord only
 * lets a human with "Manage Server" authorize a bot), so this gives admins
 * one-click links to each bot's official site / listing instead.
 */
const { meta } = require('../../core/categories');
const { chunk } = require('../../core/utils');
const { paginate, button, row } = require('../../core/ui');

const BOTS = [
  { name: 'MEE6', emoji: '📈', niche: 'Leveling & rank cards', site: 'https://mee6.xyz', about: 'XP, level-up rewards, rank cards and a web dashboard.' },
  { name: 'Dyno', emoji: '🛡️', niche: 'Moderation & automod', site: 'https://dyno.gg', about: 'Automod, mod logs, timed bans/mutes, custom commands.' },
  { name: 'Carl-bot', emoji: '🎭', niche: 'Reaction roles & logging', site: 'https://carl.gg', about: 'Reaction/button roles, detailed logs, tags and embeds.' },
  { name: 'Dank Memer', emoji: '🐸', niche: 'Meme economy game', site: 'https://dankmemer.lol', about: 'Huge currency game with items, pets, events and memes.' },
  { name: 'ProBot', emoji: '🖼️', niche: 'Welcome images', site: 'https://probot.io', about: 'Custom welcome images, protection and auto-responders.' },
  { name: 'Wick', emoji: '🧱', niche: 'Anti-nuke & anti-raid', site: 'https://wickbot.com', about: 'Stops rogue admins and raid waves with strict security.' },
  { name: 'Ticket Tool', emoji: '🎫', niche: 'Support tickets', site: 'https://tickettool.xyz', about: 'Ticket panels, transcripts, claim system and forms.' },
  { name: 'YAGPDB', emoji: '🧩', niche: 'Custom commands & automation', site: 'https://yagpdb.xyz', about: 'Scriptable custom commands, feeds and role menus.' },
  { name: 'Statbot', emoji: '📊', niche: 'Server analytics', site: 'https://statbot.net', about: 'Message/voice activity graphs and member growth stats.' },
  { name: 'DISBOARD', emoji: '📣', niche: 'Server listing & bumping', site: 'https://disboard.org', about: 'List your server publicly and /bump it to grow.' },
  { name: 'GiveawayBot', emoji: '🎉', niche: 'Giveaways', site: 'https://giveawaybot.party', about: 'Simple, reliable giveaways with timers and rerolls.' },
  { name: 'Pokétwo', emoji: '🐾', niche: 'Pokémon catching', site: 'https://poketwo.net', about: 'Catch, trade and battle Pokémon that spawn in chat.' },
  { name: 'OwO', emoji: '🏹', niche: 'Hunting & battling RPG', site: 'https://owobot.com', about: 'Hunt animals, build teams and battle other users.' },
  { name: 'Karuta', emoji: '🃏', niche: 'Card collecting', site: 'https://karuta.com', about: 'Collect and trade anime character cards from drops.' },
  { name: 'Sesh', emoji: '📅', niche: 'Event scheduling', site: 'https://sesh.fyi', about: 'Events, RSVPs, reminders and calendar sync.' },
  { name: 'Jockie Music', emoji: '🎵', niche: 'Music', site: 'https://www.jockiemusic.com', about: 'Music bot you can run as several instances at once.' },
  { name: 'Craig', emoji: '🎙️', niche: 'Voice recording', site: 'https://craig.chat', about: 'Multi-track voice-channel recording (with consent notice).' },
  { name: 'Midjourney', emoji: '🎨', niche: 'AI image generation', site: 'https://www.midjourney.com', about: 'Generate images from text prompts (subscription).' },
  { name: 'Xenon', emoji: '💾', niche: 'Server backups & templates', site: 'https://xenon.bot', about: 'Back up and restore channels, roles and settings.' },
  { name: 'Bloxlink', emoji: '🧱', niche: 'Roblox verification', site: 'https://blox.link', about: 'Link Roblox accounts and sync group ranks to roles.' },
  { name: 'Tupperbox', emoji: '🎭', niche: 'Roleplay character proxies', site: 'https://tupperbox.app', about: 'Speak as characters with their own names and avatars.' },
  { name: 'Double Counter', emoji: '🕵️', niche: 'Alt-account detection', site: 'https://doublecounter.gg', about: 'Verification that blocks alt and ban-evading accounts.' },
  { name: 'Server Stats', emoji: '🔢', niche: 'Member-count channels', site: 'https://serverstatsbot.com', about: 'Live counter channels for members, bots, boosts…' },
  { name: 'UnbelievaBoat', emoji: '🏦', niche: 'Server-run economy', site: 'https://unbelievaboat.com', about: 'Fully configurable economy, store and income roles.' },
  { name: 'Reminder Bot', emoji: '⏰', niche: 'Reminders & timers', site: 'https://reminder-bot.com', about: 'Repeating reminders, timers and to-do lists.' },
  { name: 'Raid-Helper', emoji: '⚔️', niche: 'MMO raid sign-ups', site: 'https://raid-helper.dev', about: 'Sign-up sheets and comps for raids and game events.' },
  { name: 'Tatsu', emoji: '🐟', niche: 'Profiles, pets & fishing', site: 'https://tatsu.gg', about: 'Profile cards, global XP, pets and mini-games.' },
  { name: 'Zeppelin', emoji: '🚨', niche: 'Advanced moderation (large servers)', site: 'https://zeppelin.gg', about: 'Config-as-code moderation used by big communities.' },
  { name: 'Captcha.bot', emoji: '🤖', niche: 'Captcha verification gate', site: 'https://captcha.bot', about: 'New members solve a captcha before seeing the server.' },
  { name: 'Loritta', emoji: '🌎', niche: 'Multipurpose (PT/EN)', site: 'https://loritta.website', about: 'Popular multipurpose bot with economy and fun.' },
];

const topgg = (name) => `https://top.gg/search?q=${encodeURIComponent(name)}`;

function pageFor(ctx, group, index, total) {
  return {
    embeds: [
      ctx.embed({
        title: '🌟 30 verified bots — each does something different',
        description:
          'Every bot below is a **Discord-verified** public bot. Bots cannot add other bots — a server admin clicks the link and authorizes it on Discord.\n​',
        fields: group.map((b, i) => ({
          name: `${index * 5 + i + 1}. ${b.emoji} ${b.name} — ${b.niche}`,
          value: `${b.about}\n[Website](${b.site}) • [top.gg](${topgg(b.name)})`,
        })),
        footer: `Page ${index + 1}/${total} • ${ctx.prefix}findbot <name or job> to search`,
      }),
    ],
    components: [row(...group.map((b) => button(b.site, b.name, 'Link')))],
  };
}

module.exports = [
  {
    name: 'bots',
    aliases: ['botdirectory', 'topbots', 'bestbots'],
    description: 'Directory of 30 verified bots, each for a different job, with invite links',
    slash: true,
    args: [],
    async execute(ctx) {
      const groups = chunk(BOTS, 5);
      await paginate(ctx, groups.map((g, i) => pageFor(ctx, g, i, groups.length)));
    },
  },
  {
    name: 'findbot',
    description: 'Search the verified-bot directory by name or job',
    usage: '<name | job>',
    examples: ['music', 'tickets', 'mee6'],
    minArgs: 1,
    async execute(ctx) {
      const q = ctx.rest(0).toLowerCase();
      const hits = BOTS.filter((b) => `${b.name} ${b.niche} ${b.about}`.toLowerCase().includes(q));
      if (!hits.length) return ctx.fail(`No bot in the directory matches \`${q}\`. Try \`${ctx.prefix}bots\`.`);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🔎 ${hits.length} match${hits.length === 1 ? '' : 'es'}`,
            fields: hits.slice(0, 10).map((b) => ({ name: `${b.emoji} ${b.name} — ${b.niche}`, value: `${b.about}\n[Website](${b.site}) • [top.gg](${topgg(b.name)})` })),
          }),
        ],
        components: [row(...hits.slice(0, 5).map((b) => button(b.site, b.name, 'Link')))],
      });
    },
  },
  {
    name: 'botteam',
    description: 'List the bot accounts running from this same program and what each one does',
    async execute(ctx) {
      const { registry } = ctx;
      const siblings = (ctx.client.siblings?.() || [ctx.client]).filter((c) => c.user);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🤝 ${siblings.length} bot${siblings.length === 1 ? '' : 's'} on this team`,
            fields: siblings.slice(0, 25).map((c) => {
              const p = c.botProfile;
              const mods = p.modules === 'all' ? [...registry.categories.keys()] : ['core', ...p.modules];
              const count = mods.reduce((n, m) => n + (registry.categories.get(m)?.length || 0), 0);
              return {
                name: `${c.user.username} (${p.name}) — prefix \`${p.prefix}\``,
                value: `${count} commands • ${p.modules === 'all' ? 'all modules' : p.modules.map((m) => `${meta(m).emoji} ${m}`).join(', ')}`,
              };
            }),
          }),
        ],
      });
    },
  },
];

module.exports.BOTS = BOTS;
