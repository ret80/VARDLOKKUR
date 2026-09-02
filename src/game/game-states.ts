/* ============ КАТАЛОГ СОБЫТИЙ ============ */
import { DropKind, Vec, EnemyKind, ProjectileKind } from "./world";
import { Screen } from "./engine";
import { Enemy, Projectile, Drop, Player } from "./entities";
import { Graphics } from "pixi.js";

// Runtime типы для сущностей, хранящихся в GameStore (данные + Graphics)
export interface ProjectileRt extends Projectile {
  g: Graphics;
}

export interface DropRt extends Drop {
  g: Graphics;
}

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
