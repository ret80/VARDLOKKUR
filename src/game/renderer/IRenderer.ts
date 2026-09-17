/* IRenderer.ts — единый абстрактный интерфейс рендерера (SOLID: DIP, ISP) */

/**
 * Абстрактный "handle" — лёгкий идентификатор ресурса.
 * Вместо PixiJS Sprite/Container/Texture мы работаем с ID.
 * Брендинг через branded type обеспечивает type-level safety.
 */
export type SpriteHandle = number & { __brand: 'sprite' };
export type GraphicsHandle = number & { __brand: 'graphics' };
export type LayerHandle = number & { __brand: 'layer' };
export type TextureHandle = number & { __brand: 'texture' };
export type ShaderHandle = number & { __brand: 'shader' };
export type UIElementHandle = number & { __brand: 'ui' };

// ============================================================
// Базовые типы
// ============================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ============================================================
// Опции создания спрайта
// ============================================================

export interface SpriteCreateOptions {
  /** URL текстуры или handle загруженной текстуры */
  texture: TextureHandle | string;
  x?: number;
  y?: number;
  anchor?: Vec2;
  scale?: Vec2;
  layer?: LayerHandle;
  visible?: boolean;
  alpha?: number;
  tint?: number;
  /** Внутренний параметр: прямой Container для legacy Y-sorting */
  _container?: any;
}

// ============================================================
// Основной интерфейс IRenderer
// ============================================================

export interface IRenderer {
  // === Lifecycle ===
  /** Инициализация рендерера. container — DOM-элемент для canvas. */
  init(container: HTMLElement, width: number, height: number): Promise<void>;
  /** Очистка ресурсов */
  destroy(): void;
  /** Изменение размера canvas */
  resize(width: number, height: number): void;
  /** Финальная отрисовка кадра */
  render(): void;

  // === Layers (замещают Container tree) ===
  /** Создать слой с именем и z-index. Возвращает handle слоя. */
  createLayer(name: string, zIndex: number): LayerHandle;
  /** Включить/выключить видимость слоя */
  setLayerVisible(layer: LayerHandle, visible: boolean): void;
  /** Получить внутренний Container слоя (для прямой манипуляции, например Y-sorting) */
  getLayerContainer(layer: LayerHandle): any;

  // === Sprites ===
  /** Создать спрайт с опциями. Возвращает handle спрайта. */
  createSprite(options: SpriteCreateOptions): SpriteHandle;
  /** Создать спрайт и добавить в указанный Container (для legacy Y-sorting) */
  createSpriteInContainer(texture: TextureHandle | string, x: number, y: number, container: any): any;
  /** Удалить спрайт */
  destroySprite(handle: SpriteHandle): void;
  /** Установить позицию спрайта */
  setSpritePosition(handle: SpriteHandle, pos: Vec2): void;
  /** Включить/выключить видимость спрайта */
  setSpriteVisible(handle: SpriteHandle, visible: boolean): void;
  /** Установить прозрачность спрайта (0..1) */
  setSpriteAlpha(handle: SpriteHandle, alpha: number): void;
  /** Установить цвет подсветки спрайта */
  setSpriteTint(handle: SpriteHandle, tint: number): void;
  /** Установить масштаб спрайта */
  setSpriteScale(handle: SpriteHandle, scale: Vec2): void;
  /** Установить z-index спрайта (для сортировки по глубине) */
  setSpriteZIndex(handle: SpriteHandle, zIndex: number): void;
  /** Получить внутренний PixiJS Sprite (только для прямой работы с legacy Container) */
  getSpritePixi(handle: SpriteHandle): any;

  // === Screen-space (элементы поверх мира, не двигающиеся с камерой) ===
  /** Создать спрайт в screen-space (добавляется поверх worldContainer, не сдвигается камерой) */
  createScreenSprite(options: Omit<SpriteCreateOptions, 'layer'>): SpriteHandle;

  // === Graphics (примитивы: rect, ellipse, line, poly) ===
  /** Создать пустой Graphics. Опционально привязать к слою. */
  createGraphics(layer?: LayerHandle): GraphicsHandle;
  /**
   * Создать unparented Graphics-объект для прямой работы с legacy Container
   * (ECS-сущности добавляются в dynamicContainer вручную). Возвращает реальный
   * графический объект, который вызывающий код сам размещает и уничтожает.
   */
  createDetachedGraphics(): any;
  /** Удалить Graphics */
  destroyGraphics(handle: GraphicsHandle): void;
  /** Очистить все фигуры из Graphics */
  clearGraphics(handle: GraphicsHandle): void;
  /** Нарисовать прямоугольник */
  drawRect(handle: GraphicsHandle, rect: Rect, color: Color, fill?: boolean, strokeWidth?: number): void;
  /** Нарисовать эллипс */
  drawEllipse(handle: GraphicsHandle, cx: number, cy: number, rx: number, ry: number, color: Color): void;
  /** Нарисовать полигон (точки: [x1,y1, x2,y2, ...]) */
  drawPoly(handle: GraphicsHandle, points: number[], color: Color): void;
  /** Нарисовать линию */
  drawLine(handle: GraphicsHandle, x1: number, y1: number, x2: number, y2: number, color: Color, width?: number): void;
  /** Установить позицию Graphics */
  setGraphicsPosition(handle: GraphicsHandle, pos: Vec2): void;
  /** Включить/выключить видимость Graphics */
  setGraphicsVisible(handle: GraphicsHandle, visible: boolean): void;

  // === Textures (для запекания и кэширования) ===
  /** Загрузить текстуру по URL. Возвращает handle. */
  loadTexture(url: string): Promise<TextureHandle>;
  /** Создать текстуру из HTMLCanvasElement. Возвращает handle. */
  createTextureFromCanvas(canvas: HTMLCanvasElement): TextureHandle;
  /** Создать пустую RenderTexture заданного размера */
  createRenderTexture(width: number, height: number): TextureHandle;
  /** Запечь Graphics или Sprite в RenderTexture */
  renderToTexture(texture: TextureHandle, source: GraphicsHandle | SpriteHandle): void;
  /** Удалить текстуру */
  destroyTexture(handle: TextureHandle): void;
  /** Отрендерить HTMLCanvasElement в RenderTexture (для тумана/шейдеров) */
  renderCanvasToTexture(canvas: HTMLCanvasElement, target: TextureHandle): void;

  // === UI (текст и элементы интерфейса) ===
  /** Создать текстовый UI-элемент. Возвращает handle. */
  createText(
    text: string,
    style: { fontSize?: number; color?: number; fontFamily?: string },
    layer?: LayerHandle
  ): UIElementHandle;
  /** Обновить текст */
  setText(handle: UIElementHandle, text: string): void;
  /** Обновить стиль текста */
  setTextStyle(handle: UIElementHandle, style: { fontSize?: number; color?: number }): void;
  /** Удалить UI-элемент */
  destroyUIElement(handle: UIElementHandle): void;
  /** Установить позицию UI-элемента */
  setUIPosition(handle: UIElementHandle, pos: Vec2): void;
  /** Установить прозрачность UI-элемента (0..1) */
  setUIAlpha(handle: UIElementHandle, alpha: number): void;
  /** Включить/выключить видимость UI-элемента */
  setUIVisible(handle: UIElementHandle, visible: boolean): void;

  // === Shaders ===
  /** Создать шейдер из vertex/fragment кода. Возвращает handle. */
  createShader(vertex: string, fragment: string, uniforms?: Record<string, any>): ShaderHandle;
  /** Применить шейдер к слою */
  applyShaderToLayer(layer: LayerHandle, shader: ShaderHandle, uniforms?: Record<string, any>): void;
  /** Обновить униформу шейдера */
  setShaderUniform(shader: ShaderHandle, name: string, value: any): void;
  /** Удалить шейдер */
  destroyShader(handle: ShaderHandle): void;

  // === Camera (замещает ViewportController) ===
  /** Установить позицию камеры */
  setCameraPosition(pos: Vec2): void;
  /** Установить границы камеры (null = без ограничений) */
  setCameraBounds(bounds: Rect | null): void;
  /** Преобразовать мировые координаты в экранные */
  worldToScreen(worldPos: Vec2): Vec2;
  /** Преобразовать экранные координаты в мировые */
  screenToWorld(screenPos: Vec2): Vec2;
  /** Проверить, виден ли объект в текущем viewport */
  isVisibleInViewport(worldPos: Vec2, radius: number): boolean;

  // === Debug ===
  /** Статистика рендеринга */
  getStats(): { sprites: number; textures: number; drawCalls: number };
}
