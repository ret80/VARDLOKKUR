/* renderers/enemy/GhostRenderer.ts */
import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

/** Конвертация hex-цвета в Color {r, g, b, a} */
function hexColor(hex: number, alpha: number = 1): { r: number; g: number; b: number; a: number } {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
    a: alpha,
  };
}

export class GhostRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const r = ctx.renderer!;
    const time = ctx.time;
    const { a } = ctx as any;
    
    const floatY = Math.sin(time * Math.PI + e.seed) * 2;

    const aggr = e.aggro && e.state !== "dissipate" && !e.nearLitShrine;
    
    const swayL = Math.sin(time * (2 * Math.PI / 1.5)) * 1.5;
    const swayC = Math.sin(time * (2 * Math.PI / 1.8)) * 1.0;
    const swayR = Math.sin(time * (2 * Math.PI / 1.3)) * 2.0;
    const swayB = Math.sin(time * (2 * Math.PI / 1.6)) * 1.5;

    const BODY = 0xcfdce8;
    const HI = 0xeef6fc;
    const DK = 0x9fb4c8;
    const FACE = 0x0d1a24;
    const EYE_CALM = 0x6a8aa4;
    const EYE_AGGR = 0xe05050;
    const eye = aggr ? EYE_AGGR : EYE_CALM;

    const facing = e.facing;
    const isLeft = facing.x < -0.3;
    const isRight = facing.x > 0.3;
    const isBack = facing.y < -0.3;
    const isForward = !isLeft && !isRight && !isBack;

    // Тело по направлениям
    if (isBack) {
      px(r, g, -2, -12 + floatY, 4, 1, HI, a);
      px(r, g, -3, -11 + floatY, 6, 1, BODY, a);
      px(r, g, -4, -10 + floatY, 8, 2, BODY, a);
      px(r, g, -4, -8 + floatY, 8, 7, BODY, a);
      px(r, g, -4, -8 + floatY, 1, 7, HI, a);
      px(r, g, 3, -8 + floatY, 1, 7, DK, a);
      px(r, g, -1, -9 + floatY, 2, 3, DK, a);
      if (aggr) {
        px(r, g, -5, -6 + floatY, 1, 2, BODY, a);
        px(r, g, 4, -6 + floatY, 1, 2, BODY, a);
      } else {
        px(r, g, -5, -6 + floatY, 1, 3, BODY, a);
        px(r, g, 4, -6 + floatY, 1, 3, BODY, a);
      }
    } 
    else if (isLeft) {
      px(r, g, -2, -12 + floatY, 4, 1, HI, a);
      px(r, g, -3, -11 + floatY, 6, 1, BODY, a);
      px(r, g, -4, -10 + floatY, 8, 2, BODY, a);
      px(r, g, -4, -8 + floatY, 8, 7, BODY, a);
      px(r, g, -4, -8 + floatY, 1, 7, HI, a);
      px(r, g, 3, -8 + floatY, 1, 7, DK, a);
      px(r, g, -3, -9 + floatY, 4, 3, FACE, a);
      px(r, g, -3, -8 + floatY, 1, 1, eye, a);
      px(r, g, -1, -8 + floatY, 1, 1, eye, a);
      if (aggr) px(r, g, -2, -7 + floatY, 2, 1, FACE, a);
      if (aggr) {
        px(r, g, -7, -7 + floatY, 1, 2, BODY, a);
        px(r, g, -6, -6 + floatY, 4, 1, BODY, a);
        px(r, g, -4, -6 + floatY, 1, 2, DK, a);
        px(r, g, -3, -5 + floatY, 4, 1, DK, a);
      } else {
        px(r, g, -5, -6 + floatY, 1, 3, BODY, a);
        px(r, g, 4, -6 + floatY, 1, 3, BODY, a);
      }
    } 
    else if (isRight) {
      px(r, g, -2, -12 + floatY, 4, 1, HI, a);
      px(r, g, -3, -11 + floatY, 6, 1, BODY, a);
      px(r, g, -4, -10 + floatY, 8, 2, BODY, a);
      px(r, g, -4, -8 + floatY, 8, 7, BODY, a);
      px(r, g, -4, -8 + floatY, 1, 7, HI, a);
      px(r, g, 3, -8 + floatY, 1, 7, DK, a);
      px(r, g, -1, -9 + floatY, 4, 3, FACE, a);
      px(r, g, 0, -8 + floatY, 1, 1, eye, a);
      px(r, g, 2, -8 + floatY, 1, 1, eye, a);
      if (aggr) px(r, g, 0, -7 + floatY, 2, 1, FACE, a);
      if (aggr) {
        px(r, g, 6, -7 + floatY, 1, 2, BODY, a);
        px(r, g, 2, -6 + floatY, 4, 1, BODY, a);
        px(r, g, 4, -6 + floatY, 1, 2, DK, a);
        px(r, g, 1, -5 + floatY, 4, 1, DK, a);
      } else {
        px(r, g, -5, -6 + floatY, 1, 3, BODY, a);
        px(r, g, 4, -6 + floatY, 1, 3, BODY, a);
      }
    } 
    else {
      px(r, g, -2, -12 + floatY, 4, 1, HI, a);
      px(r, g, -3, -11 + floatY, 6, 1, BODY, a);
      px(r, g, -4, -10 + floatY, 8, 2, BODY, a);
      px(r, g, -4, -8 + floatY, 8, 7, BODY, a);
      px(r, g, -4, -8 + floatY, 1, 7, HI, a);
      px(r, g, 3, -8 + floatY, 1, 7, DK, a);
      px(r, g, -2, -9 + floatY, 4, 3, FACE, a);
      px(r, g, -2, -8 + floatY, 1, 1, eye, a);
      px(r, g, 1, -8 + floatY, 1, 1, eye, a);
      if (aggr) px(r, g, -1, -7 + floatY, 2, 1, FACE, a);
      if (aggr) {
        px(r, g, -6, -7 + floatY, 1, 2, BODY, a);
        px(r, g, -5, -6 + floatY, 2, 1, BODY, a);
        px(r, g, 5, -7 + floatY, 1, 2, BODY, a);
        px(r, g, 3, -6 + floatY, 2, 1, BODY, a);
      } else {
        px(r, g, -5, -6 + floatY, 1, 3, BODY, a);
        px(r, g, 4, -6 + floatY, 1, 3, BODY, a);
      }
    }

    // Бахрома
    px(r, g, -4 + swayL, -1 + floatY, 2, 2, DK, a);
    px(r, g, -1 + swayC, -1 + floatY, 2, 3, DK, a);
    px(r, g, 2 + swayR, -1 + floatY, 2, 2, DK, a);
    px(r, g, -1 + swayB, 2 + floatY, 2, 1, DK, a * 0.7);
  }
}
