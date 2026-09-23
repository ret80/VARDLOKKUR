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
import type { RenderQueue } from "../render/RenderQueue";
import { MapRenderSystem } from "../render/MapRenderSystem";
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
  /** Система рендеринга карты (task_14) */
  private _mapRenderSystem!: MapRenderSystem;
  /** Слои сцены (для передачи handle'ов в MapRenderSystem) */
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

  /** Инициализация с IRenderer, RenderQueue и MapRenderSystem (вызывается один раз) */
  init(renderer: IRenderer, renderQueue: RenderQueue, mapRenderSystem: MapRenderSystem): void {
    this._renderer = renderer;
    this._renderQueue = renderQueue;
    this._mapRenderSystem = mapRenderSystem;
    this._sceneLayers = this.sceneLayers;
    // Передаём handle'ы слоёв в MapRenderSystem
    mapRenderSystem.setLayerHandles(
      (this._sceneLayers as any).tileLayerHandle,
      (this._sceneLayers as any).dynamicHandle
    );
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

    // Создаём ECS Map Loader (используется общий ECS-мир движка)
    const newPlanckWorld = new PlanckWorld();
    this.ecsMapLoader = new EcsMapLoader({
      world: this.ecsWorld,
      planckWorld: newPlanckWorld,
      openedChests: this.store.openedChests,
      takenPedestals: this.store.takenPedestals,
      visitedShrines: this.store.visitedShrines,
      spriteFactory: this._spriteFactory,
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

    // ===== Task 14: MapRenderSystem — геометрический рендеринг карты =====
    // Очищаем очередь от старой графики карты
    this._mapRenderSystem.clear(this._renderer, this._renderQueue);
    // Устанавливаем флаг снега
    this._mapRenderSystem.roofSnow = this.store.roofSnow;
    // Загружаем геометрию карты в очередь (ground-батч + стены + дома)
    this._mapRenderSystem.loadMap(map, this._renderer, this._renderQueue);

    this._mmBase = buildMinimapBase(map);
    return result;
  }
}
