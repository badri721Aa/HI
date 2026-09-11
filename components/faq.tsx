"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Reveal } from "@/components/reveal"
import { cn } from "@/lib/utils"

const FAQ = [
  {
    q: "Is this legal?",
    a: "Modding a single-player game you own is generally fine — check the game's EULA if you're unsure. What's not okay, and what this site never teaches, is running any of this against someone else's live multiplayer session.",
  },
  {
    q: "Will I get banned?",
    a: "Attaching Frida or Cheat Engine to a live multiplayer session risks a ban and can break the game for other players. That's exactly why every tutorial here is scoped to offline play or a private solo session — there's no server watching, and no one else to affect.",
  },
  {
    q: "Do I need to know C++ or C#?",
    a: "Not for most of the site — Frida scripting uses JavaScript from Python, so Python is the main language you need. The BepInEx path is the exception: that's C# with Harmony, for people who want to go deeper into Unity-native plugins.",
  },
  {
    q: "What games does this work on?",
    a: "Anything built on Unity with IL2CPP or Mono compilation, in principle — the same hooking and memory-patching concepts apply. Animal Company is the running example throughout, but the tools transfer.",
  },
  {
    q: "Frida vs. Cheat Engine — what's the difference?",
    a: "Cheat Engine scans process memory to find a value's address. Frida hooks functions and automates what you do with it. The Cheat Engine + Frida tutorial walks through using both together — find with one, automate with the other.",
  },
  {
    q: "Can the AI assistant write me a cheat menu for a live game?",
    a: "No — it follows the same offline/solo scope as everything else here. It's happy to explain hooking, memory patching, or IL2CPP internals, but it won't help build anything meant to run against a live multiplayer session or to hide from anti-cheat.",
  },
]

export function Faq() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0)

  return (
    <section className="relative border-t border-border px-5 py-20 sm:px-10 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Questions
          </p>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-foreground sm:text-4xl">
            Before you start
          </h2>
        </Reveal>

        <div className="mt-10 divide-y divide-border border-t border-border">
          {FAQ.map(({ q, a }, i) => {
            const isOpen = openIndex === i
            return (
              <Reveal key={q} delay={i * 40}>
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className="text-sm font-medium text-foreground sm:text-base">
                      {q}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                        isOpen && "rotate-180 text-[#00e5a0]"
                      )}
                    />
                  </button>
                  <div
                    className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
                    style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                  >
                    <div className="min-h-0">
                      <p className="max-w-xl pb-5 text-[13px] leading-relaxed text-muted-foreground">
                        {a}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
