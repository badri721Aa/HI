"use client"

import { ArrowRight, BookOpen } from "lucide-react"

import { PrismHero } from "@/components/ui/prism-hero"
import { Button } from "@/components/ui/button"

export default function PrismHeroDemo() {
  return (
    <PrismHero
      eyebrow="nosignal"
      headline="nosignal"
      description="Learn game modding the right way: Frida internals, Python tooling, and reverse-engineering fundamentals — built for your own projects, not someone else's live server."
      meta={["Frida + Python", "Reverse engineering", "Zero fluff"]}
      action={
        <Button asChild size="lg" className="rounded-full px-7">
          <a href="#tutorials">
            Start learning
            <ArrowRight className="size-4" />
          </a>
        </Button>
      }
      secondaryAction={
        <Button
          asChild
          variant="outline"
          size="lg"
          className="rounded-full border-white/25 bg-transparent px-7 text-[#EDE8DF] hover:bg-white/5 hover:text-[#EDE8DF]"
        >
          <a href="#docs">
            <BookOpen className="size-4" />
            Documentation
          </a>
        </Button>
      }
      topInset
    />
  )
}
