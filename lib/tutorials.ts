import type { LucideIcon } from "lucide-react"
import { Terminal, Zap, Code2, PawPrint, Crosshair, Puzzle, Gamepad2 } from "lucide-react"

export type Level = "beginner" | "intermediate" | "advanced"

export interface TutorialMeta {
  slug: string
  title: string
  description: string
  level: Level
  minutes: number
  tags: string[]
  icon: LucideIcon
  featured?: boolean
}

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

export const TUTORIALS: TutorialMeta[] = [
  {
    slug: "python-install",
    title: "Installing Python",
    description:
      "Set up the Python runtime on Windows, macOS, and Linux. Required before installing Frida.",
    level: "beginner",
    minutes: 5,
    tags: ["setup"],
    icon: Terminal,
  },
  {
    slug: "frida-install",
    title: "Installing Frida",
    description:
      "Install frida-tools via pip, verify the setup, and attach to your first running process.",
    level: "beginner",
    minutes: 8,
    tags: ["setup", "frida"],
    icon: Zap,
  },
  {
    slug: "frida-scripting-basics",
    title: "Frida Scripting Basics",
    description:
      "Write your first Frida script — interceptors, memory reads, module enumeration, hooking exported functions.",
    level: "intermediate",
    minutes: 15,
    tags: ["frida", "javascript"],
    icon: Code2,
    featured: true,
  },
  {
    slug: "animal-company-getting-started",
    title: "Animal Company — Getting Started",
    description:
      "Find the process, enumerate Unity modules, hook IL2CPP functions, and build a working offline sandbox mod.",
    level: "intermediate",
    minutes: 20,
    tags: ["frida", "animal-company", "unity"],
    icon: PawPrint,
  },
  {
    slug: "cheat-engine-frida",
    title: "Cheat Engine + Frida Workflow",
    description:
      "Find memory addresses with Cheat Engine, then automate the patch with Frida. The two tools together beat either alone.",
    level: "intermediate",
    minutes: 18,
    tags: ["frida", "cheat-engine"],
    icon: Crosshair,
  },
  {
    slug: "bepinex-unity-mods",
    title: "Unity Mods with BepInEx",
    description:
      "Install BepInEx, write a C# Harmony plugin that patches Unity game methods at runtime — no source code needed.",
    level: "advanced",
    minutes: 25,
    tags: ["bepinex", "unity", "csharp"],
    icon: Puzzle,
  },
  {
    slug: "animal-company-mod-menu",
    title: "Building a Mod Menu",
    description:
      "Wrap your Frida hooks in a Python GUI — toggles instead of one-off scripts, driving the game live over Frida's RPC bridge.",
    level: "advanced",
    minutes: 22,
    tags: ["frida", "animal-company", "python", "mod-menu"],
    icon: Gamepad2,
  },
]

export function getTutorial(slug: string) {
  return TUTORIALS.find((t) => t.slug === slug)
}

export function getAdjacentTutorials(slug: string) {
  const idx = TUTORIALS.findIndex((t) => t.slug === slug)
  return {
    prev: idx > 0 ? TUTORIALS[idx - 1] : undefined,
    next: idx >= 0 && idx < TUTORIALS.length - 1 ? TUTORIALS[idx + 1] : undefined,
  }
}
