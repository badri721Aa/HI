"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { usePrefs } from "@/lib/store/prefs";
import { playSound, useSoundEnabled } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Turns the synthesized interface sounds on or off (off by default; persisted). */
export function SoundToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const on = useSoundEnabled();
  const setSound = usePrefs((s) => s.setSound);
  const Icon = on ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      // Constant name + pressed state: "Turn interface sounds on, pressed" reads as on.
      aria-label={t.common.actions.soundOn}
      aria-pressed={on}
      title={on ? t.common.actions.soundOff : t.common.actions.soundOn}
      onClick={() => {
        setSound(!on);
        // Confirms the new state audibly (only plays once sound is on).
        if (!on) playSound("toggle");
      }}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full transition-colors duration-300 hover:bg-white/[0.04]",
        on ? "text-fg" : "text-fg-muted hover:text-fg",
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={1.5} className="size-5" />
    </button>
  );
}
