/* ecs-world.ts — инициализация мира bitECS и управление временем */

import { createWorld, type World, type WorldContext as BitecsWorldContext } from 'bitecs';

/** Контекст мира с таймингом */
export interface WorldContext {
  time: {
    delta: number;
    elapsed: number;
    then: number;
  };
}

// Re-export World from bitecs for compatibility
export type { World };

let _world: World<WorldContext> | null = null;

/** Создать новый ECS мир */
export function createEcsWorld(): World<WorldContext> {
  const context: WorldContext = {
    time: {
      delta: 0,
      elapsed: 0,
      then: performance.now(),
    },
  };
  _world = createWorld(context);
  return _world;
}

/** Получить текущий ECS мир */
export function getEcsWorld(): World<WorldContext> {
  if (!_world) throw new Error('ECS world not initialized. Call createEcsWorld() first.');
  return _world;
}

/** Обновить таймер мира (вызывать каждый кадр) */
export function updateWorldTime(world: World<WorldContext>, rdt: number): void {
  const { time } = world;
  const now = performance.now();
  const delta = now - time.then;
  time.delta = delta;
  time.elapsed += delta;
  time.then = now;

  // Используем rdt (real delta) для стабильности, но сохраняем structure
  time.delta = rdt * 1000; // convert seconds to ms
  time.elapsed += time.delta;
}

/** Сбросить таймер мира */
export function resetWorldTime(world: World<WorldContext>): void {
  world.time.delta = 0;
  world.time.elapsed = 0;
  world.time.then = performance.now();
}

/** Уничтожить мир */
export function destroyEcsWorld(): void {
  _world = null;
}
