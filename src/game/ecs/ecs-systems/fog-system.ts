/* fog-system.ts — система тумана на основе ECS */

import { query, removeEntity, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Direction,
  Enemy,
  EnemyState,
  Time,
  RenderLayer,
  Dead,
  Moving,
  Attacking,
  Aiming,
  Frozen,
  Flashing,
  Slowed,
  Returning,
  ShrineLit,
  Hidden,
  Taken,
  Magnet,
  Sprite,
  PhysicsBody,
  EnemyAI,
  poolAdd,
  poolGet,
  StringPool,
} from '../ecs-components';
import { dist2 } from '../../utils';
import { T } from '../../world';
import { audio } from '../../audio';
import { logger } from '../../debug/logger';

// ============================================================
// Конфигурация тумана
// ============================================================

const FOG_WAVE_INTERVAL = 60; // seconds
const FOG_GHOST_HP = 5;
const FOG_GHOST_SPEED = 100;

// --- Радиусы тумана ---
const FOG_RADIUS_DEFAULT = 2600;     // радиус по умолчанию / вне волны
const FOG_RADIUS_ALTAR = 350;        // радиус тумана у алтаря
const FOG_RADIUS_WAVE = 900;         // радиус при начале волны
const FOG_RADIUS_WAVE_ACTIVE = 140;  // радиус активной волны

// --- Зоны безопасности ---
const SAFE_ZONE_ALTAR = 240;         // радиус безопасности у алтаря

// --- Параметры волны ---
const FOG_WAVE_DURATION = 40;        // длительность волны в секундах
const FOG_WARNING_TIME = 4;          // время предупреждения до волны (сек)
const FOG_GHOST_SPAWN_DELAY = 38;    // время появления призраков после начала волны (40 - 2)

// --- Скорости интерполяции ---
const FOG_ALPHA_SPEED = 0.5;         // скорость изменения альфы (1 / 2.0s)
const FOG_RADIUS_SPEED_DEFAULT = 0.8;// скорость интерполяции радиуса (default)
const FOG_RADIUS_SPEED_AMBIENT = 0.6;// скорость интерполяции радиуса (ambient)
const FOG_RADIUS_SPEED_WAVE = 0.35;  // скорость интерполяции радиуса (wave)

// --- Призраки ---
const GHOST_COUNT_MIN = 2;           // минимальное количество призраков
const GHOST_COUNT_MAX = 4;           // максимальное количество призраков
const GHOST_SPAWN_MIN_DIST = 110;    // минимальная дистанция спавна призраков
const GHOST_SPAWN_DIST_RAND = 60;    // разброс дистанции спавна призраков
const GHOST_STATE_T_BASE = 1.5;      // базовое время состояния призрака
const GHOST_STATE_T_RAND = 0.5;      // разброс времени состояния
const GHOST_FOG_ONLY = 1;            // флаг: только для тумана

// --- Таймер волны (endWave) ---
const FOG_TIMER_BASE = 80;           // базовый таймер волны
const FOG_TIMER_RUNE_FACTOR = 4;     // множитель рун для таймера
const FOG_TIMER_RANDOM_MAX = 30;     // макс. случайный разброс таймера

// ============================================================
// Fog State Interface
// ============================================================

export interface FogState {
  fogTimer: number;
  fogActive: boolean;
  fogLeft: number;
  fogRadius: number;
  fogSpawned: boolean;
  fogWarned: boolean;
  fogAmbient: boolean;
  ghostClangT: number;
  // Плавная альфа тумана (0..1) — интерполируется за 2 секунды
  fogAlpha: number;
  fogAlphaTarget: number;
}

export function createFogState(): FogState {
  return {
    fogTimer: FOG_WAVE_INTERVAL,
    fogActive: false,
    fogLeft: 0,
    fogRadius: FOG_RADIUS_DEFAULT,
    fogSpawned: false,
    fogWarned: false,
    fogAmbient: false,
    ghostClangT: 0,
    fogAlpha: 0,
    fogAlphaTarget: 0,
  };
}

// ============================================================
// Обновление тумана
// ============================================================

/** Обновить туман */
export function fogUpdateSystem(
  world: World,
  playerEid: number,
  dt: number,
  rdt: number,
  fogState: FogState,
  map: any,
  flags: any,
  bus: any,
  spawnEnemyInEcs: (kind: string, x: number, y: number) => number,
  getRunes: () => number
): void {
  if (!map || playerEid < 0) return;
  
  const f = flags;
  const px = Position[playerEid].x;
  const py = Position[playerEid].y;
  
  fogState.ghostClangT = Math.max(0, fogState.ghostClangT - dt);
  
  // Плавная интерполяция альфы тумана за 2 секунды
  fogState.fogAlpha += (fogState.fogAlphaTarget - fogState.fogAlpha) * Math.min(1, rdt * FOG_ALPHA_SPEED);
  
  // Disable fog in dungeon or after snake death
  if (map.isDungeon || f.snakeDead) {
    logger.debug('fog', `SNAKE_DEAD/DUNGEON: isDungeon=${map.isDungeon} snakeDead=${f.snakeDead} fogActive=${fogState.fogActive}`);
    fogState.fogRadius += (FOG_RADIUS_DEFAULT - fogState.fogRadius) * Math.min(1, rdt * FOG_RADIUS_SPEED_DEFAULT);
    if (fogState.fogActive) {
      fogState.fogAlphaTarget = 0;
      endWave(fogState, false, bus, getRunes, f);
    }
    return;
  }
  
  // Check zone
  const zn = zoneFor(map, Math.floor(px / T), Math.floor(py / T));
  const inVillage = zn === "Поселение выживших" || zn === "Поселение" || zn === "Воронья Гавань";
  
  // Check altar proximity
  const ax = map.treeAltar.x * T + 8;
  const ay = map.treeAltar.y * T + 8;
  const nearAltar = !f.snakeStarted && dist2(px, py, ax, ay) < SAFE_ZONE_ALTAR * SAFE_ZONE_ALTAR;
  
  logger.debug('fog', `STATE: px=${px.toFixed(0)} py=${py.toFixed(0)} ax=${ax.toFixed(0)} ay=${ay.toFixed(0)} dist2=${dist2(px, py, ax, ay).toFixed(0)} inVillage=${inVillage} zn="${zn}" snakeStarted=${f.snakeStarted} nearAltar=${nearAltar} fogActive=${fogState.fogActive} fogTimer=${fogState.fogTimer.toFixed(1)} fogLeft=${fogState.fogLeft.toFixed(1)}`);
  
  // === Деревня — безопасная зона, туман выключен ===
  if (inVillage) {
    logger.debug('fog', `IN_VILLAGE: zone="${zn}" → fog OFF`);
    if (fogState.fogActive) endWave(fogState, true, bus, getRunes, f);
    fogState.fogRadius += (FOG_RADIUS_DEFAULT - fogState.fogRadius) * Math.min(1, rdt * FOG_RADIUS_SPEED_DEFAULT);
    return;
  }
  
  // === Алтарь — постоянный туман с призраками ===
  if (nearAltar) {
    if (!fogState.fogActive) {
      fogState.fogActive = true;
      fogState.fogAmbient = true;
      fogState.fogAlphaTarget = 1;
      audio.setFog(true);
      bus.emit('toast', { msg: 'Саван Древа... оно не отпустит просто так' });
    }
    fogState.fogAmbient = true;
    fogState.fogRadius += (FOG_RADIUS_ALTAR - fogState.fogRadius) * Math.min(1, rdt * FOG_RADIUS_SPEED_AMBIENT);
    ensureGhosts(world, GHOST_COUNT_MIN, true, map, px, py, spawnEnemyInEcs);
    return;
  }
  
  // === Игрок ушёл от алтаря — призраки исчезают ===
  if (fogState.fogAmbient) {
    logger.debug('fog', `LEFT_ALTAR: fogAmbient=true → endWave`);
    bus.emit('fog:altarLeave', {});
    endWave(fogState, true, bus, getRunes, f);
  }
  
  // === Таймер волн / активная волна ===
  if (!fogState.fogActive) {
    // --- Фаза ожидания: fogTimer отсчитывает до волны ---
    fogState.fogTimer -= dt;
    fogState.fogRadius += (FOG_RADIUS_DEFAULT - fogState.fogRadius) * Math.min(1, rdt * FOG_RADIUS_SPEED_DEFAULT);
    
    // Предупреждение за 4 секунды до волны
    if (!fogState.fogWarned && fogState.fogTimer < FOG_WARNING_TIME && fogState.fogTimer > 0 && f.hasItem('sword')) {
      fogState.fogWarned = true;
      audio.setFog(true);
      audio.horn();
      bus.emit('toast', { msg: 'Ветер стихает... Туман близко' });
    }
    
    // Волна началась!
    if (fogState.fogTimer <= 0 && f.hasItem('sword')) {
      fogState.fogActive = true;
      fogState.fogLeft = FOG_WAVE_DURATION;       // волна длится 40 секунд
      fogState.fogSpawned = false; // призраки ещё не появились
      fogState.fogRadius = FOG_RADIUS_WAVE;    // радиус волны
      fogState.fogAlphaTarget = 1;
      audio.setFog(true);
      bus.emit('toast', { msg: 'ВОЛНА ТУМАНА. Ниды шепчут...' });
    }
  } else {
    // --- Активная волна: fogLeft отсчитывает до конца ---
    fogState.fogLeft -= dt;
    fogState.fogRadius += (FOG_RADIUS_WAVE_ACTIVE - fogState.fogRadius) * Math.min(1, rdt * FOG_RADIUS_SPEED_WAVE);
    
    // Через 2 секунды после начала волны — появляются призраки
    if (!fogState.fogSpawned && fogState.fogLeft < FOG_GHOST_SPAWN_DELAY) {
      fogState.fogSpawned = true;
      ensureGhosts(world, 2 + Math.floor(getRunes() / 2), false, map, px, py, spawnEnemyInEcs);
    }
    
    // Волна закончилась
    if (fogState.fogLeft <= 0) {
      endWave(fogState, true, bus, getRunes, f);
    }
  }
}

function zoneFor(map: any, tx: number, ty: number): string {
  if (!map.zones) return '';
  for (const z of map.zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) {
      return z.name;
    }
  }
  return '';
}

function endWave(state: FogState, dropDew: boolean, bus: any, getRunes: () => number, flags: any) {
  state.fogActive = false;
  state.fogWarned = false;
  state.fogAmbient = false;
  state.fogSpawned = false;
  state.fogLeft = 0;
  state.fogAlphaTarget = 0;
  state.fogTimer = Math.max(FOG_WAVE_INTERVAL, FOG_TIMER_BASE - getRunes() * FOG_TIMER_RUNE_FACTOR + Math.random() * FOG_TIMER_RANDOM_MAX);
  
  if (flags) {
    flags.fogWaves = (flags.fogWaves || 0) + 1;
  }
  
  audio.setFog(false);
  bus.emit('toast', { msg: 'Туман рассеялся' });
  bus.emit('fog:waveEnd', { dropDew });
  bus.emit('fog:ghostDissipate', {});
}

export function ensureGhosts(
  world: World,
  n: number,
  leashed: boolean,
  map: any,
  cx: number,
  cy: number,
  spawnEnemyInEcs: (kind: string, x: number, y: number) => number
) {
  const T = 16;
  // Count alive ghosts
  let alive = 0;
  let totalEnemy = 0;
  for (const eid of query(world, [Enemy])) {
    totalEnemy++;
    const enemyData = Enemy[eid];
    if (!enemyData) {
      logger.warn('fog', `ensureGhosts: Enemy[${eid}] is undefined (Enemy.length=${Enemy.length})`);
      continue; // AoS элемент может быть undefined
    }
    const kind = poolGet(StringPool.enemyKinds, enemyData.kind);
    const state = enemyData.state;
    if (kind === 'ghost') {
      // logger.debug('fog', `ensureGhosts: ghost eid=${eid} state=${state} dissipate=${EnemyState.dissipate}`);
      if (state !== EnemyState.dissipate) {
        alive++;
      }
    }
  }
  // logger.debug('fog', `ensureGhosts: n=${n} leashed=${leashed} alive=${alive} totalEnemy=${totalEnemy}`);
  
  const altarX = map.treeAltar.x * T + 8;
  const altarY = map.treeAltar.y * T + 8;
  const targetCx = leashed ? altarX : cx;
  const targetCy = leashed ? altarY : cy;
  // logger.debug('fog', `ensureGhosts: targetCx=${targetCx} targetCy=${targetCy} limit=${Math.min(4, n)}`);
  
  for (let i = alive; i < Math.min(GHOST_COUNT_MAX, n); i++) {
    const a = Math.random() * Math.PI * 2;
    const d = GHOST_SPAWN_MIN_DIST + Math.random() * GHOST_SPAWN_DIST_RAND;
    const x = targetCx + Math.cos(a) * d;
    const y = targetCy + Math.sin(a) * d;
    
    if (x < T || y < T || x > (map.W - 1) * T || y > (map.H - 1) * T) continue;
    
    const eid = spawnEnemyInEcs('ghost', x, y);
    Enemy[eid].aggro = 1;
    Enemy[eid].state = EnemyState.appear;
    Enemy[eid].stateT = GHOST_STATE_T_BASE + Math.random() * GHOST_STATE_T_RAND;
    Enemy[eid].fade = 0; // начать с полной прозрачности для плавного появления
    Enemy[eid].fogOnly = GHOST_FOG_ONLY;
    // Привязка к алтарю
    if (leashed) {
      Enemy[eid].leashX = altarX;
      Enemy[eid].leashY = altarY;
    }
  }
}
