# Refactoring interaction-system.ts — удаление switch/case (SOLID)

## 1. Проблема

`interaction-system.ts` содержит два switch/case, которые нарушают **OCP (Open/Closed Principle)** и **SRP (Single Responsibility Principle)**:

### 1.1. `tryInteract` (строки 61-83) — 7 кейсов

```typescript
switch (hit.kind) {
  case 'npc':        onDialogue(hit.ref.id); return true;
  case 'chest':      openChestEcs(...); return true;
  case 'pedestal':   takePedestalEcs(...); return true;
  case 'shrine':     useShrineEcs(...); return true;
  case 'altar':      bus.emit('boss:spawned', ...); return true;
  case 'oldAltar':   atoneEcs(...); return true;
  case 'stairs':     enterDungeonOrExitEcs(...); return true;
}
```

**Нарушенные принципы:**
- **OCP** — каждый новый тип объекта требует модификации `tryInteract`
- **SRP** — функция знает логику всех 7 типов взаимодействий
- **Проблема с тестированием** — нужно мокать 7 разных путей

### 1.2. `openChestEcs` (строки 172-196) — 5 кейсов

```typescript
switch (poolGet(StringPool.chestItems, Chest.item[chestEid])) {
  case 'bow':        f.setFlag('hasBow', true); ... break;
  case 'sword':      f.setFlag('hasSword', true); ... break;
  case 'arrows':     f.incrementFlag('arrows', 10); ... break;
  case 'heartPiece': store.playerDomain!.increaseMaxHp(2); ... break;
  case 'key':        f.setFlag('hasKey', true); ... break;
}
```

Та же проблема — каждый новый предмет = новый case.

### 1.3. `dungeonUnlocked` (строки 337-342) — if/else chain

```typescript
if (id === 0) return { ok: f.hasItem('sword'), req: ... };
if (id === 1) return { ok: f.hasItem('axe'), req: ... };
const runes = f.getRunes();
return { ok: runes >= 5, req: ... };
```

Менее критично, но тоже нарушает OCP.

---

## 2. Целевой паттерн: Strategy + Registry

Проект уже имеет established паттерн — **Strategy Pattern + Registry** в `drop-handlers.ts`. Применяем его же.

```typescript
// drop-handlers.ts — уже существует, образец для подражания
interface DropHandler { kind: DropKind; handle(ctx: DropContext): boolean; }
class DropHandlerRegistry {
  private handlers = new Map<DropKind, DropHandler>();
  collect(kind: DropKind, ctx: DropContext): boolean { ... }
}
```

---

## 3. План рефакторинга

### Фаза 1: InteractionHandlerRegistry

**Файл:** `src/game/ecs/ecs-systems/interaction-handlers.ts` (новый)

#### 3.1.1 Интерфейсы

```typescript
/** Контекст для обработчиков взаимодействия */
export interface InteractionContext {
  world: World;
  store: GameStore;
  bus: EventBus;
  onDialogue: (id: string) => void;
  onGuardSpawn?: GuardSpawnCallback;
}

/** Интерфейс обработчика взаимодействия */
export interface InteractionHandler {
  /** Тип интерактивного объекта (совпадает с hit.kind) */
  kind: string;

  /**
   * Обработка взаимодействия.
   * @returns true если объект найден и обработен, false — игнорировать
   */
  handle(
    world: World,
    eid: number,
    ref: any,
    ctx: InteractionContext
  ): boolean;
}
```

#### 3.1.2 Реестр

```typescript
export class InteractionHandlerRegistry {
  private handlers = new Map<string, InteractionHandler>();

  register(handler: InteractionHandler): this {
    this.handlers.set(handler.kind, handler);
    return this;
  }

  interact(hit: InteractableHit, ctx: InteractionContext): boolean {
    const handler = this.handlers.get(hit.kind);
    if (!handler) {
      logger.warn('interaction', `No handler for interact kind: ${hit.kind}`);
      return false;
    }
    return handler.handle(hit.world, hit.eid, hit.ref, ctx);
  }
}
```

#### 3.1.3 Конкретные handler-классы

Каждый кейс `tryInteract` → свой класс:

| Handler | Kind | Ответственность |
|---------|------|-----------------|
| `NpcHandler` | `'npc'` | `onDialogue(ref.id)` |
| `ChestHandler` | `'chest'` | Логика `openChestEcs` (перенесённая, без вложенного switch) |
| `PedestalHandler` | `'pedestal'` | Логика `takePedestalEcs` |
| `ShrineHandler` | `'shrine'` | Логика `useShrineEcs` |
| `AltarHandler` | `'altar'` | `bus.emit('boss:spawned', ...)` |
| `OldAltarHandler` | `'oldAltar'` | Логика `atoneEcs` |
| `StairsHandler` | `'stairs'` | Логика `enterDungeonOrExitEcs` |

#### 3.1.4 Регистрация

```typescript
export function createInteractionRegistry(): InteractionHandlerRegistry {
  return new InteractionHandlerRegistry()
    .register(new NpcHandler())
    .register(new ChestHandler())
    .register(new PedestalHandler())
    .register(new ShrineHandler())
    .register(new AltarHandler())
    .register(new OldAltarHandler())
    .register(new StairsHandler());
}
```

### Фаза 2: ChestItemHandlerRegistry

**Файл:** `src/game/ecs/ecs-systems/interaction-handlers.ts` (дополнить)

```typescript
export interface ChestItemHandler {
  itemKind: string; // 'bow' | 'sword' | 'arrows' | 'heartPiece' | 'key'
  handle(chestEid: number, store: GameStore, bus: EventBus): void;
}

export class ChestItemHandlerRegistry {
  private handlers = new Map<string, ChestItemHandler>();

  register(handler: ChestItemHandler): this {
    this.handlers.set(handler.itemKind, handler);
    return this;
  }

  collect(itemKind: string, chestEid: number, store: GameStore, bus: EventBus): void {
    const handler = this.handlers.get(itemKind);
    if (!handler) {
      logger.warn('interaction', `No chest item handler: ${itemKind}`);
      return;
    }
    handler.handle(chestEid, store, bus);
  }
}
```

Классы: `BowChestHandler`, `SwordChestHandler`, `ArrowsChestHandler`, `HeartPieceChestHandler`, `KeyChestHandler`.

### Фаза 3: DungeonUnlockChecker

**Файл:** `src/game/ecs/ecs-systems/interaction-handlers.ts` (дополнить)

```typescript
export interface DungeonUnlockChecker {
  dungeonId: number;
  check(flags: FlagDomain): { ok: boolean; req: string };
}

export class DungeonUnlockRegistry {
  private checkers = new Map<number, DungeonUnlockChecker>();

  register(checker: DungeonUnlockChecker): this {
    this.checkers.set(checker.dungeonId, checker);
    return this;
  }

  check(id: number, flags: FlagDomain): { ok: boolean; req: string } {
    const checker = this.checkers.get(id);
    if (!checker) return { ok: false, req: 'Путь запечатан' };
    return checker.check(flags);
  }
}
```

### Фаза 4: Интеграция

#### 4.1. `tryInteract` → делегирование

```typescript
// БЫЛО:
export function tryInteract(...): boolean {
  const hit = findNearest(world, playerEid, store);
  if (!hit) return false;
  audio.uiClick();

  switch (hit.kind) {
    case 'npc': onDialogue(hit.ref.id); return true;
    case 'chest': openChestEcs(...); return true;
    // ... ещё 5 case
  }
  return false;
}

// СТАЛО:
export function tryInteract(
  world: World,
  playerEid: number,
  store: GameStore,
  bus: EventBus,
  onDialogue: (id: string) => void,
  onGuardSpawn?: GuardSpawnCallback,
  registry?: InteractionHandlerRegistry  // optional, можно инжектить через store
): boolean {
  if (playerEid < 0 || !store.map) return false;

  const hit = findNearest(world, playerEid, store);
  if (!hit) return false;

  audio.uiClick();

  const ctx: InteractionContext = { world, store, bus, onDialogue, onGuardSpawn };
  return registry?.interact(hit, ctx) ?? false;
}
```

#### 4.2. `openChestEcs` → делегирование

```typescript
// БЫЛО:
function openChestEcs(world, chestEid, _chest, store, bus) {
  Chest.opened[chestEid] = 1;
  // ...
  switch (poolGet(StringPool.chestItems, Chest.item[chestEid])) {
    case 'bow': f.setFlag('hasBow', true); ... break;
    // ...
  }
}

// СТАЛО:
function openChestEcs(world, chestEid, _chest, store, bus, itemRegistry?: ChestItemHandlerRegistry) {
  Chest.opened[chestEid] = 1;
  // ...
  const itemKind = poolGet(StringPool.chestItems, Chest.item[chestEid]);
  itemRegistry?.collect(itemKind, chestEid, store, bus);
}
```

#### 4.3. `dungeonUnlocked` → делегирование

```typescript
// БЫЛО:
function dungeonUnlocked(id: number, f: any): { ok: boolean; req: string } {
  if (id === 0) return { ok: f.hasItem('sword'), req: '...' };
  if (id === 1) return { ok: f.hasItem('axe'), req: '...' };
  const runes = f.getRunes();
  return { ok: runes >= 5, req: '...' };
}

// СТАЛО:
function dungeonUnlocked(id: number, flags: FlagDomain, registry?: DungeonUnlockRegistry): { ok: boolean; req: string } {
  return registry?.check(id, flags) ?? { ok: false, req: 'Путь запечатан' };
}
```

---

## 4. Контрольные точки

- [ ] `tsc --noEmit` — 0 ошибок
- [ ] `interaction-handlers.ts` содержит все handler-классы
- [ ] `tryInteract` — 0 switch/case
- [ ] `openChestEcs` — 0 switch/case
- [ ] `dungeonUnlocked` — 0 if/else chain
- [ ] Визуально игра не изменилась
- [ ] Каждый handler тестируется изолированно

---

## 5. Преимущества

1. **OCP** — новый тип объекта = новый класс + `.register()`, без изменения существующего кода
2. **SRP** — каждый handler отвечает только за свой тип
3. **Тестируемость** — каждый handler тестируется изолированно (mock world/store/bus)
4. **Консистентность** — тот же паттерн, что `DropHandlerRegistry` в `drop-handlers.ts`
5. **Расширяемость** — handler-ы можно регистрировать динамически (плагины, моды, debug-команды)

---

## 6. Риски и митигация

| Риск | Митигация |
|------|-----------|
| Циклические импорты (World, GameStore, EventBus в interaction-handlers) | Использовать `import type` для типов, реестры создаются в одном месте |
| Регрессия поведения | Сравнивать логику кейса-классов с оригинальным switch дословно |
| Производительность | Map lookup — O(1), сравнимо с switch; negligible overhead |
| Переиспользование `findNearest` | Без изменений, остаётся в `interaction-system.ts` как есть |

---

## 7. Порядок выполнения

| Шаг | Фаза | Описание | Зависимости | Риск |
|-----|------|----------|-------------|------|
| 1 | 3.1.1–3.1.4 | Интерфейсы + Registry + 7 handler-классов | — | Средний |
| 2 | 3.2 | ChestItemHandlerRegistry + 5 классов | 1 | Низкий |
| 3 | 3.3 | DungeonUnlockRegistry + 3 checkers | 1 | Низкий |
| 4 | 4.1 | Интеграция `tryInteract` | 1 | Средний |
| 5 | 4.2 | Интеграция `openChestEcs` | 2 | Низкий |
| 6 | 4.3 | Интеграция `dungeonUnlocked` | 3 | Низкий |
| 7 | 5 | Очистка и проверки | 1–6 | Низкий |

---

## 8. Итоговая структура

```
interaction-system.ts (~150 строк, −~220)
├── tryInteract() — делегирование в registry
├── findNearest() — без изменений
├── getNearestInteractable() — без изменений
└── onEnemyKilledEcs() — без изменений (не относится к refactor)

interaction-handlers.ts (~300 строк, новый файл)
├── InteractionContext
├── InteractionHandler (интерфейс)
├── InteractionHandlerRegistry
│   ├── NpcHandler
│   ├── ChestHandler
│   ├── PedestalHandler
│   ├── ShrineHandler
│   ├── AltarHandler
│   ├── OldAltarHandler
│   └── StairsHandler
├── ChestItemHandler (интерфейс)
├── ChestItemHandlerRegistry
│   ├── BowChestHandler
│   ├── SwordChestHandler
│   ├── ArrowsChestHandler
│   ├── HeartPieceChestHandler
│   └── KeyChestHandler
└── DungeonUnlockChecker (интерфейс)
    └── DungeonUnlockRegistry
        ├── SwordDungeonChecker
        ├── AxeDungeonChecker
        └── RunesDungeonChecker
```
