"use client";
// STUB — owned by the shell/motion builder.
export type SoundName = "tap" | "open" | "close" | "add" | "send" | "toggle" | "switch";

/** Plays a short synthesized UI sound if the visitor turned sounds on. Never throws. */
export function playSound(name: SoundName): void {
  void name;
}
