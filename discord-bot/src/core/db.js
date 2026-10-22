'use strict';
/**
 * Tiny JSON document store. Everything lives in memory and is flushed to
 * disk (atomically, debounced) so the bot needs no database server.
 *
 * Layout: { [collection]: { [key]: value } }
 *
 *   db.get(col, key, def)     -> value or a *copy* of def (does not insert)
 *   db.ensure(col, key, def)  -> live value, inserting def if missing
 *   db.set(col, key, value)
 *   db.update(col, key, fn, def) -> fn(liveValue) may mutate or return a new value
 *   db.delete(col, key)
 *   db.entries(col)           -> [[key, value], ...]
 *   db.guild(guildId)         -> live guild settings object (core defaults filled)
 *   db.section(guildId, name, defaults) -> live sub-object of guild settings, defaults filled
 *   db.save()                 -> schedule a write (call after mutating live objects)
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const log = require('./logger').child('db');

const clone = (v) => (v === undefined ? v : structuredClone(v));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function fillDefaults(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in target)) target[k] = clone(v);
    else if (isPlainObject(v) && isPlainObject(target[k])) fillDefaults(target[k], v);
  }
  return target;
}

const GUILD_DEFAULTS = {
  prefixes: {}, // { [botUserId]: prefix }
  disabledCommands: [],
  disabledCategories: [],
};

class Store {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.timer = null;
    this.lastBackup = 0;
    this.load();
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    for (const candidate of [this.file, `${this.file}.bak`]) {
      if (!fs.existsSync(candidate)) continue;
      try {
        this.data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (candidate !== this.file) log.warn('Main database was unreadable — restored from backup.');
        return;
      } catch (err) {
        log.error(`Could not parse ${candidate}:`, err.message);
      }
    }
    this.data = {};
  }

  col(name) {
    if (!isPlainObject(this.data[name])) this.data[name] = {};
    return this.data[name];
  }

  has(col, key) {
    return Object.prototype.hasOwnProperty.call(this.col(col), key);
  }

  get(col, key, def) {
    const c = this.col(col);
    return Object.prototype.hasOwnProperty.call(c, key) ? c[key] : clone(def);
  }

  ensure(col, key, def) {
    const c = this.col(col);
    if (!Object.prototype.hasOwnProperty.call(c, key)) {
      c[key] = clone(def);
      this.save();
    } else if (isPlainObject(def) && isPlainObject(c[key])) {
      fillDefaults(c[key], def);
    }
    return c[key];
  }

  set(col, key, value) {
    this.col(col)[key] = value;
    this.save();
    return value;
  }

  update(col, key, fn, def) {
    const live = this.ensure(col, key, def);
    const out = fn(live);
    if (out !== undefined) this.col(col)[key] = out;
    this.save();
    return this.col(col)[key];
  }

  delete(col, key) {
    const existed = delete this.col(col)[key];
    this.save();
    return existed;
  }

  entries(col) {
    return Object.entries(this.col(col));
  }

  guild(guildId) {
    return this.ensure('guilds', String(guildId), GUILD_DEFAULTS);
  }

  section(guildId, name, defaults = {}) {
    const g = this.guild(guildId);
    if (!isPlainObject(g[name])) {
      g[name] = clone(defaults);
      this.save();
    } else {
      fillDefaults(g[name], defaults);
    }
    return g[name];
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 2000);
    this.timer.unref?.();
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      const json = JSON.stringify(this.data);
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, json);
      if (Date.now() - this.lastBackup > 10 * 60 * 1000 && fs.existsSync(this.file)) {
        fs.copyFileSync(this.file, `${this.file}.bak`);
        this.lastBackup = Date.now();
      }
      fs.renameSync(tmp, this.file);
    } catch (err) {
      log.error('Failed to write database:', err.message);
    }
  }
}

const db = new Store(path.join(config.dataDir, 'db.json'));
db.Store = Store;
db.fillDefaults = fillDefaults;
module.exports = db;
