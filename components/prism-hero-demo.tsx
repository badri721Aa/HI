"use client"

import Link from "next/link"
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
          <Link href="/tutorials">
            Start learning
            <ArrowRight className="size-4 group-hover/button:translate-x-1" />
          </Link>
        </Button>
      }
      secondaryAction={
        <Button
          asChild
          variant="outline"
          size="lg"
          className="rounded-full border-white/25 bg-transparent px-7 text-[#EDE8DF] hover:bg-white/5 hover:text-[#EDE8DF]"
        >
          <Link href="/tutorials/frida-install">
            <BookOpen className="size-4" />
            Start with Frida
          </Link>
        </Button>
      }
      topInset
    />
  )
}
