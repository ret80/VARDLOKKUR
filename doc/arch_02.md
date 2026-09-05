
Теперь у меня есть полная картина. Вот подробное описание архитектуры.

---

## VARDLOKKUR — «Скандинавский Кошмар Ветра»

Игра в жанре action-adventure с видом сверху-down, вдохновлённая скандинавской мифологией и классическими Zeldalike-играми. Проект построен на **React + TypeScript + PixiJS**, с ECS-архитектурой на базе **bitECS**, физикой на **Planck.js** и процедурной генерацией мира.

---

## Общая архитектура

Проект разделён на три основных слоя:

1. **UI-слой (React)** — `App.tsx`, отвечает за отрисовку HUD, экранов меню, инвентаря, журнала квестов и связывается с движком через колбэки.
2. **Слой движка (`Engine`)** — оркестратор: создаёт PixiJS-приложение, ECS-мир, физический мир, загружает карты, управляет игровым циклом и камерой.
3. **Слой игровых систем** — ECS-системы, квесты, диалоги, генерация мира, аудио, визуальные эффекты — всё общается через **EventBus** и **GameStore**.

Паттерны, используемые в проекте: **ECS** (Entity-Component-System), **Event Bus** (pub/sub), **Domain-Driven Design** (инкапсуляция состояния в доменах), **Strategy** (обработчики дропов, резолверы целей квестов), **Dependency Injection** (системы получают зависимости через конфигурацию).

---

## Карта классов и модулей

### Точка входа

#### `src/main.tsx`
Минимальный entry point: монтирует React-приложение в DOM.

#### `src/App.tsx`
Главный React-компонент. Управляет всем UI-слоем:
- Создаёт экземпляр `Engine` и передаёт ему колбэки (`onHud`, `onScreen`, `onDialogue`, `onToast`, `onStats`).
- Отрисовывает HUD (здоровье, оружие, руны, стрелы, зона, цель квеста, миникарта, часы).
- Управляет оверлеями: пауза, смерть, победа, помощь, журнал квестов, инвентарь, большая карта.
- Содержит SVG-иконки оружия (SwordIco, AxeIco, BowIco, HammerIco) и пиксельную графику интерфейса в скандинавском стиле.
- Принимает ввод от виртуального джойстика для мобильных устройств.

---

### Ядро движка

#### `Engine` (`src/game/engine.ts`)
Центральный оркестратор. Создаёт и связывает все подсистемы:
- Инициализирует PixiJS `Application`, слои сцены (`tileLayer`, `world`, `dynamic`, `fxWorld`, `floatLayer`).
- Создаёт `EventBus`, `GameStore`, `PlayerDomain`, `InputSystem`, `StateManager`.
- Создаёт ECS-мир через `createEcsWorld()`, инициализирует префабы, настраивает `EcsGameLoop` и `EcsMapLoader`.
- Создаёт `PlanckWorld` для физики.
- Создаёт `QuestSystem`, `DialogueSystem`, `HudSystem`.
- Управляет жизненным циклом: старт игры, загрузка карты, переход в данж, смерть/респавн, победа.
- Отрисовка тайлов, миникарты, обработка камеры, проигрыш шагов аудио.

Ключевые поля:
- `bus: EventBus` — шина событий
- `store: GameStore` — хранилище состояния
- `input: InputSystem` — система ввода
- `state: StateManager` — менеджер экранов и эффектов
- `ecsWorld`, `ecsGameLoop`, `ecsMapLoader` — ECS-интеграция
- `ow: WorldData` — данные overworld
- `dungeons: WorldData[]` — данные подземелий
- `fx: FxManager` — визуальные эффекты

#### `models.ts` (`src/game/models.ts`)
Центральный модуль типов. Разрывает циклические зависимости между `engine.ts` и подсистемами. Содержит определения:
- `Screen` — перечисление экранов (title, play, pause, death, victory, quests, inventory, map).
- `HudData`, `Stats`, `DialogueData`, `VirtualInput` — интерфейсы данных для UI.
- `EngineCallbacks` — колбэки движка → React.
- `EngineServices` — сервисы движка для `GameStore` (spawnEnemy, loadMap, setScreen, fadeTo, toast).
- `GameStoreConfig`, `GameStoreState` — конфигурация и состояние хранилища.
- `EcsWorld` — типизированный ECS-мир bitECS.
- Рантайм-интерфейсы сущностей: `ChestRt`, `PedestalRt`, `ShrineRt`, `NpcRt`, `DoorRt`, `BarrierRt`, `AltarRt`, `ProjectileRt`, `DropRt`.

#### `types.ts` (`src/game/types.ts`)
Минимальный модуль с интерфейсом `QuestView` — представление квеста в HUD.

#### `utils.ts` (`src/game/utils.ts`)
Утилиты: `clamp`, `dist2` (квадрат расстояния), `px` (преобразование тайла в пиксели), `lerp`.

---

### Событийная шина

#### `EventBus` (`src/game/event-bus.ts`)
Типизированная шина событий (pub/sub). Все игровые события проходят через неё:
- **Бой**: `enemy:killed`, `enemy:hit`, `player:damaged`, `player:died`, `player:respawned`, `player:healed`, `player:heartUsed`.
- **Квесты**: `quest:reveal`, `quest:progress`, `quest:completed`.
- **Предметы**: `drop:spawn`, `drop:collected`, `drop:spawned`.
- **Диалоги**: `dialogue:start`, `dialogue:end`.
- **Туман**: `fog:waveStart`, `fog:waveEnd`, `fog:ghostSpawn`, `fog:ghostDissipate`.
- **Боссы**: `boss:spawned`, `boss:killed`, `snake:death`.
- **Пьедесталы**: `pedestal:guardKilled`, `pedestal:unsealed`.
- **Снаряды**: `projectile:fire`, `projectile:spawned`.
- **Ввод**: `input:pause`, `input:inventory`, `input:quests`, `input:mute`, `input:use-heart`, `input:toggle-snow`, `input:close-overlay`.
- **FX**: `fx:burst`.
- **UI**: `hud:dirty`, `hud:float`, `screen:change`, `toast`.
- **Движок**: `engine:enter-dungeon`, `engine:exit-dungeon`, `boss:start-dungeon`.

Методы: `on(event, fn)` — подписка с возвратом функции отписки, `emit(event, payload)` — испускание, `clear()` — очистка.

---

### Хранилище состояния (Store)

#### `GameStore` (`src/game/store/game-store.ts`)
Инкапсулированное хранилище игрового состояния. Заменяет мутабельный shared-объект на управляемое хранилище с контролируемым доступом:
- Хранит `GameStoreState`: флаги, игрок, карты, экран, время игры, отслеживаемый квест, посещённые святилища, открытые сундуки, взятые пьедесталы и т.д.
- Предоставляет доступ через геттеры: `flags`, `player`, `map`, `ow`, `screen`, `zone`, `revealed`, `trackedQuest`, `visitedShrines`, `ecsWorld` и др.
- Методы-мутаторы: `setTrackedQuest`, `setLastMain`, `setScreen`, `loadMap`, `enterDungeon`, `exitDungeon`.
- Конфигурируется через `GameStoreConfig` (флаги, сервисы, колбэки, игрок, домены, миры Planck и ECS).

#### `FlagDomain` (`src/game/store/flag-domain.ts`)
Типизированная модель всех игровых флагов (`GameFlags`). Содержит ~50 полей: наличие оружия (меч, секира, лук, молот, ключ), улучшения (swordUp, axeUp, furyRune), квестовые предметы (bear, horn, mead, ore, moss, amber, flower, diary, bundle, relic), состояние боссов (reaperDead, spiderDead, giantDead, snakeDead), ресурсы (arrows, runes, hearts, dew), статистика (kills, deaths, fogWaves).
Методы: `hasItem`, `hasEnhancement`, `hasQuestItem`, `isQuestDone`, `isBossDead`, `getArrows`, `getRunes`, `getHearts`, `incrementKill`, `incrementFlag`, `getKillCount`, `getTotalKills`.

#### `PlayerDomain` (`src/game/store/player-domain.ts`)
Инкапсулированная модель игрока. Реализует интерфейсы `IPlayerDomain` (чтение) и `IPlayerMutations` (изменение):
- Хранит: hp, maxHp, позицию, скорость, направление, радиус, таймеры (swingT, hurtT, slowT).
- Методы: `takeDamage`, `heal`, `fullHeal`, `useHeart`, `resetTimers`, `setPosition`, `setVelocity`, `setDirection`, `increaseMaxHp`.
- Поддерживает события через `PlayerEvents` (onDamaged, onDied, onHealed, onHeartUsed).

---

### Системы движка (модули `engine/`)

#### `SceneManager` (`src/game/engine/scene-manager.ts`)
Управление слоями сцены PixiJS: `tileLayer`, `world`, `dynamic`, `fxWorld`, `floatLayer`, `fxScreen`, `fadeG`. Методы: `attachToStage`, `clearTiles`, `clearDynamic`, `clearFloatLayer`, `destroy`.

#### `ViewportController` (`src/game/engine/viewport-controller.ts`)
Управление размерами viewport и камерой. Адаптирует разрешение под размер контейнера с учётом аспекта и зума (1.18). Методы: `applyViewSize`, `apply`, `clampCamera`.

#### `MapLoaderService` (`src/game/engine/map-loader-service.ts`)
Загрузка карт: создание текстур тайлов через `buildAllTileTextures`, инициализация ECS-мира, создание `EcsMapLoader`, загрузка сущностей карты, обновление game loop.

#### `PlayerLifecycle` (`src/game/engine/player-lifecycle.ts`)
Управление респавном и использованием сердца. Методы: `useStoredHeart` (съесть сердце из сумы для лечения), `respawn` (возврат к последнему святилищу после смерти).

#### `ScreenRouter` (`src/game/engine/screen-router.ts`)
Маршрутизация экранов: пауза, инвентарь, квесты, карта, снег на крышах, отслеживание квеста. Обрабатывает абстрактные действия ввода и переключает экраны через `StateManager`.

---

### ECS-архитектура (bitECS)

#### `ecs-world.ts` (`src/game/ecs/ecs-world.ts`)
Создание и управление ECS-миром bitECS. Содержит контекст `WorldContext` с таймингом (delta, elapsed). Функции: `createEcsWorld`, `getEcsWorld`, `updateWorldTime`, `resetWorldTime`, `destroyEcsWorld`. Singleton-паттерн: мир хранится в модуле.

#### `ecs-components.ts` (`src/game/ecs/ecs-components.ts`)
Все компоненты bitECS, разделённые на категории:

**SoA-компоненты (Structure of Arrays, hot path)**:
- `Position` (x, y), `Velocity` (x, y), `Health` (current, max), `Radius`, `Time`, `Direction` (x, y), `RenderLayer` — на `Float32Array` / `Int32Array` размером 10000.

**Сложные компоненты (тоже SoA)**:
- `Player` — moving, animT, swingT, hurtT, slowT, hasSword, runes, swingDir, aiming.
- `Enemy` — kind, radius, facing, t, state, aggro, hidden, lungeT, freezeT, flashT, seed, speed, dmg, stateT, pathI, repathT, contactCd, guardOf, fade, dropDew, leash.
- `Projectile` — kind, dmg, life, dist, returning, spin.
- `Drop` — kind, t, magnet, life.
- `NPC` — id, name. `Chest` — item, opened. `Pedestal` — id, taken, guardsLeft, guardsSpawned. `Shrine` — lit. `Door` — open, locked. `Barrier` — active. `Altar` — runes.

**Маркеры (boolean)**: `Dead`, `Hidden`, `Taken`, `Magnet`, `Moving`, `Attacking`, `Aiming`, `Frozen`, `Flashing`, `Slowed`, `Returning`, `ShrineLit`.

**Специальные**: `PhysicsBody` (ссылка на тело Planck.js через реестр), `Sprite` (ссылка на PixiJS Graphics через реестр), `EnemyAI` (ссылка на AI-данные через реестр).

**String Pool**: строковые значения (kind, id, name) хранятся в пуле, компоненты ссылаются на индексы. Функции `poolAdd`, `poolGet`, `setSoA`, `getSoA`.

`EnemyState` — enum состояний AI: idle, wander, chase, lunge, hover, dive, charge, cool, open, closed, appear, dissipate, enter, wind, swing, stuck, aim, ring.

#### `ecs-relations.ts` (`src/game/ecs/ecs-relations.ts`)
Отношения bitECS: `ChildOf` (иерархия с автоудалением детей), `Targeting` (враг → цель, exclusive), `Targeted`, `Contains` (контейнер → предмет с количеством), `Removing` (отложенное удаление).

#### `ecs-utils.ts` (`src/game/ecs/ecs-utils.ts`)
Фабрики создания сущностей: `createEntity`, `createMovableEntity`, `createLivingEntity`, `createPlayerEntity`, `createEnemyEntity`, `createProjectileEntity`, `createDropEntity`. Вспомогательные: `isAlive`, `distBetween`, `distSqBetween`, `setPosition`, `setVelocity`, `damageEntity`, `healEntity`, `getAliveCount`.

#### `ecs-bridge.ts` (`src/game/ecs/ecs-bridge.ts`)
Мост между legacy-кодом и ECS. Создаёт ECS-сущности с привязкой PixiJS Graphics и Planck.js Body:
- `createPlayerInEcs` — игрок со спрайтом.
- `createEnemyInEcs` — враг со спрайтом, физическим телом и AI-параметрами (через `getEnemyStats`).
- `createNpcInEcs`, `createChestInEcs`, `createPedestalInEcs`, `createShrineInEcs`, `createDoorInEcs`, `createBarrierInEcs`, `createAltarInEcs`, `createDropInEcs`.

#### `ecs-map-loader.ts` (`src/game/ecs/ecs-map-loader.ts`)
Загрузка сущностей из `WorldData` в ECS-мир:
- `loadMap()` — оркестрирует: очистка мира → создание тайловых коллайдеров → создание игрока → камера → спавн врагов, сундуков, пьедесталов, святилищ, NPC, дверей/барьеров/алтарей, дропов.
- Управляет состоянием открытых сундуков, взятых пьедесталов, посещённых святилищ.
- Сохраняет и восстанавливает дропы при переходах между картами.

#### `ecs-render-helpers.ts` (`src/game/ecs/ecs-render-helpers.ts`)
Функции отрисовки ECS-сущностей на PixiJS Graphics каждый кадр. Вызывают чистые рендереры из `entities.ts`: `drawPlayer`, `drawEnemy`, `drawNpc`, `drawDrop`, `drawProjectile`, `drawChest`, `drawPedestal`, `drawShrine`, `drawDoor`, `drawBarrier`, `drawAltar`.

---

### ECS-системы (`src/game/ecs/ecs-systems/`)

#### `init-system.ts`
Инициализация префабов (шаблонов сущностей): `createPlayerPrefab`, `createEnemyPrefab`. Кэширует префабы для быстрого создания.

#### `movement-system.ts`
- `movementSystem` — обновление позиций по Velocity.
- `directionFromVelocitySystem` — обновление направления по скорости.
- `timerSystem` — обновление таймеров сущностей.
- `playerMovementSystem` — движение игрока с учётом ввода и скорости тайла.
- `kinematicMovementSystem` — кинематическое движение (для снарядов).

#### `physics-system.ts`
Интеграция с Planck.js:
- `syncPositionToBody` / `syncVelocityToBody` — синхронизация ECS → Planck.
- `syncBodyToPosition` — синхронизация Planck → ECS.
- `createBodyForEntity` / `destroyBodyForEntity` — создание/удаление физических тел.
- `circlesOverlap`, `checkEntityOverlap`, `findOverlappingEntities` — проверка коллизий.
- `hasLineOfSight` — проверка линии видимости (для AI).

#### `combat-system.ts`
Боевая система:
- `swordAttackSystem` — атака мечом (проверка угла и дистанции, урон, заморозка молотом, отбрасывание).
- `axeThrowSystem` — бросок ледяной секиры (снаряд с возвратом).
- `arrowShootSystem` — стрельба из лука (снаряд со скоростью и временем жизни).
- `projectileUpdateSystem` — обновление снарядов (движение, жизнь, возврат секиры).
- `projectileEnemyCollisionSystem` — коллизии снарядов с врагами.
- `damageEnemy`, `damagePlayer` — нанесение урона.
- `updateProjectilesEcs`, `hitEnemy`, `killEnemy`, `damageSnake`, `damagePlayerEcs`, `fireProjectileEcs` — внутренние функции.

#### `ai-system.ts`
AI врагов на основе стейт-машины:
- `aiUpdateSystem` — обновление всех вражеских AI.
- Логика по типам врагов: `draugr` (ближний бой, щит), `varg` (рывок), `raven` (полёт, пикирование), `shroom` (споры), `crawler` (преследование), `frost` (заморозка), `ghost` (туманный призрак), боссы (`reaper`, `spider`, `giant`, `snake`).
- Стейты: idle → wander → chase → lunge/dive/charge → cool. Для призраков: appear → chase → dissipate.
- Поиск пути через NavMesh (repath каждые 0.5с).

#### `life-system.ts`
- `lifeCheckSystem` — проверка здоровья, пометка мёртвых.
- `deathCleanupSystem` — удаление мёртвых сущностей.
- `stateTimerSystem` — обновление таймеров (hurtT, slowT, flashT, freezeT, lungeT, swingT).
- `magnetSystem` — притяжение дропов к игроку.
- `returningProjectileSystem` — возврат секиры.

#### `drops-system.ts`
Система дропов:
- `spawnDrop` / `rollDropsForEnemy` / `spawnWorldDrops` — создание дропов.
- `dropsUpdateSystem` — обновление дропов (анимация, время жизни, притяжение, сбор).
- Legacy-функции для обратной совместимости: `spawnDropLegacy`, `updateDropsLegacy`, `spawnWorldDropsLegacy`.
- `DropRt` — рантайм-компонент дропа с PixiJS Graphics и физическим телом.

#### `fog-system.ts`
Система тумана:
- `fogUpdateSystem` — управление волнами тумана (каждые 60с), спавн призраков, сжатие круга видимости.
- `spawnFogGhost` — создание призрачного врага.
- `createFogState` / `FogState` — состояние тумана (таймер, активность, радиус, флаги).
- Legacy-функции: `updateFogLegacy`, `fogHolesLegacy`.

#### `interaction-system.ts`
Взаимодействие с объектами мира:
- `tryInteract` — поиск ближайшего интерактивного объекта и обработка: диалог с NPC, открытие сундука, взятие с пьедестала (со спавном стражей), зажжение святилища, открытие двери, алтарь для реликвии.
- `onEnemyKilledEcs` — обработка смерти врага (спавн дропов, эмит событий).

#### `input-system.ts` (ECS)
- `updatePlayerInput` — обработка ввода игрока: установка скорости, направления, анимации движения, проигрыш шагов аудио.
- `processActions` — обработка боевых действий (удар мечом, бросок секиры).
- `updateBow` — управление луком (прицел, замедление времени, выстрел).

#### `render-system.ts`
Рендеринг ECS-сущностей на PixiJS:
- `updateSpritePosition` — синхронизация позиции PixiJS Graphics с ECS Position.
- `renderSprites` — отрисовка всех спрайтов.
- `renderVisibilitySystem` — управление видимостью (скрытые враги в тумане).
- `renderFlashSystem` — эффект мигания при попадании.
- Специализированные рендереры: `renderPlayer`, `renderEnemies`, `renderProjectiles`, `renderDrops`, `renderNPCs`, `renderChests`, `renderPedestals`, `renderShrines`, `renderDoors`, `renderBarrier`, `renderAltar`.
- `addFloatText` / `updateFloatTexts` — всплывающие тексты (урон, лечение, подсказки).
- `renderSystem` — главный цикл рендеринга.

#### `world-system.ts`
Системы мира:
- `updateDoors` — открытие дверей (с ключом или автоматическое).
- `updateZone` — обновление текущей зоны (уведомление при смене).
- `checkDungeonBoss` — проверка смерти босса данжа.

#### `ecs-game-loop.ts`
Главный игровой цикл. Оркестрирует порядок выполнения всех систем каждый кадр:
1. `updatePlayerInput` → 2. `playerMovementSystem` + `directionFromVelocitySystem` → 3. `processActions` (меч, секира) → 4. `updateBow` → 5. `aiUpdateSystem` → 6. `swordAttackSystem` + `axeThrowSystem` + `arrowShootSystem` → 7. `syncPositionToBody` + `syncVelocityToBody` → 8. `planckWorld.step()` → 9. `syncBodyToPosition` → 10. `projectileUpdateSystem` → 11. `projectileEnemyCollisionSystem` → 12. `stateTimerSystem` → 13. `magnetSystem` → 14. `dropsUpdateSystem` → 15. `fogUpdateSystem` → 16. `lifeCheckSystem` → 17. `deathCleanupSystem` → 18. `tryInteract` → 19. `updateDoors` + `updateZone` + `checkDungeonBoss` → 20. `renderSystem`.

Возвращает объект `EcsGameLoop` с методами: `tick(rdt, timeScale)`, `render(rdt)`, `setPlayerEid`, `getPlayerEid`, `isDungeonBossDead`, `getDropsForTransition`.

---

### Сущности и рендереры

#### `entities.ts` (`src/game/entities.ts`)
Разделён на три части:
1. **Интерфейсы данных** (только то, что нужно для отрисовки): `IPlayerData`, `IEnemyData`, `INpcData`, `IDropData`, `IProjectileData`, `IChestData`, `IPedestalData`, `IShrineData`, `IDoorData`, `IBarrierData`, `IAltarData`, `IPlayerExtra`.
2. **Полные интерфейсы сущностей** (данные + физика): `Player`, `Enemy`, `Projectile`, `Drop`.
3. **Чистые функции рендеринга** (PixiJS Graphics, без состояния): `renderPlayer`, `renderEnemy`, `renderNpc`, `renderDrop`, `renderProjectile`, `renderChest`, `renderPedestal`, `renderShrine`, `renderDoor`, `renderBarrier`, `renderAltar`. Каждая функция рисует пиксельную графику с помощью `Graphics.rect().fill()`.
4. `ENEMY_STATS` — таблица характеристик врагов (hp, radius, speed, dmg) по типам.

---

### Генерация мира (`src/game/generators/`)

#### `types.ts` (`src/game/generators/types.ts`)
Все типы и константы мира:
- `T = 16` — размер тайла в пикселях.
- `Tl` — enum типов тайлов (WATER, SHORE, SNOW, FOREST, TREE, ROCK, MTN, SWAMP, VILLAGE, PALISADE, HOUSE, RUINS, COLUMN, CAVE, CAVEWALL, STAIRS, DFLOOR, DWALL, ALTAR и т.д.).
- `WorldData` — главная структура данных карты: размеры (W, H), тайлы, NavMesh, флаг данжа, спавны, NPC, сундуки, пьедесталы, святилища, двери, входы в данжи, точки интереса (hornSpot, meadSpot, bearSpot и т.д.), арена для финального босса.
- Типы: `EnemyKind`, `DropKind`, `ProjectileKind`, `ChestItem`, `BossReward`, `DungeonCfg`, `HouseDef`, `VillageResult`.

#### `noise.ts` (`src/game/noise.ts`)
- `mulberry(seed)` — детерминированный ГПСЧ (генератор псевдослучайных чисел).
- `NoiseGenerator` — value noise + fBm (фрактальный шум). Используется для генерации острова и эффекта тумана.

#### `island-generator.ts`
`IslandGenerator` — генерация острова 200×140:
- `buildIsland` — форма острова через шум (эллипс с возмущениями).
- `buildBiomes` — распределение биомов (снег, лес, горы, болото, руины) по шуму и расстоянию от центра.
- `buildRuins` — руины на острове.
- `smoothBiomes` — сглаживание границ биомов.
- `spawnNpcs` — размещение NPC на острове.

#### `village-generator.ts`
`VillageGenerator` — генерация поселений:
- `placeGate` — размещение ворот в заборе (случайная сторона).
- `buildFence` — строительство частокола вокруг деревни.
- `placePlaza` — создание площади в центре.
- `placeHouses` — размещение домов разных размеров.
- `buildPlazaGateRoad`, `buildHouseRoads` — дороги от ворот к площади и от площади к домам.
- `collectResidentSpots` — сбор точек для жителей.

#### `global-road-generator.ts`
`GlobalRoadGenerator` — генерация дорог между точками мира через A* с учётом стоимости прохождения по разным биомам (лес дороже снега, болото дороже гор).

#### `nav-builder.ts`
`NavBuilder` — построение навигационной сетки (NavMesh) из тайловой карты. Сканирует проходы по горизонтали, объединяет вертикально соседние проходы в полигоны, создаёт `NavMesh` из библиотеки `navmesh`.

#### `dungeons.ts`
`generateDungeon(seed, dungeonId, exitSpot)` — генерация трёх данжей:
- **Склеп Хранителя** (id=0, босс: Жнец) — клеточная структура 6×4, коридоры, комнаты, ловушки.
- **Корень Иггдрасиля** (id=1, босс: Паук) — органическая структура с тупиками.
- **Каменная Крепость** (id=2, босс: Великан) — прямоугольные залы с колоннами.

`DUNGEONS` — конфигурация данжей: босс, награда, пул врагов.

`finalizeDungeon` — расстановка дверей в комнату босса, ограничение спавнов, построение NavMesh.

#### `overworld.ts`
`generateOverworld(seed)` — оркестратор генерации overworld:
1. Генерация острова через `IslandGenerator`.
2. Размещение трёх деревень через `VillageGenerator` (Воронья Гавань, вторая деревня, сожжённая деревня).
3. Размещение святилищ на площадях.
4. Генерация дорог через `GlobalRoadGenerator` (от ворот к деревням, данжам, алтарю).
5. Размещение NPC (Эйрик, Астрид, Гаральд, Дочь, Сигрид, Бранд, Шаман, Беженка, Торговец).
6. Размещение входов в данжи (лестницы вниз).
7. Размещение алтаря Мирового Древа и арены финального босса.
8. Расстановка врагов по биомам (по 3 типа на биом).
9. Размещение пьедесталов с рунами (5 шт, со стражами).
10. Расстановка точек интереса для квестов (медвежонок, рог, мёд, руда, мох, янтарь, цветок, дневник, тюк, реликвия).
11. Размещение ambient-дропов (черепа, осколки).

#### `index.ts` (`src/game/generators/index.ts`)
Barrel-export всех типов, утилит, генераторов для удобства импорта.

#### `world.ts` (`src/game/world.ts`)
Тонкий реэкспорт из `generators/` — единая точка импорта для остального кода.

---

### Квесты (`src/game/quests/`)

#### `quest-definitions.ts`
Декларативные определения всех квестов — чистые данные без логики. `ALL_QUESTS` содержит 18 квестов:
- **Основные (сага)**: m1 «Пробуждение», m2 «Первый Зов», m3 «Голос Леса», m4 «Забытые Руны», m5 «Горная Разруха», m6 «Рагнарёк».
- **Побочные**: s_bear «Игрушка для Дочери», s_horn «Пропавший рог», s_mead «Лучший мёд», s_ore «Сердце горы», s_moss «Отвар Норн», s_diary «Тайна Сожжённой Деревни», s_cull «Волк и Кость», s_bundle «Потерянный груз», s_atone «Эхо мёртвых», s_shrines «Паломничество», s_hunt «Зачистка Нидов», s_ghost «Голоса тумана».

#### `quest-provider.ts`
Интерфейс `IQuestProvider` — абстракция для DIP: `questDesc(id)`, `buildQuests()`, `trackedTitle()`. Позволяет подменять реализацию (mock для тестов).

#### `quest-system.ts`
`QuestSystem` — реализация `IQuestProvider`. Подписывается на события EventBus (enemy:killed, drop:collected, dialogue:end, pedestal:unsealed, boss:killed, fog:waveEnd, quest:reveal). Логика прогрессии основного квеста через `mainQuestId()`: определяет текущий этап по флагам (нет меча → m1, Жнец жив → m2, и т.д.). Метод `questDesc(id)` возвращает динамическое описание и статус выполнения каждого квеста. Метод `buildQuests()` собирает список всех открытых квестов для HUD.

#### `quest-tracker.ts`
`QuestTracker` — определяет координаты цели стрелки компаса и заголовок отслеживаемого квеста. Делегирует определение координат в `quest-targets.ts` (Strategy pattern).

#### `quest-targets.ts`
`resolveQuestTarget(questId, context)` — фабрика резолверов. Для каждого квеста своя функция-стратегия, возвращающая координаты цели на карте:
- Помощники: `dungeonTarget` (цель в данже), `npcSpot` (координаты NPC), `nearestOf` (ближайший объект из списка).
- Для m4 (Руны) — ищет ближайший нетронутый пьедестал через ECS-запрос.
- Для m6 (Рагнарёк) — ищет живого босса-змея через ECS-запрос.
- Для побочных — координаты точек интереса или NPC в зависимости от прогресса.

---

### Диалоги (`src/game/dialogue/`, `src/game/dialogues.ts`)

#### `dialogue-system.ts`
`DialogueSystem` — тонкий диспетчер:
- `startDialogue(id)` — вызывает `resolveDialogue(id)` из декларативных определений, активирует диалог, эмитит `quest:reveal` для связанных квестов.
- `endDialogue()` — завершает диалог, эмитит `dialogue:end`, что запускает `applyDialogueEffects`.
- `applyDialogueEffects(id)` — диспетчер эффектов: вызывает методы `effect_eirik`, `effect_astrid`, `effect_sigrid` и т.д. — выдача предметов, улучшения, лечение, квестовые награды.

#### `dialogues.ts`
Декларативные определения диалогов NPC. Каждый NPC — массив веток (`DialogueBranch`) с условием (`condition`), возвращающим массив строк реплик или null. Ветки перебираются по порядку, первая подходящая выбирается. Утилиты `allTrue`, `allFalse` для проверки флагов. Диалоги адаптивны: разные реплики в зависимости от прогресса (нет меча → выдаёт меч, Жнец жив → подсказка, Жнец мёртв → следующий совет).

---

### Обработка дропов

#### `drop-handlers.ts`
Strategy pattern для сбора дропов. Интерфейс `DropHandler` с методом `handle(ctx)`. `DropHandlerRegistry` — реестр обработчиков по типу дропа:
- `HeartHandler` — лечение или сохранение в суму (до 9).
- `ArrowsHandler` — +5 стрел.
- `AxeHandler`, `BowHandler`, `HammerHandler` — выдача оружия.
- `SwordHandler` — возвращение меча.
- Квестовые предметы: `BearHandler`, `HornHandler`, `MeadHandler`, `OreHandler`, `MossHandler`, `AmberHandler`, `FlowerHandler`, `DiaryHandler`, `BundleHandler`, `RelicHandler`.
- `ShardHandler`, `BonesHandler`, `RuneHandler`, `DewHandler`, `SoulHandler` — ресурсы и коллекции.

---

### Ввод (`src/game/input/`)

#### `input-system.ts`
`InputSystem` — обработка клавиатуры:
- `register()` / `unregister()` — подписка на `keydown`/`keyup`.
- `actionMap` — маппинг кодов клавиш → абстрактные действия (Escape → Pause, Tab → Inventory, Q → Quests, M → Mute, F → UseHeart, N → ToggleSnow).
- `getState()` — возвращает `InputState` с направлением движения (ix, iy) и флагами действий (bowHeld, atkPressed, axePressed, actPressed).
- `setVirtual()` — установка виртуального джойстика (мобильные).

---

### Состояние и экраны

#### `state-manager.ts` (`src/game/state/`)
`StateManager` — управление глобальным состоянием экрана:
- `screen` — текущий экран (title, play, pause, death, victory, quests, inventory, map).
- Эффекты: `fadeA`/`fadeTarget` (затухание), `timeScale`/`tsTarget` (замедление времени), `hitstop` (остановка при ударе), `shake` (тряска экрана).
- `setScreen`, `togglePause`, `backToTitle`, `onPlayerDied`, `tickDeathTimer`, `isDeathReady`.
- `update(dt)` — плавная интерполяция эффектов.

---

### Визуальные эффекты

#### `fx.ts`
`FxManager` — атмосферные эффекты:
- **Частицы**: `burst()` — взрыв частиц (для урона, смерти, подбора предметов). Структура `Particle` с физикой (гравитация, затухание).
- **Снег**: массив `Snowflake`, отрисовка поверх сцены.
- **Туман**: канвас-текстура с шумом, vignette по краям, радиус видимости сжимается при волнах тумана.
- **Виньетка**: затемнение краёв экрана.
- Инициализация: `init()`, `buildVignette()`, `buildFogVignette()`, `buildNoiseTexture()`.

#### `audio.ts`
`AudioEngine` — процедурный звуковой синтезатор на WebAudio (без аудиофайлов):
- **Амбиент**: ветряной дрон (белый шум через bandpass-фильтр с LFO), бурдон (три пилообразных осциллятора), рог (периодические тоны).
- **Музыка**: тагельхарпа — мелодия из двух фраз (PHRASE_A, PHRASE_B) по шкале, с эхо (delay+feedback).
- **SFX**: `hit` (удар), `clang` (звон щита), `pickup` (подбор), `rune` (руна), `heal` (лечение), `uiClick` (клик интерфейса), `step` (шаг), `boss` (появление босса).
- `toggleMute()`, `setIntensity(v)`, `setFog(on)` — управление звуком.
- `startMusic()` — запуск музыкального цикла.

---

### Отрисовка карты

#### `tiles.ts`
Процедурная генерация тайловых текстур через Canvas 2D:
- `TILE_COLORS` — цветовая палитра для каждого типа тайла.
- `buildAllTileTextures()` — создание ground-текстуры (один большой `RenderTexture` со всеми тайлами), спрайтов стен и домов.
- `houseMetrics()` — расчёт геометрии дома (стены, крыша, фундамент) в зависимости от размера.
- `paintWall()` — отрисовка стен (ель, камень, частокол, колонна, алтарь) пиксельной графикой.
- `HouseSpriteEntry`, `WallTextureCache`, `HouseTextureCache` — кэши текстур.

#### `map-display.ts`
Отрисовка мини-карты и большой карты:
- `buildMinimapBase(map)` — создание базового изображения миникарты (2 пикселя на тайл).
- `drawMinimap()` — отрисовка миникарты с оверлеями: святилища, пьедесталы, цель квеста (мигающая стрелка), игрок.
- `buildBigMapBase(map)` — создание большой карты (масштабируется под 560×420).
- `drawBigMap()` — отрисовка большой карты с входами в данжи, босс-комнатами, алтарём, целью квеста.

#### `physics/planck-world.ts`
`PlanckWorld` — обёртка над Planck.js World:
- **Категории коллизий** (`Cat`): Player, Enemy, Ghost, Projectile, Tile, Door, Barrier, Drop, Boss.
- **Маски коллизий** (`CollidesWith`): что с чем сталкивается (Ghost проходит сквозь всё, но бьёт игрока).
- `PhysicsCallbacks` — колбэки: onProjectileHitEnemy, onProjectileHitPlayer, onEnemyHitPlayer, onProjectileHitTile, onPlayerPickupDrop.
- Методы: `createTileBody` (статический квадратный коллайдер), `createCircleBody` (динамический круг), `destroyBody`, `step`.
- Обработка коллизий через `begin-contact` / `end-contact` события Planck.js.

---

## Взаимодействие между подсистемами

```
App.tsx (React)
  │
  │ EngineCallbacks (onHud, onScreen, onDialogue, onToast, onStats)
  ▼
Engine ───────────────────────────────────────────────────┐
  │                                                        │
  ├── EventBus ◄──── все системы подписываются на события
  │                                                        │
  ├── GameStore ──┬── FlagDomain (флаги, квесты, предметы)
  │               ├── PlayerDomain (hp, позиция, скорость)
  │               └── WorldData (map, ow, dungeons)
  │                                                        │
  ├── InputSystem ──→ EventBus (абстрактные действия)
  │                                                        │
  ├── StateManager (экраны, эффекты, пауза, смерть)
  │                                                        │
  ├── EcsGameLoop ──→ оркестрирует все ECS-системы:
  │     │              input → movement → combat → physics →
  │     │              AI → drops → fog → life → interact →
  │     │              world → render
  │     │                                                  │
  │     ├── EcsMapLoader ──→ ecs-bridge ──→ ECS сущности
  │     │                                                  │
  │     └── PlanckWorld (физика, коллизии)
  │                                                        │
  ├── QuestSystem ──→ EventBus (quest:reveal, quest:completed)
  │   └── QuestTracker ──→ quest-targets (Strategy)
  │                                                        │
  ├── DialogueSystem ──→ dialogues.ts (декларативные определения)
  │                                                        │
  ├── HudSystem ──→ EngineCallbacks.onHud (HudData → React)
  │                                                        │
  ├── FxManager (частицы, снег, туман, виньетка)
  │                                                        │
  └── AudioEngine (процедурный звук)
```

**Поток данных одного кадра**:

1. `InputSystem` захватывает клавиатуру → эмитит абстрактные действия в EventBus.
2. `Engine` вызывает `ecsGameLoop.tick(rdt, timeScale)`.
3. ECS-системы обрабатывают ввод, движение, бой, AI, физику, дропы, туман, смерть, взаимодействие.
4. Системы эмитят события в EventBus (`enemy:killed`, `drop:collected`, `boss:killed` и т.д.).
5. `QuestSystem` и `DialogueSystem` реагируют на события, обновляют флаги.
6. `Engine` вызывает `ecsGameLoop.render(rdt)` — рендер-система отрисовывает все сущности.
7. `FxManager` обновляет частицы, снег, туман.
8. `HudSystem.pushHud()` собирает данные из store и флагов, передаёт в React через `onHud`.
9. React перерисовывает HUD и оверлеи.

**Загрузка карты**:

1. `generateOverworld(seed)` → `WorldData` (остров, деревни, дороги, NPC, враги, пьедесталы, данж-входы).
2. `generateDungeon(seed, id, exitSpot)` → `WorldData` (данж с боссом, врагами, сундуками).
3. `buildAllTileTextures(map)` → PixiJS текстуры.
4. `EcsMapLoader.loadMap()` → создаёт ECS-сущности (игрок, враги, NPC, сундуки, пьедесталы, святилища, двери, барьеры, алтари, дропы) + физические тела Planck.js.
5. `EcsGameLoop` перенастраивается на новую карту.
6. `buildMinimapBase(map)` → миникарта.

---

## Технологический стек

| Слой | Технология |
|---|---|
| UI | React 18, TailwindCSS 4 |
| Рендеринг | PixiJS 8 |
| ECS | bitECS 0.4 |
| Физика | Planck.js 1.3 |
| Навигация | navmesh 2.3 |
| Аудио | WebAudio API (процедурный синтез) |
| Сборка | Vite 6 |
| Язык | TypeScript 5.7 |
| Десктоп | Electron 44 (опционально) |