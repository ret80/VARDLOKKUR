/* primitive-batcher.ts — Батчер для процедурной графики через Regl */

import REGL from 'regl';
import { logger } from '../debug/logger';
import primitiveVert from '../engine/shaders/primitive.vert?raw';
import primitiveFrag from '../engine/shaders/primitive.frag?raw';

// ============================================================
// Константы батчера
// ============================================================

/** Размер вершины: x, y, r, g, b, a */
const VERTEX_SIZE = 6;
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
  /** Плоский массив вершин (INTERLEAVED: x,y,r,g,b,a) */
  private vertices = new Float32Array(MAX_VERTICES * VERTEX_SIZE);
  /** Текущее количество вершин */
  private vertexCount = 0;

  /** REGL draw command */
  private drawCommand: REGL.DrawCommand | null = null;
  private regl: REGL.Regl;

  constructor(regl: REGL.Regl) {
    this.regl = regl;

    // Создаём draw command
    this.drawCommand = regl({
      vert: primitiveVert,
      frag: primitiveFrag,

      attributes: {
        a_position: new Float32Array(0),
        a_color: new Float32Array(0),
      },

      count: 0,

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
   * Тесселяция в треугольники (triangle fan).
   *
   * @param cx, cy — центр
   * @param radius — радиус
   * @param color — цвет (hex)
   * @param alpha — альфа
   * @param segments — количество сегментов (по умолчанию 12)
   */
  pushCircle(cx: number, cy: number, radius: number, color: number, alpha = 1, segments = 12): void {
    const [r, g, b, a] = colorToRgb(color, alpha);

    // Центр
    this.addVertex(cx, cy, r, g, b, a);

    // Окружность
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      this.addVertex(x, y, r, g, b, a);
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

    // Центр
    this.addVertex(cx, cy, r, g, b, a);

    // Окружность с разными радиусами
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry;
      this.addVertex(x, y, r, g, b, a);
    }
  }

  /**
   * Контур круга — замена ring(g, x, y, r, c, w, a).
   *
   * Два концентрических круга с противоположной winding order.
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

    // Внешний круг (по часовой)
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      this.addVertex(x, y, r, g, b, a);
    }

    // Внутренний круг (против часовой — reverse winding)
    for (let i = segments; i >= 0; i--) {
      const angle = (i / segments) * Math.PI * 2;
      const x = cx + Math.cos(angle) * innerR;
      const y = cy + Math.sin(angle) * innerR;
      this.addVertex(x, y, r, g, b, a);
    }
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
    const vertData = this.vertices.subarray(0, vertCount * VERTEX_SIZE);

    const viewMatrix = view || this.createDefaultViewMatrix();
    const projMatrix = proj
      ? this.createProjectionMatrix(proj.w, proj.h)
      : this.createDefaultProjectionMatrix();

    this.drawCommand({
      attributes: {
        a_position: vertData.subarray(0, vertCount * 2),
        a_color: vertData.subarray(2, vertCount * 4 + 2),
      },
      count: vertCount,
      props: {
        proj: projMatrix,
        view: viewMatrix,
      },
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

  private addVertex(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (this.vertexCount + 1 >= MAX_VERTICES) {
      this.flush(); // auto-flush при переполнении
    }

    const vi = this.vertexCount * VERTEX_SIZE;
    this.vertices[vi + 0] = x; // x
    this.vertices[vi + 1] = y; // y
    this.vertices[vi + 2] = r; // r
    this.vertices[vi + 3] = g; // g
    this.vertices[vi + 4] = b; // b
    this.vertices[vi + 5] = a; // a

    this.vertexCount++;
  }

  private addQuad(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    r: number, g: number, b: number, a: number
  ): void {
    this.addVertex(x0, y0, r, g, b, a);
    this.addVertex(x1, y1, r, g, b, a);
    this.addVertex(x2, y2, r, g, b, a);
    this.addVertex(x3, y3, r, g, b, a);
  }

  // ── Утилиты матриц ──────────────────────────────────────────

  private createDefaultViewMatrix(): Float32Array {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  private createDefaultProjectionMatrix(): Float32Array {
    return this.createProjectionMatrix(1024, 768);
  }

  private createProjectionMatrix(w: number, h: number): Float32Array {
    const rl = w;
    const tb = h;
    return new Float32Array([
      2 / rl, 0, 0, 0,
      0, 2 / tb, 0, 0,
      0, 0, -2 / 2000, 0,
      -1, -1, 0, 1,
    ]);
  }
}
