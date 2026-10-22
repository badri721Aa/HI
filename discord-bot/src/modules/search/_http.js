'use strict';
const { fetchJson, fetchText } = require('../../core/utils');

const userError = (message) => Object.assign(new Error(message), { userMessage: message });

/**
 * fetchJson that turns "not found" into a friendly message and rate limits into
 * a clear one. Network failures are re-thrown untouched (the handler explains them).
 */
async function getJson(url, { notFound = 'Nothing found.', ...opts } = {}) {
  try {
    return await fetchJson(url, opts);
  } catch (err) {
    if (err.status === 404 || err.status === 400 || err.status === 422) throw userError(notFound);
    if (err.status === 429) throw userError('That service is rate-limiting me right now — try again in a minute.');
    if (err.status === 403 && /github/.test(url)) throw userError('GitHub\'s hourly limit for anonymous lookups was reached — try again later.');
    throw err;
  }
}

async function getText(url, { notFound = 'Nothing found.', ...opts } = {}) {
  try {
    return await fetchText(url, opts);
  } catch (err) {
    if (err.status === 404 || err.status === 400) throw userError(notFound);
    if (err.status === 429) throw userError('That service is rate-limiting me right now — try again in a minute.');
    throw err;
  }
}

/** Strip HTML tags/entities from API text (TVmaze summaries etc.). */
function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Tiny in-memory TTL cache so popular lookups don't hammer free APIs. */
function cache(ttlMs, max = 500) {
  const map = new Map();
  return async (key, fn) => {
    const hit = map.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await fn();
    map.set(key, { value, at: Date.now() });
    if (map.size > max) map.delete(map.keys().next().value);
    return value;
  };
}

const enc = encodeURIComponent;

module.exports = { getJson, getText, stripHtml, cache, userError, enc };
