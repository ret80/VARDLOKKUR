/* RenderQueue.ts — плоская очередь записей на отрисовку (task_14).
 *
 * Все объекты (ground-тайлы, стены, дома, динамические сущности) перед
 * отрисовкой помещаются в RenderEntry. Один flush() на кадр:
 * сортировка по (layer, y) и применение zIndex через IRenderer.
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

/** Запись очереди: всё, что нужно для отрисовки одного Graphics-объекта */
export interface RenderEntry {
  x: number;
  y: number;
  /** 0=ground, 20=drop, 40=dynamic */
  layer: number;
  alpha: number;
  visible: boolean;
  handle: GraphicsHandle;
  /** Необязательный ключ (eid динамической сущности) для быстрого поиска */
  key?: number;
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

  /** Найти запись по ключу (eid) */
  getByKey(key: number): RenderEntry | undefined {
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
   * Применяет alpha/visible/zIndex каждой записи через IRenderer.
   */
  flush(renderer: IRenderer): void {
    // Сортировка по (layer, y) — плоский массив, 1000–1500 элементов
    this.entries.sort((a, b) => a.layer - b.layer || a.y - b.y);
    for (const e of this.entries) {
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
