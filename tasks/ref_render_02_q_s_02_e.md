Ниже представлен **детальный промпт и пошаговый план для ИИ-агента (Cursor, Copilot, Devin)** для выполнения **Этапа 2: Кэширование рендереров объектов и создание Реестров (Singleton Registries)**. 

Этот план написан так, чтобы его можно было скопировать и отправить ИИ-агенту. Он содержит точные инструкции, архитектурные решения и критерии приемки.

---

# 🤖 Промпт для ИИ-агента: Этап 2 Рефакторинга Рендеринга

**Контекст:** Мы проводим рефакторинг системы рендеринга в PixiJS/ECS игре. Главная проблема текущего `render-system.ts` — создание экземпляров классов рендереров (`new ChestRenderer()`, `new PlayerRenderer()`) **внутри игрового цикла (каждый кадр)**. Это вызывает утечки памяти и лишнюю нагрузку на Garbage Collector.
**Цель Этапа 2:** Превратить все рендереры объектов и игрока в синглтоны, зарегистрировать их в `RendererRegistry` и переписать `render-system.ts` так, чтобы он брал готовые экземпляры из реестра. Также мы объединим разрозненные функции отрисовки статики в единый диспетчер `renderObjectsEcs`.

---

## 📋 Пошаговый план выполнения (Step-by-Step)

### Шаг 2.1. Подготовка и проверка интерфейсов
**Задача:** Убедиться, что базовый интерфейс рендерера и класс реестра готовы к использованию.
1. Открой `src/game/renderers/core/types.ts` (или где у вас определен `Renderer<TData>`). Убедись, что интерфейс выглядит примерно так:
   ```typescript
   export interface RenderContext { time: number; [key: string]: any; }
   export interface Renderer<TData> {
       render(spriteRef: any, data: TData, ctx: RenderContext): void;
   }
   ```
2. Открой `src/game/renderers/core/registry.ts`. Если там нет метода `getOrThrow`, добавь его:
   ```typescript
   export class RendererRegistry<TKey extends string, TData> {
       private map = new Map<TKey, Renderer<TData>>();
       register(key: TKey, renderer: Renderer<TData>): this {
           this.map.set(key, renderer); return this;
       }
       get(key: TKey): Renderer<TData> | undefined { return this.map.get(key); }
       getOrThrow(key: TKey): Renderer<TData> {
           const r = this.map.get(key);
           if (!r) throw new Error(`Renderer for "${key}" not found in registry`);
           return r;
       }
   }
   ```

### Шаг 2.2. Создание Реестра Объектов (Object Registry)
**Задача:** Создать единый файл-синглтон, который инициализирует все рендереры окружения **один раз** при старте.
1. **Создай файл:** `src/game/renderers/objects/objectRegistry.ts`
2. **Напиши код:**
   ```typescript
   import { RendererRegistry } from "../core/registry";
   import { ChestRenderer } from "./ChestRenderer";
   import { PedestalRenderer } from "./PedestalRenderer";
   import { ShrineRenderer } from "./ShrineRenderer";
   import { DoorRenderer } from "./DoorRenderer";
   import { BarrierRenderer } from "./BarrierRenderer";
   import { AltarRenderer } from "./AltarRenderer";

   // Создаем и регистрируем экземпляры ОДИН РАЗ
   export const objectRegistry = new RendererRegistry<string, any>()
       .register("chest", new ChestRenderer())
       .register("pedestal", new PedestalRenderer())
       .register("shrine", new ShrineRenderer())
       .register("door", new DoorRenderer())
       .register("barrier", new BarrierRenderer())
       .register("altar", new AltarRenderer());
   ```

### Шаг 2.3. Создание Синглтона Игрока
**Задача:** Игрок один, реестр ему не нужен, но `new PlayerRenderer()` каждый кадр — это зло.
1. **Создай файл:** `src/game/renderers/player/playerRendererInstance.ts`
2. **Напиши код:**
   ```typescript
   import { PlayerRenderer } from "./PlayerRenderer";
   export const playerRenderer = new PlayerRenderer();
   ```

### Шаг 2.4. Рефакторинг `render-system.ts` (Удаление `new` и объединение)
**Задача:** Переписать `render-system.ts`. Удалить все вызовы `new ...Renderer()`. Объединить функции `renderChestsEcs`, `renderPedestalsEcs` и т.д. в одну элегантную функцию `renderObjectsEcs`.

1. **Импорты:** Добавь в начало `render-system.ts`:
   ```typescript
   import { objectRegistry } from '../../renderers/objects/objectRegistry';
   import { playerRenderer } from '../../renderers/player/playerRendererInstance';
   // Убедись, что импортированы мапперы из ecs-mappers.ts (из Этапа 1)
   import { eidToChestData, eidToPedestalData, eidToShrineData, eidToDoorData, eidToBarrierData, eidToAltarData } from '../../renderers/ecs-mappers';
   ```

2. **Удали старые функции:** Найди и удали функции `renderChestsEcs`, `renderPedestalsEcs`, `renderShrinesEcs`, `renderDoorsEcs`, `renderBarrierEcs`, `renderAltarEcs`.

3. **Создай новую функцию `renderObjectsEcs`:**
   ```typescript
   type ObjectQueryConfig = {
       components: any[];      // ECS компоненты для query
       key: string;            // Ключ в objectRegistry
       mapper: (eid: number, world: World) => any; // Функция маппер
   };

   // Конфигурация всех статических объектов
   const OBJECT_QUERIES: ObjectQueryConfig[] = [
       { components: [SpriteComp, Chest], key: "chest", mapper: eidToChestData },
       { components: [SpriteComp, Pedestal], key: "pedestal", mapper: eidToPedestalData },
       { components: [SpriteComp, Shrine], key: "shrine", mapper: eidToShrineData },
       { components: [SpriteComp, Door], key: "door", mapper: eidToDoorData },
       { components: [SpriteComp, Barrier], key: "barrier", mapper: eidToBarrierData },
       { components: [SpriteComp, Altar], key: "altar", mapper: eidToAltarData },
   ];

   function renderObjectsEcs(world: World, ctx: RenderContext) {
       for (const config of OBJECT_QUERIES) {
           const renderer = objectRegistry.getOrThrow(config.key);
           for (const eid of query(world, config.components)) {
               const ref = getSpriteRef(eid); // предполагается, что эта функция есть
               if (!ref) continue;
               
               const data = config.mapper(eid, world);
               renderer.render(ref, data, ctx);
           }
       }
   }
   ```

4. **Исправь `renderPlayerEcs`:**
   Найди функцию `renderPlayerEcs` и замени создание инстанса на использование синглтона:
   ```typescript
   function renderPlayerEcs(world: World, playerEid: number, ctx: RenderContext) {
       if (playerEid < 0) return;
       const ref = getSpriteRef(playerEid);
       if (!ref) return;
       const data = eidToPlayerRenderData(playerEid, world);
       
       // БЫЛО: const renderer = new PlayerRenderer();
       // СТАЛО:
       playerRenderer.render(ref, data, ctx); 
   }
   ```

5. **Обнови главный цикл отрисовки:**
   Найди место, где вызывались старые функции (например, `renderChestsEcs(world, ctx)`), и замени их все на один вызов:
   ```typescript
   renderObjectsEcs(world, ctx);
   ```

### Шаг 2.5. Очистка и проверка (Verification)
**Задача:** Убедиться, что мусор удален, а код компилируется.

---

## ✅ Критерии успешности (Checklist для ИИ-агента)

После выполнения шагов, ИИ-агент должен выполнить следующие проверки в терминале и отчитаться:

1. **Проверка отсутствия `new` в циклах:**
   ```bash
   grep -rn "new .*Renderer()" src/game/ecs/ecs-systems/render-system.ts
   ```
   *Ожидаемый результат:* Пусто (или 0 совпадений).

2. **Проверка использования реестра:**
   ```bash
   grep -rn "objectRegistry.get" src/game/ecs/ecs-systems/render-system.ts
   ```
   *Ожидаемый результат:* Должно быть найдено использование внутри `renderObjectsEcs`.

3. **Компиляция TypeScript:**
   ```bash
   npx tsc --noEmit
   ```
   *Ожидаемый результат:* 0 ошибок.

4. **Визуальная проверка (Manual QA):**
   * Запустить игру.
   * Убедиться, что сундуки, пьедесталы, алтари, двери отрисовываются на своих местах.
   * Убедиться, что игрок отрисовывается и анимируется.
   * Открыть DevTools -> Memory -> Allocation instrumentation on timeline. Записать профиль на 10 секунд. Сравнить с бейзлайном: **количество аллокаций объектов (GC nodes) в кадре должно радикально упасть**.

---

## ⚠️ Важные замечания для ИИ-агента (Edge Cases)

1. **Контекст `this`:** Если внутри старых рендереров (например, `ChestRenderer`) использовался `this` для хранения состояния между кадрами (что само по себе антипаттерн для чистых рендереров, но бывает), превращение их в синглтоны может вызвать баги, если состояние "перетекает" между разными сундуками. 
   * *Решение:* Убедись, что рендереры **Stateless** (не хранят состояние конкретных сущностей внутри себя). Все данные должны приходить через аргумент `data` и `spriteRef`.
2. **Сортировка (Z-Index):** Убедись, что объединение функций в `renderObjectsEcs` не сломало порядок отрисовки (z-index/sortableChildren). В PixiJS за это обычно отвечает `y` координата и `zIndex` у `Sprite`, а не порядок вызова `render()`, но стоит проверить.
3. **Импорты Мапперов:** Если в `render-system.ts` остались локальные копии мапперов (из-за проваленного Этапа 1), **немедленно удали их** и используй только импорты из `renderers/ecs-mappers.ts`.

---
*Конец промпта. ИИ-агент, приступай к выполнению. По завершении предоставь diff измененных файлов и результаты grep-проверок.*