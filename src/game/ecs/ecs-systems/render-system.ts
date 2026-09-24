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
  Sprite as SpriteComp,
  Dead,
  Hidden,
  Taken,
  SpriteRegistry,
  Radius,
  StringPool,
  poolGet,
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
import type { InteractableHit } from './interaction-system';
import type { RenderContext } from '../../renderers';
import { FloatTextLayer } from '../../renderers/float/FloatTextLayer';
import { logger } from '../../debug/logger';
import { getRenderQueue, RENDER_LAYER, type RenderEntry } from '../../render/RenderQueue';

// ============================================================
// Утилиты рендеринга
// ============================================================

/** Получить GraphicsHandle из SpriteRegistry по eid */
function getSpriteHandle(eid: number): number | undefined {
  const idx = SpriteComp.ref[eid];
  if (idx <= 0 || idx > SpriteRegistry.length) {
    return undefined;
  }
  // SpriteRegistry хранит реальные GraphicsHandle (id от createGraphics)
  return SpriteRegistry[idx - 1];
}

/**
 * Обеспечить запись в RenderQueue для сущности.
 * Создаёт запись при первом обращении (Graphics уже создан spriteFactory).
 */
export function ensureRenderEntry(eid: number, layer: number): RenderEntry | null {
  const q = getRenderQueue();
  if (!q) return null;
  const existing = q.getByKey(eid);
  if (existing) return existing;
  const handle = getSpriteHandle(eid);
  if (handle === undefined) return null;
  const entry: RenderEntry = {
    x: Position.x[eid],
    y: Position.y[eid],
    layer,
    alpha: 1,
    visible: true,
    handle: handle as GraphicsHandle,
    key: eid,
  };
  q.enqueue(entry);
  return entry;
}

/**
 * Убрать запись очереди для удалённой сущности.
 * Graphics уничтожает вызывающий код (renderer.destroyGraphics).
 */
export function unregisterSpriteHandle(eid: number): void {
  const q = getRenderQueue();
  if (q) q.takeByKey(eid);
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
  /** Позиция камеры (для screen-space элементов: hint-подсказки) */
  cam: { x: number; y: number };
  /** Callback для получения сигнатуры NPC */
  getNpcSig?: (npcId: string) => string;
  /** Карта сигнатур диалогов */
  talkedSig?: Map<string, string>;
  /** Ближайший интерактивный объект */
  nearestInteractable?: InteractableHit | null;
}

// ============================================================
// Хелперы string-пулов
// ============================================================

function poolEnemyKind(eid: number): string {
  return poolGet(StringPool.enemyKinds, Enemy.kind[eid]);
}
function poolDropKind(eid: number): string {
  return poolGet(StringPool.dropKinds, Drop.kind[eid]);
}
function poolProjectileKind(eid: number): string {
  return poolGet(StringPool.projectileKinds, Projectile.kind[eid]);
}
function poolNpcId(eid: number): string {
  return poolGet(StringPool.npcIds, NPC.id[eid]);
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

  /** Persistent GraphicsHandle для подсказки взаимодействия */
  private _hintG: GraphicsHandle | null = null;

  /** Конфигурация всех статических объектов окружения */
  private readonly OBJECT_QUERIES: ObjectQueryConfig[] = [
    { components: [SpriteComp, Chest], key: "chest", mapper: eidToChestData },
    { components: [SpriteComp, Pedestal], key: "pedestal", mapper: eidToPedestalData },
    { components: [SpriteComp, Shrine], key: "shrine", mapper: eidToShrineData },
    { components: [SpriteComp, Door], key: "door", mapper: eidToDoorData },
    { components: [SpriteComp, Barrier], key: "barrier", mapper: eidToBarrierData },
    { components: [SpriteComp, Altar], key: "altar", mapper: eidToAltarData },
  ];

  /** Инициализировать рендерер (внедрение зависимости) */
  init(renderer: IRenderer): void {
    this.renderer = renderer;
    // Подсказка взаимодействия рисуется поверх всего — отдельный Graphics в overlay-слое
    const overlay = renderer.createLayer('overlay', 9999);
    this._hintG = renderer.createGraphics(overlay);
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
    for (const eid of query(world, [SpriteComp, NPC])) {
      ensureRenderEntry(eid, RENDER_LAYER.DYNAMIC);
      const spriteIdx = SpriteComp.ref[eid];
      if (spriteIdx <= 0 || spriteIdx > SpriteRegistry.length) continue;
      const sprite = SpriteRegistry[spriteIdx - 1];
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
      if (matches.length === 0) {
        logger.debug('render', `renderObjectsEcs: no ${config.key} found`);
      }
      for (const eid of matches) {
        const entry = ensureRenderEntry(eid, RENDER_LAYER.DYNAMIC);
        // Viewport culling по записи очереди
        if (entry && !entry.visible) continue;

        const spriteIdx = SpriteComp.ref[eid];
        if (spriteIdx <= 0 || spriteIdx > SpriteRegistry.length) continue;
        const sprite = SpriteRegistry[spriteIdx - 1];
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
    const { time, dt, float, playerEid, nearestInteractable } = opts;
    const r = this.getR();

    // Lazy-init FloatTextLayer — один раз при первом вызове render()
    if (!float.isInit) {
      float.init(r);
    }

    // Лог: состояние игрока при рендере (раз в 5 сек)
    if (playerEid >= 0 && time % 5 < dt) {
      logger.debug('render', `playerEid=${playerEid} Dead=${!!Dead[playerEid]} handle=${getSpriteHandle(playerEid)}`);
    }

    // === Единый проход: обновить записи очереди (позиция + видимость + альфа) ===
    const q = getRenderQueue();
    if (q) {
      for (const eid of query(world, [Position, SpriteComp])) {
        const entry = ensureRenderEntry(eid, RENDER_LAYER.DYNAMIC);
        if (!entry) continue;

        const px = Position.x[eid];
        const py = Position.y[eid];
        const radius = Radius.value[eid] || 8;

        entry.x = px;
        entry.y = py;

        // Видимость через viewport culling
        entry.visible = r.isVisibleInViewport({ x: px, y: py }, radius);

        // Альфа: Dead/Hidden/hurt-мигание игрока
        if (eid === playerEid && Dead[eid]) entry.alpha = 0;
        else if (Hidden[eid]) entry.alpha = 0.25;
        else if (eid === playerEid && Player.hurtT[eid] > 0 && Math.floor(time * 14) % 2 === 0) entry.alpha = 0.35;
        else entry.alpha = 1;

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
      [SpriteComp, Enemy],
      poolEnemyKind,
      enemyRegistry,
      (eid) => eidToEnemyData(eid, world),
      time
    );

    // Снаряды
    this.renderByRegistry(
      world,
      [SpriteComp, Projectile],
      poolProjectileKind,
      projectileRegistry,
      (eid) => eidToProjectileData(eid, world),
      time
    );

    // Дропы
    this.renderByRegistry(
      world,
      [SpriteComp, Drop],
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

    // Interaction hint (E) — подсказка взаимодействия над ближайшим объектом
    this.renderInteractionHint(opts.cam, nearestInteractable, time);

    // Сортировка и применение записей очереди — в RenderPipeline (queue.flush)
  }

  /** Рендеринг игрока (ECS) — перерисовка Graphics */
  private renderPlayerEcs(
    world: World,
    playerEid: number,
    ctx: RenderContext
  ): void {
    if (playerEid < 0) return;
    if (!!Dead[playerEid]) return;

    const handle = getSpriteHandle(playerEid);
    if (handle === undefined) {
      logger.warn('render', `playerEid=${playerEid} handle is undefined`);
      return;
    }

    const spriteIdx = SpriteComp.ref[playerEid];
    if (spriteIdx <= 0 || spriteIdx > SpriteRegistry.length) return;
    const sprite = SpriteRegistry[spriteIdx - 1];
    if (!sprite) return;

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
      if (isEnemy && Dead[eid]) continue;
      // Для дропов проверяем taken
      if (isDrop && Taken[eid]) continue;

      const entry = ensureRenderEntry(eid, isDrop ? ENTITY_LAYER.Drop : RENDER_LAYER.DYNAMIC);
      // Viewport culling по записи очереди
      if (entry && !entry.visible) continue;

      const key = keyOf(eid);
      const renderer = reg.get(key);
      if (!renderer) continue;

      const spriteIdx = SpriteComp.ref[eid];
      if (spriteIdx <= 0 || spriteIdx > SpriteRegistry.length) continue;
      const sprite = SpriteRegistry[spriteIdx - 1];
      if (!sprite) continue;

      const data = mapper(eid);
      try {
        (renderer as any).render(sprite, data, { time, renderer: r });
      } catch (err) {
        logger.warn('render', `Render failed eid=${eid}: ${err}`);
      }
    }
  }

  /** Отрисовать подсказку взаимодействия над ближайшим интерактивным объектом */
  private renderInteractionHint(
    cam: { x: number; y: number },
    nearestInteractable: InteractableHit | null | undefined,
    time: number
  ): void {
    if (!this._hintG) return;
    const r = this.getR();

    if (!nearestInteractable) {
      r.setGraphicsVisible(this._hintG, false);
      return;
    }

    r.setGraphicsVisible(this._hintG, true);

    // _hintG находится в overlay-слое внутри worldContainer —
    // worldContainer уже сдвинут камерой, используем мировые координаты напрямую
    const hx = nearestInteractable.x;
    const hy = nearestInteractable.y - 20 + Math.sin(time * 5) * 1.5;

    r.clearGraphics(this._hintG);

    // Тёмный фон (нормализованные цвета 0–1)
    r.drawRect(this._hintG,
      { x: hx - 6, y: hy - 6, width: 12, height: 10 },
      { r: 0x0a / 255, g: 0x0f / 255, b: 0x16 / 255, a: 0.85 }, true);

    // Золотая рамка
    r.drawRect(this._hintG,
      { x: hx - 6, y: hy - 6, width: 12, height: 10 },
      { r: 0xc9 / 255, g: 0xa2 / 255, b: 0x4b / 255, a: 0.8 }, false, 1);

    // Буква "E" — пиксель-арт стиль
    r.drawPoly(this._hintG, [
      hx - 2, hy - 3, hx + 2, hy - 3,
      hx + 2, hy - 1, hx, hy - 1,
      hx, hy + 2, hx - 2, hy + 2
    ], { r: 0xe8 / 255, g: 0xdc / 255, b: 0xc0 / 255, a: 1 });
  }
}

// ============================================================
// Обёртки для обратной совместимости
// ============================================================

/** Синглтон RenderSystem — создаётся один раз и переиспользуется */
const _renderSystemInstance = new RenderSystem();

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
