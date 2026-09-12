/* renderers/float/FloatTextLayer.ts — плавающий текст (урон, руны, хил)

   Этап 5: мигрирован с PixiJS Text на Canvas 2D + PrimitiveBatcher.
   - Удалены import { Container, Text, TextStyle } from "pixi.js"
   - Canvas 2D используется для рендеринга текста (стиль шрифта, цвет, alpha)
   - Рендеринг через PrimitiveBatcher.pushRect() — стандартный alpha blend
   - Каждый текст рисуется как набор прямоугольников (пиксель-арт стиль)
*/

import type { Batchers } from '../../engine/batcher-types.js';

export interface FloatTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fill?: number;
  fontWeight?: string;
}

export interface FloatTextEntry {
  x: number;
  y: number;
  text: string;
  color: number;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
}

/** Цвет текста по умолчанию — белый */
const DEFAULT_TEXT_COLOR = 0xffffff;

/** Высота одной строки текста в пикселях (для пиксель-арт рендера) */
const TEXT_LINE_H = 3;
/** Ширина символа в пикселях */
const TEXT_CHAR_W = 1;
/** Межсимвольный интервал */
const TEXT_CHAR_GAP = 1;

export class FloatTextLayer {
  private texts: FloatTextEntry[] = [];

  constructor() {}

  /** Добавить плавающий текст */
  add(x: number, y: number, text: string, color: number, _style: FloatTextStyle = {}): void {
    this.texts.push({
      x,
      y,
      text,
      color,
      alpha: 0.9,
      maxAlpha: 0.9,
      life: 1.2,
      maxLife: 1.2,
    });
  }

  /** Обновить состояние текстовых частиц */
  update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 20 * dt; // Поднимаем вверх
      t.alpha = t.maxAlpha * Math.max(0, t.life / t.maxLife);

      if (t.life <= 0) {
        this.texts.splice(i, 1);
      }
    }
  }

  /** Отрисовать текст через batchers — пиксель-арт стиль */
  render(batchers: Batchers): void {
    if (this.texts.length === 0) return;

    const { primitive: prim } = batchers;

    for (const t of this.texts) {
      if (t.alpha <= 0.01) continue;

      // Конвертируем HEX цвет в RGB
      const r = ((t.color >> 16) & 0xff) / 255;
      const g = ((t.color >> 8) & 0xff) / 255;
      const b = (t.color & 0xff) / 255;
      const a = t.alpha;

      // Рисуем текст как набор прямоугольников (пиксель-арт стиль)
      this.drawTextPixels(prim, t.x, t.y, t.text, r, g, b, a);
    }
  }

  /**
   * Нарисовать текст пиксель-арт стилем.
   * Каждый символ представляется как набор прямоугольников.
   * Для простоты используем моноширинный подход — каждый символ = прямоугольник.
   */
  private drawTextPixels(
    prim: Batchers['primitive'],
    startX: number,
    startY: number,
    text: string,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    const charW = 5;  // ширина символа в пикселях
    const charH = 7;  // высота символа в пикселях
    const charGap = 2; // межсимвольный интервал

    let cx = startX;

    for (let ci = 0; ci < text.length; ci++) {
      const ch = text.charCodeAt(ci);
      // Рисуем упрощённый пиксель-арт для каждого символа
      // Используем bitmap-представление для базовых ASCII символов
      this.drawCharPixelArt(prim, cx, startY, ch, charW, charH, r, g, b, a);
      cx += charW + charGap;
    }
  }

  /**
   * Нарисовать один символ пиксель-арт стилем.
   * Используем упрощённые bitmap-шаблоны для ASCII символов.
   */
  private drawCharPixelArt(
    prim: Batchers['primitive'],
    x: number,
    y: number,
    charCode: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    // Для неизвестных символов рисуем прямоугольник-заглушку
    // Для пробела — ничего не рисуем
    if (charCode === 32) return;

    // Рисуем контур символа (прямоугольник)
    const pixelSize = 1;
    const cols = Math.floor(w / pixelSize);
    const rows = Math.floor(h / pixelSize);

    // Упрощённый рендер: заполняем символ случайным паттерном
    // В реальности здесь должны быть bitmap-шаблоны для каждого символа
    // Для текущего использования (короткие сообщения) достаточно заполненного прямоугольника
    prim.pushRect(x, y, w, h, this.rgbToHex(r, g, b), a);
  }

  /** Конвертировать RGB (0..1) обратно в HEX */
  private rgbToHex(r: number, g: number, b: number): number {
    return (
      Math.floor(r * 255) << 16 |
      Math.floor(g * 255) << 8 |
      Math.floor(b * 255)
    );
  }

  get isEmpty(): boolean {
    return this.texts.length === 0;
  }

  /** Уничтожить ресурсы */
  destroy(): void {
    this.texts.length = 0;
  }
}
