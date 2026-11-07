/* nav-mesh.ts — общий контракт навигационной сетки (без зависимостей).
 * Отделён от реализации, чтобы generators/types.ts не тянул navcat/three.
 */

/** Точка пути в игровых пикселях. */
export interface NavPathPoint {
  x: number;
  y: number;
}

/** Навигационная сетка: путь между двумя точками мира (игровые пиксели). */
export interface INavMesh {
  findPath(from: { x: number; y: number }, to: { x: number; y: number }): NavPathPoint[] | null;
}
