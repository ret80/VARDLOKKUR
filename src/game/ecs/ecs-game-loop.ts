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
  DropHandlerRegistry,
} from '../drop-handlers';
import {
  fogUpdateSystem,
  createFogState,
  type FogState,
} from './ecs-systems/fog-system';
import {
  tryInteract,
  onEnemyKilledEcs,
  type GuardSpawnCallback,
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
import {
  Position, Velocity, PhysicsBody, Player, Direction,
  Drop, poolGet, StringPool, PhysicsBodyRegistry,
} from './ecs-components';
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
  getDropsForTransition: () => Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }>;
  setPlanckWorld: (pw: PlanckWorld) => void;
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
  dungeonBossDead: (id: number) => boolean;
  toast: (msg: string) => void;
  float: (x: number, y: number, text: string, color: number) => void;
  pushHud: (force?: boolean) => void;
  startDialogue: (id: string) => void;
  npcSig: (id: string) => string;
  onStepAudio: () => void;
  /** Callback для спавна стражей пьедестала (kind, x, y) */
  guardSpawn?: GuardSpawnCallback;
}

/** Глобальный singleton registry дропов */
let _dropRegistry: DropHandlerRegistry | null = null;
function getDropRegistry(): DropHandlerRegistry {
  if (!_dropRegistry) _dropRegistry = new DropHandlerRegistry();
  return _dropRegistry;
}

// ============================================================
// ECS Game Loop
// ============================================================

/** Создать минимальный ECS Game Loop */
export function createEcsGameLoop(config: EcsGameLoopConfig) {
  const {
    world, bus, store, planckWorld, app, dynamic, floatLayer, gameWorld,
    input, state, cam, map, flags, playerEid: playerEidRef,
    playerDomain, hud, quests, dialogue,
    dungeonBossDead, toast, float: addFloat, pushHud, startDialogue, npcSig,
    onStepAudio, stepTRef, realTRef, guardSpawn,
  } = config;

  let _stepT = stepTRef;
  let _realT = realTRef;
  let _playerEid = playerEidRef;
  let _planckWorld = planckWorld;
  let _fogState: FogState | null = null;

  /** Выполнить один кадр */
  function tick(rdt: number, timeScale: number): void {
    const dt = rdt * timeScale;
    const peid = _playerEid;

    // ===== 1. Захват ввода ОДИН раз за кадр =====
    const inputState: InputState = input.getState();

    // ===== 2. Ввод и движение игрока =====
    const inputResult = updatePlayerInput(world, peid, input, _stepT, _realT, onStepAudio, (eid) => {}, inputState);
    _stepT = inputResult.stepT;
    _realT = inputResult.realT;
    
    // ===== 3. Обработка действий =====
    processActions(input, bus, () => {
      tryInteract(world, peid, store, bus, (id: string) => startDialogue(id), guardSpawn);
    }, inputState);

    // ===== 4. Лук =====
    updateBow(world, peid, input, bus, flags, () => {
      addFloat(Position.x[peid], Position.y[peid], "Нет стрел", 0xc9a24b);
    });

    // ===== 5. Sync Velocity → Physics Body =====
    syncVelocityToBody(world, peid);

    // ===== 6. Физика Planck.js (шаг) =====
    _planckWorld.step(dt);

    // ===== 7. Синхронизация: Planck.js body → Position =====
    syncBodyToPosition(world, peid);

    // ===== 8. Остальные сущности без физики =====
    {
      const { x: px, y: py } = Position;
      const { x: vx, y: vy } = Velocity;
      for (const eid of query(world, [Position, Velocity])) {
        if (eid === peid) continue;
        if (PhysicsBody.body[eid] > 0) continue;
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
      store.player.moving = !!Player.moving[peid];
      store.player.slowT = Player.slowT[peid];
      store.player.animT = Player.animT[peid];
      store.player.swingT = Player.swingT[peid];
      store.player.hurtT = Player.hurtT[peid];
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
      _planckWorld,
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
      playerDomain,
      getDropRegistry()
    );

    // ===== 15. Обновить туман (ECS) =====
    if (!_fogState) _fogState = createFogState();
    fogUpdateSystem(
      world,
      peid,
      dt,
      rdt,
      _fogState,
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

    // ===== 17. Проверка здоровья и удаление мёртвых =====
    lifeCheckSystem(world);
    deathCleanupSystem(world);
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
    getDropsForTransition: () => {
      const drops: Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }> = [];
      for (const eid of query(world, [Drop])) {
        drops.push({ 
          kind: poolGet(StringPool.dropKinds, Drop.kind[eid]), 
          x: Position.x[eid], 
          y: Position.y[eid], 
          life: Drop.life[eid], 
          ambientIdx: 0 
        });
      }
      return drops;
    },
    setPlanckWorld: (pw: PlanckWorld) => { _planckWorld = pw; },
  };
}
