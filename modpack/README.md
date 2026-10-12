# SOLO modpack (Minecraft 1.21.11, Fabric 0.19.3)

`SOLO_1.0.1-fps.mrpack` is the fixed and FPS-tuned version of SOLO 1.0.0. Import it into the Modrinth App or Prism Launcher.

## What changed from 1.0.0

### Crash and conflict fixes
| Change | Why |
|---|---|
| Removed `sodium-fabric-0.8.7` | A second Sodium copy alongside 0.8.12. Duplicate mod IDs break loading. 0.8.12 is the version Nvidium beta13 accepts (`=0.8.11` or `=0.8.12`). Iris 1.10.7 is broken by Sodium 0.8.13+, so the pack stays on 0.8.12. |
| Left Sodium Extra 0.9.3 disabled | Its `fabric.mod.json` requires `sodium >=0.8.13+mc1.21.11` (checked on the `mc1.21.11-0.9.3` source tag). 0.9.1 requires `>=0.8.1`, so 2.0.0 swaps in 0.9.1. |
| Removed FPS Reducer 2 | It did the same job as Dynamic FPS, and it capped you at 30 FPS after 60 seconds without input. |
| Removed Ksyxis | It does nothing on 1.21.9+, because Mojang removed spawn chunks. |
| Removed Atmosfera | It doubled up the ambient soundscapes with AmbientSounds. The Atmosfera author warns against combining the two. |
| Removed the Fullbright UB resource pack | It needs PolyTone with Sodium on 1.21.6+, and shaders override it. |

The `depends`/`breaks` blocks of 162 mods were read from their public sources (`audit/dependency_audit.json`). 130 were fully resolved and 27 partly. None of them showed a remaining conflict. 5 mods are closed source and could not be checked: Axiom, Essential, both Xaero mods and AFK Cinematics.

### FPS and stutter config changes
- **Iris:** shaders are off by default (`enableShaders=false`). Press **K** to turn Photon back on. With shaders off, Nvidium can work on GTX 16xx and RTX cards.
- **Distant Horizons:**
  - LOD radius 256 → 128.
  - Threads 6 → 4, run-time ratio 0.75, priority 3. This stops DH from starving C2ME and the render thread.
  - Biome blending 3 → 1, fade `DOUBLE_PASS` → `SINGLE_PASS`, zoom quality +4 → +2.
  - Adaptive transfer on, real-time update radius 128, auto-updater off.
- **MoreCulling:** leaf culling mode `DEPTH`.
- **LambDynamicLights:** `fast` mode.
- **EMF/ETF:** EMF can reduce animation detail when FPS is low. ETF texture update rate set to "Average".
- **Particles:**
  - Particle Core cap 16384 → 8192.
  - Particle Rain max 1500 → 1000.
  - Turned off duplicate effects: Particular's cascades, waterfall spray, falling leaves, fireflies and rain ripples, and Visuality's rain circles.
- **Sound Physics Remastered:** 16 rays × 3 bounces (was 32 × 4).
- **Presence Footsteps:** at most 20 entities making footstep sounds (was 50).
- **spark:** background profiler off.
- **ServerCore:** fast biome lookups on, duplicate fluid ticks cancelled, item merge radius 1.0.

### Settings to change yourself (launcher / in game)
- RAM: 6–8 GB, with min = max.
- Java 21 flags for 6+ core CPUs: `-XX:+UseZGC -XX:+ZGenerational -XX:+AlwaysPreTouch`.
- Java 21 flags for 4-core CPUs: `-XX:+UseG1GC -XX:MaxGCPauseMillis=37 -XX:+ParallelRefProcEnabled -XX:G1HeapRegionSize=16M`.
- Render distance 10–12, because Distant Horizons draws past that. Simulation distance 6–8.
- VSync off, with the FPS cap at your monitor's refresh rate. Graphics: Fancy, not Fabulous.
- Pre-generate new worlds with `/chunky radius 1500` then `/chunky start`.

## Building 2.0.0 (adds the new mods)
This needs network access to `api.modrinth.com` and `cdn.modrinth.com`.

```sh
mkdir src && cd src && unzip ../SOLO_1.0.1-fps.mrpack && cd ..
python3 tools/build_pack.py --src src --plan plan_2.0.0.json \
  --out SOLO_2.0.0.mrpack --cache .cache --report report_2.0.0.md
# optional real boot test (also needs the Mojang + Fabric meta/maven hosts):
python3 tools/launch_test.py --mrpack SOLO_2.0.0.mrpack --work .boot --cache .cache
```

`build_pack.py` does the following:
1. Resolves each mod to its newest Fabric 1.21.11 build (release before beta).
2. Adds required dependencies and refuses any mod that declares itself incompatible with the pack.
3. Downloads every jar and checks its sha1, sha512 and size.
4. Runs a Fabric-style `depends`/`breaks` check that covers jar-in-jar mods. Any addition that fails the check, such as one needing Sodium 0.8.13+, is dropped automatically.
