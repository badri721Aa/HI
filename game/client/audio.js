/*
 * DEEP WATERS — procedural audio. Every sound is synthesized with WebAudio,
 * so the game ships with zero audio files. Positional: volume + pan by distance.
 */
(function (root) {
  'use strict';
  let ctx = null, master, sfxBus, musicBus, ambBus, noiseBuf, rainGain, windGain, waveGain;
  const vol = { master: 0.8, sfx: 0.9, music: 0.35 };
  let listener = { x: 0, y: 0 };
  let lastPlay = {};
  let musicTimer = 0, musicMood = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = vol.master; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(comp); comp.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ambience: waves (slow LFO on lowpassed noise), wind, rain
    waveGain = loopNoise('lowpass', 420, 0.25);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.12; lfo.connect(lfoAmt); lfoAmt.connect(waveGain.gain); lfo.start();
    windGain = loopNoise('bandpass', 900, 0);
    rainGain = loopNoise('highpass', 3500, 0);
  }

  function loopNoise(type, freq, gain) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(ambBus); src.start();
    return g;
  }

  function out(gain, pan) {
    const g = ctx.createGain(); g.gain.value = gain;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); p.connect(sfxBus); }
    else g.connect(sfxBus);
    return g;
  }

  function noise(dest, { dur = 0.2, type = 'lowpass', f0 = 2000, f1 = null, q = 1, gain = 0.8, attack = 0.002, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  function tone(dest, { type = 'sine', f0 = 440, f1 = null, dur = 0.2, gain = 0.4, attack = 0.005, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  const S = {
    pistol: (o) => { noise(o, { dur: 0.14, f0: 4000, f1: 700, gain: 0.9 }); tone(o, { type: 'square', f0: 190, f1: 60, dur: 0.07, gain: 0.3 }); },
    smg: (o) => { noise(o, { dur: 0.08, f0: 3500, f1: 900, gain: 0.6 }); tone(o, { type: 'square', f0: 220, f1: 90, dur: 0.04, gain: 0.2 }); },
    shotgun: (o) => { noise(o, { dur: 0.4, f0: 2500, f1: 250, gain: 1 }); tone(o, { f0: 110, f1: 35, dur: 0.3, gain: 0.8 }); noise(o, { dur: 0.08, type: 'highpass', f0: 3000, gain: 0.3, delay: 0.35 }); },
    rifle: (o) => { noise(o, { dur: 0.3, type: 'bandpass', f0: 1800, f1: 400, q: 0.7, gain: 1 }); tone(o, { type: 'sawtooth', f0: 900, f1: 80, dur: 0.12, gain: 0.25 }); },
    harpoon: (o) => { tone(o, { type: 'triangle', f0: 500, f1: 120, dur: 0.25, gain: 0.5 }); noise(o, { dur: 0.25, type: 'highpass', f0: 1500, f1: 400, gain: 0.3 }); },
    flame: (o) => { noise(o, { dur: 0.12, type: 'bandpass', f0: 700, q: 0.5, gain: 0.25 }); },
    rocket: (o) => { noise(o, { dur: 0.7, type: 'bandpass', f0: 300, f1: 1400, q: 0.8, gain: 0.8, attack: 0.03 }); tone(o, { f0: 80, f1: 40, dur: 0.3, gain: 0.4 }); },
    rail: (o) => { tone(o, { type: 'sawtooth', f0: 2600, f1: 180, dur: 0.35, gain: 0.35 }); noise(o, { dur: 0.4, type: 'highpass', f0: 5000, f1: 800, gain: 0.5 }); tone(o, { f0: 60, f1: 30, dur: 0.4, gain: 0.6 }); },
    boom: (o) => { noise(o, { dur: 1.4, f0: 1200, f1: 60, gain: 1, attack: 0.005 }); tone(o, { f0: 70, f1: 25, dur: 1, gain: 1 }); noise(o, { dur: 0.6, type: 'highpass', f0: 2000, f1: 300, gain: 0.3, delay: 0.1 }); },
    splash: (o) => { noise(o, { dur: 0.45, type: 'bandpass', f0: 1200, f1: 300, q: 0.6, gain: 0.5, attack: 0.02 }); },
    bigsplash: (o) => { noise(o, { dur: 1.2, type: 'lowpass', f0: 1500, f1: 150, gain: 0.8, attack: 0.03 }); },
    cast: (o) => { noise(o, { dur: 0.35, type: 'highpass', f0: 3000, f1: 900, gain: 0.25, attack: 0.05 }); tone(o, { type: 'triangle', f0: 1500, f1: 700, dur: 0.3, gain: 0.08 }); },
    bite: (o) => { tone(o, { f0: 880, dur: 0.08, gain: 0.35 }); tone(o, { f0: 1320, dur: 0.1, gain: 0.35, delay: 0.09 }); noise(o, { dur: 0.3, type: 'bandpass', f0: 800, gain: 0.4 }); },
    reel: (o) => { tone(o, { type: 'square', f0: 2400 + Math.random() * 400, dur: 0.018, gain: 0.08 }); },
    thrash: (o) => { noise(o, { dur: 0.5, type: 'bandpass', f0: 600, f1: 1200, q: 0.8, gain: 0.5, attack: 0.02 }); },
    snap: (o) => { tone(o, { type: 'sawtooth', f0: 1400, f1: 90, dur: 0.18, gain: 0.35 }); noise(o, { dur: 0.1, type: 'highpass', f0: 4000, gain: 0.4 }); },
    catch: (o) => { [523, 659, 784, 1047].forEach((f, i) => tone(o, { type: 'triangle', f0: f, dur: 0.25, gain: 0.25, delay: i * 0.07 })); },
    rare: (o) => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(o, { type: 'triangle', f0: f, dur: 0.5, gain: 0.25, delay: i * 0.08 }); tone(o, { f0: f * 2, dur: 0.4, gain: 0.06, delay: i * 0.08 + 0.03 }); }); },
    cash: (o) => { tone(o, { f0: 1318, dur: 0.15, gain: 0.25 }); tone(o, { f0: 1760, dur: 0.35, gain: 0.25, delay: 0.08 }); noise(o, { dur: 0.05, type: 'highpass', f0: 6000, gain: 0.3 }); },
    buy: (o) => { tone(o, { type: 'square', f0: 660, dur: 0.06, gain: 0.12 }); tone(o, { type: 'square', f0: 990, dur: 0.1, gain: 0.12, delay: 0.06 }); },
    squish: (o) => { noise(o, { dur: 0.18, f0: 900, f1: 200, gain: 0.7 }); tone(o, { f0: 160, f1: 50, dur: 0.12, gain: 0.35 }); },
    gore: (o) => { noise(o, { dur: 0.6, f0: 700, f1: 80, gain: 0.9 }); tone(o, { f0: 90, f1: 30, dur: 0.4, gain: 0.7 }); noise(o, { dur: 0.25, type: 'bandpass', f0: 400, f1: 1500, q: 2, gain: 0.5, delay: 0.1 }); },
    clang: (o) => { tone(o, { type: 'square', f0: 320, f1: 280, dur: 0.25, gain: 0.18 }); tone(o, { type: 'triangle', f0: 487, dur: 0.35, gain: 0.18 }); noise(o, { dur: 0.1, type: 'highpass', f0: 3000, gain: 0.3 }); },
    chomp: (o) => { noise(o, { dur: 0.2, f0: 1500, f1: 200, gain: 0.8 }); tone(o, { type: 'square', f0: 120, f1: 60, dur: 0.1, gain: 0.3 }); },
    sink: (o) => { noise(o, { dur: 2.2, f0: 600, f1: 60, gain: 0.9, attack: 0.05 }); for (let i = 0; i < 10; i++) tone(o, { f0: 300 + Math.random() * 600, f1: 900, dur: 0.08, gain: 0.12, delay: 0.3 + i * 0.15 }); },
    roar: (o) => { tone(o, { type: 'sawtooth', f0: 95, f1: 38, dur: 1.8, gain: 0.5, attack: 0.1 }); tone(o, { type: 'sawtooth', f0: 142, f1: 55, dur: 1.6, gain: 0.3, attack: 0.1 }); noise(o, { dur: 1.8, f0: 500, f1: 120, gain: 0.5, attack: 0.1 }); },
    zap: (o) => { for (let i = 0; i < 6; i++) tone(o, { type: 'sawtooth', f0: 200 + Math.random() * 1800, dur: 0.04, gain: 0.15, delay: i * 0.03 }); noise(o, { dur: 0.2, type: 'highpass', f0: 4000, gain: 0.25 }); },
    thunder: (o) => { noise(o, { dur: 0.15, type: 'highpass', f0: 2000, gain: 0.8 }); noise(o, { dur: 3, f0: 400, f1: 40, gain: 1, attack: 0.05, delay: 0.1 }); },
    ach: (o) => { [784, 988, 1175, 1568].forEach((f, i) => tone(o, { f0: f, dur: 0.6, gain: 0.18, delay: i * 0.1 })); },
    click: (o) => { tone(o, { type: 'square', f0: 1800, dur: 0.02, gain: 0.12 }); },
    ui: (o) => { tone(o, { type: 'triangle', f0: 700, f1: 900, dur: 0.06, gain: 0.12 }); },
    alarm: (o) => { for (let i = 0; i < 3; i++) tone(o, { type: 'square', f0: 440, f1: 330, dur: 0.25, gain: 0.12, delay: i * 0.3 }); },
    pickup: (o) => { tone(o, { type: 'triangle', f0: 600, f1: 1200, dur: 0.15, gain: 0.2 }); },
    repair: (o) => { for (let i = 0; i < 4; i++) tone(o, { type: 'square', f0: 900, dur: 0.03, gain: 0.1, delay: i * 0.09 }); },
    shell: (o) => { tone(o, { type: 'triangle', f0: 3000 + Math.random() * 800, dur: 0.05, gain: 0.04, delay: 0.25 }); },
  };

  function play(name, x, y, v = 1) {
    if (!ctx || !S[name]) return;
    const now = ctx.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.025) return; // anti-stacking
    lastPlay[name] = now;
    let gain = v, pan = 0;
    if (x != null) {
      const dx = x - listener.x, dy = y - listener.y, d = Math.hypot(dx, dy);
      gain *= Math.max(0, 1 - d / 1800);
      pan = dx / 900;
      if (gain < 0.02) return;
    }
    S[name](out(gain, pan));
  }

  // generative ambient music — pentatonic pads, darker in deeper biomes / night / boss fights
  const SCALES = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 1, 5, 7, 8]];
  function musicTick(dt, mood) {
    if (!ctx || vol.music <= 0) return;
    musicMood = mood;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    const boss = mood >= 2;
    musicTimer = boss ? 1.2 : 3.5 + Math.random() * 2;
    const scale = SCALES[Math.min(2, mood | 0)];
    const root = boss ? 110 : 146.83;
    const deg = () => scale[Math.floor(Math.random() * scale.length)];
    const f = (d, oct) => root * Math.pow(2, (d + 12 * oct) / 12);
    const t = boss ? 'sawtooth' : 'sine';
    for (let i = 0; i < (boss ? 2 : 3); i++) tone(musicBus, { type: t, f0: f(deg(), i), dur: boss ? 1.1 : 5, gain: boss ? 0.05 : 0.07, attack: boss ? 0.02 : 1.2 });
    if (boss) tone(musicBus, { type: 'square', f0: 55, dur: 0.3, gain: 0.12 });
    if (!boss && Math.random() < 0.6) tone(musicBus, { type: 'triangle', f0: f(deg(), 2), dur: 1.5, gain: 0.04, attack: 0.05, delay: 1 });
  }

  function setWeather(kind, wind) {
    if (!ctx) return;
    const t = ctx.currentTime;
    rainGain.gain.setTargetAtTime(kind === 'storm' ? 0.35 : kind === 'rain' ? 0.18 : 0, t, 1.5);
    windGain.gain.setTargetAtTime(Math.min(0.3, (wind || 0) / 350), t, 1.5);
  }

  function setVolume(k, v) {
    vol[k] = v;
    if (!ctx) return;
    if (k === 'master') master.gain.value = v;
    if (k === 'sfx') sfxBus.gain.value = v;
    if (k === 'music') musicBus.gain.value = v;
  }

  root.Sfx = { init, play, setListener: (x, y) => { listener.x = x; listener.y = y; }, musicTick, setWeather, setVolume, vol };
})(typeof self !== 'undefined' ? self : this);
