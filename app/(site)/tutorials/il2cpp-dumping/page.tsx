import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { Steps } from "@/components/steps"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("il2cpp-dumping")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "why", label: "Why dump at all" },
  { id: "gather", label: "Gather the two files" },
  { id: "run", label: "Run Il2CppDumper" },
  { id: "read", label: "Reading the output" },
  { id: "use", label: "Using it with Frida" },
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
        In <a href="/tutorials/animal-company-getting-started">Getting Started</a>,
        every export you found looked like{" "}
        <code>PlayerController_TakeDamage_m123456</code> — readable, but
        with a meaningless hex suffix and no idea what fields live at what
        offset inside the class. Il2CppDumper fixes that: it reconstructs
        the original class names, method names, field names, and offsets
        that IL2CPP stripped out when it compiled your C# to native code.
      </p>

      <h2 id="why">Why dump at all</h2>
      <p>
        IL2CPP throws away almost all your C# identifiers at compile time —
        <code>GameAssembly.dll</code> alone just has exported function
        addresses and mangled names. But a separate file,{" "}
        <code>global-metadata.dat</code>, still carries the original
        strings (class names, field names, method signatures) so Unity can
        do reflection at runtime. Il2CppDumper cross-references the two and
        hands you back something close to the original source structure.
      </p>

      <h2 id="gather">Gather the two files</h2>
      <p>You need both, from the same game install:</p>
      <ul>
        <li>
          <code>GameAssembly.dll</code> — next to the game&apos;s .exe
        </li>
        <li>
          <code>global-metadata.dat</code> — under{" "}
          <code>&lt;Game&gt;_Data/il2cpp_data/Metadata/</code>
        </li>
      </ul>
      <Callout variant="warn" title="Match the build">
        These two files have to come from the exact same game version. If
        you update the game, re-copy both — an old metadata file paired
        with a new assembly will fail to parse or, worse, silently produce
        wrong offsets.
      </Callout>

      <h2 id="run">Run Il2CppDumper</h2>
      <Steps
        items={[
          {
            title: "Download a release",
            children: (
              <p>
                Get the latest zip from the{" "}
                <a
                  href="https://github.com/Perfare/Il2CppDumper/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Il2CppDumper releases page
                </a>
                . No build step — it&apos;s a ready-to-run executable.
              </p>
            ),
          },
          {
            title: "Point it at both files",
            children: (
              <p>
                Run it, then supply the path to <code>GameAssembly.dll</code>{" "}
                when prompted, followed by <code>global-metadata.dat</code>.
              </p>
            ),
          },
          {
            title: "Collect the output",
            children: (
              <p>
                You get a few files: <code>dump.cs</code> (pseudo-C#
                showing every class), <code>script.json</code> (name →
                address mapping Frida scripts can consume directly), and{" "}
                <code>il2cpp.h</code> (C headers, useful for native
                tooling).
              </p>
            ),
          },
        ]}
      />
      <CodeBlock language="bash" code={`Il2CppDumper.exe
# then paste the two paths when prompted, e.g.:
# GameAssembly.dll:       C:\\Games\\AnimalCompany\\GameAssembly.dll
# global-metadata.dat:    C:\\Games\\AnimalCompany\\AnimalCompany_Data\\il2cpp_data\\Metadata\\global-metadata.dat`} />

      <h2 id="read">Reading the output</h2>
      <p>
        <code>dump.cs</code> isn&apos;t compilable — it&apos;s a readable
        reconstruction, offsets and addresses included as comments:
      </p>
      <CodeBlock
        language="csharp"
        filename="dump.cs (excerpt)"
        code={`// Namespace:
public class PlayerController : MonoBehaviour // TypeDefIndex: 842
{
	// Fields
	public float health; // 0x68
	public float speed; // 0x6C
	private bool isDead; // 0x70

	// Methods
	public void TakeDamage(float damage) { } // RVA: 0x2A1B40 Offset: 0x2A1B40 VA: 0x1802A1B40
	public void Update() { } // RVA: 0x2A2010 Offset: 0x2A2010 VA: 0x1802A2010
}`}
      />
      <p>
        That single block replaces guesswork from two earlier tutorials at
        once: the field offsets you&apos;d otherwise find by scanning in{" "}
        <a href="/tutorials/cheat-engine-frida">Cheat Engine</a> (
        <code>health</code> at <code>0x68</code>), and the export name you&apos;d
        otherwise enumerate blind in{" "}
        <a href="/tutorials/animal-company-getting-started">
          Getting Started
        </a>.
      </p>

      <h2 id="use">Using it with Frida</h2>
      <p>
        <code>script.json</code> maps every method to its address relative
        to <code>GameAssembly.dll</code>&apos;s base, so a Frida script can
        skip <code>findExportByName</code> entirely and jump straight to
        an RVA:
      </p>
      <CodeBlock
        language="javascript"
        code={`const base = Process.getModuleByName("GameAssembly.dll").base;

// RVA from dump.cs, not a guessed export name
const takeDamage = base.add(0x2A1B40);

Interceptor.attach(takeDamage, {
    onEnter(args) {
        console.log("damage arg:", args[1].toFloat());
    }
});`}
      />
      <Callout variant="tip" title="Re-dump after every update">
        RVAs and offsets shift whenever the game recompiles, same as the
        export hex suffixes did. Keep Il2CppDumper handy — a fresh dump
        after each patch is routine, not optional.
      </Callout>
    </TutorialLayout>
  )
}
