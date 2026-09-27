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
}
`;

// ============================================================
// Fragment shader — FBM noise + дыры у святилищ
// ============================================================

const FOG_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform float uPlayerPosX;
uniform float uPlayerPosY;
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

// ============================================================
// FBM noise (4 октавы) с дрейфом
// ============================================================

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

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
// Основной фрагментный шейдер
// ============================================================

void main(void) {
  vec2 uv = vTextureCoord;
  
  // --- 1. Базовый туман через FBM noise с дрейфом ---
  vec2 drifted = uv * 3.0 + uTime * 0.05;
  float fog = fbm(drifted);
  fog = fog * 0.6 + 0.2; // нормализуем в диапазон [0.2, 0.8]
  
  // --- 2. Радиальное затемнение от игрока ---
  float d = distance(vec2(uPlayerPosX, uPlayerPosY), uv);
  float radialFog = smoothstep(uFogRadius * 0.3, uFogRadius, d);
  fog = mix(fog, 1.0, radialFog * 0.5);
  
  // --- 3. Дыры у святилищ ---
  float shrineInfluence = 0.0;
  
  if (uShrineCount > 0.5) { float dist = distance(uv, uShrineUV0); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 1.5) { float dist = distance(uv, uShrineUV1); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 2.5) { float dist = distance(uv, uShrineUV2); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 3.5) { float dist = distance(uv, uShrineUV3); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 4.5) { float dist = distance(uv, uShrineUV4); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 5.5) { float dist = distance(uv, uShrineUV5); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 6.5) { float dist = distance(uv, uShrineUV6); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 7.5) { float dist = distance(uv, uShrineUV7); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 8.5) { float dist = distance(uv, uShrineUV8); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  if (uShrineCount > 9.5) { float dist = distance(uv, uShrineUV9); float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); shrineInfluence = max(shrineInfluence, shrineFog); }
  
  fog = mix(fog, 0.0, shrineInfluence);
  
  // --- 4. Цвет тумана с лёгкой пульсацией ---
  float pulse = sin(uTime * 0.3) * 0.03;
  vec3 fogColor = vec3(0.06 + pulse, 0.08 + pulse, 0.12);
  
  // --- 5. Итоговая альфа ---
  float alpha = fog * uFogAlpha;
  alpha = clamp(alpha, 0.0, 1.0);
  
  gl_FragColor = vec4(fogColor, alpha * 0.85);
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
  private _fogAlpha = 0;
  private _fogRadius = 2600;
  private _shrines: ShrineUV[] = [];
  private _shrineCount = 0;
  private _viewW = 640;
  private _viewH = 480;

  // Константы
  private readonly SHRINE_HOLE_RADIUS_UV = 0.05; // ~32 пикселя для экрана 640
  private readonly SHRINE_COUNT_MAX = 10;

  /** Инициализация FogRenderer */
  init(renderer: IRenderer): void {
    this._renderer = renderer;

    // Создаём шейдер тумана.
    // Униформы vec2 объявляются массивами из двух чисел — адаптер выведет тип.
    const shaderUniforms: Record<string, unknown> = {
      uTime: 0,
      uPlayerPosX: 0.5,
      uPlayerPosY: 0.5,
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
  }

  /** Получить рендерер */
  get renderer(): IRenderer {
    return this._renderer;
  }

  /** Включить/выключить туман */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (this._placeholder) {
      this._renderer.setGraphicsVisible(this._placeholder, enabled);
    }
  }

  /** Получить состояние тумана */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Установить плавную альфу тумана (0..1) — вызывается каждый кадр */
  setAlpha(alpha: number): void {
    this._fogAlpha = Math.max(0, Math.min(1, alpha));
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

    // Получаем физические размеры экрана из рендерера
    const screenSize = r.getScreenSize();
    const screenW = screenSize.w;
    const screenH = screenSize.h;

    // Конвертируем мировую позицию игрока в screen-space UV (0..1)
    // Используем физические размеры экрана, а не логические viewW/viewH
    const uvX = 0.5 + (playerPos.x - camPos.x) / screenW;
    const uvY = 0.5 + (playerPos.y - camPos.y) / screenH;

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
        // Screen-space: центр экрана = (0.5, 0.5)
        const sx = 0.5 + (this._shrines[i].x - camPos.x) / screenW;
        const sy = 0.5 + (this._shrines[i].y - camPos.y) / screenH;
        shrines.push({ x: sx, y: sy });
      } else {
        shrines.push({ x: 0, y: 0 });
      }
    }

    // Отладочное логирование — каждый кадр
    console.log('[fog:update] viewW=' + viewW + ' viewH=' + viewH + ' screenW=' + screenW + ' screenH=' + screenH + ' player=' + playerPos.x.toFixed(0) + ',' + playerPos.y.toFixed(0) + ' cam=' + camPos.x.toFixed(0) + ',' + camPos.y.toFixed(0) + ' playerUV=' + uvX.toFixed(3) + ',' + uvY.toFixed(3) + ' shrines=' + shrines.map(s => '(' + s.x.toFixed(3) + ',' + s.y.toFixed(3) + ')').join(', '));

    r.setShaderUniform(this._shader, 'uTime', time);
    r.setShaderUniform(this._shader, 'uPlayerPosX', uvX);
    r.setShaderUniform(this._shader, 'uPlayerPosY', uvY);
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
