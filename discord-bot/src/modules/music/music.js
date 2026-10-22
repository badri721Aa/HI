'use strict';
const { PermissionFlagsBits, ComponentType, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { paginate, button, row } = require('../../core/ui');
const { chunk, formatDuration, truncate, shuffle } = require('../../core/utils');
const { assertSafeUrl } = require('../../core/voice');
const embeds = require('../../core/embeds');
const { SOMA, GENRES, somaTrack, stationTrack, searchStations, genreTrack } = require('./_radio');

const UNSUPPORTED = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|music\.apple\.com|deezer\.com|tidal\.com)$/i;

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });

/** Join (or reuse) the author's voice channel and return the guild's audio player. */
async function ensureVoice(ctx) {
  const g = ctx.audio.get(ctx.guild.id);
  const vc = ctx.member?.voice?.channel;
  if (g.channelId) {
    if (vc && vc.id !== g.channelId && !g.current) await joinChannel(ctx, g, vc);
    g.textChannelId = ctx.channel.id;
    return g;
  }
  if (!vc) throw userError('Join a voice channel first (or use `247` to pin me to one).');
  await joinChannel(ctx, g, vc);
  return g;
}

async function joinChannel(ctx, g, vc) {
  const perms = vc.permissionsFor(ctx.guild.members.me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    throw userError(`I need **View Channel**, **Connect** and **Speak** in ${vc}.`);
  }
  if (vc.full && !perms.has(PermissionFlagsBits.MoveMembers)) throw userError(`${vc} is full.`);
  await g.join(vc, ctx.channel.id);
}

/** Controls require being in the bot's channel, unless you can manage the server. */
function requireListener(ctx, g) {
  if (!g?.channelId) throw userError('I am not in a voice channel.');
  if (ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
  if (ctx.member.voice?.channelId !== g.channelId) throw userError(`Join <#${g.channelId}> to control playback.`);
}

function trackLine(t, i) {
  return `${i !== undefined ? `**${i}.** ` : ''}${t.live ? '🔴' : '🎵'} ${truncate(t.title, 70)}${t.requestedBy ? ` — <@${t.requestedBy}>` : ''}`;
}

function controls() {
  return row(
    button('mu:pause', null, 'Secondary', '⏯️'),
    button('mu:skip', null, 'Secondary', '⏭️'),
    button('mu:stop', null, 'Danger', '⏹️'),
    button('mu:voldown', null, 'Secondary', '🔉'),
    button('mu:volup', null, 'Secondary', '🔊'),
  );
}

function nowPlayingEmbed(ctx, g) {
  const t = g.current;
  if (!t) return ctx.embed({ description: '⏹️ Nothing is playing.' });
  return ctx.embed({
    title: `${t.live ? '🔴 Live radio' : '🎶 Now playing'}`,
    description: `**${t.homepage ? `[${t.title}](${t.homepage})` : t.title}**${t.description ? `\n${t.description}` : ''}`,
    thumbnail: t.thumbnail || undefined,
    fields: [
      { name: 'Elapsed', value: formatDuration(g.elapsed), inline: true },
      { name: 'Volume', value: `${g.volume}%`, inline: true },
      { name: 'Loop', value: g.loop, inline: true },
      { name: 'Up next', value: g.queue[0] ? truncate(g.queue[0].title, 80) : 'Nothing', inline: true },
      { name: '24/7', value: g.is247 ? 'On' : 'Off', inline: true },
      { name: 'Requested by', value: t.requestedBy ? `<@${t.requestedBy}>` : 'Auto (24/7)', inline: true },
    ],
  });
}

async function startTrack(ctx, g, track, { replace = false } = {}) {
  let state;
  if (replace) {
    g.playNow(track);
    state = 'playing';
  } else if (g.current?.live) {
    // Live radio never "ends", so a queued track would wait forever: switch over now.
    g.stream(track);
    state = 'playing';
  } else {
    state = g.enqueue(track);
  }
  // In 24/7 mode, radio stations become the station that auto-resumes after restarts.
  if (g.is247 && track.live) ctx.audio.enable247(ctx.guild.id, g.channelId, ctx.channel.id, { ...track, requestedBy: null });
  const verb = state === 'playing' ? (track.live ? '📻 Tuned in to' : '▶️ Playing') : `➕ Queued (#${g.queue.length})`;
  return ctx.reply({
    embeds: [ctx.embed({ description: `${verb} **${track.title}**${track.description ? `\n${track.description}` : ''}`, thumbnail: track.thumbnail || undefined })],
    components: state === 'playing' ? [controls()] : [],
  });
}

async function playRadioQuery(ctx, query, opts) {
  const key = query.toLowerCase().replace(/\s+/g, '');
  if (SOMA[key]) return startTrack(ctx, await ensureVoice(ctx), somaTrack(key, ctx.author.id), opts);
  if (GENRES[key]) return startTrack(ctx, await ensureVoice(ctx), await genreTrack(key, ctx.author.id), opts);
  await ctx.defer();
  const list = await searchStations(query);
  if (!list.length) throw userError(`No radio station found for **${truncate(query, 50)}**. Try \`${ctx.prefix}radiosearch ${truncate(query, 30)}\` or \`${ctx.prefix}radios\`.`);
  return startTrack(ctx, await ensureVoice(ctx), stationTrack(list[0], ctx.author.id), opts);
}

async function urlTrack(ctx, url, title) {
  const safe = assertSafeUrl(url);
  const host = new URL(safe).hostname;
  if (UNSUPPORTED.test(host)) {
    throw userError(
      'YouTube/Spotify/SoundCloud links are not supported: streaming them breaks those services\' Terms of Service (it is why big music bots were shut down). ' +
        `Use radio (\`${ctx.prefix}radio\`, \`${ctx.prefix}lofi\`…), a direct audio link (.mp3/.ogg/.m3u8), or upload an audio file.`,
    );
  }
  // Cheap sanity check: reject web pages before handing the URL to ffmpeg.
  try {
    const res = await fetch(safe, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000) });
    const type = res.headers.get('content-type') || '';
    if (/text\/html/i.test(type)) throw userError('That link is a web page, not an audio file. Link directly to an .mp3/.ogg/.m3u8 stream or upload the file.');
  } catch (err) {
    if (err.userMessage) throw err; // HEAD unsupported/timeouts are fine — ffmpeg will try anyway
  }
  const name = decodeURIComponent(new URL(safe).pathname.split('/').pop() || host).replace(/\.[a-z0-9]{2,4}$/i, '');
  const live = /\.(m3u8|pls)$|\/stream|\/live|icecast|shoutcast|:\d{4}\//i.test(safe);
  return { title: title || truncate(name, 90) || host, url: safe, live, source: 'url', requestedBy: ctx.author.id };
}

const VOICE = { guildOnly: true, botPerms: ['Connect', 'Speak'] };

const commands = [
  {
    name: 'join',
    description: 'Join your voice channel (or a named one)',
    usage: '[voice channel]',
    ...VOICE,
    async execute(ctx) {
      const target = ctx.args[0] ? ctx.resolveChannel(ctx.rest(0)) : ctx.member.voice?.channel;
      if (!target?.isVoiceBased?.()) return ctx.fail('Join a voice channel first, or name one: `join General`.');
      const g = ctx.audio.get(ctx.guild.id);
      await joinChannel(ctx, g, target);
      if (g.is247) ctx.audio.enable247(ctx.guild.id, target.id, ctx.channel.id);
      await ctx.ok(`Joined ${target}. I join **self-deafened**, so I never hear anyone. ${g.is247 ? '24/7 is on.' : `Use \`${ctx.prefix}247\` to make me stay forever.`}`);
    },
  },
  {
    name: 'leave',
    aliases: ['dc', 'disconnect'],
    description: 'Leave the voice channel (also turns 24/7 off)',
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      if (!g?.channelId) return ctx.fail('I am not in a voice channel.');
      if (g.is247 && !ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) return ctx.fail('24/7 mode is on — only someone with **Manage Server** can make me leave.');
      requireListener(ctx, g);
      ctx.audio.disable247(ctx.guild.id);
      g.leave();
      await ctx.ok('Left the voice channel. 👋');
    },
  },
  {
    name: '247',
    aliases: ['24-7', 'stay', 'alwayson'],
    description: 'Toggle 24/7 mode: stay in voice forever, rejoin after restarts, resume radio',
    usage: '[on | off]',
    examples: ['on', 'off'],
    userPerms: ['ManageGuild'],
    slash: true,
    args: [{ name: 'mode', type: 'string', description: 'on or off (toggles if empty)', required: false, choices: ['on', 'off'] }],
    ...VOICE,
    async execute(ctx) {
      const g = ctx.audio.get(ctx.guild.id);
      const want = ctx.args[0] ? ctx.args[0].toLowerCase() === 'on' : !g.is247;
      if (!want) {
        ctx.audio.disable247(ctx.guild.id);
        g.scheduleLeave(2 * 60 * 1000);
        return ctx.ok('24/7 mode **off**. I will leave when the channel is empty or the queue ends.');
      }
      await ensureVoice(ctx);
      const station = g.current?.live ? { ...g.current, requestedBy: null } : null;
      ctx.audio.enable247(ctx.guild.id, g.channelId, ctx.channel.id, station);
      await ctx.ok(
        `24/7 mode **on** in <#${g.channelId}>. I will stay there forever, rejoin if disconnected, and come back after restarts.` +
          (station ? `\nAuto-resume station: **${station.title}**.` : `\nTip: start a station (\`${ctx.prefix}radio groovesalad\`) and I will keep playing it 24/7.`),
      );
    },
  },
  {
    name: 'play',
    aliases: ['p'],
    description: 'Play a radio station, a direct audio link, or an uploaded audio file',
    usage: '<station name | audio URL | (attach a file)>',
    examples: ['groovesalad', 'bbc radio 1', 'https://example.com/song.mp3'],
    slash: true,
    args: [
      { name: 'query', type: 'string', description: 'Station name or direct audio link', required: false, rest: true },
      { name: 'file', type: 'attachment', description: 'An audio file to play', required: false },
    ],
    cooldown: 3,
    ...VOICE,
    async execute(ctx) {
      const file = ctx.attachments.find((a) => /^(audio|video)\//.test(a.contentType || '') || /\.(mp3|ogg|opus|wav|flac|m4a|aac|webm|mp4)$/i.test(a.name || ''));
      const q = ctx.rest(0);
      if (file) return startTrack(ctx, await ensureVoice(ctx), { title: truncate(file.name, 90), url: file.url, live: false, source: 'file', requestedBy: ctx.author.id });
      if (!q) return ctx.usage(`Try a station like \`${ctx.prefix}play lofi\`, a direct audio link, or attach an audio file.`);
      if (/^https?:\/\//i.test(q)) return startTrack(ctx, await ensureVoice(ctx), await urlTrack(ctx, ctx.args[0]));
      return playRadioQuery(ctx, q);
    },
  },
  {
    name: 'radio',
    description: 'Tune in to a radio station (preset, genre or any of 30,000+ stations by name)',
    usage: '[station]',
    examples: ['groovesalad', 'jazz', 'kexp'],
    slash: true,
    args: [{ name: 'station', type: 'string', description: 'Preset id, genre, or station name', required: false, rest: true }],
    cooldown: 3,
    ...VOICE,
    async execute(ctx) {
      if (!ctx.args.length) return listStations(ctx);
      return playRadioQuery(ctx, ctx.rest(0), { replace: true });
    },
  },
  {
    name: 'radios',
    aliases: ['stations'],
    description: 'List the built-in radio presets and genre shortcuts',
    async execute(ctx) {
      return listStations(ctx);
    },
  },
  {
    name: 'radiosearch',
    description: 'Search 30,000+ internet radio stations and pick one to play',
    usage: '<name or genre>',
    examples: ['lofi', 'bbc', 'classical'],
    minArgs: 1,
    cooldown: 4,
    guildOnly: true,
    async execute(ctx) {
      await ctx.defer();
      const q = ctx.rest(0);
      let list = await searchStations(q);
      if (list.length < 3) list = [...list, ...(await searchStations(q, { byTag: true }).catch(() => []))];
      const seen = new Set();
      list = list.filter((s) => !seen.has(s.stationuuid) && seen.add(s.stationuuid)).slice(0, 10);
      if (!list.length) return ctx.fail(`No stations found for **${truncate(q, 50)}**.`);
      const menu = new StringSelectMenuBuilder()
        .setCustomId('rs:pick')
        .setPlaceholder('▶️ Pick a station to play')
        .addOptions(list.map((s, i) => ({ label: truncate(s.name.trim() || 'Unknown', 100), value: String(i), description: truncate([s.country, s.tags?.split(',').slice(0, 3).join(', ')].filter(Boolean).join(' • ') || 'Radio', 100) })));
      const msg = await ctx.reply({
        embeds: [ctx.embed({ title: `📻 Stations for "${truncate(q, 40)}"`, description: list.map((s, i) => `**${i + 1}.** ${truncate(s.name.trim(), 60)} ${s.countrycode ? `(${s.countrycode})` : ''} ${s.bitrate ? `• ${s.bitrate}kbps` : ''}`).join('\n') })],
        components: [row(menu)],
      });
      if (!msg?.createMessageComponentCollector) return;
      const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
      collector.on('collect', async (i) => {
        if (i.user.id !== ctx.author.id) return i.reply({ content: 'Run the command yourself to pick a station.', flags: MessageFlags.Ephemeral });
        collector.stop('picked');
        await i.deferUpdate();
        try {
          const g = await ensureVoice(ctx);
          await startTrack(ctx, g, stationTrack(list[Number(i.values[0])], ctx.author.id), { replace: true });
        } catch (err) {
          await ctx.fail(err.userMessage || 'Could not play that station.');
        }
      });
      collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    },
  },
  {
    name: 'stop',
    description: 'Stop playback and clear the queue (stays in the channel)',
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      g.stopAll(true);
      await ctx.ok('Stopped and cleared the queue.');
    },
  },
  {
    name: 'pause',
    description: 'Pause playback',
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      if (!g.current) return ctx.fail('Nothing is playing.');
      g.pause();
      await ctx.ok('Paused. ⏸️');
    },
  },
  {
    name: 'resume',
    aliases: ['unpause'],
    description: 'Resume playback',
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      if (!g.current) return ctx.fail('Nothing is playing.');
      g.resume();
      await ctx.ok('Resumed. ▶️');
    },
  },
  {
    name: 'skip',
    aliases: ['next'],
    description: 'Skip to the next track in the queue',
    guildOnly: true,
    slash: true,
    args: [],
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      if (!g.current) return ctx.fail('Nothing is playing.');
      const was = g.skip();
      await ctx.ok(`Skipped **${truncate(was.title, 80)}**.${g.queue.length ? '' : ' The queue is empty now.'}`);
    },
  },
  {
    name: 'queue',
    aliases: ['q'],
    description: 'Show the queue',
    guildOnly: true,
    slash: true,
    args: [],
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      if (!g?.current && !g?.queue.length) return ctx.info('The queue is empty.');
      const pages = chunk(g.queue, 10);
      const head = `**Now:** ${g.current ? trackLine(g.current) : 'nothing'}\n\n`;
      const views = (pages.length ? pages : [[]]).map((p, i, all) =>
        ctx.embed({
          title: `🎶 Queue — ${g.queue.length} track${g.queue.length === 1 ? '' : 's'}`,
          description: head + (p.map((t, j) => trackLine(t, i * 10 + j + 1)).join('\n') || '_Nothing queued._'),
          footer: `Page ${i + 1}/${all.length} • loop: ${g.loop} • volume: ${g.volume}%`,
        }),
      );
      await paginate(ctx, views);
    },
  },
  {
    name: 'nowplaying',
    aliases: ['np', 'current'],
    description: 'Show what is playing, with control buttons',
    guildOnly: true,
    slash: true,
    args: [],
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      if (!g?.current) return ctx.info('Nothing is playing.');
      await ctx.reply({ embeds: [nowPlayingEmbed(ctx, g)], components: [controls()] });
    },
  },
  {
    name: 'volume',
    aliases: ['vol'],
    description: 'Show or set the volume (1–200%)',
    usage: '[1-200]',
    examples: ['50', '150'],
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      if (!ctx.args[0]) return ctx.info(`🔊 Volume: **${g?.volume ?? 100}%**`);
      requireListener(ctx, g);
      const v = Number(ctx.args[0].replace('%', ''));
      if (!Number.isInteger(v) || v < 1 || v > 200) return ctx.usage('Volume must be a whole number from 1 to 200.');
      g.setVolume(v);
      await ctx.ok(`Volume set to **${v}%**.`);
    },
  },
  {
    name: 'loop',
    description: 'Loop mode: off, track or queue',
    usage: '<off | track | queue>',
    examples: ['track', 'queue', 'off'],
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      const order = ['off', 'track', 'queue'];
      const mode = ctx.args[0]?.toLowerCase() || order[(order.indexOf(g.loop) + 1) % 3];
      if (!order.includes(mode)) return ctx.usage();
      g.loop = mode;
      await ctx.ok(`Loop: **${mode}**.`);
    },
  },
  {
    name: 'shuffle',
    description: 'Shuffle the queue',
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      if (g.queue.length < 2) return ctx.fail('Need at least 2 queued tracks to shuffle.');
      g.queue = shuffle(g.queue);
      await ctx.ok(`Shuffled ${g.queue.length} tracks. 🔀`);
    },
  },
  {
    name: 'removetrack',
    aliases: ['rmtrack'],
    description: 'Remove a track from the queue by its number',
    usage: '<position>',
    examples: ['2'],
    minArgs: 1,
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      const n = Number(ctx.args[0]);
      if (!Number.isInteger(n) || n < 1 || n > g.queue.length) return ctx.fail(`Pick a position between 1 and ${g.queue.length}.`);
      const [t] = g.queue.splice(n - 1, 1);
      await ctx.ok(`Removed **${truncate(t.title, 80)}**.`);
    },
  },
  {
    name: 'clearqueue',
    aliases: ['cq'],
    description: 'Clear upcoming tracks (keeps the current one)',
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      const n = g.queue.length;
      g.queue = [];
      await ctx.ok(`Cleared ${n} queued track${n === 1 ? '' : 's'}.`);
    },
  },
  {
    name: 'seek',
    description: 'Jump to a time in the current track (not for live radio)',
    usage: '<mm:ss | seconds>',
    examples: ['1:30', '90'],
    minArgs: 1,
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      if (!g.current) return ctx.fail('Nothing is playing.');
      const parts = ctx.args[0].split(':').map(Number);
      if (parts.some((n) => !Number.isFinite(n) || n < 0)) return ctx.usage();
      const secs = parts.reduce((acc, n) => acc * 60 + n, 0);
      if (!g.seek(secs * 1000)) return ctx.fail('Live radio cannot be seeked.');
      await ctx.ok(`Jumped to **${formatDuration(secs * 1000)}**.`);
    },
  },
  {
    name: 'replay',
    aliases: ['restart-track'],
    description: 'Restart the current track from the beginning',
    guildOnly: true,
    async execute(ctx) {
      const g = ctx.audio.peek(ctx.guild.id);
      requireListener(ctx, g);
      if (!g.current) return ctx.fail('Nothing is playing.');
      g.stream(g.current, 0);
      await ctx.ok('Restarted the track. 🔁');
    },
  },
];

async function listStations(ctx) {
  const presets = Object.entries(SOMA).map(([id, [name, desc]]) => `\`${id}\` — **${name}**: ${desc}`);
  const genres = Object.entries(GENRES).map(([k, g]) => `\`${ctx.prefix}${k}\` ${g.label}`);
  const pages = [
    ...chunk(presets, 12).map((p, i, all) =>
      ctx.embed({ title: `📻 Radio presets (${presets.length})`, description: `Play with \`${ctx.prefix}radio <id>\`\n\n${p.join('\n')}`, footer: `Presets page ${i + 1}/${all.length} • commercial-free SomaFM streams` }),
    ),
    ctx.embed({
      title: `🎚️ Genre shortcuts (${genres.length})`,
      description: `${genres.join(' • ')}\n\nOr search 30,000+ stations: \`${ctx.prefix}radiosearch <name>\` / \`${ctx.prefix}radio <station name>\`.`,
    }),
  ];
  return paginate(ctx, pages);
}

// One command per genre: !lofi, !jazz, !80s …
for (const [key, g] of Object.entries(GENRES)) {
  commands.push({
    name: key,
    description: `Play ${g.label} radio in your voice channel`,
    cooldown: 3,
    ...VOICE,
    async execute(ctx) {
      const audio = await ensureVoice(ctx);
      if (!g.preset) await ctx.defer();
      return startTrack(ctx, audio, await genreTrack(key, ctx.author.id), { replace: true });
    },
  });
}

// Persistent control buttons on "now playing" messages.
async function onControl(interaction, parts, client) {
  const g = client.audio.peek(interaction.guildId);
  const member = interaction.member;
  const deny = (content) => interaction.reply({ embeds: [embeds.error(content)], flags: MessageFlags.Ephemeral });
  if (!g?.channelId) return deny('I am not in a voice channel.');
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && member.voice?.channelId !== g.channelId) return deny(`Join <#${g.channelId}> to use these buttons.`);
  const action = parts[0];
  let note;
  if (action === 'pause') {
    if (!g.current) return deny('Nothing is playing.');
    const paused = g.player.state.status === 'paused';
    if (paused) g.resume();
    else g.pause();
    note = paused ? '▶️ Resumed' : '⏸️ Paused';
  } else if (action === 'skip') {
    if (!g.current) return deny('Nothing is playing.');
    g.skip();
    note = '⏭️ Skipped';
  } else if (action === 'stop') {
    g.stopAll(true);
    note = '⏹️ Stopped';
  } else if (action === 'volup' || action === 'voldown') {
    const v = Math.max(10, Math.min(200, g.volume + (action === 'volup' ? 20 : -20)));
    g.setVolume(v);
    note = `🔊 Volume ${v}%`;
  } else return interaction.deferUpdate();
  return interaction.reply({ content: `${note} by ${interaction.user}`, allowedMentions: { parse: [] } });
}

module.exports = { commands, components: { mu: onControl } };
