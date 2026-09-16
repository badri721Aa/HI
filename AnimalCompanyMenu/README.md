# AC Hand Menu — ImGui-style VR menu template for Animal Company

A clean, animated, **ImGui-style menu that floats on your hand** in Animal Company (Quest / PC),
written for the same stack the community menus use: **Frida + frida-il2cpp-bridge** (TypeScript).

> **Template only.** It ships the complete UI framework, pages, settings, themes and a feature
> system with *placeholder* features. It contains **no game modifications** — you add those.

```
 ┌──────────────────────────────────────────────────────────────┐
 │ ● AC MENU  hand menu template              12:31   72 FPS  ✕ │
 ├──────────┬───────────────────────────────────────────────────┤
 │ H  Home  │  Settings                                         │
 │ F  Feat… │  ▸ Hand & position                                │
 │ W  Widg… │    [Left hand | Right hand]                       │
 │ S  Sett… │    Size ───────●──────────────────────── 1.00x    │
 │ T  Theme │    Smoothing ──────────●───────────────── 0.35    │
 │ C  Cons… │  ▸ Opening the menu                               │
 │ i  About │    Open mode  ............ Press button to toggle │
 │          │    Open button ............... [   Y   ] [x]      │
 ├──────────┴───────────────────────────────────────────────────┤
 │ ● GorillaLocomotion        pointer: finger        Settings 4/7│
 └──────────────────────────────────────────────────────────────┘
```

## What's inside

**Widgets (immediate mode, `ui.xxx()` like Dear ImGui)**
`label` · `text` · `textDim` · `textWrapped` · `header` · `separator(label)` · `keyValue` · `badge` ·
`button` (default / primary / accent2 / danger / ghost, small) · `toggleButton` · `buttonRow` · `iconButton` ·
`toggle` (animated switch or checkbox, optional description, disabled) · `slider` · `intSlider` · `stepper` · `progress` ·
`dropdown` (inline list) · `tabs` (animated indicator) · `colorPicker` (swatch, hue presets, RGB + hue sliders) ·
`keybind` (press-a-button capture) · `textField` (opens an on-panel keyboard) · `collapsingHeader` ·
`beginCard/endCard` · `statCard` · `beginColumns/nextColumn/endColumns` · `sameLine` · `setNextWidth` · `indent` · `spacing` ·
`tooltip` · `pushId/popId` · `isItemHovered`

**Systems**
- World-space Unity canvas attached to your hand: **float mode** (hovers above the hand, always faces your head) or **locked mode** (rigid, with rotation offsets). Smoothing, size and offsets are live sliders.
- **Pointer modes:** finger (push into the panel to click, touch-screen feel, with hysteresis), laser (button click, LineRenderer beam), gaze (head ray, for desktop testing). Cursor dot shrinks as the finger approaches.
- **Open modes:** toggle button, hold button, or palm-facing-you gesture. Any controller button is bindable in-menu.
- Drag-to-scroll with fling, thumbstick scroll, scrollbar, tooltips, haptic ticks on hover/click.
- **5 themes** (Midnight, Aurora, Ember, Ocean, Ghost) with live color editing, corner radius, glow, font size.
- Toast notifications (info / success / warning / error), modal keyboard, console page with log filter.
- Settings + feature state persisted with `PlayerPrefs` (works on Quest and PC without file access).
- **Feature framework:** `class MyFeature extends Feature` with `onEnable / onDisable / onUpdate / drawSettings`, categories, search, persisted per-feature values.
- **Wrist HUD:** small clock/FPS card on the hand while the menu is closed.
- Robustness: works with Animal Company's **obfuscated IL2CPP exports** (auto map + manual map + dump tool), frame-hook fallbacks, hand-transform fallbacks, page errors are caught and shown, unload/rebuild from the menu.

## Requirements

- **Node.js 18+** (to build) and **Python 3 + `pip install frida-tools`** (to inject).
- Animal Company running:
  - **PC:** just start the game.
  - **Quest:** a headset running **frida-server** (rooted Quest 3/3S via the community root exploit, same requirement as ii's Quest Menu / Comet), USB or Wi-Fi ADB. Without root you must repackage the APK with a **frida-gadget** in script mode and load `dist/_agent.js` — see *Quest without root* below.

## Quick start

```bash
npm install
npm run build          # -> dist/_agent.js  (single file, everything bundled)
```

**PC**
```
frida -l dist/_agent.js AnimalCompany.exe      # or double-click tools/run-pc.bat
```

**Quest (rooted, frida-server running)**
```
frida-ps -Ua                                   # find the exact process name / package
frida -U -l dist/_agent.js -n "Animal Company" # or tools/run-quest.bat "<name>"
```

Load fully into the game (not just the main menu). The Frida console prints `menu built …` and a toast appears
on your hand. Default controls: **Y** (left secondary) opens/closes, poke widgets with your **right index finger**.

## Controls

| Action | Default |
|---|---|
| Open / close | `Y` on the left controller (toggle) — change in *Settings → Opening the menu* |
| Click | push the pointer finger into a widget and pull back (or *Click on press*) |
| Scroll | drag on empty space, or right thumbstick |
| Tooltip | hover a widget for ~0.6 s |
| Type | tap a text field → on-panel keyboard |

## Tuning the position on your hand

Open *Settings → Hand & position*. `Float` mode is the safe default (the panel hovers above your hand and turns to
face you). Move it with the *offset* sliders (cm). Switch to `Locked` if you want it welded to the hand like a watch and
use *rotation* to orient it. *Size* scales the whole panel. Everything saves automatically.

## Adding your own stuff

**A page** (`src/pages/mypage.ts`, then import it in `src/pages/index.ts`):
```ts
import { registerPage } from "./page.js";
let speed = 1;
registerPage({
    id: "mypage", title: "My page", icon: "M", order: 15,
    draw(ctx) {
        const ui = ctx.ui;
        ui.header("My page");
        speed = ui.slider("Speed", speed, 0, 10, { step: 0.5 });
        if (ui.button("Do something", { variant: "primary" })) ctx.notify.success("Done");
    },
});
```

**A feature** (`src/features/myfeature.ts`, then import it in `src/features/index.ts`):
```ts
import { Feature, featureRegistry } from "./feature.js";
class MyFeature extends Feature {
    readonly id = "my.feature"; readonly name = "My feature";
    override readonly category = "Movement"; override readonly description = "What it does";
    override onEnable(ctx) { /* your code */ }
    override onDisable(ctx) { /* undo it */ }
    override onUpdate(dt, ctx) { /* every frame while on */ }
}
featureRegistry.register(new MyFeature());
```
The *Features* page lists it automatically (toggle + description + optional `drawSettings`).

**Talking to the game** — use the helpers in `src/core/unity.ts` (`cls`, `tryCls`, `vec3`, `getPosition`, …) and the
class names in `src/game/ac.ts`. Everything runs inside the frame hook, i.e. on Unity's main thread.

## Themes

`src/ui/theme.ts` → add a preset to `THEMES`. All colors/metrics are editable live on the *Theme* page.

## Project layout

```
src/index.ts              entry: installs the export resolver, starts the menu
src/config.ts             name/version, default settings, panel size
src/game/ac.ts            the only file with Animal Company class names
src/il2cpp-exports.ts     obfuscated export handling (auto / manual / plain)
src/core/  unity.ts       cached class lookup, struct builders, transform/rect helpers
           frame.ts       per-frame hook with fallbacks
           input.ts       XR controller polling + edge detection + haptics
           hands.ts       head/hand transforms (game providers → generic names → camera)
           prefs.ts       PlayerPrefs persistence
           math.ts        vectors, quaternions, colors, easing
src/ui/    gui.ts         immediate-mode core + every widget
           menu.ts        panel chrome, hand following, page routing, overlays
           elements.ts    Image/Text primitives (TextMeshPro or legacy Text)
           sprites.ts     procedural anti-aliased sprites
           pointer.ts     finger / laser / gaze → panel coordinates
           theme.ts · notifications.ts · keyboard.ts
src/pages/                home, features, gallery (all widgets), settings, theme, console, about
src/features/             Feature base class + placeholder examples
tools/                    run scripts, dump-exports.js
dist/_agent.js            prebuilt bundle
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `couldn't find export …` / crash right after attach | The export map failed. Run `frida -l tools/dump-exports.js AnimalCompany.exe`, paste its output into `MANUAL_EXPORT_MAP` in `src/il2cpp-exports.ts`, rebuild. Or paste a community map (Comet.PC `exports.ts`, OrbitMenu `Frida-Map.js`). |
| Nothing appears, console says `waiting for the first frame` | Load fully into a game world. The frame hook is on `GorillaLocomotion.LateUpdate` which only runs in-game. |
| `rig: could not find hand transforms` | Same — you are not in-game yet, or the class names in `src/game/ac.ts` changed after a game update (check a fresh dump). |
| Text is invisible / boxes | TMP has no default font asset in this build → the code falls back to legacy Text automatically; check the Console page. |
| Menu is tiny / huge / wrong side | Settings → *Size*, *offset*, *Left/Right hand*. |
| Clicks feel wrong | Try *Click on press*, or a bigger *Forward* finger offset. |

**Quest without root:** decompile the APK, add `libgadget.so` (frida-gadget for arm64) + a `libgadget.config.so`
pointing at `dist/_agent.js` (`"interaction": {"type":"script","path":"…/_agent.js"}`), load the library from the app's
`UnityPlayerActivity`, re-sign, sideload. Guides: search *"frida gadget android script mode"*.

## Credits & notes

- Export-obfuscation approach and Animal Company class names come from the open-source community menus
  [Comet.PC](https://github.com/developerman9876/Comet.PC), [OrbitMenu](https://github.com/hluysterd-del/OrbitMenu)
  and [ii's Quest Menu](https://github.com/iiDk-the-actual/iis.Quest.Menu) (MIT).
- Built on [frida-il2cpp-bridge](https://github.com/vfsfitvnm/frida-il2cpp-bridge).
- This template modifies nothing in the game by itself. Whatever you build with it: respect other players and the game's rules.

MIT © template contributors
