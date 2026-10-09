"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useSyncExternalStore } from "react";
import { motion, useMotionValueEvent, useScroll, type MotionValue } from "motion/react";
import { useI18n } from "@/components/providers/i18n-provider";
import { SectionHeader } from "@/components/ui/section-header";
import { Reveal } from "@/components/motion/reveal";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const ProcessScene = dynamic(() => import("@/components/3d/process-scene").then((m) => m.ProcessScene), {
  ssr: false,
});

/*
 * "Stage" mode: the pinned, scroll-driven layout. Only on large screens that
 * are tall enough to fit the steps beside the scene, and only when motion is
 * welcome. Layout switches in CSS (the same query as the arbitrary variant
 * below), so the server HTML is already correct and nothing jumps on hydrate.
 *
 *   S = [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]
 *
 * Everywhere else ("flow" mode) the steps stack under a sticky scene and stay
 * fully expanded; with reduced motion the scene is shown finished.
 */
const STAGE_QUERY = "(min-width: 64rem) and (min-height: 40rem) and (prefers-reduced-motion: no-preference)";
const STEP_COUNT = 4;
/** Finished scene for reduced motion. */
const DONE = { get: () => 1 };

function subscribeStage(onChange: () => void) {
  const mq = window.matchMedia(STAGE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getStage = () => window.matchMedia(STAGE_QUERY).matches;
const getStageOnServer = () => false;

const stepFor = (progress: number) => Math.min(STEP_COUNT - 1, Math.max(0, Math.floor(progress * STEP_COUNT)));
const pad = (n: number) => String(n).padStart(2, "0");

export function Process() {
  const { t } = useI18n();
  const copy = t.home.process;
  const reduced = useReducedMotion();
  const stage = useSyncExternalStore(subscribeStage, getStage, getStageOnServer);

  const sectionRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);

  // Stage: the whole tall section drives the scene (pinned for ~220vh of scroll).
  const { scrollYProgress: stageProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  // Flow: the steps list crossing a reading line just below the sticky scene.
  const { scrollYProgress: flowProgress } = useScroll({ target: stepsRef, offset: ["start 0.66", "end 0.66"] });

  const [active, setActive] = useState(0);
  useMotionValueEvent(stageProgress, "change", (v) => {
    if (stage) setActive(stepFor(v));
  });
  useMotionValueEvent(flowProgress, "change", (v) => {
    if (!stage) setActive(stepFor(v));
  });

  const progress: MotionValue<number> = stage ? stageProgress : flowProgress;
  const activeStep = reduced ? -1 : active;

  return (
    <section
      id="process"
      ref={sectionRef}
      aria-labelledby="process-title"
      className="relative [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:h-[320vh]"
    >
      <div className="[@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:sticky [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:top-0 [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:h-[100svh]">
        {/*
          Stage: the copy starts a fixed distance under the header and the steps get the remaining height (1fr),
          so the title never moves when a longer step opens, and there is no centring gap above the section.
        */}
        <div className="shell grid grid-cols-1 gap-y-10 py-28 md:py-40 lg:grid-cols-12 lg:gap-x-6 lg:gap-y-12 [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:h-full [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:grid-rows-[auto_minmax(0,1fr)] [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:gap-y-9 [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:pb-6 [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:pt-24">
          <SectionHeader
            index="02"
            eyebrow={copy.eyebrow}
            title={copy.title}
            id="process-title"
            className="lg:col-span-6 lg:row-start-1 lg:self-end xl:col-span-5"
          />

          {/*
            Scene: sticky under the (scrolled, 60px) header on small screens when tall enough, so no strip of
            the steps shows between the two; columns 7–12 on large ones, top-aligned with the title on stage.
          */}
          <div className="relative z-[1] -mx-4 bg-ink-950 px-4 py-3 md:-mx-8 md:px-8 max-lg:[@media(min-height:37.5rem)]:sticky max-lg:[@media(min-height:37.5rem)]:top-15 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:self-center lg:bg-transparent lg:px-0 lg:py-0 [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:self-start">
            <div aria-hidden className="relative h-[48svh] min-h-72 lg:h-[min(68svh,640px)]">
              <ProcessScene progress={reduced ? DONE : progress} className="size-full" />
              <Corners />
            </div>
            {/* With reduced motion every step is shown at once, so a "current step" caption would mislead. */}
            {reduced ? null : <SceneCaption active={active} title={copy.steps[active]?.title ?? ""} />}
          </div>

          <div className="lg:col-span-6 lg:row-start-2 lg:self-start xl:col-span-5">
            <ol ref={stepsRef} className="relative">
              {/* Progress track: a hairline with a fill that follows the scroll. */}
              <span aria-hidden className="absolute inset-y-0 start-0 w-px bg-line" />
              {reduced ? null : (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 start-0 w-px origin-top bg-platinum/60"
                  style={{ scaleY: progress }}
                />
              )}

              {copy.steps.map((step, i) => (
                <li
                  key={i}
                  data-active={i === activeStep}
                  aria-current={i === activeStep ? "step" : undefined}
                  className="group relative py-6 ps-6 md:ps-8 [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:py-3"
                >
                  {/* Active marker: a 2px cyan bar riding the track. */}
                  <span
                    aria-hidden
                    className="absolute inset-y-4 start-[-0.5px] w-0.5 origin-top scale-y-0 rounded-full bg-glow transition-transform duration-500 ease-out-expo group-data-[active=true]:scale-y-100 [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:inset-y-2.5"
                  />
                  <Reveal delay={i * 0.06} y={14}>
                    <div className="flex items-baseline gap-4">
                      <span
                        dir="ltr"
                        className="tabular font-mono text-sm text-fg-subtle transition-colors duration-300 group-data-[active=true]:text-glow"
                      >
                        {pad(i + 1)}
                      </span>
                      <h3 className="text-xl font-semibold tracking-[-0.02em] text-fg transition-colors duration-300 md:text-[1.375rem] [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:text-fg-subtle [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:group-data-[active=true]:text-fg">
                        {step.title}
                      </h3>
                    </div>
                    <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-500 ease-out-expo [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:grid-rows-[0fr] [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:group-data-[active=true]:grid-rows-[1fr]">
                      <div className="min-h-0 overflow-hidden transition-opacity duration-500 ease-out-expo [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:opacity-0 [@media(min-width:64rem)_and_(min-height:40rem)_and_(prefers-reduced-motion:no-preference)]:group-data-[active=true]:opacity-100">
                        <p className="max-w-md pt-3 text-[0.9375rem] leading-relaxed text-fg-muted md:text-base">
                          {step.body}
                        </p>
                        <p className="mt-3 font-mono text-sm text-fg-subtle rtl:font-sans">{step.meta}</p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Viewport corner ticks, like a CAD view. */
function Corners() {
  const tick = "pointer-events-none absolute size-3 border-line-strong";
  return (
    <>
      <span className={cn(tick, "start-0 top-0 border-s border-t")} />
      <span className={cn(tick, "end-0 top-0 border-e border-t")} />
      <span className={cn(tick, "bottom-0 start-0 border-b border-s")} />
      <span className={cn(tick, "bottom-0 end-0 border-b border-e")} />
    </>
  );
}

/** "02 / 04 · Slice" with four slicer-style segments. Decorative; the list carries the content. */
function SceneCaption({ active, title }: { active: number; title: string }) {
  return (
    <div aria-hidden className="mt-3 flex items-center justify-between gap-4 font-mono text-xs text-fg-muted">
      <span className="flex items-center gap-2">
        <span className="tabular font-mono text-fg" dir="ltr">
          {pad(active + 1)} / {pad(STEP_COUNT)}
        </span>
        <span className="h-px w-4 bg-line-strong" />
        <span className="rtl:font-sans">{title}</span>
      </span>
      <span className="flex gap-1">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 w-4 rounded-full transition-colors duration-300",
              i <= active ? "bg-silver" : "bg-ink-600",
            )}
          />
        ))}
      </span>
    </div>
  );
}
