# План рефакторинга системы рендеринга

## Анализ текущего состояния

### Что хорошо ✅
- `RenderSystem` — единая точка оркестрации, все вызовы в одном `tick()`
- Entity renderers — единый паттерн: `data interface + pure draw function + wrapper class`
- `FxManager` — атмосферные эффекты в одном модуле

### Что плохо ⚠️
1. **DialogueSystem зависит от IFxManager** — 3 вызова `this.fx.burst()` напрямую, диалоговая система не должна знать про визуальные эффекты
2. **MapLoader смешивает data + render** — очищает массивы (data), создаёт PixiJS Graphics (render), вызывает renderers (render)
3. **Дублирование 11 рендереров** — RenderSystem и MapLoader создают идентичные экземпляры
4. **Дублирование spawnEnemy колбэка** — в engine.ts два одинаковых колбэка (строки 250-260 и 284-298)
5. **tiles.ts смешивает 4 ответственности** — текстуры земли, стены/дома, мини-карта, большая карта
6. **Владение текстурами неясно** — WallTextureCache/HouseTextureCache в EntityManager, но создаются новые каждый раз

---

## Фаза 1: FX через EventBus (замена IFxManager)

**Проблема:** DialogueSystem напрямую вызывает `this.fx.burst()` в 3 местах (строки 80, 95, 167). Диалоговая система не должна знать про визуальные эффекты.

**Что делаем:**
- Добавить событие `"fx:burst": { x, y, color, n, speed, life, size, grav }` в `GameEvents` (`game-states.ts`)
- В `dialogue-system.ts`: убрать `IFxManager` из конструктора, заменить 3 вызова `this.fx.burst(...)` на `this.bus.emit("fx:burst", ...)`
- В `engine.ts`: убрать передачу `this.fx` в `DialogueSystem`
- В `render-system.ts`: подписаться на `"fx:burst"` → вызывать `this.cfg.fx.burst(...)`
- Удалить `system/fx-manager.ts` (интерфейс IFxManager больше не нужен)

**Файлы:** `game-states.ts`, `dialogue-system.ts`, `engine.ts`, `render-system.ts`, `system/fx-manager.ts` (удалить)

---

## Фаза 2: Разделить MapLoader на MapLoader + MapRenderer

**Проблема:** MapLoader (254 строки) делает три вещи:
1. Очищает массивы сущностей (data loading) ✓
2. Создаёт PixiJS Graphics объекты (rendering) ✗
3. Вызывает renderers.chest.render() (rendering) ✗

Data и rendering смешаны в одном классе.

**Что делаем:**

### MapLoader (data only, ~120 строк)
- Очищает массивы сущностей
- Парсит `map.chests`, `map.npcs`, `map.spawns` и т.д.
- Заполняет GameStore данными
- **Ничего не знает про PixiJS, Graphics, renderers**

### MapRenderer (render only, ~100 строк, новый файл)
- Создаёт Graphics для каждой сущности
- Вызывает `renderers.chest.render()` и т.д.
- Добавляет в dynamic container
- **Не знает про загрузку карты, только "нарисуй сущность"**

### Фабрика сущностей (внутри MapRenderer)
- `createChestGraphics(x, y, opened)` → `{ g: Graphics, data: ChestRt }`
- `createNpcGraphics(x, y, id, name)` → `{ g: Graphics, data: NpcRt }`
- и т.д.

### Убрать дублирование рендереров
RenderSystem (строки 90-102) и MapLoader (строки 30-42) создают идентичные экземпляры 11 renderer-классов.
- RenderSystem отдаёт свои рендереры через геттер `renderers`
- MapRenderer получает их извне

### Убрать дублирование spawnEnemy
В engine.ts (строки 250-260 и 284-298) два одинаковых колбэка `spawnEnemy`.
- EntityManager уже имеет метод `spawnEnemy()` (строка 167)
- Использовать его напрямую, убрать колбэки из конструкторов

**Файлы:** `map-loader.ts`, `map-renderer.ts` (новый), `render-system.ts`, `engine.ts`, `entity-manager.ts`

---

## Фаза 3: Вынести minimap/big map из tiles.ts

**Проблема:** tiles.ts (764 строки) смешивает 4 ответственности:
1. Процедурные текстуры земли (dithering, `buildGroundTexture`)
2. Стены/дома (paintWall, paintHouse, кэши)
3. Мини-карта (`buildMinimapBase`, `drawMinimap`)
4. Большая карта (`buildBigMapBase`, `drawBigMap`)

**Что делаем:**
- Создать `map-display.ts` — перенести `buildMinimapBase`, `drawMinimap`, `buildBigMapBase`, `drawBigMap` + интерфейсы `MinimapOverlays`, `BigMapOverlays`
- `tiles.ts` оставить только для процедурной генерации текстур
- Обновить импорты в `render-system.ts`, `map-loader.ts`, `engine.ts`

**Файлы:** `tiles.ts` (−110 строк), `map-display.ts` (новый, ~120 строк)

---

## Фаза 4: Уточнить владение текстурами

**Проблема:** WallTextureCache/HouseTextureCache живут в EntityManager, но buildAllTileTextures создаёт новые экземпляры каждый раз при смене карты. Влаственность неясна.

**Что делаем:**
- Перенести кэши из EntityManager в RenderSystem (единый владелец)
- EntityManager.buildMapTextures(map) получает кэши через параметры
- MapLoader не владеет кэшами

**Файлы:** `entity-manager.ts`, `render-system.ts`, `engine.ts`

---

## Итоговая архитектура

```
                    ┌──────────┐
                    │  Engine  │  ← оркестратор, ~500 строк
                    └────┬─────┘
         ┌───────────────┼────────────────┐
         ▼               ▼                ▼
   ┌───────────┐  ┌────────────┐  ┌──────────────┐
   │ MapLoader │  │MapRenderer │  │ RenderSystem │  ← единственный мост к PixiJS
   │ (data)    │  │ (render)   │  └──────────────┘
   └───────────┘  └────────────┘         │
         │                               │
         ▼                               ▼
   ┌───────────┐              ┌──────────────┐
   │ GameStore │              │   FxManager  │  ← подписан на fx:burst
   └───────────┘              └──────────────┘
```

**EventBus** — единая шина. DialogueSystem → `fx:burst` → RenderSystem → FxManager. Никаких прямых зависимостей между системами.

---

## Итоговые цифры

| Файл | До | После |
|---|---|---|
| `engine.ts` | 856 строк | ~500 |
| `map-loader.ts` | 254 (data+render) | ~120 (только data) |
| `map-renderer.ts` | — | ~100 (только render) |
| `tiles.ts` | 764 | ~640 |
| `map-display.ts` | — | ~120 |
| `fx-manager.ts` (interface) | 10 | **удалён** |
| `dialogue-system.ts` | зависит от IFxManager | только EventBus |
