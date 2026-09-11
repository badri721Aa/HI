import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { Steps } from "@/components/steps"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("dnspy-decompiling")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "check", label: "Check the scripting backend" },
  { id: "open", label: "Open the assembly" },
  { id: "edit", label: "Edit a method" },
  { id: "save", label: "Save a patched assembly" },
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
        <a href="/tutorials/il2cpp-dumping">Dumping IL2CPP metadata</a>{" "}
        exists because IL2CPP games throw away the real .NET assembly at
        build time. Games on Unity&apos;s other backend, Mono, don&apos;t —
        their C# ships as an actual <code>Assembly-CSharp.dll</code> you can
        open directly. dnSpy decompiles it back to real, editable C#, lets
        you set breakpoints, and can save a patched copy — no dumping step,
        no offsets, no Frida required.
      </p>

      <h2 id="check">Check the scripting backend</h2>
      <p>
        Look inside <code>&lt;Game&gt;_Data/</code>. A{" "}
        <code>Managed/</code> folder full of <code>.dll</code> files means
        Mono — you&apos;re in the right place. If instead you see{" "}
        <code>il2cpp_data/</code> and a much larger{" "}
        <code>GameAssembly.dll</code> next to the exe, that&apos;s IL2CPP —
        head to the dumping tutorial instead, dnSpy has nothing to open
        there.
      </p>
      <Callout variant="info" title="Same language, different pipeline">
        Both backends compile the same C# you&apos;d write. Mono ships it
        as real MSIL in a .NET assembly (what dnSpy reads natively);
        IL2CPP cross-compiles that MSIL to native C++ ahead of time, which
        is why there&apos;s nothing for a .NET decompiler to open.
      </Callout>

      <h2 id="open">Open the assembly</h2>
      <Steps
        items={[
          {
            title: "Download dnSpy",
            children: (
              <p>
                Grab the latest release from the{" "}
                <a
                  href="https://github.com/dnSpy/dnSpy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  dnSpy GitHub
                </a>
                . Portable zip, no install needed.
              </p>
            ),
          },
          {
            title: "Open Assembly-CSharp.dll",
            children: (
              <p>
                File → Open, then browse to{" "}
                <code>&lt;Game&gt;_Data/Managed/Assembly-CSharp.dll</code>{" "}
                — that&apos;s where a game&apos;s own gameplay code lives,
                as opposed to Unity engine or third-party library DLLs in
                the same folder.
              </p>
            ),
          },
          {
            title: "Browse the assembly tree",
            children: (
              <p>
                The left panel shows every namespace and class, fully
                decompiled — real field names, real method bodies, no
                dumping or offset-hunting required.
              </p>
            ),
          },
        ]}
      />

      <h2 id="edit">Edit a method</h2>
      <p>
        Right-click a method in the tree → <strong>Edit Method (C#)</strong>.
        dnSpy recompiles just that method in place:
      </p>
      <CodeBlock
        language="csharp"
        code={`// Original
public void TakeDamage(float damage)
{
    health -= damage;
    if (health <= 0f) Die();
}

// Edited — sandbox test, offline/solo only
public void TakeDamage(float damage)
{
    // no-op: damage never applied
}`}
      />
      <Callout variant="tip" title="Edit IL Instructions, for anything C# can't express">
        If the recompiler rejects a change (some constructs don&apos;t
        round-trip), drop to <strong>Edit IL Instructions</strong> instead
        — direct bytecode editing, more error-prone but nothing is
        off-limits.
      </Callout>

      <h2 id="save">Save a patched assembly</h2>
      <Steps
        items={[
          {
            title: "Back up the original DLL first",
            children: <p>Copy <code>Assembly-CSharp.dll</code> somewhere safe before saving over it — same rule as every save-editing or memory-patching tutorial here.</p>,
          },
          {
            title: "File → Save Module",
            children: <p>dnSpy writes your edits back into the assembly on disk.</p>,
          },
          {
            title: "Replace the original and launch",
            children: <p>Drop the patched DLL back into <code>Managed/</code>. The change is permanent until you restore your backup — unlike a Frida hook, there&apos;s no simple detach.</p>,
          },
        ]}
      />

      <Callout variant="warn" title="Offline / solo only">
        A patched assembly behaves identically to any other tampering tool
        on this site: fine against your own single-player or private
        session, and a good way to get banned or break things for other
        people on a live multiplayer server. If you want reversible,
        runtime-only patches instead of editing the DLL on disk, that&apos;s
        exactly what{" "}
        <a href="/tutorials/bepinex-unity-mods">BepInEx + Harmony</a> gives
        you.
      </Callout>
    </TutorialLayout>
  )
}
