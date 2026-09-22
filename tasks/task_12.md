# Задача 12: Исправление мутного заднего фона и порядка отрисовки

## 1. Проблема

### 1.1. Задний план мутный

**Симптом:** Ground-тайлы (фон карты) выглядят размытыми/мутными при движении камеры.

**Корень проблемы:** `buildGroundTexture()` в `tiles.ts` рисует всю карту на одном `<canvas>`, затем `renderer.createTextureFromCanvas()` создаёт из него одну большую PixiJS `Texture`. При движении камеры эта текстура растягивается/сжимается, и PixiJS применяет линейную фильтрацию + mipmaps → размытие.

**Где создаётся:**
- `tiles.ts` строка 688: `const groundTexture = renderer.createTextureFromCanvas(groundCanvas);`
- `map-loader-service.ts` строка 181-187: ground спрайт создаётся из `groundTexture` и добавляется в `tileLayerHandle`

**Где `createTextureFromCanvas`:**
- `PixiJSRenderer.ts` строка 415 — создаёт `Texture.from(canvas)`, который по умолчанию использует `scaleMode=Linear` и генерирует mipmaps

### 1.2. Деревья и дома перекрываются некорректно

**Симптом:** Деревья и дома накладываются на игрока вместо того чтобы быть за/перед ним.

**Текущее состояние слоёв:**

| Слой | zIndex | Содержимое |
|------|--------|------------|
| `tileLayerHandle` | 10 | Ground-тайлы (одна большая текстура) |
| `worldHandle` | 40 | World container |
| `dynamicHandle` | 50 | Игрок, враги, дропы, **деревья, дома** |
| `fxWorldHandle` | 60 | FX-графика |
| `floatLayerHandle` | 90 | Плавающий текст |

**Проблема:** Деревья и дома уже в `dynamicHandle` (zIndex 50), где и игрок. Проблема не в порядке слоёв, а в **zIndex отдельных спрайтов** и **Y-sorting**.

**Текущий Y-sorting:**
- `SceneLayers.dynamic` имеет `sortableChildren = true` (legacy Container)
- `PixiJSRenderer.dynamicHandle` создаётся с `container.sortableChildren = true` (строка 129)
- Спрайты деревьев/домов получают `zIndex = Y + T` (tiles.ts строка 613)
- Игрок получает `zIndex` через `userData.y` (map-loader-service.ts строка 206)

**Возможная причина:** `sortableChildren` сортирует по `y` координате, но если `zIndex` спрайтов деревьев/домов конфликтует с `zIndex` игрока, порядок может быть неверным.

---

## 2. Целевая архитектура

### 2.1. Ground-тайлы — без текстуры

**Было:**
```
buildGroundTexture() → canvas → createTextureFromCanvas() → одна большая Texture → Sprite на tileLayer
```

**Стало:**
```
Рисовать тайлы напрямую на tileLayer как отдельные Sprites из мелких текстур (16x16)
ИЛИ
Использовать canvas-backed tilemap без масштабирования
```

**Рекомендуемый подход:** Отрисовывать ground-тайлы как отдельные спрайты из кэшированных текстур 16x16. Каждый тайл — отдельный Sprite на `tileLayerHandle`. При движении камеры каждый спрайт остаётся чётким.

### 2.2. Деревья/дома — корректный Y-sorting

**Было:**
```
Деревья/дома → dynamicHandle (zIndex 50) → sortableChildren по y
```

**Стало:**
```
Деревья/дома → dynamicHandle (zIndex 50) → sortableChildren по y
Игрок → dynamicHandle (zIndex 50) → sortableChildren по y
Все сортируются одинаково — порядок корректный.
```

**Проверка:** Убедиться что `sortableChildren = true` на контейнере динамического слоя и что `userData.y` у всех спрайтов (игрок, деревья, дома) установлен корректно.

---

## 3. План реализации

### Шаг 12.1: Отключить bake ground-текстуры

**Файл:** `src/game/tiles.ts`

**Что сделать:**
1. Заменить `buildGroundTexture()` → `buildGroundTileSprites()`
2. Вместо одной большой текстуры — кэшировать отдельные тайлы 16x16
3. Возвращать массив `{ textureHandle, x, y }` для каждого тайла

```typescript
// Было:
export interface TileBuildResult {
  groundTexture: TextureHandle;
  wallSprites: WallSpriteData[];
  houseSprites: HouseSpriteEntry[];
  wallCache: WallTextureCache;
  houseCache: HouseTextureCache;
}

// Стало:
export interface TileBuildResult {
  groundTiles: Array<{ textureHandle: TextureHandle; x: number; y: number }>;
  wallSprites: WallSpriteData[];
  houseSprites: HouseSpriteEntry[];
  wallCache: WallTextureCache;
  houseCache: HouseTextureCache;
}
```

**Кэш тайлов:** Создать `GroundTileCache` аналогично `WallTextureCache` — кэширует текстуры 16x16 по типу тайла.

### Шаг 12.2: Обновить MapLoaderService

**Файл:** `src/game/engine/map-loader-service.ts`

**Что сделать:**
1. Заменить создание одного ground-спрайта на цикл по `groundTiles`
2. Каждый тайл — отдельный Sprite на `tileLayerHandle`

```typescript
// Было:
const groundHandle = this._renderer.createSprite({
  texture: tileResult.groundTexture,
  x: 0, y: 0,
  _container: tileLayerContainer,
});

// Стало:
for (const gt of tileResult.groundTiles) {
  const spriteHandle = this._renderer.createSprite({
    texture: gt.textureHandle,
    x: gt.x,
    y: gt.y,
    _container: tileLayerContainer,
  });
}
```

### Шаг 12.3: Исправить Y-sorting для деревьев/домов

**Файл:** `src/game/engine/map-loader-service.ts`

**Что сделать:**
1. Проверить что `userData.y` у деревьев/домов установлен корректно (для Y-sorting)
2. Убедиться что `sortableChildren = true` на `dynamicHandle` контейнере
3. Проверить что `userData.y` у игрока установлен корректно

**Проверка в `PixiJSRenderer.ts`:**
```typescript
// createLayer — убедиться что sortableChildren = true
createLayer(name: string, zIndex: number): LayerHandle {
  const id = this._nextId++;
  const container = new Container();
  container.sortableChildren = true;  // ← уже есть, проверить
  container.zIndex = zIndex;
  this.worldContainer.addChild(container);
  this.layers.set(id, { container, zIndex, name });
  return id as LayerHandle;
}
```

### Шаг 12.4: Добавить debug-логи для верификации

**Файл:** `src/game/engine/map-loader-service.ts`

**Что добавить:**
```typescript
logger.debug('map-loader', `Ground tiles: ${tileResult.groundTiles.length}`);
logger.debug('map-loader', `Wall sprites: ${tileResult.wallSprites.length}`);
logger.debug('map-loader', `House sprites: ${tileResult.houseSprites.length}`);
logger.debug('map-loader', `Dynamic layer sortableChildren: ${!!dynamicContainer.sortableChildren}`);
```

---

## 4. Контрольные точки

- [ ] `tsc --noEmit` — 0 ошибок
- [ ] Ground-тайлы чёткие при движении камеры (нет размытия)
- [ ] Деревья и дома корректно перекрываются с игроком (Y-sorting работает)
- [ ] Производительность не упала (количество draw calls увеличилось, но тайлы кэшируются)
- [ ] `createTextureFromCanvas` больше не используется для ground-тайлов

---

## 5. Риски

| Риск | Митигация |
|------|-----------|
| Рост draw calls (N тайлов вместо 1) | Тайлы кэшируются — текстуры переиспользуются, PixiJS batch-ит одинаковые текстуры |
| Потеря визуального стиля | Кэшированные текстуры 16x16 рисуются точно так же, как раньше |
| Память (N текстур вместо 1) | Текстуры 16x16 маленькие, количество типов тайлов ~20, общий размер ~20 × 16 × 16 × 4 байта = ~20KB |

---

## 6. Файлы для изменения

| Файл | Изменение | Приоритет |
|------|-----------|-----------|
| `src/game/tiles.ts` | Заменить `groundTexture` на `groundTiles[]`, добавить `GroundTileCache` | Высокий |
| `src/game/engine/map-loader-service.ts` | Создать спрайты из `groundTiles[]`, проверить Y-sorting | Высокий |
| `src/game/renderer/IRenderer.ts` | Без изменений | Низкий |
| `src/game/renderer/PixiJSRenderer.ts` | Без изменений (или добавить debug-лог) | Низкий |

---

## 7. Детали реализации GroundTileCache

```typescript
export class GroundTileCache {
  private cache = new Map<number, TextureHandle>();
  private renderer!: IRenderer;

  init(renderer: IRenderer): void {
    this.renderer = renderer;
  }

  getTexture(t: number): TextureHandle {
    if (this.cache.has(t)) return this.cache.get(t)!;
    
    const c = document.createElement("canvas");
    c.width = T; c.height = T;
    const ctx = c.getContext("2d")!;
    
    // Рисовать тайл типа t на canvas (вызвать логику из buildGroundTexture)
    drawTile(ctx, t);
    
    const tex = this.renderer.createTextureFromCanvas(c);
    this.cache.set(t, tex);
    return tex;
  }

  destroy() {
    this.cache.forEach((h) => this.renderer.destroyTexture(h));
    this.cache.clear();
  }
}
```

**drawTile** — вынести логику отрисовки одного тайла из `buildGroundTexture` в отдельную функцию:

```typescript
function drawTile(ctx: CanvasRenderingContext2D, tileType: number): void {
  // Дублировать логику из buildGroundTexture для одного тайла
  switch (tileType) {
    case Tl.WATER: dither(ctx, 0, 0, "#0a1620", "#081219", "#12303e"); break;
    case Tl.SHORE: dither(ctx, 0, 0, "#4a5a64", "#3d4d57", "#5a6a74"); break;
    // ... все типы тайлов
  }
}
```

---

## 8. Итоговый поток

```
loadMapEcs()
  │
  ├─ buildAllTileTextures(map, roofSnow, renderer)
  │   ├─ buildGroundTileSprites() → { textureHandle, x, y }[] для каждого тайла
  │   ├─ buildWallAndHouseSprites() → wallSprites[] + houseSprites[]
  │   └─ GroundTileCache + WallTextureCache + HouseTextureCache
  │
  ├─ Для каждого groundTile:
  │   └─ renderer.createSprite({ texture, x, y, _container: tileLayerContainer })
  │
  ├─ Для каждого wallSprite:
  │   └─ renderer.createSprite({ texture, x, y, _container: dynamicContainer })
  │
  └─ Для каждого houseSprite:
      └─ renderer.createSprite({ texture, x, y, _container: dynamicContainer })
```
