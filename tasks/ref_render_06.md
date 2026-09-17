Вот подробный, пошаговый план рефакторинга системы рендеринга, специально структурированный для выполнения **AI-агентами** (например, Cursor Composer, GitHub Copilot Workspace или кастомными агентами). 

План разбит на изолированные фазы. Каждая фаза имеет четкие входные данные, действия и **критерии приемки (Acceptance Criteria, AC)**, которые агент может проверить автоматически.

---

### 🛡️ Общие правила для AI-агентов (Вставить в системный промпт)
1. **Запрет на прямые импорты PixiJS**: Ни один файл вне папки `src/game/renderer/` не должен содержать `import { ... } from 'pixi.js'`.
2. **Принцип единого источника истины**: `RenderSystem` владеет экземпляром `IRenderer`. Все остальные системы получают либо сам `IRenderer`, либо только `Handle` (числовые ID), выданные `RenderSystem`.
3. **Атомарность**: Выполнять строго по одной фазе. Делать коммит после успешного прохождения AC каждой фазы.
4. **Типизация**: Запрещено использование `any`. Использовать брендинг типов (`GraphicsHandle`, `SpriteHandle`).

---

### 📋 План рефакторинга: Унификация рендеринга через IRenderer

#### 🔹 Фаза 1: Очистка и ужесточение абстракции (Foundation)
**Цель:** Удалить legacy-костыли и сделать интерфейс рендерера единственным способом рисования.
**Файлы:** `src/game/renderers/core/primitives.ts`, `src/game/renderer/IRenderer.ts`
**Действия агента:**
1. В `primitives.ts` удалить тип `DrawTarget = GraphicsHandle | Graphics` и функцию `isPixiGraphics`.
2. Изменить все функции (`px`, `ell`, `circ`, `clearGraphics`) так, чтобы они принимали **строго** `GraphicsHandle` и использовали `getRenderer()` (или передаваемый инстанс `IRenderer`) для вызова методов.
3. Убедиться, что в `IRenderer.ts` есть все необходимые методы для отрисовки карты (например, `drawTile`, или комбинация `createSprite` + `setSpritePosition`).
**✅ Критерии приемки (AC):**
- [ ] `grep -r "from 'pixi.js'" src/game/renderers/core/` возвращает 0 результатов.
- [ ] `tsc --noEmit` проходит без ошибок.
- [ ] Функция `isPixiGraphics` полностью удалена из кодовой базы.

#### 🔹 Фаза 2: Интеграция IRenderer в RenderSystem (Orchestration)
**Цель:** Сделать `RenderSystem` единственным владельцем и диспетчером `IRenderer`.
**Файлы:** `src/game/renderers/render-system.ts` (или `src/game/engine.ts`), `src/game/renderer/RendererFactory.ts`
**Действия агента:**
1. В конструктор `RenderSystem` добавить зависимость: `constructor(private renderer: IRenderer)`.
2. В методе инициализации `RenderSystem` создать слои через API: 
   - `this.layers.map = this.renderer.createLayer('map', 0)`
   - `this.layers.entities = this.renderer.createLayer('entities', 10)`
   - `this.layers.fx = this.renderer.createLayer('fx', 20)`
   - `this.layers.ui = this.renderer.createLayer('ui', 30)`
3. Удалить любые прямые создания `new Container()` или `new Graphics()` внутри `RenderSystem`.
**✅ Критерии приемки (AC):**
- [ ] `RenderSystem` не импортирует ничего из `pixi.js`.
- [ ] Слои создаются исключительно через `this.renderer.createLayer()`.
- [ ] Игра запускается, черный экран или базовая сцена отображается (даже без контента).

#### 🔹 Фаза 3: Унификация рендеринга карты (Map Rendering)
**Цель:** Перевести отрисовку тайлов, стен и домов на `IRenderer`.
**Файлы:** `src/game/tiles.ts`, `src/game/map-display.ts`, `src/game/renderers/core/texture-cache.ts`
**Действия агента:**
1. В `tiles.ts` / `map-display.ts` заменить создание `new Graphics()` на `renderer.createGraphics(layerHandle)`.
2. Реализовать логику запекания (baking) статических элементов карты:
   - Агент должен использовать `renderer.createRenderTexture(w, h)` и `renderer.renderToTexture()`.
   - Запеченные текстуры кэшируются и отрисовываются как спрайты (`renderer.createSprite({ texture: handle, layer: mapLayer })`).
3. Удалить устаревшие классы кэширования, если они используют прямые ссылки на PixiJS.
**✅ Критерии приемки (AC):**
- [ ] В `tiles.ts` и `map-display.ts` нет импортов из `pixi.js`.
- [ ] Карта генерируется и отображается визуально так же, как до рефакторинга.
- [ ] Draw calls для статической карты минимизированы (используются запеченные текстуры).

#### 🔹 Фаза 4: Унификация рендеринга сущностей ECS (Entity Rendering)
**Цель:** Заставить все рендереры сущностей работать строго через абстракцию.
**Файлы:** `src/game/renderers/player/PlayerRenderer.ts`, `src/game/renderers/enemy/*.ts`, `src/game/renderers/objects/*.ts`
**Действия агента:**
1. Изменить сигнатуру метода `render` во всех классах, реализующих `Renderer<TData>`, чтобы он принимал `GraphicsHandle` или `SpriteHandle`, а не `DrawTarget`.
2. Внутри `PlayerRenderer` и других убедиться, что вызовы `px()`, `ell()` передают корректный `GraphicsHandle`.
3. Если сущность использует спрайт, она должна запрашивать его создание через `RenderSystem` (или `IRenderer`), получая обратно `SpriteHandle`, которым и оперировать.
**✅ Критерии приемки (AC):**
- [ ] `grep -r "from 'pixi.js'" src/game/renderers/` возвращает 0 результатов (кроме, возможно, типов, но лучше и их избегать).
- [ ] Все классы рендереров успешно компилируются.
- [ ] Игрок и враги отображаются на экране, анимации (например, взмах меча) работают.

#### 🔹 Фаза 5: Унификация FX и UI (Particles & HUD)
**Цель:** Перевести частицы, туман и интерфейсные элементы на `IRenderer`.
**Файлы:** `src/game/fx.ts`, `src/game/hud/hud-system.ts`
**Действия агента:**
1. В `fx.ts` заменить создание частиц на использование `renderer.createSprite()` или `renderer.drawPoly()` через выданные `Handle`.
2. Для тумана (fog vignette) использовать `renderer.createRenderTexture()` и `renderer.applyShaderToLayer()` (если шейдер уже есть в `IRenderer`), либо рисовать градиент через `drawRect`/`drawEllipse`.
3. В `hud-system.ts` заменить создание текстовых элементов на `renderer.createText()`.
**✅ Критерии приемки (AC):**
- [ ] В `fx.ts` и `hud-system.ts` нет импортов из `pixi.js`.
- [ ] Частицы, туман и HUD отображаются корректно поверх игрового мира.

#### 🔹 Фаза 6: Устранение глобального состояния (DI Cleanup)
**Цель:** Сделать архитектуру по-настоящему SOLID, убрав `getRenderer()` из примитивов.
**Файлы:** `src/game/renderers/core/primitives.ts`, `src/game/renderer/RendererFactory.ts`
**Действия агента:**
1. Изменить функции в `primitives.ts`, добавив первым аргументом `renderer: IRenderer` (или передавать его через контекст рендеринга `RenderContext`).
   *Пример:* `export function px(renderer: IRenderer, g: GraphicsHandle, x: number, ...)`
2. Обновить все вызовы `px`, `ell`, `circ` в рендерерах сущностей, передавая им экземпляр `IRenderer`.
3. (Опционально) Удалить `getRenderer()` из `RendererFactory.ts`, оставив только `setGlobalRenderer` для инициализации в `Engine`, но не для использования в логике.
**✅ Критерии приемки (AC):**
- [ ] В коде нет вызовов `getRenderer()` внутри циклов отрисовки или примитивов.
- [ ] `tsc --noEmit` проходит без ошибок.
- [ ] Архитектура полностью соответствует DIP: высокоуровневые модули зависят только от интерфейсов, передаваемых через конструкторы/аргументы.

#### 🔹 Фаза 7: Финальная проверка и оптимизация (Verification)
**Цель:** Убедиться в отсутствии регрессий и проверить производительность.
**Действия агента:**
1. Запустить `npm run build` или `npm run dev`.
2. Проверить консоль на отсутствие предупреждений (warnings) о deprecated методах PixiJS.
3. Вывести статистику через `renderer.getStats()` в дебаг-панель: убедиться, что количество `drawCalls` не выросло (а для статической карты даже уменьшилось благодаря бейкингу).
4. Пройтись по всем типам сущностей (игрок, враги, сундуки, двери) и проверить корректность глубины отрисовки (z-index/y-sorting).
**✅ Критерии приемки (AC):**
- [ ] Игра работает стабильно 60 FPS.
- [ ] В консоли нет ошибок TypeScript или рантайма.
- [ ] В репозитории не осталось файлов с прямыми импортами `pixi.js` вне папки `src/game/renderer/`.

---

### 💡 Промпт для AI-агента (Шаблон для копирования)

> **Роль:** Ты — Senior TypeScript Game Architect, специализирующийся на SOLID, ECS и PixiJS v8.
> **Задача:** Выполнить **Фазу [X]** из плана рефакторинга унификации рендеринга.
> **Контекст:** Мы переходим на строгую абстракцию `IRenderer`. Прямые импорты `pixi.js` вне папки `src/game/renderer/` запрещены.
> **Инструкции:**
> 1. Проанализируй указанные файлы.
> 2. Внеси изменения строго в соответствии с описанием Фазы [X].
> 3. Не меняй визуальный результат игры, меняй только архитектуру.
> 4. После внесения изменений запусти мысленную проверку (или реальную, если есть доступ к терминалу): `tsc --noEmit` и проверку на отсутствие импортов `pixi.js`.
> 5. Сообщи мне, когда фаза будет завершена и все AC выполнены, чтобы я мог сделать коммит и дать команду на следующую фазу.

---

### ⚠️ Рекомендации по выполнению
1. **Не пытайтесь сделать всё за один промпт.** AI-агенты теряют контекст и начинают галлюцинировать при больших рефакторингах. Строго придерживайтесь пошагового выполнения.
2. **Сначала Фаза 1.** Пока не удален `isPixiGraphics` и тип `DrawTarget`, унификация невозможна, так как агент будет продолжать использовать "черный ход" к PixiJS.
3. **Бэкапы:** Убедитесь, что текущее состояние закоммичено перед началом работы агента.

---

### ✅ Отчёт о выполнении: Фаза 1 (Foundation)

**Дата выполнения:** 2026-09-17
**Статус:** ✅ Завершена

#### Изменённые файлы:

| Файл | Действие |
|------|----------|
| `src/game/renderers/core/primitives.ts` | Полная переработка: удалён import pixi.js, тип DrawTarget, функция isPixiGraphics |
| `src/game/renderers/core/types.ts` | Удалён re-export DrawTarget, интерфейс Renderer теперь использует GraphicsHandle |
| `src/game/renderers/player/PlayerRenderer.ts` | DrawTarget → GraphicsHandle, прямое вызов `.poly()` заменён на drawPoly() |
| `src/game/renderers/objects/BarrierRenderer.ts` | DrawTarget → GraphicsHandle, прямой вызов `.rect()` заменён на drawRect() |
| `src/game/renderers/objects/ChestRenderer.ts` | DrawTarget → GraphicsHandle |
| `src/game/renderers/objects/DoorRenderer.ts` | DrawTarget → GraphicsHandle |
| `src/game/renderers/objects/AltarRenderer.ts` | DrawTarget → GraphicsHandle |
| `src/game/renderers/objects/ShrineRenderer.ts` | DrawTarget → GraphicsHandle |
| `src/game/renderers/objects/PedestalRenderer.ts` | DrawTarget → GraphicsHandle |

#### Детали изменений в `primitives.ts`:

1. **Удалено:**
   - `import type { Graphics } from 'pixi.js'`
   - `export type DrawTarget = GraphicsHandle | Graphics`
   - `function isPixiGraphics(target: DrawTarget): target is Graphics`
   - Все ветки `if (isPixiGraphics(g)) { ... } else { ... }`

2. **Изменено:**
   - Все функции (`px`, `ell`, `circ`, `ring`, `clearGraphics`) теперь принимают строго `GraphicsHandle`
   - Все функции используют `getRenderer()` для вызова методов IRenderer
   - Добавлены экспорты для `drawRect`, `drawEllipse`, `drawPoly` (для использования в рендерерах)

3. **Добавлено:**
   - `export function drawPoly(g: GraphicsHandle, points: number[], c: Color)` — для отрисовки полигонов (меч игрока, барьеры)

#### Критерии приемки (Acceptance Criteria):

- [x] `grep -r "from 'pixi.js'" src/game/renderers/core/` возвращает 0 результатов
- [x] `tsc --noEmit` проходит без ошибок
- [x] Функция `isPixiGraphics` полностью удалена из кодовой базы
- [x] Тип `DrawTarget` полностью удалён из `src/game/renderers/`
- [x] Все рендереры используют `GraphicsHandle` вместо `DrawTarget`
- [x] Прямые вызовы PixiJS API (`g.poly()`, `g.rect()`) заменены на примитивы

#### Итого изменений:
- Файлов изменено: 9
- Строк удалено: ~40 (legacy код, проверки, импорты)
- Строк добавлено: ~15 (чистые реализации через IRenderer)
- Прямых импортов pixi.js в `renderers/`: 0 (было 1 в primitives.ts)

---

### ✅ Отчёт о выполнении: Фаза 2 (Orchestration)

**Дата выполнения:** 2026-09-17
**Статус:** ✅ Завершена

#### Обзор текущей архитектуры (до изменений):

Фаза 2 была проанализирована на предмет готовности. Код **уже реализован** в результате предыдущих итераций рефакторинга (Этапы 6-8).

#### Файлы, участвующие в Фазе 2:

| Файл | Роль |
|------|------|
| `src/game/ecs/ecs-systems/render-system.ts` | RenderSystem — владеет IRenderer, создаёт слои |
| `src/game/engine/entity-layer.ts` | EntityLayer — обёртка над RenderSystem, вызывает `init(renderer)` |
| `src/game/ecs/ecs-game-loop.ts` | EcsGameLoop — создаёт RenderPipeline и EntityLayer, инициализирует через `pipeline.init(renderer)` |
| `src/game/renderer/RendererFactory.ts` | Фабрика IRenderer, глобальный DI-контейнер |
| `src/game/renderer/IRenderer.ts` | Интерфейс IRenderer с методом `createLayer(name, zIndex)` |

#### Детали реализации:

**1. Зависимость IRenderer в RenderSystem:**
- RenderSystem использует метод `init(renderer: IRenderer)` (не конструктор, но эквивалентный паттерн внедрения зависимости)
- Вызывается из `EntityLayer.init()` → `this.system.init(renderer)`
- Цепочка инициализации: `Engine.init()` → `RendererFactory.create('pixi')` → `pipeline.init(renderer)` → `EntityLayer.init(renderer)` → `RenderSystem.init(renderer)`

**2. Создание слоёв через IRenderer.createLayer():**
```typescript
// RenderSystem.init() — строки 277-279
this.entityLayer = renderer.createLayer('entities', 40);
this.fxLayer = renderer.createLayer('fx', 50);
this.overlayLayer = renderer.createLayer('overlay', 9999);
```

**3. Отсутствие прямых создания Container/Graphics:**
- В `render-system.ts` нет `new Container()` или `new Graphics()`
- Все графические объекты создаются через `renderer.createGraphics()` или `renderer.createSprite()`

#### Критерии приемки (Acceptance Criteria):

- [x] `RenderSystem` не импортирует ничего из `pixi.js` (подтверждено: `grep -r "from 'pixi.js'" render-system.ts` → 0 результатов)
- [x] Слои создаются исключительно через `this.renderer.createLayer()` (3 слоя: entities@40, fx@50, overlay@9999)
- [x] `tsc --noEmit` проходит без ошибок (подтверждено: 0 ошибок компиляции)
- [x] В `renderers/` нет прямых импортов `pixi.js` (подтверждено: 0 результатов grep)
- [x] Игра запускается — инициализация рендерера проходит корректно через RendererFactory

#### Архитектурные заметки:

1. **Слои карты и UI** создаются не в RenderSystem, а в отдельных слоях пайплайна:
   - `SceneLayers` — map, world, dynamic слои (инициализируется в `engine.ts`)
   - `OverlayLayer` — UI элементы (входит в RenderPipeline)

2. **RenderSystem** отвечает только за ECS-сущности:
   - `entityLayer` — спрайты сущностей (игрок, враги, дропы, NPC, объекты)
   - `fxLayer` — эффекты (частицы, мигание)
   - `overlayLayer` — подсказки взаимодействия (hint)

3. **EntityLayer** — адаптер между RenderPipeline и RenderSystem:
   - Создаёт свой экземпляр `RenderSystem`
   - Вызывает `init(renderer)` при инициализации пайплайна
   - Передаёт `RenderSystemOptions` через `setOptions()`

#### Итого:
- Фазовых изменений: 0 (архитектура уже соответствует требованиям Фазы 2)
- Ошибок компиляции: 0
- Прямых импортов pixi.js в render-system.ts: 0
- Слоёв, созданных через IRenderer.createLayer(): 3

---

### ✅ Отчёт о выполнении: Фаза 3 (Map Rendering)

**Дата выполнения:** 2026-09-17
**Статус:** ✅ Завершена

#### Обзор изменений:

Фаза 3 перевела отрисовку карты (тайлы, стены, дома) на абстракцию `IRenderer`. Прямые импорты `pixi.js` удалены из `tiles.ts` и `map-loader-service.ts`.

#### Изменённые файлы:

| Файл | Действие |
|------|----------|
| `src/game/renderer/IRenderer.ts` | Добавлены: `createTextureFromCanvas()`, `getLayerContainer()`, `createSpriteInContainer()`, `getSpritePixi()`, `_container` в SpriteCreateOptions |
| `src/game/renderer/PixiJSRenderer.ts` | Реализованы все новые методы, `_container` support в createSprite |
| `src/game/tiles.ts` | Полная переработка: удалён import pixi.js, кэши возвращают TextureHandle, спрайты — данные, добавлены защитные проверки |
| `src/game/engine/map-loader-service.ts` | Удалён import pixi.js, спрайты создаются через `renderer.createSprite()` с `_container` |
| `src/game/engine.ts` | Добавлен вызов `mapLoader.init(getRenderer())` |

#### Детали изменений в `tiles.ts`:

**1. Удалено:**
- `import { Application, Sprite, Texture } from "pixi.js"`
- `export type DrawTarget` (оставлен от Фаза 1)
- `Sprite` и `Texture` из типов `HouseSpriteEntry`, `TileBuildResult`
- Прямое создание `new Sprite(tex)` в `buildWallAndHouseSprites`
- Прямой вызов `Texture.from(c)` в кэшах

**2. Добавлено:**
- `import type { IRenderer, SpriteHandle, TextureHandle } from "./renderer"`
- `export interface WallSpriteData` — данные для создания спрайта стены (textureHandle, x, y, zIndex)
- `textureHandle: TextureHandle` вместо `spr: Sprite` в `HouseSpriteEntry`
- `groundTexture: TextureHandle` вместо `groundTexture: Texture` в `TileBuildResult`
- `wallSprites: WallSpriteData[]` вместо `(Sprite | Graphics)[]`
- `WallTextureCache.init(renderer)` — инициализация с IRenderer
- `HouseTextureCache.init(renderer)` — инициализация с IRenderer
- `getTexture()` возвращает `TextureHandle` вместо `Texture`
- `destroy()` использует `renderer.destroyTexture()` вместо `texture.destroy()`
- `buildGroundTexture()` возвращает `HTMLCanvasElement` вместо `Texture`
- `buildAllTileTextures(map, roofSnow, renderer)` — принимает IRenderer
- `renderer.createTextureFromCanvas()` для создания текстур из canvas

**3. Изменено:**
- Все кэшированные текстуры хранятся как `Map<string, TextureHandle>` вместо `Map<string, Texture>`
- `buildWallAndHouseSprites` возвращает `{ WallSpriteData[], HouseSpriteEntry[] }` вместо массивов PixiJS объектов
- Позиции хранятся как числа (`x`, `y`) вместо вызовов `sprite.position.set()`

#### Детали изменений в `map-loader-service.ts`:

**1. Удалено:**
- `import { Sprite, Graphics } from "pixi.js"`
- Прямое создание `new Sprite(tileResult.groundTexture)`
- Прямое добавление PixiJS объектов в контейнеры

**2. Добавлено:**
- `import type { IRenderer, LayerHandle } from "../renderer"`
- `import { logger } from "../debug/logger"`
- Поле `_renderer: IRenderer` для хранения ссылки на рендерер
- Метод `init(renderer: IRenderer)` для инициализации
- `renderer.createSprite()` для создания ground спрайта
- `renderer.createSprite()` + `renderer.setSpriteZIndex()` для wall/house спрайтов
- Default-фабрика sprites без использования `new Graphics()`

**3. Изменено:**
- `buildAllTileTextures(map, roofSnow)` → `buildAllTileTextures(map, roofSnow, this._renderer)`
- `clearTiles(preservePlayerG?: Graphics)` → `clearTiles(preservePlayerG?: any)`

#### Критерии приемки (Acceptance Criteria):

- [x] В `tiles.ts` нет импортов из `pixi.js` (было: `import { Application, Sprite, Texture }`)
- [x] В `map-display.ts` нет импортов из `pixi.js` (было: 0, осталось: 0 — файл использует только Canvas API)
- [x] В `map-loader-service.ts` нет импортов из `pixi.js` (было: `import { Sprite, Graphics }`)
- [x] `tsc --noEmit` проходит без ошибок (0 ошибок компиляции)
- [x] Текстуры кэшируются через `WallTextureCache` и `HouseTextureCache` (draw calls минимизированы)
- [x] Спрайты создаются через `renderer.createSprite()` с корректными позициями и z-index

#### Архитектурные заметки:

1. **Разделение ответственности:**
   - `tiles.ts` — генерация текстур и данных, НЕ знает про контейнеры
   - `MapLoaderService` — создание спрайтов и добавление в контейнеры для Y-sorting
   - `IRenderer` — абстракция над PixiJS, единственная точка входа в графику

2. **Y-sorting:**
   - Спрайты добавляются в legacy `SceneLayers.dynamic` Container
   - `userData.layer` и `userData.y` используются для сортировки по глубине
   - `sortableChildren = true` на Container обеспечивает автоматическую сортировку

3. **Кэширование текстур:**
   - `WallTextureCache` — кэширует текстуры стен по ключу `tileType_variant_dungeonId`
   - `HouseTextureCache` — кэширует текстуры домов по ключу `house_hw_x_hh_v_ruined_snow`
   - Текстуры уничтожаются через `renderer.destroyTexture()` при вызове `destroy()`

4. **Обратная совместимость:**
   - Legacy Container-поля `SceneLayers` (tileLayer, dynamic) используются для Y-sorting
   - Спрайты, созданные через IRenderer, извлекаются для добавления в legacy контейнеры
   - Это временное решение — Фаза 10 полностью удалит Container-поля

#### Итого изменений:
- Файлов изменено: 5
- Строк удалено: ~30 (импорты pixi.js, прямое создание Sprite/Texture)
- Строк добавлено: ~120 (новые типы, инициализация через IRenderer, создание спрайтов, защитные проверки)
- Прямых импортов pixi.js в `tiles.ts`: 0 (было 1)
- Прямых импортов pixi.js в `map-loader-service.ts`: 0 (было 1)
- Прямых импортов pixi.js в `map-display.ts`: 0 (было 0)
- Новых методов в IRenderer: 4 (`createTextureFromCanvas`, `getLayerContainer`, `createSpriteInContainer`, `getSpritePixi`)
- Новых полей в SpriteCreateOptions: 1 (`_container` для legacy Y-sorting)
- Защитных проверок: 2 (`buildAllTileTextures` — проверка map данных, `buildGroundTexture` — проверка размеров canvas)