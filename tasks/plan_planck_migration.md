# План миграции на Planck.js

## Контекст

Текущая физика состоит из двух частей:
1. **kinetics.ts** — используется только в `entity-manager.ts` для создания "тел" врагов (без гравитации, трения, упругости). Только для спавн-безопасности и "фермы" летающих врагов.
2. **PhysicsSystem** — кастомный движок столкновений с тайлами (circle-vs-tile sliding, raycast для LOS, path-following).

## Цель

Заменить kinetics.ts + кастомный PhysicsSystem на Planck.js с поддержкой масок и слоев.

## Что Planck.js даёт

- **Маски и слои (categories + masks)** — точный контроль: враг-враг, враг-игрок, снаряд-враг, снаряд-тайл
- **Готовые коллизии** — AABB, circle, polygon shapes
- **Fixture callbacks** — beginContact / preSolve для кастомной логики
- **Body types** — static (тайлы), kinematic (двери/барьеры), dynamic (сущности)
- **Стабильный сим** — substeps, warm starting

## Что НЕ меняется

- `navmesh` — pathfinding остаётся как есть
- `IPhysics.followPath()` — логика следования по пути остаётся в AI
- `IPhysics.hasLOS()` — raycast для line-of-sight (можно оставить кастомным или использовать Planck rayCast)
- Рендеринг, combat-логика, enemy behaviors — только interface совместимость

---

## Этап 1: Установка и настройка

### 1.1. Установить Planck.js
```bash
npm install planck-js
npm install -D @types/planck-js
```

### 1.2. Удалить kinetics.ts
```bash
npm uninstall kinetics.ts
```

### 1.3. Создать `src/game/physics/planck-world.ts`
- Обёртка над Planck.js World
- Создание bodies: player (dynamic circle), enemies (dynamic circles), tiles (static polygons)
- Создание fixtures с категориями/масками
- Настройка collision listener (beginContact)

### 1.4. Определить категории (битовые маски)
```typescript
export const Cat: Record<string, number> = {
  None:     0x0000,
  Player:   0x0001,
  Enemy:    0x0002,
  Projectile: 0x0004,
  Tile:     0x0008,
  Door:     0x0010,
  Barrier:  0x0020,
  Drop:     0x0040,
  Boss:     0x0080,
};
```

### 1.5. Определить группы контактов (что с чем коллидирует)
```
Player ↔ Enemy:     Cat.Player & Cat.Enemy (Tile и Door — не коллидируют с сущностями)
Player ↔ Projectile: Cat.Player & Cat.Projectile
Enemy ↔ Projectile:  Cat.Enemy & Cat.Projectile
Projectile ↔ Tile:   Cat.Projectile & Cat.Tile
Enemy ↔ Enemy:       Cat.Enemy & Cat.Enemy (опционально — можно отключить для производительности)
Player ↔ Tile:       Cat.Player & Cat.Tile
```

---

## Этап 2: Физический мир

### 2.1. Создание тайловых коллайдеров
- Проход по карте при загрузке
- Для каждого solid тайла — static body с circle fixture (r = T/2)
- Категория: Cat.Tile
- Маска: Cat.Player | Cat.Enemy | Cat.Projectile | Cat.Drop

### 2.2. Создание игрока
- Dynamic body, circle shape (r = 5)
- Категория: Cat.Player
- Маска: Cat.Tile | Cat.Enemy | Cat.Door | Cat.Barrier | Cat.Projectile
- positionType = PositionType.world (координаты мира)
- fixedRotation = true

### 2.3. Создание врагов
- Dynamic body, circle shape (r = enemy.r)
- Категория: Cat.Enemy (Cat.Boss для боссов)
- Маска: Cat.Tile | Cat.Player | Cat.Door | Cat.Projectile
- fixedRotation = true

### 2.4. Двери и барьеры
- Kinematic bodies, rectangle fixtures
- Категория: Cat.Door / Cat.Barrier
- Маска: Cat.Player | Cat.Enemy

### 2.5. Снаряды
- Dynamic body, circle shape
- Категория: Cat.Projectile
- Маска: Cat.Tile | Cat.Enemy | Cat.Player

---

## Этап 3: Collision Listener и логика

### 3.1. beginContact callback
- Projectile → Enemy: вызвать hitEnemy()
- Projectile → Player: вызвать damagePlayer()
- Enemy → Player: вызвать damagePlayer() (contact damage)
- Projectile → Projectile: destroy (опционально)

### 3.2. preSolve callback
- Projectile vs Tile: mark projectile for destruction
- Enemy vs Enemy: отключить (не нужны)
- Настройка filter на лету (если нужно)

### 3.3. postSolve (опционально)
- Knockback — применять через body velocity или setTransform

---

## Этап 4: Адаптация IPhysics

### 4.1. Обновить `physics-system.ts`
```typescript
export interface IPhysics {
  moveWithCollisions(e: PhysicsEntity, dx: number, dy: number, map: WorldData,
                     doors: PhysicsDoor[], barrier: PhysicsBarrier | null): void;
  pointSolid(x: number, y: number, map: WorldData,
             doors: PhysicsDoor[], barrier: PhysicsBarrier | null): boolean;
  hasLOS(x0: number, y0: number, x1: number, y1: number, map: WorldData): boolean;
  followPath(e: {...}, tx: number, ty: number, speed: number, dt: number, map: WorldData): void;
}
```

### 4.2. `moveWithCollisions` — новая реализация
- **УДАЛИТЬ** — Planck.js сам обрабатывает коллизии при moveAndStep()
- Вместо этого: set linearVelocity для entity
- Фактически: `moveWithCollisions` становится пустой/no-op функцией
- Движение управляется через velocity body

### 4.3. `pointSolid` — новая реализация
- Использовать Planck world query (point query или overlap query)
- Или rayCast от точки к соседним тайлам

### 4.4. `hasLOS` — новая реализация
- Использовать Planck world rayCast
- Или оставить кастомный Bresenham (если быстрее)

### 4.5. `followPath` — без изменений
- Оставить как есть — это AI-логика, не физика

---

## Этап 5: Entity Manager

### 5.1. Удалить kinetics.ts импорты
- Удалить `System as PhysSystem, Circle as PhysCircle, Vector as PhysVector`
- Удалить `this.phys: PhysSystem`
- Удалить `makeBody()` и `farBody()`

### 5.2. Обновить `Enemy.body`
- В `entities.ts`: `body: any | null` → `body: planck.Body | null`
- В `world-entities.ts`: `body: any` → `body: planck.Body | null`

### 5.3. Удалить `ensureSpawnSafety` reliance на kinetics
- Сейчас: использует kinetics body для проверки спавна
- Новая логика: использовать `PhysicsSystem.pointSolid()` или Planck world query

### 5.4. Обновить `spawnEnemy()`
- Создавать Planck body вместо PhysCircle
- Назначать правильную категорию/маску

### 5.5. Обновить `destroy()`
- Уничтожать Planck bodies через `world.destroyBody()`

---

## Этап 6: Engine (game loop)

### 6.1. Обновить `update()` в `engine.ts`
- Убрать прямой вызов `this.physics.moveWithCollisions()` для игрока и врагов
- Вместо этого: устанавливать velocity через Planck body
- Вызывать `world.step(dt)` в игровом цикле

### 6.2. Синхронизация body ↔ entity
- После `world.step()`: читать body.getPosition() → обновлять entity.x / entity.y
- PixiJS graphics: g.position.set(x, y)

### 6.3. Убрать special-case для призраков
- Призраки сейчас летают без коллизий
- С Planck: просто не создавать fixture для призраков или использовать filter

---

## Этап 7: Combat System

### 7.1. Knockback
- Убрать `this.physics.moveWithCollisions()` для knockback
- Вместо этого: apply impulse / set linearVelocity на body
- Или: setTransform с смещением

### 7.2. Projectile solid check
- Убрать `this.physics.pointSolid()` для снарядов
- Использовать collision listener (preSolve) для уничтожения снарядов при столкновении с тайлами

---

## Этап 8: AI System

### 8.1. hasLOS
- Заменить на Planck rayCast или оставить кастомный

### 8.2. Движение врагов
- Вместо `physics.followPath()` + `moveWithCollisions()`:
  - AI вычисляет target velocity
  - Устанавливает через `body.setLinearVelocity()`
  - Planck обрабатывает коллизии автоматически

---

## Этап 9: Карта и тайлы

### 9.1. При загрузке карты
- Разрушить старые bodies (если есть)
- Создать new Planck world
- Создать static bodies для всех solid тайлов
- Создать dynamic bodies для игрока и врагов

### 9.2. Двери
- Kinematic body, менять position при открытии/закрытии

### 9.3. Барьер
- Kinematic body, toggle active через filter category

---

## Этап 10: Тестирование и полировка

### 10.1. Проверить все типы врагов
- draugr, varg, raven, shroom, crawler, frost, reaper, spider, giant, snake, ghost

### 10.2. Проверить все механики
- Sword hit + knockback
- Axe throw + return
- Arrow + spore + fire projectiles
- Ghost dissipation
- Snake battle
- Boss mechanics
- Door opening
- Barrier activation

### 10.3. Проверить производительность
- FPS под нагрузкой (много врагов)
- Memory leak check

---

## Порядок выполнения

1. **[ ]** Этап 1: Установка и настройка
2. **[ ]** Этап 2: Физический мир (тайлы, сущности, fixtures)
3. **[ ]** Этап 3: Collision listener и логика
4. **[ ]** Этап 4: Адаптация IPhysics
5. **[ ]** Этап 5: Entity Manager (удаление kinetics.ts)
6. **[ ]** Этап 6: Engine (game loop, world.step)
7. **[ ]** Этап 7: Combat System (knockback)
8. **[ ]** Этап 8: AI System (движение через velocity)
9. **[ ]** Этап 9: Карта и тайлы (загрузка, двери, барьер)
10. **[ ]** Этап 10: Тестирование и полировка

---

## Риски и mitigations

| Риск | Mitigation |
|------|-----------|
| Изменение feel движения | Подстроить linearDamping и speed |
| Телескопирование при high FPS | Использовать fixed timestep (world.step с фиксированным dt) |
| Потеря sliding behavior | Planck handle sliding автоматически, но нужно проверить edge cases |
| Performance на слабых устройствах | Настроить collision groups, отключить Enemy↔Enemy коллизии |
| Breaking changes в Planck API | Использовать стабильную версию planck-js, проверять changelog |
