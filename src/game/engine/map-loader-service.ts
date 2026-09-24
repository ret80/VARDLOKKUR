/* map-loader-service.ts — Загрузка карт: тайлы, ECS-сущности, миникарта */

import { PlanckWorld } from "../physics/planck-world";
import type { WorldData, Vec } from "../world";
import type { GameStore } from "../store";
import type { World } from "bitecs";
import { EcsMapLoader, type SpriteFactory } from "../ecs/ecs-map-loader";
import { createEntityFactory, type EntityFactory } from "../ecs/entity-factory";
import type { PlayerDomain } from "../store/player-domain";
import type { ViewportController } from "./viewport-controller";
import type { SceneLayers } from "./scene-layers";
import type { RenderQueue, Viewport } from "../render/RenderQueue";
import { buildMinimapBase } from "../map-display";
import { T } from "../world";
import type { IRenderer } from "../renderer";
import { logger } from "../debug/logger";

/** Результат ECS-загрузки карты */
export interface LoadMapResult {
  playerBody: any;
  playerEid: number;
}

/**
 * MapLoaderService — загрузка и очистка карт.
 *
 * Этап 8: принимает SceneLayers вместо SceneManager.
 * Этап 9: добавлена SpriteFactory для создания графических объектов без импорта Graphics.
 * Фаза 3: работает через IRenderer, без прямых импортов pixi.js.
 */
export class MapLoaderService {
  ecsMapLoader: EcsMapLoader | null = null;
  private _mmBase: ImageData | null = null;
  /** Предыдущий PlanckWorld — уничтожается при загрузке новой карты */
  private _prevPlanckWorld: PlanckWorld | null = null;
  /** Фабрика чистых ECS-сущностей (без графики/физики) */
  entityFactory: EntityFactory;
  /** Фабрика графических объектов (создаёт через IRenderer, не через legacy containers) */
  private _spriteFactory: SpriteFactory;
  /** IRenderer для создания спрайтов карты */
  private _renderer!: IRenderer;
  /** Очередь отрисовки (task_14) */
  private _renderQueue!: RenderQueue;
  /** Слои сцены (handle'ы передаются в EcsMapLoader для батчей карты) */
  private _sceneLayers!: SceneLayers;

  constructor(
    private store: GameStore,
    private viewport: ViewportController,
    private sceneLayers: SceneLayers,
    private ecsWorld: World,
    private prefabWorld: World,
    spriteFactory?: SpriteFactory
  ) {
    // Фабрика создаётся ОДИН раз при инициализации сервиса
    this.entityFactory = createEntityFactory(this.ecsWorld, this.prefabWorld);
    // Фаза 3/Регрессия: default-фабрика создаёт через IRenderer.createGraphics()
    // и добавляет в dynamic layer (в worldContainer), а не в legacy Container.
    // Это исправляет регрессию: ECS-сущности теперь двигаются с камерой.
    this._spriteFactory = spriteFactory ?? {
      create: (x: number, y: number) => {
        const g = this._renderer.createGraphics();
        this._renderer.setGraphicsPosition(g, { x, y });
        this._renderer.setGraphicsZIndex(g, Math.round(y));
        return g;
      },
    };
  }

  /** Инициализация с IRenderer и RenderQueue (вызывается один раз) */
  init(renderer: IRenderer, renderQueue: RenderQueue): void {
    this._renderer = renderer;
    this._renderQueue = renderQueue;
    this._sceneLayers = this.sceneLayers;
  }

  /** Текущая область видимости камеры (для viewport culling в RenderQueue.flush) */
  getViewport(): Viewport {
    return {
      camX: this.viewport.cam.x ?? 0,
      camY: this.viewport.cam.y ?? 0,
      viewW: this.viewport.viewW,
      viewH: this.viewport.viewH,
    };
  }

  /** Фабрика графических объектов */
  get spriteFactory(): SpriteFactory {
    return this._spriteFactory;
  }

  get mmBase(): ImageData | null { return this._mmBase; }

  /** ECS загрузка карты: тайлы + сущности + миникарта */
  loadMapEcs(
    map: WorldData,
    spawn: Vec,
    playerDomain: PlayerDomain,
    playerG: number,
    savedDrops: Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }>,
    toast: (msg: string) => void,
    onPlayerCreated?: (eid: number) => void
  ): LoadMapResult {
    // 0. Уничтожить предыдущий PlanckWorld — избежать утечки физических тел
    if (this._prevPlanckWorld) {
      this._prevPlanckWorld.destroy();
      this._prevPlanckWorld = null;
    }

    // Создаём ECS Map Loader (используется общий ECS-мир движка).
    // ECS-рефакторинг рендеринга: loader сам создаёт синглтон-сущность карты
    // с компонентом MapState (батчи генерируются ОДИН раз); регистрация
    // батчей в RenderQueue и их выгрузка — задача mapRenderSystem (каждый кадр).
    const newPlanckWorld = new PlanckWorld();
    this.ecsMapLoader = new EcsMapLoader({
      world: this.ecsWorld,
      planckWorld: newPlanckWorld,
      openedChests: this.store.openedChests,
      takenPedestals: this.store.takenPedestals,
      visitedShrines: this.store.visitedShrines,
      spriteFactory: this._spriteFactory,
      renderer: this._renderer,
      roofSnow: this.store.roofSnow,
      flags: {
        secretKnown: this.store.flags.secretKnown,
        shrineIdx: this.store.flags.shrineIdx,
        runes: this.store.flags.runes,
        snakeStarted: this.store.flags.snakeStarted,
        hasKey: this.store.flags.hasKey,
      },
      map,
      spawn,
      viewW: this.viewport.viewW,
      viewH: this.viewport.viewH,
      savedDrops,
      toast,
      entityFactory: this.entityFactory,
    });
    // Сохраняем для уничтожения при следующей загрузке карты
    this._prevPlanckWorld = newPlanckWorld;

    // Загружаем карту в ECS (teardownWorld уничтожает ECS-сущности старой карты)
    const result = this.ecsMapLoader.loadMap(playerG, playerDomain, onPlayerCreated);

    // ===== ECS-рефакторинг рендеринга (task_14) =====
    // Генерация батчей карты выполнена ОДИН раз внутри ecsMapLoader.loadMap
    // (createMapEntity → MapState). Каждую карту регистрирует и выгружает
    // ECS-система mapRenderSystem в фазе render() игрового цикла — здесь
    // императивный вызов MapRenderSystem.loadMap/clear больше не нужен.

    this._mmBase = buildMinimapBase(map);
    return result;
  }
}
