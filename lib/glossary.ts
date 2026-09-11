export interface GlossaryTerm {
  term: string
  definition: string
  related?: string[]
}

export const TERMS: GlossaryTerm[] = [
  {
    term: "Dynamic instrumentation",
    definition:
      "Inspecting or modifying a program while it runs, instead of editing its compiled binary on disk. Frida works this way — it injects a JavaScript runtime into a live process.",
  },
  {
    term: "Process attach",
    definition:
      "Connecting a tool like Frida to an already-running program by its process name or PID, so you can read its memory or hook its functions from the outside.",
  },
  {
    term: "IL2CPP",
    definition:
      "Unity's ahead-of-time compiler that turns C# game code into native C++, then a real .exe/.dll. There's no C# to decompile at runtime — the logic lives in GameAssembly.dll as native machine code.",
    related: ["GameAssembly.dll"],
  },
  {
    term: "GameAssembly.dll",
    definition:
      "The compiled game-logic module in an IL2CPP Unity build. Almost everything you'd hook in a Unity game (health, damage, movement) lives here as exported native functions.",
    related: ["IL2CPP"],
  },
  {
    term: "Module",
    definition:
      "A loaded executable or library inside a process — the game's own .exe, GameAssembly.dll, UnityPlayer.dll, and so on. Frida can enumerate every loaded module and its base address.",
  },
  {
    term: "Export",
    definition:
      "A function a module exposes by name so other code (or a debugger) can find and call it. IL2CPP exports methods as long mangled names like ClassName_MethodName_mHEX.",
  },
  {
    term: "ASLR",
    definition:
      "Address Space Layout Randomization — the OS loads modules at a different base address every run, as a security measure. That's why you never hardcode an absolute address; you always compute module base + offset.",
  },
  {
    term: "Offset",
    definition:
      "The fixed distance between a module's base address and a value you care about (like a health field). Offsets stay stable across launches even though the base address itself moves — until the game updates and the code layout shifts.",
    related: ["ASLR"],
  },
  {
    term: "Interceptor",
    definition:
      "Frida's API for hooking a function: Interceptor.attach() lets you run code before and after the original call runs, without replacing it. Interceptor.replace() swaps the function out entirely.",
  },
  {
    term: "Hook",
    definition:
      "Redirecting or observing a function call at runtime. A hook can read arguments, change them, block the original call, or just log what's happening — the core technique behind almost every mod.",
  },
  {
    term: "Pointer chain",
    definition:
      "A sequence of dereferences — base address, then follow a pointer, then another offset, then another pointer — used to reach a value whose direct address isn't stable. Common when a value lives on the heap behind several layers of objects.",
  },
  {
    term: "Anti-cheat",
    definition:
      "Software (like Easy Anti-Cheat or BattlEye) that detects tampering — including tools like Frida — and can ban accounts. It's why every tutorial on this site scopes itself to offline, solo, or private-lobby use.",
  },
  {
    term: "Harmony",
    definition:
      "A C# library for patching methods at runtime without touching the original source or binary — prefix/postfix/transpiler patches. The standard patching engine behind BepInEx plugins.",
  },
  {
    term: "BepInEx",
    definition:
      "A Unity mod-loader framework. It injects itself at game startup and loads your C# plugin DLLs from a plugins/ folder, giving you Harmony for patching game methods.",
  },
  {
    term: "rpc.exports",
    definition:
      "A Frida convention: define functions on the rpc.exports object inside your JS script, and your Python driver can call them directly — a cleaner two-way channel than raw send()/on('message').",
  },
  {
    term: "global-metadata.dat",
    definition:
      "A binary file shipped alongside an IL2CPP build (usually under Data/il2cpp_data/Metadata/) holding every original class, method, and field name that IL2CPP stripped out of GameAssembly.dll. Tools like Il2CppDumper pair the two to reconstruct readable names.",
    related: ["IL2CPP", "GameAssembly.dll"],
  },
  {
    term: "Mono scripting backend",
    definition:
      "Unity's other C# backend (the alternative to IL2CPP) — game logic stays as real .NET assemblies (Assembly-CSharp.dll) you can open directly in a decompiler like dnSpy, no dumping step required.",
    related: ["IL2CPP"],
  },
]
