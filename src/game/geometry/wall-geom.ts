/* wall-geom.ts — геометрическая отрисовка стен/деревьев/камней (task_14).
 *
 * Перенос legacy paintWall() из tiles.ts: вместо Canvas2D — Graphics-примитивы
 * через PixelPainter. Символы P (прямоугольник) сохранены 1-в-1.
 */

import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import { Tl } from '../world';
import { makePainter } from './geom-utils';

/**
 * Нарисовать стену/объект типа t (TREE/ROCK/PALISADE/COLUMN/DWALL/CAVEWALL)
 * в локальных координатах Graphics (как в legacy: блок P(0..16, -13..16),
 * спрайт размещался со сдвигом (-8, -20) от тайла).
 *
 * @param variant   детерминированный вариант (биты 1,2: форма/зеркало)
 * @param dungeonId id подземелья (палитра DWALL)
 * @param ox,oy     смещение для батчинга (когда один Graphics на все стены)
 */
export function drawWallGeometry(
  renderer: IRenderer,
  g: GraphicsHandle,
  t: number,
  variant: number,
  dungeonId: number,
  ox = 0,
  oy = 0
): void {
  const { P } = makePainter(renderer, g);

  // Helper с учётом смещения для батчинга
  const P2 = (x: number, y: number, w: number, h: number, c: number, a?: number) =>
    P(x + ox, y + oy, w, h, c, a);

  const v = variant;

  switch (t) {
    case Tl.TREE: {
      // зеркало для разнообразия (v & 2), ширины всегда > 0
      const MX = (x: number, w: number) => (v & 2 ? 16 - x - w : x);
      if (v & 1) {
        // ===== ЕЛЬ (снег комками) =====
        P2(MX(7, 3), 4, 3, 12, 0x241d14); P2(MX(7, 1), 4, 1, 12, 0x2f2618);
        // ярус 1
        P2(MX(3, 11), 2, 11, 3, 0x1d2b22);
        P2(MX(4, 3), 2, 3, 1, 0xc8d3dc); P2(MX(9, 2), 2, 2, 1, 0xc8d3dc);
        P2(MX(12, 1), 3, 1, 1, 0xc8d3dc); P2(MX(3, 1), 4, 1, 1, 0xc8d3dc);
        // ярус 2
        P2(MX(4, 9), -2, 9, 3, 0x24352a);
        P2(MX(6, 2), -2, 2, 1, 0xc8d3dc); P2(MX(9, 2), -2, 2, 1, 0xc8d3dc);
        P2(MX(4, 1), -1, 1, 1, 0xc8d3dc);
        // ярус 3
        P2(MX(5, 7), -6, 7, 3, 0x1d2b22);
        P2(MX(5, 1), -6, 1, 1, 0xc8d3dc); P2(MX(7, 2), -6, 2, 1, 0xc8d3dc);
        P2(MX(10, 1), -5, 1, 1, 0xc8d3dc);
        // ярус 4
        P2(MX(6, 5), -10, 5, 3, 0x24352a);
        P2(MX(7, 2), -10, 2, 1, 0xc8d3dc); P2(MX(9, 1), -9, 1, 1, 0xc8d3dc);
        // верхушка
        P2(MX(7, 3), -13, 3, 3, 0x1d2b22);
        P2(MX(8, 1), -13, 1, 1, 0xc8d3dc); P2(MX(7, 1), -12, 1, 1, 0xc8d3dc);
        // сугроб
        P2(MX(6, 5), 14, 5, 2, 0x8b98a6);
      } else {
        // ===== ЛИСТВЕННОЕ: голое дерево под снегом =====
        // ствол (доходит до сугроба)
        P2(MX(6, 3), 1, 3, 13, 0x3a2c1c);
        P2(MX(6, 3), 1, 1, 13, 0x4e3c28);
        // левая ветвь (каждый сегмент стыкуется с предыдущим)
        P2(MX(5, 2), 0, 2, 2, 0x3a2c1c);
        P2(MX(3, 2), -2, 2, 2, 0x3a2c1c);
        P2(MX(2, 2), -3, 2, 1, 0x3a2c1c);
        P2(MX(1, 2), -4, 2, 1, 0x3a2c1c);
        // правая ветвь
        P2(MX(9, 2), 0, 2, 2, 0x3a2c1c);
        P2(MX(11, 2), -2, 2, 2, 0x3a2c1c);
        P2(MX(12, 2), -3, 2, 1, 0x3a2c1c);
        P2(MX(13, 2), -4, 2, 1, 0x3a2c1c);
        // верхушка
        P2(MX(7, 1), -4, 1, 5, 0x3a2c1c);
        P2(MX(7, 1), -6, 1, 2, 0x3a2c1c);
        P2(MX(8, 1), -5, 1, 2, 0x3a2c1c);
        // снег на ветвях
        P2(MX(1, 3), -5, 3, 1, 0xeef6fc);
        P2(MX(3, 2), -3, 2, 1, 0xc8d3dc);
        P2(MX(5, 2), -1, 2, 1, 0xc8d3dc);
        P2(MX(13, 2), -5, 2, 1, 0xeef6fc);
        P2(MX(11, 2), -3, 2, 1, 0xc8d3dc);
        P2(MX(9, 2), -1, 2, 1, 0xc8d3dc);
        P2(MX(6, 3), -7, 3, 1, 0xeef6fc); // снежная шапка верхушки
        P2(MX(6, 3), 0, 3, 1, 0xc8d3dc);  // снег на "плечах" развилки
        // сугроб у основания
        P2(4, 14, 7, 2, 0x8b98a6);
      }
      break;
    }
    case Tl.ROCK:
      P2(2, 5, 12, 10, 0x4e5a68);
      P2(3, 4, 10, 4, 0x5c6875);
      P2(2, 12, 12, 3, 0x39424e);
      if (v & 1) P2(4, 4, 2, 1, 0x8f9aa8);
      break;
    case Tl.PALISADE:
      for (let i = 0; i < 4; i++) {
        const px = 1 + i * 4;
        P2(px, -4, 3, 19, 0x4e3c28);
        P2(px, -4, 1, 19, 0x63503a);
        P2(px + 2, -4, 1, 19, 0x3a2c1c);
        P2(px, -6, 3, 2, 0x5a4632);
        P2(px + 1, -8, 1, 2, 0x6e5840);
      }
      P2(0, 3, 16, 2, 0x463626);
      P2(0, 3, 16, 1, 0x5a4632);
      break;
    case Tl.COLUMN: {
      P2(5, -10, 7, 24, 0x515d6a);
      P2(5, -10, 2, 24, 0x62707e);
      P2(11, -10, 1, 24, 0x3f4a56);
      P2(6, -12, 5, 2, 0x5c6875);
      P2(7, -13, 3, 1, 0x6a7580);
      const rune = v & 1 ? 0x8fd8e8 : 0x7a8a98;
      P2(8, -6, 1, 2, rune); P2(9, -4, 1, 2, rune); P2(8, -2, 2, 1, rune); P2(9, 1, 1, 2, rune);
      P2(4, 12, 9, 2, 0x39424e);
      P2(4, 12, 9, 1, 0x8b98a6);
      if (v & 2) P2(10, 5, 2, 3, 0x2e4234);
      break;
    }
    case Tl.DWALL: {
      const dark = dungeonId === 1 ? 0x1c261c : dungeonId === 2 ? 0x2c2824 : 0x10151c;
      const light = dungeonId === 1 ? 0x2c362c : dungeonId === 2 ? 0x3a342e : 0x232c38;
      P2(0, 0, 16, 16, dark);
      P2(0, 0, 16, 5, light);
      P2(1, 9, 4, 4, 0x0a0e14); P2(9, 7, 5, 5, 0x0a0e14);
      break;
    }
    case Tl.CAVEWALL:
      P2(0, 0, 16, 16, 0x12181f);
      P2(0, 0, 16, 6, 0x1a222c);
      P2(2, 8, 3, 3, 0x0d1218); P2(10, 10, 3, 3, 0x0d1218);
      break;
  }
}
