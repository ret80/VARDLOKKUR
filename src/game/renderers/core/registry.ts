/* renderers/core/registry.ts — типизированный реестр рендереров (SOLID: OCP) */

import type { Renderer } from "./types";

/**
 * Реестр рендереров по строковому ключу (вид сущности: "ghost", "heart", ...).
 * Добавление нового вида = создание класса + вызов register() в реестре,
 * без правок существующих switch.
 */
export class RendererRegistry<TKey extends string, TData> {
  private readonly map = new Map<TKey, Renderer<TData>>();

  register(key: TKey, r: Renderer<TData>): this {
    this.map.set(key, r);
    return this;
  }

  get(key: TKey): Renderer<TData> | undefined {
    return this.map.get(key);
  }

  /**
   * Вернуть рендерер по ключу или бросить ошибку, если он не зарегистрирован.
   * Используется в диспетчерах, где отсутствие рендерера — это программная ошибка
   * (например, объект окружения заспавнен без своего рендерера в реестре).
   */
  getOrThrow(key: TKey): Renderer<TData> {
    const r = this.map.get(key);
    if (!r) {
      throw new Error(`Renderer for "${key}" not found in registry`);
    }
    return r;
  }

  has(key: TKey): boolean {
    return this.map.has(key);
  }

  keys(): IterableIterator<TKey> {
    return this.map.keys();
  }
}