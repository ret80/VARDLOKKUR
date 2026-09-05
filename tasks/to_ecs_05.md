# ECS Архитектура — Анализ соответствия

## Обзор проекта

Проект VARDLOKKUR использует **гибридную ECS-архитектуру** на базе **bitecs v0.4.0**:

- **Ядро ECS** (`src/game/ecs/`) — полностью портировано: 11 типов врагов, движение, AI, бой, физика (Planck.js), дропы, туман, рендеринг (PixiJS), 17-шаговый игровой цикл
- **Мета-системы** — остаются вне ECS: квесты, диалоги, HUD, store, аудио, FX, управление экранами

---

## Детальный анализ модулей `store/` и `state/`

### 1. `src/game/store/flag-domain.ts` — Флаги мира

**Содержимое:** ~50 булевых/числовых флагов (предметы, квесты, убийства боссов, ресурсы).

| Критерий | Оценка |
|----------|--------|
| Должно быть в ECS? | **Нет** |
| Почему | Это **прогрессия мира**, а не игровая логика тика. Флаги не участвуют в collision, AI, movement. Они читаются редко, меняются дискретно. |

**Проблема:** `GameFlags` — «божественный объект» (god object) с 40+ полями.

**Рекомендация:** Разбить на доменные группы:

```typescript
// inventory-flags.ts
interface InventoryFlags {
  hasSword: boolean; hasAxe: boolean; hasBow: boolean;
  hasHammer: boolean; hasKey: boolean;
  swordUp: boolean; axeUp: boolean; furyRune: boolean; nornsFavor: boolean;
}

// quest-flags.ts
interface QuestFlags {
  hornDone: boolean; meadDone: boolean; oreDone: boolean;
  shamanDone: boolean; refugeeDone: boolean; merchantDone: boolean;
  atoneDone: boolean; cullDone: boolean; shrineQuestDone: boolean; huntDone: boolean;
}

// kill-flags.ts
interface KillFlags {
  reaperDead: boolean; spiderDead: boolean; giantDead: boolean; snakeDead: boolean;
  killsByKind: Record<string, number>; kills: number; deaths: number;
}

// resource-flags.ts
interface ResourceFlags {
  hearts: number; arrows: number; runes: number; dew: number; fogWaves: number;
}

// quest-item-flags.ts
interface QuestItemFlags {
  bear: boolean; horn: boolean; mead: boolean; ore: boolean;
  moss: boolean; amber: boolean; flower: boolean;
  diary: boolean; bundle: boolean; relic: boolean;
}
```

---

### 2. `src/game/store/player-domain.ts` — Состояние игрока

**Содержимое:** hp, maxHp, position, velocity, direction, timers (swingT, hurtT, slowT).

| Критерий | Оценка |
|----------|--------|
| Должно быть в ECS? | **Уже есть в ECS!** |
| Почему | Компонент `Player` в `ecs-components.ts` содержит те же поля: `moving, animT, swingT, hurtT, slowT, hasSword, runes, swingDirX, swingDirY, aiming`. `PlayerDomain` — **дублирование**. |

**Проблема:** Данные игрока живут в двух местах:
1. `store.player` (PlayerDomain) — для HUD, React UI
2. ECS `Player` component — для movement, combat, AI систем

Это создаёт рассинхронизацию и необходимость `syncFrom`/`syncToPlayer` в `PlayerDomain`.

**Рекомендация:**
- `PlayerDomain` должен быть **view-layer** (только чтение из ECS для HUD/UI)
- Все мутации должны идти через ECS компоненты
- Убрать `takeDamage`, `heal`, `setPosition` из `PlayerDomain` — это делают `combat-system` и `movement-system`

---

### 3. `src/game/store/game-store.ts` — Центральное хранилище

**Содержимое:** Контейнер, объединяющий `FlagDomain`, `Player`, `PlayerDomain`, `WorldData`, screen state, visited sets, и ECS-хелперы.

| Критерий | Оценка |
|----------|--------|
| Должно быть в ECS? | **Частично** |
| Почему | Смешивает три разных уровня абстракции |

**Структура `GameStoreState` — три разных домена:**

```
GameStoreState {
  // ── ECS данные (должны жить в ECS) ──
  flags: FlagDomain,          → можно оставить (прогрессия мира)
  player: Player,             → ДУБЛИРОВАНИЕ с ECS Player component
  playerDomain: PlayerDomain, → ДУБЛИРОВАНИЕ с ECS Player component
  
  // ── Мирные данные (можно оставить) ──
  map: WorldData,
  ow: WorldData,
  visitedShrines: Set<number>,
  takenPedestals: Set<string>,
  openedChests: Set<string>,
  
  // ── Meta/Screen данные (НЕ ECS) ──
  screen: Screen,
  realT: number,
  playTime: number,
  zone: string,
  talkCount: number,
  floats: FloatText[],
}
```

**Рекомендация:** Разделить на три хранилища:

| Хранилище | Содержимое |
|-----------|------------|
| **WorldStore** | `FlagDomain`, `visitedShrines`, `takenPedestals`, `openedChests`, `map`, `ow` — персистентное состояние мира |
| **GameStore** | `screen`, `realT`, `playTime`, `zone`, `talkCount`, `floats`, `callbacks` — сессия игры |
| **ECS World** | `Player`, `Enemy`, `Position`, `Health`, `Velocity` и т.д. — игровая логика тика |

---

### 4. `src/game/state/state-manager.ts` — Управление экранами и FX

**Содержимое:** `screen`, `deathT`, `fadeA`, `fadeTarget`, `timeScale`, `hitstop`, `shake`, `playerDead`.

| Критерий | Оценка |
|----------|--------|
| Должно быть в ECS? | **Нет** |
| Почему | Это **meta-state** — управление UI-экранами и визуальными эффектами. Не влияет на игровую логику. |

**Рекомендация:** Оставить как есть. `StateManager` — правильный паттерн для screen-level состояния. Можно интегрировать с `GameStore` через колбэки (уже есть `onScreenChanged`, `onToast`).

---

## Итоговая таблица

| Модуль | В ECS? | Статус | Приоритет рефакторинга |
|--------|--------|--------|------------------------|
| `flag-domain.ts` | ❌ Не нужно | Рабочий паттерн, но god object | **Низкий** — разбить на поддомены |
| `player-domain.ts` | ⚠️ Уже есть в ECS | **Дублирование** | **Высокий** — убрать мутации, сделать read-only view |
| `game-store.ts` | ⚠️ Частично | Смешивает 3 домена | **Высокий** — разделить на WorldStore + GameStore |
| `state-manager.ts` | ❌ Не нужно | Правильное место | Нет изменений |

---

## Выполненные задачи

### ✅ 1. Декомпозиция GameFlags (низкий приоритет)

Создан `src/game/store/flag-domains.ts` с доменными группами:

| Домен | Содержимое |
|-------|------------|
| `InventoryFlags` | hasSword, hasAxe, hasBow, hasHammer, hasKey, swordUp, axeUp, furyRune, nornsFavor |
| `ResourceFlags` | hearts, arrows, runes, dew, fogWaves |
| `QuestItemFlags` | bear, horn, mead, ore, moss, amber, flower, diary, bundle, relic |
| `QuestFlags` | hornDone, meadDone, oreDone, shamanDone, refugeeDone, merchantDone, atoneDone, cullDone, shrineQuestDone, huntDone |
| `KillFlags` | reaperDead, spiderDead, giantDead, snakeDead, killsByKind, kills, deaths |
| `WorldFlags` | secretKnown, ghostBane, shrineIdx |

`GameFlags` теперь `extends` все домены — полная обратная совместимость.
Добавлен `INITIAL_FLAGS` — единый источник начальных значений.

### ✅ 2. Разделение GameStore на WorldStore + GameStore (высокий приоритет)

**До:** один `GameStore` содержал всё — флаги, карты, player, screen, таймеры.

**После:**

| Хранилище | Содержимое |
|-----------|------------|
| **WorldStore** | `FlagDomain`, `map`, `ow`, `visitedShrines`, `takenPedestals`, `openedChests`, `takenAmbient` — персистентное состояние мира |
| **GameStore** | `player`, `screen`, `realT`, `playTime`, `zone`, `talkCount`, `floats`, `callbacks`, `services` — сессионное состояние |

`GameStore` предоставляет convenience-геттеры для обратной совместимости:
- `store.flags` → `worldStore.flags`
- `store.map` → `worldStore.map` + `setMap()`
- `store.ow` → `worldStore.ow` + `setOw()`
- `store.openedChests`, `store.takenPedestals`, `store.visitedShrines`, `store.takenAmbient`
- `store.playerDomain` → для мутаций (см. ниже)

### ✅ 3. PlayerDomain как read-only view над ECS (высокий приоритет)

**Статус:** выполнено.

**Изменения:**

| Файл | Что изменилось |
|------|----------------|
| `ecs-components.ts` | Добавлен `Player.maxHp`, ECS-хелперы: `damageEntityEcs`, `healEntityEcs`, `fullHealEntityEcs`, `increaseMaxHpEcs` |
| `player-domain.ts` | Полная переписалка: конструктор принимает `eid` + `IEcsPlayerHelpers`, все геттеры читают из ECS (Position, Velocity, Health, Player, Direction), мутации делегируют через `_helpers` |
| `ecs-game-loop.ts` | Убраны `syncFrom`/`syncToPlayer`, добавлен `playerHelpers` в конфиг |
| `combat-system.ts` | `damagePlayerEcs` пишет напрямую в `Health.current[eid]` + `Player.hurtT[eid]` |
| `player-lifecycle.ts` | `respawn` пишет в ECS компоненты (Position, Velocity, Health, Player) |
| `dialogue-system.ts` | `increaseMaxHp`/`fullHeal` через `playerDomain` (теперь делегирует в ECS) |
| `interaction-system.ts` | `useShrineEcs`/`atoneEcs` через `playerDomain` → ECS |
| `engine.ts` | `PlayerDomain` создаётся с `eid=-1`, обновляется через `setEid()` при загрузке карты, переданы `playerHelpers` |

**Архитектура после рефакторинга:**

```
ECS World (source of truth)
├── Health.current[eid]  ← takeDamage, heal, fullHeal
├── Health.max[eid]      ← increaseMaxHp
├── Player.swingT/hurtT/slowT  ← timers
├── Position.x/y[eid]    ← movement, respawn
├── Velocity.x/y[eid]    ← movement
└── Direction.x/y[eid]   ← direction-from-velocity

PlayerDomain (read-only view)
├── геттеры → читают из ECS компонентов
└── мутации → делегируют через IEcsPlayerHelpers

store.player (view-layer sync)
└── читается из ECS в ecs-game-loop step 10
```

## Итог

| Задача | Статус | Результат |
|--------|--------|-----------|
| Decompose GameFlags | ✅ Выполнено | 6 доменных групп, INITIAL_FLAGS |
| Split GameStore | ✅ Выполнено | WorldStore + GameStore |
| PlayerDomain read-only | ✅ Выполнено | ECS-хелперы, read-only view, 0 ошибок tsc |
| Type check | ✅ 0 ошибок | `tsc --noEmit` проходит |

---

## Контекст: текущий ECS-слой

Проект уже имеет продвинутый ECS-слой:

- **11 ECS-систем:** init, movement, life, physics, combat, ai, drops, fog, interaction, world, input, render
- **20+ компонентов:** Position, Velocity, Health, Player, Enemy, Projectile, Drop, NPC, Chest, Pedestal, Shrine, Door, Barrier, Altar, Sprite, PhysicsBody, EnemyAI и маркеры
- **17-шаговый игровой цикл:** ввод → движение → физика Planck → AI → снаряды → дропы → туман → двери/зоны → жизнь/смерть
- **ECS-хелперы:** `enemyEids()`, `pedestalEids()`, `getEnemy()`, `getPos()` в `GameStore` — читают из ECS World

**Гибридный паттерн правильный:** ядро gameplay — в ECS, мета-системы (quests, dialogues, HUD, store, audio, FX) — вне ECS, связь через EventBus + callback injection.
