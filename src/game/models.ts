/* ============ Central Game Types ============
 *
 * Центральный модуль общих типов. Разрывает циклические зависимости:
 * - engine.ts → types.ts / dialogues.ts → engine.ts (цикл)
 * - store/game-store.ts → engine.ts → store/game-store.ts (цикл)
 *
 * Все подсистемы импортируют типы отсюда, а не из engine.ts.
 * */

import type { World } from "bitecs";
import type { Body } from "planck-js";
import type { Graphics, Text } from "pixi.js";

// ── Экраны ──────────────────────────────────────────────────────────────

export type Screen = "title" | "play" | "pause" | "death" | "victory" | "quests" | "inventory" | "map";

// ── HUD ─────────────────────────────────────────────────────────────────

export { type QuestView } from "./types";

export interface HudData {
  hp: number; maxHp: number; arrows: number; runes: number;
  hasSword: boolean; hasAxe: boolean; hasBow: boolean; hasHammer: boolean; hasKey: boolean; bear: boolean;
  swordUp: boolean; axeUp: boolean; furyRune: boolean; secretKnown: boolean; nornsFavor: boolean;
  hearts: number;
  zone: string; objective: string;
  time: string; kills: number; deaths: number; muted: boolean;
  quests: QuestView[]; trackedId: string; _version: number;
}

// ── Статистика ──────────────────────────────────────────────────────────

export interface Stats { time: string; kills: number; deaths: number; runes: number }

// ── Диалоги ─────────────────────────────────────────────────────────────

export interface DialogueData { id: string; name: string; lines: string[] }

// ── Ввод ────────────────────────────────────────────────────────────────

/** Состояние виртуального джойстика. */
export interface VirtualInput {
  x: number; y: number;
  atk: boolean; axe: boolean; bow: boolean; act: boolean;
}

// ── Callbacks движка ────────────────────────────────────────────────────

export interface EngineCallbacks {
  onHud: (data: HudData) => void;
  onScreen: (screen: Screen) => void;
  onDialogue: (dialogue: DialogueData | null) => void;
  onToast: (msg: string) => void;
  onStats: (stats: Stats) => void;
}

// ── ECS-типы ────────────────────────────────────────────────────────────

/** ECS World с типизированным контекстом */
export type EcsWorld = World<Record<string, any>>;

/** Тело Planck.js для игрока */
export type PlayerBody = Body;

// ── World-данные ────────────────────────────────────────────────────────

import type { WorldData, Vec } from "./world";

export interface IWorldData {
  map: WorldData | null;
  ow: WorldData | null;
}

// ── UI-элементы ─────────────────────────────────────────────────────────

export interface FloatText { txt: Text; life: number }

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

// ── Снаряды и дропы (для обратной совместимости) ────────────────────────

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

// ── Сервисы GameStore ───────────────────────────────────────────────────

export interface EngineServices {
  spawnEnemy: (kind: string, x: number, y: number) => void;
  loadMap: (map: WorldData, spawn: Vec) => void;
  setScreen: (s: Screen) => void;
  fadeTo: (a: number) => void;
  toast: (msg: string) => void;
}

export interface GameActions {
  type: string;
  [key: string]: any;
}

/** Конфигурация GameStore */
export interface GameStoreConfig {
  flags: Record<string, any>;
  services: EngineServices;
  callbacks: EngineCallbacks;
  player: any;
  playerDomain?: any;
  planckWorld?: any;
  ecsWorld?: World;
}

/** Глобальное состояние (чтение) */
export interface GameStoreState {
  flags: any;
  player: any;
  playerDomain: any;
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
  _bossRef: any;
  planckWorld: any;
  ecsWorld: World | null;
}
