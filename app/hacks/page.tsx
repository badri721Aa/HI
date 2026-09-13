const hacks = [
  {
    game: 'Fortnite',
    tag: 'BR',
    items: [
      { name: 'ESP / Wallhack', desc: 'Entity list walker → world-to-screen projection. Draw boxes over player mesh bounds. Requires offset dumper after each update.' },
      { name: 'Aimbot', desc: 'Bone-based targeting. Scan entity list for closest bone (head or neck), calculate angle delta, apply smooth factor via SetCursorPos or WriteProcessMemory to camera angles.' },
      { name: 'No Recoil', desc: 'Read recoil pattern from memory, apply inverse offset to aim angles. Per-weapon tables.' },
    ],
  },
  {
    game: 'CS2',
    tag: 'FPS',
    items: [
      { name: 'Triggerbot', desc: 'Read crosshair entity ID from memory. When it matches a valid player entity, trigger mouse click. ~4ms reaction time.' },
      { name: 'Radar Hack', desc: 'Patch the radar visibility check in client memory. All enemies appear on minimap.' },
      { name: 'Bhop Script', desc: 'Read velocity and ground state. Jump exactly on ground-touch frame. Works on non-anticheat servers.' },
    ],
  },
  {
    game: 'Roblox',
    tag: 'LUA',
    items: [
      { name: 'Speed Hack', desc: 'Modify LocalPlayer.Character.Humanoid.WalkSpeed via executor script. Default 16 → set to 50+.' },
      { name: 'Fly Script', desc: 'Create BodyVelocity / BodyGyro parts, parent to HRP, control with keyboard binds.' },
      { name: 'Infinite Jump', desc: 'Hook UserInputService.JumpRequest, call Humanoid:ChangeState(Jumping) on each press regardless of grounded state.' },
    ],
  },
  {
    game: 'Minecraft',
    tag: 'Java',
    items: [
      { name: 'KillAura', desc: 'Fabric/Forge mod that automatically attacks nearest entity in range. Uses EntityLivingBase list, range check, and attack timer.' },
      { name: 'AutoClicker', desc: 'Simulate left-click at configurable CPS with randomized timing to evade detection.' },
      { name: 'X-Ray', desc: 'Texture pack method: make all non-ore blocks transparent. No client modification required — resource pack only.' },
    ],
  },
]

export default function HacksPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-20">
      <div className="mb-12">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Game Engineering</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Hacks & Trainers</h1>
        <p className="mt-2 text-sm text-zinc-500">Memory reading, overlays, script injection. Concepts only.</p>
      </div>

      <div className="space-y-12">
        {hacks.map(g => (
          <div key={g.game}>
            <div className="mb-5 flex items-center gap-3">
              <span className="font-nacelle text-sm font-semibold text-zinc-300">{g.game}</span>
              <span className="mono text-[9px] border border-zinc-800 text-zinc-600 rounded-md px-2 py-0.5">{g.tag}</span>
              <div className="h-px flex-1 bg-zinc-900" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map(item => (
                <div
                  key={item.name}
                  className="group glass-card rounded-2xl p-5 transition-all duration-200 ease-out hover:bg-zinc-800/60 hover:border-white/[0.1]"
                >
                  <h3 className="mb-2.5 mono text-sm font-semibold text-zinc-200 tracking-tight group-hover:text-zinc-100 transition-colors duration-200">
                    {item.name}
                  </h3>
                  <p className="text-xs text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors duration-200">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
