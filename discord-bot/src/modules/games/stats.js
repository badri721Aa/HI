'use strict';
const db = require('../../core/db');
const { getStats } = require('./_lib');

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const BEST_LABELS = {
  wordle: (v) => `Wordle: ${v}/6 guesses`,
  typerace_wpm: (v) => `Typing: ${v} WPM`,
  reaction_ms: (v) => `Reaction: ${v} ms`,
  '2048': (v) => `2048: ${v} points`,
  lightsout: (v) => `Lights Out: ${v} moves`,
  simon: (v) => `Simon: ${v} rounds`,
  higherlower: (v) => `Higher/Lower: ${v} streak`,
};

module.exports = [
  {
    name: 'gamestats',
    aliases: ['gstats', 'gameprofile'],
    description: 'See your (or someone\'s) game wins, losses and best scores',
    usage: '[@user]',
    examples: [''],
    async execute(ctx) {
      const u = await ctx.targetUser(0);
      const s = getStats(ctx.guild?.id, u.id);
      const games = [...new Set([...Object.keys(s.played), ...Object.keys(s.wins)])].sort();
      if (!games.length) return ctx.info(`**${u.username}** hasn't played any games yet. Try \`${ctx.prefix}trivia\` or \`${ctx.prefix}tictactoe\`!`);
      const lines = games.map((g) => `**${g}** — ${s.wins[g] || 0}W / ${s.losses[g] || 0}L${s.draws[g] ? ` / ${s.draws[g]}D` : ''} (${s.played[g] || 0} played)`);
      const bests = Object.entries(s.best || {}).map(([k, v]) => (BEST_LABELS[k] ? BEST_LABELS[k](v) : `${k}: ${v}`));
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🎮 Game stats — ${u.username}`,
            thumbnail: u.displayAvatarURL?.(),
            description: lines.join('\n').slice(0, 3500),
            fields: [
              { name: 'Total wins', value: String(sum(s.wins)), inline: true },
              { name: 'Games played', value: String(sum(s.played)), inline: true },
              { name: 'Personal bests', value: bests.join('\n') || '—' },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'gamelb',
    aliases: ['gameleaderboard', 'gametop'],
    description: 'Server leaderboard of game wins (optionally for one game)',
    usage: '[game]',
    examples: ['', 'trivia'],
    guildOnly: true,
    async execute(ctx) {
      const game = ctx.args[0]?.toLowerCase();
      const prefix = `${ctx.guild.id}:`;
      const rows = db
        .entries('gamestats')
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, s]) => ({ id: k.slice(prefix.length), wins: game ? s.wins?.[game] || 0 : sum(s.wins) }))
        .filter((r) => r.wins > 0)
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 10);
      if (!rows.length) return ctx.info(game ? `Nobody has won **${game}** yet.` : 'Nobody has won any games yet!');
      const medals = ['🥇', '🥈', '🥉'];
      await ctx.reply({
        embeds: [ctx.embed({ title: `🏆 Game leaderboard${game ? ` — ${game}` : ''}`, description: rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.id}> — ${r.wins} win${r.wins === 1 ? '' : 's'}`).join('\n') })],
        allowedMentions: { parse: [] },
      });
    },
  },
];
