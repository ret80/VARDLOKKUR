# План рефакторинга ECS-архитектуры (переход на AoS и отказ от префабов)

## 📋 Контекст и анализ репозитория (VARDLOKKUR)
Изучив код проекта (`src/game/ecs/ecs-world.ts`, `entity-factory.ts`, `ecs-components.ts`, `debug-api.ts`), я выявил корневые причины текущих проблем:
1. **Проблема с `hasComponent` и `addComponents`**: Компоненты создаются вручную как объекты с `Float32Array` и `Uint8Array` (SoA), но **не регистрируются** в `bitecs` через `defineComponent`. Из-за этого `bitecs` не обновляет битовые маски сущностей (entityMasks), и `hasComponent` не работает, а `addComponents` не регистрирует компоненты.
2. **Архитектура префабов**: Ручное копирование значений через `CLONEABLE_FIELDS` из `prefabWorld` в `gameWorld` обходит вызов `addComponents` для нового мира, что еще сильнее ломает трекинг компонентов в `bitecs`.
3. **Сложность `debug-api.ts`**: В `debug-api.ts` используются костыли (`as any`, fallback-проверки SoA массивов), чтобы компенсировать отсутствие регистрации компонентов.

---

## ⚠️ Обязательное правило отчетности
**После завершения каждого этапа ты обязан добавлять подробный отчет о проделанной работе в файл `REPORT.md` в корне проекта.** 
Формат отчета:
```markdown
### Этап [Номер]: [Название]
- **Статус:** Выполнено
- **Измененные файлы:** [Список файлов]
- **Описание изменений:** [Что конкретно было сделано, какие архитектурные решения приняты]
- **Следующие шаги:** [Краткое описание того, что нужно делать дальше]
```

---

## 🚀 Пошаговый план выполнения (отсортирован по приоритету)

### Этап 1: Архитектурный переход на AoS (Array of Structures) и регистрация в `bitecs`
**Приоритет:** Критический (Без этого шага `bitecs` не будет работать корректно).
**Инструкция для агента:**
Твоя задача — переписать `src/game/ecs/ecs-components.ts`. Перестань использовать ручные `Float32Array` и `Uint8Array`. Используй `bitecs.defineComponent()` для регистрации маркеров и создай массивы объектов (AoS) для хранения данных.

*Пример трансформации:*
```typescript
// ❌ БЫЛО (SoA без регистрации)
export const Position = {
  x: new Float32Array(10000),
  y: new Float32Array(10000),
} as const;

// ✅ ДОЛЖНО СТАТЬ (AoS + регистрация в bitecs)
import { defineComponent } from 'bitecs';
export const Position = defineComponent(); // bitecs теперь знает об этом компоненте
export const Positions: { x: number; y: number }[] = []; // Array of Structures
```
Сделай это для всех компонентов (`Velocity`, `Health`, `Enemy`, `Player`, `Projectile`, `Drop` и т.д.).
Для маркерных компонентов (например, `Dead`, `Magnet`) используй `defineComponent()` и храни булевы значения в массиве (например, `DeadFlags: boolean[]`) или просто полагайся на `hasComponent(world, Dead, eid)`.
**Удали** вспомогательные функции `setSoA`, `getSoA`, `setSoANum`, `getSoANum` — они больше не нужны.

**Критерии успеха:** 
- В `ecs-components.ts` отсутствуют ручные `Float32Array`/`Uint8Array`. 
- Все компоненты зарегистрированы через `defineComponent`.
- Созданы AoS-массивы для хранения данных.
- **Добавлен отчет в `REPORT.md`.**

---

### Этап 2: Устранение мира префабов (Prefab World) и клонирования
**Приоритет:** Высокий.
**Инструкция для агента:**
Полностью удали концепцию `prefabWorld` и ручного клонирования. Объектов в игре <1000, поэтому создание сущностей "с нуля" напрямую в игровом мире не повлияет на производительность, но решит проблему отсутствия вызова `addComponents`.

1. В `src/game/ecs/ecs-world.ts` удали функции `createPrefabWorld()`, `getPrefabWorld()`, `destroyPrefabWorld()` и переменную `_prefabWorld`.
2. В `src/game/ecs/entity-factory.ts`:
   - Удали `prefabWorld` из конструктора класса `EntityFactory`.
   - Удали метод `initPrefabs()` и все методы создания префабов (`createPlayerPrefab`, `createEnemyPrefabs` и т.д.).
   - Удали массив `CLONEABLE_FIELDS` и метод `cloneComponentFields()`.
   - Удали метод `clonePrefab()`.
3. Перепиши фабричные методы (`createPlayer`, `createEnemy`, `createProjectile` и др.), чтобы они напрямую создавали сущности:
```typescript
const eid = addEntity(this.gameWorld);
addComponents(this.gameWorld, eid, Position, Health, Velocity); // Регистрация в bitecs!
Positions[eid] = { x, y };
Healths[eid] = { current: hp, max: hp };
```
**Критерии успеха:**
- В коде нет упоминаний `prefabWorld`, `clonePrefab`, `CLONEABLE_FIELDS`.
- Все сущности создаются через `addEntity` и `addComponents`.
- **Добавлен отчет в `REPORT.md`.**

---

### Этап 3: Обновление ECS-систем (Systems)
**Приоритет:** Высокий.
**Инструкция для агента:**
Адаптируй все системы в папке `src/game/ecs/ecs-systems/` под новую AoS архитектуру. Тебе нужно заменить все обращения к SoA массивам на обращения к массивам объектов.

*Примеры изменений:*
```typescript
// ❌ БЫЛО
Position.x[eid] += Velocity.x[eid] * dt;
Health.current[eid] -= dmg;
if (Dead[eid]) { ... }

// ✅ СТАЛО
Positions[eid].x += Velocities[eid].x * dt;
Healths[eid].current -= dmg;
if (hasComponent(world, Dead, eid)) { ... } // или проверка DeadFlags[eid]
```
Пройдись по всем системам: `movement-system.ts`, `combat-system.ts`, `ai-system.ts`, `life-system.ts`, `physics-system.ts` и другим. Убедись, что при итерации по результатам `query()` ты корректно читаешь и записываешь данные в AoS массивы.

**Критерии успеха:**
- Код во всех файлах `ecs-systems` компилируется без ошибок TypeScript.
- Обращения к SoA массивам полностью заменены на AoS.
- **Добавлен отчет в `REPORT.md`.**

---

### Этап 4: Рефакторинг `debug-api.ts` и Debug Panel
**Приоритет:** Средний.
**Инструкция для агента:**
Файл `src/game/debug/debug-api.ts` содержит много костылей (`as any`, проверки SoA массивов), которые компенсировали отсутствие регистрации компонентов. Теперь, когда компоненты зарегистрированы через `defineComponent`, `bitecs` корректно отслеживает их битовые маски.

1. **Исправь `hasComponent`:** Убери все `as any` и fallback-проверки. Вызов `hasComponent(world, Position, eid)` теперь будет работать "из коробки".
2. **Обнови чтение данных:** Замени чтение из SoA на чтение из AoS.
```typescript
// ❌ БЫЛО
if (hasComponent(world, Health as any, eid)) {
  entity.health = { current: Health.current[eid], max: Health.max[eid] };
}

// ✅ СТАЛО
if (hasComponent(world, Health, eid)) {
  entity.health = { current: Healths[eid].current, max: Healths[eid].max };
}
```
3. Обнови функции `getPlayerState`, `getEnemiesState`, `getWorldDump` и `inspectEntity`, чтобы они корректно формировали JSON-объекты из AoS массивов.
4. Проверь `src/components/DebugPanel.tsx` на предмет прямого парсинга SoA-структур и обнови его при необходимости.

**Критерии успеха:**
- `debug-api.ts` компилируется без использования `as any` для компонентов.
- Функции инспекции возвращают корректный JSON без ошибок и `undefined`.
- **Добавлен отчет в `REPORT.md`.**

---

### Этап 5: Обновление `ecs-bridge.ts`, рендерера и финальная очистка
**Приоритет:** Завершающий.
**Инструкция для агента:**
Заверши миграцию, обновив мосты между ECS и движком (графика, физика), и очисти проект.

1. Обнови `src/game/ecs/ecs-bridge.ts` (создание спрайтов и физических тел), чтобы он брал координаты из `Positions[eid]`.
2. Обнови `src/game/renderers/ecs-mappers.ts` и `render-system.ts`.
3. Удали неиспользуемые импорты, закомментированный код, старые типы (`ArrayComponent`, `CloneableField`, `PrefabRegistry`).
4. **Финальное тестирование:**
   - Запусти игру.
   - Проверь спавн игрока, врагов и снарядов.
   - Открой Debug Panel, выбери сущность и убедись, что `inspectEntity` показывает корректные компоненты и их значения (Position, Health, Enemy state и т.д.).

**Критерии успеха:**
- Игра запускается без ошибок в консоли.
- Игровой процесс (движение, бой, спавн) работает корректно.
- Debug Panel показывает актуальный дамп мира.
- **Финальный отчет о завершении всех работ добавлен в `REPORT.md`.**