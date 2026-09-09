"use client"

import Link from "next/link"
import { ArrowRight, BookOpen } from "lucide-react"

import { PrismHero } from "@/components/ui/prism-hero"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

export default function PrismHeroDemo() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <PrismHero
      eyebrow="nosignal"
      headline="nosignal"
      description="Learn game modding the right way: Frida internals, Python tooling, and reverse-engineering fundamentals — built for your own projects, not someone else's live server."
      meta={["Frida + Python", "Reverse engineering", "Zero fluff"]}
      background={isDark ? "#08080B" : "#F6F5FA"}
      foreground={isDark ? "#EDE8DF" : "#14131A"}
      action={
        <Button asChild size="lg" variant="glow" className="rounded-full px-7">
          <Link href="/tutorials">
            Start learning
            <ArrowRight className="size-4 group-hover/button:translate-x-1" />
          </Link>
        </Button>
      }
      secondaryAction={
        <Button
          asChild
          variant="glass"
          size="lg"
          className="rounded-full px-7"
          style={{ color: isDark ? "#EDE8DF" : "#14131A" }}
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
