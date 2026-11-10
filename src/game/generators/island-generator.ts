/* Генерация острова: снежная гора из 3 вложенных террас в центре и
   3 сектора-биома вокруг (лес/топи/луга), см. tasks/world_gen_imp_3.md */
import { mulberry, NoiseGenerator } from "../noise";
import { WorldData, Tl, Vec, Biome, idx, inB, elevLevel, isSolidTileId } from "./types";
import { flattenRampSurfaces } from "./terrain-walls";

/** Центр острова и биом-карты */
export const ICX = 100, ICY = 70;

/**
 * Террасы горы: [полуосьX, полуосьY, уровень высоты].
 *
 * Структура строго вложена (предгорье ⊃ высокогорье ⊃ вершина): эллипсы
 * концентричны, а их полуоси попарно монотонны, поэтому точка внутри
 * внутренней террасы всегда внутри внешней. Границы колышутся по углу ОДНИМ
 * общим шумом (см. mountainTier) — вложение сохраняется точно.
 */
const MTN_ELL: ReadonlyArray<readonly [number, number, number]> = [
  [36, 31, 1],  // предгорье (тёмно-серое, как на world.png)
  [23, 17, 3],  // высокогорье (серое)
  [14, 10, 5],  // вершина (белая)
];
/** Максимальный радиус горы с учётом колыхания границ (полуось 36 × 1.11) */
export const R_MOUNT = 40;
/** Полуоси эллипса острова (для сэмплинга прибрежных точек) */
export const ISLAND_RX = 94, ISLAND_RY = 64;

/* Ровные высоты террас: и уровень (elevLevel), и тон отрисовки берутся из
   них, поэтому кромка террасы всегда резкая и одинаковая по всей карте. */
/** Океан/лужи/берег */
export const H_WATER = 0.05;
/** Базовый уровень суши (лес/топи/луга) */
export const H_BASE = 0.10;
/** Малая возвышенность-пятно (9) внутри луга */
export const H_SPOT = 0.20;
/** Высота уровней высот 0..ELEV_LEVELS */
export const LEVEL_HEIGHT: ReadonlyArray<number> = [H_BASE, H_SPOT, 0.40, 0.54, 0.70, 0.87];

export interface IslandResult {
  w: WorldData;
  cx: number;
  cy: number;
}

export class IslandGenerator {
  readonly W = 200;
  readonly H = 140;
  private tiles: Uint8Array;
  private biomes: Uint8Array;
  private height: Float32Array;
  private rng: () => number;
  private noiseIsland: NoiseGenerator;
  private noiseA: NoiseGenerator;
  private noiseB: NoiseGenerator;
  private noiseHills: NoiseGenerator;
  private noiseDetail: NoiseGenerator;
  private cx = ICX;
  private cy = ICY;

  constructor(seed: number) {
    this.rng = mulberry(seed);
    this.tiles = new Uint8Array(this.W * this.H).fill(Tl.SNOW);
    this.biomes = new Uint8Array(this.W * this.H).fill(Biome.SNOW);
    this.height = new Float32Array(this.W * this.H).fill(0);
    this.noiseIsland = new NoiseGenerator(seed ^ 0x5ea);
    this.noiseA = new NoiseGenerator((seed * 2654435761) | 0);
    this.noiseB = new NoiseGenerator((seed * 40503) | 0);
    this.noiseHills = new NoiseGenerator(seed * 131542391);
    this.noiseDetail = new NoiseGenerator(seed * 1009);
  }

  public generate(): IslandResult {
    this.buildIsland();
    this.buildBiomes();
    this.smoothBiomes();
    this.protectReserved();
    // Высоты считаем ПОСЛЕ финальной раскладки биомов: болото всегда база,
    // снег — только террасы горы, пятна-возвышенности — только на лугах.
    this.assignHeights();
    this.applyBiomesToTiles();
    // Логовое озерцо на возвышенности + ручей до моря + мост (Ф1.5)
    this.carveHillPondStream();
    // Ровные берег и озёра (см. flattenRampSurfaces): внутри полосы берега
    // иначе набираются невидимые микроперепады, по которым игрок поднимался
    // сквозь уступ. Поздние озёра-лужи ровняются в overworld перед стенами.
    flattenRampSurfaces({ tiles: this.tiles, height: this.height });
    const w = this.createWorldData();
    return { w, cx: this.cx, cy: this.cy };
  }

  /* ---------- Ф1.1 Форма острова (эллипс + шум) ---------- */
  private buildIsland(): void {
    const RX = ISLAND_RX, RY = ISLAND_RY;
    const normDist = (x: number, y: number) => Math.hypot((x - this.cx) / RX, (y - this.cy) / RY);
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const d = normDist(x, y) + (this.noiseIsland.value(x * 0.055, y * 0.055) - 0.5) * 0.22;
        if (d > 1) this.setTile(x, y, Tl.WATER);
        else if (d > 0.93) this.setTile(x, y, Tl.SHORE);
      }
    }
  }

  /* ---------- Ф1.2 Карта биомов: гора-снег + 3 сектора ---------- */
  private buildBiomes(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const t = this.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE) {
          this.biomes[i] = Biome.WATER;
          continue;
        }
        this.biomes[i] = this.computeBiome(x, y);
      }
    }
  }

  private computeBiome(x: number, y: number): number {
    // Снег ≡ footprint горы: сектора биомов начинаются у края горы,
    // поэтому топи/луга/лес никогда не садятся на террасы.
    if (this.mountainTier(x, y) > 0) return Biome.SNOW;
    const ang = Math.atan2(y - this.cy, x - this.cx)
      + (this.noiseB.value(x * 0.05, y * 0.05) - 0.5) * 0.7;
    return this.sectorBiome(ang);
  }

  /** Сектора (по 120°): лес — север, топи — запад-юго-запад, луга — восток */
  private sectorBiome(ang: number): number {
    const TAU = Math.PI * 2;
    const P = Math.PI;
    let a = ang % TAU;
    if (a < 0) a += TAU;
    if (a >= P * (7 / 6) && a < P * (11 / 6)) return Biome.FOREST; // 210°..330° (север)
    if (a >= P * (1 / 2) && a < P * (7 / 6)) return Biome.SWAMP;   // 90°..210° (запад)
    return Biome.MEADOW;                                           // 330°..90° (восток)
  }

  /**
   * Уровень горы в клетке: 0 — вне горы, 1 — предгорье, 3 — высокогорье,
   * 5 — вершина. Границы эллипсов колышутся по углу ОДНИМ общим множителем,
   * поэтому строгое вложение террас (6 ⊃ 7 ⊃ 8) сохраняется для любой точки.
   */
  private mountainTier(x: number, y: number): number {
    const dx = x - this.cx, dy = y - this.cy;
    if (dx * dx + dy * dy > R_MOUNT * R_MOUNT) return 0;
    const ang = Math.atan2(dy, dx);
    const wob = 1 + (this.noiseHills.value(Math.cos(ang) * 1.9, Math.sin(ang) * 1.9) - 0.5) * 0.22;
    for (let k = MTN_ELL.length - 1; k >= 0; k--) {
      const [rx, ry, lv] = MTN_ELL[k];
      if (Math.hypot(dx / rx, dy / ry) * wob < 1) return lv;
    }
    return 0;
  }

  /**
   * Тёмное пятно-возвышенность (9) внутри луга: шумовой островок, который
   * обязан целиком лежать в лугу (кольцо клеток — тоже луг), чтобы терраса
   * не резала соседний биом.
   */
  private isHillSpot(x: number, y: number): boolean {
    if (this.noiseHills.value(x * 0.11 + 53.7, y * 0.11 + 21.3) < 0.75) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!inB(this, x + dx, y + dy)) return false;
        if (this.biomes[idx(this, x + dx, y + dy)] !== Biome.MEADOW) return false;
      }
    return true;
  }

  /**
   * Уровень рельефа дикой суши: широкие террасы от низкого шума.
   *
   * Раньше вся суша, кроме горы, лежала на одном уровне (H_BASE), поэтому
   * в 3D остров выглядел плоской плитой. Теперь луг и лес поднимаются
   * широкими «столами» до 3 уровня, а перепады проходят по тем же правилам
   * уступов/пандусов (generators/terrain-walls), что и гора. Топь остаётся
   * ровной низиной — это болото.
   */
  private reliefTier(x: number, y: number): number {
    const n = this.noiseHills.value(x * 0.03 + 11.3, y * 0.03 + 7.9);
    if (n > 0.86) return 3;
    if (n > 0.74) return 2;
    if (n > 0.62) return 1;
    return 0;
  }

  /** Поле высот: ровные «столы» террас по биомам (финальная раскладка) */
  private assignHeights(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const b = this.biomes[i];
        if (b === Biome.WATER) { this.height[i] = H_WATER; continue; }
        if (b === Biome.SNOW) { this.height[i] = LEVEL_HEIGHT[this.mountainTier(x, y)]; continue; }
        if (b === Biome.SWAMP) { this.height[i] = H_BASE; continue; } // топь — всегда база
        this.height[i] = LEVEL_HEIGHT[this.reliefTier(x, y)];
      }
    }
  }

  /* ---------- Сглаживание биомов ---------- */
  private smoothBiomes(): void {
    for (let iter = 0; iter < 2; iter++) {
      const copy = this.biomes.slice();
      for (let y = 2; y < this.H - 2; y++) {
        for (let x = 2; x < this.W - 2; x++) {
          const i = idx(this, x, y);
          const b = copy[i];
          if (b === Biome.WATER) continue;
          const cnt = new Map<number, number>();
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const bb = copy[idx(this, x + dx, y + dy)];
              if (bb === Biome.WATER) continue;
              cnt.set(bb, (cnt.get(bb) ?? 0) + 1);
            }
          const own = cnt.get(b) ?? 0;
          let maj = b, mv = 0;
          cnt.forEach((v, k) => { if (v > mv) { mv = v; maj = k; } });
          if (own <= 2 && mv >= 5) this.biomes[i] = maj;
        }
      }
    }
  }

  /**
   * Снежный биом ≡ footprint горы ПОСЛЕ сглаживания: выпавшие из горы
   * «снежные острова» возвращаются в секторный биом, а затёртые сектором
   * клетки горы — снова снег. Иначе терраса могла «переехать» на чужой биом.
   */
  private protectReserved(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        if (this.biomes[i] === Biome.WATER) continue;
        if (this.mountainTier(x, y) > 0) this.biomes[i] = Biome.SNOW;
        else if (this.biomes[i] === Biome.SNOW) {
          const ang = Math.atan2(y - this.cy, x - this.cx)
            + (this.noiseB.value(x * 0.05, y * 0.05) - 0.5) * 0.7;
          this.biomes[i] = this.sectorBiome(ang);
        }
      }
    }
  }

  /* ---------- Ф1.4 Биом → тайлы с учётом высот ---------- */
  /**
   * Раскладка тайлов по биому и уровню высоты.
   *
   * Высоты задают рельеф, но ВСЕ наземные тайлы здесь — проходимые
   * (никаких солидов), чтобы не рвать дороги и связность мира.
   * Кромка террасы НЕ выкладывается камнем (CLIFF/SCREE): кромка несёт
   * грунт собственного плато, а сам уступ рисует оверлей рельефа в
   * tile-geom (drawRelief) гранью с палитрой биома — в снегу это светлый
   * холодный камень со снежной кромкой, а не чужая серая плита.
   * Физику уступа даёт маска стен по полю высот (terrain-walls), не тайлы.
   */
  private applyBiomesToTiles(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const t = this.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE) continue;
        const lv = elevLevel(this.height[i]);
        switch (this.biomes[i]) {
          case Biome.FOREST:
            // Лес живёт на базовом уровне; границы — дело оверлея рельефа
            this.tiles[i] = Tl.FOREST;
            break;
          case Biome.SWAMP:
            // Низина без террас; лужи — по шуму (высота тут постоянная)
            if (this.noiseA.value(x * 0.13, y * 0.13) > 0.68) this.tiles[i] = Tl.POOL;
            else this.tiles[i] = Tl.SWAMP;
            break;
          case Biome.MEADOW:
            // Возвышенности-пятна (9): тёмная роща на всём пятне, включая
            // кромку — пятно читается как тёмно-зелёное без серого обода.
            // Тайл больше НЕ зависит от уровня: рельеф луга — это высота,
            // а не смена травы на лес.
            this.tiles[i] = this.isHillSpot(x, y) ? Tl.FOREST : Tl.MEADOW;
            break;
          case Biome.SNOW:
          default:
            // Горные террасы: плато и его кромка — тайл своего уровня
            // (предгорье тёмно-серое, высокогорье серое, вершина белая)
            if (lv >= 5) this.tiles[i] = Tl.SNOW;
            else if (lv >= 3) this.tiles[i] = Tl.SNOW2;
            else this.tiles[i] = Tl.MTN;
            break;
        }
      }
    }
  }

  /* ---------- Ф1.5. Луговое озерцо с ручьём и мостом ---------- */
  /**
   * Озерцо на луговой возвышенности и ручей, стекающий в море.
   *
   * Раньше луг был просто террасами без воды: ни озёр, ни ручьёв. Теперь на
   * ровном луговом плато (уровень ≥ 2) выкапывается небольшое озерцо, а от
   * него по земле вниз идёт русло — оно тянется по террасам до моря и на
   * каждом перепаде даёт водопад (грань «вода над водой» в 3D-меше).
   *
   * Русло прорезается только по проходимому грунту: деревья и камни дороже
   * (прорубаем в крайнем случае), постройки и скалы — непроходимы для выбора.
   * Где-то посередине ручья ставится мост (тайл BRIDGE) — единственный
   * переход через водную преграду.
   */
  /**
   * Озерцо на луговой возвышенности, ручей до моря и мост через него.
   *
   * Раньше луг был просто террасами без воды. Теперь на ровном луговом плато
   * (уровень >= 2, подальше от берега) выкапывается небольшое озерцо, а от
   * него вниз по земле тянется русло до самого моря: оно идёт по террасам,
   * и на каждом перепаде в 3D-меше появляется грань водопада. Где-то
   * посередине ручья ставится мост (тайл BRIDGE) — единственный переход.
   *
   * Кандидаты перебираются по очереди: если от площадки не находится
   * достаточно длинного русла, берётся следующая.
   */
  private carveHillPondStream(): void {
    const W = this.W, H = this.H, N = W * H;
    const at = (x: number, y: number): number => y * W + x;
    const inb = (x: number, y: number): boolean => this.inBounds(x, y);
    const lvAt = (x: number, y: number): number => elevLevel(this.height[at(x, y)]);
    const tileAt = (x: number, y: number): number => this.tiles[at(x, y)];
    const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    const sea = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (this.tiles[i] === Tl.WATER) sea[i] = 1;

    // Расстояние до моря в клетках: озерцо не должно стоять у самого берега,
    // иначе ручей вырождается в две клетки.
    const seaDist = new Int32Array(N).fill(-1);
    {
      const q: number[] = [];
      for (let i = 0; i < N; i++) if (sea[i]) { seaDist[i] = 0; q.push(i); }
      for (let h = 0; h < q.length; h++) {
        const cur = q[h];
        const cx2 = cur % W, cy2 = (cur / W) | 0;
        for (const [dx, dy] of DIRS) {
          const nx = cx2 + dx, ny = cy2 + dy;
          if (!inb(nx, ny)) continue;
          const ni = at(nx, ny);
          if (seaDist[ni] !== -1) continue;
          seaDist[ni] = seaDist[cur] + 1;
          q.push(ni);
        }
      }
    }

    const soft = (t: number): boolean =>
      t === Tl.MEADOW || t === Tl.GRASS || t === Tl.FOREST || t === Tl.SWAMP;
    const rough = (t: number): boolean =>
      t === Tl.TREE || t === Tl.ROCK || t === Tl.FIR || t === Tl.DEADTREE || t === Tl.COLUMN;

    /* --- 1. Площадки: ровный луг на возвышенности --- */
    /** Скан площадок: луг, ровно по уровню, с запасом свободного грунта. */
    const collect = (minLevel: number, r: number, seaMin = 26): Vec[] => {
      const out: Vec[] = [];
      for (let y = 8; y < H - 8; y++) {
        for (let x = 8; x < W - 8; x++) {
          const i = at(x, y);
          if (this.biomes[i] !== Biome.MEADOW) continue;
          if (!soft(this.tiles[i])) continue;
          const lvl = lvAt(x, y);
          if (lvl < minLevel) continue;
          const d = Math.hypot(x - this.cx, y - this.cy);
          if (d < 20 || d > 88) continue;
          if (seaDist[i] < seaMin) continue;
          let ok = true;
          for (let dy = -r; dy <= r && ok; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx, ny = y + dy;
              if (!inb(nx, ny)) { ok = false; break; }
              const ni = at(nx, ny);
              if (this.biomes[ni] !== Biome.MEADOW) { ok = false; break; }
              if (lvAt(nx, ny) !== lvl) { ok = false; break; }
              if (!soft(this.tiles[ni])) { ok = false; break; }
            }
          }
          if (ok) out.push({ x, y });
        }
      }
      return out;
    };

    // Сначала высокие плато, потом пониже: если на сиде нет высокого ровного
    // луга, озерцо встанет на малую возвышенность, но всё равно будет.
    const tiers = [collect(2, 3), collect(1, 2), collect(1, 2, 14)];
    const cands: Vec[] = [];
    for (const list of tiers) {
      // Детерминированно перемешиваем: на разных сидах озерцо в разных лугах.
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      }
      for (const c of list) if (!cands.some((p) => p.x === c.x && p.y === c.y)) cands.push(c);
    }
    if (cands.length === 0) return;
    // Чем дальше от моря — тем длиннее получится ручей.
    cands.sort((a, b) => seaDist[at(b.x, b.y)] - seaDist[at(a.x, a.y)]);

    const TRIES = Math.min(cands.length, 24);
    let best: { pond: Vec[]; path: number[] } | null = null;
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const c = cands[attempt];

      /* --- 2. Озерцо: круг радиусом ~2 клетки --- */
      const pond: Vec[] = [];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy > 4) continue;
          const x = c.x + dx, y = c.y + dy;
          if (!inb(x, y)) continue;
          pond.push({ x, y });
        }
      }
      const pondSet = new Set<number>(pond.map((p) => at(p.x, p.y)));

      /* --- 3. Русло: самый дешёвый спуск к морю (Дейкстра) --- */
      const dist = new Int32Array(N).fill(-1);
      const prev = new Int32Array(N).fill(-1);
      const heap: number[] = [];
      const swap = (a: number, b: number): void => {
        const tmp = heap[a]; heap[a] = heap[b]; heap[b] = tmp;
      };
      const push = (i: number): void => {
        heap.push(i);
        let k = heap.length - 1;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (dist[heap[p]] <= dist[heap[k]]) break;
          swap(p, k);
          k = p;
        }
      };
      const pop = (): number => {
        const top = heap[0];
        const last = heap.pop() as number;
        if (heap.length) {
          heap[0] = last;
          let k = 0;
          for (;;) {
            const l = k * 2 + 1, r = l + 1;
            let m = k;
            if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l;
            if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r;
            if (m === k) break;
            swap(m, k);
            k = m;
          }
        }
        return top;
      };

      // Старт — проходимая земля вокруг озерца.
      for (const p of pond) {
        for (const [dx, dy] of DIRS) {
          const nx = p.x + dx, ny = p.y + dy;
          if (!inb(nx, ny)) continue;
          const ni = at(nx, ny);
          if (pondSet.has(ni) || dist[ni] === 0) continue;
          const t = this.tiles[ni];
          if (!soft(t) && !rough(t)) continue;
          dist[ni] = 0;
          push(ni);
        }
      }

      // Дейкстра только по СУШЕ: берег и воду русло не трогает, иначе ручей
      // побежит вдоль пляжа и у моста не окажется берегов.
      for (let iter = 0; iter < 40000 && heap.length; iter++) {
        const cur = pop();
        const cx2 = cur % W, cy2 = (cur / W) | 0;
        for (const [dx, dy] of DIRS) {
          const nx = cx2 + dx, ny = cy2 + dy;
          if (!inb(nx, ny)) continue;
          const ni = at(nx, ny);
          if (pondSet.has(ni)) continue;
          const t = this.tiles[ni];
          let cost: number;
          if (soft(t)) cost = 10;
          else if (rough(t)) cost = 90;      // прорубаем только в крайнем случае
          else continue;                     // вода, берег, постройки, скалы
          const dl = lvAt(nx, ny) - lvAt(cx2, cy2);
          if (dl > 0) cost += 30 * dl;       // подъём невыгоден
          else if (dl === 0) cost += 2;      // ровный участок почти как спуск
          const nd = dist[cur] + cost;
          if (dist[ni] !== -1 && dist[ni] <= nd) continue;
          dist[ni] = nd;
          prev[ni] = cur;
          push(ni);
        }
      }

      // Устье — самая дешёвая достижимая клетка у самого берега.
      let goal = -1, goalCost = Infinity;
      for (let i = 0; i < N; i++) {
        if (dist[i] < 0 || dist[i] >= goalCost) continue;
        const gx = i % W, gy = (i / W) | 0;
        let nearShore = false;
        for (const [dx, dy] of DIRS) {
          const nx = gx + dx, ny = gy + dy;
          if (!inb(nx, ny)) continue;
          if (this.tiles[at(nx, ny)] === Tl.SHORE || sea[at(nx, ny)]) { nearShore = true; break; }
        }
        if (!nearShore) continue;
        goal = i;
        goalCost = dist[i];
      }
      if (goal < 0) continue;

      // Восстановление пути: от устья вверх, к озерцу.
      const path: number[] = [];
      let cur = goal;
      for (let guard = 0; cur !== -1 && guard < 400; guard++) {
        path.push(cur);
        cur = prev[cur];
      }
      path.reverse();
      if (path.length < 4 || path.length > 90) continue;
      if (!best || path.length > best.path.length) best = { pond, path };
      if (best.path.length >= 12) break;   // достаточно длинное русло — хватит
    }
    if (!best) return;

    /* --- 4. Прорезаем воду --- */
    for (const p of best.pond) this.tiles[at(p.x, p.y)] = Tl.STREAM;
    for (const i of best.path) {
      if (this.tiles[i] !== Tl.SHORE) this.tiles[i] = Tl.STREAM;
    }
    this.placeStreamBridge(best.path);
  }

  /**
   * Мост через ручей: клетка русла, у которой берега с двух сторон.
   *
   * Доски должны опираться на сушу того же уровня — иначе мост висит над
   * обрывом. Из подходящих клеток берётся ближайшая к середине ручья.
   */
  private placeStreamBridge(path: number[]): void {
    const W = this.W;
    const at = (x: number, y: number): number => y * W + x;
    const lvAt = (x: number, y: number): number => elevLevel(this.height[at(x, y)]);
    const land = (x: number, y: number): boolean => {
      if (!this.inBounds(x, y)) return false;
      const t = this.tiles[at(x, y)];
      if (t === Tl.WATER || t === Tl.POOL || t === Tl.STREAM || t === Tl.BRIDGE) return false;
      return !isSolidTileId(t);
    };
    const water = (x: number, y: number): boolean => {
      if (!this.inBounds(x, y)) return false;
      const t = this.tiles[at(x, y)];
      return t === Tl.WATER || t === Tl.POOL || t === Tl.STREAM;
    };

    const midIdx = path[Math.floor(path.length * 0.55)];
    const mx = midIdx % W, my = (midIdx / W) | 0;

    /** Лучшая клетка русла под мост: нужен проход поперёк воды. */
    const pick = (sameLevelOnly: boolean, loose = false): number => {
      let best = -1, bestD = Infinity;
      let looseBest = -1, looseScore = -Infinity;
      for (const i of path) {
        if (this.tiles[i] !== Tl.STREAM && this.tiles[i] !== Tl.WATER) continue;
        const x = i % W, y = (i / W) | 0;
        const lvl = lvAt(x, y);
        const lvlOk = (bx: number, by: number): boolean =>
          !sameLevelOnly || (this.inBounds(bx, by) && lvAt(bx, by) === lvl);
        if (loose) {
          // Ручей идёт наискось: «поперёк» проверять не на чем — берём
          // клетку с наибольшим числом берегов рядом и поближе к середине.
          const banks = (land(x - 1, y) ? 1 : 0) + (land(x + 1, y) ? 1 : 0)
            + (land(x, y - 1) ? 1 : 0) + (land(x, y + 1) ? 1 : 0);
          const score = banks * 10 - Math.hypot(x - mx, y - my);
          if (score > looseScore) { looseScore = score; looseBest = i; }
          continue;
        }
        // Ручей течёт север-юг — мост поперёк, берега запад/восток (и наоборот).
        const acrossWE = land(x, y - 1) && land(x, y + 1)
          && water(x - 1, y) && water(x + 1, y)
          && lvlOk(x, y - 1) && lvlOk(x, y + 1);
        const acrossNS = land(x - 1, y) && land(x + 1, y)
          && water(x, y - 1) && water(x, y + 1)
          && lvlOk(x - 1, y) && lvlOk(x + 1, y);
        if (!acrossWE && !acrossNS) continue;
        const d = Math.hypot(x - mx, y - my);
        if (d < bestD) { bestD = d; best = i; }
      }
      return loose ? looseBest : best;
    };

    // Сначала ровные берега на уровне настила, затем просто два берега,
    // и в крайнем случае — клетка, где берегов рядом больше всего.
    let best = pick(true);
    if (best < 0) best = pick(false);
    if (best < 0) best = pick(false, true);
    if (best >= 0) this.tiles[best] = Tl.BRIDGE;
  }

  /* ---------- WorldData ---------- */
  private createWorldData(): WorldData {
    const w: WorldData = {
      W: this.W, H: this.H, tiles: this.tiles, nav: null as unknown as import("../navigation/nav-mesh").INavMesh,
      isDungeon: false, dungeonId: -1, dungeonName: "", bossReward: null,
      spawn: { x: 0, y: 0 }, zones: [], shrines: [], npcs: [], chests: [],
      pedestals: [], spawns: [], doors: [], souls: [], ambient: [], dungeonEntries: [],
      exitSpot: { x: 0, y: 0 }, hornSpot: { x: 0, y: 0 }, meadSpot: { x: 0, y: 0 },
      oreSpot: { x: 0, y: 0 }, bearSpot: { x: 0, y: 0 },
      mossSpot: { x: 0, y: 0 }, amberSpot: { x: 0, y: 0 }, flowerSpot: { x: 0, y: 0 },
      diarySpot: { x: 0, y: 0 }, bundleSpot: { x: 0, y: 0 }, relicSpot: { x: 0, y: 0 },
      oldAltar: { x: 0, y: 0 }, stashSpot: { x: 0, y: 0 }, ruinedVillage: { x: 0, y: 0 },
      // Алтарь Древа по дизайну живёт в топях; позицию назначает overworld.
      treeAltar: { x: this.cx, y: this.cy }, arena: { x: 0, y: 0, r: 92 }, snakeSpot: { x: 0, y: 0 },
      villageA: { x: 0, y: 0 }, villageB: { x: 0, y: 0 },
      bossRoom: { x: 0, y: 0, w: 0, h: 0 }, bossSpot: { x: 0, y: 0 }, entryStairs: { x: 0, y: 0 },
      ruinedHouses: [],
      biomes: this.biomes,
      height: this.height,
    };
    return w;
  }

  private setTile(x: number, y: number, t: number): void {
    if (this.inBounds(x, y)) this.tiles[idx(this, x, y)] = t;
  }
  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
}
