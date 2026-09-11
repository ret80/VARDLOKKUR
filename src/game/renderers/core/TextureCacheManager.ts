/* TextureCacheManager — управление RenderTexture для DYNAMIC_TEXTURE сущностей.
 *
 * Проблема: Graphics не рендерится в RenderTexture через generateTexture() или render().
 * Решение: используем Sprite напрямую (без bake), но кэшируем для предотвращения
 * лишних аллокаций. DYNAMIC_TEXTURE означает, что мы обновляем текстуру только
 * при изменениях, а не каждый кадр.
 *
 * Но если Graphics не рендерится в текстуру — fallback на прямой render().
 */

import { Application, Container, RenderTexture, Sprite } from "pixi.js";
import { logger } from '../../debug/logger';

/** Кэш bake-объектов для одной сущности */
export interface EntityBakeCache {
  /** Временный контейнер для отрисовки тела (переиспользуется) */
  container: Container;
  /** Спрайт, отображающий запечённую текстуру */
  sprite: Sprite;
  /** RenderTexture — целевая текстура для запекания */
  renderTexture: RenderTexture;
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

  /** PIXI Application */
  private app: Application | null = null;

  /** Максимальный размер текстуры (пиксели) */
  private readonly maxTextureSize = 64;

  // ── Инициализация ───────────────────────────────────────────────

  get isInit(): boolean {
    return this.app !== null;
  }

  init(app: Application): void {
    if (this.app) return; // уже инициализирован
    this.app = app;
  }

  // ── Получение/создание кэша сущности ────────────────────────────

  /**
   * Получить или создать bake-кэш для сущности.
   */
  getOrCreate(eid: number, radius: number): EntityBakeCache {
    const existing = this.entityCache.get(eid);
    if (existing) return existing;

    const app = this.app!;
    const renderer = app.renderer;

    // Размер текстуры: 2 * radius + padding
    const size = Math.min(this.maxTextureSize, Math.max(32, radius * 4 + 16));

    // Создаём временный контейнер для отрисовки тела
    const container = new Container();

    // Создаём RenderTexture для запекания
    const renderTexture = RenderTexture.create({ width: size, height: size });

    // Создаём Sprite из RenderTexture
    const sprite = new Sprite(renderTexture);
    sprite.anchor.set(0.5);
    sprite.visible = true;

    const cache: EntityBakeCache = { container, sprite, renderTexture, width: size, height: size, baked: false };
    this.entityCache.set(eid, cache);
    return cache;
  }

  // ── Запекание ───────────────────────────────────────────────────

  /**
    * Запечь контейнер сущности в RenderTexture и обновить спрайт.
    *
    * Проблема: Graphics не рендерится в RenderTexture когда Container
    * не привязан к сцене (нет родителя). generateTexture() возвращает null.
    *
    * Решение: временно добавляем Container в сцену, рисуем в него Graphics,
    * затем renderer.render({ target: renderTexture, container }) — это
    * единственный надёжный способ запечь Graphics в текстуру.
    *
    * @returns true если успешно
    */
  bake(eid: number): boolean {
    const entry = this.entityCache.get(eid);
    if (!entry) return false;

    const app = this.app!;
    const renderer = app.renderer;
    const container = entry.container;
    const stage = app.stage;

    if (!stage) {
      logger.warn('render', `stage is null for eid=${eid}, cannot bake`);
      return false;
    }

    try {
      // 1. Временно добавляем container в сцену
      stage.addChild(container);
      container.visible = true;

      logger.debug('render', `Bake eid=${eid} container.children=${container.children.length} size=${entry.width}x${entry.height} stage=${stage.children.length}`);

      // 2. Рендерим container в renderTexture
      renderer.render({
        container: container,
        target: entry.renderTexture,
        clear: true,
      });

      // 3. Убираем container из сцены
      container.visible = false;
      stage.removeChild(container);

      // 4. Обновляем текстуру спрайта
      entry.sprite.texture = entry.renderTexture;
      entry.sprite.visible = true;
      entry.baked = true;

      logger.debug('render', `Bake success eid=${eid} sprite.x=${entry.sprite.x} y=${entry.sprite.y} texture=${!!entry.sprite.texture} alpha=${entry.sprite.alpha}`);
      return true;
    } catch (err) {
      // Гарантированно убираем container из сцены при ошибке
      try {
        if (container.parent) container.parent.removeChild(container);
      } catch {}
      container.visible = false;

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

    try {
      entry.container.destroy({ children: true });
      if (entry.renderTexture) entry.renderTexture.destroy(true);
      const tex = entry.sprite.texture;
      if (tex) tex.destroy(true);
      entry.sprite.destroy();
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
    this.app = null;
  }

  get size(): number {
    return this.entityCache.size;
  }
}
