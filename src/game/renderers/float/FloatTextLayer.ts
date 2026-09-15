/* FloatTextLayer.ts — инкапсулирует addFloatText и updateFloatTexts
 *
 * Этап 6: заменён прямой импорт PixiJS (Container, Text, TextStyle)
 * на абстракцию IRenderer. Все UI-элементы управляются через UIElementHandle.
 */

import type { Container } from 'pixi.js';
import type { IRenderer, UIElementHandle, Vec2 } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import { logger } from '../../debug/logger';

/** Конфигурация стиля плавающего текста */
export interface FloatTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fill?: number;
  fontWeight?: string;
}

/** Внутренняя запись одного плавающего текстового элемента */
interface FloatingTextEntry {
  handle: UIElementHandle;
  pos: Vec2;
  baseAlpha: number;
}

export class FloatTextLayer {
  private renderer: IRenderer | null = null;
  private texts: FloatingTextEntry[] = [];

  /** Конструктор для legacy-совместимости (принимает Container, но игнорирует его) */
  constructor(_hintLayer?: Container) {
    // Container больше не используется — UI управляется через IRenderer
  }

  /** Инициализация с внедрением рендерера (DIP) */
  init(renderer: IRenderer): void {
    this.renderer = renderer;
  }

  /** Проверить, инициализирован ли слой */
  get isInit(): boolean {
    return this.renderer !== null;
  }

  /** Добавить плавающий текст */
  add(x: number, y: number, text: string, color: number, style: FloatTextStyle = {}): void {
    if (!this.renderer) {
      logger.warn('float-text', 'FloatTextLayer not initialized, skipping add');
      return;
    }

    const r = getRenderer();
    const handle = r.createText(text, {
      fontSize: style.fontSize ?? 4,
      color: style.fill ?? color,
      fontFamily: style.fontFamily ?? 'Arial',
    });

    r.setUIPosition(handle, { x, y });
    r.setUIAlpha(handle, 0.7);

    this.texts.push({
      handle,
      pos: { x, y },
      baseAlpha: 0.7,
    });
  }

  /** Обновить все плавающие тексты (анимация вверх + затухание) */
  update(dt: number): void {
    if (!this.renderer) return;

    const r = getRenderer();
    const toRemove: number[] = [];

    for (let i = 0; i < this.texts.length; i++) {
      const entry = this.texts[i];
      if (!entry) continue;

      // Движение вверх
      entry.pos.y -= 20 * dt;
      r.setUIPosition(entry.handle, entry.pos);

      // Затухание
      const currentAlpha = this.texts[i].baseAlpha - (this.texts[i].baseAlpha * (1 - 0) * dt) / 2;
      // Упрощённая модель: линейное затухание
      const newAlpha = Math.max(0, entry.baseAlpha - dt * 0.5);

      if (newAlpha <= 0) {
        r.destroyUIElement(entry.handle);
        toRemove.push(i);
      } else {
        r.setUIAlpha(entry.handle, newAlpha);
      }
    }

    // Удалить уничтоженные записи (в обратном порядке)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.texts.splice(toRemove[i], 1);
    }
  }

  /** Проверить, пуст ли слой */
  get isEmpty(): boolean {
    return this.texts.length === 0;
  }

  /** Очистить все плавающие тексты */
  clear(): void {
    const r = getRenderer();
    for (const entry of this.texts) {
      try {
        r.destroyUIElement(entry.handle);
      } catch {}
    }
    this.texts = [];
  }
}
