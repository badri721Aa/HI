const hacks = [
  {
    game: 'Fortnite',
    tag: 'BR',
    items: [
      { name: 'ESP / Wallhack', desc: 'Entity list walker → world-to-screen projection. Draw boxes over player mesh bounds. Requires offset dumper after each update.' },
      { name: 'Aimbot', desc: 'Bone-based targeting. Scan entity list for closest bone (usually head or neck), calculate angle delta, apply smooth factor via SetCursorPos or WriteProcessMemory to camera angles.' },
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
    <div className="min-h-screen pt-14 max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="mono text-[10px] tracking-widest text-white/20 uppercase mb-1">game engineering</div>
        <h1 className="text-2xl font-light text-white">Hacks & Trainers</h1>
        <p className="text-xs text-white/30 mt-1">Memory reading, overlays, script injection. Concepts only.</p>
      </div>

      <div className="space-y-8">
        {hacks.map(g => (
          <div key={g.game}>
            <div className="flex items-center gap-3 mb-3">
              <div className="mono text-[10px] tracking-widest text-white/25 uppercase">{g.game}</div>
              <div className="mono text-[9px] text-white/20 border border-white/10 rounded px-1.5 py-0.5">{g.tag}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map(item => (
                <div key={item.name} className="glass rounded-2xl p-5 border border-white/8 hover:border-white/15 transition-all duration-300 hover:bg-white/6">
                  <div className="text-sm font-medium text-white/85 mb-2 mono">{item.name}</div>
                  <div className="text-xs text-white/40 leading-relaxed">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
