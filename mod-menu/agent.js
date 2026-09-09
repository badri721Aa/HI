// nosignal mod menu — Frida agent for Animal Company
//
// Injected via: frida -n "Animal Company" -l agent.js
// Driven interactively by menu.py in this same folder.
//
// This only ever hooks your own local process memory — no network code,
// no packet manipulation, nothing that touches other players. Same rule
// as the rest of the site: offline or private solo sessions only.
//
// IMPORTANT — the export names and offsets below are PLACEHOLDERS. IL2CPP
// export names and field offsets are specific to one exact game build and
// will not work as-is. Before this does anything:
//   1. Dump your own build's exports — see /tutorials/animal-company-getting-started
//   2. Find your own field offsets with Cheat Engine — see /tutorials/cheat-engine-frida
//   3. Replace every TODO below with the values you found
// Re-dump after every game update — the hex suffix on exports changes.

const GAME_ASSEMBLY = "GameAssembly.dll";

// ---- placeholders: replace with values from your own dump ----
const TAKE_DAMAGE_EXPORT = "PlayerController_TakeDamage_m123456"; // TODO
const PLAYER_UPDATE_EXPORT = "PlayerController_Update_m000000"; // TODO
const SPEED_FIELD_OFFSET = 0x68; // TODO — float, found with Cheat Engine
const NOCLIP_FLAG_OFFSET = 0x9c; // TODO — bool/byte, found with Cheat Engine
// -----------------------------------------------------------------

const state = {
  godMode: false,
  noclip: false,
  speedMultiplier: 1.0,
};

function attachGodMode() {
  const fn = Module.findExportByName(GAME_ASSEMBLY, TAKE_DAMAGE_EXPORT);
  if (!fn) {
    send({ type: "error", description: `export not found: ${TAKE_DAMAGE_EXPORT} — update TAKE_DAMAGE_EXPORT` });
    return;
  }
  Interceptor.attach(fn, {
    onEnter(args) {
      // IL2CPP instance method: args[0] = this, args[1] = damage amount
      if (state.godMode) args[1] = ptr(0);
    },
  });
  send({ type: "send", payload: "god mode hook attached" });
}

function attachMovementHook() {
  const fn = Module.findExportByName(GAME_ASSEMBLY, PLAYER_UPDATE_EXPORT);
  if (!fn) {
    send({ type: "error", description: `export not found: ${PLAYER_UPDATE_EXPORT} — update PLAYER_UPDATE_EXPORT` });
    return;
  }
  Interceptor.attach(fn, {
    onEnter(args) {
      const self = args[0];
      if (state.speedMultiplier !== 1.0) {
        self.add(SPEED_FIELD_OFFSET).writeFloat(state.speedMultiplier);
      }
      if (state.noclip) {
        self.add(NOCLIP_FLAG_OFFSET).writeU8(1);
      }
    },
  });
  send({ type: "send", payload: "movement hook attached" });
}

attachGodMode();
attachMovementHook();

rpc.exports = {
  setGodMode(enabled) {
    state.godMode = !!enabled;
    send({ type: "send", payload: `god mode: ${state.godMode}` });
  },
  setNoclip(enabled) {
    state.noclip = !!enabled;
    send({ type: "send", payload: `noclip: ${state.noclip}` });
  },
  setSpeed(multiplier) {
    state.speedMultiplier = Number(multiplier) || 1.0;
    send({ type: "send", payload: `speed: ${state.speedMultiplier.toFixed(2)}x` });
  },
  getState() {
    return state;
  },
};

send({ type: "send", payload: "agent ready" });
