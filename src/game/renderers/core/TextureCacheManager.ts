/* TextureCacheManager — управление RenderTexture для DYNAMIC_TEXTURE сущностей.
 *
 * Этап 6: заменён прямой импорт PixiJS (Application, Container, RenderTexture, Sprite)
 * на абстракцию IRenderer. Все ресурсы управляются через handles.
 *
 * Проблема: Graphics не рендерится в RenderTexture напрямую.
 * Решение: используем IRenderer.renderToTexture() для запекания.
 * DYNAMIC_TEXTURE означает, что текстура обновляется только при изменениях.
 */

import type {
  IRenderer,
  GraphicsHandle,
  TextureHandle,
  SpriteHandle,
} from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import { logger } from '../../debug/logger';

/** Кэш bake-объектов для одной сущности */
export interface EntityBakeCache {
  /** GraphicsHandle для отрисовки тела (переиспользуется) */
  graphics: GraphicsHandle;
  /** SpriteHandle, отображающий запечённую текстуру */
  sprite: SpriteHandle;
  /** TextureHandle — целевая текстура для запекания */
  texture: TextureHandle;
  /** Ширина текстуры */
  width: number;
  /** Высота текстуры */
  height: number;
  /** Флаг: успешно ли прошло последнее запекание */
  baked: boolean;
}

export class TextureCacheManager {
  private static _instance: TextureCacheManager | null = null;

  static get instance(): TextureCacheManager {
    if (!this._instance) {
      this._instance = new TextureCacheManager();
    }
    return this._instance;
  }

  /** Кэш bake-объектов по eid */
  private entityCache = new Map<number, EntityBakeCache>();

  /** IRenderer — внедряется через init() */
  private renderer: IRenderer | null = null;

  /** Максимальный размер текстуры (пиксели) */
  private readonly maxTextureSize = 64;

  // ── Инициализация ───────────────────────────────────────────────

  get isInit(): boolean {
    return this.renderer !== null;
  }

  /** Инициализация с внедрением рендерера (DIP) */
  init(renderer: IRenderer): void {
    if (this.renderer) return; // уже инициализирован
    this.renderer = renderer;
  }

  // ── Получение/создание кэша сущности ────────────────────────────

  /**
   * Получить или создать bake-кэш для сущности.
   * Создаёт: GraphicsHandle (для рисования), TextureHandle (для запекания),
   * SpriteHandle (для отображения запечённой текстуры).
   */
  getOrCreate(eid: number, radius: number): EntityBakeCache {
    const existing = this.entityCache.get(eid);
    if (existing) return existing;

    const r = this.renderer!;

    // Размер текстуры: 2 * radius + padding
    const size = Math.min(this.maxTextureSize, Math.max(32, radius * 4 + 16));

    // Создаём RenderTexture для запекания
    const texture = r.createRenderTexture(size, size);

    // Создаём Graphics для отрисовки тела
    const graphics = r.createGraphics();

    // Создаём Sprite из RenderTexture
    const sprite = r.createSprite({
      texture,
      anchor: { x: 0.5, y: 0.5 },
      visible: true,
    });

    const cache: EntityBakeCache = {
      graphics,
      sprite,
      texture,
      width: size,
      height: size,
      baked: false,
    };
    this.entityCache.set(eid, cache);
    return cache;
  }

  // ── Запекание ───────────────────────────────────────────────────

  /**
   * Запечь Graphics сущности в Texture и обновить спрайт.
   *
   * Использует IRenderer.renderToTexture() для запекания Graphics в RenderTexture.
   *
   * @returns true если успешно
   */
  bake(eid: number): boolean {
    const entry = this.entityCache.get(eid);
    if (!entry) return false;

    const r = this.renderer!;

    try {
      // Запекаем Graphics в RenderTexture через IRenderer
      r.renderToTexture(entry.texture, entry.graphics);

      // Спрайт уже использует эту текстуру (при создании был передан texture handle)
      entry.baked = true;

      // logger.debug('render', `Bake success eid=${eid} sprite visible=${entry.sprite} texture=${entry.texture}`);
      return true;
    } catch (err) {
      logger.warn('render', `Bake failed eid=${eid}: ${err}`);
      entry.baked = false;
      return false;
    }
  }

  /**
   * Проверить: может ли данный eid использовать baked Sprite.
   * Если bake не удался — fallback на Graphics.
   */
  canUseBaked(eid: number): boolean {
    const entry = this.entityCache.get(eid);
    return !!entry && entry.baked;
  }

  // ── Очистка ─────────────────────────────────────────────────────

  destroyEntity(eid: number): void {
    const entry = this.entityCache.get(eid);
    if (!entry) return;

    const r = this.renderer!;
    try {
      r.destroySprite(entry.sprite);
      r.destroyTexture(entry.texture);
      r.destroyGraphics(entry.graphics);
    } catch {}

    this.entityCache.delete(eid);
  }

  clearAll(): void {
    for (const eid of this.entityCache.keys()) {
      this.destroyEntity(eid);
    }
  }

  /** Уничтожить менеджер и освободить всю память */
  destroy(): void {
    this.clearAll();
    this.renderer = null;
  }

  get size(): number {
    return this.entityCache.size;
  }
}
