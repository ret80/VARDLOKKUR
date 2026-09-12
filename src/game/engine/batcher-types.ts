/* batcher-types.ts — Типы для SpriteBatcher, PrimitiveBatcher и TextureManager */

import type REGL from 'regl';
import { SpriteBatcher } from './sprite-batcher.js';
import { PrimitiveBatcher } from './primitive-batcher.js';
import { logger } from '../debug/logger.js';

// ============================================================
// TextureManager — загрузка и кэширование PNG-текстур в GPU
// ============================================================

/**
 * Менеджер текстур — загружает PNG-текстуры в GPU через REGL.
 *
 * Этап 2: заглушка (текстуры не загружались в GPU).
 * Этап 3: полная реализация.
 *
 * Архитектура:
 * - load(name, url) — асинхронная загрузка PNG из URL, кэширование в GPU
 * - get(id) — получение текстуры по ID (возвращает REGL.Texture2D | undefined)
 * - getByName(name) — получение текстуры по имени
 * - getTextureInfo(tex) — получение { name, url } по REGL-текстуре (для обратного маппинга)
 * - delete(name) — удаление текстуры из GPU и кэша
 * - destroy() — освобождение всех текстур
 *
 * Пиксель-арт настройка:
 * - mag: 'nearest' — без сглаживания при увеличении
 * - min: 'nearest' — без сглаживания при уменьшении
 * - wrapS/W: 'clamp' — без повторения (tile не нужен, текстуры — целые спрайты)
 */
export class TextureManager {
  /** Карта имя → REGL-текстура */
  private textures = new Map<string, REGL.Texture2D>();
  /** Карта ID → имя текстуры (для обратного маппинга get(id)) */
  private idToName = new Map<number, string>();
  /** Карта URL → имя текстуры (для дедупликации по URL) */
  private urlToName = new Map<string, string>();
  /** Счётчик ID */
  private nextId = 0;
  /** Regl-контекст */
  private regl: REGL.Regl | null = null;

  /** Задать regl-контекст (вызывается из RenderPipeline/createBatchers) */
  setRegl(regl: REGL.Regl): void {
    this.regl = regl;
  }

  /** Получить regl-контекст */
  getRegl(): REGL.Regl | null {
    return this.regl;
  }

  /**
   * Асинхронно загрузить PNG-текстуру в GPU.
   *
   * @param name — уникальное имя текстуры (ключ в кэше)
   * @param url — URL PNG-файла
   * @returns ID текстуры (уникальный числовой идентификатор)
   *
   * Если текстура с таким именем уже загружена — возвращает существующий ID.
   * Если URL уже загружен под другим именем — создаёт алиас (shared texture).
   */
  async load(name: string, url: string): Promise<number> {
    // Уже загружена — возвращаем существующий ID
    if (this.textures.has(name)) {
      const existingId = [...this.idToName.entries()]
        .find(([, n]) => n === name)?.[0];
      if (existingId !== undefined) return existingId;
    }

    // URL уже загружен под другим именем — создаём алиас
    const existingName = this.urlToName.get(url);
    if (existingName && this.textures.has(existingName)) {
      const tex = this.textures.get(existingName)!;
      this.textures.set(name, tex);
      this.idToName.set(this.nextId, name);
      logger.debug('texture-manager', `Texture alias: "${name}" → "${existingName}" (url=${url})`);
      return this.nextId++;
    }

    // Ждём regl-контекст
    if (!this.regl) {
      logger.warn('texture-manager', `load() called before setRegl(), texture "${name}" will not be loaded into GPU`);
      // Регистрируем заглушку
      this.idToName.set(this.nextId, name);
      return this.nextId++;
    }

    return new Promise<number>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const tex = this.regl!.texture({
            data: img,
            width: img.width,
            height: img.height,
            mag: 'nearest' as const,
            min: 'nearest' as const,
            wrapS: 'clamp' as const,
            wrapT: 'clamp' as const,
          });

          this.textures.set(name, tex);
          this.urlToName.set(url, name);
          this.idToName.set(this.nextId, name);

          logger.debug('texture-manager', `Loaded texture: "${name}" (${img.width}x${img.height}, url=${url})`);
          resolve(this.nextId++);
        } catch (err) {
          logger.error('texture-manager', `Failed to load texture "${name}": ${err}`);
          this.idToName.set(this.nextId, name);
          resolve(this.nextId++);
        }
      };

      img.onerror = () => {
        logger.error('texture-manager', `Failed to load image: "${name}" (url=${url})`);
        this.idToName.set(this.nextId, name);
        resolve(this.nextId++);
      };

      img.src = url;
    });
  }

  /**
   * Получить REGL-текстуру по ID.
   */
  get(id: number): REGL.Texture2D | undefined {
    const name = this.idToName.get(id);
    return name ? this.textures.get(name) : undefined;
  }

  /**
   * Получить REGL-текстуру по имени.
   */
  getByName(name: string): REGL.Texture2D | undefined {
    return this.textures.get(name);
  }

  /**
   * Получить имя текстуры по ID.
   */
  getName(id: number): string | undefined {
    return this.idToName.get(id);
  }

  /**
   * Получить ID текстуры по имени.
   */
  getId(name: string): number | undefined {
    const entry = [...this.idToName.entries()].find(([, n]) => n === name);
    return entry?.[0];
  }

  /**
   * Удалить текстуру из GPU и кэша.
   */
  delete(name: string): void {
    const tex = this.textures.get(name);
    if (tex) {
      // REGL textures don't have a public dispose() in @types/regd
      // They are auto-cleaned when regl.destroy() is called
      this.textures.delete(name);
    }
    // Удаляем из idToName
    for (const [id, n] of this.idToName) {
      if (n === name) {
        this.idToName.delete(id);
        break;
      }
    }
    // Не удаляем из urlToName — текстура может быть алиасом
  }

  /**
   * Освободить все текстуры.
   */
  destroy(): void {
    this.textures.clear();
    this.idToName.clear();
    this.urlToName.clear();
    this.nextId = 0;
    logger.debug('texture-manager', 'TextureManager cleared (GPU textures cleaned by regl.destroy())');
  }

  /** Получить количество загруженных текстур */
  get count(): number {
    return this.textures.size;
  }
}

// ============================================================
// Batchers — единый интерфейс для доступа к обоим батчерам
// ============================================================

/**
 * Контейнер для доступа к обоим батчерам из рендереров.
 *
 * Используется в новой сигнатуре рендереров:
 *   render(batchers: Batchers, data: TData, ctx: RenderContext): void
 */
export interface Batchers {
  sprite: SpriteBatcher;
  primitive: PrimitiveBatcher;
  textureManager: TextureManager;
}

/** Factory для создания Batchers из regl-контекста */
export function createBatchers(regl: REGL.Regl): Batchers {
  const spriteBatcher = new SpriteBatcher(regl);
  const primitiveBatcher = new PrimitiveBatcher(regl);
  const textureManager = new TextureManager();
  textureManager.setRegl(regl);

  return {
    sprite: spriteBatcher,
    primitive: primitiveBatcher,
    textureManager,
  };
}
