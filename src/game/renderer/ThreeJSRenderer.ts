/* ThreeJSRenderer.ts — 3D-рендерер (three.js), реализующий IRenderer.
 *
 * Идея миграции: весь существующий арт рисуется процедурно примитивами
 * (drawRect/drawEllipse/drawPoly/drawLine) в локальных координатах Graphics.
 * Здесь эти примитивы собираются в Canvas2D-дисплей-лист, запекаются в
 * CanvasTexture и показываются в 3D как Y-билборды (вертикальная плоскость,
 * повёрнутая к камере вокруг оси Y; см. класс YBillboard). Поэтому 27 реестров
 * рендереров (игрок, враги, боссы, NPC, дропы, снаряды, деревья, дома)
 * работают без единой правки — меняется только «холст».
 *
 * Мир: 16 px = 1 юнит three.js, игровые (x, y) → (x, ·, y/16), Y — вверх.
 * Рельеф строится из тайлов/высот/стен (world3d/terrain-mesh.ts) и получает
 * текстуру запечённой карты земли.
 */

import * as THREE from 'three';
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
import {
  buildTerrainMesh,
  PX_PER_UNIT,
  type TerrainMap,
  type TerrainMesh,
} from '../world3d/terrain-mesh';
import {
  buildFence3D,
  buildHouses3D,
  collectHouses,
  makeFenceTexture,
} from '../world3d/village-mesh';
import type { WorldData } from '../world';

// ============================================================
// Константы камеры
// ============================================================

/**
 * Наклон камеры (градусы от горизонта).
 *
 * Билборды — плоские вертикальные карточки, поэтому их высота на экране
 * сжимается на cos(наклона): при 58° персонажи «ложились» и читались
 * плоскими. 46° близко к референсу: фигуры стоят, а вертикальные грани
 * уступов и подступенки видны достаточно, чтобы читаться камнем.
 */
const CAM_PITCH_DEG = 46;
/** Дистанция камеры до цели (мировые единицы). */
const CAM_DISTANCE = 24;
/** Высота точки взгляда над землёй. */
const CAM_LOOK_Y = 0.9;
/** Вертикальный FOV. */
const CAM_FOV = 38;

const CAM_BACK = CAM_DISTANCE * Math.cos((CAM_PITCH_DEG * Math.PI) / 180);
const CAM_HEIGHT = CAM_DISTANCE * Math.sin((CAM_PITCH_DEG * Math.PI) / 180);

// ============================================================
// Внутренние типы
// ============================================================

type Command =
  | { t: 'rect'; x: number; y: number; w: number; h: number; color: number; alpha: number; stroke: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color: number; alpha: number }
  | { t: 'poly'; pts: number[]; color: number; alpha: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: number; alpha: number; width: number };

interface InternalGraphics {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cmds: Command[];
  dirty: boolean;
  /** Padding канваса (для земли — 0, чтобы UV совпадали). */
  pad: number;
  /** Позиция задана снаружи (RenderQueue/движок) — можно ставить на землю. */
  posSet: boolean;
  /** Подъём над землёй в мировых единицах (подсказки, маркеры). */
  elevation: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  hasContent: boolean;
  sprite: YBillboard | null;
  texture: THREE.CanvasTexture | null;
  pos: Vec2;
  visible: boolean;
  alpha: number;
  zIndex: number;
  layer: LayerHandle | undefined;
  /** Батч карты, отрисованный отдельным мешем (земля/стены подземелья). */
  skip3D: boolean;
  /** Границы последней отрисовки на канвасе (пиксели команд). */
  bounds: { minX: number; minY: number; width: number; height: number };
}

interface InternalSprite {
  /** Мировые спрайты — Y-билборды, экранные (overlay) — обычный THREE.Sprite. */
  sprite: YBillboard | THREE.Sprite;
  layer: LayerHandle | -1;
  /** Screen-space спрайт: живёт в overlayScene и масштабируется по экрану. */
  screen: boolean;
}

interface InternalLayer {
  group: THREE.Group;
  zIndex: number;
  name: string;
}

interface InternalText {
  sprite: YBillboard;
  canvas: HTMLCanvasElement;
  text: string;
  fontSize: number;
  color: number;
  width: number;
  height: number;
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
}

interface InternalTexture {
  texture: THREE.Texture;
  canvas?: HTMLCanvasElement;
}

interface FogShaderState {
  id: ShaderHandle;
  uniforms: Record<string, unknown>;
}

// ============================================================
// Рендерер
// ============================================================

export class ThreeJSRenderer implements IRenderer {
  private container!: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private overlayScene = new THREE.Scene();
  private overlayCamera!: THREE.OrthographicCamera;
  private nextId = 1;

  private layers = new Map<number, InternalLayer>();
  private graphics = new Map<number, InternalGraphics>();
  private sprites = new Map<number, InternalSprite>();
  /** Все Y-билборды сцены: им каждый кадр обновляется поворот к камере. */
  private billboards = new Set<YBillboard>();
  private textures = new Map<number, InternalTexture>();
  private texts = new Map<number, InternalText>();
  private fullscreenQuads = new Map<number, { visible: boolean }>();

  private cameraPos: Vec2 = { x: 0, y: 0 };
  private viewW = 480;
  private viewH = 270;
  private screenW = 1;
  private screenH = 1;

  private terrain: TerrainMesh | null = null;
  private terrainGroup: THREE.Group | null = null;
  /** 3D-геометрия деревни: дома и частокол (заменяет 2D-билборды). */
  private villageGroup: THREE.Group | null = null;

  private fogShader: FogShaderState | null = null;
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogTexture: THREE.CanvasTexture | null = null;
  private fogMesh: THREE.Mesh | null = null;
  private fogVisible = false;
  private fogDirty = true;

  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  // ============================================================
  // Lifecycle
  // ============================================================

  async init(container: HTMLElement, width: number, height: number): Promise<void> {
    this.container = container;
    this.viewW = width;
    this.viewH = height;

    this.scene.background = new THREE.Color(0x05080d);
    // Туман — только дальний план: камера стоит в CAM_DISTANCE от цели,
    // поэтому прежние 26..46 гасили всё уже за 2–3 тайла от игрока
    // (в подземелье пол и стены становились чёрными).
    this.scene.fog = new THREE.Fog(0x05080d, CAM_DISTANCE * 1.5, CAM_DISTANCE * 3.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setClearColor(0x05080d, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(dpr);

    const cv = this.renderer.domElement;
    cv.classList.add('pixi', 'three');
    cv.style.position = 'absolute';
    cv.style.inset = '0';
    cv.style.width = '100%';
    cv.style.height = '100%';
    cv.style.display = 'block';
    container.appendChild(cv);

    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      logger.error('renderer', '3D: WebGL context lost');
    });
    cv.addEventListener('webglcontextrestored', () => {
      logger.info('renderer', '3D: WebGL context restored');
    });

    this.camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.5, 200);
    this.overlayCamera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);

    this.resizeToContainer();
    this.updateCamera();
    this.buildFogOverlay();

    this.resizeObserver = new ResizeObserver(() => this.resizeToContainer());
    this.resizeObserver.observe(container);

    logger.info('renderer', `ThreeJSRenderer initialized: ${width}x${height}`);
  }

  destroy(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.clearTerrain();

    for (const g of this.graphics.values()) this.disposeGraphics(g);
    this.graphics.clear();
    for (const s of this.sprites.values()) {
      s.sprite.parent?.remove(s.sprite);
      s.sprite.material.dispose();
    }
    this.sprites.clear();
    this.billboards.clear();
    for (const t of this.textures.values()) t.texture.dispose();
    this.textures.clear();
    for (const t of this.texts.values()) this.disposeText(t);
    this.texts.clear();
    this.fullscreenQuads.clear();
    this.fogTexture?.dispose();
    this.fogTexture = null;
    if (this.fogCanvas) this.fogCanvas = null;
    this.fogMesh = null;
    this.fogShader = null;

    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    logger.info('renderer', 'ThreeJSRenderer destroyed');
  }

  resize(width: number, height: number): void {
    // width/height — виртуальный низкобитный вьюпорт; для 3D важны только
    // пропорции и позиция камеры, реальный размер берём из контейнера.
    this.viewW = width;
    this.viewH = height;
    this.resizeToContainer();
    this.updateCamera();
  }

  render(): void {
    if (!this.renderer) return;
    this.updateCamera();
    this.rebuildDirtyGraphics();
    this.updateBillboardFacing();

    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);

    if (this.overlayScene.children.length > 0) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.overlayScene, this.overlayCamera);
      this.renderer.autoClear = true;
    }
  }

  // ============================================================
  // Terrain (3D-расширение IRenderer; вызывает map loader)
  // ============================================================

  /** Поддерживает ли рендерер 3D-рельеф. */
  get supports3DTerrain(): boolean {
    return true;
  }

  /**
   * Построить 3D-рельеф из карты и натянуть на него запечённую карту земли.
   * `groundHandle` — Graphics с батчем тайлов; `wallBatchHandle` — батч стен
   * подземелья (DWALL), который в 3D заменяется боксами.
   */
  setTerrain3D(
    map: TerrainMap,
    groundHandle: GraphicsHandle,
    wallBatchHandle?: GraphicsHandle | null,
    /** 2D-билборды домов и частокола — в 3D их заменяет настоящая геометрия. */
    villageBillboards?: GraphicsHandle[] | null,
  ): void {
    this.clearTerrain();

    const ground = this.graphics.get(groundHandle as number);
    if (!ground) {
      logger.warn('renderer', 'setTerrain3D: ground graphics not found');
      return;
    }
    // Земля — большой атлас: padding 0, чтобы UV совпали с текстурой.
    ground.pad = 0;
    this.buildGraphics(ground);
    ground.skip3D = true;
    if (ground.sprite) ground.sprite.visible = false;

    // Батч стен подземелья: рисуем его на канвас (он же текстура боксов),
    // сам батч в 3D не показываем.
    let wallTexture: { offsetX: number; offsetY: number; width: number; height: number } | null = null;
    let wallCanvas: HTMLCanvasElement | null = null;
    if (wallBatchHandle != null) {
      const wb = this.graphics.get(wallBatchHandle as number);
      if (wb) {
        wb.pad = 0;
        this.buildGraphics(wb);
        wb.skip3D = true;
        if (wb.sprite) wb.sprite.visible = false;
        wb.visible = false;
        if (map.isDungeon && wb.canvas.width > 1 && wb.canvas.height > 1) {
          wallCanvas = wb.canvas;
          wallTexture = {
            offsetX: wb.bounds.minX,
            offsetY: wb.bounds.minY,
            width: wb.canvas.width,
            height: wb.canvas.height,
          };
        }
      }
    }

    // Холст земли Graphics обрезан по нарисованным тайлам, а не по размеру
    // карты — иначе UV съезжают и часть пола остаётся прозрачной (чёрной).
    const groundTexture = {
      offsetX: ground.bounds.minX,
      offsetY: ground.bounds.minY,
      width: ground.canvas.width,
      height: ground.canvas.height,
    };

    const mesh = buildTerrainMesh(map, { groundTexture, wallTexture: wallTexture ?? undefined });
    this.terrain = mesh;

    const tex = new THREE.CanvasTexture(ground.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());

    const group = new THREE.Group();
    group.name = 'terrain';

    if (mesh.ground.indices.length > 0) {
      const geo = buildBufferGeometry(mesh.ground);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = -10;
      group.add(m);
    }

    if (mesh.cliffs.indices.length > 0) {
      const geo = buildBufferGeometry(mesh.cliffs);
      // Цвет белый: грани уступов и подступенки лестниц берут готовую
      // палитру камня из текстуры земли (2D-арт edgeFace/sideFace).
      // Серый тинт 0x6f7a88 раньше умножал её и грани становились чёрными.
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xffffff,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = -9;
      group.add(m);
    }

    // Стены подземелья — боксы с текстурой тайлсета стен (свой холст).
    if (wallCanvas && mesh.dungeonWalls.indices.length > 0) {
      const wallTex = new THREE.CanvasTexture(wallCanvas);
      wallTex.colorSpace = THREE.SRGBColorSpace;
      wallTex.magFilter = THREE.NearestFilter;
      wallTex.minFilter = THREE.LinearMipmapLinearFilter;
      wallTex.generateMipmaps = true;
      wallTex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());

      const geo = buildBufferGeometry(mesh.dungeonWalls);
      const mat = new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = -8;
      group.add(m);
    }

    this.scene.add(group);
    this.terrainGroup = group;

    // Дома и частокол — настоящей геометрией вместо 2D-спрайтов.
    this.buildVillage3D(map, villageBillboards);

    this.updateCamera();
    logger.info('renderer', `3D terrain built: ${map.W}x${map.H}`);
  }

  /**
   * Построить 3D-деревню: срубы с двускатными кровлями и частокол по
   * периметру. 2D-билборды этих тайлов скрываются, иначе они торчат из земли.
   */
  private buildVillage3D(
    map: TerrainMap,
    billboards?: GraphicsHandle[] | null,
  ): void {
    if (billboards) {
      for (const h of billboards) {
        const g = this.graphics.get(h as number);
        if (!g) continue;
        g.skip3D = true;
        if (g.sprite) g.sprite.visible = false;
      }
    }
    if (map.isDungeon || !this.terrain) return;

    const world = map as unknown as WorldData;
    const heightAtTile = (tx: number, ty: number): number => this.terrain!.heightAtTile(tx, ty);
    const group = new THREE.Group();
    group.name = 'village';

    const houses = collectHouses(world, true);
    for (const part of buildHouses3D(world, houses, heightAtTile)) {
      const geo = buildBufferGeometry(part.data);
      const mat = new THREE.MeshBasicMaterial({ color: part.color, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = -7;
      group.add(m);
    }

    const fence = buildFence3D(world, heightAtTile);
    if (fence) {
      const tex = new THREE.CanvasTexture(makeFenceTexture());
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      const geo = buildBufferGeometry(fence);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = -6;
      group.add(m);
    }

    if (group.children.length > 0) {
      this.scene.add(group);
      this.villageGroup = group;
    }
    logger.info(
      'renderer',
      `Village 3D: ${houses.length} houses, fence=${fence ? 'yes' : 'no'}`,
    );
  }

  /** Удалить рельеф (при смене карты). */
  clearTerrain(): void {
    if (this.villageGroup) {
      for (const child of [...this.villageGroup.children]) {
        const m = child as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.MeshBasicMaterial | undefined;
        mat?.map?.dispose();
        mat?.dispose();
      }
      this.scene.remove(this.villageGroup);
      this.villageGroup = null;
    }
    if (!this.terrainGroup) return;
    for (const child of [...this.terrainGroup.children]) {
      const m = child as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.MeshBasicMaterial | undefined;
      mat?.map?.dispose();
      mat?.dispose();
    }
    this.scene.remove(this.terrainGroup);
    this.terrainGroup = null;
    this.terrain = null;
    // Пересоздаём билборды сущностей на новой карте (позиции пересчитаются).
  }

  // ============================================================
  // Layers
  // ============================================================

  createLayer(name: string, zIndex: number): LayerHandle {
    const id = this.nextId++;
    const group = new THREE.Group();
    group.name = name;
    group.renderOrder = zIndex;
    this.scene.add(group);
    this.layers.set(id, { group, zIndex, name });
    return id as LayerHandle;
  }

  setLayerVisible(layer: LayerHandle, visible: boolean): void {
    this.layers.get(layer as number)?.group && (this.layers.get(layer as number)!.group.visible = visible);
  }

  getLayerContainer(layer: LayerHandle): any {
    return this.layers.get(layer as number)?.group ?? null;
  }

  getWorldContainer(): any {
    // Для map-render-system: в 3D «легаси-спрайтов» нет.
    return null;
  }

  applyFilterToContainer(_container: any, _shader: ShaderHandle): void {
    /* В 3D шейдеры Pixi-фильтров не применяются. */
  }

  createFullscreenQuad(): GraphicsHandle {
    const id = this.nextId++;
    this.fullscreenQuads.set(id, { visible: true });
    return id as GraphicsHandle;
  }

  applyFilterToQuad(handle: GraphicsHandle, _shader: ShaderHandle): void {
    // Используется туманом: включаем экранный оверлей тумана.
    if (this.fullscreenQuads.has(handle as number)) {
      this.fogVisible = true;
      this.fogDirty = true;
    }
  }

  setGraphicsVisible(handle: GraphicsHandle, visible: boolean): void {
    const q = this.fullscreenQuads.get(handle as number);
    if (q) {
      q.visible = visible;
      this.fogVisible = visible;
      return;
    }
    const g = this.graphics.get(handle as number);
    if (!g) return;
    g.visible = visible;
    if (g.sprite) g.sprite.visible = visible && !g.skip3D;
  }

  getScreenSize(): { w: number; h: number } {
    return { w: this.screenW, h: this.screenH };
  }

  setScreenSize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
  }

  getGraphicsPixi(handle: GraphicsHandle): any {
    return this.graphics.get(handle as number)?.canvas ?? null;
  }

  resetNextId(): void {
    // ID не сбрасываем: живые объекты могут ссылаться на старые handles.
  }

  // ============================================================
  // Sprites
  // ============================================================

  createSprite(options: SpriteCreateOptions): SpriteHandle {
    const id = this.nextId++;
    const tex = this.resolveTexture(options.texture);
    const material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.35,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    if (options.tint !== undefined) material.color.setHex(options.tint >>> 0);
    const sprite = this.makeBillboard(material);
    const scale = options.scale ?? { x: 1, y: 1 };
    const { width: w, height: h } = textureSize(tex, 16, 16);
    sprite.scale.set((w / PX_PER_UNIT) * scale.x, (h / PX_PER_UNIT) * scale.y, 1);
    if (options.anchor) {
      sprite.center.set(clamp01(options.anchor.x), clamp01(options.anchor.y));
    }
    sprite.visible = options.visible ?? true;
    if (options.alpha !== undefined) {
      material.opacity = options.alpha;
      material.transparent = options.alpha < 1;
    }
    sprite.position.set(
      (options.x ?? 0) / PX_PER_UNIT,
      this.groundHeight(options.x ?? 0, options.y ?? 0),
      (options.y ?? 0) / PX_PER_UNIT,
    );

    const layerId = options.layer as number | undefined;
    const parent = layerId !== undefined ? this.layers.get(layerId)?.group : undefined;
    (parent ?? this.scene).add(sprite);
    this.sprites.set(id, { sprite, layer: (layerId as LayerHandle) ?? -1, screen: false });
    return id as SpriteHandle;
  }

  createSpriteInContainer(texture: TextureHandle | string, x: number, y: number, _container: any): any {
    const tex = this.resolveTexture(texture);
    const sprite = this.makeBillboard(
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    const { width: w, height: h } = textureSize(tex, 16, 16);
    sprite.scale.set(w / PX_PER_UNIT, h / PX_PER_UNIT, 1);
    sprite.position.set(x / PX_PER_UNIT, this.groundHeight(x, y), y / PX_PER_UNIT);
    this.scene.add(sprite);
    return sprite;
  }

  destroySprite(handle: SpriteHandle): void {
    const s = this.sprites.get(handle as number);
    if (!s) return;
    s.sprite.parent?.remove(s.sprite);
    s.sprite.material.dispose();
    this.releaseBillboard(s.sprite);
    this.sprites.delete(handle as number);
  }

  setSpritePosition(handle: SpriteHandle, pos: Vec2): void {
    const s = this.sprites.get(handle as number);
    if (!s) return;
    s.sprite.position.set(pos.x / PX_PER_UNIT, this.groundHeight(pos.x, pos.y), pos.y / PX_PER_UNIT);
  }

  setSpriteVisible(handle: SpriteHandle, visible: boolean): void {
    const s = this.sprites.get(handle as number);
    if (s) s.sprite.visible = visible;
  }

  setSpriteAlpha(handle: SpriteHandle, alpha: number): void {
    const s = this.sprites.get(handle as number);
    if (!s) return;
    s.sprite.material.opacity = alpha;
    s.sprite.material.transparent = alpha < 1;
  }

  setSpriteTint(handle: SpriteHandle, tint: number): void {
    const s = this.sprites.get(handle as number);
    if (s) s.sprite.material.color.setHex(tint >>> 0);
  }

  setSpriteScale(handle: SpriteHandle, scale: Vec2): void {
    const s = this.sprites.get(handle as number);
    if (!s) return;
    const img = s.sprite.material.map?.image as { width?: number; height?: number } | undefined;
    const w = img?.width ?? 16;
    const h = img?.height ?? 16;
    s.sprite.scale.set((w / PX_PER_UNIT) * scale.x, (h / PX_PER_UNIT) * scale.y, 1);
  }

  setSpriteZIndex(handle: SpriteHandle, zIndex: number): void {
    const s = this.sprites.get(handle as number);
    if (s) s.sprite.renderOrder = zIndex > 0 ? 100 : 0;
  }

  getSpritePixi(handle: SpriteHandle): any {
    return this.sprites.get(handle as number)?.sprite ?? null;
  }

  createScreenSprite(options: Omit<SpriteCreateOptions, 'layer'>): SpriteHandle {
    const id = this.nextId++;
    const tex = this.resolveTexture(options.texture);
    const material = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.01,
      depthTest: false,
      depthWrite: false,
    });
    if (options.tint !== undefined) material.color.setHex(options.tint >>> 0);
    const sprite = new THREE.Sprite(material);
    const { width: w, height: h } = textureSize(tex, this.viewW, this.viewH);
    const scale = options.scale ?? { x: 1, y: 1 };
    sprite.scale.set(w * scale.x, h * scale.y, 1);
    // Экранные координаты: (x, y) — левый верхний угол, y вниз.
    sprite.center.set(0.5, 0.5);
    sprite.position.set((options.x ?? 0) + (w * scale.x) / 2, -((options.y ?? 0) + (h * scale.y) / 2), 0);
    sprite.renderOrder = 1000;
    if (options.alpha !== undefined) material.opacity = options.alpha;
    sprite.visible = options.visible ?? true;
    this.overlayScene.add(sprite);
    this.sprites.set(id, { sprite, layer: -1, screen: true });
    return id as SpriteHandle;
  }

  // ============================================================
  // Graphics (примитивы → Canvas2D → билборд)
  // ============================================================

  createGraphics(layer?: LayerHandle): GraphicsHandle {
    const id = this.nextId++;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ThreeJSRenderer: 2D context unavailable');

    const g: InternalGraphics = {
      canvas,
      ctx,
      cmds: [],
      dirty: true,
      pad: 2,
      posSet: false,
      elevation: 0,
      bounds: { minX: 0, minY: 0, width: 1, height: 1 },
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      hasContent: false,
      sprite: null,
      texture: null,
      pos: { x: 0, y: 0 },
      visible: true,
      alpha: 1,
      zIndex: 0,
      layer,
      skip3D: false,
    };
    this.graphics.set(id, g);
    return id as GraphicsHandle;
  }

  destroyGraphics(handle: GraphicsHandle): void {
    if (this.fullscreenQuads.delete(handle as number)) return;
    const g = this.graphics.get(handle as number);
    if (!g) return;
    this.disposeGraphics(g);
    this.graphics.delete(handle as number);
  }

  clearGraphics(handle: GraphicsHandle): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    g.cmds.length = 0;
    g.dirty = true;
    g.hasContent = false;
  }

  drawRect(handle: GraphicsHandle, rect: Rect, color: Color, fill = true, strokeWidth = 0): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    const c = colorToHex(color);
    if (fill) g.cmds.push({ t: 'rect', x: rect.x, y: rect.y, w: rect.width, h: rect.height, color: c, alpha: color.a, stroke: 0 });
    if (strokeWidth > 0) g.cmds.push({ t: 'rect', x: rect.x, y: rect.y, w: rect.width, h: rect.height, color: c, alpha: color.a, stroke: strokeWidth });
    g.dirty = true;
  }

  drawEllipse(handle: GraphicsHandle, cx: number, cy: number, rx: number, ry: number, color: Color): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    g.cmds.push({ t: 'ellipse', cx, cy, rx, ry, color: colorToHex(color), alpha: color.a });
    g.dirty = true;
  }

  drawPoly(handle: GraphicsHandle, points: number[], color: Color): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    g.cmds.push({ t: 'poly', pts: points.slice(), color: colorToHex(color), alpha: color.a });
    g.dirty = true;
  }

  drawLine(handle: GraphicsHandle, x1: number, y1: number, x2: number, y2: number, color: Color, width = 1): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    g.cmds.push({ t: 'line', x1, y1, x2, y2, color: colorToHex(color), alpha: color.a, width });
    g.dirty = true;
  }

  setGraphicsPosition(handle: GraphicsHandle, pos: Vec2): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    g.pos = { x: pos.x, y: pos.y };
    g.posSet = true;
  }

  /**
   * Поднять Graphics над землёй на worldUnits (1 единица = 16 px).
   * В 3D нужно подсказкам и маркерам: без этого они висят на уровне пола.
   */
  setGraphicsElevation(handle: GraphicsHandle, worldUnits: number): void {
    const g = this.graphics.get(handle as number);
    if (!g) return;
    if (g.elevation === worldUnits) return;
    g.elevation = worldUnits;
    g.dirty = true;
  }

  setGraphicsAlpha(handle: GraphicsHandle, alpha: number): void {
    const g = this.graphics.get(handle as number);
    if (g) g.alpha = alpha;
  }

  setGraphicsZIndex(handle: GraphicsHandle, zIndex: number): void {
    const g = this.graphics.get(handle as number);
    if (g) g.zIndex = zIndex;
  }

  // ============================================================
  // Textures
  // ============================================================

  async loadTexture(url: string): Promise<TextureHandle> {
    const id = this.nextId++;
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    this.textures.set(id, { texture: tex });
    return id as TextureHandle;
  }

  createTextureFromCanvas(canvas: HTMLCanvasElement): TextureHandle {
    const id = this.nextId++;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.textures.set(id, { texture: tex, canvas });
    return id as TextureHandle;
  }

  createRenderTexture(width: number, height: number): TextureHandle {
    const id = this.nextId++;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(id, { texture: tex, canvas });
    return id as TextureHandle;
  }

  renderToTexture(texture: TextureHandle, source: GraphicsHandle | SpriteHandle): void {
    const target = this.textures.get(texture as number);
    if (!target?.canvas) return;
    const ctx = target.canvas.getContext('2d');
    if (!ctx) return;

    const g = this.graphics.get(source as number);
    const s = this.sprites.get(source as number);
    ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
    if (g) {
      this.buildGraphics(g);
      const dw = Math.min(target.canvas.width, g.canvas.width);
      const dh = Math.min(target.canvas.height, g.canvas.height);
      ctx.drawImage(g.canvas, 0, 0, dw, dh, 0, 0, dw, dh);
    } else if (s) {
      const img = s.sprite.material.map?.image as CanvasImageSource | undefined;
      if (img) ctx.drawImage(img, 0, 0, target.canvas.width, target.canvas.height);
    }
    target.texture.needsUpdate = true;
  }

  destroyTexture(handle: TextureHandle): void {
    const t = this.textures.get(handle as number);
    if (!t) return;
    t.texture.dispose();
    this.textures.delete(handle as number);
  }

  renderCanvasToTexture(canvas: HTMLCanvasElement, target: TextureHandle): void {
    const t = this.textures.get(target as number);
    if (!t?.canvas) return;
    const ctx = t.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
    ctx.drawImage(canvas, 0, 0);
    t.texture.needsUpdate = true;
  }

  // ============================================================
  // UI (text)
  // ============================================================

  createText(
    text: string,
    style: { fontSize?: number; color?: number; fontFamily?: string },
    layer?: LayerHandle,
  ): UIElementHandle {
    const id = this.nextId++;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontSize = style.fontSize ?? 6;
    // Рисуем крупно и уменьшаем — пиксельный текст остаётся читаемым.
    const renderSize = 32;
    const fontFamily = style.fontFamily ?? 'monospace';
    ctx.font = `bold ${renderSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    canvas.width = Math.max(8, Math.ceil(metrics.width) + 8);
    canvas.height = renderSize + 12;
    const c2 = canvas.getContext('2d')!;
    c2.font = `bold ${renderSize}px ${fontFamily}`;
    c2.textBaseline = 'top';
    c2.fillStyle = hexToCss(style.color ?? 0xffffff, 1);
    c2.fillText(text, 4, 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sprite = this.makeBillboard(material);
    const worldW = (canvas.width / renderSize) * (fontSize / PX_PER_UNIT);
    const worldH = (canvas.height / renderSize) * (fontSize / PX_PER_UNIT);
    sprite.scale.set(worldW, worldH, 1);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 2000;

    const layerId = layer as number | undefined;
    (layerId !== undefined ? this.layers.get(layerId)?.group : this.scene)?.add(sprite);

    const entry: InternalText = {
      sprite,
      canvas,
      text,
      fontSize,
      color: style.color ?? 0xffffff,
      width: canvas.width,
      height: canvas.height,
      x: 0,
      y: 0,
      alpha: 1,
      visible: true,
    };
    this.texts.set(id, entry);
    return id as UIElementHandle;
  }

  setText(handle: UIElementHandle, text: string): void {
    const t = this.texts.get(handle as number);
    if (!t || t.text === text) return;
    t.text = text;
    this.redrawText(t);
  }

  setTextStyle(handle: UIElementHandle, style: { fontSize?: number; color?: number }): void {
    const t = this.texts.get(handle as number);
    if (!t) return;
    if (style.fontSize) t.fontSize = style.fontSize;
    if (style.color !== undefined) t.color = style.color;
    this.redrawText(t);
  }

  destroyUIElement(handle: UIElementHandle): void {
    const t = this.texts.get(handle as number);
    if (!t) return;
    this.disposeText(t);
    this.texts.delete(handle as number);
  }

  setUIPosition(handle: UIElementHandle, pos: Vec2): void {
    const t = this.texts.get(handle as number);
    if (!t) return;
    t.x = pos.x;
    t.y = pos.y;
    t.sprite.position.set(
      pos.x / PX_PER_UNIT,
      this.groundHeight(pos.x, pos.y) + 1.1,
      pos.y / PX_PER_UNIT,
    );
  }

  setUIAlpha(handle: UIElementHandle, alpha: number): void {
    const t = this.texts.get(handle as number);
    if (!t) return;
    t.alpha = alpha;
    t.sprite.material.opacity = alpha;
    t.sprite.material.transparent = alpha < 1;
  }

  setUIVisible(handle: UIElementHandle, visible: boolean): void {
    const t = this.texts.get(handle as number);
    if (!t) return;
    t.visible = visible;
    t.sprite.visible = visible;
  }

  // ============================================================
  // Shaders (в 3D поддерживается только туман)
  // ============================================================

  createShader(_vertex: string, _fragment: string, uniforms?: Record<string, any>): ShaderHandle {
    const id = this.nextId++;
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(uniforms ?? {})) {
      if (v && typeof v === 'object' && 'value' in (v as object)) {
        normalized[k] = (v as { value: unknown }).value;
      } else {
        normalized[k] = v;
      }
    }
    this.fogShader = { id: id as ShaderHandle, uniforms: normalized };
    return id as ShaderHandle;
  }

  applyShaderToLayer(_layer: LayerHandle, _shader: ShaderHandle, _uniforms?: Record<string, unknown>): void {
    /* не используется в 3D */
  }

  setShaderUniform(shader: ShaderHandle, name: string, value: unknown): void {
    if (this.fogShader && this.fogShader.id === shader) {
      this.fogShader.uniforms[name] = value;
      this.fogDirty = true;
    }
  }

  destroyShader(handle: ShaderHandle): void {
    if (this.fogShader?.id === handle) this.fogShader = null;
  }

  // ============================================================
  // Camera
  // ============================================================

  setCameraPosition(pos: Vec2): void {
    this.cameraPos = { x: pos.x, y: pos.y };
  }

  setCameraBounds(_bounds: Rect | null): void {
    /* границы карты уже учтены ViewportController */
  }

  worldToScreen(worldPos: Vec2): Vec2 {
    const v = new THREE.Vector3(
      worldPos.x / PX_PER_UNIT,
      this.groundHeight(worldPos.x, worldPos.y),
      worldPos.y / PX_PER_UNIT,
    ).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.screenW,
      y: ((1 - v.y) / 2) * this.screenH,
    };
  }

  screenToWorld(screenPos: Vec2): Vec2 {
    const ndc = new THREE.Vector2(
      (screenPos.x / Math.max(1, this.screenW)) * 2 - 1,
      -((screenPos.y / Math.max(1, this.screenH)) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.cameraGroundY());
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) {
      return { x: this.cameraPos.x + this.viewW / 2, y: this.cameraPos.y + this.viewH / 2 };
    }
    return { x: hit.x * PX_PER_UNIT, y: hit.z * PX_PER_UNIT };
  }

  isVisibleInViewport(worldPos: Vec2, radius: number): boolean {
    const d = Math.hypot(
      worldPos.x - (this.cameraPos.x + this.viewW / 2),
      worldPos.y - (this.cameraPos.y + this.viewH / 2),
    );
    return d < Math.max(this.viewW, this.viewH) * 0.9 + radius;
  }

  getStats(): { sprites: number; textures: number; drawCalls: number } {
    const info = this.renderer?.info;
    return {
      sprites: this.sprites.size + this.graphics.size,
      textures: this.textures.size,
      drawCalls: info?.render.calls ?? 0,
    };
  }

  // ============================================================
  // Внутренняя кухня
  // ============================================================

  private resizeToContainer(): void {
    if (!this.renderer || !this.container) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.screenW = w;
    this.screenH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.overlayCamera.left = 0;
    this.overlayCamera.right = w;
    this.overlayCamera.top = 0;
    this.overlayCamera.bottom = h;
    this.overlayCamera.updateProjectionMatrix();

    // Экранная вигнетка создаётся в координатах viewW/viewH (виртуальных) —
    // масштабируем оверлей под реальный размер.
    const sx = w / Math.max(1, this.viewW);
    const sy = h / Math.max(1, this.viewH);
    for (const s of this.sprites.values()) {
      if (s.screen) {
        const img = s.sprite.material.map?.image as { width?: number; height?: number } | undefined;
        s.sprite.scale.set((img?.width ?? this.viewW) * sx, (img?.height ?? this.viewH) * sy, 1);
      }
    }
    this.fogDirty = true;
  }

  private updateCamera(): void {
    if (!this.camera) return;
    const centerPx = this.cameraPos.x + this.viewW / 2;
    const centerPy = this.cameraPos.y + this.viewH / 2;
    const cx = centerPx / PX_PER_UNIT;
    const cz = centerPy / PX_PER_UNIT;
    const groundY = this.terrain ? this.terrain.heightAt(centerPx, centerPy) : 0;
    this.camera.position.set(cx, groundY + CAM_HEIGHT, cz + CAM_BACK);
    this.camera.lookAt(cx, groundY + CAM_LOOK_Y, cz);
    this.camera.updateMatrixWorld();
  }

  private cameraGroundY(): number {
    return this.terrain
      ? this.terrain.heightAt(this.cameraPos.x + this.viewW / 2, this.cameraPos.y + this.viewH / 2)
      : 0;
  }

  private groundHeight(xPx: number, yPx: number): number {
    return this.terrain ? this.terrain.heightAt(xPx, yPx) : 0;
  }

  /** Создать Y-билборд и поставить его в очередь поворота к камере. */
  private makeBillboard(material: THREE.MeshBasicMaterial): YBillboard {
    const billboard = new YBillboard(material);
    this.billboards.add(billboard);
    return billboard;
  }

  /** Убрать билборд из очереди поворота (при удалении объекта). */
  private releaseBillboard(obj: THREE.Object3D): void {
    if (obj instanceof YBillboard) this.billboards.delete(obj);
  }

  /**
   * Повернуть все билборды к камере ТОЛЬКО вокруг вертикали.
   *
   * THREE.Sprite разворачивает плоскость целиком к камере: при наклоне 58°
   * спрайт заваливается назад и персонажи «лежат». Здесь плоскость остаётся
   * вертикальной (как штык), поворот считается по горизонтальному направлению
   * на камеру.
   */
  private updateBillboardFacing(): void {
    const cam = this.camera.position;
    for (const b of this.billboards) {
      b.rotation.y = Math.atan2(cam.x - b.position.x, cam.z - b.position.z);
    }
  }

  private resolveTexture(source: TextureHandle | string): THREE.Texture {
    if (typeof source === 'string') {
      const tex = new THREE.TextureLoader().load(source);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    return this.textures.get(source as number)?.texture ?? new THREE.Texture();
  }

  private rebuildDirtyGraphics(): void {
    for (const g of this.graphics.values()) {
      if (g.dirty && g.visible && g.alpha > 0.001) this.buildGraphics(g);
    }
    this.rebuildFog();
  }

  /** Пересобрать канвас Graphics и обновить текстуру/спрайт. */
  private buildGraphics(g: InternalGraphics): void {
    const { minX, minY, maxX, maxY } = computeBounds(g.cmds, g.pad);
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);

    if (g.canvas.width !== w || g.canvas.height !== h) {
      g.canvas.width = w;
      g.canvas.height = h;
    }
    g.bounds = { minX, minY, width: w, height: h };
    const ctx = g.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, -minX, -minY);

    for (const cmd of g.cmds) drawCommand(ctx, cmd);

    if (!g.texture) {
      g.texture = new THREE.CanvasTexture(g.canvas);
      g.texture.colorSpace = THREE.SRGBColorSpace;
      g.texture.magFilter = THREE.NearestFilter;
      g.texture.minFilter = THREE.LinearMipmapLinearFilter;
      g.texture.generateMipmaps = true;
    } else {
      g.texture.needsUpdate = true;
    }

    if (!g.sprite) {
      g.sprite = this.makeBillboard(
        new THREE.MeshBasicMaterial({
          map: g.texture,
          transparent: true,
          alphaTest: 0.35,
          depthWrite: true,
          side: THREE.DoubleSide,
        }),
      );
      g.sprite.renderOrder = 10;
      const layerId = g.layer as number | undefined;
      const parent = layerId !== undefined ? this.layers.get(layerId)?.group : undefined;
      (parent ?? this.scene).add(g.sprite);
    }

    const mat = g.sprite.material;
    mat.map = g.texture;
    mat.opacity = g.alpha;
    mat.transparent = g.alpha < 1;
    mat.depthWrite = g.alpha >= 0.98;

    g.sprite.visible = g.visible && !g.skip3D && g.cmds.length > 0;
    // Низ рисунка (без padding канваса) — это линия земли спрайта: арт
    // нарисован так, что тень/подошва лежит на его нижней границе. Ставим
    // именно её на поверхность рельефа, иначе низ спрайта уходит под землю.
    const groundPx = g.posSet ? maxY - g.pad : 0;
    g.sprite.position.set(
      g.pos.x / PX_PER_UNIT,
      this.groundHeight(g.pos.x, g.pos.y) + groundPx / PX_PER_UNIT + g.elevation,
      g.pos.y / PX_PER_UNIT,
    );
    g.sprite.scale.set(w / PX_PER_UNIT, h / PX_PER_UNIT, 1);
    // Точка (0,0) локальной системы Graphics — центр «ног»; билборд ставит
    // изображение так же, как это делал THREE.Sprite.
    g.sprite.center.set(
      clamp01((0 - minX) / w),
      clamp01(1 - (0 - minY) / h),
    );
    g.dirty = false;
    g.hasContent = true;
  }

  private disposeGraphics(g: InternalGraphics): void {
    if (g.sprite) {
      g.sprite.parent?.remove(g.sprite);
      g.sprite.material.dispose();
      this.releaseBillboard(g.sprite);
      g.sprite = null;
    }
    g.texture?.dispose();
    g.texture = null;
  }

  private redrawText(t: InternalText): void {
    const renderSize = 32;
    const ctx = t.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
    const family = 'monospace';
    ctx.font = `bold ${renderSize}px ${family}`;
    const metrics = ctx.measureText(t.text);
    const needW = Math.max(8, Math.ceil(metrics.width) + 8);
    if (needW !== t.canvas.width) t.canvas.width = needW;
    ctx.font = `bold ${renderSize}px ${family}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = hexToCss(t.color, 1);
    ctx.fillText(t.text, 4, 4);
    const tex = t.sprite.material.map;
    if (tex) tex.needsUpdate = true;
    const worldW = (t.canvas.width / renderSize) * (t.fontSize / PX_PER_UNIT);
    const worldH = (t.canvas.height / renderSize) * (t.fontSize / PX_PER_UNIT);
    t.sprite.scale.set(worldW, worldH, 1);
  }

  private disposeText(t: InternalText): void {
    t.sprite.parent?.remove(t.sprite);
    t.sprite.material.map?.dispose();
    t.sprite.material.dispose();
    this.releaseBillboard(t.sprite);
  }

  // ── Туман: упрощённый экранный оверлей ──────────────────────

  private buildFogOverlay(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 144;
    this.fogCanvas = canvas;
    this.fogTexture = new THREE.CanvasTexture(canvas);
    this.fogTexture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: this.fogTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.position.set(0.5, -0.5, 0); // заполняется в resizeToContainer
    mesh.scale.set(1, 1, 1);
    mesh.renderOrder = 1500;
    mesh.visible = false;
    this.overlayScene.add(mesh);
    this.fogMesh = mesh;
  }

  private rebuildFog(): void {
    if (!this.fogMesh || !this.fogCanvas || !this.fogTexture) return;
    const shader = this.fogShader;
    const alpha = (shader?.uniforms.uFogAlpha as number) ?? 0;
    const visible = this.fogVisible && alpha > 0.004;
    this.fogMesh.visible = visible;
    if (!visible || !this.fogDirty) return;

    const w = this.fogCanvas.width;
    const h = this.fogCanvas.height;
    const ctx = this.fogCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // Позиция игрока в UV вьюпорта.
    const px = ((shader?.uniforms.uPlayerPosX as number) ?? 0.5) * w;
    const py = ((shader?.uniforms.uPlayerPosY as number) ?? 0.5) * h;
    const radiusUV = (shader?.uniforms.uFogRadius as number) ?? 0.35;
    const r = Math.max(8, radiusUV * Math.min(w, h));

    const grad = ctx.createRadialGradient(px, py, r * 0.55, px, py, r * 1.35);
    grad.addColorStop(0, `rgba(6,10,16,0)`);
    grad.addColorStop(0.55, `rgba(6,10,16,${(alpha * 0.55).toFixed(3)})`);
    grad.addColorStop(1, `rgba(6,10,16,${Math.min(0.96, alpha * 0.96).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Дыры у святилищ.
    const count = Math.min(10, (shader?.uniforms.uShrineCount as number) ?? 0);
    for (let i = 0; i < count; i++) {
      const uv = shader?.uniforms[`uShrineUV${i}`] as [number, number] | undefined;
      if (!uv) continue;
      const sx = uv[0] * w;
      const sy = uv[1] * h;
      const hole = 0.09 * Math.min(w, h);
      const g2 = ctx.createRadialGradient(sx, sy, hole * 0.2, sx, sy, hole);
      g2.addColorStop(0, 'rgba(0,0,0,0.85)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(sx, sy, hole, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    this.fogTexture.needsUpdate = true;
    this.fogDirty = false;

    // Плоскость тумана растягиваем на весь экран (в координатах оверлея).
    this.fogMesh.position.set(this.screenW / 2, -this.screenH / 2, 0);
    this.fogMesh.scale.set(this.screenW, this.screenH, 1);
  }
}

// ============================================================
// Y-билборд
// ============================================================

interface BillboardCenter {
  x: number;
  y: number;
  set(x: number, y: number): void;
}

/**
 * Y-билборд — вертикальная плоскость, которая поворачивается к камере только
 * вокруг оси Y.
 *
 * Заменяет THREE.Sprite для всего мира: спрайт всегда разворачивается к
 * камере всей плоскостью, поэтому при камере с наклоном 58° картинка
 * заваливается назад и персонажи выглядят лежащими. Плоскость же остаётся
 * строго вертикальной и «смотрит» на камеру по горизонтали — как щит на шесте.
 *
 * `center` повторяет семантику Sprite.center: (0,0) — низ-лево изображения,
 * (0.5,0) — низ-центр (точка привязки на земле).
 */
class YBillboard extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  readonly center: BillboardCenter;

  constructor(material: THREE.MeshBasicMaterial) {
    super(new THREE.PlaneGeometry(1, 1), material);
    this.center = {
      x: 0.5,
      y: 0.5,
      set: (x: number, y: number): void => {
        // buildGraphics зовёт center.set() каждый кадр для анимированных
        // сущностей — пересобираем плоскость только при реальном сдвиге.
        if (this.center.x === x && this.center.y === y) return;
        this.center.x = x;
        this.center.y = y;
        this.applyCenter();
      },
    };
    this.frustumCulled = false;
    this.renderOrder = 10;
  }

  /**
   * Пересобрать плоскость со сдвигом так, чтобы точка привязки попала в
   * начало координат меша. Сдвиг задаётся на единичной плоскости — масштаб
   * меша (ширина/высота в юнитах) растягивает его вместе с картинкой.
   */
  private applyCenter(): void {
    const next = new THREE.PlaneGeometry(1, 1);
    next.translate(0.5 - this.center.x, 0.5 - this.center.y, 0);
    this.geometry.dispose();
    this.geometry = next;
  }
}

// ============================================================
// Утилиты
// ============================================================

function buildBufferGeometry(data: MeshLike): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

interface MeshLike {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

function computeBounds(cmds: Command[], pad: number): { minX: number; minY: number; maxX: number; maxY: number } {
  if (cmds.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const c of cmds) {
    switch (c.t) {
      case 'rect': {
        const s = c.stroke / 2;
        grow(c.x - s, c.y - s);
        grow(c.x + c.w + s, c.y + c.h + s);
        break;
      }
      case 'ellipse':
        grow(c.cx - c.rx, c.cy - c.ry);
        grow(c.cx + c.rx, c.cy + c.ry);
        break;
      case 'line': {
        const s = Math.max(1, c.width) / 2;
        grow(Math.min(c.x1, c.x2) - s, Math.min(c.y1, c.y2) - s);
        grow(Math.max(c.x1, c.x2) + s, Math.max(c.y1, c.y2) + s);
        break;
      }
      case 'poly':
        for (let i = 0; i + 1 < c.pts.length; i += 2) grow(c.pts[i], c.pts[i + 1]);
        break;
    }
  }
  // pad=0 для атласа карты: UV квадов рельефа заданы в координатах всего канваса.
  return {
    minX: Math.floor(minX) - pad,
    minY: Math.floor(minY) - pad,
    maxX: Math.ceil(maxX) + pad,
    maxY: Math.ceil(maxY) + pad,
  };
}

function drawCommand(ctx: CanvasRenderingContext2D, cmd: Command): void {
  switch (cmd.t) {
    case 'rect':
      if (cmd.stroke > 0) {
        ctx.strokeStyle = hexToCss(cmd.color, cmd.alpha);
        ctx.lineWidth = cmd.stroke;
        ctx.strokeRect(cmd.x, cmd.y, cmd.w, cmd.h);
      } else {
        ctx.fillStyle = hexToCss(cmd.color, cmd.alpha);
        ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h);
      }
      break;
    case 'ellipse':
      ctx.fillStyle = hexToCss(cmd.color, cmd.alpha);
      ctx.beginPath();
      ctx.ellipse(cmd.cx, cmd.cy, Math.max(0.1, cmd.rx), Math.max(0.1, cmd.ry), 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'poly':
      if (cmd.pts.length < 6) return;
      ctx.fillStyle = hexToCss(cmd.color, cmd.alpha);
      ctx.beginPath();
      ctx.moveTo(cmd.pts[0], cmd.pts[1]);
      for (let i = 2; i + 1 < cmd.pts.length; i += 2) ctx.lineTo(cmd.pts[i], cmd.pts[i + 1]);
      ctx.closePath();
      ctx.fill();
      break;
    case 'line':
      ctx.strokeStyle = hexToCss(cmd.color, cmd.alpha);
      ctx.lineWidth = Math.max(1, cmd.width);
      ctx.beginPath();
      ctx.moveTo(cmd.x1, cmd.y1);
      ctx.lineTo(cmd.x2, cmd.y2);
      ctx.stroke();
      break;
  }
}

function colorToHex(c: Color): number {
  const r = Math.round(c.r * 255) & 0xff;
  const g = Math.round(c.g * 255) & 0xff;
  const b = Math.round(c.b * 255) & 0xff;
  return (r << 16) | (g << 8) | b;
}

function hexToCss(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Размер изображения текстуры (three типизирует image как unknown). */
function textureSize(tex: THREE.Texture, fallbackW: number, fallbackH: number): { width: number; height: number } {
  const img = tex.image as { width?: number; height?: number } | undefined;
  return {
    width: img?.width ?? fallbackW,
    height: img?.height ?? fallbackH,
  };
}
