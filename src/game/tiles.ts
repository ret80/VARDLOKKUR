/* tiles.ts — Цвета тайлов для миникарты (map-display.ts).
   Все texture-кэши и процедурная генерация перенесены в geometry/. */

import { Tl } from "./world";

/** Цвета тайлов для миникарты */
export const TILE_COLORS: Record<number, string> = {
  [Tl.WATER]: "#0a1620", [Tl.SHORE]: "#4a5a64", [Tl.SNOW]: "#8b98a6", [Tl.SNOW2]: "#7e8b99",
  [Tl.PATH]: "#55636e", [Tl.FOREST]: "#26333c", [Tl.TREE]: "#1c262e", [Tl.ROCK]: "#515d6a",
  [Tl.MTN]: "#5f6b78", [Tl.SWAMP]: "#2c3a3e", [Tl.POOL]: "#1b2a30", [Tl.VILLAGE]: "#635a4c",
  [Tl.PALISADE]: "#463626", [Tl.HOUSE]: "#3a322c", [Tl.RUINS]: "#4e5a68", [Tl.COLUMN]: "#5a6570",
  [Tl.CAVE]: "#2b3646", [Tl.CAVEWALL]: "#1a222c", [Tl.STAIRS]: "#39424e", [Tl.DFLOOR]: "#39424e",
  [Tl.DWALL]: "#10151c",   [Tl.ALTAR]: "#39424e",
};
