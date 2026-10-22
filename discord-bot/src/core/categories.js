'use strict';
/** Display metadata for command categories (= folder names under src/modules). */
const CATEGORIES = {
  core: { emoji: '🤖', label: 'Core', description: 'Help, prefix, bot info, bot directory' },
  moderation: { emoji: '🛡️', label: 'Moderation', description: 'Ban, kick, timeout, warn, purge, lock…' },
  automod: { emoji: '🚨', label: 'Automod & Anti-Nuke', description: 'Spam, links, invites, bad words, raid protection' },
  config: { emoji: '⚙️', label: 'Server Config', description: 'Logging, settings and server setup' },
  community: { emoji: '🏘️', label: 'Community', description: 'Welcome, autorole, reaction roles, starboard, suggestions…' },
  tickets: { emoji: '🎫', label: 'Tickets', description: 'Support ticket system' },
  giveaways: { emoji: '🎉', label: 'Giveaways', description: 'Run giveaways with buttons' },
  polls: { emoji: '📊', label: 'Polls', description: 'Button and reaction polls' },
  customcommands: { emoji: '🧩', label: 'Custom Commands', description: 'Make your own commands, tags and auto-responders' },
  economy: { emoji: '💰', label: 'Economy', description: 'Wallet, bank, jobs, shop, inventory' },
  gambling: { emoji: '🎰', label: 'Gambling', description: 'Slots, blackjack, roulette and more' },
  leveling: { emoji: '📈', label: 'Leveling', description: 'XP, ranks, level rewards' },
  social: { emoji: '💞', label: 'Social', description: 'Profiles, reputation, marriage' },
  fun: { emoji: '😂', label: 'Fun', description: 'Jokes, memes, 8ball, ship, rate…' },
  games: { emoji: '🎮', label: 'Games', description: 'Trivia, tic-tac-toe, hangman, wordle…' },
  actions: { emoji: '🤗', label: 'Roleplay Actions', description: 'Hug, pat, wave and dozens more anime GIF actions' },
  animals: { emoji: '🐾', label: 'Animals', description: 'Cats, dogs, foxes and animal facts' },
  text: { emoji: '🔤', label: 'Text Tools', description: 'Transform, count and style text' },
  fonts: { emoji: '🅰️', label: 'Fancy Fonts', description: 'Unicode font styles' },
  encoding: { emoji: '🔐', label: 'Encoding & Hashing', description: 'Base64, binary, morse, ciphers, hashes' },
  math: { emoji: '🧮', label: 'Math', description: 'Calculator, primes, statistics, finance' },
  conversions: { emoji: '📏', label: 'Unit Conversions', description: 'Hundreds of unit-to-unit shortcuts' },
  generators: { emoji: '🎲', label: 'Generators', description: 'Passwords, UUIDs, colors, random picks' },
  utility: { emoji: '🧰', label: 'Utility', description: 'Reminders, AFK, snipe, embeds, time…' },
  info: { emoji: 'ℹ️', label: 'Info', description: 'User, server, role and channel info' },
  search: { emoji: '🔎', label: 'Search & Lookups', description: 'Weather, Wikipedia, dictionary, GitHub, anime…' },
  crypto: { emoji: '🪙', label: 'Crypto & Currency', description: 'Live crypto prices and currency conversion' },
  music: { emoji: '🎵', label: 'Music & 24/7 Voice', description: 'Radio, direct audio, queue, 24/7 voice' },
};

const meta = (name) => CATEGORIES[name] || { emoji: '📁', label: name.charAt(0).toUpperCase() + name.slice(1), description: '' };

module.exports = { CATEGORIES, meta };
