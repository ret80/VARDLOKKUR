/* ============ EVENT BUS ============ */

type GameEvents = {
  // Бой
  "enemy:killed":     { enemy: any; kind: string; x: number; y: number };
  "enemy:hit":        { enemy: any; dmg: number; sx: number; sy: number };
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
  "drop:spawn":       { kind: any; x: number; y: number; life?: number };
  "drop:collected":   { kind: any; x: number; y: number };

  // Диалоги
  "dialogue:start":   { id: string };
  "dialogue:end":     { id: string };

  // Туман
  "fog:waveStart":    {};
  "fog:waveEnd":      { dropDew: boolean };
  "fog:ghostSpawn":   { count: number; leashed: boolean };
  "fog:ghostDissipate": {};

  // Боссы
  "boss:spawned":     { kind: any; id: number };
  "boss:killed":      { kind: any; id: number };
  "snake:death":      {};

  // Пьедесталы
  "pedestal:guardKilled": { pedestalIndex: number };
  "pedestal:unsealed":    { pedestalIndex: number };

  // Снаряды
  "projectile:fire":  { kind: any; x: number; y: number; vx: number; vy: number; dmg: number };
  "projectile:spawned": { g: any; x: number; y: number };

  // Дропы
  "drop:spawned": { g: any; x: number; y: number };

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
  "screen:change":    { screen: any };
  "toast":            { msg: string };

  // Движок
  "engine:enter-dungeon":  { dungeonId: number; name: string };
  "engine:exit-dungeon":   { spawn: any };

  // Босс (запрос от игрока/движка)
  "boss:start-dungeon": {};
};

type EventHandler<T = any> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  on<T extends keyof GameEvents>(event: T, fn: EventHandler<GameEvents[T]>): () => void {
    const eventName = event as string;
    if (!this.handlers.has(eventName)) this.handlers.set(eventName, []);
    this.handlers.get(eventName)!.push(fn);
    return () => this.off(eventName, fn);
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
