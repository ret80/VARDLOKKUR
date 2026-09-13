/* sprite-batcher.ts — Батчер для отрисовки PNG-спрайтов через Regl */

import REGL from 'regl';
import { logger } from '../debug/logger';
import spriteVert from '../engine/shaders/sprite.vert?raw';
import spriteFrag from '../engine/shaders/sprite.frag?raw';

// ============================================================
// Константы батчера
// ============================================================

/** Максимум квадов в одном батче */
const MAX_QUADS = 4096;
/** Максимум вершин = MAX_QUADS * 4 */
const MAX_VERTICES = MAX_QUADS * 4;
/** Максимум индексов = MAX_QUADS * 6 */
const MAX_INDICES = MAX_QUADS * 6;

// ============================================================
// Вершинный формат
// ============================================================

interface SpriteVertex {
  x: number;
  y: number;
  u: number;
  v: number;
  r: number;
  g: number;
  b: number;
  a: number;
  textureIndex: number;
}

// ============================================================
// SpriteBatcher
// ============================================================

/**
 * Батчер для отрисовки PNG-спрайтов.
 *
 * Собирает квады в Float32Array и отправляет единым draw call.
 * Поддерживает до 8 текстур через uniform sampler2D array.
 *
 * Использование:
 *   const batcher = new SpriteBatcher(regl);
 *   batcher.push(x, y, w, h, u0, v0, u1, v1, r, g, b, a, texIdx);
 *   batcher.flush(); // отправить на GPU
 */
export class SpriteBatcher {
  /** Массив позиций (x, y на вершину) */
  private positions = new Float32Array(MAX_VERTICES * 2);
  /** Массив UV (u, v на вершину) */
  private uvs = new Float32Array(MAX_VERTICES * 2);
  /** Массив цветов (r, g, b, a на вершину) */
  private colors = new Float32Array(MAX_VERTICES * 4);
  /** Массив индексов текстур */
  private texIndices = new Float32Array(MAX_VERTICES);
  /** Предвычисленные индексы для квадов */
  private indices = new Uint32Array(MAX_INDICES);
  /** GPU-буфер индексов */
  private elements: REGL.Buffer | null = null;
  /** Белая текстура-заглушка 1×1 для пустых слотов */
  private whiteTexture: REGL.Texture2D;
  /** Текущее количество вершин */
  private vertexCount = 0;
  /** Текущее количество индексов */
  private indexCount = 0;

  /** Текущий offset для translate (world → screen) */
  private _offsetX = 0;
  private _offsetY = 0;

  /**
   * Активные текстуры для следующего flush (до 8 слотов).
   * Задаются через setTextures(); по умолчанию — белые заглушки.
   */
  private activeTextures: (REGL.Texture2D | null)[] = [];

  /**
   * Переиспользуемые GPU-буферы.
   *
   * ВАЖНО: regl на WebGL2 (VAO) НЕ поддерживает передачу нового Float32Array
   * в атрибутах при каждом вызове — это вызывает INVALID_OPERATION (1282).
   */
  private posBuf: REGL.Buffer;
  private uvBuf: REGL.Buffer;
  private colBuf: REGL.Buffer;
  private texIdxBuf: REGL.Buffer;

  /** REGL draw command */
  private drawCommand: REGL.DrawCommand | null = null;
  private regl: REGL.Regl;

  constructor(regl: REGL.Regl) {
    this.regl = regl;

    // Белая текстура-заглушка 1×1 (для пустых слотов и pushRect без текстуры)
    this.whiteTexture = regl.texture({
      width: 1,
      height: 1,
      data: new Uint8Array([255, 255, 255, 255]),
      mag: 'nearest',
      min: 'nearest',
    });

    this.posBuf = regl.buffer({ data: this.positions, usage: 'dynamic' });
    this.uvBuf = regl.buffer({ data: this.uvs, usage: 'dynamic' });
    this.colBuf = regl.buffer({ data: this.colors, usage: 'dynamic' });
    this.texIdxBuf = regl.buffer({ data: this.texIndices, usage: 'dynamic' });

    // Предвычисление индексов для квадов (triangle strip → 2 triangle)
    for (let i = 0; i < MAX_QUADS; i++) {
      const off = i * 6;
      const v = i * 4;
      this.indices[off] = v;
      this.indices[off + 1] = v + 1;
      this.indices[off + 2] = v + 2;
      this.indices[off + 3] = v;
      this.indices[off + 4] = v + 2;
      this.indices[off + 5] = v + 3;
    }

    // Создаём GPU-буфер индексов (статический, переиспользуется)
    this.elements = regl.buffer({ data: this.indices, type: 'uint32', usage: 'static' });

    // Создаём draw command
    this.drawCommand = regl({
      vert: spriteVert,
      frag: spriteFrag,

      attributes: {
        a_position: { buffer: this.posBuf, size: 2 },
        a_uv: { buffer: this.uvBuf, size: 2 },
        a_color: { buffer: this.colBuf, size: 4 },
        a_textureIndex: { buffer: this.texIdxBuf, size: 1 },
      },

      // ВАЖНО: count ДОЛЖЕН быть пропом. Статический count:0 в спеке
      // заставлял regl компилировать команду как no-op (ничего не рисовалось).
      count: (regl as any).prop('count'),

      uniforms: {
        u_projection: (regl as any).prop('proj'),
        u_view: (regl as any).prop('view'),
        u_textures: (regl as any).prop('textures'),
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

    logger.debug('sprite-batcher', `Created SpriteBatcher (MAX_QUADS=${MAX_QUADS})`);
  }

  /**
   * Добавить квад в батч.
   *
   * @param x, y — позиция левого верхнего угла
   * @param w, h — ширина и высота
   * @param u0, v0 — UV левого верхнего угла
   * @param u1, v1 — UV правого нижнего угла
   * @param r, g, b — цвет (0..1)
   * @param a — альфа (0..1)
   * @param textureIndex — индекс текстуры (0..7)
   * @param angle — поворот в радианах (опционально)
   */
  push(
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    r: number,
    g: number,
    b: number,
    a: number,
    textureIndex: number,
    angle = 0
  ): void {
    if (this.vertexCount + 4 >= MAX_VERTICES) {
      this.flush();
    }

    // Вычисляем 4 вершины квада с учётом поворота
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = x + w / 2;
    const cy = y + h / 2;

    // Угловые смещения от центра
    const corners = [
      { dx: -w / 2, dy: -h / 2, u: u0, v: v0 }, // левый верх
      { dx: w / 2, dy: -h / 2, u: u1, v: v0 },  // правый верх
      { dx: w / 2, dy: h / 2, u: u1, v: v1 },    // правый низ
      { dx: -w / 2, dy: h / 2, u: u0, v: v1 },   // левый низ
    ];

    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      // Поворот + сдвиг к позиции
      const rx = cx + c.dx * cos - c.dy * sin;
      const ry = cy + c.dx * sin + c.dy * cos;

      const vi = this.vertexCount + i;
      this.positions[vi * 2] = rx + this._offsetX;
      this.positions[vi * 2 + 1] = ry + this._offsetY;
      this.uvs[vi * 2] = c.u;
      this.uvs[vi * 2 + 1] = c.v;
      this.colors[vi * 4] = r;
      this.colors[vi * 4 + 1] = g;
      this.colors[vi * 4 + 2] = b;
      this.colors[vi * 4 + 3] = a;
      this.texIndices[vi] = textureIndex;
    }

    this.vertexCount += 4;
    this.indexCount += 6;
  }

  /**
   * Добавить простой прямоугольник без UV (для fallback).
   */
  pushRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    a: number,
    textureIndex = 0
  ): void {
    this.push(x, y, w, h, 0, 0, 1, 1, r, g, b, a, textureIndex);
  }

  /**
   * Установить offset для translate (world → screen).
   * Все последующие push-методы добавляют (offsetX, offsetY) к координатам.
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

  /**
   * Задать активные текстуры для следующего flush (до 8 слотов).
   * Индекс в массиве = textureIndex в push().
   */
  setTextures(textures: (REGL.Texture2D | null)[]): void {
    this.activeTextures = textures;
  }

  /**
   * Отправить накопленные данные на GPU.
   */
  flush(proj?: { w: number; h: number }, view?: Float32Array): void {
    if (this.vertexCount === 0) return;

    if (!this.drawCommand) {
      logger.warn('sprite-batcher', 'flush() called before drawCommand created');
      return;
    }

    // Создаём view-матрицу по умолчанию, если не передана
    const viewMatrix = view || this.createDefaultViewMatrix();
    const projMatrix = proj
      ? this.createProjectionMatrix(proj.w, proj.h)
      : this.createDefaultProjectionMatrix();

    // Извлекаем подмассивы
    const vertCount = this.vertexCount;

    // Обновляем GPU-буферы (переиспользуемые — см. комментарий в конструкторе)
    this.posBuf({ data: this.positions.subarray(0, vertCount * 2) });
    this.uvBuf({ data: this.uvs.subarray(0, vertCount * 2) });
    this.colBuf({ data: this.colors.subarray(0, vertCount * 4) });
    this.texIdxBuf({ data: this.texIndices.subarray(0, vertCount) });

    // Собираем массив из ровно 8 текстур (шейдер ожидает u_textures[8]).
    // Пустые слоты заполняем первой валидной текстурой (или белой заглушкой),
    // чтобы regl не пытался биндить undefined.
    const firstValid = this.activeTextures.find((t) => t != null) ?? this.whiteTexture;
    const bound: REGL.Texture2D[] = [];
    for (let i = 0; i < 8; i++) {
      const t = this.activeTextures[i];
      bound.push(t ?? firstValid ?? (this.whiteTexture as REGL.Texture2D));
    }

    this.drawCommand({
      count: this.indexCount,
      elements: this.elements,
      // ВАЖНО: regl.prop при одиночном вызове читает ключи ВЕРХНЕГО уровня args
      proj: projMatrix,
      view: viewMatrix,
      textures: bound,
    });

    // Сброс
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  /** Очистить батч без отправки (для отмены) */
  clear(): void {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  /** Текущее количество вершин */
  get vertexCountCurrent(): number {
    return this.vertexCount;
  }

  // ── Утилиты матриц ──────────────────────────────────────────

  private createDefaultViewMatrix(): Float32Array {
    // Identity view matrix
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  private createDefaultProjectionMatrix(): Float32Array {
    // Orthographic projection 0..1024, 0..768
    return this.createProjectionMatrix(1024, 768);
  }

  private createProjectionMatrix(w: number, h: number): Float32Array {
    // Ortho top-left origin (y вниз): y-масштаб отрицательный, ty = +1
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
