/* player-lifecycle.ts – Управление респавном и использованием сердца */

import { T } from "../world";
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

    // Sync to store.player for legacy minimap (before ECS player created)
    player.x = spawn.x;
    player.y = spawn.y;

    console.log('[respawn] spawn=', spawn, 'ow=', ow ? 'present' : 'null', 'shrines=', ow?.shrines?.length ?? -1);

    this.cbs.resetDeath?.();
    console.log('[respawn] calling loadMap(ow, spawn)...');
    this.cbs.loadMap(ow, spawn);
    console.log('[respawn] loadMap done, playerDomain._eid=', (this.playerDomain as any)._eid);
    this.store.setScreen("play");
    this.cbs.fadeTo(1);
    this.hud.pushHud(true);
    this.bus.emit("player:respawned", {});
  }
}
