import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { Steps } from "@/components/steps"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("animal-company-mod-menu")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "architecture", label: "Architecture" },
  { id: "agent", label: "The Frida agent" },
  { id: "gui", label: "The Python GUI" },
  { id: "offsets", label: "Filling in your own offsets" },
  { id: "run", label: "Running it" },
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
        Every earlier tutorial here ends with a one-off script — attach,
        hook one function, watch the console. A mod menu is the same
        hooks, wrapped in a GUI you can toggle live instead of editing a
        file and re-launching Frida each time.
      </p>

      <Callout variant="warn" title="Offline / solo only">
        Same rule as everywhere else on this site: run this against a game
        you own, in offline or private solo sessions. Don&apos;t attach it
        to a public multiplayer lobby — it breaks the game for other
        players, can trigger anti-cheat bans, and violates the game&apos;s
        terms of service. This is a sandbox for learning how the pieces
        fit together, not a way to gain an edge over anyone else.
      </Callout>

      <h2 id="architecture">Architecture</h2>
      <p>
        Two pieces, talking over Frida&apos;s own RPC bridge — no extra
        networking code:
      </p>
      <ul>
        <li>
          <code>agent.js</code> — the Frida agent, injected into the game.
          Hooks a couple of gameplay functions and exposes{" "}
          <code>rpc.exports</code> so Python can flip them on and off.
        </li>
        <li>
          <code>menu.py</code> — a Tkinter GUI. Attaches to the game,
          loads the agent, and calls those RPC exports from checkboxes
          and a slider.
        </li>
      </ul>

      <h2 id="agent">The Frida agent</h2>
      <p>
        This hooks the same two kinds of calls the earlier tutorials
        covered separately —{" "}
        <a href="/tutorials/animal-company-getting-started">
          blocking a damage call
        </a>{" "}
        and{" "}
        <a href="/tutorials/cheat-engine-frida">writing a field offset</a>{" "}
        — but gates each one behind a bit of state that Python can flip at
        runtime instead of a script that only ever does one thing:
      </p>
      <CodeBlock
        language="javascript"
        filename="agent.js"
        code={`const GAME_ASSEMBLY = "GameAssembly.dll";

// placeholders — see "Filling in your own offsets" below
const TAKE_DAMAGE_EXPORT = "PlayerController_TakeDamage_m123456"; // TODO
const PLAYER_UPDATE_EXPORT = "PlayerController_Update_m000000"; // TODO
const SPEED_FIELD_OFFSET = 0x68; // TODO
const NOCLIP_FLAG_OFFSET = 0x9c; // TODO

const state = { godMode: false, noclip: false, speedMultiplier: 1.0 };

function attachGodMode() {
  const fn = Module.findExportByName(GAME_ASSEMBLY, TAKE_DAMAGE_EXPORT);
  if (!fn) return send({ type: "error", description: "TakeDamage export not found" });
  Interceptor.attach(fn, {
    onEnter(args) {
      if (state.godMode) args[1] = ptr(0); // zero the damage argument
    },
  });
}

function attachMovementHook() {
  const fn = Module.findExportByName(GAME_ASSEMBLY, PLAYER_UPDATE_EXPORT);
  if (!fn) return send({ type: "error", description: "Update export not found" });
  Interceptor.attach(fn, {
    onEnter(args) {
      const self = args[0];
      if (state.speedMultiplier !== 1.0) self.add(SPEED_FIELD_OFFSET).writeFloat(state.speedMultiplier);
      if (state.noclip) self.add(NOCLIP_FLAG_OFFSET).writeU8(1);
    },
  });
}

attachGodMode();
attachMovementHook();

rpc.exports = {
  setGodMode(enabled) { state.godMode = !!enabled; },
  setNoclip(enabled) { state.noclip = !!enabled; },
  setSpeed(multiplier) { state.speedMultiplier = Number(multiplier) || 1.0; },
  getState() { return state; },
};`}
      />
      <Callout variant="info" title="rpc.exports, not send/recv">
        Wiring each toggle to a named export on <code>rpc.exports</code>{" "}
        means the Python side calls it like a normal function — see{" "}
        <a href="/tutorials/frida-scripting-basics">
          Frida Scripting Basics
        </a>{" "}
        for the send/recv pattern this replaces.
      </Callout>

      <h2 id="gui">The Python GUI</h2>
      <p>
        Plain <code>tkinter</code> — no extra dependency beyond{" "}
        <code>frida-tools</code>. Each control calls straight into the
        agent&apos;s <code>rpc.exports</code>:
      </p>
      <CodeBlock
        language="python"
        filename="menu.py"
        code={`import tkinter as tk
from tkinter import ttk, scrolledtext
import frida

PROCESS_NAME = "Animal Company"
AGENT_PATH = "agent.js"

class ModMenu(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("nosignal — mod menu")
        self.session = None
        self.script = None
        self._build_ui()
        self._connect()

    def _build_ui(self):
        self.god_mode = tk.BooleanVar()
        ttk.Checkbutton(self, text="God Mode", variable=self.god_mode,
            command=lambda: self._call("setGodMode", self.god_mode.get())).pack()

        self.noclip = tk.BooleanVar()
        ttk.Checkbutton(self, text="Noclip", variable=self.noclip,
            command=lambda: self._call("setNoclip", self.noclip.get())).pack()

        self.speed = tk.DoubleVar(value=1.0)
        ttk.Scale(self, from_=0.5, to=5.0, variable=self.speed,
            command=lambda v: self._call("setSpeed", float(v))).pack(fill="x")

        self.log = scrolledtext.ScrolledText(self, height=12)
        self.log.pack(fill="both", expand=True)

    def _connect(self):
        try:
            self.session = frida.attach(PROCESS_NAME)
            self.script = self.session.create_script(open(AGENT_PATH).read())
            self.script.on("message", self._on_message)
            self.script.load()
        except frida.ProcessNotFoundError:
            self._write(f"'{PROCESS_NAME}' not found — launch the game first")

    def _call(self, export, value):
        if self.script:
            getattr(self.script.exports_sync, export)(value)

    def _on_message(self, message, data):
        if message["type"] == "send":
            self._write(str(message["payload"]))

    def _write(self, text):
        self.log.insert("end", f"{text}\\n")

if __name__ == "__main__":
    ModMenu().mainloop()`}
      />
      <p>
        The full version with dark styling and error handling lives in{" "}
        <code>mod-menu/menu.py</code> in the repo, alongside{" "}
        <code>mod-menu/agent.js</code> and a README.
      </p>

      <h2 id="offsets">Filling in your own offsets</h2>
      <p>
        The export names and offsets above are placeholders — they will
        not work against your copy of the game as-is. IL2CPP export names
        and field offsets are specific to one exact build:
      </p>
      <Steps
        items={[
          {
            title: "Dump your build's exports",
            children: (
              <p>
                Follow{" "}
                <a href="/tutorials/animal-company-getting-started">
                  Getting Started
                </a>{" "}
                to enumerate <code>GameAssembly.dll</code> exports and find
                the real name for <code>TAKE_DAMAGE_EXPORT</code> and{" "}
                <code>PLAYER_UPDATE_EXPORT</code>.
              </p>
            ),
          },
          {
            title: "Find the field offsets",
            children: (
              <p>
                Use the{" "}
                <a href="/tutorials/cheat-engine-frida">
                  Cheat Engine + Frida workflow
                </a>{" "}
                to scan for the speed value and whatever flag controls
                collision, then note each offset relative to the module
                base.
              </p>
            ),
          },
          {
            title: "Update the TODOs, re-dump after every game update",
            children: (
              <p>
                Replace every <code>{"// TODO"}</code> in <code>agent.js</code>{" "}
                with your values. The hex suffix on IL2CPP exports changes
                between builds, so repeat step one after any update.
              </p>
            ),
          },
        ]}
      />

      <h2 id="run">Running it</h2>
      <CodeBlock
        language="bash"
        code={`pip install frida frida-tools

# Launch Animal Company first — offline or private solo mode —
# then from the mod-menu/ folder:
python menu.py`}
      />
      <p>
        The window attaches, loads <code>agent.js</code>, and the log
        panel shows the agent&apos;s <code>ready</code> message once
        hooks are live. Flip a toggle, watch the effect in your own
        offline session.
      </p>
    </TutorialLayout>
  )
}
