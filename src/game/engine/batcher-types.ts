/* batcher-types.ts — Типы для SpriteBatcher, PrimitiveBatcher и TextureManager */

import type REGL from 'regl';
import { SpriteBatcher } from './sprite-batcher.js';
import { PrimitiveBatcher } from './primitive-batcher.js';

// ============================================================
// TextureManager (заглушка для Этапа 2, полная реализация — Этап 3)
// ============================================================

/**
 * Менеджер текстур — загружает PNG-текстуры в GPU.
 *
 * Этап 2: заглушка — текстуры ещё не загружаются в GPU.
 * Этап 3: полная реализация с REGL.texture().
 */
export class TextureManager {
  private textures = new Map<string, REGL.Texture2D>();
  private idToName = new Map<number, string>();
  private nextId = 0;
  private regl: REGL.Regl | null = null;

  async load(name: string, _url: string): Promise<number> {
    // Этап 2: заглушка — текстуры ещё не загружаются в GPU
    this.idToName.set(this.nextId, name);
    return this.nextId++;
  }

  get(id: number): REGL.Texture2D | undefined {
    const name = this.idToName.get(id);
    return name ? this.textures.get(name) : undefined;
  }

  /** Задать regl-контекст (вызывается из RenderPipeline) */
  setRegl(regl: REGL.Regl): void {
    this.regl = regl;
  }

  /** Получить regl-контекст */
  getRegl(): REGL.Regl | null {
    return this.regl;
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
