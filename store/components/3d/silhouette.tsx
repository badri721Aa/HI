// STUB — owned by the 3D core builder.
import type { ModelKind } from "@/types";

/** 2D SVG silhouette of a model, used when WebGL is unavailable. */
export function ProductSilhouette({ className }: { kind: ModelKind; color?: string; className?: string }) {
  return <svg viewBox="0 0 100 100" className={className} aria-hidden="true" />;
}
