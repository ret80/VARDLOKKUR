/* RenderQueue.ts — плоская очередь записей на отрисовку (task_14).
 *
 * Все объекты (ground-тайлы, стены, дома, динамические сущности) перед
 * отрисовкой помещаются в RenderEntry. Один flush(renderer, viewport) на кадр:
 * сортировка по (layer, y), viewport culling по bounding box объекта и
 * применение позиции/alpha/visible/zIndex через IRenderer (только для видимых).
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
  /** 0=ground, 20=drop, 40=dynamic */
  layer: number;
  alpha: number;
  visible: boolean;
  handle: GraphicsHandle;
  /** Ширина bounding box объекта (для viewport culling). 0/undefined — без отсечения по размеру */
  width?: number;
  /** Высота bounding box объекта (для viewport culling) */
  height?: number;
  /** Необязательный ключ (eid динамической сущности) для быстрого поиска */
  key?: number;
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
 */
export class RenderQueue {
  private entries: RenderEntry[] = [];

  /** Добавить запись в очередь (если у неё есть key — зарегистрировать по ключу) */
  enqueue(e: RenderEntry): void {
    this.entries.push(e);
    if (e.key !== undefined) this.byKey.set(e.key, e);
  }

  /** Удалить все записи с данным handle (при уничтожении графики) */
  remove(handle: GraphicsHandle): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].handle === handle) {
        const e = this.entries[i];
        if (e.key !== undefined) this.byKey.delete(e.key);
        this.entries.splice(i, 1);
      }
    }
  }

  /** Найти запись по ключу (eid динамической сущности или строковый ключ батча) */
  getByKey(key: string | number): RenderEntry | undefined {
    return this.byKey.get(key);
  }

  /** Обновить запись под ключом (создаётся при первом update) */
  upsert(key: string | number, make: () => RenderEntry): RenderEntry {
    let e = this.byKey.get(key);
    if (!e) {
      e = make();
      this.enqueue(e);
      this.byKey.set(key, e);
    }
    return e;
  }

  /** Удалить запись под ключом, вернув её handle (или null) */
  takeByKey(key: string | number): GraphicsHandle | null {
    const e = this.byKey.get(key);
    if (!e) return null;
    this.byKey.delete(key);
    this.remove(e.handle);
    return e.handle;
  }

  /** Ключевые записи (для динамических сущностей, живущих между кадрами) */
  private byKey = new Map<string | number, RenderEntry>();

  /** Количество записей */
  get size(): number {
    return this.entries.length;
  }

  /** Итерация по всем записям (для внешних систем) */
  forEach(fn: (e: RenderEntry) => void): void {
    for (const e of this.entries) fn(e);
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
   */
  flush(renderer: IRenderer, viewport?: Viewport): void {
    // Сортировка по (layer, y) — плоский массив, 1000–1500 элементов
    this.entries.sort((a, b) => a.layer - b.layer || a.y - b.y);
    for (const e of this.entries) {
      // Viewport culling: гарантированно невидимые объекты не трогаем
      // (кроме принудительного скрытия, т.к. в прошлом кадре они могли быть видны)
      if (viewport && !isInViewport(e, viewport)) {
        if (e.visible) renderer.setGraphicsVisible(e.handle, false);
        continue;
      }
      renderer.setGraphicsPosition(e.handle, { x: e.x, y: e.y });
      renderer.setGraphicsAlpha(e.handle, e.alpha);
      renderer.setGraphicsVisible(e.handle, e.visible);
      renderer.setGraphicsZIndex(e.handle, computeZIndex(e.layer, e.y));
    }
  }

  /** Освободить все Graphics-ресурсы очереди и очистить её */
  clear(renderer: IRenderer): void {
    for (const e of this.entries) {
      try {
        renderer.destroyGraphics(e.handle);
      } catch {
        // уже уничтожен — игнорируем
      }
    }
    this.entries.length = 0;
    this.byKey.clear();
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
