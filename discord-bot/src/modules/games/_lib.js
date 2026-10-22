'use strict';
/** Shared helpers for games: per-channel locks, win/loss stats, collector guards. */
const db = require('../../core/db');

const active = new Map(); // `${type}:${channelId}` -> started at
const LOCK_TTL = 15 * 60 * 1000; // a crashed game can never block a channel for longer than this

/** Claim a game slot in this channel. Returns a release() function, or null if one is running. */
function claim(ctx, type) {
  const key = `${type}:${ctx.channel?.id || ctx.author.id}`;
  const started = active.get(key);
  if (started && Date.now() - started < LOCK_TTL) return null;
  active.set(key, Date.now());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active.delete(key);
  };
}

const STATS_DEFAULT = { wins: {}, losses: {}, draws: {}, played: {}, best: {} };
const statKey = (guildId, userId) => `${guildId || 'dm'}:${userId}`;

/** result: 'win' | 'loss' | 'draw' | 'play' */
function record(guildId, userId, game, result = 'play') {
  if (!userId) return;
  db.update(
    'gamestats',
    statKey(guildId, userId),
    (s) => {
      s.played[game] = (s.played[game] || 0) + 1;
      if (result === 'win') s.wins[game] = (s.wins[game] || 0) + 1;
      if (result === 'loss') s.losses[game] = (s.losses[game] || 0) + 1;
      if (result === 'draw') s.draws[game] = (s.draws[game] || 0) + 1;
    },
    STATS_DEFAULT,
  );
}

/** Save a high score; returns true when it's a new personal best. */
function setBest(guildId, userId, game, score, lowerIsBetter = false) {
  let isBest = false;
  db.update(
    'gamestats',
    statKey(guildId, userId),
    (s) => {
      const prev = s.best[game];
      if (prev === undefined || (lowerIsBetter ? score < prev : score > prev)) {
        s.best[game] = score;
        isBest = true;
      }
    },
    STATS_DEFAULT,
  );
  return isBest;
}

function getStats(guildId, userId) {
  return db.get('gamestats', statKey(guildId, userId), STATS_DEFAULT);
}

/** Message collector in the command's channel (null if the channel can't collect). */
function messageCollector(ctx, opts) {
  if (typeof ctx.channel?.createMessageCollector !== 'function') return null;
  return ctx.channel.createMessageCollector(opts);
}

/**
 * Typed games read chat messages, which needs the Message Content intent in servers.
 * Returns an error string when that can't work, else null.
 */
function typedGameProblem(ctx) {
  if (ctx.guild && ctx.client.privileged === false) {
    return 'This game reads chat messages, which needs the **Message Content Intent** (enable it in the Developer Portal → Bot).';
  }
  if (typeof ctx.channel?.createMessageCollector !== 'function') return 'Games are not supported in this channel.';
  return null;
}

const normalize = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Replace the components of a message with disabled copies. */
function disableAll(components = []) {
  return components.map((r) => {
    const json = typeof r.toJSON === 'function' ? r.toJSON() : r;
    return { ...json, components: (json.components || []).map((c) => ({ ...c, disabled: true })) };
  });
}

module.exports = { claim, record, setBest, getStats, messageCollector, typedGameProblem, normalize, disableAll, STATS_DEFAULT };
