/* MapTileCache — кэш Graphics по типу тайла.
 *
 * Один Graphics на каждый уникальный тип тайла (Tl.XXX).
 * Координаты (x,y) применяются в RenderQueue каждый кадр.
 *
 * Эффект: 1200 ground тайлов → ~15-20 Graphics вместо 1200.
 * Draw calls сокращаются в ~60x.
 */

import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import { drawTileLocal } from '../geometry/tile-geom';

export class MapTileCache {
  private cache = new Map<number, GraphicsHandle>();

  /** Получить или создать Graphics для типа тайла */
  getOrCreate(tileType: number, renderer: IRenderer): GraphicsHandle {
    let handle = this.cache.get(tileType);
    if (handle) return handle;

    handle = renderer.createGraphics();
    renderer.setGraphicsPosition(handle, { x: 0, y: 0 });

    // Рисуем тайл один раз в (0,0)
    drawTileLocal(handle, tileType, 0, 0, renderer);

    this.cache.set(tileType, handle);
    return handle;
  }

  /** Уничтожить все кэшированные Graphics */
  destroyAll(renderer: IRenderer): void {
    for (const handle of this.cache.values()) {
      renderer.destroyGraphics(handle);
    }
    this.cache.clear();
  }

  /** Количество уникальных типов тайлов в кэше */
  get size(): number {
    return this.cache.size;
  }
}
