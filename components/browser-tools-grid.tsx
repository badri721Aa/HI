"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Reveal } from "@/components/reveal"
import { BROWSER_TOOLS } from "@/lib/browser-tools"
import { trackSpot } from "@/lib/utils"

export function BrowserToolsGrid() {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {BROWSER_TOOLS.map((tool, i) => {
        const Icon = tool.icon
        return (
          <Reveal key={tool.name} delay={i * 80} className="h-full">
            <Link
              href={tool.href}
              onMouseMove={trackSpot}
              className="glass spot-card group flex h-full flex-col rounded-lg p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25"
            >
              <Icon className="mb-3.5 size-5 text-[#00e5a0]" />
              <h3 className="mb-1.5 font-[family-name:var(--font-display)] text-lg font-semibold text-foreground">
                {tool.name}
              </h3>
              <p className="mb-4 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {tool.desc}
              </p>
              <div className="flex items-center gap-1 border-t border-border pt-3.5 text-[12px] font-medium text-[#00e5a0]">
                Open tool
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </div>
            </Link>
          </Reveal>
        )
      })}
    </div>
  )
}
