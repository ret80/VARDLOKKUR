/* RenderQueue.ts — плоская очередь записей на отрисовку (task_14).
 *
 * Immediate mode: каждый кадр системы enqueue-ят свои объекты,
 * flush(renderer, viewport) — одна сортировка, один проход, очистка.
 *
 * Y-sort: zIndex = layer * 100000 + Math.round(y)
 */

import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';

/** Множитель слоя при вычислении zIndex */
export const LAYER_Z_MULTIPLIER = 100000;

/** Стандартные слои отрисовки */
export const RENDER_LAYER = {
  /** Фон (все ground-тайлы — один Graphics-батч) */
  GROUND: 0,
  /** Дропы */
  DROP: 20,
  /** Стены, дома, NPC, враги, игрок, снаряды */
  DYNAMIC: 40,
  /** Подсказки, UI, оверлеи (поверх всего) */
  OVERLAY: 9999,
} as const;

/**
 * Viewport — область видимости камеры в мировых координатах.
 * camX/camY — левый верхний угол видимой области, viewW/viewH — её размеры.
 */
export interface Viewport {
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
}

/** Запись очереди: всё, что нужно для отрисовки одного Graphics-объекта */
export interface RenderEntry {
  x: number;
  y: number;
  /** 0=ground, 20=drop, 40=dynamic, 9999=overlay */
  layer: number;
  alpha: number;
  visible: boolean;
  handle: GraphicsHandle;
  /** Ширина bounding box объекта (для viewport culling). 0/undefined — без отсечения по размеру */
  width?: number;
  /** Высота bounding box объекта (для viewport culling) */
  height?: number;
  /** Пропустить viewport culling (для screen-space элементов: подсказок, UI) */
  skipCull?: boolean;
}

/** Дефолтный размер объекта для culling, если width/height не заданы (тайл ~32px + запас на высоту спрайта) */
const DEFAULT_CULL_SIZE = 64;

/**
 * Проверка попадания bounding box объекта во viewport (AABB-пересечение).
 * Объект считается видимым, если его рамка [x, x+width] × [y, y+height]
 * пересекается с рамкой камеры. Небольшой запас (pad) исключает «мигание»
 * объектов на границе экрана.
 */
export function isInViewport(e: RenderEntry, vp: Viewport, pad = DEFAULT_CULL_SIZE): boolean {
  const w = e.width ?? DEFAULT_CULL_SIZE;
  const h = e.height ?? DEFAULT_CULL_SIZE;
  return (
    e.x + w + pad >= vp.camX &&
    e.x - pad <= vp.camX + vp.viewW &&
    e.y + h + pad >= vp.camY &&
    e.y - pad <= vp.camY + vp.viewH
  );
}

/** Вычислить zIndex по слою и Y */
export function computeZIndex(layer: number, y: number): number {
  return layer * LAYER_Z_MULTIPLIER + Math.round(y);
}

/**
 * RenderQueue — плоский массив RenderEntry.
 * В кадре 1000–1500 записей — сортировка тривиальна.
 *
 * Immediate mode: enqueue → flush (сортировка + culling + применение + clear).
 */
export class RenderQueue {
  private entries: RenderEntry[] = [];

  /** Добавить запись в очередь */
  enqueue(e: RenderEntry): void {
    this.entries.push(e);
  }

  /**
   * Финальный проход кадра: одна сортировка, один проход.
   *
   * 1. Сортировка записей по (layer, y).
   * 2. Viewport culling: если передан viewport и bounding box записи не
   *    пересекается с областью видимости камеры — вызовы IRenderer для неё
   *    пропускаются (объект скрывается через setGraphicsVisible(false),
   *    чтобы он не остался на экране после предыдущего кадра).
   * 3. Для видимых записей применяются позиция/alpha/visible/zIndex
   *    через IRenderer.
   * 4. Очистка очереди.
   */
  flush(renderer: IRenderer, viewport?: Viewport): void {
    // Сортировка по (layer, y) — плоский массив, 800–1500 элементов
    this.entries.sort((a, b) => a.layer - b.layer || a.y - b.y);
    for (const e of this.entries) {
      // Viewport culling: гарантированно невидимые объекты не трогаем
      // (кроме принудительного скрытия, т.к. в прошлом кадре они могли быть видны)
      // skipCull=true — пропуск culling (для screen-space элементов: подсказок, UI)
      if (viewport && !e.skipCull && !isInViewport(e, viewport)) {
        if (e.visible) renderer.setGraphicsVisible(e.handle, false);
        continue;
      }
      renderer.setGraphicsPosition(e.handle, { x: e.x, y: e.y });
      renderer.setGraphicsAlpha(e.handle, e.alpha);
      renderer.setGraphicsVisible(e.handle, e.visible);
      renderer.setGraphicsZIndex(e.handle, computeZIndex(e.layer, e.y));
    }
    this.entries.length = 0;
  }
}

// ============================================================
// Глобальная очередь отрисовки
// ============================================================

/** Единственная очередь кадра (создаётся в engine.init, доступна системам) */
let _renderQueue: RenderQueue | null = null;

/** Установить глобальную очередь (вызывается один раз из Engine.init) */
export function setGlobalRenderQueue(q: RenderQueue): void {
  _renderQueue = q;
}

/** Получить глобальную очередь (или null до инициализации) */
export function getRenderQueue(): RenderQueue | null {
  return _renderQueue;
}
