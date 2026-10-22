'use strict';
const { getJson, userError, enc, cache } = require('./_http');

const cached = cache(10 * 60 * 1000);

function icon(desc) {
  const d = String(desc).toLowerCase();
  if (/thunder/.test(d)) return '⛈️';
  if (/blizzard|snow|sleet|ice/.test(d)) return '❄️';
  if (/rain|drizzle|shower/.test(d)) return '🌧️';
  if (/fog|mist|haze/.test(d)) return '🌫️';
  if (/partly/.test(d)) return '⛅';
  if (/overcast|cloud/.test(d)) return '☁️';
  if (/sun|clear/.test(d)) return '☀️';
  return '🌡️';
}

async function wttr(place) {
  return cached(place.toLowerCase(), async () => {
    let data;
    try {
      data = await getJson(`https://wttr.in/${enc(place)}?format=j1`, { notFound: `I couldn't find weather for **${place}**.`, timeout: 15000 });
    } catch (err) {
      if (err instanceof SyntaxError) throw userError(`I couldn't find weather for **${place}**.`);
      throw err;
    }
    if (!data?.current_condition?.length) throw userError(`I couldn't find weather for **${place}**.`);
    return data;
  });
}

function areaName(data, fallback) {
  const a = data.nearest_area?.[0];
  if (!a) return fallback;
  return [a.areaName?.[0]?.value, a.region?.[0]?.value, a.country?.[0]?.value].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ') || fallback;
}

/** Synodic-month moon phase (accurate to within about a day). */
function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const age = ((((date.getTime() - knownNew) / 86400000) % synodic) + synodic) % synodic;
  const fraction = age / synodic;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const phases = [
    [1.84566, '🌑', 'New Moon'],
    [5.53699, '🌒', 'Waxing Crescent'],
    [9.22831, '🌓', 'First Quarter'],
    [12.91963, '🌔', 'Waxing Gibbous'],
    [16.61096, '🌕', 'Full Moon'],
    [20.30228, '🌖', 'Waning Gibbous'],
    [23.99361, '🌗', 'Last Quarter'],
    [27.68493, '🌘', 'Waning Crescent'],
    [synodic, '🌑', 'New Moon'],
  ];
  const [, emoji, name] = phases.find(([limit]) => age < limit);
  const toFull = ((14.765 - age + synodic) % synodic) || synodic;
  const toNew = synodic - age;
  return { age, emoji, name, illumination, toFull, toNew };
}

module.exports = [
  {
    name: 'weather',
    aliases: ['wttr'],
    description: 'Current weather for any city or place',
    usage: '<place>',
    examples: ['London', 'New York', 'Tokyo'],
    minArgs: 1,
    cooldown: 4,
    slash: true,
    args: [{ name: 'place', type: 'string', description: 'City or place', required: true, rest: true }],
    async execute(ctx) {
      const place = ctx.rest(0).slice(0, 100);
      await ctx.defer();
      const data = await wttr(place);
      const c = data.current_condition[0];
      const today = data.weather?.[0];
      const desc = c.weatherDesc?.[0]?.value || 'Unknown';
      const rain = today?.hourly ? Math.max(...today.hourly.map((h) => +h.chanceofrain || 0)) : null;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `${icon(desc)} Weather in ${areaName(data, place)}`,
            description: `**${desc}** — ${c.temp_C}°C / ${c.temp_F}°F (feels like ${c.FeelsLikeC}°C / ${c.FeelsLikeF}°F)`,
            fields: [
              today && { name: 'Today', value: `⬆️ ${today.maxtempC}°C / ${today.maxtempF}°F\n⬇️ ${today.mintempC}°C / ${today.mintempF}°F`, inline: true },
              { name: 'Humidity', value: `${c.humidity}%`, inline: true },
              { name: 'Wind', value: `${c.windspeedKmph} km/h (${c.windspeedMiles} mph) ${c.winddir16Point}`, inline: true },
              { name: 'Precipitation', value: `${c.precipMM} mm${rain !== null ? ` • ${rain}% chance today` : ''}`, inline: true },
              { name: 'Clouds / UV', value: `${c.cloudcover}% • UV ${c.uvIndex}`, inline: true },
              { name: 'Pressure / Visibility', value: `${c.pressure} hPa • ${c.visibility} km`, inline: true },
              today?.astronomy?.[0] && { name: 'Sun', value: `🌅 ${today.astronomy[0].sunrise} • 🌇 ${today.astronomy[0].sunset}`, inline: true },
            ],
            footer: 'Data: wttr.in • use forecast for 3 days',
          }),
        ],
      });
    },
  },
  {
    name: 'forecast',
    aliases: ['weatherforecast', 'wf'],
    description: '3-day weather forecast for a place',
    usage: '<place>',
    examples: ['Paris'],
    minArgs: 1,
    cooldown: 4,
    async execute(ctx) {
      const place = ctx.rest(0).slice(0, 100);
      await ctx.defer();
      const data = await wttr(place);
      const fields = (data.weather || []).slice(0, 3).map((d) => {
        const mid = d.hourly?.[4] || d.hourly?.[0];
        const desc = mid?.weatherDesc?.[0]?.value || '—';
        const rain = d.hourly ? Math.max(...d.hourly.map((h) => +h.chanceofrain || 0)) : 0;
        const day = new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
        return {
          name: `${icon(desc)} ${day}`,
          value: `${desc}\n⬆️ ${d.maxtempC}°C / ${d.maxtempF}°F • ⬇️ ${d.mintempC}°C / ${d.mintempF}°F\n☔ ${rain}% • 🌅 ${d.astronomy?.[0]?.sunrise || '?'} • 🌇 ${d.astronomy?.[0]?.sunset || '?'}`,
        };
      });
      if (!fields.length) throw userError('No forecast available for that place.');
      await ctx.reply({ embeds: [ctx.embed({ title: `📅 Forecast for ${areaName(data, place)}`, fields, footer: 'Data: wttr.in' })] });
    },
  },
  {
    name: 'moonphase',
    aliases: ['moon'],
    description: 'Current (or any date\'s) moon phase and illumination',
    usage: '[YYYY-MM-DD]',
    examples: ['', '2026-12-25'],
    async execute(ctx) {
      let date = new Date();
      if (ctx.args[0]) {
        const m = ctx.args[0].match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!m) return ctx.usage('Use a date like `2026-12-25`.');
        date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
      }
      const p = moonPhase(date);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `${p.emoji} ${p.name}`,
            description: `On **${date.toISOString().slice(0, 10)}** the moon is **${(p.illumination * 100).toFixed(0)}%** illuminated and **${p.age.toFixed(1)} days** old.`,
            fields: [
              { name: 'Next full moon', value: `in ~${p.toFull.toFixed(1)} days`, inline: true },
              { name: 'Next new moon', value: `in ~${p.toNew.toFixed(1)} days`, inline: true },
            ],
            footer: 'Calculated locally from the mean synodic month',
          }),
        ],
      });
    },
  },
];
