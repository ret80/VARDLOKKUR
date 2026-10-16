# Задача 23: Двери — снятие коллизии при открытии и 4 направления

## 1. Проблемы

1. **Коллизия не пропадает.** Тело двери создавалось в
   `EcsMapLoader.spawnDungeonDoors` (`createKinematicBody(d.x, d.y, 18, 16, Cat.Door)`),
   но **не связывалось** с ECS-сущностью двери. `updateDoors` только
   увеличивал `Door.open`, физическое тело оставалось в мире навсегда —
   через открытую дверь было не пройти.
2. **Дверь визуально не открывалась.** `DoorRenderer` (в отличие от
   остальных рендереров объектов) не вызывал `clearGraphics`, поэтому
   прямоугольники накапливались вместо «усадки» створки.
3. **Одно направление.** Дверь рисовалась только как горизонтальная
   створка (проём снизу). Генератор Склепа (задача 22) может пробить
   проход в любой из четырёх стен арены — нужны все 4 ориентации.

## 2. Решение

### 2.1. Связь тела с сущностью (`ecs-map-loader.ts`)

После создания сущности двери тело регистрируется в общем реестре:

```ts
const body = planckWorld.createKinematicBody(d.x, d.y, bw, bh, Cat.Door);
addComponent(world, eid, PhysicsBody);
PhysicsBody[eid] = { body: PhysicsBodyRegistry.length + 1 };
PhysicsBodyRegistry.push(body);
```

Теперь дверь участвует в `teardownWorld` (тело уничтожается при смене
карты) и доступна для удаления по сущности.

### 2.2. Снятие коллизии (`world-system.ts`)

`updateDoors(...)` получил `planckWorld`. Когда дверь разблокирована и
`open > 0.5`, тело удаляется через `destroyBodyForEntity` (идемпотентно,
`PhysicsBody[door].body` обнуляется):

```ts
if (!Door[doorEid].locked && Door[doorEid].open > 0.5 &&
    hasComponent(world, doorEid, PhysicsBody) && PhysicsBody[doorEid].body > 0) {
  destroyBodyForEntity(planckWorld, doorEid);
}
```

Вызов в игровом цикле обновлён: `updateDoors(world, peid, _planckWorld, ...)`.

### 2.3. Четыре направления

- Тип `DoorDir = "up" | "down" | "left" | "right"` и `DoorSpec` в
  `generators/types.ts`; `WorldData.doors: DoorSpec[]`.
- Генератор (`dungeon-layout.ts`) возвращает `CarveResult.bossDir` —
  сторона стены арены, в которой пробит проход. `genCrypt` и
  `fallbackCrypt` кладут `dir` в дверь.
- Компонент `Door` получил поле `dir` (код `DOOR_DIR`: 0=вниз, 1=влево,
  2=вверх, 3=вправо). `createDoorInEcs`/`addDoorComponents` принимают и
  кодируют направление (`doorDirCode`).
- `eidToDoorData` пробрасывает `dir` в `IDoorData`.
- `DoorRenderer`: `clearGraphics` каждый кадр + ориентация створки:
  - up/down — горизонтальная (16 × 14·t),
  - left/right — вертикальная (14·t × 16).
- Коллайдер повторяет ориентацию: up/down — 18×16, left/right — 16×18
  (в «узком» измерении зазор до 32-пиксельного проёма < диаметра игрока).

## 3. Тесты

`src/game/__tests__/dungeon-layout.test.ts`: в интеграционном тесте
добавлена проверка, что `w.doors[0].dir` совпадает со стороной стены
арены, вычисленной по `findBossOpenings` (12 сидов). Распределение по
200 сидам: up 71, down 48, left 40, right 41 — все направления реально
встречаются.

`npx tsc --noEmit` — чисто; `vitest run` — 13/13; `npm run build` — ок.

## 4. Примечания

- Дверь остаётся на карте (спрайт), убирается только физическое тело.
- Порог `open > 0.5` выбран, чтобы створка успела заметно открыться
  (~0.9 с при 0.032/кадр ≈ 60 fps).
- `pointSolid` — мёртвый код (нет вызовов), не трогали.
