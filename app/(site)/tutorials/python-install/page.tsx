import type { Metadata } from "next"

import { TutorialLayout } from "@/components/tutorial-layout"
import { CodeBlock } from "@/components/code-block"
import { Callout } from "@/components/callout"
import { Steps } from "@/components/steps"
import { getTutorial } from "@/lib/tutorials"

const meta = getTutorial("python-install")!

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
}

const TOC = [
  { id: "windows", label: "Windows" },
  { id: "macos", label: "macOS" },
  { id: "linux", label: "Linux" },
  { id: "issues", label: "Common issues" },
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
        Python is the runtime that powers Frida&apos;s CLI tools and your
        automation scripts. You need Python 3.10 or newer — ideally 3.11 or
        3.12.
      </p>

      <h2 id="windows">Installing on Windows</h2>
      <Steps
        items={[
          {
            title: "Download the installer",
            children: (
              <p>
                Go to{" "}
                <a
                  href="https://www.python.org/downloads/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  python.org/downloads
                </a>{" "}
                and click the yellow &ldquo;Download Python 3.x.x&rdquo;
                button.
              </p>
            ),
          },
          {
            title: 'Check "Add Python to PATH" — critical',
            children: (
              <>
                <p>
                  Before clicking Install Now, check the box at the bottom
                  that says <strong>&ldquo;Add Python to PATH&rdquo;</strong>.
                  If you skip this, nothing works from the terminal.
                </p>
                <Callout variant="warn">
                  Already installed without this option? Uninstall and
                  reinstall with it enabled.
                </Callout>
              </>
            ),
          },
          {
            title: "Verify",
            children: (
              <>
                <p>Open a new terminal and run:</p>
                <CodeBlock
                  language="bash"
                  code={`python --version\n# Expected: Python 3.12.x`}
                />
                <p>
                  If it says &ldquo;not recognized&rdquo;, the PATH step was
                  missed — reinstall.
                </p>
              </>
            ),
          },
          {
            title: "Confirm pip",
            children: (
              <CodeBlock
                language="bash"
                code={`pip --version\n# Expected: pip 24.x.x from C:\\...\\site-packages\\pip (python 3.12)`}
              />
            ),
          },
        ]}
      />

      <h2 id="macos">macOS</h2>
      <CodeBlock
        language="bash"
        code={`# Homebrew (recommended)\nbrew install python@3.12\n\n# Or download the .pkg from python.org`}
      />

      <h2 id="linux">Linux</h2>
      <CodeBlock
        language="bash"
        code={`# Debian/Ubuntu\nsudo apt update && sudo apt install python3 python3-pip\n\n# Arch\nsudo pacman -S python python-pip\n\n# Fedora\nsudo dnf install python3 python3-pip`}
      />

      <h2 id="issues">Common issues</h2>
      <Callout variant="info" title="Multiple Python versions">
        On macOS/Linux, use <code>python3</code> and <code>pip3</code> if you
        have both Python 2 and 3.
      </Callout>
      <Callout variant="tip" title="Use a virtual environment">
        Keep mod packages isolated: <code>python -m venv modenv</code>, then
        activate with <code>modenv\Scripts\activate</code> (Windows) or{" "}
        <code>source modenv/bin/activate</code> (Mac/Linux).
      </Callout>
    </TutorialLayout>
  )
}
