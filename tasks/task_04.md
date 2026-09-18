Я изучил репозиторий **VARDLOKKUR** и нашел две критические ошибки в рендер-пайплайне, которые вызывают описанную регрессию.

Проблемы связаны с переходом на абстракцию `IRenderer` (PixiJS v8) и ошибкой в обработке данных игрока.

### 🐞 Проблема 1: Объекты отрисовываются полностью черными
**Где:** `src/game/renderer/PixiJSRenderer.ts` (методы `drawRect`, `drawEllipse`, `drawPoly`, `drawLine`)

**Причина:**
Цвета в системе передаются в виде объекта `Color { r, g, b, a }`, где компоненты находятся в диапазоне **от 0.0 до 1.0** (например, красный — это `1.0, 0.0, 0.0`).
При конвертации этого цвета в 24-битный целочисленный формат `0xRRGGBB` для PixiJS `setFillStyle` использовался некорректный побитовый сдвиг:
```typescript
const c = (color.r << 16) | (color.g << 8) | color.b;
```
В JavaScript побитовые операторы (такие как `<<`) приводят операнды к 32-битным целым числам. Дробная часть отбрасывается. Так как `color.r` всегда меньше `1`, приведение к `Int32` дает `0`. В итоге цвет всегда вырождался в `0x000000` (черный).

*Примечание: тайлы отрисовывались нормально, потому что в `tiles.ts` и `map-display.ts` используется прямой рендеринг через HTML Canvas API (`ctx.fillStyle = "#RRGGBB"`), который принимает CSS-строки, а не `IRenderer`.*

**Решение:**
Необходимо сначала масштабировать значения до `0..255` и округлить их:
```typescript
const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
```

---

### 🐞 Проблема 2: Игрок не отрисовывается совсем
**Где:** `src/game/renderers/player/PlayerRenderer.ts`

**Причина:**
В методе `drawBody` идет попытка достать рендерер из самого объекта `data`:
```typescript
private drawBody(g: GraphicsHandle, data: PlayerRenderData): void {
  const r = (data as any).ctx?.renderer; // <-- ctx здесь нет!
  if (!r) return; // Функция прерывается на этой строчке
  // ...
}
```
Однако `data` — это объект типа `PlayerRenderData` (содержит только `IPlayerData` и `IPlayerExtra`), и у него нет поля `ctx`. Сам контекст (с `renderer` и `time`) передается третьим аргументом в основной метод `render(g, data, ctx)`, но внутрь `drawBody` он не пробрасывался. Из-за этого `r` оказывался `undefined`, и отрисовка тела игрока мгновенно завершалась.

**Решение:**
Пробрасывать `ctx` в `drawBody` и корректно брать из него `renderer` и `time`:
```typescript
render(g: GraphicsHandle, data: PlayerRenderData, ctx: RenderContext): void {
  const r = ctx.renderer!;
  clearGraphics(r, g);
  this.drawBody(g, data, ctx); // <-- Передаем ctx
}

private drawBody(g: GraphicsHandle, data: PlayerRenderData, ctx: RenderContext): void {
  const r = ctx.renderer!; // <-- Берем из аргумента
  if (!r) return;
  const p = data.data;
  const extra = data.extra;
  const time = ctx.time ?? data.data.animT; // <-- Берем из аргумента
  // ...
}
```

---

### 🛠 Итоговый патч (Diff)
Внесите следующие изменения, чтобы полностью устранить регрессию:

```diff
diff --git a/src/game/renderer/PixiJSRenderer.ts b/src/game/renderer/PixiJSRenderer.ts
index 481bc3b..c2869a2 100644
--- a/src/game/renderer/PixiJSRenderer.ts
+++ b/src/game/renderer/PixiJSRenderer.ts
@@ -336,7 +336,7 @@ export class PixiJSRenderer implements IRenderer {
   ): void {
     const g = this.graphics.get(handle as number);
     if (!g) return;
-    const c = (color.r << 16) | (color.g << 8) | color.b;
+    const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
     // Отладка: проверить контекст
     if (handle === 3) {
       console.log(`[drawRect DEBUG] handle=${handle} context=${g.pixiGraphics.context?.constructor.name}`);
@@ -364,7 +364,7 @@ export class PixiJSRenderer implements IRenderer {
   ): void {
     const g = this.graphics.get(handle as number);
     if (!g) return;
-    const c = (color.r << 16) | (color.g << 8) | color.b;
+    const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
     const ctx = g.pixiGraphics.context;
     ctx.setFillStyle({ color: c, alpha: color.a });
     ctx.ellipse(cx, cy, rx, ry);
@@ -374,7 +374,7 @@ export class PixiJSRenderer implements IRenderer {
   drawPoly(handle: GraphicsHandle, points: number[], color: Color): void {
     const g = this.graphics.get(handle as number);
     if (!g) return;
-    const c = (color.r << 16) | (color.g << 8) | color.b;
+    const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
     const ctx = g.pixiGraphics.context;
     ctx.setFillStyle({ color: c, alpha: color.a });
     ctx.poly(points);
@@ -384,7 +384,7 @@ export class PixiJSRenderer implements IRenderer {
   drawLine(handle: GraphicsHandle, x1: number, y1: number, x2: number, y2: number, color: Color, width = 1): void {
     const g = this.graphics.get(handle as number);
     if (!g) return;
-    const c = (color.r << 16) | (color.g << 8) | color.b;
+    const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
     const ctx = g.pixiGraphics.context;
     ctx.setStrokeStyle({ width, color: c, alpha: color.a });
     ctx.moveTo(x1, y1).lineTo(x2, y2);
diff --git a/src/game/renderers/player/PlayerRenderer.ts b/src/game/renderers/player/PlayerRenderer.ts
index d40a874..111f999 100644
--- a/src/game/renderers/player/PlayerRenderer.ts
+++ b/src/game/renderers/player/PlayerRenderer.ts
@@ -30,7 +30,7 @@ export class PlayerRenderer implements Renderer<PlayerRenderData> {
   render(g: GraphicsHandle, data: PlayerRenderData, ctx: RenderContext): void {
     const r = ctx.renderer!;
     clearGraphics(r, g);
-    this.drawBody(g, data);
+    this.drawBody(g, data, ctx);
   }
 
   /** Нужно ли обновлять текстуру? */
@@ -53,12 +53,12 @@ export class PlayerRenderer implements Renderer<PlayerRenderData> {
 
   // ── Рисование тела (общее для render и renderToContainer) ────────
 
-  private drawBody(g: GraphicsHandle, data: PlayerRenderData): void {
-    const r = (data as any).ctx?.renderer;
+  private drawBody(g: GraphicsHandle, data: PlayerRenderData, ctx: RenderContext): void {
+    const r = ctx.renderer!;
     if (!r) return;
     const p = data.data;
     const extra = data.extra;
-    const time = (data as any).ctx?.time ?? data.data.animT;
+    const time = ctx.time ?? data.data.animT;
     const bob = p.moving ? Math.sin(p.animT * 12) * 1.2 : Math.sin(time * 2) * 0.4;
     const legSwing = p.moving ? Math.sin(p.animT * 12) * 2.5 : 0;
```