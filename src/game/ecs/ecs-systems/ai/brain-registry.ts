/* brain-registry.ts — реестр мозгов врагов.
 *
 * AI-система не знает о конкретных видах: она берёт мозг по строковому kind из
 * `StringPool.enemyKinds` через реестр (принцип открытости/закрытости — добавление
 * нового вида не требует изменения AI-системы).
 */

import type { EnemyKind } from '../../../generators/types';
import type { EnemyBrain } from './brain';

export type BrainFactory = () => EnemyBrain;

/**
 * Реестр мозгов: kind → фабрика. Экземпляры кэшируются, т.к. мозги
 * без состояния (stateless).
 */
export class BrainRegistry {
  private readonly factories = new Map<string, BrainFactory>();
  private readonly cache = new Map<string, EnemyBrain>();

  constructor(private readonly fallback: EnemyBrain) {}

  /** Зарегистрировать мозг для вида врага. */
  register(kind: EnemyKind, factory: BrainFactory): this {
    this.factories.set(kind, factory);
    this.cache.delete(kind);
    return this;
  }

  /** Мозг для вида; неизвестный вид получает fallback (бродяга). */
  get(kind: string): EnemyBrain {
    let brain = this.cache.get(kind);
    if (!brain) {
      const factory = this.factories.get(kind);
      brain = factory ? factory() : this.fallback;
      this.cache.set(kind, brain);
    }
    return brain;
  }

  has(kind: string): boolean {
    return this.factories.has(kind);
  }
}
