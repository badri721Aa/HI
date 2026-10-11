# Throttle County: Roblox riding game prompt

This folder holds a 500-paragraph prompt you paste into another AI chat (ChatGPT, Claude, Gemini or similar). That AI then builds an open-world Roblox riding game with you, one phase at a time.

The game has e-bikes, electric dirt bikes, gas dirt bikes, pit bikes, supermotos, trials bikes, sport bikes, cruisers, scooters, BMX and mountain bikes, quads, a UTV, a snowmobile, a jet ski, and pickup trucks with bike trailers. There are 53 vehicles, a 4.5 km map with 10 regions, jobs, races, drag racing, stunts, customization, tuning, weather, a day/night cycle, traffic and saving.

## What's in the folder

| File | Use it for |
|---|---|
| `parts/PART_01.md` to `parts/PART_10.md` | The prompt in 10 pieces. Paste them one at a time (best for most chats). |
| `FULL_PROMPT.md` | The whole prompt in one file. Upload it as a file attachment, or paste it if your chat takes very long messages. |

## How to use it

1. Open a brand-new chat.
2. Paste `PART_01.md` and send it.
3. The AI replies `Part 1 received - send part 2.`
4. Keep going until you have sent Part 10. The AI checks it has all 500 paragraphs and starts **Phase 1**.

While it builds:

- Type `next` to start the next phase (there are 13).
- Type `continue` if a reply gets cut off.
- If Roblox Studio shows a red error in the Output window, copy it and paste it into the chat. The AI sends back the fixed file.
- Type `redo paragraph 237` (any number) to redo that part.
- If the AI starts forgetting details, paste the part again. Section 21 says which part each phase needs.

**It's long.** The whole prompt is about 70,000 words, and each part is 40,000 to 58,000 characters. If your chat says a part is too long, upload `FULL_PROMPT.md` as a file instead. An AI with a big memory (Claude, Gemini, or a paid ChatGPT plan) handles it best.

## Things only you can do

- Change the Studio settings the AI lists (gravity, streaming, lighting).
- Turn on **Game Settings > Security > Enable Studio Access to API Services** so saving works.
- Get the 3D bike models. A text AI cannot make real 3D models, so it gives you drivable stand-in bikes built at the real size first. To make them look like the real thing, model them in Blender (the prompt includes modeling specs for every vehicle) or get models from the Roblox Creator Store, then drop them in. No code changes needed.
- Upload engine and tire sounds and put their IDs into the sound list the AI creates.
- Publish the game and test it on a phone and with a controller.

## Good to know

- **Brand names are made up on purpose.** Real logos and model names (Sur-Ron, Honda, KTM and so on) can get a Roblox game taken down. Each bike copies a real one's size, speed, power and sound under a new name, like the "Volt Wasp X", which is based on a Sur-Ron Light Bee X.
- **No AI can promise zero bugs** in a game this big. The prompt makes the AI follow strict rules to avoid errors, and when one slips through, you paste it back and it gets fixed.
- **This is a big project.** Expect many sessions over weeks. That's normal for a game at this level.
