/**
 * Text for generated images (Satori), including right-to-left Arabic.
 *
 * Satori shapes Arabic and orders words correctly when it draws them, but it
 * measures text one character at a time in each letter's isolated form, which
 * is wider than the joined word it actually draws. Every Arabic word therefore
 * gets a box that is too wide, and lines fill with uneven gaps. Two fixes:
 *
 * 1. Lines are laid out run by run (row-reverse), so word spacing is ours.
 * 2. Each Arabic word sits on an invisible copy of itself rewritten in Unicode
 *    presentation forms (the joined glyphs as separate code points). Measured
 *    character by character, that copy has exactly the shaped width, so the
 *    box fits the visible word drawn on top of it.
 */
import type { CSSProperties } from "react";

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHAR = /[A-Za-z0-9À-ɏ]/;
/** Marks that sit on a letter without affecting how letters join. */
const TRANSPARENT = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/;

/**
 * Presentation forms as [final, initial, medial]. Right-joining letters have
 * only a final form. Isolated forms are the base letters themselves (Tajawal
 * does not map the isolated presentation code points).
 */
const FORMS: Record<string, [number, number?, number?]> = {
  "آ": [0xfe82],
  "أ": [0xfe84],
  "ؤ": [0xfe86],
  "إ": [0xfe88],
  "ئ": [0xfe8a, 0xfe8b, 0xfe8c],
  "ا": [0xfe8e],
  "ب": [0xfe90, 0xfe91, 0xfe92],
  "ة": [0xfe94],
  "ت": [0xfe96, 0xfe97, 0xfe98],
  "ث": [0xfe9a, 0xfe9b, 0xfe9c],
  "ج": [0xfe9e, 0xfe9f, 0xfea0],
  "ح": [0xfea2, 0xfea3, 0xfea4],
  "خ": [0xfea6, 0xfea7, 0xfea8],
  "د": [0xfeaa],
  "ذ": [0xfeac],
  "ر": [0xfeae],
  "ز": [0xfeb0],
  "س": [0xfeb2, 0xfeb3, 0xfeb4],
  "ش": [0xfeb6, 0xfeb7, 0xfeb8],
  "ص": [0xfeba, 0xfebb, 0xfebc],
  "ض": [0xfebe, 0xfebf, 0xfec0],
  "ط": [0xfec2, 0xfec3, 0xfec4],
  "ظ": [0xfec6, 0xfec7, 0xfec8],
  "ع": [0xfeca, 0xfecb, 0xfecc],
  "غ": [0xfece, 0xfecf, 0xfed0],
  "ف": [0xfed2, 0xfed3, 0xfed4],
  "ق": [0xfed6, 0xfed7, 0xfed8],
  "ك": [0xfeda, 0xfedb, 0xfedc],
  "ل": [0xfede, 0xfedf, 0xfee0],
  "م": [0xfee2, 0xfee3, 0xfee4],
  "ن": [0xfee6, 0xfee7, 0xfee8],
  "ه": [0xfeea, 0xfeeb, 0xfeec],
  "و": [0xfeee],
  "ى": [0xfef0],
  "ي": [0xfef2, 0xfef3, 0xfef4],
};

/** Lam + alef ligatures as [isolated, final]. */
const LAM_ALEF: Record<string, [number, number]> = {
  "آ": [0xfef5, 0xfef6],
  "أ": [0xfef7, 0xfef8],
  "إ": [0xfef9, 0xfefa],
  "ا": [0xfefb, 0xfefc],
};

const TATWEEL = "ـ";
const joinsForward = (c: string | undefined) => !!c && (c === TATWEEL || (FORMS[c]?.length ?? 0) > 1);
const joinsBackward = (c: string | undefined) => !!c && (c === TATWEEL || c in FORMS);

/** Rewrites Arabic letters as their contextual presentation forms (logical order). */
export function presentationForms(text: string): string {
  const chars = Array.from(text);
  const out: string[] = [];
  const neighbour = (i: number, step: 1 | -1) => {
    let j = i + step;
    while (j >= 0 && j < chars.length && TRANSPARENT.test(chars[j])) j += step;
    return j >= 0 && j < chars.length ? j : -1;
  };

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const forms = FORMS[c];
    if (!forms) {
      out.push(c);
      continue;
    }
    const p = neighbour(i, -1);
    const n = neighbour(i, 1);
    const prev = p >= 0 ? chars[p] : undefined;
    const next = n >= 0 ? chars[n] : undefined;
    const joinPrev = joinsForward(prev);

    if (c === "ل" && next && LAM_ALEF[next]) {
      const [iso, fin] = LAM_ALEF[next];
      out.push(String.fromCodePoint(joinPrev ? fin : iso));
      // Keep any marks that sat between the lam and the alef.
      for (let k = i + 1; k < n; k++) out.push(chars[k]);
      i = n;
      continue;
    }

    const joinNext = forms.length > 1 && joinsBackward(next);
    const form = joinPrev && joinNext ? forms[2] : joinPrev ? forms[0] : joinNext ? forms[1] : undefined;
    out.push(form ? String.fromCodePoint(form) : c);
  }
  return out.join("");
}

/**
 * Punctuation that belongs to the line rather than to the word it touches
 * (Unicode bidi neutrals): sentence marks, quotes and brackets. Satori lays
 * out each text node left to right, so a full stop kept inside "طبقة." lands
 * on the word's right, between it and the next word. Signs such as "+", "-"
 * and "/" stay with their word, so "+973" keeps its plus where it is.
 */
const EDGE = String.raw`[.,:;!?\u2026\u060C\u061B\u061F\u06D4"'\u2018\u2019\u201C\u201D\u00AB\u00BB()[\]{}]`;
const SPLIT_EDGES = new RegExp(`^(${EDGE}*)(.*?)(${EDGE}*)$`, "su");
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "«": "»", "»": "«" };

/** Neutral characters as they read on a right-to-left line: reversed, with brackets mirrored. */
function rtlNeutral(text: string): string {
  return Array.from(text)
    .reverse()
    .map((c) => MIRROR[c] ?? c)
    .join("");
}

export type BidiRun = {
  /** One Arabic word, or left-to-right words drawn together. */
  text: string;
  /** Arabic: drawn on its presentation-form copy (see ArabicWord). */
  rtl: boolean;
  /** Punctuation from the logical start of the run, ready to draw on its right. */
  before?: string;
  /** Punctuation from the logical end of the run, ready to draw on its left. */
  after?: string;
};

const CLOSER: Record<string, string> = { "(": ")", "[": "]", "{": "}", "«": "»", "\u201C": "\u201D", "\u2018": "\u2019" };
const OPENER = Object.fromEntries(Object.entries(CLOSER).map(([o, c]) => [c, o]));
const SYMMETRIC = new Set(['"', "'"]);

/** Opened minus closed: > 0 when `text` leaves `open` unclosed, < 0 when it closes one it never opened. */
function depth(text: string, open: string, close: string): number {
  let d = 0;
  for (const c of text) d += c === open ? 1 : c === close ? -1 : 0;
  return d;
}

const odd = (text: string, quote: string) => Array.from(text).filter((c) => c === quote).length % 2 === 1;

/**
 * Keeps an edge bracket or quote inside the run when its partner is inside:
 * "PLA (PETG)" and '"3D" BH' stay whole instead of losing one half to the edge.
 */
function keepPaired(lead: string, core: string, trail: string): [string, string, string] {
  while (trail) {
    const c = trail[0];
    const open = OPENER[c];
    if (!(open ? depth(core, open, c) > 0 : SYMMETRIC.has(c) && odd(core, c))) break;
    core += c;
    trail = trail.slice(1);
  }
  while (lead) {
    const c = lead[lead.length - 1];
    const close = CLOSER[c];
    if (!(close ? depth(core, c, close) < 0 : SYMMETRIC.has(c) && odd(core, c))) break;
    core = c + core;
    lead = lead.slice(0, -1);
  }
  return [lead, core, trail];
}

/** A word as [leading punctuation, the word itself, trailing punctuation]. */
function splitEdges(word: string): [string, string, string] {
  const [, lead = "", core = "", trail = ""] = SPLIT_EDGES.exec(word) ?? [];
  return core ? [lead, core, trail] : ["", word, ""];
}

/**
 * Visual runs for a right-to-left line, in logical order. Each Arabic word is
 * its own run; consecutive Latin/number words (and neutral words between
 * them, per the Unicode bidi rules) stay together as one left-to-right run.
 * Punctuation at a run's edges takes the line's direction, so it is split off
 * to be drawn beside the run: a final full stop ends up on the far left.
 */
export function bidiRuns(text: string): BidiRun[] {
  const words = text.trim().split(/\s+/).filter(Boolean).map(splitEdges);
  // Judged without the edges: "(R)،" is a Latin word, despite the Arabic comma.
  const dirs = words.map(([, w]) => (RTL_CHAR.test(w) ? "R" : LTR_CHAR.test(w) ? "L" : "N"));
  const runs: BidiRun[] = [];
  const run = (edgeLead: string, edgeText: string, edgeTrail: string, rtl: boolean): BidiRun => {
    const [lead, text, trail] = keepPaired(edgeLead, edgeText, edgeTrail);
    return {
      text,
      rtl,
      ...(lead ? { before: rtlNeutral(lead) } : {}),
      ...(trail ? { after: rtlNeutral(trail) } : {}),
    };
  };
  let i = 0;
  while (i < words.length) {
    if (dirs[i] !== "L") {
      const [lead, core, trail] = words[i];
      // A word with no letters or digits reads entirely in the line's direction.
      runs.push(dirs[i] === "R" ? run(lead, core, trail, true) : { text: rtlNeutral(lead + core + trail), rtl: false });
      i++;
      continue;
    }
    let end = i;
    for (let j = i + 1; j < words.length && dirs[j] !== "R"; j++) if (dirs[j] === "L") end = j;
    // Punctuation between the words stays inside the run; only its outer edges are split off.
    const inner = words
      .slice(i, end + 1)
      .map(([lead, core, trail], k, all) => `${k > 0 ? lead : ""}${core}${k < all.length - 1 ? trail : ""}`)
      .join(" ");
    runs.push(run(words[i][0], inner, words[end][2], false));
    i = end + 1;
  }
  return runs;
}

function ArabicWord({ word }: { word: string }) {
  return (
    <div style={{ display: "flex", position: "relative", flexShrink: 0 }}>
      <span style={{ color: "transparent" }}>{presentationForms(word)}</span>
      <span style={{ position: "absolute", top: 0, left: 0, whiteSpace: "nowrap" }}>{word}</span>
    </div>
  );
}

/** One run as a box. Split-off punctuation hugs it (no word gap) and never wraps away from it. */
function Run({ run }: { run: BidiRun }) {
  const body = run.rtl ? <ArabicWord word={run.text} /> : <span>{run.text}</span>;
  if (!run.before && !run.after) return body;
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", flexShrink: 0 }}>
      {run.before ? <span>{run.before}</span> : null}
      {body}
      {run.after ? <span>{run.after}</span> : null}
    </div>
  );
}

/**
 * Vowel marks (harakat, tanween, shadda, sukun). Without mark positioning they
 * can land on the wrong side of a letter, and everyday Arabic is written
 * without them, so generated images drop them.
 */
const HARAKAT = /[\u064B-\u0652\u0670]/g;

/**
 * A line or paragraph of text. Left-to-right text renders as-is; right-to-left
 * text is laid out run by run, starting from the right edge, wrapping as
 * needed.
 */
export function OgText({
  text,
  rtl,
  style,
  wordGap = 0.27,
}: {
  text: string;
  rtl: boolean;
  style?: CSSProperties;
  /** Space between words in em, for right-to-left text. */
  wordGap?: number;
}) {
  if (!rtl) return <div style={{ display: "flex", ...style }}>{text}</div>;
  const plain = text.replace(HARAKAT, "");
  const size = typeof style?.fontSize === "number" ? style.fontSize : 24;
  const lineHeight = typeof style?.lineHeight === "number" ? style.lineHeight : 1.4;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        flexWrap: "wrap",
        columnGap: Math.round(size * wordGap),
        rowGap: 0,
        ...style,
        lineHeight,
      }}
    >
      {bidiRuns(plain).map((run, i) => (
        <Run key={i} run={run} />
      ))}
    </div>
  );
}
