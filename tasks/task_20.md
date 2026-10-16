# Задача 20: Дропы не отрисовываются — диагностика и план устранения

## 1. Проблема

Дропы (предметы, выпадающие из врагов) не отображаются на экране после смерти врагов.

---

## 2. Гипотеза для проверки

> Дропы отрисовываются через рендерер напрямую, а не через RenderQuery (RenderQueue), из-за чего не попадают в финальный кадр.

---

## 3. Диагностика

### 3.1. Как дропы отрисовываются сейчас

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`

Дропы обрабатываются в методе `render()` через `renderByRegistry` (строки 380-388):

```typescript
// Дропы
this.renderByRegistry(
  world,
  [Sprite, Drop],
  poolDropKind,
  dropRegistry,
  (eid) => eidToDropData(eid, world),
  time
);
```

### 3.2. Как работает `renderByRegistry`

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`, строки 444-482

```typescript
private renderByRegistry<TKey extends string, TData>(
  world: World,
  mask: any[],
  keyOf: (eid: number) => TKey,
  reg: { get: (key: TKey) => any | undefined },
  mapper: (eid: number) => TData,
  time: number
): void {
  const isDrop = mask.includes(Drop);

  for (const eid of query(world, mask)) {
    // Для дропов проверяем taken
    if (isDrop && hasComponent(world, eid, Taken)) continue;

    // Ключевой вызов: добавляем запись в RenderQueue
    const entry = ensureRenderEntry(eid, isDrop ? ENTITY_LAYER.Drop : RENDER_LAYER.DYNAMIC);
    // Viewport culling по записи очереди
    if (entry && !entry.visible) continue;

    const key = keyOf(eid);
    const renderer = reg.get(key);
    if (!renderer) continue;

    const spriteData = Sprite[eid];
    if (!spriteData) continue;
    const sprite = spriteData.ref;
    if (sprite === undefined) continue;

    const data = mapper(eid);
    renderer.render(sprite, data, { time, renderer: r });
  }
}
```

### 3.3. Как работает `ensureRenderEntry`

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`, строки 85-112

```typescript
export function ensureRenderEntry(eid: number, layer: number): RenderEntry | null {
  const q = getRenderQueue();
  if (!q) return null;
  const handle = getSpriteHandle(eid);
  if (handle === undefined) return null;
  const pos = Position[eid];
  if (!pos) return null;

  // Deduplication: если запись уже есть — обновляем layer
  const existing = q.ensureEntry(handle as number);
  if (existing) {
    existing.layer = layer;
    return existing;
  }

  // Создаём новую запись и помещаем в очередь
  const entry: RenderEntry = { x, y, layer, alpha, visible, handle };
  q.enqueue(entry);
  return entry;
}
```

### 3.4. Как работает RenderQueue

**Файл:** `src/game/render/RenderQueue.ts`

- `enqueue(entry)` — добавляет запись в массив `entries`
- `flush(renderer, viewport?)` — сортировка по `(layer, y)`, viewport culling, применение позиций/альфа/zIndex через `IRenderer`
- Слой дропов: `RENDER_LAYER.DROP = 20` (ниже динамических сущностей `40`)

### 3.5. Как создаются дропы при смерти врага

**Файл:** `src/game/ecs/ecs-systems/drops-system.ts`

```typescript
export function spawnDrop(
  world: World,
  factory: EntityFactory,
  kind: DropKind,
  x: number,
  y: number,
  magnet: boolean = false,
  life?: number
): number {
  const eid = factory.createDrop(kind, x, y, magnet, life ?? 0);
  if (magnet) addComponent(world, eid, Magnet);
  return eid;
}

export function rollDropsForEnemy(
  world: World,
  enemyKind: string,
  x: number,
  y: number,
  isGhostLeash: boolean,
  onDropSpawn: (kind: DropKind, x: number, y: number, life?: number) => void
): void {
  // ... логика ролла дропов
  onDropSpawn('heart', x, y);
  onDropSpawn('arrows', x, y);
  // ...
}
```

**Файл:** `src/game/ecs/ecs-bridge.ts`

```typescript
export function createDropInEcs(
  factory: EntityFactory,
  world: World,
  kind: DropKind,
  x: number,
  y: number,
  spriteRef: number
): number {
  const eid = factory.createDrop(kind, x, y);
  addComponent(world, eid, Sprite);
  Sprite[eid] = { ref: spriteRef };
  return eid;
}
```

---

## 4. Результат диагностики

### Гипотеза НЕ подтверждена ❌

**Дропы отрисовываются ПРАВИЛЬНО** через:
```
renderByRegistry → ensureRenderEntry → RenderQueue.enqueue → RenderQueue.flush → IRenderer
```

### Реальная проблема 🔴

**Дропы НЕ СОЗДАЮТСЯ при убийстве врага!**

| Функция | Статус | Где должна вызываться |
|---------|--------|----------------------|
| `rollDropsForEnemy` | ✅ Экспортирована в `ecs-systems/index.ts` | ❌ **НИГДЕ не вызывается** |
| `killEnemy` | ✅ Экспортирована в `combat-system.ts` | ❌ **НИГДЕ не вызывается** |
| `spawnDrop` | ✅ Экспортирована | ❌ **НИГДЕ не вызывается** |

**Цепочка при смерти врага:**

```
1. combat-system: damageEnemy → Health.current[eid] <= 0
2. ecs-game-loop: bus.emit("enemy:killed", { enemy: eid, kind, x, y })
3. ecs-game-loop: bus.on("enemy:killed", () => onEnemyKilledEcs(world, e.enemy, store, bus))
4. interaction-system: onEnemyKilledEcs → ТОЛЬКО стражи пьедестала (guardsLeft--)
```

**Пробел:** Нигде не вызывается `rollDropsForEnemy` и не создаются дропы.

---

## 5. План устранения

### Шаг 1: Добавить callback создания дропов в событие `"enemy:killed"`

**Файл:** `src/game/ecs/ecs-game-loop.ts`

Текущий код (строки 466-468):
```typescript
bus.on("enemy:killed", (e) => {
  onEnemyKilledEcs(world, e.enemy, store, bus); // ← Только стражи пьедестала!
});
```

Необходимо добавить:
```typescript
bus.on("enemy:killed", (e) => {
  onEnemyKilledEcs(world, e.enemy, store, bus);

  // Создать дропы со смерти врага
  const kind = poolGet(StringPool.enemyKinds, Enemy[e.enemy].kind);
  rollDropsForEnemy(
    world,
    kind,
    Position[e.enemy].x,
    Position[e.enemy].y,
    Enemy[e.enemy].leashX !== 0 || Enemy[e.enemy].leashY !== 0,
    (dropKind: DropKind, x: number, y: number, life?: number) => {
      // Callback: создать дроп
      const g = spriteFactory.create(x, y);
      const eid = entityFactory.createDrop(dropKind, x, y, false, life ?? 0);
      Sprite[eid] = { ref: g };
    }
  );
});
```

> **Примечание:** Используем `entityFactory.createDrop(kind, x, y, false, life ?? 0)` напрямую — это чище, чем `createDropInEcs` + установка `Drop[eid].life` постфактум. `createDropInEcs` из `ecs-bridge.ts` вызывает `factory.createDrop(kind, x, y)` без `life`, поэтому пришлось бы перезаписывать `Drop[eid].life` вручную.

### Шаг 2: Добавить необходимые импорты

**Файл:** `src/game/ecs/ecs-game-loop.ts`

```typescript
import { rollDropsForEnemy } from './ecs-systems/drops-system';
import type { DropKind } from '../../generators/types';
```

> **Примечание:** `spawnDrop` и `createDropInEcs` НЕ нужны — используем `entityFactory.createDrop` напрямую.

### Шаг 3: Протестировать

1. Убить врага на карте
2. Проверить, что дропы появляются на позиции смерти врага
3. Проверить, что дропы отрисовываются (bob-анимация, слой Drop)
4. Проверить подбор дропов игроком
5. Проверить исчезновение дропов с таймером (life)

### Шаг 4: Проверить покрытие всех типов врагов

**Функция `rollDropsForEnemy`** обрабатывает:

| Тип врага | Дроп | Шанс |
|-----------|------|------|
| **crawler** | heart | 40% |
| **crawler** | arrows | 22% |
| **draugr** | heart | 40% |
| **draugr** | arrows | 22% |
| **frost** | heart | 50% |
| **frost** | arrows | 50% |
| **ghost** (не leash) | dew | 90% (life=40) |
| **ghost** (не leash) | shard/heart | 35% |
| **ghost** (leash) | — | 0% (ничего) |
| **snake** (boss) | — | Не обрабатывается (boss handled separately) |

> **Примечание:** Функция `killEnemy` (combat-system.ts:424) определена, но **НИГДЕ не вызывается**. Фактический путь смерти врага:
> - `swordAttackSystem` callback (line 324) → `bus.emit("enemy:killed")`
> - `projectileEnemyCollisionSystem` callback (line 602) → `bus.emit("enemy:killed")`
> - Оба пути ведут к одному обработчику — наше исправление покрывает оба.

### Шаг 5: Проверить тайминги жизненного цикла

**Порядок вызова в `tick()` (ecs-game-loop.ts):**

```
1. combat:trySword / combat:tryAxe / projectileEnemyCollisionSystem
   → Health.current -= dmg → Health.current <= 0
   → bus.emit("enemy:killed") ← НАШ КОД: дропы создаются ЗДЕСЬ

2. lifeCheckSystem (step 13)
   → query([Health]) → hp.current <= 0 → addComponent(Dead)
   → query([Dead, Enemy]) → destroy sprite graphics

3. deathCleanupSystem (step 13)
   → query([Dead]) → removeEntity(world, eid)

4. cleanup Dead+Enemy (line 716)
   → destroy physics body, texture cache, ECS
```

> **Критично:** Дропы создаются на шаге 1, когда враг ещё существует.
> Позиция `Position[e.enemy].x/y` валидна в момент эмитации события.

---

## 6. Контрольные точки (Definition of Done)

- [ ] `tsc --noEmit` — 0 ошибок
- [ ] При убийстве врага создаются дропы (сердце, стрелы)
- [ ] Дропы отрисовываются с bob-анимацией
- [ ] Дропы с `life` исчезают по таймеру (мигание перед исчезновением)
- [ ] Подбор дропов игроком работает (звук, HUD, удаление)
- [ ] Дропы-призраков (dew с life=40) работают корректно
- [ ] Нет утечек памяти (дропы удаляются через `removeEntity`)

---

## 7. Риски и митигация

| Риск | Митигация |
|------|-----------|
| Дропы не отрисовываются даже после создания | Проверить `Sprite[eid].ref` — должен быть валидным GraphicsHandle |
| Дропы появляются, но не собираются | Проверить `dropsUpdateSystem` — дистанция подбора 11px |
| Дропы дублируются | Проверить, что `rollDropsForEnemy` вызывается один раз за смерть |
| Утечка памяти | `dropsUpdateSystem` вызывает `onDropRemove` → `removeEntity` |
| Дропы появляются за экраном | `RenderQueue` делает viewport culling — это корректно |

---

## 8. Сводка

| Аспект | Результат |
|--------|-----------|
| Гипотеза "рендер напрямую" | ❌ Не подтверждена |
| Рендер дропов | ✅ Правильный (`renderByRegistry` → RenderQueue) |
| Создание дропов | 🔴 **НИГДЕ не вызывается** |
| Корневая причина | `rollDropsForEnemy` экспортирована, но не используется |
| Решение | Добавить вызов `rollDropsForEnemy` в обработчик `"enemy:killed"` |
