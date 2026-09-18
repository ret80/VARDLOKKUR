Я изучил репозиторий и нашёл все три проблемы. Вот подробный анализ и решения:

---

## Проблема 1: Игрок не отрисовывается совсем (регрессия)

**Причина:** В `src/game/ecs/ecs-map-loader.ts` метод `clearWorld` вызывает `renderer.resetNextId()`, который сбрасывает внутренний счётчик ID на 1. После этого новые Graphics перезаписывают запись `playerG` в `PixiJSRenderer.graphics` Map.

**Файл:** `src/game/ecs/ecs-map-loader.ts` (~строка 80)

```ts
private clearWorld(world: World, preservePlayerSprite?: number): void {
  // ...
  // ❌ ОШИБКА: сброс счётчика перезатирает ID playerG
  try {
    const renderer = getRenderer();
    renderer.resetNextId();  // ← УБРАТЬ ЭТО
  } catch {}
  // ...
}
```

**Решение:** Убрать вызов `resetNextId()`. Если нужно сбрасывать ID, то сохранить ID playerG и установить счётчик на `playerG + 1`:

```ts
private clearWorld(world: World, preservePlayerSprite?: number): void {
  // ...
  // ✅ ИСПРАВЛЕНИЕ: не сбрасывать счётчик ID
  // (или сбросить на playerG + 1 если playerG валиден)
  try {
    const renderer = getRenderer();
    if (preservePlayerSprite && preservePlayerSprite > 0) {
      // Сбрасываем на ID после playerG
      (renderer as any)._nextId = preservePlayerSprite + 1;
    }
    // renderer.resetNextId(); // ← УДАЛИТЬ
  } catch {}
  // ...
}
```

---

## Проблема 2: Подсказка "E" отрисовывается со сдвигом

**Причина:** `_hintG` находится в `overlayLayer`, который добавлен в `worldContainer`. А `worldContainer` уже сдвигается камерой в `PixiJSRenderer.render()`. Вычитание `cam.x`/`cam.y` приводит к двойному сдвигу.

**Файл:** `src/game/ecs/ecs-systems/render-system.ts` (~строка 500)

```ts
private renderInteractionHint(
  cam: { x: number; y: number },
  nearestInteractable: InteractableHit | null | undefined,
  time: number
): void {
  if (!this._hintG) return;
  const r = this.getR();

  if (!nearestInteractable) {
    r.setGraphicsVisible(this._hintG, false);
    return;
  }

  r.setGraphicsVisible(this._hintG, true);
  
  // ❌ ОШИБКА: двойной сдвиг камеры!
  // _hintG в worldContainer, который уже сдвинут на -cam.x/-cam.y
  const hx = nearestInteractable.x - cam.x;
  const hy = nearestInteractable.y - cam.y - 20 + Math.sin(time * 5) * 1.5;
  // ...
}
```

**Решение:** Убрать вычитание камеры, использовать мировые координаты:

```ts
  r.setGraphicsVisible(this._hintG, true);
  
  // ✅ ИСПРАВЛЕНИЕ: worldContainer уже сдвигается камерой,
  // используем мировые координаты напрямую
  const hx = nearestInteractable.x;
  const hy = nearestInteractable.y - 20 + Math.sin(time * 5) * 1.5;
```

---

## Проблема 3: Подсказка имеет инвертированные цвета

**Причина:** `PixiJSRenderer.drawRect` ожидает нормализованные значения цветов (0–1), но передаются hex-значения (0x0a = 10). Формула `Math.round(10 * 255) & 0xFF = 246` даёт почти белый цвет вместо тёмного.

**Файл:** `src/game/ecs/ecs-systems/render-system.ts` (метод `renderInteractionHint`)

```ts
  // ❌ ОШИБКА: 0x0a = 10, drawRect ожидает 0-1
  r.drawRect(this._hintG, 
    { x: hx - 6, y: hy - 6, width: 12, height: 10 },
    { r: 0x0a, g: 0x0f, b: 0x16, a: 0.85 }, true);
```

**Решение:** Делить на 255 для нормализации:

```ts
  // ✅ ИСПРАВЛЕНИЕ: нормализованные значения (0-1)
  // Тёмный фон
  r.drawRect(this._hintG, 
    { x: hx - 6, y: hy - 6, width: 12, height: 10 },
    { r: 0x0a / 255, g: 0x0f / 255, b: 0x16 / 255, a: 0.85 }, true);
  
  // Золотая рамка
  r.drawRect(this._hintG, 
    { x: hx - 6, y: hy - 6, width: 12, height: 10 },
    { r: 0xc9 / 255, g: 0xa2 / 255, b: 0x4b / 255, a: 0.8 }, false, 1);
  
  // Буква "E" — пиксель-арт стиль
  r.drawPoly(this._hintG, [
    hx - 2, hy - 3, hx + 2, hy - 3,
    hx + 2, hy - 1, hx, hy - 1,
    hx, hy + 2, hx - 2, hy + 2
  ], { r: 0xe8 / 255, g: 0xdc / 255, b: 0xc0 / 255, a: 1 });
```

---

## Сводка изменений

| Проблема | Файл | Строка | Изменение |
|----------|------|--------|-----------|
| Игрок не рисуется | `ecs-map-loader.ts` | ~80 | Убрать `resetNextId()` |
| Сдвиг подсказки | `render-system.ts` | ~500 | Убрать `- cam.x` и `- cam.y` |
| Инвертированные цвета | `render-system.ts` | ~510 | Делить цвета на 255 |