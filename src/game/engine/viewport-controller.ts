/* viewport-controller.ts – Управление размерами viewport и камерой */

import type { Application } from "pixi.js";

const ZOOM = 1.18;

export interface Camera {
  x: number;
  y: number;
}

export interface ViewportSize {
  w: number;
  h: number;
}

export class ViewportController {
  private _viewW = 480;
  private _viewH = 270;

  constructor(
    private container: HTMLElement,
    private app: Application | null,
    public readonly cam: Camera
  ) {}

  get viewW(): number { return this._viewW; }
  get viewH(): number { return this._viewH; }
  get zoom(): number { return ZOOM; }

  /** Вычислить размеры viewport на основе размера контейнера */
  applyViewSize(): ViewportSize {
    const cw = Math.max(1, this.container.clientWidth || window.innerWidth);
    const ch = Math.max(1, this.container.clientHeight || window.innerHeight);
    const aspect = cw / ch;
    let vw: number, vh: number;

    if (aspect >= 1) {
      vh = Math.round(270 / ZOOM);
      vw = Math.round(vh * aspect);
      if (vw > 760) { vw = 760; vh = Math.round(vw / aspect); }
    } else {
      vw = Math.round(235 / ZOOM);
      vh = Math.round(vw / aspect);
      if (vh > 760) { vh = 760; vw = Math.round(vh * aspect); }
    }

    this._viewW = Math.max(120, vw);
    this._viewH = Math.max(120, vh);
    return { w: this._viewW, h: this._viewH };
  }

  /** Применить изменения размеров к рендереру */
  apply(renderer: Application["renderer"] | null): void {
    const ow = this._viewW;
    const oh = this._viewH;
    this.applyViewSize();
    if ((this._viewW !== ow || this._viewH !== oh) && renderer) {
      renderer.resize(this._viewW, this._viewH);
    }
  }

  /** Вычислить позицию камеры для spawn-точки в пределах карты */
  clampCamera(mapW: number, mapH: number, spawnX: number, spawnY: number): Camera {
    this.cam.x = clamp(spawnX - this._viewW / 2, 0, Math.max(0, mapW - this._viewW));
    this.cam.y = clamp(spawnY - this._viewH / 2, 0, Math.max(0, mapH - this._viewH));
    return this.cam;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
