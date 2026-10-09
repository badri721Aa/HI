"use client";

import { Fragment, useMemo, useRef, type Ref } from "react";
import { MotionStyles, useViewTrigger } from "./shared";

type SplitTag = "h1" | "h2" | "h3" | "p" | "span";

const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
const LTR_CHAR = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;

/** Direction of the first strong character in a word, or null for numbers and punctuation. */
function strongDir(s: string): "ltr" | "rtl" | null {
  for (const ch of s) {
    if (RTL_CHAR.test(ch)) return "rtl";
    if (LTR_CHAR.test(ch)) return "ltr";
  }
  return null;
}

interface Word {
  text: string;
  /** Position across all lines, for the stagger. */
  index: number;
}

/** A run of words with one direction, or a lone neutral word (number, dash) between runs. */
interface Segment {
  dir: "ltr" | "rtl" | null;
  words: string[];
}

/**
 * Splits a line on whitespace (never inside a word, so Arabic letters stay
 * joined) and groups the words into same-direction runs.
 *
 * Each animated word is an inline-block, which the bidi algorithm treats as
 * a neutral object, so a bare sequence of them would be ordered purely by
 * the paragraph direction: "PLA Silk" inside an Arabic line would come out
 * reversed. Rendering each run inside an isolating `dir` span keeps its
 * words in their own order, while the runs themselves (also neutral to the
 * outside) follow the page direction. Neutrals between two runs of different
 * direction stand alone, as they would in plain text.
 */
function segmentLine(line: string): Segment[] {
  const segments: Segment[] = [];
  let run: Segment | null = null;
  let pending: string[] = [];
  for (const word of line.split(/\s+/).filter(Boolean)) {
    const dir = strongDir(word);
    if (!dir) {
      pending.push(word);
      continue;
    }
    if (run && run.dir === dir) {
      run.words.push(...pending, word);
    } else {
      // Leading neutrals join the first run; neutrals between opposite runs stand alone.
      if (run) for (const n of pending) segments.push({ dir: null, words: [n] });
      run = { dir, words: run ? [word] : [...pending, word] };
      segments.push(run);
    }
    pending = [];
  }
  if (pending.length) {
    if (run) run.words.push(...pending);
    else segments.push({ dir: null, words: pending });
  }
  return segments;
}

/**
 * Word-by-word entrance (opacity, rise, blur), staggered.
 *
 * Accessible: the tag's aria-label carries the full text for screen readers
 * and the animated words are aria-hidden, so crawlers see the text once.
 * Splits on whitespace only, so it is safe for Arabic, and keeps mixed
 * Arabic/Latin lines in the right order. A "\n" in `text` forces a line break.
 *
 * `trigger="auto"` (default) plays from the first paint when the text is on
 * screen at load (the hero) and otherwise waits until it scrolls into view;
 * `trigger="mount"` always plays on mount. Reduced motion: static text.
 */
export function SplitText({
  text,
  className,
  delay = 0,
  stagger = 0.06,
  as = "span",
  trigger = "auto",
  id,
}: {
  text: string;
  className?: string;
  /** seconds before the first word */
  delay?: number;
  /** seconds between words */
  stagger?: number;
  as?: SplitTag;
  trigger?: "auto" | "mount";
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useViewTrigger(ref, { mode: trigger, margin: "0px 0px -8% 0px" });

  const lines = useMemo(() => {
    let index = 0;
    return text.split("\n").map((line) =>
      segmentLine(line).map((segment) => ({
        dir: segment.dir,
        key: segment.words.join(" "),
        words: segment.words.map((w): Word => ({ text: w, index: index++ })),
      })),
    );
  }, [text]);

  const Tag = as;
  const word = (w: Word, i: number) => (
    <Fragment key={`${i}-${w.text}`}>
      {i > 0 ? " " : null}
      <span className="lu-word" style={{ animationDelay: `${(delay + w.index * stagger).toFixed(3)}s` }}>
        {w.text}
      </span>
    </Fragment>
  );

  return (
    <>
      <MotionStyles />
      {/* The label names it for screen readers; crawlers read the words once, from the animated copy. */}
      <Tag ref={ref as Ref<never>} id={id} className={className} aria-label={text.replace(/\s*\n\s*/g, " ")}>
        <span aria-hidden="true">
          {lines.map((segments, li) => (
            <Fragment key={li}>
              {li > 0 ? <br /> : null}
              {segments.map((segment, si) => (
                <Fragment key={`${si}-${segment.key}`}>
                  {si > 0 ? " " : null}
                  {segment.dir ? <span dir={segment.dir}>{segment.words.map(word)}</span> : segment.words.map(word)}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </span>
      </Tag>
    </>
  );
}
