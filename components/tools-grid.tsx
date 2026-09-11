"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Reveal } from "@/components/reveal"
import { TOOLS } from "@/lib/tools"
import { trackSpot } from "@/lib/utils"

export function ToolsGrid() {
  return (
    <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TOOLS.map((tool, i) => {
        const Icon = tool.icon
        return (
          <Reveal key={tool.name} delay={(i % 3) * 80} className="h-full">
            <div
              onMouseMove={trackSpot}
              className="glass spot-card flex h-full flex-col rounded-lg p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25"
            >
              <Icon className="mb-3.5 size-5 text-[#00e5a0]" />
              <h2 className="mb-1.5 font-[family-name:var(--font-display)] text-lg font-semibold text-foreground">
                {tool.name}
              </h2>
              <p className="mb-4 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {tool.desc}
              </p>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3.5">
                <a
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[#00e5a0] hover:underline"
                >
                  {tool.linkLabel}
                  <ArrowRight className="size-3.5" />
                </a>
                {tool.tutorial && (
                  <Link
                    href={tool.tutorial}
                    className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Setup guide
                  </Link>
                )}
              </div>
            </div>
          </Reveal>
        )
      })}
    </div>
  )
}
