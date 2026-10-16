import { describe, expect, it } from "vitest";
import {
  DSide,
  DUNGEON_FLOOR,
  decodeWallCode,
  dungeonWallCodeAt,
  resolveDungeonTiles,
  wallTileCode,
} from "../dungeon-tiles";
import { Tl, type WorldData } from "../generators/types";

const S = DSide;

/** Коды уникальных тайлов из SVG/tile_set_d01.svg (t00..t18). */
const TILE_CODE = {
  t00: DUNGEON_FLOOR,
  t01: wallTileCode(S.Void, S.Wall, S.Wall, S.Void),
  t02: wallTileCode(S.Void, S.Wall, S.Floor, S.Wall),
  t03: wallTileCode(S.Void, S.Void, S.Wall, S.Wall),
  t04L: wallTileCode(S.Wall, S.Floor, S.Wall, S.Void),
  t04R: wallTileCode(S.Wall, S.Void, S.Wall, S.Floor),
  t05: wallTileCode(S.Wall, S.Wall, S.Wall, S.Void),
  t06: wallTileCode(S.Floor, S.Wall, S.Floor, S.Wall),
  t07: wallTileCode(S.Floor, S.Floor, S.Floor, S.Wall),
  t08: wallTileCode(S.Floor, S.Wall, S.Floor, S.Floor),
  t09: wallTileCode(S.Wall, S.Void, S.Wall, S.Wall),
  t10: wallTileCode(S.Wall, S.Wall, S.Void, S.Void),
  t11: wallTileCode(S.Floor, S.Wall, S.Void, S.Wall),
  t12: wallTileCode(S.Wall, S.Void, S.Void, S.Wall),
  t13: wallTileCode(S.Wall, S.Wall, S.Void, S.Wall),
  t14: wallTileCode(S.Floor, S.Floor, S.Wall, S.Floor),
  t15: wallTileCode(S.Void, S.Wall, S.Wall, S.Wall),
  t16: wallTileCode(S.Wall, S.Floor, S.Wall, S.Floor),
  t17: wallTileCode(S.Wall, S.Floor, S.Floor, S.Floor),
  t18: wallTileCode(S.Wall, S.Wall, S.Wall, S.Wall),
} as const;

type TileLabel = keyof typeof TILE_CODE;

/** Пример сборки 7×11 из SVG (строки — сверху вниз, столбцы — x=0..6). */
const EXAMPLE: TileLabel[][] = [
  "t01 t02 t02 t15 t02 t02 t03",
  "t04L t00 t00 t16 t00 t00 t04R",
  "t04L t00 t00 t17 t00 t00 t04R",
  "t04L t00 t00 t00 t00 t00 t04R",
  "t04L t00 t00 t14 t00 t00 t04R",
  "t04L t00 t08 t18 t07 t00 t04R",
  "t04L t00 t00 t17 t00 t00 t04R",
  "t04L t00 t00 t00 t00 t00 t04R",
  "t05 t06 t07 t00 t00 t08 t09",
  "t04L t00 t00 t14 t00 t00 t04R",
  "t10 t11 t11 t13 t11 t11 t12",
].map((row) => row.split(" ") as TileLabel[]);

const W = 7;
const H = 11;

/** Собрать карту 7×11: t00 → DFLOOR, остальное → DWALL. */
function makeExampleMap(): WorldData {
  const tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      tiles[y * W + x] = EXAMPLE[y][x] === "t00" ? Tl.DFLOOR : Tl.DWALL;
    }
  }
  return {
    W,
    H,
    tiles,
    dungeonWall: new Uint8Array(W * H),
    isDungeon: true,
    dungeonId: 0,
  } as unknown as WorldData;
}

describe("dungeon-tiles", () => {
  it("решает все 77 тайлов примера 7×11 ровно как в SVG", () => {
    const w = makeExampleMap();
    resolveDungeonTiles(w);
    const out = w.dungeonWall!;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const label = EXAMPLE[y][x];
        expect(out[y * W + x], `(${x},${y}) ${label}`).toBe(TILE_CODE[label]);
      }
    }
  });

  it("пол кодируется как DUNGEON_FLOOR, стена — как 0..53", () => {
    const w = makeExampleMap();
    resolveDungeonTiles(w);
    for (let i = 0; i < W * H; i++) {
      const code = w.dungeonWall![i];
      if (w.tiles[i] === Tl.DFLOOR) expect(code).toBe(DUNGEON_FLOOR);
      else expect(code).toBeLessThan(54);
    }
  });

  it("код стены покрывает все 54 комбинации N/E/W/юг", () => {
    const seen = new Set<number>();
    for (const n of [S.Wall, S.Floor, S.Void])
      for (const e of [S.Wall, S.Floor, S.Void])
        for (const w of [S.Wall, S.Floor, S.Void])
          for (const s of [S.Wall, S.Floor, S.Void]) seen.add(wallTileCode(n, e, s, w));
    expect(seen.size).toBe(54);
    for (const code of seen) {
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThan(54);
    }
  });

  it("decodeWallCode обратим по N/E/W и признаку открытого юга", () => {
    for (let code = 0; code < 54; code++) {
      const s = decodeWallCode(code);
      expect(wallTileCode(s.n, s.e, s.s, s.w)).toBe(code);
    }
  });

  it("t06 и t11 — один и тот же тайл (юг: пол или пустота неразличимы)", () => {
    expect(TILE_CODE.t06).toBe(TILE_CODE.t11);
  });

  it("dungeonWallCodeAt совпадает с resolveDungeonTiles для стен", () => {
    const w = makeExampleMap();
    const raw = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) raw[y * W + x] = dungeonWallCodeAt(w, x, y);
    }
    resolveDungeonTiles(w);
    for (let i = 0; i < W * H; i++) {
      if (w.tiles[i] === Tl.DWALL) expect(w.dungeonWall![i]).toBe(raw[i]);
    }
  });
});
