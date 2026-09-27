# План исправления регрессии перезагрузки мира после смерти игрока

## 📋 Контекст проблемы

После выполнения `task_16.md` (переход на AoS архитектуру и отказ от префабов) возникли две критические регрессии при перезагрузке мира после смерти игрока:

### 🔴 Проблема 1: Спрайт игрока остается на месте
**Симптомы:** После смерти и респавна графический спрайт игрока остается на старой позиции, хотя физическое тело перемещается корректно.

**Корневая причина:**
- В `ecs-map-loader.ts` метод `clearWorld` удаляет сущности через `removeEntity(world, eid)`
- НО **не удаляет** их из глобальной `RenderQueue`
- Когда создаются новые сущности с переиспользованными `eid`, `render-system` находит старые "призрачные" записи через `getByKey(eid)`
- Старые записи имеют неактуальные координаты, которые перетирают новые при сортировке в `flush()` по оси Y

**Место в коде:**
```typescript
// src/game/ecs/ecs-map-loader.ts - метод clearWorld
private clearWorld(world: World, preservePlayerSprite?: number): void {
  const entities = getAllEntities(world);
  for (const eid of entities) {
    // ❌ ОТСУТСТВУЕТ: unregisterSpriteHandle(eid)
    removeEntity(world, eid);
  }
  // ...
}
```

### 🔴 Проблема 2: Враги замирают на месте
**Симптомы:** После перезагрузки карты новые враги появляются, но не двигаются и не атакуют игрока.

**Корневая причина — несоответствие API bitecs и стиля проверок:**

bitecs `removeEntity(world, eid)` **корректно сбрасывает маски** (`entityMasks[i][eid] = 0`). `addComponent(world, eid, Dead)` **ставит бит** в маску. `hasComponent(world, eid, Dead)` **читает маску**.

```
bitecs entityMasks — это ИСТИННЫЙ источник правды:
  - removeEntity → masks[i][eid] = 0  ← маска сброшена
  - addComponent → masks[i][eid] |= bitflag  ← маска установлена
  - hasComponent → (masks[i][eid] & bitflag) === bitflag  ← проверка

AoS массивы — это наши данные, bitecs их НЕ трогает:
  - removeEntity → Dead[eid] = {}  ← ОСТАЁТСЯ!
  - addComponent → Ничего не делает с Dead[eid]
  - hasComponent → НЕ смотрит на Dead[eid]
```

**Сценарий бага:**
```
1. createEnemy() → eid = 42
   bitecs: entityMasks[Dead][42] = 0  ← Dead НЕ зарегистрирован
   Dead[42] = {}                       ← AoS массив

2. removeEntity(world, 42)
   bitecs: entityMasks[Dead][42] = 0  ← всё ещё 0
   Dead[42] = {}                       ← AoS массив

3. createEnemy() → eid = 42 (bitecs переиспользует)
   // Dead НЕ добавлен через addComponent → entityMasks[Dead][42] = 0
   // Но Dead[42] = {} — AoS массив остался от старой сущности!

4. AI-система: if (!!Dead[42]) continue;
   // !!Dead[42] → true (AoS массив!)
   // hasComponent(world, 42, Dead) → false (bitecs маска!)
   // ← Мы читаем AoS вместо bitecs маски!
```

**Реально используемые маркеры** (проверяются через `!!Marker[eid]` вместо `hasComponent()`):

| Маркер | Где проверяется (AoS) | Где устанавливается |
|--------|----------------------|---------------------|
| `Dead` | ai-system, combat-system, render-system, ecs-game-loop (13+ мест) | life-system, combat-system |
| `Hidden` | render-system | — |
| `Taken` | drops-system | drops-system |
| `Magnet` | drops-system | drops-system |
| `Flashing` | ecs-game-loop | ecs-game-loop |

> **⚠️ НЕ являются маркерами** (состояние хранится в полях AoS-компонентов):
> - `Frozen` — используется `Enemy[eid].freezeT > 0`
> - `ShrineLit` — используется `Shrine[eid].lit`
> - `Returning` — используется `Projectile[eid].returning`
> - `Attacking`, `Aiming`, `Moving`, `Slowed` — нигде не проверяются

**Почему `!!Dead[eid]` — это баг:**
- `!!Dead[eid]` читает AoS-массив — **не bitecs API**
- `hasComponent(world, eid, Dead)` читает bitecs маску — **правильный способ**
- При `removeEntity` маска сбрасывается → `hasComponent` вернёт `false`
- AoS-массив остаётся грязным → `!!Dead[eid]` вернёт `true` — **ложное срабатывание**

**Решение — заменить все `!!Dead[eid]` на `hasComponent(world, eid, Dead)`.**
Это уберёт корневую причину: маркеры станут настоящими bitecs-компонентами.

### ❌ Почему НЕ использовать `resetAllComponents()`

Попытка использовать `resetAllComponents()` создает новую проблему - **дублирование врагов**:

```typescript
// src/game/ecs/ecs-components.ts
export function resetAllComponents(): void {
  const arrays = [Position, Velocity, Health, /* ... */];
  for (const arr of arrays) arr.length = 0;  // ❌ Полностью очищает AoS массивы
  
  StringPool.enemyKinds.length = 0;  // ❌ Очищает пулы типов
  StringPool.dropKinds.length = 0;
  // ...
}
```

**Проблемы:**
1. `arr.length = 0` ломает индексацию для новых eid
2. `StringPool` очищается, типы врагов добавляются заново с теми же индексами
3. Создается дублирование: один враг с двумя записями в `StringPool`

---

## 🎯 План решения

Один этап: замена всех `!!Marker[eid]` на `hasComponent(world, eid, Marker)`.

---

### Этап 1: Замена AoS-проверок маркеров на bitecs hasComponent

**Файлы:**
- `src/game/ecs/ecs-systems/ai-system.ts`
- `src/game/ecs/ecs-systems/combat-system.ts`
- `src/game/ecs/ecs-systems/drops-system.ts`
- `src/game/ecs/ecs-game-loop.ts`
- `src/game/ecs/ecs-systems/render-system.ts`
- `src/game/debug/debug-api.ts`
- `src/game/quests/quest-targets.ts`

**Принцип:** Заменить все проверки маркеров через AoS-массивы на bitecs `hasComponent()`.

```typescript
// Было (AoS-проверка — читает старые данные):
if (!!Dead[eid]) continue;

// Стало (bitecs-проверка — читает маску):
if (hasComponent(world, eid, Dead)) continue;
```

**Почему это работает:**
- `removeEntity` сбрасывает `entityMasks[i][eid] = 0` → `hasComponent` вернёт `false`
- `addComponent(world, eid, Dead)` ставит бит → `hasComponent` вернёт `true`
- AoS-массив `Dead[eid]` может быть грязным — мы его больше не читаем

---

### Список всех замен

#### 1. ai-system.ts (1 место)

```typescript
// Строка 86:
// Было:
if (!!Dead[enemyEid]) continue;
// Стало:
if (hasComponent(world, enemyEid, Dead)) continue;
```

#### 2. combat-system.ts (7 мест)

```typescript
// Строка 77:
// Было:
if (!!Dead[enemyEid]) continue;
// Стало:
if (hasComponent(world, enemyEid, Dead)) continue;

// Строка 138:
// Было:
if (hasHammer && !Dead[enemyEid] && Enemy[enemyEid].freezeT <= 0) {
// Стало:
if (hasHammer && !hasComponent(world, enemyEid, Dead) && Enemy[enemyEid].freezeT <= 0) {

// Строка 259:
// Было:
if (!!Dead[enemyEid]) continue;
// Стало:
if (hasComponent(world, enemyEid, Dead)) continue;

// Строка 350:
// Было:
if (!!Dead[enemyEid]) return false;
// Стало:
if (hasComponent(world, enemyEid, Dead)) return false;

// Строка 433:
// Было:
if (!!Dead[enemyEid]) return;
// Стало:
if (hasComponent(world, enemyEid, Dead)) return;

// Строка 491:
// Было:
if (!!Dead[enemyEid]) return;
// Стало:
if (hasComponent(world, enemyEid, Dead)) return;

// Строка 554:
// Было:
if (!!Dead[enemyEid]) return;
// Стало:
if (hasComponent(world, enemyEid, Dead)) return;

// Строка 722:
// Было:
if (!!Dead[enemyEid]) continue;
// Стало:
if (hasComponent(world, enemyEid, Dead)) continue;
```

#### 3. ecs-game-loop.ts (1 место)

```typescript
// Строка 636:
// Было:
if (peid >= 0 && !!Dead[peid] && !playerDomain?.isAlive()) {
// Стало:
if (peid >= 0 && hasComponent(world, peid, Dead) && !playerDomain?.isAlive()) {
```

#### 4. render-system.ts (3 места)

```typescript
// Строка 346:
// Было:
if (eid === playerEid && !!Dead[eid]) {
// Стало:
if (eid === playerEid && hasComponent(world, eid, Dead)) {

// Строка 348:
// Было:
} else if (!!Hidden[eid]) {
// Стало:
} else if (hasComponent(world, eid, Hidden)) {

// Строка 422:
// Было:
if (hasComponent(world, playerEid, Dead) && !!Dead[playerEid]) {
// Стало (убираем дублирование, оставляем только hasComponent):
if (hasComponent(world, playerEid, Dead)) {

// Строка 468:
// Было:
if (isEnemy && !!Dead[eid]) continue;
// Стало:
if (isEnemy && hasComponent(world, eid, Dead)) continue;
```

#### 5. drops-system.ts (2 места)

```typescript
// Строка 77:
// Было:
if (Taken[eid]) continue;
// Стало:
if (hasComponent(world, eid, Taken)) continue;

// Строка 117:
// Было:
if (Magnet[eid]) {
// Стало:
if (hasComponent(world, eid, Magnet)) {
```

#### 6. debug-api.ts (5 мест)

```typescript
// Строка 177:
// Было:
dead: !!Dead[playerEid],
// Стало:
dead: hasComponent(world, playerEid, Dead),

// Строка 609:
// Было:
if (Dead[eid]) {
// Стало:
if (hasComponent(world, eid, Dead)) {

// Строка 803:
// Было:
if (Dead[eid]) add('Dead');
// Стало:
if (hasComponent(world, eid, Dead)) add('Dead');

// Строка 897:
// Было:
if (Dead[eid]) return false;
// Стало:
if (hasComponent(world, eid, Dead)) return false;

// Строка 945:
// Было:
if (!Dead[eid] && poolGet(StringPool.enemyKinds, Enemy[eid].kind) === 'snake') {
// Стало:
if (!hasComponent(world, eid, Dead) && poolGet(StringPool.enemyKinds, Enemy[eid].kind) === 'snake') {
```

#### 7. quest-targets.ts (1 место)

```typescript
// Строка 115:
// Было:
if (!Dead[eid] && poolGet(StringPool.enemyKinds, Enemy[eid].kind) === 'snake') {
// Стало:
if (!hasComponent(world, eid, Dead) && poolGet(StringPool.enemyKinds, Enemy[eid].kind) === 'snake') {
```

---

### Что НЕ нужно менять

1. **Установка маркеров** — `Dead[eid] = {}`, `Taken[eid] = 1`, `Flashing[eid] = {}` — остаются как есть. Мы больше НЕ читаем эти значения, но их установка не вредит.

2. **`clearWorld`** — больше не нужен `unregisterSpriteHandle` для маркеров. RenderQueue всё ещё нужно чистить (Проблема 1).

3. **`entity-factory.ts`** — больше не нужен `clearMarkers`.

4. **`resetAllComponents()`** — всё ещё опасен, но по другой причине (StringPool).

---

### Дополнительные изменения

#### RenderQueue (Проблема 1)

RenderQueue остаётся в плане — это отдельная проблема, не связанная с маркерами:

```typescript
// ecs-map-loader.ts: clearWorld
import { unregisterSpriteHandle } from './ecs-systems';

private clearWorld(world: World, preservePlayerSprite?: number): void {
  const entities = getAllEntities(world);
  for (const eid of entities) {
    unregisterSpriteHandle(eid);  // ✅ RenderQueue — отдельная проблема
    removeEntity(world, eid);
  }
  PhysicsBodyRegistry.length = 0;
  EnemyAIRegistry.length = 0;
}
```

#### Удаление мёртвого игрока

В `deathCleanupSystem` (life-system.ts) игрок не удаляется при смерти. После замены на `hasComponent` — `hasComponent(world, playerEid, Dead)` вернёт `true` корректно.

---

## ✅ Критерии успешности

### Функциональные тесты

1. **Тест перезагрузки мира:**
   - [ ] Игрок умирает от врага
   - [ ] Срабатывает респавн у святилища
   - [ ] Спрайт игрока появляется **на новой позиции** (не на старой)
   - [ ] Игрок может двигаться после респавна

2. **Тест поведения врагов:**
   - [ ] После перезагрузки карты враги появляются в своих позициях
   - [ ] Враги **двигаются** к игроку (aggro срабатывает)
   - [ ] Враги **атакуют** игрока при контакте
   - [ ] Враги не замирают на месте

3. **Тест отсутствия дублирования:**
   - [ ] Каждый враг имеет только одну запись в `StringPool.enemyKinds`
   - [ ] Нет "двойных" врагов с одинаковыми параметрами
   - [ ] Счетчик врагов корректен

### Технические критерии

1. **RenderQueue:**
   - [ ] После `clearWorld` в `RenderQueue.byKey` нет записей для удаленных eid
   - [ ] После `clearWorld` в `RenderQueue.entries` нет записей для удаленных eid
   - [ ] Новые записи создаются корректно для новых сущностей

2. **Маркерные компоненты:**
   - [ ] После `clearWorld` для удаленных eid все маркерные компоненты равны `undefined`
   - [ ] Новые сущности получают чистые маркеры (без наследования старых состояний)
   - [ ] Проверка `!!Dead[eid]` для новых врагов возвращает `false`

3. **AoS массивы и пулы:**
   - [ ] AoS массивы НЕ очищаются полностью (`arr.length` остается)
   - [ ] `StringPool` НЕ очищается (типы сохраняются)
   - [ ] Новые сущности корректно переиспользуют слоты в AoS массивах

---

## 📊 Матрица изменений

| Файл | Изменение | Кол-во замен |
|------|-----------|:------------:|
| `src/game/ecs/ecs-systems/ai-system.ts` | `!!Dead[eid]` → `hasComponent(world, eid, Dead)` | 1 |
| `src/game/ecs/ecs-systems/combat-system.ts` | `!!Dead[eid]` → `hasComponent(world, eid, Dead)` | 7 |
| `src/game/ecs/ecs-game-loop.ts` | `!!Dead[peid]` → `hasComponent(world, peid, Dead)` | 1 |
| `src/game/ecs/ecs-systems/render-system.ts` | `!!Dead[eid]` / `!!Hidden[eid]` → `hasComponent(...)` | 4 |
| `src/game/ecs/ecs-systems/drops-system.ts` | `Taken[eid]` / `Magnet[eid]` → `hasComponent(...)` | 2 |
| `src/game/debug/debug-api.ts` | `Dead[eid]` → `hasComponent(world, eid, Dead)` | 5 |
| `src/game/quests/quest-targets.ts` | `!Dead[eid]` → `!hasComponent(world, eid, Dead)` | 1 |
| `src/game/ecs/ecs-map-loader.ts` | Добавить `unregisterSpriteHandle` в `clearWorld` | 1 |
| **Итого** | | **22** |

---

## ⚠️ Риски и митигация

### Риск 1: Утечка памяти в RenderQueue
**Митигация:** `unregisterSpriteHandle` корректно удаляет записи из `byKey` и `entries`, предотвращая утечки.

### Риск 2: `hasComponent` требует `world` в scope
**Митигация:** Во всех файлах, где есть проверки маркеров, `world` уже передан в функцию. В `debug-api.ts` — `world` доступен через параметр функции. В `render-system.ts` — `world` передан в `render()`.

### Риск 3: Пропущенная замена
**Митигация:** После замены — grep по `!!Dead\[|!!Hidden\[|!!Taken\[|!!Magnet\[|!!Flashing\[` не должен находить ничего, кроме закомментированного кода.

### Риск 4: `Flashing` устанавливается, но не проверяется через hasComponent
**Наблюдение:** `Flashing[eid] = {}` устанавливается в ecs-game-loop, но нигде не проверяется через `!!Flashing[eid]` — только устанавливается. Замена не требуется.

### Риск 5: Утечка памяти MapTiles (отдельная проблема)
**Наблюдение:** `destroyAllMapTileGraphics` импортирован в `ecs-map-loader.ts:34`, но нигде не вызывается. Map `MapTiles` накапливает Graphics-объекты при каждой перезагрузке карты.
**Статус:** Не входит в scope task_17, но требует отдельного исправления.

---

## 📝 Обязательное правило отчетности

**После завершения каждого этапа ты обязан добавлять подробный отчет о проделанной работе в файл `REPORT.md` в корне проекта.**

Формат отчета:
```markdown
### Исправление регрессии перезагрузки мира
- **Статус:** Выполнено
- **Измененные файлы:** 
  - `src/game/ecs/ecs-map-loader.ts`
- **Описание изменений:**
  - Заменены все `!!Dead[eid]` / `!!Hidden[eid]` / `!!Taken[eid]` / `!!Magnet[eid]` на `hasComponent(world, eid, Marker)` в 7 файлах (22 замены)
  - Добавлен вызов `unregisterSpriteHandle(eid)` для очистки RenderQueue
  - Маркеры теперь используются корректно через bitecs API
  - НЕ используется `resetAllComponents()` для предотвращения дублирования врагов
- **Следующие шаги:** Функциональное тестирование респавна и поведения врагов
```

---

## 🎯 Финальная проверка

Перед коммитом изменений необходимо:

1. **Запустить игру** и пройти сценарий смерти игрока
2. **Проверить** что спрайт игрока появляется на новой позиции
3. **Проверить** что враги двигаются и атакуют
4. **Открыть Debug Panel** и убедиться что нет дублированных записей
5. **Grep-проверка:** `grep -rn "!!Dead\[" src/game/` не должен находить активных проверок (только комментарии)
6. **Grep-проверка:** `grep -rn "hasComponent.*Dead" src/game/` должен найти все 22 замены
7. **Добавить отчет** в `REPORT.md`

## 📐 Архитектурный комментарий

**Почему `hasComponent()` — правильный способ проверки маркеров:**

| Критерий | `!!Dead[eid]` (AoS) | `hasComponent(world, eid, Dead)` |
|----------|---------------------|----------------------------------|
| Источник данных | AoS-массив `Dead[]` | bitecs `entityMasks` |
| `removeEntity` | Не трогает `Dead[eid]` | Сбрасывает маску → `false` |
| `addComponent(world, eid, Dead)` | Не трогает `Dead[eid]` | Ставит бит → `true` |
| Переиспользование eid | Унаследует грязный `Dead[eid]` | Корректно `false` |
| Соответствие API bitecs | ❌ Нет | ✅ Да |

**Почему `!!Dead[eid]` не работает:**

```
1. createEnemy() → eid = 42
   entityMasks[Dead][42] = 0  ← Dead НЕ добавлен
   Dead[42] = {}              ← AoS массив

2. removeEntity(world, 42)
   entityMasks[Dead][42] = 0  ← всё ещё 0
   Dead[42] = {}              ← AoS массив НЕ изменён

3. createEnemy() → eid = 42 (bitecs переиспользует)
   entityMasks[Dead][42] = 0  ← всё ещё 0 (Dead не добавлен)
   Dead[42] = {}              ← AoS массив остался!

4. !!Dead[42] → true  ← ЛОЖНОЕ СРАБАТЫВАНИЕ
   hasComponent(world, 42, Dead) → false  ← ВЕРНО
```

**Итог:** `hasComponent()` читает bitecs маску, которая корректно сбрасывается при `removeEntity`. AoS-массивы — наши данные, bitecs их не трогает.