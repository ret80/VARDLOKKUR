/* fx.ts — Атмосферные визуальные эффекты: туман, виньетка.
   Отделён от engine.ts для разделения ответственности.
   
   Этап 6: частицы и снег извлечены в ParticleSystem.
   Фаза 5: удалён import pixi.js, все типы заменены на Handle,
   использование IRenderer для создания vignette/fogVignette.
*/

import { NoiseGenerator } from "./noise";
import { clamp } from "./utils";
import type { ParticleSystem } from './engine/particle-system';
import type { IRenderer, SpriteHandle, TextureHandle } from './renderer';
// getRenderer удалён в Фаза 6 — используется this._renderer

/* ======================== Интерфейсы ======================== */

export interface FxState {
  viewW: number; viewH: number;
  playerX: number; playerY: number;
  camX: number; camY: number;
  realT: number; dt: number; rdt: number;
  fogRadius: number; fogActive: boolean;
  isDungeon: boolean;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number;
  color: number; grav: number; alpha: number;
}

export interface Snowflake {
  x: number; y: number; s: number; d: number; w: number;
}

/* ======================== FxManager ======================== */

export class FxManager {
  private _renderer!: IRenderer;
  private viewW = 0;
  private viewH = 0;

  /** Ссылка на ParticleSystem для делегирования burst/initSnow (Этап 6) */
  private _particleSys: ParticleSystem | null = null;

  // --- Слои ---
  // --- Слои (публичные для отрисовки из engine) ---
  // worldParticleG удалён в Этап 6 — перемещён в ParticleSystem
  private screenFxG: any = null; // Для снега (поверх UI) — GraphicsHandle
  public vignette: SpriteHandle | null = null;
  public fogVignette: SpriteHandle | null = null;

  // --- Данные (deprecated: перенесено в ParticleSystem) ---
  private particles: Particle[] = [];
  public snow: Snowflake[] = [];

  // --- Fog Canvases (внутренние, не экспортируются) ---
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private fogTex: TextureHandle | null = null;
  private fogRT: TextureHandle | null = null;
  private fogCopySpr: SpriteHandle | null = null;
  private fogMaskCanvas: HTMLCanvasElement | null = null;
  private fogMaskCtx: CanvasRenderingContext2D | null = null;
  private noiseCanvas: HTMLCanvasElement | null = null;
  private fogNoiseT = 0;
  private fogNoiseGen = new NoiseGenerator(0x51ab); // фикс. сид — текстура дыма
  private fogAlpha = 0; // текущая прозрачность тумана (0 = невидим, 1 = полностью виден)

  /* ---------- Инициализация ---------- */

  public init(renderer: IRenderer, w: number, h: number) {
    this._renderer = renderer;
    this.viewW = w;
    this.viewH = h;
    this.fogAlpha = 0;
  }

  /** Установить ParticleSystem для делегирования burst/initSnow (Этап 6) */
  public setParticleSystem(sys: ParticleSystem): void {
    this._particleSys = sys;
  }

  /** Вызывается один раз после создания сцены в engine. */
  public attachToStage(_stage: any, screenFx: any) {
    this.screenFxG = screenFx;
    // particleG уже добавлен в fxWorld в engine, но мы его здесь не трогаем —
    // engine сам добавляет worldParticleG через addChild.
  }

  public resize(w: number, h: number) {
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = w;
    this.viewH = h;
    this.buildVignette();
    this.buildFogVignette();
  }

  /* ---------- API для Engine ---------- */

  /** Создать взрыв частиц. Вызывается из engine в местах урона/смерти.
   *  Этап 6: делегирует в ParticleSystem. */
  public burst(x: number, y: number, color: number, n: number, speed: number, life: number, size: number, grav: number) {
    if (this._particleSys) {
      this._particleSys.burst(x, y, color, n, speed, life, size, grav);
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    if (this.particles.length > 420) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.5 + Math.random() * 0.7), max: life,
        size: size * (0.7 + Math.random() * 0.7),
        color, grav, alpha: 0.95,
      });
    }
  }

  /** Инициализация снега (вызывается один раз в init engine).
   *  Этап 6: делегирует в ParticleSystem. */
  public initSnow() {
    if (this._particleSys) {
      this._particleSys.initSnow();
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    for (let i = 0; i < 130; i++) {
      this.snow.push({
        x: Math.random() * 640,
        y: Math.random() * 560,
        s: 14 + Math.random() * 26,
        d: Math.random() * 6,
        w: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  /** Обновление частиц. Вызывается каждый тик.
   *  Этап 6: делегирует в ParticleSystem. */
  public updateParticles(rdt: number) {
    if (this._particleSys) {
      this._particleSys.updateParticles(rdt);
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= rdt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * rdt;
      p.x += p.vx * rdt;
      p.y += p.vy * rdt;
    }
  }

  /** Обновление состояния снега. Вызывается в update().
   *  Этап 6: делегирует в ParticleSystem. */
  public updateSnow(realT: number) {
    if (this._particleSys) {
      this._particleSys.updateSnow(realT);
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    for (const f of this.snow) {
      f.y += f.s * 0.016;
      f.x += Math.sin(realT * 0.8 + f.d) * 8 * 0.016 - 4 * 0.016;
      if (f.y > this.viewH) { f.y = -2; f.x = Math.random() * this.viewW; }
      if (f.x < -2) f.x = this.viewW;
    }
  }

  /* ---------- Внутренняя логика: Виньетка ---------- */

  public buildVignette() {
    const vw = Math.ceil(this.viewW * 1.1);
    const vh = Math.ceil(this.viewH * 1.1);
    const vc = document.createElement("canvas");
    vc.width = vw; vc.height = vh;
    const vx = vc.getContext("2d")!;
    const grad = vx.createRadialGradient(vw / 2, vh / 2, vh * 0.36, vw / 2, vh / 2, vh * 0.85);
    grad.addColorStop(0, "rgba(5,8,13,0)");
    grad.addColorStop(1, "rgba(4,6,10,0.66)");
    vx.fillStyle = grad; vx.fillRect(0, 0, vw, vh);
    
    const texHandle = this._renderer.createTextureFromCanvas(vc);
    if (this.vignette !== null) {
      // Обновляем существующий спрайт (пересоздаём с новой текстурой)
      this._renderer.destroySprite(this.vignette);
      this.vignette = this._renderer.createScreenSprite({
        texture: texHandle,
        x: -this.viewW * 0.05,
        y: -this.viewH * 0.05,
      });
    } else {
      this.vignette = this._renderer.createScreenSprite({
        texture: texHandle,
        x: -this.viewW * 0.05,
        y: -this.viewH * 0.05,
      });
    }
  }

  /* ---------- Внутренняя логика: Туман ---------- */

  public buildFogVignette() {
    const scale = 0.5;
    const targetW = this.viewW * 1.1;
    const targetH = this.viewH * 1.1;
    const cw = Math.max(4, Math.ceil(targetW * scale));
    const ch = Math.max(4, Math.ceil(targetH * scale));

    if (!this.fogCanvas) {
      this.fogCanvas = document.createElement("canvas");
      this.fogCtx = this.fogCanvas.getContext("2d")!;
    }
    const sizeChanged = this.fogCanvas.width !== cw || this.fogCanvas.height !== ch;
    if (sizeChanged) {
      this.fogCanvas.width = cw;
      this.fogCanvas.height = ch;

      if (this.fogTex !== null) {
        this._renderer.destroyTexture(this.fogTex);
        this.fogTex = null;
      }
      if (this.fogRT !== null) {
        this._renderer.destroyTexture(this.fogRT);
        this.fogRT = null;
      }

      this.fogTex = this._renderer.createTextureFromCanvas(this.fogCanvas);
      this.fogRT = this._renderer.createRenderTexture(cw, ch);
    }
    if (this.fogTex === null) this.fogTex = this._renderer.createTextureFromCanvas(this.fogCanvas);
    if (this.fogRT === null) this.fogRT = this._renderer.createRenderTexture(cw, ch);

    if (this.fogVignette === null) {
      this.fogVignette = this._renderer.createScreenSprite({
        texture: this.fogRT!,
      });
    } else {
      // Обновляем текстуру существующего спрайта
      this._renderer.destroySprite(this.fogVignette);
      this.fogVignette = this._renderer.createScreenSprite({
        texture: this.fogRT!,
      });
    }
    this._renderer.setSpritePosition(this.fogVignette, {
      x: -this.viewW * 0.05,
      y: -this.viewH * 0.05,
    });
    this._renderer.setSpriteVisible(this.fogVignette, false);
    this._renderer.setSpriteAlpha(this.fogVignette, 1);
    this.fogAlpha = 0;
  }

  public buildNoiseTexture() {
    if (this.noiseCanvas) return;
    const size = 128;
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = this.fogNoiseGen.fbm(x * 0.05, y * 0.05, 3);
        const i = (y * size + x) * 4;
        img.data[i] = 105; img.data[i + 1] = 118; img.data[i + 2] = 132;
        img.data[i + 3] = Math.floor(Math.max(0, n - 0.25) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    this.noiseCanvas = c;
  }

  private fogWaveNoise(a: number, t: number): number {
    return (
      Math.sin(a * 3 + t * 0.9) * 0.5 +
      Math.sin(a * 7 - t * 1.3 + 1.7) * 0.3 +
      Math.sin(a * 13 + t * 2.1 + 4.2) * 0.2
    );
  }

  public redrawFog(rdt: number, fogRadius: number, playerX: number, playerY: number, camX: number, camY: number, viewW: number, viewH: number, shrineSpots?: {x: number, y: number}[]) {
    if (!this.fogCanvas || !this.fogCtx || this.fogVignette === null) return;
    const active = fogRadius < 2300;
    
    // Плавное появление/исчезновение через alpha — 1.5 секунды
    const targetAlpha = active ? 1 : 0;
    const speed = 1 / 1.5; // 0.667 → ~1.5s fade
    this.fogAlpha += (targetAlpha - this.fogAlpha) * Math.min(1, rdt * speed);
    this._renderer.setSpriteAlpha(this.fogVignette, this.fogAlpha);
    this._renderer.setSpriteVisible(this.fogVignette, this.fogAlpha > 0.001);
    
    if (this.fogAlpha < 0.001) return;

    this.fogNoiseT += rdt;
    const cw = this.fogCanvas.width, ch = this.fogCanvas.height;
    const ctx = this.fogCtx;
    const maxCanvas = Math.max(cw, ch);
    const fogK = clamp(1 - fogRadius / 2300, 0, 1);

    ctx.clearRect(0, 0, cw, ch);

    // 1. Туман НА ВЕСЬ экран — окна над игроком больше нет
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.2, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    g.addColorStop(0, `rgba(110,122,138,${(0.30 + 0.25 * fogK).toFixed(3)})`);
    g.addColorStop(1, `rgba(78,88,104,${(0.55 + 0.40 * fogK).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);

    // 2. Дрейфующие клочья
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + this.fogNoiseT * 0.05;
      const rr = maxCanvas * (0.25 + 0.3 * Math.abs(this.fogWaveNoise(a * 1.7 + 3.1, this.fogNoiseT * 0.7)));
      const bx = cw / 2 + Math.cos(a) * rr, by = ch / 2 + Math.sin(a) * rr;
      const blobR = maxCanvas * (0.08 + 0.08 * Math.abs(this.fogWaveNoise(a * 2.3, this.fogNoiseT * 0.6)));
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(1, blobR));
      bg.addColorStop(0, `rgba(96,108,124,${(0.22 * fogK + 0.08).toFixed(3)})`);
      bg.addColorStop(1, "rgba(96,108,124,0)");
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, Math.max(1, blobR), 0, Math.PI * 2); ctx.fill();
    }

    // 3. Шум Перлина по всему экрану
    if (this.noiseCanvas) {
      if (!this.fogMaskCanvas) { this.fogMaskCanvas = document.createElement("canvas"); this.fogMaskCtx = this.fogMaskCanvas.getContext("2d")!; }
      if (this.fogMaskCanvas.width !== cw) this.fogMaskCanvas.width = cw;
      if (this.fogMaskCanvas.height !== ch) this.fogMaskCanvas.height = ch;
      const mc = this.fogMaskCtx!;
      mc.globalCompositeOperation = "source-over";
      mc.clearRect(0, 0, cw, ch);
      mc.drawImage(this.noiseCanvas, 0, 0, cw, ch);
      ctx.globalAlpha = 0.2 + 0.3 * fogK;
      ctx.drawImage(this.fogMaskCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }

    // 4. ДЫРЫ ТОЛЬКО У СВЯТИЛИЩ (мировые координаты → экранные)
    ctx.globalCompositeOperation = "destination-out";
    if (shrineSpots && shrineSpots.length > 0) {
      for (const h of shrineSpots) {
        const hx = (h.x - camX + viewW * 0.05) * (cw / (viewW * 1.1));
        const hy = (h.y - camY + viewH * 0.05) * (ch / (viewH * 1.1));
        if (hx < -80 || hy < -80 || hx > cw + 80 || hy > ch + 80) continue;
        const hr = maxCanvas * 0.16;
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
        hg.addColorStop(0, "rgba(0,0,0,1)");
        hg.addColorStop(0.7, "rgba(0,0,0,0.8)");
        hg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";

    // принудительно обновляем CanvasSource и копируем в RenderTexture
    if (this.fogTex !== null && this.fogRT !== null) {
      // Рендерим canvas в render texture через IRenderer
      this._renderer.renderCanvasToTexture(this.fogCanvas!, this.fogRT!);
    }
  }

  public drawFogEyes(g: any, warn: boolean, realT: number, viewW: number, viewH: number) {
    if (!warn) return;
    const r = this._renderer;
    for (let i = 0; i < 3; i++) {
      if (Math.floor(realT * 2 + i) % 3 === 0) continue; // моргание
      const sx = ((i + 0.5) / 3) * viewW + Math.sin(realT * 0.7 + i * 2.4) * 30;
      const sy = viewH * (0.18 + 0.25 * ((i * 37) % 3) / 3) + Math.cos(realT * 0.9 + i) * 12;
      // Рисуем два маленьких прямоугольника (глаза)
      r.drawRect(g, { x: sx, y: sy, width: 2, height: 1 }, { r: 0xbd / 255, g: 0xee / 255, b: 0xf8 / 255, a: 0.5 });
      r.drawRect(g, { x: sx + 4, y: sy, width: 2, height: 1 }, { r: 0xbd / 255, g: 0xee / 255, b: 0xf8 / 255, a: 0.5 });
    }
  }

  /* ---------- Отрисовка ---------- */

  /** Отрисовка мировых частиц и SlamZone. Вызывается в tick() перед рендером сущностей.
   *  Этап 6: делегирует в ParticleSystem. */
  public drawWorldFx(_rdt: number, _realT: number) {
    if (this._particleSys) {
      this._particleSys.drawWorldFx();
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    const r = this._renderer;
    r.clearGraphics(this.screenFxG as any);
    for (const p of this.particles) {
      const half = p.size / 2;
      r.drawRect(this.screenFxG as any, { x: p.x - half, y: p.y - half, width: p.size, height: p.size }, {
        r: ((p.color >> 16) & 0xff) / 255,
        g: ((p.color >> 8) & 0xff) / 255,
        b: (p.color & 0xff) / 255,
        a: p.alpha * (p.life / p.max),
      });
    }
  }

  /** Отрисовка снежного слоя на screenFx. Вызывается в tick().
     *  Этап 9: ParticleSystem.drawSnow использует IRenderer API,
     *  поэтому FxManager рисует снег самостоятельно (legacy-путь). */
  public drawSnow(g: any, _realT: number) {
    // ParticleSystem теперь использует IRenderer API (GraphicsHandle),
    // поэтому снег рисуется здесь через IRenderer.
    const r = this._renderer;
    for (const f of this.snow) {
      r.drawRect(g, { x: f.x, y: f.y, width: f.w, height: f.w }, {
        r: 0xc8 / 255, g: 0xd8 / 255, b: 0xe8 / 255, a: 0.4,
      });
    }
  }

  /** Отрисовка «рун» по углам экрана при сильном тумане. */
  public drawFogRunes(g: any, fogRadius: number, viewW: number, viewH: number) {
    const r = this._renderer;
    const k = clamp(1 - fogRadius / 2300, 0, 1);
    if (k > 0.05) {
      const W = viewW, H = viewH;
      const L = 34 * k;
      const color = { r: 0xbd / 255, g: 0xee / 255, b: 0xf8 / 255, a: 0.5 * k };
      const corners: [number, number, number, number][] = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
      for (const [cx0, cy0, sx, sy] of corners) {
        r.drawLine(g, cx0, cy0, cx0 + sx * L, cy0, color);
        r.drawLine(g, cx0, cy0, cx0, cy0 + sy * L, color);
        r.drawLine(g, cx0 + sx * L * 0.4, cy0, cx0 + sx * L * 0.4, cy0 + sy * L * 0.4, color);
        r.drawLine(g, cx0, cy0 + sy * L * 0.4, cx0 + sx * L * 0.4, cy0 + sy * L * 0.4, color);
      }
    }
  }

  /** Метод для пересчёта тумана. Вызывается из engine.tick(). */
  public updateFog(rdt: number, fogRadius: number, fogActive: boolean, isDungeon: boolean,
                   playerX: number, playerY: number, camX: number, camY: number,
                   viewW: number, viewH: number, holes?: { x: number; y: number }[]) {
    this.redrawFog(rdt, fogRadius, playerX, playerY, camX, camY, viewW, viewH, holes);
  }

  /* ---------- Геттеры для слоёв ---------- */

  // worldParticleGraphics удалён — перемещён в ParticleSystem

  /* ---------- Жизненный цикл ---------- */

  public destroy() {
    if (this.vignette !== null) {
      this._renderer.destroySprite(this.vignette);
      this.vignette = null;
    }
    if (this.fogVignette !== null) {
      this._renderer.destroySprite(this.fogVignette);
      this.fogVignette = null;
    }
    if (this.fogTex !== null) {
      this._renderer.destroyTexture(this.fogTex);
      this.fogTex = null;
    }
    if (this.fogRT !== null) {
      this._renderer.destroyTexture(this.fogRT);
      this.fogRT = null;
    }
    if (this.fogCanvas) { this.fogCanvas.remove(); this.fogCanvas = null; }
    if (this.fogMaskCanvas) { this.fogMaskCanvas.remove(); this.fogMaskCanvas = null; }
    if (this.noiseCanvas) { this.noiseCanvas.remove(); this.noiseCanvas = null; }
  }
}

/* ======================== Утилиты ======================== */


