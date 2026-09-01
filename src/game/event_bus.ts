/* ============ EVENT BUS ============ */
type EventHandler<T = any> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  on<T = any>(event: string, fn: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(fn);
    return () => this.off(event, fn);
  }

  off(event: string, fn: EventHandler): void {
    const list = this.handlers.get(event);
    if (list) {
      const i = list.indexOf(fn as EventHandler);
      if (i >= 0) list.splice(i, 1);
    }
  }

  emit<T = any>(event: string, payload: T): void {
    const list = this.handlers.get(event);
    if (list) for (const fn of list) fn(payload);
  }

  clear(): void { this.handlers.clear(); }
}

/* ============ КАТАЛОГ СОБЫТИЙ ============ */
import { Enemy } from "./entities";
import { DropKind, ProjectileKind } from "./world";

export interface GameEvents {
  // Бой
  "enemy:killed":     { enemy: Enemy; kind: string; x: number; y: number };
  "enemy:hit":        { enemy: Enemy; dmg: number; sx: number; sy: number };
  "player:damaged":   { dmg: number; sx: number; sy: number };
  "player:died":      {};
  "player:respawned": {};

  // Квесты
  "quest:reveal":     { id: string; silent?: boolean };
  "quest:progress":   {};
  "quest:completed":  { id: string };

  // Предметы
  "drop:spawn":       { kind: DropKind; x: number; y: number; life?: number };
  "drop:collected":   { kind: DropKind; x: number; y: number };

  // Диалоги
  "dialogue:start":   { id: string };
  "dialogue:end":     { id: string };

  // Туман
  "fog:waveStart":    {};
  "fog:waveEnd":      { dropDew: boolean };
  "fog:ghostSpawn":   { count: number; leashed: boolean };
  "fog:ghostDissipate": {};

  // Боссы
  "boss:spawned":     { kind: Enemy["kind"]; id: number };
  "boss:killed":      { kind: Enemy["kind"]; id: number };
  "snake:death":      {};

  // Пьедесталы
  "pedestal:guardKilled": { pedestalIndex: number };
  "pedestal:unsealed":    { pedestalIndex: number };

  // Снаряды
  "projectile:fire":  { kind: ProjectileKind; x: number; y: number; vx: number; vy: number; dmg: number };

  // UI
  "hud:dirty":        {};
  "screen:change":    { screen: string };
  "toast":            { msg: string };
}
