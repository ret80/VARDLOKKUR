/* createTestMap.ts — простая тестовая карта для отладки */

import { WorldData, Tl, Vec, idx } from "./types";

/** Создать тестовую карту SIZE×SIZE
 *  - Периметр: TREE (непроходимый, как лес)
 *  - Внутренняя полоса (1 клетка): FOREST (проходимый, как лес)
 *  - Центр: SNOW (открытая местность)
 *  - Spawn: центр карты
 */
export function createTestMap(
  size: number = 21,
  spawn: Vec = { x: Math.floor(size / 2) * 16 + 8, y: Math.floor(size / 2) * 16 + 8 }
): WorldData {
  const tiles = new Uint8Array(size * size);

  // Заполняем SNOW по умолчанию
  for (let i = 0; i < tiles.length; i++) {
    tiles[i] = Tl.SNOW;
  }

  // Педестал: 4 клетки влево от игрока (grid 6, 10)

  // Алтарь: центр по X (10), вверху карты ниже леса (y=2)
  tiles[idx({ W: size }, 10, 2)] = Tl.ALTAR;

  // Периметр: TREE (непроходимый)
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (x === 0 || x === size - 1 || y === 0 || y === size - 1) {
        tiles[idx({ W: size }, x, y)] = Tl.TREE;
      }
      // Внутренняя полоса: FOREST (проходимый)
      if (x === 1 || x === size - 2 || y === 1 || y === size - 2) {
        tiles[idx({ W: size }, x, y)] = Tl.FOREST;
      }
    }
  }

  // Строим простейший navmesh (все проходимые клетки связаны)
  const nav = createDummyNavMesh(size);

  // Debug test: add shrine, NPC, chest, enemy near spawn
  const testMap: WorldData = {
    W: size,
    H: size,
    tiles,
    nav,
    isDungeon: false,
    dungeonId: -1,
    dungeonName: "Тестовая Поляна",
    bossReward: null,
    spawn,
    zones: [{ x: 0, y: 0, w: size, h: size, name: "Тестовая Карта" }],
    shrines: [
      { x: 10, y: 9 },  // shrine one cell above player
    ],
    npcs: [
      { id: "test_npc_1", name: "Тестовый NPC", x: 12, y: 9 },
    ],
    chests: [
      { x: 12, y: 10, item: "key" },
    ],
    pedestals: [
      { x: 6, y: 10, guards: ["crawler", "draugr"] },
    ],
    spawns: [
      { x: 8, y: 8, kind: "crawler" },
      { x: 14, y: 14, kind: "crawler" },
    ],
    doors: [],
    souls: [],
    ambient: [],
    dungeonEntries: [],
    exitSpot: { x: spawn.x, y: spawn.y },
    hornSpot: { x: 0, y: 0 },
    meadSpot: { x: 0, y: 0 },
    oreSpot: { x: 0, y: 0 },
    bearSpot: { x: 0, y: 0 },
    mossSpot: { x: 0, y: 0 },
    amberSpot: { x: 0, y: 0 },
    flowerSpot: { x: 0, y: 0 },
    diarySpot: { x: 0, y: 0 },
    bundleSpot: { x: 0, y: 0 },
    relicSpot: { x: 0, y: 0 },
    oldAltar: { x: 0, y: 0 },
    stashSpot: { x: 0, y: 0 },
    ruinedVillage: { x: 0, y: 0 },
    treeAltar: { x: 10, y: 2 },  // алтарь в центре по X, вверху карты ниже леса
    noBarrier: true,
    arena: { x: 0, y: 0, r: 0 },
    snakeSpot: { x: 0, y: 0 },
    villageA: { x: 0, y: 0 },
    villageB: { x: 0, y: 0 },
    bossRoom: { x: 0, y: 0, w: 0, h: 0 },
    bossSpot: { x: 0, y: 0 },
    entryStairs: { x: 0, y: 0 },
    ruinedHouses: [],
  };
  return testMap;
}

/** Простейший navmesh — все проходимые клетки связаны */
function createDummyNavMesh(size: number): any {
  // Создаём простой массив навмеша
  // Каждая клетка — это node, связи по соседству
  const nodes: Array<{ x: number; y: number }> = [];
  const edges: Array<{ from: number; to: number }> = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Пропускаем непроходимые клетки (TREE)
      // Но для тестовой карты нам нужно, чтобы центр был проходимым
      // TREE на периметре — непроходим, FOREST и SNOW — проходимы
      const nodeIdx = nodes.length;
      nodes.push({ x, y });

      // Связи с соседями (вправо и вниз, чтобы не дублировать)
      if (x + 1 < size) {
        edges.push({ from: nodeIdx, to: nodes.length + 1 });
      }
      if (y + 1 < size) {
        edges.push({ from: nodeIdx, to: nodeIdx + size });
      }
    }
  }

  return { nodes, edges };
}
