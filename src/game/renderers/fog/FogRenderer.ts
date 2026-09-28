/* FogRenderer — шейдерная система рваного тумана через IRenderer */

import type { IRenderer, ShaderHandle, LayerHandle, GraphicsHandle } from '../../renderer/IRenderer';

// ============================================================
// Vertex shader (общий для всех screen-space эффектов)
// PixiJS v8: атрибут называется aPosition (0..1), положение
// в clip-space вычисляется через глобальные униформы фильтра.
// ============================================================

const FOG_VERTEX = `
attribute vec2 aPosition;
varying vec2 vTextureCoord;
varying vec2 vPosition;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  // vPosition — честные UV 0..1 fullscreen quad.
  // vTextureCoord = aPosition * (frame/source) сжат в 1/DPR раз на retina,
  // из-за чего UV мира/святилищ не совпадали с экраном (см. fix shrine offset).
  vPosition = aPosition;
}
`;

// ============================================================
// Fragment shader — domain warping + рваные дыры у святилищ
// ============================================================

const FOG_FRAGMENT = `
// highp: координаты шума (uv*3 + camOffset + time) быстро растут,
// mediump-квантование (~1e-3 относительная точность) "заморозило" бы анимацию.
precision highp float;

uniform float uTime;
uniform float uPlayerPosX;
uniform float uPlayerPosY;
// Смещение камеры (уже отмасштабировано в JS) — привязка узора тумана к миру
uniform float uCamOffsetX;
uniform float uCamOffsetY;
uniform float uFogAlpha;
uniform float uFogRadius;
uniform vec2 uShrineUV0;
uniform vec2 uShrineUV1;
uniform vec2 uShrineUV2;
uniform vec2 uShrineUV3;
uniform vec2 uShrineUV4;
uniform vec2 uShrineUV5;
uniform vec2 uShrineUV6;
uniform vec2 uShrineUV7;
uniform vec2 uShrineUV8;
uniform vec2 uShrineUV9;
uniform float uShrineCount;
uniform float uShrineHoleRadius;
uniform float uShrineTransitionUV;

varying vec2 vTextureCoord;
varying vec2 vPosition;

// ============================================================
// Smooth 2D noise (cubic interpolation)
// ============================================================

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  // Cubic smoothstep
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// ============================================================
// FBM (4 октавы) — база для domain warping и рваных краёв дыр
// ============================================================

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;

  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }

  return value;
}

// ============================================================
// Domain warping — клубящийся кусковой туман
// Координаты искажаются самим шумом: плотный перетекающий дым
// вместо равномерной статичной пелены.
// ============================================================

float billowingFog(vec2 p, float time) {
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0)),
    fbm(p + vec2(5.2, 1.3))
  );
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * time),
    fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.126 * time)
  );
  return fbm(p + 4.0 * r);
}

// ============================================================
// Плотность тумана держим в коридоре: нижний порог не даёт просветам
// превращаться в белое, верхний — не даёт гуще уходить в чёрное.
// FOG_OPACITY — общая непрозрачность слоя. Итоговая альфа считается
// честно (цвет пред-умножен), поэтому управляется именно этот множитель.
// ============================================================

const float FOG_MIN_DENSITY = 0.45;
const float FOG_MAX_DENSITY = 0.75;
const float FOG_OPACITY = 0.85;

// ============================================================
// Основной фрагментный шейдер
// ============================================================

void main(void) {
  // vPosition — это UV 0..1 fullscreen quad (экранное пространство).
  // Именно в этом пространстве JS считает UV игрока и святилищ
  // ((pos - cam) / view), поэтому дыра лежит ровно на святилище.
  vec2 uv = vPosition;

  // --- 1. Туман привязан к миру: скроллится вместе с камерой ---
  // uCamOffsetX/Y приходят из JS отмасштабированными (FOG_SCROLL_FACTOR).
  // Слагаемое uTime — клубение продолжается, когда игрок стоит на месте.
  vec2 p = uv * 3.0 + vec2(uCamOffsetX, uCamOffsetY) + uTime * 0.04;

  // --- 2. Клубящийся, кусковой туман ---
  float fog = billowingFog(p, uTime);
  // Контраст: плотные куски и просветы вместо равномерной дымки
  fog = smoothstep(0.2, 0.8, fog);

  // --- 3. Радиальное затемнение от игрока ---
  float d = distance(vec2(uPlayerPosX, uPlayerPosY), uv);
  float radialFog = smoothstep(uFogRadius * 0.3, uFogRadius, d);
  fog = mix(fog, 1.0, radialFog * 0.5);

  // --- 4. Дыры у святилищ с рваным, "плавающим" краем ---
  // Один fbm на пиксель ломает идеальную окружность; край колышется во времени.
  // Центрируем шум вокруг нуля: иначе искажение только раздувает дыру.
  float edgeDistortion = (fbm(uv * 12.0 + uTime * 0.4) - 0.5) * 0.05;
  float shrineInfluence = 0.0;

  if (uShrineCount > 0.5) { float dist = distance(uv, uShrineUV0) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 1.5) { float dist = distance(uv, uShrineUV1) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 2.5) { float dist = distance(uv, uShrineUV2) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 3.5) { float dist = distance(uv, uShrineUV3) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 4.5) { float dist = distance(uv, uShrineUV4) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 5.5) { float dist = distance(uv, uShrineUV5) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 6.5) { float dist = distance(uv, uShrineUV6) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 7.5) { float dist = distance(uv, uShrineUV7) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 8.5) { float dist = distance(uv, uShrineUV8) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 9.5) { float dist = distance(uv, uShrineUV9) + edgeDistortion; float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }

  // --- 5. Плотность тумана ---
  // Дыры святилищ вычитаем из плотности (а не из fog), чтобы они
  // оставались чистыми окнами даже при нижнем пороге плотности.
  float density = mix(FOG_MIN_DENSITY, FOG_MAX_DENSITY, fog);
  density = density * (1.0 - shrineInfluence);

  // --- 6. Цвет тумана: средний серый с лёгкой синевой, без пересвета ---
  float pulse = sin(uTime * 0.3) * 0.015;
  vec3 fogColor = vec3(0.40 + pulse, 0.42 + pulse, 0.48);

  // --- 7. Итоговая альфа: слой полупрозрачный, мир читается сквозь него ---
  float alpha = clamp(density * FOG_OPACITY * uFogAlpha, 0.0, 1.0);

  // PixiJS v8 composites filters with premultiplied alpha
  // (blendMap.normal = [ONE, ONE_MINUS_SRC_ALPHA]), so rgb MUST be
  // multiplied by alpha. Otherwise the fog color is added at full
  // strength even when alpha is 0 — a flat gray veil over the whole
  // screen while the fog is supposed to be off.
  gl_FragColor = vec4(fogColor * alpha, alpha);
}
`;

// ============================================================
// Интерфейсы
// ============================================================

/** UV-координата святилища (конвертирована из мировых координат) */
export interface ShrineUV {
  x: number;
  y: number;
}

// ============================================================
// FogRenderer
// ============================================================

/**
 * FogRenderer — шейдерный рендерер рваного тумана.
 *
 * Отвечает за:
 * - Создание слоя тумана (LayerHandle)
 * - Создание и управление шейдером тумана
 * - Обновление униформ (время, позиция игрока, альфа, радиус, святилища)
 *
 * Не зависит от PixiJS — использует IRenderer API.
 */
export class FogRenderer {
  private _renderer!: IRenderer;
  private _shader: ShaderHandle | null = null;
  private _fogLayer: LayerHandle | null = null;
  private _placeholder: GraphicsHandle | null = null;
  private _enabled = false;
  /** Текущее состояние видимости fullscreen quad (синхронизируется лениво) */
  private _quadVisible = true;
  private _fogAlpha = 0;
  private _fogRadius = 2600;
  private _shrines: ShrineUV[] = [];
  private _shrineCount = 0;
  private _viewW = 640;
  private _viewH = 480;

  // Константы
  private readonly SHRINE_HOLE_RADIUS_UV = 0.05; // ~32 пикселя для экрана 640
  private readonly SHRINE_COUNT_MAX = 10;
  /**
   * Скорость скроллинга тумана за камерой (параллакс-множитель мировых координат).
   * Заворачивать это значение по модулю НЕЛЬЗЯ: fbm не периодичен, и на стыке
   * периода узор резко телепортируется — виден скачок при движении игрока.
   */
  private readonly FOG_SCROLL_FACTOR = 0.002;

  /** Смещение тумана за камерой в единицах шума (highp-точность это терпит) */
  private scrollOffset(value: number): number {
    return value * this.FOG_SCROLL_FACTOR;
  }

  /** Инициализация FogRenderer */
  init(renderer: IRenderer): void {
    this._renderer = renderer;

    // Создаём шейдер тумана.
    // Униформы vec2 объявляются массивами из двух чисел — адаптер выведет тип.
    const shaderUniforms: Record<string, unknown> = {
      uTime: 0,
      uPlayerPosX: 0.5,
      uPlayerPosY: 0.5,
      // Смещение камеры для скроллинга тумана вместе с миром
      uCamOffsetX: 0,
      uCamOffsetY: 0,
      uFogAlpha: 0,
      uFogRadius: 1.0,
      uShrineCount: 0,
      uShrineHoleRadius: this.SHRINE_HOLE_RADIUS_UV,
      uShrineTransitionUV: 0.02,
    };
    for (let i = 0; i < this.SHRINE_COUNT_MAX; i++) {
      shaderUniforms[`uShrineUV${i}`] = [0, 0];
    }

    this._shader = renderer.createShader(FOG_VERTEX, FOG_FRAGMENT, shaderUniforms);

    // Создаём fullscreen quad для screen-space fog filter
    this._placeholder = renderer.createFullscreenQuad();
    renderer.applyFilterToQuad(this._placeholder, this._shader);

    // Создаём placeholder layer для совместимости с setEnabled
    this._fogLayer = renderer.createLayer('fog', 65);

    this._enabled = true;
    // На старте альфа тумана равна 0 — quad должен быть скрыт сразу,
    // иначе filter отрисуется поверх мира до первого update().
    this._quadVisible = true;
    this._syncVisibility();
  }

  /** Получить рендерер */
  get renderer(): IRenderer {
    return this._renderer;
  }

  /** Включить/выключить туман */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this._syncVisibility();
  }

  /**
   * Скрыть/показать fullscreen quad: когда альфа тумана практически нулевая,
   * слой не должен участвовать в рендере вовсе.
   * Порог, а не строгое "> 0": fogState.fogAlpha интерполируется
   * экспоненциально (alpha += (target - alpha) * k) и к нулю стремится
   * асимптотически — с точным сравнением quad остался бы видимым навсегда
   * с еле заметной пеленой.
   */
  private _syncVisibility(): void {
    if (!this._placeholder) return;
    const visible = this._enabled && this._fogAlpha > 0.004;
    if (visible === this._quadVisible) return;
    this._quadVisible = visible;
    this._renderer.setGraphicsVisible(this._placeholder, visible);
  }

  /** Получить состояние тумана */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Установить плавную альфу тумана (0..1) — вызывается каждый кадр */
  setAlpha(alpha: number): void {
    this._fogAlpha = Math.max(0, Math.min(1, alpha));
    // Альфа стала нулевой — quad нужно сразу спрятать, не дожидаясь update().
    this._syncVisibility();
  }
  /** Установить радиус тумана (world units) */
  setRadius(radius: number): void {
    this._fogRadius = Math.max(0, radius);
  }

  /** Установить позиции святилищ (мировые координаты) */
  setShrines(shrines: ShrineUV[]): void {
    let count = 0;
    for (const s of shrines) {
      if (count >= this.SHRINE_COUNT_MAX) break;
      this._shrines[count] = s;
      count++;
    }
    this._shrineCount = count;
  }

  /**
   * Обновить шейдер — вызывается каждый кадр.
   * @param time — время в секундах
   * @param playerPos — позиция игрока в мировых координатах
   * @param camPos — позиция камеры в мировых координатах
   * @param viewW — ширина viewport
   * @param viewH — высота viewport
   */
  update(time: number, playerPos: { x: number; y: number }, camPos: { x: number; y: number }, viewW: number, viewH: number): void {
    if (!this._shader || !this._enabled) return;

    const r = this._renderer;
    this._viewW = viewW;
    this._viewH = viewH;

    // Состояние видимости синхронизируем, но uniform'ы обновляем ВСЕГДА:
    // ранний выход при скрытом quad оставил бы uFogAlpha замершим на нуле,
    // и туман не проявился бы даже после включения альфы.
    this._syncVisibility();

    // Конвертируем мировую позицию игрока в UV-пространство шейдера (0..1)
    // camPos — левый верхний угол viewport (world units), viewW/viewH — размеры viewport в тех же единицах
    const uvX = (playerPos.x - camPos.x) / viewW;
    const uvY = (playerPos.y - camPos.y) / viewH;

    // Нормализуем радиус тумана относительно viewport
    const normalizedRadius = Math.min(viewW, viewH) > 0
      ? (this._fogRadius / Math.min(viewW, viewH))
      : 1.0;

    // Ширина перехода у святилищ в UV-координатах
    const transitionUV = 0.05;

    // Конвертируем мировые координаты святилищ в screen-space UV (0..1)
    const shrines: { x: number; y: number }[] = [];
    for (let i = 0; i < this.SHRINE_COUNT_MAX; i++) {
      if (i < this._shrineCount) {
        // UV-пространство шейдера: (0,0) = левый верхний угол viewport, (1,1) = правый нижний
        const sx = (this._shrines[i].x - camPos.x) / viewW;
        const sy = (this._shrines[i].y - camPos.y) / viewH;
        shrines.push({ x: sx, y: sy });
      } else {
        shrines.push({ x: 0, y: 0 });
      }
    }

    r.setShaderUniform(this._shader, 'uTime', time);
    r.setShaderUniform(this._shader, 'uPlayerPosX', uvX);
    r.setShaderUniform(this._shader, 'uPlayerPosY', uvY);
    // Туман привязан к миру: узор скроллится вместе с камерой.
    // Масштаб и "ворот" считаются в JS — в шейдере униформы остаются маленькими.
    r.setShaderUniform(this._shader, 'uCamOffsetX', this.scrollOffset(camPos.x));
    r.setShaderUniform(this._shader, 'uCamOffsetY', this.scrollOffset(camPos.y));
    r.setShaderUniform(this._shader, 'uFogAlpha', this._fogAlpha);
    r.setShaderUniform(this._shader, 'uFogRadius', normalizedRadius);
    for (let i = 0; i < 10; i++) {
      r.setShaderUniform(this._shader, `uShrineUV${i}`, [shrines[i].x, shrines[i].y]);
    }
    r.setShaderUniform(this._shader, 'uShrineCount', this._shrineCount);
    r.setShaderUniform(this._shader, 'uShrineTransitionUV', transitionUV);
  }

  /** Уничтожить FogRenderer и освободить ресурсы */
  destroy(): void {
    if (this._placeholder) {
      this._renderer.destroyGraphics(this._placeholder);
      this._placeholder = null;
    }
    if (this._shader) {
      this._renderer.destroyShader(this._shader);
      this._shader = null;
    }
    if (this._fogLayer) {
      this._fogLayer = null;
    }
    this._enabled = false;
  }
}
