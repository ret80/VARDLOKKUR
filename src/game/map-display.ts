/* map-display.ts — Отрисовка мини-карты и большой карты.
   Не знает про процедурные текстуры тайлов — только рендеринг карт. */

import { T, WorldData } from "./world";
import { TILE_COLORS } from "./tiles";

/* ================== buildMinimapBase ================== */

export function buildMinimapBase(map: WorldData): ImageData {
  const c = document.createElement("canvas");
  c.width = map.W * 2; c.height = map.H * 2;
  const cx = c.getContext("2d")!;
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    cx.fillStyle = TILE_COLORS[map.tiles[y * map.W + x]] ?? "#10151c";
    cx.fillRect(x * 2, y * 2, 2, 2);
  }
  return cx.getImageData(0, 0, c.width, c.height);
}

/* ================== drawMinimap ================== */

export interface MinimapOverlays {
  shrines: { x: number; y: number }[];
  player: { x: number; y: number };
  target: { x: number; y: number } | null;
  secretKnown: boolean;
  stashSpot: { x: number; y: number };
  nornsFavor: boolean;
  pedestals: { x: number; y: number; taken: boolean }[];
  map: WorldData;
  realT: number;
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  base: ImageData,
  o: MinimapOverlays
) {
  const c = ctx.canvas;
  if (c.width !== base.width || c.height !== base.height) {
    c.width = base.width; c.height = base.height;
  }
  ctx.putImageData(base, 0, 0);
  ctx.fillStyle = "#8fd8e8";
  for (const s of o.shrines) ctx.fillRect(s.x / T * 2 - 1, s.y / T * 2 - 1, 2, 2);
  if (o.secretKnown && !o.map.isDungeon) {
    ctx.fillStyle = "#c9a24b";
    ctx.fillRect(o.stashSpot.x * 2 - 1, o.stashSpot.y * 2 - 1, 3, 3);
  }
  if (o.nornsFavor && !o.map.isDungeon) {
    ctx.fillStyle = "#63d8c8";
    for (const p of o.pedestals) if (!p.taken) ctx.fillRect(p.x / T * 2 - 1, p.y / T * 2 - 1, 2, 2);
  }
  const tgt = o.target;
  if (tgt && Math.floor(o.realT * 3) % 2 === 0) {
    ctx.fillStyle = "#e8c979";
    ctx.fillRect(tgt.x / T * 2 - 1.5, tgt.y / T * 2 - 1.5, 3, 3);
  }
  ctx.fillStyle = "#f4f8fc";
  ctx.fillRect(o.player.x / T * 2 - 1, o.player.y / T * 2 - 1, 3, 3);
}

/* ================== buildBigMapBase ================== */

export function buildBigMapBase(map: WorldData): ImageData {
  const scale = Math.min(560 / (map.W * 2), 420 / (map.H * 2)) * 2;
  const c = document.createElement("canvas");
  c.width = Math.round(map.W * scale);
  c.height = Math.round(map.H * scale);
  const cx = c.getContext("2d")!;
  cx.imageSmoothingEnabled = false;
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    cx.fillStyle = TILE_COLORS[map.tiles[y * map.W + x]] ?? "#10151c";
    cx.fillRect(x * scale, y * scale, scale, scale);
  }
  return cx.getImageData(0, 0, c.width, c.height);
}

/* ================== drawBigMap ================== */

export interface BigMapOverlays {
  shrines: { x: number; y: number }[];
  map: WorldData;
  dungeonBossDead: (id: number) => boolean;
  bossRoom: { x: number; y: number; w: number; h: number };
  bossSpot: { x: number; y: number };
  dungeonId: number;
  player: { x: number; y: number };
  target: { x: number; y: number } | null;
  secretKnown: boolean;
  stashSpot: { x: number; y: number };
  pedestals: { x: number; y: number; taken: boolean }[];
  dungeonEntries: { x: number; y: number; id: number }[];
  treeAltar: { x: number; y: number };
}

export function drawBigMap(
  ctx: CanvasRenderingContext2D,
  base: ImageData,
  scale: number,
  o: BigMapOverlays
) {
  const c = ctx.canvas;
  c.width = Math.round(o.map.W * scale);
  c.height = Math.round(o.map.H * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(base, 0, 0);
  const dot = (wx: number, wy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(wx / T * scale, wy / T * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const s of o.shrines) dot(s.x * T + 8, s.y * T + 8, 3, "#8fd8e8");
  if (!o.map.isDungeon) {
    for (const en of o.dungeonEntries) {
      const done = o.dungeonBossDead(en.id);
      dot(en.x * T + 8, en.y * T + 8, 5, done ? "#3d5a66" : "#c9a24b");
    }
    dot(o.treeAltar.x * T + 8, o.treeAltar.y * T + 8, 5, "#63d8c8");
    for (const p of o.pedestals) if (!p.taken) dot(p.x, p.y, 3, "#63d8c8");
    if (o.secretKnown) dot(o.stashSpot.x * T + 8, o.stashSpot.y * T + 8, 4, "#c9a24b");
  } else if (!o.dungeonBossDead(o.dungeonId)) {
    dot(o.bossRoom.x + o.bossRoom.w / 2, o.bossRoom.y + o.bossRoom.h / 2, 5, "#e05050");
  }
  const tgt = o.target;
  if (tgt) dot(tgt.x, tgt.y, 4, "#e8c979");
  dot(o.player.x, o.player.y, 4, "#f4f8fc");
}
