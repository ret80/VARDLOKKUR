# Анализ проекта VARDLOKKUR — `analysis_01`

## 1. Обзор проекта

**VARDLOKKUR** — 2D roguelike-action RPG с процедурной генерацией мира, ECS-архитектурой для игровых сущностей и PixiJS-рендерингом. Игрок управляет «Варлоком» в скандинавском сеттинге, сражаясь с врагами, решая квесты и исследуя подземелья.

**Технологический стек:**
- TypeScript (ES2022)
- PixiJS v7 — 2D-рендеринг
- Planck.js — 2D физический движок
- Bitecs — ECS (Entity Component System)
- Web Audio API — процедурный звук
- Vite — сборка

---

## 2. Структура файлов и классов

### 2.1. `src/` — основной код игры

| Файл | Класс / Экспорт | Назначение |
|------|-----------------|------------|
| `src/main.tsx` | — | Точка входа React-приложения |
| `src/App.tsx` | `App` | React-компонент: управление экранами, рендер HUD, диалогов, инвентаря, квестов |
| `src/game/engine.ts` | `Engine` | **Главный оркестратор**: инициализация PixiJS, создание GameStore, систем (quests, dialogue, hud), ECS game loop, игровой цикл (`tick`), загрузка карт, управление состоянием экранов |
| `src/game/types.ts` | `QuestView` | Интерфейс представления квеста в HUD |
| `src/game/utils.ts` | `clamp`, `dist2` | Утилиты: ограничение значений, расстояние в квадрате |
| `src/game/noise.ts` | `mulberry` (функция), `NoiseGenerator` | ГПСЧ Mulberry32 и value noise (fBm) — для генерации мира и тумана |
| `src/game/audio.ts` | `AudioEngine` + `audio` (singleton) | Процедурный WebAudio-движок: ambient-фон, музыка (бурдон + тагельхарпа), звуковые эффекты (swing, hit, kill, clang и др.) |
| `src/game/fx.ts` | `FxManager` | Атмосферные визуальные эффекты: частицы (burst), снег, туман с noise-текстурой, виньетка, руны |
| `src/game/dialogues.ts` | `eirikDialogue`, `astridDialogue`, `haraldDialogue`, `ravenDialogue`, `daughterDialogue`, `sigridDialogue`, `brandDialogue`, `shamanDialogue`, `refugeeDialogue`, `merchantDialogue`, `soulDialogue`, `allDialogues`, `resolveDialogue` | **Декларативные определения диалогов NPC** — массивы веток с condition-функциями. OCP: новый NPC = новый массив, без модификации кода |
| `src/game/drop-handlers.ts` | `DropHandler` (интерфейс), `DropHandlerRegistry`, `HeartHandler`, `ArrowsHandler`, `AxeHandler`, `BowHandler`, `HammerHandler`, `BearHandler`, `HornHandler`, `MeadHandler`, `OreHandler`, `MossHandler`, `AmberHandler`, `FlowerHandler`, `DewHandler`, `DiaryHandler`, `BundleHandler`, `RelicHandler`, `ShardHandler`, `BonesHandler`, `RuneHandler` | **Strategy Pattern** для обработки сбора дропов. OCP: новый дроп = новый handler |
| `src/game/event-bus.ts` | `EventBus` | Event-шина (pub/sub): `on`, `emit`, `off`, `clear`. Связывает все подсистемы |

---

### 2.2. `src/game/store/` — состояние

| Файл | Класс / Экспорт | Назначение |
|------|-----------------|------------|
| `src/game/store/index.ts` | `GameStore`, `GameStoreConfig` | Центральное хранилище состояния: `player`, `flags`, `map`, `ow`, `revealed` квесты, `trackedQuest`. Методы: `setMap`, `setOw`, `setZone`, `setTrackedQuest` |
| `src/game/store/player-domain.ts` | `PlayerDomain`, `IPlayerMutations` | Доменная модель игрока: HP, позиция, таймеры (swingT, hurtT, slowT), урон, лечение. Отделена от ECS-компонентов |
| `src/game/store/flag-domain.ts` | `FlagDomain`, `GameFlags` | Типизированная модель игровых флагов: предметы, улучшения, ресурсы, квесты, убийства, боссы |

---

### 2.3. `src/game/state/` — состояния экрана

| Файл | Класс / Экспорт | Назначение |
|------|-----------------|------------|
| `src/game/state/state-manager.ts` | `StateManager` | Управление экранами (title/play/pause/death/victory/quests/inventory/map), смерть и респавн, эффекты (fade, shake, hitstop, timeScale) |

---

### 2.4. `src/game/input/` — ввод

| Файл | Класс / Экспорт | Назначение |
|------|-----------------|------------|
| `src/game/input/input-system.ts` | `InputAction` (enum), `InputState` (интерфейс), `InputSystem` | Абстрактные действия ввода (pause, inventory, quests, mute, use-heart, toggle-snow). Маппинг клавиатурных кодов → действия. Состояние ввода: позиция джойстика, нажатия кнопок (atk, axe, bow, act) |

---

### 2.5. `src/game/quests/` — квесты

| Файл | Класс / Экспорт | Назначение |
|------|-----------------|------------|
| `src/game/quests/quest-system.ts` | `QuestSystem`, `IQuestProvider` (реализация) | Основная система квестов: сабпрогрессия (main quest), раскрытие квестов, события (убийства, подбор дропов, диалоги), описания квестов, NPC-сигнатуры |
| `src/game/quests/quest-definitions.ts` | `ALL_QUESTS`, `findQuestDef` | Статические определения всех квестов (main + side) |
| `src/game/quests/quest-tracker.ts` | `QuestTracker`, `IQuestTracker` | Трекинг цели квеста: поиск цели на карте, заголовок отслеживаемого квеста |
| `src/game/quests/quest-provider.ts` | `IQuestProvider` (интерфейс), `QuestView` | Интерфейс провайдера квестов |
| `src/game/quests/quest-targets.ts` | — | Определения целей квестов |

---

### 2.6. `src/game/dialogue/` — система диалогов

| Файл | Класс / Экспорт | Назначение |
|------|-----------------|------------|
| `src/game/dialogue/dialogue-system.ts` | `DialogueSystem` | Тонкий диспетчер диалогов: `startDialogue`/`endDialogue`, resolve из declarative definitions, dispatch эффектов по NPC (eirik → вернуть меч, astrid → лечение/бафф и т.д.) |

---

### 2.7. `src/game/hud/` — интерфейс

| Файл | Класс / Экспорт | Назначение |
|------|-----------------|------------|
| `src/game/hud/hud-system.ts` | `HudSystem` | Обновление HUD: HP, руны, оружие, квесты, зона, таймер, смерти. Миникарта. Форматирование времени |

---

### 2.8. `src/game/physics/` — физика

| Файл | Класс / Экспорт | Назначение |
|------|-----------------|------------|
| `src/game/physics/planck-world.ts` | `Cat` (collision categories), `CollidesWith`, `PhysicsCallbacks`, `PlanckWorld` | Обёртка над Planck.js World. Категории коллизий (Player, Enemy, Ghost, Projectile, Tile, Door, Barrier, Drop, Boss). Создание тел (static tile bodies, dynamic entities, kinematic ghosts, projectiles, drops). Callback-система для begin-contact (projectile→enemy, enemy→player, player→drop и т.д.). Sub-stepping (4 шага) |

---

### 2.9. `src/game/map-display.ts` — рендеринг карт

| Файл | Функции / Интерфейсы | Назначение |
|------|---------------------|------------|
| `src/game/map-display.ts` | `buildMinimapBase`, `drawMinimap`, `MinimapOverlays`, `buildBigMapBase`, `drawBigMap`, `BigMapOverlays` | Построение и отрисовка мини-карты и большой карты: базовые ImageData из тайлов, оверлеи (святилища, игрок, цель, секреты, пьедесталы) |

---

### 2.10. `src/game/tiles.ts` — тайлы

| Файл | Классы | Назначение |
|------|--------|------------|
| `src/game/tiles.ts` | `TileTextureCache`, `WallTextureCache`, `HouseSpriteEntry`, `HouseTextureCache` | Кэширование текстур тайлов: стены, дома, генерация текстур из пиксельных данных |

---

### 2.11. `src/game/world.ts` — мир

| Файл | Экспорты | Назначение |
|------|----------|------------|
| `src/game/world.ts` | `T` (размер тайла), `Tl` (enum типов тайлов), `WorldData`, `Vec`, `solidTileAt`, `tileAt`, `zoneFor`, `generateOverworld`, `generateDungeon`, `DUNGEONS` | Типы данных мира, константы, утилиты работы с тайлами, генерация оверворлда и подземелий |

---

### 2.12. `src/game/generators/` — процедурная генерация

| Файл | Экспорты | Назначение |
|------|----------|------------|
| `src/game/generators/index.ts` | Barrel export | Экспорт генераторов |
| `src/game/generators/types.ts` | `EnemyKind`, `DropKind`, `ProjectileKind` | Типы врагов, дропов и снарядов |
| `src/game/generators/utils.ts` | — | Утилиты генерации |
| `src/game/generators/overworld.ts` | `generateOverworld` | Процедурная генерация оверворлда: тайлы, зоны, NPC, святилища, сундуки, дропы, подземелья |
| `src/game/generators/island-generator.ts` | — | Генерация острова (границы мира) |
| `src/game/generators/dungeons.ts` | `generateDungeon` | Процедурная генерация подземелий: комнаты, коридоры, боссы |
| `src/game/generators/village-generator.ts` | — | Генерация деревень |
| `src/game/generators/nav-builder.ts` | — | Построение навигационной сетки |
| `src/game/generators/global-road-generator.ts` | — | Генерация глобальных дорог |
| `src/game/generators/createTestMap.ts` | `createTestMap` | Создание тестовой карты для debug-режима |

---

### 2.13. `src/game/entities.ts` — сущности и рендереры

| Файл | Классы / Интерфейсы | Назначение |
|------|---------------------|------------|
| `src/game/entities.ts` | `Player`, `Enemy`, `Projectile` (типы данных), `ENEMY_STATS`, `IPlayerData`, `IEnemyData`, `INpcData`, `IDropData`, `IProjectileData`, `IChestData`, `IPedestalData`, `IShrineData`, `IDoorData`, `IBarrierData`, `IAltarData`, `IPlayerExtra`, `PlayerRenderer`, `EnemyRenderer`, `NpcRenderer`, `DropRenderer`, `ProjectileRenderer`, `ChestRenderer`, `PedestalRenderer`, `ShrineRenderer`, `DoorRenderer`, `BarrierRenderer`, `AltarRenderer` | **Старая модель сущностей** (до ECS): данные и рендереры для Player, Enemy, Projectile, NPC, Drop, Chest, Pedestal, Shrine, Door, Barrier, Altar |

---

### 2.14. `src/game/ecs/` — ECS-архитектура (Bitecs)

#### 2.14.1. `src/game/ecs/index.ts`
| Экспорт | Назначение |
|---------|------------|
| `createEcsWorld`, `getEcsWorld` | Создание и получение глобального Bitecs World |

#### 2.14.2. `src/game/ecs/ecs-components.ts` — Компоненты

| Компонент | Тип данных | Назначение |
|-----------|-----------|------------|
| `Position` | `x[]`, `y[]` (SoA) | Позиция сущности |
| `Velocity` | `x[]`, `y[]` | Скорость сущности |
| `Health` | `current[]`, `max[]` | Здоровье |
| `Radius` | `value[]` | Радиус хитбокса |
| `Direction` | `x[]`, `y[]` | Направление взгляда |
| `Time` | `value[]` | Глобальный таймер |
| `RenderLayer` | `value[]` | Слой рендеринга |
| `Player` | `moving`, `animT`, `swingT`, `hurtT`, `slowT`, `hasSword`, `runes`, `swingDirX/Y`, `aiming` | Компонент игрока |
| `Enemy` | `kind`, `radius`, `facingX/Y`, `t`, `state`, `aggro`, `hidden`, `lungeT`, `freezeT`, `flashT`, `seed`, `speed`, `dmg`, `stateT`, `pathI`, `repathT`, `contactCd`, `guardOf`, `fade`, `dropDew` | Компонент врага |
| `EnemyAI` | `path[]` | ИИ-данные врага |
| `EnemyState` | enum | Состояния AI: idle, chase, wind, swing, stuck, enter, hover, dive, charge, cool, open, closed, appear, dissipate |
| `Projectile` | `kind`, `dmg`, `life`, `dist`, `returning`, `spin` | Компонент снаряда |
| `Drop` | `kind`, `t`, `magnet`, `life` | Компонент дропа |
| `NPC` | `id`, `name` | Компонент NPC |
| `Chest` | `item`, `opened` | Компонент сундука |
| `Pedestal` | `id`, `taken`, `guardsLeft`, `guardsSpawned` | Компонент пьедестала |
| `Shrine` | `lit` | Компонент святилища |
| `Door` | `open`, `locked` | Компонент двери |
| `Barrier` | `active` | Компонент барьера |
| `Altar` | `runes` | Компонент алтаря |
| `Sprite` | `ref[]` | Ссылка на PixiJS спрайт |
| `PhysicsBody` | `body[]` | Ссылка на Planck.js тело |
| `Dead`, `Hidden`, `Flashing`, `Magnet`, `Taken`, `Attacking`, `Aiming`, `Frozen`, `Slowed`, `Returning`, `ShrineLit`, `Moving` | — | Флаг-компоненты |
| `SpriteRegistry`, `PhysicsBodyRegistry`, `EnemyAIRegistry` | Массивы | Registry-массивы для PixiJS объектов и тел |
| `StringPool` | `enemyKinds`, `dropKinds`, `projectileKinds`, `npcIds`, `npcNames`, `chestItems`, `pedestalIds` | Строковые пулы (SOA оптимизация) |
| `poolAdd`, `poolGet`, `setSoA`, `getSoA`, `getEnemyStateName` | Функции | Утилиты работы с пулами и SOA |

#### 2.14.3. `src/game/ecs/ecs-utils.ts` — Утилиты ECS

| Функция | Назначение |
|---------|------------|
| `createEntity` | Создать сущность с Position + Radius + RenderLayer |
| `createMovableEntity` | Создать сущность с Velocity |
| `createLivingEntity` | Создать сущность с Health |
| `createPlayerEntity` | Создать игрока (HP=12, все Player-поля) |
| `createEnemyEntity` | Создать врага (HP, radius, speed, dmg, AI) |
| `createProjectileEntity` | Создать снаряд |
| `createDropEntity` | Создать дроп |
| `isAlive` | Проверка здоровья |
| `distBetween`, `distSqBetween` | Расстояние между сущностями |
| `setPosition`, `setVelocity` | Установка значений |
| `damageEntity`, `healEntity` | Урон/лечение |
| `getAliveCount` | Количество живых сущностей |

#### 2.14.4. `src/game/ecs/ecs-relations.ts` — Relations

| Relation | Назначение |
|----------|------------|
| `ChildOf` | Иерархия (родитель → дети) |
| `Targeting` | Враг целится в сущность (exclusive) |
| `Targeted` | Сущность имеет цель |
| `Contains` | Контейнер содержит предмет |
| `Removing` | Сущность в процессе удаления |

#### 2.14.5. `src/game/ecs/ecs-bridge.ts` — Мост ECS ↔ старому коду

| Функция | Назначение |
|---------|------------|
| `createPlayerInEcs` | Создать игрока в ECS (Position, Health, Player, Sprite) |
| `createEnemyInEcs` | Создать врага в ECS (с Planck.js телом) |
| `createNpcInEcs` | Создать NPC в ECS |
| `createChestInEcs` | Создать сундук в ECS |
| `createPedestalInEcs` | Создать пьедестал в ECS |
| `createShrineInEcs` | Создать святилище в ECS |
| `createDoorInEcs` | Создать дверь в ECS |
| `createBarrierInEcs` | Создать барьер в ECS |
| `createAltarInEcs` | Создать алтарь в ECS |
| `createProjectileInEcs` | Создать снаряд в ECS |
| `createDropInEcs` | Создать дроп в ECS |

#### 2.14.6. `src/game/ecs/ecs-game-loop.ts` — Игровой цикл

| Элемент | Назначение |
|---------|------------|
| `EcsGameLoopConfig` | Конфигурация game loop (world, bus, store, planckWorld, app, containers, input, state и т.д.) |
| `EcsGameLoop` (интерфейс) | `tick`, `render`, `realT`, `setPlayerEid`, `getPlayerEid`, `isDungeonBossDead`, `getDropsForTransition`, `setPlanckWorld` |
| `createEcsGameLoop` | Создание game loop: 17 шагов за кадр (ввод → движение → физика → AI → снаряды → дропы → туман → двери/зоны/боссы → проверка смерти) |

#### 2.14.7. `src/game/ecs/ecs-map-loader.ts` — Загрузка карт

| Функция/Класс | Назначение |
|---------------|------------|
| `EcsMapLoader` | Загрузка карты в ECS: создание физ. тел тайлов, спавн сущностей (игрок, враги, NPC, дропы, объекты окружения), синхронизация с PlanckWorld |

#### 2.14.8. `src/game/ecs/ecs-render-helpers.ts` — Хелперы рендеринга

| Функция | Назначение |
|---------|------------|
| `drawPlayer`, `drawEnemy`, `drawNpc`, `drawDrop`, `drawProjectile`, `drawChest`, `drawPedestal`, `drawShrine`, `drawDoor`, `drawBarrier`, `drawAltar` | Рисование ECS-сущностей на PixiJS Graphics, конвертация ECS-компонентов в данные рендереров из `entities.ts` |

---

### 2.15. `src/game/ecs/ecs-systems/` — ECS-системы

#### 2.15.1. `movement-system.ts`

| Функция | Назначение |
|---------|------------|
| `movementSystem` | Базовое движение: `Position += Velocity * dt` |
| `directionFromVelocitySystem` | Обновление направления из скорости |
| `timerSystem` | Инкремент глобального таймера |
| `playerMovementSystem` | Движение игрока по input (скорость, замедление) |
| `kinematicMovementSystem` | Кинематическое движение (призраки) |

#### 2.15.2. `physics-system.ts`

| Функция | Назначение |
|---------|------------|
| `PhysicsCallbacks` (интерфейс) | Callback-интерфейс для коллизий |
| `syncPositionToBody` | Sync Position → Planck.js body |
| `syncVelocityToBody` | Sync Velocity → Planck.js body |
| `syncBodyToPosition` | Sync Planck.js body → Position |
| `createBodyForEntity` | Создание физического тела для сущности |
| `destroyBodyForEntity` | Удаление физического тела |
| `circlesOverlap` | Проверка пересечения кругов |
| `checkEntityOverlap`, `findOverlappingEntities` | Поиск перекрывающихся сущностей |
| `hasLineOfSight` | Проверка линии видимости (raycast) |

#### 2.15.3. `combat-system.ts`

| Функция | Назначение |
|---------|------------|
| `swordAttackSystem` | Атака мечом (range, angle, shield check, snake/ghost special) |
| `axeThrowSystem` | Бросок секиры-бумеранга |
| `arrowShootSystem` | Выстрел из лука |
| `projectileUpdateSystem` | Обновление снарядов (lifetime, return logic) |
| `projectileEnemyCollisionSystem` | Коллизии снарядов с врагами |
| `damageEnemy`, `damagePlayer` | Нанесение урона |
| `applyKnockback` | Отталкивание через Planck.js impulse |
| `canProjectileHitEnemy` | Проверка, может ли снаряд попасть (ghost immunity, draugr shield, snake phases) |
| `updateAxeReturn` | Возврат секиры к игроку |
| `killEnemy` | Убийство врага + спавн дропов |
| `hitEnemy` | Урон + flash + knockback + freeze |
| `damageSnake` | Специальная логика урона змею |
| `damagePlayerEcs` | Урон игроку (через PlayerDomain) |
| `fireProjectileEcs` | Создание снаряда |
| `updateProjectilesEcs` | Полная логика снарядов (legacy port) |

#### 2.15.4. `ai-system.ts`

| Функция | Назначение |
|---------|------------|
| `aiUpdateSystem` | Обновление AI всех врагов (detection, aggro, behavior switch) |
| `updateDraugr`, `updateVarg`, `updateRaven`, `updateShroom`, `updateCrawler`, `updateFrost`, `updateGhost` | Поведения обычных врагов |
| `updateReaper`, `updateSpider`, `updateGiant`, `updateSnake` | Поведения боссов (state machines: enter → chase → wind → swing → stuck) |

#### 2.15.5. `life-system.ts`

| Функция | Назначение |
|---------|------------|
| `lifeCheckSystem` | Проверка HP → пометка мёртвых (Dead компонент) |
| `deathCleanupSystem` | Удаление мёртвых сущностей |
| `stateTimerSystem` | Обновление таймеров состояний (hurtT, slowT, flashT, freezeT и т.д.) |
| `magnetSystem` | Магнитное притяжение дропов к игроку |
| `returningProjectileSystem` | Возвращающиеся снаряды (бумеранг) |

#### 2.15.6. `drops-system.ts`

| Функция | Назначение |
|---------|------------|
| `DropsState`, `DropRt` | Состояние системы дропов |
| `spawnDrop`, `dropsUpdateSystem` | Создание и обновление дропов (ECS) |
| `spawnDropLegacy`, `updateDropsLegacy`, `spawnWorldDropsLegacy` | Legacy runtime дропов |
| `rollDropsForEnemy` | Ролл дропов со смерти врага |
| `spawnWorldDrops` | Спавн мировых дропов из map data |

#### 2.15.7. `fog-system.ts`

| Функция | Назначение |
|---------|------------|
| `FogState` | Состояние тумана |
| `fogUpdateSystem` | Обновление тумана: таймеры, волны, спавн призраков, зоны |
| `spawnFogGhost` | Спавн призрака тумана |
| `createFogState`, `updateFogLegacy`, `fogHolesLegacy` | Legacy API |

#### 2.15.8. `interaction-system.ts`

| Функция | Назначение |
|---------|------------|
| `tryInteract` | Поиск ближайшего интерактивного объекта (NPC, chest, pedestal, shrine, altar, stairs) |
| `openChestEcs` | Открытие сундука |
| `takePedestalEcs` | Взятие предмета с пьедестала |
| `useShrineEcs` | Использование святилища (лечение) |
| `atoneEcs` | Искупление у старого алтаря |
| `enterDungeonOrExitEcs` | Вход в подземелье / выход |
| `onEnemyKilledEcs` | Обработка убийства врага-стража |

#### 2.15.9. `render-system.ts`

| Функция | Назначение |
|---------|------------|
| `registerSprite` | Регистрация спрайта в registry |
| `updateSpritePosition` | Обновление позиции одного спрайта |
| `renderSprites` | Обновление всех позиций спрайтов |
| `renderVisibilitySystem` | Обновление видимости (Dead → alpha=0, Hidden → alpha=0.25) |
| `renderFlashSystem` | Мигание при получении урона |
| `renderPlayer`, `renderEnemies`, `renderProjectiles`, `renderDrops`, `renderNPCs`, `renderChests`, `renderPedestals`, `renderShrines`, `renderDoors`, `renderBarrier`, `renderAltar` | Рендеринг каждого типа сущности |
| `addFloatText`, `updateFloatTexts` | Плавающий текст (урон, лечение) |
| `renderSystem` | Главный цикл рендеринга |

#### 2.15.10. `world-system.ts`

| Функция | Назначение |
|---------|------------|
| `updateDoors` | Обновление дверей (открытие/закрытие) |
| `updateZone` | Обновление текущей зоны игрока |
| `checkDungeonBoss` | Проверка босса подземелья |

#### 2.15.11. `init-system.ts` — Префабы

| Функция | Назначение |
|---------|------------|
| `initPrefabs` | Инициализация всех префабов (игрок, враги всех типов, снаряды, дропы, NPC, сундуки, пьедесталы, святилища, двери, барьеры, алтари) |
| `getPlayerPrefab`, `getEnemyPrefab` | Получение префабов |

---

## 3. Диаграммы взаимодействий

### 3.1. Общая диаграмма архитектуры

```
┌─────────────────────────────────────────────────────────────────┐
│                         App.tsx (React)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  HUD     │ │ Dialogue │ │ Quests   │ │ Inventory│          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└────────────────────────────┬────────────────────────────────────┘
                             │ EngineCallbacks
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Engine (Оркестратор)                     │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────────────┐   │
│  │ EventBus │  │ GameStore   │  │ EcsGameLoop              │   │
│  │ (pub/sub)│  │ (flags,     │  │  ┌────────────────────┐  │   │
│  └─────┬────┘  │  player,    │  │  │ tick(rdt)          │  │   │
│        │       │  map, ow)   │  │  │ ┌────────────────┐ │  │   │
│        ▼       └──────┬──────┘  │  │ │ 1. Input       │ │  │   │
│  ┌────────────────────┼────────┘  │ │ 2. Player move │ │  │   │
│  │ emit / on          │          │  │ 3. Actions     │ │  │   │
│  │                    │          │  │ 4. Bow update  │ │  │   │
│  ▼                    │          │  │ 5. Physics sync│ │  │   │
│ ┌─────────────────────▼──────┐    │  │ 6. Planck step │ │  │   │
│ │ QuestSystem                 │    │  │ 7. Body→Pos    │ │  │   │
│ │ DialogueSystem              │    │  │ 8. Non-physics │ │  │   │
│ │ HudSystem                   │    │  │ 9. Direction   │ │  │   │
│ │ StateManager                │    │  │10. Store sync  │ │  │   │
│ │ InputSystem                 │    │  │11. State timers│ │  │   │
│ │ FxManager                   │    │  │12. AI enemies  │ │  │   │
│ │ AudioEngine                 │    │  │13. Projectiles │ │  │   │
│ └────────────────────────────┘    │  │14. Drops       │ │  │   │
│                                   │  │15. Fog system  │ │  │   │
│                                   │  │16. Doors/Zones │ │  │   │
│                                   │  │17. Life/Death  │ │  │   │
│                                   │  └────────────────┘ │  │   │
│                                   │  └────────────────┘ │  │   │
│                                   │  │ render(rdt)      │ │  │   │
│                                   │  │ ECS render sys   │ │  │   │
│                                   │  └────────────────┘ │  │   │
│                                   └────────────────────┘   │   │
│  ┌──────────────────────────────────────────────────────────┐ │   │
│  │ PlanckWorld (2D Physics)                                 │ │   │
│  │  ┌────────────────────────────────────────────────────┐  │ │   │
│  │  │ Collision Categories: Player, Enemy, Ghost, Proj,  │  │ │   │
│  │  │ Tile, Door, Barrier, Drop, Boss                    │  │ │   │
│  │  │ begin-contact callbacks → bus.emit(...)            │  │ │   │
│  │  └────────────────────────────────────────────────────┘  │ │   │
│  └──────────────────────────────────────────────────────────┘ │   │
│  ┌──────────────────────────────────────────────────────────┐ │   │
│  │ PixiJS Application                                       │ │   │
│  │  Stage                                                    │ │   │
│  │   ├─ tileLayer (ground, walls, houses)                   │ │   │
│  │   ├─ world                                                │ │   │
│  │   │   ├─ dynamic (entities: player, enemies, NPCs...)    │ │   │
│  │   │   ├─ fxWorld (particles)                             │ │   │
│  │   │   └─ floatLayer (damage numbers)                     │ │   │
│  │   ├─ fxScreen (snow)                                     │ │   │
│  │   ├─ vignette                                            │ │   │
│  │   └─ fogVignette                                         │ │   │
│  └──────────────────────────────────────────────────────────┘ │   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2. ECS-диаграмма

```
┌──────────────────────────────────────────────────────────────┐
│                    ECS World (Bitecs)                        │
│                                                              │
│  Entities (eids):                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Player   │ │ Enemy    │ │ NPC      │ │ Drop           │   │
│  │ (eid:1)  │ │ (eid:2-9)│ │ (eid:10) │ │ (eid:10+)      │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬──────┘   │
│       │            │            │                │           │
│       ▼            ▼            ▼                ▼           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Components (SoA arrays)                 │   │
│  │                                                      │   │
│  │  Position[1..N]  Velocity[1..N]  Health[1..N]        │   │
│  │  Enemy[1..N]     Projectile[1..N]  Sprite[1..N]      │   │
│  │  PhysicsBody[1..N]  NPC[1..N]  Chest[1..N]           │   │
│  │  ... и 30+ других компонентов                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ECS Systems (query + process)           │   │
│  │                                                      │   │
│  │  movementSystem      → query([Position, Velocity])   │   │
│  │  aiUpdateSystem      → query([Enemy, Position,       │   │
│  │                         Velocity, Health])            │   │
│  │  combatSystem        → sword/axe/arrow attacks       │   │
│  │  renderSystem        → query([Sprite, Player])       │   │
│  │  dropsSystem         → query([Position, Drop])       │   │
│  │  lifeSystem          → query([Health])               │   │
│  │  interactionSystem   → tryInteract (nearest obj)     │   │
│  │  fogSystem           → fogUpdateSystem               │   │
│  │  physicsSystem       → sync ECS ↔ Planck.js          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Relations (bitECS):                                         │
│  ChildOf │ Targeting │ Targeted │ Contains                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.3. Диаграмма взаимодействия систем (sequence)

```
App.tsx          Engine            EventBus           GameStore       EcsGameLoop
   │                │                  │                  │               │
   │  startGame()   │                  │                  │               │
   ├───────────────►│                  │                  │               │
   │                │  generateOverworld()                 │               │
   │                ├─────────────────────────────────────►│               │
   │                │  setOw()                               │               │
   │                │  setMap()                                │               │
   │                │                                            │               │
   │                │  tick(rdt)                                 │               │
   │                │                                            ├────────────►│
   │                │                                            │  tick():    │
   │                │                                            │  1. input    │
   │                │  onHud(data) ◄───────────────────────────┤  2. move     │
   │  pushHudData  │◄─────────────────────────────────────────┤  3. actions  │
   │                │                  │                        │  4. physics  │
   │                │                  │  player:died ────────►│  5. AI       │
   │                │                  │                        │  6. combat   │
   │                │                  │  enemy:killed ────────►│  7. drops    │
   │                │                  │                        │  8. fog      │
   │                │                  │  hud:dirty ───────────►│  9. life     │
   │                │                  │                        │ 10. render   │
   │                │                  │                        ├────────────►│
   │                │                  │                        │  render()    │
   │                │                  │                        │  PixiJS      │
```

### 3.4. Диаграмма событий (Event Bus)

```
EventBus (pub/sub шина)
│
├── input:pause          ──► Engine.togglePause()
├── input:inventory      ──► Engine.openInventory()
├── input:quests         ──► Engine.openQuests()
├── input:mute           ──► Audio.toggleMute()
├── input:use-heart      ──► Engine.useStoredHeart()
├── input:toggle-snow    ──► Engine.toggleRoofSnow()
│
├── player:died          ──► StateManager.onPlayerDied()
├── player:damaged       ──► PlayerDomain.takeDamage()
├── player:healed        ──► (FX)
├── player:heartUsed     ──► (FX)
├── player:respawned     ──► (reset state)
│
├── enemy:killed         ──► QuestSystem.onEnemyKilled()
├── entity:died          ──► LifeSystem
│
├── drop:collected       ──► QuestSystem.onDropCollected()
├── drop:spawn           ──► DropsSystem
│
├── dialogue:start       ──► DialogueSystem.startDialogue()
├── dialogue:end         ──► DialogueSystem → effects
│
├── hud:dirty            ──► HudSystem.pushHud()
├── toast                ──► StateManager.toast()
│
├── quest:reveal         ──► QuestSystem.revealQuest()
│
├── engine:enter-dungeon ──► Engine.enterDungeon()
├── engine:exit-dungeon  ──► Engine.exitDungeon()
│
├── screen:change        ──► App.tsx (screen state)
│
├── fx:burst             ──► FxManager.burst()
├── fog:waveEnd          ──► QuestSystem
├── fog:ghostDissipate   ──► (cleanup ghosts)
├── pedestal:unsealed    ──► QuestSystem
├── pedestal:guardKilled ──► (toast)
└── boss:killed          ──► QuestSystem
```

---

## 4. Что относится к ECS, а что нет

### 4.1. ✅ ОТНОСИТСЯ К ECS

| Компонент/Файл | Статус |
|----------------|--------|
| `ecs/ecs-components.ts` | **ECS компоненты** — все SoA-массивы (Position, Velocity, Health, Enemy, Player, Projectile, Drop, NPC, Chest, Pedestal, Shrine, Door, Barrier, Altar, Sprite, PhysicsBody, Dead, Flashing и т.д.) |
| `ecs/ecs-world.ts` | **ECS World** — создание Bitecs World |
| `ecs/ecs-utils.ts` | **ECS утилиты** — создание сущностей, query helpers |
| `ecs/ecs-relations.ts` | **ECS Relations** — ChildOf, Targeting, Targeted, Contains |
| `ecs/ecs-bridge.ts` | **ECS Bridge** — функции создания ECS-сущностей из map data |
| `ecs/ecs-game-loop.ts` | **ECS Game Loop** — 17-шаговый игровой цикл |
| `ecs/ecs-map-loader.ts` | **ECS Map Loader** — загрузка карты в ECS |
| `ecs/ecs-render-helpers.ts` | **ECS Render Helpers** — конвертация компонентов → рендер |
| `ecs/ecs-systems/index.ts` | Экспорт всех ECS-систем |
| `ecs/ecs-systems/movement-system.ts` | **ECS система** — движение, таймеры, направление |
| `ecs/ecs-systems/physics-system.ts` | **ECS система** — синхронизация с Planck.js, collision detection |
| `ecs/ecs-systems/combat-system.ts` | **ECS система** — меч, секира, лук, снаряды, урон |
| `ecs/ecs-systems/ai-system.ts` | **ECS система** — AI всех врагов (12 типов поведения) |
| `ecs/ecs-systems/life-system.ts` | **ECS система** — здоровье, смерть, магнит, возвращающиеся снаряды |
| `ecs/ecs-systems/drops-system.ts` | **ECS система** — создание, обновление, колLECT дропов |
| `ecs/ecs-systems/fog-system.ts` | **ECS система** — туман, волны, спавн призраков |
| `ecs/ecs-systems/interaction-system.ts` | **ECS система** — взаимодействие с объектами |
| `ecs/ecs-systems/render-system.ts` | **ECS система** — рендеринг всех типов сущностей |
| `ecs/ecs-systems/world-system.ts` | **ECS система** — двери, зоны, боссы |
| `ecs/ecs-systems/init-system.ts` | **ECS префабы** — шаблоны всех сущностей |

### 4.2. ❌ НЕ ОТНОСИТСЯ К ECS

| Компонент/Файл | Статус |
|----------------|--------|
| `engine.ts` / `Engine` | **НЕ ECS** — оркестратор: управляет ECS, но сам не является ECS-системой. Создает GameStore, системы, game loop, загружает карты |
| `store/game-store.ts` / `GameStore` | **НЕ ECS** — центральное хранилище состояния (flags, player, map) |
| `store/player-domain.ts` / `PlayerDomain` | **НЕ ECS** — доменная модель игрока (HP, timers, damage, heal) |
| `store/flag-domain.ts` / `FlagDomain`, `GameFlags` | **НЕ ECS** — типизированная модель флагов |
| `state/state-manager.ts` / `StateManager` | **НЕ ECS** — управление экранами, смерть, эффекты |
| `input/input-system.ts` / `InputSystem` | **НЕ ECS** — клавиатурный ввод (маппинг клавиш → абстрактные действия) |
| `audio.ts` / `AudioEngine` | **НЕ ECS** — WebAudio синтезатор |
| `fx.ts` / `FxManager` | **НЕ ECS** — визуальные эффекты (частицы, снег, туман, виньетка) |
| `dialogues.ts` | **НЕ ECS** — декларативные определения диалогов NPC |
| `dialogue/dialogue-system.ts` / `DialogueSystem` | **НЕ ECS** — диспетчер диалогов и эффектов |
| `hud/hud-system.ts` / `HudSystem` | **НЕ ECS** — обновление HUD UI |
| `quests/quest-system.ts` / `QuestSystem` | **НЕ ECS** — сабпрогрессия, раскрытие квестов |
| `quests/quest-definitions.ts` | **НЕ ECS** — статические определения квестов |
| `quests/quest-tracker.ts` / `QuestTracker` | **НЕ ECS** — трекинг цели квеста |
| `quests/quest-provider.ts` | **НЕ ECS** — интерфейс провайдера квестов |
| `quests/quest-targets.ts` | **НЕ ECS** — определения целей квестов |
| `physics/planck-world.ts` / `PlanckWorld` | **НЕ ECS** — обёртка над Planck.js (физический движок). Интегрируется с ECS через `PhysicsBody` компонент и `syncBodyToPosition` |
| `drop-handlers.ts` | **НЕ ECS** — Strategy Pattern для обработки дропов. Используется ECS drops-system |
| `world.ts` | **НЕ ECS** — типы мира, генерация оверворлда/подземелий, тайлы |
| `generators/*.ts` | **НЕ ECS** — процедурная генерация мира |
| `entities.ts` | **НЕ ECS** — старая модель сущностей + рендереры (используется как данные для ECS render helpers) |
| `tiles.ts` | **НЕ ECS** — кэширование текстур тайлов |
| `map-display.ts` | **НЕ ECS** — рендеринг мини-карты и большой карты |
| `noise.ts` | **НЕ ECS** — ГПСЧ и value noise |
| `utils.ts` | **НЕ ECS** — утилиты (clamp, dist2) |
| `event-bus.ts` / `EventBus` | **НЕ ECS** — event-шина (связующее звено между ECS и не-ECS системами) |
| `types.ts` | **НЕ ECS** — типы (QuestView) |
| `App.tsx` | **НЕ ECS** — React-компонент UI |
| `main.tsx` | **НЕ ECS** — точка входа |

### 4.3. Гибридные (ECS + не-ECS)

| Компонент | Статус |
|-----------|--------|
| `PlanckWorld` | **Гибрид**: не ECS, но тесно интегрирован. ECS-сущности с компонентом `PhysicsBody` синхронизируются с Planck.js телами через `syncPositionToBody`/`syncVelocityToBody`/`syncBodyToPosition` в каждом кадре |
| `GameStore` | **Гибрид**: хранит состояние, к которому обращаются ECS-системы через callbacks |
| `EventBus` | **Гибрид**: не ECS, но ECS-системы emit события (например, `enemy:killed`, `drop:collected`), которые слушаются не-ECS системами |

---

## 5. Краткое резюме

Проект **VARDLOKKUR** использует **гибридную архитектуру**:

1. **ECS-слой** (`src/game/ecs/`): все игровые сущности (игрок, враги, NPC, дропы, снаряды, объекты окружения) представлены как сущности Bitecs с наборами компонентов. 10+ ECS-систем обрабатывают движение, физику, бой, AI, рендеринг, взаимодействие.

2. **Не-ECS слой**: Engine (оркестратор), GameStore (состояние), система квестов, диалогов, HUD, ввод, звук, эффекты, генерация мира, Planck.js физика — всё реализовано классически, через OOP-классы.

3. **Мост**: `EventBus` связывает ECS и не-ECS слои. ECS emit события, не-ECS системы их слушают. `EcsMapLoader` загружает данные из не-ECS мира (world.ts) в ECS. `Engine` координирует всё вместе.
