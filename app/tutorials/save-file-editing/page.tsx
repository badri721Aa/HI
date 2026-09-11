import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { Steps } from "@/components/steps"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("save-file-editing")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "find", label: "Find the save file" },
  { id: "backup", label: "Back it up first" },
  { id: "format", label: "Identify the format" },
  { id: "edit", label: "Edit a JSON save" },
  { id: "playerprefs", label: "PlayerPrefs (registry)" },
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
        Every other tutorial here attaches to a running process. This one
        doesn&apos;t — you edit save data while the game is closed, which
        makes it the lowest-risk mod you can make: no hooking, no memory
        scanning, nothing that could crash the game mid-session.
      </p>

      <h2 id="find">Find the save file</h2>
      <p>Unity games usually save to one of a few predictable spots:</p>
      <ul>
        <li>
          <code>%userprofile%\AppData\LocalLow\&lt;Company&gt;\&lt;Game&gt;\</code>{" "}
          — Unity&apos;s default persistent data path on Windows
        </li>
        <li>
          <code>~/Library/Application Support/&lt;Company&gt;/&lt;Game&gt;/</code>{" "}
          — the macOS equivalent
        </li>
        <li>
          Steam userdata under{" "}
          <code>steamapps/common/&lt;Game&gt;/</code> or{" "}
          <code>userdata/&lt;id&gt;/&lt;appid&gt;/</code> for some titles
        </li>
      </ul>
      <Callout variant="tip" title="Can't find it?">
        Check the game&apos;s own settings menu — some list a &ldquo;save
        location&rdquo; or &ldquo;open save folder&rdquo; option. Otherwise,
        watch <code>%userprofile%\AppData\LocalLow</code> with a file
        explorer sorted by &ldquo;date modified&rdquo; right after you save
        in-game.
      </Callout>

      <h2 id="backup">Back it up first</h2>
      <Steps
        items={[
          {
            title: "Copy the whole save folder",
            children: <p>Not just the file you think you&apos;ll edit — some games split state across several files.</p>,
          },
          {
            title: "Paste it somewhere outside the game's save path",
            children: <p>A separate <code>backups/</code> folder on your desktop is fine. The point is it survives if the game overwrites its save folder.</p>,
          },
          {
            title: "Confirm the game still loads from the original before editing",
            children: <p>Launch once, load your save, close. Now you know a known-good copy exists before you touch anything.</p>,
          },
        ]}
      />

      <h2 id="format">Identify the format</h2>
      <p>Open the save file in a text editor first — the format tells you what tool you actually need:</p>
      <ul>
        <li>
          <strong>Readable JSON or XML</strong> — edit directly in any text
          editor. The easiest case, and common for indie/Unity titles that
          use <code>JsonUtility</code>.
        </li>
        <li>
          <strong>Binary / gibberish</strong> — needs a hex editor (HxD on
          Windows) or a proper decompiler pass to understand the layout.
          Cross-reference with the{" "}
          <a href="/tutorials/cheat-engine-frida">Cheat Engine workflow</a>{" "}
          if you want to find a specific value&apos;s offset first.
        </li>
        <li>
          <strong>Encrypted / compressed</strong> — the hardest case. Some
          games only obfuscate lightly (a XOR pass or base64); check for
          those before assuming real encryption.
        </li>
      </ul>

      <h2 id="edit">Edit a JSON save</h2>
      <p>
        A typical Unity <code>JsonUtility</code>-serialized save is flat
        and readable:
      </p>
      <CodeBlock
        language="json"
        filename="save.json"
        code={`{
  "playerName": "Guest",
  "level": 4,
  "health": 62,
  "inventory": ["flashlight", "rope", "medkit"],
  "unlockedAreas": ["forest", "cave"]
}`}
      />
      <p>
        Change what you need — <code>&quot;level&quot;: 99</code>,
        add an item to the array — save the file, and launch the game.
        If it fails to load, restore your backup and check for a field you
        missed (some saves store a checksum or hash of the rest of the
        file, which a naive edit will break).
      </p>

      <h2 id="playerprefs">PlayerPrefs (Windows registry)</h2>
      <p>
        Unity&apos;s <code>PlayerPrefs</code> API — often used for
        settings, high scores, or small flags rather than full save data —
        writes to the registry on Windows, not a file:
      </p>
      <CodeBlock
        language="bash"
        code={`reg query "HKCU\\Software\\<Company>\\<Game>"`}
      />
      <p>
        Values show up as <code>DWORD</code> (integers), binary blobs
        (floats — PlayerPrefs stores these oddly), or strings. Edit with{" "}
        <code>regedit</code>, or query/set programmatically from Python
        with the standard library&apos;s <code>winreg</code> module.
      </p>

      <Callout variant="warn" title="Still just your own save">
        Same framing as everywhere else on this site — this only ever
        touches your own local save data for a game you own. It has
        nothing to do with a live multiplayer session, and nothing here
        transfers to editing someone else&apos;s save or a server-side
        profile.
      </Callout>
    </TutorialLayout>
  )
}
