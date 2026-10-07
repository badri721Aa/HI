"use client";
// STUB — owned by the 3D scenes builder.
/** progress 0–1: model (wireframe) → slice (contours) → print (rising clip) → finish. */
export function ProcessScene({ className }: { progress: { get(): number }; className?: string }) {
  return <div className={className} />;
}
