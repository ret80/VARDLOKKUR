/* FogRenderer — шейдерная система тумана через IRenderer */

import type { IRenderer, ShaderHandle, LayerHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import { logger } from '../../debug/logger';

/** Vertex shader для тумана (screen-space) */
const FOG_VERTEX = `
attribute vec2 aVertexPosition;
varying vec2 vTextureCoord;
void main(void) {
  gl_Position = vec4(aVertexPosition, 0.0, 1.0);
  vTextureCoord = aVertexPosition * 0.5 + 0.5;
}
`;

/** Fragment shader для тумана — радиальное затемнение от игрока */
const FOG_FRAGMENT = `
uniform float uTime;
uniform vec2 uPlayerPos;
uniform float uFogIntensity;
uniform float uFogRadius;
varying vec2 vTextureCoord;

void main(void) {
  // Нормализованные координаты (0..1)
  vec2 uv = vTextureCoord;
  
  // Расстояние до игрока в UV-координатах
  float d = distance(uv, uPlayerPos);
  
  // Радиальный туман: ближе к игроку — прозрачнее, дальше — плотнее
  float fog = smoothstep(uFogRadius * 0.3, uFogRadius, d);
  fog = clamp(fog * uFogIntensity, 0.0, 1.0);
  
  // Тёмно-синий туман с лёгкой анимацией
  float pulse = sin(uTime * 0.5) * 0.05;
  vec3 fogColor = vec3(0.06 + pulse, 0.08 + pulse, 0.12);
  
  gl_FragColor = vec4(fogColor, fog * 0.85);
}
`;

/**
 * FogRenderer — шейдерный рендерер тумана.
 *
 * Отвечает за:
 * - Создание слоя тумана (LayerHandle)
 * - Создание и управление шейдером тумана
 * - Обновление униформ (время, позиция игрока, интенсивность)
 *
 * Не зависит от PixiJS — использует IRenderer API.
 */
export class FogRenderer {
  private _renderer!: IRenderer;
  private _shader: ShaderHandle | null = null;
  private _fogLayer: LayerHandle | null = null;
  private _enabled = false;
  private _intensity = 0;
  private _radius = 2600;

  /** Инициализация FogRenderer */
  init(renderer: IRenderer): void {
    this._renderer = renderer;

    // Создаём слой тумана (поверх мира, под UI)
    this._fogLayer = renderer.createLayer('fog', 65);

    // Создаём шейдер тумана
    this._shader = renderer.createShader(FOG_VERTEX, FOG_FRAGMENT, {
      uTime: 0,
      uPlayerPos: [0.5, 0.5],
      uFogIntensity: 0,
      uFogRadius: 1.0,
    });

    // Применяем шейдер к слою тумана
    renderer.applyShaderToLayer(this._fogLayer, this._shader);

    this._enabled = true;
    logger.info('fog-renderer', 'FogRenderer initialized');
  }

  /** Получить рендерер */
  get renderer(): IRenderer {
    return this._renderer;
  }

  /** Включить/выключить туман */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (this._fogLayer) {
      this._renderer.setLayerVisible(this._fogLayer, enabled);
    }
  }

  /** Получить состояние тумана */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Установить интенсивность тумана (0..1) */
  setIntensity(intensity: number): void {
    this._intensity = Math.max(0, Math.min(1, intensity));
  }

  /** Установить радиус тумана (world units) */
  setRadius(radius: number): void {
    this._radius = Math.max(0, radius);
  }

  /**
   * Обновить шейдер — вызывается каждый кадр.
   * @param time — время в секундах
   * @param playerPos — позиция игрока в мировых координатах
   * @param viewW — ширина viewport
   * @param viewH — высота viewport
   */
  update(time: number, playerPos: { x: number; y: number }, viewW: number, viewH: number): void {
    if (!this._shader || !this._enabled) return;

    const r = this._renderer;

    // Конвертируем мировую позицию игрока в UV-координаты (0..1)
    const uvX = playerPos.x / viewW;
    const uvY = 1.0 - playerPos.y / viewH; // инвертируем Y для UV

    // Нормализуем радиус тумана относительно viewport
    const normalizedRadius = Math.min(viewW, viewH) > 0
      ? (this._radius / Math.min(viewW, viewH))
      : 0.5;

    r.setShaderUniform(this._shader, 'uTime', time);
    r.setShaderUniform(this._shader, 'uPlayerPos', [uvX, uvY]);
    r.setShaderUniform(this._shader, 'uFogIntensity', this._intensity);
    r.setShaderUniform(this._shader, 'uFogRadius', normalizedRadius);
  }

  /** Уничтожить FogRenderer и освободить ресурсы */
  destroy(): void {
    if (this._shader) {
      this._renderer.destroyShader(this._shader);
      this._shader = null;
    }
    if (this._fogLayer) {
      this._fogLayer = null;
    }
    this._enabled = false;
    logger.info('fog-renderer', 'FogRenderer destroyed');
  }
}
