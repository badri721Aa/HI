import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { Steps } from "@/components/steps"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("cheat-engine-frida")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "scan", label: "Finding an address" },
  { id: "patch", label: "Patch with Frida" },
  { id: "pointers", label: "Following a pointer chain" },
]

export default function Page() {
  return (
    <TutorialLayout
      slug={meta.slug}
      title={meta.title}
      level={meta.level}
      minutes={meta.minutes}
      tags={meta.tags}
      toc={TOC}
    >
      <p>
        Cheat Engine scans for values — finds the address of health, speed,
        or any counter in minutes. Frida hooks at the function level and
        automates patches. Together: find with CE, lock or hook with Frida.
        Run this workflow against your own offline/solo session only.
      </p>

      <h2 id="scan">Finding an address</h2>
      <Steps
        items={[
          {
            title: "Attach CE to the game",
            children: (
              <p>
                Launch Cheat Engine, click the blinking computer icon, select
                the game process.
              </p>
            ),
          },
          {
            title: "First scan",
            children: (
              <p>
                Set type to &ldquo;Float&rdquo; (health/speed) or &ldquo;4
                Bytes&rdquo; (integers). Enter the current value (e.g. 100
                for full health). Click <strong>First Scan</strong>.
              </p>
            ),
          },
          {
            title: "Change the value, then next scan",
            children: (
              <p>
                Take damage (health drops to 75). Type 75 in CE, click{" "}
                <strong>Next Scan</strong>. This filters to addresses that
                changed from 100 → 75.
              </p>
            ),
          },
          {
            title: "Get the module-relative offset",
            children: (
              <p>
                Note the absolute address. Find the module base in CE&apos;s
                module list. <code>offset = absolute - module_base</code>.
                This offset is stable across launches (until the next game
                update).
              </p>
            ),
          },
        ]}
      />

      <h2 id="patch">Patch with Frida</h2>
      <CodeBlock
        language="javascript"
        filename="patch.js"
        code={`// patch.js — replace HEALTH_OFFSET with your CE value
const base   = Process.getModuleByName("GameAssembly.dll").base;
const hptr   = base.add(0x2B3C40);  // your offset here

console.log("Current health:", hptr.readFloat());

// Lock at 100 — poll every 100ms
setInterval(() => hptr.writeFloat(100.0), 100);`}
      />
      <Callout variant="tip" title="Pointer chains">
        If the address changes every game launch, you need a pointer chain.
        CE&apos;s pointer scanner finds static paths to the value. Frida
        follows them with chained <code>.readPointer()</code> calls.
      </Callout>

      <h2 id="pointers">Following a pointer chain</h2>
      <CodeBlock
        language="javascript"
        code={`// Chain: GameAssembly+0x5A1234 → +0x30 → +0x18 → +0x68 → float
const base = Process.getModuleByName("GameAssembly.dll").base;
try {
    const p1     = base.add(0x5A1234).readPointer();
    const p2     = p1.add(0x30).readPointer();
    const p3     = p2.add(0x18).readPointer();
    const health = p3.add(0x68).readFloat();
    console.log("Health:", health);
} catch(e) {
    console.error("Null in chain:", e.message);
}`}
      />
    </TutorialLayout>
  )
}
