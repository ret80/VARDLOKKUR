/* ============ EVENT BUS ============ */

import type { EnemyKind, DropKind, ProjectileKind } from "./generators/types";
import type { Screen } from "./models";
import type { Vec } from "./world";
import type { Graphics } from "pixi.js";

type GameEvents = {
  // Бой
  "enemy:killed":     { enemy: number; kind: EnemyKind; x: number; y: number };
  "enemy:hit":        { enemy: number; dmg: number; sx: number; sy: number };
  "player:damaged":   { dmg: number; sx: number; sy: number };
  "player:died":      {};
  "player:respawned": {};
  "player:healed":    { amount: number };
  "player:heartUsed": { amount: number };

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
  "boss:spawned":     { kind: EnemyKind; id: number };
  "boss:killed":      { kind: EnemyKind; id: number };
  "snake:death":      {};

  // Пьедесталы
  "pedestal:guardKilled": { pedestalIndex: number };
  "pedestal:unsealed":    { pedestalIndex: number };

  // Снаряды
  "projectile:fire":  { kind: ProjectileKind; x: number; y: number; vx: number; vy: number; dmg: number };
  "projectile:spawned": { g: Graphics; x: number; y: number };

  // Дропы
  "drop:spawned": { g: Graphics; x: number; y: number };

  // Бой (запросы от игрока)
  "combat:trySword":    {};
  "combat:tryAxe":      {};

  // Ввод (абстрактные действия)
  "input:pause":         {};
  "input:inventory":     {};
  "input:quests":        {};
  "input:mute":          {};
  "input:use-heart":     {};
  "input:toggle-snow":   {};
  "input:close-overlay": {};

  // FX
  "fx:burst":         { x: number; y: number; color: number; n: number; speed: number; life: number; size: number; grav: number };

  // UI
  "hud:dirty":        {};
  "hud:float":        { x: number; y: number; text: string; color: number };
  "screen:change":    { screen: Screen };
  "toast":            { msg: string };

  // Движок
  "engine:enter-dungeon":  { dungeonId: number; name: string };
  "engine:exit-dungeon":   { spawn: Vec };

  // Босс (запрос от игрока/движка)
  "boss:start-dungeon": {};
};

type EventHandler<T = Record<string, unknown>> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  on<T extends keyof GameEvents>(event: T, fn: EventHandler<GameEvents[T]>): () => void {
    const eventName = event as string;
    if (!this.handlers.has(eventName)) this.handlers.set(eventName, []);
    this.handlers.get(eventName)!.push(fn as EventHandler);
    return () => this.off(eventName, fn as EventHandler);
  }

  off(event: string, fn: EventHandler): void {
    const list = this.handlers.get(event);
    if (list) {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
  }

  emit<T extends keyof GameEvents>(event: T, payload: GameEvents[T]): void {
    const list = this.handlers.get(event as string);
    if (list) for (const fn of list) fn(payload);
  }

  clear(): void { this.handlers.clear(); }
}
