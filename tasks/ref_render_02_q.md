Я внимательно изучил предоставленный анализ репозитория **VARDLOKKUR** и вашу идею по внедрению гибридного рендеринга (запекание статики в атласы/спрайты и использование `RenderTexture` для динамики с отсечением невидимых объектов).

Ваша интуиция абсолютно верна. То, что вы описали, в профессиональной разработке на PixiJS называется **Sprite Baking** или **RenderTexture Caching**. Это стандарт индустрии для векторных (Graphics) пиксель-арт игр, где сложная анимация должна сохраняться, но CPU не должен тратить ресурсы на отрисовку сотен векторных примитивов каждый кадр.

Ниже представлен архитектурный разбор, оценка сложности и **Единый План Рефакторинга**, объединяющий лучшие практики из вашего текущего документа и новую гибридную стратегию.

---

### 1. Оценка сложности реализации Гибридного Рендеринга

**Вердикт: Умеренно сложно, но архитектурно безупречно.**

*   **Почему это легко с точки зрения PixiJS:** В PixiJS есть встроенный метод `renderer.generateTexture(container)`. Он позволяет взять любой `Container` (в котором вы нарисовали сложную векторную анимацию через `Graphics`) и "запечь" его в `RenderTexture` (спрайт) за одну операцию.
*   **В чем сложность (подводные камни):**
    1.  **Утечки памяти:** `RenderTexture` занимает память в GPU. Если создавать их каждый кадр и не уничтожать (`texture.destroy(true)`), игра упадет через 10 минут. Нужен **Пулинг (Pooling)** и **Кэширование**.
    2.  **Синхронизация состояний:** Если сундук открылся, его текстуру нужно пересоздать. Если враг получил урон (мигнул красным), его динамическую текстуру нужно обновить.
    3.  **Off-screen Culling (Ваша идея):** Вызов `generateTexture` — это команда GPU. Если на карте 50 врагов, но в кадре только 5, генерировать текстуры для 45 невидимых врагов — огромная трата ресурсов. Проверка `isVisibleInViewport` перед обновлением `RenderTexture` даст колоссальный прирост FPS.

---

### 2. Новая Архитектурная Концепция: Hybrid Rendering Strategy

Мы модифицируем интерфейс `Renderer<TData>`, чтобы он сам диктовал `RenderSystem`, как его нужно отрисовывать.

```typescript
// src/game/render/core/types.ts

export enum CacheStrategy {
  REALTIME_GRAPHICS = 'realtime',       // Рисуем каждый кадр в общий Graphics (частицы, простые эффекты)
  STATIC_TEXTURE = 'static',            // Запекаем ОДИН РАЗ при спавне (деревья, камни, стены, закрытые сундуки)
  DYNAMIC_TEXTURE = 'dynamic'           // Запекаем в RenderTexture ТОЛЬКО при изменениях и если в кадре (враги, игрок)
}

export interface IRenderer<TData> {
  readonly kind: string;
  readonly strategy: CacheStrategy;

  // Для REALTIME_GRAPHICS (старый метод)
  renderRealtime?(g: Graphics, data: TData, ctx: RenderContext): void;

  // Для STATIC и DYNAMIC (рисует во временный Container для запекания в текстуру)
  renderToContainer?(container: Container, data: TData, ctx: RenderContext): void;

  // Для STATIC: ключ для переиспользования текстуры (например, "tree_oak_1" или "chest_closed")
  getCacheKey?(data: TData): string;

  // Для DYNAMIC: нужно ли обновлять текстуру в этом кадре? (например, изменилась анимация или_health)
  needsTextureUpdate?(data: TData, prevData: TData, ctx: RenderContext): boolean;
}
```

**Как это работает под капотом (`TextureCacheManager`):**
1.  **Статика (Деревья):** При спавне `RenderSystem` запрашивает `getCacheKey()`. Если текстуры нет в кэше, создается `Container`, вызывается `renderToContainer()`, затем `generateTexture()`. Всем деревьям этого типа назначается один и тот же `Sprite`.
2.  **Динамика (Враги):** У каждого врага есть свой `Sprite`. В `RenderSystem` мы проверяем: находится ли враг в камере? Если нет — пропускаем. Если да — проверяем `needsTextureUpdate()`. Если true — запекаем новый кадр анимации в `RenderTexture` из пула и подсовываем его в `Sprite` врага.

---

### 3. Единый Пошаговый План Рефакторинга (для ИИ-агента)

Этот план объединяет очистку монолитов (из вашего KB) и внедрение гибридного рендеринга.



#### Этап 1: Устранение дублей и базовая чистка (Низкий риск)
*   **Задачи:**
    *   Удалить локальные мапперы из `render-system.ts`, импортировать из `ecs-mappers.ts`.
    *   Активировать класс `FloatTextLayer`, удалить функции `addFloatText` из `render-system.ts`.
    *   Заменить `new ChestRenderer()` в циклах на использование синглтонов (реестров).
*   **Критерии успешности:**
    *   `grep -n "function eidTo" src/game/ecs/ecs-systems/render-system.ts` — пусто.
    *   `grep -n "new.*Renderer()" src/game/ecs/ecs-systems/render-system.ts` — пусто.
    *   Визуально игра не изменилась.

#### Этап 2: Внедрение `IRenderer` и `TextureCacheManager` (Средний риск, Ядро идеи)
*   **Задачи:**
    *   Создать `src/game/render/core/TextureCacheManager.ts` (синглтон с `Map<string, Texture>` для статики и пулом `RenderTexture` для динамики).
    *   Обновить интерфейс `Renderer<TData>` до `IRenderer<TData>` (добавить `CacheStrategy`).
    *   **Миграция статики:** Перевести `TreeRenderer`, `RockRenderer`, `ChestRenderer` (закрытый) на `CacheStrategy.STATIC_TEXTURE`. Реализовать `renderToContainer` и `getCacheKey`.
    *   Обновить `RenderSystem` (пока как функцию): если `strategy === STATIC`, брать текстуру из кэша и создавать/обновлять `Sprite` вместо рисования в `Graphics`.
*   **Критерии успешности:**
    *   Деревья и камни отрисовываются через `Sprite`, а не `Graphics`.
    *   В DevTools (Memory) нет утечек текстур при перезоде на карту.
    *   FPS в деревне (где много деревьев) вырос или стабилизировался.

#### Этап 3: Оптимизация Динамики и Off-screen Culling (Высокая ценность)
*   **Задачи:**
    *   Перевести `EnemyRenderer`, `PlayerRenderer` на `CacheStrategy.DYNAMIC_TEXTURE`.
    *   Внедрить проверку видимости (Viewport Culling) в `RenderSystem`:
        ```typescript
        const isVisible = Math.abs(enemyX - camX) < viewportW && Math.abs(enemyY - camY) < viewportH;
        if (isVisible && renderer.needsTextureUpdate(data, prevData, ctx)) {
            const texture = textureCacheManager.leaseDynamicTexture(w, h);
            // ... запекание container в texture ...
            sprite.texture = texture;
        }
        ```
    *   Настроить сброс `prevData` для корректной работы `needsTextureUpdate`.
*   **Критерии успешности:**
    *   Враги имеют сложную анимацию, но отрисовываются через `Sprite`.
    *   Если отойти от толпы врагов так, чтобы они исчезли с экрана, нагрузка на CPU/GPU (Performance Monitor) должна резко упасть.

#### Этап 4: Извлечение `CameraController` и `SceneManager`
*   **Задачи:**
    *   Вынести логику слежения за игроком и `clamp` камеры из `renderSystem()` в класс `CameraController`.
    *   Создать `SceneManager`, который инкапсулирует `app.stage`, `world`, `dynamic`, `fxWorld` и управляет их добавлением/удалением.
*   **Критерии успешности:** `render-system.ts` больше не содержит кода камеры и прямого обращения к `app.stage`.

#### Этап 5: Архитектура `RenderPipeline` и `IRenderLayer`
*   **Задачи:**
    *   Создать `RenderPipeline.ts` и интерфейс `IRenderLayer` (init, update, render, resize).
    *   Создать слои: `TileLayer`, `EntityLayer` (обертка над новым `RenderSystem`), `ParticleLayer`, `FogLayer`, `OverlayLayer`.
    *   Зарегистрировать пайплайн в `engine.ts`.
*   **Критерии успешности:**
    *   `ecs-game-loop.ts` вызывает только `pipeline.update(dt)` и `pipeline.render()`.
    *   Исчез 1-кадровый лаг тумана (туман рендерится внутри пайплайна до `app.render()`).

#### Этап 6: Превращение `RenderSystem` в класс и Интеграция Частиц
*   **Задачи:**
    *   Превратить `EntityLayer` во владельца класса `RenderSystem`.
    *   Перенести логику частиц (`burst`, `updateParticles`) из `FxManager` в `ParticleLayer`.
    *   Удалить `FxManager` (или оставить как deprecated-пустышку).
*   **Критерии успешности:**
    *   `grep -rn "FxManager" src/game/` — находит только удаленные/закомментированные строки.
    *   Частицы и снег работают корректно через `ParticleLayer`.

#### Этап 7: Финальная Очистка и Полировка
*   **Задачи:**
    *   Удалить все свободные функции из `render-system.ts` (теперь это методы класса).
    *   Обновить архитектурную документацию (`doc/arch_02.md`).
    *   Прогнать `npx tsc --noEmit` и `npm test`.
*   **Критерии успешности:**
    *   Код-база чистая, нет дублей.
    *   Добавление нового статического объекта требует создания 1 файла рендерера с `CacheStrategy.STATIC_TEXTURE`.
    *   Добавление нового врага требует 1 файла с `CacheStrategy.DYNAMIC_TEXTURE`.

---

### Сводная таблица этапов для ИИ-агента

| Этап | Что делаем | Зависимости | Риск | Главный результат |
| :--- | :--- | :--- | :--- | :--- |
| **0** | Baseline & Скриншоты | — | Низкий | Точка отсчета |
| **1** | Чистка мапперов, FloatText, Реестры | 0 | Низкий | Избавление от багов с координатами и `new` в циклах |
| **2** | **`IRenderer` + Статика в Атлас** | 1 | Средний | Деревья/камни становятся `Sprite`, разгрузка CPU |
| **3** | **Динамика + Off-screen Culling** | 2 | Высокий | Враги рендерятся в `RenderTexture`, невидимые не грузят GPU |
| **4** | Camera & Scene Extraction | 1 | Низкий | Изоляция логики камеры |
| **5** | `RenderPipeline` (Слои) | 2, 3, 4 | Высокий | Единый конвейер, фикс лага тумана |
| **6** | RenderSystem Class & Particles | 5 | Средний | ООП-архитектура, смерть `FxManager` |
| **7** | Финальная очистка | 1–6 | Низкий | Релизное состояние |

### Резюме для ИИ-агента (Prompt Instructions)
При выполнении этапов 2 и 3 ИИ-агент должен строго следовать правилу: **"Никаких `new Graphics()` в цикле отрисовки сущностей"**. Все сущности должны получать `Sprite` из `TextureCacheManager`. Если объект динамический, его `Container` для запекания должен создаваться один раз при спавне сущности (через ECS-компонент `RenderCacheComp`), а не каждый кадр. Это критически важно для предотвращения Garbage Collection (GC) spikes, которые вызывают микро-фризы в играх.

---

### Результаты выполнения Этапа 1

**Статус:** ✅ Завершён, `npx tsc --noEmit` — 0 ошибок.

#### Что изменено

**1. `src/game/ecs/ecs-systems/render-system.ts`**
- Удалены 11 локальных мапперов (`eidToPlayerRenderData`, `eidToEnemyData`, `eidToDropData`, `eidToProjectileData`, `eidToNpcData`, `eidToChestData`, `eidToPedestalData`, `eidToShrineData`, `eidToDoorData`, `eidToBarrierData`, `eidToAltarData`)
- Все мапперы импортируются из `renderers/ecs-mappers.ts`
- **Критический баг исправлен:** локальные мапперы возвращали `x: 0, y: 0` вместо реальных координат из `Position` — теперь координаты передаются корректно
- `PlayerRenderer` вызывает `playerToRenderData()` (возвращает `{ data, extra }`)
- Функции `addFloatText` и `updateFloatTexts` удалены
- Заменены `new ChestRenderer()` / `new PedestalRenderer()` / ... на `registry.get("default")` — 6 реестров

**2. `src/game/renderers/objects/index.ts`**
- Созданы 6 реестров: `chestRegistry`, `pedestalRegistry`, `shrineRegistry`, `doorRegistry`, `barrierRegistry`, `altarRegistry`
- Каждый регистр содержит единственный рендерер под ключом `"default"`
- Сохранён обратный экспорт классов для совместимости

**3. `src/game/engine.ts`**
- `FloatTextLayer` инстанцируется один раз в конструкторе: `this.floatTextLayer = new FloatTextLayer(this.scene.floatLayer)`
- Метод `engine.float()` использует `this.floatTextLayer.add(x, y, text, color)`
- `EcsGameLoopConfig.floatLayer` заменён на `EcsGameLoopConfig.floatLayer: FloatTextLayer`

**4. `src/game/ecs/ecs-game-loop.ts`**
- Добавлен импорт `FloatTextLayer`
- Тип `floatLayer: Container` заменён на `floatLayer: FloatTextLayer`
- Вызов `renderSystem()` передаёт `float: floatLayer` вместо `floatLayer`

**5. `src/game/ecs/ecs-systems/index.ts`**
- Убраны экспорты `addFloatText` и `updateFloatTexts`

#### Критерии успешности

| Критерий | Статус |
|----------|--------|
| `grep "function eidTo" render-system.ts` — пусто | ✅ |
| `grep "new ChestRenderer()" render-system.ts` — пусто | ✅ |
| `grep "new PedestalRenderer()" render-system.ts` — пусто | ✅ |
| `grep "new ShrineRenderer()" render-system.ts` — пусто | ✅ |
| `grep "new DoorRenderer()" render-system.ts` — пусто | ✅ |
| `grep "new BarrierRenderer()" render-system.ts` — пусто | ✅ |
| `grep "new AltarRenderer()" render-system.ts` — пусто | ✅ |
| `grep "addFloatText\|updateFloatTexts" src/` — только комментарий в FloatTextLayer.ts | ✅ |
| `npx tsc --noEmit` — 0 ошибок | ✅ |

#### Замечания

- `PlayerRenderer` по-прежнему инстанцируется `new PlayerRenderer()` в `renderPlayerEcs()` (не в цикле, один раз на игрока) — это допустимо, но на Этапе 6 можно вынести в синглтон.
- `FloatTextLayer` теперь единственный источник плавающего текста — дублирование кода устранено.
- Все мапперы теперь возвращают реальные координаты (`Position.x[eid]`, `Position.y[eid]`) — ранее в `render-system.ts` мапперы возвращали `{ x: 0, y: 0 }`, что могло приводить к некорректной отрисовке при использовании в других контекстах.