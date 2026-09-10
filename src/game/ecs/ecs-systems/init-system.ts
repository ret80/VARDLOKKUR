/* init-system.ts — инициализация ECS мира и префабов

   Логика создания префабов перенесена в EntityFactory.initPrefabs().
   Этот модуль оставлен как точка входа для обратной совместимости.
*/

import { type World } from 'bitecs';

// ============================================================
// Публичный API
// ============================================================

/**
 * Инициализировать все префабы.
 *
 * @deprecated Используйте EntityFactory.initPrefabs() вместо этого метода.
 * Этот метод сохранён для обратной совместимости — он больше не создаёт префабы.
 */
export function initPrefabs(_world: World): void {
  // Логика перенесена в EntityFactory.initPrefabs()
  // Префабы больше не создаются в игровом мире
}

/** Получить префаб игрока — больше не используется */
export function getPlayerPrefab(): number | null {
  return null;
}

/** Получить префаб врага по типу — больше не используется */
export function getEnemyPrefab(_kind: string): number | null {
  return null;
}
