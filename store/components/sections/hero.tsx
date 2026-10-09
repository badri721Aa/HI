"use client";

import dynamic from "next/dynamic";
import { Fragment, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowDown } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { ButtonLink } from "@/components/ui/button";
import { Magnetic } from "@/components/motion/magnetic";
import { Reveal } from "@/components/motion/reveal";
import { SplitText } from "@/components/motion/split-text";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { HeroHud } from "./hero-hud";

/* three.js only loads on the client, after the page is interactive. */
const HeroPrint = dynamic(() => import("@/components/3d/hero-print").then((m) => m.HeroPrint), { ssr: false });

/*
 * The only gradient text on the site: a vertical fg → silver sheen on the
 * last title line (bright at the top, so it reads as metal, not as dimmed). It is applied to the line and to every span inside it,
 * so it still paints when SplitText animates words as separate layers. The
 * padding/negative-margin pair grows the paint box so descenders and Arabic
 * marks are not clipped by background-clip at this tight leading.
 */
const SHEEN =
  "bg-linear-to-b from-fg to-silver bg-clip-text [-webkit-background-clip:text] text-transparent py-[0.12em] -my-[0.12em] " +
  "[&_span]:bg-linear-to-b [&_span]:from-fg [&_span]:to-silver [&_span]:bg-clip-text " +
  "[&_span]:[-webkit-background-clip:text] [&_span]:text-transparent [&_span]:py-[0.12em] [&_span]:-my-[0.12em]";

export function Hero() {
  const { t, locale } = useI18n();
  const hero = t.home.hero;
  const lines = hero.titleLines;
  const hud = useRef<HTMLDivElement>(null);

  return (
    <section id="top" aria-labelledby="hero-title" className="relative flex min-h-[100svh] flex-col pt-[72px]">
      <Backdrop />

      <div className="shell relative flex flex-1 flex-col justify-center pb-14 pt-4 md:pt-8 lg:pb-24 lg:pt-6">
        <div className="grid grid-cols-1 items-center gap-y-5 md:gap-y-8 lg:grid-cols-12 lg:gap-x-6">
          {/* Copy: first in the DOM (and for screen readers), second on small screens. */}
          <div className="lg:col-span-6 lg:row-start-1">
            <Reveal as="p" className="eyebrow flex items-center gap-3">
              <span aria-hidden className="h-px w-8 bg-line-strong" />
              <span>{hero.eyebrow}</span>
            </Reveal>

            <h1
              id="hero-title"
              className="mt-4 text-[clamp(3rem,7.4vw,7rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-fg md:mt-7 rtl:leading-[1.2]"
            >
              {lines.map((line, i) => (
                <Fragment key={i}>
                  {/* A space between the blocks keeps the accessible name readable ("Objects, printed…"). */}
                  {i > 0 ? " " : null}
                  <SplitText
                    as="span"
                    text={line}
                    delay={0.1 + i * 0.14}
                    stagger={0.06}
                    className={cn("block", i === lines.length - 1 && SHEEN)}
                  />
                </Fragment>
              ))}
            </h1>

            <Reveal
              as="p"
              delay={0.5}
              className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-fg-muted md:mt-8"
            >
              {hero.body}
            </Reveal>

            {/*
              Real hrefs; on the home page SmoothScroll intercepts same-page anchors and scrolls
              with scrollToId (moving focus for keyboard users). Full-width stacked buttons on phones.
            */}
            <Reveal delay={0.62} className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center md:mt-9">
              <Magnetic className="w-full sm:w-auto">
                <ButtonLink
                  href={`/${locale}#collection`}
                  size="lg"
                  className="group w-full sm:w-auto"
                >
                  {t.common.actions.browse}
                  <ArrowDown
                    aria-hidden
                    strokeWidth={1.5}
                    className="size-4 transition-transform duration-300 ease-out-expo group-hover:translate-y-0.5"
                  />
                </ButtonLink>
              </Magnetic>
              <ButtonLink
                href={`/${locale}#custom`}
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                {t.common.actions.startCustom}
              </ButtonLink>
            </Reveal>
          </div>

          {/*
            Live print: above the copy on small screens (short enough that the calls to action
            stay on a phone's first screen), columns 7–12 on large ones. The scene frames
            itself clear of the readout.
          */}
          <div className="relative order-first lg:order-none lg:col-span-6 lg:col-start-7 lg:row-start-1">
            <div aria-hidden className="relative h-[34svh] min-h-60 md:h-[40svh] lg:h-[min(78vh,760px)]">
              <HeroPrint className="size-full" avoid={hud} />
            </div>
            {/* z-10 keeps the readout above the shared 3D canvas (z-[5]); no ancestor creates a stacking context. */}
            <div ref={hud} className="absolute inset-x-0 bottom-0 z-10 sm:inset-x-auto sm:bottom-4 sm:start-2 lg:bottom-6 lg:start-4">
              <Reveal delay={0.9} y={12}>
                <HeroHud />
              </Reveal>
            </div>
          </div>
        </div>
      </div>

      <ScrollCue label={hero.scroll} />
    </section>
  );
}

/** Build-plate grid fading out around the print, plus a soft vignette. Purely decorative. */
function Backdrop() {
  const grid = "rgb(255 255 255 / 0.04)";
  const mask = "radial-gradient(ellipse 60% 52% at var(--gx) var(--gy), black 18%, transparent 78%)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 [--gx:50%] [--gy:24%] lg:[--gy:50%] lg:ltr:[--gx:74%] lg:rtl:[--gx:26%]"
        style={{
          backgroundImage: `linear-gradient(to right, ${grid} 1px, transparent 1px), linear-gradient(to bottom, ${grid} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          backgroundPosition: "center top",
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(130% 90% at 50% 38%, transparent 52%, var(--color-ink-950) 100%)" }}
      />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-ink-950" />
    </div>
  );
}

/**
 * "Scroll" with a 1px line that a short segment travels down twice, then
 * settles (no endless motion). Static under reduced motion.
 */
function ScrollCue({ label }: { label: string }) {
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const segment = "absolute inset-x-0 top-0 h-1/2 bg-fg-muted";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-7 hidden lg:block">
      <div className="shell flex items-center gap-3">
        <span className="relative block h-10 w-px overflow-hidden bg-line">
          {reduced ? (
            <span className={segment} />
          ) : settled ? (
            <motion.span
              className={segment}
              initial={{ y: "-100%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : (
            <motion.span
              className={segment}
              initial={{ y: "-100%" }}
              animate={{ y: "200%" }}
              transition={{ duration: 1.6, ease: [0.76, 0, 0.24, 1], repeat: 1, repeatDelay: 0.5, delay: 1.2 }}
              onAnimationComplete={() => setSettled(true)}
            />
          )}
        </span>
        <span className="eyebrow">{label}</span>
      </div>
    </div>
  );
}
