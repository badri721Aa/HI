'use strict';
const { fetchJson, pick, chunk } = require('../../core/utils');
const { paginate } = require('../../core/ui');
const FACTS = require('./_facts');

const CAT_FACTS = [
  'Cats sleep for around 12–16 hours a day.', 'A group of cats is called a clowder.', 'Cats usually have five toes on their front paws and four on their back paws.',
  'Cats can rotate their ears about 180 degrees.', "A cat's nose print is unique, much like a human fingerprint.", "Cats can't taste sweetness.",
  'Adult cats mostly meow to talk to humans, not to other cats.', 'A cat was found buried with a human in a roughly 9,500-year-old grave on Cyprus.',
  'Cats have a third eyelid called the nictitating membrane.', 'Most cats have 24 whiskers, 12 on each side of the face.', 'Kittens are born with blue eyes.',
  "A cat's purr vibrates at a low frequency of roughly 25–150 Hz.",
];
const DOG_FACTS = [
  "A dog's nose print is unique, like a human fingerprint.", 'Dogs have hundreds of millions of scent receptors — far more than humans.',
  "Basenjis don't bark; they make a yodel-like sound.", 'Dalmatian puppies are born completely white.', 'Dogs sweat mainly through the pads of their paws.',
  'Greyhounds can reach speeds of about 70 km/h.', 'Puppies are born with their eyes and ears closed.', 'The average dog can learn around 150 words.',
  'Dogs curl up when they sleep to keep warm and protect their organs.', 'Dogs can hear much higher-pitched sounds than humans can.',
  'Laika, a Soviet street dog, was one of the first animals to orbit the Earth in 1957.', 'The Labrador Retriever has long been one of the most popular dog breeds.',
];

const HTTP_STATUS = {
  100: 'Continue', 101: 'Switching Protocols', 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content',
  301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  406: 'Not Acceptable', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 411: 'Length Required', 412: 'Precondition Failed',
  413: 'Payload Too Large', 414: 'URI Too Long', 415: 'Unsupported Media Type', 416: 'Range Not Satisfiable', 417: 'Expectation Failed',
  418: "I'm a teapot", 422: 'Unprocessable Content', 425: 'Too Early', 426: 'Upgrade Required', 429: 'Too Many Requests',
  431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons', 500: 'Internal Server Error', 501: 'Not Implemented',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

/** Image command with a friendly failure message. */
function imageCommand({ name, aliases = [], description, emoji, title, fetchImage, slash }) {
  const cmd = {
    name,
    aliases,
    description,
    examples: [''],
    cooldown: 2,
    async execute(ctx) {
      await ctx.defer();
      try {
        const { url, footer } = await fetchImage(ctx);
        await ctx.reply({ embeds: [ctx.embed({ title: `${emoji} ${title}`, image: url, footer })] });
      } catch (err) {
        if (err.userMessage) throw err;
        await ctx.fail(`Couldn't fetch a ${title.toLowerCase()} picture right now — the image service isn't answering. Try again soon!`);
      }
    },
  };
  if (slash) {
    cmd.slash = true;
    cmd.args = [];
  }
  return cmd;
}

function httpImage(name, site, emoji) {
  return {
    name,
    description: `The HTTP status code as a ${name === 'httpcat' ? 'cat' : 'dog'} picture (${site})`,
    usage: '<status code>',
    examples: ['404', '418'],
    minArgs: 1,
    async execute(ctx) {
      const code = parseInt(ctx.args[0], 10);
      if (!HTTP_STATUS[code]) return ctx.fail(`Unknown status code. Try one of: ${Object.keys(HTTP_STATUS).join(', ')}`);
      await ctx.reply({ embeds: [ctx.embed({ title: `${emoji} ${code} ${HTTP_STATUS[code]}`, image: `https://${site}/${code}.jpg`, footer: site })] });
    },
  };
}

function factCommand([name, emoji, label, facts]) {
  return {
    name,
    description: `A random ${label.toLowerCase()} fact`,
    examples: [''],
    async execute(ctx) {
      await ctx.reply({ embeds: [ctx.embed({ title: `${emoji} ${label} fact`, description: pick(facts) })] });
    },
  };
}

module.exports = [
  imageCommand({
    name: 'cat',
    aliases: ['kitty', 'meow'],
    description: 'A random cat picture',
    emoji: '🐱',
    title: 'Cat',
    slash: true,
    async fetchImage() {
      const arr = await fetchJson('https://api.thecatapi.com/v1/images/search');
      if (!arr?.[0]?.url) throw new Error('no cat');
      return { url: arr[0].url, footer: 'thecatapi.com' };
    },
  }),
  {
    name: 'dog',
    aliases: ['doggo', 'woof', 'puppy'],
    description: 'A random dog picture — optionally of a breed (e.g. dog husky)',
    usage: '[breed]',
    examples: ['', 'husky', 'golden retriever'],
    cooldown: 2,
    slash: true,
    args: [{ name: 'breed', type: 'string', description: 'Breed, e.g. husky or golden retriever', required: false, rest: true }],
    async execute(ctx) {
      const words = ctx.args.map((w) => w.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
      const paths = [];
      if (!words.length) paths.push('breeds/image/random');
      else if (words.length === 1) paths.push(`breed/${words[0]}/images/random`);
      else {
        const [a, b] = [words.slice(0, -1).join(''), words[words.length - 1]];
        paths.push(`breed/${b}/${a}/images/random`, `breed/${a}/${b}/images/random`, `breed/${words.join('')}/images/random`);
      }
      await ctx.defer();
      let networkError = false;
      for (const p of paths) {
        try {
          const j = await fetchJson(`https://dog.ceo/api/${p}`);
          if (j?.status === 'success' && j.message) {
            const breed = p.startsWith('breed/') ? p.split('/').slice(1, -2).reverse().join(' ') : null;
            return ctx.reply({ embeds: [ctx.embed({ title: `🐶 ${breed ? breed.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Dog'}`, image: j.message, footer: 'dog.ceo' })] });
          }
        } catch (err) {
          if (err.status !== 404) networkError = true;
        }
      }
      if (networkError) return ctx.fail("Couldn't fetch a dog picture right now — the image service isn't answering. Try again soon!");
      return ctx.fail(`I don't know that breed. See \`${ctx.prefix}dogbreeds\` for the list.`);
    },
  },
  {
    name: 'dogbreeds',
    aliases: ['breeds'],
    description: 'List every dog breed the dog command knows',
    examples: [''],
    async execute(ctx) {
      await ctx.defer();
      try {
        const j = await fetchJson('https://dog.ceo/api/breeds/list/all');
        const names = Object.entries(j.message || {}).flatMap(([breed, subs]) => (subs.length ? subs.map((s) => `${s} ${breed}`) : [breed])).sort();
        const pages = chunk(names, 60).map((group, i, all) =>
          ctx.embed({ title: `🐕 Dog breeds (${names.length})`, description: group.map((n) => `\`${n}\``).join(' '), footer: `Page ${i + 1}/${all.length} • use: ${ctx.prefix}dog <breed>` }),
        );
        await paginate(ctx, pages);
      } catch {
        await ctx.fail("Couldn't load the breed list right now. Try again soon!");
      }
    },
  },
  imageCommand({
    name: 'fox',
    aliases: ['floof'],
    description: 'A random fox picture',
    emoji: '🦊',
    title: 'Fox',
    async fetchImage() {
      const j = await fetchJson('https://randomfox.ca/floof/');
      if (!j?.image) throw new Error('no fox');
      return { url: j.image, footer: 'randomfox.ca' };
    },
  }),
  imageCommand({
    name: 'duck',
    aliases: ['quack'],
    description: 'A random duck picture',
    emoji: '🦆',
    title: 'Duck',
    async fetchImage() {
      const j = await fetchJson('https://random-d.uk/api/v2/random');
      if (!j?.url) throw new Error('no duck');
      return { url: j.url, footer: 'random-d.uk' };
    },
  }),
  {
    name: 'catfact',
    description: 'A random cat fact',
    examples: [''],
    async execute(ctx) {
      await ctx.defer();
      let fact;
      let online = true;
      try {
        const j = await fetchJson('https://catfact.ninja/fact');
        fact = j?.fact;
        if (!fact) throw new Error('no fact');
      } catch {
        fact = pick(CAT_FACTS);
        online = false;
      }
      await ctx.reply({ embeds: [ctx.embed({ title: '🐱 Cat fact', description: fact, footer: online ? 'catfact.ninja' : 'offline fallback' })] });
    },
  },
  {
    name: 'dogfact',
    description: 'A random dog fact',
    examples: [''],
    async execute(ctx) {
      await ctx.defer();
      let fact;
      let online = true;
      try {
        const j = await fetchJson('https://dogapi.dog/api/v2/facts');
        fact = j?.data?.[0]?.attributes?.body;
        if (!fact) throw new Error('no fact');
      } catch {
        fact = pick(DOG_FACTS);
        online = false;
      }
      await ctx.reply({ embeds: [ctx.embed({ title: '🐶 Dog fact', description: fact, footer: online ? 'dogapi.dog' : 'offline fallback' })] });
    },
  },
  httpImage('httpcat', 'http.cat', '🐱'),
  httpImage('httpdog', 'http.dog', '🐶'),
  {
    name: 'animalfact',
    aliases: ['afact'],
    description: 'A random fact about a random (or chosen) animal',
    usage: `[${FACTS.slice(0, 5).map((f) => f[2].toLowerCase().split(' ').pop()).join('|')}|…]`,
    examples: ['', 'octopus'],
    async execute(ctx) {
      const q = String(ctx.args.join(' ') || '').toLowerCase();
      const pool = q ? FACTS.filter(([n, , label]) => n.startsWith(q.replace(/\s+/g, '')) || label.toLowerCase().includes(q)) : FACTS;
      if (!pool.length) return ctx.fail(`I don't have facts about that. Try: ${FACTS.map((f) => f[2].toLowerCase()).join(', ')}`);
      const [, emoji, label, facts] = pick(pool);
      await ctx.reply({ embeds: [ctx.embed({ title: `${emoji} ${label} fact`, description: pick(facts) })] });
    },
  },
  ...FACTS.map(factCommand),
];
