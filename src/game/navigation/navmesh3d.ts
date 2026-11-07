/* navmesh3d.ts — 3D-поиск пути на navmesh (navcat / Recast+Detour алгоритмы).
 *
 * Заменяет 2D-библиотеку `navmesh` (плоские полигоны в XY + порталы). Теперь
 * navmesh строится из той же треугольной поверхности рельефа, что идёт в
 * рендер: учитываются реальные высоты террас, пандусы и утёсы.
 *
 * Наружу (WorldData.nav / enemy-path.ts) отдаётся привычный контракт
 * `findPath({x, y}, {x, y}) → точки в игровых пикселях`, поэтому AI-системы
 * не меняются.
 */

import {
  DEFAULT_QUERY_FILTER,
  FindPathResultFlags,
  findPath as navcatFindPath,
  type NavMesh,
  type Vec3,
} from 'navcat';
import { generateSoloNavMesh } from 'navcat/blocks';
import { buildTerrainMesh, PX_PER_UNIT, type TerrainMap } from '../world3d/terrain-mesh';
import { logger } from '../debug/logger';
import type { INavMesh, NavPathPoint } from './nav-mesh';

export type { INavMesh, NavPathPoint } from './nav-mesh';

/**
 * Проходимость агента (в мировых единицах: 16 px = 1).
 *
 * Радиус 5 px эродировал террасные коридоры и пандусы шире одной клетки
 * heightfield: подъёмы на возвышенности отрезались и поиск пути возвращал null.
 * 3 px оставляют полосу достаточной ширины (физика всё равно не даёт врагам
 * залезать в утёсы).
 */
const AGENT_RADIUS_W = 3 / PX_PER_UNIT;
const AGENT_HEIGHT_W = 14 / PX_PER_UNIT;
const CELL_SIZE = 0.2;
const CELL_HEIGHT = 0.25;
/**
 * Максимальный подъём агента. Терраса выше нижней клетки на TERRACE_HEIGHT
 * (0.6), а соединяют их пандусы — без запаса recast считал соседние террасы
 * разными компонентами и поиск пути на возвышенности возвращал null.
 * Утёсы при этом остаются стеной: в nav-геометрии они выше на 1.5 террасы.
 */
const WALKABLE_CLIMB_W = 0.7;
const SLOPE_DEG = 55;

export class NavMesh3D implements INavMesh {
  private constructor(
    private readonly mesh: NavMesh,
    /** Полуразмеры агента для запросов (в мировых единицах). */
    private readonly halfExtents: Vec3,
  ) {}

  /**
   * Построить navmesh из карты. Возвращает null, если геометрия слишком мала
   * или генерация не удалась — вызывающий код может откатиться на 2D-navmesh.
   */
  static build(map: TerrainMap): NavMesh3D | null {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const terrain = buildTerrainMesh(map);
    const { positions, indices } = terrain.nav;

    if (indices.length < 6) return null;

    const walkableRadiusVoxels = Math.max(1, Math.ceil(AGENT_RADIUS_W / CELL_SIZE));
    const walkableClimbVoxels = Math.max(1, Math.ceil(WALKABLE_CLIMB_W / CELL_HEIGHT));
    const walkableHeightVoxels = Math.max(1, Math.ceil(AGENT_HEIGHT_W / CELL_HEIGHT));

    try {
      const { navMesh } = generateSoloNavMesh(
        { positions, indices },
        {
          cellSize: CELL_SIZE,
          cellHeight: CELL_HEIGHT,
          walkableRadiusWorld: AGENT_RADIUS_W,
          walkableRadiusVoxels,
          walkableClimbWorld: WALKABLE_CLIMB_W,
          walkableClimbVoxels,
          walkableHeightWorld: AGENT_HEIGHT_W,
          walkableHeightVoxels,
          walkableSlopeAngleDegrees: SLOPE_DEG,
          borderSize: 0,
          minRegionArea: 2,
          mergeRegionArea: 4,
          maxSimplificationError: 1.1,
          maxEdgeLength: 4,
          maxVerticesPerPoly: 6,
          detailSampleDistance: CELL_SIZE,
          detailSampleMaxError: CELL_HEIGHT,
        },
      );

      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      logger.info('nav3d', `NavMesh3D built in ${(t1 - t0).toFixed(1)}ms (tris=${indices.length / 3})`);

      return new NavMesh3D(navMesh, [AGENT_RADIUS_W, AGENT_HEIGHT_W / 2, AGENT_RADIUS_W]);
    } catch (err) {
      logger.warn('nav3d', `NavMesh3D generation failed: ${String(err)}`);
      return null;
    }
  }

  /** Путь в игровых пикселях; null — пути нет (разные компоненты связности). */
  findPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): NavPathPoint[] | null {
    const start: Vec3 = [from.x / PX_PER_UNIT, 0, from.y / PX_PER_UNIT];
    const end: Vec3 = [to.x / PX_PER_UNIT, 0, to.y / PX_PER_UNIT];

    const result = navcatFindPath(this.mesh, start, end, this.halfExtents, DEFAULT_QUERY_FILTER);
    if (!result.success || result.path.length === 0) return null;
    // Partial path = цель недостижима (остров/закрытая стена) — для AI это «нет пути».
    if ((result.flags & FindPathResultFlags.COMPLETE_PATH) === 0) return null;

    return result.path.map((p) => ({
      x: p.position[0] * PX_PER_UNIT,
      y: p.position[2] * PX_PER_UNIT,
    }));
  }

  /** Внутренний navmesh (для отладки/визуализации). */
  get raw(): NavMesh {
    return this.mesh;
  }
}
