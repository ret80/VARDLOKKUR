/* PixiJSRenderer.ts — адаптер IRenderer для PixiJS v8 */

import { Application, Container, Sprite, Graphics, RenderTexture, Texture, Text, Filter, UniformGroup, GlProgram } from 'pixi.js';
import type { UNIFORM_TYPES } from 'pixi.js';
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

/**
 * PixiJS v8 требует, чтобы каждая униформа была описана структурой
 * {value, type} с WGSL-именем типа ('f32', 'vec2<f32>', ...).
 * Определяем тип по сырому значению.
 */
function inferUniformType(value: unknown): string {
  if (Array.isArray(value)) {
    switch (value.length) {
      case 2: return 'vec2<f32>';
      case 3: return 'vec3<f32>';
      case 4: return 'vec4<f32>';
    }
  }
  return 'f32';
}

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

interface InternalFullscreenQuad {
  pixiSprite: Sprite;
}

interface InternalLayer {
  container: Container;
  zIndex: number;
  name: string;
}

interface InternalShader {
  filter: Filter;
  /** Единая группа униформ шейдера (Pixi v8 требует {value, type} структуры) */
  group: UniformGroup;
}

// ============================================================
// PixiJSRenderer — реализация IRenderer
// ============================================================

export class PixiJSRenderer implements IRenderer {
  private app!: Application;
  private _nextId = 1;

  private sprites = new Map<number, InternalSprite>();
  private graphics = new Map<number, InternalGraphics>();
  private fullscreenQuads = new Map<number, InternalFullscreenQuad>();
  private layers = new Map<number, InternalLayer>();
  private textures = new Map<number, Texture>();
  private shaders = new Map<number, InternalShader>();
  private uiElements = new Map<number, Text>();

  private cameraPos: Vec2 = { x: 0, y: 0 };
  private cameraBounds: Rect | null = null;
  private worldContainer!: Container;

  // === Lifecycle ===

  async init(container: HTMLElement, width: number, height: number, existingApp?: any): Promise<void> {
    if (existingApp) {
      this.app = existingApp;
      // Canvas уже инициализирован — добавляем в контейнер
      const cv = this.app.canvas as HTMLCanvasElement;
      if (cv.parentElement !== container) {
        container.appendChild(cv);
      }
    } else {
      this.app = new Application();
      // Ограничиваем DPR для снижения нагрузки на GPU (макс. 1.5x)
      // На Retina-дисплеях DPR=2 → 4x нагрузка на GPU, но для изометрии/2D это избыточно
      const maxDPR = 1.0;
      const resolution = Math.min(window.devicePixelRatio ?? 1, maxDPR);
      await this.app.init({
        background: 0x05080d,
        antialias: false,
        resolution,
        width,
        height,
      });
      container.appendChild(this.app.canvas);
    }

    // Корневой контейнер мира (сдвигается камерой)
    this.worldContainer = new Container();
    // sortableChildren = false: Z-order управляется через RenderQueue (setGraphicsZIndex),
    // PixiJS не нужно пересортировывать children каждый кадр — это O(n log n) впустую.
    this.worldContainer.sortableChildren = false;
    this.app.stage.addChild(this.worldContainer);

    // Восстановление WebGL контекста после потери (GPU crash, tab switch, etc.)
    this.app.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      logger.error('renderer', 'WebGL context lost — attempting restore...');
    });
    this.app.canvas.addEventListener('webglcontextrestored', () => {
      logger.info('renderer', 'WebGL context restored');
      // Перезагружаем текстуры — PixiJS Texture.from() кэширует,
      // нужно пересоздать все текстуры
      for (const [id, tex] of this.textures) {
        if (tex.source && (tex.source as any).canvas) {
          this.textures.set(id, Texture.from((tex.source as any).canvas));
        }
      }
    });

    logger.info('renderer', `PixiJSRenderer initialized: ${width}x${height}`);
  }

  destroy(): void {
    // 1. Уничтожить fullscreen quads (screen-space эффекты: fog)
    this.fullscreenQuads.forEach((q) => q.pixiSprite.destroy());
    this.fullscreenQuads.clear();

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
    // Рендерим stage — включает worldContainer + legacy Containers (tileLayer, dynamic, etc.)
    this.app.render();
  }

  // === Layers ===

  createLayer(name: string, zIndex: number): LayerHandle {
    const id = this._nextId++;
    const container = new Container();
    // Z-order управляется через RenderQueue, PixiJS не нужно пересортировывать
    container.sortableChildren = false;
    container.zIndex = zIndex;
    this.worldContainer.addChild(container);
    this.layers.set(id, { container, zIndex, name });
    return id as LayerHandle;
  }

  setLayerVisible(layer: LayerHandle, visible: boolean): void {
    const l = this.layers.get(layer as number);
    if (l) l.container.visible = visible;
  }

  getLayerContainer(layer: LayerHandle): any {
    const l = this.layers.get(layer as number);
    return l?.container ?? null;
  }

  getWorldContainer(): any {
    return this.worldContainer;
  }

  applyFilterToContainer(container: any, shader: ShaderHandle): void {
    const s = this.shaders.get(shader as number);
    if (!s) return;
    container.filters = [s.filter];
    console.log('[fog:filter] applied to container:', container.constructor.name, 'filters:', container.filters?.length ?? 0);
  }

  /** Создать fullscreen quad для screen-space эффектов (filter) */
  createFullscreenQuad(): GraphicsHandle {
    const id = this._nextId++;
    // Используем Sprite с 1x1 текстурой — UV всегда 0..1, что ожидает фильтр
    const sprite = new Sprite(Texture.WHITE);
    sprite.x = 0;
    sprite.y = 0;
    // Используем физические размеры canvas для предотвращения растяжения low-res текстуры фильтра
    sprite.width = this.app.canvas.width;
    sprite.height = this.app.canvas.height;
    sprite.anchor.set(0, 0);
    this.app.stage.addChild(sprite);
    this.fullscreenQuads.set(id, { pixiSprite: sprite });
    return id as GraphicsHandle;
  }

  /** Применить filter к fullscreen quad */
  applyFilterToQuad(handle: GraphicsHandle, shader: ShaderHandle): void {
    const q = this.fullscreenQuads.get(handle as number);
    const s = this.shaders.get(shader as number);
    if (!q || !s) return;
    q.pixiSprite.filters = [s.filter];
    console.log('[fog:filter] applied to quad, filters:', q.pixiSprite.filters?.length ?? 0);
  }

  setGraphicsVisible(handle: GraphicsHandle, visible: boolean): void {
    // Сначала проверяем fullscreen quads
    const q = this.fullscreenQuads.get(handle as number);
    if (q) { q.pixiSprite.visible = visible; return; }
    const g = this.graphics.get(handle as number);
    if (g) g.pixiGraphics.visible = visible;
  }

  getScreenSize(): { w: number; h: number } {
    return { w: this.app.screen.width, h: this.app.screen.height };
  }

  setScreenSize(w: number, h: number): void {
    // Физические размеры экрана уже установлены через app.screen
    // Этот метод нужен только для совместимости с IRenderer
  }

  getGraphicsPixi(handle: GraphicsHandle): any {
    const g = this.graphics.get(handle as number);
    return g?.pixiGraphics ?? null;
  }

  resetNextId(): void {
    // Только сбросить счётчик — Graphics удаляются через destroyGraphics в teardownWorld
    this._nextId = 1;
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

    // Определяем родительский контейнер
    const parentContainer = options._container ?? (
      options.layer ? this.layers.get(options.layer as number)?.container : null
    ) ?? this.worldContainer;

    parentContainer.addChild(sprite);

    // Определяем handle слоя для хранения во внутреннем объекте
    const layerId: LayerHandle = options.layer
      ? (options.layer as LayerHandle)
      : ((this.layers.size > 0 ? this.layers.keys().next().value : 1) as LayerHandle);

    this.sprites.set(id, { pixiSprite: sprite, layer: layerId });
    return id as SpriteHandle;
  }

  createSpriteInContainer(texture: TextureHandle | string, x: number, y: number, container: any): any {
    let tex: Texture;
    if (typeof texture === 'string') {
      tex = Texture.from(texture);
    } else {
      tex = this.textures.get(texture as number) || Texture.EMPTY;
    }
    const sprite = new Sprite(tex);
    sprite.x = x;
    sprite.y = y;
    container.addChild(sprite);
    return sprite;
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

  getSpritePixi(handle: SpriteHandle): any {
    const s = this.sprites.get(handle as number);
    return s?.pixiSprite ?? null;
  }

  // === Screen-space ===

  createScreenSprite(options: Omit<SpriteCreateOptions, 'layer'>): SpriteHandle {
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

    // Добавляем напрямую в stage (не в worldContainer) — screen-space элемент
    this.app.stage.addChild(sprite);

    this.sprites.set(id, { pixiSprite: sprite, layer: -1 as LayerHandle });
    return id as SpriteHandle;
  }

  // === Graphics ===

  createGraphics(layer?: LayerHandle): GraphicsHandle {
    const id = this._nextId++;
    const g = new Graphics();
    if (layer) {
      const l = this.layers.get(layer as number);
      if (l) {
        l.container.addChild(g);
      } else {
        this.worldContainer.addChild(g);
      }
    } else {
      this.worldContainer.addChild(g);
    }
    this.graphics.set(id, { pixiGraphics: g, layer });
    return id as GraphicsHandle;
  }

  destroyGraphics(handle: GraphicsHandle): void {
    // Сначала проверяем fullscreen quads
    const q = this.fullscreenQuads.get(handle as number);
    if (q) {
      q.pixiSprite.destroy();
      this.fullscreenQuads.delete(handle as number);
      return;
    }
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
    const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
    const ctx = g.pixiGraphics.context;
    if (fill) {
      ctx.setFillStyle({ color: c, alpha: color.a });
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.fill();
    }
    if (strokeWidth > 0) {
      ctx.setStrokeStyle({ width: strokeWidth, color: c, alpha: color.a });
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.stroke();
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
    const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
    const ctx = g.pixiGraphics.context;
    ctx.setFillStyle({ color: c, alpha: color.a });
    ctx.ellipse(cx, cy, rx, ry);
    ctx.fill();
  }

  drawPoly(handle: GraphicsHandle, points: number[], color: Color): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
    const ctx = g.pixiGraphics.context;
    ctx.setFillStyle({ color: c, alpha: color.a });
    ctx.poly(points);
    ctx.fill();
  }

  drawLine(handle: GraphicsHandle, x1: number, y1: number, x2: number, y2: number, color: Color, width = 1): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = ((Math.round(color.r * 255) & 0xff) << 16) | ((Math.round(color.g * 255) & 0xff) << 8) | (Math.round(color.b * 255) & 0xff);
    const ctx = g.pixiGraphics.context;
    ctx.setStrokeStyle({ width, color: c, alpha: color.a });
    ctx.moveTo(x1, y1).lineTo(x2, y2);
    ctx.stroke();
  }

  setGraphicsPosition(handle: GraphicsHandle, pos: Vec2): void {
    const g = this.graphics.get(handle as number);
    if (g) {
      g.pixiGraphics.x = pos.x;
      g.pixiGraphics.y = pos.y;
    }
  }

  setGraphicsAlpha(handle: GraphicsHandle, alpha: number): void {
    const g = this.graphics.get(handle as number);
    if (g) g.pixiGraphics.alpha = alpha;
  }

  setGraphicsZIndex(handle: GraphicsHandle, zIndex: number): void {
    const g = this.graphics.get(handle as number);
    if (g) g.pixiGraphics.zIndex = zIndex;
  }

  // === Textures ===
  //
  // Примечание: Texture.from(url/canvas) кэшируется внутренним AssetManager
  // PixiJS v8. Текстуры, созданные через loadTexture / createTextureFromCanvas,
  // отслеживаются в this.textures и уничтожаются в destroy().
  // Текстуры, созданные неявно через createSprite(options: {texture: string}),
  // кэшируются PixiJS и освобождаются при app.destroy({ texture: true }).

  async loadTexture(url: string): Promise<TextureHandle> {
    const id = this._nextId++;
    const tex = await Texture.from(url);
    this.textures.set(id, tex);
    return id as TextureHandle;
  }

  createTextureFromCanvas(canvas: HTMLCanvasElement): TextureHandle {
    const id = this._nextId++;
    const tex = Texture.from(canvas);
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
    if (!tex) {
      logger.warn('renderer', `renderToTexture: texture not found handle=${texture}`);
      return;
    }

    const g = this.graphics.get(source as number);
    const s = this.sprites.get(source as number);
    const src = g?.pixiGraphics || s?.pixiSprite;
    if (!src) {
      logger.warn('renderer', `renderToTexture: source not found handle=${source}`);
      return;
    }

    // src уже в worldContainer (создан через createGraphics без layer)
    // Рендерим напрямую — addChild/removeChild не нужны
    this.app.renderer.render({ container: src, target: tex as RenderTexture, clear: true });
  }

  destroyTexture(handle: TextureHandle): void {
    const t = this.textures.get(handle as number);
    if (t) {
      t.destroy(true);
      this.textures.delete(handle as number);
    }
  }

  renderCanvasToTexture(canvas: HTMLCanvasElement, target: TextureHandle): void {
    const tex = this.textures.get(target as number);
    if (!tex) return;
    // Create a temporary sprite from canvas and render it to target RenderTexture
    const tmpSprite = new Sprite(Texture.from(canvas));
    this.app.renderer.render({ container: tmpSprite, target: tex as RenderTexture, clear: true });
    tmpSprite.destroy();
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
    // PixiJS v8: resources — это { имяГруппы: UniformGroup }, а униформа внутри
    // группы описывается структурой {value, type}. Сырые числа/массивы приводят
    // к краху ("Cannot create property 'name' on number"), поэтому оборачиваем.
    const structures: Record<string, { value: unknown; type: UNIFORM_TYPES }> = {};
    for (const [k, v] of Object.entries(uniforms ?? {})) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && 'value' in (v as object)) {
        structures[k] = v as { value: unknown; type: UNIFORM_TYPES };
      } else {
        structures[k] = { value: v, type: inferUniformType(v) as UNIFORM_TYPES };
      }
    }
    const group = new UniformGroup(structures);
    // PixiJS v8: Filter создаётся через GlProgram, НЕ через vertexShader/fragmentShader
    const filter = new Filter({
      glProgram: new GlProgram({ fragment, vertex }),
      resources: { shaderUniforms: group },
    });
    this.shaders.set(id, { filter, group });
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
        (s.group.uniforms as Record<string, unknown>)[k] = v;
      }
    }
    l.container.filters = [s.filter];
  }

  setShaderUniform(shader: ShaderHandle, name: string, value: unknown): void {
    const s = this.shaders.get(shader as number);
    if (s) (s.group.uniforms as Record<string, unknown>)[name] = value;
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
