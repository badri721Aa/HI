import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { Steps } from "@/components/steps"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("bepinex-unity-mods")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "install", label: "Install BepInEx" },
  { id: "plugin", label: "Write a plugin" },
  { id: "build", label: "Build and deploy" },
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
        BepInEx is the standard Unity modding framework. It injects on
        startup, loads C# plugin DLLs, and gives you Harmony — a runtime
        patcher that can hook any game method without touching source code.
      </p>

      <h2 id="install">Install BepInEx</h2>
      <Steps
        items={[
          {
            title: "Download the x64 build",
            children: (
              <p>
                Get the latest zip from the{" "}
                <a
                  href="https://github.com/BepInEx/BepInEx/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  BepInEx releases page
                </a>
                . Take the zip, not the installer.
              </p>
            ),
          },
          {
            title: "Extract into the game folder",
            children: (
              <p>
                Unzip directly into the directory containing the game&apos;s
                .exe. You&apos;ll get a <code>BepInEx/</code> folder and a{" "}
                <code>winhttp.dll</code> next to the exe.
              </p>
            ),
          },
          {
            title: "Run the game once",
            children: (
              <p>
                Launch normally. BepInEx generates its config and the{" "}
                <code>BepInEx/plugins/</code> folder. Close the game.
              </p>
            ),
          },
        ]}
      />

      <h2 id="plugin">Write a plugin</h2>
      <CodeBlock
        language="csharp"
        code={`using BepInEx;
using HarmonyLib;

[BepInPlugin("com.nosignal.example", "Example Plugin", "1.0.0")]
public class ExamplePlugin : BaseUnityPlugin
{
    void Awake()
    {
        Logger.LogInfo("Loaded!");
        new Harmony("com.nosignal.example").PatchAll();
    }
}

[HarmonyPatch(typeof(PlayerController), "TakeDamage")]
public static class SandboxPatch
{
    // Prefix runs before the original — return false to skip it
    static bool Prefix(ref float damage)
    {
        damage = 0f;
        return false;
    }
}`}
      />
      <Callout variant="info" title="Finding class names">
        Open <code>GameAssembly.dll</code> in dnSpy, or use Il2CppInspector
        on <code>global-metadata.dat</code> to dump every class and method
        name.
      </Callout>
      <Callout variant="warn" title="Offline / solo only">
        Same rule as everywhere else on this site: install and test plugins
        against a game you own, in offline or private solo sessions. Don&apos;t
        load mods into a public multiplayer lobby.
      </Callout>

      <h2 id="build">Build and deploy</h2>
      <CodeBlock
        language="bash"
        code={`dotnet build -c Release

# Copy the DLL into BepInEx plugins
copy bin\\Release\\net472\\ExamplePlugin.dll "C:\\Games\\AnimalCompany\\BepInEx\\plugins\\"

# Launch game — check BepInEx/LogOutput.log for your log lines`}
      />
    </TutorialLayout>
  )
}
