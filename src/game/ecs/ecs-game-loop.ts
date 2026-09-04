/* ecs-game-loop.ts — минимальный ECS game loop */

import { type World, query } from 'bitecs';
import {
  syncPositionToBody,
  syncVelocityToBody,
  syncBodyToPosition,
} from './ecs-systems/physics-system';
import {
  playerMovementSystem,
  directionFromVelocitySystem,
} from './ecs-systems/movement-system';
import {
  stateTimerSystem,
  magnetSystem,
} from './ecs-systems/life-system';
import {
  lifeCheckSystem,
  deathCleanupSystem,
} from './ecs-systems/life-system';
import {
  swordAttackSystem,
  axeThrowSystem,
  arrowShootSystem,
  projectileUpdateSystem,
  projectileEnemyCollisionSystem,
  damageEnemy,
  damagePlayer,
  updateProjectilesEcs,
  hitEnemy,
  killEnemy,
  damageSnake,
  damagePlayerEcs,
  fireProjectileEcs,
} from './ecs-systems/combat-system';
import {
  aiUpdateSystem,
} from './ecs-systems/ai-system';
import {
  dropsUpdateSystem,
} from './ecs-systems/drops-system';
import {
  fogUpdateSystem,
  createFogState,
} from './ecs-systems/fog-system';
import {
  tryInteract,
  onEnemyKilledEcs,
} from './ecs-systems/interaction-system';
import {
  renderSystem,
} from './ecs-systems/render-system';
import {
  updatePlayerInput,
  processActions,
  updateBow,
} from './ecs-systems/input-system';
import type { InputState } from '../input/input-system';
import {
  updateDoors,
  updateZone,
  checkDungeonBoss,
} from './ecs-systems/world-system';
import { hasComponent } from 'bitecs';
import { Position, Velocity, PhysicsBody, Player, Direction } from './ecs-components';
import type { InputSystem } from '../input/input-system';
import type { EventBus } from '../event-bus';
import type { GameStore } from '../store';
import type { PlanckWorld } from '../physics/planck-world';
import type { Application, Container } from 'pixi.js';
import type { FxManager } from '../fx';
import type { StateManager } from '../state/state-manager';

// ============================================================
// Конфигурация Game Loop
// ============================================================

export interface EcsGameLoop {
  tick: (rdt: number, timeScale: number) => void;
  render: (rdt: number) => void;
  realT: number;
  setPlayerEid: (eid: number) => void;
  getPlayerEid: () => number;
  isDungeonBossDead: (id: number) => boolean;
}

export interface EcsGameLoopConfig {
  world: World;
  bus: EventBus;
  store: GameStore;
  planckWorld: PlanckWorld;
  app: Application;
  dynamic: Container;
  floatLayer: Container;
  gameWorld: Container;
  fx: FxManager;
  input: InputSystem;
  state: StateManager;
  cam: { x: number; y: number };
  viewW: number;
  viewH: number;
  map: any;
  ow: any;
  flags: any;
  talkedSig: any;
  dialogueActive: boolean;
  stepT: number;
  realT: number;
  stepTRef: number;
  realTRef: number;
  playerEid: number;
  playerDomain: any;
  hud: any;
  quests: any;
  dialogue: any;
  drops: any;
  fog: any;
  combat: any;
  ai: any;
  interaction: any;
  dungeonBossDead: (id: number) => boolean;
  toast: (msg: string) => void;
  float: (x: number, y: number, text: string, color: number) => void;
  pushHud: (force?: boolean) => void;
  startDialogue: (id: string) => void;
  npcSig: (id: string) => string;
  onStepAudio: () => void;
}

// ============================================================
// ECS Game Loop
// ============================================================

/** Создать минимальный ECS Game Loop */
export function createEcsGameLoop(config: EcsGameLoopConfig) {
  const {
    world, bus, store, planckWorld, app, dynamic, floatLayer, gameWorld,
    input, state, cam, map, flags, playerEid: playerEidRef,
    playerDomain, hud, quests, dialogue, drops, fog, combat, ai, interaction,
    dungeonBossDead, toast, float: addFloat, pushHud, startDialogue, npcSig,
    onStepAudio, stepTRef, realTRef,
  } = config;

  let _stepT = stepTRef;
  let _realT = realTRef;
  let _playerEid = playerEidRef;

  /** Выполнить один кадр */
  function tick(rdt: number, timeScale: number): void {
    const dt = rdt * timeScale;
    const peid = _playerEid;

    // console.log('\n[GAME LOOP] ===== FRAME ===== peid=', peid, 'dt=', dt.toFixed(4));

    // ===== 1. Захват ввода ОДИН раз за кадр =====
    const inputState: InputState = input.getState();

    // ===== 2. Ввод и движение игрока =====
    const inputResult = updatePlayerInput(world, peid, input, _stepT, _realT, onStepAudio, (eid) => {}, inputState);
    _stepT = inputResult.stepT;
    _realT = inputResult.realT;
    
    // ===== 3. Обработка действий =====
    processActions(input, bus, () => {
      tryInteract(world, peid, store, bus, (id: string) => startDialogue(id));
    }, inputState);

    // ===== 4. Лук =====
    updateBow(world, peid, input, bus, flags, () => {
      addFloat(Position.x[peid], Position.y[peid], "Нет стрел", 0xc9a24b);
    });

    // ===== 5. Sync Velocity → Physics Body =====
    syncVelocityToBody(world);

    // console.log('[GAME LOOP] Before physics step: Position.x[peid]=', Position.x[peid], 'Position.y[peid]=', Position.y[peid]);

    // ===== 6. Физика Planck.js (шаг) =====
    planckWorld.step(dt);

    // console.log('[GAME LOOP] After physics step: Position.x[peid]=', Position.x[peid], 'Position.y[peid]=', Position.y[peid]);

    // ===== 7. Синхронизация: Planck.js body → Position =====
    syncBodyToPosition(world);

    // console.log('[GAME LOOP] After syncBodyToPosition: Position.x[peid]=', Position.x[peid], 'Position.y[peid]=', Position.y[peid]);

    // ===== 8. Остальные сущности без физики =====
    {
      const { x: px, y: py } = Position;
      const { x: vx, y: vy } = Velocity;
      for (const eid of query(world, [Position, Velocity])) {
        if (eid === peid) continue;
        if (hasComponent(world, eid, PhysicsBody)) continue;
        px[eid] += vx[eid] * dt;
        py[eid] += vy[eid] * dt;
      }
    }

    // ===== 9. Направление из скорости =====
    directionFromVelocitySystem(world);

    // ===== 10. Синхронизация в store.player =====
    if (peid >= 0) {
      store.player.x = Position.x[peid];
      store.player.y = Position.y[peid];
      store.player.vx = Velocity.x[peid];
      store.player.vy = Velocity.y[peid];
      store.player.moving = Player[peid]?.moving ?? false;
      store.player.slowT = Player[peid]?.slowT ?? 0;
      store.player.animT = Player[peid]?.animT ?? 0;
      store.player.swingT = Player[peid]?.swingT ?? 0;
      store.player.hurtT = Player[peid]?.hurtT ?? 0;
      store.player.dir.x = Direction.x[peid];
      store.player.dir.y = Direction.y[peid];

      // PlayerDomain sync
      playerDomain?.syncFrom({
        x: store.player.x, y: store.player.y,
        vx: store.player.vx, vy: store.player.vy,
        hp: store.player.hp, maxHp: store.player.maxHp,
        swingT: store.player.swingT, hurtT: store.player.hurtT, slowT: store.player.slowT,
      });
      playerDomain?.syncToPlayer(store.player);
    }

    // ===== 11. Таймеры состояний =====
    stateTimerSystem(world, dt);

    // ===== 12. AI врагов =====
    if (map && peid >= 0) {
      aiUpdateSystem(world, peid, map, dt, () => {}, () => {});
    }

    // ===== 13. Обновить снаряды (ECS) =====
    updateProjectilesEcs(
      world,
      dt,
      peid,
      flags.ghostBane,
      planckWorld,
      (eid) => {}, // onProjectileRemove
      addFloat,
      () => {}, // audio.clang
      () => {}, // audio.hit
      () => {}, // audio.freeze
      () => {}, // onEnemyHit
      () => {}, // onEnemyKilled
      () => {}, // onPlayerDamaged
      () => {}, // onSnakeDeath
      playerDomain
    );

    // ===== 14. Обновить дропы (ECS) =====
    dropsUpdateSystem(
      world,
      dt,
      peid,
      store,
      bus,
      () => {}, // onDropRemove
      playerDomain
    );

    // ===== 15. Обновить туман (ECS) =====
    const fogState = createFogState();
    fogUpdateSystem(
      world,
      peid,
      dt,
      rdt,
      fogState,
      map,
      flags,
      bus,
      (kind: string, x: number, y: number) => -1, // spawnEnemyInEcs - заглушка
      () => flags.runes
    );

    // ===== 16. Двери, зоны, боссы =====
    updateDoors(world, peid, store, flags, toast, pushHud);
    updateZone(world, peid, map, store, toast);
    checkDungeonBoss(world, peid, map, dungeonBossDead, bus);
  }

  /** Выполнить ECS рендеринг */
  function render(rdt: number): void {
    renderSystem(
      world,
      _playerEid,
      _realT,
      app,
      floatLayer,
      rdt,
      cam,
      gameWorld
    );
  }

  return {
    tick,
    render,
    get realT() { return _realT; },
    set realT(v: number) { _realT = v; },
    setPlayerEid: (eid: number) => { _playerEid = eid; },
    getPlayerEid: () => _playerEid,
    isDungeonBossDead: (id: number) => dungeonBossDead(id),
  };
}
