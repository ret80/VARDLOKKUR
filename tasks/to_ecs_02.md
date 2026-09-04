На основе полного анализа кода репозитория VARDLOKKUR я выявил корень всех регрессий и составил план действий.

---

# 📊 Анализ регрессий после ECS-миграции

## Корень всех проблем

**bitecs `query` работает ТОЛЬКО с SoA (Structure of Arrays) компонентами** (Float32Array, Uint8Array), но **не с AoS (Array of Structures)** компонентами.

В `ecs-components.ts` большинство компонентов определены как AoS:
```typescript
// ❌ AoS — query НЕ ВИДИТ эти компоненты!
export const Sprite = [] as { ref: any }[];
export const Enemy = [] as { kind: EnemyKind; ... }[];
export const NPC = [] as { id: string; name: string }[];
export const PhysicsBody = [] as { body: any }[];
export const Player = [] as { moving: boolean; ... }[];
// ... Chest, Pedestal, Shrine, Door, Barrier, Altar
```

А SoA компоненты определены правильно:
```typescript
// ✅ SoA — query работает
export const Position = { x: new Float32Array(10000), y: new Float32Array(10000) };
export const Velocity = { x: new Float32Array(10000), y: new Float32Array(10000) };
export const Health = { current: new Float32Array(10000), max: new Float32Array(10000) };
```

---

## 🔍 Детальный разбор каждой регрессии

### 1. Отсутствует карта (big map)
**Файл:** `engine.ts` → `drawBigMap()`
```typescript
drawBigMap(c: HTMLCanvasElement) {
    drawBigMap(ctx, this.mmBase!, 2, {...}); // this.mmBase === null!
}
```
**Причина:** В `loadMapEcs()` не вызывается `buildMinimapBase(map)` из `map-display.ts`, поэтому `this.mmBase` остаётся null.

### 2. Отсутствует мини-карта
**Файл:** `engine.ts` → `tick()`
```typescript
if (this.minimapCanvas && this.mmBase) { // mmBase === null
    drawMinimap(ctx, this.mmBase, {...});
}
```
**Причина:** Та же, что и у big map — `mmBase` не строится.

### 3. Отсутствуют NPC
**Файл:** `render-system.ts` → `renderNPCs()`
```typescript
for (const eid of query(world, [Sprite, NPC])) { // ❌ AoS + AoS = пустой результат!
```
**Причина:** `Sprite` и `NPC` — AoS, bitecs `query` не находит сущности.

### 4. Герой не может перемещаться (но поворачивает)
**Файл:** `physics-system.ts` → `syncVelocityToBody()`
```typescript
for (const eid of query(world, [Velocity, PhysicsBody])) { // ❌ SoA + AoS = пустой результат!
    body.setLinearVelocity(Vec2(vx[eid], vy[eid])); // НИКОГДА не вызывается
}
```
**Причина:** `PhysicsBody` — AoS. Скорость устанавливается в `updatePlayerInput` (поворот работает), но не передаётся в Planck.js body. Движение не происходит.

### 5. Отсутствуют враги
**Файл:** `render-system.ts` → `renderEnemies()`
```typescript
for (const eid of query(world, [Sprite, Enemy])) { // ❌ AoS + AoS = пустой результат!
```
**Причина:** `Sprite` и `Enemy` — AoS, query не находит врагов.

---

# 🛠 Устранение регрессий

## Быстрое решение (исправление всех 5 регрессий)

### Шаг 1: Добавить SoA-маркеры в `ecs-components.ts`

```typescript
// ============================================================
// SOA МАРКЕРЫ (для AoS компонентов — чтобы query их видел)
// ============================================================
export const HasSprite = new Uint8Array(10000);
export const HasPlayer = new Uint8Array(10000);
export const HasEnemy = new Uint8Array(10000);
export const HasNPC = new Uint8Array(10000);
export const HasPhysicsBody = new Uint8Array(10000);
export const HasProjectile = new Uint8Array(10000);
export const HasDrop = new Uint8Array(10000);
export const HasChest = new Uint8Array(10000);
export const HasPedestal = new Uint8Array(10000);
export const HasShrine = new Uint8Array(10000);
export const HasDoor = new Uint8Array(10000);
export const HasBarrier = new Uint8Array(10000);
export const HasAltar = new Uint8Array(10000);
```

### Шаг 2: Обновить `ecs-utils.ts` — устанавливать маркеры при создании

```typescript
export function createPlayerEntity(world: World, x: number, y: number): number {
  const eid = createLivingEntity(world, 12, 100);
  addComponents(world, eid, Player, Direction, Velocity);
  addComponent(world, eid, PhysicsBody);
  HasPlayer[eid] = 1;      // ← маркер
  HasPhysicsBody[eid] = 1; // ← маркер
  // ... остальное
}

export function createEnemyEntity(...): number {
  // ...
  HasEnemy[eid] = 1;
  HasPhysicsBody[eid] = 1;
  // ...
}

// Аналогично для всех остальных create* функций
```

### Шаг 3: Обновить `ecs-bridge.ts` — устанавливать маркер Sprite

```typescript
export function createPlayerInEcs(world, x, y, spriteRef): number {
  const eid = createPlayerEntity(world, x, y);
  Sprite[eid] = { ref: spriteRef };
  HasSprite[eid] = 1;  // ← маркер
  return eid;
}

export function createEnemyInEcs(...): number {
  // ...
  Sprite[eid] = { ref: spriteRef };
  HasSprite[eid] = 1;  // ← маркер
  // ...
}

// Аналогично для NPC, Chest, Pedestal, Shrine, Door, Barrier, Altar, Drop, Projectile
```

### Шаг 4: Обновить все `query()` вызовы

**`physics-system.ts` → `syncVelocityToBody()`:**
```typescript
for (const eid of query(world, [Velocity, HasPhysicsBody])) { // вместо PhysicsBody
```

**`render-system.ts`:**
```typescript
// renderEnemies
for (const eid of query(world, [HasSprite, HasEnemy])) {

// renderNPCs
for (const eid of query(world, [HasSprite, HasNPC])) {

// renderPlayer
if (playerEid >= 0 && HasPlayer[playerEid]) { ... }

// и аналогично для всех остальных render функций
```

**`ecs-game-loop.ts` шаг 8:**
```typescript
for (const eid of query(world, [Position, Velocity])) {
  if (eid === peid) continue;
  if (HasPhysicsBody[eid]) continue; // вместо hasComponent
  px[eid] += vx[eid] * dt;
  py[eid] += vy[eid] * dt;
}
```

### Шаг 5: Исправить big map / mini-map

В `engine.ts` → `loadMapEcs()`:
```typescript
private loadMapEcs(map: WorldData, spawn: Vec) {
  // ... существующий код ...
  
  // Построить mmBase для minimap и big map
  this.mmBase = buildMinimapBase(map);
}
```

---

# 📋 План рефакторинга проекта

## Фаза 1: Исправление ECS-миграции (срочно)
1. Добавить SoA-маркеры для всех AoS компонентов
2. Обновить все `query()` вызовы
3. Добавить построение `mmBase` в ECS-путь
4. Удалить `useEcs` toggle — ECS единственный путь

## Фаза 2: Конвертация AoS → SoA (среднесрочная)
1. Переписать `Sprite` компонент в SoA:
   ```typescript
   export const Sprite = {
     ref: new Array(10000), // или Uint32Array для id спрайта
   };
   ```
2. Переписать `Enemy` в набор SoA:
   ```typescript
   export const EnemyKind = new Uint8Array(10000);
   export const EnemyState = new Uint8Array(10000);
   export const EnemyAggro = new Uint8Array(10000);
   export const EnemySeed = new Float32Array(10000);
   // ... и т.д.
   ```
3. Переписать `Player`, `NPC`, `Chest`, `Pedestal`, `Shrine`, `Door`, `Barrier`, `Altar` аналогично
4. Удалить SoA-маркеры из Фазы 1

## Фаза 3: Архитектурное разделение
1. Выделить `ecs/` в отдельный npm-пакет
2. Создать чёткие границы: `game/` (логика) ↔ `render/` (PixiJS) ↔ `physics/` (Planck.js)
3. Внедрить Dependency Injection для всех систем


---

# 🗑 Легаси-код для удаления

| Файл | Что удалить | Причина |
|------|-------------|---------|
| `system/quest-system.ts` | Класс `QuestSystem` | Перенесён в ECS или не нужен |
| `system/dialogue-system.ts` | Класс `DialogueSystem` | Должен быть ECS-системой |
| `system/hud-system.ts` | Класс `HudSystem` | Устаревший legacy |
| `system/combat-system.ts` | Legacy `CombatSystem` | Заменён на `ecs/ecs-systems/combat-system.ts` |
| `system/ai-system.ts` | Legacy `AISystem` | Заменён на `ecs/ecs-systems/ai-system.ts` |
| `system/interaction-system.ts` | Legacy `InteractionSystem` | Заменён на `ecs/ecs-systems/interaction-system.ts` |
| `system/drops-system.ts` | Legacy `DropsSystem` | Заменён на `ecs/ecs-systems/drops-system.ts` |
| `system/fog-system.ts` | Legacy `FogSystem` | Заменён на `ecs/ecs-systems/fog-system.ts` |
| `system/physics-system.ts` | Legacy `PhysicsSystem` | Заменён на Planck.js |
| `system/planck-world.ts` | Старый файл | Перенесён в `physics/planck-world.ts` |
| `engine.ts` | Метод `update()` (legacy tick) | ECS заменяет его |
| `engine.ts` | Метод `loadMapLegacy()` | ECS заменяет его |
| `engine.ts` | `useEcs` toggle и все ветвления `if (this.useEcs)` | ECS — единственный путь |
| `engine.ts` | `this.renderer.tick()` вызов | ECS render system |
| `entities.ts` | Классы `PlayerRenderer`, `EnemyRenderer`, `NpcRenderer` и др. | Заменены на `ecs-render-helpers.ts` |
| `store/` | `kinetics.ts` (если есть) | Заменён на Planck.js |
| `map-display.ts` | Legacy fallback | Убрать legacy код |
| `tiles.ts` | Любые legacy render пути | Только `buildAllTileTextures` |

---

# ⚡ Итог

Все 5 регрессий имеют одну корневую причину — **bitecs `query` не работает с AoS компонентами**. Фикс требует:
1. **Минимум:** Добавить SoA-маркеры (Uint8Array) и обновить ~15 мест с `query()`
2. **Оптимум:** Конвертировать все AoS компоненты в SoA (Фаза 2 плана рефакторинга)

Хотите, чтобы я подготовил полный diff с исправлениями?