/* Общие помощники для тестов генерации оверворлда */
import { Edge, Tl, idx, inB, isSolidTileId, type WorldData, type Vec } from "../generators/types";

export const NB: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Достижима ли точка p (или любая её 4-соседка) в карте достижимости reach */
export function reachedNear(w: WorldData, reach: Uint8Array, p: Vec): boolean {
  if (inB(w, p.x, p.y) && reach[idx(w, p.x, p.y)]) return true;
  for (const [dx, dy] of NB) {
    const nx = p.x + dx, ny = p.y + dy;
    if (inB(w, nx, ny) && reach[idx(w, nx, ny)]) return true;
  }
  return false;
}

/** Сколько «полос» наружу от ворот полностью проходимо (0..2) */
export function gateOpenRows(w: WorldData, g: { x: number; y: number; edge: Edge }): number {
  const n = g.edge === Edge.North ? { x: 0, y: -1 }
    : g.edge === Edge.East ? { x: 1, y: 0 }
      : g.edge === Edge.South ? { x: 0, y: 1 } : { x: -1, y: 0 };
  const col: [number, number][] = (g.edge === Edge.North || g.edge === Edge.South)
    ? [[g.x, g.y], [g.x + 1, g.y]]
    : [[g.x, g.y], [g.x, g.y + 1]];
  let open = 0;
  for (let step = 1; step <= 2; step++) {
    let ok = true;
    for (const [bx, by] of col) {
      const x = bx + n.x * step, y = by + n.y * step;
      if (!inB(w, x, y)) { ok = false; continue; }
      const t = w.tiles[idx(w, x, y)];
      if (isSolidTileId(t) || t === Tl.WATER || t === Tl.SHORE) ok = false;
    }
    if (ok) open++;
  }
  return open;
}

/** Пустой оверворлд-подобный мир (для юнит-тестов дорог) */
export function emptyWorld(W: number, H: number, floor: number = Tl.SNOW): WorldData {
  const zero: Vec = { x: 0, y: 0 };
  return {
    W, H, tiles: new Uint8Array(W * H).fill(floor),
    nav: null as unknown as WorldData["nav"],
    isDungeon: false, dungeonId: -1, dungeonName: "", bossReward: null,
    spawn: { ...zero }, zones: [], shrines: [], npcs: [], chests: [], pedestals: [],
    spawns: [], doors: [], souls: [], ambient: [], dungeonEntries: [],
    exitSpot: { ...zero }, hornSpot: { ...zero }, meadSpot: { ...zero }, oreSpot: { ...zero },
    bearSpot: { ...zero }, mossSpot: { ...zero }, amberSpot: { ...zero }, flowerSpot: { ...zero },
    diarySpot: { ...zero }, bundleSpot: { ...zero }, relicSpot: { ...zero }, oldAltar: { ...zero },
    stashSpot: { ...zero }, ruinedVillage: { ...zero }, treeAltar: { ...zero },
    arena: { x: 0, y: 0, r: 0 }, snakeSpot: { ...zero }, villageA: { ...zero }, villageB: { ...zero },
    bossRoom: { x: 0, y: 0, w: 0, h: 0 }, bossSpot: { ...zero }, entryStairs: { ...zero },
    ruinedHouses: [],
  };
}
