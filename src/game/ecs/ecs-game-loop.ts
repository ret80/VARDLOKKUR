/* ecs-game-loop.ts — минимальный ECS game loop */

import { type World, query, removeEntity, addComponent } from 'bitecs';
import type { FloatTextLayer } from '../renderers/float/FloatTextLayer';
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
  type FogState,
} from './ecs-systems/fog-system';
import { CameraController } from '../engine/camera-controller';
import { SceneManager } from '../engine/scene-manager';
import { SceneLayers } from '../engine/scene-layers';
import { RenderPipeline } from '../engine/render-pipeline';
import { TextureCacheManager } from '../renderers/core/TextureCacheManager';
import { EntityLayer } from '../engine/entity-layer';
import { FogLayer } from '../engine/fog-layer';
import { OverlayLayer } from '../engine/overlay-layer';
import { ParticleLayer } from '../engine/particle-layer';
import {
  tryInteract,
  onEnemyKilledEcs,
  getNearestInteractable,
  type GuardSpawnCallback,
} from './ecs-systems/interaction-system';
import {
  createChestItemRegistry,
  createDungeonUnlockRegistry,
  type ChestItemHandlerRegistry,
  type DungeonUnlockRegistry,
} from './ecs-systems/interaction-handlers';
import {
  renderSystem,
  cleanupRenderedEnemy,
  unregisterSpriteHandle,
  ENTITY_LAYER,
  _renderSystemInstance,
} from './ecs-systems/render-system';
import { getRenderQueue, type RenderQueue, type Viewport } from '../render/RenderQueue';
import { mapRenderSystem } from '../render/map-render-system';
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
import { type EntityFactory } from './entity-factory';
import {
  Position, Velocity, PhysicsBody, Player, Direction, Health,
  Drop, poolGet, StringPool, PhysicsBodyRegistry,
  Flashing, Enemy, EnemyState, Sprite, Radius,
  Shrine, Dead,
} from '../ecs/ecs-components';
import type { InputSystem } from '../input/input-system';
import type { EventBus } from '../event-bus';
import type { GameStore } from '../store';
import { createEnemyInEcs } from './ecs-bridge';
import { PlanckWorld, Cat } from '../physics/planck-world';
import { ENEMY_STATS } from '../entities';

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
import type { IRenderer } from '../renderer/IRenderer';
import { getRenderer, isRendererInitialized } from '../renderer/RendererFactory';
import type { SpriteFactory } from './ecs-map-loader';

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
  floatLayer: FloatTextLayer;
  gameWorld: any;
  sceneManager: SceneManager;
  sceneLayers: SceneLayers;
  fx: FxManager;
  /** Этап 6: система частиц и снега (извлечение из FxManager) */
  particleSys: import('../engine/particle-system').ParticleSystem;
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
  /** Фабрика чистых ECS-сущностей (без графики/физики) */
  entityFactory?: EntityFactory;
  /** Фабрика графических объектов (возвращает GraphicsHandle) */
  spriteFactory?: SpriteFactory;
  /** Очередь отрисовки (task_14) */
  renderQueue?: RenderQueue;
  /** Поставщик актуального viewport камеры (для viewport culling в flush) */
  renderViewportProvider?: () => Viewport;
}

/** Глобальный singleton registry дропов */
let _dropRegistry: DropHandlerRegistry | null = null;
function getDropRegistry(): DropHandlerRegistry {
  if (!_dropRegistry) _dropRegistry = new DropHandlerRegistry();
  return _dropRegistry;
}

/** Глобальный singleton registry предметов в сундуках */
let _chestItemRegistry: ChestItemHandlerRegistry | null = null;
function getChestItemRegistry(): ChestItemHandlerRegistry {
  if (!_chestItemRegistry) _chestItemRegistry = createChestItemRegistry();
  return _chestItemRegistry;
}

/** Глобальный singleton registry разблокировки подземелий */
let _dungeonUnlockRegistry: DungeonUnlockRegistry | null = null;
function getDungeonUnlockRegistry(): DungeonUnlockRegistry {
  if (!_dungeonUnlockRegistry) _dungeonUnlockRegistry = createDungeonUnlockRegistry();
  return _dungeonUnlockRegistry;
}

// ============================================================
// ECS Game Loop
// ============================================================

/** Создать минимальный ECS Game Loop */
export function createEcsGameLoop(config: EcsGameLoopConfig) {
  const {
    world, bus, store, planckWorld, floatLayer, gameWorld, sceneManager, sceneLayers,
    input, state, cam, map, flags, playerEid: playerEidRef,
    playerDomain, playerHelpers, hud, quests, dialogue,
    dungeonBossDead, toast, float: addFloat, pushHud, startDialogue, npcSig,
    onStepAudio, stepTRef, realTRef, guardSpawn,
    dialogueActive, talkedSig,
    viewW, viewH,
    fx,
    particleSys,
    entityFactory: configFactory,
    spriteFactory: configSpriteFactory,
    renderQueue: configRenderQueue,
    renderViewportProvider: configViewportProvider,
  } = config;

  /** Фабрика графических объектов (Фаза 7: возвращает GraphicsHandle, не legacy Container) */
  const spriteFactory: SpriteFactory = configSpriteFactory ?? {
    create: (x: number, y: number) => {
      // Fallback: если нет configSpriteFactory — создаём через IRenderer
      const r = getRenderer();
      const g = r.createGraphics();
      r.setGraphicsPosition(g, { x, y });
      return g;
    },
  };

  let _stepT = stepTRef;
  let _realT = realTRef;
  let _playerEid = playerEidRef;
  let _planckWorld = planckWorld;
  let _fogState: FogState | null = null;

  // Используем фабрику из конфига — она всегда передаётся из engine.ts
  if (!configFactory) {
    throw new Error('EntityFactory not provided to EcsGameLoop. This should never happen.');
  }
  const entityFactory = configFactory;

  // CameraController — извлечён из render-system.ts (Этап 4)
  const cameraController = new CameraController({ cam, viewportW: viewW, viewportH: viewH });

  // hintLayer — подсказка взаимодействия (создаётся в RenderSystem.init)
  // RenderQueue — очередь отрисовки всех объектов кадра (task_14)
  const renderQueue = configRenderQueue ?? getRenderQueue();

  // ── RenderPipeline (Этап 5-6) ──
  // Создаём слои пайплайна
  const entityLayer = new EntityLayer(renderQueue);
  const particleLayer = new ParticleLayer(particleSys); // Этап 6: извлечение из FxManager
  const fogLayer = new FogLayer(fx);
  const overlayLayer = new OverlayLayer();

  // Создаём пайплайн и добавляем слои
  const pipeline = new RenderPipeline();
  pipeline.queue = renderQueue; // task_14: подключаем очередь к пайплайну
  // Viewport culling: RenderQueue.flush получает актуальные параметры камеры
  // (cam.x/cam.y обновляются CameraController'ом в каждом кадре)
  pipeline.viewportProvider = () => ({ camX: cam.x, camY: cam.y, viewW, viewH });
  pipeline.addLayer(entityLayer);
  pipeline.addLayer(particleLayer);
  pipeline.addLayer(fogLayer);
  pipeline.addLayer(overlayLayer);

  // Инициализируем пайплайн (Этап 8: IRenderer)
  const renderer = getRenderer();
  pipeline.init(renderer, { dt: _stepT, time: _realT, world });

  // Инициализируем RenderSystem — нужен для overlay-слоя и _hintG
  _renderSystemInstance.init(renderer);

  // Локальные копии для updateConfig
  let config_map = map;
  let config_flags = flags;

  // ── Подписки на события боя (обработка атак игрока) ──

  bus.on("combat:trySword", () => {
    const peid = _playerEid;
    if (peid < 0) return;
    // Направление замаха = направление взгляда игрока
    Player[peid].swingDirX = Direction[peid].x;
    Player[peid].swingDirY = Direction[peid].y;
    swordAttackSystem(
      world, peid,
      store.flags.hasItem("sword"),
      store.flags.swordUp,
      store.flags.hasHammer,
      store.flags.ghostBane,
      (enemyEid, dmg, fx, fy) => {
        // Нанести урон врагу через ECS Health
        Health[enemyEid].current -= dmg;
        Flashing[enemyEid] = {};
        Enemy[enemyEid].flashT = 0.12;
        bus.emit("enemy:hit", { enemy: enemyEid, dmg, sx: Position[enemyEid].x, sy: Position[enemyEid].y });
        // Проверить смерть врага
        if (Health[enemyEid].current <= 0) {
          bus.emit("enemy:killed", { enemy: enemyEid, kind: poolGet(StringPool.enemyKinds, Enemy[enemyEid].kind) as any, x: Position[enemyEid].x, y: Position[enemyEid].y });
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
    const eid = axeThrowSystem(
      entityFactory, peid, store.flags.hasAxe, store.flags.axeUp, (eid: number) => {
        const g = spriteFactory.create(Position[eid].x, Position[eid].y);
        // g уже в IRenderer layer через spriteFactory
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
      entityFactory, e.kind as any, e.x, e.y, e.vx, e.vy, e.dmg,
      lifetime,
      (eid: number) => {
        const g = spriteFactory.create(e.x, e.y);
        // g уже в IRenderer layer через spriteFactory
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
      if (poolGet(StringPool.enemyKinds, Enemy[eid].kind) !== 'ghost') continue;
      // Пропускаем привязанных призраков (у алтаря) — они не исчезают сами
      if (Enemy[eid].leashX !== 0 || Enemy[eid].leashY !== 0) continue;
      // Переходим в dissipate — призрак начнёт исчезать
      Enemy[eid].state = EnemyState.dissipate;
    }
  });

  // ── Переход ВСЕХ призраков в dissipate при уходе от алтаря ──

  bus.on("fog:altarLeave", () => {
    for (const eid of query(world, [Enemy])) {
      if (poolGet(StringPool.enemyKinds, Enemy[eid].kind) !== 'ghost') continue;
      // Переводим ВСЕХ призраков, включая привязанных
      Enemy[eid].state = EnemyState.dissipate;
    }
  });

  // ── При респавне — пересоздать призраков если игрок рядом с алтарём ──

  // Обёртка для ensureGhosts — создаёт призрака через entityFactory (ECS + графика + физика)
  function spawnGhost(kind: string, x: number, y: number): number {
    const g = spriteFactory.create(x, y);
    const eid = createEnemyInEcs(
      entityFactory, world, kind as any, x, y, g, _planckWorld,
      Cat.Ghost, Cat.Ghost | Cat.Player | Cat.Projectile
    );
    // Призрак — кинематическое тело (проходит сквозь стены)
    const pbData = PhysicsBody[eid];
    if (pbData && pbData.body > 0) {
      const body = PhysicsBodyRegistry[pbData.body - 1];
      if (body) {
        _planckWorld.destroyBody(body);
        const ghostBody = _planckWorld.createGhostBody(x, y, ENEMY_STATS.ghost.r);
        PhysicsBody[eid] = { body: PhysicsBodyRegistry.length + 1 };
        PhysicsBodyRegistry.push(ghostBody);
      }
    }
    // Установить stateT и состояние appear для перехода из appear → ghost_wander
    Enemy[eid].state = EnemyState.appear;
    Enemy[eid].stateT = 1.5 + Math.random() * 0.5;
    Enemy[eid].aggro = 1;
    Enemy[eid].fogOnly = 1;
    return eid;
  }

  bus.on("player:respawned", () => {
    if (!config_map || _playerEid < 0 || !_fogState) return;
    const px = Position[_playerEid].x;
    const py = Position[_playerEid].y;
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

  // ── При смерти игрока — dissipate ВСЕХ призраков ──

  bus.on("player:died", () => {
    // Эмитим fog:altarLeave — это переведёт ВСЕХ призраков (включая leashed) в dissipate
    bus.emit("fog:altarLeave", {});
  });

  /** Выполнить один кадр */
  function tick(rdt: number, timeScale: number): void {
    const dt = rdt * timeScale;
    const peid = _playerEid;

    // ===== 0. Синхронизация ECS Player.hasSword ↔ store flags (до ввода) =====
    if (peid >= 0 && config_flags.hasItem('sword')) {
      Player[peid].hasSword = 1;
    } else if (peid >= 0) {
      Player[peid].hasSword = 0;
    }

    // ===== 1. Захват ввода ОДИН раз за кадр =====
    const inputState: InputState = input.getState();

    // ===== 2. Ввод и движение игрока =====
    const inputResult = updatePlayerInput(world, peid, input, _stepT, _realT, onStepAudio, (eid) => {}, inputState);
    _stepT = inputResult.stepT;
    _realT = inputResult.realT;
    
    // ===== 3. Обработка действий =====
    processActions(input, bus, () => {
      tryInteract(
        world, peid, store, bus,
        (id: string) => startDialogue(id),
        guardSpawn,
        undefined, // interactionRegistry (создаётся внутри tryInteract по умолчанию)
        getChestItemRegistry(),
        getDungeonUnlockRegistry()
      );
    }, inputState);

    // ===== 3.5. Синхронизация Player.hasSword ↔ store flags (после взаимодействия) =====
    if (peid >= 0) {
      Player[peid].hasSword = config_flags.hasItem('sword') ? 1 : 0;
    }

    // ===== 4. Лук =====
    updateBow(world, peid, input, bus, flags, () => {
      addFloat(Position[peid].x, Position[peid].y, "Нет стрел", 0xc9a24b);
    });

    // ===== 5. Sync Velocity → Physics Body =====
    syncVelocityToBody(world, peid);

    // ===== 6. Физика Planck.js (шаг) =====
    _planckWorld.step(dt);

    // ===== 7. Синхронизация: Planck.js body → Position =====
    syncBodyToPosition(world, peid);

    // ===== 8. Остальные сущности без физики =====
    {
      for (const eid of query(world, [Position, Velocity])) {
        if (eid === peid) continue;
        const pos = Position[eid];
        const vel = Velocity[eid];
        if (!pos || !vel) continue; // AoS элемент может быть undefined при рассинхронизации masks/AoS
        const pb = PhysicsBody[eid];
        if (pb && pb.body > 0) continue;
        pos.x += vel.x * dt;
        pos.y += vel.y * dt;
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
          Player[peid].moving = 0;
          bus.emit("hud:dirty", {});
        },
        (duration: number) => {
          Player[peid].slowT = duration;
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
        // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
        Sprite[eid] = { ref: 0 };
        const pb = PhysicsBody[eid];
        if (pb && pb.body > 0) {
          const pbIdx = pb.body;
          const body = PhysicsBodyRegistry[pbIdx - 1];
          if (body) _planckWorld.destroyBody(body);
          PhysicsBody[eid] = { body: 0 };
          PhysicsBodyRegistry[pbIdx - 1] = null as any;
        }
      },
      addFloat,
      () => audio.clang(),
      () => audio.hit(),
      () => audio.freeze(),
      (enemyEid: number) => {
        Flashing[enemyEid] = {};
        Enemy[enemyEid].flashT = 0.2;
      },
      (enemyEid: number) => {
        bus.emit('enemy:killed', { enemy: enemyEid, kind: poolGet(StringPool.enemyKinds, Enemy[enemyEid].kind) as any, x: Position[enemyEid].x, y: Position[enemyEid].y });
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
        // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
        Sprite[eid] = { ref: 0 };
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
        const g = spriteFactory.create(x, y);
        const eid = createEnemyInEcs(
          entityFactory, world, kind as any, x, y, g, _planckWorld,
          Cat.Ghost, Cat.Ghost | Cat.Player | Cat.Projectile
        );
        // g уже в IRenderer layer через spriteFactory
        // Призрак — кинематическое тело (проходит сквозь стены)
        const pbData = PhysicsBody[eid];
        if (pbData && pbData.body > 0) {
          const body = PhysicsBodyRegistry[pbData.body - 1];
          if (body) {
            _planckWorld.destroyBody(body);
            const ghostBody = _planckWorld.createGhostBody(x, y, ENEMY_STATS.ghost.r);
            PhysicsBody[eid] = { body: PhysicsBodyRegistry.length + 1 };
            PhysicsBodyRegistry.push(ghostBody);
          }
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
      // Sprite.ref[eid] теперь хранит GraphicsHandle (number), а не PixiJS объект
      Sprite[peid] = { ref: 0 };
      // Уничтожить физ. тело
      const pb = PhysicsBody[peid];
      if (pb && pb.body > 0) {
        const pbIdx = pb.body;
        const body = PhysicsBodyRegistry[pbIdx - 1];
        if (body) {
          // Безопасное удаление: тело могло быть уже удалено в step()/pendingDestroy
          _planckWorld.destroyBody(body);
          PhysicsBody[peid] = { body: 0 };
          PhysicsBodyRegistry[pbIdx - 1] = null as any;
        }
      }
    }

    // Уничтожить физ. тело и удалить мёртвых врагов из ECS.
    // Спрайт уже удалён в lifeCheckSystem.
    for (const eid of query(world, [Dead, Enemy])) {
      const pb = PhysicsBody[eid];
      if (pb && pb.body > 0) {
        const pbIdx = pb.body;
        const body = PhysicsBodyRegistry[pbIdx - 1];
        if (body) {
          // Безопасное удаление: destroyBody проверяет destroyedBodies и
          // обрабатывает случай, когда тело уже удалено в step()/pendingDestroy
          _planckWorld.destroyBody(body);
          PhysicsBody[eid] = { body: 0 };
          PhysicsBodyRegistry[pbIdx - 1] = null as any;
        }
      }
      // Очистить кэш текстуры (GPU), данные рендера (CPU), handle спрайта
      TextureCacheManager.instance.destroyEntity(eid);
      cleanupRenderedEnemy(eid);
      unregisterSpriteHandle(eid);
      // Удалить из ECS
      removeEntity(world, eid);
    }

    deathCleanupSystem(world);
  }

  /** Выполнить ECS рендеринг через RenderPipeline (Этап 5-6) */
  function render(rdt: number): void {
    const nearestInteractable = getNearestInteractable(world, _playerEid, store);

    // === Камера: следим за игроком ===
    if (_playerEid >= 0 && Position.length > _playerEid) {
      cameraController.trackPlayer(Position[_playerEid].x, Position[_playerEid].y);
    }

    // Получаем IRenderer (если инициализирован)
    let renderer: IRenderer | null = null;

    if (isRendererInitialized()) {
      try {
        renderer = getRenderer();
      } catch {
        // Renderer не доступен — используем legacy-путь
      }
    }

    // Renderer должен знать позицию камеры для viewport culling
    if (renderer) {
      renderer.setCameraPosition(cam);
    }

    // Обновляем параметры EntityLayer
    const entityLayerOpts: any = {
      world,
      time: _realT,
      dt: rdt,
      float: floatLayer,
      playerEid: _playerEid,
      cam,
      getNpcSig: npcSig,
      talkedSig: talkedSig.value,
      nearestInteractable,
    };

    entityLayer.setOptions(entityLayerOpts);

    // Обновляем состояние FogLayer
    if (_fogState) {
      fogLayer.setFogState(_fogState);
    }
    fogLayer.setPlayerEid(_playerEid);
    fogLayer.setRunesEnabled(config_flags.runes > 0);
    fogLayer.setCamera(cam);

    // Обновляем OverlayLayer
    overlayLayer.setNearestInteractable(nearestInteractable);
    overlayLayer.setCamera(cam);
    overlayLayer.setTime(_realT);

    // === ECS-рефакторинг рендеринга: mapRenderSystem (фаза render) ===
    // query(world, [MapState]) → upsert статичных батчей карты в общий
    // RenderQueue; при уничтожении сущности MapState — выгрузка и удаление
    // Graphics через IRenderer. Динамические объекты регистрирует
    // renderSystem (EntityLayer ниже) — очереди они не конфликтуют.
    const renderViewport: Viewport | undefined = configViewportProvider
      ? configViewportProvider()
      : { camX: cam.x, camY: cam.y, viewW, viewH };
    mapRenderSystem(world, {
      renderer: renderer ?? undefined,
      viewport: renderViewport,
    });

    // Вызываем update() и render() пайплайна
    // app.render() вызывается внутри RenderPipeline.render() после всех слоёв
    // (включая FogLayer — это устраняет 1-кадровый лаг тумана)
    pipeline.update({ dt: rdt, time: _realT, world });
    pipeline.render({ dt: rdt, time: _realT, world });
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
          kind: poolGet(StringPool.dropKinds, Drop[eid].kind), 
          x: Position[eid].x, 
          y: Position[eid].y, 
          life: Drop[eid].life, 
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
      // Обновить размеры viewport в CameraController (Этап 4)
      if (cfg.viewW !== undefined) cameraController.updateOptions({ viewportW: cfg.viewW });
      if (cfg.viewH !== undefined) cameraController.updateOptions({ viewportH: cfg.viewH });
      // Обновить размеры viewport в RenderPipeline (Этап 5)
      if (cfg.viewW !== undefined || cfg.viewH !== undefined) {
        const w = cfg.viewW ?? cameraController.viewportW;
        const h = cfg.viewH ?? cameraController.viewportH;
        pipeline.resize(w, h);
      }
    },
  };
}
