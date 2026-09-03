/* render-system.ts – Отрисовка: снежинки, guide arrow, float text, fog, все сущности */

import { Application, Container, Graphics, Text } from "pixi.js";
import { T, WorldData } from "../world";
import { clamp, dist2 } from "../utils";
import {
  type Player, type Enemy, type Projectile, type Drop,
} from "../entities";
import { type FloatText } from "../store";
import {
  IPlayerData, IEnemyData, INpcData, IDropData, IProjectileData,
  IChestData, IPedestalData, IShrineData, IDoorData, IBarrierData, IAltarData,
  IPlayerExtra,
  PlayerRenderer, EnemyRenderer, NpcRenderer, DropRenderer, ProjectileRenderer,
  ChestRenderer, PedestalRenderer, ShrineRenderer, DoorRenderer, BarrierRenderer, AltarRenderer
} from "../entities";
import { type EventBus } from "../event-bus";
import { type GameStore } from "../store";
import { type FxManager } from "../fx";
import { type FogSystem } from "./fog-system";
import { type QuestSystem } from "./quest-system";
import { type HudSystem } from "./hud-system";
import { type InteractionSystem } from "./interaction-system";
import { type EntityManager } from "./entity-manager";
import { drawMinimap } from "../tiles";
import { audio } from "../audio";

export interface RenderSystemConfig {
  entityMgr: EntityManager;
  fx: FxManager;
  fog: FogSystem;
  quests: QuestSystem;
  hud: HudSystem;
  interaction: InteractionSystem;
  npcSigProvider: { npcSig(id: string): string };
  talkedSig: Map<string, string>;
  flags: {
    hasSword: boolean; runes: number; shrineIdx: number;
    secretKnown: boolean; nornsFavor: boolean;
    killsByKind: Record<string, number>;
    bearGone: boolean; bear: boolean;
    hornDone: boolean; horn: boolean;
    meadDone: boolean; mead: boolean;
    oreDone: boolean; ore: boolean;
    moss: boolean; amber: boolean; flower: boolean;
    shamanDone: boolean;
    diary: boolean; refugeeDone: boolean;
    cullDone: boolean; merchantDone: boolean; bundle: boolean;
    ghostBane: boolean; dew: number;
    hasItem(k: string): boolean;
    hasEnhancement(k: string): boolean;
    getArrows(): number;
    getRunes(): number;
    getHearts(): number;
    getTotalKills(): number;
    getDeaths(): number;
  };
  store: {
    bossRef: () => any;
    map: () => WorldData | undefined;
    trackedQuest?: string;
  };
}

export class RenderSystem {
  private cfg: RenderSystemConfig;
  private renderers = {
    player: new PlayerRenderer(),
    enemy: new EnemyRenderer(),
    npc: new NpcRenderer(),
    drop: new DropRenderer(),
    projectile: new ProjectileRenderer(),
    chest: new ChestRenderer(),
    pedestal: new PedestalRenderer(),
    shrine: new ShrineRenderer(),
    door: new DoorRenderer(),
    barrier: new BarrierRenderer(),
    altar: new AltarRenderer(),
  };

  private arrowA = -Math.PI / 2;

  constructor(cfg: RenderSystemConfig) {
    this.cfg = cfg;
  }

  tick(
    rdt: number,
    app: Application,
    realT: number,
    state: { screen: string; dialogueActive?: boolean; hitstop: number; setTsTarget: (v: number) => void },
    map: WorldData | undefined,
    player: Player,
    playerG: Graphics,
    cam: { x: number; y: number },
    viewW: number,
    viewH: number,
    floats: FloatText[],
    fadeG: Graphics,
    fxScreen: Graphics,
    world: Container,
    hudTimer: number,
    setHudTimer: (v: number) => void,
    pushHud: (force?: boolean) => void,
    setAudioIntensity: (v: number) => void,
    minimapCanvas: HTMLCanvasElement | null,
    mmBase: ImageData | null
  ): number {
    if (!app) return realT;

    const t = realT + rdt;
    const fx = fxScreen;
    fx.clear();

    // Snow
    if (!map?.isDungeon) {
      for (const s of this.cfg.fx.snow) {
        s.y += s.s * rdt;
        s.x += Math.sin(t * 0.8 + s.d) * 8 * rdt - 4 * rdt;
        if (s.y > viewH) { s.y = -2; s.x = Math.random() * viewW; }
        if (s.x < -2) s.x = viewW;
        fx.rect(s.x, s.y, s.w, s.w).fill({ color: 0xc8d8e8, alpha: 0.4 });
      }
    }

    // Guide arrow
    this.drawGuide(fx, t, map, player, cam, viewW, viewH);

    // Float texts
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= rdt;
      f.txt.y -= 14 * rdt;
      f.txt.alpha = Math.max(0, f.life / 0.8);
      if (f.life <= 0) { f.txt.destroy(); floats.splice(i, 1); }
    }

    // World FX
    this.cfg.fx.updateParticles(rdt);
    this.cfg.fx.drawWorldFx(rdt, t);
    const sg = this.cfg.fx.worldParticleGraphics;

    // Ambient particles
    for (let i = 0; i < 3; i++) {
      const a = t * 0.7 + i * 2.1;
      const wx = player.x + Math.cos(a) * 26, wy = player.y - 8 + Math.sin(a * 1.7) * 10;
      sg.circle(wx, wy, 1.5).fill({ color: 0x8fd8e8, alpha: 0.5 + Math.sin(t * 3 + i) * 0.3 });
    }

    // Camera
    const m = map;
    const tx = m ? (m.W * T > viewW ? clamp(player.x - viewW / 2, 0, m.W * T - viewW) : (m.W * T - viewW) / 2) : 0;
    const ty = m ? (m.H * T > viewH ? clamp(player.y - viewH / 2, 0, m.H * T - viewH) : (m.H * T - viewH) / 2) : 0;
    cam.x += (tx - cam.x) * Math.min(1, rdt * 6);
    cam.y += (ty - cam.y) * Math.min(1, rdt * 6);
    world.position.set(-Math.round(cam.x), -Math.round(cam.y));

    // Fog
    const fogHoles = this.cfg.fog.fogHoles();
    this.cfg.fx.updateFog(rdt, this.cfg.fog.radius, this.cfg.fog.active, map?.isDungeon ?? false, player.x, player.y, cam.x, cam.y, viewW, viewH, fogHoles);
    this.cfg.fx.drawFogRunes(fx, this.cfg.fog.radius, viewW, viewH);
    if (this.cfg.fog.fogWarned) this.cfg.fx.drawFogEyes(fx, true, t, viewW, viewH);

    // ====== RENDER ENTITIES ======
    const playerExtra: IPlayerExtra = {
      hasSword: this.cfg.flags.hasSword,
      runes: this.cfg.flags.runes,
      swingDir: player.dir,
      aiming: false,
    };
    this.renderers.player.render(playerG, player as IPlayerData, t, playerExtra);
    playerG.position.set(Math.round(player.x), Math.round(player.y));
    playerG.zIndex = player.y;

    // Enemies
    for (const e of this.cfg.entityMgr.entities.enemies) {
      const eg = (e as Enemy & { g: Graphics });
      eg.g.position.set(Math.round(e.x), Math.round(e.y));
      eg.g.zIndex = e.kind === "raven" ? 100000 + e.y : e.y;
      eg.g.visible = !e.dead && !(e.hidden && dist2(e.x, e.y, player.x, player.y) > 46 * 46);
      if (!e.dead) this.renderers.enemy.render(eg.g, e as IEnemyData, t);
    }

    // NPCs
    for (const n of this.cfg.entityMgr.entities.npcs) {
      n.g.zIndex = n.y;
      const mark = this.npcHasMark(n.id);
      this.renderers.npc.render(n.g, { id: n.id, name: n.name } as INpcData, t, { mark });
    }

    // Projectiles
    for (const p of this.cfg.entityMgr.entities.projectiles) {
      const pr = p as Projectile & { g: Graphics };
      pr.g.zIndex = pr.y;
      this.renderers.projectile.render(pr.g, pr as IProjectileData, t);
    }

    // Drops
    for (const d of this.cfg.entityMgr.entities.drops) {
      if (!d.taken) {
        const drop = d as Drop & { g: Graphics };
        drop.g.zIndex = drop.y;
        this.renderers.drop.render(drop.g, drop as IDropData, t);
      }
    }

    // Chests
    for (const c of this.cfg.entityMgr.entities.chests) {
      c.g.zIndex = c.y;
      this.renderers.chest.render(c.g, { opened: c.opened } as IChestData);
    }

    // Pedestals
    for (const p of this.cfg.entityMgr.entities.pedestals) {
      p.g.zIndex = p.y;
      this.renderers.pedestal.render(p.g, { taken: p.taken, guardsLeft: p.guardsLeft } as IPedestalData, t);
    }

    // Shrines
    for (const s of this.cfg.entityMgr.entities.shrines) {
      s.g.zIndex = s.y;
      const lit = this.cfg.flags.shrineIdx >= this.cfg.entityMgr.entities.shrines.indexOf(s);
      this.renderers.shrine.render(s.g, { lit } as IShrineData, t);
    }

    // Doors
    for (const d of this.cfg.entityMgr.entities.doors) {
      d.g.zIndex = d.y;
      this.renderers.door.render(d.g, { open: d.open, locked: d.locked } as IDoorData);
    }

    // Barrier
    if (this.cfg.entityMgr.barrier) {
      this.cfg.entityMgr.barrier.g.zIndex = this.cfg.entityMgr.barrier.y;
      this.cfg.entityMgr.barrier.g.visible = this.cfg.entityMgr.barrier.active;
      if (this.cfg.entityMgr.barrier.active) {
        this.renderers.barrier.render(this.cfg.entityMgr.barrier.g, { active: true } as IBarrierData, t);
      }
    }

    // Altar
    if (this.cfg.entityMgr.altar) {
      this.cfg.entityMgr.altar.g.zIndex = this.cfg.entityMgr.altar.y - 1;
      this.renderers.altar.render(this.cfg.entityMgr.altar.g, { runes: this.cfg.flags.runes } as IAltarData, t);
    }

    // Fade overlay
    fadeG.clear();
    // (fadeA is managed by StateManager, not here)

    // HUD timer
    const ht = hudTimer - rdt;
    if (ht <= 0) { setHudTimer(0.15); pushHud(); } else { setHudTimer(ht); }

    // Minimap
    this.updateMinimap(map, player, t, minimapCanvas, mmBase);

    return t;
  }

  private drawGuide(fx: Graphics, t: number, map: WorldData | undefined, player: Player, cam: { x: number; y: number }, viewW: number, viewH: number) {
    if (map?.isDungeon) return;
    const tgt = this.cfg.quests.trackedTarget();
    if (!tgt) return;
    let wantA = Math.atan2(tgt.y - player.y, tgt.x - player.x);
    if (wantA !== null) {
      let da = wantA - this.arrowA;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.arrowA += da * 0.16;
      const a = this.arrowA + Math.sin(t * 2.1) * 0.09;
      const rad = 17 + Math.sin(t * 2.6) * 2.2;
      const px = player.x - cam.x + Math.cos(a) * rad;
      const py = player.y - cam.y + Math.sin(a * 1.7) * 10 - 4;
      const pulse = 0.6 + Math.sin(t * 5) * 0.3;
      fx.moveTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5)
        .lineTo(px + Math.cos(a + 2.5) * 4, py + Math.sin(a + 2.5) * 4)
        .lineTo(px + Math.cos(a - 2.5) * 4, py + Math.sin(a - 2.5) * 4)
        .closePath().fill({ color: 0xe8c979, alpha: pulse });
    }
    // Interaction hint (E)
    const hint = this.cfg.interaction.getNearestInteractable();
    if (hint) {
      const hx = hint.x - cam.x, hy = hint.y - cam.y - 20 + Math.sin(t * 5) * 1.5;
      fx.rect(hx - 6, hy - 6, 12, 10).fill({ color: 0x0a0f16, alpha: 0.85 });
      fx.rect(hx - 6, hy - 6, 12, 10).stroke({ color: 0xc9a24b, width: 1, alpha: 0.8 });
      fx.poly([hx - 2, hy - 3, hx + 2, hy - 3, hx + 2, hy - 1, hx, hy - 1, hx, hy + 2, hx - 2, hy + 2]).fill(0xe8dcc0);
    }
  }

  private npcHasMark(id: string): boolean {
    const sig = this.cfg.npcSigProvider.npcSig(id);
    if (!sig) return false;
    return this.cfg.talkedSig.get(id) !== sig;
  }

  private updateMinimap(map: WorldData | undefined, player: Player, realT: number, minimapCanvas: HTMLCanvasElement | null, mmBase: ImageData | null) {
    if (!map) return;
    const txi = Math.floor(player.x / T), tyi = Math.floor(player.y / T);
    const blink = Math.floor(realT * 3) % 2;
    const key = txi + "_" + tyi + "_" + blink + "_" + (map.dungeonId ?? -1) + "_" + (this.cfg.store.trackedQuest ?? "");
    if (key !== this.cfg.hud.lastMmKey) {
      this.cfg.hud.lastMmKey = key;
      if (minimapCanvas && mmBase) {
        const cx = minimapCanvas.getContext("2d");
        if (cx) {
          drawMinimap(cx, mmBase, {
            shrines: this.cfg.entityMgr.entities.shrines,
            player,
            target: this.cfg.quests.trackedTarget(),
            secretKnown: this.cfg.flags.secretKnown,
            stashSpot: map.stashSpot,
            nornsFavor: this.cfg.flags.nornsFavor,
            pedestals: this.cfg.entityMgr.entities.pedestals,
            map,
            realT,
          });
        }
      }
    }
  }
}
