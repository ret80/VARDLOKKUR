Я изучил текущую реализацию тумана в вашем репозитории `VARDLOKKUR`. Текущий шейдер использует базовый FBM-шум и идеальные круги (`distance` + `smoothstep`) для отверстий святилищ, что делает его статичным и "пластиковым".

Ниже представлено готовое решение, которое реализует все ваши требования:
1. **Клубящийся и "кусковой" туман**: Использован продвинутый прием **Domain Warping** (искажение области шумом), который создает эффект густого, органично перетекающего дыма.
2. **Непрерывная анимация**: Туман клубится всегда, даже когда игрок стоит на месте, за счет зависимости от `uTime`.
3. **Скроллинг при движении**: Добавлены координаты камеры (`uCamOffsetX/Y`), чтобы туман был привязан к игровому миру, а не к экрану. При движении игрока влево/вправо туман закономерно смещается (параллакс-эффект).
4. **Рваные, плавающие края отверстий** *(предполагаю, что "русский край" — это опечатка от "рваный край")*: Вместо чистого расстояния до святилища добавляется шумовое искажение, из-за чего граница отверстия становится неровной и плавно анимируется во времени.

### Полный код для замены: `src/game/renderers/fog/FogRenderer.ts`

Полностью замените содержимое этого файла на следующий код:

```typescript
/* FogRenderer — шейдерная система рваного, клубящегося тумана через IRenderer */

import type { IRenderer, ShaderHandle, LayerHandle, GraphicsHandle } from '../../renderer/IRenderer';

// ============================================================
// Vertex shader (общий для всех screen-space эффектов)
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
// Fragment shader — Domain Warping + рваные дыры у святилищ
// ============================================================

const FOG_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform float uPlayerPosX;
uniform float uPlayerPosY;
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

// ============================================================
// Базовый FBM noise (4 октавы)
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
// Domain Warping для клубящегося, "кускового" тумана
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
// Основной фрагментный шейдер
// ============================================================

void main(void) {
  vec2 uv = vTextureCoord;
  
  // Оптимизация: вычисляем искажение края один раз на пиксель.
  // Это делает границу отверстия неровной и плавно анимированной ("плавающей").
  float edgeDistortion = fbm(uv * 12.0 + uTime * 0.4) * 0.025;

  // --- 1. Скроллинг тумана: привязка к миру ---
  // Добавляем смещение камеры, чтобы туман был частью мира. 
  // Множитель 0.002 регулирует скорость скроллинга (параллакс). 
  // Если игрок идет влево, камера смещается, и туман скроллится вместе с миром.
  vec2 worldOffset = vec2(uCamOffsetX * 0.002, uCamOffsetY * 0.002);
  vec2 p = uv * 3.0 + worldOffset + uTime * 0.04;
  
  // --- 2. Клубящийся, кусковой туман ---
  float fog = billowingFog(p, uTime);
  
  // Делаем туман более контрастным, чтобы он выглядел плотными "кусками", а не равномерной дымкой
  fog = smoothstep(0.2, 0.8, fog);
  
  // --- 3. Радиальное затемнение от игрока (логика сохранена) ---
  float d = distance(vec2(uPlayerPosX, uPlayerPosY), uv);
  float radialFog = smoothstep(uFogRadius * 0.3, uFogRadius, d);
  fog = mix(fog, 1.0, radialFog * 0.5);
  
  // --- 4. Дыры у святилищ с рваными, плавающими краями ---
  float shrineInfluence = 0.0;
  
  // Добавляем edgeDistortion к расстоянию, чтобы разрушить идеальную круглую форму
  if (uShrineCount > 0.5) { 
    float dist = distance(uv, uShrineUV0) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 1.5) { 
    float dist = distance(uv, uShrineUV1) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 2.5) { 
    float dist = distance(uv, uShrineUV2) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 3.5) { 
    float dist = distance(uv, uShrineUV3) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 4.5) { 
    float dist = distance(uv, uShrineUV4) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 5.5) { 
    float dist = distance(uv, uShrineUV5) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 6.5) { 
    float dist = distance(uv, uShrineUV6) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 7.5) { 
    float dist = distance(uv, uShrineUV7) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 8.5) { 
    float dist = distance(uv, uShrineUV8) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  if (uShrineCount > 9.5) { 
    float dist = distance(uv, uShrineUV9) + edgeDistortion; 
    float shrineFog = 1.0 - smoothstep(uShrineHoleRadius, uShrineHoleRadius + uShrineTransitionUV, dist); 
    shrineInfluence = max(shrineInfluence, shrineFog); 
  }
  
  fog = mix(fog, 0.0, shrineInfluence);
  
  // --- 5. Цвет тумана с лёгкой пульсацией ---
  float pulse = sin(uTime * 0.3) * 0.03;
  vec3 fogColor = vec3(0.06 + pulse, 0.08 + pulse, 0.12);
  
  // --- 6. Итоговая альфа ---
  float alpha = fog * uFogAlpha;
  alpha = clamp(alpha, 0.0, 1.0);
  
  gl_FragColor = vec4(fogColor, alpha * 0.85);
}
`;

// ============================================================
// Интерфейсы и класс
// ============================================================

export interface ShrineUV {
  x: number;
  y: number;
}

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

  private readonly SHRINE_HOLE_RADIUS_UV = 0.05;
  private readonly SHRINE_COUNT_MAX = 10;

  init(renderer: IRenderer): void {
    this._renderer = renderer;

    // Добавлены uCamOffsetX и uCamOffsetY для скроллинга
    const shaderUniforms: Record<string, unknown> = {
      uTime: 0,
      uPlayerPosX: 0.5,
      uPlayerPosY: 0.5,
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
    this._placeholder = renderer.createFullscreenQuad();
    renderer.applyFilterToQuad(this._placeholder, this._shader);
    this._fogLayer = renderer.createLayer('fog', 65);
    this._enabled = true;
  }

  get renderer(): IRenderer {
    return this._renderer;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (this._placeholder) {
      this._renderer.setGraphicsVisible(this._placeholder, enabled);
    }
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setAlpha(alpha: number): void {
    this._fogAlpha = Math.max(0, Math.min(1, alpha));
  }

  setRadius(radius: number): void {
    this._fogRadius = Math.max(0, radius);
  }

  setShrines(shrines: ShrineUV[]): void {
    let count = 0;
    for (const s of shrines) {
      if (count >= this.SHRINE_COUNT_MAX) break;
      this._shrines[count] = s;
      count++;
    }
    this._shrineCount = count;
  }

  update(time: number, playerPos: { x: number; y: number }, camPos: { x: number; y: number }, viewW: number, viewH: number): void {
    if (!this._shader || !this._enabled) return;

    const r = this._renderer;
    this._viewW = viewW;
    this._viewH = viewH;

    const screenSize = r.getScreenSize();
    const screenW = screenSize.w;
    const screenH = screenSize.h;

    const uvX = 0.5 + (playerPos.x - camPos.x) / screenW;
    const uvY = 0.5 + (playerPos.y - camPos.y) / screenH;

    const normalizedRadius = Math.min(viewW, viewH) > 0
      ? (this._fogRadius / Math.min(viewW, viewH))
      : 1.0;

    const transitionUV = 0.05;

    const shrines: { x: number; y: number }[] = [];
    for (let i = 0; i < this.SHRINE_COUNT_MAX; i++) {
      if (i < this._shrineCount) {
        const sx = 0.5 + (this._shrines[i].x - camPos.x) / screenW;
        const sy = 0.5 + (this._shrines[i].y - camPos.y) / screenH;
        shrines.push({ x: sx, y: sy });
      } else {
        shrines.push({ x: 0, y: 0 });
      }
    }

    r.setShaderUniform(this._shader, 'uTime', time);
    r.setShaderUniform(this._shader, 'uPlayerPosX', uvX);
    r.setShaderUniform(this._shader, 'uPlayerPosY', uvY);
    // Передаем координаты камеры для скроллинга тумана в мировом пространстве
    r.setShaderUniform(this._shader, 'uCamOffsetX', camPos.x);
    r.setShaderUniform(this._shader, 'uCamOffsetY', camPos.y);
    r.setShaderUniform(this._shader, 'uFogAlpha', this._fogAlpha);
    r.setShaderUniform(this._shader, 'uFogRadius', normalizedRadius);
    for (let i = 0; i < 10; i++) {
      r.setShaderUniform(this._shader, `uShrineUV${i}`, [shrines[i].x, shrines[i].y]);
    }
    r.setShaderUniform(this._shader, 'uShrineCount', this._shrineCount);
    r.setShaderUniform(this._shader, 'uShrineTransitionUV', transitionUV);
  }

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
```

### Ключевые изменения и почему это работает:

1. **Функция `billowingFog` (Domain Warping)**: Вместо простого наложения шума, координаты искажаются самим шумом (`fbm(p + 4.0 * q...)`). Это стандартный прием в шейдерной графике для имитации жидкостей, дыма и густого тумана. Туман становится "кусковым" и постоянно перетекает.
2. **`worldOffset` на основе `camPos`**: Добавив координаты камеры в расчет UV-развертки, мы привязываем текстуру шума к игровому миру. Когда игрок идет влево, камера смещается, и паттерн тумана скроллится в противоположном направлении на экране, создавая полное ощущение, что туман находится в мире, а не приклеен к монитору.
3. **`edgeDistortion`**: Вычисляется один раз на пиксель (`fbm(uv * 12.0 + uTime * 0.4) * 0.025`) и прибавляется к дистанции до святилища. Это ломает идеальную окружность, создавая "рваный" край, который плавно колеблется во времени благодаря множителю `uTime * 0.4`. Вычисление вынесено за пределы циклов `if`, что делает шейдер высокопроизводительным даже при 10 активных святилищах.
4. **`smoothstep(0.2, 0.8, fog)`**: Делает переходы между плотным туманом и просветами более резкими, усиливая эффект "кусков" и клубов, а не равномерной полупрозрачной пелены.

*Примечание:* Если скорость скроллинга тумана при движении покажется слишком быстрой или медленной, отрегулируйте множитель `0.002` в строке `vec2 worldOffset = vec2(uCamOffsetX * 0.002, uCamOffsetY * 0.002);`.