'use strict';
const { discordTimestamp, formatNumber, truncate } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { getJson, userError, enc, cache } = require('./_http');

const launchCache = cache(15 * 60 * 1000);

async function country(q) {
  const notFound = `No country found for **${q}**.`;
  const lower = q.toLowerCase();
  let list = null;
  if (/^[a-z]{2,3}$/i.test(q)) list = await getJson(`https://restcountries.com/v3.1/alpha/${enc(q)}`, { notFound }).catch(() => null);
  if (!list) list = await getJson(`https://restcountries.com/v3.1/name/${enc(q)}`, { notFound });
  const arr = Array.isArray(list) ? list : [list];
  if (!arr.length || !arr[0]?.name) throw userError(notFound);
  return arr.find((c) => c.name.common.toLowerCase() === lower || c.name.official.toLowerCase() === lower) || arr[0];
}

async function holidaysJson(url, notFound) {
  try {
    const data = await getJson(url, { notFound });
    if (!Array.isArray(data) || !data.length) throw userError(notFound);
    return data;
  } catch (err) {
    if (err instanceof SyntaxError) throw userError(notFound); // empty body for unsupported countries
    throw err;
  }
}

const holidayLine = (h) => `${discordTimestamp(`${h.date}T12:00:00Z`, 'D')} — **${h.name}**${h.localName && h.localName !== h.name ? ` (${h.localName})` : ''}${h.global === false ? ' *(regional)*' : ''}`;

module.exports = [
  {
    name: 'countryinfo',
    aliases: ['nation', 'countryflag'],
    description: 'Facts about a country: capital, population, languages, currency…',
    usage: '<country name or code>',
    examples: ['Japan', 'br', 'united kingdom'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 60);
      await ctx.defer();
      const c = await country(q);
      const currencies = Object.entries(c.currencies || {}).map(([code, v]) => `${v.name} (${code}${v.symbol ? `, ${v.symbol}` : ''})`);
      const calling = c.idd?.root ? `${c.idd.root}${c.idd.suffixes?.length === 1 ? c.idd.suffixes[0] : ''}` : null;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `${c.flag || '🏳️'} ${c.name.common}`,
            description: c.name.official !== c.name.common ? `*${c.name.official}*` : null,
            thumbnail: c.flags?.png,
            fields: [
              { name: 'Capital', value: c.capital?.join(', ') || 'None', inline: true },
              { name: 'Region', value: [c.subregion, c.region].filter(Boolean).join(', ') || '?', inline: true },
              { name: 'Population', value: formatNumber(c.population || 0), inline: true },
              { name: 'Area', value: c.area ? `${formatNumber(c.area)} km²` : null, inline: true },
              { name: 'Languages', value: Object.values(c.languages || {}).join(', ') || null, inline: true },
              { name: 'Currency', value: currencies.join(', ') || null, inline: true },
              { name: 'Codes', value: `${c.cca2} / ${c.cca3}`, inline: true },
              { name: 'Calling code', value: calling, inline: true },
              { name: 'Drives on', value: c.car?.side || null, inline: true },
              { name: 'Time zones', value: c.timezones?.length ? truncate(c.timezones.join(', '), 300) : null, inline: false },
              { name: 'Borders', value: c.borders?.length ? c.borders.join(', ') : 'None (island or isolated)', inline: false },
            ],
            footer: 'Data: REST Countries',
          }),
        ],
        components: c.maps?.googleMaps ? [row(button(c.maps.googleMaps, 'Map', 'Link', '🗺️'))] : [],
      });
    },
  },
  {
    name: 'holidays',
    aliases: ['publicholidays'],
    description: 'Public holidays for a country (2-letter code) and year',
    usage: '<country code> [year]',
    examples: ['US', 'GB 2027', 'DE'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const cc = ctx.args[0].toUpperCase();
      const year = /^\d{4}$/.test(ctx.args[1] || '') ? +ctx.args[1] : new Date().getUTCFullYear();
      if (!/^[A-Z]{2}$/.test(cc)) return ctx.usage('Use a 2-letter country code like `US`, `GB`, `DE`, `PK`.');
      if (year < 1975 || year > 2075) return ctx.fail('Year must be between 1975 and 2075.');
      await ctx.defer();
      const list = await holidaysJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`, `No holiday data for **${cc}** (unsupported country code).`);
      const lines = list.map(holidayLine);
      await ctx.reply({ embeds: [ctx.embed({ title: `🎉 Public holidays in ${cc} — ${year} (${list.length})`, description: truncate(lines.join('\n'), 4000), footer: 'Data: Nager.Date' })] });
    },
  },
  {
    name: 'nextholidays',
    aliases: ['upcomingholidays', 'nextholiday'],
    description: 'Upcoming public holidays for a country (2-letter code)',
    usage: '<country code>',
    examples: ['US', 'FR'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const cc = ctx.args[0].toUpperCase();
      if (!/^[A-Z]{2}$/.test(cc)) return ctx.usage('Use a 2-letter country code like `US`, `GB`, `DE`, `PK`.');
      await ctx.defer();
      const list = await holidaysJson(`https://date.nager.at/api/v3/NextPublicHolidays/${cc}`, `No holiday data for **${cc}** (unsupported country code).`);
      await ctx.reply({ embeds: [ctx.embed({ title: `📅 Next public holidays in ${cc}`, description: list.slice(0, 10).map((h) => `${holidayLine(h)} (${discordTimestamp(`${h.date}T00:00:00Z`, 'R')})`).join('\n'), footer: 'Data: Nager.Date' })] });
    },
  },
  {
    name: 'zipcode',
    aliases: ['postcode', 'zip', 'postalcode'],
    description: 'Look up a postal code (default country: US)',
    usage: '[country code] <postal code>',
    examples: ['90210', 'de 10115', 'fr 75008'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const [a, b] = ctx.args;
      const cc = b ? a.toLowerCase() : 'us';
      const code = (b || a).toUpperCase();
      if (!/^[a-z]{2}$/.test(cc) || !/^[A-Z0-9 -]{2,10}$/.test(code)) return ctx.usage();
      await ctx.defer();
      const d = await getJson(`https://api.zippopotam.us/${cc}/${enc(code)}`, { notFound: `Postal code **${code}** not found in ${cc.toUpperCase()}.` });
      const places = d.places || [];
      if (!places.length) throw userError(`Postal code **${code}** not found in ${cc.toUpperCase()}.`);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📮 ${d['post code']} — ${d.country}`,
            description: places
              .slice(0, 15)
              .map((p) => `**${p['place name']}**, ${p.state || ''}${p['state abbreviation'] ? ` (${p['state abbreviation']})` : ''} — ${(+p.latitude).toFixed(3)}, ${(+p.longitude).toFixed(3)}`)
              .join('\n'),
            footer: 'Data: Zippopotam.us',
          }),
        ],
      });
    },
  },
  {
    name: 'iss',
    aliases: ['spacestation', 'whereiss'],
    description: 'Where the International Space Station is right now',
    cooldown: 5,
    async execute(ctx) {
      await ctx.defer();
      const s = await getJson('https://api.wheretheiss.at/v1/satellites/25544');
      const lat = (+s.latitude).toFixed(4);
      const lon = (+s.longitude).toFixed(4);
      const map = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=4/${lat}/${lon}`;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '🛰️ International Space Station',
            fields: [
              { name: 'Latitude', value: `${lat}°`, inline: true },
              { name: 'Longitude', value: `${lon}°`, inline: true },
              { name: 'Altitude', value: `${formatNumber(s.altitude)} km`, inline: true },
              { name: 'Speed', value: `${formatNumber(s.velocity)} km/h`, inline: true },
              { name: 'Lighting', value: s.visibility === 'daylight' ? '☀️ In daylight' : '🌑 In Earth\'s shadow', inline: true },
              { name: 'As of', value: discordTimestamp(s.timestamp * 1000, 'T'), inline: true },
            ],
            footer: 'Data: wheretheiss.at',
          }),
        ],
        components: [row(button(map, 'Show on map', 'Link', '🗺️'))],
      });
    },
  },
  {
    name: 'launches',
    aliases: ['rocketlaunches', 'nextlaunch'],
    description: 'Upcoming rocket launches worldwide',
    cooldown: 10,
    async execute(ctx) {
      await ctx.defer();
      const data = await launchCache('upcoming', () => getJson('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6', { timeout: 15000 }));
      const list = data?.results || [];
      if (!list.length) throw userError('No upcoming launches were returned.');
      const fields = list.map((l) => ({
        name: `🚀 ${truncate(l.name, 200)}`,
        value: [
          `${discordTimestamp(l.net, 'f')} (${discordTimestamp(l.net, 'R')})`,
          `${l.launch_service_provider?.name || l.lsp_name || 'Unknown provider'} • ${l.status?.abbrev || l.status?.name || '?'}`,
          l.pad?.location?.name || l.location || null,
        ]
          .filter(Boolean)
          .join('\n'),
      }));
      await ctx.reply({ embeds: [ctx.embed({ title: '🚀 Upcoming launches', fields, footer: 'Data: The Space Devs — Launch Library 2' })] });
    },
  },
];
