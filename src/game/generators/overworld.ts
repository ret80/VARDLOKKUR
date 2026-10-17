/* Генерация overworld — оркестратор по фазам:
   Ф1 остров+биомы → Ф2 якорные POI и позиции деревень → Ф3 граф →
   Ф4 деревни с воротами → Ф5 дороги → Ф6 сущности → Ф7 декор → Ф8 враги+финиш */
import { mulberry, NoiseGenerator } from "../noise";
import { clamp, px } from "../utils";
import {
  WorldData, Vec, Tl, Biome, NpcDef, EnemyKind, Edge, isSolidTileId,
  VillageResult, GateDef, DungeonEntry, idx, inB,
} from "./types";
import { IslandGenerator, R_RIDGE_OUT } from "./island-generator";
import { VillageGenerator } from "./village-generator";
import { GlobalRoadGenerator } from "./global-road-generator";
import { NavBuilder } from "./nav-builder";
import { findWalkableNear, clearAround, floodReach, setTile, tileAt } from "./utils";

/* ---------- Таблица врагов по биомам (Ф8, план §9) ---------- */
interface EnemyEntry { kinds: EnemyKind[]; rare?: EnemyKind; rareChance?: number }
const ENEMY_TABLE: Record<number, EnemyEntry> = {
  [Biome.RIDGE]: { kinds: ["frost", "varg", "draugr"], rare: "giant", rareChance: 0.05 },
  [Biome.FOREST]: { kinds: ["shroom", "raven", "draugr"], rare: "spider", rareChance: 0.07 },
  [Biome.SWAMP]: { kinds: ["crawler", "draugr"], rare: "ghost", rareChance: 0.05 },
  [Biome.MEADOW]: { kinds: ["varg", "raven"] },
  [Biome.RUINS]: { kinds: ["draugr", "frost", "crawler"], rare: "ghost", rareChance: 0.07 },
  [Biome.WASTE]: { kinds: ["varg", "raven", "frost"] },
};
/** Целевое число спавнов по биомам (сумма ~84) */
const ENEMY_QUOTA: Record<number, number> = {
  [Biome.RIDGE]: 14, [Biome.FOREST]: 18, [Biome.SWAMP]: 16,
  [Biome.RUINS]: 8, [Biome.MEADOW]: 10, [Biome.WASTE]: 18,
};

export function generateOverworld(seed: number): WorldData {
  const rng = mulberry(seed);
  const W = 200, H = 140;

  /* ================= Ф1. Остров ================= */
  const island = new IslandGenerator(seed).generate();
  const w = island.w;
  const cx = island.cx, cy = island.cy;
  const ruinC = island.ruinC;

  /* ---------- Занятость / защита ---------- */
  const occupied = new Set<string>();
  const protectedCells = new Set<string>();
  const K = (x: number, y: number) => `${x},${y}`;
  const markOccupied = (x: number, y: number) => occupied.add(K(x, y));
  const isCellOccupied = (x: number, y: number) => occupied.has(K(x, y));
  const markProtected = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) protectedCells.add(K(x + dx, y + dy));
  };
  const isProtected = (x: number, y: number) => protectedCells.has(K(x, y));

  /* ---------- Базовые предикаты ---------- */
  const biomeAtXY = (x: number, y: number): number =>
    w.biomes && inB(w, x, y) ? w.biomes[idx(w, x, y)] : Biome.WASTE;
  const isPlainsTile = (t: number) => t === Tl.SNOW || t === Tl.SNOW2 || t === Tl.MEADOW;
  /** Клетка проходима для сущностей (без солидов, воды, болота и берега) */
  const tileOk = (t: number) => !isSolidTileId(t) && t !== Tl.WATER && t !== Tl.POOL && t !== Tl.SHORE;
  const cellOk = (x: number, y: number) => inB(w, x, y) && tileOk(w.tiles[idx(w, x, y)]);
  const freeCell = (x: number, y: number) => cellOk(x, y) && !isCellOccupied(x, y) && !isProtected(x, y);
  /** Клетка не является дорожным покрытием (дороги уже проложены в Ф5) */
  const offRoad = (x: number, y: number) => inB(w, x, y) && w.tiles[idx(w, x, y)] !== Tl.PATH;
  /** Покрасить тайл, но никогда не затирать дорогу (иначе рвётся PATH-цепочка) */
  const paint = (x: number, y: number, t: number) => {
    if (inB(w, x, y) && w.tiles[idx(w, x, y)] !== Tl.PATH) w.tiles[idx(w, x, y)] = t;
  };

  const openRatio = (x: number, y: number, r: number): number => {
    let ok = 0, total = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        total++;
        if (cellOk(x + dx, y + dy)) ok++;
      }
    return ok / total;
  };
  const plainRatio = (x: number, y: number, r: number): number => {
    let ok = 0, total = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        total++;
        if (inB(w, x + dx, y + dy) && isPlainsTile(w.tiles[idx(w, x + dx, y + dy)])) ok++;
      }
    return ok / total;
  };
  const nearWater = (x: number, y: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = tileAt(w, x + dx, y + dy);
        if (t === Tl.WATER || t === Tl.SHORE) return true;
      }
    return false;
  };

  const randRadial = (rMin: number, rMax: number): Vec => {
    const ang = rng() * Math.PI * 2;
    const rad = rMin + Math.sqrt(rng()) * (rMax - rMin);
    return { x: Math.round(cx + Math.cos(ang) * rad), y: Math.round(cy + Math.sin(ang) * rad) };
  };

  /** Свободная клетка рядом с ориентиром (учитывает занятость/защиту) */
  const placeFree = (fx: number, fy: number, r: number, pred?: (x: number, y: number) => boolean): Vec | null => {
    for (let tries = 0; tries < 400; tries++) {
      const x = Math.round(fx + (rng() * 2 - 1) * r);
      const y = Math.round(fy + (rng() * 2 - 1) * r);
      if (!freeCell(x, y)) continue;
      if (pred && !pred(x, y)) continue;
      return { x, y };
    }
    for (let rad = 1; rad < 70; rad++) {
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          const x = Math.round(fx) + dx, y = Math.round(fy) + dy;
          if (!freeCell(x, y)) continue;
          if (pred && !pred(x, y)) continue;
          return { x, y };
        }
    }
    return null;
  };

  /** Свободная клетка в заданном биоме (радиальное кольцо от центра) */
  const placeInBiome = (b: number, rMin: number, rMax: number, reqOpen = 0.5, rOpen = 3, pred?: (x: number, y: number) => boolean): Vec | null => {
    for (let i = 0; i < 1500; i++) {
      const p = randRadial(rMin, rMax);
      if (!inB(w, p.x, p.y)) continue;
      if (biomeAtXY(p.x, p.y) !== b) continue;
      if (!freeCell(p.x, p.y)) continue;
      if (pred && !pred(p.x, p.y)) continue;
      if (openRatio(p.x, p.y, rOpen) < reqOpen) continue;
      return p;
    }
    return null;
  };

  /* ================= Ф2. Якорные POI ================= */
  // --- Алтарь в центре острова ---
  const treeAltar: Vec = { x: cx, y: cy };
  clearAround(w, treeAltar.x, treeAltar.y + 3, 6, Tl.SNOW2);
  setTile(w, treeAltar.x, treeAltar.y, Tl.ALTAR);
  w.treeAltar = treeAltar;
  w.arena = { x: treeAltar.x * 16 + 8, y: (treeAltar.y + 3) * 16 + 8, r: 84 };
  w.snakeSpot = { x: treeAltar.x * 16 + 8, y: (treeAltar.y + 2) * 16 };
  markOccupied(treeAltar.x, treeAltar.y);
  markProtected(treeAltar.x, treeAltar.y, 9);

  // --- Входы в подземелья (в биомах, не рядом с алтарём) ---
  const dungeonEntries: DungeonEntry[] = [];
  const farFromAltar = (x: number, y: number) => Math.hypot(x - cx, y - cy) >= 13;
  const mkEntry = (spot: Vec, id: number, name: string): Vec => {
    clearAround(w, spot.x, spot.y, 2);
    setTile(w, spot.x, spot.y, Tl.STAIRS);
    dungeonEntries.push({ x: spot.x, y: spot.y, id, name });
    markOccupied(spot.x, spot.y);
    markProtected(spot.x, spot.y, 2);
    return spot;
  };

  // Каменная Крепость (giant) → хребет, внешнее кольцо (дальше от алтаря)
  const fortressSpot =
    placeInBiome(Biome.RIDGE, 14, R_RIDGE_OUT + 2, 0.4, 3, farFromAltar) ??
    placeInBiome(Biome.RIDGE, 11, R_RIDGE_OUT + 2, 0.4, 3) ??
    randRadial(R_RIDGE_OUT - 2, R_RIDGE_OUT + 5);
  mkEntry(fortressSpot, 2, "Каменная Крепость");

  // Корень Иггдрасиля (spider) → болото (по требованию)
  const rootSpot =
    placeInBiome(Biome.SWAMP, R_RIDGE_OUT + 4, 46, 0.4, 3, farFromAltar) ??
    placeInBiome(Biome.SWAMP, R_RIDGE_OUT + 1, 46, 0.4, 3) ??
    randRadial(R_RIDGE_OUT + 6, 40);
  mkEntry(rootSpot, 1, "Корень Иггдрасиля");

  // Склеп Хранителя (reaper) → карман руин
  const cryptSpot =
    (freeCell(ruinC.x, ruinC.y) ? ruinC : placeFree(ruinC.x, ruinC.y, 7, (x, y) => biomeAtXY(x, y) === Biome.RUINS)) ?? ruinC;
  mkEntry(cryptSpot, 0, "Склеп Хранителя");

  w.dungeonEntries = dungeonEntries;

  // --- Позиции деревень (валидация) ---
  const sites: Vec[] = [];
  const siteAccept = (p: Vec): boolean => {
    if (Math.hypot(p.x - cx, p.y - cy) < R_RIDGE_OUT + 8) return false;
    if (nearWater(p.x, p.y, 7)) return false;
    if (plainRatio(p.x, p.y, 5) < 0.55) return false;
    if (openRatio(p.x, p.y, 5) < 0.6) return false;
    if (Math.hypot(p.x - ruinC.x, p.y - ruinC.y) < 16) return false;
    for (const e of dungeonEntries) if (Math.hypot(p.x - e.x, p.y - e.y) < 14) return false;
    for (const s of sites) if (Math.hypot(p.x - s.x, p.y - s.y) < 34) return false;
    return true;
  };
  // Две «жилые» деревни (vA, vB) ставим в разные биомы (луга/пустошь),
  // чтобы святилище каждой стояло у её ворот и каждый биом имел ровно одно.
  const pickSite = (avoidBiome?: number): Vec | null => {
    for (let i = 0; i < 3000; i++) {
      const p = randRadial(R_RIDGE_OUT + 8, 46);
      if (!inB(w, p.x, p.y)) continue;
      const b = biomeAtXY(p.x, p.y);
      if (b !== Biome.MEADOW && b !== Biome.WASTE) continue;
      if (avoidBiome !== undefined && b === avoidBiome) continue;
      if (!siteAccept(p)) continue;
      return p;
    }
    return null;
  };
  const first = pickSite();
  if (first) sites.push(first);
  const second = pickSite(first ? biomeAtXY(first.x, first.y) : undefined) ?? pickSite();
  if (second) sites.push(second);
  const third = pickSite();
  if (third) sites.push(third);
  // Фолбэк: добираем до 3 относительно далёких точек
  while (sites.length < 3) {
    const ang = rng() * Math.PI * 2 + sites.length * 2.1;
    const rad = 34 + rng() * 8;
    const p = { x: Math.round(cx + Math.cos(ang) * rad), y: Math.round(cy + Math.sin(ang) * rad) };
    const near = sites.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 30);
    if (!near && !nearWater(p.x, p.y, 4)) sites.push(p);
    else sites.push(randRadial(R_RIDGE_OUT + 10, 42));
  }
  /** Биом деревни (по её якорной точке) — носитель святилища у ворот */
  const siteBiome = sites.map((s) => biomeAtXY(s.x, s.y));

  /* ================= Ф3. Граф связей ================= */
  const roadCost = (a: Vec, b: Vec): number => {
    const steps = Math.max(2, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y)));
    let cost = 0;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      const tile = tileAt(w, x, y);
      if (tile === Tl.WATER) return 1e6; // вода фактически непроходима
      switch (tile) {
        case Tl.PATH: cost += 0.35; break;
        case Tl.SNOW: case Tl.SNOW2: case Tl.MEADOW: cost += 1; break;
        case Tl.SHORE: cost += 1.4; break;
        case Tl.RUINS: cost += 1.9; break;
        case Tl.FOREST: cost += 2.4; break;
        case Tl.MTN: cost += 2.8; break;
        case Tl.SWAMP: cost += 3.4; break;
        case Tl.POOL: cost += 4; break;
        case Tl.PALISADE: case Tl.HOUSE: cost += 50; break;
        default: cost += 1.2;
      }
    }
    return cost + Math.hypot(a.x - b.x, a.y - b.y) * 0.05;
  };

  const pairCost = (i: number, j: number) => roadCost(sites[i], sites[j]);
  const allPairs: [number, number, number][] = [
    [0, 1, pairCost(0, 1)],
    [0, 2, pairCost(0, 2)],
    [1, 2, pairCost(1, 2)],
  ];
  allPairs.sort((a, b) => a[2] - b[2]);
  // MST = два самых дешёвых ребра
  const edges: [number, number][] = [[allPairs[0][0], allPairs[0][1]], [allPairs[1][0], allPairs[1][1]]];
  // Опциональная петля — третье ребро (иногда даёт всем деревням по 2 выхода)
  if (rng() < 0.5) edges.push([allPairs[2][0], allPairs[2][1]]);

  const adj: Vec[][] = [[], [], []];
  for (const [i, j] of edges) { adj[i].push(sites[j]); adj[j].push(sites[i]); }

  /* ================= Ф4. Деревни ================= */
  const villageGen = new VillageGenerator(rng);
  const villages: VillageResult[] = [];
  for (let i = 0; i < 3; i++) {
    const deg = adj[i].length;
    const rw = i === 2 ? 11 : (deg >= 2 ? 15 : 13);
    const rh = i === 2 ? 9 : (deg >= 2 ? 12 : 11);
    const vx = clamp(sites[i].x - Math.floor(rw / 2), 3, W - rw - 3);
    const vy = clamp(sites[i].y - Math.floor(rh / 2), 3, H - rh - 3);
    const v = villageGen.generate(w, vx, vy, rw, rh, adj[i]);
    villages.push(v);
    // Коридоры ворот — защищённая зона снаружи
    for (const g of v.gates) {
      const nrm = g.edge === Edge.North ? { x: 0, y: -1 }
        : g.edge === Edge.South ? { x: 0, y: 1 }
          : g.edge === Edge.West ? { x: -1, y: 0 } : { x: 1, y: 0 };
      markProtected(g.x + 1 + nrm.x * 3, g.y + 1 + nrm.y * 3, 2);
    }
  }
  const vA = villages[0], vB = villages[1], vR = villages[2];

  // Разрушаем сожжённую деревню (vR)
  w.ruinedHouses = [];
  for (const h of vR.houses) {
    if (rng() < 0.4) {
      for (let y = h.y; y < h.y + h.h; y++)
        for (let x = h.x; x < h.x + h.w; x++) setTile(w, x, y, rng() < 0.5 ? Tl.COLUMN : Tl.RUINS);
    } else {
      w.ruinedHouses.push({ x: h.x, y: h.y, w: h.w, h: h.h });
    }
  }
  for (let y = vR.y0; y <= vR.y1; y++) {
    for (let x = vR.x0; x <= vR.x1; x++) {
      if (!inB(w, x, y)) continue;
      if (w.tiles[idx(w, x, y)] === Tl.PALISADE && rng() < 0.4)
        setTile(w, x, y, rng() < 0.5 ? Tl.COLUMN : Tl.RUINS);
    }
  }

  w.villageA = vA.gate;
  w.villageB = vB.gate;
  w.ruinedVillage = { x: vR.x0 + 5, y: vR.y0 + 4 };
  w.villageSites = sites.map((s) => ({ x: s.x, y: s.y }));
  w.villageGates = villages.map((v) => v.gates.map((g) => ({ ...g })));
  w.villageGraph = edges.map(([i, j]) => [i, j] as [number, number]);

  /* ================= Ф5. Дороги ================= */
  const roadGen = new GlobalRoadGenerator(rng);
  const arenaAvoid = (x: number, y: number) => Math.hypot(x - cx, y - cy) < 8;

  const gateFor = (v: VillageResult, target: Vec): GateDef =>
    v.gates.find((g) => g.target === target) ?? v.gates[0];

  // 1. Рёбра графа: gate(i) → gate(j)
  for (const [i, j] of edges) {
    const gi = gateFor(villages[i], sites[j]);
    const gj = gateFor(villages[j], sites[i]);
    roadGen.buildRoad(w, { x: gi.x + 1, y: gi.y + 1 }, { x: gj.x + 1, y: gj.y + 1 }, { avoid: arenaAvoid });
  }

  // 2. Спуры к POI: ближайшие ворота → POI
  const allGates: Vec[] = villages.flatMap((v) => v.gates.map((g) => ({ x: g.x + 1, y: g.y + 1 })));
  const nearestGate = (p: Vec): Vec => {
    let best = allGates[0], bd = Infinity;
    for (const g of allGates) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  };
  for (const e of dungeonEntries) roadGen.buildRoad(w, nearestGate(e), { x: e.x, y: e.y }, { avoid: arenaAvoid });
  // Главное шоссе к алтарю (к югу от барьера/арены)
  roadGen.buildRoad(w, nearestGate(treeAltar), { x: treeAltar.x, y: treeAltar.y + 8 }, { avoid: arenaAvoid });

  // 3. Гарантируем проходимый тайл рядом с каждым входом
  for (const e of dungeonEntries) {
    let hasPath = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = tileAt(w, e.x + dx, e.y + dy);
      if (t === Tl.PATH) { hasPath = true; break; }
    }
    if (!hasPath) {
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        if (cellOk(e.x + dx, e.y + dy)) { setTile(w, e.x + dx, e.y + dy, Tl.PATH); break; }
      }
    }
  }

  /* ================= Ф6. Сущности ================= */
  const npcs: NpcDef[] = [];
  const addNpc = (id: string, name: string, fx: number, fy: number, r: number): Vec => {
    const p = placeFree(fx, fy, r) ?? findWalkableNear(w, fx, fy, r, rng);
    npcs.push({ id, name, x: p.x, y: p.y });
    markOccupied(p.x, p.y);
    clearAround(w, p.x, p.y, 1);
    return p;
  };

  // vA — Поселение выживших
  const eirik = addNpc("eirik", "Эйрик Старший",
    Math.round((vA.x0 + vA.x1) / 2), Math.round((vA.y0 + vA.y1) / 2), 5);
  addNpc("astrid", "Астрид", vA.x1 - 3, Math.round((vA.y0 + vA.y1) / 2), 3);
  addNpc("harald", "Харальд", Math.round((vA.x0 + vA.x1) / 2), vA.y1 - 2, 3);
  // vB — Воронья Гавань
  addNpc("sigrid", "Сигрид", Math.round((vB.x0 + vB.x1) / 2), vB.y0 + 2, 3);
  addNpc("brand", "Бранд", vB.x0 + 2, Math.round((vB.y0 + vB.y1) / 2), 3);
  // vR — Сожжённая Деревня
  addNpc("refugee", "Беженка Гюнн", vR.x0 + Math.round((vR.x1 - vR.x0) / 2), vR.y0 + 2, 3);
  // Лесной шаман — только в лесном биоме
  {
    const p = placeInBiome(Biome.FOREST, R_RIDGE_OUT + 6, 46, 0.5, 3) ?? { x: cx - 20, y: cy - 20 };
    addNpc("shaman", "Шаман Ульв", p.x, p.y, 3);
  }
  // Торговец — на перекрёстке/середине дороги vA↔vB
  {
    const gA = gateFor(vA, sites[1]);
    const gB = gateFor(vB, sites[0]);
    addNpc("merchant", "Торговец Фьолнир", Math.round((gA.x + gB.x) / 2), Math.round((gA.y + gB.y) / 2), 6);
  }
  // Дочь — рядом с алтарём
  addNpc("daughter", "Безымянная Дочь", treeAltar.x, treeAltar.y + 7, 4);
  // Ворон — у руин
  addNpc("raven", "Ворон-Говорун", ruinC.x, ruinC.y - 3, 6);
  // Статисты в деревнях
  for (let i = 0; i < Math.min(3, vA.residentSpots.length); i++) {
    const s = vA.residentSpots[i];
    if (!isCellOccupied(s.x, s.y)) { npcs.push({ id: `villager_A_${i}`, name: "Поселенец", x: s.x, y: s.y }); markOccupied(s.x, s.y); }
  }
  for (let i = 0; i < Math.min(3, vB.residentSpots.length); i++) {
    const s = vB.residentSpots[i];
    if (!isCellOccupied(s.x, s.y)) { npcs.push({ id: `villager_B_${i}`, name: "Поселенец", x: s.x, y: s.y }); markOccupied(s.x, s.y); }
  }
  w.npcs = npcs;

  // ---------- Святилища: ровно одно на биом, у деревень — у ворот ----------
  const LAND_BIOMES: number[] = [
    Biome.SNOW, Biome.RIDGE, Biome.FOREST, Biome.SWAMP, Biome.MEADOW, Biome.RUINS, Biome.WASTE,
  ];
  const shrineCovered = new Set<number>();
  const addShrine = (p: Vec) => {
    clearAround(w, p.x, p.y, 1);
    w.shrines.push({ x: p.x, y: p.y });
    markOccupied(p.x, p.y);
    shrineCovered.add(biomeAtXY(p.x, p.y));
  };
  /** Клетка сразу внутри проёма (со стороны деревни) */
  const gateInner = (g: GateDef): Vec => {
    switch (g.edge) {
      case Edge.North: return { x: g.x + 1, y: g.y + 1 };
      case Edge.South: return { x: g.x + 1, y: g.y };
      case Edge.West: return { x: g.x + 1, y: g.y + 1 };
      case Edge.East:
      default: return { x: g.x, y: g.y + 1 };
    }
  };
  /** Святилище в священной роще у алтаря (биом SNOW защищён — ставим напрямую) */
  const snowShrine = (): Vec | null => {
    const offs: [number, number][] = [[6, 0], [-6, 0], [5, 4], [-5, 4], [4, -5], [-4, -5], [5, -4], [-5, -4]];
    for (const [dx, dy] of offs) {
      const x = cx + dx, y = cy + dy;
      if (!inB(w, x, y)) continue;
      const t = w.tiles[idx(w, x, y)];
      if (isSolidTileId(t) || t === Tl.WATER || t === Tl.POOL || t === Tl.SHORE || t === Tl.PATH) continue;
      if (biomeAtXY(x, y) !== Biome.SNOW) continue;
      return { x, y };
    }
    return null;
  };

  // 1. Деревни: по одному святилищу у главных ворот (внутри деревни, off-road).
  //    Ограниченный поиск (≤5 тайлов), чтобы святилище было именно у входа.
  const placeShrineNearGate = (v: VillageResult, bi: number, inner: Vec): Vec | null => {
    for (const relax of [false, true]) {
      for (let rad = 0; rad <= 5; rad++) {
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            if (rad > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
            const x = inner.x + dx, y = inner.y + dy;
            if (!freeCell(x, y) || !offRoad(x, y)) continue;
            if (biomeAtXY(x, y) !== bi) continue;
            if (!relax && Math.hypot(x - v.plazaCenter.x, y - v.plazaCenter.y) < 3) continue;
            return { x, y };
          }
        }
      }
    }
    return null;
  };
  [ { v: vA, bi: siteBiome[0] }, { v: vB, bi: siteBiome[1] } ].forEach(({ v, bi }) => {
    const p = placeShrineNearGate(v, bi, gateInner(v.gates[0]));
    if (p) addShrine(p);
  });

  // 2. По одному святилищу в каждом ещё не покрытом биоме
  const shrineForBiome = (b: number): Vec | null => {
    switch (b) {
      case Biome.SNOW: return snowShrine();
      case Biome.RIDGE: return placeInBiome(Biome.RIDGE, 12, R_RIDGE_OUT + 2, 0.4, 3, offRoad);
      case Biome.FOREST: return placeInBiome(Biome.FOREST, R_RIDGE_OUT + 4, 46, 0.5, 3, offRoad);
      case Biome.SWAMP: return placeInBiome(Biome.SWAMP, R_RIDGE_OUT + 4, 46, 0.4, 3, offRoad);
      case Biome.RUINS: return placeFree(ruinC.x, ruinC.y, 9, (x, y) => biomeAtXY(x, y) === Biome.RUINS && offRoad(x, y));
      case Biome.MEADOW: return placeInBiome(Biome.MEADOW, R_RIDGE_OUT + 6, 46, 0.5, 3, offRoad);
      case Biome.WASTE: return placeInBiome(Biome.WASTE, 24, 46, 0.5, 3, offRoad);
      default: return null;
    }
  };
  for (const b of LAND_BIOMES) {
    if (shrineCovered.has(b)) continue;
    const p = shrineForBiome(b);
    if (p) addShrine(p);
  }

  // Сундуки
  const addChest = (p: Vec | null, item: "bow" | "sword" | "arrows" | "heartPiece" | "key") => {
    if (!p) return;
    w.chests.push({ x: p.x, y: p.y, item });
    markOccupied(p.x, p.y);
  };
  addChest(placeInBiome(Biome.FOREST, R_RIDGE_OUT + 4, 46, 0.5, 3), "bow");
  addChest(placeInBiome(Biome.RIDGE, 10, R_RIDGE_OUT + 6, 0.4, 3), "arrows");
  addChest(placeInBiome(Biome.SWAMP, R_RIDGE_OUT + 4, 46, 0.4, 3) ?? placeInBiome(Biome.WASTE, 24, 46, 0.5, 3), "heartPiece");

  // Пьедесталы (стражи по биомам)
  const guardPool: EnemyKind[][] = [
    ["frost", "varg"], ["draugr", "shroom"], ["crawler", "draugr"],
    ["draugr", "raven"], ["varg", "varg"],
  ];
  const pedestalSpots = [
    placeInBiome(Biome.RIDGE, 10, R_RIDGE_OUT + 6, 0.4, 3),
    placeInBiome(Biome.FOREST, R_RIDGE_OUT + 4, 46, 0.45, 3),
    placeInBiome(Biome.SWAMP, R_RIDGE_OUT + 4, 46, 0.4, 3),
    placeFree(ruinC.x + 5, ruinC.y + 3, 6, (x, y) => biomeAtXY(x, y) === Biome.RUINS),
    placeInBiome(Biome.MEADOW, R_RIDGE_OUT + 6, 46, 0.5, 3),
  ];
  pedestalSpots.forEach((p, i) => {
    if (!p) return;
    clearAround(w, p.x, p.y, 2);
    w.pedestals.push({ x: p.x, y: p.y, guards: guardPool[i] });
    markOccupied(p.x, p.y);
  });

  // Квестовые точки
  const spot = (p: Vec | null, fb: Vec): Vec => p ?? fb;
  w.bearSpot = spot(placeInBiome(Biome.SWAMP, R_RIDGE_OUT + 2, 46, 0.4, 3, offRoad), { x: cx + 20, y: cy + 20 });
  paint(w.bearSpot.x, w.bearSpot.y, Tl.POOL);
  markOccupied(w.bearSpot.x, w.bearSpot.y);
  w.hornSpot = spot(placeInBiome(Biome.RIDGE, 10, R_RIDGE_OUT + 6, 0.4, 3), { x: cx, y: cy - 12 });
  markOccupied(w.hornSpot.x, w.hornSpot.y);
  w.meadSpot = spot(placeInBiome(Biome.FOREST, R_RIDGE_OUT + 4, 46, 0.5, 3), { x: cx - 16, y: cy - 16 });
  markOccupied(w.meadSpot.x, w.meadSpot.y);
  w.oreSpot = spot(placeInBiome(Biome.RIDGE, 10, R_RIDGE_OUT + 6, 0.4, 3), { x: cx + 8, y: cy - 8 });
  markOccupied(w.oreSpot.x, w.oreSpot.y);
  w.mossSpot = spot(placeInBiome(Biome.SWAMP, R_RIDGE_OUT + 4, 46, 0.4, 3), { x: cx + 18, y: cy + 4 });
  markOccupied(w.mossSpot.x, w.mossSpot.y);
  w.amberSpot = spot(placeInBiome(Biome.RIDGE, 10, R_RIDGE_OUT + 6, 0.4, 3), { x: cx + 12, y: cy + 8 });
  markOccupied(w.amberSpot.x, w.amberSpot.y);
  w.flowerSpot = spot(placeFree(ruinC.x + 6, ruinC.y - 4, 7, (x, y) => biomeAtXY(x, y) === Biome.RUINS), { x: ruinC.x + 4, y: ruinC.y - 4 });
  markOccupied(w.flowerSpot.x, w.flowerSpot.y);
  w.diarySpot = (() => {
    for (let i = 0; i < 300; i++) {
      const x = vR.x0 + 2 + Math.floor(rng() * Math.max(1, vR.x1 - vR.x0 - 4));
      const y = vR.y0 + 2 + Math.floor(rng() * Math.max(1, vR.y1 - vR.y0 - 4));
      if (!offRoad(x, y)) continue;
      if (isCellOccupied(x, y)) continue;
      return { x, y };
    }
    return { x: vR.x0 + 2, y: vR.y0 + 2 };
  })();
  paint(w.diarySpot.x, w.diarySpot.y, Tl.RUINS);
  markOccupied(w.diarySpot.x, w.diarySpot.y);
  w.relicSpot = spot(placeInBiome(Biome.MEADOW, R_RIDGE_OUT + 6, 46, 0.5, 3) ?? placeInBiome(Biome.WASTE, 24, 46, 0.5, 3), { x: cx - 24, y: cy + 24 });
  markOccupied(w.relicSpot.x, w.relicSpot.y);
  w.oldAltar = spot(placeFree(w.relicSpot.x + 7, w.relicSpot.y + 3, 5, offRoad), { x: w.relicSpot.x + 5, y: w.relicSpot.y + 3 });
  paint(w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  markOccupied(w.oldAltar.x, w.oldAltar.y);
  w.stashSpot = spot(placeFree(ruinC.x - 4, ruinC.y + 5, 6), { x: ruinC.x - 3, y: ruinC.y + 5 });
  markOccupied(w.stashSpot.x, w.stashSpot.y);

  // Связка — на середине дороги vA↔vB
  {
    const gA = gateFor(vA, sites[1]);
    const gB = gateFor(vB, sites[0]);
    w.bundleSpot = spot(placeFree(Math.round((gA.x + gB.x) / 2), Math.round((gA.y + gB.y) / 2), 5), { x: Math.round((gA.x + gB.x) / 2), y: Math.round((gA.y + gB.y) / 2) });
    markOccupied(w.bundleSpot.x, w.bundleSpot.y);
  }

  // Души
  const soulSpots = [
    spot(placeInBiome(Biome.WASTE, 24, 46, 0.5, 2), { x: cx + 24, y: cy - 8 }),
    spot(placeInBiome(Biome.MEADOW, R_RIDGE_OUT + 6, 46, 0.5, 2), { x: cx - 20, y: cy + 16 }),
    { x: ruinC.x - 8, y: ruinC.y - 6 },
  ];
  w.souls = soulSpots;
  for (const s of soulSpots) markOccupied(s.x, s.y);

  // Колонны в руинах
  for (let i = 0; i < 10; i++) {
    const p = placeFree(ruinC.x, ruinC.y, 8, (x, y) => biomeAtXY(x, y) === Biome.RUINS && offRoad(x, y));
    if (p) setTile(w, p.x, p.y, Tl.COLUMN);
  }

  /* ============ Ф5b. Связность POI (до декора) ============ */
  const reachStart: Vec = { x: vA.gate.x, y: vA.gate.y };
  const reachedNear = (reach: Uint8Array, p: Vec): boolean => {
    if (inB(w, p.x, p.y) && reach[idx(w, p.x, p.y)]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx, ny = p.y + dy;
      if (inB(w, nx, ny) && reach[idx(w, nx, ny)]) return true;
    }
    return false;
  };
  const allPoiPoints = (): Vec[] => {
    const pts: Vec[] = [];
    for (const v of villages) for (const g of v.gates) pts.push({ x: g.x + 1, y: g.y + 1 });
    for (const e of dungeonEntries) pts.push({ x: e.x, y: e.y });
    pts.push({ x: treeAltar.x, y: treeAltar.y + 8 });
    pts.push(...w.shrines.map((s) => ({ x: s.x, y: s.y })));
    pts.push(...w.chests.map((c) => ({ x: c.x, y: c.y })));
    pts.push(...w.pedestals.map((p) => ({ x: p.x, y: p.y })));
    pts.push(...w.souls.map((s) => ({ x: s.x, y: s.y })));
    pts.push(...w.npcs.map((n) => ({ x: n.x, y: n.y })));
    const spots = ["bearSpot", "hornSpot", "meadSpot", "oreSpot", "mossSpot", "amberSpot",
      "flowerSpot", "diarySpot", "bundleSpot", "relicSpot", "oldAltar", "stashSpot"] as const;
    for (const s of spots) pts.push((w as unknown as Record<string, Vec>)[s]);
    return pts;
  };

  let reach = floodReach(w, reachStart.x, reachStart.y);
  const connectPoi = (p: Vec) => {
    if (!inB(w, p.x, p.y)) return;
    if (reachedNear(reach, p)) return;
    roadGen.buildRoad(w, nearestGate(p), p, { avoid: arenaAvoid });
    reach = floodReach(w, reachStart.x, reachStart.y);
  };
  for (const p of allPoiPoints()) connectPoi(p);

  /* ================= Ф7. Декор ================= */
  const n3 = new NoiseGenerator((rng() * 100000) | 0);
  const nearSpecial = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!inB(w, x + dx, y + dy)) continue;
        const t = w.tiles[idx(w, x + dx, y + dy)];
        if (t === Tl.PATH || t === Tl.STAIRS || t === Tl.VILLAGE ||
            t === Tl.PALISADE || t === Tl.HOUSE || t === Tl.ALTAR) return true;
      }
    return false;
  };
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = idx(w, x, y);
      const t = w.tiles[i];
      if (t === Tl.PATH || t === Tl.STAIRS || t === Tl.VILLAGE || t === Tl.PALISADE ||
          t === Tl.HOUSE || t === Tl.ALTAR || t === Tl.WATER || t === Tl.SHORE) continue;
      if (isProtected(x, y) || isCellOccupied(x, y) || nearSpecial(x, y)) continue;
      const v = n3.value(x * 0.16, y * 0.16);
      if (t === Tl.FOREST) { if (v > 0.5) setTile(w, x, y, Tl.TREE); }
      else if (t === Tl.MTN) { if (v > 0.56) setTile(w, x, y, Tl.ROCK); }
      else if (t === Tl.SWAMP) { if (v > 0.66) setTile(w, x, y, Tl.POOL); }
      else if (t === Tl.RUINS) { if (v > 0.76) setTile(w, x, y, Tl.COLUMN); }
      else if (t === Tl.SNOW || t === Tl.SNOW2) {
        if (v > 0.78) setTile(w, x, y, Tl.TREE);
        else if (v < 0.2) setTile(w, x, y, Tl.SNOW2);
      } else if (t === Tl.MEADOW) { if (v < 0.22) setTile(w, x, y, Tl.SNOW2); }
    }
  }

  // Чистка вокруг сущностей (солиды не должны перекрывать объекты и входы)
  for (const n of w.npcs) clearAround(w, n.x, n.y, 1);
  for (const c of w.chests) clearAround(w, c.x, c.y, 1);
  for (const p of w.pedestals) clearAround(w, p.x, p.y, 1);
  for (const e of w.dungeonEntries) clearAround(w, e.x, e.y, 2);
  for (const s of w.shrines) clearAround(w, s.x, s.y, 1);
  for (const s of w.souls) clearAround(w, s.x, s.y, 1);
  clearAround(w, treeAltar.x, treeAltar.y, 8, Tl.SNOW2);
  setTile(w, treeAltar.x, treeAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  paint(w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);

  /* ============ Ф7b. Контроль связности после декора ============ */
  {
    const pts = allPoiPoints();
    const reach2 = floodReach(w, reachStart.x, reachStart.y);
    const broken = pts.filter((p) => inB(w, p.x, p.y) && !reachedNear(reach2, p));
    if (broken.length) {
      // Multi-source BFS от достижимых клеток, игнорируя солиды
      const dist = new Int32Array(W * H).fill(-1);
      const queue: number[] = [];
      for (let i = 0; i < reach2.length; i++) if (reach2[i]) { dist[i] = 0; queue.push(i); }
      const NB: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        const cxx = cur % W, cyy = (cur / W) | 0;
        for (const [dx, dy] of NB) {
          const nx = cxx + dx, ny = cyy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (dist[ni] !== -1) continue;
          dist[ni] = dist[cur] + 1;
          queue.push(ni);
        }
      }
      // Пробиваем коридор от каждой недостижимой точки к ближайшей достижимой
      for (const p of broken) {
        let cur = idx(w, p.x, p.y);
        if (dist[cur] === -1) continue;
        let guard = 0;
        while (dist[cur] !== 0 && guard++ < 10000) {
          const cxx = cur % W, cyy = (cur / W) | 0;
          let best = cur, bestD = dist[cur];
          for (const [dx, dy] of NB) {
            const nx = cxx + dx, ny = cyy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (dist[ni] !== -1 && dist[ni] < bestD) { bestD = dist[ni]; best = ni; }
          }
          if (best === cur) break;
          cur = best;
          const t = w.tiles[cur];
          if (t !== Tl.WATER && (isSolidTileId(t) || t === Tl.SHORE)) w.tiles[cur] = Tl.PATH;
        }
      }
    }
  }

  /* ================= Ф8. Враги ================= */
  const noSpawn = (x: number, y: number): boolean => {
    for (const v of [vA, vB, vR])
      if (x >= v.x0 - 8 && x <= v.x1 + 8 && y >= v.y0 - 8 && y <= v.y1 + 8) return true;
    if (Math.hypot(x - cx, y - cy) < 13) return true;
    return false;
  };
  const nearVillage = (x: number, y: number): boolean => {
    for (const v of [vA, vB, vR]) {
      const vcx = (v.x0 + v.x1) / 2, vcy = (v.y0 + v.y1) / 2;
      if (Math.hypot(x - vcx, y - vcy) < 22) return true;
    }
    return false;
  };
  const pois: Vec[] = [
    ...allGates, treeAltar,
    ...w.dungeonEntries.map((e) => ({ x: e.x, y: e.y })),
    ...w.shrines, ...w.npcs.map((n) => ({ x: n.x, y: n.y })),
    ...w.chests.map((c) => ({ x: c.x, y: c.y })),
    ...w.pedestals.map((p) => ({ x: p.x, y: p.y })),
    w.bearSpot, w.hornSpot, w.meadSpot, w.oreSpot, w.mossSpot, w.amberSpot,
    w.flowerSpot, w.diarySpot, w.bundleSpot, w.relicSpot, w.oldAltar, w.stashSpot,
    ...w.souls,
  ];
  const quota: Record<number, number> = { ...ENEMY_QUOTA };
  let placedCount = 0;
  const totalQuota = Object.values(ENEMY_QUOTA).reduce((a, b) => a + b, 0);
  for (let tries = 0; tries < 12000 && placedCount < totalQuota; tries++) {
    const x = 3 + Math.floor(rng() * (W - 6));
    const y = 3 + Math.floor(rng() * (H - 6));
    const t = w.tiles[idx(w, x, y)];
    if (isSolidTileId(t) || t === Tl.PATH || t === Tl.POOL || t === Tl.VILLAGE ||
        t === Tl.PALISADE || t === Tl.HOUSE || t === Tl.WATER || t === Tl.SHORE ||
        t === Tl.STAIRS || t === Tl.ALTAR) continue;
    if (isCellOccupied(x, y) || isProtected(x, y)) continue;
    if (noSpawn(x, y) || nearVillage(x, y)) continue;
    if (pois.some((p) => Math.hypot(p.x - x, p.y - y) < 8)) continue;
    const b = biomeAtXY(x, y);
    const table = ENEMY_TABLE[b];
    if (!table || (quota[b] ?? 0) <= 0) continue;
    let kind = table.kinds[Math.floor(rng() * table.kinds.length)];
    if (table.rare && rng() < (table.rareChance ?? 0)) kind = table.rare;
    w.spawns.push({ kind, x: x * 16 + 8, y: y * 16 + 8 });
    markOccupied(x, y);
    quota[b]--;
    placedCount++;
  }
  // Сожжённая деревня — 3 спавна
  let vrPlaced = 0;
  for (let tries = 0; tries < 300 && vrPlaced < 3; tries++) {
    const x = vR.x0 + 2 + Math.floor(rng() * Math.max(1, vR.x1 - vR.x0 - 4));
    const y = vR.y0 + 2 + Math.floor(rng() * Math.max(1, vR.y1 - vR.y0 - 4));
    const t = tileAt(w, x, y);
    if (isSolidTileId(t) || t === Tl.PATH || t === Tl.WATER || t === Tl.SHORE || t === Tl.POOL) continue;
    if (isCellOccupied(x, y)) continue;
    w.spawns.push({ kind: vrPlaced === 2 ? "crawler" : "draugr", x: x * 16 + 8, y: y * 16 + 8 });
    markOccupied(x, y);
    vrPlaced++;
  }

  /* ================= Зоны ================= */
  w.zones = [
    { x: vA.x0, y: vA.y0, w: vA.x1 - vA.x0, h: vA.y1 - vA.y0, name: "Поселение выживших" },
    { x: vB.x0, y: vB.y0, w: vB.x1 - vB.x0, h: vB.y1 - vB.y0, name: "Воронья Гавань" },
    { x: vR.x0, y: vR.y0, w: vR.x1 - vR.x0, h: vR.y1 - vR.y0, name: "Сожжённая Деревня" },
    { x: ruinC.x - 13, y: ruinC.y - 11, w: 27, h: 23, name: "Руины Времени" },
    { x: cx - 9, y: cy - 9, w: 19, h: 19, name: "Священная Гряда" },
  ];

  /* ================= Стартовый спавн у Эйрика ================= */
  const eirikNpc = w.npcs.find((n) => n.id === "eirik");
  const isSpawnCellFree = (x: number, y: number): boolean => {
    if (!inB(w, x, y)) return false;
    const t = w.tiles[idx(w, x, y)];
    if (isSolidTileId(t) || t === Tl.WATER || t === Tl.POOL) return false;
    return !isCellOccupied(x, y);
  };
  const findFreeSpawnNear = (fx: number, fy: number, maxR: number): Vec | null => {
    for (const villageOnly of [true, false]) {
      for (let r = 1; r <= maxR; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = fx + dx, y = fy + dy;
            if (!isSpawnCellFree(x, y)) continue;
            const t = w.tiles[idx(w, x, y)];
            const road = t === Tl.VILLAGE || t === Tl.PATH;
            if (!villageOnly || road) return { x, y };
          }
        }
      }
    }
    return null;
  };

  if (eirikNpc) {
    const s = findFreeSpawnNear(eirikNpc.x, eirikNpc.y, 4)
      ?? findFreeSpawnNear(eirikNpc.x, eirikNpc.y, 12)
      ?? findWalkableNear(w, eirikNpc.x, eirikNpc.y, 4, rng);
    w.spawn = px(s.x, s.y);
    markOccupied(s.x, s.y);
  } else {
    const g = vA.gates[0];
    const spawnTile: Vec = { x: g.x + 1, y: g.y + 1 };
    switch (vA.gateEdge) {
      case Edge.South: spawnTile.x = g.x + 1; spawnTile.y = g.y - 2; break;
      case Edge.North: spawnTile.x = g.x + 1; spawnTile.y = g.y + 2; break;
      case Edge.West: spawnTile.x = g.x + 2; spawnTile.y = g.y + 1; break;
      case Edge.East: spawnTile.x = g.x - 2; spawnTile.y = g.y + 1; break;
    }
    const s = findFreeSpawnNear(spawnTile.x, spawnTile.y, 4) ?? spawnTile;
    w.spawn = px(s.x, s.y);
    markOccupied(s.x, s.y);
  }

  /* ================= Navmesh ================= */
  w.nav = new NavBuilder().build(w);

  return w;
}
