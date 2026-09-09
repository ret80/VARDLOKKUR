Изучив код более глубоко, я вижу, что предыдущий план не был полностью точным. Вот **новый, исправленный план** решения проблемы:

## 🔍 Новая диагностика проблемы

Основная проблема заключается в **двух критических ошибках**:

### Ошибка 1: Бессмысленная модификация старого eid в respawn()
В `respawn()` устанавливается состояние (Position, Velocity, Health) для **СТАРОГО eid игрока**, который будет **удален** в `clearWorld()`. Это создает путаницу и может вызывать проблемы с синхронизацией.

### Ошибка 2: Отсутствие явного добавления Position компонента
Хотя `createEntity()` добавляет Position, функции `add*Components()` в `ecs-bridge.ts` не добавляют его явно, что может вызывать проблемы с запросами `query(world, [Position, ...])` в render-системе.

## 📋 Новый пошаговый план решения

### Шаг 1: Удалить бессмысленную модификацию старого eid в respawn()

**Файл:** `src/game/engine/player-lifecycle.ts`

**Что сделать:** Удалить весь код, который модифицирует старый eid, так как он будет удален в `clearWorld()`:

```typescript
// УДАЛИТЬ ЭТИ СТРОКИ из метода respawn():
const eid = this.playerDomain instanceof PlayerDomain 
  ? (this.playerDomain as any)._eid ?? -1 
  : -1;

if (eid >= 0) {
  Dead[eid] = 0;
  Position.x[eid] = spawn.x;
  Position.y[eid] = spawn.y;
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
}

if (eid >= 0) {
  Health.current[eid] = Health.max[eid];
  Player.swingT[eid] = 0;
  Player.hurtT[eid] = 0;
  Player.slowT[eid] = 0;
}
```

**Причина:** Старый eid будет удален в `clearWorld()`, и новый eid будет создан с правильным состоянием в `createPlayerEntity()`.

### Шаг 2: Явно добавить Position компонент во все add*Components() методы

**Файл:** `src/game/ecs/ecs-bridge.ts`

**Что сделать:** Добавить `Position` в список компонентов для всех функций:

```typescript
function addNpcComponents(world: World, eid: number, id: string, name: string, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, NPC, Sprite, Position);  // ДОБАВИТЬ Position
  // ... остальной код
}

function addChestComponents(world: World, eid: number, item: string, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Chest, Position);  // ДОБАВИТЬ Position
  addComponent(world, eid, Sprite);
  // ... остальной код
}

function addPedestalComponents(world: World, eid: number, id: string, x: number, y: number, guardsLeft: number, spriteRef: Graphics): void {
  addComponents(world, eid, Pedestal, Position);  // ДОБАВИТЬ Position
  addComponent(world, eid, Sprite);
  // ... остальной код
}

function addShrineComponents(world: World, eid: number, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Shrine, Position);  // ДОБАВИТЬ Position
  addComponent(world, eid, Sprite);
  // ... остальной код
}

function addDoorComponents(world: World, eid: number, x: number, y: number, locked: boolean, spriteRef: Graphics): void {
  addComponents(world, eid, Door, Position);  // ДОБАВИТЬ Position
  addComponent(world, eid, Sprite);
  // ... остальной код
}

function addBarrierComponents(world: World, eid: number, x: number, y: number, active: boolean, spriteRef: Graphics): void {
  addComponents(world, eid, Barrier, Position);  // ДОБАВИТЬ Position
  addComponent(world, eid, Sprite);
  // ... остальной код
}

function addAltarComponents(world: World, eid: number, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Altar, Position);  // ДОБАВИТЬ Position
  addComponent(world, eid, Sprite);
  // ... остальной код
}
```

**Причина:** Это гарантирует, что Position компонент добавляется явно, и сущности будут найдены запросами `query(world, [Position, SpriteComp])` в render-системе.

### Шаг 3: Исправить порядок операций в respawn()

**Файл:** `src/game/engine/player-lifecycle.ts`

**Что сделать:** Переместить установку `player.x` и `player.y` **ДО** вызова `loadMap()`:

```typescript
respawn(): void {
  const { ow, flags, player } = this.store;
  let spawn;

  if (flags.shrineIdx >= 0 && ow && ow.shrines && ow.shrines[flags.shrineIdx]) {
    const s = ow.shrines[flags.shrineIdx];
    spawn = { x: s.x * T + 8, y: s.y * T + 8 };
  } else if (ow) {
    spawn = ow.spawn ?? { x: 0, y: 0 };
  } else {
    spawn = this.store.map?.spawn ?? { x: 0, y: 0 };
  }

  // УСТАНОВИТЬ ПОЗИЦИЮ ДО loadMap()
  player.x = spawn.x;
  player.y = spawn.y;

  this.cbs.resetDeath?.();
  console.log('[respawn] calling loadMap...');
  this.cbs.loadMap(ow, spawn);
  console.log('[respawn] loadMap done');
  
  this.store.setScreen("play");
  this.cbs.fadeTo(1);
  this.hud.pushHud(true);
  this.bus.emit("player:respawned", {});
}
```

**Причина:** Это гарантирует, что позиция игрока установлена до создания нового eid.

### Шаг 4: Убедиться, что playerG правильно добавляется в dynamic после респавна

**Файл:** `src/game/ecs/ecs-map-loader.ts`

**Что сделать:** В методе `loadMap()` убедиться, что `playerG` добавляется в `dynamicContainer` **после** создания игрока:

```typescript
loadMap(playerG, playerDomain, onPlayerCreated) {
  const savedPlayerG = playerG;
  
  this.clearWorld(world, savedPlayerG);
  this.createTileBodies(map, planckWorld);
  
  this.playerEid = this.createPlayer(world, spawn, playerG, planckWorld);
  (playerG as any).userData = (playerG as any).userData || {};
  (playerG as any).userData.eid = this.playerEid;
  dynamicContainer.addChild(playerG);  // УБЕДИТЬСЯ, что это вызывается
  
  if (onPlayerCreated) onPlayerCreated(this.playerEid);
  
  // ... остальной код
}
```

**Причина:** `playerG` должен быть добавлен в `dynamicContainer` после создания игрока, иначе он не будет отображаться.

### Шаг 5: Добавить отладочные логи для подтверждения решения

**Файлы:** 
- `src/game/engine/player-lifecycle.ts`
- `src/game/ecs/ecs-map-loader.ts`
- `src/game/ecs/ecs-systems/render-system.ts`

**Что сделать:** Добавить console.log для диагностики:

```typescript
// В respawn():
console.log('[respawn] ow.npcs count:', ow.npcs?.length ?? 0);
console.log('[respawn] ow.chests count:', ow.chests?.length ?? 0);
console.log('[respawn] ow.spawns count:', ow.spawns?.length ?? 0);

// В spawnNpcs(), spawnChests(), spawnEnemies():
console.log('[spawnNpcs] creating', map.npcs.length, 'NPCs');
console.log('[spawnChests] creating', map.chests.length, 'chests');
console.log('[spawnEnemies] creating', map.spawns.length, 'enemies');

// В renderSystem():
console.log('[renderSystem] NPCs count:', query(world, [SpriteComp, NPC]).length);
console.log('[renderSystem] Chests count:', query(world, [SpriteComp, Chest]).length);
console.log('[renderSystem] Enemies count:', query(world, [SpriteComp, Enemy]).length);
```

## ✅ Ожидаемый результат

После применения этого плана:
1. Старый eid игрока будет правильно удален без путаницы
2. Новый eid будет создан с правильным состоянием
3. Все объекты (NPC, враги, сундуки) будут созданы заново после респавна
4. Render-система будет правильно находить и рендерить все сущности

## 🧪 Тестирование

1. Запустите игру
2. Убейте игрока рядом с NPC или сундуком
3. Дождитесь респавна у святилища
4. Убедитесь, что NPC, сундуки и другие объекты отображаются на своих местах
5. Проверьте консоль на наличие отладочных логов, подтверждающих создание объектов