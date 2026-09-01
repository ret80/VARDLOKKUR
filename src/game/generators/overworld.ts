/* Генерация overworld — оркестратор, собирающий всё вместе */
import { mulberry, NoiseGenerator } from "../noise";
import { clamp, px } from "../utils";
import { WorldData, Vec, Tl, NpcDef, EnemyKind, Edge, HouseDef, isSolidTileId, VillageResult, idx, inB } from "./types";
import { IslandGenerator } from "./island-generator";
import { VillageGenerator } from "./village-generator";
import { GlobalRoadGenerator } from "./global-road-generator";
import { NavBuilder } from "./nav-builder";
import { findWalkableNear, clearAround, findFree, floodReach, setTile, tileAt } from "./utils";

function kindsFor(t: number, d: number, R1: number): EnemyKind[] {
  if (d < R1 + 2) return ["frost", "varg", "frost"];
  switch (t) {
    case Tl.FOREST: return ["shroom", "raven", "draugr"];
    case Tl.MTN: return ["frost", "varg", "draugr"];
    case Tl.SWAMP: return ["crawler", "draugr", "crawler"];
    case Tl.RUINS: return ["draugr", "frost", "crawler"];
    default: return ["varg", "raven", "draugr"];
  }
}

export function generateOverworld(seed: number): WorldData {
  const rng = mulberry(seed);
  const W = 200, H = 140;

  // 1. Остров
  const islandGen = new IslandGenerator(seed);
  const { w: baseWorld, cx, cy, R1, R2, ruinsC } = islandGen.generate();
  const w = baseWorld;

  // 2. Поселения
  const villageGen = new VillageGenerator(rng);
  const vA: VillageResult = villageGen.generate(w, 92 + Math.floor(rng() * 5), 96, 15, 12);
  const vB: VillageResult = villageGen.generate(w, 146 + Math.floor(rng() * 4), 58, 13, 11);
  const vR: VillageResult = villageGen.generate(w, 38 + Math.floor(rng() * 4), 56, 11, 9);
  
  // Разрушаем сожжённую деревню
  w.ruinedHouses = [];
  for (const h of vR.houses) {
    if (rng() < 0.4) {
      for (let y = h.y; y < h.y + h.h; y++)
        for (let x = h.x; x < h.x + h.w; x++)
          setTile(w, x, y, rng() < 0.5 ? Tl.COLUMN : Tl.RUINS);
    } else {
      w.ruinedHouses.push({ x: h.x, y: h.y, w: h.w, h: h.h });
    }
  }
  for (let y = vR.y0; y <= vR.y1; y++) {
    for (let x = vR.x0; x <= vR.x1; x++) {
      if (!inB(w, x, y)) continue;
      if (w.tiles[y * w.W + x] === Tl.PALISADE && rng() < 0.4)
        setTile(w, x, y, rng() < 0.5 ? Tl.COLUMN : Tl.RUINS);
    }
  }

  w.villageA = vA.gate;
  w.villageB = vB.gate;
  w.ruinedVillage = { x: vR.x0 + 5, y: vR.y0 + 4 };

  // --- Святилища на площадях ---
  w.shrines.push({ x: vA.plazaCenter.x, y: vA.plazaCenter.y });
  w.shrines.push({ x: vB.plazaCenter.x, y: vB.plazaCenter.y });
  setTile(w, vR.plazaCenter.x, vR.plazaCenter.y, Tl.COLUMN);

  // 3. Глобальные дороги
  const roadGen = new GlobalRoadGenerator(rng);
  const gate = vA.gate;

  const treeAltar = { x: 100, y: 24 };
  clearAround(w, treeAltar.x, treeAltar.y + 3, 6, Tl.SNOW2);
  setTile(w, treeAltar.x, treeAltar.y, Tl.ALTAR);
  w.treeAltar = treeAltar;
  w.arena = { x: treeAltar.x * 16 + 8, y: (treeAltar.y + 3) * 16 + 8, r: 84 };
  w.snakeSpot = { x: treeAltar.x * 16 + 8, y: (treeAltar.y + 2) * 16 };

  const dungeonEntries: { x: number; y: number; id: number; name: string }[] = [];
  const mkEntry = (fx: number, fy: number, pref: number, id: number, name: string) => {
    const p = findFree(w, fx, fy, 9, pref, rng);
    setTile(w, p.x, p.y, Tl.STAIRS);
    clearAround(w, p.x, p.y, 1);
    dungeonEntries.push({ x: p.x, y: p.y, id, name });
    return p;
  };
  mkEntry(cx + 6, cy + 2, Tl.MTN, 2, "Каменная Крепость");
  mkEntry(cx - R1 - 10, cy + 6, Tl.FOREST, 1, "Корень Иггдрасиля");
  mkEntry(ruinsC.x, ruinsC.y, Tl.RUINS, 0, "Склеп Хранителя");
  w.dungeonEntries = dungeonEntries;

  roadGen.buildRoad(w, gate, vB.gate);
  roadGen.buildRoad(w, gate, { x: treeAltar.x, y: treeAltar.y + 8 });
  for (const e of dungeonEntries) roadGen.buildRoad(w, gate, { x: e.x, y: e.y });
  roadGen.buildRoad(w, gate, { x: vR.gate.x, y: vR.gate.y });
  roadGen.buildRoad(w, gate, { x: ruinsC.x, y: ruinsC.y });

  // 4. NPC и жители
  const allNpcs: NpcDef[] = [];
  const addNpc = (id: string, name: string, x: number, y: number) => {
    allNpcs.push({ id, name, x, y });
    clearAround(w, x, y, 1);
  };

  // --- Поселение выживших (vA) ---
  {
    const cx2 = Math.round((vA.x0 + vA.x1) / 2);
    const cy2 = Math.round((vA.y0 + vA.y1) / 2);
    const p = findWalkableNear(w, cx2, cy2, 4, rng);
    addNpc("eirik", "Эйрик Старший", p.x, p.y);
  }
  {
    const ex = vA.x1 - 3;
    const ey = Math.round((vA.y0 + vA.y1) / 2);
    const p = findWalkableNear(w, ex, ey, 3, rng);
    addNpc("astrid", "Астрид", p.x, p.y);
  }
  {
    const hx = Math.round((vA.x0 + vA.x1) / 2);
    const hy = vA.y1 - 2;
    const p = findWalkableNear(w, hx, hy, 3, rng);
    addNpc("harald", "Харальд", p.x, p.y);
  }

  // --- Воронья Гавань (vB) ---
  {
    const sx = Math.round((vB.x0 + vB.x1) / 2);
    const sy = vB.y0 + 2;
    const p = findWalkableNear(w, sx, sy, 3, rng);
    addNpc("sigrid", "Сигрид", p.x, p.y);
  }
  {
    const bx = vB.x0 + 2;
    const by = Math.round((vB.y0 + vB.y1) / 2);
    const p = findWalkableNear(w, bx, by, 3, rng);
    addNpc("brand", "Бранд", p.x, p.y);
  }

  // --- Сожжённая Деревня (vR) ---
  {
    const rx = vR.x0 + Math.round((vR.x1 - vR.x0) / 2);
    const ry = vR.y0 + 2;
    const p = findWalkableNear(w, rx, ry, 3, rng);
    addNpc("refugee", "Беженка Гюнн", p.x, p.y);
  }

  // --- Мёртвый Лес ---
  {
    const forestCX = Math.round(cx - R1 - 14);
    const forestCY = Math.round(cy - 14);
    const p = findWalkableNear(w, forestCX, forestCY, 8, rng);
    addNpc("shaman", "Шаман Ульв", p.x, p.y);
  }

  // --- Перекрёсток дорог ---
  {
    const midX = Math.round((vA.gate.x + vB.gate.x) / 2);
    const midY = Math.round((vA.gate.y + vB.gate.y) / 2);
    const p = findWalkableNear(w, midX, midY, 6, rng);
    addNpc("merchant", "Торговец Фьолнир", p.x, p.y);
  }

  // --- Корни Иггдрасиля ---
  {
    const dtx = treeAltar.x;
    const dty = treeAltar.y + 4;
    const p = findWalkableNear(w, dtx, dty, 4, rng);
    addNpc("daughter", "Безымянная Дочь", p.x, p.y);
  }

  // --- Руины Времени ---
  {
    const rtx = ruinsC.x;
    const rty = ruinsC.y - 3;
    const p = findWalkableNear(w, rtx, rty, 6, rng);
    addNpc("raven", "Ворон-Говорун", p.x, p.y);
  }

  // --- Статисты ---
  for (let i = 0; i < Math.min(3, vA.residentSpots.length); i++) {
    const pos = vA.residentSpots[i];
    allNpcs.push({ id: `villager_A_${i}`, name: "Поселенец", x: pos.x, y: pos.y });
  }
  for (let i = 0; i < Math.min(3, vB.residentSpots.length); i++) {
    const pos = vB.residentSpots[i];
    allNpcs.push({ id: `villager_B_${i}`, name: "Поселенец", x: pos.x, y: pos.y });
  }
  w.npcs = allNpcs;

  // Остальные элементы
  const midRoad = { x: Math.round((vA.gate.x + vB.gate.x) / 2), y: Math.round((vA.gate.y + vB.gate.y) / 2) };
  w.bundleSpot = findFree(w, midRoad.x, midRoad.y, 4, undefined, rng);

  const shrineSpots: Vec[] = [
    { x: vA.x0 - 3, y: vA.y1 - 2 },
    findFree(w, cx - R1 - 8, cy - 10, 6, undefined, rng),
    findFree(w, cx + R1 + 8, cy - 6, 6, undefined, rng),
    { x: vB.x0 - 3, y: vB.y1 },
  ];
  for (const s of shrineSpots) {
    clearAround(w, s.x, s.y, 1);
    w.shrines.push({ x: s.x, y: s.y });
  }

  w.bearSpot = findFree(w, cx + R2 + 6, cy + 14, 8, Tl.SWAMP, rng);
  setTile(w, w.bearSpot.x, w.bearSpot.y, Tl.POOL);
  w.hornSpot = findFree(w, cx + 10, cy - 8, 9, Tl.MTN, rng);
  w.meadSpot = findFree(w, cx - R1 - 14, cy - 6, 9, Tl.FOREST, rng);
  w.oreSpot = findFree(w, cx - 8, cy + 8, 9, Tl.MTN, rng);
  w.mossSpot = findFree(w, cx + R2 + 4, cy + 4, 8, Tl.SWAMP, rng);
  w.amberSpot = findFree(w, cx + 14, cy + 8, 9, Tl.MTN, rng);
  w.flowerSpot = findFree(w, ruinsC.x + 6, ruinsC.y - 4, 8, Tl.RUINS, rng);
  w.diarySpot = { x: vR.x0 + 2 + Math.floor(rng() * 6), y: vR.y0 + 2 + Math.floor(rng() * 4) };
  setTile(w, w.diarySpot.x, w.diarySpot.y, Tl.RUINS);
  w.relicSpot = findFree(w, 44, 50, 9, undefined, rng);
  w.oldAltar = findFree(w, w.relicSpot.x + 7, w.relicSpot.y + 3, 5, undefined, rng);
  setTile(w, w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  w.stashSpot = findFree(w, ruinsC.x - 4, ruinsC.y + 5, 6, undefined, rng);

  // Сундуки
  const bowSpot = findFree(w, cx - R1 - 8, cy + 12, 9, Tl.FOREST, rng);
  const arrowsSpot = findFree(w, cx + 6, cy - 12, 9, Tl.MTN, rng);
  const heartSpot = findFree(w, cx + R2 + 8, cy + 2, 9, undefined, rng);
  w.chests = [
    { x: bowSpot.x, y: bowSpot.y, item: "bow" },
    { x: arrowsSpot.x, y: arrowsSpot.y, item: "arrows" },
    { x: heartSpot.x, y: heartSpot.y, item: "heartPiece" },
  ];

  // Души
  const soulSpots = [
    findFree(w, cx - R2 - 6, cy + 12, 5, undefined, rng),
    findFree(w, cx + R2 + 10, cy - 10, 5, undefined, rng),
    { x: ruinsC.x - 8, y: ruinsC.y - 6 },
  ];
  w.souls = soulSpots;

  // Колонны в руинах
  for (let i = 0; i < 10; i++) {
    const p = findFree(w, ruinsC.x, ruinsC.y, 8, Tl.RUINS, rng);
    setTile(w, p.x, p.y, Tl.COLUMN);
  }

  // Пьедесталы
  const guardPool: EnemyKind[][] = [
    ["draugr", "raven"], ["varg", "varg"], ["draugr", "shroom"],
    ["frost", "raven"], ["draugr", "draugr", "crawler"],
  ];
  const pedestalCenters = [
    { x: cx - R1 - 12, y: cy + 8 },
    { x: cx + 12, y: cy - 10 },
    { x: cx + R2 + 5, y: cy + 7 },
    { x: ruinsC.x + 5, y: ruinsC.y + 3 },
    { x: cx - R2 - 8, y: cy - 7 },
  ];
  pedestalCenters.forEach((c, i) => {
    const p = findFree(w, c.x, c.y, 6, undefined, rng);
    clearAround(w, p.x, p.y, 2);
    w.pedestals.push({ x: p.x, y: p.y, guards: guardPool[i] });
  });

  // Украшения
  const n3 = new NoiseGenerator(rng() * 100000 | 0);
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = idx(w, x, y);
      const t = w.tiles[i];
      const v = n3.value(x * 0.16, y * 0.16);
      if (t === Tl.FOREST) { if (v > 0.5) setTile(w, x, y, Tl.TREE); }
      else if (t === Tl.MTN) { if (v > 0.56) setTile(w, x, y, Tl.ROCK); }
      else if (t === Tl.SWAMP) { if (v > 0.66) setTile(w, x, y, Tl.POOL); }
      else if (t === Tl.SNOW) {
        if (v > 0.74) setTile(w, x, y, Tl.TREE);
        else if (v < 0.24) setTile(w, x, y, Tl.SNOW2);
      } else if (t === Tl.RUINS) { if (v > 0.76) setTile(w, x, y, Tl.COLUMN); }
    }
  }

  // Чистка
  for (const n of w.npcs) clearAround(w, n.x, n.y, 1);
  for (const c of w.chests) clearAround(w, c.x, c.y, 1);
  for (const p of w.pedestals) clearAround(w, p.x, p.y, 1);
  for (const e of w.dungeonEntries) clearAround(w, e.x, e.y, 1);
  for (const s of w.shrines) clearAround(w, s.x, s.y, 1);
  for (const s of w.souls) clearAround(w, s.x, s.y, 1);
  for (const a of w.ambient) clearAround(w, a.x, a.y, 0);
  clearAround(w, treeAltar.x, treeAltar.y + 3, 5, Tl.SNOW2);
  setTile(w, treeAltar.x, treeAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  setTile(w, w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);

  // Враги
  const noSpawnZones = [
    { x0: vA.x0 - 8, y0: vA.y0 - 8, x1: vA.x1 + 8, y1: vA.y1 + 8 },
    { x0: vB.x0 - 8, y0: vB.y0 - 8, x1: vB.x1 + 8, y1: vB.y1 + 8 },
    { x0: vR.x0 - 6, y0: vR.y0 - 6, x1: vR.x1 + 6, y1: vR.y1 + 6 },
  ];
  const isInNoSpawnZone = (x: number, y: number): boolean => {
    for (const z of noSpawnZones) {
      if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return true;
    }
    return false;
  };
  
  const pois = [
    gate, vB.gate, treeAltar,
    ...w.dungeonEntries.map((e) => ({ x: e.x, y: e.y })),
    ...w.shrines, ...w.npcs, ...w.chests.map((c) => ({ x: c.x, y: c.y })),
    ...w.pedestals.map((p) => ({ x: p.x, y: p.y })),
  ];
  let placed = 0;
  for (let tries = 0; tries < 4000 && placed < 84; tries++) {
    const x = 3 + Math.floor(rng() * (W - 6));
    const y = 3 + Math.floor(rng() * (H - 6));
    const t = w.tiles[idx(w, x, y)];
    if (isSolidTileId(t) || t === Tl.PATH || t === Tl.POOL || t === Tl.VILLAGE || t === Tl.WATER || t === Tl.SHORE) continue;
    if (isInNoSpawnZone(x, y)) continue;
    if (Math.hypot(gate.x - x, gate.y + 2 - y) < 40) continue;
    if (pois.some((p) => Math.hypot(p.x - x, p.y - y) < 8)) continue;
    const d = Math.hypot((x - cx) * 0.92, y - cy);
    const kinds = kindsFor(t, d, R1);
    w.spawns.push({ kind: kinds[Math.floor(rng() * kinds.length)], x: x * 16 + 8, y: y * 16 + 8 });
    placed++;
  }
  for (let i = 0; i < 3; i++) {
    const x = vR.x0 + 2 + Math.floor(rng() * (vR.x1 - vR.x0 - 4));
    const y = vR.y0 + 2 + Math.floor(rng() * (vR.y1 - vR.y0 - 4));
    if (!isSolidTileId(tileAt(w, x, y))) w.spawns.push({ kind: i === 2 ? "crawler" : "draugr", x: x * 16 + 8, y: y * 16 + 8 });
  }

  // Связность
  const reach = floodReach(w, gate.x, gate.y - 1);
  const ensure = (p: Vec) => {
    if (!inB(w, p.x, p.y) || !reach[idx(w, p.x, p.y)]) roadGen.buildRoad(w, gate, p);
  };
  for (const e of w.dungeonEntries) ensure(e);
  ensure({ x: treeAltar.x, y: treeAltar.y + 8 });
  ensure(vB.gate);
  ensure({ x: vR.x0 + 5, y: vR.y1 + 1 });
  for (const s of w.shrines) ensure(s);
  for (const c of w.chests) ensure(c);
  for (const p of w.pedestals) ensure(p);
  for (const n of w.npcs) ensure(n);
  for (const s of w.souls) ensure(s);
  for (const p of [w.bearSpot, w.hornSpot, w.meadSpot, w.oreSpot, w.mossSpot,
    w.amberSpot, w.flowerSpot, w.diarySpot, w.bundleSpot, w.relicSpot, w.oldAltar, w.stashSpot]) {
    ensure(p);
  }

  // Зоны
  w.zones = [
    { x: vA.x0, y: vA.y0, w: vA.x1 - vA.x0, h: vA.y1 - vA.y0, name: "Поселение выживших" },
    { x: vB.x0, y: vB.y0, w: vB.x1 - vB.x0, h: vB.y1 - vB.y0, name: "Воронья Гавань" },
    { x: vR.x0, y: vR.y0, w: vR.x1 - vR.x0, h: vR.y1 - vR.y0, name: "Сожжённая Деревня" },
    { x: treeAltar.x - 8, y: treeAltar.y - 3, w: 17, h: 17, name: "Корни Иггдрасиля" },
    { x: Math.round(cx - R1 - 20), y: Math.round(cy - 20), w: 40, h: 40, name: "Мёртвый Лес" },
    { x: Math.round(cx - 24), y: Math.round(cy - 22), w: 48, h: 44, name: "Хребет Нидов" },
    { x: Math.round(cx + R1 - 4), y: Math.round(cy - 10), w: 44, h: 44, name: "Замерзшие Топи" },
    { x: ruinsC.x - 14, y: ruinsC.y - 12, w: 28, h: 24, name: "Руины Времени" },
  ];

  // Стартовая позиция
  const eirikNpc = w.npcs.find((n) => n.id === "eirik");
  if (eirikNpc) {
    const spawnTileNearEirik: Vec = { x: eirikNpc.x, y: eirikNpc.y };
    const spawnSpot = findWalkableNear(w, spawnTileNearEirik.x, spawnTileNearEirik.y, 2, rng);
    if (spawnSpot.x === eirikNpc.x && spawnSpot.y === eirikNpc.y) {
      spawnSpot.x = Math.round((vA.x0 + vA.x1) / 2);
      spawnSpot.y = eirikNpc.y + 2;
      const alt = findWalkableNear(w, spawnSpot.x, spawnSpot.y, 2, rng);
      spawnSpot.x = alt.x;
      spawnSpot.y = alt.y;
    }
    w.spawn = px(spawnSpot.x, spawnSpot.y);
  } else {
    const spawnTile: Vec = { x: 0, y: 0 };
    switch (vA.gateEdge) {
      case Edge.South: spawnTile.x = gate.x + 1; spawnTile.y = gate.y - 2; break;
      case Edge.North: spawnTile.x = gate.x + 1; spawnTile.y = gate.y + 2; break;
      case Edge.West: spawnTile.x = gate.x + 2; spawnTile.y = gate.y + 1; break;
      case Edge.East: spawnTile.x = gate.x - 2; spawnTile.y = gate.y + 1; break;
    }
    w.spawn = px(spawnTile.x, spawnTile.y);
  }

  const navBuilder = new NavBuilder();
  w.nav = navBuilder.build(w);

  return w;
}
