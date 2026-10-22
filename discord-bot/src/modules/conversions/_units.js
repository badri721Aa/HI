'use strict';
/**
 * Unit table. Linear units store `f` = how many base units one of them is.
 * Exact factors: international yard & pound (1959), US customary volume,
 * thermochemical calorie, Julian year (365.25 d), standard atmosphere.
 */

const GROUPS = {
  length: {
    label: 'Length',
    emoji: '📏',
    base: 'm',
    units: {
      mm: { f: 0.001, name: 'millimeter', aliases: ['millimeters', 'millimetre', 'millimetres'] },
      cm: { f: 0.01, name: 'centimeter', aliases: ['centimeters', 'centimetre', 'centimetres'] },
      m: { f: 1, name: 'meter', aliases: ['meters', 'metre', 'metres'] },
      km: { f: 1000, name: 'kilometer', aliases: ['kilometers', 'kilometre', 'kilometres', 'kms'] },
      in: { f: 0.0254, name: 'inch', plural: 'inches', aliases: ['inches', '"'] },
      ft: { f: 0.3048, name: 'foot', plural: 'feet', aliases: ['feet', "'"] },
      yd: { f: 0.9144, name: 'yard', aliases: ['yards', 'yds'] },
      mi: { f: 1609.344, name: 'mile', aliases: ['miles'] },
      nmi: { f: 1852, name: 'nautical mile', aliases: ['nauticalmile', 'nauticalmiles', 'nm'] },
    },
  },
  mass: {
    label: 'Mass / weight',
    emoji: '⚖️',
    base: 'kg',
    units: {
      mg: { f: 1e-6, name: 'milligram', aliases: ['milligrams'] },
      g: { f: 0.001, name: 'gram', aliases: ['grams', 'gr'] },
      kg: { f: 1, name: 'kilogram', aliases: ['kilograms', 'kilo', 'kilos', 'kgs'] },
      t: { f: 1000, name: 'metric ton', aliases: ['tonne', 'tonnes', 'ton', 'tons', 'metricton'] },
      oz: { f: 0.028349523125, name: 'ounce', aliases: ['ounces'] },
      lb: { f: 0.45359237, name: 'pound', aliases: ['pounds', 'lbs'] },
      st: { f: 6.35029318, name: 'stone', plural: 'stone', aliases: ['stones'] },
    },
  },
  temperature: {
    label: 'Temperature',
    emoji: '🌡️',
    base: 'c',
    units: {
      c: { name: '°C', plural: '°C', toBase: (v) => v, fromBase: (v) => v, aliases: ['celsius', 'centigrade', '°c', 'degc'] },
      f: { name: '°F', plural: '°F', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32, aliases: ['fahrenheit', '°f', 'degf'] },
      k: { name: 'K', plural: 'K', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15, aliases: ['kelvin', 'kelvins'] },
    },
  },
  volume: {
    label: 'Volume (US)',
    emoji: '🧪',
    base: 'l',
    units: {
      ml: { f: 0.001, name: 'milliliter', aliases: ['milliliters', 'millilitre', 'millilitres', 'cc'] },
      l: { f: 1, name: 'liter', aliases: ['liters', 'litre', 'litres', 'ltr'] },
      gal: { f: 3.785411784, name: 'US gallon', aliases: ['gallon', 'gallons'] },
      qt: { f: 0.946352946, name: 'US quart', aliases: ['quart', 'quarts'] },
      pt: { f: 0.473176473, name: 'US pint', aliases: ['pint', 'pints'] },
      cup: { f: 0.2365882365, name: 'US cup', aliases: ['cups'] },
      floz: { f: 0.0295735295625, name: 'US fluid ounce', aliases: ['fluidounce', 'fluidounces', 'fl.oz'] },
      tbsp: { f: 0.01478676478125, name: 'tablespoon', aliases: ['tablespoons', 'tbs'] },
      tsp: { f: 0.00492892159375, name: 'teaspoon', aliases: ['teaspoons'] },
    },
  },
  area: {
    label: 'Area',
    emoji: '🗺️',
    base: 'sqm',
    units: {
      sqm: { f: 1, name: 'square meter', aliases: ['m2', 'm²', 'squaremeter', 'squaremeters'] },
      sqkm: { f: 1e6, name: 'square kilometer', aliases: ['km2', 'km²', 'squarekilometer', 'squarekilometers'] },
      sqft: { f: 0.09290304, name: 'square foot', plural: 'square feet', aliases: ['ft2', 'ft²', 'squarefoot', 'squarefeet'] },
      sqmi: { f: 2589988.110336, name: 'square mile', aliases: ['mi2', 'mi²', 'squaremile', 'squaremiles'] },
      acre: { f: 4046.8564224, name: 'acre', aliases: ['acres', 'ac'] },
      ha: { f: 10000, name: 'hectare', aliases: ['hectares'] },
    },
  },
  speed: {
    label: 'Speed',
    emoji: '🏎️',
    base: 'mps',
    units: {
      mps: { f: 1, name: 'meter/second', plural: 'meters/second', aliases: ['m/s', 'ms-1'] },
      kph: { f: 1 / 3.6, name: 'km/h', plural: 'km/h', aliases: ['km/h', 'kmh', 'kmph'] },
      mph: { f: 0.44704, name: 'mph', plural: 'mph', aliases: ['mi/h', 'milesperhour'] },
      knot: { f: 1852 / 3600, name: 'knot', aliases: ['knots', 'kn', 'kt', 'kts'] },
    },
  },
  data: {
    label: 'Digital storage',
    emoji: '💾',
    base: 'b',
    units: {
      bit: { f: 0.125, name: 'bit', aliases: ['bits'] },
      b: { f: 1, name: 'byte', aliases: ['bytes', 'byte'] },
      kb: { f: 1e3, name: 'kilobyte', aliases: ['kilobytes'] },
      mb: { f: 1e6, name: 'megabyte', aliases: ['megabytes'] },
      gb: { f: 1e9, name: 'gigabyte', aliases: ['gigabytes', 'gigs'] },
      tb: { f: 1e12, name: 'terabyte', aliases: ['terabytes'] },
      kib: { f: 1024, name: 'kibibyte', aliases: ['kibibytes'] },
      mib: { f: 1024 ** 2, name: 'mebibyte', aliases: ['mebibytes'] },
      gib: { f: 1024 ** 3, name: 'gibibyte', aliases: ['gibibytes'] },
      tib: { f: 1024 ** 4, name: 'tebibyte', aliases: ['tebibytes'] },
    },
  },
  time: {
    label: 'Time',
    emoji: '⏱️',
    base: 's',
    units: {
      ms: { f: 0.001, name: 'millisecond', aliases: ['milliseconds', 'msec'] },
      s: { f: 1, name: 'second', aliases: ['seconds', 'sec', 'secs'] },
      min: { f: 60, name: 'minute', aliases: ['minutes', 'mins'] },
      h: { f: 3600, name: 'hour', aliases: ['hours', 'hr', 'hrs'] },
      d: { f: 86400, name: 'day', aliases: ['days'] },
      wk: { f: 604800, name: 'week', aliases: ['weeks', 'w'] },
      yr: { f: 31557600, name: 'year', aliases: ['years', 'y', 'yrs'] },
    },
  },
  pressure: {
    label: 'Pressure',
    emoji: '🎈',
    base: 'pa',
    units: {
      pa: { f: 1, name: 'pascal', aliases: ['pascals'] },
      kpa: { f: 1000, name: 'kilopascal', aliases: ['kilopascals'] },
      bar: { f: 100000, name: 'bar', plural: 'bar', aliases: ['bars'] },
      psi: { f: 6894.757293168361, name: 'psi', plural: 'psi', aliases: ['poundspersquareinch'] },
      atm: { f: 101325, name: 'atmosphere', aliases: ['atmospheres'] },
    },
  },
  energy: {
    label: 'Energy',
    emoji: '⚡',
    base: 'j',
    units: {
      j: { f: 1, name: 'joule', aliases: ['joules'] },
      kj: { f: 1000, name: 'kilojoule', aliases: ['kilojoules'] },
      cal: { f: 4.184, name: 'calorie', aliases: ['calories'] },
      kcal: { f: 4184, name: 'kilocalorie', aliases: ['kilocalories', 'kcals'] },
      wh: { f: 3600, name: 'watt-hour', aliases: ['watthour', 'watthours'] },
      kwh: { f: 3.6e6, name: 'kilowatt-hour', aliases: ['kilowatthour', 'kilowatthours'] },
    },
  },
};

// token/alias -> { group, token }
const LOOKUP = new Map();
for (const [group, g] of Object.entries(GROUPS)) {
  for (const [token, u] of Object.entries(g.units)) {
    for (const key of [token, u.name.toLowerCase().replace(/\s+/g, ''), ...(u.aliases || [])]) {
      const k = key.toLowerCase();
      if (!LOOKUP.has(k)) LOOKUP.set(k, { group, token });
    }
  }
}

function findUnit(str) {
  const k = String(str || '').toLowerCase().replace(/\s+/g, '');
  return LOOKUP.get(k) || LOOKUP.get(k.replace(/s$/, '')) || null;
}

function convert(value, group, from, to) {
  const g = GROUPS[group];
  const a = g.units[from];
  const b = g.units[to];
  const base = a.toBase ? a.toBase(value) : value * a.f;
  return b.fromBase ? b.fromBase(base) : base / b.f;
}

const unitLabel = (group, token, value) => {
  const u = GROUPS[group].units[token];
  if (u.toBase) return u.name; // °C / °F / K
  return Math.abs(value) === 1 ? u.name : u.plural || `${u.name}s`;
};

module.exports = { GROUPS, findUnit, convert, unitLabel };
