/* fx.ts — Атмосферные визуальные эффекты: частицы, снег, туман, виньетка.
   Отделён от engine.ts для разделения ответственности:
   логика состояния остаётся в engine, математика рендеринга — здесь. */

import { Application, Container, Graphics, RenderTexture, Sprite, Texture } from "pixi.js";
import { NoiseGenerator } from "./noise";
import { clamp } from "./utils";

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
  private app!: Application;
  private viewW = 0;
  private viewH = 0;

  // --- Слои ---
  // --- Слои (публичные для отрисовки из engine) ---
  public worldParticleG = new Graphics();
  private screenFxG: Graphics | null = null; // Для снега (поверх UI)
  public vignette: Sprite | null = null;
  public fogVignette: Sprite | null = null;

  // --- Данные ---
  private particles: Particle[] = [];
  public snow: Snowflake[] = [];

  // --- Fog Canvases (внутренние, не экспортируются) ---
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private fogTex: Texture | null = null;
  private fogRT: RenderTexture | null = null;
  private fogCopySpr: Sprite | null = null;
  private fogMaskCanvas: HTMLCanvasElement | null = null;
  private fogMaskCtx: CanvasRenderingContext2D | null = null;
  private noiseCanvas: HTMLCanvasElement | null = null;
  private fogNoiseT = 0;
  private fogNoiseGen = new NoiseGenerator(0x51ab); // фикс. сид — текстура дыма

  /* ---------- Инициализация ---------- */

  public init(app: Application, w: number, h: number) {
    this.app = app;
    this.viewW = w;
    this.viewH = h;
  }

  /** Вызывается один раз после создания сцены в engine. */
  public attachToStage(stage: Container, screenFx: Graphics) {
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

  /** Создать взрыв частиц. Вызывается из engine в местах урона/смерти. */
  public burst(x: number, y: number, color: number, n: number, speed: number, life: number, size: number, grav: number) {
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

  /** Инициализация снега (вызывается один раз в init engine). */
  public initSnow() {
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

  /** Обновление частиц и снега. Вызывается каждый тик. */
  public updateParticles(rdt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= rdt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * rdt;
      p.x += p.vx * rdt;
      p.y += p.vy * rdt;
    }
  }

  /** Обновление состояния снега. Вызывается в update(). */
  public updateSnow(realT: number) {
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
    if (this.vignette) {
      this.vignette.texture.destroy(true);
      this.vignette.texture = Texture.from(vc);
    } else {
      this.vignette = new Sprite(Texture.from(vc));
    }
    this.vignette!.width = vw;
    this.vignette!.height = vh;
    this.vignette!.position.set(-this.viewW * 0.05, -this.viewH * 0.05);
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

      if (this.fogTex) { this.fogTex.destroy(true); this.fogTex = null; }
      if (this.fogRT)  { this.fogRT.destroy(true);  this.fogRT  = null; }

      this.fogTex = Texture.from(this.fogCanvas);
      this.fogRT = RenderTexture.create({ width: cw, height: ch });
    }
    if (!this.fogTex) this.fogTex = Texture.from(this.fogCanvas);
    if (!this.fogRT)  this.fogRT  = RenderTexture.create({ width: cw, height: ch });

    if (!this.fogVignette) this.fogVignette = new Sprite(this.fogRT);
    this.fogVignette.texture = this.fogRT;
    this.fogVignette.width = targetW;
    this.fogVignette.height = targetH;
    this.fogVignette.position.set(-this.viewW * 0.05, -this.viewH * 0.05);
    this.fogVignette.visible = false;
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
    if (!this.fogCanvas || !this.fogCtx || !this.fogVignette) return;
    const active = fogRadius < 2300;
    this.fogVignette.visible = active;
    if (!active) return;

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
    if (this.fogTex && this.fogRT && this.app) {
      this.fogTex.source.update();
      if (!this.fogCopySpr) this.fogCopySpr = new Sprite(this.fogTex);
      else this.fogCopySpr.texture = this.fogTex;
      this.app.renderer.render({ container: this.fogCopySpr, target: this.fogRT, clear: true });
    }
  }

  public drawFogEyes(fx: Graphics, warn: boolean, realT: number, viewW: number, viewH: number) {
    if (!warn) return;
    for (let i = 0; i < 3; i++) {
      if (Math.floor(realT * 2 + i) % 3 === 0) continue; // моргание
      const sx = ((i + 0.5) / 3) * viewW + Math.sin(realT * 0.7 + i * 2.4) * 30;
      const sy = viewH * (0.18 + 0.25 * ((i * 37) % 3) / 3) + Math.cos(realT * 0.9 + i) * 12;
      fx.rect(sx, sy, 2, 1).fill({ color: 0xbdeef8, alpha: 0.5 });
      fx.rect(sx + 4, sy, 2, 1).fill({ color: 0xbdeef8, alpha: 0.5 });
    }
  }

  /* ---------- Отрисовка ---------- */

  /** Отрисовка мировых частиц и SlamZone. Вызывается в tick() перед рендером сущностей. */
  public drawWorldFx(rdt: number, realT: number) {
    const g = this.worldParticleG;
    g.clear();
    for (const p of this.particles) {
      g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        .fill({ color: p.color, alpha: p.alpha * (p.life / p.max) });
    }
  }

  /** Отрисовка снежного слоя на screenFx. Вызывается в tick(). */
  public drawSnow(fx: Graphics, realT: number) {
    for (const f of this.snow) {
      fx.rect(f.x, f.y, f.w, f.w).fill({ color: 0xc8d8e8, alpha: 0.4 });
    }
  }

  /** Отрисовка «рун» по углам экрана при сильном тумане. */
  public drawFogRunes(fx: Graphics, fogRadius: number, viewW: number, viewH: number) {
    const k = clamp(1 - fogRadius / 2300, 0, 1);
    if (k > 0.05) {
      const W = viewW, H = viewH;
      const L = 34 * k;
      fx.strokeStyle = { color: 0xbdeef8, width: 1, alpha: 0.5 * k };
      const corners: [number, number, number, number][] = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
      for (const [cx0, cy0, sx, sy] of corners) {
        fx.moveTo(cx0, cy0).lineTo(cx0 + sx * L, cy0);
        fx.moveTo(cx0, cy0).lineTo(cx0, cy0 + sy * L);
        fx.moveTo(cx0 + sx * L * 0.4, cy0).lineTo(cx0 + sx * L * 0.4, cy0 + sy * L * 0.4);
        fx.moveTo(cx0, cy0 + sy * L * 0.4).lineTo(cx0 + sx * L * 0.4, cy0 + sy * L * 0.4);
      }
      fx.stroke();
    }
  }

  /** Метод для пересчёта тумана. Вызывается из engine.tick(). */
  public updateFog(rdt: number, fogRadius: number, fogActive: boolean, isDungeon: boolean,
                   playerX: number, playerY: number, camX: number, camY: number,
                   viewW: number, viewH: number, holes?: { x: number; y: number }[]) {
    this.redrawFog(rdt, fogRadius, playerX, playerY, camX, camY, viewW, viewH, holes);
  }

  /* ---------- Геттеры для слоёв ---------- */

  public get worldParticleGraphics(): Graphics { return this.worldParticleG; }

  /* ---------- Жизненный цикл ---------- */

  public destroy() {
    this.worldParticleG.destroy();
    if (this.vignette) { this.vignette.destroy(true); this.vignette = null; }
    if (this.fogVignette) { this.fogVignette.destroy(true); this.fogVignette = null; }
    if (this.fogCanvas) { this.fogCanvas.remove(); this.fogCanvas = null; }
    if (this.fogTex) { this.fogTex.destroy(true); this.fogTex = null; }
    if (this.fogRT) { this.fogRT.destroy(true); this.fogRT = null; }
    if (this.fogCopySpr) { this.fogCopySpr.destroy(); this.fogCopySpr = null; }
    if (this.fogMaskCanvas) { this.fogMaskCanvas.remove(); this.fogMaskCanvas = null; }
    if (this.noiseCanvas) { this.noiseCanvas.remove(); this.noiseCanvas = null; }
  }
}

/* ======================== Утилиты ======================== */


