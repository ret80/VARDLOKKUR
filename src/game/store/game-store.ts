/* ============ GameStore — сессионное хранилище ============
 *
 * GameStore хранит состояние текущей сессии:
 * - Экран (screen)
 * - Таймеры (realT, playTime)
 * - Зона (zone)
 * - Состояние игрока (player reference)
 * - Колбэки (callbacks, services)
 *
 * Персистентное состояние мира хранится в WorldStore.
 * Игровая логика (Player, Enemy, Position, Health) — в ECS World.
 */

import type { Screen, EngineCallbacks, EngineServices, GameActions } from "../models";
import type { Player } from "../entities";
import type { World } from "bitecs";
import type { WorldStore } from "./world-store";

/** Мутации игрока (минимальный интерфейс для обратной совместимости) */
export interface IPlayerMutations {
  increaseMaxHp(amount: number): { hp: number; maxHp: number };
  fullHeal(): number;
  heal(amount: number): number;
}

/** Конфигурация GameStore */
export interface GameStoreConfig {
  services: EngineServices;
  callbacks: EngineCallbacks;
  // Ссылка на объект игрока (source of truth из Engine)
  player: Player;
  // WorldStore — персистентное состояние мира
  worldStore: WorldStore;
  // Planck.js world для удаления дропов
  planckWorld?: unknown;
  // ECS world для запросов (опционально)
  ecsWorld?: World;
  // PlayerDomain — для обратной совместимости (мутации игрока)
  // Примечание: в будущем мутации должны идти через ECS системы
  playerDomain?: IPlayerMutations;
}

/** Сессионное состояние (чтение) */
export interface GameStoreState {
  player: Player;
  screen: Screen;
  realT: number;
  playTime: number;
  zone: string;
  talkCount: number;
  trackedQuest: string;
  lastMain: string;
  callbacks: EngineCallbacks;
  _bossRef: import("../entities").Enemy | null;
  planckWorld: unknown;
  ecsWorld: World | null;
}

export class GameStore {
  private _state: GameStoreState;
  private _config: GameStoreConfig;
  private _playerDomain: IPlayerMutations | null;

  constructor(config: GameStoreConfig) {
    this._config = config;
    this._playerDomain = config.playerDomain ?? null;

    const { services, callbacks, player, planckWorld, ecsWorld } = config;

    this._state = {
      player,
      screen: "title",
      realT: 0,
      playTime: 0,
      zone: "",
      talkCount: 0,
      trackedQuest: "m1",
      lastMain: "m1",
      callbacks,
      _bossRef: null,
      planckWorld: planckWorld || null,
      ecsWorld: ecsWorld || null,
    };
  }

  /** Получить текущее состояние (только чтение) */
  getState(): GameStoreState {
    return this._state;
  }

  // ── WorldStore (персистентное состояние) ──

  /** Получить WorldStore */
  get worldStore(): WorldStore {
    return this._config.worldStore;
  }

  /** Алиас для flags — перенаправляет в WorldStore */
  get flags() { return this._config.worldStore.flags; }

  /** Алиас для playerDomain — для обратной совместимости */
  get playerDomain(): IPlayerMutations | null { return this._playerDomain; }

  // ── Convenience: перенаправление в WorldStore (для обратной совместимости) ──

  /** Алиас для worldStore.map */
  get map() { return this._config.worldStore.map; }
  setMap(map: import("../world").WorldData | null): void { this._config.worldStore.setMap(map); }
  /** Алиас для worldStore.ow */
  get ow() { return this._config.worldStore.ow; }
  setOw(ow: import("../world").WorldData): void { this._config.worldStore.setOw(ow); }
  /** Алиас для worldStore.openedChests */
  get openedChests() { return this._config.worldStore.openedChests; }
  /** Алиас для worldStore.takenPedestals */
  get takenPedestals() { return this._config.worldStore.takenPedestals; }
  /** Алиас для worldStore.visitedShrines */
  get visitedShrines() { return this._config.worldStore.visitedShrines; }
  /** Алиас для worldStore.takenAmbient */
  get takenAmbient() { return this._config.worldStore.takenAmbient; }
  /** Revealed locations (для обратной совместимости) */
  revealed = new Set<string>();

  /** Deprecated — барьер теперь в ECS, всегда null */
  get barrier(): import("../models").BarrierRt | null { return null; }

  // ── Визуальные настройки ──

  private _roofSnow = false;
  /** Снег на крышах */
  get roofSnow(): boolean { return this._roofSnow; }
  set roofSnow(v: boolean) { this._roofSnow = v; }

  // ── Player (reference из Engine) ──

  /** Получить Player (реальный объект из Engine) */
  get player(): Player {
    return this._state.player;
  }

  // ── Сервисы и колбэки ──

  /** Получить сервисы */
  get services(): EngineServices {
    return this._config.services;
  }

  /** Получить колбэки */
  get callbacks(): EngineCallbacks {
    return this._state.callbacks;
  }

  // ── Геттеры сессии ──

  get screen(): Screen { return this._state.screen; }
  get realT(): number { return this._state.realT; }
  get playTime(): number { return this._state.playTime; }
  get zone(): string { return this._state.zone; }
  get talkCount(): number { return this._state.talkCount; }
  set talkCount(v: number) { this._state.talkCount = v; }
  get trackedQuest(): string { return this._state.trackedQuest; }
  set trackedQuest(v: string) { this._state.trackedQuest = v; }
  get lastMain(): string { return this._state.lastMain; }
  set lastMain(v: string) { this._state.lastMain = v; }

  // ── Сеттеры сессии ──

  setScreen(s: Screen): void {
    this._state.screen = s;
    this._config.services.setScreen(s);
  }
  setRealT(v: number): void { this._state.realT = v; }
  setPlayTime(v: number): void { this._state.playTime = v; }
  setZone(v: string): void { this._state.zone = v; }
  setTalkCount(v: number): void { this._state.talkCount = v; }
  setTrackedQuest(v: string): void { this._state.trackedQuest = v; }
  setLastMain(v: string): void { this._state.lastMain = v; }

  setBossRef(ref: import("../entities").Enemy | null): void {
    this._state._bossRef = ref;
  }

  // ── Босс-референс ──

  get bossRef(): import("../entities").Enemy | null { return this._state._bossRef; }
  set bossRef(v: import("../entities").Enemy | null) { this._state._bossRef = v; }

  get planckWorld(): unknown { return this._state.planckWorld; }

  // ── ECS helpers ──

  get ecsWorld(): World | null { return this._state.ecsWorld; }

  /** Получить все enemy entity IDs из ECS world */
  get enemyEids(): number[] {
    if (!this._state.ecsWorld) return [];
    const { Enemy, Dead } = require('../ecs/ecs-components');
    const { query } = require('bitecs');
    const result: number[] = [];
    for (const eid of query(this._state.ecsWorld!, [Enemy])) {
      if (!Dead[eid]) result.push(eid);
    }
    return result;
  }

  /** Получить все pedestal entity IDs из ECS world */
  get pedestalEids(): number[] {
    if (!this._state.ecsWorld) return [];
    const { Pedestal } = require('../ecs/ecs-components');
    const { query } = require('bitecs');
    const result: number[] = [];
    for (const eid of query(this._state.ecsWorld!, [Pedestal])) {
      if (!Pedestal[eid].taken) result.push(eid);
    }
    return result;
  }

  /** Получить Enemy component для entity ID */
  getEnemy(eid: number): unknown {
    if (!this._state.ecsWorld || eid < 0) return null;
    const { Enemy, poolGet, StringPool } = require('../ecs/ecs-components');
    if (eid >= Enemy.kind.length) return null;
    return {
      kind: poolGet(StringPool.enemyKinds, Enemy.kind[eid]),
      state: Enemy.state[eid],
      aggro: !!Enemy.aggro[eid],
      hidden: !!Enemy.hidden[eid],
      guardOf: Enemy.guardOf[eid],
    };
  }

  /** Получить Position для entity ID */
  getPos(eid: number): { x: number; y: number } | null {
    if (!this._state.ecsWorld || eid < 0) return null;
    const { Position } = require('../ecs/ecs-components');
    return { x: Position.x[eid], y: Position.y[eid] };
  }

  // ── Обновление talkCount ──

  incrementTalkCount(): void { this._state.talkCount++; }

  // ── Применение действий ──

  applyAction(action: GameActions): void {
    switch (action.type) {
      case "SET_FLAG":
        this._config.worldStore.flags.setFlag(action.key as any, action.value);
        break;
      case "INCREMENT_FLAG":
        this._config.worldStore.flags.incrementFlag(action.key as any, action.by);
        break;
      case "INCREMENT_KILL":
        this._config.worldStore.flags.incrementKill(action.kind);
        break;
      case "SET_SCREEN":
        this.setScreen(action.value);
        break;
      case "ADD_REVEALED":
        // revealed теперь в WorldStore (через visitedShrines)
        break;
      case "SET_TRACKED_QUEST":
        this.setTrackedQuest(action.id);
        break;
      default:
        console.warn("[GameStore] Unknown action:", action.type);
    }
  }

  /** Сбросить состояние сессии к начальному */
  reset(config: GameStoreConfig): void {
    this._config = config;
    this._state.player = config.player;
    this._state.screen = "title";
    this._state.realT = 0;
    this._state.playTime = 0;
    this._state.zone = "";
    this._state.talkCount = 0;
    this._state.trackedQuest = "m1";
    this._state.lastMain = "m1";
  }
}
