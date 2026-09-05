/* ============ GameStore — инкапсулированное хранилище состояния ============
 *
 * GameStore заменяет GameState как мутациюбельный shared-объект на
 * инкапсулированное хранилище с контроллируемым доступом.
 *
 * Паттерн:
 * - Состояние инкапсулировано внутри GameStore
 * - Системы получают только то, что им нужно (DI через провайдеры)
 * - Мутации происходят через applyAction() или прямые методы доменов
 * ───────────────────────────────────────────────────────────────── */

import { Vec, WorldData } from "../world";
import { Graphics, Text } from "pixi.js";
import type { Screen, EngineCallbacks, EngineServices, GameActions } from "../models";
import { FlagDomain, GameFlags } from "./flag-domain";
import { PlayerDomain } from "./player-domain";
import { Player, Enemy } from "../entities";
import type { World } from "bitecs";

// ── Переопределяем типы из world-entities, чтобы избежать конфликтов ──

export interface ChestRt {
  x: number; y: number;
  item: string;
  opened: boolean;
  g: Graphics;
}

export interface PedestalRt {
  x: number; y: number;
  taken: boolean;
  guardsLeft: number;
  guardsSpawned: boolean;
  g: Graphics;
}

export interface ShrineRt {
  x: number; y: number;
  g: Graphics;
}

export interface NpcRt {
  id: string; name: string;
  x: number; y: number;
  g: Graphics;
}

export interface DoorRt {
  x: number; y: number;
  open: number;
  locked: boolean;
  g: Graphics;
}

export interface BarrierRt {
  x: number; y: number;
  active: boolean;
  g: Graphics;
}

export interface AltarRt {
  x: number; y: number;
  g: Graphics;
}

export interface FloatText { txt: Text; life: number }

// Типы для снарядов и дропов (для обратной совместимости)
export interface ProjectileRt {
  x: number; y: number; vx: number; vy: number;
  kind: string;
  g: Graphics;
}

export interface DropRt {
  x: number; y: number;
  kind: string;
  g: Graphics;
}

/** Сервисы, предоставляемые движком */
// EngineServices, EngineCallbacks imported from models.ts

/** Акции для изменения состояния */
// GameActions imported from models.ts

/** Интерфейс для доступа к world-данным */
export interface IWorldData {
  map: WorldData | null;
  ow: WorldData | null;
}

/** Конфигурация GameStore */
export interface GameStoreConfig {
  flags: GameFlags;
  services: EngineServices;
  callbacks: EngineCallbacks;
  // Реальный объект player — единственный источник правды
  player: Player;
  // PlayerDomain — инкапсулированные мутации игрока
  playerDomain?: PlayerDomain;
  // Planck.js world для удаления дропов
  planckWorld?: any;
  // ECS world для запросов (опционально)
  ecsWorld?: World;
}

/** Глобальное состояние (чтение) */
export interface GameStoreState {
  flags: FlagDomain;
  player: Player;
  playerDomain: PlayerDomain | null;
  map: WorldData | null;
  ow: WorldData | null;
  screen: Screen;
  realT: number;
  playTime: number;
  zone: string;
  talkCount: number;
  revealed: Set<string>;
  trackedQuest: string;
  lastMain: string;
  visitedShrines: Set<number>;
  takenPedestals: Set<string>;
  openedChests: Set<string>;
  takenAmbient: Set<number>;
  floats: FloatText[];
  callbacks: EngineCallbacks;
  _bossRef: Enemy | null;
  planckWorld: any;
  ecsWorld: World | null;
}

export class GameStore {
  private _state: GameStoreState;
  private _config: GameStoreConfig;
  private _flags: GameFlags;

  constructor(config: GameStoreConfig) {
    this._config = config;
    this._flags = config.flags;

    const { flags, services, callbacks, player, playerDomain, planckWorld, ecsWorld } = config;

    this._state = {
      flags: new FlagDomain(flags),
      player,
      playerDomain: playerDomain || null,
      map: null,
      ow: null,
      screen: "title",
      realT: 0,
      playTime: 0,
      zone: "",
      talkCount: 0,
      revealed: new Set<string>(),
      trackedQuest: "m1",
      lastMain: "m1",
      visitedShrines: new Set<number>(),
      takenPedestals: new Set<string>(),
      openedChests: new Set<string>(),
      takenAmbient: new Set<number>(),
      floats: [],
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

  /** Получить FlagDomain */
  get flags(): FlagDomain {
    return this._state.flags;
  }

  /** Получить Player (реальный объект из Engine) */
  get player(): Player {
    return this._state.player;
  }

  /** Получить PlayerDomain (инкапсулированные мутации) */
  get playerDomain(): PlayerDomain | null {
    return this._state.playerDomain;
  }

  /** Получить сервисы */
  get services(): EngineServices {
    return this._config.services;
  }

  /** Получить колбэки */
  get callbacks(): EngineCallbacks {
    return this._state.callbacks;
  }

  // ── Геттеры состояния ──

  get map(): WorldData | null { return this._state.map; }
  get ow(): WorldData | null { return this._state.ow; }
  get screen(): Screen { return this._state.screen; }
  get realT(): number { return this._state.realT; }
  get playTime(): number { return this._state.playTime; }
  get zone(): string { return this._state.zone; }
  get talkCount(): number { return this._state.talkCount; }
  set talkCount(v: number) { this._state.talkCount = v; }
  get revealed(): Set<string> { return this._state.revealed; }
  get trackedQuest(): string { return this._state.trackedQuest; }
  set trackedQuest(v: string) { this._state.trackedQuest = v; }
  get lastMain(): string { return this._state.lastMain; }
  set lastMain(v: string) { this._state.lastMain = v; }
  get visitedShrines(): Set<number> { return this._state.visitedShrines; }
  get takenPedestals(): Set<string> { return this._state.takenPedestals; }
  get openedChests(): Set<string> { return this._state.openedChests; }
  get takenAmbient(): Set<number> { return this._state.takenAmbient; }
  get floats(): FloatText[] { return this._state.floats; }

  // ── Сеттеры состояния ──

  setMap(map: WorldData | null): void { this._state.map = map; }
  setOw(ow: WorldData): void { this._state.ow = ow; }
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
  setBossRef(ref: Enemy | null): void {
    this._state._bossRef = ref;
  }
  addFloatText(txt: Text, life: number): void {
    this._state.floats.push({ txt, life });
  }
  removeFloatText(i: number): void {
    this._state.floats.splice(i, 1);
  }

  // ── Управление флагами ──

  updateFlags(flags: GameFlags): void {
    this._state.flags.setFlags(flags);
  }

  // ── Управление барьером/алтарём ──
  // Barrier и Altar теперь хранятся в ECS, эти методы устарели
  setBarrier(b: BarrierRt | null): void { /* deprecated - ECS handles barriers */ }
  setAltar(a: AltarRt | null): void { /* deprecated - ECS handles altars */ }
  get barrier(): BarrierRt | null { return null; /* deprecated */ }
  get altar(): AltarRt | null { return null; /* deprecated */ }

  // ── Босс-референс ──

  get bossRef(): Enemy | null { return this._state._bossRef; }
  set bossRef(v: Enemy | null) { this._state._bossRef = v; }

  get planckWorld(): any { return this._state.planckWorld; }

  // ── Визуальные настройки ──

  private _roofSnow = false;
  get roofSnow(): boolean { return this._roofSnow; }
  set roofSnow(v: boolean) { this._roofSnow = v; }

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
  getEnemy(eid: number): any {
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
        this._state.flags.setFlag(action.key as any, action.value);
        break;
      case "INCREMENT_FLAG":
        this._state.flags.incrementFlag(action.key as any, action.by);
        break;
      case "INCREMENT_KILL":
        this._state.flags.incrementKill(action.kind);
        break;
      case "SET_SCREEN":
        this.setScreen(action.value);
        break;
      case "SET_MAP":
        this.setMap(action.value);
        break;
      case "ADD_REVEALED":
        this._state.revealed.add(action.id);
        break;
      case "SET_TRACKED_QUEST":
        this.setTrackedQuest(action.id);
        break;
      default:
        console.warn("[GameStore] Unknown action:", action.type);
    }
  }

  /** Сбросить состояние к начальному */
  reset(config: GameStoreConfig): void {
    this._config = config;
    this._state.flags.setFlags(config.flags);
    this._state.player = config.player;
    this._state.screen = "title";
    this._state.realT = 0;
    this._state.playTime = 0;
    this._state.zone = "";
    this._state.talkCount = 0;
    this._state.revealed.clear();
    this._state.trackedQuest = "m1";
    this._state.lastMain = "m1";
    this._state.visitedShrines.clear();
    this._state.takenPedestals.clear();
    this._state.openedChests.clear();
    this._state.takenAmbient.clear();
    this._state.floats = [];
  }
}
