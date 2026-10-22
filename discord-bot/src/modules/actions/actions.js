'use strict';
/**
 * Anime GIF roleplay actions (nekos.best). Each row becomes a command:
 *   [command, nekos.best category, emoji, text with target, text alone, counter noun]
 */
const db = require('../../core/db');
const { fetchJson } = require('../../core/utils');

const ACTIONS = [
  ['baka', 'baka', '😤', '{a} calls {b} a baka!', '{a} yells BAKA!'],
  ['bite', 'bite', '😬', '{a} bites {b}!', '{a} bites the air.', 'bites'],
  ['blush', 'blush', '😳', '{a} blushes because of {b}.', '{a} is blushing.'],
  ['bored', 'bored', '😑', '{a} is bored of {b}.', '{a} is bored.'],
  ['cry', 'cry', '😢', '{a} cries on {b}\'s shoulder.', '{a} is crying.'],
  ['cuddle', 'cuddle', '🤗', '{a} cuddles {b}.', '{a} wants cuddles.', 'cuddles'],
  ['dance', 'dance', '💃', '{a} dances with {b}!', '{a} is dancing!', 'dances'],
  ['facepalm', 'facepalm', '🤦', '{a} facepalms at {b}.', '{a} facepalms.'],
  ['feed', 'feed', '🍙', '{a} feeds {b}.', '{a} is having a snack.', 'feedings'],
  ['handhold', 'handhold', '🤝', '{a} holds {b}\'s hand.', '{a} wants to hold hands.', 'hand-holds'],
  ['handshake', 'handshake', '🤝', '{a} shakes hands with {b}.', '{a} offers a handshake.', 'handshakes'],
  ['happy', 'happy', '😄', '{a} is happy to see {b}!', '{a} is happy!'],
  ['highfive', 'highfive', '✋', '{a} high-fives {b}!', '{a} wants a high five!', 'high-fives'],
  ['hug', 'hug', '🫂', '{a} hugs {b}!', '{a} wants a hug.', 'hugs'],
  ['kickrp', 'kick', '🦵', '{a} kicks {b}!', '{a} kicks the air.', 'kicks'],
  ['kiss', 'kiss', '😘', '{a} kisses {b}!', '{a} blows a kiss.', 'kisses'],
  ['laugh', 'laugh', '😂', '{a} laughs at {b}!', '{a} is laughing.'],
  ['lurk', 'lurk', '👀', '{a} lurks around {b}…', '{a} is lurking…'],
  ['nod', 'nod', '🙂', '{a} nods at {b}.', '{a} nods.'],
  ['nom', 'nom', '😋', '{a} noms on {b}!', '{a} is nomming.', 'noms'],
  ['nope', 'nope', '🙅', '{a} says nope to {b}.', '{a} says nope.'],
  ['pat', 'pat', '🫳', '{a} pats {b}.', '{a} wants headpats.', 'pats'],
  ['peck', 'peck', '😚', '{a} gives {b} a little peck.', '{a} sends a little peck.', 'pecks'],
  ['poke', 'poke', '👉', '{a} pokes {b}.', '{a} pokes around.', 'pokes'],
  ['pout', 'pout', '😤', '{a} pouts at {b}.', '{a} is pouting.'],
  ['punch', 'punch', '👊', '{a} punches {b}!', '{a} punches the air.', 'punches'],
  ['shoot', 'shoot', '💥', '{a} shoots at {b} — pew pew!', '{a} goes pew pew!', 'shots'],
  ['shrug', 'shrug', '🤷', '{a} shrugs at {b}.', '{a} shrugs.'],
  ['slap', 'slap', '👋', '{a} slaps {b}!', '{a} slaps the air.', 'slaps'],
  ['sleep', 'sleep', '😴', '{a} falls asleep on {b}.', '{a} is sleeping.'],
  ['smile', 'smile', '😊', '{a} smiles at {b}.', '{a} smiles.', 'smiles'],
  ['smug', 'smug', '😏', '{a} looks smugly at {b}.', '{a} looks smug.'],
  ['stare', 'stare', '👁️', '{a} stares at {b}.', '{a} is staring…'],
  ['think', 'think', '🤔', '{a} is thinking about {b}.', '{a} is thinking.'],
  ['thumbsup', 'thumbsup', '👍', '{a} gives {b} a thumbs up!', '{a} gives a thumbs up!'],
  ['tickle', 'tickle', '🤭', '{a} tickles {b}!', '{a} wants to tickle someone.', 'tickles'],
  ['wave', 'wave', '👋', '{a} waves at {b}!', '{a} waves!', 'waves'],
  ['wink', 'wink', '😉', '{a} winks at {b}.', '{a} winks.', 'winks'],
  ['yawn', 'yawn', '🥱', '{a} yawns at {b}.', '{a} yawns.'],
  ['yeet', 'yeet', '🚀', '{a} yeets {b}!', '{a} yeets something into orbit!', 'yeets'],
];

const nameOf = (u) => u?.displayName || u?.globalName || u?.username || 'someone';
const ACTION_NAMES = new Set(ACTIONS.map((a) => a[0]));

async function gif(category) {
  const data = await fetchJson(`https://nekos.best/api/v2/${category}`, { timeout: 6000 });
  const r = data?.results?.[0];
  if (!r?.url) throw new Error('no gif');
  return { url: r.url, source: r.anime_name || null };
}

function makeAction([name, category, emoji, withTarget, alone, noun]) {
  const cmd = {
    name,
    description: `${emoji} ${alone.replace('{a}', 'You').replace(/\.$|!$|…$/, '')} — anime GIF${noun ? ' (counts per pair)' : ''}`.slice(0, 100),
    usage: '[@user]',
    examples: ['', '<@111111111111111111>'],
    cooldown: 3,
    async execute(ctx) {
      const target = ctx.args[0] ? await ctx.resolveUser(ctx.args[0]) : null;
      if (ctx.args[0] && !target) return ctx.fail('I could not find that user.');
      const a = `**${nameOf(ctx.member || ctx.author)}**`;
      const solo = !target || target.id === ctx.author.id;
      let text = solo ? alone.replace('{a}', a) : withTarget.replace('{a}', a).replace('{b}', `**${nameOf(target)}**`);
      if (!solo && noun) {
        const n = db.update('actions', `${name}:${ctx.author.id}:${target.id}`, (v) => (v || 0) + 1, 0);
        text += `\n-# That's ${n} ${noun} from ${nameOf(ctx.author)} to ${nameOf(target)}!`;
      }
      let image = null;
      let footer = null;
      try {
        const g = await gif(category);
        image = g.url;
        footer = g.source ? `From: ${g.source} • nekos.best` : 'nekos.best';
      } catch {
        footer = 'GIF service is unavailable right now';
      }
      await ctx.reply({ embeds: [ctx.embed({ description: `${emoji} ${text}`, image, footer })], allowedMentions: { parse: [] } });
    },
  };
  if (name === 'hug') {
    cmd.slash = true;
    cmd.args = [{ name: 'user', type: 'user', description: 'Who to hug', required: false }];
  }
  return cmd;
}

const stats = {
  name: 'actionstats',
  aliases: ['rpstats'],
  description: 'How many hugs, pats, etc. someone has given and received',
  usage: '[@user]',
  examples: [''],
  async execute(ctx) {
    const u = await ctx.targetUser(0);
    const given = {};
    const received = {};
    for (const [key, n] of db.entries('actions')) {
      const [action, from, to] = key.split(':');
      if (!to || !ACTION_NAMES.has(action)) continue;
      if (from === u.id) given[action] = (given[action] || 0) + n;
      if (to === u.id) received[action] = (received[action] || 0) + n;
    }
    const fmt = (o) =>
      Object.entries(o)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 12)
        .map(([k, v]) => `\`${k}\` ×${v}`)
        .join(' • ') || '—';
    await ctx.reply({ embeds: [ctx.embed({ title: `🤗 Action stats — ${nameOf(u)}`, fields: [{ name: 'Given', value: fmt(given) }, { name: 'Received', value: fmt(received) }] })] });
  },
};

module.exports = [...ACTIONS.map(makeAction), stats];
module.exports.ACTIONS = ACTIONS;
