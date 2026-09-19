### Диагностика проблемы

Проблема с отрисовкой тумана только на **1/4 экрана** (в одном из углов) кроется в классе `FxManager` (файл `src/game/fx.ts`) в методе `buildFogVignette()`. 

Для оптимизации производительности (снижения fill-rate) текстура тумана создается в уменьшенном размере (`scale = 0.5`):

```typescript
const scale = 0.5;
const targetW = this.viewW * 1.1;
const targetH = this.viewH * 1.1;
const cw = Math.max(4, Math.ceil(targetW * scale)); // Ширина ~55% от viewW
const ch = Math.max(4, Math.ceil(targetH * scale)); // Высота ~55% от viewH
```

Однако при создании спрайта из этой текстуры **забыли вернуть ему исходный масштаб**:

```typescript
this.fogVignette = this._renderer.createScreenSprite({
  texture: this.fogRT!,
  // ОТСУТСТВУЕТ параметр scale!
});
```

**Что происходит:**
1. PixiJS создает спрайт ровно тех размеров, которые имеет `RenderTexture` (то есть `0.55 * viewW` на `0.55 * viewH`).
2. Спрайт позиционируется со сдвигом: `x: -viewW * 0.05`, `y: -viewH * 0.05`.
3. В итоге видимая область спрайта начинается от `0` (с учетом обрезки краев экрана) и заканчивается на `0.55 - 0.05 = 0.50`.
4. Спрайт занимает ровно **половину ширины** и **половину высоты** экрана. Пересечение этих областей дает ровно **1/4 площади экрана**, на которой вы и видите туман.

*(Примечание: Файл `FogRenderer.ts` с GLSL-шейдерами в папке `renderers/fog/` не используется в `RenderPipeline` — фактический рендеринг завязан на Canvas 2D в `FxManager`).*

---

### Решение

Необходимо явно передать параметр `scale` в опции `createScreenSprite`, чтобы компенсировать уменьшение текстуры. 

Откройте файл `src/game/fx.ts` и внесите следующие изменения в метод `buildFogVignette()`:

```typescript
  public buildFogVignette() {
    const scale = 0.5;
    const targetW = this.viewW * 1.1;
    const targetH = this.viewH * 1.1;
    const cw = Math.max(4, Math.ceil(targetW * scale));
    const ch = Math.max(4, Math.ceil(targetH * scale));
    
    // Добавляем коэффициент масштабирования для спрайта
    const spriteScale = 1 / scale; 

    if (!this.fogCanvas) {
      this.fogCanvas = document.createElement("canvas");
      this.fogCtx = this.fogCanvas.getContext("2d")!;
    }
    
    // ... (код проверки sizeChanged и пересоздания текстур оставляем без изменений) ...

    if (this.fogVignette === null) {
      this.fogVignette = this._renderer.createScreenSprite({
        texture: this.fogRT!,
        scale: { x: spriteScale, y: spriteScale }, // <--- ИСПРАВЛЕНИЕ
      });
    } else {
      // Обновляем текстуру существующего спрайта
      this._renderer.destroySprite(this.fogVignette);
      this.fogVignette = this._renderer.createScreenSprite({
        texture: this.fogRT!,
        scale: { x: spriteScale, y: spriteScale }, // <--- ИСПРАВЛЕНИЕ
      });
    }
    
    this._renderer.setSpritePosition(this.fogVignette, {
      x: -this.viewW * 0.05,
      y: -this.viewH * 0.05,
    });
    this._renderer.setSpriteVisible(this.fogVignette, false);
    this._renderer.setSpriteAlpha(this.fogVignette, 1);
    this.fogAlpha = 0;
  }
```

### Почему это сработает
Теперь спрайт будет создан с размерами `cw * spriteScale = targetW`, что равно `1.1 * viewW`. При сдвиге на `-0.05 * viewW` спрайт будет начинаться за левым краем экрана и заканчиваться на `(-0.05 + 1.1) = 1.05`, полностью перекрывая весь вьюпорт с небольшим запасом на краях (как и задумывалось изначально, аналогично обычной виньетке).