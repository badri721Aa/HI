'use strict';

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const truncate = (str, n) => {
  const s = String(str ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

const formatNumber = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

const UNITS = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000 };

/** "1h30m", "10m", "2d", "45s", "1w" -> milliseconds (null if invalid). Bare numbers are minutes. */
function parseDuration(input) {
  if (input === undefined || input === null) return null;
  const str = String(input).toLowerCase().trim();
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str) * UNITS.m);
  const re = /(\d+(?:\.\d+)?)\s*(w(?:eeks?)?|d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)/g;
  let total = 0;
  let matched = '';
  let m;
  while ((m = re.exec(str))) {
    total += parseFloat(m[1]) * UNITS[m[2][0]];
    matched += m[0];
  }
  if (!total || matched.replace(/\s/g, '').length !== str.replace(/\s/g, '').length) return null;
  return Math.round(total);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const parts = [];
  for (const [unit, size] of [['d', 86400000], ['h', 3600000], ['m', 60000], ['s', 1000]]) {
    const v = Math.floor(ms / size);
    if (v) parts.push(`${v}${unit}`);
    ms %= size;
  }
  return parts.join(' ') || '0s';
}

/** fetch() JSON with a timeout and a readable error. */
async function fetchJson(url, { timeout = 10000, headers = {}, ...rest } = {}) {
  const res = await fetch(url, {
    ...rest,
    headers: { 'User-Agent': 'MegaDiscordBot/1.0 (+https://github.com)', Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchText(url, { timeout = 10000, headers = {}, ...rest } = {}) {
  const res = await fetch(url, {
    ...rest,
    headers: { 'User-Agent': 'MegaDiscordBot/1.0', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

/** Replace {placeholders} for welcome/level/etc. templates. */
function template(str, vars) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

const discordTimestamp = (date, style = 'R') => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

/** Parse "yes/no/on/off/true/false/enable/disable" -> boolean | null */
function parseToggle(v) {
  const s = String(v ?? '').toLowerCase();
  if (['on', 'yes', 'true', 'enable', 'enabled', '1'].includes(s)) return true;
  if (['off', 'no', 'false', 'disable', 'disabled', '0'].includes(s)) return false;
  return null;
}

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

module.exports = {
  randInt,
  pick,
  clamp,
  sleep,
  shuffle,
  chunk,
  truncate,
  formatNumber,
  parseDuration,
  formatDuration,
  fetchJson,
  fetchText,
  template,
  discordTimestamp,
  parseToggle,
  ordinal,
};
