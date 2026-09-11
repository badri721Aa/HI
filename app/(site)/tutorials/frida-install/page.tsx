import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("frida-install")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "install", label: "Install" },
  { id: "verify", label: "Verify" },
  { id: "attach", label: "Attach to a process" },
  { id: "windows", label: "Windows issues" },
  { id: "python-api", label: "Python API" },
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
        Frida is a dynamic instrumentation toolkit. Inject JavaScript into a
        running process, hook functions, intercept calls, and read/write
        memory — without touching source code.
      </p>

      <Callout variant="warn" title="Prerequisite">
        You need Python 3.10+ and pip. See the{" "}
        <a href="/tutorials/python-install">Python installation tutorial</a>{" "}
        first.
      </Callout>

      <h2 id="install">Install</h2>
      <CodeBlock language="bash" code="pip install frida-tools" />
      <p>
        This installs: <code>frida</code> CLI, <code>frida-ps</code> (list
        processes), <code>frida-trace</code> (function tracer), and the
        Python bindings.
      </p>

      <h2 id="verify">Verify</h2>
      <CodeBlock
        language="bash"
        code={`frida --version\n# Expected: 16.x.x\n\nfrida-ps\n# Lists every running process`}
      />

      <h2 id="attach">Attach to a process</h2>
      <CodeBlock
        language="bash"
        code={`# List processes and filter for the game\nfrida-ps | findstr "Animal"\n# 14832  Animal Company.exe\n\n# Attach by name — opens a JS REPL\nfrida -n "Animal Company"`}
      />
      <p>
        Inside the REPL, type <code>Process.id</code> to confirm you&apos;re
        attached.
      </p>

      <h2 id="windows">Windows issues</h2>
      <Callout variant="warn" title="Access denied">
        Run your terminal as Administrator when attaching to game processes.
        Right-click → &ldquo;Run as administrator&rdquo;.
      </Callout>
      <Callout variant="info" title="Anti-cheat">
        Games with kernel anti-cheat (EAC, BattlEye) will detect and can ban
        for Frida usage. Animal Company is a co-op game — only attach in
        offline or private/solo lobbies, never against a live public
        session.
      </Callout>

      <h2 id="python-api">Python API</h2>
      <CodeBlock
        language="python"
        filename="attach.py"
        code={`import frida, sys

def on_message(message, data):
    if message['type'] == 'send':
        print('[script]', message['payload'])
    elif message['type'] == 'error':
        print('[error]', message['stack'])

session = frida.attach("Animal Company")
script = session.create_script("""
    console.log("Attached! PID:", Process.id);
    console.log("Platform:", Process.platform);
    console.log("Arch:", Process.arch);
""")
script.on('message', on_message)
script.load()
sys.stdin.read()  # keep alive`}
      />
      <p>
        Save as <code>attach.py</code>, run with{" "}
        <code>python attach.py</code> while the game is open.
      </p>
    </TutorialLayout>
  )
}
