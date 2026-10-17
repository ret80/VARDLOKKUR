/* overworld-spawn.test.ts — стартовая позиция игрока: рядом с Эйриком и на свободной клетке */
import { describe, it, expect } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { isSolidTileId, idx, Tl, type WorldData } from "../generators/types";

/** Кто занимает клетку (или null, если клетка свободна) */
function occupantOf(w: WorldData, tx: number, ty: number): string | null {
  for (const n of w.npcs) if (n.x === tx && n.y === ty) return `npc:${n.id}`;
  for (const c of w.chests) if (c.x === tx && c.y === ty) return "chest";
  for (const s of w.shrines) if (s.x === tx && s.y === ty) return "shrine";
  for (const p of w.pedestals) if (p.x === tx && p.y === ty) return "pedestal";
  for (const s of w.souls) if (s.x === tx && s.y === ty) return "soul";
  for (const e of w.dungeonEntries) if (e.x === tx && e.y === ty) return "dungeonEntry";
  // Спавны врагов хранятся в пикселях
  for (const sp of w.spawns) {
    if (Math.floor(sp.x / 16) === tx && Math.floor(sp.y / 16) === ty) return `enemy:${sp.kind}`;
  }
  for (const a of w.ambient) {
    if (Math.floor(a.x / 16) === tx && Math.floor(a.y / 16) === ty) return `ambient:${a.kind}`;
  }
  const spots: [string, { x: number; y: number }][] = [
    ["bundleSpot", w.bundleSpot], ["bearSpot", w.bearSpot], ["hornSpot", w.hornSpot],
    ["meadSpot", w.meadSpot], ["oreSpot", w.oreSpot], ["mossSpot", w.mossSpot],
    ["amberSpot", w.amberSpot], ["flowerSpot", w.flowerSpot], ["diarySpot", w.diarySpot],
    ["relicSpot", w.relicSpot], ["oldAltar", w.oldAltar], ["stashSpot", w.stashSpot],
  ];
  for (const [name, s] of spots) {
    if (s && s.x === tx && s.y === ty) return name;
  }
  return null;
}

describe("overworld: стартовая позиция игрока", () => {
  it(
    "рядом с Эйриком и никогда не на занятой клетке",
    { timeout: 180000 },
    () => {
      for (let seed = 1; seed <= 60; seed++) {
        const w = generateOverworld(seed);
        const tx = Math.floor(w.spawn.x / 16);
        const ty = Math.floor(w.spawn.y / 16);

        const eirik = w.npcs.find((n) => n.id === "eirik");
        expect(eirik, `seed=${seed}: Эйрик должен существовать`).toBeTruthy();
        if (!eirik) continue;

        // 1. Спавн рядом с Эйриком (кольцо 1..4), но не на его клетке
        const dist = Math.max(Math.abs(eirik.x - tx), Math.abs(eirik.y - ty));
        expect(dist, `seed=${seed}: клетка спавна (${tx},${ty}) рядом с Эйриком (${eirik.x},${eirik.y})`).toBeGreaterThan(0);
        expect(dist, `seed=${seed}: клетка спавна (${tx},${ty}) рядом с Эйриком (${eirik.x},${eirik.y})`).toBeLessThanOrEqual(4);

        // 2. Клетка проходима
        const t = w.tiles[idx(w, tx, ty)];
        expect(isSolidTileId(t), `seed=${seed}: клетка спавна (${tx},${ty}) не должна быть твёрдой (tile=${t})`).toBe(false);
        expect(t, `seed=${seed}: клетка спавна (${tx},${ty}) не должна быть болотом`).not.toBe(Tl.POOL);

        // 3. Клетка не занята объектами, NPC или врагами
        const occupant = occupantOf(w, tx, ty);
        expect(occupant, `seed=${seed}: клетка спавна (${tx},${ty}) должна быть свободна`).toBeNull();
      }
    }
  );
});
