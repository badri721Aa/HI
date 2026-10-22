'use strict';
/**
 * Time-zone and natural-ish date parsing shared by remind, timestamp, time, countdown…
 * Zones are { id: 'Europe/London', label } (IANA) or { offset: minutes, label } (fixed).
 */
const { parseDuration } = require('../../core/utils');

const CITY_TZ = {
  // Americas
  'new york': 'America/New_York', nyc: 'America/New_York', boston: 'America/New_York', miami: 'America/New_York', atlanta: 'America/New_York',
  washington: 'America/New_York', philadelphia: 'America/New_York', detroit: 'America/Detroit', toronto: 'America/Toronto', montreal: 'America/Toronto',
  ottawa: 'America/Toronto', chicago: 'America/Chicago', dallas: 'America/Chicago', houston: 'America/Chicago', austin: 'America/Chicago',
  'mexico city': 'America/Mexico_City', mexico: 'America/Mexico_City', winnipeg: 'America/Winnipeg', denver: 'America/Denver', phoenix: 'America/Phoenix',
  calgary: 'America/Edmonton', edmonton: 'America/Edmonton', 'salt lake city': 'America/Denver', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles', sf: 'America/Los_Angeles', seattle: 'America/Los_Angeles', vancouver: 'America/Vancouver', 'las vegas': 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles', portland: 'America/Los_Angeles', anchorage: 'America/Anchorage', alaska: 'America/Anchorage', honolulu: 'Pacific/Honolulu',
  hawaii: 'Pacific/Honolulu', halifax: 'America/Halifax', "st john's": 'America/St_Johns', havana: 'America/Havana', bogota: 'America/Bogota',
  lima: 'America/Lima', quito: 'America/Guayaquil', caracas: 'America/Caracas', santiago: 'America/Santiago', 'buenos aires': 'America/Argentina/Buenos_Aires',
  argentina: 'America/Argentina/Buenos_Aires', 'sao paulo': 'America/Sao_Paulo', 'são paulo': 'America/Sao_Paulo', rio: 'America/Sao_Paulo', brazil: 'America/Sao_Paulo',
  'rio de janeiro': 'America/Sao_Paulo', brasilia: 'America/Sao_Paulo', montevideo: 'America/Montevideo', asuncion: 'America/Asuncion', 'la paz': 'America/La_Paz',
  panama: 'America/Panama', 'san juan': 'America/Puerto_Rico', 'puerto rico': 'America/Puerto_Rico', kingston: 'America/Jamaica', jamaica: 'America/Jamaica',
  'guatemala city': 'America/Guatemala', 'san jose': 'America/Costa_Rica', 'costa rica': 'America/Costa_Rica', 'santo domingo': 'America/Santo_Domingo',
  // Europe
  london: 'Europe/London', uk: 'Europe/London', england: 'Europe/London', manchester: 'Europe/London', edinburgh: 'Europe/London', dublin: 'Europe/Dublin',
  ireland: 'Europe/Dublin', lisbon: 'Europe/Lisbon', portugal: 'Europe/Lisbon', madrid: 'Europe/Madrid', spain: 'Europe/Madrid', barcelona: 'Europe/Madrid',
  paris: 'Europe/Paris', france: 'Europe/Paris', brussels: 'Europe/Brussels', amsterdam: 'Europe/Amsterdam', netherlands: 'Europe/Amsterdam',
  berlin: 'Europe/Berlin', germany: 'Europe/Berlin', munich: 'Europe/Berlin', frankfurt: 'Europe/Berlin', hamburg: 'Europe/Berlin', zurich: 'Europe/Zurich',
  geneva: 'Europe/Zurich', switzerland: 'Europe/Zurich', vienna: 'Europe/Vienna', austria: 'Europe/Vienna', rome: 'Europe/Rome', italy: 'Europe/Rome',
  milan: 'Europe/Rome', prague: 'Europe/Prague', warsaw: 'Europe/Warsaw', poland: 'Europe/Warsaw', budapest: 'Europe/Budapest', copenhagen: 'Europe/Copenhagen',
  denmark: 'Europe/Copenhagen', oslo: 'Europe/Oslo', norway: 'Europe/Oslo', stockholm: 'Europe/Stockholm', sweden: 'Europe/Stockholm', helsinki: 'Europe/Helsinki',
  finland: 'Europe/Helsinki', tallinn: 'Europe/Tallinn', riga: 'Europe/Riga', vilnius: 'Europe/Vilnius', athens: 'Europe/Athens', greece: 'Europe/Athens',
  bucharest: 'Europe/Bucharest', romania: 'Europe/Bucharest', sofia: 'Europe/Sofia', belgrade: 'Europe/Belgrade', zagreb: 'Europe/Zagreb', kyiv: 'Europe/Kyiv',
  kiev: 'Europe/Kyiv', ukraine: 'Europe/Kyiv', minsk: 'Europe/Minsk', moscow: 'Europe/Moscow', russia: 'Europe/Moscow', 'st petersburg': 'Europe/Moscow',
  istanbul: 'Europe/Istanbul', turkey: 'Europe/Istanbul', ankara: 'Europe/Istanbul', reykjavik: 'Atlantic/Reykjavik', iceland: 'Atlantic/Reykjavik',
  // Africa & Middle East
  cairo: 'Africa/Cairo', egypt: 'Africa/Cairo', lagos: 'Africa/Lagos', nigeria: 'Africa/Lagos', accra: 'Africa/Accra', nairobi: 'Africa/Nairobi',
  kenya: 'Africa/Nairobi', 'addis ababa': 'Africa/Addis_Ababa', johannesburg: 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg', 'south africa': 'Africa/Johannesburg',
  casablanca: 'Africa/Casablanca', morocco: 'Africa/Casablanca', algiers: 'Africa/Algiers', tunis: 'Africa/Tunis', khartoum: 'Africa/Khartoum',
  dubai: 'Asia/Dubai', uae: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', riyadh: 'Asia/Riyadh', 'saudi arabia': 'Asia/Riyadh', jeddah: 'Asia/Riyadh', mecca: 'Asia/Riyadh',
  makkah: 'Asia/Riyadh', medina: 'Asia/Riyadh', doha: 'Asia/Qatar', qatar: 'Asia/Qatar', kuwait: 'Asia/Kuwait', bahrain: 'Asia/Bahrain', muscat: 'Asia/Muscat',
  oman: 'Asia/Muscat', tehran: 'Asia/Tehran', iran: 'Asia/Tehran', baghdad: 'Asia/Baghdad', iraq: 'Asia/Baghdad', amman: 'Asia/Amman', jordan: 'Asia/Amman',
  beirut: 'Asia/Beirut', damascus: 'Asia/Damascus', jerusalem: 'Asia/Jerusalem', 'tel aviv': 'Asia/Jerusalem', gaza: 'Asia/Gaza', palestine: 'Asia/Gaza',
  // Asia & Oceania
  karachi: 'Asia/Karachi', pakistan: 'Asia/Karachi', lahore: 'Asia/Karachi', islamabad: 'Asia/Karachi', kabul: 'Asia/Kabul', delhi: 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata', mumbai: 'Asia/Kolkata', india: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', chennai: 'Asia/Kolkata',
  kathmandu: 'Asia/Kathmandu', nepal: 'Asia/Kathmandu', dhaka: 'Asia/Dhaka', bangladesh: 'Asia/Dhaka', colombo: 'Asia/Colombo', tashkent: 'Asia/Tashkent',
  almaty: 'Asia/Almaty', bangkok: 'Asia/Bangkok', thailand: 'Asia/Bangkok', hanoi: 'Asia/Ho_Chi_Minh', 'ho chi minh': 'Asia/Ho_Chi_Minh', vietnam: 'Asia/Ho_Chi_Minh',
  jakarta: 'Asia/Jakarta', indonesia: 'Asia/Jakarta', bali: 'Asia/Makassar', 'kuala lumpur': 'Asia/Kuala_Lumpur', malaysia: 'Asia/Kuala_Lumpur',
  singapore: 'Asia/Singapore', manila: 'Asia/Manila', philippines: 'Asia/Manila', 'hong kong': 'Asia/Hong_Kong', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai',
  china: 'Asia/Shanghai', shenzhen: 'Asia/Shanghai', taipei: 'Asia/Taipei', taiwan: 'Asia/Taipei', seoul: 'Asia/Seoul', korea: 'Asia/Seoul', 'south korea': 'Asia/Seoul',
  tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', osaka: 'Asia/Tokyo', perth: 'Australia/Perth', darwin: 'Australia/Darwin', adelaide: 'Australia/Adelaide',
  brisbane: 'Australia/Brisbane', sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', canberra: 'Australia/Sydney', australia: 'Australia/Sydney',
  hobart: 'Australia/Hobart', auckland: 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland', wellington: 'Pacific/Auckland', fiji: 'Pacific/Fiji',
};

const ABBR_TZ = {
  utc: { offset: 0, label: 'UTC' }, gmt: { offset: 0, label: 'GMT' }, z: { offset: 0, label: 'UTC' },
  est: 'America/New_York', edt: 'America/New_York', et: 'America/New_York', eastern: 'America/New_York',
  cst: 'America/Chicago', cdt: 'America/Chicago', ct: 'America/Chicago', central: 'America/Chicago',
  mst: 'America/Denver', mdt: 'America/Denver', mt: 'America/Denver', mountain: 'America/Denver',
  pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles', pt: 'America/Los_Angeles', pacific: 'America/Los_Angeles',
  akst: 'America/Anchorage', hst: 'Pacific/Honolulu', ast: 'America/Halifax', brt: 'America/Sao_Paulo', art: 'America/Argentina/Buenos_Aires',
  bst: 'Europe/London', wet: 'Europe/Lisbon', cet: 'Europe/Paris', cest: 'Europe/Paris', eet: 'Europe/Athens', eest: 'Europe/Athens',
  msk: 'Europe/Moscow', trt: 'Europe/Istanbul', sast: 'Africa/Johannesburg', eat: 'Africa/Nairobi', wat: 'Africa/Lagos', gst: 'Asia/Dubai',
  pkt: 'Asia/Karachi', ist: 'Asia/Kolkata', npt: 'Asia/Kathmandu', ict: 'Asia/Bangkok', wib: 'Asia/Jakarta', sgt: 'Asia/Singapore', hkt: 'Asia/Hong_Kong',
  pht: 'Asia/Manila', kst: 'Asia/Seoul', jst: 'Asia/Tokyo', awst: 'Australia/Perth', acst: 'Australia/Adelaide', aest: 'Australia/Sydney',
  aedt: 'Australia/Sydney', nzst: 'Pacific/Auckland', nzdt: 'Pacific/Auckland',
};

const UTC = { offset: 0, label: 'UTC' };

function validIana(id) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

let ALL_ZONES = null;
const allZones = () => (ALL_ZONES ??= Intl.supportedValuesOf('timeZone'));

/**
 * Resolve a zone from text. `cities: false` restricts to abbreviations, offsets and IANA ids
 * (used by remind, where a city name could be the start of the reminder text).
 */
function resolveZone(input, { cities = true } = {}) {
  if (!input) return null;
  const q = String(input).toLowerCase().trim().replace(/\s+/g, ' ').replace(/_/g, ' ');
  const off = q.match(/^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);
  if (off) {
    const mins = (parseInt(off[2], 10) * 60 + parseInt(off[3] || '0', 10)) * (off[1] === '-' ? -1 : 1);
    if (Math.abs(mins) > 14 * 60) return null;
    return { offset: mins, label: `UTC${formatOffset(mins)}` };
  }
  const abbr = ABBR_TZ[q];
  if (abbr) return typeof abbr === 'string' ? { id: abbr, label: `${q.toUpperCase()} (${abbr})` } : abbr;
  if (cities && CITY_TZ[q]) return { id: CITY_TZ[q], label: titleCase(q) };
  if (String(input).includes('/') && validIana(String(input).trim())) return { id: String(input).trim(), label: String(input).trim() };
  const iana = allZones().find((z) => z.toLowerCase() === q.replace(/ /g, '_') || z.toLowerCase().replace(/_/g, ' ') === q);
  if (iana) return { id: iana, label: iana };
  if (cities) {
    const city = allZones().find((z) => z.toLowerCase().split('/').pop().replace(/_/g, ' ') === q);
    if (city) return { id: city, label: titleCase(q) };
  }
  return null;
}

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function formatOffset(mins) {
  const sign = mins < 0 ? '-' : '+';
  const a = Math.abs(mins);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** Minutes the zone is ahead of UTC at a given instant. */
function zoneOffset(date, zone) {
  if (!zone || zone.offset !== undefined) return zone?.offset || 0;
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone.id, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Wall-clock time in a zone -> real Date. */
function zonedDate(y, mo, d, h, mi, zone) {
  const guess = Date.UTC(y, mo, d, h, mi);
  const o1 = zoneOffset(new Date(guess), zone);
  let t = guess - o1 * 60000;
  const o2 = zoneOffset(new Date(t), zone);
  if (o2 !== o1) t = guess - o2 * 60000;
  return new Date(t);
}

/** Wall-clock parts of `date` in `zone`. */
function wallParts(date, zone) {
  const shifted = new Date(date.getTime() + zoneOffset(date, zone) * 60000);
  return { y: shifted.getUTCFullYear(), mo: shifted.getUTCMonth(), d: shifted.getUTCDate(), h: shifted.getUTCHours(), mi: shifted.getUTCMinutes(), dow: shifted.getUTCDay() };
}

function formatInZone(date, zone, opts = { dateStyle: 'full', timeStyle: 'short' }) {
  if (zone.id) return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone.id }).format(date);
  const shifted = new Date(date.getTime() + zone.offset * 60000);
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(shifted);
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthIndex = (w) => {
  const s = String(w).toLowerCase().replace(/\.$/, '');
  if (s.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(s) && (s.length >= 3));
};

/** "18:00", "6pm", "6:30pm", "noon", "midnight" -> { h, mi } */
function parseClock(word) {
  const w = String(word).toLowerCase();
  if (w === 'noon') return { h: 12, mi: 0 };
  if (w === 'midnight') return { h: 0, mi: 0 };
  let m = w.match(/^(\d{1,2}):(\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) return { h: +m[1], mi: +m[2] };
  m = w.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)$/);
  if (m && +m[1] >= 1 && +m[1] <= 12 && (!m[2] || +m[2] < 60)) {
    let h = +m[1] % 12;
    if (m[3].startsWith('p')) h += 12;
    return { h, mi: +(m[2] || 0) };
  }
  return null;
}

/** "2026-12-25", "2026/12/25", "dec 25 [2026]", "25 dec [2026]" starting at words[i] -> { y?, mo, d, used } */
function parseCalendarDate(words, i) {
  const w = String(words[i] || '').toLowerCase();
  let m = w.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3], used: 1 };
  const mi1 = monthIndex(w);
  if (mi1 >= 0 && /^\d{1,2}(st|nd|rd|th)?,?$/.test(words[i + 1] || '')) {
    const d = parseInt(words[i + 1], 10);
    const y = /^\d{4}$/.test(words[i + 2] || '') ? +words[i + 2] : undefined;
    return { y, mo: mi1, d, used: y ? 3 : 2 };
  }
  m = w.match(/^(\d{1,2})(st|nd|rd|th)?$/);
  if (m && monthIndex(words[i + 1] || '') >= 0) {
    const y = /^\d{4}$/.test(words[i + 2] || '') ? +words[i + 2] : undefined;
    return { y, mo: monthIndex(words[i + 1]), d: +m[1], used: y ? 3 : 2 };
  }
  return null;
}

/**
 * Parse a point in time from the start of `words`.
 * Supports durations ("10m", "2h 30m", "in 5 minutes"), "tomorrow 9am", "18:00", "9pm EST",
 * "2026-12-25 18:00 UTC", "dec 25", unix timestamps and ISO strings.
 * Returns { date, used, zone } or null. Times without a zone use `zone` (default UTC).
 */
function parseWhen(words, { now = Date.now(), zone = UTC, cities = false } = {}) {
  let i = 0;
  if (/^(in|at|on)$/i.test(words[0] || '')) i = 1;

  // Durations: greedily join words while they still form a valid duration.
  let best = null;
  for (let j = i + 1; j <= Math.min(words.length, i + 6); j++) {
    const ms = parseDuration(words.slice(i, j).join(''));
    if (ms && !/^\d+$/.test(words.slice(i, j).join(''))) best = { ms, used: j };
    else if (ms && j === i + 1 && words.length === 1) best = { ms, used: j };
  }
  if (best && best.ms > 0) return { date: new Date(now + best.ms), used: best.used, zone, relative: true };

  const first = String(words[i] || '');
  if (/^\d{10}$|^\d{13}$/.test(first)) return { date: new Date(first.length === 10 ? +first * 1000 : +first), used: i + 1, zone };
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/i.test(first)) {
    const t = Date.parse(/Z|[+-]\d{2}:?\d{2}$/i.test(first) ? first : `${first}Z`);
    if (!Number.isNaN(t)) return { date: new Date(t), used: i + 1, zone };
  }

  let day = null; // { y, mo, d }
  let dayOffset = 0;
  let k = i;
  if (/^(today|tonight)$/i.test(words[k] || '')) k++;
  else if (/^tomorrow$/i.test(words[k] || '')) {
    dayOffset = 1;
    k++;
  } else {
    const cal = parseCalendarDate(words, k);
    if (cal) {
      day = cal;
      k += cal.used;
    }
  }
  let clock = null;
  if (/^at$/i.test(words[k] || '') && parseClock(words[k + 1] || '')) k++;
  if (words[k] && parseClock(words[k])) clock = parseClock(words[k++]);
  else if (words[k] && /^\d{1,2}$/.test(words[k]) && /^(am|pm)$/i.test(words[k + 1] || '')) {
    clock = parseClock(words[k] + words[k + 1]);
    k += 2;
  }
  if (k === i) return null; // nothing recognised

  let z = zone;
  if (words[k]) {
    const tz = resolveZone(words[k], { cities });
    if (tz) {
      z = tz;
      k++;
    }
  }

  const today = wallParts(new Date(now), z);
  const hm = clock || { h: 0, mi: 0 };
  let date;
  if (day) {
    let y = day.y ?? today.y;
    date = zonedDate(y, day.mo, day.d, hm.h, hm.mi, z);
    if (day.y === undefined && date.getTime() < now - 86400000) date = zonedDate(++y, day.mo, day.d, hm.h, hm.mi, z);
  } else {
    date = zonedDate(today.y, today.mo, today.d + dayOffset, hm.h, hm.mi, z);
    if (!dayOffset && clock && date.getTime() <= now) date = zonedDate(today.y, today.mo, today.d + 1, hm.h, hm.mi, z);
  }
  if (Number.isNaN(date.getTime())) return null;
  return { date, used: k, zone: z };
}

/** Split argument tokens into single words (slash options may hold several). */
const words = (ctx) => ctx.args.flatMap((a) => a.split(/\s+/)).filter(Boolean);

module.exports = { CITY_TZ, ABBR_TZ, UTC, resolveZone, zoneOffset, zonedDate, wallParts, formatInZone, formatOffset, parseWhen, parseClock, parseCalendarDate, words, allZones, MONTHS, monthIndex };
