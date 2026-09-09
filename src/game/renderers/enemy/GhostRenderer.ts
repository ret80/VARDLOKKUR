/* renderers/enemy/GhostRenderer.ts */
import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class GhostRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const time = ctx.time;
    const { a } = ctx as any;
    
    // 1. Плавная синусоидальная анимация покачивания тела (float)
    // Соответствует: animation: float 2s ease-in-out infinite alternate;
    // (ease-in-out alternate математически идентичен синусоиде)
    const floatY = Math.sin(time * Math.PI + e.seed) * 2;

    const aggr = e.aggro && e.state !== "dissipate" && !e.nearLitShrine;
    
    // 2. Плавная синусоидальная анимация колыхания бахромы (sway)
    // Частоты рассчитаны как 2 * PI / период_из_SVG
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

    // Определяем направление (по аналогии с PlayerRenderer)
    // facing — направление взгляда врага из Enemy.facingX/Y
    const facing = e.facing;
    const isLeft = facing.x < -0.3;
    const isRight = facing.x > 0.3;
    const isBack = facing.y < -0.3;
    const isForward = !isLeft && !isRight && !isBack;

    // --- ОТРИСОВКА ТЕЛА ПО НАПРАВЛЕНИЯМ ---

    if (isBack) {
      // НАЗАД
      px(g, -2, -12 + floatY, 4, 1, HI, a);
      px(g, -3, -11 + floatY, 6, 1, BODY, a);
      px(g, -4, -10 + floatY, 8, 2, BODY, a);
      px(g, -4, -8 + floatY, 8, 7, BODY, a);
      px(g, -4, -8 + floatY, 1, 7, HI, a);
      px(g, 3, -8 + floatY, 1, 7, DK, a);
      // "Шов" на затылке вместо лица
      px(g, -1, -9 + floatY, 2, 3, DK, a);
      
      if (aggr) {
        px(g, -5, -6 + floatY, 1, 2, BODY, a);
        px(g, 4, -6 + floatY, 1, 2, BODY, a);
      } else {
        px(g, -5, -6 + floatY, 1, 3, BODY, a);
        px(g, 4, -6 + floatY, 1, 3, BODY, a);
      }
    } 
    else if (isLeft) {
      // ВЛЕВО
      px(g, -2, -12 + floatY, 4, 1, HI, a);
      px(g, -3, -11 + floatY, 6, 1, BODY, a);
      px(g, -4, -10 + floatY, 8, 2, BODY, a);
      px(g, -4, -8 + floatY, 8, 7, BODY, a);
      px(g, -4, -8 + floatY, 1, 7, HI, a);
      px(g, 3, -8 + floatY, 1, 7, DK, a);
      
      // Лицо и глаза сдвинуты влево
      px(g, -3, -9 + floatY, 4, 3, FACE, a);
      px(g, -3, -8 + floatY, 1, 1, eye, a);
      px(g, -1, -8 + floatY, 1, 1, eye, a);
      if (aggr) px(g, -2, -7 + floatY, 2, 1, FACE, a);

      if (aggr) {
        // Передняя (левая) рука вытянута
        px(g, -7, -7 + floatY, 1, 2, BODY, a);
        px(g, -6, -6 + floatY, 4, 1, BODY, a);
        // Задняя (правая) рука вытянута на фоне тела (темнее)
        px(g, -4, -6 + floatY, 1, 2, DK, a);
        px(g, -3, -5 + floatY, 4, 1, DK, a);
      } else {
        px(g, -5, -6 + floatY, 1, 3, BODY, a);
        px(g, 4, -6 + floatY, 1, 3, BODY, a);
      }
    } 
    else if (isRight) {
      // ВПРАВО (зеркально ВЛЕВО)
      px(g, -2, -12 + floatY, 4, 1, HI, a);
      px(g, -3, -11 + floatY, 6, 1, BODY, a);
      px(g, -4, -10 + floatY, 8, 2, BODY, a);
      px(g, -4, -8 + floatY, 8, 7, BODY, a);
      px(g, -4, -8 + floatY, 1, 7, HI, a);
      px(g, 3, -8 + floatY, 1, 7, DK, a);
      
      // Лицо и глаза сдвинуты вправо
      px(g, -1, -9 + floatY, 4, 3, FACE, a);
      px(g, 0, -8 + floatY, 1, 1, eye, a);
      px(g, 2, -8 + floatY, 1, 1, eye, a);
      if (aggr) px(g, 0, -7 + floatY, 2, 1, FACE, a);

      if (aggr) {
        // Передняя (правая) рука вытянута
        px(g, 6, -7 + floatY, 1, 2, BODY, a);
        px(g, 2, -6 + floatY, 4, 1, BODY, a);
        // Задняя (левая) рука вытянута на фоне тела (темнее)
        px(g, 4, -6 + floatY, 1, 2, DK, a);
        px(g, 1, -5 + floatY, 4, 1, DK, a);
      } else {
        px(g, -5, -6 + floatY, 1, 3, BODY, a);
        px(g, 4, -6 + floatY, 1, 3, BODY, a);
      }
    } 
    else {
      // ВПЕРЁД (по умолчанию)
      px(g, -2, -12 + floatY, 4, 1, HI, a);
      px(g, -3, -11 + floatY, 6, 1, BODY, a);
      px(g, -4, -10 + floatY, 8, 2, BODY, a);
      px(g, -4, -8 + floatY, 8, 7, BODY, a);
      px(g, -4, -8 + floatY, 1, 7, HI, a);
      px(g, 3, -8 + floatY, 1, 7, DK, a);
      
      px(g, -2, -9 + floatY, 4, 3, FACE, a);
      px(g, -2, -8 + floatY, 1, 1, eye, a);
      px(g, 1, -8 + floatY, 1, 1, eye, a);
      if (aggr) px(g, -1, -7 + floatY, 2, 1, FACE, a);

      if (aggr) {
        // Обе руки тянутся к зрителю
        px(g, -6, -7 + floatY, 1, 2, BODY, a);
        px(g, -5, -6 + floatY, 2, 1, BODY, a);
        px(g, 5, -7 + floatY, 1, 2, BODY, a);
        px(g, 3, -6 + floatY, 2, 1, BODY, a);
      } else {
        px(g, -5, -6 + floatY, 1, 3, BODY, a);
        px(g, 4, -6 + floatY, 1, 3, BODY, a);
      }
    }

    // --- ОТРИСОВКА БАХРОМЫ (с независимым синусоидальным покачиванием по X) ---
    // Левый сегмент
    px(g, -4 + swayL, -1 + floatY, 2, 2, DK, a);
    // Центральный сегмент (самый длинный)
    px(g, -1 + swayC, -1 + floatY, 2, 3, DK, a);
    // Правый сегмент
    px(g, 2 + swayR, -1 + floatY, 2, 2, DK, a);
    // Нижний блик (с прозрачностью)
    px(g, -1 + swayB, 2 + floatY, 2, 1, DK, a * 0.7);
  }
}