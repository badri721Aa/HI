#!/usr/bin/env python3
"""nosignal mod menu — Animal Company.

A small Tkinter front-end that drives agent.js over Frida's RPC bridge.
For your own offline / private solo sessions only — see README.md.

Requires:
  pip install frida frida-tools
  Python's stdlib tkinter (bundled with the standard python.org installer)
"""

import tkinter as tk
from tkinter import ttk, scrolledtext

import frida

PROCESS_NAME = "Animal Company"
AGENT_PATH = "agent.js"

BG = "#0d0f18"
FG = "#ede8df"
ACCENT = "#c9a961"


class ModMenu(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("nosignal — mod menu")
        self.configure(bg=BG)
        self.geometry("420x480")
        self.resizable(False, False)

        self.session = None
        self.script = None

        self._build_ui()
        self._connect()

    def _build_ui(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TCheckbutton", background=BG, foreground=FG)
        style.configure("TLabel", background=BG, foreground=FG)
        style.configure("TFrame", background=BG)

        ttk.Label(self, text="ANIMAL COMPANY", font=("Consolas", 14, "bold")).pack(
            pady=(16, 0)
        )
        ttk.Label(self, text="offline / solo sessions only", foreground=ACCENT).pack(
            pady=(0, 12)
        )

        toggles = ttk.Frame(self)
        toggles.pack(fill="x", padx=20)

        self.god_mode = tk.BooleanVar()
        ttk.Checkbutton(
            toggles,
            text="God Mode",
            variable=self.god_mode,
            command=lambda: self._call("setGodMode", self.god_mode.get()),
        ).pack(anchor="w", pady=4)

        self.noclip = tk.BooleanVar()
        ttk.Checkbutton(
            toggles,
            text="Noclip",
            variable=self.noclip,
            command=lambda: self._call("setNoclip", self.noclip.get()),
        ).pack(anchor="w", pady=4)

        ttk.Label(toggles, text="Speed multiplier").pack(anchor="w", pady=(12, 0))
        self.speed = tk.DoubleVar(value=1.0)
        ttk.Scale(
            toggles,
            from_=0.5,
            to=5.0,
            variable=self.speed,
            command=lambda v: self._call("setSpeed", float(v)),
        ).pack(fill="x")

        ttk.Label(self, text="log").pack(anchor="w", padx=20, pady=(16, 0))
        self.log = scrolledtext.ScrolledText(
            self,
            height=12,
            bg="#08080b",
            fg=FG,
            insertbackground=FG,
            font=("Consolas", 9),
            borderwidth=0,
        )
        self.log.pack(fill="both", expand=True, padx=20, pady=(4, 16))

    def _connect(self):
        try:
            self.session = frida.attach(PROCESS_NAME)
            with open(AGENT_PATH, "r", encoding="utf-8") as f:
                self.script = self.session.create_script(f.read())
            self.script.on("message", self._on_message)
            self.script.load()
            self._write(f"attached to {PROCESS_NAME}")
        except frida.ProcessNotFoundError:
            self._write(f"process '{PROCESS_NAME}' not found — launch the game first")
        except Exception as e:  # frida raises several distinct error types here
            self._write(f"connect failed: {e}")

    def _call(self, export, value):
        if not self.script:
            self._write("not attached — nothing sent")
            return
        try:
            getattr(self.script.exports_sync, export)(value)
        except Exception as e:
            self._write(f"{export} failed: {e}")

    def _on_message(self, message, data):
        if message["type"] == "send":
            self._write(str(message["payload"]))
        elif message["type"] == "error":
            self._write(f"agent error: {message.get('description', message)}")

    def _write(self, text):
        self.log.insert("end", f"{text}\n")
        self.log.see("end")


if __name__ == "__main__":
    ModMenu().mainloop()
