'use strict';
/**
 * Shared economy helpers (also used by gambling, leveling and social).
 * Accounts are per guild: collection "economy", key `${guildId}:${userId}`.
 */
const db = require('../../core/db');
const { formatNumber, discordTimestamp } = require('../../core/utils');

const SETTINGS_DEFAULTS = {
  currency: '🪙',
  currencyName: 'coins',
  startBalance: 500,
  baseBankCap: 25000,
  dailyAmount: 1000,
  weeklyAmount: 7500,
  monthlyAmount: 30000,
  minBet: 10,
  maxBet: 500000,
  robEnabled: true,
  robMin: 500,
  lotteryTicketPrice: 100,
};

const ACCOUNT_DEFAULTS = {
  wallet: 0,
  bank: 0,
  bankCap: 0,
  cooldowns: {},
  streak: 0,
  inventory: {},
  effects: {},
  job: null,
  shifts: 0,
  farm: [],
  stats: {
    earned: 0,
    spent: 0,
    gambled: 0,
    gambleWon: 0,
    gambleLost: 0,
    gamesPlayed: 0,
    biggestWin: 0,
    robbed: 0,
    timesRobbed: 0,
    caught: 0,
    giftsGiven: 0,
  },
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const COOLDOWNS = {
  daily: DAY,
  weekly: 7 * DAY,
  monthly: 30 * DAY,
  work: 30 * MINUTE,
  beg: 45 * 1000,
  crime: 5 * MINUTE,
  rob: 10 * MINUTE,
  search: 30 * 1000,
  postmeme: 60 * 1000,
  scavenge: 2 * MINUTE,
  fish: 45 * 1000,
  hunt: 60 * 1000,
  mine: 60 * 1000,
  dig: 45 * 1000,
  chop: 45 * 1000,
  interest: DAY,
};

const key = (guildId, userId) => `${guildId}:${userId}`;

function settings(guildId) {
  return db.section(guildId, 'economy', SETTINGS_DEFAULTS);
}

/** Live account (created with the guild's starting balance on first use). */
function account(guildId, userId) {
  const k = key(guildId, userId);
  const isNew = !db.has('economy', k);
  const acc = db.ensure('economy', k, ACCOUNT_DEFAULTS);
  if (isNew) {
    const s = settings(guildId);
    acc.wallet = Math.max(0, Math.floor(s.startBalance));
    acc.bankCap = s.baseBankCap;
    db.save();
  }
  if (!acc.bankCap) acc.bankCap = settings(guildId).baseBankCap;
  return acc;
}

/** Read-only peek (null if the user never used the economy). */
const peek = (guildId, userId) => db.get('economy', key(guildId, userId), null);

/** All accounts in a guild as [userId, account]. */
function guildAccounts(guildId) {
  const p = `${guildId}:`;
  return db.entries('economy').filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v]);
}

function money(guildId, n) {
  return `${settings(guildId).currency} **${formatNumber(Math.floor(n))}**`;
}

/**
 * "all", "max", "half", "50%", "10k", "1.5m", "2b", "1,000" -> integer (or null).
 * `available` is what "all"/"half"/"%" are relative to.
 */
function parseAmount(input, available = 0) {
  if (input === undefined || input === null) return null;
  const s = String(input).toLowerCase().replace(/[,_\s]/g, '');
  if (['all', 'max', 'everything'].includes(s)) return Math.max(0, Math.floor(available));
  if (s === 'half') return Math.max(0, Math.floor(available / 2));
  const pct = s.match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) return Math.max(0, Math.floor((available * Math.min(100, parseFloat(pct[1]))) / 100));
  const m = s.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!m) return null;
  const n = Math.floor(parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1));
  return Number.isSafeInteger(n) ? n : null;
}

function cooldownLeft(acc, name, ms = COOLDOWNS[name]) {
  const last = acc.cooldowns?.[name] || 0;
  return Math.max(0, last + ms - Date.now());
}

function setCooldown(acc, name) {
  acc.cooldowns[name] = Date.now();
  db.save();
}

/** Replies and returns true when the command is still cooling down. */
async function onCooldown(ctx, acc, name, ms = COOLDOWNS[name]) {
  const left = cooldownLeft(acc, name, ms);
  if (!left) return false;
  await ctx.fail(`You can use \`${name}\` again ${discordTimestamp(Date.now() + left, 'R')}.`);
  return true;
}

function earn(acc, n) {
  const v = Math.max(0, Math.floor(n));
  acc.wallet += v;
  acc.stats.earned += v;
  db.save();
  return v;
}

/** Takes up to n from the wallet (never below 0); returns what was taken. */
function take(acc, n) {
  const v = Math.min(acc.wallet, Math.max(0, Math.floor(n)));
  acc.wallet -= v;
  db.save();
  return v;
}

function growBank(acc, n) {
  acc.bankCap += Math.max(0, Math.floor(n));
  db.save();
}

const itemCount = (acc, id) => acc.inventory[id] || 0;

function addItem(acc, id, n = 1) {
  acc.inventory[id] = (acc.inventory[id] || 0) + n;
  db.save();
}

function removeItem(acc, id, n = 1) {
  if ((acc.inventory[id] || 0) < n) return false;
  acc.inventory[id] -= n;
  if (acc.inventory[id] <= 0) delete acc.inventory[id];
  db.save();
  return true;
}

const hasEffect = (acc, name) => (acc.effects?.[name] || 0) > Date.now();
const luck = (acc) => (hasEffect(acc, 'luck') ? 0.1 : 0);

function networth(acc, items) {
  let inv = 0;
  for (const [id, n] of Object.entries(acc.inventory || {})) inv += (items[id]?.sell || 0) * n;
  return { wallet: acc.wallet, bank: acc.bank, items: inv, total: acc.wallet + acc.bank + inv };
}

module.exports = {
  SETTINGS_DEFAULTS,
  ACCOUNT_DEFAULTS,
  COOLDOWNS,
  MINUTE,
  HOUR,
  DAY,
  key,
  settings,
  account,
  peek,
  guildAccounts,
  money,
  parseAmount,
  cooldownLeft,
  setCooldown,
  onCooldown,
  earn,
  take,
  growBank,
  itemCount,
  addItem,
  removeItem,
  hasEffect,
  luck,
  networth,
};
