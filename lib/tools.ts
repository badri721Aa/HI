import type { LucideIcon } from "lucide-react"
import { Bug, FileSearch, Gamepad2, Package, Search, Zap } from "lucide-react"

export interface Tool {
  icon: LucideIcon
  name: string
  desc: string
  href: string
  linkLabel: string
  tutorial?: string
}

export const TOOLS: Tool[] = [
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
    tutorial: "/tutorials/dnspy-decompiling",
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
