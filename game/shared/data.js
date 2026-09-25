/*
 * DEEP WATERS — shared game data.
 * Loaded by the browser (window.SeaData) and by Node (require('./data')).
 * Everything here is deterministic so client and server always agree.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.SeaData = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const WORLD_R = 6800;
  const SAFE_R = 700;   // harbor: no guns, no monsters, no PvP
  const DOCK_R = 560;   // shop reachable inside this radius

  // ---------------------------------------------------------------- biomes
  const BIOMES = [
    { id: 0, name: 'Harbor Shallows', color: '#3aa3c7', deep: '#23809f', danger: 0.3, mult: 1 },
    { id: 1, name: 'Coral Reef', color: '#22b0ad', deep: '#138a8c', danger: 0.6, mult: 1.6 },
    { id: 2, name: 'Kelp Forest', color: '#2a8566', deep: '#17624a', danger: 0.9, mult: 2.4 },
    { id: 3, name: 'Open Ocean', color: '#1c5c9c', deep: '#113f73', danger: 1.2, mult: 3.5 },
    { id: 4, name: 'Frozen Sea', color: '#79aec8', deep: '#4f86a5', danger: 1.6, mult: 5 },
    { id: 5, name: 'Volcanic Vents', color: '#5b2c33', deep: '#35161c', danger: 1.9, mult: 6.5 },
    { id: 6, name: 'Abyssal Trench', color: '#0d1636', deep: '#050919', danger: 2.3, mult: 8.5 },
  ];

  function biomeAt(x, y) {
    const d = Math.hypot(x, y);
    if (d < 1000) return 0;
    if (d < 2000) return 1;
    if (d < 3000) return 2;
    if (d < 4200) return 3;
    const a = Math.atan2(y, x); // screen coords: negative y = north
    if (a < -Math.PI / 6 && a > (-5 * Math.PI) / 6) return 4;
    if (a >= -Math.PI / 6 && a < Math.PI / 2) return 5;
    return 6;
  }

  // ---------------------------------------------------------------- rarity
  const RARITY = [
    { name: 'Common', color: '#c9d1d9', weight: 100, mult: 1 },
    { name: 'Uncommon', color: '#5ee37a', weight: 40, mult: 2.5 },
    { name: 'Rare', color: '#4aa8ff', weight: 14, mult: 6 },
    { name: 'Epic', color: '#b562ff', weight: 4.5, mult: 16 },
    { name: 'Legendary', color: '#ffb21e', weight: 1.2, mult: 45 },
    { name: 'Mythic', color: '#ff3d6e', weight: 0.25, mult: 150 },
  ];

  // ---------------------------------------------------------------- species
  const KINDS = {
    fish: { w: 58, val: 14, size: [0.3, 6], bases: ['Bass', 'Snapper', 'Grouper', 'Cod', 'Trout', 'Salmon', 'Tuna', 'Mackerel', 'Perch', 'Pike', 'Carp', 'Herring', 'Sardine', 'Anchovy', 'Marlin', 'Swordfish', 'Sailfish', 'Barracuda', 'Wrasse', 'Tang', 'Angelfish', 'Clownfish', 'Parrotfish', 'Butterflyfish', 'Goby', 'Blenny', 'Halibut', 'Flounder', 'Sole', 'Mahi-Mahi', 'Wahoo', 'Bonito', 'Pollock', 'Haddock', 'Hake', 'Lionfish', 'Pufferfish', 'Triggerfish', 'Boxfish', 'Sunfish', 'Anglerfish', 'Lanternfish', 'Hatchetfish', 'Viperfish', 'Dragonfish', 'Gulper', 'Oarfish', 'Coelacanth', 'Sturgeon', 'Catfish', 'Mullet', 'Drum', 'Croaker', 'Seabream', 'Scorpionfish', 'Stonefish', 'Rockfish', 'Char', 'Grayling', 'Minnow', 'Tarpon', 'Snook', 'Cobia', 'Amberjack', 'Trevally'] },
    shark: { w: 5, val: 30, size: [8, 180], bases: ['Dogfish', 'Catshark', 'Hammerhead', 'Thresher', 'Mako', 'Nurse Shark', 'Tiger Shark', 'Goblin Shark', 'Wobbegong', 'Reef Shark', 'Lemon Shark', 'Sawshark'] },
    eel: { w: 6, val: 18, size: [0.8, 25], bases: ['Eel', 'Moray', 'Conger', 'Lamprey', 'Ribbonfish', 'Hagfish', 'Snake Eel', 'Wolf Eel'] },
    ray: { w: 5, val: 22, size: [2, 90], bases: ['Stingray', 'Manta', 'Skate', 'Eagle Ray', 'Torpedo Ray', 'Guitarfish'] },
    crab: { w: 10, val: 16, size: [0.2, 9], bases: ['Crab', 'Hermit Crab', 'King Crab', 'Snow Crab', 'Spider Crab', 'Fiddler Crab', 'Coconut Crab', 'Blue Crab', 'Ghost Crab', 'Horseshoe Crab', 'Box Crab', 'Stone Crab'] },
    lobster: { w: 4, val: 26, size: [0.4, 8], bases: ['Lobster', 'Crayfish', 'Langoustine', 'Mantis Shrimp', 'Slipper Lobster'] },
    shrimp: { w: 3, val: 10, size: [0.02, 0.4], bases: ['Shrimp', 'Prawn', 'Krill', 'Pistol Shrimp'] },
    squid: { w: 3, val: 20, size: [0.3, 60], bases: ['Squid', 'Cuttlefish', 'Nautilus', 'Firefly Squid'] },
    octopus: { w: 2, val: 24, size: [0.5, 40], bases: ['Octopus', 'Blanket Octopus', 'Dumbo Octopus'] },
    jelly: { w: 3, val: 12, size: [0.1, 12], bases: ['Jellyfish', "Man o' War", 'Comb Jelly', 'Moon Jelly', 'Box Jelly'] },
    star: { w: 2, val: 9, size: [0.1, 3], bases: ['Starfish', 'Brittle Star', 'Sea Cucumber', 'Sun Star'] },
    urchin: { w: 2, val: 11, size: [0.1, 2], bases: ['Urchin', 'Sand Dollar', 'Pencil Urchin'] },
  };
  const KIND_KEYS = Object.keys(KINDS);

  const ADJ_GENERAL = ['Spotted', 'Striped', 'Golden', 'Silver', 'Crimson', 'Azure', 'Speckled', 'Banded', 'Royal', 'Dusky', 'Pale', 'Giant', 'Pygmy', 'Lesser', 'Greater', 'Painted', 'Freckled', 'Masked', 'Bearded', 'Longfin', 'Shortfin', 'Bigeye', 'Blacktip', 'Whitetip', 'Yellowtail', 'Redtail', 'Copper', 'Bronze', 'Jade', 'Ruby', 'Sapphire', 'Emerald', 'Onyx', 'Pearl', 'Ivory', 'Tiger', 'Leopard', 'Zebra', 'Ghost', 'Shadow', 'Sunset', 'Dawn', 'Twilight', 'Midnight', 'Tidal', 'Humpback', 'Razor', 'Saber', 'Ancient', 'Crowned', 'Horned', 'Spiny', 'Velvet', 'Marbled', 'Checkered', 'Scarlet', 'Violet', 'Amber', 'Cobalt', 'Rusty', 'Toothy', 'Grumpy', 'Lucky', 'Sleepy', 'Warty', 'Chubby', 'Noble', 'Wandering', 'Barbed', 'Glass'];
  const ADJ_BIOME = [
    ['Muddy', 'Sandy', 'Dockside', 'Bay', 'Harbor', 'Pier', 'Estuary', 'Lagoon', 'Brackish', 'Shoal', 'Driftwood', 'Barnacled'],
    ['Coral', 'Neon', 'Prismatic', 'Harlequin', 'Rainbow', 'Reef', 'Candy', 'Flame', 'Lagoon', 'Sunlit', 'Tropical', 'Pastel'],
    ['Kelp', 'Mossy', 'Weedy', 'Tangle', 'Forest', 'Leafy', 'Frond', 'Verdant', 'Canopy', 'Bramble', 'Thicket', 'Algae'],
    ['Pelagic', 'Blue', 'Storm', 'Thunder', 'Deepwater', 'Wave', 'Gale', 'Cyclone', 'Mariner', 'Horizon', 'Tempest', 'Oceanic'],
    ['Frost', 'Glacial', 'Ice', 'Snow', 'Polar', 'Arctic', 'Rime', 'Blizzard', 'Frozen', 'Tundra', 'Boreal', 'Crystal'],
    ['Magma', 'Ember', 'Cinder', 'Ash', 'Lava', 'Scorched', 'Infernal', 'Obsidian', 'Sulfur', 'Molten', 'Pyre', 'Smoldering'],
    ['Abyssal', 'Void', 'Phantom', 'Eldritch', 'Gloom', 'Lantern', 'Hollow', 'Umbral', 'Dread', 'Nightmare', 'Sunless', 'Forsaken'],
  ];
  const BIOME_HUE = [[180, 60], [300, 140], [80, 70], [200, 50], [175, 50], [0, 50], [240, 120]];
  const FACTS = [
    'Fishermen say it can smell fear.', 'Tastes like regret and lemon.', 'Schools of them look like drifting smoke.',
    'Bites anything shiny.', 'Rarely seen before a storm.', 'Old sailors keep its scales for luck.',
    'Sleeps with one eye open.', 'Surprisingly heavy for its size.', 'Hums at night. Nobody knows why.',
    'Considered a delicacy by crabs.', 'Its bones glow faintly in the dark.', 'Has been known to steal bait and wave goodbye.',
    'Can live for over a century.', 'Travels thousands of miles every year.', 'Mostly harmless. Mostly.',
    'Collectors pay a fortune for perfect specimens.', 'Smells terrible. Sells great.', 'Hates boat engines.',
  ];

  const SPECIES = [];
  const BY_BIOME = [[], [], [], [], [], [], []];
  const PER_BIOME = 172;
  (function genSpecies() {
    const rng = mulberry32(0xdeea55);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const used = new Set();
    const kindTotal = KIND_KEYS.reduce((s, k) => s + KINDS[k].w, 0);
    function pickKind() {
      let r = rng() * kindTotal;
      for (const k of KIND_KEYS) { r -= KINDS[k].w; if (r <= 0) return k; }
      return 'fish';
    }
    function pickRarity() {
      const r = rng();
      if (r < 0.40) return 0; if (r < 0.66) return 1; if (r < 0.83) return 2;
      if (r < 0.93) return 3; if (r < 0.98) return 4; return 5;
    }
    for (let b = 0; b < BIOMES.length; b++) {
      let made = 0;
      while (made < PER_BIOME) {
        const kind = pickKind();
        const K = KINDS[kind];
        const base = pick(K.bases);
        let adj = rng() < 0.5 ? pick(ADJ_BIOME[b]) : pick(ADJ_GENERAL);
        let name = adj + ' ' + base;
        if (used.has(name)) name = pick(ADJ_GENERAL) + ' ' + name;
        if (used.has(name)) continue;
        used.add(name);
        const rarity = pickRarity();
        const sizeMul = 1 + rarity * 0.35 + b * 0.12;
        const minW = +(K.size[0] * sizeMul * (0.6 + rng() * 0.6)).toFixed(2);
        const maxW = +(Math.max(minW * 1.5, K.size[1] * sizeMul * (0.3 + rng() * 0.7))).toFixed(2);
        const [h0, hr] = BIOME_HUE[b];
        const hue = Math.round((h0 + (rng() - 0.5) * hr * 2 + 360) % 360);
        const sp = {
          id: SPECIES.length, name, kind, biome: b, rarity,
          minW, maxW,
          value: Math.round(K.val * RARITY[rarity].mult * BIOMES[b].mult * (0.8 + rng() * 0.5)),
          hue, sat: 45 + Math.round(rng() * 50), lit: 35 + Math.round(rng() * 30),
          hue2: Math.round((hue + 60 + rng() * 180) % 360),
          pattern: Math.floor(rng() * 5), // 0 plain 1 stripes 2 spots 3 gradient 4 bands
          body: +(0.28 + rng() * 0.32).toFixed(2), tail: +(0.5 + rng() * 0.7).toFixed(2), fin: +(0.3 + rng() * 0.9).toFixed(2),
          glow: b === 6 ? rng() < 0.6 : rng() < 0.06,
          night: rng() < 0.16, storm: rarity >= 4 && rng() < 0.3,
          fact: pick(FACTS),
        };
        SPECIES.push(sp);
        BY_BIOME[b].push(sp.id);
        made++;
      }
    }
    // Treasures & junk: catchable anywhere, count toward the bestiary.
    const T = [
      ['Clump of Seaweed', 0, 1], ['Rusty Can', 0, 2], ['Old Boot', 0, 5], ['Message in a Bottle', 1, 150],
      ['Soggy Treasure Map', 2, 600], ['Pirate Doubloon', 2, 800], ['Perfect Pearl', 3, 1200], ["Captain's Compass", 3, 2500],
      ['Ancient Anchor', 3, 3000], ['Sunken Chest', 4, 5000], ['Black Pearl', 4, 9000], ['Kraken Tooth', 4, 12000],
      ['Golden Idol', 5, 25000], ['Mermaid Scale', 5, 40000], ["Poseidon's Coin", 5, 100000],
    ];
    for (const [name, rarity, value] of T) {
      SPECIES.push({ id: SPECIES.length, name, kind: 'treasure', biome: -1, rarity, minW: 0.1, maxW: 3, value, hue: 45, sat: 70, lit: 50, hue2: 30, pattern: 0, body: 0.5, tail: 0.5, fin: 0.5, glow: rarity >= 4, night: false, storm: false, fact: 'Not a fish. Still worth money.' });
    }
  })();
  const TREASURE_IDS = SPECIES.filter((s) => s.kind === 'treasure').map((s) => s.id);

  // ---------------------------------------------------------------- gear
  const RODS = [
    { id: 'twig', name: 'Twig Rod', price: 0, range: 320, power: 1.0, strength: 1.0, luck: 0, speed: 1.0 },
    { id: 'bamboo', name: 'Bamboo Rod', price: 600, range: 380, power: 1.15, strength: 1.3, luck: 0.3, speed: 0.95 },
    { id: 'fiberglass', name: 'Fiberglass Rod', price: 2000, range: 430, power: 1.3, strength: 1.6, luck: 0.6, speed: 0.9 },
    { id: 'carbon', name: 'Carbon Rod', price: 6000, range: 480, power: 1.5, strength: 1.9, luck: 1.0, speed: 0.85 },
    { id: 'steel', name: 'Steel Surf Rod', price: 15000, range: 520, power: 1.7, strength: 2.2, luck: 1.4, speed: 0.8 },
    { id: 'deepsea', name: 'Deep Sea Rod', price: 35000, range: 580, power: 1.9, strength: 2.5, luck: 1.9, speed: 0.75 },
    { id: 'titanium', name: 'Titanium Rod', price: 80000, range: 620, power: 2.1, strength: 2.8, luck: 2.5, speed: 0.7 },
    { id: 'krakenbone', name: 'Kraken Bone Rod', price: 180000, range: 680, power: 2.4, strength: 3.1, luck: 3.2, speed: 0.62 },
    { id: 'abyssal', name: 'Abyssal Rod', price: 400000, range: 740, power: 2.7, strength: 3.4, luck: 4.0, speed: 0.55 },
    { id: 'trident', name: "Poseidon's Trident Rod", price: 1000000, range: 820, power: 3.2, strength: 3.9, luck: 5.5, speed: 0.45 },
  ];

  const BOATS = [
    { id: 'dinghy', name: 'Rowboat Dinghy', price: 0, hp: 100, thrust: 270, turn: 2.6, mass: 1, cargo: 10, r: 22, len: 46, wid: 20, color: '#a0703c', dmgMul: 1 },
    { id: 'skiff', name: 'Fishing Skiff', price: 3000, hp: 170, thrust: 420, turn: 2.5, mass: 1.4, cargo: 18, r: 26, len: 56, wid: 24, color: '#e8e2d0', dmgMul: 1 },
    { id: 'speedboat', name: 'Speedboat', price: 12000, hp: 150, thrust: 720, turn: 2.9, mass: 1.2, cargo: 14, r: 26, len: 60, wid: 22, color: '#e03c3c', dmgMul: 1.05 },
    { id: 'trawler', name: 'Trawler', price: 30000, hp: 340, thrust: 480, turn: 1.8, mass: 2.4, cargo: 40, r: 34, len: 76, wid: 32, color: '#3c6ea0', dmgMul: 1.1 },
    { id: 'gunship', name: 'Gunship', price: 90000, hp: 560, thrust: 700, turn: 2.1, mass: 2.8, cargo: 28, r: 36, len: 80, wid: 32, color: '#56604a', dmgMul: 1.35 },
    { id: 'dreadnought', name: 'Dreadnought', price: 350000, hp: 1100, thrust: 1150, turn: 1.5, mass: 5, cargo: 60, r: 46, len: 104, wid: 42, color: '#2d2f38', dmgMul: 1.6 },
  ];

  const WEAPONS = [
    { id: 'pistol', name: 'Pistol', price: 0, dmg: 18, rate: 3.2, speed: 950, spread: 0.03, pellets: 1, ammo: 'light', life: 0.9, recoil: 8, sfx: 'pistol' },
    { id: 'smg', name: 'SMG', price: 2500, dmg: 10, rate: 11, speed: 1000, spread: 0.1, pellets: 1, ammo: 'light', life: 0.7, recoil: 4, sfx: 'smg' },
    { id: 'shotgun', name: 'Pump Shotgun', price: 4000, dmg: 11, rate: 1.2, speed: 900, spread: 0.22, pellets: 8, ammo: 'shells', life: 0.5, recoil: 70, sfx: 'shotgun' },
    { id: 'harpoon', name: 'Harpoon Gun', price: 6000, dmg: 60, rate: 1.1, speed: 850, spread: 0.01, pellets: 1, ammo: 'harpoons', life: 1.1, recoil: 30, pull: 480, pierce: 1, sfx: 'harpoon' },
    { id: 'rifle', name: 'Marksman Rifle', price: 12000, dmg: 85, rate: 0.9, speed: 1700, spread: 0.004, pellets: 1, ammo: 'heavy', life: 1.0, recoil: 40, pierce: 3, sfx: 'rifle' },
    { id: 'flamer', name: 'Blubber Torch', price: 20000, dmg: 5, rate: 18, speed: 420, spread: 0.18, pellets: 1, ammo: 'fuel', life: 0.45, recoil: 1, pierce: 99, flame: true, sfx: 'flame' },
    { id: 'minigun', name: 'Minigun', price: 45000, dmg: 12, rate: 22, speed: 1100, spread: 0.13, pellets: 1, ammo: 'light', life: 0.8, recoil: 5, spin: 0.6, sfx: 'smg' },
    { id: 'rocket', name: 'Rocket Launcher', price: 70000, dmg: 140, rate: 0.7, speed: 650, spread: 0.01, pellets: 1, ammo: 'rockets', life: 1.6, recoil: 120, splash: 150, knock: 900, sfx: 'rocket' },
    { id: 'railgun', name: 'Railgun', price: 250000, dmg: 280, rate: 0.45, speed: 3200, spread: 0, pellets: 1, ammo: 'cells', life: 0.6, recoil: 160, pierce: 25, sfx: 'rail' },
  ];

  const AMMO = [
    { id: 'light', name: 'Light Rounds', pack: 100, price: 150 },
    { id: 'shells', name: 'Shotgun Shells', pack: 30, price: 200 },
    { id: 'harpoons', name: 'Harpoons', pack: 15, price: 250 },
    { id: 'heavy', name: 'Heavy Rounds', pack: 20, price: 300 },
    { id: 'fuel', name: 'Blubber Fuel', pack: 200, price: 400 },
    { id: 'rockets', name: 'Rockets', pack: 6, price: 900 },
    { id: 'cells', name: 'Rail Cells', pack: 5, price: 1500 },
  ];

  const BAITS = [
    { id: 'none', name: 'No Bait', pack: 0, price: 0, luck: 0, speed: 1.15 },
    { id: 'worm', name: 'Worms', pack: 10, price: 40, luck: 0.3, speed: 0.9 },
    { id: 'shrimp', name: 'Shrimp Bait', pack: 10, price: 150, luck: 0.8, speed: 0.85 },
    { id: 'squid', name: 'Squid Chunks', pack: 10, price: 500, luck: 1.5, speed: 0.8 },
    { id: 'glow', name: 'Glow Lure', pack: 10, price: 2000, luck: 2.5, speed: 0.7 },
    { id: 'golden', name: 'Golden Lure', pack: 5, price: 8000, luck: 4.5, speed: 0.6 },
    { id: 'chum', name: 'Boss Chum', pack: 1, price: 5000, luck: 0, speed: 1, boss: true },
    { id: 'heart', name: 'Leviathan Heart', pack: 1, price: 150000, luck: 0, speed: 1, boss: 'leviathan' },
  ];

  const UPGRADES = [
    { id: 'engine', name: 'Engine', desc: '+12% thrust per level', prices: [1500, 5000, 15000, 45000, 120000] },
    { id: 'hull', name: 'Hull Armor', desc: '+20% HP and -6% damage per level', prices: [1500, 5000, 15000, 45000, 120000] },
    { id: 'cargo', name: 'Cargo Hold', desc: '+6 fish capacity per level', prices: [1000, 4000, 12000, 35000, 90000] },
    { id: 'luck', name: 'Lucky Charm', desc: '+0.6 fishing luck per level', prices: [3000, 10000, 30000, 90000, 250000] },
  ];

  const ITEMS = [
    { id: 'pot', name: 'Crab Pot', price: 500, desc: 'Drop it at sea (T). Come back in 60s for crabs.' },
    { id: 'patch', name: 'Hull Patch', price: 350, desc: 'Repair 40% HP anywhere (H).' },
  ];

  // ---------------------------------------------------------------- creatures
  const CREATURES = {
    crab: { name: 'Snapper Crab', hp: 45, r: 18, speed: 120, dmg: 6, ai: 'chase', color: '#d8573a', blood: '#6b0f0f', bounty: 30, look: 'crab', mass: 0.6 },
    piranha: { name: 'Piranha', hp: 18, r: 10, speed: 310, dmg: 4, ai: 'swarm', color: '#9c4b3e', blood: '#8a0b0b', bounty: 12, look: 'fish', mass: 0.2, group: 6 },
    barracuda: { name: 'Barracuda', hp: 60, r: 20, speed: 290, dmg: 9, ai: 'chase', color: '#a9b5bd', blood: '#7a0a0a', bounty: 45, look: 'fish', mass: 0.6 },
    jelly: { name: 'Stinger Jelly', hp: 35, r: 22, speed: 40, dmg: 8, ai: 'jelly', color: '#d68bff', blood: '#39d0ff', bounty: 25, look: 'jelly', mass: 0.3 },
    shark: { name: 'Reef Shark', hp: 130, r: 30, speed: 240, dmg: 14, ai: 'chase', color: '#7d8b99', blood: '#8a0000', bounty: 90, look: 'shark', mass: 1.4 },
    eel: { name: 'Shock Eel', hp: 85, r: 22, speed: 210, dmg: 10, ai: 'ranged', shot: 'zap', color: '#d8d23a', blood: '#6a0000', bounty: 70, look: 'eel', mass: 0.8 },
    squid: { name: 'Ink Squid', hp: 110, r: 26, speed: 200, dmg: 10, ai: 'ranged', shot: 'ink', color: '#e27aa0', blood: '#1a1a3a', bounty: 85, look: 'squid', mass: 1 },
    serpent: { name: 'Sea Serpent', hp: 320, r: 34, speed: 230, dmg: 20, ai: 'chase', color: '#2f8a5a', blood: '#700000', bounty: 260, look: 'eel', mass: 2.5 },
    iceshark: { name: 'Frost Shark', hp: 260, r: 34, speed: 260, dmg: 22, ai: 'chase', color: '#cfe8f5', blood: '#8a0000', bounty: 240, look: 'shark', mass: 2 },
    walrus: { name: 'Tusk Walrus', hp: 420, r: 38, speed: 150, dmg: 26, ai: 'chase', color: '#8a6752', blood: '#7a0000', bounty: 300, look: 'walrus', mass: 3.5 },
    lavaeel: { name: 'Lava Eel', hp: 240, r: 28, speed: 230, dmg: 18, ai: 'ranged', shot: 'fire', color: '#ff7a1a', blood: '#ffb000', bounty: 260, look: 'eel', mass: 1.5 },
    magmacrab: { name: 'Magma Crab', hp: 380, r: 30, speed: 130, dmg: 24, ai: 'chase', color: '#3a1a14', blood: '#ff8a00', bounty: 280, look: 'crab', mass: 2.5 },
    horror: { name: 'Abyss Horror', hp: 600, r: 42, speed: 200, dmg: 30, ai: 'chase', color: '#1d1030', blood: '#43ff9e', bounty: 520, look: 'horror', mass: 4 },
    angler: { name: 'Lantern Angler', hp: 300, r: 30, speed: 250, dmg: 24, ai: 'chase', color: '#2a2440', blood: '#7a0000', bounty: 360, look: 'fish', mass: 1.6 },
  };
  const SPAWNS = [
    [['crab', 5], ['piranha', 2], ['jelly', 2]],
    [['barracuda', 4], ['jelly', 4], ['piranha', 3], ['crab', 2], ['shark', 1]],
    [['eel', 4], ['barracuda', 3], ['shark', 2], ['squid', 2]],
    [['shark', 5], ['squid', 3], ['serpent', 1], ['barracuda', 3]],
    [['iceshark', 4], ['walrus', 3], ['squid', 2]],
    [['lavaeel', 4], ['magmacrab', 4], ['serpent', 1]],
    [['horror', 3], ['angler', 5], ['squid', 2], ['serpent', 1]],
  ];

  // ---------------------------------------------------------------- bosses
  const BOSSES = [
    { id: 'mama_crab', name: 'Big Mama Crab', biome: 0, look: 'crab', hp: 2600, r: 90, speed: 130, dmg: 22, color: '#d9472b', blood: '#700', patterns: ['charge', 'summon', 'slam'], minion: 'crab', reward: 6000 },
    { id: 'rustjaw', name: 'Rustjaw the Pike', biome: 0, look: 'fish', hp: 2300, r: 80, speed: 230, dmg: 22, color: '#8a6a3a', blood: '#800', patterns: ['charge', 'charge', 'spray'], reward: 5500 },
    { id: 'coral_colossus', name: 'Coral Colossus', biome: 1, look: 'urchin', hp: 4800, r: 115, speed: 70, dmg: 28, color: '#ff6f91', blood: '#f0a', patterns: ['spray', 'nova', 'slam', 'summon'], minion: 'jelly', reward: 11000 },
    { id: 'pufferzilla', name: 'Pufferzilla', biome: 1, look: 'puffer', hp: 4200, r: 100, speed: 150, dmg: 28, color: '#f2c14e', blood: '#900', patterns: ['charge', 'nova', 'spray'], reward: 10000 },
    { id: 'kelp_hydra', name: 'Kelp Hydra', biome: 2, look: 'hydra', hp: 7000, r: 110, speed: 110, dmg: 30, color: '#3d9a4a', blood: '#700', patterns: ['spray', 'zap', 'summon', 'slam'], minion: 'eel', reward: 18000 },
    { id: 'siren_eel', name: 'The Siren Eel', biome: 2, look: 'eel', hp: 6200, r: 70, speed: 280, dmg: 26, color: '#c6e03a', blood: '#700', patterns: ['charge', 'zap', 'spray', 'whirl'], reward: 16000 },
    { id: 'megalodon', name: 'Megalodon', biome: 3, look: 'shark', hp: 10000, r: 120, speed: 330, dmg: 40, color: '#5c6b78', blood: '#900', patterns: ['charge', 'charge', 'summon', 'slam'], minion: 'shark', reward: 30000 },
    { id: 'moby_grim', name: 'Moby Grim', biome: 3, look: 'whale', hp: 13000, r: 140, speed: 180, dmg: 38, color: '#e8e8e8', blood: '#900', patterns: ['charge', 'slam', 'whirl', 'nova'], reward: 34000 },
    { id: 'glacier_orca', name: 'Glacier Orca', biome: 4, look: 'orca', hp: 15000, r: 110, speed: 320, dmg: 42, color: '#1a1a1a', blood: '#900', patterns: ['charge', 'spray', 'slam', 'charge'], reward: 45000 },
    { id: 'ice_leviathan', name: 'Ice Leviathan', biome: 4, look: 'serpent', hp: 19000, r: 95, speed: 240, dmg: 44, color: '#9fe3ff', blood: '#39f', patterns: ['spray', 'whirl', 'summon', 'nova'], minion: 'iceshark', reward: 55000 },
    { id: 'magma_kraken', name: 'Magma Kraken', biome: 5, look: 'kraken', hp: 24000, r: 140, speed: 120, dmg: 48, color: '#ff4d1a', blood: '#ffae00', patterns: ['spray', 'slam', 'summon', 'nova', 'zap'], minion: 'lavaeel', reward: 75000 },
    { id: 'cinder_serpent', name: 'Cinder Serpent', biome: 5, look: 'serpent', hp: 21000, r: 90, speed: 300, dmg: 46, color: '#ff9a3c', blood: '#ffcc00', patterns: ['charge', 'spray', 'whirl', 'nova'], reward: 70000 },
    { id: 'angler_lord', name: 'Abyssal Anglerlord', biome: 6, look: 'angler', hp: 30000, r: 130, speed: 230, dmg: 55, color: '#221a3a', blood: '#4f9', patterns: ['whirl', 'charge', 'spray', 'zap'], minion: 'angler', reward: 110000 },
    { id: 'kraken', name: 'The Kraken', biome: 6, look: 'kraken', hp: 38000, r: 160, speed: 140, dmg: 60, color: '#6b1f4a', blood: '#303', patterns: ['slam', 'summon', 'whirl', 'spray', 'nova'], minion: 'horror', reward: 150000 },
    { id: 'leviathan', name: 'LEVIATHAN, Devourer of Fleets', biome: 6, look: 'serpent', hp: 90000, r: 190, speed: 260, dmg: 80, color: '#300a14', blood: '#f00', patterns: ['charge', 'nova', 'whirl', 'zap', 'slam', 'summon', 'spray'], minion: 'horror', reward: 600000, final: true },
  ];

  // ---------------------------------------------------------------- achievements
  const ACHIEVEMENTS = [
    ['first_catch', 'First Bite', 'Catch your first fish'],
    ['catch_10', 'Hobbyist', 'Catch 10 fish'],
    ['catch_100', 'Angler', 'Catch 100 fish'],
    ['catch_1000', 'Master Angler', 'Catch 1,000 fish'],
    ['dex_25', 'Curious', 'Discover 25 species'],
    ['dex_100', 'Naturalist', 'Discover 100 species'],
    ['dex_500', 'Marine Biologist', 'Discover 500 species'],
    ['dex_all', 'Completionist', 'Discover every species'],
    ['rare', 'Ooh Shiny', 'Catch a Rare fish'],
    ['legendary', 'Legend', 'Catch a Legendary fish'],
    ['mythic', 'Myth Buster', 'Catch a Mythic fish'],
    ['treasure', 'Treasure Hunter', 'Fish up a treasure'],
    ['kill_1', 'Self Defense', 'Kill a sea creature'],
    ['kill_100', 'Exterminator', 'Kill 100 sea creatures'],
    ['kill_1000', 'Ocean Menace', 'Kill 1,000 sea creatures'],
    ['boss_1', 'Boss Slayer', 'Defeat a boss'],
    ['boss_all', 'Apex Predator', 'Defeat every boss'],
    ['leviathan', 'Fleet Avenger', 'Defeat the Leviathan'],
    ['rich_10k', 'Comfortable', 'Earn $10,000'],
    ['rich_1m', 'Tycoon', 'Earn $1,000,000'],
    ['dread', 'Overcompensating', 'Own the Dreadnought'],
    ['trident', 'Sea God', "Own Poseidon's Trident Rod"],
    ['sink', 'Davy Jones', 'Get sunk'],
    ['pvp', 'Pirate', 'Sink another player'],
    ['crabber', 'Crabber', 'Collect a crab pot'],
    ['explorer', 'Explorer', 'Catch a fish in every biome'],
  ];

  // ---------------------------------------------------------------- world gen
  function makeIslands(seed) {
    const rng = mulberry32(seed | 0);
    const out = [{ x: 0, y: 0, r: 260, harbor: true }];
    let tries = 0;
    while (out.length < 46 && tries++ < 5000) {
      const d = 1100 + rng() * (WORLD_R - 1400);
      const a = rng() * Math.PI * 2;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const r = 70 + rng() * 230;
      let ok = true;
      for (const o of out) if (Math.hypot(o.x - x, o.y - y) < o.r + r + 260) { ok = false; break; }
      if (ok) out.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r), harbor: false, seed: Math.floor(rng() * 1e9) });
    }
    return out;
  }

  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));

  return {
    mulberry32, WORLD_R, SAFE_R, DOCK_R, BIOMES, biomeAt, RARITY, KINDS, SPECIES, BY_BIOME, TREASURE_IDS,
    RODS, BOATS, WEAPONS, AMMO, BAITS, UPGRADES, ITEMS, CREATURES, SPAWNS, BOSSES, ACHIEVEMENTS, makeIslands,
    ROD: byId(RODS), BOAT: byId(BOATS), WEAPON: byId(WEAPONS), AMMO_BY: byId(AMMO), BAIT: byId(BAITS),
    UPGRADE: byId(UPGRADES), ITEM: byId(ITEMS), BOSS: byId(BOSSES),
  };
});
