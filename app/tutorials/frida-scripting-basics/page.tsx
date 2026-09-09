import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("frida-scripting-basics")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "modules", label: "Listing modules" },
  { id: "memory", label: "Reading & writing memory" },
  { id: "interceptor", label: "Hooking with Interceptor" },
  { id: "replace", label: "Replacing a function" },
  { id: "rpc", label: "Two-way communication" },
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
        Frida scripts run JavaScript inside the target process. You get
        access to a full runtime API — inspect memory, hook functions,
        intercept calls, send data back to Python.
      </p>

      <h2 id="modules">Listing modules</h2>
      <p>
        A module is a loaded .exe or .dll. Enumerate them to understand what
        the game uses:
      </p>
      <CodeBlock
        language="javascript"
        code={`// List all loaded modules
Process.enumerateModules().forEach(m => {
    console.log(m.name, m.base, m.size);
});

// Get a specific module
const unity = Process.getModuleByName("UnityPlayer.dll");
console.log("base:", unity.base);`}
      />

      <h2 id="memory">Reading and writing memory</h2>
      <CodeBlock
        language="javascript"
        code={`const addr = ptr("0x14A2B3C0");

// Read
const intVal   = addr.readInt();
const floatVal = addr.readFloat();
const str      = addr.readUtf8String();

// Write
addr.writeInt(9999);
addr.writeFloat(1.0);`}
      />
      <Callout variant="warn" title="ASLR — addresses shift every launch">
        Always work as module base + offset, never a hardcoded absolute
        address.
      </Callout>
      <CodeBlock
        language="javascript"
        code={`// Correct pattern
const base   = Process.getModuleByName("GameAssembly.dll").base;
const health = base.add(0x2B3C40).readFloat();
console.log("Health:", health);`}
      />

      <h2 id="interceptor">Hooking with Interceptor</h2>
      <CodeBlock
        language="javascript"
        code={`const fn = Module.findExportByName("GameAssembly.dll", "PlayerTakeDamage");

Interceptor.attach(fn, {
    onEnter(args) {
        // args[0] = this, args[1] = damage amount
        console.log("Damage:", args[1].toInt32());
        args[1] = ptr(0);  // zero the damage
    },
    onLeave(retval) {
        console.log("Returned:", retval.toInt32());
    }
});`}
      />

      <h2 id="replace">Replacing a function</h2>
      <CodeBlock
        language="javascript"
        code={`const isDeadFn = Module.findExportByName(null, "Player_IsDead");

Interceptor.replace(isDeadFn, new NativeCallback(function(thisPtr) {
    return 0;  // never dead
}, 'int', ['pointer']));`}
      />

      <h2 id="rpc">Two-way communication</h2>
      <CodeBlock
        language="javascript"
        code={`// JS side — send data to Python
send({ type: 'health', value: base.add(0x2B3C40).readFloat() });

// Python side — receive it
def on_message(message, data):
    p = message.get('payload', {})
    if p.get('type') == 'health':
        print(f"Health: {p['value']}")`}
      />
      <Callout variant="tip" title="rpc.exports for two-way control">
        Define <code>rpc.exports</code> in JS so Python can call functions
        inside the script — cleaner than message passing for interactive
        tools.
      </Callout>
    </TutorialLayout>
  )
}
