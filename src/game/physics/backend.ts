/* backend.ts — выбор физического движка.
 *
 * По умолчанию — Rapier3D (WASM). `?physics=planck` возвращает старый 2D-движок
 * (фолбэк, если WASM недоступен или нужен эталон поведения).
 */

import { PlanckWorld } from './planck-world';
import { RapierWorld, initRapier, isRapierReady } from './rapier-world';
import type { IPhysicsWorld } from './types';
import { logger } from '../debug/logger';

export type PhysicsBackend = 'rapier' | 'planck';

/** Выбранный в URL движок (без учёта доступности WASM). */
export function preferredPhysicsBackend(): PhysicsBackend {
  if (typeof window === 'undefined') return 'rapier';
  const mode = new URLSearchParams(window.location.search).get('physics');
  return mode === 'planck' || mode === '2d' ? 'planck' : 'rapier';
}

/** Инициализировать выбранный движок (Rapier требует async init WASM). */
export async function preparePhysics(): Promise<PhysicsBackend> {
  if (preferredPhysicsBackend() === 'planck') {
    logger.info('physics', 'Physics backend: Planck.js (2D, explicit)');
    return 'planck';
  }
  const ok = await initRapier();
  if (!ok) {
    logger.warn('physics', 'Physics backend: Planck.js (Rapier unavailable)');
    return 'planck';
  }
  logger.info('physics', 'Physics backend: Rapier3D');
  return 'rapier';
}

/** Создать мир физики выбранного движка. */
export function createPhysicsWorld(): IPhysicsWorld {
  if (preferredPhysicsBackend() === 'rapier' && isRapierReady()) {
    return new RapierWorld();
  }
  return new PlanckWorld();
}
