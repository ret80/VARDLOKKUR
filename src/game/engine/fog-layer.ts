/* fog-layer.ts — Слой тумана, рун и глаз в тумане */

import { query, hasComponent } from 'bitecs';
import type { Application } from 'pixi.js';
import type { World } from 'bitecs';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { FxManager } from '../fx';
import { Shrine, Position } from '../ecs/ecs-components';
import type { CameraPosition } from './camera-controller';

/** Состояние тумана, передаваемое из ecs-game-loop */
export interface FogState {
  fogRadius: number;
  fogActive: boolean;
  fogAmbient: boolean;
  fogSpawned: boolean;
  fogLeft: number;
  fogTimer: number;
  fogWarned: boolean;
}

/**
 * FogLayer — слой атмосферных эффектов тумана.
 *
 * Отвечает за:
 * - Перерисовку тумана (redrawFog)
 * - Отрисовку рун при сильном тумане
 * - Отрисовку «глаз» в тумане
 *
 * Туман рендерится внутри пайплайна ДО app.render(),
 * что устраняет 1-кадровый лаг.
 */
export class FogLayer implements IRenderLayer {
  private fx!: FxManager;
  private cam!: CameraPosition;
  private viewW = 0;
  private viewH = 0;
  private fogState: FogState | null = null;
  private playerEid = -1;
  private runesEnabled = false;

  constructor(fx: FxManager) {
    this.fx = fx;
  }

  /** Обновить состояние тумана. Вызывается каждый кадр из ecs-game-loop. */
  setFogState(fogState: FogState | null): void {
    this.fogState = fogState;
  }

  /** Обновить позицию игрока. Вызывается каждый кадр. */
  setPlayerEid(eid: number): void {
    this.playerEid = eid;
  }

  /** Включить/выключить руны. Вызывается из ecs-game-loop. */
  setRunesEnabled(enabled: boolean): void {
    this.runesEnabled = enabled;
  }

  init(_app: Application, _ctx: RenderLayerContext): void {
    // FogLayer не требует инициализации — fx уже создан в engine
  }

  update(ctx: RenderLayerContext): void {
    // Туман не требует обновления состояния — всё в render()
  }

  render(ctx: RenderLayerContext): void {
    if (!this.fogState || this.playerEid < 0) return;

    // Запросить освещённые святилища
    const shrineSpots: Array<{ x: number; y: number }> = [];
    for (const eid of query(ctx.world, [Shrine])) {
      if (hasComponent(ctx.world, eid, Shrine) && Shrine.lit[eid]) {
        shrineSpots.push({ x: Position.x[eid], y: Position.y[eid] });
      }
    }

    // Перерисовать туман
    this.fx.redrawFog(
      ctx.dt,
      this.fogState.fogRadius,
      Position.x[this.playerEid],
      Position.y[this.playerEid],
      this.cam.x,
      this.cam.y,
      this.viewW,
      this.viewH,
      shrineSpots.length > 0 ? shrineSpots : undefined
    );
  }

  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.fx.resize(viewW, viewH);
  }

  /** Установить камеру (вызывается из ecs-game-loop) */
  setCamera(cam: CameraPosition): void {
    this.cam = cam;
  }

  destroy(): void {
    // FxManager управляется отдельно
  }
}
