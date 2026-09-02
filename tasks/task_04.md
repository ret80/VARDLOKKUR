# Task_04 — Рефакторинг #2 (GameState → GameStore + Domain Models): статус и план

Часть рефакторинга task_01 пункт #2. Продолжение task_03.

---

## 📊 Текущий статус

### ✅ Реализовано и интегрировано

| Компонент | Файл | Статус |
|-----------|------|--------|
| **GameStore** | `store/game-store.ts` | ✅ Создан, используется в `engine.ts` |
| **FlagDomain** | `store/flag-domain.ts` | ✅ Создан, интегрирован в GameStore, системы используют через `store.flags` |
| **WorldEntities** | `store/world-entities.ts` | ✅ Создан, интегрирован, системы используют через `store.entities` |
| **PlayerDomain** | `store/player-domain.ts` | ✅ Создан (188 строк), но **неполностью интегрирован** |
| **Domain Models** | `store/models.ts` | ✅ Созданы (80 строк), но **НЕ используются** системами |
| **Интерфейсы DIP** | `system/quest-provider.ts`, `system/fx-manager.ts` | ✅ Созданы, используются |
| **IPhysics** | `system/physics-system.ts` | ✅ Создан, CombatSystem и AISystem зависят от него |
| **Store barrel** | `store/index.ts` | ✅ Экспортирует все компоненты |

### 🟡 Частично реализовано

| Компонент | Что сделано | Что не сделано |
|-----------|-------------|----------------|
| **PlayerDomain в Engine** | Создаётся в `buildGameStore()`, передаётся в GameStore | Мутации игрока заменены только на ~5 из ~25 мест |
| **PlayerDomain в update()** | `this.playerDomain.updateTimers(dt)` вызывается в tick | `syncFrom()` НЕ вызывается — значения рассинхронизированы |
| **Системы через GameStore** | QuestSystem, DialogueSystem, DropsSystem, FogSystem, CombatSystem, AISystem, InteractionSystem, HudSystem — все получают GameStore | Но все системы всё ещё мутируют `store.player` напрямую |

### ❌ НЕ реализовано

| # | Задача | Приоритет | Сложность |
|---|--------|-----------|-----------|
| 1 | Заменить все мутации `player.hp` на `playerDomain.takeDamage()`/`heal()` | 🔴 Критично | Средняя |
| 2 | Вызвать `syncFrom()` в начале каждого тика | 🔴 Критично | Низкая |
| 3 | Перевести DialogueSystem на PlayerDomain для мутаций hp/maxHp | 🟡 Высокий | Средняя |
| 4 | Перевести InteractionSystem на PlayerDomain для мутаций hp/maxHp | 🟡 Высокий | Средняя |
| 5 | Перевести CombatSystem на PlayerDomain для `damagePlayer()` | 🟡 Высокий | Средняя |
| 6 | Интегрировать PlayerModel в системы (чтение через model) | 🟢 Низкий | Средняя |
| 7 | Добавить `toModel()` в PlayerDomain | 🟢 Низкий | Низкая |

---

## 🔴 Критично: места где player мутируется напрямую

### 1. Engine — `combat-system.ts` (~8 мест)

```typescript
// CombatSystem.damagePlayer() — ЛИНЕЙКА 153
p.hp = Math.max(0, p.hp - dmg);  // ❌ Прямая мутация
// ❌ Должно быть: this.playerDomain.takeDamage(dmg, sx, sy)

// CombatSystem.trySword() — ЛИНЕЙКА 45
p.swingT = 0; p.hurtT = 0; p.slowT = 0;  // ❌ Прямая мутация
// ❌ Должно быть: this.playerDomain.resetTimers()

// CombatSystem.tryAxe() — нет мутаций ✅
```

### 2. Engine — `dialogue-system.ts` (~6 мест)

```typescript
// DialogueSystem.applyDialogueEffects() — ЛИНЕЙКА 60
p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2);  // ❌
// ❌ Должно быть: this.playerDomain.increaseMaxHp(2); this.playerDomain.heal(2)

// DialogueSystem.applyDialogueEffects() — ЛИНЕЙКА 63
p.hp = p.maxHp;  // ❌
// ❌ Должно быть: this.playerDomain.fullHeal()

// DialogueSystem.applyDialogueEffects() — ЛИНЕЙКА 100
p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2);  // ❌

// DialogueSystem.applyDialogueEffects() — ЛИНЕЙКА 107
p.maxHp += 2; p.hp = p.maxHp;  // ❌
```

### 3. Engine — `interaction-system.ts` (~3 места)

```typescript
// InteractionSystem.openChest() — ЛИНЕЙКА 108
this.player.maxHp += 2; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);  // ❌

// InteractionSystem.useShrine() — ЛИНЕЙКА 154
this.player.hp = this.player.maxHp;  // ❌

// InteractionSystem.atone() — ЛИНЕЙКА 167
this.player.maxHp += 2; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);  // ❌
```

### 4. Engine — `engine.ts` (~4 места)

```typescript
// Engine.startGame() — ЛИНЕЙКА 498
this.player.hp = this.player.maxHp = 12;  // ❌
// ✅ Уже сделано: this.playerDomain.fullHeal() в respawn()

// Engine.loadMap() — ЛИНЕЙКА 566
p.hp = Math.min(p.hp, p.maxHp);  // ❌ (мягкая коррекция)
```

### 5. Engine — `ai-system.ts` (~1 место)

```typescript
// AISystem.update() — ЛИНЕЙКА 167
p.slowT = 1.6;  // ❌ Прямая мутация таймера
// ❌ Должно быть: через PlayerDomain или напрямую безопасно (только чтение)
```

---

## 📋 План реализации

### Шаг 1: Добавить syncFrom() в tick()

**Файл:** `src/game/engine.ts`

В начале `update()` добавить:
```typescript
// Синхронизация PlayerDomain с реальным Player
this.playerDomain.syncFrom({
  x: p.x, y: p.y,
  vx: p.vx, vy: p.vy,
  hp: p.hp, maxHp: p.maxHp,
  swingT: p.swingT, hurtT: p.hurtT, slowT: p.slowT,
});
```

**Риск:** Минимальный. Это просто синхронизация.

---

### Шаг 2: Заменить мутации в CombatSystem

**Файл:** `src/game/system/combat-system.ts`

| Было | Стало |
|------|-------|
| `p.hp = Math.max(0, p.hp - dmg)` | `p.hp = Math.max(0, p.hp - dmg)` (оставить — damagePlayer уже эмитит событие) |
| `p.swingT = 0; p.hurtT = 0; p.slowT = 0` | `this.playerDomain.resetTimers()` |

**Примечание:** В `damagePlayer()` мутация `p.hp` остаётся, т.к. это критический путь урона. Но можно вынести в PlayerDomain если нужно.

---

### Шаг 3: Заменить мутации в DialogueSystem

**Файл:** `src/game/system/dialogue-system.ts`

DialogueSystem должен получить `playerDomain` через конструктор или через GameStore:

```typescript
// В constructor:
private get playerDomain() { return this.store.playerDomain; }

// applyDialogueEffects() замены:
p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2);
→ this.playerDomain?.increaseMaxHp(2); this.playerDomain?.heal(2);

p.hp = p.maxHp;
→ this.playerDomain?.fullHeal();
```

---

### Шаг 4: Заменить мутации в InteractionSystem

**Файл:** `src/game/system/interaction-system.ts`

```typescript
// openChest() — heartPiece:
this.player.maxHp += 2; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
→ this.store.playerDomain?.increaseMaxHp(2); this.store.playerDomain?.heal(2);

// useShrine():
this.player.hp = this.player.maxHp;
→ this.store.playerDomain?.fullHeal();

// atone():
this.player.maxHp += 2; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
→ this.store.playerDomain?.increaseMaxHp(2); this.store.playerDomain?.heal(2);
```

---

### Шаг 5: Добавить toModel() в PlayerDomain

**Файл:** `src/game/store/player-domain.ts`

```typescript
toModel(): PlayerModel {
  return {
    x: this._x, y: this._y,
    vx: this._vx, vy: this._vy,
    r: this._r,
    hp: this._hp, maxHp: this._maxHp,
    dir: this._dir,
    moving: false, // Engine задаёт
    animT: 0, // Engine задаёт
    swingT: this._swingT,
    hurtT: this._hurtT,
    slowT: this._slowT,
  };
}
```

---

### Шаг 6 (отложено): Системы получают PlayerModel вместо Player

**Файл:** все системы

Системы получают `PlayerModel` (только чтение) через DI. Это шаг к полной ECS-архитектуре.

**Приоритет:** Низкий. Требует рефакторинга всех 8 систем.

---

## ⚠️ Риски

1. **Рассинхронизация Player ↔ PlayerDomain** — если syncFrom() не вызывается, значения расходятся. Решение: вызывать syncFrom() в начале каждого тика.

2. **Двойная мутация** — если и Player, и PlayerDomain мутируются, значения могут не совпасть. Решение: Player — единственный источник правды, PlayerDomain — обёртка для мутаций.

3. **null safety** — playerDomain может быть null. Все вызовы должны использовать optional chaining.

---

## ✅ Критерии завершения

- [ ] `syncFrom()` вызывается в начале каждого тика `update()`
- [ ] Все мутации `player.hp` в CombatSystem, DialogueSystem, InteractionSystem заменены на методы PlayerDomain
- [ ] `npx tsc --noEmit` проходит без ошибок
- [ ] `npm run dev` работает корректно
- [ ] Игра функционально идентична до рефакторинга

---

## 📊 Оценка объёма

| Шаг | Файл | Изменений | Сложность |
|-----|------|-----------|-----------|
| 1 | `engine.ts` | +5 строк (syncFrom) | Низкая |
| 2 | `combat-system.ts` | ~2 замены | Низкая |
| 3 | `dialogue-system.ts` | ~4 замены + DI | Средняя |
| 4 | `interaction-system.ts` | ~3 замены | Низкая |
| 5 | `player-domain.ts` | +1 метод | Низкая |
| 6 | все системы | Отложено | Высокая |
