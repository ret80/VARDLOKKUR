/* ============ EVENT BUS ============ */
import { GameEvents } from "./game-states";

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
