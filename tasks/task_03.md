# Интеграция Domain Models — PlayerDomain и Models

Часть рефакторинга task_01 пункт #2 (GameState → GameStore + Domain Models).

---

## 📁 Текущее состояние

### Что уже есть:
- `GameStore` — инкапсулированное хранилище состояния (используется в `engine.ts`)
- `FlagDomain` — типизированная модель флагов (используется GameStore)
- `WorldEntities` — инкапсулированные коллекции сущностей (используется GameStore)

### Что создано, но не интегрировано:
- `src/game/store/player-domain.ts` (188 строк) — `PlayerDomain` класс
- `src/game/models.ts` (80 строк) — `PlayerModel`, `EnemyModel`, `DropModel`, `ProjectileModel` интерфейсы

---

## 🎯 Цель

Интегрировать `PlayerDomain` в `GameStore` и заменить прямые мутации `Player` на инкапсулированные методы.

---

## 📋 План интеграции

### Шаг 1: Подключить PlayerDomain в GameStore

**Файл:** `src/game/store/game-store.ts`

Сейчас GameStore хранит `player: Player` напрямую:
```typescript
export interface GameStoreConfig {
  player: Player;  // raw Player объект
}
```

Нужно добавить `PlayerDomain` как опциональный домен:
```typescript
export interface GameStoreConfig {
  player: Player;
  playerDomain?: PlayerDomain;  // опциональный домен
}
```

### Шаг 2: Создать PlayerDomain в Engine

**Файл:** `src/game/engine.ts`

В `buildGameStore()` создать `PlayerDomain` и передать в `GameStoreConfig`:
```typescript
const playerDomain = new PlayerDomain(
  this.player.hp,
  this.player.maxHp,
  this.player.x,
  this.player.y,
  this.player.vx,
  this.player.vy,
  this.player.dir,
  this.player.r,
  {
    onDamaged: (dmg, sx, sy) => this.bus.emit("player:damaged", { dmg, sx, sy }),
    onDied: () => this.bus.emit("player:died", {}),
    onHealed: (amount) => { /* ... */ },
  }
);
```

### Шаг 3: Заменить мутации player в Engine

**Файл:** `src/game/engine.ts`

Найти все места где `this.player` мутируется напрямую и заменить на вызовы `playerDomain`:

| Было | Стало |
|------|-------|
| `this.player.hp = Math.max(0, this.player.hp - dmg)` | `this.playerDomain.takeDamage(dmg, sx, sy)` |
| `this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount)` | `this.playerDomain.heal(amount)` |
| `this.player.hp = this.player.maxHp` | `this.playerDomain.fullHeal()` |
| `this.player.hp = Math.min(p.maxHp, p.hp + 4)` | `this.playerDomain.heal(4)` |
| `this.player.hurtT = 0` | `this.playerDomain.resetTimers()` |
| `this.player.slowT = 0` | `this.playerDomain.resetTimers()` |
| `this.player.swingT = 0` | `this.playerDomain.resetTimers()` |
| `this.player.slowT = Math.max(0, this.player.slowT - dt)` | `this.playerDomain.updateTimers(dt)` |
| `this.player.hp = this.player.maxHp` (respawn) | `this.playerDomain.fullHeal()` |

**Всего мест для замены:** ~15-20 мест в `engine.ts`

### Шаг 4: Синхронизация Player ↔ PlayerDomain

**Файл:** `src/game/engine.ts`

`PlayerDomain` хранит свои внутренние значения, но `Player` — единственный источник правды. Нужно синхронизировать:

Вариант A: `PlayerDomain` синхронизируется из `Player` через `syncFrom()` (уже реализован):
```typescript
// В начале каждого тика:
this.playerDomain.syncFrom({
  x: this.player.x, y: this.player.y,
  vx: this.player.vx, vy: this.player.vy,
  hp: this.player.hp, maxHp: this.player.maxHp,
  swingT: this.player.swingT, hurtT: this.player.hurtT, slowT: this.player.slowT,
});
```

Вариант B: `PlayerDomain` — единственный источник правды, `Player` — view.

**Рекомендация:** Вариант A (безопаснее, меньше изменений).

### Шаг 5: Интегрировать Domain Model интерфейсы

**Файл:** `src/game/models.ts`

Интерфейсы `PlayerModel`, `EnemyModel`, `DropModel`, `ProjectileModel` — immutable представления сущностей.

Использование:
- Системы получают `PlayerModel` вместо `Player` (только чтение)
- `PlayerDomain` предоставляет `toModel(): PlayerModel`
- Это шаг к полной ECS-архитектуре (отделение данных от мутаций)

**Приоритет:** Низкий. Можно сделать после интеграции `PlayerDomain`.

---

## ⚠️ Риски

1. **Синхронизация Player ↔ PlayerDomain** — если значения рассинхронизируются, будут баги. Нужны чёткие правила: кто пишет, кто читает.

2. **Производительность** — `PlayerDomain` добавляет слой абстракции. В каждом тике будет вызов методов вместо прямого доступа к полю.

3. **Обратная совместимость** — `GameStore.player` остаётся `Player`. Системы продолжают получать `Player` напрямую. `PlayerDomain` — дополнительный слой.

---

## ✅ Критерии завершения

- [ ] `PlayerDomain` создаётся в `engine.ts` и передаётся в `GameStore`
- [ ] Мутации `this.player.hp` заменены на `this.playerDomain.takeDamage()`/`heal()`
- [ ] Таймеры `hurtT`, `swingT`, `slowT` управляются через `PlayerDomain`
- [ ] `syncFrom()` вызывается в начале каждого тика
- [ ] `npx tsc --noEmit` проходит без ошибок
- [ ] `npm run dev` работает корректно
- [ ] Игра функционально идентична до рефакторинга

---

## 📊 Оценка объёма

| Файл | Изменений | Сложность |
|------|-----------|-----------|
| `engine.ts` | ~20 замен мутаций + создание PlayerDomain | Средняя |
| `store/game-store.ts` | Добавить `playerDomain` в config | Низкая |
| `store/player-domain.ts` | Без изменений | — |
| `store/models.ts` | Без изменений (отложено) | — |
