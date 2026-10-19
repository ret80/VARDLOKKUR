/* Генерация overworld — оркестратор по фазам:
   Ф1 остров+биомы → Ф2 якорные POI и позиции деревень → Ф3 граф →
   Ф4 деревни с воротами → Ф5 дороги → Ф6 сущности → Ф7 декор → Ф8 враги+финиш */
import { mulberry, NoiseGenerator } from "../noise";
import { clamp, px } from "../utils";
import {
  WorldData, Vec, Tl, Biome, NpcDef, EnemyKind, Edge, isSolidTileId,
  VillageResult, GateDef, DungeonEntry, idx, inB, elevLevel, T,
} from "./types";
import { ENEMY_STATS } from "../balance";
import {
  IslandGenerator, R_MOUNT, LEVEL_HEIGHT, H_BASE, ISLAND_RX, ISLAND_RY,
} from "./island-generator";
import { VillageGenerator } from "./village-generator";
import { GlobalRoadGenerator } from "./global-road-generator";
import { NavBuilder } from "./nav-builder";
import { buildTerrainWalls, flattenRampSurfaces, WallBit } from "./terrain-walls";
import { passageMask, forbiddenMask, isPassageTile, STATIC_BODY_R } from "./passages";
import { findWalkableNear, clearAround, floodReach, setTile, tileAt } from "./utils";

/* ---------- Таблица врагов по биомам (Ф8, план §9) ---------- */
interface EnemyEntry { kinds: EnemyKind[]; rare?: EnemyKind; rareChance?: number }
const ENEMY_TABLE: Record<number, EnemyEntry> = {
  [Biome.FOREST]: { kinds: ["shroom", "raven", "draugr"], rare: "spider", rareChance: 0.07 },
  // Призрак — исключительно туманный враг (спавнится только системой тумана),
  // статичный спавн давал «призрака-стояку» без поведения (state=idle вне автомата)
  [Biome.SWAMP]: { kinds: ["crawler", "draugr"] },
  [Biome.MEADOW]: { kinds: ["varg", "raven"], rare: "frost", rareChance: 0.05 },
};
/** Целевое число спавнов по биомам (сумма ~84) */
const ENEMY_QUOTA: Record<number, number> = {
  [Biome.FOREST]: 28, [Biome.SWAMP]: 24, [Biome.MEADOW]: 32,
};

export function generateOverworld(seed: number): WorldData {
  const rng = mulberry(seed);
  const W = 200, H = 140;

  /* ================= Ф1. Остров ================= */
  const island = new IslandGenerator(seed).generate();
  const w = island.w;
  const cx = island.cx, cy = island.cy;

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
  /** Клетка проходима для сущностей (без солидов, воды, болота и берега) */
  const tileOk = (t: number) => !isSolidTileId(t) && t !== Tl.WATER && t !== Tl.POOL && t !== Tl.SHORE;
  const cellOk = (x: number, y: number) => inB(w, x, y) && tileOk(w.tiles[idx(w, x, y)]);
  const freeCell = (x: number, y: number) => cellOk(x, y) && !isCellOccupied(x, y) && !isProtected(x, y);
  /** Клетка не является дорожным покрытием (дороги уже проложены в Ф5) */
  const offRoad = (x: number, y: number) => inB(w, x, y) && w.tiles[idx(w, x, y)] !== Tl.PATH;
  /** Клетка вне проходов (дорога/площадь/лестница): интерактивные коллайдеры
   *  (пьедестал, святилище) не должны вставать на сквозные маршруты — финальная
   *  зачистка Ф9 перенесёт ошибочно placed тела, но здесь экономим перенос. */
  const offPassage = (x: number, y: number): boolean =>
    inB(w, x, y) && !isPassageTile(w.tiles[idx(w, x, y)]);
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

  /** Точка в прибрежном кольце (по нормализованному радиусу эллипса острова) */
  const sampleCoast = (): Vec => {
    const ang = rng() * Math.PI * 2;
    const f = 0.58 + rng() * 0.27; // 0.58..0.85 полуоси → ближе к берегу
    return {
      x: Math.round(cx + Math.cos(ang) * ISLAND_RX * f),
      y: Math.round(cy + Math.sin(ang) * ISLAND_RY * f),
    };
  };

  /** Детерминированный скан биома (надёжный фолбэк к placeInBiome) */
  const scanBiome = (b: number, rMin: number, rMax: number, pred?: (x: number, y: number) => boolean): Vec | null => {
    const cands: Vec[] = [];
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < rMin || d > rMax) continue;
        if (biomeAtXY(x, y) !== b) continue;
        if (!freeCell(x, y)) continue;
        if (pred && !pred(x, y)) continue;
        cands.push({ x, y });
      }
    }
    return cands.length ? cands[Math.floor(rng() * cands.length)] : null;
  };

  /* ================= Ф2. Якорные POI ================= */
  // --- Главный алтарь Древа — в топях (по дизайну); центр острова —
  //     чистая священная гора без солидов. К алтарю примыкают арена,
  //     кольцо руин, дорога и Дочь. ---
  const treeAltar: Vec =
    placeInBiome(Biome.SWAMP, R_MOUNT, 52, 0.45, 5, (x, y) => !nearWater(x, y, 10)) ??
    scanBiome(Biome.SWAMP, R_MOUNT, 56, (x, y) => !nearWater(x, y, 8)) ??
    { x: cx - 38, y: cy + 12 };
  clearAround(w, treeAltar.x, treeAltar.y + 3, 6);
  setTile(w, treeAltar.x, treeAltar.y, Tl.ALTAR);
  w.treeAltar = treeAltar;
  w.arena = { x: treeAltar.x * 16 + 8, y: (treeAltar.y + 3) * 16 + 8, r: 84 };
  w.snakeSpot = { x: treeAltar.x * 16 + 8, y: (treeAltar.y + 2) * 16 };
  markOccupied(treeAltar.x, treeAltar.y);
  markProtected(treeAltar.x, treeAltar.y, 9);
  // Центр острова — священная гора: декор не сеет там солиды
  markProtected(cx, cy, 8);

  // Руины вокруг алтаря: обломки-столбы кольцом r≈9..14 с проходом на юге
  // (там подходит дорога и стоит барьер). Столбы солидны — «просто так не подойти».
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2 + (rng() - 0.5) * 0.18;
    let d = Math.abs(ang - Math.PI / 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < 0.55) continue; // южный проход свободен
    const rad = 9 + rng() * 4.5;
    const x = Math.round(treeAltar.x + Math.cos(ang) * rad);
    const y = Math.round(treeAltar.y + Math.sin(ang) * rad);
    if (!inB(w, x, y)) continue;
    const t = w.tiles[idx(w, x, y)];
    // Кольцо ложится на землю топей (лужи — можно), но не на солиды/дороги
    if (isSolidTileId(t) || t === Tl.WATER || t === Tl.SHORE || t === Tl.PATH) continue;
    if (isCellOccupied(x, y)) continue;
    setTile(w, x, y, rng() < 0.6 ? Tl.COLUMN : Tl.RUINS);
    markOccupied(x, y);
  }

  // --- Входы в подземелья (в биомах, не рядом с алтарём) ---
  const dungeonEntries: DungeonEntry[] = [];
  const farFromAltar = (x: number, y: number) => Math.hypot(x - treeAltar.x, y - treeAltar.y) >= 13;
  const mkEntry = (spot: Vec, id: number, name: string): Vec => {
    clearAround(w, spot.x, spot.y, 2);
    setTile(w, spot.x, spot.y, Tl.STAIRS);
    dungeonEntries.push({ x: spot.x, y: spot.y, id, name });
    markOccupied(spot.x, spot.y);
    markProtected(spot.x, spot.y, 2);
    return spot;
  };

  // Каменная Крепость (giant) → луга (равнина)
  const fortressSpot =
    placeInBiome(Biome.MEADOW, 20, 46, 0.4, 3, farFromAltar) ??
    scanBiome(Biome.MEADOW, 20, 46, farFromAltar) ??
    randRadial(20, 46);
  mkEntry(fortressSpot, 2, "Каменная Крепость");

  // Корень Иггдрасиля (spider) → болото (по требованию)
  const rootSpot =
    placeInBiome(Biome.SWAMP, 20, 46, 0.4, 3, farFromAltar) ??
    scanBiome(Biome.SWAMP, 20, 46, farFromAltar) ??
    randRadial(20, 46);
  mkEntry(rootSpot, 1, "Корень Иггдрасиля");

  // Склеп Хранителя (reaper) → мёртвый лес
  const cryptSpot =
    placeInBiome(Biome.FOREST, 20, 46, 0.4, 3, farFromAltar) ??
    scanBiome(Biome.FOREST, 20, 46, farFromAltar) ??
    randRadial(20, 46);
  mkEntry(cryptSpot, 0, "Склеп Хранителя");

  w.dungeonEntries = dungeonEntries;

  // --- Позиции деревень: у побережья, разбросаны, vA/vB в разных биомах ---
  // Деревни живут только в «жилых» биомах (луга/лес): топь — без деревень,
  // гора — без деревень (rect к тому же обязан целиком лежать на одном
  // уровне высот, см. findVillageRect).
  const sites: Vec[] = [];
  const siteAccept = (p: Vec): boolean => {
    if (!inB(w, p.x, p.y)) return false;
    if (Math.hypot(p.x - cx, p.y - cy) < R_MOUNT + 4) return false;
    if (Math.hypot(p.x - treeAltar.x, p.y - treeAltar.y) < 24) return false;
    if (nearWater(p.x, p.y, 8)) return false;
    if (openRatio(p.x, p.y, 5) < 0.55) return false;
    for (const e of dungeonEntries) if (Math.hypot(p.x - e.x, p.y - e.y) < 14) return false;
    for (const s of sites) if (Math.hypot(p.x - s.x, p.y - s.y) < 34) return false;
    return true;
  };
  /** Прибрежная точка нужного биома (без biome — любой «жилой» сектор) */
  const pickSite = (biome?: number, avoidBiome?: number): Vec | null => {
    for (let i = 0; i < 4000; i++) {
      const p = sampleCoast();
      if (!inB(w, p.x, p.y)) continue;
      const b = biomeAtXY(p.x, p.y);
      if (b !== Biome.MEADOW && b !== Biome.FOREST) continue; // не в топях
      if (biome !== undefined && b !== biome) continue;
      if (avoidBiome !== undefined && b === avoidBiome) continue;
      if (!siteAccept(p)) continue;
      return p;
    }
    return null;
  };
  /** Точка, далёкая от уже выбранных деревень (для фолбэков) */
  const spread = (p: Vec | null): Vec | null =>
    p && sites.every((s) => Math.hypot(s.x - p.x, s.y - p.y) >= 30) ? p : null;
  // Перемешиваем 2 «жилых» сектора: vA и vB — в разных (своё святилище у ворот),
  // vR (сожжённая) — в любом, но не в топях.
  const landOrder = [Biome.MEADOW, Biome.FOREST];
  if (rng() < 0.5) landOrder.reverse();
  const first = pickSite(landOrder[0]);
  if (first) sites.push(first);
  const second = pickSite(landOrder[1]) ?? pickSite(undefined, first ? biomeAtXY(first.x, first.y) : undefined);
  if (second) sites.push(second);
  const third = spread(pickSite(undefined, Biome.SWAMP))
    ?? spread(scanBiome(Biome.MEADOW, 30, 70)) ?? spread(scanBiome(Biome.FOREST, 30, 70));
  if (third) sites.push(third);
  // Фолбэк: добираем до 3 разбросанных «жилых» прибрежных точек
  while (sites.length < 3) {
    const p = spread(pickSite(undefined, Biome.SWAMP))
      ?? spread(scanBiome(Biome.MEADOW, 24, 74)) ?? spread(scanBiome(Biome.FOREST, 24, 74))
      ?? sampleCoast();
    sites.push(p);
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
        case Tl.SNOW: case Tl.SNOW2: case Tl.MEADOW: case Tl.GRASS: cost += 1; break;
        case Tl.WASTE: cost += 1.15; break;
        case Tl.SHORE: cost += 1.4; break;
        case Tl.RUINS: cost += 1.9; break;
        case Tl.FOREST: cost += 2.4; break;
        case Tl.MTN: cost += 2.8; break;
        case Tl.SCREE: cost += 3.0; break;
        case Tl.CLIFF: cost += 5.0; break;
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

  /**
   * Правило «деревня не рассечена террасой»: прямоугольник деревни обязан
   * целиком лежать на одном уровне высот и не содержать клеток топя/воды.
   */
  const rectLevel = (vx: number, vy: number, rw: number, rh: number): number => {
    let lvl = -1;
    for (let y = vy; y <= vy + rh; y++) {
      for (let x = vx; x <= vx + rw; x++) {
        if (!inB(w, x, y)) return -1;
        const i = idx(w, x, y);
        const t = w.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE) return -1;
        if (w.biomes![i] === Biome.SWAMP) return -1;
        const lv = elevLevel(w.height![i]);
        if (lvl < 0) lvl = lv;
        else if (lv !== lvl) return -1;
      }
    }
    return lvl;
  };
  /** Число «плохих» клеток rect (топь/вода) — для фолбэк-поиска */
  const rectBad = (vx: number, vy: number, rw: number, rh: number): number => {
    let bad = 0;
    for (let y = vy; y <= vy + rh; y++)
      for (let x = vx; x <= vx + rw; x++) {
        if (!inB(w, x, y)) { bad += rh; continue; }
        const i = idx(w, x, y);
        const t = w.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE || w.biomes![i] === Biome.SWAMP) bad++;
      }
    return bad;
  };
  /** Аварийное выравнивание: rect ровно в базу, топь/вода — биомом деревни */
  const flattenVillageRect = (vx: number, vy: number, rw: number, rh: number, biome: number): void => {
    for (let y = vy; y <= vy + rh; y++)
      for (let x = vx; x <= vx + rw; x++) {
        if (!inB(w, x, y)) continue;
        const i = idx(w, x, y);
        w.height![i] = H_BASE;
        const b = w.biomes![i];
        if (b === Biome.SWAMP || b === Biome.WATER) w.biomes![i] = biome;
      }
  };
  /** rect не должен захватывать ключевые POI (входы подземельй, алтарь и т.п.) */
  const rectClean = (vx: number, vy: number, rw: number, rh: number): boolean => {
    for (let y = vy; y <= vy + rh; y++)
      for (let x = vx; x <= vx + rw; x++)
        if (isCellOccupied(x, y) || isProtected(x, y)) return false;
    return true;
  };
  /** Позиция rect'а деревни: спиралью ищем «ideальный» rect, иначе выравниваем */
  const findVillageRect = (site: Vec, rw: number, rh: number): Vec => {
    const bx = clamp(site.x - (rw >> 1), 3, W - rw - 4);
    const by = clamp(site.y - (rh >> 1), 3, H - rh - 4);
    let cleanBad: { x: number; y: number; bad: number } | null = null;
    let anyBad: { x: number; y: number; bad: number } | null = null;
    for (let rad = 0; rad <= 12; rad++) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          const vx = clamp(bx + dx, 3, W - rw - 4);
          const vy = clamp(by + dy, 3, H - rh - 4);
          const clean = rectClean(vx, vy, rw, rh);
          if (clean && rectLevel(vx, vy, rw, rh) >= 0) return { x: vx, y: vy };
          const bad = rectBad(vx, vy, rw, rh);
          if (clean && (!cleanBad || bad < cleanBad.bad)) cleanBad = { x: vx, y: vy, bad };
          if (!anyBad || bad < anyBad.bad) anyBad = { x: vx, y: vy, bad };
        }
      }
    }
    // Фолбэк: терраса/топь всё равно не должны резать деревню — ровняем rect
    const p = cleanBad ?? anyBad ?? { x: bx, y: by };
    flattenVillageRect(p.x, p.y, rw, rh, biomeAtXY(site.x, site.y));
    return { x: p.x, y: p.y };
  };
  for (let i = 0; i < 3; i++) {
    const deg = adj[i].length;
    const rw = i === 2 ? 11 : (deg >= 2 ? 15 : 13);
    const rh = i === 2 ? 9 : (deg >= 2 ? 12 : 11);
    const pos = findVillageRect(sites[i], rw, rh);
    const v = villageGen.generate(w, pos.x, pos.y, rw, rh, adj[i]);
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
  const arenaAvoid = (x: number, y: number) => Math.hypot(x - treeAltar.x, y - treeAltar.y) < 8;

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
  // Пилигримская дорога на священную вершину (к южному подножию плато):
  // подъём идёт по террасам ступеньками — видимый маршрут на гору
  roadGen.buildRoad(w, nearestGate({ x: cx, y: cy }), { x: cx, y: cy + 8 }, { avoid: arenaAvoid });

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
    const p = placeInBiome(Biome.FOREST, R_MOUNT, 56, 0.5, 3) ?? scanBiome(Biome.FOREST, R_MOUNT, 56) ?? { x: cx - 20, y: cy - 20 };
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
  // Ворон — у руин центра
  addNpc("raven", "Ворон-Говорун", cx - 12, cy - 9, 6);
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
  const LAND_BIOMES: number[] = [Biome.SNOW, Biome.FOREST, Biome.SWAMP, Biome.MEADOW];
  const shrineCovered = new Set<number>();
  const addShrine = (p: Vec) => {
    clearAround(w, p.x, p.y, 1);
    w.shrines.push({ x: p.x, y: p.y });
    markOccupied(p.x, p.y);
    shrineCovered.add(biomeAtXY(p.x, p.y));
  };
  /** Наружная нормаль ворот (куда «смотрит» вход) */
  const EDGE_NORMAL: Record<number, Vec> = {
    [Edge.North]: { x: 0, y: -1 }, [Edge.South]: { x: 0, y: 1 },
    [Edge.West]: { x: -1, y: 0 }, [Edge.East]: { x: 1, y: 0 },
  };
  /** Святилище в священной роще у алтаря (биом SNOW защищён — ставим напрямую) */
  const snowShrine = (): Vec | null => {
    const offs: [number, number][] = [[6, 0], [-6, 0], [5, 4], [-5, 4], [4, -5], [-4, -5], [5, -4], [-5, -4]];
    for (const [dx, dy] of offs) {
      const x = cx + dx, y = cy + dy;
      if (!inB(w, x, y)) continue;
      const t = w.tiles[idx(w, x, y)];
      if (isSolidTileId(t) || t === Tl.WATER || t === Tl.POOL || t === Tl.SHORE || t === Tl.PATH) continue;
      if (isCellOccupied(x, y)) continue;
      if (biomeAtXY(x, y) !== Biome.SNOW) continue;
      return { x, y };
    }
    return null;
  };

  // 1. Деревни: по одному святилищу СНАРУЖИ у главных ворот (не в деревне), off-road.
  //    Ищем в узком кольце за воротами; перебираем ворота деревни и биом деревни.
  const searchShrineAtGate = (v: VillageResult, bi: number, g: GateDef, strict: boolean): Vec | null => {
    const n = EDGE_NORMAL[g.edge];
    const baseX = Math.round(g.x + 0.5 + n.x * 3.5);
    const baseY = Math.round(g.y + 0.5 + n.y * 3.5);
    const radMax = 9; // поиск в кольце за воротами; жёсткий предел — 9.5 клетки от ворот
    for (let rad = 0; rad <= radMax; rad++) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (rad > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          const x = baseX + dx, y = baseY + dy;
          if (!inB(w, x, y)) continue;
          if (Math.hypot(x - g.x, y - g.y) > 9.5) continue; // святилище — в пределах 10 от ворот
          const t = w.tiles[idx(w, x, y)];
          // построенные клетки деревни исключаем тайлами; природная клетка внутри
          // периметра допустима (деревня могла «съесть» биом вокруг ворот)
          if (isSolidTileId(t) || t === Tl.WATER || t === Tl.POOL || t === Tl.SHORE) continue;
          if (t === Tl.PATH || t === Tl.VILLAGE || t === Tl.PALISADE || t === Tl.HOUSE) continue;
          if (isCellOccupied(x, y)) continue;
          // биом-фильтр — внутри перебора: покрытая клетка не должна обрывать поиск
          const b = biomeAtXY(x, y);
          if (shrineCovered.has(b)) continue;
          if (strict && b !== bi) continue;
          return { x, y };
        }
      }
    }
    return null;
  };
  // Сначала строго по биому деревни у любых её ворот; иначе — ближайшая клетка
  // непокрытого биома (чтобы осталось ровно 4 святилища).
  const assignVillageShrine = (v: VillageResult, bi: number): Vec | null => {
    for (const strict of [true, false]) {
      for (const g of v.gates) {
        const p = searchShrineAtGate(v, bi, g, strict);
        if (p) { addShrine(p); return p; }
      }
    }
    return null;
  };
  assignVillageShrine(vA, siteBiome[0]);
  assignVillageShrine(vB, siteBiome[1]);

  // 2. По одному святилищу в каждом ещё не покрытом биоме
  const shrineForBiome = (b: number): Vec | null => {
    switch (b) {
      case Biome.SNOW: return snowShrine();
      case Biome.FOREST: return placeInBiome(Biome.FOREST, R_MOUNT, 56, 0.5, 3, offPassage) ?? scanBiome(Biome.FOREST, R_MOUNT, 56, offPassage);
      case Biome.SWAMP: return placeInBiome(Biome.SWAMP, R_MOUNT, 56, 0.4, 3, offPassage) ?? scanBiome(Biome.SWAMP, R_MOUNT, 56, offPassage);
      case Biome.MEADOW: return placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.5, 3, offPassage) ?? scanBiome(Biome.MEADOW, R_MOUNT, 56, offPassage);
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
  addChest(placeInBiome(Biome.FOREST, R_MOUNT, 56, 0.5, 3, offPassage) ?? scanBiome(Biome.FOREST, R_MOUNT, 56, offPassage), "bow");
  addChest(placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.5, 3, offPassage) ?? scanBiome(Biome.MEADOW, R_MOUNT, 56, offPassage), "arrows");
  addChest(placeInBiome(Biome.SWAMP, R_MOUNT, 56, 0.4, 3, offPassage) ?? placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.5, 3, offPassage), "heartPiece");

  // Пьедесталы (стражи по биомам)
  const guardPool: EnemyKind[][] = [
    ["frost", "varg"], ["draugr", "shroom"], ["crawler", "draugr"],
    ["draugr", "raven"], ["varg", "varg"],
  ];
  const pedestalSpots = [
    placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.4, 3, offPassage),
    placeInBiome(Biome.FOREST, R_MOUNT, 56, 0.45, 3, offPassage),
    placeInBiome(Biome.SWAMP, R_MOUNT, 56, 0.4, 3, offPassage),
    placeInBiome(Biome.FOREST, R_MOUNT, 56, 0.4, 3, offPassage),
    placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.5, 3, offPassage),
  ];
  pedestalSpots.forEach((p, i) => {
    if (!p) return;
    clearAround(w, p.x, p.y, 2);
    w.pedestals.push({ x: p.x, y: p.y, guards: guardPool[i] });
    markOccupied(p.x, p.y);
  });

  // Квестовые точки
  const spot = (p: Vec | null, fb: Vec): Vec => p ?? fb;
  w.bearSpot = spot(placeInBiome(Biome.SWAMP, R_MOUNT, 56, 0.4, 3, offRoad), { x: cx + 20, y: cy + 20 });
  paint(w.bearSpot.x, w.bearSpot.y, Tl.POOL);
  markOccupied(w.bearSpot.x, w.bearSpot.y);
  w.hornSpot = spot(placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.4, 3), { x: cx, y: cy - 12 });
  markOccupied(w.hornSpot.x, w.hornSpot.y);
  w.meadSpot = spot(placeInBiome(Biome.FOREST, R_MOUNT, 56, 0.5, 3), { x: cx - 16, y: cy - 16 });
  markOccupied(w.meadSpot.x, w.meadSpot.y);
  w.oreSpot = spot(placeInBiome(Biome.SWAMP, R_MOUNT, 56, 0.4, 3), { x: cx + 8, y: cy - 8 });
  markOccupied(w.oreSpot.x, w.oreSpot.y);
  w.mossSpot = spot(placeInBiome(Biome.SWAMP, R_MOUNT, 56, 0.4, 3), { x: cx + 18, y: cy + 4 });
  markOccupied(w.mossSpot.x, w.mossSpot.y);
  w.amberSpot = spot(placeInBiome(Biome.FOREST, R_MOUNT, 56, 0.4, 3), { x: cx + 12, y: cy + 8 });
  markOccupied(w.amberSpot.x, w.amberSpot.y);
  w.flowerSpot = spot(placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.4, 3), { x: cx + 14, y: cy - 6 });
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
  w.relicSpot = spot(placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.5, 3), { x: cx - 24, y: cy + 24 });
  markOccupied(w.relicSpot.x, w.relicSpot.y);
  w.oldAltar = spot(placeFree(w.relicSpot.x + 7, w.relicSpot.y + 3, 5, offRoad), { x: w.relicSpot.x + 5, y: w.relicSpot.y + 3 });
  paint(w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  markOccupied(w.oldAltar.x, w.oldAltar.y);
  w.stashSpot = spot(placeInBiome(Biome.SWAMP, R_MOUNT, 56, 0.4, 3), { x: cx - 14, y: cy + 10 });
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
    spot(placeInBiome(Biome.MEADOW, R_MOUNT, 56, 0.5, 2), { x: cx + 24, y: cy - 8 }),
    spot(placeInBiome(Biome.FOREST, R_MOUNT, 56, 0.5, 2), { x: cx - 20, y: cy + 16 }),
    spot(placeInBiome(Biome.SWAMP, R_MOUNT, 56, 0.4, 2), { x: cx - 8, y: cy - 6 }),
  ];
  w.souls = soulSpots;
  for (const s of soulSpots) markOccupied(s.x, s.y);

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
  /** Высокочастотный детерминированный хеш (для одиночных объектов, без кластеров) */
  const hash = (x: number, y: number, s: number): number => {
    const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
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
      if (t === Tl.FOREST) {
        if (hash(x, y, 41) < 0.02) setTile(w, x, y, Tl.ROCK);
        else if (v > 0.5) setTile(w, x, y, Tl.TREE);
      }
      else if (t === Tl.SWAMP) {
        // Одиночные деревья: высокочастотный хеш даёт изолированные деревья,
        // группы встречаются заметно реже. Топь-лужи — плавным шумом.
        const h = hash(x, y, 53);
        if (h > 0.98) setTile(w, x, y, Tl.FIR);
        else if (h > 0.93) setTile(w, x, y, Tl.DEADTREE);
        else if (hash(x, y, 41) < 0.02) setTile(w, x, y, Tl.ROCK);
        else if (v < 0.3) setTile(w, x, y, Tl.POOL);
      }
      else if (t === Tl.MEADOW) {
        if (hash(x, y, 41) < 0.02) setTile(w, x, y, Tl.ROCK);
        else if (v > 0.5) setTile(w, x, y, Tl.GRASS);
      }
      else if (t === Tl.RUINS) { if (v > 0.76) setTile(w, x, y, Tl.COLUMN); }
      else if (t === Tl.SNOW || t === Tl.SNOW2) {
        // Зимний биом: камней больше, чем в остальных биомах
        if (v > 0.84) setTile(w, x, y, Tl.TREE);
        else if (hash(x, y, 41) < 0.07) setTile(w, x, y, Tl.ROCK);
        else if (v < 0.2) setTile(w, x, y, Tl.SNOW2);
      }
    }
  }

  // Чистка вокруг сущностей (солиды не должны перекрывать объекты и входы)
  for (const n of w.npcs) clearAround(w, n.x, n.y, 1);
  for (const c of w.chests) clearAround(w, c.x, c.y, 1);
  for (const p of w.pedestals) clearAround(w, p.x, p.y, 1);
  for (const e of w.dungeonEntries) clearAround(w, e.x, e.y, 2);
  for (const s of w.shrines) clearAround(w, s.x, s.y, 1);
  for (const s of w.souls) clearAround(w, s.x, s.y, 1);
  clearAround(w, treeAltar.x, treeAltar.y, 8);
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
    // Священная гора (центр) и главный алтарь в топях — без врагов
    if (Math.hypot(x - cx, y - cy) < 13) return true;
    if (Math.hypot(x - treeAltar.x, y - treeAltar.y) < 13) return true;
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
    { x: cx - 13, y: cy - 13, w: 27, h: 27, name: "Священная Гряда" },
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

  /* ================= Уступы террас + пандусы ================= */
  // Высоты есть только у оверворлда: по ним строятся стены обрывов
  // (физика + отрисовка) и пробиваются пандусы — подъём только «где разрешено».
  // Берег и озёра ровняем ещё раз: озёра-лужи появились уже на этапе декора.
  flattenRampSurfaces(w);
  buildTerrainWalls(w, w.spawn);

  // Ворота не должны упираться в уступ: в коридоре перед каждым проёмом
  // снимаем биты стен (деревня целиком на одном уровне — см. findVillageRect,
  // но подступы к воротам остаются «пандусом» на любых соседних террасах).
  if (w.walls) {
    const OPP: Record<number, number> = {
      [WallBit.N]: WallBit.S, [WallBit.S]: WallBit.N,
      [WallBit.E]: WallBit.W, [WallBit.W]: WallBit.E,
    };
    for (const gates of w.villageGates ?? []) {
      for (const g of gates) {
        const n = EDGE_NORMAL[g.edge];
        const bit = n.y < 0 ? WallBit.N : n.y > 0 ? WallBit.S : n.x > 0 ? WallBit.E : WallBit.W;
        const opp = OPP[bit];
        for (let s = 0; s <= 2; s++) {
          for (let k = 0; k < 2; k++) {
            const x = g.x + (n.y !== 0 ? k : 0) + n.x * s;
            const y = g.y + (n.x !== 0 ? k : 0) + n.y * s;
            if (!inB(w, x, y)) continue;
            w.walls[idx(w, x, y)] &= ~bit;
            const nx = x + n.x, ny = y + n.y;
            if (inB(w, nx, ny)) w.walls[idx(w, nx, ny)] &= ~opp;
          }
        }
      }
    }
  }

  /* ================= Ф9. Свободные проходы ================= */
  // Ни одно коллайдер-тело не может стоять на проходе (дорога/площадь/лестница
  // либо открытый стык террас — рампа): на 1-клеточном корidorе тело r ≥ 6 px
  // оставляет зазор меньше диаметра игрока (10 px), и проход непроходим —
  // в частности, терраса со ступенькой становится недоступной. Статику
  // (пьедестал/святилище) и спавны врагов, попавшие на проход, переносим на
  // ближайшую свободную клетку. Враг сохраняет условия своего спавна
  // (биом-предикаты Ф8, удалённость от POI и деревень). Декор НЕ трогаем:
  // солиды на клетках проходов невозможны по построению (Ф7 сеет только на
  // проходимых клетках, Ф7b лишь заменяет солиды дорогой), а террасы
  // сохраняют деревья и врагов — переносится только то, что загораживает проход.
  {
    const passages = passageMask(w);
    const fbCache = new Map<number, Uint8Array>();
    const forbidden = (r: number): Uint8Array => {
      let m = fbCache.get(r);
      if (!m) { m = forbiddenMask(w, passages, r); fbCache.set(r, m); }
      return m;
    };
    /** Клетка перекрыта телом радиуса r (центр тела = центр клетки)? */
    const blocks = (x: number, y: number, r: number): boolean =>
      !inB(w, x, y) || forbidden(r)[idx(w, x, y)] === 1;
    /** Ближайшая клетка, свободная для тела r и допускающая pred (спираль ≤16). */
    const spotFor = (fx: number, fy: number, r: number, pred: (x: number, y: number) => boolean): Vec | null => {
      const fb = forbidden(r);
      for (let rad = 1; rad <= 16; rad++) {
        let best: Vec | null = null, bestD = Infinity;
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
            const x = fx + dx, y = fy + dy;
            if (!inB(w, x, y)) continue;
            if (fb[idx(w, x, y)] || !cellOk(x, y) || isCellOccupied(x, y)) continue;
            if (!pred(x, y)) continue;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = { x, y }; }
          }
        }
        if (best) return best;
      }
      return null;
    };

    // 1. Статические коллайдеры (r=6): пьедесталы и святилища.
    const moveStatic = (p: Vec, strictPred: (x: number, y: number) => boolean): void => {
      const s = spotFor(p.x, p.y, STATIC_BODY_R, strictPred) ?? spotFor(p.x, p.y, STATIC_BODY_R, () => true);
      if (!s) return;
      occupied.delete(K(p.x, p.y));
      p.x = s.x; p.y = s.y;
      markOccupied(s.x, s.y);
    };
    for (const p of w.pedestals) {
      if (!blocks(p.x, p.y, STATIC_BODY_R)) continue;
      moveStatic(p, (x, y) => openRatio(x, y, 1) >= 0.5);
    }
    for (const s of w.shrines) {
      if (!blocks(s.x, s.y, STATIC_BODY_R)) continue;
      const b = biomeAtXY(s.x, s.y);
      moveStatic(s, (x, y) => biomeAtXY(x, y) === b && openRatio(x, y, 1) >= 0.5);
    }

    // 2. Спавны врагов: радиус индивидуален (ENEMY_STATS), место — с теми же
    //    условиями Ф8. «Живые» POI пересобираются после переноса статики.
    const livePois: Vec[] = [
      ...allGates, treeAltar,
      ...w.dungeonEntries.map((e) => ({ x: e.x, y: e.y })),
      ...w.shrines, ...w.npcs.map((n) => ({ x: n.x, y: n.y })),
      ...w.chests.map((c) => ({ x: c.x, y: c.y })),
      ...w.pedestals.map((p) => ({ x: p.x, y: p.y })),
      w.bearSpot, w.hornSpot, w.meadSpot, w.oreSpot, w.mossSpot, w.amberSpot,
      w.flowerSpot, w.diarySpot, w.bundleSpot, w.relicSpot, w.oldAltar, w.stashSpot,
      ...w.souls,
    ];
    const spawnOk = (x: number, y: number): boolean =>
      !noSpawn(x, y) && !nearVillage(x, y) &&
      livePois.every((p) => Math.hypot(p.x - x, p.y - y) >= 8);
    const kept: typeof w.spawns = [];
    for (const sp of w.spawns) {
      const r = ENEMY_STATS[sp.kind].r;
      const ex = Math.floor(sp.x / T), ey = Math.floor(sp.y / T);
      if (!blocks(ex, ey, r)) { kept.push(sp); continue; }
      // Перенос сохраняет «принадлежность» спавна: сожжённая деревня (свои
      // правила) или биом+вид (таблица Ф8). Сначала строго то же место,
      // затем — вид всё ещё допустим для биома; иначе спавн убираем.
      const inVr = ex >= vR.x0 && ex <= vR.x1 && ey >= vR.y0 && ey <= vR.y1;
      // Прямоугольник совпадает с зоной «Сожжённая Деревня» (zones: x < x1).
      const vrRect = (x: number, y: number): boolean =>
        x >= vR.x0 && x < vR.x1 && y >= vR.y0 && y < vR.y1;
      const b0 = biomeAtXY(ex, ey);
      const kindOk = (x: number, y: number): boolean => {
        const t = ENEMY_TABLE[biomeAtXY(x, y)];
        return !!t && (t.kinds.includes(sp.kind) || t.rare === sp.kind);
      };
      const s = inVr
        ? spotFor(ex, ey, r, vrRect) ?? spotFor(ex, ey, r, kindOk)
        : spotFor(ex, ey, r, (x, y) => biomeAtXY(x, y) === b0 && spawnOk(x, y))
          ?? spotFor(ex, ey, r, (x, y) => kindOk(x, y) && spawnOk(x, y));
      if (!s) continue; // безопасного места нет — спавн убираем, проход важнее
      occupied.delete(K(ex, ey));
      markOccupied(s.x, s.y);
      sp.x = s.x * T + T / 2; sp.y = s.y * T + T / 2;
      kept.push(sp);
    }
    w.spawns = kept;
  }

  /* ================= Navmesh ================= */
  w.nav = new NavBuilder().build(w);

  return w;
}
