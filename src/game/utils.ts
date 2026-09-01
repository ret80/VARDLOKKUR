/* ============ COMMON UTILITIES ============ */

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/** Tile coordinate → pixel center (T=16) */
export function px(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * 16 + 8, y: ty * 16 + 8 };
}
