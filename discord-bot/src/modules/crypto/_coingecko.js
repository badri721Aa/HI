'use strict';
const { getJson, userError, enc, cache } = require('../search/_http');

const API = 'https://api.coingecko.com/api/v3';

/** Ticker shortcut -> [CoinGecko id, display name]. Each becomes its own command. */
const SHORTCUTS = {
  btc: ['bitcoin', 'Bitcoin'],
  eth: ['ethereum', 'Ethereum'],
  sol: ['solana', 'Solana'],
  bnb: ['binancecoin', 'BNB'],
  xrp: ['ripple', 'XRP'],
  doge: ['dogecoin', 'Dogecoin'],
  ada: ['cardano', 'Cardano'],
  trx: ['tron', 'TRON'],
  ton: ['the-open-network', 'Toncoin'],
  avax: ['avalanche-2', 'Avalanche'],
  shib: ['shiba-inu', 'Shiba Inu'],
  dot: ['polkadot', 'Polkadot'],
  link: ['chainlink', 'Chainlink'],
  bch: ['bitcoin-cash', 'Bitcoin Cash'],
  ltc: ['litecoin', 'Litecoin'],
  xlm: ['stellar', 'Stellar'],
  near: ['near', 'NEAR Protocol'],
  uni: ['uniswap', 'Uniswap'],
  atom: ['cosmos', 'Cosmos Hub'],
  xmr: ['monero', 'Monero'],
  etc: ['ethereum-classic', 'Ethereum Classic'],
  sui: ['sui', 'Sui'],
  pepe: ['pepe', 'Pepe'],
  apt: ['aptos', 'Aptos'],
  arb: ['arbitrum', 'Arbitrum'],
  fil: ['filecoin', 'Filecoin'],
  hbar: ['hedera-hashgraph', 'Hedera'],
  icp: ['internet-computer', 'Internet Computer'],
  algo: ['algorand', 'Algorand'],
  vet: ['vechain', 'VeChain'],
  xtz: ['tezos', 'Tezos'],
  kas: ['kaspa', 'Kaspa'],
  usdt: ['tether', 'Tether'],
  usdc: ['usd-coin', 'USDC'],
};

const BY_ID = Object.fromEntries(Object.entries(SHORTCUTS).map(([sym, [id, name]]) => [id, { id, name, symbol: sym }]));

const searchCache = cache(6 * 60 * 60 * 1000);
const priceCache = cache(60 * 1000);
const marketCache = cache(2 * 60 * 1000);

/** "btc", "bitcoin", "Shiba Inu" -> { id, name, symbol } */
async function resolveCoin(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) throw userError('Tell me which coin, e.g. `btc` or `ethereum`.');
  if (SHORTCUTS[q]) return { id: SHORTCUTS[q][0], name: SHORTCUTS[q][1], symbol: q };
  if (BY_ID[q]) return BY_ID[q];
  const res = await searchCache(q, () => getJson(`${API}/search?query=${enc(q)}`));
  const coins = res?.coins || [];
  const rank = (c) => c.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
  const pick =
    coins.filter((c) => c.symbol?.toLowerCase() === q).sort((a, b) => rank(a) - rank(b))[0] ||
    coins.find((c) => c.id === q || c.name?.toLowerCase() === q) ||
    coins[0];
  if (!pick) throw userError(`I couldn't find a coin called **${query}**.`);
  return { id: pick.id, name: pick.name, symbol: pick.symbol?.toLowerCase(), thumb: pick.large || pick.thumb };
}

/** Simple price data for one coin in one fiat/crypto currency. */
async function price(id, vs = 'usd') {
  const cur = vs.toLowerCase();
  const data = await priceCache(`${id}:${cur}`, () =>
    getJson(`${API}/simple/price?ids=${enc(id)}&vs_currencies=${enc(cur)}&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true&include_last_updated_at=true`),
  );
  const row = data?.[id];
  if (!row || row[cur] === undefined) throw userError(`No **${cur.toUpperCase()}** price for that coin (unsupported currency?). Try usd, eur, gbp, jpy, inr, btc, eth…`);
  return { price: row[cur], change: row[`${cur}_24h_change`], marketCap: row[`${cur}_market_cap`], volume: row[`${cur}_24h_vol`], updated: row.last_updated_at };
}

async function markets(vs = 'usd', perPage = 10) {
  return marketCache(`${vs}:${perPage}`, () => getJson(`${API}/coins/markets?vs_currency=${enc(vs)}&order=market_cap_desc&per_page=${perPage}&page=1&price_change_percentage=24h`));
}

async function coinDetails(id) {
  return getJson(`${API}/coins/${enc(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`, { notFound: 'Coin not found.' });
}

async function trending() {
  return getJson(`${API}/search/trending`);
}

/** Money formatting that copes with tiny prices and non-ISO "currencies" like BTC. */
function money(n, cur = 'usd') {
  if (n === null || n === undefined || Number.isNaN(+n)) return '—';
  const v = +n;
  const digits = Math.abs(v) >= 1 ? 2 : Math.abs(v) >= 0.01 ? 4 : 8;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${v.toLocaleString('en-US', { maximumFractionDigits: digits })} ${cur.toUpperCase()}`;
  }
}

function compact(n, cur = 'usd') {
  if (!n) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase(), notation: 'compact', maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)} ${cur.toUpperCase()}`;
  }
}

const pct = (n) => (n === null || n === undefined ? '—' : `${n >= 0 ? '🟢 +' : '🔴 '}${(+n).toFixed(2)}%`);

module.exports = { SHORTCUTS, resolveCoin, price, markets, coinDetails, trending, money, compact, pct };
