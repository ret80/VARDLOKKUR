/* ecs-game-loop.ts — минимальный ECS game loop */

import { type World, query, removeEntity, addComponent } from 'bitecs';
import {
  syncPositionToBody,
  syncVelocityToBody,
  syncBodyToPosition,
  createBodyForEntity,
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
  ensureGhosts,
  spawnFogGhost,
  type FogState,
} from './ecs-systems/fog-system';
import { Graphics, Container } from 'pixi.js';
import {
  tryInteract,
  onEnemyKilledEcs,
  getNearestInteractable,
  type GuardSpawnCallback,
} from './ecs-systems/interaction-system';
import {
  renderSystem,
  initInteractionHint,
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
  Position, Velocity, PhysicsBody, Player, Direction, Health,
  Drop, poolGet, StringPool, PhysicsBodyRegistry,
  Flashing, Enemy, EnemyState, Sprite, SpriteRegistry, Radius,
  Shrine, Dead,
} from './ecs-components';
import type { InputSystem } from '../input/input-system';
import type { EventBus } from '../event-bus';
import type { GameStore } from '../store';
import { createEnemyInEcs } from './ecs-bridge';
import { PlanckWorld, Cat } from '../physics/planck-world';
import { ENEMY_STATS } from '../entities';
import type { Application } from 'pixi.js';
import type { FxManager } from '../fx';
import type { StateManager } from '../state/state-manager';
import { audio } from '../audio';
import type { WorldData } from '../world';
import type { FlagDomain } from '../store/flag-domain';
import type { PlayerDomain, IEcsPlayerHelpers } from '../store/player-domain';
import type { HudSystem } from '../hud/hud-system';
import { logger } from '../debug/logger';
import type { QuestSystem } from '../quests/quest-system';
import type { DialogueSystem } from '../dialogue/dialogue-system';
import { dist2 } from '../utils';
import { T } from '../world';

// ============================================================
// Утилиты
// ============================================================

/** Обёртка для передачи по ссылке */
interface Ref<T> { value: T; }

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
  updateConfig: (config: Partial<EcsGameLoopConfig>) => void;
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
  map: WorldData | null;
  ow: WorldData | null;
  flags: FlagDomain;
  talkedSig: Ref<Map<string, string>>;
  dialogueActive: Ref<boolean>;
  stepT: number;
  realT: number;
  stepTRef: number;
  realTRef: number;
  playerEid: number;
  playerDomain: PlayerDomain;
  /** ECS-хелперы для мутаций игрока (takeDamage, heal, etc.) */
  playerHelpers?: IEcsPlayerHelpers;
  hud: HudSystem;
  quests: QuestSystem;
  dialogue: DialogueSystem;
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
    playerDomain, playerHelpers, hud, quests, dialogue,
    dungeonBossDead, toast, float: addFloat, pushHud, startDialogue, npcSig,
    onStepAudio, stepTRef, realTRef, guardSpawn,
    dialogueActive, talkedSig,
    viewW, viewH,
    fx,
  } = config;

  let _stepT = stepTRef;
  let _realT = realTRef;
  let _playerEid = playerEidRef;
  let _planckWorld = planckWorld;
  let _fogState: FogState | null = null;

  // hintLayer — подсказка взаимодействия, на app.stage (не разрушается при смене сцены)
  const hintLayer = new Container();
  hintLayer.zIndex = 9999;
  app.stage.addChild(hintLayer);
  initInteractionHint(hintLayer);

  // Локальные копии для updateConfig
  let config_map = map;
  let config_flags = flags;

  // ── Подписки на события боя (обработка атак игрока) ──

  bus.on("combat:trySword", () => {
    const peid = _playerEid;
    if (peid < 0) return;
    // Направление замаха = направление взгляда игрока
    Player.swingDirX[peid] = Direction.x[peid];
    Player.swingDirY[peid] = Direction.y[peid];
    swordAttackSystem(
      world, peid,
      store.flags.hasItem("sword"),
      store.flags.swordUp,
      store.flags.hasHammer,
      store.flags.ghostBane,
      (enemyEid, dmg, fx, fy) => {
        // Нанести урон врагу через ECS Health
        Health.current[enemyEid] -= dmg;
        Flashing[enemyEid] = 1;
        Enemy.flashT[enemyEid] = 0.12;
        bus.emit("enemy:hit", { enemy: enemyEid, dmg, sx: Position.x[enemyEid], sy: Position.y[enemyEid] });
        // Проверить смерть врага
        if (Health.current[enemyEid] <= 0) {
          bus.emit("enemy:killed", { enemy: enemyEid, kind: poolGet(StringPool.enemyKinds, Enemy.kind[enemyEid]) as any, x: Position.x[enemyEid], y: Position.y[enemyEid] });
        }
      },
      () => {},
      (x, y, text, color) => addFloat(x, y, text, color),
      () => audio.hit(),
      () => audio.clang(),
      _planckWorld
    );
  });

  bus.on("combat:tryAxe", () => {
    const peid = _playerEid;
    if (peid < 0) return;
    const eid = axeThrowSystem(world, peid, store.flags.hasAxe, store.flags.axeUp, (eid: number) => {
      // Спавн графики для топора
        const g = new Graphics();
        g.position.set(Position.x[eid], Position.y[eid]);
        (g as any).userData = (g as any).userData || {};
        (g as any).userData.eid = eid;
        dynamic.addChild(g);
    });
    if (eid >= 0) {
      // Добавить физику для топора
      createBodyForEntity(_planckWorld, world, eid, 3, Cat.Projectile, Cat.Enemy | Cat.Player | Cat.Ground);
    }
  });

  bus.on("projectile:fire", (e) => {
    const peid = _playerEid;
    if (peid < 0) return;
    const lifetime = e.kind === 'arrow' ? 2.2 : 3;
    const eid = fireProjectileEcs(
      world, e.kind as any, e.x, e.y, e.vx, e.vy, e.dmg,
      lifetime,
      (eid: number) => {
        const g = new Graphics();
        g.position.set(e.x, e.y);
        (g as any).userData = (g as any).userData || {};
        (g as any).userData.eid = eid;
        dynamic.addChild(g);
      }
    );
    if (eid >= 0) {
      // Добавить физику для снаряда
      createBodyForEntity(_planckWorld, world, eid, 4, Cat.Projectile, Cat.Enemy | Cat.Player | Cat.Ground);
    }
  });

  // ── Переход призраков в состояние dissipate при окончании волны тумана ──

  bus.on("fog:ghostDissipate", () => {
    for (const eid of query(world, [Enemy])) {
      if (poolGet(StringPool.enemyKinds, Enemy.kind[eid]) !== 'ghost') continue;
      // Пропускаем привязанных призраков (у алтаря) — они не исчезают сами
      if (Enemy.leashX[eid] !== 0 || Enemy.leashY[eid] !== 0) continue;
      // Переходим в dissipate — призрак начнёт исчезать
      Enemy.state[eid] = EnemyState.dissipate;
    }
  });

  // ── Переход ВСЕХ призраков в dissipate при уходе от алтаря ──

  bus.on("fog:altarLeave", () => {
    for (const eid of query(world, [Enemy])) {
      if (poolGet(StringPool.enemyKinds, Enemy.kind[eid]) !== 'ghost') continue;
      // Переводим ВСЕХ призраков, включая привязанных
      Enemy.state[eid] = EnemyState.dissipate;
    }
  });

  // ── При респавне — пересоздать призраков если игрок рядом с алтарём ──

  // Обёртка для ensureGhosts — создаёт призрака через spawnFogGhost (только ECS, без графики и физики)
  function spawnGhost(kind: string, x: number, y: number): number {
    const eid = spawnFogGhost(world, x, y, _playerEid);
    // Добавить Sprite компонент для рендеринга
    addComponent(world, eid, Sprite);
    return eid;
  }

  bus.on("player:respawned", () => {
    if (!config_map || _playerEid < 0 || !_fogState) return;
    const px = Position.x[_playerEid];
    const py = Position.y[_playerEid];
    const ax = config_map.treeAltar.x * T + 8;
    const ay = config_map.treeAltar.y * T + 8;
    const nearAltar = dist2(px, py, ax, ay) < 240 * 240;
    if (nearAltar) {
      _fogState.fogActive = true;
      _fogState.fogAmbient = true;
      _fogState.fogSpawned = false;
      _fogState.fogLeft = 0;
      ensureGhosts(world, 2, true, config_map, px, py, spawnGhost);
    }
  });

  // ── Обработка убийства врага-стража пьедестала ──

  bus.on("enemy:killed", (e) => {
    onEnemyKilledEcs(world, e.enemy, store, bus);
  });

  /** Выполнить один кадр */
  function tick(rdt: number, timeScale: number): void {
    const dt = rdt * timeScale;
    const peid = _playerEid;

    // ===== 0. Синхронизация ECS Player.hasSword ↔ store flags =====
    if (peid >= 0 && config_flags.hasItem('sword')) {
      Player.hasSword[peid] = 1;
    }

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

    // ===== 10. Синхронизация store.player — больше не нужна, все поля читаются из ECS через PlayerDomain =====

    // ===== 11. Таймеры состояний =====
    stateTimerSystem(world, dt);

    // ===== 12. AI врагов =====
    if (config_map && peid >= 0) {
      aiUpdateSystem(
        world, peid, config_map, dt,
        () => {}, () => {},
        (dmg, sx, sy) => {
          playerDomain?.takeDamage(dmg, sx, sy);
          Player.moving[peid] = 0;
          bus.emit("hud:dirty", {});
        },
        (duration: number) => {
          Player.slowT[peid] = duration;
        },
      );
    }

    // ===== 13. Направление из скорости (ПОСЛЕ AI, чтобы Direction от AI не перезаписался) =====
    directionFromVelocitySystem(world);

    // ===== 14. Обновить снаряды (ECS) =====
    updateProjectilesEcs(
      world,
      dt,
      peid,
      config_flags.ghostBane,
      _planckWorld,
      (eid) => {
        // onProjectileRemove: удалить Graphics + Planck body снаряда
        const spriteRef = SpriteRegistry[Sprite.ref[eid] - 1];
        if (spriteRef && spriteRef.parent) spriteRef.parent.removeChild(spriteRef);
        spriteRef?.destroy();
        Sprite.ref[eid] = 0;
        const pbIdx = PhysicsBody.body[eid];
        if (pbIdx > 0) {
          const body = PhysicsBodyRegistry[pbIdx - 1];
          if (body) _planckWorld.destroyBody(body);
          PhysicsBody.body[eid] = 0;
          PhysicsBodyRegistry[pbIdx - 1] = null as any;
        }
      },
      addFloat,
      () => audio.clang(),
      () => audio.hit(),
      () => audio.freeze(),
      (enemyEid: number) => {
        Flashing[enemyEid] = 1;
        Enemy.flashT[enemyEid] = 0.2;
      },
      (enemyEid: number) => {
        bus.emit('enemy:killed', { enemy: enemyEid, kind: poolGet(StringPool.enemyKinds, Enemy.kind[enemyEid]) as any, x: Position.x[enemyEid], y: Position.y[enemyEid] });
      },
      () => {
        bus.emit("hud:dirty", {});
      },
      () => {
        config_flags.snakeDead = true;
        bus.emit('boss:killed', { kind: 'snake' as any, id: -1 });
      },
      playerDomain
    );

    // ===== 14. Обновить дропы (ECS) =====
    dropsUpdateSystem(
      world,
      dt,
      peid,
      store,
      bus,
      (eid: number) => {
        // Удалить Graphics + Planck body дропа
        const spriteRef = SpriteRegistry[Sprite.ref[eid] - 1];
        if (spriteRef && spriteRef.parent) spriteRef.parent.removeChild(spriteRef);
        spriteRef?.destroy();
        Sprite.ref[eid] = 0;
      },
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
      config_map,
      config_flags,
      bus,
      (kind: string, x: number, y: number) => {
        // Создать врага-призрака
        const g = new Graphics();
        g.position.set(x, y);
        const eid = createEnemyInEcs(
          world, kind as any, x, y, g, _planckWorld,
          Cat.Ghost, Cat.Ghost | Cat.Player | Cat.Projectile
        );
        (g as any).userData = (g as any).userData || {};
        (g as any).userData.eid = eid;
        dynamic.addChild(g);
        // Призрак — кинематическое тело (проходит сквозь стены)
        const body = PhysicsBodyRegistry[PhysicsBody.body[eid] - 1];
        if (body) {
          _planckWorld.destroyBody(body);
          const ghostBody = _planckWorld.createGhostBody(x, y, ENEMY_STATS.ghost.r);
          PhysicsBody.body[eid] = PhysicsBodyRegistry.length + 1;
          PhysicsBodyRegistry.push(ghostBody);
        }
        return eid;
      },
      () => config_flags.runes
    );

    // ===== 16. Двери, зоны, боссы =====
    updateDoors(world, peid, store, flags, toast, pushHud);
    updateZone(world, peid, config_map, store, toast, pushHud);
    if (config_map) checkDungeonBoss(world, peid, config_map, dungeonBossDead, bus);

    // ===== 17. Проверка здоровья, очистка спрайтов/тел и удаление мёртвых =====
    lifeCheckSystem(world);

    // Проверить смерть игрока (lifeCheckSystem помечает Dead, но не эмитит player:died)
    if (peid >= 0 && !!Dead[peid] && !playerDomain?.isAlive()) {
      bus.emit("player:died", {});
      // Удалить спрайт из display list (не destroy — render system всё ещё может обращаться)
      const spriteRef = SpriteRegistry[Sprite.ref[peid] - 1];
      if (spriteRef && spriteRef.parent) spriteRef.parent.removeChild(spriteRef);
      // Уничтожить физ. тело
      const pbIdx = PhysicsBody.body[peid];
      if (pbIdx > 0) {
        const body = PhysicsBodyRegistry[pbIdx - 1];
        if (body) {
          // Безопасное удаление: тело могло быть уже удалено в step()/pendingDestroy
          _planckWorld.destroyBody(body);
          PhysicsBody.body[peid] = 0;
          PhysicsBodyRegistry[pbIdx - 1] = null as any;
        }
      }
    }

    // Уничтожить физ. тело и удалить мёртвых врагов из ECS.
    // Спрайт уже удалён в lifeCheckSystem.
    for (const eid of query(world, [Dead, Enemy])) {
      const pbIdx = PhysicsBody.body[eid];
      if (pbIdx > 0) {
        const body = PhysicsBodyRegistry[pbIdx - 1];
        if (body) {
          // Безопасное удаление: destroyBody проверяет destroyedBodies и
          // обрабатывает случай, когда тело уже удалено в step()/pendingDestroy
          _planckWorld.destroyBody(body);
          PhysicsBody.body[eid] = 0;
          PhysicsBodyRegistry[pbIdx - 1] = null as any;
        }
      }
      // Удалить из ECS
      removeEntity(world, eid);
    }

    deathCleanupSystem(world);
  }

  /** Выполнить ECS рендеринг */
  function render(rdt: number): void {
    const nearestInteractable = getNearestInteractable(world, _playerEid, store);
    renderSystem(world, {
      time: _realT,
      dt: rdt,
      app,
      floatLayer,
      cam,
      gameWorld,
      dynamic,
      hintLayer,
      playerEid: _playerEid,
      getNpcSig: npcSig,
      talkedSig: talkedSig.value,
      nearestInteractable,
    });

    // ===== Отрисовка тумана =====
    if (_fogState && _playerEid >= 0) {
      const shrineSpots: Array<{x: number, y: number}> = [];
      for (const eid of query(world, [Shrine])) {
        if (Shrine.lit[eid]) {
          shrineSpots.push({ x: Position.x[eid], y: Position.y[eid] });
        }
      }
      fx.redrawFog(
        rdt,
        _fogState.fogRadius,
        Position.x[_playerEid],
        Position.y[_playerEid],
        cam.x,
        cam.y,
        viewW,
        viewH,
        shrineSpots.length > 0 ? shrineSpots : undefined
      );
    }
  }

  return {
    tick,
    render,
    get realT() { return _realT; },
    set realT(v: number) { _realT = v; },
    setPlayerEid: (eid: number) => { logger.debug('game-loop', `setPlayerEid=${eid}`); _playerEid = eid; },
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
    getFogState: () => _fogState,
    updateConfig: (cfg: Partial<EcsGameLoopConfig>) => {
      if (cfg.planckWorld !== undefined) _planckWorld = cfg.planckWorld;
      if (cfg.map !== undefined) config_map = cfg.map;
      if (cfg.playerEid !== undefined) { _playerEid = cfg.playerEid; }
      if (cfg.flags) config_flags = cfg.flags;
    },
  };
}
