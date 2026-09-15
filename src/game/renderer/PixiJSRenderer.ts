/* PixiJSRenderer.ts — адаптер IRenderer для PixiJS v8 */

import { Application, Container, Sprite, Graphics, RenderTexture, Texture, Text, Filter } from 'pixi.js';
import type {
  IRenderer,
  SpriteHandle,
  GraphicsHandle,
  LayerHandle,
  TextureHandle,
  ShaderHandle,
  UIElementHandle,
  SpriteCreateOptions,
  Vec2,
  Rect,
  Color,
} from './IRenderer';
import { logger } from '../debug/logger';

// ============================================================
// Внутренние данные — НЕ экспортируются наружу
// ============================================================

interface InternalSprite {
  pixiSprite: Sprite;
  layer: LayerHandle;
}

interface InternalGraphics {
  pixiGraphics: Graphics;
  layer: LayerHandle | undefined;
}

interface InternalLayer {
  container: Container;
  zIndex: number;
  name: string;
}

interface InternalShader {
  filter: Filter;
  uniforms: Record<string, unknown>;
}

// ============================================================
// PixiJSRenderer — реализация IRenderer
// ============================================================

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

  // === Lifecycle ===

  async init(container: HTMLElement, width: number, height: number): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: 0x05080d,
      antialias: false,
      resolution: 1,
      width,
      height,
    });
    container.appendChild(this.app.canvas);

    // Корневой контейнер мира (сдвигается камерой)
    this.worldContainer = new Container();
    this.worldContainer.sortableChildren = true;
    this.app.stage.addChild(this.worldContainer);

    logger.info('renderer', `PixiJSRenderer initialized: ${width}x${height}`);
  }

  destroy(): void {
    this.sprites.forEach((s) => s.pixiSprite.destroy());
    this.graphics.forEach((g) => g.pixiGraphics.destroy());
    this.textures.forEach((t) => t.destroy(true));
    this.uiElements.forEach((t) => t.destroy());
    this.shaders.forEach((s) => s.filter.destroy());
    this.app.destroy(true, { children: true, texture: true });

    this.sprites.clear();
    this.graphics.clear();
    this.layers.clear();
    this.textures.clear();
    this.shaders.clear();
    this.uiElements.clear();

    logger.info('renderer', 'PixiJSRenderer destroyed');
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  render(): void {
    // Применяем камеру к worldContainer
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
    const l = this.layers.get(layer as number);
    if (l) l.container.visible = visible;
  }

  // === Sprites ===

  createSprite(options: SpriteCreateOptions): SpriteHandle {
    const id = this._nextId++;
    let tex: Texture;
    if (typeof options.texture === 'string') {
      tex = Texture.from(options.texture);
    } else {
      tex = this.textures.get(options.texture as number) || Texture.EMPTY;
    }

    const sprite = new Sprite(tex);
    sprite.x = options.x ?? 0;
    sprite.y = options.y ?? 0;
    if (options.anchor) sprite.anchor.set(options.anchor.x, options.anchor.y);
    if (options.scale) sprite.scale.set(options.scale.x, options.scale.y);
    if (options.alpha !== undefined) sprite.alpha = options.alpha;
    if (options.tint !== undefined) sprite.tint = options.tint;
    sprite.visible = options.visible ?? true;

    const layer = options.layer ? this.layers.get(options.layer as number) : null;
    if (layer) {
      layer.container.addChild(sprite);
    } else {
      this.worldContainer.addChild(sprite);
    }

    // Определяем handle слоя для хранения во внутреннем объекте
    const layerId: LayerHandle = options.layer
      ? (options.layer as LayerHandle)
      : ((this.layers.size > 0 ? this.layers.keys().next().value : 1) as LayerHandle);

    this.sprites.set(id, { pixiSprite: sprite, layer: layerId });
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
    if (s) {
      s.pixiSprite.x = pos.x;
      s.pixiSprite.y = pos.y;
    }
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
      const l = this.layers.get(layer as number);
      if (l) l.container.addChild(g);
    } else {
      this.worldContainer.addChild(g);
    }
    this.graphics.set(id, { pixiGraphics: g, layer });
    return id as GraphicsHandle;
  }

  destroyGraphics(handle: GraphicsHandle): void {
    const g = this.graphics.get(handle as number);
    if (g) {
      g.pixiGraphics.destroy();
      this.graphics.delete(handle as number);
    }
  }

  clearGraphics(handle: GraphicsHandle): void {
    const g = this.graphics.get(handle as number);
    if (g) g.pixiGraphics.clear();
  }

  drawRect(
    handle: GraphicsHandle,
    rect: Rect,
    color: Color,
    fill = true,
    strokeWidth = 0
  ): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = (color.r << 16) | (color.g << 8) | color.b;
    if (fill) {
      g.pixiGraphics.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: c, alpha: color.a });
    }
    if (strokeWidth > 0) {
      g.pixiGraphics.rect(rect.x, rect.y, rect.width, rect.height).stroke({
        color: c,
        alpha: color.a,
        width: strokeWidth,
      });
    }
  }

  drawEllipse(
    handle: GraphicsHandle,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: Color
  ): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = (color.r << 16) | (color.g << 8) | color.b;
    g.pixiGraphics.ellipse(cx, cy, rx, ry).fill({ color: c, alpha: color.a });
  }

  drawPoly(handle: GraphicsHandle, points: number[], color: Color): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = (color.r << 16) | (color.g << 8) | color.b;
    g.pixiGraphics.poly(points).fill({ color: c, alpha: color.a });
  }

  setGraphicsPosition(handle: GraphicsHandle, pos: Vec2): void {
    const g = this.graphics.get(handle as number);
    if (g) {
      g.pixiGraphics.x = pos.x;
      g.pixiGraphics.y = pos.y;
    }
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

  renderToTexture(
    texture: TextureHandle,
    source: GraphicsHandle | SpriteHandle
  ): void {
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
    if (t) {
      t.destroy(true);
      this.textures.delete(handle as number);
    }
  }

  // === UI (Text) ===

  createText(
    text: string,
    style: { fontSize?: number; color?: number; fontFamily?: string },
    layer?: LayerHandle
  ): UIElementHandle {
    const id = this._nextId++;
    const t = new Text({
      text,
      style: {
        fontSize: style.fontSize ?? 12,
        fill: style.color ?? 0xffffff,
        fontFamily: style.fontFamily ?? 'monospace',
      },
    });
    if (layer) {
      const l = this.layers.get(layer as number);
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
    if (t) {
      t.destroy();
      this.uiElements.delete(handle as number);
    }
  }

  setUIPosition(handle: UIElementHandle, pos: Vec2): void {
    const t = this.uiElements.get(handle as number);
    if (t) {
      t.x = pos.x;
      t.y = pos.y;
    }
  }

  setUIAlpha(handle: UIElementHandle, alpha: number): void {
    const t = this.uiElements.get(handle as number);
    if (t) t.alpha = alpha;
  }

  setUIVisible(handle: UIElementHandle, visible: boolean): void {
    const t = this.uiElements.get(handle as number);
    if (t) t.visible = visible;
  }

  // === Shaders ===

  createShader(
    vertex: string,
    fragment: string,
    uniforms?: Record<string, unknown>
  ): ShaderHandle {
    const id = this._nextId++;
    // PixiJS v8: Filter.from() принимает { gl: { vertex, fragment }, resources }
    const resources = uniforms ?? {};
    const filter = Filter.from({
      gl: { vertex, fragment },
      resources,
    });
    this.shaders.set(id, { filter, uniforms: resources });
    return id as ShaderHandle;
  }

  applyShaderToLayer(
    layer: LayerHandle,
    shader: ShaderHandle,
    uniforms?: Record<string, unknown>
  ): void {
    const l = this.layers.get(layer as number);
    const s = this.shaders.get(shader as number);
    if (!l || !s) return;

    if (uniforms) {
      for (const [k, v] of Object.entries(uniforms)) {
        (s.filter.resources as Record<string, unknown>)[k] = v;
      }
    }
    l.container.filters = [s.filter];
  }

  setShaderUniform(shader: ShaderHandle, name: string, value: unknown): void {
    const s = this.shaders.get(shader as number);
    if (s) (s.filter.resources as Record<string, unknown>)[name] = value;
  }

  destroyShader(handle: ShaderHandle): void {
    const s = this.shaders.get(handle as number);
    if (s) {
      s.filter.destroy();
      this.shaders.delete(handle as number);
    }
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
      y: worldPos.y - this.cameraPos.y,
    };
  }

  screenToWorld(screenPos: Vec2): Vec2 {
    return {
      x: screenPos.x + this.cameraPos.x,
      y: screenPos.y + this.cameraPos.y,
    };
  }

  isVisibleInViewport(worldPos: Vec2, radius: number): boolean {
    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    const sx = worldPos.x - this.cameraPos.x;
    const sy = worldPos.y - this.cameraPos.y;
    return (
      sx + radius > 0 &&
      sx - radius < vw &&
      sy + radius > 0 &&
      sy - radius < vh
    );
  }

  // === Debug ===

  getStats(): { sprites: number; textures: number; drawCalls: number } {
    const renderer = this.app.renderer as any;
    const drawCalls =
      renderer?.renderPipelines?.length > 0
        ? (renderer.globalUniforms?.worldMatrix as any)?.drawCalls ?? 0
        : 0;
    return {
      sprites: this.sprites.size,
      textures: this.textures.size,
      drawCalls,
    };
  }
}
