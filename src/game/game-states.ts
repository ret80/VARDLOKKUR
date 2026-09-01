/* ============ КАТАЛОГ СОБЫТИЙ И GameState ============ */
import { DropKind, Vec, EnemyKind, ProjectileKind } from "./world";
import { Screen } from "./engine";
import { Enemy, Projectile, Drop, Player } from "./entities";
import { Graphics } from "pixi.js";

// ============================================================
//  События
// ============================================================

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
  "boss:spawned":     { kind: EnemyKind; id: number };
  "boss:killed":      { kind: EnemyKind; id: number };
  "snake:death":      {};

  // Пьедесталы
  "pedestal:guardKilled": { pedestalIndex: number };
  "pedestal:unsealed":    { pedestalIndex: number };

  // Снаряды
  "projectile:fire":  { kind: ProjectileKind; x: number; y: number; vx: number; vy: number; dmg: number };

  // Бой (запросы от игрока)
  "combat:trySword":    {};
  "combat:tryAxe":      {};

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
}

// ============================================================
//  GameState — общий контекст данных для всех систем
// ============================================================

export interface ChestRt {
  x: number; y: number; item: string;
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

export interface FloatText { txt: import("pixi.js").Text; life: number }

export interface GameState {
  // ── сущности ──
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  drops: Drop[];
  chests: ChestRt[];
  pedestals: PedestalRt[];
  shrines: ShrineRt[];
  npcs: NpcRt[];
  doors: DoorRt[];
  bossRef: Enemy | null;

  // ── мир ──
  map: import("./world").WorldData;
  ow: import("./world").WorldData;
  barrier: { x: number; y: number; active: boolean; g: Graphics } | null;
  altar: { x: number; y: number; g: Graphics } | null;

  // ── состояние ──
  flags: {
    hasSword: boolean; hasAxe: boolean; hasBow: boolean; hasHammer: boolean; hasKey: boolean;
    swordUp: boolean; axeUp: boolean; furyRune: boolean; nornsFavor: boolean; hearts: number;
    arrows: number; runes: number; bear: boolean; bearGone: boolean;
    horn: boolean; hornDone: boolean; mead: boolean; meadDone: boolean; ore: boolean; oreDone: boolean;
    moss: boolean; amber: boolean; flower: boolean; shamanDone: boolean;
    diary: boolean; refugeeDone: boolean; secretKnown: boolean;
    bundle: boolean; merchantDone: boolean; relic: boolean; atoneDone: boolean; cullDone: boolean;
    killsByKind: Record<string, number>;
    reaperDead: boolean; spiderDead: boolean; giantDead: boolean;
    snakeStarted: boolean; snakeDead: boolean;
    ghostBane: boolean; dew: number; fogWaves: number;
    kills: number; deaths: number; shrineIdx: number; shrineQuestDone: boolean; huntDone: boolean;
  };
  screen: Screen;
  realT: number;
  playTime: number;
  zone: string;
  talkCount: number;
  revealed: Set<string>;
  trackedQuest: string;
  lastMain: string;
  visitedShrines: Set<number>;
  takenPedestals: Set<number>;
  openedChests: Set<string>;
  takenAmbient: Set<number>;

  // ── колбэки и сервисы ──
  cbs: import("./engine").EngineCallbacks;
  spawnEnemy: (kind: EnemyKind, x: number, y: number) => Enemy;
  loadMap: (map: import("./world").WorldData, spawn: Vec) => void;
  setScreen: (s: Screen) => void;
  fadeTo: (a: number) => void;
  toast: (msg: string) => void;
  onProjectileAdd: (g: Graphics) => void;
  onDropAdd: (g: Graphics) => void;
}
