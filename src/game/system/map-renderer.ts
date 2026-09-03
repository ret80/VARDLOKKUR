/* ============ MapRenderer ============
 * Создаёт Graphics для сущностей, рисует их, добавляет в dynamic container.
 * Не знает про загрузку карты, только "нарисуй сущность". */

import { Graphics, Sprite } from "pixi.js";
import {
  IChestData, IPedestalData, IShrineData, INpcData,
  IDropData, IDoorData, IBarrierData, IAltarData,
} from "../entities";
import type { ChestRt, PedestalRt, ShrineRt, NpcRt, DoorRt, DropRt } from "../store";
import type { GraphicsFactory } from "./render-system";
import type { EntityManager } from "./entity-manager";

export class MapRenderer {
  constructor(
    private renderers: {
      chest: { render(g: Graphics, data: IChestData, t?: number): void };
      pedestal: { render(g: Graphics, data: IPedestalData, t?: number): void };
      shrine: { render(g: Graphics, data: IShrineData, t?: number): void };
      npc: { render(g: Graphics, data: INpcData, t?: number, extra?: any): void };
      drop: { render(g: Graphics, data: IDropData, t?: number): void };
      door: { render(g: Graphics, data: IDoorData, t?: number): void };
      barrier: { render(g: Graphics, data: IBarrierData, t?: number): void };
      altar: { render(g: Graphics, data: IAltarData, t?: number): void };
    },
    private gfxFactory: GraphicsFactory,
    private dynamic: { addChild(child: Graphics | Sprite): void },
    private chests: ChestRt[],
    private pedestals: PedestalRt[],
    private shrines: ShrineRt[],
    private npcs: NpcRt[],
    private doors: DoorRt[],
    private drops: DropRt[],
    private entityMgr: EntityManager
  ) {}

  /* ===== Рендер сущностей ===== */

  renderChests(t: number) {
    for (const c of this.chests) {
      if (!c.g) {
        c.g = this.gfxFactory.createGraphics();
        c.g.position.set(c.x, c.y);
        this.dynamic.addChild(c.g);
      }
      this.renderers.chest.render(c.g, { opened: c.opened } as IChestData, t);
    }
  }

  renderPedestals(t: number) {
    for (const p of this.pedestals) {
      if (!p.g) {
        p.g = this.gfxFactory.createGraphics();
        p.g.position.set(p.x, p.y);
        this.dynamic.addChild(p.g);
      }
      this.renderers.pedestal.render(p.g, { taken: p.taken, guardsLeft: p.guardsLeft } as IPedestalData, t);
    }
  }

  renderShrines(t: number) {
    for (const s of this.shrines) {
      if (!s.g) {
        s.g = this.gfxFactory.createGraphics();
        s.g.position.set(s.x, s.y);
        this.dynamic.addChild(s.g);
      }
      this.renderers.shrine.render(s.g, { lit: false } as IShrineData, t);
    }
  }

  renderNpcs(t: number) {
    for (const n of this.npcs) {
      if (!n.g) {
        n.g = this.gfxFactory.createGraphics();
        n.g.position.set(n.x, n.y);
        this.dynamic.addChild(n.g);
      }
      this.renderers.npc.render(n.g, { id: n.id, name: n.name } as INpcData, t);
    }
  }

  renderDoors() {
    for (const d of this.doors) {
      if (!d.g) {
        d.g = this.gfxFactory.createGraphics();
        d.g.position.set(d.x, d.y);
        this.dynamic.addChild(d.g);
      }
      this.renderers.door.render(d.g, { open: d.open, locked: d.locked } as IDoorData);
    }
  }

  renderDrops(t: number) {
    for (const d of this.drops) {
      if (!d.g) {
        d.g = this.gfxFactory.createGraphics();
        d.g.position.set(d.x, d.y);
        this.dynamic.addChild(d.g);
      }
      this.renderers.drop.render(d.g, d as IDropData, t);
    }
  }

  renderBarrier(t: number) {
    const b = this.entityMgr.barrier;
    if (b) {
      if (!b.g) {
        b.g = this.gfxFactory.createGraphics();
        b.g.position.set(b.x, b.y);
        this.dynamic.addChild(b.g);
      }
      if (b.active) {
        this.renderers.barrier.render(b.g, { active: true } as IBarrierData, t);
      }
    }
  }

  renderAltar(t: number, runes: number) {
    const a = this.entityMgr.altar;
    if (a) {
      if (!a.g) {
        a.g = this.gfxFactory.createGraphics();
        a.g.position.set(a.x, a.y);
        this.dynamic.addChild(a.g);
      }
      this.renderers.altar.render(a.g, { runes } as IAltarData, t);
    }
  }

  /* ===== Единый метод рендера ===== */

  renderAll(t: number, runes: number) {
    this.renderChests(t);
    this.renderPedestals(t);
    this.renderShrines(t);
    this.renderNpcs(t);
    this.renderDoors();
    this.renderDrops(t);
    this.renderBarrier(t);
    this.renderAltar(t, runes);
  }
}
