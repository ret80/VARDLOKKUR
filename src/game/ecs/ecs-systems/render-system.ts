/* render-system.ts — ECS система рендеринга (SOLID: DIP)

   Этап 4: полностью удалена зависимость от PixiJS.
   - Удалены Application, Container, Graphics импорты
   - Sprite + SpriteRegistry заменены на Renderable
   - DYNAMIC_TEXTURE / TextureCacheManager удалены
   - render() принимает Batchers вместо Graphics
   - renderInteractionHint рисует через PrimitiveBatcher
*/

import { query, type World } from 'bitecs';
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
  Renderable,
  Dead,
  Hidden,
  Taken,
  Radius,
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
import type { InteractableHit } from './interaction-system';
import type { RenderContext } from '../../renderers';
import type { Batchers } from '../../engine/batcher-types.js';
import { FloatTextLayer } from '../../renderers/float/FloatTextLayer';
import { logger } from '../../debug/logger';
import { CameraController } from '../../engine/camera-controller';

// ============================================================
// Сортировка по глубине (z-index) на основе LAYER + y
// ============================================================

/** Слой отрисовки для каждого типа сущности */
export const ENTITY_LAYER: Record<string, number> = {
  Drop: 20,
  Wall: 40,
  House: 40,
  NPC: 40,
  Door: 40,
  Barrier: 40,
  Altar: 40,
  Enemy: 40,
  Projectile: 40,
  Player: 40,
};

// ============================================================
// Options для RenderSystem.render()
// ============================================================

export interface RenderSystemOptions {
  world: World;
  time: number;
  dt: number;
  batchers: Batchers;
  float: FloatTextLayer;
  cameraController: CameraController;
  playerEid: number;
  getNpcSig?: (npcId: string) => string;
  talkedSig?: Map<string, string>;
  nearestInteractable?: InteractableHit | null;
}

// ============================================================
// Главный класс RenderSystem (ECS-оркестратор)
// ============================================================

/**
 * RenderSystem — класс-оркестратор рендеринга ECS-сущностей.
 *
 * Этап 4: удалена зависимость от PixiJS.
 * - Все рендереры вызываются с Batchers вместо Graphics
 * - DYNAMIC_TEXTURE / TextureCacheManager удалены
 * - Сортировка по Y прямо в renderEntities()
 * - Interaction hint рисуется через batchers.primitive
 */
export class RenderSystem {
  /** Конфигурация всех статических объектов окружения */
  private readonly OBJECT_QUERIES = [
    { key: 'chest', components: [Renderable, Chest] as any[], mapper: eidToChestData },
    { key: 'pedestal', components: [Renderable, Pedestal] as any[], mapper: eidToPedestalData },
    { key: 'shrine', components: [Renderable, Shrine] as any[], mapper: eidToShrineData },
    { key: 'door', components: [Renderable, Door] as any[], mapper: eidToDoorData },
    { key: 'barrier', components: [Renderable, Barrier] as any[], mapper: eidToBarrierData },
    { key: 'altar', components: [Renderable, Altar] as any[], mapper: eidToAltarData },
  ];

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

  /** Выполнить полный рендеринг */
  render(
    world: World,
    opts: RenderSystemOptions
  ): void {
    const { time, dt, batchers, float, cameraController, playerEid } = opts;

    // Лог: состояние игрока при рендере (раз в 5 сек)
    if (playerEid >= 0 && time % 5 < dt) {
      logger.debug('render', `playerEid=${playerEid} Dead=${!!Dead[playerEid]}`);
    }

    // Слежение камеры за игроком
    if (playerEid >= 0 && Position.x.length > playerEid) {
      cameraController.trackPlayer(Position.x[playerEid], Position.y[playerEid]);
    }

    // --- Диспетчеризация через реестры ---
    const ctx: RenderContext = { time };

    // Игрок
    this.renderPlayerEcs(world, playerEid, ctx, batchers, opts);

    // Враги
    this.renderByRegistry(
      world,
      [Renderable, Enemy],
      StringPool.enemyKinds,
      enemyRegistry,
      (eid) => eidToEnemyData(eid, world),
      batchers,
      time,
      cameraController.cam,
      true
    );

    // Снаряды
    this.renderByRegistry(
      world,
      [Renderable, Projectile],
      StringPool.projectileKinds,
      projectileRegistry,
      (eid) => eidToProjectileData(eid, world),
      batchers,
      time,
      cameraController.cam,
      true
    );

    // Дропы
    this.renderByRegistry(
      world,
      [Renderable, Drop],
      StringPool.dropKinds,
      dropRegistry,
      (eid) => eidToDropData(eid, world),
      batchers,
      time,
      cameraController.cam
    );

    // NPC
    this.renderNpcsEcs(world, ctx, batchers, opts.getNpcSig, opts.talkedSig, cameraController.cam);

    // Объекты окружения (сундуки, пьедесталы, святилища, двери, барьеры, алтари)
    this.renderObjectsEcs(world, ctx, batchers, cameraController.cam);

    // Обновить и отрисовать плавающий текст (Этап 5: через PrimitiveBatcher)
    float.update(dt);
    float.render(batchers, cameraController.cam);

    // Interaction hint (E) — подсказка взаимодействия над ближайшим объектом
    this.renderInteractionHint(batchers, opts.nearestInteractable, opts.cameraController.cam, time);

    // Flush батчеров — вызывается RenderPipeline после render() всех слоёв
  }

  /** Рендеринг игрока (ECS) — viewport culling */
  private renderPlayerEcs(
    world: World,
    playerEid: number,
    ctx: RenderContext,
    batchers: Batchers,
    opts: RenderSystemOptions
  ): void {
    if (playerEid < 0) return;
    if (!!Dead[playerEid]) return;

    const playerX = Position.x[playerEid];
    const playerY = Position.y[playerEid];

    if (!opts.cameraController.isVisibleInViewport(playerX, playerY, 8)) {
      return;
    }

    // World → screen offset
    const cam = opts.cameraController.cam;
    batchers.primitive.setOffset(playerX - cam.x, playerY - cam.y);
    playerRenderer.render(batchers, playerToRenderData(playerEid, ctx.time), ctx);
    batchers.primitive.resetOffset();
  }

  /** Универсальная диспетчеризация через реестр */
  private renderByRegistry<TKey extends string, TData>(
    world: World,
    mask: any[],
    pool: string[],
    reg: { get: (key: TKey) => any | undefined },
    mapper: (eid: number) => TData,
    batchers: Batchers,
    time: number,
    cam?: { x: number; y: number },
    camRadiusCheck?: boolean
  ): void {
    const isEnemy = mask.includes(Enemy);

    for (const eid of query(world, mask)) {
      // Для врагов проверяем dead
      if (isEnemy && Dead[eid]) continue;
      // Для дропов проверяем taken
      if (mask.includes(Drop) && Taken[eid]) continue;

      const kindArr = mask.includes(Enemy) ? Enemy.kind :
                      mask.includes(Drop) ? Drop.kind :
                      mask.includes(Projectile) ? Projectile.kind : null;
      const key = kindArr ? (poolGet(pool, kindArr[eid]) as TKey) : (null as any);
      const r = reg.get(key);
      if (!r) continue;

      // Viewport culling для врагов и снарядов
      if (camRadiusCheck && cam) {
        const ex = Position.x[eid];
        const ey = Position.y[eid];
        const radius = Radius.value[eid] || 6;
        // Простая проверка: сущность должна быть в пределах viewport + radius
        if (ex < cam.x - radius - 64 || ex > cam.x + 1920 + radius ||
            ey < cam.y - radius - 64 || ey > cam.y + 1080 + radius) {
          continue;
        }
      }

      const data = mapper(eid);

      // World → screen offset
      if (cam) {
        batchers.primitive.setOffset(Position.x[eid] - cam.x, Position.y[eid] - cam.y);
      }
      r.render(batchers, data, { time });
      if (cam) {
        batchers.primitive.resetOffset();
      }
    }
  }

  /** Рендеринг NPC (ECS) */
  private renderNpcsEcs(
    world: World,
    ctx: RenderContext,
    batchers: Batchers,
    getNpcSig?: (npcId: string) => string,
    talkedSig?: Map<string, string>,
    cam?: { x: number; y: number }
  ): void {
    for (const eid of query(world, [Renderable, NPC])) {
      const npcId = poolGet(StringPool.npcIds, NPC.id[eid]);
      const mark = this.npcHasMark(npcId, getNpcSig, talkedSig);
      const data = eidToNpcData(eid, world);

      const npcCtx = { ...ctx, mark } as any;
      const renderer = npcRegistry.get(npcId as any) ?? npcRegistry.get("default" as any);
      if (renderer) {
        if (cam) {
          batchers.primitive.setOffset(Position.x[eid] - cam.x, Position.y[eid] - cam.y);
        }
        renderer.render(batchers, data, npcCtx);
        if (cam) {
          batchers.primitive.resetOffset();
        }
      }
    }
  }

  /** Единый диспетчер отрисовки объектов окружения */
  private renderObjectsEcs(
    world: World,
    ctx: RenderContext,
    batchers: Batchers,
    cam?: { x: number; y: number }
  ): void {
    for (const config of this.OBJECT_QUERIES) {
      const renderer = objectRegistry.getOrThrow(config.key as any);
      for (const eid of query(world, config.components)) {
        const data = config.mapper(eid, world);
        if (cam) {
          batchers.primitive.setOffset(Position.x[eid] - cam.x, Position.y[eid] - cam.y);
        }
        renderer.render(batchers, data, ctx);
        if (cam) {
          batchers.primitive.resetOffset();
        }
      }
    }
  }

  /** Отрисовать подсказку взаимодействия над ближайшим интерактивным объектом */
  private renderInteractionHint(
    batchers: Batchers,
    nearestInteractable: InteractableHit | null | undefined,
    cam: { x: number; y: number },
    time: number
  ): void {
    if (!nearestInteractable) return;

    // Координаты подсказки
    const hx = nearestInteractable.x - cam.x;
    const hy = nearestInteractable.y - cam.y - 20 + Math.sin(time * 5) * 1.5;

    // Тёмный фон
    batchers.primitive.pushRect(hx - 6, hy - 6, 12, 10, 0x0a0f16, 0.85);
    // Золотая рамка (4 линии)
    const w = 1;
    batchers.primitive.pushLine(hx - 6, hy - 6, hx + 6, hy - 6, 0xc9a24b, 0.8, w);
    batchers.primitive.pushLine(hx + 6, hy - 6, hx + 6, hy + 4, 0xc9a24b, 0.8, w);
    batchers.primitive.pushLine(hx + 6, hy + 4, hx - 6, hy + 4, 0xc9a24b, 0.8, w);
    batchers.primitive.pushLine(hx - 6, hy + 4, hx - 6, hy - 6, 0xc9a24b, 0.8, w);
    // Буква "E" — пиксель-арт стиль (прямоугольники)
    batchers.primitive.pushRect(hx - 2, hy - 3, 4, 1, 0xe8dcc0);
    batchers.primitive.pushRect(hx - 2, hy - 1, 4, 1, 0xe8dcc0);
    batchers.primitive.pushRect(hx - 2, hy + 1, 4, 1, 0xe8dcc0);
    batchers.primitive.pushRect(hx - 2, hy - 3, 1, 6, 0xe8dcc0);
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
