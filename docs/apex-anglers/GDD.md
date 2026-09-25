# APEX ANGLERS: SHATTERED WATERS
### Game Design Document & Technical Specification — v0.1

| | |
|---|---|
| **Genre** | Physics-driven co-op action-survival sandbox (fishing × naval base-building × monster hunting) |
| **Players** | 1–4 online co-op (drop-in / drop-out) |
| **Engine** | Unreal Engine 5.6+ (C++ core, Blueprint for content) |
| **Platforms** | PC (Steam) first; PS5 / Xbox Series later |
| **Target price** | Premium, $24.99, cosmetic-only live ops |
| **Session length** | 45–90 min "Voyage" plus a persistent shipyard |

> **How to read this document.** Formulas use SI units (meters, kilograms, seconds, newtons). Unreal works in centimeters, so multiply lengths by 100 when implementing. Every tunable value is shown in `CODE_STYLE` and belongs in a **DataAsset / CurveTable**, never hard-coded. Designers tune, engineers expose.

### UE5 technology map (quick reference)

| Need | UE5 system |
|---|---|
| Open ocean, waves, buoyancy | **Water plugin** (Gerstner/FFT-driven Water Bodies) + custom `UBuoyancyComponent` sampling pontoons |
| Rigid bodies, ragdolls, destruction | **Chaos Physics**, **Chaos Destruction** (Geometry Collections), **Physics Control** component |
| Rope / fishing line | Custom **XPBD rope solver** (C++), rendered with a spline mesh / Niagara ribbon; the `CableComponent` is used for cosmetic-only lines |
| Abilities, stats, buffs | **Gameplay Ability System (GAS)** — Attributes, GameplayEffects, GameplayCues |
| AI | **StateTree** + **EQS** + **Mass Entity** (swarms) + Smart Objects |
| World | **World Partition**, **Level Instances**, **Data Layers**, **HLOD**, **PCG framework** |
| Rendering | **Lumen**, **Nanite**, **Virtual Shadow Maps**, **Substrate** materials, **TSR** |
| VFX / audio | **Niagara** (incl. Niagara Fluids for spray), **MetaSounds**, Audio Modulation, Submix effects |
| Networking | **Iris** replication, **Network Prediction**, listen server or dedicated server, **EOS** (lobbies, P2P relay, voice, Anti-Cheat) |
| Input | **Enhanced Input** + DualSense adaptive triggers through the platform input device API |
| Animation | Control Rig, **Full-Body IK**, Motion Matching, Physical Animation |

---

# PART I — CORE VISION & WORLD ARCHITECTURE

## 1. THE HIGH CONCEPT

**Logline:** *Four underpaid salvage contractors crash-land in a torn-open ocean where the fish have guns and the guns have fish, and build a rust-bucket raft into a battleship to hunt reality-bending leviathans for profit.*

**Core emotional pillar: "Glorious Catastrophe."** Every session should produce at least one story the players retell afterward: "the shark ate the boat while Dave was still on the toilet." We aim for physical comedy with real stakes. Losing hurts, which is exactly why the chaos is funny.

**Design pillars**
1. **Physics is the punchline.** Every system (rope, hull, fish, weather) runs through the same physical simulation, so interactions emerge instead of being scripted.
2. **Mastery beneath the mayhem.** Wacky on the surface, deep underneath: line-tension management, cast timing and wrestling reads reward skill.
3. **Crew over captain.** Content is tuned so four specialized players beat four generalists. Solo play works through AI "Deckhand" drones.
4. **Greed vs. survival.** Every Voyage ends with a push-your-luck choice: extract now, or dive deeper for the big one.

**Target audience**
- *Primary:* 16–30 co-op friend groups who stream (Lethal Company, R.E.P.O., Sea of Thieves, Deep Rock Galactic players).
- *Secondary:* mastery players from Monster Hunter and fishing sims, served by leaderboards and the Eternal Trench.
- *Rating target:* PEGI 16 / ESRB M (stylized gore, simulated gambling with no real money).

**Gameplay loops**

| Loop | Duration | Beats |
|---|---|---|
| **Moment** | 10–40 s | Cast → hook → tug-of-war → land → wrestle/shoot → harvest |
| **Encounter** | 3–8 min | Scout with sonar → bait an Apex → coordinated takedown → loot splits |
| **Voyage (session)** | 45–90 min | Launch from Shipyard → sail biomes → contracts, black market, weather events → optional Rift Dive → **extract** (keep loot) or **wreck** (lose unsecured cargo) |
| **Meta** | Weeks | Shipyard upgrades, permanent tree, faction reputation, trophies, Eternal Trench depth record |

---

## 2. WORLD-BUILDING & LORE — "THE ABYSSAL RIFT"

**The incident.** Halcyon Dynamics, a mega-corp that sells "premium ocean experiences," launched the *MV Meridian Sovereign*, a 400-meter hyper-yacht powered by an experimental **Zero-Point Tidal Condenser (ZPTC)** that pulls energy from quantum pressure differences in the deep sea. On its maiden "Billionaire Plunge" cruise, the captain (a marketing VP) pushed the ZPTC to 340% for a sponsored firework show over the Kessel Deep.

The reactor didn't explode. It **folded**. For eleven seconds, every ocean that has ever existed across geological time and parallel branches overlapped at a single point. The event is called **"The Shatter."** When it ended, a 60-km radius of sea had been stitched together from those oceans: Devonian armored fish, neon cyber-reefs from a timeline where Halcyon won the 22nd century, and things from *below* the ocean floor that were never meant to be fish.

**Rift Brine.** The water inside the Rift is saturated with **Brine**, an iridescent quantum residue. It mutates everything it touches: fish grow legs, crabs develop territorial instincts about shotguns, and gravity occasionally forgets which way is down.

**Who you are.** You're **Anglers**, gig-economy salvage contractors hired through Halcyon's app *"CatchPay™"* to "recover assets" (anything that sells). Your contract pays in **Rift Scrip**. Your equipment is whatever survived the crash. Your health insurance is a laminated card that says "Good Luck."

**Tone:** corporate satire + cosmic horror + slapstick. The narrator is **HALCY**, a relentlessly upbeat corporate AI whose broadcasts get more unhinged the deeper you go ("Reminder: dying in a non-designated death zone voids your warranty!").

**Narrative delivery**
- **Flotsam Logs:** collectible audio and text logs from *Meridian* passengers and crew.
- **Shipyard evolution:** the hub visibly decays or improves depending on faction choices.
- **The Sovereign wreck:** the endgame dungeon, the ruined yacht itself at the mouth of the Eternal Trench (see §50).

---

## 3. THE BIOLUMINESCENT SANDBOX — 4 BIOMES

The Rift is generated as a **seeded 2D Voronoi biome map** (see §47) within a playable disk of radius `R_world = 12 km` for Voyage maps. A global scalar called **Rift Pressure** `ρ_R ∈ [0, 1]` rises with distance from the Shipyard entry point and with Voyage time:

```
ρ_R(x, t) = clamp( 0.6 · (d(x) / R_world)^1.3 + 0.4 · (t / T_voyage) , 0, 1 )
```

`ρ_R` drives spawn budgets, loot quality, weather severity and anomaly frequency.

| # | Biome | Depth | Mood | Signature rules |
|---|---|---|---|---|
| 1 | **The Glowshelf** | 0–30 m | Neon coral shallows, sunken Halcyon resort | High island density (1 per 0.8 km²), destructible coral, puffer-mine fields, tide caves. Starter biome, `ρ_R` ≤ 0.3 |
| 2 | **Scrapwater Graveyard** | 5–60 m | Oil-slick ship graveyard, fog, rust | Wreck POIs (≥ 6 per chunk), flammable oil slicks (surface fire propagation), Cyber-Poacher patrols, snag-heavy (§7) |
| 3 | **Stormglass Expanse** | 50–400 m | Open ocean, permanent weather front | Sparse islands (1 per 6 km²), rogue waves, EMP storms, sky-sharks at night, leviathan migration lanes |
| 4 | **Hadal Shatter** | 400 m → ∞ | Vertical rift, gravity anomalies, cosmic glow | Rift Dive entry points, thermoclines (§34), cosmic leviathans, inverted-gravity bubbles |

**Generation rules (per 512 m chunk)**
1. **Biome weight** comes from the Voronoi site plus a low-frequency ridged noise warp, so borders are organic.
2. A **POI grammar** fills the chunk from the biome's grammar table: `Chunk → Anchor POI (0–1) + Minor POIs (2–5) + Scatter`. Example: `Graveyard.Anchor = {TankerWreck, CarrierHulk, OilRig}`.
3. **Spawn budget** `B = B_base[biome] · (1 + 1.5·ρ_R) · crewScale(n)` with `crewScale(n) = 0.6 + 0.4·n` for `n` players. Creatures are bought from the budget by tier cost (T1 = 1, T2 = 6, T3 = 40).
4. **Hazard pass:** each biome defines hazard weights (reefs, oil, mines, anomalies). Placement uses Poisson-disk sampling with minimum spacing `s_min` per hazard.
5. **Navigability guarantee:** an A* pass on a 16 m nav grid ensures at least one boat-navigable route of width ≥ 30 m connects every Anchor POI to the Shipyard gate.

**Bioluminescence as gameplay:** water emissive intensity is a function of creature density (`E_water = E0 + k·Σ density`). Experienced players read glowing water like a heat map, so the ocean itself becomes a sonar.

---

## 4. VISUAL AESTHETIC — "CYBER-GRUNGE MARINE"

**One-line brief:** *A rusted trawler covered in stickers, lit by a neon jellyfish.*

**Three material families**
1. **Grunge:** rusted steel, barnacles, peeling corporate paint, duct tape, rope. Heavy normal detail and sharp specular breakup.
2. **Cyber:** Halcyon chrome, holographic decals, glitching LED strips, cable bundles. Clean, emissive, animated.
3. **Bio:** translucent fish membranes, subsurface-scattered flesh, neon photophores. Rendered with **Substrate** slabs (SSS + sheen + wet coat).

**Stylized high-fidelity rules**
- **Silhouette first:** every creature must be identifiable as a black silhouette at 50 m. Proportions are exaggerated about 20% (bigger heads, jaws, fins).
- **Weak-point language:** anything shootable or grabbable glows **cyan**; anything dangerous glows **magenta/red**. This is never violated.
- **Painted albedo, physical light:** hand-painted gradients on albedo, fully physical Lumen lighting. Nanite on all hard-surface props and rocks.
- **Wetness system:** a global Material Parameter Collection drives `Wetness ∈ [0,1]` per actor, set by water contact and rain. Roughness `r' = lerp(r, 0.08, Wetness)`, albedo darkened by 25%.
- **Water:** the Water plugin's single-layer water shader, extended with a Brine iridescence term: `thin-film interference hue = frac(0.5 · (N·V) + t·0.05 + depthNoise)`.

**Palette:** deep teal `#0B3C49`, oil black `#111317`, rust `#B4541D`, Halcyon white `#E9F1F2`, bio-cyan `#3AF2E0`, danger magenta `#FF2E88`.

**Camera and post:** third-person, 75° FOV, slight chromatic aberration only during Rift anomalies. **No motion blur by default.** A "Grime Cam" photo mode is included.

**Performance targets:** 60 fps at 1440p on an RTX 3070 / PS5 (Lumen software RT, TSR from 67%); 30 fps "Quality" mode on consoles.

---

## 5. THE SEAMLESS OVERWORLD

**Goal:** no loading screens between the Shipyard, open ocean, islands, and underwater rifts down to −400 m. The Eternal Trench (§50) is the only hard transition, hidden inside a diegetic "Pressure Lock" sequence.

**World Partition setup**
- Runtime grid "Ocean": cell size **256 m**, loading range **1,536 m** (boat speeds reach 30 m/s).
- Runtime grid "Detail": cell size **64 m**, loading range **256 m** for small props, coral and loot.
- Runtime grid "Underwater": cell size **128 m**, only active for sources below −5 m.
- **HLOD** layers: islands become merged Nanite proxies beyond 1.5 km, and ocean-floor chunks become instanced impostors.
- **Large World Coordinates** (double precision) are on by default, so no origin rebasing is needed.

**Streaming sources:** every player pawn plus the **boat** (priority 1) and every **hooked fish above Tier 2** (so a leviathan dragging you across the map never outruns streaming). The server streams the **union** of all sources. Each client only streams its own sources plus the boat.

**Islands as Level Instances:** each island is a Level Instance (`LI_Island_Glowshelf_Atoll_03`) with embedded PCG graphs for vegetation and loot. Generation stays deterministic from the seed, and designers can still hand-author "hero" islands.

**Data Layers**
- `DL_Tide_High`, `DL_Tide_Low`: toggle cave entrances and reef collision (§32).
- `DL_Night`: night-only spawners and sky-shark nests.
- `DL_Storm_Active`: debris, rogue-wave spawners.

**Surface ↔ underwater transition**
1. A `WaterBodyOcean` per chunk defines the surface. The camera samples `GetWaterSurfaceInfo` each frame.
2. Crossing the surface blends a post-process volume over 0.25 s (fog density, absorption color, caustics).
3. Audio submix gets a low-pass (see §45).
4. **Deep rifts** (below −60 m) are separate **Underwater Level Instances** streamed at high priority when any player is within 150 m of a rift mouth. The mouth geometry uses fog walls and a "thermocline shimmer" to hide the streaming seam.

**Walking on a moving boat:** the boat is a server-simulated physics body. Players use CharacterMovement **based movement** (the boat is the movement base) so they inherit its velocity, and the boat replicates at 30 Hz with client-side interpolation plus a 100 ms smoothing buffer. When the boat lurches (rogue wave, ramming), a **stagger** check applies an impulse to unbraced crew (see §22), which is where the comedy comes from.

---

# PART II — PHYSICS-DRIVEN FISHING (THE CATCH)

## 6. THE KINETIC ROD SIMULATION

The line is an **XPBD rope** with `N = 24` segments (up to 48 for Tier 3 rods). The rod blank is a separate cantilever model that feeds tip position back into the rope. It runs in a fixed-step async physics tick at **120 Hz** on the server, with a cosmetic mirror on clients (§8).

**Line tension**
```
L_spool   = line paid out from the reel (m)
L_actual  = Σ segment lengths (m)
ε         = max(0, (L_actual − L_spool) / L_spool)            // strain
T         = k_line · ε + c_line · dε/dt                        // N
k_line    = E_line · A_line                                    // e.g. braided: 25,000 N per unit strain
```

**Drag (the reel's clutch).** The spool slips when `T > D_set` (the player's drag setting, adjusted with the mouse wheel or D-pad):
```
if T > D_set:  dL_spool/dt = +(T − D_set) / b_drag       // line pays out, fish runs
else:          dL_spool/dt = −ω_reel · r_spool · I_reel   // player reels, I_reel ∈ [0,1] input
```

**Rod flex** (cantilever beam, clamped at the grip):
```
θ_tip = (T · L_rod²) / (2 · E · I_rod)       // tip angle (rad), clamped to θ_max = 1.2
δ_tip = (T · L_rod³) / (3 · E · I_rod)       // tip deflection (m), drives the rod bend blend-shape
```
The rod's flex **absorbs shock**: peak tension spikes are low-pass filtered by the rod's spring constant `k_rod = 3EI/L³`, so a stiff rod transmits shock loads while a whippy rod forgives them. That's the core rod trade-off.

**Friction heat** (from the drag system):
```
dH/dt = μ_drag · T · |dL_spool/dt| − κ_cool · (H − H_amb)
effective break strength:  T_break' = T_break · (1 − 0.6 · smoothstep(H_warn, H_max, H))
```
Heat shows as a glowing reel and smoke. **Splashing water on the reel** (another player's "Bucket" interaction) cools it instantly by `ΔH = −40%`, an intentional co-op job.

**Line break:** snap if `T > T_break'` for longer than `t_grace = 80 ms`, or instantly if `T > 1.5·T_break'`. On a snap, the stored elastic energy `½·k·ε²·L` is released as a whip impulse on the rod holder (knockback, sometimes overboard).

**Haptics and feel**
- DualSense right trigger resistance = `clamp(T / T_break', 0, 1)`, with a vibration "tick" at 20–60 Hz scaled by fish headshake frequency.
- Controller rumble low motor = `T / T_break'`; high motor = thrash events.
- The camera gets a subtle FOV pull (−3° at max tension) plus rod-shake noise.
- Audio: the line **sings**. A MetaSound oscillator's pitch is proportional to `sqrt(T)`, like a guitar string. Players learn to hear danger.

---

## 7. ACTIVE TUG-OF-WAR ENGINE

Fish don't have a "fight minigame bar." They are **physical agents** that choose force vectors each decision tick (10 Hz) using a StateTree with utility scoring.

**Force model**
```
F_fish = S_max · σ(t) · normalize( Σ w_i · d_i )
σ(t)   = stamina fraction, with a floor of 0.15 (fish never go fully limp)
S_max  = species strength (N), e.g. Glowshelf Bass 180 N, Graveyard Gar 1,400 N, Leviathan 80,000 N
```

| Behavior | Direction `d_i` | Triggered when | Counter |
|---|---|---|---|
| **Run** | Away from the rod | `T > 0.5·S_max` | Lower drag, let it tire |
| **Snag** | Toward nearest structure (EQS query: wrecks, coral, pylons within 40 m) | Line angle > 30° from vertical and structure exists | "Side pressure": rod angle perpendicular to steer the fish away |
| **Dive** | Straight down | Surface light high or boat overhead | Pump & reel (see below) |
| **Breach** | Up, jump arc | Stamina > 60% and slack detected | Drop rod tip ("bow to the fish") to create slack before landing |
| **Headshake** | Oscillating ±60° at 3–8 Hz | Hook set < 2 s ago | Keep steady tension; oscillation fatigues the hook hold |
| **Circle** | Tangent around the boat | Near hull | Move along the deck to keep the line clear of the prop |

**Stamina drain:**
```
dσ/dt = −(P_fish / E_fish)   where  P_fish = |F_fish · v_fish|  (mechanical power output)
Recovery when T < 0.2·S_max:  dσ/dt = +r_rec
```
The player's job is to make the fish **work**: keep tension high enough to drain stamina, but below break strength.

**Abrasion.** When rope segments contact geometry (sweep test on segments), line health drops:
```
dA/dt = a_mat · T · |v_slide|          (a_mat: coral 3.0, rust 2.0, sand 0.5, water 0)
```
At `A ≥ 1` the line breaks. Snag-heavy biomes (the Graveyard) are about reading structure.

**Breach snap.** During a breach the fish is airborne and the line goes slack. At re-entry, the fish's momentum `m·v` arrives as a **shock load**. If the rod tip isn't lowered within the "Bow Window" (a 250 ms prompt shown via a rod-tip glint), the peak `T = m·v / Δt_rod` usually snaps light line.

**Pump & reel (player technique):** raising the rod (right stick up) generates a temporary pulling force `F_pump = k_arm · Δθ_rod` that hauls the fish up without using the spool. Reeling during the down-stroke recovers line with low tension. It's the main skill technique for heavy fish.

---

## 8. REEL REPLICATOR NETWORKING

**Principle:** the server owns the truth (fish body, hook, spooled length, tension, line health). Clients own **only** their input and a **cosmetic** rope.

**Replicated state per active line** (`FLineNetState`, Iris-serialized, 30 Hz while hooked, 5 Hz otherwise):

| Field | Encoding | Bits |
|---|---|---|
| Hook/fish world position | Quantized vector, 1 cm, relative to boat | 3 × 20 |
| Fish velocity | Quantized, 5 cm/s | 3 × 12 |
| `L_spool` | 1 cm, unsigned | 18 |
| Tension ratio `T/T_break'` | 8-bit normalized | 8 |
| Heat, abrasion | 6 bits each | 12 |
| Fish state enum + stamina | 4 + 7 | 11 |
| Server tick | delta-encoded | ~10 |
| **Total** | | **≈ 215 bits ≈ 27 bytes** |

27 bytes × 30 Hz ≈ **0.8 KB/s per hooked line**, so 4 simultaneous fights cost about 3.2 KB/s, well within budget.

**Client rope reconstruction:** each client runs the same XPBD solver locally, with two **pinned endpoints**: the rod tip (local, predicted) and the hook (server, interpolated 100 ms behind). Intermediate segments are never replicated. The local solve always converges to a plausible curve, and players can't tell because the endpoints are correct.

**Input prediction for the angler:** reeling is predicted locally. The client advances `L_spool` immediately with its own input and replays unacknowledged inputs on each server update (a Network Prediction plugin–style rewind/replay on a 1-D state, which is cheap). If the error `|L_spool_client − L_spool_server| > 5 cm`, it corrects smoothly over 150 ms. Tension feedback (haptics, line pitch) uses the **predicted** value blended toward the server value, so the rod feels instantaneous even at 120 ms ping.

**Snap authority:** only the server decides a snap. The client may **pre-play** the snap sound and whip VFX if predicted tension exceeds `1.4·T_break'`. If the server disagrees within 200 ms, the cosmetic line quietly "recovers" (rare, and designed to be forgiving).

**Topology:** listen server (the host plays) through the **EOS P2P relay** for friend lobbies, or dedicated servers for public matchmaking and leaderboard runs. The same code runs both ways.

---

## 9. CHANCE & MULTIPLIERS — THE "PERFECT CAST"

Casting is a two-beat rhythm minigame layered on physical projectile simulation.

**Beat 1 — Wind-up:** hold Cast. A power ring oscillates at a species-agnostic **BPM of 90** (0.667 s cycle). The music bus quietly pulses on the beat.

**Beat 2 — Release:** release on the beat.

| Timing error | Grade | Distance factor `g` | Lure Lock bonus |
|---|---|---|---|
| ≤ 40 ms | **PERFECT** | 1.00 | +2 tiers |
| ≤ 90 ms | GREAT | 0.93 | +1 tier |
| ≤ 150 ms | GOOD | 0.85 | 0 |
| > 150 ms | SLOPPY | 0.70 | −1, 20% tangle chance |

**Cast physics:** the lure launches with `v0 = v_max(rod) · p · g`, where `p` is the power ring phase. Its angle comes from camera pitch, with quadratic air drag and wind:
```
a = g_vec − (c_d / m_lure) · |v_rel| · v_rel      where v_rel = v − v_wind
```

**Depth targeting:** after splashdown, the lure sinks at `v_sink(lure)`. Holding Cast again at the right moment "locks" a **depth band** (Surface / Mid / Deep / Abyss). Each species has a preferred depth band, so reading sonar and timing the lock is skill-expressive.

**Lure Lock** sets how aggressively nearby fish track the lure:
```
Attraction radius   R_a = R_base · (1 + 0.35 · LockTier)
Rarity roll weight  w_r = W_base[r] · (1 + (Luck + LockTier) · r · 0.25)
Bite latency        t_bite ~ Exp(λ),  λ = λ_base · (1 + 0.2 · LockTier) · BaitMult · WeatherMult
```

**Streak system:** consecutive PERFECT casts build **Rhythm** (max 5). Each stack adds +5% rarity weight and +3% line strength. A SLOPPY cast resets it. Accessibility: a "Hold-to-Cast" mode replaces rhythm with auto-GOOD, and Rhythm is disabled in that mode.

---

## 10. CHONKY LEVIATHAN DRAG

Anything with `S_max > 0.3 · m_boat · g · μ_water_equiv` can move your boat. Tier 3 creatures move it a lot.

**Forces on the boat.** The line attaches to a **hardpoint** (rod holder, cleat or harpoon turret) at offset `r` from the boat's center of mass:
```
F_line  = T · û(hook − hardpoint)
τ_boat  = r × F_line                       // yaw + roll torque → boat swings and heels toward the fish
```

**Resulting "sleigh ride" speed** (steady state, against hull drag):
```
v_ss = sqrt( T / (0.5 · ρ_w · C_d · A_hull) )
Example: T = 60 kN, ρ_w = 1025 kg/m³, C_d·A = 0.6 m²  →  v_ss ≈ 14 m/s (27 knots)
```
With a 5-ton boat, the Leviathan pulls you faster than your engines can. That's the point.

**Heel and capsize risk:** a line attached high on the boat creates heeling torque `τ_roll = T_lateral · h_attach`. If the heel angle `φ > φ_capsize(boat)` (about 55° for rafts, 70° for battleships) for more than 3 s, the boat **capsizes**, flipping and dumping everything that isn't bolted down. Mounting lines to **low cleats** reduces `h_attach` and is a learned skill.

**Crew counterplay (the drama)**
- **Multi-line:** each additional hooked line splits the load. The fish's effective stamina drain adds up across all lines.
- **Sea anchor / drogue** deployable: adds `C_d·A += 4 m²`, cutting `v_ss` by about 60%, but the line tension spikes.
- **Throttle against:** engines produce a reverse force that raises tension. Great for draining stamina, dangerous for the line.
- **Cut line:** an emergency axe at every hardpoint (a 0.5 s hold).
- **Terrain:** the fish **drags you through the world**, through reefs (§35), past patrols (§28) and into storms. The streaming system follows it (§5).

---

# PART III — MELEE WRESTLING & VISCERAL HARVESTING (THE FIGHT)

## 11. LAND-STALKER PHYSICS

Brine-mutated species with the `Trait.Walker` tag sprout legs when landed (hauled onto a deck or beach). The fight changes from rope to melee.

**Trigger:** when a hooked Walker's body is ≥ 60% out of water for 1.0 s, it plays the **"Evolution Spasm"** (1.2 s, interruptible by a body slam). Fin-legs extrude via a morph target plus a skeletal **Control Rig** layer.

**Locomotion stack**
1. **Procedural gait:** Control Rig with 2–6 fin-leg chains solved by **Full-Body IK**. Foot placement comes from traces, and gait phase is driven by speed (`strideLength = 0.4·bodyLength`, `cadence = v / strideLength`).
2. **Physical animation:** the upper body is blended 40–70% into physics with the **Physics Control** component, so hits, slams and slippery decks visibly move it.
3. **Flop fallback:** if legs are severed (§13) or it's stunned, the fish enters a full ragdoll "flop" with periodic spine impulses `J = m · 2.5 m/s` at 1.5–3 Hz, so it keeps flopping around dangerously.

**Suffocation clock:** Walkers have an **Air meter** `A_air` that drains at `1/t_air` (15–60 s by species). They use EQS to seek the nearest water ("return to sea"). At `A_air = 0` they go **Desperate**: +50% speed, reckless attacks, then collapse. Players choose between wrestling them down fast and pinning them away from the edge until they suffocate.

**Deck interaction:** Walkers physically knock over props, crates and crewmates, and **bite ropes** (can cut other active lines). On small boats they shift the center of mass: a 400 kg Walker running to the rail makes the boat heel.

---

## 12. MELEE WRESTLING MOVESET

Built on **GAS**. Every move is a GameplayAbility with stamina cost, startup/active/recovery frames, and physics impulses.

**Player stamina:** `Stam_max = 100` (upgradeable, §30). Regen is 18/s after a 0.8 s delay.

| Move | Input | Frames (60 fps) S/A/R | Cost | Effect |
|---|---|---|---|---|
| **Grapple** | LB / F near target | 8 / 4 / 20 | 15 | Attaches a physics constraint (hands → nearest grab socket). Starts a **Grip Contest** |
| **Gill Grab** | Grapple on head | 10 / 4 / 18 | 20 | ×2 grip strength, blinds the fish (it can't target) |
| **Pin** | Grapple + crouch | 12 / – / – | 10/s | Fish is immobile while held. Allies deal +50% damage and +100% harvest accuracy |
| **Tail-Swing Dodge** | B / Space during an enemy telegraph | 2 / 12 i-frames / 10 | 12 | Physical roll. Perfect timing (first 4 frames) grants **Momentum** (+30% next hit) |
| **Body Slam** | Jump + attack from ≥ 1 m height | 6 / 6 / 24 | 25 | Impulse `J = m_player · v_fall · 1.5` plus a 1.2 s stun. Bonus scales with fall height, so it's great from masts |
| **Suplex** | Grapple + back + attack | 18 / 8 / 30 | 35 | Throws the fish over your head along the physics arc. Cosmetic headache for the player |
| **Hurl** | Grapple + attack (fish < 60 kg) | 12 / 4 / 16 | 20 | Throws the fish as a projectile (`v = 12 m/s`). Hits other fish. Also hits friends (§42) |
| **Bonk** | Attack with any held object | 10 / 4 / 14 | 5 | Every physics prop is a weapon: damage = `½·m·v²` scaled |

**Grip contest:**
```
Grip_player = (Str_base + Σ perks) · (Stam / Stam_max)^0.5 · (1 + 0.4 · allies_grappling)
Thrash_fish = S_melee · σ_fish · rageMult
Each 0.1 s: if Thrash > Grip → progress_break += (Thrash − Grip) · 0.1
             else             → progress_pin   += (Grip − Thrash) · 0.1
Mash input adds +8% Grip for 0.3 s (capped at 8 inputs/s to prevent macro abuse)
```
Up to **4 players can grapple one large fish** at different sockets, which looks like a rodeo.

---

## 13. THE "SECRET SAUCE" HARVEST MINIGAME

Killing a fish yields base loot. **Carving** it yields *premium* loot. Harvesting happens at a Cutting Board (on the boat) or in the field at a penalty.

**Flow**
1. The fish is laid on the board, and the camera snaps to a top-down "chef cam."
2. The species' **Cut Map** (authored spline set) is revealed: glowing dashed **bone lines**, **organ zones** and **poison sacs** (magenta, never cut).
3. The player traces each cut with the knife (stick or mouse). A cut is scored by path deviation and speed.

**Scoring per cut `i`**
```
dev_i  = mean distance from authored spline (cm)
acc_i  = clamp(1 − dev_i / tol, 0, 1)         tol = 1.5 cm (Precision knife: 2.5 cm)
spd_i  = clamp(1 − |v_i − v_ideal| / v_ideal, 0, 1)
cut_i  = acc_i^1.5 · (0.7 + 0.3 · spd_i)
QTE    : organ extraction prompts (3 timed button presses, ±80 ms windows)
```

**Yield**
```
MeatValue = BaseMeat · Freshness · (0.4 + 0.6 · avg(cut_i)) · (1 + 0.25 · QTE_perfects) · MarketMult
Freshness = exp(−t_since_death / τ_fresh)     τ_fresh: 240 s on deck, ×4 in the Cold Locker, ×∞ in the Fermenter
```

- **Perfect Fillet** (all `cut_i > 0.9`): +1 rarity tier on the meat, and a "Chef's Kiss" VO line from HALCY.
- **Puncturing a poison sac** spoils adjacent zones and releases a gas puff (Rage interaction, §14).
- **Secret organs** (5% chance per carve, higher on rare species) such as the *Brine Pearl*, *Rift Gland* and *Glowmarrow* are crafting components for Tier 3 gear.

Co-op: a second player can "hold" the fish (a Pin variant) to widen `tol` by 40%.

---

## 14. FISH RAGE STATES

Every Tier 2+ fish has an **Adrenaline** attribute `Adr ∈ [0, 100]`:
```
dAdr/dt = 4 · (damage_taken / maxHP · 100) + 6 · out_of_water + 10 · allies_killed_nearby − 3 (decay)
```

| Threshold | State | Effect | Counterplay |
|---|---|---|---|
| 40 | **Frenzy** | +30% speed, faster telegraphs (−20% windup) | Cryo (§18) resets Adr −30 |
| 70 | **Engorge** | Scale ×1.6 → ×2.0 over 1.5 s, +60% HP (current HP scales too), mass ×3, new grab sockets | Bigger target, and slams deal ×1.5 |
| 85 | **Spinecoat** | Grows spikes (Niagara mesh particles + collision). Melee attackers take 15 dmg per hit and grapples cost ×2 stamina | Use guns, or the "Spine-Snap" perk |
| 100 (on death) | **Toxic Bloat** | 3 s after death: detonates a gas cloud (radius 6 m, 25 dmg/s, 8 s, blocks harvesting) | Throw the corpse overboard, or harvest within 3 s ("Speed Carve" bonus +20%) |

Rage states **increase loot** (`+25% per tier reached`), which makes enraging fish a deliberate greed choice. Visual language: the fish's glow shifts from cyan (calm) through amber to magenta.

---

## 15. THE TAXIDERMY TROPHY SYSTEM

Especially large or rare catches can be **mounted** on the boat. Mounting costs the carcass, so it's a trade-off against selling it.

**Mount sockets:** trophy slots scale with boat tier (Raft: 1, Cutter: 3, Ironclad: 6, Battleship: 10), placed on the bow, masts, cabin walls or figurehead. Each mount is a physical mesh that adds **mass and windage**:
```
Δm_boat = 0.3 · m_fish        ΔC_d·A_air += 0.02 · size_fish²
```

**Buffs** are team-wide auras while aboard or within 60 m, applied as GAS GameplayEffects:
```
Buff magnitude = BaseBuff[species] · QualityMult · (1 + 0.1 · RecordBonus)
QualityMult    = 0.5 + 0.5 · (weight / species_max_weight)
RecordBonus    = 1 if it's your crew's personal best for the species
```

| Example trophy | Buff |
|---|---|
| Glowshelf Kingbass | +8% line strength |
| Graveyard Rustgar | +10% hull armor |
| Stormglass Skymako | Turrets +12% fire rate at night |
| Iron-Jaw Megalodon jaw (boss) | Ramming damage ×2, ramming self-damage −50% |
| Spark-Weaver spine (boss) | Immune to EMP disable (§31) |

**Set bonuses:** 3 trophies from one biome give a biome bonus (e.g. "Scrapwater Set: +20% salvage").
**Ornamental physics:** trophies swing, wobble and can be **knocked off** by heavy hits (they fall into the sea and can be recovered with a hook). Losing your prize bass to a rogue wave is a designed heartbreak moment.

---

# PART IV — ABSURD & OVERPOWERED ARSENAL

## 16. EXOTIC FISHING RODS (3 TIERS)

All rods share the §6 model. They differ by `E·I`, `T_break`, reel `ω`, cast `v_max`, and a **Signature Ability** (a GAS ability on a cooldown).

**Tier I — Gravity-Well Rod** *(Halcyon "Tidal Tug" prototype)*
- Stats: `T_break 4 kN`, `v_max 32 m/s`, medium flex.
- **Signature — Gravity Well** (CD 18 s): the lure becomes a 4 m-radius gravity sink for 3 s.
  `F_pull = G_well · m_target / max(r, 0.5)²`, clamped to 900 N. It pulls schools, loot and *enemies' heads underwater*.
- Passive: fish within 8 m of the lure have their Snag behavior weight halved.

**Tier II — Kinetic Railgun Spool** *(Cyber-Poacher contraband)*
- Stats: `T_break 18 kN`, stiff, hook launched magnetically at **`v = 180 m/s`** (hitscan within 60 m).
- **Signature — Capacitor Reel** (CD 25 s): stored kinetic energy retrieves the line at 25 m/s for 1.5 s. Tension is **ignored** during retrieval (no snap), but abrasion is ×3.
- Charge mechanic: slack line and wave motion bank energy, `E_cap += ½·k·ε²` per slack cycle, shown as a battery on the reel.
- The railgun hook deals 40 damage on impact, so you can **fish predators out of the air** (sky-sharks, §25).

**Tier III — Quantum Lasso** *(recovered from the Sovereign's ZPTC core)*
- Stats: `T_break 60 kN`, variable flex (it adapts: `E·I` rises with tension, so it never shock-snaps).
- **Signature — Superposition Hook** (CD 40 s): the hook exists in **two places**. You hook two targets and the line tethers them *to each other*. Examples: tie a fish to a mine, a leviathan to an island, a Cyber-Poacher's boat to a whale.
- **Entangle Reel:** reeling transfers force to both ends, so they're pulled together at `F = min(T_break, Σ S)`.
- Drawback: every 10 s hooked, a "Decoherence" roll (5%) swaps the two ends' positions. Chaos is canon.

---

## 17. HEAVY MARINE FIREARMS

Weapons are hitscan or projectile depending on speed. Ballistics use Chaos traces with water-entry drag (`v_water = v · 0.15`, damage × falloff).

| | **Flak Shotgun "Chum Buster"** | **Anti-Material Harpoon Sniper "Widowmaker"** | **Micro-Missile Bait Launcher "Snack Pack"** |
|---|---|---|---|
| Class | Close-range / anti-air | Precision / tether | Area denial / lure |
| Ammo | Flak shells (8 mag) | Tungsten harpoons (4 mag) | Bait-missiles (12 pod) |
| Damage | 14 × 12 flechettes | 320 (×2.5 on weak point) | 55 blast + 20/s burn |
| ROF | 1.4 /s (pump) | 0.6 /s (bolt) | 6 /s salvo, 2.5 s reload per pod |
| Velocity | 400 m/s | 900 m/s | 60 m/s → 35 m/s homing |
| Special | **Airburst fuse:** hold fire to set burst distance (5–40 m), 60° cone at the burst point. Perfect vs. sky-sharks and piranha clouds | **Tether:** the harpoon trails 80 m of line connected to the gun. Reel it like a rod (§6). Pierces up to 3 bodies, pinning them together ("fish kebab") | **Scent phase:** missiles hover 2 s emitting a scent cloud (attracts all fish within 25 m), then detonate. Chains with Gravity Well |
| Recoil | 900 N·s impulse (can knock you overboard when fired mid-jump) | 1,400 N·s (braced: ×0.3) | 120 N·s |
| Weak spot rule | ×1.5 flak on fins (cripples swimming) | ×2.5 on cyan weak points | Burn ×2 on oil-slicked targets |

**Bracing:** crouching against the rail or prone reduces recoil ×0.3 and spread ×0.5, which rewards positioning on a pitching deck.

---

## 18. TACTICAL UTILITY & DEPLOYABLES

**Cryo Grenade "Brine Freezer"**
- Fuse 1.5 s. On detonation in water, it freezes a **disk of ice** (radius 7 m, 0.6 m thick) that lasts 20 s.
- Implementation: spawns a pre-fractured **Geometry Collection** ice floe (walkable, buoyant: `ρ_ice = 917 kg/m³`) that fractures when `impulse > 8 kN·s`.
- Traps fish (fully submerged fish are *frozen in* → free Pin), creates emergency platforms for boarding, **plugs hull breaches** (§24) for 20 s, and resets Adrenaline −30.

**Vortex Decoy "Spin Cycle"**
- A deployable buoy that spins up a 10 m whirlpool for 12 s. Surface objects get tangential + inward forces:
  `F = m · (ω² r · ê_r_inward · 0.4 + ω r · ê_θ)`, with `ω` = 1.2 rad/s.
- It **aggros fish** (they perceive it as prey), pulls loot flotsam in, and can suck small boats (and players) in. Great for grouping enemies for Depth Charge Pinball (§20).

**Autonomous Sonar Drone "Pinger"**
- A small quad-rotor or torpedo hybrid, max 2 per player. Modes (radial menu):
  1. **Scout:** pings every 4 s within 120 m and marks species (rarity color) on everyone's HUD and in the 3D world.
  2. **Harass:** attaches to a fish and deals 8 dmg/s. Stops Snag behavior entirely (the drone steers the fish).
  3. **Tow:** carries up to 40 kg of loot back to the boat.
- Drones are physical: sky-sharks eat them, EMP storms drop them, friends can shoot them by accident (§42).

Other deployables: **Chum Bucket** (bait area), **Flare** (night spawns scatter), **Duct Tape** (instant 15% hull patch), **Life Ring** (thrown, rescues overboard crew).

---

## 19. MODULAR WEAPON PERKS (15-PERK MATRIX)

Each rod and gun has 3 **Mod slots** by type: **Hook/Muzzle**, **Line/Barrel**, **Core**. Mods are crafted at the Forge (§23) and have 3 quality tiers (I/II/III, values shown as I → III).

| # | Mod | Slot | Rods | Guns | Effect |
|---|---|---|---|---|---|
| 1 | **Chain-Lightning Hooks** | Hook | ✓ | ✓ | On hit, arcs to 2→4 targets within 6 m for 20→45 dmg. ×3 in water (conductivity) |
| 2 | **Acidic Fishing Tethers** | Line | ✓ | ✓ (harpoon) | Line applies 5→12 corrosion dmg/s to hooked targets and −armor 20% |
| 3 | **Barbed Anchor Tips** | Hook | ✓ | ✓ | Hook-hold loss from Headshake −40→−80% |
| 4 | **Kevlar Braid** | Line | ✓ | | `T_break` +20→+45%, abrasion −30% |
| 5 | **Heat-Sink Spool** | Core | ✓ | | Friction heat `κ_cool` ×1.5→×2.5 |
| 6 | **Magnetic Lure Core** | Core | ✓ | | Pulls metal loot within 5→12 m. Doubles salvage finds in the Graveyard |
| 7 | **Sonic Rattle** | Hook | ✓ | | Attraction radius +25→+60%, but also attracts Tier 2 predators |
| 8 | **Tracer Rounds** | Barrel | | ✓ | Hit targets are marked through walls for 6→12 s (team-wide) |
| 9 | **Cryo Payload** | Muzzle | | ✓ | Each hit adds 8→20% Chill. At 100% → Frozen 2 s |
| 10 | **Recoil Jets** | Core | | ✓ | Recoil impulse converted to player mobility (rocket-jump from shotgun blasts) |
| 11 | **Bait Infusion** | Barrel | | ✓ | Hits apply "Chummed": other fish target that enemy for 5→10 s |
| 12 | **Graviton Coil** | Core | ✓ | ✓ | Hooked or hit targets have gravity ×1.5→×3 (can't breach, sink faster) |
| 13 | **Overclocked Reel** | Core | ✓ | | Reel speed +30→+70%, heat generation +50% |
| 14 | **Salvage Splitter** | Muzzle | | ✓ | Kills drop +1→+3 scrap bundles and 10% more meat |
| 15 | **Hydro-Stabilizer** | Barrel | ✓ | ✓ | Spread/cast deviation −40% while the boat is moving, and wave sway on aim removed |

**Synergy tags:** mods have tags (`Elec`, `Cryo`, `Acid`, `Grav`, `Kinetic`). Combining cross-tags on one crew triggers **Reactions**, e.g. `Elec + Cryo = Shatter` (frozen targets hit by lightning take 200% burst damage), `Acid + Grav = Crush` (armor shred ×2 while sinking).

---

## 20. CO-OP COMBOS (5 SIGNATURE TEAM MOVES)

Each combo is detected by the **Combo Director** (server) watching GameplayTags on the same target within a time window. Success grants **"STYLE!"** banners, bonus loot (+15%) and Rhythm stacks.

1. **"Hooked & Laser-Cooked"** — *Angler + Gunner.*
   Angler hooks a fish and holds it at `T > 0.7·T_break` (tag `State.Taut`). Gunner hits it within 2 s. Taut targets can't dodge, take ×1.75 crit damage, and the kill is auto-carved at 0.8 quality.
2. **"Depth Charge Pinball"** — *Any 2+ players.*
   Vortex Decoy groups targets, then ≥ 2 explosive hits within 1.5 s launch them (explosion impulse ×2 on vortex-captured bodies). Airborne fish landing on other fish chain stun, and each bounce is +1 combo counter. At 5 bounces → "PINBALL WIZARD" achievement.
3. **"Rodeo Round-Up"** — *3–4 players.*
   Three grapplers on different sockets of one Tier 2/3 fish → the fish is **Steered**: the grappler with the highest Grip steers it with the movement stick. You can ride a Rustgar into a Cyber-Poacher boat.
4. **"Kebab Protocol"** — *Harpoonist + Captain.*
   A Widowmaker harpoon pins 2+ fish (a kebab), then the Captain rams the kebab with the boat at ≥ 8 m/s. Ramming damage ×3, and all speared fish are killed with Perfect Freshness.
5. **"Cold Snap Shatter"** — *Cryo + Elec.*
   Cryo Grenade freezes a school in ice, then Chain-Lightning Hooks strike the ice. The ice detonates into shrapnel (40 dmg per shard, 12 shards), and frozen fish are harvested instantly at 100% Freshness.

---

# PART V — MODULAR BASE-BUILDING (RAFT → BATTLESHIP)

## 21. THE EXPANDABLE RAFT SYSTEM

**Grid:** the boat is built on a **2 m × 2 m tile grid**, 3 decks tall (hold, main, upper), with snapping for walls, floors, rails and machines. Max footprint by hull class:

| Hull class | Grid | Max mass | Materials unlocked |
|---|---|---|---|
| Driftwood Raft | 4×3 | 3 t | Wood, rope, barrels |
| Scrap Cutter | 8×4 | 12 t | + Scrap steel |
| Ironclad | 14×6 | 45 t | + Iron plate, engines ×2 |
| Rift Battleship | 24×10 | 180 t | + Halcyon alloy, turrets ×6, dry dock |

**Tile data** (`FHullTile`): material, HP, mass `m_t`, displaced volume `V_t`, compartment ID, connection mask (6 bits).

**Buoyancy per tile** (evaluated at tile centers against Water plugin wave height):
```
V_sub,t = V_t · clamp((h_water(x_t) − z_bottom,t) / h_t, 0, 1)
F_b,t   = ρ_w · g · V_sub,t      applied at the tile center → natural pitch/roll
```

**Structural integrity** (lightweight graph solver, runs on edits and damage events, not every frame):
- Tiles form a graph. The keel tiles are **roots**.
- Each tile carries its own load plus the loads it supports. Stress `σ_t = Load_t / Cap_mat`.
- If `σ_t > 1`: the tile cracks (visual). If `σ_t > 1.5` or it's disconnected from the roots, the section **breaks off** as a separate physics body with its own buoyancy. Megalodon (§39) uses this.

**Rendering and physics performance:** at runtime, placed tiles are merged into **Instanced Static Meshes** per material (Nanite). Collision is a **compound of boxes** rebuilt incrementally. Mass and inertia tensor come from `Σ m_t`, and the CoM `= Σ m_t·x_t / Σ m_t`.

**Blueprint saving:** ships serialize to a compact tile list plus machine list (usually under 8 KB), saved in the shipyard, shareable as **"Ship Codes"** (Base64). They're community-shareable without any server.

---

## 22. PROPULSION & STEERING TECH

**Hydrodynamics model** (boat-local frame):
```
Forward drag   F_x = −½·ρ_w·C_x·A_x·|u|·u
Lateral drag   F_y = −½·ρ_w·C_y·A_y·|v|·v         (C_y ≈ 8·C_x: the keel resists sliding)
Yaw damping    N   = −k_r·r·|r|
```

**Sails:**
```
v_app   = v_wind − v_boat                    (apparent wind)
α       = angle between the sail chord and v_app (player trims with the sheet input)
F_lift  = ½·ρ_air·|v_app|²·A_sail·C_L(α)     C_L(α) ≈ 2π·sin(α)·cos(α), stalls past 25°
F_drag  = ½·ρ_air·|v_app|²·A_sail·C_D(α)     C_D(α) ≈ 0.05 + 1.2·sin²(α)
F_sail  = F_lift·ê_⊥(v_app) + F_drag·ê_∥(v_app)   → projected onto the hull, lateral part resisted by the keel
```
Good trimming (α near 15–20°) reaches beam-reach speeds of 1.2× wind. Sail trim gives one crew member a meaningful job.

**Dual-propeller engines:**
```
F_prop,i = T_max,i · throttle_i · η(u)       η(u) = 1 − (u / u_max)²
Differential thrust torque τ = (F_prop,L − F_prop,R) · b / 2      (b = prop spacing)
Fuel burn = Σ |throttle_i| · c_fuel         (fuel = fermented fish oil, §23)
```
Differential throttle allows **tank-turning** in place, which becomes essential for heavy battleships.

**Rudder:**
```
F_rudder = ½·ρ_w·(u_prop_wash + u)²·A_r·C_L(δ)     δ = rudder angle (±35°)
τ_rudder = F_rudder · l_r
```
Prop wash makes the rudder effective even at low speed.

**Drift-turning heavily loaded boats:** the lateral grip coefficient scales with **load factor** `LF = m_current / m_design`:
```
C_y_eff = C_y · (1 / LF)^0.7
```
A fully loaded boat slides through turns, and a skilled Captain "power-drifts" (throttle cut → rudder hard → throttle on) to swing the stern around. Crew standing on deck get a stagger check whenever yaw acceleration `|ṙ| > 0.8 rad/s²` (brace with the Hold input).

---

## 23. ON-BOARD FACILITIES

Facilities are placeable machines with power (from the engine or generator) and **operator interactions**.

**Fish Fermenter "The Stinkvat"** (2×2 tiles)
- Converts carcass parts into processed goods over *real* Voyage time:

| Input | Time | Output | Use |
|---|---|---|---|
| 10 kg any meat | 120 s | 4 L Fish Oil | Engine fuel, lamp fuel |
| Toxic sac ×3 | 180 s | Bloat Grenade | Throwable gas bomb |
| Rare meat | 300 s | Aged Rift Garum | Sells at ×3 on the Black Market |
| Brine Gland | 240 s | Adrenal Tonic | Consumable: +40% stamina regen for 2 min |

- **Pressure mechanic:** the vat builds pressure while working. The pressure valve must be vented (an interaction) every 60–90 s, or it explodes. The **Stench** cloud attracts Tier 1 swarms (a risk you can also exploit as bait).

**Weapon Assembly Forge** (3×2 tiles)
- Crafts weapons, mods and deployables from scrap + fish parts.
- **Hammer minigame:** hammer strikes on the beat (reuses the cast rhythm system). Mod quality roll = `Q = base + 0.1·perfectStrikes`. A Perfect streak can upgrade a tier I mod to II.
- Needs heat (fed with fish oil). Overheating risks a fire (fire spreads across wooden tiles at 0.5 tiles/s).

**Crew Mess Hall** (3×3 tiles)
- Cook meals from harvested meat. Each meal grants a **team-wide buff** for 10 minutes. Recipes are discovered by experimentation (ingredient combos are hashed against a recipe table, and unknown combos give random "Mystery Stew" effects).
- Buff examples: *Glowshelf Ceviche* (+15% night vision radius), *Rustgar Chowder* (+20 max stamina), *Kraken Kebab* (+25% grip strength). Max 2 meal buffs active.
- **Seating bonus:** buffs are +50% stronger if the whole crew eats together. That gives the session a natural social break.

---

## 24. HYDRODYNAMIC DAMAGE

The boat is divided into **compartments** (flood-fill of enclosed tile regions, separated by bulkhead walls/doors).

**Breaches:** damage above a threshold creates a hole with area `A_b` at depth `h` below the waterline:
```
Inflow Q = C_d · A_b · sqrt(2 · g · h)          C_d ≈ 0.6
Water volume per compartment: V_w,c += Q·dt − Q_pump
Water level h_w,c = V_w,c / FloorArea_c
Added mass m_w,c = ρ_w · V_w,c                   positioned at the compartment's water centroid
```

**Consequences**
- **Buoyancy loss:** flooded volume reduces displacement, so the boat sits lower. Lower freeboard means more breaches become submerged, a death spiral you can see coming.
- **CoM shift:** water mass moves the center of mass toward flooded compartments, so the boat **lists** (constant heel). On a list, walking uphill costs stamina and loose objects slide.
- **Free-surface effect:** partially flooded compartments reduce stability. The metacentric height is reduced by `GM_loss = ρ_w · i_fs / Δ` (`i_fs` = second moment of the free-surface area), so partly-flooded boats roll more and are more likely to capsize.
- **Handling:** added mass increases inertia, and the drift-turning load factor (§22) rises.
- **Door physics:** open bulkhead doors let water flow between compartments (level-equalizing flow `Q_door = C_d·A_door·sqrt(2g·Δh)`). Closing doors becomes a panicked co-op job.

**Repair:** holding Repair with planks or plates seals `A_b` at a rate that scales with the Mechanic role (§48). **Bilge pumps** (machines) remove 8–40 L/s. Cryo grenades plug breaches temporarily (§18). Water visuals: per-compartment water planes with Niagara sloshing, with the level driven by `h_w,c` and tilt by boat attitude.

---

## 25. DEFENSIVE TURRETS

At night (§33), the Stormglass sky fills with **sky-sharks** (Tier 2 fliers). Turrets are placed on reinforced tiles and use the power grid.

| Turret | Power | Behavior | Stats |
|---|---|---|---|
| **Harpoon Tether** | 2 kW | Fires a tethered harpoon at the target, then reels it down onto the deck (the landed sky-shark becomes a melee Walker, §11) | 120 dmg, 1 shot / 3 s, 70 m range, tether `T_break` 20 kN |
| **Flak Cannon** | 4 kW | Predictive airburst, leads targets using `t_hit = |Δp| / v_shell` solved iteratively | 30 dmg × 16 fragments, 2 /s, 120 m |
| **Chum Mortar** | 1 kW | Lobs bait bombs to lure swarms away | Area aggro 20 m for 10 s |
| **Arc Coil** | 6 kW | Chain lightning, 3 targets (disabled by EMP storms) | 45 dmg per arc, continuous 1.5 s pulses |

**Turret AI:** a target priority score `P = w_threat·DPS_target + w_dist/d + w_hold·isAttackingCrew − w_friendly·crewInCone` (turrets won't fire through a crewmate, **unless** the crew turns off "Safety Protocols" for +20% fire rate, see §42).
**Manual override:** any player can take a turret over for +25% damage and a slow-mo "hit confirm" VFX.
**Power:** generators produce a limited number of kW, and players balance turrets vs. Forge vs. pumps in a power distribution UI. During EMP storms, turrets without a Faraday mod shut down.

---

# PART VI — THE HIGH-STAKES ECONOMY

## 26. THE CORRUPT BLACK MARKET

Traders are faction NPCs at floating markets. Prices are **dynamic per item**, **per Voyage world** (seeded), and influenced by the crew's selling behavior.

**Price model**
```
P(i, t) = P0_i · D_i(t) · E_i(t) · F_rep · N_noise

Supply saturation (player-driven):
  D_i(t) = (S_ref / (S_ref + S_i(t)))^ε            ε = 0.6 elasticity
  S_i(t) = Σ_sales q · exp(−(t − t_sale)/τ_recover)     τ_recover = 15 min

Events (market news broadcasts):
  E_i(t) ∈ {0.5 "Glut", 1.0, 1.8 "Craze", 3.0 "Cult Demand"}  — rotates every 10–20 min

Faction modifier:
  F_rep = 1 + 0.05 · RepTier(faction)   (−0.2 if Hostile)

Noise:
  N_noise = 1 + 0.08 · simplex(t / 300 s)
```

**Player-facing mechanics**
- **Dumping penalty:** selling 40 Rustgars in one go crashes their price. Spreading sales across traders and time is optimal play.
- **Speculation:** "Futures Contracts" pay a locked price for a delivery before the Voyage ends, a bet on scarcity.
- **Rigging:** Cyber-Poacher traders can be **bribed** to report a fake Craze (+50% price for 5 min, risk of Union reputation loss if discovered).
- UI: a price ticker board with trend arrows and a 5-minute sparkline per item.

---

## 27. THE SEA-SHANTY CASINO

Gambling uses **in-game fish parts and Scrip only**. There is no real money, no purchasable currency, and no loot-box mechanics, which protects the age rating (see §49).

**Venues:** *"The Lucky Gill"* (a floating barge casino, a Black Market POI), plus the **On-Board Card Table** facility.

**Games**
1. **Crab Races:** 6 physics-simulated crabs (real Chaos bodies with randomized leg-strength and "temperament" stats) run a cluttered track. Players see a **form guide** (past race results give readable, learnable stats). The house edge comes from odds: `odds_k = (1 − h) / p̂_k`, with `h = 0.08` and `p̂` from a simulated 1,000-race Monte Carlo per race seed. **Sabotage allowed:** throwing chum on the track costs a 25% fee and gets you banned from the next race if the Bouncer NPC catches you (a line-of-sight check).
2. **Davy's Dice** (liar's dice): 2–4 players plus NPCs. Players bid on combined dice. NPCs use a bluff model: `P(call) = sigmoid(k·(bidQuantity − expectedQuantity))` with a personality `k`.
3. **Chum Roulette:** a spinning wheel over a tank. Your bet sits on an animal, and whichever animal the eel eats first wins.

**Design guardrails:** maximum bet = 10% of the crew's Voyage earnings; no persistent gambling progression; winnings are capped per Voyage. Gambling is **flavor, not an economy engine**.

---

## 28. CONTRABAND SMUGGLING

Contracts from the Cultists or Poachers: deliver **Volatile Mutant Eggs** from pickup to drop-off through patrolled waters.

**Egg stability** `Stab ∈ [0, 100]`, one crate per egg cluster, physically loaded on the deck:
```
dStab/dt = −( a_g · max(0, |a_crate| − 3 m/s²) + a_heat · max(0, Temp − 30°C) + a_light · UVexposure ) + r_incubator
```
- Rough seas, collisions, gunfire recoil and **cannon shots** all jolt the crate. Rogue waves are lethal.
- At `Stab < 30`, eggs **hatch early**: hostile Tier 1–2 mutants spawn *on your deck*.
- At `Stab = 0` a volatile egg **detonates** (Brine explosion, 8 m radius).

**Patrols:** Iron Anchor Union gunboats on patrol routes (spline patrols plus StateTree investigation). They have **search cones** (spotlights at night) and a Suspicion meter that fills faster when the boat carries contraband visibly (open deck vs. a hidden hold compartment, a base-building trade-off).
- Getting caught means boarding, fines or a firefight (and Union rep −).

**Payout:**
```
Pay = Base · (Stab_final / 100)^1.5 · (1 + 0.5 · stealthBonus) · (1 + distance_km / 10)
```
Deliveries with 100% Stability earn a "Gentle Hands" bonus and a cosmetic.

---

## 29. REPUTATION FACTIONS

Three factions compete for control of the Rift. Reputation runs `−1000 to +3000` across tiers: **Hostile / Neutral / Contractor / Trusted / Partner / Legend**. Gaining reputation with one faction lowers it with its **rival** at a 0.5 ratio (Union ⟷ Poachers, Poachers ⟷ Cultists, Cultists ⟷ Union), so you can't max all three at once.

| Faction | Fantasy | Wants | Unlocks | Hub |
|---|---|---|---|---|
| **The Iron Anchor Union** | Blue-collar dockworkers turned militia, the Rift's closest thing to law | Legal catches, pest control, rescue contracts, turning in smugglers | Ironclad hull, Flak Cannon, repair drones, legal market access (stable prices) | *Anchorage*, a rusting oil-platform town |
| **The Deep-Sea Cultists** | "Children of the Shatter" who worship the leviathans | Live captures (not killed), offering rare organs, protecting sacred cosmic fish | Quantum Lasso, Brine-infused mods, Rift Dive keys, cosmetic masks | *The Drowned Chapel*, a half-submerged cruise ship |
| **The Cyber-Poachers** | Corporate defectors with stolen Halcyon tech | Endangered species, contraband smuggling, sabotaging the Union | Kinetic Railgun Spool, drones, rigged markets, stealth hull mods | *Neon Market*, a floating shipping-container city |

**World reactivity:** the faction with the highest crew rep controls more of the Voyage map (more friendly POIs, fewer patrols). Faction **wars** can break out as world events: two factions' fleets fight, and players can pick a side, loot the aftermath, or rob both.

---

## 30. PERMANENT PROGRESSION TREE

Meta-currency: **Rift Scrip**, earned from extracted Voyage value (roughly 10% of cargo value) plus contracts. Spent at the Shipyard's "HALCY Human Enhancement Kiosk™."

**Design rule — horizontal first.** New players must feel useful next to veterans, so vertical power is capped. About 60% of nodes are **sidegrades or utility**, and the total raw power delta between a new and a maxed character is **≤ 35%**.

**Cost curve** per node level `n`: `Cost(n) = C0 · 1.6^(n−1)` (e.g. 100, 160, 256, 410, 655).

| Branch | Node | Per level | Max |
|---|---|---|---|
| **Body** | Stamina | +8 max stamina | 5 |
| | Lung Capacity | +10 s breath underwater (`base 45 s`) | 5 |
| | Iron Grip | +6% grapple strength | 4 |
| | Sea Legs | −15% stagger chance on a moving deck | 3 |
| **Craft** | Knot-Tying Speed | −12% time to tie lines/cleats/lashes (`base 2.5 s`) | 5 |
| | Steady Hands | +0.3 cm carving tolerance | 4 |
| | Field Surgeon | Revives 15% faster (§43) | 3 |
| | Scrap Sense | Salvage outlined through walls within 5 → 25 m | 5 |
| **Tactics** | Quickdraw | Weapon swap −10% | 3 |
| | Pressure Suit | Crush depth +50 m per level (§34) | 5 |
| | Rhythm Keeper | Cast timing windows +8 ms | 3 |
| | Salvage Rights | +5% extraction value | 5 |

**Catch-up:** when a crew has large gaps, "Mentor Scrip" pays veterans for playing with lower-level friends. It's a positive incentive with no power transfer.

---

# PART VII — DYNAMIC ECOSYSTEMS, TIDES & WEATHER

## 31. METEOROLOGICAL CHAOS

Weather is a server-driven state machine per region, with transitions weighted by biome and `ρ_R`, and 90 s of visible **forecast** warning (HALCY broadcasts, sky color, barometer prop on the boat).

**Rogue Waves**
- Spawned as a **traveling Gerstner packet** added to the Water plugin wave spectrum:
  `η(x,t) = A·exp(−((x·k̂ − c·t − x0)/σ)²)·cos(k·(x·k̂) − ω·t)`
  with `A = 8–22 m`, `c = 15 m/s`, and `σ = 40 m` envelope width.
- Buoyancy sampling makes boats climb or broach naturally. Taking the wave **bow-on** (±25°) is survivable. **Beam-on** can capsize (§10 heel logic).
- On deck: every unbolted physics prop, loot crate and crewmate gets thrown. Knot-tied lashings (Craft branch, §30) keep cargo in place.

**EMP Lightning Storms** (Stormglass, `ρ_R > 0.5`)
- Strikes pick targets with probability ∝ `height² · metallic` (masts and turrets get hit first).
- A strike on the boat deals 150 dmg at the point plus an **EMP pulse**: electronics (drones, turrets, sonar, Arc Coils, electric reels) are disabled for 8–15 s unless they have Faraday-shielded mods.
- **Lightning Rods** (placeable) attract strikes (+300% target weight) and **store charge** that powers the Arc Coil. This is the counterplay, and the setup for boss §40.

**Acid Rain** (Scrapwater + Hadal)
- Corrosion: `dHP_tile/dt = −k_acid · exposure · (1 − armorAcidRes)` on uncovered tiles; exposed players take 2 dmg/s without a hood or canopy.
- Metal gear rusts. Weapon **condition** falls, and jam chance `p_jam = 0.02 · (1 − condition)` rises.
- Upside: acid rain dissolves **coral shells**, revealing hidden salvage nodes. Surface fish flee downward, and acid-tolerant rare species rise from below the thermocline to feed on the corroded reef.

---

## 32. LUNAR TIDE CYCLES

The Rift has an accelerated **lunar clock**: one in-game tidal day = **48 real minutes**, so every 90-minute Voyage spans about two full tidal cycles.

**Tide height** (sum of two constituents for natural irregularity):
```
h_tide(t) = A_M2 · cos(2π·t / T_M2) + A_S2 · cos(2π·t / T_S2 + φ)
T_M2 = 24 min game-scaled, T_S2 = 23.3 min, A_M2 = 2.4 m, A_S2 = 0.8 m  → spring/neap beats over ~13 Voyages
```
Water bodies offset the ocean base height by `h_tide`. Collision on reefs does not change, but the **water surface does**, so reefs emerge naturally.

**Gameplay**
- **Tide caves:** entrances at `z ∈ [−1.5, +0.5] m` are only enterable by boat or swimmer when `h_tide` is in a window. Cave interiors are **Data Layer** instances (§5) with treasure, rare spawns and air pockets. If the tide rises while you're inside, air pockets shrink (a breath timer, §30) and the exit floods.
- **Stranding:** at low tide, boats with draft `d > depth_local` run aground. The hull scrapes (§35 damage) and the boat gets stuck, becoming an unmovable island until the tide returns or the crew **kedges off** (runs an anchor out on a line and winches the boat off).
- **Tide pools:** low tide exposes pools with trapped rare fish. You catch them by hand (a wrestling sub-mode).
- The HUD tide clock is a physical **tide table prop** in the cabin.

---

## 33. BIOLUMINESCENT NIGHT SHIFTS

A Voyage has a 36-minute day cycle (24 min day / 12 min night by default, seeded variation).

**Night rules**
```
Aggression multiplier  Agg_night = 1.5 (T1), 1.8 (T2), 2.5 (T3)
Perception: fish see light sources, not players. Detection range R_detect = R_base · (1 + Σ lightIntensity_nearby)
Spawn table swaps to Night tables (DL_Night data layer)
```
- **Stealth fishing:** turn off the boat lights, so fish can't detect you, but neither can you see them. Bioluminescence (§3) is the only guide.
- **Sky-shark nights** (Stormglass): wave-based aerial attacks. Turret defense (§25).
- **Cosmic predators** (ultra-rare, `P_spawn = 0.02 · ρ_R` per night, per chunk with players): examples are the **Starmaw Ray** (glides over the surface, pulls stars down as homing projectiles), the **Nebula Eel** (phases through hulls), and the **Void Koi** (catchable only with the Quantum Lasso, sells for a Voyage's worth of Scrip).
- Night catches get a "Nocturnal" rarity bonus: `+1 tier roll chance of 15%`.

**Visuals:** full darkness outside light radius, Lumen-lit bioluminescent plankton trails (Niagara GPU particles reacting to boat wake and swimmers), and a moon phase that sets the base ambient.

---

## 34. UNDERWATER THERMOCLINES

The Hadal Shatter is vertical. Diving has three thermocline layers with sharp transitions (visible as a shimmering horizontal "mirror").

**Pressure**
```
P(d) = P_atm + ρ_w · g · d           ≈ 1 atm per 10 m
Suit rating D_rating = D_base (60 m) + 50 m · PressureSuitLevel + gearMods
Crush damage if d > D_rating: dmg/s = 5 · ((d − D_rating)/10)^2
```

**Movement drag**
```
Swim acceleration a = (F_swim − ½·ρ_w·C_d·A·|v|·v · Visc(layer)) / m
Visc(layer): Surface 1.0, Layer 1 (−60 m) 1.4, Layer 2 (−180 m) 2.0, Layer 3 (−300 m) 3.2
```
Deeper feels like moving through syrup. Propulsion scooters and the Gravity-Well Rod (pull yourself toward the lure) become the main mobility tools.

**Temperature:** each layer shifts temperature (Layer 2 is 4 °C: a cold debuff reduces stamina regen by 50% without a heated suit; Layer 3 is a hydrothermal 60 °C with burn).

**Rift Narcosis:** below Layer 2, a `Narcosis` meter rises with depth × time, causing audio/visual hallucinations (fake fish on sonar, teammates' voices from wrong directions via §45). Narcosis is cleared by returning above the layer, which is psychological horror in a comedy game.

**Tethered diving:** divers can be tethered to the boat with a line (it reuses the rope solver). The crew above can **reel a diver up** in an emergency, and a snag can trap them.

---

## 35. CORAL REEF COLLISION PHYSICS

**Destructible environment:** reefs, pylons, wreck walls and ice floes are **Chaos Geometry Collections** with material-specific damage thresholds and anchored fields for supports.

**Impact energy:**
```
E_impact = ½ · m_boat · (v_rel · n̂)²      (normal component only)
Reef fracture if E_impact > E_threshold[mat]    (coral 40 kJ, rock 400 kJ, wreck steel 150 kJ)
Hull damage = k_hull[mat] · max(0, E_impact − E_absorb_hull)  → distributed to impacted tiles (§21)
```

**Running aground:** when the keel depth exceeds the local water depth, hull tiles in contact take scraping damage `dHP/dt = μ_scrape · |v| · normalForce`, and the boat decelerates with high friction. Heavy boats can **plow through** coral (fracturing it, taking damage), while light boats bounce.

**Environmental consequences**
- Broken coral releases **Brine particles** that attract fish (+30% bite rate for 60 s, a deliberate strategy).
- Destroyed reefs regrow over 3 Voyages in persistent islands; the Cultists hate reef-destroyers (−rep).
- Destruction debris is buoyant or sinking depending on material. Floating debris is a **physics hazard** for props and a **makeshift shield** vs. projectiles.

**Performance:** geometry collections are cached and **cluster-damaged** (no per-fragment simulation beyond 12 m of any player; distant debris is removed after 20 s). Server-authoritative fracture seeds are replicated as a single event (`{GC_id, impact point, impulse, seed}`), and clients fracture deterministically.

---

# PART VIII — MONSTER MANUAL & APEX ENCOUNTERS

## 36. TIER 1 — BAITFISH & SWARMS

Built on **Mass Entity** (ECS) for 500–2,000 agents per region. Individual members only get full actors when grabbed or killed ("actor promotion").

**Piranha-Clouds**
- Boids: `a = w_s·separation + w_a·alignment + w_c·cohesion + w_t·seek(target) + w_f·flee(explosions)`, with `w_t` rising sharply when blood (damage events) is within 30 m.
- Swarm HP is a **pool** (e.g. 600 HP for 150 fish). Each fish is a sub-unit with one hit, so area damage is king.
- Behavior: they **strip** exposed flesh. Swimmers take 12 dmg/s while inside the cloud. They eat hooked fish too (your catch becomes a skeleton, a 20% value loss per second). Flak airburst and Cryo counter them.

**Exploding Puffer-Mines**
- Drift in minefields (Glowshelf and Graveyard). Proximity 3 m → a 1.2 s inflate telegraph (audible squeak), then detonation: 90 dmg, 6 m radius, 12 kN·s impulse.
- **Physics toy:** you can hook them and **fling** them (the lure swing becomes a mace), carry them, or throw them at enemies. Popping one near others causes a chain reaction.
- Harvest: a defused puffer (snip the fuse organ in carving, §13) gives a Puffer Charge (a craftable bomb).

**Camouflaged Sand-Flounders**
- Hidden on the sea floor and on the **decks of wrecks**. They're only visible with sonar, when disturbed, or through subtle shimmer. They ambush with a slap attack that knocks players prone and steals held items (grabs the item, swims off).
- Catching one gives a "Mimic Scale," used for stealth hull camouflage mods.

---

## 37. TIER 2 — REEF APEXES

| Apex | HP | Mass | Signature | Weak point | Counter |
|---|---|---|---|---|---|
| **Armored Land-Gator** (Glowshelf/Graveyard) | 1,800 | 600 kg | Walker (§11) with **armored plates** (−70% damage). Death roll: spins and pulls grapplers underwater | Belly (flip it with an explosion or a suplex from 2+ grapplers) | Explosives flip it, Cryo stops the death roll |
| **Electric-Eel Serpent** (Scrapwater) | 2,400 | 350 kg, 14 m long | Segmented body (8 physics links). Charges up, then **electrifies water within 12 m** for 2.5 s (60 dmg/s, ×3 on electrical gear). Wraps boats, constricting a hull section | Glowing jaw capacitor (disable it to stop discharges for 20 s) | Get out of the water. Rubber-soled boots. Grounding rods on the deck |
| **Jet-Powered Squid** (Stormglass) | 2,000 | 280 kg | Water-jet dash (35 m/s) and leaps to **land on your deck**. **Ink blast** blinds (screen-space ink decal, 70% vision loss for 5 s, cleaned faster by wiping, a hold input). Tentacles steal crew weapons | Siphon (hit during a jet dash for ×3 damage) | Flares scatter ink. Wide shots. Hold on to your gun (grip QTE) |

**Shared T2 rules:** Tier 2s always telegraph (0.6–1.2 s windups with the magenta glow language), always have a readable weak point, and always **enter Rage** (§14). Loot: 1 guaranteed rare organ plus a trophy eligibility.

---

## 38. TIER 3 — COSMIC LEVIATHANS

Tier 3s are **world events**: 1 per region per Voyage at most, announced by environmental tells (sonar distortion, fish scattering, HALCY panic broadcasts).

**Ghostly Sky-Whale "Aurelion"**
- A 60 m translucent whale that **swims through the air**. It's not a fight to win quickly: it's a moving hazard and a harvest opportunity.
- **Local gravity field:** within 150 m, gravity is `g_local = g · (1 − 0.7·f(d))` (f = smooth falloff). Boats float **higher** (buoyancy relative to reduced weight lifts hulls from the water), jumps go 3× higher, and loose props drift upward.
- **Gravity Song:** periodically inverts gravity in a 40 m bubble for 6 s. Everything falls **up** toward the whale. Players can deliberately ride the inversion to board its back.
- Harvesting: boarding lets players carve **Aether Blubber** from its back (the whale doesn't die). Overharvesting (> 3 carves) enrages it.

**Ancient Deep-Sea Kraken "Mother Below"**
- Lives in the Hadal Shatter. Ambushes from beneath with **8 independently-simulated tentacles** (each a 14-link physics chain with its own HP of 3,000 and GAS abilities: Grab Boat, Slam Deck, Pluck Crew, Constrict).
- Tentacles grab **specific hull tiles**, applying downward force `F = 40 kN` each at those points. The boat tilts toward the grabbed side and pulls under if ≥ 4 tentacles hold one side for 5 s.
- Severing tentacles (a carve prompt at 25% tentacle HP, §13) yields massive meat hauls. The main body only surfaces after 4 tentacles are severed, then the fight becomes a head-down gunnery exchange.

---

## 39. BOSS FIGHT 1 — "THE IRON-JAW MEGALODON"

*A 30 m prehistoric shark whose jaw was replaced with a salvaged ship-breaker hydraulic press. It eats boats. Arena: open Stormglass, triggered with the Chum Beacon or as a world event at `ρ_R > 0.6`.*

**Stats:** HP 42,000 (× crew scaling `0.55 + 0.45·n`), mass 60 t, armor 30% (jaw: 80%).

**Phase 1 — "Circling Predator" (100–70%)**
- Circles at 120 m, and its dorsal fin is the only visible part. Fast strafing runs (`v = 24 m/s`) with a **bite-through check** on hull tiles: bite damage 800 split across a 3×3 tile area.
- The key skill is **harpooning the dorsal** (Widowmaker tether): the tether drags the shark toward the boat, then it's exposed for 4 s for the crew to unload damage.
- Tell: sonar ping pitch rises before a run (audio cue), with 1.5 s warning.

**Phase 2 — "The Breaker" (70–35%)**
- The hydraulic jaw activates. The Megalodon lunges and **chews the base-ship in half**:
  1. **Clamp:** jaw closes on a 4-tile-wide slice across the hull (telegraph: red hull tiles highlighted 2 s before).
  2. **Press:** structural stress `σ += 0.35 / s` on clamped tiles (the same §21 integrity solver).
  3. **Break:** when `σ > 1.5`, the boat **splits into two physics bodies**. Each half has its own buoyancy, compartments, flooding and machines. Crew on the "wrong" half must jump or swim across.
- Counterplay: shooting the **pressure hoses** (3 glowing cyan weak points on the jaw) during the Press stops it. Each hose destroyed adds a 12 s jaw lockout. Cryo on the hoses gives a +50% damage window. The Mechanic can reinforce clamped tiles (−50% stress gain) in real time.

**Phase 3 — "Blood in the Water" (35–0%)**
- Enraged: summons shiver-sharks (T2 escorts, ×3). Performs **breaches** over the boat (the landing slam is AoE, 400 dmg, and can land *on the deck*, turning into a Walker-like thrash state for 6 s).
- A shark on your deck is a melee opportunity: 4 grapplers → **"Jaw Jack"** co-op finisher (pry the jaw open, then plant explosives inside). Deals 25% max HP.
- **Reward:** Iron-Jaw Trophy (§15), Hydraulic Jaw (a boat ram module), Megalodon tooth mods, 1 Legendary cosmetic flag.

---

## 40. BOSS FIGHT 2 — "THE LEVIATHAN SPARK-WEAVER"

*A 90 m electric eel that weaves storm clouds out of its own static discharge. Arena: a ring-shaped storm "eye" 600 m across, with 5 small spire islets.*

**Stats:** HP 65,000 (crew-scaled), segmented body (24 links), charge meter `Q ∈ [0, 100]`.

**Core mechanic — Lightning Rod Placement**
- The eel builds charge `dQ/dt = 3 + 2·stormIntensity`. At `Q = 100`, it unleashes **Tempest Cascade**: 12 strikes across the arena (300 dmg + EMP each).
- Players place **Portable Lightning Rods** (carried, 45 kg, physically heavy) on the **spire islets** or the boat. Each rod:
  - intercepts strikes within 25 m (`P_intercept = 0.9`),
  - **stores charge** (`C_rod`), and can be **grounded into the eel** by tethering the rod to the eel with a harpoon line: `Damage = 40 · C_rod_stored`, stunning it for 5 s.
- The fight revolves around **carrying rods through a storm while an eel hunts you**: one player carries a 45 kg rod (slowed ×0.6), others escort.

**Phase 1 — "Weaving" (100–60%):** the eel swims through the air and water in sine loops, and electrified water rings expand from its path (jump them). Cyan scale nodes along its body are weak points (8 nodes, each destroyed = −10% max charge rate).

**Phase 2 — "Storm Crown" (60–25%):** it coils around a spire and becomes a **stationary storm tower**. Floating charged debris orbits (shootable). Rogue waves radiate from the spire every 20 s (§31). Crew must ram or harpoon it off the spire; a grounded rod on the spire itself prevents re-coiling.

**Phase 3 — "Overload" (25–0%):** constant EMP (all electronics off unless Faraday-shielded), so combat reverts to **analog**: rods, harpoons, melee. When a stored rod discharge lands, the eel collapses onto the water for **"Spark Surfing"**: players ride its body (a moving platform) to its head for the finisher carve.
- **Reward:** Spark-Weaver Spine trophy (EMP immunity), Capacitor Core (Arc Coil ×2), Storm Caller rod skin.

---

# PART IX — MULTIPLAYER NETWORK ARCHITECTURE & CO-OP UX

## 41. SERVER-AUTHORITATIVE PHYSICS

**Topology**
- **Friends lobbies:** a listen server on the host via EOS P2P relay (NAT-safe), up to 4 players.
- **Public matchmaking and the Eternal Trench leaderboards:** **dedicated servers** (containerized Linux builds on a fleet or a game-server hosting provider).

**Honest truth about P2P:** on a listen server, the **host's machine is the authority**, so a host with a modified client *can* cheat in their own lobby. This is fine for private friend games (it only affects consenting friends). So:
- Leaderboards, world-first records and competitive Trench runs are **only recorded on dedicated servers**.
- Progression from listen-server sessions is **still saved** but flagged "casual." Economy values are sanity-clamped server-side on the backend when saved (see below).

**Authority rules (all topologies)**
1. **Clients send inputs and intents only.** Examples: `ServerCast(powerPhase, timingError_ms, aimDir)`, `ServerReel(inputAxis, seq)`, `ServerHarvestCut(splinePoints[])`. Never `SetFishWeight` or `ApplyDamage`.
2. **Every roll is server-side and seeded:** `fishWeight = f(speciesCurve, SeededRNG(voyageSeed, spawnId, hookTick))`. The seed and inputs are logged, so a result is **re-derivable** and auditable by the backend.
3. **Validation of intents:**
   - Cast timing: the server checks `|timingError|` against the client-reported beat phase and its own beat clock ± latency budget (`RTT/2 + 30 ms`). Impossible accuracy rates (e.g. > 98% PERFECT over 50 casts) are flagged, not auto-banned.
   - Carving: the server re-scores the submitted spline points (max 240 points, clamped to the cutting-board plane). Human-impossible input (zero-jitter paths) → accuracy capped at 0.95.
   - Fire rate, reload and ammo are enforced by GAS ability cooldowns on the server.
4. **Damage:** hits are resolved server-side with **lag-compensated rewind** (last 250 ms of hitbox history per creature) for hitscan weapons. Projectiles are server-spawned; the client shows a predicted cosmetic projectile.
5. **Backend economy guard:** when a Voyage's results are submitted to the persistence backend (a signed payload from the server), it checks invariants: `valueExtracted ≤ f(time, crewSize, ρ_R_max)`, trophies must reference valid species rolls, and the currency delta per hour is capped at the 99.9th percentile of legit play. Violations quarantine the reward pending review.
6. **Anti-tamper:** **Easy Anti-Cheat (EOS)** on dedicated-server queues, file integrity checks, and encrypted replication (DTLS on EOS P2P).

---

## 42. THE ACCIDENTAL FRIENDLY-FIRE MATRIX

Friendly fire is **on**, with scaled damage (`FF_mult = 0.35` for direct damage, 1.0 for **physics**). Physics chaos is always full strength. We want friends launched, not killed.

| Cause | Victim effect | Design intent |
|---|---|---|
| Misplaced **depth charge** | Launches teammates 10–25 m (impulse `J ∝ 1/r²`), overboard | Top comedy moment. Ragdoll + funny VO |
| **Flak airburst** set too short | Knocks teammates back, confetti-like feathers (cosmetic) | Teaches fuse control |
| **Harpoon tether** hits a teammate | Teammate is **reeled in** like a fish (they're hooked, 50% Grip Contest to free) | "Fishing for Friends" achievement |
| **Hurled fish** | 20 damage per 10 kg, knockdown | Throw-fish meta |
| **Vortex decoy** | Crew caught in it spins helplessly until it ends | Rescue with a life ring |
| **Railgun hook** | Pierces a teammate and pins them to the wall for 2 s | Hilarious, low damage |
| **Snapped line whip** (§6) | Knocks nearby crew prone | Makes drag management a team concern |
| **Turret Safety Protocols OFF** | Turrets can shoot through crew | Risk/reward for more DPS |
| **Boat ramming** | Crew in the water get "bonked" (big knockback, low damage) | Captain accountability |
| **Chain-Lightning in water** | Arcs to swimming teammates | Communication: "GET OUT OF THE WATER" |

**Anti-griefing:** any player can vote **"Plank the Griefer"** (3/4 vote) to put a repeat offender's FF multiplier at 0 for the session. There's also a per-lobby toggle (Full / Physics-Only / Off).

---

## 43. THE CLUTCH REVIVAL MECHANIC

**Downed states**
- **Knocked** (HP 0 on deck/land): bleed-out timer 40 s. The player can crawl slowly and ping.
- **Drowning** (HP 0 in water, or breath 0): the body sinks at 0.5 m/s. Timer 25 s, then **"Waterlogged"** (still revivable for 60 s after being fished up). Teammates can **hook the body with a rod** and reel it up (it weighs 90 kg, a normal fish fight).

**Revival methods**

| Method | Time | Revive HP | Notes |
|---|---|---|---|
| Manual CPR | 5 s (Field Surgeon −15%/lvl) | 25% | Rhythm prompt: compressions on the beat (reuses the cast rhythm system) |
| **Car Battery Defib** | 1.5 s | 50% | Battery item (heavy, 18 kg), 3 charges. Shocking a wet body also shocks the reviver unless they're standing on a dry tile |
| **Electric-Eel Jumpstart** | Instant | 75% | Hold a captured (live) Shock Eel against the body. 30% chance the eel bites. Lethal to anyone else touching the water |
| **Chain-Lightning Hook** | Instant | 30% | Shoot the downed teammate with an Elec mod. It revives them **and** damages them by 10. Only works when out of water |
| **Resurrection Station** (Battleship facility) | 20 s respawn | 100% | Clone vat. Downed crew with no rescue respawn here after the timer (lose held items) |

**Clutch moments:** a revive completed within the last 3 s of a timer triggers a slow-mo "CLUTCH!" banner, and the revived player gets 3 s of invulnerability plus +50% stamina.

---

## 44. SHARED LOOT SPLITTING

**Design goal:** zero drama about who got what, while keeping the physical fun of carrying loot.

**Two loot classes**
1. **Physical cargo** (fish, crates, organs): exists as objects in the world. It's **crew-owned** (not player-owned), so anyone can carry it. It only turns into value when **extracted** at the Shipyard or sold at markets. Loss is shared, which creates shared stakes.
2. **Personal drops** (mods, blueprints, cosmetics): **instanced per player** (each player rolls separately and sees their own drop, shown with their color). You can never be "sniped."

**Automated shipyard distribution** (Voyage end):
```
Pool     = Σ cargo value extracted
Base     = 0.70 · Pool / n                           (equal split: no one feels cheated)
Merit    = 0.30 · Pool · (contrib_i / Σ contrib)     (contribution score)
contrib_i = 0.35·catchValue_i + 0.25·damage_i + 0.20·repairs_i + 0.20·revives/assists_i (normalized per category)
```
- Contribution is weighted across **all roles**, so the Mechanic who kept the ship afloat earns as much as the Gunner.
- An end-of-Voyage **"Crew Report"** shows funny awards (e.g. "Most Seawater Swallowed," "Friendly Fire MVP") instead of a shameful ranking.
- Crews can toggle **"Pure Split"** (100% equal) in lobby settings.

---

## 45. PROXIMITY VOICE CHAT (3D AUDIO)

**Stack:** EOS Voice (or Vivox), with voice routed into the UE audio engine as spatialized sources through a **Voice Submix** chain so it gets the same processing as game sounds.

**Attenuation:** logarithmic falloff, inner radius 2 m, max 60 m (on-deck crew are always audible). Players with a **Radio** item (default: on the boat) get a low-fi, band-limited channel at any distance.

**Environmental DSP (all realtime, parameter-driven)**

| Condition | Processing |
|---|---|
| **Speaker underwater** | Low-pass 600 Hz, bubble granular overlay, volume −9 dB, a bubble VFX at the mouth |
| **Listener underwater** | Low-pass 900 Hz on all above-water voices, **except** divers on the same tether (a "tether phone" stays clear) |
| **Deep sea caves** | Reverb from Audio Volumes (decay 2.8 s, pre-delay 40 ms). Echo taps via convolution IR recorded from cave geometry size classes |
| **High winds / storms** | Sidechain: voices ducked −6 to −12 dB by the wind bus level, with high-pass 250 Hz. Shouting (input RMS > threshold) partly punches through, so storms make people yell, which is on purpose |
| **Inside a closed cabin** | Occlusion: low-pass 1.5 kHz for voices outside, via line traces through tile walls |
| **Rift Narcosis** (§34) | Occasional **misplaced voice spatialization** (voice seems to come from a random direction), pitch warble ±30 cents |
| **Dead/downed** | Drowning players are heard muffled, and "ghost" chat with the other downed players |

Accessibility: a "Clear Comms" toggle disables environmental voice DSP, plus speech-to-text captions on proximity chat.

---

# PART X — PRODUCTION BLUEPRINT & LAUNCH LOOP

## 46. THE CORE COMBAT LOOP — FRAME DATA OF A PERFECT CATCH-TO-KILL

*Scenario: the Harpoonist hooks a Tier 2 Rustgar (Walker) in the Scrapwater. Runs at 60 fps; frame numbers are relative.*

| Frame | Time | Event | Systems |
|---|---|---|---|
| 0 | 0.000 | Cast input held. Power ring starts (90 BPM) | Enhanced Input → GA_Cast |
| 40 | 0.667 | Beat peak. Release within ±2 frames → **PERFECT** | Rhythm clock (server-synced beat phase) |
| 41 | 0.683 | Lure launched `v0 = 32 m/s`. Rhythm +1 | Projectile sim, cosmetic rope spawn |
| 102 | 1.700 | Splashdown (Niagara splash, audio). Depth lock to MID at frame 130 | Water query, GA_DepthLock |
| 130–310 | 2.2–5.2 | Rustgar's StateTree evaluates the lure (Lure Lock +2 → attraction ×1.7). Approach | AI StateTree + EQS |
| 311 | 5.183 | **Bite.** Bobber plunge. Hook window opens: 18 frames (300 ms) | Server event → client VFX, trigger rumble |
| 318 | 5.300 | Hook-set input (7 frames reaction) → **Solid Hook** (hold bonus +20%) | GA_HookSet |
| 318–900 | 5.3–15 | **Tug-of-war.** Fish Run (F ≈ 1,100 N) → drag slips at `D_set` 900 N. The player pumps and reels. A Breach at frame 540 → Bow Window 15 frames → rod dropped at frame 548, shock load is survivable | Rope XPBD 120 Hz, §6–7 |
| 700 | 11.67 | Gunner fires the Widowmaker on the taut fish → **"Hooked & Laser-Cooked"** (§20) ×1.75 crit → 560 dmg | Combo Director tag check |
| 901 | 15.0 | Fish stamina < 20%, hauled into the shallows beside the deck. Evolution Spasm (72 frames) | Walker transition §11 |
| 973 | 16.2 | Fish on deck, Walker legs. Adrenaline 72 → **Engorge** | GAS attribute thresholds §14 |
| 990 | 16.5 | Telegraph: tail swipe (36 frames windup, magenta glow) | Anim notify → GameplayCue |
| 1020 | 17.0 | Player **Tail-Swing Dodge** on frame 2 of the active window → Perfect → Momentum +30% | i-frames 12 |
| 1040 | 17.3 | **Body Slam** from the cabin roof (fall 2.4 m) → impulse ×1.5 → stun 72 frames | Chaos impulse, GA_Slam |
| 1050 | 17.5 | Second player grapples (Gill Grab) → **Pin** | Physics constraint, Grip Contest |
| 1112 | 18.5 | Knife finisher (GAS execution ability, 40 frames) → kill. Adrenaline was < 100, so no Toxic Bloat | GA_Execute |
| 1152 | 19.2 | Corpse onto the Cutting Board (auto-carry by the Pin holder) | Carry system |
| 1152–1500 | 19–25 | **Harvest:** 5 cuts, avg `cut_i = 0.93` → **Perfect Fillet** + Brine Gland (secret organ) | §13 |
| 1500 | 25.0 | Loot to the crew cargo hold. STYLE bonus +15%. HALCY: "Chef's kiss, contractor!" | Loot pipeline §44 |

**Target:** a skilled crew completes a T2 catch-to-harvest in **20–30 s**, and a new crew in about 60–90 s. Both should feel great.

---

## 47. PROCEDURAL MAP STITCHING

**Inputs:** `VoyageSeed (uint64)`, `ContractType`, `CrewFactionState`, `DifficultyTier`.

**Pipeline** (runs in the **UE5 PCG framework** at Voyage start on the server; clients receive only the seed plus a small override list, **not** the geometry)
1. **Macro layout:** Poisson-disk sample Voronoi sites in the 12 km disk. Assign biomes by ring distance plus a seeded angular rotation. The Shipyard gate is always at the south edge.
2. **Chunk grid:** 512 m chunks. Each chunk samples the biome field and gets a **chunk archetype** from a weighted table (`Open`, `Archipelago`, `Wreckfield`, `ReefMaze`, `RiftMouth`, `Market`).
3. **Edge sockets (stitching):** each chunk edge has a socket type (`DeepWater`, `ShallowShelf`, `ReefWall`, `WreckDebris`). A **Wave Function Collapse**-style solver picks archetypes so adjacent sockets are compatible (e.g. `ReefWall` must meet `ReefWall` or a transition tile). There are backtracking limits, with a fallback to the `Open` archetype.
4. **Island placement:** each archetype has island "slots" filled with **Level Instance** islands from a biome pool (hand-authored hero islands with a 10% chance, else modular procedural islands built from PCG kits: cliff, beach, jungle, ruin).
5. **Seamless blending:** biome transitions blend water color, fog, and seabed materials over a 256 m band. The seabed heightfield is generated from seeded noise and **stitched at chunk borders** by evaluating the same global noise (no seams by construction).
6. **POIs and contracts:** Anchor POIs are placed to satisfy the contract (e.g. a smuggling route requires pickup and drop-off 3–5 km apart with ≥ 2 patrol-route crossings).
7. **Validation:** a navigability A* check (§3). Minimum distance between the Shipyard and the first T3 lair is 3 km. Loot budget checksum.
8. **Determinism:** all randomness comes from `SplitMix64(VoyageSeed ⊕ hash(chunkX, chunkY, layerId))`. Given the same seed, every client generates identical geometry, and only runtime state (destruction, loot taken) replicates.

**Daily Seed:** one global seed per day with a shared leaderboard. It's great for streamers and community comparison.

---

## 48. ASYMMETRIC ROLES

Roles are **loadout plus perk archetypes**, not hard classes. Anyone can do anything, but the role makes one job great. Roles can be changed at the Shipyard or the on-board locker.

| Role | Fantasy | Role perks | Signature tool | Core responsibility |
|---|---|---|---|---|
| **The Captain** | The one who yells "HOLD ON" | Steering precision +25%, drift control, crew stagger −30% while at the helm. Can call **Brace** (team-wide prompt that halves knockback for 2 s) | Captain's Horn (rallies: +15% stamina regen for 20 s) | Navigation, ramming, weather positioning, sleigh-ride management (§10) |
| **The Harpoonist** | Angler supreme | Line strength +20%, rhythm window +10 ms, sees fish silhouettes through water within 30 m | Kinetic Railgun Spool unlock track | Catching, tethering bosses, the rope game |
| **The Heavy Gunner** | Walking artillery | Recoil −40%, carry weight +40 kg (can carry lightning rods at full speed), explosive damage +20% | Flak Shotgun + deployable Mounted Minigun | Combat DPS, anti-air, swarm clearing |
| **The Mechanic** | Duct tape deity | Repair speed +60%, builds 30% faster, sees structural stress overlay (§21), pumps +25% | Multitool (weld/repair/cut) + Repair Drone | Keeping the ship alive, flooding control, turret power management |

**Solo play:** AI **Deckhand Drones** (hireable, upgradeable) cover missing roles at 60% efficiency. You can command them with a ping wheel.
**Role synergy bonus:** a crew with 4 distinct roles gets **"Full Crew"** (+10% all loot), which encourages diversity without forcing it.

---

## 49. MONETIZATION & LIVE-OPS PHILOSOPHY

**Business model:** premium buy-to-play at **$24.99**, with a **Friend Pass** (a free 1-week guest pass the owner can gift, where the guest can play in the owner's lobby), which is a proven viral driver for co-op games.

**Promises (public and non-negotiable)**
1. **Zero pay-to-win.** Nothing purchasable affects stats, drop rates, progression speed or economy.
2. **No loot boxes, ever.** Everything purchasable is shown and bought directly. The in-game casino (§27) uses no real money and can't be topped up with it.
3. **All gameplay content is free** for owners: biomes, bosses, weapons and events.

**What's for sale (cosmetic DLC and a store)**
- **Hilarious player skins:** Sardine Suit, Business Casual Shark, Retired Pirate Dad, Halcyon Intern Uniform, Inflatable Flamingo Diver.
- **Boat flags and hull paint:** Jolly Roger (animated with physics cloth), "My Other Boat Is Also Sinking," HALCY Employee of the Month.
- **Emotes and VO packs:** sea-shanty emote pack (a full crew harmony when all 4 play it), narrator packs (e.g. a pirate HALCY skin).
- **Rod and gun cosmetics:** they don't change stats. Visual rope colors and splash VFX.
- **Supporter Pack DLC** (soundtrack, art book, a flag).

**Live-ops cadence**
- **Weekly:** Daily/Weekly Seeds with leaderboards; rotating Black Market Crazes.
- **Monthly:** a "Rift Surge" event (new modifier, e.g. low-gravity month, all-fish-are-Walkers weekend).
- **Quarterly:** a free content update (new biome variant, boss, weapon family) plus a cosmetic collection.
- **Community:** Ship Code sharing (§21), a Photo Mode contest, a Steam Workshop for flags (moderated).

**Earned cosmetics:** at least 50% of all cosmetics are **earnable in-game** (achievements, boss trophies, faction Legend rewards), so paid cosmetics complement earned bragging rights instead of replacing them.

---

## 50. ENDGAME CONTENT — "THE ETERNAL TRENCH"

At the heart of the Hadal Shatter, the wreck of the *Meridian Sovereign* hangs over a bottomless whirlpool: the **Eternal Trench**. It's a roguelike descent with **infinite depth**.

**Structure**
- The crew enters through the Pressure Lock (the one hard loading transition, disguised as a descent elevator in the Sovereign's reactor shaft).
- The Trench is a sequence of **Depth Layers**, each a procedurally generated vertical arena (a 250 m-tall cylinder built from stitched PCG kits: ledges, flooded chambers, gravity-inverted zones, ZPTC fragments).
- Each layer has one objective (Catch X, Slay Y, Survive Z, Escort the Rod), then the crew picks **one of three Rift Doors** (modifier choices) and descends.

**Infinite scaling**
```
Layer L:
  Enemy HP      × (1 + 0.12·L + 0.004·L²)
  Enemy dmg     × (1 + 0.08·L)
  Pressure dmg  : suit ratings are reduced by 20 m per layer
  Spawn budget  × (1 + 0.1·L), capped by the performance budget → excess becomes elite affixes instead of more bodies
  Loot quality  : rarity weight bonus +0.2 per layer; "Trench-forged" mods (unique affixes) from L ≥ 10
```

**Rift Door modifiers** (pick 1 of 3 each layer, a curse with a matching reward):
- *Heavy Water:* gravity ×1.5 → loot ×1.3
- *Glass Lines:* `T_break` −40% → fish rarity +2 tiers
- *No Lights:* permanent night → cosmic predator spawns ×5
- *Brine Surge:* all fish start at Adrenaline 70 → Rage loot bonus ×2
- *Mutiny:* friendly fire ×3 → Scrip ×2 (for the brave and the stupid)

**Boons:** between layers, the **"Drowned Vendor"** (a Cultist ghost) offers run-only boons for Trench Pearls: e.g. *"Line of Fate"* (the first snap each layer is prevented), *"Leviathan's Blessing"* (the boat gains a trophy slot for the run).

**Every 10th layer is a Warden:** a remixed boss from §39–40 or a **Trench-exclusive** boss (e.g. *The Accountant*, Halcyon's CFO fused with a colossal anglerfish, who "audits" your inventory by stealing loot mid-fight, which you have to recover from its lantern-vault).

**Extraction rule (the greed pillar):** after each layer, the crew can **ascend** to bank all loot, or **descend** and risk it. Wiping loses 75% of unbanked loot; one **Emergency Buoy** item can secure one item per run.

**Leaderboards:** max depth, fastest to L25, and "Deepest Solo." Weekly **Trench Seeds** give everyone the same doors and layout. Dedicated servers only (§41).

**The Depth Record Myth:** at layer 100 there is a (datamined-proof, server-side) encounter nobody is supposed to reach quickly: HALCY herself, fully Brine-corrupted. It's the community's long-term goal.

---

## APPENDIX A — UE5 PROJECT BLUEPRINT (HOW TO START CLEAN)

**Project settings**
- UE **5.6+**, C++ project, **Lyra-style** modular architecture (Game Features plugins per system: `GF_Fishing`, `GF_Boats`, `GF_Wrestling`, `GF_Economy`, `GF_Weather`).
- Enable: Water, Buoyancy, Chaos Destruction, Chaos Cloth, PCG, StateTree, MassEntity, MassAI, Gameplay Abilities, Enhanced Input, Iris, Network Prediction, MetaSounds, Online Services (EOS), Common UI, Modular Gameplay.
- **Physics:** async physics tick at 60 Hz for general bodies and a **custom 120 Hz substep** for rope solvers. Chaos Physics with determinism options enabled on dedicated servers for replay debugging.

**Module layout (C++)**
```
Source/ApexAnglers/
  Core/            GameMode, GameState, PlayerState, save system, seeded RNG (SplitMix64)
  Fishing/         URopeSolverComponent (XPBD), URodComponent, UReelComponent, FLineNetState, cast rhythm
  Creatures/       StateTree tasks, Walker Control Rig drivers, Mass swarm processors, Rage attribute set
  Combat/          GAS attribute sets (Health, Stamina, Grip, Adrenaline), abilities, Combo Director
  Boats/           UHullGridComponent, buoyancy per tile, compartments/flooding, propulsion, structural solver
  World/           PCG graphs, map stitcher (WFC), tide/weather managers, data layer controller
  Economy/         market model, factions, contracts, loot distribution, backend client
  Audio/           voice submix routing, environmental DSP controller
  UI/              Common UI screens, HUD widgets (MVVM)
```

**Milestones (a suggested 18-month plan for a small team, scale as needed)**

| Milestone | Month | Exit criteria |
|---|---|---|
| **M0 Prototype** | 0–3 | Rope + rod + one fish tug-of-war feels great. Boat buoyancy. Listen-server 2-player |
| **M1 Vertical Slice** | 3–7 | Glowshelf biome, 10 species, wrestling, carving, 1 T2 Apex, raft building, 4-player online |
| **M2 Alpha** | 7–12 | 4 biomes, economy + factions, weather + tides, Megalodon boss, dedicated server build |
| **M3 Beta / Steam Next Fest demo** | 12–15 | Spark-Weaver, Trench v1 (25 layers), roles, voice DSP, optimization pass |
| **M4 Early Access Launch** | 15–18 | Live-ops tooling, cosmetics store, leaderboards, Easy Anti-Cheat, localization |

**Golden rule for "super clean":** every system reads its numbers from **DataAssets/CurveTables**, every gameplay effect goes through **GAS**, every random roll goes through the **seeded RNG**, and **nothing gameplay-relevant is ever decided on a client**. Follow these four rules and the game stays debuggable, balanceable and cheat-resistant as it grows.

---

## APPENDIX B — REUSING THE "DEEP WATERS" PROTOTYPE

The browser prototype in `game/` (this repository) already validates several Apex Anglers systems. Use it as a **living design reference and balance sandbox**, not as UE5 code:

| Prototype system (`game/`) | Apex Anglers section | What carries over |
|---|---|---|
| Line tension / reel minigame (`shared/sim.js` → `updateFishing`) | §6–7 | Tension/progress curves, burst "run" timing to tune feel before the UE5 rope exists |
| Server-authoritative sim + anti-cheat (`server/`) | §41 | Intent-only protocol, message validation, rate limiting, audits: port the rules to UE5 RPC validation |
| Seeded species generator (`shared/data.js`) | §3, §47 | Deterministic generation approach, rarity weighting formulas |
| Boss pattern state machine (`bossAI`) | §39–40 | Telegraph → execute → recover cadence, phase thresholds |
| Market price model | §26 | Starting point for the elasticity model |
| Lobby types, invites, host kick | §41–44 | Same UX flows over EOS lobbies |

*End of document — v0.1. Next revision: balance spreadsheets (CurveTables) for §6–§10 and a technical design review of the rope networking prototype.*
