'use strict';
/**
 * Voice/audio engine: one GuildAudio per guild per bot.
 *  - Streams any http(s) audio (internet radio, mp3/ogg links, Discord attachments) through ffmpeg -> Ogg/Opus.
 *  - Queue, loop, volume, seek.
 *  - 24/7 mode: remembers the channel (and the station) and rejoins after disconnects and restarts.
 *  - Always joins self-deafened: the bot never receives anyone's audio.
 */
const { spawn } = require('node:child_process');
const net = require('node:net');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  StreamType,
} = require('@discordjs/voice');
const db = require('./db');
const log = require('./logger').child('voice');

let FFMPEG = 'ffmpeg';
try {
  FFMPEG = require('ffmpeg-static') || 'ffmpeg';
} catch {
  /* fall back to system ffmpeg */
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function isPrivateIp(host) {
  if (!net.isIP(host)) return false;
  if (net.isIPv6(host)) return host === '::1' || /^f[cd]/i.test(host) || /^fe80/i.test(host);
  const [a, b] = host.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Only public http(s) URLs may be handed to ffmpeg (no local files, no internal network). */
function assertSafeUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw Object.assign(new Error('bad url'), { userMessage: 'That is not a valid link.' });
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('bad protocol'), { userMessage: 'Only http(s) links can be played.' });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (PRIVATE_HOST.test(host) || isPrivateIp(host)) throw Object.assign(new Error('private host'), { userMessage: 'That host is not allowed.' });
  return u.toString();
}

class GuildAudio {
  constructor(manager, guildId) {
    this.manager = manager;
    this.client = manager.client;
    this.guildId = guildId;
    this.queue = [];
    this.current = null;
    this.volume = 100;
    this.loop = 'off'; // off | track | queue
    this.connection = null;
    this.ffmpeg = null;
    this.startedAt = 0;
    this.seekOffset = 0;
    this.failures = 0;
    this.leaveTimer = null;
    this.textChannelId = null;
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    this.player.on(AudioPlayerStatus.Idle, () => this.onIdle());
    this.player.on('error', (err) => {
      log.warn(`[${this.guildId}] player error: ${err.message}`);
    });
  }

  get key() {
    return `${this.client.user.id}:${this.guildId}`;
  }
  get settings247() {
    return db.get('voice247', this.key, null);
  }
  get is247() {
    return !!this.settings247;
  }
  get elapsed() {
    return this.current ? this.seekOffset + (Date.now() - this.startedAt) : 0;
  }
  get channelId() {
    return this.connection?.joinConfig?.channelId || null;
  }

  async join(channel, textChannelId) {
    if (textChannelId) this.textChannelId = textChannelId;
    if (this.connection && this.channelId === channel.id && this.connection.state.status !== VoiceConnectionStatus.Destroyed) return this.connection;
    // Detach first so the old connection's Destroyed handler doesn't trigger a 24/7 rejoin.
    const old = this.connection;
    this.connection = null;
    if (old && old.state.status !== VoiceConnectionStatus.Destroyed) old.destroy();

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
      group: this.client.user.id,
    });
    this.connection = connection;
    connection.subscribe(this.player);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Being moved between channels looks like a short disconnect — wait for it to settle.
        await Promise.race([entersState(connection, VoiceConnectionStatus.Signalling, 5000), entersState(connection, VoiceConnectionStatus.Connecting, 5000)]);
      } catch {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
      }
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.connection !== connection) return;
      this.connection = null;
      if (this.is247 && !this.manager.shuttingDown) {
        log.info(`[${this.guildId}] 24/7 connection lost — rejoining in 5s.`);
        setTimeout(() => this.manager.restoreGuild(this.guildId).catch(() => {}), 5000).unref?.();
      } else {
        this.stopAll(false);
      }
    });
    connection.on('error', (err) => log.warn(`[${this.guildId}] connection error: ${err.message}`));

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20000);
    } catch (err) {
      connection.destroy();
      throw Object.assign(err, { userMessage: 'I could not connect to that voice channel (check my Connect/Speak permissions).' });
    }
    this.clearLeaveTimer();
    return connection;
  }

  leave() {
    this.stopAll(false);
    const c = this.connection;
    this.connection = null;
    c?.destroy();
    this.manager.guilds.delete(this.guildId);
  }

  killFfmpeg() {
    const p = this.ffmpeg;
    if (!p) return;
    this.ffmpeg = null;
    p.stdout?.on('error', () => {});
    p.stdout?.destroy();
    p.kill('SIGKILL');
  }

  stream(track, seekMs = 0) {
    const url = assertSafeUrl(track.url);
    this.killFfmpeg();
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    args.push('-protocol_whitelist', 'http,https,tcp,tls,crypto,hls,httpproxy');
    if (seekMs > 0 && !track.live) args.push('-ss', (seekMs / 1000).toFixed(2));
    args.push('-i', url, '-vn', '-af', `volume=${(this.volume / 100).toFixed(2)}`);
    args.push('-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-f', 'ogg', 'pipe:1');
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-500);
    });
    proc.on('error', (err) => log.error('ffmpeg failed to start:', err.message));
    proc.on('close', (code) => {
      if (code && code !== 255 && stderr) log.warn(`[${this.guildId}] ffmpeg exited ${code}: ${stderr.trim().split('\n').pop()}`);
    });
    this.ffmpeg = proc;
    const resource = createAudioResource(proc.stdout, { inputType: StreamType.OggOpus, metadata: track });
    this.current = track;
    this.startedAt = Date.now();
    this.seekOffset = seekMs;
    this.player.play(resource);
  }

  /** Add a track; starts playing if idle. Returns 'playing' | 'queued'. */
  enqueue(track) {
    if (!this.current) {
      this.stream(track);
      return 'playing';
    }
    this.queue.push(track);
    return 'queued';
  }

  /** Replace everything with one track (used by radio). */
  playNow(track) {
    this.queue = [];
    this.loop = 'off';
    this.stream(track);
  }

  skip() {
    const was = this.current;
    if (this.loop === 'track') this.loop = 'off';
    this.skipping = true;
    this.player.stop(true); // triggers onIdle -> next track
    return was;
  }

  stopAll(save = true) {
    this.queue = [];
    this.current = null;
    this.killFfmpeg();
    this.player.stop(true);
    if (save && this.is247) db.update('voice247', this.key, (s) => void (s.station = null), {});
  }

  pause() {
    return this.player.pause(true);
  }
  resume() {
    return this.player.unpause();
  }

  setVolume(v) {
    this.volume = v;
    if (this.current) this.stream(this.current, this.current.live ? 0 : this.elapsed); // ffmpeg applies volume
  }

  seek(ms) {
    if (!this.current || this.current.live) return false;
    this.stream(this.current, ms);
    return true;
  }

  onIdle() {
    const finished = this.current;
    const skipped = this.skipping;
    this.skipping = false;
    const ranFor = finished ? Date.now() - this.startedAt : 0;
    this.killFfmpeg();
    if (!finished) return;
    this.current = null;

    // A live stream that stops on its own dropped or failed to connect: retry with backoff.
    if (finished.live && !skipped && this.queue.length === 0) {
      this.failures = ranFor < 15000 ? this.failures + 1 : 0;
      if (this.failures > 5) {
        this.failures = 0;
        this.announce(`⚠️ **${finished.title}** keeps failing to stream, so I stopped it. Try another station.`);
        return;
      }
      // Rotate to a mirror URL if the station has any.
      if (ranFor < 15000 && finished.fallbacks?.length) {
        finished.fallbacks.push(finished.url);
        finished.url = finished.fallbacks.shift();
      }
      const delay = Math.min(30000, 2000 * 2 ** this.failures);
      setTimeout(() => {
        if (!this.current && this.connection) this.stream(finished);
      }, delay).unref?.();
      return;
    }

    let next = null;
    if (this.loop === 'track' && !skipped) next = finished;
    else {
      if (this.loop === 'queue') this.queue.push(finished);
      next = this.queue.shift() || null;
    }
    if (next) {
      this.stream(next);
      this.announce(`🎶 Now playing **${next.title}**${next.requestedBy ? ` — requested by <@${next.requestedBy}>` : ''}`);
      return;
    }

    // Queue finished: in 24/7 mode resume the saved station, otherwise leave after a while.
    const s = this.settings247;
    if (s?.station) return this.stream(structuredClone(s.station));
    if (!s) this.scheduleLeave(5 * 60 * 1000);
  }

  announce(text) {
    const ch = this.textChannelId && this.client.channels.cache.get(this.textChannelId);
    ch?.send?.({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
  }

  /** Leave after `ms` unless 24/7 is on. `evenIfPlaying` is used when the channel is empty. */
  scheduleLeave(ms, evenIfPlaying = false) {
    this.clearLeaveTimer();
    this.leaveTimer = setTimeout(() => {
      if (this.is247) return;
      if (evenIfPlaying || !this.current) {
        this.announce('👋 Left the voice channel because it was empty/idle. Use `247` to keep me there.');
        this.leave();
      }
    }, ms);
    this.leaveTimer.unref?.();
  }
  clearLeaveTimer() {
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
  }
}

class VoiceManager {
  constructor(client) {
    this.client = client;
    this.guilds = new Map();
    this.shuttingDown = false;
  }

  get(guildId) {
    let g = this.guilds.get(guildId);
    if (!g) {
      g = new GuildAudio(this, guildId);
      this.guilds.set(guildId, g);
    }
    return g;
  }

  peek(guildId) {
    return this.guilds.get(guildId) || null;
  }

  enable247(guildId, channelId, textChannelId, station = undefined) {
    const key = `${this.client.user.id}:${guildId}`;
    const prev = db.get('voice247', key, {});
    db.set('voice247', key, { channelId, textChannelId, station: station === undefined ? prev.station || null : station });
  }

  disable247(guildId) {
    db.delete('voice247', `${this.client.user.id}:${guildId}`);
  }

  async restoreGuild(guildId) {
    const key = `${this.client.user.id}:${guildId}`;
    const s = db.get('voice247', key, null);
    if (!s) return;
    const guild = this.client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(s.channelId);
    if (!channel?.isVoiceBased?.()) {
      log.warn(`24/7 channel ${s.channelId} in ${guildId} no longer exists — disabling 24/7 there.`);
      this.disable247(guildId);
      return;
    }
    const g = this.get(guildId);
    await g.join(channel, s.textChannelId);
    if (s.station && !g.current) g.stream(structuredClone(s.station));
  }

  async restoreAll() {
    const mine = db.entries('voice247').filter(([k]) => k.startsWith(`${this.client.user.id}:`));
    for (const [key] of mine) {
      const guildId = key.split(':')[1];
      await this.restoreGuild(guildId).catch((err) => log.warn(`24/7 restore failed for ${guildId}: ${err.message}`));
    }
    if (mine.length) log.info(`Restored ${mine.length} 24/7 voice connection(s).`);
  }

  /** Auto-leave when everyone else leaves (unless 24/7). */
  onVoiceStateUpdate(oldState, newState) {
    const g = this.guilds.get(oldState.guild.id);
    if (!g?.channelId) return;
    // An admin dragged the bot to another channel: in 24/7 mode, stay in the new one from now on.
    if (newState.id === this.client.user.id && newState.channelId && newState.channelId !== oldState.channelId) {
      const s = g.settings247;
      if (s) this.enable247(newState.guild.id, newState.channelId, s.textChannelId);
    }
    const channel = oldState.guild.channels.cache.get(g.channelId);
    if (!channel) return;
    const humans = channel.members.filter((m) => !m.user.bot).size;
    if (humans === 0 && !g.is247) g.scheduleLeave(2 * 60 * 1000, true);
    else if (humans > 0) g.clearLeaveTimer();
  }

  destroyAll() {
    this.shuttingDown = true;
    for (const g of this.guilds.values()) {
      g.killFfmpeg();
      g.connection?.destroy();
    }
  }
}

module.exports = { VoiceManager, GuildAudio, assertSafeUrl };
