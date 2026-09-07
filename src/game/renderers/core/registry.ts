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

  has(key: TKey): boolean {
    return this.map.has(key);
  }

  keys(): IterableIterator<TKey> {
    return this.map.keys();
  }
}