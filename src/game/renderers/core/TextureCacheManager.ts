/* TextureCacheManager — управление RenderTexture для DYNAMIC_TEXTURE сущностей.

   @deprecated Этап 4: удалён. Больше не используется.
   Все рендереры теперь рисуют напрямую через PrimitiveBatcher / SpriteBatcher.
   DYNAMIC_TEXTURE стратегия больше не применяется.
   
   Этап 6: все PixiJS зависимости удалены. Класс полностью заглушён.
*/

/** Кэш bake-объектов для одной сущности (Этап 6: все типы заменены на unknown) */
export interface EntityBakeCache {
  container: unknown;
  sprite: unknown;
  renderTexture: unknown;
  width: number;
  height: number;
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

  private entityCache = new Map<number, EntityBakeCache>();
  private app: unknown = null;
  private readonly maxTextureSize = 64;

  get isInit(): boolean {
    return this.app !== null;
  }

  init(_app: unknown): void {
    if (this.app) return;
    this.app = _app;
  }

  getOrCreate(_eid: number, _radius: number): EntityBakeCache {
    // Этап 6: заглушка — TextureCacheManager больше не используется
    return { container: null, sprite: null, renderTexture: null, width: 32, height: 32, baked: false };
  }

  /**
   * Запечь контейнер сущности в RenderTexture.
   * Этап 6: заглушка — больше не используется.
   */
  bake(_eid: number): boolean {
    return false;
  }

  /**
   * Проверить: может ли данный eid использовать baked Sprite.
   * Этап 6: всегда false.
   */
  canUseBaked(_eid: number): boolean {
    return false;
  }

  destroyEntity(_eid: number): void {
    this.entityCache.delete(_eid);
  }

  clearAll(): void {
    this.entityCache.clear();
  }

  /** Уничтожить менеджер и освободить всю память */
  destroy(): void {
    this.clearAll();
    this.app = null;
  }

  get size(): number {
    return this.entityCache.size;
  }
}
