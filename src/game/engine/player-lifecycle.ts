/* player-lifecycle.ts – Управление респавном и использованием сердца */

import { T } from "../world";
import { Position, Velocity, Player, Health, Dead } from "../ecs/ecs-components";
import type { GameStore } from "../store";
import { PlayerDomain } from "../store/player-domain";
import type { EventBus } from "../event-bus";
import type { HudSystem } from "../hud/hud-system";

export interface PlayerLifecycleCallbacks {
  /** Плавно перейти к непрозрачности */
  fadeTo: (a: number) => void;
  /** Загрузить карту */
  loadMap: (map: any, spawn: { x: number; y: number }) => void;
  /** Создать всплывающий текст */
  float: (x: number, y: number, text: string, color: number) => void;
  /** Воспроизвести звук исцеления */
  playHeal: () => void;
  /** Эффект частиц */
  fxBurst: (x: number, y: number, color: number, count: number, size: number, life: number, speed: number, yOff: number) => void;
  /** Сбросить состояние смерти игрока (вызывается при респавне) */
  resetDeath?: () => void;
}

export class PlayerLifecycle {
  constructor(
    private store: GameStore,
    private playerDomain: PlayerDomain,
    private bus: EventBus,
    private hud: HudSystem,
    private cbs: PlayerLifecycleCallbacks
  ) {}

  /** Использовать сохранённое сердце для восстановления HP */
  useStoredHeart(): void {
    const p = this.playerDomain;
    if (p.hp >= p.maxHp) {
      this.cbs.float(p.x, p.y, "Здоровье полное", 0x6e7f8d);
      return;
    }
    if (this.store.flags.hearts <= 0) {
      this.cbs.float(p.x, p.y, "Сума пуста", 0x6e7f8d);
      return;
    }
    this.store.flags.hearts--;
    this.playerDomain.heal(4);
    this.cbs.playHeal();
    this.cbs.fxBurst(p.x, p.y, 0x7ee2a8, 10, 50, 0.8, 2, -20);
    this.cbs.float(p.x, p.y - 10, "+4", 0x7ee2a8);
    this.hud.pushHud(true);
  }

  /** Респавн игрока после смерти */
  respawn(): void {
    const { ow, flags, player } = this.store;
    let spawn: { x: number; y: number };

    if (flags.shrineIdx >= 0 && ow && ow.shrines && ow.shrines[flags.shrineIdx]) {
      const s = ow.shrines[flags.shrineIdx];
      spawn = { x: s.x * T + 8, y: s.y * T + 8 };
    } else if (ow) {
      // Фолбэк — спавн в деревне (оверворлд)
      spawn = ow.spawn ?? { x: 0, y: 0 };
    } else {
      spawn = this.store.map?.spawn ?? { x: 0, y: 0 };
    }

    const eid = this.playerDomain instanceof PlayerDomain 
      ? (this.playerDomain as any)._eid ?? -1 
      : -1;

    // Set position via ECS
    if (eid >= 0) {
      Dead[eid] = 0;  // Сбросить флаг смерти — иначе renderPlayer пропускает игрока
      Position.x[eid] = spawn.x;
      Position.y[eid] = spawn.y;
      Velocity.x[eid] = 0;
      Velocity.y[eid] = 0;
    }

    // Full heal via ECS
    if (eid >= 0) {
      Health.current[eid] = Health.max[eid];
      Player.swingT[eid] = 0;
      Player.hurtT[eid] = 0;
      Player.slowT[eid] = 0;
    }

    // Sync to store.player for legacy minimap (before ECS player created)
    player.x = spawn.x;
    player.y = spawn.y;

    this.cbs.resetDeath?.();
    this.store.setScreen("play");
    this.cbs.fadeTo(1);
    this.cbs.loadMap(ow, spawn);
    this.hud.pushHud(true);
    this.bus.emit("player:respawned", {});
  }
}
