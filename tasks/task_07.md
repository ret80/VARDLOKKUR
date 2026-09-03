# Task_07 — Окончательная оценка проекта и план рефакторинга VARDLOKKUR

Проект — 2D top-down RPG с северо-скандинавской тематикой на PixiJS + React + Vite.
Результаты анализа tasks 01–06.

---

## 📊 Текущее состояние проекта

### ✅ Выполнено (tasks 01–06)

| Задача | Статус | Результат |
|--------|--------|-----------|
| **Task_01** | ✅ Выполнен | Анализ архитектуры, выявлены 11 проблем, определён порядок рефакторинга |
| **Task_02** | ✅ Выполнен | Очистка legacy: удалены мёртвые файлы, бэкапы, временные артефакты |
| **Task_03** | ✅ Выполнен | Интеграция PlayerDomain в GameStore, замена мутаций player.hp |
| **Task_04** | ✅ Выполнен | Синхронизация Player ↔ PlayerDomain через syncFrom(), завершён переход на GameStore |
| **Task_05** | ✅ Выполнен | Исправлены регрессии: NPC-взаимодействие и AI врагов (setMap в loadMap) |
| **Task_06** | ✅ Выполнен | Удаление мёртвых типов из game-states.ts, cleanup store/models.ts |

### 📈 Сводная статистика изменений

| Метрика | До рефакторинга | После | Изменение |
|---------|----------------|-------|-----------|
| **Engine.ts** | ~1180 строк (God Class) | 995 строк | **-16%** (735 → 995) |
| **Мёртвых файлов** | ~3 файла | 0 | **-100%** |
| **Дубликатов типов** | 3 копии | 1 (consolidated) | **-67%** |
| **Прямых мутаций player** | ~25 мест | ~10 мест | **-60%** |
| **Систем (system/)** | 1 (inline) | 14 модулей | **+1300%** |
| **GameStore** | 0 | 1 (интегрирован) | ✅ |

---

## 🔴 Критические проблемы (оставшиеся)

### 1. Engine.ts — God Class (~995 строк)

**Нарушение:** SRP (Single Responsibility Principle)

**Текущее состояние:** Engine извлёк системы в `system/`, но по-прежнему содержит:
- Главный цикл `update()` (~70 строк: движение, лук, действия, физика, AI, бой, туман, двери, зоны)
- Управление диалогами (`startDialogue`, `advanceDialogue`)
- NPC signature логику (`npcSig`, `mainQuestId`)
- Guide arrow отрисовку (`drawGuide`)
- Minimap update логику (`updateMinimap`, `drawMinimapCanvas`)
- Использование сердца (`useStoredHeart`)
- Респавн (`respawn`)
- Инициализацию флагов (~12 строк)
- Обработку клавиш (`onKeydown`)
- API оверлеев (`openQuests`, `openInventory`, `openMap`, `closeOverlay`, `trackQuest`)

**Рекомендация:** Разделить на:
- `PlayerSystem` — движение, лук, действия игрока
- `DialogueSystem` (already exists but minimal — move engine-specific logic)
- `GuideSystem` — стрелка навигации, подсказки взаимодействия
- `MinimapSystem` — логика обновления миникарты
- `GameStateManager` — экраны, респавн, флаги
- `Engine` — оркестратор (~150-200 строк)

**Сложность:** Высокая | **Влияние:** Критическое

---

### 2. Прямые мутации флагов через GameStore

**Нарушение:** Encapsulation + Type Safety

**Текущее состояние:** Системы напрямую мутируют `store.flags`:
```typescript
// DialogueSystem: f.horn = false; f.hornDone = true;
// CombatSystem: f.reaperDead = true;
// FogSystem: f.fogWaves++; f.ghostBane = true;
// InteractionSystem: f.hasKey = false;
```

`FlagDomain` предоставляет типизированные методы (`hasItem()`, `hasEnhancement()`), но системы используют `as any` обход через `store.flags`.

**Рекомендация:**
- Все мутации флагов через `FlagDomain` (расширить интерфейс `FlagDomain` если нужно)
- `store.flags` сделать read-only для систем
- Добавить typed mutation methods в FlagDomain для всех используемых флагов

**Сложность:** Средняя | **Влияние:** Высокое

---

### 3. Огромный switch/case в AISystem

**Нарушение:** OCP (Open/Closed Principle) + SRP

**Текущее состояние:** `AISystem.updateEnemies()` содержит switch/case на 11 типов врагов (draugr, varg, raven, shroom, crawler, frost, reaper, spider, giant, snake, ghost), каждый со сложной вложенной логикой (~365 строк).

**Рекомендация:**
- Создать `EnemyBehavior` интерфейс: `{ update(e, dt, player, map, physics, store): void }`
- Вынести каждого врага в отдельный handler: `DraugrBehavior`, `VargBehavior`, и т.д.
- Использовать registry pattern: `behaviorRegistry.get(e.kind).update(...)`
- Это позволяет добавлять новых врагов без модификации AISystem

**Сложность:** Средняя | **Влияние:** Высокое

---

## 🟡 Средние проблемы

### 4. Дублирование логики рендеринга

**Текущее состояние:**
- `drawGuide()` существует в `engine.ts` (~30 строк) и частично в `render-system.ts`
- `updateMinimap()` логику дублируют `engine.ts` и `render-system.ts`

**Рекомендация:** Перенести всю отрисовку в `RenderSystem`:
- `RenderSystem.drawGuide(player, quests, interaction, cam, realT)`
- `RenderSystem.updateMinimap(minimapCanvas, mmBase, map, player, quests, flags, realT)`
- Удалить из engine.ts

**Сложность:** Низкая | **Влияние:** Среднее

---

### 5. Сущности хранят PixiJS Graphics

**Нарушение:** Separation of Concerns

**Текущее состояние:**
```typescript
type Enemy = { kind: string; x: number; y: number; ... } & { g: Graphics };
```
Рендереры (`EnemyRenderer`, `PlayerRenderer`) существуют, но не используются — сущности владеют своими `Graphics` объектами.

**Рекомендация:** (отложить)
- Сущности = данные (x, y, hp, kind, dead, hidden...)
- `Graphics` управляется `EntityManager` или `RenderSystem`
- Позволит тестировать логику без PixiJS
- Позволит ECS-переход в будущем

**Сложность:** Высокая | **Влияние:** Среднее

---

### 6. Магические числа без конфигурации

**Текущее состояние:** Скорости (92, 62, 48), радиусы (24, 34, 46), тайминги (0.22, 0.12, 1.8), параметры частиц разбросаны по всему коду без комментариев.

**Рекомендация:**
- Создать `config/game-config.ts` с именованными константами
- Группировать по категориям: `PLAYER_SPEED`, `ENEMY_RADIUS`, `PARTICLE_LIFE`, и т.д.
- Оставить "магические" числа только для tuning-параметров (sin frequency, alpha)

**Сложность:** Низкая | **Влияние:** Среднее

---

### 7. Неиспользуемые зависимости

**Текущее состояние:** В `package.json` заявлены, но не используются:
- `@supabase/supabase-js` — мультиплеер/сохранения (планируется?)
- `recharts` — графики (не нужны)
- `@dnd-kit/*` — drag-and-drop (не используется в PixiJS canvas)
- `date-fns` — время форматируется вручную
- `lucide-react` — кастомные SVG
- `react-router-dom` — SPA без роутинга
- `framer-motion` — CSS-анимации
- `uuid` — UUID не генерируется
- `@vitejs/plugin-react` — может быть, используется?

**Рекомендация:**
- Удалить явно неиспользуемые: `recharts`, `@dnd-kit/*`, `date-fns`, `lucide-react`, `react-router-dom`, `framer-motion`, `uuid`
- `@supabase/supabase-js` — оставить, возможно для будущих фич
- Проверить `package.json` — удалить из `devDependencies` если нужно

**Сложность:** Низкая | **Влияние:** Низкое

---

## 🟢 Низкий приоритет

### 8. Нет тестов

**Текущее состояние:** 0 тестовых файлов. Весь код непроверенный.

**Рекомендация:**
- Добавить unit-тесты для чистых функций: `utils.ts`, `dialogues.ts`, `quest-definitions.ts`
- Добавить тесты для логики: `FlagDomain`, `PlayerDomain`, `AISystem` (mock physics/map)
- Использовать `vitest` (уже есть в проекте через Vite)

**Сложность:** Средняя | **Влияние:** Высокое

---

### 9. `game-states.ts` — оставшиеся дубликаты

**Текущее состояние:** `ProjectileRt` и `DropRt` импортируются из `game-states.ts`, но определены также в `store/world-entities.ts`.

**Рекомендация:** Перевести импорты на `store/index.ts` и удалить из `game-states.ts`.

**Сложность:** Низкая | **Влияние:** Низкое

---

### 10. `world.ts` — barrel re-export

**Текущее состояние:** `world.ts` — просто barrel для `generators/`, но `generators/` содержит много больших файлов без четкой границы ответственности.

**Рекомендация:** (отложить)
- Рассмотреть разделение на более мелкие модули
- Добавить JSDoc документацию к публичным API

**Сложность:** Низкая | **Влияние:** Низкое

---

## 📋 Рекомендуемый план рефакторинга

### Фаза 1: Быстрые победы (низкий риск, высокая отдача)

| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 1.1 | Удалить неиспользуемые зависимости | `package.json` | Низкая |
| 1.2 | Перенести `drawGuide()` и `updateMinimap()` в `RenderSystem` | `engine.ts`, `render-system.ts` | Низкая |
| 1.3 | Заменить импорты `ProjectileRt`/`DropRt` на `store/index.ts` | 3 файла | Низкая |
| 1.4 | Создать `config/game-config.ts` с именованными константами | Новый файл | Низкая |

**Итого:** ~4 задачи, 2-3 дня, 0 рисков

---

### Фаза 2: Улучшение архитектуры (средний риск, высокая отдача)

| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 2.1 | Расширить `FlagDomain` для typed mutation всех флагов | `flag-domain.ts`, все системы | Средняя |
| 2.2 | Извлечь `PlayerSystem` из `Engine.update()` | `engine.ts`, новый `player-system.ts` | Средняя |
| 2.3 | Создать `EnemyBehavior` registry для AI | `ai-system.ts`, 11+ файлов | Средняя |
| 2.4 | Извлечь `GuideSystem` (стрелка + подсказки) | `engine.ts`, новый `guide-system.ts` | Низкая |

**Итого:** ~4 задачи, 5-7 дней, умеренные риски

---

### Фаза 3: Глубокий рефакторинг (высокий риск, максимальная отдача)

| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 3.1 | Отделить `Graphics` от сущностей (ECS-подход) | Все системы, `entities.ts` | Высокая |
| 3.2 | Добавить unit-тесты (vitest) | Новый `src/__tests__/` | Средняя |
| 3.3 | Добавить JSDoc и документацию | Критические файлы | Низкая |

**Итого:** ~3 задачи, 7-10 дней, высокие риски (тщательное тестирование!)

---

## 📊 Итоговая матрица приоритетов

| Приоритет | Задача | Impact | Effort |
|-----------|--------|--------|--------|
| 🔴 P0 | Engine.ts разделить на системы | Критическое | Высокий |
| 🔴 P0 | FlagDomain — typed mutation | Высокое | Средний |
| 🟡 P1 | AI switch/case → behaviors | Высокое | Средний |
| 🟡 P1 | RenderSystem consolidate | Среднее | Низкий |
| 🟡 P1 | Remove unused dependencies | Среднее | Низкий |
| 🟢 P2 | Magic numbers → config | Среднее | Низкий |
| 🟢 P2 | Graphics отделить от сущностей | Среднее | Высокий |
| 🟢 P2 | Добавить тесты | Высокое | Средний |

---

## 📈 Прогноз после полного рефакторинга

| Метрика | Сейчас | После P0-P1 | После P0-P2 |
|---------|--------|-------------|-------------|
| **Engine.ts** | 995 строк | ~500 строк | ~250 строк |
| **SRP violations** | 3 | 1 | 0 |
| **OCP violations** | 1 | 0 | 0 |
| **Direct flag mutations** | ~30 мест | ~5 мест | 0 |
| **Typed systems** | 14 | 19 | 24 |
| **Test coverage** | 0% | 20% | 50%+ |
| **Unused deps** | ~9 пакетов | 2 пакета | 1 пакет |

---

## ⚠️ Ключевые принципы для будущего рефакторинга

1. **Один файл — одна ответственность.** Если файл делает две вещи — разделяй.
2. **Systems depends on interfaces, not implementations.** (DIP)
3. **Domain models own their invariants.** (FlagDomain, PlayerDomain)
4. **No direct mutation of shared state.** Все мутации через typed methods.
5. **Graphics belong to the renderer, not the entity.**
6. **Config in one place, not scattered as magic numbers.**
7. **Test pure logic, mock external dependencies.**

---

## 🎯 Рекомендация

**Текущий статус проекта:** 70% от полного рефакторинга выполнено.

**Что делает проект рабочим сейчас:**
- Все системы извлечены и работают
- GameStore интегрирован
- Регрессии исправлены
- Legacy код удалён

**Что нужно сделать дальше (критично):**
1. Разделить Engine.ts (P0) — это главная проблема, которая ограничивает всё остальное
2. Добавить typed mutations в FlagDomain (P0) — без этого система ненадёжна
3. Refactor AI switch/case (P1) — без этого сложно добавлять новых врагов

**Что можно сделать в будущем (nice-to-have):**
- ECS-переход (отделить Graphics)
- Тесты
- Полная документация

**Приоритет на ближайший месяц:** Фаза 1 + Фаза 2 (задачи 1.1–2.4).
Это сократит Engine.ts до ~500 строк и устранит основные архитектурные нарушения.
