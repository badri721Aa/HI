import Link from "next/link"
import { ArrowRight } from "lucide-react"

const STEPS = [
  {
    num: "1",
    title: "Install Python",
    sub: "Runtime + pip setup",
    href: "/tutorials/python-install",
  },
  {
    num: "2",
    title: "Install Frida",
    sub: "One pip command",
    href: "/tutorials/frida-install",
  },
  {
    num: "3",
    title: "Start modding",
    sub: "Animal Company guide",
    href: "/tutorials/animal-company-getting-started",
  },
]

export function QuickStart() {
  return (
    <section className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-5xl sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Link
            key={step.num}
            href={step.href}
            className={`group flex items-center gap-4 px-8 py-7 transition-colors duration-150 hover:bg-white/[0.03] ${
              i < STEPS.length - 1 ? "sm:border-r sm:border-border" : ""
            } ${i > 0 ? "border-t border-border sm:border-t-0" : ""}`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#00e5a0]/50 font-[family-name:var(--font-mono)] text-[11px] text-[#00e5a0]">
              {step.num}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                {step.title}
              </span>
              <span className="block text-xs text-muted-foreground">
                {step.sub}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#00e5a0]" />
          </Link>
        ))}
      </div>
    </section>
  )
}
