/* render-system.ts — ECS система рендеринга поверх RenderQueue (task_14).
 *
 * Все динамические сущности (игрок, враги, снаряды, дропы, NPC, объекты)
 * перед отрисовкой помещаются в RenderEntry. Позиция/видимость/альфа
 * обновляются в записях очереди; сортировка и применение — в queue.flush()
 * (вызывается RenderPipeline после всех слоёв).
 */

import { query, hasComponent, type World } from 'bitecs';
import type { IRenderer, GraphicsHandle } from '../../renderer/IRenderer';
import {
  Position,
  Velocity,
  Health,
  Time,
  Direction,
  RenderLayer,
  Player,
  Enemy,
  Projectile,
  Drop,
  NPC,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  Sprite,
  Hidden,
  Taken,
  Magnet,
  Dead,
  poolGet,
  StringPool,
} from '../ecs-components';
import {
  enemyRegistry,
  npcRegistry,
  dropRegistry,
  projectileRegistry,
  objectRegistry,
} from '../../renderers';
import { playerRenderer } from '../../renderers/player/playerRendererInstance';
import {
  eidToEnemyData,
  eidToDropData,
  eidToProjectileData,
  eidToNpcData,
  eidToChestData,
  eidToPedestalData,
  eidToShrineData,
  eidToDoorData,
  eidToBarrierData,
  eidToAltarData,
  playerToRenderData,
} from '../../renderers/ecs-mappers';
import type { RenderContext } from '../../renderers';
import { FloatTextLayer } from '../../renderers/float/FloatTextLayer';
import { logger } from '../../debug/logger';
import { getRenderQueue, RENDER_LAYER, type RenderEntry } from '../../render/RenderQueue';

// ============================================================
// Утилиты рендеринга
// ============================================================

/** Получить GraphicsHandle из Sprite.ref (хранит handle напрямую) */
function getSpriteHandle(eid: number): number | undefined {
  const sprite = Sprite[eid];
  if (!sprite) {
    return undefined;
  }
  const handle = sprite.ref;
  // Проверяем undefined, а не falsy — handle=0 может быть валидным значением
  if (handle === undefined) {
    return undefined;
  }
  return handle;
}

/**
 * Обеспечить запись в RenderQueue для сущности.
 * Создаёт запись при первом обращении (Graphics уже создан spriteFactory).
 */
export function ensureRenderEntry(eid: number, layer: number): RenderEntry | null {
  const q = getRenderQueue();
  if (!q) return null;
  const handle = getSpriteHandle(eid);
  if (handle === undefined) return null;
  // Проверка что Position инициализирован (AoS объект может быть undefined)
  const pos = Position[eid];
  if (!pos) return null;
  const entry: RenderEntry = {
    x: pos.x,
    y: pos.y,
    layer,
    alpha: 1,
    visible: true,
    handle: handle as GraphicsHandle,
  };
  q.enqueue(entry);
  return entry;
}

/** Конфигурация диспетчера объектов окружения */
type ObjectQueryConfig = {
  components: any[];
  key: string;
  mapper: (eid: number, world: World) => any;
};

// ============================================================
// Слои отрисовки типов сущностей
// ============================================================

/** Слой отрисовки для каждого типа сущности (см. RENDER_LAYER) */
export const ENTITY_LAYER: Record<string, number> = {
  Drop: RENDER_LAYER.DROP,
  Wall: RENDER_LAYER.DYNAMIC,
  House: RENDER_LAYER.DYNAMIC,
  NPC: RENDER_LAYER.DYNAMIC,
  Door: RENDER_LAYER.DYNAMIC,
  Barrier: RENDER_LAYER.DYNAMIC,
  Altar: RENDER_LAYER.DYNAMIC,
  Enemy: RENDER_LAYER.DYNAMIC,
  Projectile: RENDER_LAYER.DYNAMIC,
  Player: RENDER_LAYER.DYNAMIC,
};

// ============================================================
// Options для RenderSystem.render()
// ============================================================

export interface RenderSystemOptions {
  world: World;
  time: number;
  dt: number;
  /** FloatTextLayer для плавающего текста */
  float: FloatTextLayer;
  /** ID игрока */
  playerEid: number;
  /** Callback для получения сигнатуры NPC */
  getNpcSig?: (npcId: string) => string;
  /** Карта сигнатур диалогов */
  talkedSig?: Map<string, string>;
}

// ============================================================
// Хелперы string-пулов
// ============================================================

function poolEnemyKind(eid: number): string {
  if (!Enemy[eid]) return '';
  return poolGet(StringPool.enemyKinds, Enemy[eid].kind);
}
function poolDropKind(eid: number): string {
  if (!Drop[eid]) return '';
  return poolGet(StringPool.dropKinds, Drop[eid].kind);
}
function poolProjectileKind(eid: number): string {
  if (!Projectile[eid]) return '';
  return poolGet(StringPool.projectileKinds, Projectile[eid].kind);
}
function poolNpcId(eid: number): string {
  if (!NPC[eid]) return '';
  return poolGet(StringPool.npcIds, NPC[eid].id);
}

// ============================================================
// Главный класс RenderSystem (ECS-оркестратор)
// ============================================================

/**
 * RenderSystem — класс-оркестратор рендеринга ECS-сущностей.
 *
 * Динамические сущности не трогаются напрямую — только через RenderEntry.
 * Финальная сортировка и применение — RenderQueue.flush() в RenderPipeline.
 */
export class RenderSystem {
  /** IRenderer — внедряется через init() (DIP) */
  private renderer: IRenderer | null = null;

  /** Конфигурация всех статических объектов окружения */
  private readonly OBJECT_QUERIES: ObjectQueryConfig[] = [
    { components: [Sprite, Chest], key: "chest", mapper: eidToChestData },
    { components: [Sprite, Pedestal], key: "pedestal", mapper: eidToPedestalData },
    { components: [Sprite, Shrine], key: "shrine", mapper: eidToShrineData },
    { components: [Sprite, Door], key: "door", mapper: eidToDoorData },
    { components: [Sprite, Barrier], key: "barrier", mapper: eidToBarrierData },
    { components: [Sprite, Altar], key: "altar", mapper: eidToAltarData },
  ];

  /** Инициализировать рендерер (внедрение зависимости) */
  init(renderer: IRenderer): void {
    this.renderer = renderer;
  }

  /** Получить рендерер (для внутренних методов) */
  private getR(): IRenderer {
    if (!this.renderer) {
      throw new Error('RenderSystem not initialized. Call init(renderer) first.');
    }
    return this.renderer;
  }

  /** Проверить, есть ли у NPC маркер */
  private npcHasMark(
    npcId: string,
    getNpcSig?: (npcId: string) => string,
    talkedSig?: Map<string, string>
  ): boolean {
    const sig = getNpcSig ? getNpcSig(npcId) : "";
    if (!sig) return false;
    return talkedSig?.get(npcId) !== sig;
  }

  /** Очистить все данные рендера для удалённой сущности */
  cleanupEnemy(_eid: number): void {
    // Кэш prevData (DYNAMIC_TEXTURE) удалён — геометрия рисуется напрямую каждый кадр
  }

  /** Рендеринг NPC (ECS) — перерисовка Graphics, позиция в очереди */
  private renderNpcsEcs(
    world: World,
    ctx: RenderContext,
    getNpcSig?: (npcId: string) => string,
    talkedSig?: Map<string, string>
  ): void {
    for (const eid of query(world, [Sprite, NPC])) {
      ensureRenderEntry(eid, RENDER_LAYER.DYNAMIC);
      const spriteData = Sprite[eid];
      if (!spriteData) continue;
      const sprite = spriteData.ref;
      if (!sprite) continue;

      const npcId = poolNpcId(eid);
      const mark = this.npcHasMark(npcId, getNpcSig, talkedSig);
      const data = eidToNpcData(eid, world);

      const npcCtx = { ...ctx, mark } as any;
      const renderer = npcRegistry.get(npcId as any) ?? npcRegistry.get("default" as any);
      if (renderer) {
        try {
          (renderer as any).render(sprite, data, npcCtx);
        } catch (err) {
          logger.warn('render', `NPC render failed for eid=${eid}: ${err}`);
        }
      }
    }
  }

  /** Единый диспетчер отрисовки объектов окружения */
  private renderObjectsEcs(world: World, ctx: RenderContext): void {
    const r = ctx.renderer!;
    if (!r) {
      logger.error('render', 'renderObjectsEcs: ctx.renderer is undefined');
      return;
    }

    for (const config of this.OBJECT_QUERIES) {
      const renderer = objectRegistry.getOrThrow(config.key);
      const matches = [...query(world, config.components)];
      // if (matches.length === 0) {
      //   logger.debug('render', `renderObjectsEcs: no ${config.key} found`);
      // }
      for (const eid of matches) {
        const entry = ensureRenderEntry(eid, RENDER_LAYER.DYNAMIC);
        // Viewport culling по записи очереди
        if (entry && !entry.visible) continue;

        const spriteData = Sprite[eid];
        if (!spriteData) continue;
        const sprite = spriteData.ref;
        if (!sprite) continue;

        const data = config.mapper(eid, world);
        try {
          (renderer as any).render(sprite, data, ctx);
        } catch (err) {
          logger.warn('render', `Object render failed for eid=${eid}: ${err}`);
        }
      }
    }
  }

  /** Выполнить полный рендеринг */
  render(
    world: World,
    opts: RenderSystemOptions
  ): void {
    const { time, dt, float, playerEid } = opts;
    const r = this.getR();

    // Lazy-init FloatTextLayer — один раз при первом вызове render()
    if (!float.isInit) {
      float.init(r);
    }

    // Лог: состояние игрока при рендере (раз в 5 сек)
    // if (playerEid >= 0 && time % 5 < dt) {
    //   logger.debug('render', `playerEid=${playerEid} Dead=${!!Dead[playerEid]} handle=${getSpriteHandle(playerEid)}`);
    // }

    // === Единый проход: обновить записи очереди (позиция + видимость + альфа) ===
    const q = getRenderQueue();
    if (q) {
      const entities = [...query(world, [Position, Sprite])];
      for (const eid of entities) {
        const entry = ensureRenderEntry(eid, RENDER_LAYER.DYNAMIC);
        if (!entry) {
          continue;
        }

        const pos = Position[eid];
        if (!pos) continue;
        const px = pos.x;
        const py = pos.y;

        entry.x = px;
        entry.y = py;

        // Альфа: Dead/Hidden/hurt-мигание игрока
        if (eid === playerEid && hasComponent(world, eid, Dead)) {
          entry.alpha = 0;
        } else if (hasComponent(world, eid, Hidden)) {
          entry.alpha = 0.25;
        } else if (eid === playerEid && Player[eid] && Player[eid].hurtT > 0 && Math.floor(time * 14) % 2 === 0) {
          entry.alpha = 0.35;
        } else {
          entry.alpha = 1;
        }

        // Слой дропа ниже динамических сущностей
        if (hasComponent(world, eid, Drop)) entry.layer = ENTITY_LAYER.Drop;
      }
    }

    // === Диспетчеризация через реестры (перерисовка геометрии тел) ===
    const ctx: RenderContext = { time, renderer: r };

    // Игрок
    this.renderPlayerEcs(world, playerEid, ctx);

    // Враги
    this.renderByRegistry(
      world,
      [Sprite, Enemy],
      poolEnemyKind,
      enemyRegistry,
      (eid) => eidToEnemyData(eid, world),
      time
    );

    // Снаряды
    this.renderByRegistry(
      world,
      [Sprite, Projectile],
      poolProjectileKind,
      projectileRegistry,
      (eid) => eidToProjectileData(eid, world),
      time
    );

    // Дропы
    this.renderByRegistry(
      world,
      [Sprite, Drop],
      poolDropKind,
      dropRegistry,
      (eid) => eidToDropData(eid, world),
      time
    );

    // NPC
    this.renderNpcsEcs(world, ctx, opts.getNpcSig, opts.talkedSig);

    // Объекты окружения (сундуки, пьедесталы, святилища, двери, барьеры, алтари)
    this.renderObjectsEcs(world, ctx);

    // Обновить плавающий текст
    float.update(dt);

    // Сортировка и применение записей очереди — в RenderPipeline (queue.flush)
  }

  /** Рендеринг игрока (ECS) — перерисовка Graphics */
  private renderPlayerEcs(
    world: World,
    playerEid: number,
    ctx: RenderContext
  ): void {
    if (playerEid < 0) {
      return;
    }
    // Проверяем компонент Dead — чтобы не рендерить мёртвого игрока
    if (hasComponent(world, playerEid, Dead)) {
      return;
    }

    const handle = getSpriteHandle(playerEid);
    if (handle === undefined) {
      logger.warn('render', `renderPlayerEcs: playerEid=${playerEid} handle is undefined (Sprite[playerEid]=${JSON.stringify(Sprite[playerEid])})`);
      return;
    }

    const spriteData = Sprite[playerEid];
    if (!spriteData) {
      logger.warn('render', `renderPlayerEcs: playerEid=${playerEid} spriteData is undefined, skipping`);
      return;
    }
    const sprite = spriteData.ref as GraphicsHandle;
    if (!sprite) {
      logger.warn('render', `renderPlayerEcs: playerEid=${playerEid} sprite ref=${sprite}, skipping`);
      return;
    }

    const pos = Position[playerEid];

    const { data, extra } = playerToRenderData(playerEid, ctx.time);
    try {
      playerRenderer.render(sprite, { data, extra }, ctx);
    } catch (err) {
      logger.warn('render', `Player render failed for eid=${playerEid}: ${err}`);
    }
  }

  /** Универсальная диспетчеризация через реестр: перерисовка тел */
  private renderByRegistry<TKey extends string, TData>(
    world: World,
    mask: any[],
    keyOf: (eid: number) => TKey,
    reg: { get: (key: TKey) => any | undefined },
    mapper: (eid: number) => TData,
    time: number
  ): void {
    const isEnemy = mask.includes(Enemy);
    const isDrop = mask.includes(Drop);
    const r = this.getR();

    for (const eid of query(world, mask)) {
      // Для врагов проверяем dead
      if (isEnemy && hasComponent(world, eid, Dead)) continue;
      // Для дропов проверяем taken
      if (isDrop && hasComponent(world, eid, Taken)) continue;

      const entry = ensureRenderEntry(eid, isDrop ? ENTITY_LAYER.Drop : RENDER_LAYER.DYNAMIC);
      // Viewport culling по записи очереди
      if (entry && !entry.visible) continue;

      const key = keyOf(eid);
      const renderer = reg.get(key);
      if (!renderer) continue;

      const spriteData = Sprite[eid];
      if (!spriteData) continue;
      const sprite = spriteData.ref;
      if (!sprite) continue;

      const data = mapper(eid);
      try {
        (renderer as any).render(sprite, data, { time, renderer: r });
      } catch (err) {
        logger.warn('render', `Render failed eid=${eid}: ${err}`);
      }
    }
  }

}

// ============================================================
// Обёртки для обратной совместимости
// ============================================================

/** Синглтон RenderSystem — создаётся один раз и переиспользуется */
export const _renderSystemInstance = new RenderSystem();

/** Выполнить полный рендеринг (обёртка для обратной совместимости) */
export function renderSystem(
  world: World,
  opts: RenderSystemOptions
): void {
  _renderSystemInstance.render(world, opts);
}

/** Очистить данные рендера для удалённой сущности (обёртка над RenderSystem) */
export function cleanupRenderedEnemy(eid: number): void {
  _renderSystemInstance.cleanupEnemy(eid);
}
