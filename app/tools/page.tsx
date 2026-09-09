import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Bug, FileSearch, Gamepad2, Package, Search, Zap } from "lucide-react"

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Every tool used across the tutorials — what each does and where to get it.",
}

const TOOLS = [
  {
    icon: Search,
    name: "Python",
    desc: 'Runtime for Frida scripts and automation. Install 3.11+ from python.org — always check "Add to PATH" on Windows.',
    href: "https://www.python.org/downloads/",
    linkLabel: "python.org",
    tutorial: "/tutorials/python-install",
  },
  {
    icon: Zap,
    name: "Frida",
    desc: "Dynamic instrumentation. Hook functions, intercept calls, read/write memory — all from JavaScript inside the running process.",
    href: "https://frida.re",
    linkLabel: "frida.re",
    tutorial: "/tutorials/frida-install",
  },
  {
    icon: FileSearch,
    name: "Cheat Engine",
    desc: "Memory scanner and debugger. Find addresses for health, speed, ammo. Works alongside Frida scripts.",
    href: "https://www.cheatengine.org",
    linkLabel: "cheatengine.org",
    tutorial: "/tutorials/cheat-engine-frida",
  },
  {
    icon: Bug,
    name: "x64dbg",
    desc: "Open-source x64/x32 debugger for Windows. Essential for understanding game code flow and finding hook points.",
    href: "https://x64dbg.com",
    linkLabel: "x64dbg.com",
  },
  {
    icon: Package,
    name: "dnSpy",
    desc: "Decompiler and debugger for .NET games (Unity C#). Read and modify compiled game assemblies.",
    href: "https://github.com/dnSpy/dnSpy",
    linkLabel: "GitHub",
  },
  {
    icon: Gamepad2,
    name: "BepInEx",
    desc: "Unity game patcher and plugin framework. The standard way to load mods into Unity-based games.",
    href: "https://github.com/BepInEx/BepInEx",
    linkLabel: "GitHub",
    tutorial: "/tutorials/bepinex-unity-mods",
  },
]

export default function ToolsPage() {
  return (
    <div className="relative mx-auto max-w-5xl px-5 pb-24 pt-32 sm:px-10 sm:pt-40">
      <div className="nebula-glow -z-10" />
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Toolkit
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        Essential tools
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        Every tool used across the tutorials — what each does and where to
        get it.
      </p>

      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <div
              key={tool.name}
              className="glass flex flex-col rounded-lg p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25"
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
          )
        })}
      </div>
    </div>
  )
}
