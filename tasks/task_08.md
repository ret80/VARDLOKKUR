# Task 08: Устранение утечек памяти и проблем производительности

## Проблема

Игра начинает тормозить через ~30 секунд после старта. Браузер полностью блокируется, невозможно интерактивное профилирование через DevTools/Playwright.

### Debug API данные (через `?debug`):
- **Активные сущности:** 5 (1 игрок, 4 врага: 2 ghost, 2 crawler)
- **Туман активен:** призраки в состояниях `ghost_orbit` и `ghost_freeze`
- **Статус:** FPS падает до 0 из-за накопленных memory leaks

---

## КРИТИЧЕСКИЕ проблемы (Memory Leaks)

### 1. TextureCacheManager — утечка GPU памяти 🔴

**Файл:** `src/game/renderers/core/TextureCacheManager.ts`

**Проблема:** Singleton хранит кэш baked-текстур для каждого `eid` врага. Когда враг умирает и новый спавнится с тем же `eid` (bitecs переиспользует ID), создаётся НОВАЯ текстура, а старая **никогда не удаляется**.

```typescript
// line 74-106: getOrCreate создаёт новые ресурсы, но...
const texture = r.createRenderTexture(size, size);  // GPU memory
const graphics = r.createGraphics();                // GPU memory
const sprite = r.createSprite(...);                 // GPU memory
this.entityCache.set(eid, cache);
```

**Нигде не вызывается** `destroyEntity(eid)` при смерти врага или `removeEntity()`.

**Эффект:** Каждый спавн/смерть врага = +~256KB GPU памяти. За 30 секунд игры — десятки врагов → сотни MB утечки → FPS падает до 0.

---

### 2. RenderSystem.enemyPrevDataMap — утечка CPU памяти 🔴

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`, line 255

```typescript
private enemyPrevDataMap = new Map<number, any>();
```

**Проблема:** Карта заполняется на line 638 (`this.enemyPrevDataMap.set(eid, { ...data })`), но **никогда не очищается**.

**Эффект:** Линейный рост памяти — каждый когда-либо рендереный враг остаётся в карте навсегда.

---

### 3. eidToSpriteHandle — утечка памяти Map 🔴

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`, line 62

```typescript
const eidToSpriteHandle = new Map<number, number>();
```

**Проблема:** Map заполняется функцией `registerSpriteHandle()`, но **никогда не очищается**.

---

## СРЕДНИЕ проблемы (GC Pressure)

### 4. isPlayerNearLitShrine — O(ghosts × shrines) каждый кадр 🟡

**Файл:** `src/game/ecs/ecs-systems/ai-system.ts`, lines 404-416 и 435

```typescript
function isPlayerNearLitShrine(world: World, playerX, playerY, radius): boolean {
  for (const shrineEid of query(world, [Shrine, Position])) {
    if (Shrine.lit[shrineEid]) {
      // check distance
    }
  }
}
```

**Вызывается:**
- Line 102: для каждого призрака при contact damage
- Line 435: для каждого призрака в AI update

**Эффект:** 2 призрака × N святилищ × 60fps = постоянные query allocations.

---

### 5. Множественные query() allocations 🟡

**Файл:** `ecs-game-loop.ts`, `render-system.ts`, `ai-system.ts`

Каждый кадр создаются новые массивы через `[...query(world, [...])]`:
- `render-system.ts` line 101: `[...query(world, [Position, SpriteComp])]`
- `render-system.ts` line 140: `query(world, [SpriteComp])`
- `render-system.ts` line 167: `query(world, [SpriteComp])`
- `render-system.ts` line 191: `query(world, [SpriteComp, Flashing])`
- `life-system.ts` lines 30, 43, 55, 70, 80, 106, 132

**Эффект:** ~15-20 массивов в секунду на врага → постоянная GC нагрузка.

---

### 6. FloatTextLayer.add() — создание UI элементов 🟡

**Файл:** `src/game/renderers/float/FloatTextLayer.ts`, lines 45-66

Каждый вызов создаёт новый `UIElementHandle` через `r.createText()`. Если текст добавляется чаще, чем удаляется (например, постоянный урон, подсказки), элементы накапливаются.

---

## План исправления

### Шаг 1: TextureCacheManager — очистка при удалении врага

**Файл:** `src/game/ecs/ecs-systems/life-system.ts`

В `deathCleanupSystem()` добавить очистку кэша текстуры:

```typescript
import { TextureCacheManager } from '../../renderers/core/TextureCacheManager';

export function deathCleanupSystem(world: World): void {
  for (const eid of query(world, [Dead])) {
    if (hasComponent(world, eid, Player)) continue;
    
    // Очистить кэш текстуры врага
    TextureCacheManager.instance.destroyEntity(eid);
    
    removeEntity(world, eid);
  }
}
```

Также в `lifeCheckSystem()` — при удалении спрайта мёртвых врагов:

```typescript
for (const eid of query(world, [Dead, Enemy])) {
  const spriteIdx = Sprite.ref[eid];
  const spriteRef = SpriteRegistry[spriteIdx - 1];
  if (spriteRef && spriteRef.parent) spriteRef.parent.removeChild(spriteRef);
  spriteRef?.destroy();
  Sprite.ref[eid] = 0;
  
  // Очистить кэш текстуры
  TextureCacheManager.instance.destroyEntity(eid);
}
```

---

### Шаг 2: Очистка enemyPrevDataMap при удалении сущности

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`

В метод `RenderSystem` добавить приватный метод очистки и вызывать его при удалении врага:

```typescript
// В RenderSystem добавить:
private cleanupPrevData(eid: number): void {
  this.enemyPrevDataMap.delete(eid);
}
```

Вызывать из `deathCleanupSystem()` или `lifeCheckSystem()`:

```typescript
import { renderSystem as _renderSystem } from './render-system';

for (const eid of query(world, [Dead, Enemy])) {
  // ... существующий код ...
  _renderSystem.cleanupPrevData(eid);
}
```

Или лучше — добавить callback в `EcsGameLoop` для очистки при `removeEntity()`.

---

### Шаг 3: Очистка eidToSpriteHandle при удалении спрайта

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`

```typescript
// В функцию unregisterSpriteHandle добавить:
export function unregisterSpriteHandle(eid: number): void {
  eidToSpriteHandle.delete(eid);
}
```

Вызывать из `lifeCheckSystem()` при удалении спрайта:

```typescript
for (const eid of query(world, [Dead, Enemy])) {
  // ... существующий код ...
  unregisterSpriteHandle(eid);
}
```

---

### Шаг 4: Кэширование isPlayerNearLitShrine на кадр

**Файл:** `src/game/ecs/ecs-systems/ai-system.ts`

Добавить кэш результата на кадр:

```typescript
// В начало aiUpdateSystem добавить:
let _cachedNearLitShrine: boolean | null = null;

// В updateGhost() вместо прямого вызова:
if (_cachedNearLitShrine === null) {
  _cachedNearLitShrine = isPlayerNearLitShrine(world, playerX, playerY, SHRINE_PROTECT_RADIUS);
}
const nearLitShrine = _cachedNearLitShrine;
```

Сбрасывать в начале каждого кадра AI:

```typescript
export function aiUpdateSystem(...): void {
  _cachedNearLitShrine = null; // сброс кэша
  // ... остальной код ...
}
```

---

### Шаг 5: Буферизация результатов query()

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`

Переиспользовать буфер для результатов query вместо создания нового массива каждый кадр:

```typescript
// В RenderSystem добавить:
private _queryBuffer: number[] = [];

// В render() вместо [...query(...)] использовать:
this._queryBuffer.length = 0;
query(world, [Position, SpriteComp], this._queryBuffer);
for (const eid of this._queryBuffer) {
  // ...
}
```

Аналогично для других систем с частыми query.

---

### Шаг 6: Очистка FloatTextLayer при удалении

**Файл:** `src/game/renderers/float/FloatTextLayer.ts`

Убедиться, что `destroyUIElement()` вызывается для всех элементов при `clear()`:

```typescript
clear(): void {
  const r = this.renderer!;
  for (const entry of this.texts) {
    try {
      r.destroyUIElement(entry.handle);
    } catch {}
  }
  this.texts = [];
}
```

Вызывать `clear()` при смене экрана или респавне игрока.

---

## Контрольные точки

- [ ] `TextureCacheManager.instance.destroyEntity(eid)` вызывается при смерти врага
- [ ] `enemyPrevDataMap.delete(eid)` вызывается при удалении сущности
- [ ] `eidToSpriteHandle.delete(eid)` вызывается при удалении спрайта
- [ ] `isPlayerNearLitShrine` кэшируется на кадр (1 вызов вместо N)
- [ ] Результаты `query()` буферизированы (0 аллокаций в кадре)
- [ ] `FloatTextLayer.clear()` вызывается при смене экрана/респавне
- [ ] [ ] Профилирование через DevTools: память стабильна после 2 минут игры

---

## Приоритеты

1. **Высокий:** TextureCacheManager, enemyPrevDataMap, eidToSpriteHandle (критические утечки)
2. **Средний:** isPlayerNearLitShrine, query allocations (GC pressure)
3. **Низкий:** FloatTextLayer.clear() (минимальное влияние)

---

## Оценка влияния

| Проблема | Прирост FPS после исправления | Сложность |
|----------|-------------------------------|-----------|
| TextureCacheManager | +30-50 FPS (через 1-2 минуты) | Низкая |
| enemyPrevDataMap | Стабилизация памяти | Низкая |
| eidToSpriteHandle | Стабилизация памяти | Низкая |
| isPlayerNearLitShrine | -5-10% CPU | Низкая |
| query allocations | -10% GC | Средняя |
| FloatTextLayer | Минимальный эффект | Низкая |
