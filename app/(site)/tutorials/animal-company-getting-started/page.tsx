import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("animal-company-getting-started")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "find", label: "Find the process" },
  { id: "modules", label: "Enumerate modules" },
  { id: "exports", label: "Find exported functions" },
  { id: "godmode", label: "Sandbox: block a damage call" },
  { id: "speed", label: "Sandbox: Python driver" },
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
        Animal Company is a Unity IL2CPP game. The game logic compiles to
        native code in <code>GameAssembly.dll</code> — Frida can hook it
        directly without a .NET decompiler.
      </p>

      <Callout variant="warn" title="Offline / solo only">
        Everything below is for a game you own, run in offline or private
        solo mode. Don&apos;t attach Frida to a public multiplayer session —
        it breaks the game for other players, can trigger anti-cheat bans,
        and violates the game&apos;s terms of service. Treat this as a
        sandbox for learning how IL2CPP hooking works, not as a way to gain
        an edge over anyone else.
      </Callout>

      <h2 id="find">Find the process</h2>
      <CodeBlock
        language="bash"
        code={`frida-ps | findstr -i "animal"\n# 14832  Animal Company.exe`}
      />

      <h2 id="modules">Enumerate modules</h2>
      <CodeBlock
        language="javascript"
        filename="enum_modules.js"
        code={`// frida -n "Animal Company" -l enum_modules.js
Process.enumerateModules()
  .filter(m => ["Animal Company.exe","GameAssembly.dll","UnityPlayer.dll"].includes(m.name))
  .forEach(m => console.log(\`[\${m.name}] base=\${m.base} size=\${m.size}\`));`}
      />
      <p>Key modules:</p>
      <ul>
        <li>
          <code>Animal Company.exe</code> — bootstrapper
        </li>
        <li>
          <code>GameAssembly.dll</code> — all game logic (IL2CPP)
        </li>
        <li>
          <code>UnityPlayer.dll</code> — Unity engine runtime
        </li>
      </ul>

      <h2 id="exports">Find exported functions</h2>
      <CodeBlock
        language="javascript"
        code={`Process.getModuleByName("GameAssembly.dll")
  .enumerateExports()
  .filter(e => e.name.toLowerCase().includes("player"))
  .slice(0, 30)
  .forEach(e => console.log(e.name, e.address));`}
      />
      <Callout variant="info" title="IL2CPP export format">
        Methods export as <code>ClassName_MethodName_mHEX</code>. The base
        name is readable — copy the full export string for your hook
        target. The exact hex suffix changes between game builds, so re-dump
        exports after every update.
      </Callout>

      <h2 id="godmode">Sandbox: block a damage call</h2>
      <p>
        A minimal example of intercepting a gameplay function in your own
        offline session — this shows the mechanics of hooking, not a
        ready-made cheat:
      </p>
      <CodeBlock
        language="javascript"
        filename="offline_sandbox.js"
        code={`// frida -n "Animal Company" -l offline_sandbox.js
// Run this only in an offline/solo session you control.
const takeDamage = Module.findExportByName("GameAssembly.dll",
    "PlayerController_TakeDamage_m123456"); // update from your own dump

if (!takeDamage) {
    console.error("Export not found — rerun the dump and update the name");
} else {
    Interceptor.attach(takeDamage, {
        onEnter(args) {
            // IL2CPP: args[0] = this, args[1] = damage
            console.log("Blocked damage:", args[1].toInt32());
            args[1] = ptr(0);
        }
    });
    console.log("[+] Hook active — offline sandbox only");
}`}
      />

      <h2 id="speed">Sandbox: Python driver</h2>
      <CodeBlock
        language="python"
        filename="driver.py"
        code={`import frida, sys

JS = """
const updateFn = Module.findExportByName("GameAssembly.dll",
    "PlayerController_Update_m000000");  // update name

if (updateFn) {
    Interceptor.attach(updateFn, {
        onEnter(args) {
            const self = args[0];
            // Field offset — find with Cheat Engine first
            self.add(0x68).writeFloat(12.0);
        }
    });
    send({ status: "Hook active" });
}
"""

session = frida.attach("Animal Company")
script  = session.create_script(JS)
script.on('message', lambda m, _: print(m.get('payload', m)))
script.load()
sys.stdin.read()`}
      />
      <p>
        Next: use{" "}
        <a href="/tutorials/cheat-engine-frida">Cheat Engine</a> to find a
        real field offset for your own build of the game, then drop it into
        the script above and observe the effect in your own offline session.
      </p>
    </TutorialLayout>
  )
}
