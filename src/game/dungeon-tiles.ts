/* dungeon-tiles.ts — автотайлинг стен подземелья (DWALL 2.5D).
 *
 * Чистая логика (без зависимостей от рендерера): по окружению тайла выбирается
 * код тайла стены. Правило из SVG/tile_set_d01.svg:
 *   сторона = f(сосед): стена → нейтрально, пол → кант, пустота → контур;
 *   юг открыт (пол ИЛИ пустота) → фасад-кирпич.
 *
 * Код тайла: 0..53 — стена, DUNGEON_FLOOR — пол.
 *   N/E/W кодируются в базе 3 (Wall=0, Floor=1, Void=2),
 *   признак «юг открыт» — младший бит.
 *
 * Модуль используется как генерацией (resolveDungeonTiles заполняет
 * WorldData.dungeonWall), так и отрисовкой (drawDungeonWall).
 */

import { isSolidTileId, type WorldData } from "./generators/types";

/** Класс соседа стены для автотайлинга */
export enum DSide {
  /** Сосед — стена (нейтральный стык, без канта) */
  Wall = 0,
  /** Сосед — проходимый пол (светлый кант) */
  Floor = 1,
  /** За границей карты — пустота (тёмный контур) */
  Void = 2,
}

/** Значение dungeonWall для тайла-пола (не стена) */
export const DUNGEON_FLOOR = 255;

/** Классифицировать соседний тайл для автотайлинга стены */
export function dungeonSideKind(
  tiles: Uint8Array,
  W: number,
  H: number,
  x: number,
  y: number,
): DSide {
  if (x < 0 || y < 0 || x >= W || y >= H) return DSide.Void;
  return isSolidTileId(tiles[y * W + x]) ? DSide.Wall : DSide.Floor;
}

/**
 * Вычислить код тайла стены по классам четырёх соседей.
 * Юг: Wall → 0 (не открыт), Floor/Void → 1 (открыт → фасад).
 * Диапазон: 0..53.
 */
export function wallTileCode(n: DSide, e: DSide, s: DSide, w: DSide): number {
  const sOpen = s === DSide.Wall ? 0 : 1;
  return (((n * 3 + e) * 3 + w) << 1) | sOpen;
}

/** Разбор кода тайла стены (юг восстанавливается как Floor/Void → Wall) */
export interface DungeonWallSides {
  n: DSide;
  e: DSide;
  s: DSide;
  w: DSide;
}

export function decodeWallCode(code: number): DungeonWallSides {
  const sOpen = code & 1;
  let q = code >> 1;
  const w = q % 3;
  q = (q - w) / 3;
  const e = q % 3;
  q = (q - e) / 3;
  const n = q;
  return {
    n: n as DSide,
    e: e as DSide,
    w: w as DSide,
    s: sOpen ? DSide.Floor : DSide.Wall,
  };
}

/** Код тайла стены для позиции (x, y) карты (по текущим tiles) */
export function dungeonWallCodeAt(map: WorldData, x: number, y: number): number {
  const { W, H, tiles } = map;
  return wallTileCode(
    dungeonSideKind(tiles, W, H, x, y - 1),
    dungeonSideKind(tiles, W, H, x + 1, y),
    dungeonSideKind(tiles, W, H, x, y + 1),
    dungeonSideKind(tiles, W, H, x - 1, y),
  );
}

/**
 * Заполнить WorldData.dungeonWall кодами тайлов по финальным tiles.
 * Вызывается генератором в конце (finalizeDungeon) — до построения навигации.
 * Пол → DUNGEON_FLOOR, стена (солид) → 0..53.
 */
export function resolveDungeonTiles(w: WorldData): void {
  const { W, H } = w;
  const out =
    w.dungeonWall && w.dungeonWall.length === W * H
      ? w.dungeonWall
      : (w.dungeonWall = new Uint8Array(W * H));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isSolidTileId(w.tiles[i])) {
        out[i] = DUNGEON_FLOOR;
        continue;
      }
      out[i] = dungeonWallCodeAt(w, x, y);
    }
  }
}
