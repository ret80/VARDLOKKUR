/* primitive-batcher.ts — Батчер для процедурной графики через Regl */

import REGL from 'regl';
import { logger } from '../debug/logger';
import primitiveVert from '../engine/shaders/primitive.vert?raw';
import primitiveFrag from '../engine/shaders/primitive.frag?raw';

// ============================================================
// Константы батчера
// ============================================================

/** Максимум вершин в одном батче (65K — хватает для большинства сцен) */
const MAX_VERTICES = 65536;

// ============================================================
// Утилиты для работы с цветом
// ============================================================

/**
 * Разложить hex-цвет (0xAABBGG) на r, g, b (0..1).
 * alpha передаётся отдельно.
 */
function colorToRgb(color: number, alpha: number): [number, number, number, number] {
  const r = (((color >> 16) & 0xff) / 255);
  const g = (((color >> 8) & 0xff) / 255);
  const b = ((color & 0xff) / 255);
  return [r, g, b, alpha];
}

// ============================================================
// PrimitiveBatcher
// ============================================================

/**
 * Батчер для процедурной графики.
 *
 * Заменяет Graphics из PixiJS для:
 * - Прямоугольников (px)
 * - Кругов/эллипсов (circ, ell)
 * - Обводок (ring)
 *
 * Вершинный формат: [x, y, r, g, b, a] (6 floats на вершину)
 *
 * Использование:
 *   const batcher = new PrimitiveBatcher(regl);
 *   batcher.pushRect(x, y, w, h, 0xc8822a, 1.0);
 *   batcher.pushCircle(cx, cy, r, 0xe8c979, 0.5, 12);
 *   batcher.flush(); // отправить на GPU
 */
export class PrimitiveBatcher {
  /** Массив позиций (x, y на вершину) */
  private positions = new Float32Array(MAX_VERTICES * 2);
  /** Массив цветов (r, g, b, a на вершину) */
  private colors = new Float32Array(MAX_VERTICES * 4);
  /** Текущее количество вершин */
  private vertexCount = 0;

  /** Текущий offset для translate (world → screen) */
  private _offsetX = 0;
  private _offsetY = 0;

  /**
   * Переиспользуемые GPU-буферы.
   *
   * ВАЖНО: regl на WebGL2 (VAO) НЕ поддерживает передачу нового Float32Array
   * в атрибутах при каждом вызове — это вызывает INVALID_OPERATION (1282).
   * Буферы создаются один раз и обновляются через buffer({data}).
   */
  private posBuf: REGL.Buffer;
  private colBuf: REGL.Buffer;

  /** REGL draw command */
  private drawCommand: REGL.DrawCommand | null = null;
  private regl: REGL.Regl;

  constructor(regl: REGL.Regl) {
    this.regl = regl;

    this.posBuf = regl.buffer({ data: this.positions, usage: 'dynamic' });
    this.colBuf = regl.buffer({ data: this.colors, usage: 'dynamic' });

    // Создаём draw command
    this.drawCommand = regl({
      vert: primitiveVert,
      frag: primitiveFrag,

      attributes: {
        a_position: { buffer: this.posBuf, size: 2 },
        a_color: { buffer: this.colBuf, size: 4 },
      },

      // ВАЖНО: count ДОЛЖЕН быть пропом. Статический count:0 в спеке
      // заставлял regl компилировать команду как no-op (ничего не рисовалось).
      count: (regl as any).prop('count'),

      uniforms: {
        u_projection: (regl as any).prop('proj'),
        u_view: (regl as any).prop('view'),
      },

      depth: { enable: false },
      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one',
        },
      },
    });

    logger.debug('primitive-batcher', `Created PrimitiveBatcher (MAX_VERTICES=${MAX_VERTICES})`);
  }

  // ── Примитивы ───────────────────────────────────────────────

  /**
   * Прямоугольник — замена px(g, x, y, w, h, color).
   *
   * 4 вершины (2 треугольника).
   */
  pushRect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    const [r, g, b, a] = colorToRgb(color, alpha);
    this.addQuad(
      x, y,
      x + w, y,
      x + w, y + h,
      x, y + h,
      r, g, b, a
    );
  }

  /**
   * Круг с заливкой — замена circ(g, x, y, r, c, a).
   *
   * Тесселяция в явные треугольники (fan → triangle list).
   *
   * @param cx, cy — центр
   * @param radius — радиус
   * @param color — цвет (hex)
   * @param alpha — альфа
   * @param segments — количество сегментов (по умолчанию 12)
   */
  pushCircle(cx: number, cy: number, radius: number, color: number, alpha = 1, segments = 12): void {
    const [r, g, b, a] = colorToRgb(color, alpha);

    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      this.addTriangle(
        cx, cy,
        cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius,
        cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius,
        r, g, b, a
      );
    }
  }

  /**
   * Эллипс с заливкой — замена ell(g, x, y, rw, rh, c, a).
   *
   * @param cx, cy — центр
   * @param rx — радиус по X
   * @param ry — радиус по Y
   * @param color — цвет (hex)
   * @param alpha — альфа
   */
  pushEllipse(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 1): void {
    const [r, g, b, a] = colorToRgb(color, alpha);
    const segments = 16;

    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      this.addTriangle(
        cx, cy,
        cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry,
        cx + Math.cos(a2) * rx, cy + Math.sin(a2) * ry,
        r, g, b, a
      );
    }
  }

  /**
    * Контур круга — замена ring(g, x, y, r, c, w, a).
    *
    * Кольцо (annulus): на каждый сегмент — квад из внешней и внутренней дуги,
    * разбитый на 2 треугольника.
    *
    * @param cx, cy — центр
    * @param radius — внешний радиус
    * @param width — ширина обводки
    * @param color — цвет (hex)
    * @param alpha — альфа
    */
   pushCircleStroke(cx: number, cy: number, radius: number, width: number, color: number, alpha = 1): void {
     const [r, g, b, a] = colorToRgb(color, alpha);
     const segments = 16;
     const innerR = Math.max(radius - width, 0);
     this.pushRing(cx, cy, radius, innerR, 0, Math.PI * 2, segments, r, g, b, a);
   }

   // ── Линии и полигоны (Этап 4) ──────────────────────────────

   /**
    * Линия с обводкой — замена g.moveTo().lineTo().stroke().
    * Рисуется как тонкий прямоугольник.
    *
    * @param x1, y1 — начало
    * @param x2, y2 — конец
    * @param color — цвет (hex)
    * @param alpha — альфа
    * @param width — ширина линии (по умолчанию 1)
    */
   pushLine(x1: number, y1: number, x2: number, y2: number, color: number, alpha = 1, width = 1): void {
     const [r, g, b, a] = colorToRgb(color, alpha);
     const dx = x2 - x1;
     const dy = y2 - y1;
     const len = Math.sqrt(dx * dx + dy * dy);
     if (len < 0.001) return;

     // Перпендикуляр для ширины линии
     const nx = (-dy / len) * (width / 2);
     const ny = (dx / len) * (width / 2);

     this.addQuad(
       x1 + nx, y1 + ny,
       x1 - nx, y1 - ny,
       x2 - nx, y2 - ny,
       x2 + nx, y2 + ny,
       r, g, b, a
     );
   }

   /**
    * Заполненный треугольник — замена g.moveTo().lineTo().lineTo().closePath().fill().
    *
    * @param x1, y1 — вершина 1
    * @param x2, y2 — вершина 2
    * @param x3, y3 — вершина 3
    * @param color — цвет (hex)
    * @param alpha — альфа
    */
   pushTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number, alpha = 1): void {
     const [r, g, b, a] = colorToRgb(color, alpha);
     this.addVertex(x1, y1, r, g, b, a);
     this.addVertex(x2, y2, r, g, b, a);
     this.addVertex(x3, y3, r, g, b, a);
   }

   /**
    * Дуга с обводкой — замена g.arc(...).stroke().
    *
    * @param cx, cy — центр
    * @param radius — радиус
    * @param startAngle — начальный угол (радианы)
    * @param endAngle — конечный угол (радианы)
    * @param color — цвет (hex)
    * @param width — ширина обводки
    * @param alpha — альфа
    * @param segments — количество сегментов (по умолчанию 12)
    */
   pushArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, color: number, width = 1, alpha = 1, segments = 12): void {
     const [r, g, b, a] = colorToRgb(color, alpha);
     const innerR = Math.max(radius - width, 0);

     const delta = endAngle - startAngle;
     const segCount = Math.max(2, Math.round(segments * Math.abs(delta) / (Math.PI * 2)));

     this.pushRing(cx, cy, radius, innerR, startAngle, delta, segCount, r, g, b, a);
   }

  // ── Flush / Clear ───────────────────────────────────────────

  /**
   * Отправить накопленные данные на GPU.
   */
  flush(proj?: { w: number; h: number }, view?: Float32Array): void {
    if (this.vertexCount === 0) return;

    if (!this.drawCommand) {
      logger.warn('primitive-batcher', 'flush() called before drawCommand created');
      return;
    }

    const vertCount = this.vertexCount;

    const viewMatrix = view || this.createDefaultViewMatrix();
    const projMatrix = proj
      ? this.createProjectionMatrix(proj.w, proj.h)
      : this.createDefaultProjectionMatrix();

    // Обновляем GPU-буферы (переиспользуемые — см. комментарий в конструкторе)
    this.posBuf({ data: this.positions.subarray(0, vertCount * 2) });
    this.colBuf({ data: this.colors.subarray(0, vertCount * 4) });

    this.drawCommand({
      count: vertCount,
      // ВАЖНО: regl.prop('proj') при одиночном вызове читает ключи ВЕРХНЕГО уровня args,
      // а не args.props (props работает только в batch-режиме)
      proj: projMatrix,
      view: viewMatrix,
    });

    // Сброс
    this.vertexCount = 0;
  }

  /** Очистить батч без отправки (для отмены) */
  clear(): void {
    this.vertexCount = 0;
  }

  /** Текущее количество вершин */
  get vertexCountCurrent(): number {
    return this.vertexCount;
  }

  // ── Внутренние методы ───────────────────────────────────────

  /**
   * Установить offset для translate.
   * Все последующие push-методы будут добавлять (offsetX, offsetY) к координатам.
   * Используется для world → screen: setOffset(worldX - camX, worldY - camY).
   */
  setOffset(x: number, y: number): void {
    this._offsetX = x;
    this._offsetY = y;
  }

  /** Сбросить offset в (0, 0) */
  resetOffset(): void {
    this._offsetX = 0;
    this._offsetY = 0;
  }

  private addVertex(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (this.vertexCount + 1 >= MAX_VERTICES) {
      this.flush(); // auto-flush при переполнении
    }

    const vi = this.vertexCount * 2;
    this.positions[vi] = x + this._offsetX;
    this.positions[vi + 1] = y + this._offsetY;

    const ci = this.vertexCount * 4;
    this.colors[ci] = r;
    this.colors[ci + 1] = g;
    this.colors[ci + 2] = b;
    this.colors[ci + 3] = a;

    this.vertexCount++;
  }

  private addQuad(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    r: number, g: number, b: number, a: number
  ): void {
    // Квад = 2 треугольника (triangle list): (0,1,2) и (0,2,3)
    this.addTriangle(x0, y0, x1, y1, x2, y2, r, g, b, a);
    this.addTriangle(x0, y0, x2, y2, x3, y3, r, g, b, a);
  }

  private addTriangle(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    r: number, g: number, b: number, a: number
  ): void {
    this.addVertex(x0, y0, r, g, b, a);
    this.addVertex(x1, y1, r, g, b, a);
    this.addVertex(x2, y2, r, g, b, a);
  }

  /**
   * Кольцо/дуга (annulus strip) → явные треугольники.
   * На каждый сегмент — квад (outer_i, outer_i+1, inner_i+1, inner_i) → 2 треугольника.
   */
  private pushRing(
    cx: number, cy: number,
    outerR: number, innerR: number,
    startAngle: number, delta: number,
    segments: number,
    r: number, g: number, b: number, a: number
  ): void {
    for (let i = 0; i < segments; i++) {
      const a1 = startAngle + (i / segments) * delta;
      const a2 = startAngle + ((i + 1) / segments) * delta;
      const ox1 = cx + Math.cos(a1) * outerR, oy1 = cy + Math.sin(a1) * outerR;
      const ox2 = cx + Math.cos(a2) * outerR, oy2 = cy + Math.sin(a2) * outerR;
      const ix1 = cx + Math.cos(a1) * innerR, iy1 = cy + Math.sin(a1) * innerR;
      const ix2 = cx + Math.cos(a2) * innerR, iy2 = cy + Math.sin(a2) * innerR;
      // Квад: ox1,oy1 → ox2,oy2 → ix2,iy2 → ix1,iy1
      this.addTriangle(ox1, oy1, ox2, oy2, ix2, iy2, r, g, b, a);
      this.addTriangle(ox1, oy1, ix2, iy2, ix1, iy1, r, g, b, a);
    }
  }

  // ── Утилиты матриц ──────────────────────────────────────────

  private createDefaultViewMatrix(): Float32Array {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  private createDefaultProjectionMatrix(): Float32Array {
    return this.createProjectionMatrix(1024, 768);
  }

  private createProjectionMatrix(w: number, h: number): Float32Array {
    // Ortho top-left origin (y вниз): x: 0..w → -1..1, y: 0..h → -1..1
    // y-масштаб отрицательный, ty = +1 (иначе изображение перевёрнуто)
    const rl = w;
    const tb = h;
    return new Float32Array([
      2 / rl, 0, 0, 0,
      0, -2 / tb, 0, 0,
      0, 0, -2 / 2000, 0,
      -1, 1, 0, 1,
    ]);
  }
}
