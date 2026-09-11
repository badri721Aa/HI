"use client"

import { CheckCircle2, Circle } from "lucide-react"

import { toggleCompleted, useCompletedTutorials } from "@/lib/progress"
import { cn } from "@/lib/utils"

export function CompleteToggle({ slug }: { slug: string }) {
  const completed = useCompletedTutorials()
  const done = completed.has(slug)

  return (
    <button
      type="button"
      onClick={() => toggleCompleted(slug)}
      aria-pressed={done}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-150",
        done
          ? "border-[#00e5a0]/50 bg-[#00e5a0]/10 text-[#00e5a0]"
          : "border-border text-muted-foreground hover:border-white/25 hover:text-foreground"
      )}
    >
      {done ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
      {done ? "Completed" : "Mark complete"}
    </button>
  )
}
