/* ============ WorldStore — персистентное состояние мира ============
 *
 * WorldStore хранит состояние, которое переживает сессию игры:
 * - Флаги прогрессии (предметы, квесты, убийства)
 * - Загруженные карты (map, overworld)
 * - Посещённые локации (shrines, chests, pedestals)
 *
 * Не содержит: screen, timers, zone, player state — это GameStore.
 */

import { WorldData } from "../world";
import { FlagDomain, type GameFlags } from "./flag-domain";

/** Конфигурация WorldStore */
export interface WorldStoreConfig {
  flags: GameFlags;
}

/** Состояние WorldStore (чтение) */
export interface WorldStoreState {
  flags: FlagDomain;
  map: WorldData | null;
  ow: WorldData | null;
  visitedShrines: Set<number>;
  takenPedestals: Set<string>;
  openedChests: Set<string>;
  takenAmbient: Set<number>;
}

export class WorldStore {
  private _state: WorldStoreState;

  constructor(config: WorldStoreConfig) {
    this._state = {
      flags: new FlagDomain(config.flags),
      map: null,
      ow: null,
      visitedShrines: new Set<number>(),
      takenPedestals: new Set<string>(),
      openedChests: new Set<string>(),
      takenAmbient: new Set<number>(),
    };
  }

  // ── Геттеры ──

  get flags(): FlagDomain { return this._state.flags; }
  get map(): WorldData | null { return this._state.map; }
  get ow(): WorldData | null { return this._state.ow; }
  get visitedShrines(): Set<number> { return this._state.visitedShrines; }
  get takenPedestals(): Set<string> { return this._state.takenPedestals; }
  get openedChests(): Set<string> { return this._state.openedChests; }
  get takenAmbient(): Set<number> { return this._state.takenAmbient; }

  // ── Сеттеры ──

  setMap(map: WorldData | null): void { this._state.map = map; }
  setOw(ow: WorldData): void { this._state.ow = ow; }

  // ── Утилиты ──

  visitShrine(idx: number): void { this._state.visitedShrines.add(idx); }
  takePedestal(id: string): void { this._state.takenPedestals.add(id); }
  openChest(id: string): void { this._state.openedChests.add(id); }
  takeAmbient(idx: number): void { this._state.takenAmbient.add(idx); }

  hasVisitedShrine(idx: number): boolean { return this._state.visitedShrines.has(idx); }
  hasTakenPedestal(id: string): boolean { return this._state.takenPedestals.has(id); }
  hasOpenedChest(id: string): boolean { return this._state.openedChests.has(id); }
  hasTakenAmbient(idx: number): boolean { return this._state.takenAmbient.has(idx); }

  // ── Сброс ──

  reset(config: WorldStoreConfig): void {
    this._state.flags.setFlags(config.flags);
    this._state.map = null;
    this._state.ow = null;
    this._state.visitedShrines.clear();
    this._state.takenPedestals.clear();
    this._state.openedChests.clear();
    this._state.takenAmbient.clear();
  }
}
