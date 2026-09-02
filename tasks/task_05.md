# Task_05 — Исправление регрессий: взаимодействие и AI

Часть рефакторинга task_01 пункт #2 (GameState → GameStore + Domain Models).
Продолжение task_03 и task_04.

---

## 📊 Описание регрессий

### 🔴 Регрессия 1: Игрок не взаимодействует с NPC и объектами
**Симптом:** Нажатие `E` не открывает диалоги с NPC, не открывает сундуки, не использует святилища, не запускает спуск в подземелье.

**Корневая причина:** `GameStore.map` всегда `null`.

Метод `Engine.loadMap()` (строка 555) устанавливает `this.map = map`, но **никогда не вызывает `this.store.setMap(map)`**.

Все системы получают map через `this.store.map`, который остаётся `null`:

```
InteractionSystem.tryInteract()  →  line 47:  if (!this.store.map) return;  ← ранний выход
AISystem.updateEnemies()         →  line 32:  const m = this.store.map!;  ← null
DialogueSystem                   →  использует store.flags, но map не нужен ✅
DropsSystem                      →  использует store.map для проверки isDungeon
FogSystem                        →  использует store.map для проверки isDungeon
QuestSystem                      →  использует store.map для проверки isDungeon
```

**Решение:** Добавить `this.store.setMap(map)` в `Engine.loadMap()`.

---

### 🔴 Регрессия 2: Враги стоят на месте и не атакуют
**Симптом:** Враги не двигаются, не входят в аггро, не атакуют игрока.

**Корневая причина:** То же самое — `this.store.map` равен `null`.

В `AISystem.updateEnemies()` (строка 30-33):

```typescript
updateEnemies(dt: number) {
    const p = this.player;
    const m = this.store.map!;  // ← null!
    if (!m) return;             // ← ранний выход, AI не работает
    // ...
}
```

Поскольку `m` — `null`, метод сразу возвращается, и:
- Не проверяется аггро (строки 54-61)
- Не задаётся `vx/vy` (строки 63-161)
- Не наносится контактный урон (строки 163-171)
- Не обновляются боссы (строки 49-52)

**Решение:** То же самое — `this.store.setMap(map)` в `Engine.loadMap()`.

---

## 📋 План исправления

### Шаг 1: Добавить setMap в loadMap

**Файл:** `src/game/engine.ts`

В методе `loadMap()` (строка 555), сразу после `this.map = map;` добавить:

```typescript
private loadMap(map: WorldData, spawn: Vec) {
    this.map = map;
    this.store.setMap(map);  // ← ДОБАВИТЬ ЭТУ СТРОКУ
    this.clearEntities();
    // ...
}
```

**Риск:** Минимальный. Это прямая передача уже существующего объекта `map`.

**Влияние:** Исправит обе регрессии одновременно.

---

### Шаг 2: Добавить setOw при генерации overworld

**Файл:** `src/game/engine.ts`

В методе `startGame()` (строка 453), после генерации `this.ow` и `this.dungeons`:

```typescript
this.ow = generateOverworld(seed);
this.dungeons = DUNGEONS.map((cfg) => { ... });
this.store.setOw(this.ow);  // ← ДОБАВИТЬ ЭТУ СТРОКУ
```

**Почему нужно:** `InteractionSystem.nearestDungeonEntry()` (строка 193-201) использует `this.ow!.dungeonEntries` для поиска входов в подземелья. Если `ow` не установлен, взаимодействие с лестницами может работать, но поиск ближайшего входа не сработает.

---

### Шаг 3: Проверка — npx tsc --noEmit

```bash
npx tsc --noEmit
```

Убедиться, что ошибок нет.

---

### Шаг 4: Проверка — npm run dev

Запустить игру и проверить:
1. Нажатие `E` рядом с NPC открывает диалог
2. Нажатие `E` рядом с сундуком открывает его
3. Нажатие `E` рядом со святилищем лечит игрока
4. Нажатие `E` рядом со лестницей запускает вход в подземелье
5. Враги двигаются и атакуют игрока
6. Боссы работают корректно

---

## ⚠️ Риски

1. **Двойное назначение map:** `this.map` и `this.store.setMap(map)` указывают на один и тот же объект. Это безопасно — `map` не мутируется, только читается системами.

2. **Синхронизация с PlayerDomain:** `syncFrom`/`syncToPlayer` остаются без изменений — они работают с `Player` и `PlayerDomain`, не затрагивая map.

3. **Загрузка начальной карты:** `startGame()` вызывает `loadMap(this.ow, this.ow.spawn)` — `setMap` сработает сразу, всё будет корректно.

---

## ✅ Критерии завершения

- [ ] `this.store.setMap(map)` добавлен в `Engine.loadMap()`
- [ ] `this.store.setOw(this.ow)` добавлен в `Engine.startGame()`
- [ ] `npx tsc --noEmit` проходит без ошибок
- [ ] `npm run dev` работает корректно
- [ ] NPC диалоги открываются по `E`
- [ ] Сундуки открываются по `E`
- [ ] Святилища лечат по `E`
- [ ] Подземелья запускаются по `E`
- [ ] Враги двигаются и атакуют
- [ ] Боссы работают корректно

---

## 📊 Объём изменений

| Файл | Изменений | Сложность |
|------|-----------|-----------|
| `engine.ts` | +2 строки (`setMap`, `setOw`) | Низкая |
| **Итого** | **2 строки кода** | **Низкая** |

---

## 📌 Почему это произошло

Во время рефакторинга GameState → GameStore был создан `GameStore` с инкапсулированным состоянием, но `Engine` продолжил работать с `this.map` напрямую, забыв синхронизировать состояние со store. Все системы перешли на `this.store.map`, который остался `null`.

**Мораль:** При переходе на GameStore все чтения `this.xxx` должны быть заменены на `this.store.xxx` или `this.store.entities.xxx`.
