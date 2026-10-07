"use client";

import { usePrefs } from "@/lib/store/prefs";

export type SoundName = "tap" | "open" | "close" | "add" | "send" | "toggle" | "switch";

/*
 * Interface sounds, synthesized with Web Audio (no audio files to download).
 * Everything is quiet (peaks around 0.08) and short; the graph is
 *   voices → master gain → compressor → speakers.
 * The AudioContext is created lazily on the first playSound() call, which
 * always happens inside a click handler, so autoplay policies are satisfied.
 */

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

type AudioContextCtor = typeof AudioContext;

let engine: Engine | null = null;
let engineFailed = false;
const lastPlayed: Partial<Record<SoundName, number>> = {};

function createEngine(): Engine | null {
  if (engine) return engine;
  if (engineFailed || typeof window === "undefined") return null;
  try {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) {
      engineFailed = true;
      return null;
    }
    const ctx = new Ctor({ latencyHint: "interactive" });

    const master = ctx.createGain();
    master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    master.connect(comp);
    comp.connect(ctx.destination);

    // Half a second of white noise, reused by the swish voices.
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // iOS only unlocks Web Audio after a sound starts inside a gesture: play one silent sample.
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silent.connect(ctx.destination);
    silent.start(0);

    engine = { ctx, master, noise };
    bindLifecycle(engine);
    return engine;
  } catch {
    engineFailed = true;
    return null;
  }
}

/** Suspend while the tab is hidden or sounds are off, so the audio thread idles. */
function bindLifecycle({ ctx }: Engine) {
  const sync = () => {
    try {
      if (document.visibilityState === "hidden" || !usePrefs.getState().sound) {
        if (ctx.state === "running") void ctx.suspend().catch(() => {});
      } else if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore: sound is decorative.
    }
  };
  document.addEventListener("visibilitychange", sync);
  usePrefs.subscribe((state, prev) => {
    if (state.sound !== prev.sound) sync();
  });
}

/* ---------------------------------------------------------------- voices */

const PEAK = 0.08;

/** Attack/decay envelope on a fresh gain node routed to the master bus. */
function envelope(e: Engine, start: number, attack: number, duration: number, peak: number): GainNode {
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  g.connect(e.master);
  return g;
}

function tone(
  e: Engine,
  {
    start,
    duration,
    from,
    to = from,
    type = "sine",
    peak = PEAK,
    attack = 0.004,
  }: { start: number; duration: number; from: number; to?: number; type?: OscillatorType; peak?: number; attack?: number },
) {
  const osc = e.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + duration * 0.9);
  const gain = envelope(e, start, attack, duration, peak);
  osc.connect(gain);
  osc.onended = () => gain.disconnect();
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function swish(e: Engine, { start, duration, from, to }: { start: number; duration: number; from: number; to: number }) {
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  const filter = e.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + duration);
  const gain = envelope(e, start, duration * 0.35, duration, PEAK * 0.9);
  src.connect(filter);
  filter.connect(gain);
  src.onended = () => gain.disconnect();
  src.start(start, Math.random() * 0.3);
  src.stop(start + duration + 0.02);
}

const VOICES: Record<SoundName, (e: Engine, t: number) => void> = {
  // Short bright tick for generic presses.
  tap: (e, t) => tone(e, { start: t, duration: 0.04, from: 2400, to: 1200, type: "triangle", peak: PEAK * 0.7 }),
  // Two quick blips, rising.
  toggle: (e, t) => {
    tone(e, { start: t, duration: 0.035, from: 1500, type: "triangle", peak: PEAK * 0.6 });
    tone(e, { start: t + 0.055, duration: 0.04, from: 2100, type: "triangle", peak: PEAK * 0.6 });
  },
  // Soft filtered air sweeping up / down: drawers opening and closing.
  open: (e, t) => swish(e, { start: t, duration: 0.12, from: 500, to: 2600 }),
  close: (e, t) => swish(e, { start: t, duration: 0.12, from: 2600, to: 500 }),
  // Two-tone rising sine (E5 → B5): added to the order.
  add: (e, t) => {
    tone(e, { start: t, duration: 0.09, from: 659.25, peak: PEAK * 0.85 });
    tone(e, { start: t + 0.07, duration: 0.09, from: 987.77, peak: PEAK * 0.85 });
  },
  // Three-note rising chime (G5 · B5 · E6): order sent.
  send: (e, t) => {
    tone(e, { start: t, duration: 0.12, from: 783.99, peak: PEAK * 0.75 });
    tone(e, { start: t + 0.07, duration: 0.12, from: 987.77, peak: PEAK * 0.75 });
    tone(e, { start: t + 0.14, duration: 0.12, from: 1318.51, peak: PEAK * 0.8 });
  },
  // Low, short click: region / language / currency switches.
  switch: (e, t) => {
    tone(e, { start: t, duration: 0.035, from: 360, to: 170, type: "triangle", peak: PEAK, attack: 0.002 });
    tone(e, { start: t, duration: 0.012, from: 3200, type: "sine", peak: PEAK * 0.25, attack: 0.001 });
  },
};

/** Plays a short synthesized UI sound if the visitor turned sounds on. Never throws. */
export function playSound(name: SoundName): void {
  try {
    if (!usePrefs.getState().sound) return;
    // Rapid repeats of the same sound would just stack up in volume.
    const now = performance.now();
    if (now - (lastPlayed[name] ?? -Infinity) < 35) return;
    lastPlayed[name] = now;

    const e = createEngine();
    if (!e) return;
    const voice = VOICES[name];
    if (!voice) return;

    const play = () => {
      try {
        voice(e, e.ctx.currentTime + 0.005);
      } catch {
        // Ignore: sound is decorative.
      }
    };
    if (e.ctx.state === "running") play();
    // Inside the user gesture, so resume() is allowed to start the audio clock.
    else void e.ctx.resume().then(play, () => {});
  } catch {
    // Ignore: sound is decorative.
  }
}

/** Whether interface sounds are on (false until the prefs store rehydrates). */
export function useSoundEnabled(): boolean {
  return usePrefs((s) => s.sound);
}
