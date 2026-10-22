'use strict';
/**
 * Loads every module under src/modules/<category>/<file>.js.
 * Files and folders whose names start with "_" are helpers and are not loaded.
 *
 * A module file exports either an array of commands, or:
 *   {
 *     commands:   [Command, ...],
 *     components: { [customIdPrefix]: async (interaction, parts, client) => {} },
 *     events:     { [discordEventName | 'unknownCommand']: async (client, ...args) => {} },
 *     tasks:      [{ name, interval: ms, run: async (client) => {} }],
 *   }
 */
const fs = require('node:fs');
const path = require('node:path');
const { PermissionFlagsBits } = require('discord.js');
const log = require('./logger').child('registry');

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const ARG_TYPES = ['string', 'integer', 'number', 'boolean', 'user', 'channel', 'role', 'mentionable', 'attachment'];

class Registry {
  constructor() {
    this.commands = new Map(); // name -> command
    this.aliases = new Map(); // alias -> name
    this.categories = new Map(); // category -> command[]
    this.components = new Map(); // prefix -> { category, handler }
    this.events = new Map(); // event -> [{ category, handler }]
    this.tasks = []; // { category, name, interval, run }
    this.problems = []; // validation problems (non-fatal at runtime, fatal in `npm run check`)
  }

  problem(msg) {
    this.problems.push(msg);
    log.warn(msg);
  }

  loadDir(modulesDir) {
    const cats = fs.readdirSync(modulesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_'));
    for (const dir of cats) {
      const category = dir.name;
      const files = fs.readdirSync(path.join(modulesDir, category)).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort();
      for (const file of files) {
        const full = path.join(modulesDir, category, file);
        let mod;
        try {
          mod = require(full);
        } catch (err) {
          this.problem(`Failed to load ${category}/${file}: ${err.stack || err.message}`);
          continue;
        }
        this.addModule(mod, category, `${category}/${file}`);
      }
    }
    return this;
  }

  addModule(mod, category, source = category) {
    const def = Array.isArray(mod) ? { commands: mod } : mod || {};
    for (const cmd of def.commands || []) this.addCommand(cmd, category, source);
    for (const [prefix, handler] of Object.entries(def.components || {})) {
      if (this.components.has(prefix)) this.problem(`${source}: component prefix "${prefix}" already registered`);
      else this.components.set(prefix, { category, handler });
    }
    for (const [event, handler] of Object.entries(def.events || {})) {
      if (!this.events.has(event)) this.events.set(event, []);
      this.events.get(event).push({ category, handler, source });
    }
    for (const t of def.tasks || []) this.tasks.push({ category, ...t });
  }

  addCommand(raw, category, source) {
    if (!raw || typeof raw.execute !== 'function') {
      this.problem(`${source}: command "${raw?.name}" has no execute()`);
      return;
    }
    const cmd = {
      aliases: [],
      usage: '',
      examples: [],
      guildOnly: false,
      ownerOnly: false,
      nsfw: false,
      hidden: false,
      userPerms: [],
      botPerms: [],
      cooldown: 2,
      minArgs: 0,
      slash: false,
      ...raw,
      category: raw.category || category,
      source,
    };
    cmd.name = String(cmd.name || '').toLowerCase();
    cmd.aliases = (cmd.aliases || []).map((a) => String(a).toLowerCase());

    if (!NAME_RE.test(cmd.name)) return this.problem(`${source}: invalid command name "${cmd.name}"`);
    if (!cmd.description) this.problem(`${source}: "${cmd.name}" is missing a description`);
    if (String(cmd.description || '').length > 100) this.problem(`${source}: "${cmd.name}" description is over 100 chars`);
    for (const p of [...cmd.userPerms, ...cmd.botPerms, ...(cmd.modPerm ? [cmd.modPerm] : [])]) {
      if (!(p in PermissionFlagsBits)) this.problem(`${source}: "${cmd.name}" unknown permission "${p}"`);
    }
    for (const a of cmd.args || []) {
      if (!ARG_TYPES.includes(a.type || 'string')) this.problem(`${source}: "${cmd.name}" arg "${a.name}" has bad type "${a.type}"`);
      if (!NAME_RE.test(a.name || '')) this.problem(`${source}: "${cmd.name}" arg name "${a.name}" is invalid`);
      if (!a.description) this.problem(`${source}: "${cmd.name}" arg "${a.name}" needs a description`);
    }
    if (this.commands.has(cmd.name) || this.aliases.has(cmd.name)) {
      const other = this.commands.get(cmd.name) || this.commands.get(this.aliases.get(cmd.name));
      return this.problem(`${source}: duplicate command name "${cmd.name}" (already defined in ${other?.source})`);
    }
    this.commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases) {
      if (this.commands.has(alias) || this.aliases.has(alias)) {
        this.problem(`${source}: alias "${alias}" of "${cmd.name}" collides with an existing command/alias`);
        continue;
      }
      this.aliases.set(alias, cmd.name);
    }
    if (!this.categories.has(cmd.category)) this.categories.set(cmd.category, []);
    this.categories.get(cmd.category).push(cmd);
  }

  get(name) {
    const n = String(name || '').toLowerCase();
    return this.commands.get(n) || this.commands.get(this.aliases.get(n)) || null;
  }

  get size() {
    return this.commands.size;
  }
}

module.exports = { Registry };
