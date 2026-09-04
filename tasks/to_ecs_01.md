Давайте изучу репозиторий и план миграции. Начну с получения ключевых файлов.
Теперь у меня полная картина. Давайте составлю детальный план миграции.
Теперь у меня полная картина проекта. Составляю детальный план.
Теперь у меня полная картина. Вот подробный план миграции:

---

# План финальной миграции VARDLOKKUR на ECS (bitECS)

## Текущее состояние

Проект находится в **переходном состоянии**: ECS-код (`src/game/ecs/`) создан и частично работает, но `engine.ts` запускает **гибридный режим** — ECS game loop делегирует обновление снарядов, дропов, тумана и взаимодействия **legacy-системам**. Все 23 legacy-файла в `src/game/system/` всё ещё импортируются и используются. Флаг `useEcs = true` активирует ECS, но legacy-код не удалён.

### Что уже работает в ECS:
- Создание мира bitECS, компонентов, префабов
- Спавн всех типов сущностей (игрок, враги, NPC, сундуки, пьедесталы, святилища, двери, барьеры, алтари, дропы, снаряды)
- Загрузка карты через `EcsMapLoader`
- Игровой цикл (ввод, движение, физика Planck, синхронизация, таймеры, AI, рендеринг)
- ECS-рендеринг через `ecs-render-helpers.ts` → `entities.ts`

### Что делегируется в legacy из `ecs-game-loop.ts`:
- `combat.updateProjectiles(dt)` → legacy `CombatSystem`
- `drops.updateDrops(dt)` → legacy `DropsSystem`
- `fog.updateFog(dt, rdt)` → legacy `FogSystem`
- `interaction.tryInteract()` через `processActions` → legacy `InteractionSystem`

### Legacy-системы без ECS-аналогов:
- `QuestSystem` — квестовая логика, прогресс, отслеживание
- `DialogueSystem` — диалоги, эффекты диалогов
- `HudSystem` — синхронизация HUD с React

### Прочие legacy-модули, используемые engine.ts:
- `EntityManager` — создание/управление массивами сущностей + Planck bodies
- `MapLoader` — legacy-загрузка карты
- `MapRenderer` — legacy-рендеринг сущностей
- `RenderSystem` — legacy-рендеринг, текстуры карт, миникарта, большая карта, float text
- `StateManager` — управление экранами/паузой/fade
- `PhysicsSystem` (interface) — используется CombatSystem и AISystem

---

## Фаза 1: Доработка ECS-систем до функционального паритета

Цель: ECS game loop больше **не вызывает** legacy-системы. Каждый шаг — отдельная подзадача.

### 1.1. Полноценная ECS Combat System

**Файл:** `src/game/ecs/ecs-systems/combat-system.ts`

Текущий ECS combat-system содержит `swordAttackSystem`, `axeThrowSystem`, `arrowShootSystem`, `projectileUpdateSystem`, `projectileEnemyCollisionSystem`, `damageEnemy`, `damagePlayer`. Но game loop вызывает `combat.updateProjectiles(dt)` из legacy `CombatSystem`.

**Что нужно сделать:**

1. **Перенести `updateProjectiles` логику** из legacy `system/combat-system.ts` в ECS `combat-system.ts`:
   - Движение снарядов (arrow, axe, spore, fire) по Velocity
   - Axe returning mechanic (связь с `Returning` компонентом)
   - Projectile lifetime → удаление через `Dead` маркер
   - Урон по врагам через `projectileEnemyCollisionSystem` (использовать Planck.js collision callbacks или query-based overlap check)
   - Урон по игроку
   - Snake-specific combat (уязвимость только в состоянии `open`)
   - Ghost clang (immune without `ghostBane`)
   - Draugr shield block (facing direction check)
   - Knockback через Planck body impulse
   - Hit effects: `audio.hit()`, float text, `fx.burst`
   - Boss death detection (`reaper`, `spider`, `giant`, `snake`) → emit `boss:killed`

2. **Перенести `killEnemy` логику** — спавн дропов со смерти врага, отслеживание `killsByKind`, increment kills, emit `enemy:killed`

3. **Перенести `startDungeonBoss`** — спавн босса при входе в boss room

4. **Перенести `onDungeonBossDeath`** — награда за босса (spawn drop), открытие выхода

5. **Перенести `onPlayerDamaged`** — обработка урона по игроку, knockback, `hurtT`, проверка смерти

6. **Перенести `fireProjectile`** — создание сущности снаряда + Planck body + Graphics

7. **Удалить debug `console.log`** из `physics-system.ts` (syncVelocityToBody и др.)

**Важно:** Сохранить всю боевую логику: axe throw + return, arrow shoot (из `input-system.ts`), sword attack cone, hammer freeze, snake phases, ghost immunity, draugr shield, boss mechanics.

### 1.2. Полноценная ECS Drops System

**Файл:** `src/game/ecs/ecs-systems/drops-system.ts`

Текущий ECS drops-system имеет `spawnDrop`, `dropsUpdateSystem`, `spawnDropFromEnemy`. Но game loop вызывает `drops.updateDrops(dt)` из legacy.

**Что нужно сделать:**

1. **Перенести `updateDrops` логику** из legacy `system/drops-system.ts`:
   - Обновление позиции дропов (magnet pull к игроку)
   - Lifetime countdown → удаление
   - Alpha blink перед исчезновением
   - Pickup detection (distance check player ↔ drop)
   - Drop collection через `DropHandlerRegistry` (`src/game/drop-handlers.ts`)
   - Planck body cleanup при удалении дропа
   - Graphics cleanup при удалении

2. **Перенести `rollDrops`** — RNG-спавн дропов при смерти врага (heart, shard, rune, soul, dew)

3. **Перенести ambient drops** — загрузка амбиентных дропов из `map.ambient`

4. **Интегрировать `drop-handlers.ts`** — все 21 обработчиков дропов (HeartHandler, ArrowsHandler, AxeHandler, BowHandler, HammerHandler, BearHandler, HornHandler, MeadHandler, OreHandler, MossHandler, AmberHandler, FlowerHandler, DiaryHandler, BundleHandler, RelicHandler, ShardHandler, BonesHandler, RuneHandler, DewHandler, SoulHandler, SwordHandler)

### 1.3. Полноценная ECS Fog System

**Файл:** `src/game/ecs/ecs-systems/fog-system.ts`

Текущий ECS fog-system минимален — только обновление ghost fade и dissipate. Game loop вызывает legacy `fog.updateFog(dt, rdt)`.

**Что нужно сделать:**

1. **Перенести `updateFog` логику** из legacy `system/fog-system.ts`:
   - Fog timer countdown (60s → волна тумана)
   - Fog warning (audio.horn, audio.setFog)
   - Fog wave start/stop (`fogActive`, `fogAmbient`)
   - Fog radius interpolation (vignette)
   - Village safe zone check
   - Near-altar ambient fog
   - Ghost spawning during fog waves (`ensureGhosts`)
   - Ghost clang (immune to attacks without `ghostBane`)
   - `endWave` → emit `fog:waveEnd`
   - `snakeDead` / dungeon → fog disabled

2. **Добавить fog state в ECS** — создать компоненты или хранить state в game loop:
   - `fogTimer`, `fogActive`, `fogLeft`, `fogRadius`, `fogSpawned`, `fogWarned`, `fogAmbient`, `ghostClangT`

3. **Интегрировать с `FxManager`** — fog vignette rendering, audio intensity

### 1.4. Полноценная ECS Interaction System

**Файл:** `src/game/ecs/ecs-systems/interaction-system.ts`

Текущий ECS interaction-system имеет `tryInteract` с базовой proximity-проверкой. Но game loop вызывает legacy `interaction.tryInteract()`.

**Что нужно сделать:**

1. **Перенести полную логику** из legacy `system/interaction-system.ts`:
   - `findNearest()` — поиск ближайшего интерактивного объекта (NPC, chest, pedestal, shrine, altar, oldAltar, stairs)
   - `openChest` — открытие сундука, выдача предмета, `openedChests.add()`, audio
   - `takePedestal` — взятие предмета с пьедестала, проверка `guardsLeft`, спавн стражей
   - `useShrine` — активация святилища, heal, `shrineIdx`, `visitedShrines.add()`
   - `atone` — ритуал искупления (relic)
   - `enterDungeonOrExit` — переход между подземельем и overworld
   - `onEnemyKilled` — decrement `guardsLeft` на пьедестале

2. **Интегрировать с EventBus** — emit `pedestal:guardKilled`, `pedestal:unsealed`, `boss:spawned`

### 1.5. Очистка ECS Input System

**Файл:** `src/game/ecs/ecs-systems/input-system.ts`

**Что нужно сделать:**
- Удалить все `console.log` (4 места: `[INPUT] ix=`, `[INPUT] SET_VEL`)
- Проверить, что `processActions` и `updateBow` полностью функциональны
- Убедиться, что bow shoot (arrow fire) работает через ECS combat system, а не через legacy `bus.emit("projectile:fire")`

---

## Фаза 2: Quest System и Dialogue System

Эти системы **не требуют ECS-сущностей** — они работают с флагами и событиями, не с позициями/скоростями. Решение: **оставить как отдельные модули**, но убрать зависимость от legacy entity arrays.

### 2.1. Quest System — отвязка от legacy entity arrays

**Файлы:** `src/game/system/quest-system.ts`, `quest-definitions.ts`, `quest-provider.ts`, `quest-system.ts`, `quest-targets.ts`, `quest-tracker.ts`

**Что нужно сделать:**

1. **Заменить `store.entities.enemies`** на ECS query: вместо `this.enemies.all` использовать `query(world, [Enemy])` для проверки живых врагов
2. **Заменить `store.entities.pedestals`** на ECS query: `query(world, [Pedestal])` для проверки `guardsLeft`
3. **Заменить `store.bossRef`** — искать босса через `query(world, [Enemy])` где `kind === 'reaper'|'spider'|'giant'|'snake'`
4. **Перенести файлы** из `src/game/system/quest-*.ts` в `src/game/ecs/` или `src/game/quests/` (новая директория)
5. **Обновить импорты** — `quest-system.ts` не должен импортировать из `system/`

**Контракт:** QuestSystem подписан на EventBus события (`enemy:killed`, `drop:collected`, `dialogue:end`, `pedestal:unsealed`, `boss:killed`, `fog:waveEnd`, `quest:reveal`). Это сохраняется без изменений.

### 2.2. Dialogue System — отвязка от legacy

**Файлы:** `src/game/system/dialogue-system.ts`, `src/game/dialogues.ts`

**Что нужно сделать:**

1. **Заменить прямые мутации `this.store.player`** на PlayerDomain / ECS Player component:
   - `effect_eirik` → `flags.hasSword = true` (флаги остаются)
   - `effect_astrid` → `playerDomain.increaseMaxHp(2)`, `playerDomain.fullHeal()`
   - `effect_sigrid` → `flags.axeUp = true`
   - `effect_harald` → `flags.swordUp = true`
   - `effect_shaman` → `flags.ghostBane = true`
   - и т.д. — все effect handlers

2. **Перенести файлы** из `src/game/system/dialogue-system.ts` → `src/game/dialogue/` или оставить в `src/game/`

3. **`dialogues.ts`** — не требует изменений, это декларативные определения диалогов

### 2.3. HUD System — чтение из ECS

**Файл:** `src/game/system/hud-system.ts`

**Что нужно сделать:**

1. **Заменить чтение `store.player`** на чтение из ECS Player component:
   ```typescript
   // Вместо this.player.hp → Health.current[playerEid]
   // Вместо this.player.maxHp → Health.max[playerEid]
   ```

2. **Заменить чтение flags** — `FlagDomain` остаётся, HUD читает из него (изменений не требуется)

3. **Перенести** в `src/game/hud/` или оставить, убрать импорт из `system/`

4. **Quests/Stats** — остаются через `IQuestProvider`, без изменений

---

## Фаза 3: Рефакторинг Engine.ts

Цель: `engine.ts` — только оркестратор (~200-300 строк), без legacy-кода и двойных путей.

### 3.1. Удаление dual code paths

**Файл:** `src/game/engine.ts`

**Что нужно сделать:**

1. **Удалить `useEcs` флаг** и весь блок `if (!this.useEcs)`:
   - Удалить метод `loadMapLegacy()`
   - Удалить метод `update()` (legacy game loop)
   - Удалить legacy рендеринг в `tick()` (`this.renderer.tick(...)`)
   - Удалить `loadMapLegacy` вызов

2. **Удалить создание legacy систем** в `instantiateSystems()`:
   - Удалить `new CombatSystem(...)` — заменён на ECS combat
   - Удалить `new DropsSystem(...)` — заменён на ECS drops
   - Удалить `new FogSystem(...)` — заменён на ECS fog
   - Удалить `new InteractionSystem(...)` — заменён на ECS interaction
   - Удалить `new PhysicsSystem()` — не нужен (Planck world напрямую)
   - Удалить `new AISystem(...)` — заменён на ECS AI
   - Удалить `new RenderSystem(...)` — заменён на ECS render
   - Удалить `new EntityManager(...)` — заменён на ECS entity creation
   - Удалить `new MapLoader(...)` — заменён на EcsMapLoader
   - Удалить `new MapRenderer(...)` — заменён на ECS render

3. **Оставить** (пока):
   - `QuestSystem` — если не перенесён в ECS
   - `DialogueSystem` — если не перенесён
   - `HudSystem` — если не перенесён
   - `StateManager` — управление экранами
   - `InputSystem` — ввод
   - `EventBus` — для UI-событий

4. **Удалить legacy entity arrays**:
   - `this.enemies`, `this.projectiles`, `this.dropsArr`, `this.chests`, `this.pedestals`, `this.shrines`, `this.npcs`, `this.doors`
   - Вместо них — `this.ecsPlayerEid` и ECS queries

5. **Удалить `this.playerBody`** — получается из ECS PhysicsBody

6. **Упростить `loadMap()`** — только ECS путь:
   ```typescript
   private loadMap(map: WorldData, spawn: Vec) {
     this.map = map;
     this.store.setMap(map);
     // ECS загрузка
     this.loadMapEcs(map, spawn);
   }
   ```

7. **Упростить `tick()`** — только ECS:
   ```typescript
   private tick(rdt: number) {
     this.state.update(rdt);
     if (this.state.screen === "play" && !this.dialogueActive) {
       if (this.state.hitstop > 0) this.state.hitstop -= rdt;
       else this.ecsGameLoop.tick(rdt * this.state.timeScale, 1);
     }
     this.ecsGameLoop.render(rdt);
     // minimap, big map — через отдельные утилиты
   }
   ```

8. **Удалить `respawn()` legacy-часть** — использовать ECS для respawn

9. **Удалить `destroy()` legacy-часть** — `this.entityMgr.destroy()` → ECS world cleanup

### 3.2. Перенос функциональности RenderSystem в ECS

**Из `src/game/system/render-system.ts` в ECS:**

1. **Tile textures** — `buildMapTextures()` переносится в `EcsMapLoader` или отдельный `MapTextureBuilder`
2. **Minimap** — `drawMinimap()` остаётся как утилита, читает из ECS `Position[playerEid]`
3. **Big map** — `drawBigMap()` — то же
4. **Float text** — переносится в ECS render system (уже частично есть `addFloatText`, `updateFloatTexts`)
5. **Player setup** — `setupPlayerG()` — больше не нужен, player Graphics создаётся в ECS

**Из `src/game/system/map-renderer.ts`:**
- Полностью удаляется — рендеринг сущностей происходит в ECS render system

### 3.3. Перенос функциональности EntityManager

**Из `src/game/system/entity-manager.ts` в ECS:**

1. **PlanckWorld creation** — переносится в `ecs-world.ts` или engine init
2. **`clearEntities()`** — заменяется на `clearWorld()` в ECS (уже есть в `ecs-map-loader.ts`)
3. **`spawnEnemy()`** — заменяется на `createEnemyInEcs()` из `ecs-bridge.ts`
4. **`makeBody()`** — заменяется на `createBodyForEntity()` из `ecs-systems/physics-system.ts`
5. **`ensureSpawnSafety()`** — переносится в `ecs-map-loader.ts`
6. **Texture management** (`wallTiles`, `groundSpr`, `roofSnow`) — переносится в `MapTextureBuilder`
7. **`barrier`, `altar`** — уже есть как ECS entities

---

## Фаза 4: Рефакторинг GameStore

Цель: GameStore работает с ECS, а не с legacy arrays.

### 4.1. Удаление WorldEntities

**Файлы:** `src/game/store/world-entities.ts`, `src/game/store/models.ts`

**Что нужно сделать:**

1. **Удалить `WorldEntities`** и все коллекции (`EnemyCollection`, `ProjectileCollection`, `DropCollection`, etc.) — сущности хранятся в ECS
2. **Удалить `models.ts`** — если не используется (task_06 уже пометил как WIP)
3. **Обновить `GameStore`** — убрать `entitiesArrays` из `GameStoreConfig`, убрать `entities: WorldEntities` из state
4. **Заменить `store.entities.enemies`** на ECS query через world reference
5. **Заменить `store.bossRef`** на ECS query для боссов

### 4.2. GameStore — добавить ECS world reference

**Файл:** `src/game/store/game-store.ts`

**Что нужно сделать:**

1. **Добавить `world: World`** в `GameStoreConfig` — GameStore может делать ECS queries
2. **Добавить `playerEid: number`** в state — для быстрого доступа к игроку
3. **Заменить `store.player` (raw Player object)** на чтение из ECS:
   - `store.player.hp` → `Health.current[playerEid]`
   - `store.player.x` → `Position.x[playerEid]`
   - и т.д.
   - **ИЛИ** сохранить `store.player` как projection, синхронизируемый в game loop (как сейчас)

4. **Удалить `planckWorld` из store** — Planck world создаётся в engine, передаётся напрямую

### 4.3. FlagDomain — без изменений

`FlagDomain` работает с plain object `GameFlags`, не зависит от entity arrays. **Остаётся как есть.**

### 4.4. PlayerDomain — без изменений

`PlayerDomain` инкапсулирует HP/damage/heal. **Остаётся как есть**, но sync происходит с ECS Player component.

---

## Фаза 5: EventBus — минимизация

Цель: EventBus используется только для UI-событий и cross-system коммуникации, которая не подходит для ECS queries.

### 5.1. События, которые остаются на EventBus:

- `input:pause`, `input:inventory`, `input:quests`, `input:mute`, `input:use-heart`, `input:toggle-snow`, `input:close-overlay` — UI navigation
- `dialogue:start`, `dialogue:end` — dialogue lifecycle
- `screen:change` — screen transition
- `toast` — UI toast messages
- `hud:dirty` — HUD refresh trigger
- `hud:float` — floating text
- `fx:burst` — particle effects
- `engine:enter-dungeon`, `engine:exit-dungeon` — map transitions

### 5.2. События, которые заменяются на ECS:

- `combat:trySword` → вызов `swordAttackSystem()` напрямую из game loop
- `combat:tryAxe` → вызов `axeThrowSystem()` напрямую
- `projectile:fire` → вызов `arrowShootSystem()` или `createProjectileInEcs()` напрямую
- `projectile:spawned` → не нужен, Graphics добавляется в ECS map loader
- `drop:spawn` → вызов `spawnDrop()` напрямую
- `drop:spawned` → не нужен
- `enemy:killed` → остаётся (QuestSystem слушает)
- `enemy:hit` → можно убрать, обрабатывается в ECS combat
- `player:damaged` → остаётся (DialogueSystem, FogSystem слушают)
- `player:died` → остаётся (StateManager, FogSystem слушают)
- `player:healed`, `player:heartUsed` → можно убрать или оставить для UI
- `player:respawned` → остаётся
- `boss:spawned` → остаётся (InteractionSystem слушает)
- `boss:killed` → остаётся (QuestSystem слушает)
- `snake:death` → остаётся
- `pedestal:guardKilled`, `pedestal:unsealed` → остаются (QuestSystem слушает)
- `fog:waveStart`, `fog:waveEnd` → остаются (QuestSystem слушает)
- `fog:ghostSpawn`, `fog:ghostDissipate` → можно убрать
- `quest:reveal`, `quest:progress`, `quest:completed` → остаются

### 5.3. Обновить `game-states.ts`

- Удалить мёртвые типы (task_06 уже идентифицировал: `ChestRt`, `PedestalRt`, `ShrineRt`, `NpcRt`, `DoorRt` из game-states.ts)
- Оставить `GameEvents`, `ProjectileRt`, `DropRt` (если ещё нужны)
- **Или** перенести `GameEvents` в `event-bus.ts` и удалить `game-states.ts` полностью

---

## Фаза 6: Удаление legacy-кода

### 6.1. Удаление legacy system файлов

**Удалить полностью:**

| Файл | Заменён на |
|------|-----------|
| `src/game/system/ai-system.ts` | `ecs/ecs-systems/ai-system.ts` |
| `src/game/system/boss-enemy-behaviors.ts` | Логика перенесена в ECS ai-system |
| `src/game/system/common-enemy-behaviors.ts` | Логика перенесена в ECS ai-system |
| `src/game/system/combat-system.ts` | `ecs/ecs-systems/combat-system.ts` |
| `src/game/system/drops-system.ts` | `ecs/ecs-systems/drops-system.ts` |
| `src/game/system/enemy-behavior.ts` | BehaviorRegistry не нужен |
| `src/game/system/entity-manager.ts` | ECS entity creation + `ecs-bridge.ts` |
| `src/game/system/fog-system.ts` | `ecs/ecs-systems/fog-system.ts` |
| `src/game/system/interaction-system.ts` | `ecs/ecs-systems/interaction-system.ts` |
| `src/game/system/map-loader.ts` | `ecs/ecs-map-loader.ts` |
| `src/game/system/map-renderer.ts` | `ecs/ecs-systems/render-system.ts` |
| `src/game/system/physics-system.ts` | `ecs/ecs-systems/physics-system.ts` (interface IPhysics — удалить) |
| `src/game/system/render-system.ts` | `ecs/ecs-systems/render-system.ts` + `ecs/ecs-render-helpers.ts` |

**Переместить (не удалять):**

| Файл | Куда | Причина |
|------|------|---------|
| `src/game/system/quest-system.ts` | `src/game/quests/quest-system.ts` | Не ECS, но убрать из system/ |
| `src/game/system/quest-definitions.ts` | `src/game/quests/quest-definitions.ts` | |
| `src/game/system/quest-provider.ts` | `src/game/quests/quest-provider.ts` | |
| `src/game/system/quest-targets.ts` | `src/game/quests/quest-targets.ts` | |
| `src/game/system/quest-tracker.ts` | `src/game/quests/quest-tracker.ts` | |
| `src/game/system/dialogue-system.ts` | `src/game/dialogue/dialogue-system.ts` | |
| `src/game/system/hud-system.ts` | `src/game/hud/hud-system.ts` | |
| `src/game/system/input-system.ts` | `src/game/input/input-system.ts` | Используется и ECS, и UI |
| `src/game/system/state-manager.ts` | `src/game/state/state-manager.ts` | Экраны/пауза/fade |
| `src/game/system/planck-world.ts` | `src/game/physics/planck-world.ts` | Planck wrapper — используется ECS |

**Удалить директорию `src/game/system/` после переноса.**

### 6.2. Удаление legacy store файлов

| Файл | Статус |
|------|--------|
| `src/game/store/world-entities.ts` | Удалить — сущности в ECS |
| `src/game/store/models.ts` | Удалить — не используется (task_06) |

**Оставить:**

| Файл | Причина |
|------|---------|
| `src/game/store/game-store.ts` | Активен, рефакторится |
| `src/game/store/flag-domain.ts` | Активен, без изменений |
| `src/game/store/player-domain.ts` | Активен, без изменений |
| `src/game/store/index.ts` | Обновить barrel exports |

### 6.3. Очистка entities.ts

**Файл:** `src/game/entities.ts` (34760 chars)

`entities.ts` содержит **два слоя**:
1. **Data interfaces** (`Player`, `Enemy`, `Projectile`, `Drop`, `IPlayerData`, `IEnemyData`, etc.)
2. **Render functions** (`renderPlayer`, `renderEnemy`, `renderNpc`, `renderDrop`, `renderProjectile`, `renderChest`, `renderPedestal`, `renderShrine`, `renderDoor`, `renderBarrier`, `renderAltar`)
3. **Helper** (`makeEnemy`, `ENEMY_STATS`)

**Что нужно сделать:**

1. **Разделить файл:**
   - `src/game/render/` — render functions (`renderPlayer`, `renderEnemy`, etc.) + `I*Data` interfaces
   - `src/game/types/` или оставить data interfaces в `entities.ts` если они ещё используются ECS-компонентами

2. **Удалить `makeEnemy()`** — заменён на `createEnemyEntity()` в ECS utils

3. **`ENEMY_STATS`** — используется в `ecs-bridge.ts` (дублирует!), `ecs-systems/init-system.ts`. Оставить в одном месте.

4. **Проверить импорты** — `ecs-render-helpers.ts` импортирует из `entities.ts` render functions и `I*Data` interfaces. Это сохраняется.

### 6.4. Очистка debug-кода

**Удалить все `console.log` из:**
- `src/game/ecs/ecs-systems/input-system.ts` (4 вызова)
- `src/game/ecs/ecs-systems/physics-system.ts` (6+ вызовов)
- `src/game/engine.ts` (1 вызов `[ENGINE] useEcs=`)
- `src/game/ecs/ecs-game-loop.ts` (закомментированные логи — убрать)

### 6.5. Очистка ecs-bridge.ts

**Файл:** `src/game/ecs/ecs-bridge.ts`

- Дублирует `getEnemyStats()` — уже есть в `entities.ts` (`ENEMY_STATS`). Использовать единый источник.
- Дублирует создание сущностей — `ecs-utils.ts` уже имеет `createPlayerEntity`, `createEnemyEntity`, etc. Bridge добавляет только `Sprite` компонент. Можно объединить.

### 6.6. Удаление tasks/ файлов

- `tasks/task_01.md` — `task_08.md` — завершённые задачи, удалить
- `tasks/to_ecs.md` — миграционный план, заменить на этот документ
- `tasks/plan_planck_migration.md` — завершён, удалить

---

## Фаза 7: Интеграция и проверка

### 7.1. Обновление импортов

После переноса файлов обновить все импорты в:
- `src/game/engine.ts`
- `src/game/ecs/ecs-game-loop.ts`
- `src/game/ecs/ecs-map-loader.ts`
- `src/game/ecs/ecs-bridge.ts`
- `src/game/ecs/ecs-systems/*.ts`
- `src/game/store/game-store.ts`
- `src/App.tsx`
- `src/main.tsx`

### 7.2. Обновление EcsGameLoopConfig

**Файл:** `src/game/ecs/ecs-game-loop.ts`

Убрать из конфигурации ссылки на legacy системы:
- Убрать `hud`, `quests`, `dialogue`, `drops`, `fog`, `combat`, `ai`, `interaction` (legacy instances)
- Заменить на direct ECS system calls
- Оставить `bus`, `store`, `planckWorld`, `app`, `dynamic`, `floatLayer`, `gameWorld`, `fx`, `input`, `state`, `cam`, `map`, `ow`, `flags`, `playerEid`, `playerDomain`

### 7.3. Финальный игровой цикл

```
tick(dt):
  1. input capture → updatePlayerInput()
  2. processActions → tryInteract() [ECS]
  3. updateBow → arrowShootSystem() [ECS]
  4. swordAttackSystem / axeThrowSystem [ECS]
  5. syncVelocityToBody → planckWorld.step → syncBodyToPosition [ECS]
  6. kinematic movement (ghosts, drops) [ECS]
  7. directionFromVelocitySystem [ECS]
  8. store sync (Position → store.player) [ECS]
  9. stateTimerSystem [ECS]
  10. aiUpdateSystem [ECS]
  11. projectileUpdateSystem [ECS]
  12. dropsUpdateSystem [ECS]
  13. fogUpdateSystem [ECS]
  14. updateDoors / updateZone / checkDungeonBoss [ECS]
  15. lifeCheckSystem → deathCleanupSystem [ECS]
  16. magnetSystem [ECS]
  17. questSystem.checkQuestProgress() [event-driven]
  18. pushHud() [read from ECS]

render(dt):
  1. renderSystem [ECS] — all entity rendering
  2. FX rendering (fog, snow, vignette)
  3. camera update
  4. minimap update
```

### 7.4. Финальная структура директорий

```
src/game/
  ecs/
    ecs-world.ts
    ecs-components.ts
    ecs-utils.ts
    ecs-relations.ts
    ecs-bridge.ts
    ecs-map-loader.ts
    ecs-render-helpers.ts
    ecs-game-loop.ts
    index.ts
    ecs-systems/
      init-system.ts
      input-system.ts
      movement-system.ts
      physics-system.ts
      life-system.ts
      combat-system.ts
      ai-system.ts
      drops-system.ts
      fog-system.ts
      interaction-system.ts
      render-system.ts
      world-system.ts
      index.ts
  quests/
    quest-system.ts
    quest-definitions.ts
    quest-provider.ts
    quest-targets.ts
    quest-tracker.ts
  dialogue/
    dialogue-system.ts
  hud/
    hud-system.ts
  input/
    input-system.ts
  state/
    state-manager.ts
  physics/
    planck-world.ts
  render/
    render-functions.ts    (из entities.ts)
    map-texture-builder.ts  (из render-system.ts)
  store/
    game-store.ts
    flag-domain.ts
    player-domain.ts
    index.ts
  generators/             (без изменений)
  dialogues.ts             (без изменений)
  drop-handlers.ts         (без изменений)
  audio.ts                 (без изменений)
  fx.ts                    (без изменений)
  tiles.ts                 (без изменений)
  map-display.ts           (без изменений)
  world.ts                 (без изменений)
  utils.ts                 (без изменений)
  event-bus.ts             (без изменений)
  engine.ts                (рефакторинг: ~250 строк)
```

**Удалено:**
- `src/game/system/` — вся директория
- `src/game/entities.ts` — разделён на `render/` + данные в ECS components
- `src/game/store/world-entities.ts`
- `src/game/store/models.ts`
- `src/game/game-states.ts` — `GameEvents` перенесён в `event-bus.ts`
- `tasks/` — все файлы

---

## Порядок выполнения

| Шаг | Фаза | Описание | Зависимости |
|-----|------|----------|-------------|
| 1 | 1.1 | Доработка ECS Combat System | — |
| 2 | 1.2 | Доработка ECS Drops System | 1 |
| 3 | 1.3 | Доработка ECS Fog System | 1 |
| 4 | 1.4 | Доработка ECS Interaction System | 1 |
| 5 | 1.5 | Очистка ECS Input System (console.log) | — |
| 6 | 2.1 | Quest System — отвязка от legacy arrays | 1-4 |
| 7 | 2.2 | Dialogue System — отвязка от legacy | 1-4 |
| 8 | 2.3 | HUD System — чтение из ECS | 1-4 |
| 9 | 3.1 | Engine.ts — удаление dual paths | 1-8 |
| 10 | 3.2 | Перенос RenderSystem в ECS | 9 |
| 11 | 3.3 | Перенос EntityManager в ECS | 9 |
| 12 | 4.1 | Удаление WorldEntities | 9-11 |
| 13 | 4.2 | GameStore — ECS world reference | 12 |
| 14 | 5.1-5.3 | EventBus минимизация | 9-12 |
| 15 | 6.1 | Удаление legacy system файлов | 9-14 |
| 16 | 6.2 | Удаление legacy store файлов | 12 |
| 17 | 6.3 | Разделение entities.ts | 15 |
| 18 | 6.4 | Очистка debug-кода | 15 |
| 19 | 6.5 | Очистка ecs-bridge.ts | 15 |
| 20 | 6.6 | Удаление tasks/ | 15 |
| 21 | 7.1 | Обновление импортов | 15-20 |
| 22 | 7.2 | Обновление EcsGameLoopConfig | 21 |
| 23 | 7.3 | Финальная проверка игрового цикла | 22 |

---

## Критические замечания

1. **Не удалять `planck-world.ts`** — он используется ECS physics-system. Только перенести из `system/` в `physics/`.

2. **Не удалять `event-bus.ts`** — нужен для UI-событий и cross-system коммуникации (quests, dialogues).

3. **Не удалять `drop-handlers.ts`** — используется ECS drops system.

4. **`FlagDomain` и `PlayerDomain`** — остаются без изменений. Они инкапсулируют логику, не зависящую от способа хранения сущностей.

5. **`entities.ts` render functions** — критичны. `ecs-render-helpers.ts` вызывает `renderPlayer`, `renderEnemy`, etc. из `entities.ts`. Эти функции — чистая отрисовка без состояния, их можно вынести в отдельный модуль.

6. **AI behaviors** — legacy `ai-system.ts` использует `BehaviorRegistry` с классами (`DraugrBehavior`, `VargBehavior`, etc.). ECS `ai-system.ts` уже имеет inline switch по `e.kind` с той же логикой. Нужно убедиться, что **все 11 типов врагов** (draugr, varg, raven, shroom, crawler, frost, reaper, spider, giant, snake, ghost) полностью реализованы в ECS AI.

7. **Boss mechanics** — `boss-enemy-behaviors.ts` (ReaperBehavior, SpiderBehavior, GiantBehavior, SnakeBehavior) содержит сложную логику фаз боссов. ECS ai-system.ts должен полностью повторять эту логику. Проверить: reaper telegraph + dash, spider web shot + summon, giant jump slam, snake phases (coil → open → vulnerable).

8. **Map transitions** — `enterDungeon`/`exitDungeon` в engine.ts emit события, которые загружают новую карту. ECS map loader должен корректно очищать старый мир и загружать новый.

9. **Сохранение состояния между картами** — `openedChests`, `takenPedestals`, `visitedShrines`, `takenAmbient` — это `Set` в GameStore. ECS map loader уже их использует. Убедиться, что они не теряются при перезагрузке карты.

10. **`ENEMY_STATS`** — определён в `entities.ts` и дублируется в `ecs-bridge.ts`. Использовать единый источник.