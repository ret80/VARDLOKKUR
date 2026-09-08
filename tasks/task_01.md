
### 🔍 Причина проблемы (Root Cause)

Проблема кроется в методе `clearWorld` класса `EcsMapLoader` (`src/game/ecs/ecs-map-loader.ts`) и функции `resetAllComponents` (`src/game/ecs/ecs-components.ts`).

При вызове респавна (`respawn()` в `player-lifecycle.ts`) всегда загружается оверворлд (`ow`), и запускается процесс `loadMap`, который вызывает `clearWorld`. Внутри `clearWorld` происходит следующее:

1. Вызывается `resetAllComponents()`, которая **полностью очищает все массивы компонентов SoA** (включая `Position`, `Health`, `Dead` и т.д.) и **обнуляет строковые пулы** (`StringPool.npcIds`, `StringPool.enemyKinds` и т.д.).
2. Затем происходит очистка `SpriteRegistry`, где уничтожаются (`destroy`) все спрайты, кроме `preservePlayerSprite` (спрайта игрока).
3. **Критическая ошибка:** При последующем спавне сущностей (например, в `spawnNpcs`, `spawnChests`, `spawnEnemies`) создаются новые ECS-сущности и новые объекты `Graphics`. Однако, из-за того, что `resetAllComponents()` обнулила `StringPool`, индексы строковых пулов для новых сущностей начинаются с `0`. 
4. Более того, в функциях добавления компонентов (например, `addNpcComponents`, `addChestComponents`) **компонент `Position` не добавляется явно через `addComponent`**, хотя его координаты записываются в массивы `Position.x[eid]` и `Position.y[eid]`. Поскольку `createEntity` добавляет `Position`, это работает при первой загрузке. Но после `resetAllComponents()` и пересоздания, если порядок или логика сбиваются, или если `SpriteRegistry` рассинхронизируется с `Sprite.ref`, рендер-система (`renderSprites` и `renderSortSystem`) не может корректно найти и обновить позиции этих объектов, так как они могут не проходить маски запросов `query(world, [Position, SpriteComp])` или их `zIndex` рассчитывается неверно (из-за нулевых координат `py[eid]`).
5. Дополнительно, если `playerG` по какой-то причине уже был удален из `dynamic.children` (например, при смерти), проверка `child === preservePlayerG` в `clearDynamic` не срабатывает, и при последующей очистке `SpriteRegistry` могут возникнуть гонки или потеря ссылок.

### 📋 Пошаговый план устранения

#### Шаг 1: Исправить добавление компонента `Position` при создании сущностей
В файле `src/game/ecs/ecs-bridge.ts` во всех функциях `add...Components` необходимо явно добавить компонент `Position`, чтобы гарантировать, что сущность будет найдена запросами `query(world, [Position, ...])` в рендер-системе.

**Файл:** `src/game/ecs/ecs-bridge.ts`
```typescript
// Было:
function addNpcComponents(world: World, eid: number, id: string, name: string, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, NPC, Sprite);
  // ...
  Position.x[eid] = x;
  Position.y[eid] = y;
}

// Стало:
import { Position, /* ... */ } from './ecs-components'; // Убедитесь, что Position импортирован

function addNpcComponents(world: World, eid: number, id: string, name: string, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, NPC, Sprite, Position); // <-- ДОБАВЛЕНО Position
  NPC.id[eid] = poolAdd(StringPool.npcIds, id);
  NPC.name[eid] = poolAdd(StringPool.npcNames, name);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  Position.x[eid] = x;
  Position.y[eid] = y;
}
```
*Повторите это исправление для функций:* `addChestComponents`, `addPedestalComponents`, `addShrineComponents`, `addDoorComponents`, `addBarrierComponents`, `addAltarComponents`.

#### Шаг 2: Гарантировать сохранение спрайта игрока в `SpriteRegistry` до очистки
В файле `src/game/ecs/ecs-map-loader.ts` в методе `clearWorld` убедитесь, что `preservePlayerSprite` корректно обрабатывается, даже если его нет в текущем `SpriteRegistry`.

**Файл:** `src/game/ecs/ecs-map-loader.ts`
```typescript
private clearWorld(world: World, preservePlayerSprite?: Graphics): void {
  // ... (удаление сущностей и resetAllComponents)

  // Очистить SpriteRegistry — но не уничтожать playerG
  for (const s of [...SpriteRegistry]) {
    if (s !== preservePlayerSprite) {
      s.destroy({ texture: true });
    }
  }
  SpriteRegistry.length = 0;
  
  // Гарантируем, что спрайт игрока всегда под индексом 0 после очистки
  if (preservePlayerSprite) {
    SpriteRegistry.push(preservePlayerSprite);
  }

  // Очистить другие реестры
  EnemyAIRegistry.length = 0;
  PhysicsBodyRegistry.length = 0;
}
```

#### Шаг 3: Исправить логику респавна для сохранения состояния карты
В файле `src/game/engine/player-lifecycle.ts` метод `respawn` всегда передает `ow` (оверворлд) в `loadMap`. Если игрок умер в подземелье, это корректно (возрождение в оверворлде). Однако, если игрок умер в оверворлде, убедитесь, что `ow` содержит актуальные данные. Проблема может быть в том, что `ow` мутирует или очищается. Убедитесь, что `this.cbs.loadMap(ow, spawn)` использует глубокую копию или что генератор не перезаписывает `ow` при каждом вызове.

#### Шаг 4: Добавить отладочные логи для верификации
Временно добавьте `console.log` в `spawnNpcs`, `spawnChests` и `renderSprites`, чтобы убедиться, что:
1. Массивы `map.npcs`, `map.chests` не пусты при загрузке.
2. `Sprite.ref[eid]` корректно указывает на существующий объект в `SpriteRegistry`.
3. `query(world, [Position, SpriteComp])` находит созданные сущности после респавна.

#### Шаг 5: Протестировать сценарий
1. Запустите игру.
2. Убейте игрока рядом с NPC или сундуком.
3. Дождитесь респавна у святилища.
4. Убедитесь, что NPC, сундуки и другие объекты отображаются на своих местах и взаимодействуют корректно.

### 💡 Резюме
Основная причина исчезновения объектов — **рассинхронизация между ECS-компонентами и графическими объектами после вызова `resetAllComponents()`**, усугубленная отсутствием явного добавления компонента `Position` при создании некоторых сущностей, что приводит к их "невидимости" для систем рендеринга и сортировки, зависящих от запросов `query`. Добавление `Position` в список компонентов при создании сущностей решит проблему их исчезновения.