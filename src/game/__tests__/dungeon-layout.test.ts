import { describe, expect, it } from "vitest";
import {
  carveLayout,
  findBossOpenings,
  generateLayout,
  graphDistances,
  validateLayout,
  type LayoutOptions,
} from "../generators/dungeon-layout";
import { generateDungeon, DUNGEONS } from "../generators/dungeons";
import { isSolidTileId, Tl, idx } from "../generators/types";
import { floodReach } from "../generators/utils";
import { mulberry } from "../noise";

const W = 88;
const H = 60;
const OPTS: Partial<LayoutOptions> = {
  targetRooms: 14,
  minRooms: 8,
  margin: 3,
  padding: 2,
  corridorWidth: 2,
  mainWidth: 3,
  bossMinW: 16,
  bossMinH: 12,
};

/** Собрать карту из планировки (DWALL везде, пол по carveLayout). */
function buildMap(seed: number) {
  const rng = mulberry(seed);
  const layout = generateLayout(rng, W, H, OPTS);
  if (!layout) return null;
  const tiles = new Uint8Array(W * H).fill(Tl.DWALL);
  const carved = carveLayout(tiles, W, H, layout, rng, Tl.DFLOOR, OPTS);
  return { layout, tiles, carved };
}

// ============================================================
// Планировка (чистый модуль)
// ============================================================

describe("dungeon-layout", () => {
  it("детерминирована: одинаковый seed → одинаковая планировка", () => {
    const a = generateLayout(mulberry(12345), W, H, OPTS);
    const b = generateLayout(mulberry(12345), W, H, OPTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("комнаты в пределах карты и не пересекаются", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const layout = generateLayout(mulberry(seed), W, H, OPTS);
      expect(layout, `seed=${seed}`).not.toBeNull();
      const rooms = layout!.rooms;
      for (const r of rooms) {
        expect(r.x).toBeGreaterThanOrEqual(1);
        expect(r.y).toBeGreaterThanOrEqual(1);
        expect(r.x + r.w).toBeLessThanOrEqual(W - 1);
        expect(r.y + r.h).toBeLessThanOrEqual(H - 1);
      }
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i];
          const b = rooms[j];
          const disjoint = a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y;
          expect(disjoint, `seed=${seed} комнаты ${i}/${j}`).toBe(true);
        }
      }
    }
  });

  it("граф связен: все комнаты достижимы от входа", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const layout = generateLayout(mulberry(seed), W, H, OPTS)!;
      const dist = graphDistances(layout);
      for (let i = 0; i < layout.rooms.length; i++) {
        expect(dist[i], `seed=${seed} комната ${i}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("босс — тупик (ровно одно ребро) и далеко от входа", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const layout = generateLayout(mulberry(seed), W, H, OPTS)!;
      const bossEdges = layout.edges.filter((e) => e.a === layout.boss || e.b === layout.boss);
      expect(bossEdges.length, `seed=${seed}`).toBe(1);
      const dist = graphDistances(layout);
      expect(dist[layout.boss], `seed=${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("вырезанный пол связен, и у босса ровно один проход ширины 2", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const built = buildMap(seed);
      expect(built, `seed=${seed}`).not.toBeNull();
      const { layout, tiles, carved } = built!;
      const be = layout.edges.find((e) => e.a === layout.boss || e.b === layout.boss)!;
      const val = validateLayout(tiles, W, H, layout, Tl.DFLOOR, be.width);
      expect(val.unreachable, `seed=${seed}`).toBe(0);
      expect(val.bossOpenings, `seed=${seed}`).toBe(be.width);
      expect(carved.bossOpenings).toBe(be.width);
      expect(carved.bossEntrance).not.toBeNull();
    }
  });
});

// ============================================================
// Интеграция: generateDungeon (Склеп)
// ============================================================

describe("generateDungeon (Склеп, id 0)", () => {
  const cfg = DUNGEONS[0];
  const exitSpot = { x: 100, y: 100 };

  it("детерминирована: одинаковый seed → одинаковая карта", () => {
    const a = generateDungeon(777, cfg, exitSpot);
    const b = generateDungeon(777, cfg, exitSpot);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
  });

  it("инварианты выполняются для 12 сидов", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = generateDungeon(seed * 101 + 7, cfg, exitSpot);
      const tag = `seed=${seed}`;

      expect(w.W, tag).toBe(W);
      expect(w.H, tag).toBe(H);

      // Спавн и лестница на проходимом тайле
      const sxi = Math.floor(w.spawn.x / 16);
      const syi = Math.floor(w.spawn.y / 16);
      expect(isSolidTileId(w.tiles[idx(w, sxi, syi)]), `${tag} spawn`).toBe(false);
      expect(w.tiles[idx(w, w.entryStairs.x / 16 | 0, w.entryStairs.y / 16 | 0)], `${tag} stairs`).toBe(Tl.STAIRS);

      // Комната босса в пределах карты, центр — пол
      const br = w.bossRoom;
      expect(br.x, tag).toBeGreaterThanOrEqual(0);
      expect(br.x + br.w, tag).toBeLessThanOrEqual(W * 16);
      expect(br.y + br.h, tag).toBeLessThanOrEqual(H * 16);
      expect(w.tiles[idx(w, Math.floor(w.bossSpot.x / 16), Math.floor(w.bossSpot.y / 16))], `${tag} bossSpot`).toBe(Tl.DFLOOR);

      // Ровно одна дверь
      expect(w.doors.length, tag).toBe(1);

      // Ровно один проход в арену босса (ширина 2 = базовая)
      const bossTiles = {
        x: br.x / 16, y: br.y / 16, w: br.w / 16, h: br.h / 16, cx: 0, cy: 0,
        shape: "rect" as const, kind: "boss" as const,
      };
      const openings = findBossOpenings(w.tiles, W, H, bossTiles, Tl.DFLOOR);
      expect(openings.length, `${tag} проход`).toBe(2);

      // Направление двери соответствует стороне проёма в стене арены.
      const o = openings[0];
      const btx = br.x / 16, bty = br.y / 16, btw = br.w / 16, bth = br.h / 16;
      const side = o.y < bty ? "up" : o.y >= bty + bth ? "down" : o.x < btx ? "left" : "right";
      expect(w.doors[0].dir ?? "down", `${tag} направление двери`).toBe(side);

      // Ключ есть и находится в отдельном сундуке
      expect(w.chests.some((c) => c.item === "key"), `${tag} ключ`).toBe(true);

      // Пол связен: от спавна достижимы и ключ, и комната босса
      const reach = floodReach(w, sxi, syi);
      const key = w.chests.find((c) => c.item === "key")!;
      expect(reach[idx(w, key.x, key.y)], `${tag} ключ достижим`).toBe(1);
      expect(reach[idx(w, Math.floor(w.bossSpot.x / 16), Math.floor(w.bossSpot.y / 16))], `${tag} босс достижим`).toBe(1);

      // Враги присутствуют
      expect(w.spawns.length, `${tag} спавны`).toBeGreaterThan(0);
    }
  });
});
