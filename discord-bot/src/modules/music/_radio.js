'use strict';
/**
 * Radio sources:
 *  - SomaFM presets: listener-supported, commercial-free internet radio with stable stream URLs.
 *  - Radio Browser (radio-browser.info): free, open directory of 30,000+ stations, no API key.
 */
const { fetchJson, shuffle } = require('../../core/utils');

const SOMA = {
  groovesalad: ['Groove Salad', 'Ambient / downtempo beats'],
  gsclassic: ['Groove Salad Classic', 'Early-2000s chill-out'],
  dronezone: ['Drone Zone', 'Atmospheric ambient textures'],
  deepspaceone: ['Deep Space One', 'Deep ambient & space music'],
  spacestation: ['Space Station Soma', 'Spaced-out ambient & mid-tempo electronica'],
  missioncontrol: ['Mission Control', 'Ambient mixed with real NASA mission audio'],
  synphaera: ['Synphaera Radio', 'Modern electronic ambient & space music'],
  darkzone: ['The Dark Zone', 'Deep, dark ambient'],
  secretagent: ['Secret Agent', 'Spy-movie lounge & downtempo'],
  illstreet: ['Illinois Street Lounge', 'Classic bachelor-pad & exotica'],
  lush: ['Lush', 'Sensuous, mellow female vocals'],
  fluid: ['Fluid', 'Instrumental hip-hop & future soul'],
  beatblender: ['Beat Blender', 'Deep house & downtempo chill'],
  thetrip: ['The Trip', 'Progressive house & trance'],
  cliqhop: ['cliqhop idm', 'Blips and bleeps (IDM)'],
  defcon: ['DEF CON Radio', 'Music for hacking'],
  poptron: ['PopTron', 'Electropop & indie dance'],
  vaporwaves: ['Vaporwaves', 'Vaporwave & future funk'],
  u80s: ['Underground 80s', 'Early 80s UK synthpop & new wave'],
  seventies: ['Left Coast 70s', 'Mellow 70s album rock'],
  indiepop: ['Indie Pop Rocks!', 'New and classic indie pop'],
  bagel: ['BAGeL Radio', 'Alternative rock'],
  digitalis: ['Digitalis', 'Digitally-affected analog rock'],
  metal: ['Metal Detector', 'From black to doom, prog to sludge'],
  covers: ['Covers', 'Songs you know by artists you don\'t'],
  folkfwd: ['Folk Forward', 'Indie folk & alt-folk'],
  bootliquor: ['Boot Liquor', 'Americana roots & alt-country'],
  thistle: ['ThistleRadio', 'Celtic roots'],
  suburbsofgoa: ['Suburbs of Goa', 'Desi-influenced Asian world beats'],
  reggae: ['Heavyweight Reggae', 'Reggae, ska & rocksteady'],
  sonicuniverse: ['Sonic Universe', 'Transcending jazz'],
  n5md: ['n5MD Radio', 'Ambient, modern composition & post-rock'],
  christmas: ['Christmas Lounge', 'Chilled holiday grooves'],
};

function somaTrack(id, requestedBy) {
  const [name, desc] = SOMA[id];
  const servers = shuffle(['ice1', 'ice2', 'ice4', 'ice5', 'ice6']);
  const urls = servers.map((s) => `https://${s}.somafm.com/${id}-128-mp3`);
  return {
    title: `${name} (SomaFM)`,
    description: desc,
    url: urls[0],
    fallbacks: urls.slice(1),
    live: true,
    source: 'radio',
    homepage: `https://somafm.com/${id}/`,
    requestedBy,
  };
}

// Genre shortcut commands: tag search on Radio Browser, with a SomaFM fallback when possible.
const GENRES = {
  lofi: { tag: 'lofi', fallback: 'fluid', label: 'Lo-fi beats' },
  chillhop: { tag: 'chillhop', fallback: 'fluid', label: 'Chillhop' },
  jazz: { tag: 'jazz', fallback: 'sonicuniverse', label: 'Jazz' },
  rock: { tag: 'rock', fallback: 'bagel', label: 'Rock' },
  classical: { tag: 'classical', label: 'Classical' },
  pop: { tag: 'pop', fallback: 'poptron', label: 'Pop' },
  hiphop: { tag: 'hip hop', fallback: 'fluid', label: 'Hip-hop' },
  edm: { tag: 'edm', fallback: 'thetrip', label: 'EDM / dance' },
  chill: { preset: 'groovesalad', label: 'Chill-out' },
  ambient: { preset: 'dronezone', label: 'Ambient' },
  metal: { preset: 'metal', label: 'Metal' },
  country: { tag: 'country', fallback: 'bootliquor', label: 'Country' },
  kpop: { tag: 'kpop', label: 'K-pop' },
  'anime-radio': { tag: 'anime', label: 'Anime songs' },
  '80s': { tag: '80s', fallback: 'u80s', label: '80s hits' },
  '90s': { tag: '90s', label: '90s hits' },
  reggae: { preset: 'reggae', label: 'Reggae' },
  blues: { tag: 'blues', fallback: 'bootliquor', label: 'Blues' },
  indie: { preset: 'indiepop', label: 'Indie' },
  synthwave: { tag: 'synthwave', fallback: 'vaporwaves', label: 'Synthwave' },
  latin: { tag: 'latin', label: 'Latin' },
  soul: { tag: 'soul', fallback: 'fluid', label: 'Soul' },
  funk: { tag: 'funk', label: 'Funk' },
  christmas: { preset: 'christmas', label: 'Christmas' },
};

const MIRRORS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'nl1.api.radio-browser.info', 'at1.api.radio-browser.info', 'fi1.api.radio-browser.info'];

async function radioBrowser(params) {
  const qs = new URLSearchParams({ limit: '15', hidebroken: 'true', order: 'clickcount', reverse: 'true', ...params });
  let lastErr;
  for (const host of shuffle(MIRRORS).slice(0, 3)) {
    try {
      const list = await fetchJson(`https://${host}/json/stations/search?${qs}`, { timeout: 7000 });
      return list.filter((s) => (s.url_resolved || s.url) && /^https?:/.test(s.url_resolved || s.url));
    } catch (err) {
      lastErr = err;
    }
  }
  throw Object.assign(lastErr || new Error('radio-browser unreachable'), { userMessage: 'The radio directory is unreachable right now. Try a preset: `radios`.' });
}

function stationTrack(s, requestedBy) {
  return {
    title: s.name.trim().slice(0, 100) || 'Unknown station',
    description: [s.country, s.tags?.split(',').slice(0, 4).join(', '), s.bitrate ? `${s.bitrate} kbps ${s.codec || ''}` : null].filter(Boolean).join(' • '),
    url: s.url_resolved || s.url,
    live: true,
    source: 'radio',
    homepage: s.homepage || null,
    thumbnail: s.favicon || null,
    requestedBy,
  };
}

async function searchStations(query, { byTag = false } = {}) {
  return radioBrowser(byTag ? { tag: query, tagExact: 'false' } : { name: query });
}

async function genreTrack(key, requestedBy) {
  const g = GENRES[key];
  if (g.preset) return somaTrack(g.preset, requestedBy);
  try {
    const list = await searchStations(g.tag, { byTag: true });
    // Pick randomly among the five most popular so the same command doesn't always play one station.
    const top = list.slice(0, 5);
    if (top.length) return stationTrack(top[Math.floor(Math.random() * top.length)], requestedBy);
  } catch (err) {
    if (!g.fallback) throw err;
  }
  if (g.fallback) return somaTrack(g.fallback, requestedBy);
  throw Object.assign(new Error('no stations'), { userMessage: `No ${g.label} stations found right now.` });
}

module.exports = { SOMA, GENRES, somaTrack, stationTrack, searchStations, genreTrack };
