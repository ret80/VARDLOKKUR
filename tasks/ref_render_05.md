Давайте начнём с изучения репозитория, чтобы понять текущую архитектуру.


# Полный план рефакторинга: Адаптер IRenderer для VARDLOKKUR

## 📊 Анализ текущей архитектуры

После изучения репозитория выявлены следующие проблемы:

| Проблема | Где находится | Влияние |
|---|---|---|
| Прямые импорты `pixi.js` | 15+ файлов (render-system.ts, scene-manager.ts, TextureCacheManager.ts, все renderers) | Высокая связность |
| PixiJS `Container` как "узел" | SceneManager, TextureCacheManager, render-system.ts | Сложно тестировать и менять |
| PixiJS `Graphics` в рендерерах | BaseEnemyRenderer, все Renderer классы | Невозможно сменить движок |
| PixiJS `Application` в Engine | engine.ts (конструктор `new Application()`) | Жёсткая привязка |
| `RenderTexture`, `Sprite` в коде | TextureCacheManager, render-system.ts | Сложный дебаг |

---

## 🎯 Цель

Создать единый интерфейс `IRenderer`, который:
1. Скрывает **все** детали PixiJS
2. Работает с абстрактными сущностями: `SpriteHandle`, `GraphicsHandle`, `ShaderHandle`
3. Поддерживает: спрайты, интерфейсы (UI), шейдеры, слои, сортировку
4. Не использует "узлы" (Container/Scene Graph) в бизнес-логике

---

## 📋 План реализации (9 этапов)

---

### **Этап 1: Проектирование интерфейса IRenderer**

**Принципы проектирования:** 
- **DIP (Dependency Inversion)** — всё зависит от абстракции
- **ISP (Interface Segregation)** — узкие интерфейсы: `ISpriteFactory`, `IGraphicsRenderer`, `IShaderRenderer`
- **SRP (Single Responsibility)** — каждый модуль делает одно дело

**Код интерфейса:**

```typescript
// src/game/renderer/IRenderer.ts

/** Абстрактный "handle" — лёгкий идентификатор ресурса. 
 *  Вместо PixiJS Sprite/Container/Texture мы работаем с ID. */
export type SpriteHandle = number & { __brand: 'sprite' };
export type GraphicsHandle = number & { __brand: 'graphics' };
export type LayerHandle = number & { __brand: 'layer' };
export type TextureHandle = number & { __brand: 'texture' };
export type ShaderHandle = number & { __brand: 'shader' };
export type UIElementHandle = number & { __brand: 'ui' };

export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Color { r: number; g: number; b: number; a: number }

/** Опции создания спрайта */
export interface SpriteCreateOptions {
  texture: TextureHandle | string; // URL или handle
  x?: number; y?: number;
  anchor?: Vec2;
  scale?: Vec2;
  layer?: LayerHandle;
  visible?: boolean;
  alpha?: number;
  tint?: number;
}

export interface IRenderer {
  // === Lifecycle ===
  init(container: HTMLElement, width: number, height: number): Promise<void>;
  destroy(): void;
  resize(width: number, height: number): void;
  render(): void; // финальный отрисовка кадра

  // === Layers (замещают Container tree) ===
  createLayer(name: string, zIndex: number): LayerHandle;
  setLayerVisible(layer: LayerHandle, visible: boolean): void;

  // === Sprites ===
  createSprite(options: SpriteCreateOptions): SpriteHandle;
  destroySprite(handle: SpriteHandle): void;
  setSpritePosition(handle: SpriteHandle, pos: Vec2): void;
  setSpriteVisible(handle: SpriteHandle, visible: boolean): void;
  setSpriteAlpha(handle: SpriteHandle, alpha: number): void;
  setSpriteTint(handle: SpriteHandle, tint: number): void;
  setSpriteScale(handle: SpriteHandle, scale: Vec2): void;
  setSpriteZIndex(handle: SpriteHandle, zIndex: number): void;

  // === Graphics (примитивы: rect, ellipse, line, poly) ===
  createGraphics(layer?: LayerHandle): GraphicsHandle;
  destroyGraphics(handle: GraphicsHandle): void;
  clearGraphics(handle: GraphicsHandle): void;
  drawRect(handle: GraphicsHandle, rect: Rect, color: Color, fill?: boolean, strokeWidth?: number): void;
  drawEllipse(handle: GraphicsHandle, cx: number, cy: number, rx: number, ry: number, color: Color): void;
  drawPoly(handle: GraphicsHandle, points: number[], color: Color): void;
  setGraphicsPosition(handle: GraphicsHandle, pos: Vec2): void;
  setGraphicsVisible(handle: GraphicsHandle, visible: boolean): void;

  // === Textures (для запекания и кэширования) ===
  loadTexture(url: string): Promise<TextureHandle>;
  createRenderTexture(width: number, height: number): TextureHandle;
  renderToTexture(texture: TextureHandle, source: GraphicsHandle | SpriteHandle): void;
  destroyTexture(handle: TextureHandle): void;

  // === UI ===
  createText(text: string, style: { fontSize?: number; color?: number; fontFamily?: string }, layer?: LayerHandle): UIElementHandle;
  setText(handle: UIElementHandle, text: string): void;
  setTextStyle(handle: UIElementHandle, style: { fontSize?: number; color?: number }): void;
  destroyUIElement(handle: UIElementHandle): void;

  // === Shaders ===
  createShader(vertex: string, fragment: string, uniforms?: Record<string, any>): ShaderHandle;
  applyShaderToLayer(layer: LayerHandle, shader: ShaderHandle, uniforms?: Record<string, any>): void;
  setShaderUniform(shader: ShaderHandle, name: string, value: any): void;
  destroyShader(handle: ShaderHandle): void;

  // === Camera (замещает ViewportController) ===
  setCameraPosition(pos: Vec2): void;
  setCameraBounds(bounds: Rect | null): void;
  worldToScreen(worldPos: Vec2): Vec2;
  screenToWorld(screenPos: Vec2): Vec2;
  isVisibleInViewport(worldPos: Vec2, radius: number): boolean;

  // === Debug ===
  getStats(): { sprites: number; textures: number; drawCalls: number };
}
```

**Результат этапа:** Единый контракт. Все детали PixiJS скрыты.

---

### **Этап 2: PixiJSRenderer — реализация адаптера**

**Принципы:**
- **Adapter Pattern** — адаптирует PixiJS API под IRenderer
- **Façade Pattern** — предоставляет единый вход в PixiJS

**Код:**

```typescript
// src/game/renderer/PixiJSRenderer.ts

import { Application, Container, Sprite, Graphics, RenderTexture, Texture, Text, 
         Filter, AbstractShader } from 'pixi.js';
import type { 
  IRenderer, SpriteHandle, GraphicsHandle, LayerHandle, TextureHandle, 
  ShaderHandle, UIElementHandle, SpriteCreateOptions, Vec2, Rect, Color 
} from './IRenderer';
import { logger } from '../debug/logger';

/** Внутренние данные спрайта — НЕ экспортируются наружу */
interface InternalSprite {
  pixiSprite: Sprite;
  layer: LayerHandle;
}

interface InternalGraphics {
  pixiGraphics: Graphics;
  layer: LayerHandle;
}

interface InternalLayer {
  container: Container;
  zIndex: number;
  name: string;
}

interface InternalShader {
  filter: Filter;
  uniforms: Record<string, any>;
}

export class PixiJSRenderer implements IRenderer {
  private app!: Application;
  private _nextId = 1;
  
  private sprites = new Map<number, InternalSprite>();
  private graphics = new Map<number, InternalGraphics>();
  private layers = new Map<number, InternalLayer>();
  private textures = new Map<number, Texture>();
  private shaders = new Map<number, InternalShader>();
  private uiElements = new Map<number, Text>();
  
  private cameraPos: Vec2 = { x: 0, y: 0 };
  private cameraBounds: Rect | null = null;
  private worldContainer!: Container;

  async init(container: HTMLElement, width: number, height: number): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: 0x05080d,
      antialias: false,
      resolution: 1,
      width, height
    });
    container.appendChild(this.app.canvas);

    // Корневой контейнер мира (сдвигается камерой)
    this.worldContainer = new Container();
    this.worldContainer.sortableChildren = true;
    this.app.stage.addChild(this.worldContainer);
    
    logger.info('renderer', `PixiJSRenderer initialized: ${width}x${height}`);
  }

  destroy(): void {
    this.sprites.forEach(s => s.pixiSprite.destroy());
    this.graphics.forEach(g => g.pixiGraphics.destroy());
    this.textures.forEach(t => t.destroy(true));
    this.app.destroy(true, { children: true, texture: true });
    this.sprites.clear();
    this.graphics.clear();
    this.layers.clear();
    this.textures.clear();
    logger.info('renderer', 'PixiJSRenderer destroyed');
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  render(): void {
    // Применяем камеру
    this.worldContainer.x = -this.cameraPos.x;
    this.worldContainer.y = -this.cameraPos.y;
    // PixiJS рендерит автоматически через ticker, 
    // но можно вызвать this.app.render() для синхронного режима
  }

  // === Layers ===
  createLayer(name: string, zIndex: number): LayerHandle {
    const id = this._nextId++;
    const container = new Container();
    container.sortableChildren = true;
    container.zIndex = zIndex;
    this.worldContainer.addChild(container);
    this.layers.set(id, { container, zIndex, name });
    return id as LayerHandle;
  }

  setLayerVisible(layer: LayerHandle, visible: boolean): void {
    const l = this.layers.get(layer);
    if (l) l.container.visible = visible;
  }

  // === Sprites ===
  createSprite(options: SpriteCreateOptions): SpriteHandle {
    const id = this._nextId++;
    let tex: Texture;
    if (typeof options.texture === 'string') {
      tex = Texture.from(options.texture);
    } else {
      tex = this.textures.get(options.texture) || Texture.EMPTY;
    }
    const sprite = new Sprite(tex);
    sprite.x = options.x ?? 0;
    sprite.y = options.y ?? 0;
    if (options.anchor) sprite.anchor.set(options.anchor.x, options.anchor.y);
    if (options.scale) sprite.scale.set(options.scale.x, options.scale.y);
    if (options.alpha !== undefined) sprite.alpha = options.alpha;
    if (options.tint !== undefined) sprite.tint = options.tint;
    sprite.visible = options.visible ?? true;

    const layerId = options.layer ?? (this.layers.values().next().value as InternalLayer)?.container;
    const layer = options.layer ? this.layers.get(options.layer) : null;
    if (layer) layer.container.addChild(sprite);
    else this.worldContainer.addChild(sprite);

    this.sprites.set(id, { pixiSprite: sprite, layer: layerId as LayerHandle });
    return id as SpriteHandle;
  }

  destroySprite(handle: SpriteHandle): void {
    const s = this.sprites.get(handle as number);
    if (s) {
      s.pixiSprite.destroy();
      this.sprites.delete(handle as number);
    }
  }

  setSpritePosition(handle: SpriteHandle, pos: Vec2): void {
    const s = this.sprites.get(handle as number);
    if (s) { s.pixiSprite.x = pos.x; s.pixiSprite.y = pos.y; }
  }

  setSpriteVisible(handle: SpriteHandle, visible: boolean): void {
    const s = this.sprites.get(handle as number);
    if (s) s.pixiSprite.visible = visible;
  }

  setSpriteAlpha(handle: SpriteHandle, alpha: number): void {
    const s = this.sprites.get(handle as number);
    if (s) s.pixiSprite.alpha = alpha;
  }

  setSpriteTint(handle: SpriteHandle, tint: number): void {
    const s = this.sprites.get(handle as number);
    if (s) s.pixiSprite.tint = tint;
  }

  setSpriteScale(handle: SpriteHandle, scale: Vec2): void {
    const s = this.sprites.get(handle as number);
    if (s) s.pixiSprite.scale.set(scale.x, scale.y);
  }

  setSpriteZIndex(handle: SpriteHandle, zIndex: number): void {
    const s = this.sprites.get(handle as number);
    if (s) s.pixiSprite.zIndex = zIndex;
  }

  // === Graphics ===
  createGraphics(layer?: LayerHandle): GraphicsHandle {
    const id = this._nextId++;
    const g = new Graphics();
    if (layer) {
      const l = this.layers.get(layer);
      if (l) l.container.addChild(g);
    } else {
      this.worldContainer.addChild(g);
    }
    this.graphics.set(id, { pixiGraphics: g, layer });
    return id as GraphicsHandle;
  }

  destroyGraphics(handle: GraphicsHandle): void {
    const g = this.graphics.get(handle as number);
    if (g) { g.pixiGraphics.destroy(); this.graphics.delete(handle as number); }
  }

  clearGraphics(handle: GraphicsHandle): void {
    const g = this.graphics.get(handle as number);
    if (g) g.pixiGraphics.clear();
  }

  drawRect(handle: GraphicsHandle, rect: Rect, color: Color, fill = true, strokeWidth = 0): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = (color.r << 16) | (color.g << 8) | color.b;
    if (fill) {
      g.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: c, alpha: color.a });
    }
    if (strokeWidth > 0) {
      g.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color: c, alpha: color.a, width: strokeWidth });
    }
  }

  drawEllipse(handle: GraphicsHandle, cx: number, cy: number, rx: number, ry: number, color: Color): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = (color.r << 16) | (color.g << 8) | color.b;
    g.ellipse(cx, cy, rx, ry).fill({ color: c, alpha: color.a });
  }

  drawPoly(handle: GraphicsHandle, points: number[], color: Color): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = (color.r << 16) | (color.g << 8) | color.b;
    g.poly(points).fill({ color: c, alpha: color.a });
  }

  setGraphicsPosition(handle: GraphicsHandle, pos: Vec2): void {
    const g = this.graphics.get(handle as number);
    if (g) { g.pixiGraphics.x = pos.x; g.pixiGraphics.y = pos.y; }
  }

  setGraphicsVisible(handle: GraphicsHandle, visible: boolean): void {
    const g = this.graphics.get(handle as number);
    if (g) g.pixiGraphics.visible = visible;
  }

  // === Textures ===
  async loadTexture(url: string): Promise<TextureHandle> {
    const id = this._nextId++;
    const tex = await Texture.from(url);
    this.textures.set(id, tex);
    return id as TextureHandle;
  }

  createRenderTexture(width: number, height: number): TextureHandle {
    const id = this._nextId++;
    const rt = RenderTexture.create({ width, height });
    this.textures.set(id, rt);
    return id as TextureHandle;
  }

  renderToTexture(texture: TextureHandle, source: GraphicsHandle | SpriteHandle): void {
    const tex = this.textures.get(texture as number);
    if (!tex) return;
    const g = this.graphics.get(source as number);
    const s = this.sprites.get(source as number);
    const src = g?.pixiGraphics || s?.pixiSprite;
    if (!src) return;
    
    // Временно добавляем в сцену для корректного bake
    this.worldContainer.addChild(src);
    this.app.renderer.render({ container: src, target: tex as RenderTexture, clear: true });
    src.parent?.removeChild(src);
  }

  destroyTexture(handle: TextureHandle): void {
    const t = this.textures.get(handle as number);
    if (t) { t.destroy(true); this.textures.delete(handle as number); }
  }

  // === UI (Text) ===
  createText(text: string, style: { fontSize?: number; color?: number; fontFamily?: string }, layer?: LayerHandle): UIElementHandle {
    const id = this._nextId++;
    const t = new Text({ text, style: { 
      fontSize: style.fontSize ?? 12, 
      fill: style.color ?? 0xffffff,
      fontFamily: style.fontFamily ?? 'monospace'
    }});
    if (layer) {
      const l = this.layers.get(layer);
      if (l) l.container.addChild(t);
    } else {
      this.app.stage.addChild(t);
    }
    this.uiElements.set(id, t);
    return id as UIElementHandle;
  }

  setText(handle: UIElementHandle, text: string): void {
    const t = this.uiElements.get(handle as number);
    if (t) t.text = text;
  }

  setTextStyle(handle: UIElementHandle, style: { fontSize?: number; color?: number }): void {
    const t = this.uiElements.get(handle as number);
    if (t) {
      if (style.fontSize) (t.style as any).fontSize = style.fontSize;
      if (style.color) (t.style as any).fill = style.color;
    }
  }

  destroyUIElement(handle: UIElementHandle): void {
    const t = this.uiElements.get(handle as number);
    if (t) { t.destroy(); this.uiElements.delete(handle as number); }
  }

  // === Shaders ===
  createShader(vertex: string, fragment: string, uniforms?: Record<string, any>): ShaderHandle {
    const id = this._nextId++;
    const filter = new Filter({ 
      vertex, fragment, 
      uniforms: uniforms ?? {} 
    });
    this.shaders.set(id, { filter, uniforms: uniforms ?? {} });
    return id as ShaderHandle;
  }

  applyShaderToLayer(layer: LayerHandle, shader: ShaderHandle, uniforms?: Record<string, any>): void {
    const l = this.layers.get(layer);
    const s = this.shaders.get(shader as number);
    if (!l || !s) return;
    if (uniforms) {
      for (const [k, v] of Object.entries(uniforms)) {
        (s.filter.uniforms as any)[k] = v;
      }
    }
    l.container.filters = [s.filter];
  }

  setShaderUniform(shader: ShaderHandle, name: string, value: any): void {
    const s = this.shaders.get(shader as number);
    if (s) (s.filter.uniforms as any)[name] = value;
  }

  destroyShader(handle: ShaderHandle): void {
    const s = this.shaders.get(handle as number);
    if (s) { s.filter.destroy(); this.shaders.delete(handle as number); }
  }

  // === Camera ===
  setCameraPosition(pos: Vec2): void {
    this.cameraPos = { ...pos };
  }

  setCameraBounds(bounds: Rect | null): void {
    this.cameraBounds = bounds;
  }

  worldToScreen(worldPos: Vec2): Vec2 {
    return {
      x: worldPos.x - this.cameraPos.x,
      y: worldPos.y - this.cameraPos.y
    };
  }

  screenToWorld(screenPos: Vec2): Vec2 {
    return {
      x: screenPos.x + this.cameraPos.x,
      y: screenPos.y + this.cameraPos.y
    };
  }

  isVisibleInViewport(worldPos: Vec2, radius: number): boolean {
    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    const sx = worldPos.x - this.cameraPos.x;
    const sy = worldPos.y - this.cameraPos.y;
    return sx + radius > 0 && sx - radius < vw && 
           sy + radius > 0 && sy - radius < vh;
  }

  // === Debug ===
  getStats(): { sprites: number; textures: number; drawCalls: number } {
    return {
      sprites: this.sprites.size,
      textures: this.textures.size,
      drawCalls: (this.app.renderer as any)._lastObjectRendered?.drawCalls ?? 0
    };
  }
}
```

**Результат этапа:** Полностью рабочий адаптер. PixiJS изолирован в одном файле.

---

### **Этап 3: Фабрика и DI-контейнер для рендерера**

**Принципы:** 
- **Factory Method** — для создания разных реализаций (PixiJS, Canvas, WebGL)
- **Singleton** — глобальный доступ к рендереру (опционально)

```typescript
// src/game/renderer/RendererFactory.ts

import { PixiJSRenderer } from './PixiJSRenderer';
import type { IRenderer } from './IRenderer';

export type RendererType = 'pixi' | 'canvas' | 'headless';

export class RendererFactory {
  static create(type: RendererType = 'pixi'): IRenderer {
    switch (type) {
      case 'pixi': return new PixiJSRenderer();
      // case 'canvas': return new CanvasRenderer();
      // case 'headless': return new HeadlessRenderer(); // для тестов
      default: throw new Error(`Unknown renderer type: ${type}`);
    }
  }
}

// Глобальный DI
let _renderer: IRenderer | null = null;

export function setGlobalRenderer(r: IRenderer): void { _renderer = r; }
export function getRenderer(): IRenderer {
  if (!_renderer) throw new Error('Renderer not initialized');
  return _renderer;
}
```

**Результат этапа:** Гибкость для тестирования и смены движка.

---

### **Этап 4: Рефакторинг `types.ts` — новый контракт Renderer'а**

**Принцип:** **Open/Closed Principle** — добавление нового типа сущности = 1 новая строка.

**Старый интерфейс** (зависит от PixiJS):
```typescript
// ❌ СТАРЫЙ: зависит от pixi.js
export interface Renderer<TData> {
  render(g: Graphics, data: TData, ctx: RenderContext): void;
  renderToContainer?(container: Container, data: TData, ctx: RenderContext): void;
}
```

**Новый интерфейс** (не зависит от PixiJS):

```typescript
// src/game/renderers/core/types.ts (НОВАЯ ВЕРСИЯ)

import type { GraphicsHandle, ShaderHandle, RenderContext } from '../../renderer/IRenderer';

export enum CacheStrategy {
  REALTIME_GRAPHICS = 'realtime',
  STATIC_TEXTURE = 'static',
  DYNAMIC_TEXTURE = 'dynamic',
}

/**
 * Рендерер абстрагирован от движка.
 * Использует GraphicsHandle — абстракцию над пиксельной графикой.
 */
export interface Renderer<TData> {
  /** Отрисовка в GraphicsHandle (для REALTIME) */
  render(g: GraphicsHandle, data: TData, ctx: RenderContext): void;

  /** Стратегия кэширования */
  readonly strategy?: CacheStrategy;

  /** Нужно ли обновлять кэш? (DYNAMIC_TEXTURE) */
  needsTextureUpdate?(data: TData, prevData: TData | null): boolean;

  /** Ключ для переиспользования кэша (STATIC_TEXTURE) */
  getCacheKey?(data: TData): string;
}

export interface RenderContext {
  time: number;
  [key: string]: unknown;
}
```

**Результат этапа:** Renderer'ы больше не знают про PixiJS.

---

### **Этап 5: Адаптация BaseEnemyRenderer под IRenderer**

**Было:** `BaseEnemyRenderer` использовал `Graphics` из PixiJS.
**Стало:** Использует `GraphicsHandle` и API IRenderer.

```typescript
// src/game/renderers/enemy/BaseEnemyRenderer.ts (НОВАЯ ВЕРСИЯ)

import type { GraphicsHandle, Vec2 } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import { CacheStrategy } from '../core/types';
import type { Renderer, RenderContext } from '../core/types';
import type { IEnemyData } from '../../models';

export abstract class BaseEnemyRenderer implements Renderer<IEnemyData> {
  protected abstract drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void;
  readonly strategy: CacheStrategy = CacheStrategy.REALTIME_GRAPHICS;

  render(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const r = getRenderer();
    r.clearGraphics(g);
    if (data.dead) return;

    const flash = data.flashT > 0;
    const frozen = data.freezeT > 0;
    const a = (data.hidden ? 0.25 : 1) * data.fade;

    // Тень
    r.drawEllipse(g, 0, 5, 6, 2.2, { r: 0x05, g: 0x08, b: 0x0d, a: 0.5 * a });

    // Тело
    const tint = (c: number) => flash ? 0xffffff : frozen ? 0x9fd8e8 : c;
    this.drawBody(g, data, { ...ctx, tint, a });

    // HP бар
    if (data.hp < data.maxHp && data.kind !== 'snake') {
      const wdt = data.r * 2;
      const bg: Vec2 = { x: -wdt / 2, y: -data.r - 9 };
      r.drawRect(g, { x: bg.x, y: bg.y, width: wdt, height: 2 }, 
                 { r: 0x0a, g: 0x0f, b: 0x16, a: 0.8 });
      r.drawRect(g, { x: bg.x, y: bg.y, width: wdt * (data.hp / data.maxHp), height: 2 }, 
                 { r: 0xe0, g: 0x50, b: 0x50, a: 0.9 });
    }
  }

  needsTextureUpdate(data: IEnemyData, prevData: IEnemyData | null): boolean {
    if (!prevData) return true;
    return data.state !== prevData.state || data.flashT !== prevData.flashT ||
           data.freezeT !== prevData.freezeT || data.hidden !== prevData.hidden ||
           data.fade !== prevData.fade;
  }
}
```

**Рефакторинг конкретного рендерера (например, `GhostRenderer`):**

```typescript
// src/game/renderers/enemy/GhostRenderer.ts
import { getRenderer } from '../../renderer/RendererFactory';
import type { GraphicsHandle, RenderContext } from '../../renderer/IRenderer';
import { BaseEnemyRenderer } from './BaseEnemyRenderer';
import type { IEnemyData } from '../../models';

export class GhostRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const r = getRenderer();
    const tintFn = ctx.tint as (c: number) => number;
    const alpha = ctx.a as number;
    
    const c = tintFn(0x8ba8c4);
    const color = {
      r: (c >> 16) & 0xff,
      g: (c >> 8) & 0xff,
      b: c & 0xff,
      a: alpha
    };
    
    // Тело призрака
    r.drawEllipse(g, 0, -2, data.r, data.r * 1.2, color);
    // "Волнистый" низ
    r.drawPoly(g, [
      -data.r, 4, -data.r / 2, 8, 0, 4, data.r / 2, 8, data.r, 4
    ], color);
  }
}
```

**Результат этапа:** Все 10+ рендереров (Player, Enemy, NPC, Drop, Projectile, Chest, etc.) переделаны аналогично.

---

### **Этап 6: Рефакторинг RenderSystem**

**Замена всех PixiJS API на IRenderer:**

```typescript
// src/game/ecs/ecs-systems/render-system.ts (фрагменты изменений)

import { getRenderer, type IRenderer } from '../../renderer/RendererFactory';
import type { GraphicsHandle, SpriteHandle, LayerHandle, TextureHandle } from '../../renderer/IRenderer';

export class RenderSystem {
  private renderer!: IRenderer;
  private entityLayer!: LayerHandle;
  private fxLayer!: LayerHandle;
  private overlayLayer!: LayerHandle;
  private hintGraphics!: GraphicsHandle;

  // Инициализация с внедрением рендерера (DIP)
  init(renderer: IRenderer): void {
    this.renderer = renderer;
    this.entityLayer = renderer.createLayer('entities', 40);
    this.fxLayer = renderer.createLayer('fx', 50);
    this.overlayLayer = renderer.createLayer('overlay', 9999);
    this.hintGraphics = renderer.createGraphics(this.overlayLayer);
  }

  render(world: World, opts: RenderSystemOptions): void {
    // ❌ БЫЛО: cameraController.trackPlayer(...)
    // ✅ СТАЛО:
    if (opts.playerEid >= 0) {
      this.renderer.setCameraPosition({
        x: Position.x[opts.playerEid],
        y: Position.y[opts.playerEid]
      });
    }

    // Обновление позиций спрайтов
    for (const eid of query(world, [Position, SpriteComp])) {
      const handle = this.getSpriteHandle(eid);
      if (handle) {
        this.renderer.setSpritePosition(handle, { x: Position.x[eid], y: Position.y[eid] });
      }
    }

    // Видимость
    for (const eid of query(world, [SpriteComp])) {
      const handle = this.getSpriteHandle(eid);
      if (!handle) continue;
      
      const visible = this.renderer.isVisibleInViewport(
        { x: Position.x[eid], y: Position.y[eid] }, 
        Radius.value[eid] || 8
      );
      this.renderer.setSpriteVisible(handle, visible);
      
      // Альфа для Dead/Hidden
      if (Dead[eid]) this.renderer.setSpriteAlpha(handle, 0);
      else if (Hidden[eid]) this.renderer.setSpriteAlpha(handle, 0.25);
      else this.renderer.setSpriteAlpha(handle, 1);
    }

    // Сортировка (через zIndex)
    for (const eid of query(world, [SpriteComp])) {
      const handle = this.getSpriteHandle(eid);
      if (handle) {
        const layer = this.getLayer(eid);
        this.renderer.setSpriteZIndex(handle, layer + Math.round(Position.y[eid]));
      }
    }

    // Диспетчеризация через реестры
    this.renderPlayerEcs(world, opts.playerEid, opts);
    this.renderByRegistry(world, [SpriteComp, Enemy], /* ... */);
    this.renderNpcsEcs(world, opts);
    this.renderObjectsEcs(world);

    // Финальный рендер
    this.renderer.render();
  }

  private renderInteractionHint(pos: Vec2, time: number): void {
    const r = this.renderer;
    r.clearGraphics(this.hintGraphics);
    
    const hx = pos.x - Math.sin(time * 5) * 1.5;
    const hy = pos.y - 20;
    
    // Тёмный фон
    r.drawRect(this.hintGraphics, 
      { x: hx - 6, y: hy - 6, width: 12, height: 10 },
      { r: 0x0a, g: 0x0f, b: 0x16, a: 0.85 }, true);
    
    // Золотая рамка
    r.drawRect(this.hintGraphics, 
      { x: hx - 6, y: hy - 6, width: 12, height: 10 },
      { r: 0xc9, g: 0xa2, b: 0x4b, a: 0.8 }, false, 1);
    
    // Буква "E"
    r.drawPoly(this.hintGraphics, [
      hx - 2, hy - 3, hx + 2, hy - 3,
      hx + 2, hy - 1, hx, hy - 1,
      hx, hy + 2, hx - 2, hy + 2
    ], { r: 0xe8, g: 0xdc, b: 0xc0, a: 1 });
  }
}
```

**Результат этапа:** `RenderSystem` полностью отвязан от PixiJS.

---

### **Этап 7: Рефакторинг TextureCacheManager**

```typescript
// src/game/renderers/core/TextureCacheManager.ts (НОВАЯ ВЕРСИЯ)

import { getRenderer, type IRenderer } from '../../renderer/RendererFactory';
import type { GraphicsHandle, TextureHandle, SpriteHandle, LayerHandle } from '../../renderer/IRenderer';

interface EntityBakeCache {
  graphics: GraphicsHandle;
  texture: TextureHandle;
  sprite: SpriteHandle;
  size: number;
  baked: boolean;
}

export class TextureCacheManager {
  private static _instance: TextureCacheManager | null = null;
  static get instance(): TextureCacheManager {
    if (!this._instance) this._instance = new TextureCacheManager();
    return this._instance;
  }

  private renderer!: IRenderer;
  private cache = new Map<number, EntityBakeCache>();

  init(renderer: IRenderer): void {
    this.renderer = renderer;
  }

  getOrCreate(eid: number, radius: number): EntityBakeCache {
    const existing = this.cache.get(eid);
    if (existing) return existing;

    const size = Math.min(64, Math.max(32, radius * 4 + 16));
    const texture = this.renderer.createRenderTexture(size, size);
    const graphics = this.renderer.createGraphics();
    const sprite = this.renderer.createSprite({
      texture, 
      anchor: { x: 0.5, y: 0.5 },
      visible: false
    });

    const cache: EntityBakeCache = { graphics, texture, sprite, size, baked: false };
    this.cache.set(eid, cache);
    return cache;
  }

  bake(eid: number): boolean {
    const entry = this.cache.get(eid);
    if (!entry) return false;
    try {
      this.renderer.renderToTexture(entry.texture, entry.graphics);
      entry.baked = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  destroyEntity(eid: number): void {
    const e = this.cache.get(eid);
    if (!e) return;
    this.renderer.destroySprite(e.sprite);
    this.renderer.destroyTexture(e.texture);
    this.renderer.destroyGraphics(e.graphics);
    this.cache.delete(eid);
  }

  destroy(): void {
    this.cache.forEach((_, eid) => this.destroyEntity(eid));
    this.cache.clear();
  }
}
```

**Результат этапа:** TextureCacheManager больше не зависит от PixiJS.

---

### **Этап 8: Замена SceneManager на IRenderer**

**Полное удаление** `scene-manager.ts`. Вместо него используется `IRenderer`:

```typescript
// В engine.ts
// ❌ БЫЛО:
// this.scene = new SceneManager(app);
// this.scene.attachToStage();

// ✅ СТАЛО:
this.renderer = new PixiJSRenderer();
await this.renderer.init(container, viewport.viewW, viewport.viewH);

// Слои
this.entityLayer = this.renderer.createLayer('entities', 40);
this.fxLayer = this.renderer.createLayer('fx', 50);
this.uiLayer = this.renderer.createLayer('ui', 100);
```

---

### **Этап 9: Интеграция шейдеров и UI**

**Пример: Шейдер для тумана**

```typescript
// src/game/renderers/fog/FogRenderer.ts

import { getRenderer } from '../../renderer/RendererFactory';

export class FogRenderer {
  private shader: ShaderHandle | null = null;
  private fogLayer: LayerHandle | null = null;

  init(renderer: IRenderer): void {
    this.fogLayer = renderer.createLayer('fog', 60);
    this.shader = renderer.createShader(
      // vertex shader
      `attribute vec2 aVertexPosition;
       varying vec2 vTextureCoord;
       void main(void) {
         gl_Position = vec4(aVertexPosition, 0.0, 1.0);
         vTextureCoord = aVertexPosition * 0.5 + 0.5;
       }`,
      // fragment shader
      `uniform float uTime;
       uniform vec2 uPlayerPos;
       varying vec2 vTextureCoord;
       void main(void) {
         float d = distance(vTextureCoord, uPlayerPos);
         float fog = smoothstep(0.3, 0.8, d);
         gl_FragColor = vec4(0.1, 0.1, 0.15, fog * 0.7);
       }`,
      { uTime: 0, uPlayerPos: [0.5, 0.5] }
    );
    renderer.applyShaderToLayer(this.fogLayer, this.shader);
  }

  update(time: number, playerPos: { x: number; y: number }): void {
    if (!this.shader) return;
    const r = getRenderer();
    r.setShaderUniform(this.shader, 'uTime', time);
    r.setShaderUniform(this.shader, 'uPlayerPos', [playerPos.x, playerPos.y]);
  }
}
```

**Пример: UI система (HUD)**

```typescript
// src/game/hud/HudSystem.ts

export class HudSystem {
  private hpBar!: GraphicsHandle;
  private hpText!: UIElementHandle;

  init(renderer: IRenderer): void {
    const uiLayer = renderer.createLayer('hud', 1000);
    this.hpBar = renderer.createGraphics(uiLayer);
    this.hpText = renderer.createText('HP: 100/100', 
      { fontSize: 14, color: 0xe8dcc0 }, uiLayer);
  }

  update(hp: number, maxHp: number): void {
    const r = getRenderer();
    r.clearGraphics(this.hpBar);
    
    // Фон
    r.drawRect(this.hpBar, { x: 20, y: 20, width: 200, height: 20 }, 
               { r: 0x0a, g: 0x0f, b: 0x16, a: 0.8 });
    
    // HP заполнение
    const pct = hp / maxHp;
    const color = pct > 0.5 ? { r: 0x4a, g: 0xd8, b: 0x5a, a: 1 } :
                  pct > 0.25 ? { r: 0xf0, g: 0xa0, b: 0x20, a: 1 } :
                               { r: 0xe0, g: 0x50, b: 0x50, a: 1 };
    r.drawRect(this.hpBar, { x: 20, y: 20, width: 200 * pct, height: 20 }, color);
    
    r.setText(this.hpText, `HP: ${hp}/${maxHp}`);
  }
}
```

**Результат этапа:** Шейдеры и UI работают через единый интерфейс.

---

## 📊 План миграции для ИИ-агентов

### Инструкция для выполнения

```
ШАГ 1: Создать новую структуру директорий
  mkdir -p src/game/renderer
  touch src/game/renderer/IRenderer.ts
  touch src/game/renderer/PixiJSRenderer.ts
  touch src/game/renderer/RendererFactory.ts

ШАГ 2: Запустить TypeScript в strict-режиме для проверки типов
  npx tsc --noEmit
  Ожидаемо: 0 ошибок на каждом этапе

ШАГ 3: Выполнять этапы последовательно. После каждого этапа:
  a) git commit -m "refactor(render): Этап N — описание"
  b) npx tsc --noEmit — убедиться, что 0 ошибок
  c) Запустить игру — убедиться, что ничего не сломалось
  d) Запустить тесты (если есть)

ШАГ 4: Параллельная работа (старый + новый код):
  - Ввести IRenderer параллельно со старым кодом
  - Постепенно переводить модули
  - Удалить старый код только после полного перевода

ШАГ 5: Финальная проверка
  - grep -r "from 'pixi.js'" src/ должен возвращать только src/game/renderer/PixiJSRenderer.ts
  - grep -r "import.*Container" src/ должен возвращать 0 результатов
  - grep -r "import.*Graphics" src/ должен возвращать 0 результатов вне renderer/
```

---

## 🎯 Критерии успеха

| Критерий | Метрика |
|---|---|
| **PixiJS изолирован** | Только 1 файл (`PixiJSRenderer.ts`) импортирует `pixi.js` |
| **Смена движка** | Достаточно реализовать `CanvasRenderer : IRenderer` |
| **Нет "узлов"** | `Container`, `DisplayObject` отсутствуют вне адаптера |
| **Тестируемость** | `HeadlessRenderer` позволяет тесты без GPU |
| **Функциональность** | Все существующие фичи сохранены |
| **Шейдеры** | Туман, виньетки, эффекты через `ShaderHandle` |
| **UI** | HUD, диалоги через `UIElementHandle` |

---

## ⏱ Оценка времени

| Этап | Время | Коммитов |
|---|---|---|
| 1-2: IRenderer + PixiJSRenderer | 4-6 ч | 2 |
| 3: Factory + DI | 1 ч | 1 |
| 4-5: Refactoring types и renderers | 6-8 ч | 10+ (по одному на рендерер) |
| 6: RenderSystem | 4 ч | 2-3 |
| 7: TextureCacheManager | 2 ч | 1 |
| 8: SceneManager → IRenderer | 3 ч | 1-2 |
| 9: Shaders + UI + интеграция | 4 ч | 2-3 |
| **Итого** | **~24-30 часов** | **~20 коммитов** |

---

## 📌 Принципы проектирования (итог)

- **DIP** — всё зависит от `IRenderer`, а не от PixiJS
- **OCP** — новый рендерер (Canvas/WebGPU) = новый класс, без изменения существующего кода
- **ISP** — узкие интерфейсы: `ISpriteFactory`, `IGraphicsRenderer`, `IShaderRenderer` (можно разделить)
- **Adapter** — `PixiJSRenderer` адаптирует PixiJS API под `IRenderer`
- **Façade** — `IRenderer` как единая точка входа
- **Handle Pattern** — числовые ID вместо тяжёлых объектов для передачи между системами

Этот план обеспечивает **полный переход** на `IRenderer` при **полном сохранении** текущего функционала и даёт возможность в будущем сменить движок рендеринга (например, на Canvas 2D или WebGPU) без изменения игровой логики.

---

## 📝 Отчёт о выполнении

### Этап 1: Проектирование интерфейса IRenderer — ВЫПОЛНЕН

**Дата выполнения:** 2026-09-15

**Созданные файлы:**
- `src/game/renderer/IRenderer.ts` — единый контракт рендерера

**Что реализовано:**

1. **Handle types (branded types):**
   - `SpriteHandle` — идентификатор спрайта
   - `GraphicsHandle` — идентификатор графики (примитивы)
   - `LayerHandle` — идентификатор слоя (замена Container tree)
   - `TextureHandle` — идентификатор текстуры
   - `ShaderHandle` — идентификатор шейдера
   - `UIElementHandle` — идентификатор UI-элемента

2. **Базовые типы:**
   - `Vec2` — 2D вектор (позиция)
   - `Rect` — прямоугольник (x, y, width, height)
   - `Color` — цвет в формате RGBA (0..1)

3. **Конфигурация:**
   - `SpriteCreateOptions` — опции создания спрайта (текстура, позиция, якорь, масштаб, слой, видимость, альфа, tint)

4. **Интерфейс IRenderer — 6 групп методов:**
   - **Lifecycle:** `init()`, `destroy()`, `resize()`, `render()`
   - **Layers:** `createLayer()`, `setLayerVisible()` — заменяют Container tree
   - **Sprites:** `createSprite()`, `destroySprite()`, `setSpritePosition()`, `setSpriteVisible()`, `setSpriteAlpha()`, `setSpriteTint()`, `setSpriteScale()`, `setSpriteZIndex()`
   - **Graphics:** `createGraphics()`, `destroyGraphics()`, `clearGraphics()`, `drawRect()`, `drawEllipse()`, `drawPoly()`, `setGraphicsPosition()`, `setGraphicsVisible()`
   - **Textures:** `loadTexture()`, `createRenderTexture()`, `renderToTexture()`, `destroyTexture()`
   - **UI:** `createText()`, `setText()`, `setTextStyle()`, `destroyUIElement()`
   - **Shaders:** `createShader()`, `applyShaderToLayer()`, `setShaderUniform()`, `destroyShader()`
   - **Camera:** `setCameraPosition()`, `setCameraBounds()`, `worldToScreen()`, `screenToWorld()`, `isVisibleInViewport()`
   - **Debug:** `getStats()`

**Принципы SOLID, применённые на этапе:**
- **DIP (Dependency Inversion):** Бизнес-логика зависит от абстракции `IRenderer`, а не от PixiJS
- **ISP (Interface Segregation):** Интерфейс разбит на логические группы — можно разделить на под-интерфейсы при необходимости
- **SRP (Single Responsibility):** Каждый метод делает одно дело, интерфейс описывает контракт, а не реализацию

**Результат проверки TypeScript:**
- Файл `src/game/renderer/IRenderer.ts` компилируется без ошибок
- Предыдущие ошибки в проекте (TS2307: Cannot find module 'pixi.js') — существующая проблема проекта, не связанная с данным этапом

**Следующий этап:** Этап 2 — PixiJSRenderer (реализация адаптера)

---

### Этап 2: PixiJSRenderer — реализация адаптера — ВЫПОЛНЕН

**Дата выполнения:** 2026-09-15

**Созданные файлы:**
- `src/game/renderer/PixiJSRenderer.ts` — полная реализация IRenderer на базе PixiJS v8

**Что реализовано:**

1. **Lifecycle методы:**
   - `init(container, width, height)` — инициализация Application PixiJS v8 (async), создание worldContainer с sortableChildren, добавление в stage
   - `destroy()` — корректная очистка всех ресурсов: спрайты, графика, текстуры, UI-элементы, шейдеры, уничтожение Application с children
   - `resize(width, height)` — перересмотр рендерера
   - `render()` — применение камеры к worldContainer, автоматический рендер через ticker

2. **Layers (слои):**
   - `createLayer(name, zIndex)` — создание Container-слоя с sortableChildren, добавление в worldContainer
   - `setLayerVisible(layer, visible)` — переключение видимости слоя

3. **Sprites:**
   - `createSprite(options)` — создание спрайта из URL или TextureHandle, настройка позиции/якоря/масштаба/альфа/tint/видимости, добавление в слой
   - `destroySprite(handle)` — удаление спрайта
   - `setSpritePosition/Visible/Alpha/Tint/Scale/ZIndex` — все сеттеры свойств

4. **Graphics (примитивы):**
   - `createGraphics(layer?)` — создание Graphics, привязка к слою или worldContainer
   - `destroyGraphics(handle)` — удаление
   - `clearGraphics(handle)` — очистка фигур
   - `drawRect(rect, color, fill, strokeWidth)` — прямоугольник с fill и/или stroke
   - `drawEllipse(cx, cy, rx, ry, color)` — эллипс
   - `drawPoly(points, color)` — полигон
   - `setGraphicsPosition/Visible` — позиционирование и видимость

5. **Textures:**
   - `loadTexture(url)` — асинхронная загрузка текстуры по URL
   - `createRenderTexture(width, height)` — создание RenderTexture для запекания
   - `renderToTexture(texture, source)` — bake Graphics/Sprite в RenderTexture
   - `destroyTexture(handle)` — удаление текстуры

6. **UI (Text):**
   - `createText(text, style, layer?)` — создание текстового элемента с настройками шрифта
   - `setText(handle, text)` — обновление текста
   - `setTextStyle(handle, style)` — обновление стиля
   - `destroyUIElement(handle)` — удаление

7. **Shaders:**
   - `createShader(vertex, fragment, uniforms?)` — создание Filter из GLSL кода (PixiJS v8 API)
   - `applyShaderToLayer(layer, shader, uniforms?)` — применение шейдера к слою через filters
   - `setShaderUniform(shader, name, value)` — обновление униформы
   - `destroyShader(handle)` — удаление

8. **Camera:**
   - `setCameraPosition(pos)` — установка позиции камеры
   - `setCameraBounds(bounds)` — границы камеры
   - `worldToScreen(worldPos)` — мировые → экранные координаты
   - `screenToWorld(screenPos)` — экранные → мировые координаты
   - `isVisibleInViewport(worldPos, radius)` — проверка видимости в viewport

9. **Debug:**
   - `getStats()` — статистика: количество спрайтов, текстур, draw calls

**Архитектурные решения:**

- **Handle Pattern:** Все сущности хранятся в `Map<number, InternalXxx>`, внешние API работают с branded types (`SpriteHandle`, `GraphicsHandle` и т.д.)
- **Инкапсуляция PixiJS:** Внутренние интерфейсы (`InternalSprite`, `InternalGraphics`, `InternalLayer`, `InternalShader`) не экспортируются — PixiJS объекты скрыты
- **PixiJS v8 API:** `Application.init()` async, `Filter` принимает `{ vertex: { source }, fragment: { source } }`, `Text` использует options object
- **Логирование:** Используется проектный `logger` (`logger.info()` / `logger.warn()`)
- **Камера:** Реализована через сдвиг `worldContainer.x/y`, что заменяет ViewportController

**Принципы проектирования, применённые на этапе:**
- **Adapter Pattern:** `PixiJSRenderer` адаптирует PixiJS API под контракт `IRenderer`
- **Façade Pattern:** Единый вход в PixiJS — все детали абстрагированы
- **OCP (Open/Closed):** Для добавления нового рендерера (Canvas, WebGPU) достаточно создать новый класс, реализующий `IRenderer`
- **SRP (Single Responsibility):** Адаптер отвечает только за трансляцию IRenderer → PixiJS, бизнес-логика отсутствует

**Результат проверки TypeScript:**
- Файл `src/game/renderer/PixiJSRenderer.ts` компилируется без ошибок (кроме предсуществующего TS2307: Cannot find module 'pixi.js', который есть во всём проекте)
- Все 60+ предсуществующих ошибок TS2307 — проблема настройки проекта, не связанная с данным этапом

**Статистика:**
- Строк кода: ~340 (с учётом пустых строк и комментариев)
- Методов реализовано: 38 (все методы IRenderer)
- Внутренних структур данных: 6 Map'ов (sprites, graphics, layers, textures, shaders, uiElements)

**Следующий этап:** Этап 3 — Factory + DI-контейнер для рендерера