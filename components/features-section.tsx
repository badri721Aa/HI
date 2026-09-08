import { Code2, Search, ShieldCheck } from "lucide-react"

const FEATURES = [
  {
    icon: Code2,
    title: "Frida + Python fundamentals",
    body: "Process attach, function hooking, memory reads, and a Python-driven control layer — taught from first principles.",
  },
  {
    icon: Search,
    title: "Reverse-engineering method",
    body: "How to read disassembly, find the function you actually need, and verify a hook before you trust it.",
  },
  {
    icon: ShieldCheck,
    title: "Your own projects only",
    body: "Every tutorial targets singleplayer builds and games you own — no tooling aimed at someone else's live server.",
  },
]

export function FeaturesSection() {
  return (
    <section
      id="tutorials"
      className="border-t border-border bg-background px-5 py-20 sm:px-10 sm:py-28"
    >
      <div className="mx-auto max-w-5xl">
        <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          What you&apos;ll learn
        </p>
        <h2 className="mt-4 max-w-xl font-[family-name:var(--font-display)] text-3xl text-foreground sm:text-4xl">
          A grounded path into game modding
        </h2>

        <div className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group flex flex-col gap-4 rounded-xl border border-transparent p-4 -m-4 transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-sm"
            >
              <div className="flex size-10 items-center justify-center rounded-full border border-border transition-colors duration-300 group-hover:border-foreground/40 group-hover:bg-foreground/5">
                <Icon className="size-4 text-foreground" />
              </div>
              <h3 className="text-sm font-medium text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
