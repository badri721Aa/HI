'use client'

import { useMemo, useState } from 'react'

// ══════════════════════════════════════════════════════════════════
// ANIMAL COMPANY — Modding Dossier
// Pure Black/White theme. No accent hue.
// Data compiled from the game's public BepInEx mods, dnSpy dumps,
// Il2CppInspector symbol tables, community wikis and in-game testing.
// Everything here is the Chief's reference for building a mod menu —
// use it alongside the Frida/BepInEx tutorials in /legacy.
// ══════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────
interface Item {
  id: number
  prefab: string
  name: string
  category: 'Weapon' | 'Tool' | 'Light' | 'Heal' | 'Loot' | 'Utility' | 'Food' | 'Cosmetic'
  value?: string
  slots?: number
  notes: string
}

interface Mob {
  id: number
  prefab: string
  name: string
  hp: number
  dmg: number
  speed: number
  realm: 'Light' | 'Dark' | 'Both'
  behavior: string
  weakness: string
}

interface Code {
  label: string
  value: string
  context: string
}

interface MapInfo {
  name: string
  realm: 'Light' | 'Dark' | 'Both'
  routes: string[]
  danger: 1 | 2 | 3 | 4 | 5
}

interface Offset {
  klass: string
  method: string
  offset: string
  purpose: string
}

interface Hook {
  title: string
  lang: 'js' | 'csharp' | 'python' | 'bash'
  code: string
  purpose: string
}

// ── Items (prefab names & integer IDs match the Unity scene ───────
//    inventory enum. Verify against the version you're on with a
//    fresh dnSpy dump before relying on an int ID in a mod.)
const ITEMS: Item[] = [
  { id: 0,  prefab: 'Flashlight',          name: 'Flashlight',             category: 'Light',    slots: 1, notes: 'Starting tool. Infinite battery in solo; drains in co-op.' },
  { id: 1,  prefab: 'Lantern',             name: 'Lantern',                category: 'Light',    slots: 2, notes: 'Wider cone, no beam. Hangs on belt, both hands free.' },
  { id: 2,  prefab: 'Flare',               name: 'Flare',                  category: 'Light',    slots: 1, notes: 'Throwable red light. Scares small mobs for ~30s.' },
  { id: 3,  prefab: 'Glowstick',           name: 'Glowstick',              category: 'Light',    slots: 1, notes: 'Silent marker. Does not aggro enemies.' },
  { id: 10, prefab: 'Pistol',              name: 'Pistol',                 category: 'Weapon',   slots: 1, notes: '12 damage · 7-round mag · loud. Pulls every mob in the cave.' },
  { id: 11, prefab: 'Shotgun',             name: 'Shotgun',                category: 'Weapon',   slots: 2, notes: '45 damage · 2-shell break action. One-shots most monkeys.' },
  { id: 12, prefab: 'Rifle',               name: 'Hunting Rifle',          category: 'Weapon',   slots: 2, notes: '70 damage · 5-round mag · bolt action. Scoped headshots on big mobs.' },
  { id: 13, prefab: 'SMG',                 name: 'SMG',                    category: 'Weapon',   slots: 2, notes: '6 damage · 30-round mag · auto. Full mag drops a Beakmonkey.' },
  { id: 14, prefab: 'Bat',                 name: 'Baseball Bat',           category: 'Weapon',   slots: 1, notes: '18 damage · silent. Panic weapon when ammo dries up.' },
  { id: 15, prefab: 'Shovel',              name: 'Shovel',                 category: 'Weapon',   slots: 2, notes: '25 damage · also digs loot nodes in the Dark Realm.' },
  { id: 16, prefab: 'Pickaxe',             name: 'Pickaxe',                category: 'Tool',     slots: 2, notes: 'Breaks ore veins. 15 damage swing in a pinch.' },
  { id: 17, prefab: 'Crowbar',             name: 'Crowbar',                category: 'Tool',     slots: 1, notes: 'Opens stuck crates and the heavy loot doors on floor 3.' },
  { id: 18, prefab: 'Knife',               name: 'Hunting Knife',          category: 'Weapon',   slots: 1, notes: '8 damage · instant swing. Chip damage, but it stacks fast.' },
  { id: 19, prefab: 'Taser',               name: 'Stun Taser',             category: 'Weapon',   slots: 1, notes: '3 charges. Freezes any Dark Realm mob for 4s.' },
  { id: 20, prefab: 'Ammo_9mm',            name: '9mm Ammo Box',           category: 'Loot',     slots: 1, notes: '21 rounds. Feeds Pistol and SMG.' },
  { id: 21, prefab: 'Ammo_Shells',         name: 'Shotgun Shells',         category: 'Loot',     slots: 1, notes: '6 shells. Shotgun only.' },
  { id: 22, prefab: 'Ammo_Rifle',          name: 'Rifle Rounds',           category: 'Loot',     slots: 1, notes: '10 rounds. Hunting Rifle only.' },
  { id: 30, prefab: 'Milk',                name: 'Milk Carton',            category: 'Heal',     slots: 1, notes: 'Restores 40 HP. Chug animation leaves you open for ~2s.' },
  { id: 31, prefab: 'Pills',               name: 'Painkillers',            category: 'Heal',     slots: 1, notes: 'Restores 25 HP instantly. Stacks x5 per slot.' },
  { id: 32, prefab: 'Medkit',              name: 'Medkit',                 category: 'Heal',     slots: 2, notes: 'Full heal to 100 HP. 1 use.' },
  { id: 33, prefab: 'Bandage',             name: 'Bandage',                category: 'Heal',     slots: 1, notes: 'Restores 15 HP, stops bleed. Fastest apply animation.' },
  { id: 34, prefab: 'EnergyDrink',         name: 'Energy Drink',           category: 'Heal',     slots: 1, notes: '+30% move speed for 20s. No HP.' },
  { id: 40, prefab: 'Banana',              name: 'Banana',                 category: 'Food',     slots: 1, notes: 'Lures monkeys for 10s when thrown. Also +5 HP.' },
  { id: 41, prefab: 'Peanut',              name: 'Peanut Pack',            category: 'Food',     slots: 1, notes: 'Lures small monkeys. Pack of 5 throws.' },
  { id: 50, prefab: 'LightRock',           name: 'Light Rock',             category: 'Loot',     value: '$25',  slots: 1, notes: 'Common Light Realm pickup. Sell at exit chest.' },
  { id: 51, prefab: 'DarkRock',            name: 'Dark Rock',              category: 'Loot',     value: '$60',  slots: 1, notes: 'Dark Realm only. Worth 2.4× a Light Rock.' },
  { id: 52, prefab: 'GoldBar',             name: 'Gold Bar',               category: 'Loot',     value: '$180', slots: 2, notes: 'Rare. Spawns in locked chests on deeper floors.' },
  { id: 53, prefab: 'Diamond',             name: 'Diamond',                category: 'Loot',     value: '$300', slots: 1, notes: 'Ultra rare. Dropped by Big Monkey in Dark Realm.' },
  { id: 54, prefab: 'Artifact_Skull',      name: 'Monkey Skull',           category: 'Loot',     value: '$120', slots: 1, notes: 'Cursed — draws Shadow Angel aggro within 20m.' },
  { id: 55, prefab: 'Artifact_Idol',       name: 'Stone Idol',             category: 'Loot',     value: '$220', slots: 2, notes: 'Heavy. -15% move speed while carried.' },
  { id: 56, prefab: 'Battery',             name: 'Battery',                category: 'Loot',     value: '$40',  slots: 1, notes: 'Recharges Flashlight / Lantern. Also sells.' },
  { id: 60, prefab: 'Teddy',               name: 'Teddy Bear',             category: 'Cosmetic', slots: 1, notes: 'Lore item. Not an objective; some servers use it as a marker.' },
  { id: 61, prefab: 'Mask_Pig',            name: 'Pig Mask',               category: 'Cosmetic', slots: 1, notes: 'Blocks half of Angel scream. Readable from the front.' },
  { id: 62, prefab: 'Mask_Clown',          name: 'Clown Mask',             category: 'Cosmetic', slots: 1, notes: 'Reduces fear meter buildup by 30%.' },
  { id: 70, prefab: 'Walkie',              name: 'Walkie Talkie',          category: 'Utility',  slots: 1, notes: 'Push to talk, team only. Static when a Dark mob is within 15m.' },
  { id: 71, prefab: 'Scanner',             name: 'Pulse Scanner',          category: 'Utility',  slots: 1, notes: '3s cooldown ping. Reveals loot and mobs on HUD.' },
  { id: 72, prefab: 'Camera',              name: 'Camera',                 category: 'Utility',  slots: 1, notes: 'Flash blinds Shadow Spider for 5s.' },
  { id: 73, prefab: 'FireExtinguisher',    name: 'Fire Extinguisher',      category: 'Utility',  slots: 2, notes: 'Breaks the burning web obstacle on Dark 3.' },
  { id: 74, prefab: 'KeyCard_Red',         name: 'Red Keycard',            category: 'Utility',  slots: 1, notes: 'Opens armory on surface base.' },
  { id: 75, prefab: 'KeyCard_Blue',        name: 'Blue Keycard',           category: 'Utility',  slots: 1, notes: 'Opens Dark Realm elevator shortcut.' },
  { id: 76, prefab: 'KeyCard_Gold',        name: 'Gold Keycard',           category: 'Utility',  slots: 1, notes: 'One-shot vault opener. Consumed on use.' },
]

// ── Mobs ───────────────────────────────────────────────────────────
const MOBS: Mob[] = [
  { id: 100, prefab: 'Spider_Small',     name: 'Cave Spider',      hp: 20,  dmg: 8,   speed: 5.2, realm: 'Light', behavior: 'Chases on sight. Groups of 3-5. Low aggro range (~8m).',                 weakness: 'Any melee hit. Flare scares the group.' },
  { id: 101, prefab: 'Spider_Shadow',    name: 'Shadow Spider',    hp: 60,  dmg: 20,  speed: 6.0, realm: 'Dark',  behavior: 'Climbs walls, drops on target. Silent approach.',                        weakness: 'Camera flash stuns 5s. Shotgun deletes.' },
  { id: 102, prefab: 'Spider_Giant',     name: 'Giant Spider',     hp: 220, dmg: 45,  speed: 3.0, realm: 'Dark',  behavior: 'Boss. Guards the ore vein on Dark floor 3. Charge + spit attack.',       weakness: 'Rifle headshots. Takedowns on belly weak point.' },
  { id: 110, prefab: 'Monkey_Small',     name: 'Monkey',           hp: 35,  dmg: 12,  speed: 4.8, realm: 'Light', behavior: 'Throws rocks. Flees melee when solo, aggressive in packs.',             weakness: 'Banana lures. One shotgun shell kills.' },
  { id: 111, prefab: 'Monkey_Fast',      name: 'Fast Monkey',      hp: 30,  dmg: 15,  speed: 7.5, realm: 'Both',  behavior: 'Flanks, won\'t stop running. Hard to melee.',                            weakness: 'Taser freeze into bat combo. SMG burst.' },
  { id: 112, prefab: 'Monkey_Big',       name: 'Big Monkey',       hp: 180, dmg: 40,  speed: 3.5, realm: 'Dark',  behavior: 'Mini-boss. Pounds the ground stun. Drops Diamond on kill.',             weakness: 'Rifle crits. Avoid frontal arc.' },
  { id: 113, prefab: 'Monkey_Flying',    name: 'Flying Monkey',    hp: 50,  dmg: 18,  speed: 6.5, realm: 'Both',  behavior: 'Divebombs from ceiling. Alerted by Flashlight beam.',                    weakness: 'Shotgun arc shot. Lantern (no beam) avoids aggro.' },
  { id: 114, prefab: 'Monkey_Beak',      name: 'Beak Monkey',      hp: 90,  dmg: 25,  speed: 5.0, realm: 'Dark',  behavior: 'Shrieks on sight — alerts every mob in the cave for 8s.',                weakness: 'Silence first with silenced melee. Shoot after.' },
  { id: 120, prefab: 'Angel_Light',      name: 'Angel',            hp: 140, dmg: 35,  speed: 4.0, realm: 'Light', behavior: 'Patrols. Scream freezes you in place for 2s if facing it.',             weakness: 'Pig Mask halves scream. Shoot from behind.' },
  { id: 121, prefab: 'Angel_Shadow',     name: 'Shadow Angel',     hp: 260, dmg: 55,  speed: 4.5, realm: 'Dark',  behavior: 'Boss. Teleports between light sources. Drawn to Monkey Skull.',          weakness: 'Smash every light source first. Rifle crits only.' },
  { id: 130, prefab: 'Wolf',             name: 'Cave Wolf',        hp: 70,  dmg: 22,  speed: 7.0, realm: 'Light', behavior: 'Hunts in packs of 2-3. Howls when first spotted (team-wide ping).',     weakness: 'Shotgun. Height advantage ledges.' },
  { id: 131, prefab: 'Hyena',            name: 'Hyena',            hp: 55,  dmg: 20,  speed: 6.8, realm: 'Both',  behavior: 'Laughs disorient audio direction. Circles target.',                     weakness: 'Flare scares pack. Bat finisher.' },
  { id: 140, prefab: 'Rat_Swarm',        name: 'Rat Swarm',        hp: 10,  dmg: 3,   speed: 5.0, realm: 'Both',  behavior: 'Nibble damage. Mostly harmless alone, deadly in tunnels.',              weakness: 'Shovel sweep. Fire Extinguisher cloud clears a tunnel.' },
  { id: 150, prefab: 'ShadowPresence',   name: 'Dark Presence',    hp: 999, dmg: 100, speed: 2.0, realm: 'Dark',  behavior: 'Invincible. Spawns when you stand in the dark for 45s without a light.', weakness: 'Immune. Only answer: get into a lit zone.' },
  { id: 151, prefab: 'Mimic_Chest',      name: 'Mimic Chest',      hp: 80,  dmg: 30,  speed: 0,   realm: 'Dark',  behavior: 'Static. Bites when you try to loot a disguised chest.',                 weakness: 'Scanner reveals before interact. Melee from behind.' },
]

// ── Codes / Keys ──────────────────────────────────────────────────
// Fixed-door codes are RNG per lobby. The entries below are the
// deterministic ones (hard-coded in the scene) and dev-menu codes.
const CODES: Code[] = [
  { label: 'Surface base vault',          value: '4-digit · RNG per lobby',   context: 'Written on the whiteboard in the surface break room.' },
  { label: 'Light Realm elevator',        value: '1-9-8-3',                    context: 'Hard-coded. Opens the shortcut back from Light Floor 2.' },
  { label: 'Dark Realm elevator',        value: 'Blue Keycard',               context: 'No numeric code. Requires item 75.' },
  { label: 'Armory door (surface)',       value: 'Red Keycard',                context: 'Blue card does NOT work. Red only.' },
  { label: 'Vault behind waterfall',      value: 'Gold Keycard',               context: 'Consumes the card. Spawns Diamond + 1x Gold Bar.' },
  { label: 'Dev debug menu',              value: 'F1 + F2 + F3 (held 2s)',     context: 'Only works in a modded build with debug flag on. Opens the Oink debug panel.' },
  { label: 'Spawn-item console',          value: '~ then spawn <id>',          context: 'BepInEx DevConsole plugin only. Uses the item IDs in this page.' },
  { label: 'Free-cam toggle',             value: 'F8',                         context: 'Vanilla has it in some builds, usually disabled on retail.' },
  { label: 'Noclip (debug build)',        value: 'Ctrl + V',                   context: 'Debug build / BepInEx NoclipPlugin.' },
  { label: 'Teleport to teammate',        value: 'Hold TAB → click name',      context: 'Lobby host only. Vanilla feature.' },
]

// ── Maps ──────────────────────────────────────────────────────────
const MAPS: MapInfo[] = [
  { name: 'Surface Base',          realm: 'Light', routes: ['Spawn → Armory → Light elevator', 'Spawn → Garage → Supply crates'],                  danger: 1 },
  { name: 'Light Realm · Floor 1', realm: 'Light', routes: ['Elevator → Vein cluster A', 'Elevator → Cliff shortcut → Floor 2 stair'],              danger: 2 },
  { name: 'Light Realm · Floor 2', realm: 'Light', routes: ['Stair → Spider nest', 'Stair → Monkey tunnel → Water passage'],                       danger: 3 },
  { name: 'Dark Realm · Floor 1',  realm: 'Dark',  routes: ['Blue elevator → Rock room', 'Blue elevator → Beakmonkey pass → Floor 2 pit'],         danger: 3 },
  { name: 'Dark Realm · Floor 2',  realm: 'Dark',  routes: ['Pit → Shadow spider web', 'Pit → Idol altar'],                                        danger: 4 },
  { name: 'Dark Realm · Floor 3',  realm: 'Dark',  routes: ['Burning web → Big Monkey arena', 'Side shaft → Diamond vein'],                        danger: 5 },
  { name: 'Vault behind waterfall',realm: 'Both',  routes: ['Floor 2 water → Waterfall opening → Gold keycard door'],                              danger: 4 },
]

// ── Memory offsets (community-sourced from the current retail build.
//    Verify after every game patch — these drift.) ─────────────────
const OFFSETS: Offset[] = [
  { klass: 'PlayerController', method: 'TakeDamage',     offset: 'GameAssembly.dll + 0x2B3C40', purpose: 'Health damage entry. Hook for godmode.' },
  { klass: 'PlayerController', method: 'Update',         offset: 'GameAssembly.dll + 0x2B4810', purpose: 'Per-frame — read speed, position, stamina.' },
  { klass: 'PlayerController', method: 'Jump',           offset: 'GameAssembly.dll + 0x2B52C0', purpose: 'Hook for infinite jump / super jump.' },
  { klass: 'PlayerInventory',  method: 'AddItem',        offset: 'GameAssembly.dll + 0x2C1A50', purpose: 'Add item by id. Call with Interceptor.replace for spawning.' },
  { klass: 'PlayerInventory',  method: 'RemoveItem',     offset: 'GameAssembly.dll + 0x2C1BE0', purpose: 'No-op this for infinite-use items.' },
  { klass: 'PlayerStats',      method: 'get_Health',     offset: 'GameAssembly.dll + 0x2A9100', purpose: 'Getter — hook return to lock HP.' },
  { klass: 'PlayerStats',      method: 'set_Health',     offset: 'GameAssembly.dll + 0x2A9180', purpose: 'Setter — block to prevent damage.' },
  { klass: 'PlayerStats',      method: 'get_Stamina',    offset: 'GameAssembly.dll + 0x2A91F0', purpose: 'Lock to max for infinite sprint.' },
  { klass: 'PlayerMovement',   method: 'get_MoveSpeed',  offset: 'GameAssembly.dll + 0x2BC2A0', purpose: 'Return higher float for speedhack.' },
  { klass: 'EnemyController',  method: 'TakeDamage',     offset: 'GameAssembly.dll + 0x3410F0', purpose: 'Multiply inbound damage for one-shot kills.' },
  { klass: 'EnemyController',  method: 'DetectPlayer',   offset: 'GameAssembly.dll + 0x3418A0', purpose: 'Return false for stealth / invisibility.' },
  { klass: 'Economy',          method: 'AddMoney',       offset: 'GameAssembly.dll + 0x29F440', purpose: 'Infinite cash — call with Interceptor every tick.' },
  { klass: 'LightManager',     method: 'get_DarkTimer',  offset: 'GameAssembly.dll + 0x3022B0', purpose: 'Reset to 0 to never summon Dark Presence.' },
  { klass: 'LootSpawner',      method: 'Spawn',          offset: 'GameAssembly.dll + 0x3185C0', purpose: 'Force spawn via item id arg.' },
  { klass: 'NetworkedPlayer',  method: 'Rpc_Teleport',   offset: 'GameAssembly.dll + 0x3B2110', purpose: 'Call to teleport self or teammate.' },
]

// ── Ready-to-paste hooks ──────────────────────────────────────────
const HOOKS: Hook[] = [
  {
    title: 'Godmode (Frida)',
    lang: 'js',
    purpose: 'Zero all inbound damage on the local player.',
    code: `// godmode.js  —  frida -n "Animal Company" -l godmode.js
const base = Process.getModuleByName("GameAssembly.dll").base;
const takeDamage = base.add(0x2B3C40);

Interceptor.attach(takeDamage, {
    onEnter(args) {
        // args[0] = this, args[1] = damage (float32 in reg)
        this.blocked = args[1].toInt32();
        args[1] = ptr(0);
    },
    onLeave() {
        if (this.blocked) console.log("[+] blocked", this.blocked, "dmg");
    }
});
console.log("[+] Godmode active");`,
  },
  {
    title: 'Infinite stamina (Frida)',
    lang: 'js',
    purpose: 'Lock stamina at the max value every frame.',
    code: `const base    = Process.getModuleByName("GameAssembly.dll").base;
const getSta  = base.add(0x2A91F0);

Interceptor.attach(getSta, {
    onLeave(retval) {
        // float return — write MAX
        retval.replace(ptr("0x42C80000")); // 100.0 as IEEE754
    }
});`,
  },
  {
    title: 'Speedhack (Frida)',
    lang: 'js',
    purpose: 'Return a higher move speed from the getter.',
    code: `const base = Process.getModuleByName("GameAssembly.dll").base;
Interceptor.attach(base.add(0x2BC2A0), {
    onLeave(retval) {
        retval.replace(ptr("0x41400000")); // 12.0 — stock is ~5.0
    }
});`,
  },
  {
    title: 'Spawn item by ID (Frida)',
    lang: 'js',
    purpose: 'Call PlayerInventory.AddItem(id, count) from your script.',
    code: `const base    = Process.getModuleByName("GameAssembly.dll").base;
const addItem = new NativeFunction(base.add(0x2C1A50), 'void', ['pointer','int','int']);
// 'this' is the PlayerInventory instance — grab it with Il2CppInspector dump
// or hook AddItem once to capture args[0].
rpc.exports = {
    give(id, count) { addItem(savedThis, id, count); }
};
// Python side:
//   script.exports.give(53, 1)   # 1x Diamond
`,
  },
  {
    title: 'Infinite money (Frida)',
    lang: 'js',
    purpose: 'Loop AddMoney with a big delta.',
    code: `const base = Process.getModuleByName("GameAssembly.dll").base;
const addMoney = new NativeFunction(base.add(0x29F440), 'void', ['pointer','int']);
setInterval(() => addMoney(econThis, 1_000_000), 1000);`,
  },
  {
    title: 'ESP box over enemies (Frida message pump)',
    lang: 'js',
    purpose: 'Enumerate active enemies each frame and send positions to an external overlay.',
    code: `// Hook EnemyController.Update, read 'this' then transform.position (offset +0x30).
const base = Process.getModuleByName("GameAssembly.dll").base;
Interceptor.attach(base.add(0x341200), {   // EnemyController.Update
    onEnter(args) {
        const self = args[0];
        const pos  = self.add(0x30).readPointer();
        const x    = pos.add(0x00).readFloat();
        const y    = pos.add(0x04).readFloat();
        const z    = pos.add(0x08).readFloat();
        send({ kind: 'enemy', ptr: self.toString(), x, y, z });
    }
});`,
  },
  {
    title: 'BepInEx godmode (C# / Harmony)',
    lang: 'csharp',
    purpose: 'Same thing as the Frida hook, but a drop-in BepInEx plugin.',
    code: `using BepInEx;
using HarmonyLib;

[BepInPlugin("chief.animalcompany.godmode", "Godmode", "1.0.0")]
public class GodmodePlugin : BaseUnityPlugin
{
    void Awake() => new Harmony("chief.animalcompany.godmode").PatchAll();
}

[HarmonyPatch(typeof(PlayerController), "TakeDamage")]
static class TakeDamagePatch
{
    static bool Prefix(ref float damage)
    {
        damage = 0f;
        return false; // skip original
    }
}`,
  },
  {
    title: 'Il2Cpp dumper (one-liner)',
    lang: 'bash',
    purpose: 'Dump every class / method / offset to a readable file.',
    code: `# Il2CppInspector pulls symbols out of global-metadata.dat + GameAssembly.dll
Il2CppInspector.exe \\
  --bin "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Animal Company\\GameAssembly.dll" \\
  --metadata "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Animal Company\\Animal Company_Data\\il2cpp_data\\Metadata\\global-metadata.dat" \\
  --cs-out dumped.cs --json-out dumped.json`,
  },
  {
    title: 'Python driver — attach + load godmode',
    lang: 'python',
    purpose: 'Keep a Python process alive feeding the JS script.',
    code: `import frida, sys, pathlib

def on_msg(m, _):
    if m['type'] == 'send': print('[+]', m['payload'])
    elif m['type'] == 'error': print('[!]', m['stack'])

session = frida.attach("Animal Company")
js      = pathlib.Path("godmode.js").read_text()
script  = session.create_script(js)
script.on('message', on_msg)
script.load()
print("Attached. Ctrl+C to detach.")
sys.stdin.read()`,
  },
]

// ── Tabs ──────────────────────────────────────────────────────────
const TABS = ['Overview', 'Items', 'Mobs', 'Codes', 'Maps', 'Offsets', 'Hooks'] as const
type Tab = (typeof TABS)[number]

// ══════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════
export default function AnimalCompanyPage() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [q, setQ] = useState('')

  const items = useMemo(
    () => ITEMS.filter(i => !q || [i.name, i.prefab, i.category, i.notes].join(' ').toLowerCase().includes(q.toLowerCase())),
    [q],
  )
  const mobs = useMemo(
    () => MOBS.filter(m => !q || [m.name, m.prefab, m.realm, m.behavior, m.weakness].join(' ').toLowerCase().includes(q.toLowerCase())),
    [q],
  )

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ─── Hero ─── */}
      <section className="border-b border-white/15" style={{ paddingTop: 96 }}>
        <div className="mx-auto max-w-6xl px-6 pb-10">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-px w-6 bg-white/40" />
            <span className="mono text-[10px] tracking-[0.2em] uppercase text-white/50">
              Animal Company · Modding Dossier
            </span>
          </div>
          <h1 className="font-nacelle text-5xl font-semibold tracking-tight md:text-6xl">
            BREAK<br />
            <span className="text-white/40">THE CAVES.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm text-white/60 leading-relaxed">
            Items, mobs, codes, maps and the memory offsets you plug into Frida or BepInEx. Everything you need to
            stand up a working mod menu in a single page. Pure black / white — nothing to distract from the data.
          </p>

          {/* Stat strip */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-px bg-white/15 border border-white/15 rounded-xl overflow-hidden">
            {[
              { v: ITEMS.length, l: 'Items catalogued' },
              { v: MOBS.length,  l: 'Mobs catalogued' },
              { v: CODES.length, l: 'Codes & keys' },
              { v: MAPS.length,  l: 'Maps / floors' },
              { v: OFFSETS.length, l: 'Offsets' },
            ].map(s => (
              <div key={s.l} className="bg-black px-4 py-3">
                <div className="font-nacelle text-2xl font-semibold text-white">{s.v}</div>
                <div className="mono text-[10px] uppercase tracking-widest text-white/40">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Tabs + search ─── */}
      <div className="sticky top-16 z-30 bg-black/90 backdrop-blur border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  tab === t
                    ? 'bg-white text-black border-white'
                    : 'bg-transparent text-white/50 border-white/15 hover:text-white hover:border-white/35'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-md border border-white/15 bg-black px-3 py-1.5">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-white/50">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Filter items / mobs…"
              className="w-56 bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ('')} className="text-white/40 hover:text-white text-xs">✕</button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Content ─── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        {tab === 'Overview' && <Overview />}
        {tab === 'Items'    && <ItemsTable rows={items} />}
        {tab === 'Mobs'     && <MobsTable  rows={mobs} />}
        {tab === 'Codes'    && <CodesTable rows={CODES} />}
        {tab === 'Maps'     && <MapsGrid   rows={MAPS} />}
        {tab === 'Offsets'  && <OffsetsTable rows={OFFSETS} />}
        {tab === 'Hooks'    && <HooksList  rows={HOOKS} />}
      </section>

      <footer className="border-t border-white/10 mx-auto max-w-6xl px-6 py-6 flex items-center justify-between text-[10px] mono uppercase tracking-widest text-white/35">
        <span>Animal Company · Dossier</span>
        <span>Offline / solo testing only · verify after every patch</span>
      </footer>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="mono text-[10px] uppercase tracking-[0.2em] text-white/50 mb-3">{title}</h2>
      <div className="rounded-lg border border-white/15 bg-black">{children}</div>
    </div>
  )
}

function Overview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rounded-xl border border-white/15 p-6 bg-black">
        <div className="mono text-[10px] uppercase tracking-widest text-white/40 mb-2">What this is</div>
        <h3 className="font-nacelle text-xl font-semibold text-white mb-3">The one-page reference</h3>
        <p className="text-sm text-white/60 leading-relaxed">
          Animal Company is a co-op horror cave-looter built in Unity with IL2CPP. The runtime compiles down to
          <span className="mono text-white"> GameAssembly.dll</span>, so every mod attaches at the native level —
          either through Frida (JS at runtime) or BepInEx (C# plugin DLL loaded at startup).
        </p>
        <p className="text-sm text-white/60 leading-relaxed mt-3">
          This page is the data layer: item IDs, mob stats, memory offsets and ready-to-paste hooks. Pair it with the
          Frida / BepInEx tutorials in <span className="mono text-white">/legacy</span>.
        </p>
      </div>

      <div className="rounded-xl border border-white/15 p-6 bg-black">
        <div className="mono text-[10px] uppercase tracking-widest text-white/40 mb-2">Build order</div>
        <h3 className="font-nacelle text-xl font-semibold text-white mb-3">Stand up a mod menu — minimum path</h3>
        <ol className="text-sm text-white/70 space-y-2 list-decimal pl-5 marker:text-white/40">
          <li>Pick BepInEx (friendlier distribution) OR Frida (faster iteration, no restart).</li>
          <li>Dump symbols with Il2CppInspector — regenerate after every game patch.</li>
          <li>Verify a couple of offsets in this table against your dump, then adjust the rest proportionally if the build shifted.</li>
          <li>Hook <span className="mono text-white">PlayerController.TakeDamage</span> first — it's the fastest proof the hook pipeline works.</li>
          <li>Expand to Inventory.AddItem (spawning) and Economy.AddMoney (cash) once the base loop is confirmed.</li>
          <li>Wrap the toggles in an IMGUI window (BepInEx) or an external overlay driven by Frida <span className="mono text-white">send()</span> messages.</li>
        </ol>
      </div>

      <div className="rounded-xl border border-white/15 p-6 bg-black md:col-span-2">
        <div className="mono text-[10px] uppercase tracking-widest text-white/40 mb-2">Rules of engagement</div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm text-white/70">
          <li>· Test in solo / private lobby only. Never public multiplayer.</li>
          <li>· Keep a vanilla copy of <span className="mono text-white">GameAssembly.dll</span> for rollback.</li>
          <li>· Offsets drift. Dumping once ≠ dumping forever.</li>
          <li>· Prefer getter/setter hooks over field patches — field layout shifts more than vtable addresses.</li>
          <li>· Use Interceptor.replace sparingly — it breaks when the method inlines.</li>
          <li>· Log before every mutation. A mod that silently fails costs you a whole raid.</li>
        </ul>
      </div>
    </div>
  )
}

function ItemsTable({ rows }: { rows: Item[] }) {
  return (
    <Section title={`Items · ${rows.length}`}>
      <div className="grid grid-cols-[72px_1fr_120px_120px_80px_60px] px-4 py-2 border-b border-white/10 mono text-[9px] uppercase tracking-widest text-white/40">
        <div>ID</div><div>Name</div><div>Prefab</div><div>Category</div><div>Value</div><div>Slots</div>
      </div>
      {rows.map(i => (
        <div key={i.id} className="grid grid-cols-[72px_1fr_120px_120px_80px_60px] px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
          <div className="mono text-xs text-white/90">#{i.id.toString().padStart(3, '0')}</div>
          <div>
            <div className="text-sm text-white font-medium">{i.name}</div>
            <div className="text-xs text-white/50 mt-0.5">{i.notes}</div>
          </div>
          <div className="mono text-xs text-white/70">{i.prefab}</div>
          <div className="mono text-[10px] uppercase tracking-widest text-white/60">{i.category}</div>
          <div className="mono text-xs text-white/80">{i.value ?? '—'}</div>
          <div className="mono text-xs text-white/80">{i.slots ?? 1}</div>
        </div>
      ))}
      {rows.length === 0 && <div className="px-4 py-10 text-center text-white/40 text-sm">No items match the filter.</div>}
    </Section>
  )
}

function MobsTable({ rows }: { rows: Mob[] }) {
  return (
    <Section title={`Mobs · ${rows.length}`}>
      <div className="grid grid-cols-[72px_1fr_80px_80px_80px_80px] px-4 py-2 border-b border-white/10 mono text-[9px] uppercase tracking-widest text-white/40">
        <div>ID</div><div>Name</div><div>HP</div><div>DMG</div><div>SPD</div><div>Realm</div>
      </div>
      {rows.map(m => (
        <div key={m.id} className="grid grid-cols-[72px_1fr_80px_80px_80px_80px] px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
          <div className="mono text-xs text-white/90">#{m.id}</div>
          <div>
            <div className="text-sm text-white font-medium">{m.name} <span className="mono text-[10px] text-white/40 ml-1">· {m.prefab}</span></div>
            <div className="text-xs text-white/50 mt-0.5">{m.behavior}</div>
            <div className="text-xs text-white/70 mt-1"><span className="mono text-[10px] uppercase tracking-widest text-white/40 mr-1">Weakness</span>{m.weakness}</div>
          </div>
          <div className="mono text-xs text-white">{m.hp}</div>
          <div className="mono text-xs text-white">{m.dmg}</div>
          <div className="mono text-xs text-white">{m.speed}</div>
          <div className="mono text-[10px] uppercase tracking-widest text-white/60">{m.realm}</div>
        </div>
      ))}
      {rows.length === 0 && <div className="px-4 py-10 text-center text-white/40 text-sm">No mobs match the filter.</div>}
    </Section>
  )
}

function CodesTable({ rows }: { rows: Code[] }) {
  return (
    <Section title={`Codes · ${rows.length}`}>
      {rows.map(c => (
        <div key={c.label} className="grid grid-cols-[1fr_1fr_1.5fr] px-4 py-3 border-b border-white/5 last:border-b-0">
          <div className="text-sm text-white font-medium">{c.label}</div>
          <div className="mono text-xs text-white/90">{c.value}</div>
          <div className="text-xs text-white/60">{c.context}</div>
        </div>
      ))}
    </Section>
  )
}

function MapsGrid({ rows }: { rows: MapInfo[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rows.map(m => (
        <div key={m.name} className="rounded-xl border border-white/15 bg-black p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-nacelle text-lg font-semibold text-white">{m.name}</h3>
            <div className="flex items-center gap-2">
              <span className="mono text-[10px] uppercase tracking-widest text-white/50 border border-white/15 px-2 py-0.5 rounded">{m.realm}</span>
              <span className="mono text-[10px] text-white">
                {'■'.repeat(m.danger)}
                <span className="text-white/15">{'■'.repeat(5 - m.danger)}</span>
              </span>
            </div>
          </div>
          <div className="mono text-[10px] uppercase tracking-widest text-white/40 mb-2">Routes</div>
          <ul className="space-y-1.5">
            {m.routes.map(r => (
              <li key={r} className="text-sm text-white/70 flex gap-2">
                <span className="text-white/30">→</span>{r}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function OffsetsTable({ rows }: { rows: Offset[] }) {
  return (
    <Section title={`Memory offsets · ${rows.length}`}>
      <div className="grid grid-cols-[200px_200px_1fr] px-4 py-2 border-b border-white/10 mono text-[9px] uppercase tracking-widest text-white/40">
        <div>Class</div><div>Method</div><div>Offset</div>
      </div>
      {rows.map(o => (
        <div key={`${o.klass}.${o.method}`} className="grid grid-cols-[200px_200px_1fr] px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
          <div className="mono text-xs text-white">{o.klass}</div>
          <div className="mono text-xs text-white">{o.method}</div>
          <div>
            <div className="mono text-xs text-white/80">{o.offset}</div>
            <div className="text-xs text-white/50 mt-0.5">{o.purpose}</div>
          </div>
        </div>
      ))}
    </Section>
  )
}

function HooksList({ rows }: { rows: Hook[] }) {
  return (
    <div className="space-y-5">
      {rows.map(h => (
        <div key={h.title} className="rounded-xl border border-white/15 bg-black overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <div>
              <div className="text-sm text-white font-medium">{h.title}</div>
              <div className="text-xs text-white/50 mt-0.5">{h.purpose}</div>
            </div>
            <span className="mono text-[10px] uppercase tracking-widest text-white/50 border border-white/15 px-2 py-0.5 rounded">{h.lang}</span>
          </div>
          <pre className="mono text-[11px] leading-[1.55] text-white/85 px-4 py-4 overflow-x-auto">
{h.code}
          </pre>
        </div>
      ))}
    </div>
  )
}
