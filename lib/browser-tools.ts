import type { LucideIcon } from "lucide-react"
import { Fingerprint, Shrink, FileCode2 } from "lucide-react"

export interface BrowserTool {
  icon: LucideIcon
  name: string
  desc: string
  href: string
}

export const BROWSER_TOOLS: BrowserTool[] = [
  {
    icon: Fingerprint,
    name: "Symbol Getter",
    desc: "Upload a GameAssembly.dll or libil2cpp.so and list its exported symbol names — statically, no Frida attach needed.",
    href: "/tools/symbol-getter",
  },
  {
    icon: Shrink,
    name: "JS Minifier",
    desc: "Compact a JavaScript file with Terser — smaller Frida agents, no server round-trip.",
    href: "/tools/js-minify",
  },
  {
    icon: FileCode2,
    name: "TypeScript → JavaScript",
    desc: "Convert a .ts file to plain JS with the real TypeScript compiler, in your browser.",
    href: "/tools/ts-to-js",
  },
]
