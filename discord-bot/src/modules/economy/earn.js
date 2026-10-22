'use strict';
const { ComponentType } = require('discord.js');
const db = require('../../core/db');
const { randInt, pick, shuffle, formatNumber } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const lib = require('./_lib');
const { ITEMS, label } = require('./_items');

const g = (ctx) => ctx.guild.id;

const FREELANCE = { id: null, name: 'Freelancer', emoji: '🧑‍💻', min: 100, max: 250, shifts: 0, lines: ['delivered some packages', 'walked a neighbour\'s dog', 'fixed a printer', 'mowed a lawn', 'washed some cars'] };
const JOBS = [
  { id: 'janitor', name: 'Janitor', emoji: '🧹', min: 180, max: 320, shifts: 0, lines: ['mopped the school hallway', 'cleaned up a very suspicious stain', 'emptied every trash can in the mall'] },
  { id: 'cashier', name: 'Cashier', emoji: '🧾', min: 260, max: 460, shifts: 5, lines: ['scanned 400 items without a mistake', 'survived a customer asking for the manager', 'counted the till perfectly'] },
  { id: 'chef', name: 'Chef', emoji: '👨‍🍳', min: 400, max: 720, shifts: 15, lines: ['cooked a perfect risotto', 'got a 5-star review', 'survived the dinner rush'] },
  { id: 'mechanic', name: 'Mechanic', emoji: '🔧', min: 600, max: 950, shifts: 30, lines: ['fixed a car nobody else could', 'changed 12 tyres', 'found the weird noise'] },
  { id: 'programmer', name: 'Programmer', emoji: '💻', min: 900, max: 1400, shifts: 50, lines: ['fixed a bug in production', 'closed 7 tickets', 'deleted node_modules and it worked'] },
  { id: 'doctor', name: 'Doctor', emoji: '🩺', min: 1300, max: 2000, shifts: 80, lines: ['saved a life', 'diagnosed a rare disease', 'worked a double shift in the ER'] },
  { id: 'pilot', name: 'Pilot', emoji: '✈️', min: 1800, max: 2700, shifts: 120, lines: ['landed in a storm', 'flew to Tokyo and back', 'gave the smoothest landing ever'] },
  { id: 'astronaut', name: 'Astronaut', emoji: '🧑‍🚀', min: 2600, max: 4000, shifts: 200, lines: ['repaired the space station', 'planted potatoes on Mars', 'took a selfie on the Moon'] },
];
const findJob = (q) => JOBS.find((j) => j.id === String(q || '').toLowerCase() || j.name.toLowerCase() === String(q || '').toLowerCase());

const DONORS = ['A kind stranger', 'Your grandma', 'Elon Musk', 'A passing knight', 'Mr. Beast', 'Gordon Ramsay', 'A lost tourist', 'The tooth fairy', 'Shrek', 'A very rich cat', 'Your neighbour', 'Batman'];
const CRIMES = [
  ['hacked a vending machine', 'the vending machine called the police'],
  ['pickpocketed a millionaire', 'the millionaire had a bodyguard'],
  ['robbed a candy store', 'the owner was a black belt'],
  ['sold fake concert tickets', 'your buyer was an undercover cop'],
  ['stole a famous painting', 'you tripped the laser alarm'],
  ['ran an illegal lemonade stand', 'the health inspector showed up'],
  ['smuggled rare cheese', 'customs smelled it immediately'],
];
const LOCATIONS = [
  { name: 'Couch', emoji: '🛋️', win: 'found coins between the cushions' },
  { name: 'Car', emoji: '🚗', win: 'found cash in the glovebox' },
  { name: 'Sewer', emoji: '🕳️', win: 'found a soggy wallet', risk: 'slipped and dropped some coins' },
  { name: 'Park', emoji: '🌳', win: 'found money under a bench' },
  { name: 'Attic', emoji: '🏚️', win: 'found grandpa\'s old savings' },
  { name: 'Mailbox', emoji: '📫', win: 'found a birthday card with cash' },
  { name: 'Laundry', emoji: '🧺', win: 'found money in your jeans' },
  { name: 'Dumpster', emoji: '🗑️', win: 'found a working watch and sold it', risk: 'got chased by a raccoon and lost coins' },
  { name: 'Bank Vault', emoji: '🏦', win: 'found an unlocked deposit box', risk: 'got fined by security' },
  { name: 'Beach', emoji: '🏖️', win: 'found coins with a metal detector' },
  { name: 'Library', emoji: '📚', win: 'found money used as a bookmark' },
  { name: 'Couch Fort', emoji: '🏰', win: 'found the snack fund' },
];

/** Resolve one search location for the user. */
function searchOutcome(ctx, acc, loc) {
  const chance = 0.75 + lib.luck(acc);
  if (Math.random() < chance) {
    const coins = lib.earn(acc, randInt(100, 1200));
    let extra = '';
    if (Math.random() < 0.08) {
      const id = pick(['cookie', 'padlock', 'lootbox', 'wheatseeds']);
      lib.addItem(acc, id);
      extra = ` and ${label(ITEMS[id], 1)}`;
    }
    return `${loc.emoji} You searched the **${loc.name}** and ${loc.win}: ${lib.money(g(ctx), coins)}${extra}!`;
  }
  if (loc.risk) {
    const lost = lib.take(acc, randInt(50, 300));
    return `${loc.emoji} You searched the **${loc.name}** but ${loc.risk}${lost ? `: -${lib.money(g(ctx), lost)}` : ''}.`;
  }
  return `${loc.emoji} You searched the **${loc.name}** and found… nothing. 🦗`;
}

module.exports = [
  {
    name: 'work',
    aliases: ['shift'],
    description: 'Work a shift at your job for coins',
    guildOnly: true,
    slash: true,
    args: [],
    cooldown: 3,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      if (await lib.onCooldown(ctx, acc, 'work')) return;
      const job = findJob(acc.job) || FREELANCE;
      let pay = randInt(job.min, job.max);
      const bonus = Math.random() < 0.1;
      if (bonus) pay *= 2;
      lib.setCooldown(acc, 'work');
      acc.shifts += 1;
      lib.earn(acc, pay);
      lib.growBank(acc, randInt(100, 400));
      const next = JOBS.find((j) => j.shifts === acc.shifts);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `${job.emoji} ${job.name}`,
            description: `You ${pick(job.lines)} and earned ${lib.money(g(ctx), pay)}${bonus ? ' — **double pay bonus!** 🎉' : '.'}${next ? `\n🔓 You can now apply to be a **${next.name}**: \`applyjob ${next.id}\`` : ''}`,
            footer: `Shift #${acc.shifts}`,
          }),
        ],
      });
    },
  },
  {
    name: 'jobs',
    aliases: ['joblist', 'careers'],
    description: 'List jobs, their pay and how many shifts they require',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      const lines = JOBS.map((j) => {
        const state = acc.job === j.id ? '✅ current' : acc.shifts >= j.shifts ? '🔓 available' : `🔒 ${j.shifts - acc.shifts} more shifts`;
        return `${j.emoji} **${j.name}** (\`${j.id}\`) — ${formatNumber(j.min)}–${formatNumber(j.max)} per shift • ${state}`;
      });
      await ctx.reply({ embeds: [ctx.embed({ title: '💼 Jobs', description: `${lines.join('\n')}\n\nYou have worked **${acc.shifts}** shifts. Apply with \`applyjob <job>\`.` })] });
    },
  },
  {
    name: 'applyjob',
    aliases: ['getjob', 'hire'],
    description: 'Apply for a job you have unlocked',
    usage: '<job>',
    examples: ['janitor', 'astronaut'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const job = findJob(ctx.args[0]);
      if (!job) return ctx.fail(`Unknown job. See \`jobs\` for the list.`);
      const acc = lib.account(g(ctx), ctx.author.id);
      if (acc.job === job.id) return ctx.fail(`You already work as a **${job.name}**.`);
      if (acc.shifts < job.shifts) return ctx.fail(`You need **${job.shifts}** shifts of experience for ${job.name} (you have ${acc.shifts}).`);
      acc.job = job.id;
      db.save();
      await ctx.ok(`Congratulations, you are now a ${job.emoji} **${job.name}**! Use \`work\` to start earning.`);
    },
  },
  {
    name: 'resign',
    aliases: ['quitjob'],
    description: 'Quit your job and go back to freelancing',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      if (!acc.job) return ctx.fail('You do not have a job.');
      const old = findJob(acc.job);
      acc.job = null;
      db.save();
      await ctx.ok(`You quit your job as **${old?.name || 'worker'}**. You keep your shift experience.`);
    },
  },
  {
    name: 'beg',
    description: 'Beg strangers for coins',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      if (await lib.onCooldown(ctx, acc, 'beg')) return;
      lib.setCooldown(acc, 'beg');
      const donor = pick(DONORS);
      if (Math.random() < 0.65 + lib.luck(acc)) {
        const coins = lib.earn(acc, randInt(20, 400));
        let extra = '';
        if (Math.random() < 0.05) {
          lib.addItem(acc, 'cookie');
          extra = ` and a ${label(ITEMS.cookie)}`;
        }
        return ctx.reply({ embeds: [ctx.embed({ description: `🙏 **${donor}** gave you ${lib.money(g(ctx), coins)}${extra}.` })] });
      }
      await ctx.reply({ embeds: [ctx.embed({ description: `🙅 **${donor}**: "${pick(['Get a job!', 'Not today.', 'I only have exact change.', 'Ew, no.', 'Sorry, I left my wallet at home.'])}"` })] });
    },
  },
  {
    name: 'crime',
    description: 'Commit a (fake) crime: big rewards, big fines',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      if (await lib.onCooldown(ctx, acc, 'crime')) return;
      lib.setCooldown(acc, 'crime');
      const [deed, fail] = pick(CRIMES);
      if (Math.random() < 0.55 + lib.luck(acc)) {
        const coins = lib.earn(acc, randInt(400, 2500));
        return ctx.reply({ embeds: [ctx.embed({ color: 0x57f287, description: `🦹 You ${deed} and got away with ${lib.money(g(ctx), coins)}!` })] });
      }
      const fine = lib.take(acc, randInt(250, 1500));
      await ctx.reply({ embeds: [ctx.embed({ color: 0xed4245, description: `🚓 You tried, but ${fail}. You paid a fine of ${lib.money(g(ctx), fine)}.` })] });
    },
  },
  {
    name: 'rob',
    aliases: ['steal'],
    description: 'Try to steal from someone\'s wallet (padlocks stop you)',
    usage: '<@user>',
    examples: ['<@111111111111111111>'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const s = lib.settings(g(ctx));
      if (!s.robEnabled) return ctx.fail('Robbing is disabled in this server.');
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      if (user.id === ctx.author.id) return ctx.fail('You cannot rob yourself.');
      if (user.bot) return ctx.fail('Bots keep their money in the cloud.');
      const acc = lib.account(g(ctx), ctx.author.id);
      if (acc.wallet < s.robMin) return ctx.fail(`You need at least ${lib.money(g(ctx), s.robMin)} in your wallet to rob (to pay fines if you get caught).`);
      const victim = lib.account(g(ctx), user.id);
      if (victim.wallet < s.robMin) return ctx.fail(`<@${user.id}> has less than ${lib.money(g(ctx), s.robMin)} in their wallet. Not worth it.`);
      if (await lib.onCooldown(ctx, acc, 'rob')) return;
      lib.setCooldown(acc, 'rob');

      if (lib.removeItem(victim, 'padlock')) {
        const fine = lib.take(acc, Math.max(250, Math.floor(acc.wallet * 0.1)));
        victim.wallet += fine;
        db.save();
        return ctx.reply({ embeds: [ctx.embed({ color: 0xed4245, description: `🔒 <@${user.id}>'s padlock stopped you (it broke). You dropped ${lib.money(g(ctx), fine)} while running — they kept it.` })] });
      }
      if (Math.random() < 0.4 + lib.luck(acc)) {
        const amount = Math.floor((victim.wallet * randInt(10, 40)) / 100);
        victim.wallet -= amount;
        victim.stats.timesRobbed += 1;
        acc.wallet += amount;
        acc.stats.robbed += amount;
        db.save();
        return ctx.reply({ embeds: [ctx.embed({ color: 0x57f287, description: `💰 You robbed <@${user.id}> and got ${lib.money(g(ctx), amount)}!` })] });
      }
      const fine = lib.take(acc, Math.max(s.robMin, Math.floor(acc.wallet * randInt(10, 25) / 100)));
      victim.wallet += fine;
      db.save();
      await ctx.reply({ embeds: [ctx.embed({ color: 0xed4245, description: `🚨 You got caught robbing <@${user.id}> and paid them ${lib.money(g(ctx), fine)} in damages.` })] });
    },
  },
  {
    name: 'search',
    aliases: ['explore'],
    description: 'Pick a place to search for coins and items',
    usage: '[location]',
    examples: ['', 'couch'],
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      if (await lib.onCooldown(ctx, acc, 'search')) return;
      const choices = shuffle(LOCATIONS).slice(0, 3);
      const direct = ctx.args[0] && LOCATIONS.find((l) => l.name.toLowerCase().startsWith(ctx.rest(0).toLowerCase()));
      lib.setCooldown(acc, 'search');
      if (direct) return ctx.reply({ embeds: [ctx.embed({ description: searchOutcome(ctx, acc, direct) })] });

      const msg = await ctx.reply({
        embeds: [ctx.embed({ title: '🔍 Where do you want to search?', description: 'Pick a location within 20 seconds.' })],
        components: [row(...choices.map((l, i) => button(`srch:${i}`, l.name, 'Secondary', l.emoji)))],
      });
      if (!msg?.awaitMessageComponent) return;
      try {
        const b = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 20000, filter: (x) => x.user.id === ctx.author.id && x.customId.startsWith('srch:') });
        const loc = choices[Number(b.customId.split(':')[1])];
        await b.update({ embeds: [ctx.embed({ description: searchOutcome(ctx, acc, loc) })], components: [] });
      } catch {
        await msg.edit({ embeds: [ctx.embed({ description: '⌛ You took too long and wandered home empty-handed.' })], components: [] }).catch(() => {});
      }
    },
  },
  {
    name: 'postmeme',
    aliases: ['pm'],
    description: 'Post a meme online for ad revenue (needs a 💻 Laptop)',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      if (!lib.itemCount(acc, 'laptop')) return ctx.fail('You need a 💻 **Laptop** to post memes. Buy one with `buy laptop`.');
      if (await lib.onCooldown(ctx, acc, 'postmeme')) return;
      lib.setCooldown(acc, 'postmeme');
      const kind = pick(['a dank meme', 'a wholesome meme', 'a cursed image', 'a cat video', 'a reaction GIF', 'a shitpost', 'a political meme', 'a gaming clip']);
      const r = Math.random();
      let text;
      if (r < 0.08) text = `🔥 **VIRAL!** Your ${kind} hit the front page: ${lib.money(g(ctx), lib.earn(acc, randInt(2000, 5000)))}.`;
      else if (r < 0.7) text = `📈 Your ${kind} got some upvotes: ${lib.money(g(ctx), lib.earn(acc, randInt(150, 900)))}.`;
      else text = `📉 Your ${kind} flopped. 0 upvotes, 3 angry comments.`;
      if (Math.random() < 0.02 && lib.removeItem(acc, 'laptop')) text += '\n💥 Your laptop overheated and **broke**!';
      await ctx.reply({ embeds: [ctx.embed({ description: text })] });
    },
  },
  {
    name: 'scavenge',
    aliases: ['forage'],
    description: 'Scavenge the streets for coins and random items',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      if (await lib.onCooldown(ctx, acc, 'scavenge')) return;
      lib.setCooldown(acc, 'scavenge');
      const found = [];
      const coins = Math.random() < 0.8 ? lib.earn(acc, randInt(50, 600)) : 0;
      if (coins) found.push(lib.money(g(ctx), coins));
      const pool = ['wood', 'stone', 'apple', 'boot', 'bone', 'cookie', 'acorn', 'worm'];
      const n = randInt(0, 2);
      for (let i = 0; i < n; i++) {
        const id = pick(pool);
        lib.addItem(acc, id);
        found.push(label(ITEMS[id], 1));
      }
      if (Math.random() < 0.03) {
        lib.addItem(acc, 'lootbox');
        found.push(`✨ ${label(ITEMS.lootbox, 1)}`);
      }
      await ctx.reply({ embeds: [ctx.embed({ description: found.length ? `🧭 You scavenged and found:\n${found.join('\n')}` : '🧭 You scavenged for an hour and found nothing but pigeons.' })] });
    },
  },
];

module.exports.JOBS = JOBS;
