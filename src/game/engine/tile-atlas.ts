/* tile-atlas.ts — Упаковка тайл-канвасов в один GPU-атлас
 *
 * Собирает distinct wall/house canvases (из WallTextureCache/HouseTextureCache)
 * в одну большую текстуру (atlas) и возвращает UV-координаты для каждого элемента.
 *
 * Используется TileLayer для отрисовки карты через SpriteBatcher
 * (1 текстура на кадр вместо сотен отдельных canvas).
 */

import REGL from 'regl';
import { logger } from '../debug/logger';

// ============================================================
// Типы
// ============================================================

/** UV-регион элемента в атласе (в пикселях атласа) */
export interface AtlasEntry {
  /** X левого верхнего угла в атласе */
  x: number;
  /** Y левого верхнего угла в атласе */
  y: number;
  /** Ширина региона */
  w: number;
  /** Высота региона */
  h: number;
}

/** Результат сборки атласа */
export interface TileAtlas {
  /** REGL-текстура атласа */
  texture: REGL.Texture2D;
  /** Размер атласа */
  width: number;
  height: number;
  /** Map: ключ канваса → UV-регион */
  entries: Map<HTMLCanvasElement, AtlasEntry>;
  /** Список канвасов в порядке добавления (для отладки) */
  keys: HTMLCanvasElement[];
}

// ============================================================
// Константы
// ============================================================

/** Максимальный размер атласа по одной стороне (ограничение WebGL) */
const MAX_ATLAS_SIZE = 4096;

/** Отступ между элементами (избегает bleeding при nearest — можно 0, но 1 безопаснее) */
const PADDING = 1;

// ============================================================
// Упаковка (shelf/row packing)
// ============================================================

/**
 * Упаковать список канвасов в атлас.
 *
 * Алгоритм: shelf packing — канвасы сортируются по высоте (убыв.),
 * раскладываются в ряды. Атлас квадратный, размер — степень двойки не обязательна
 * (WebGL2 поддерживает NPOT), но ограничен MAX_ATLAS_SIZE.
 *
 * Одинаковые канвасы (кэш возвращает один и тот же HTMLCanvasElement)
 * попадают в атлас один раз — дедупликация по ссылке.
 *
 * @param canvases — список канвасов (дубликаты по ссылке допустимы)
 * @param regl — regl-контекст
 * @returns TileAtlas с текстурой и UV-регионами
 */
export function buildTileAtlas(canvases: HTMLCanvasElement[], regl: REGL.Regl): TileAtlas {
  // Дедупликация по ссылке
  const unique: HTMLCanvasElement[] = [];
  const seen = new Set<HTMLCanvasElement>();
  for (const c of canvases) {
    if (!seen.has(c)) {
      seen.add(c);
      unique.push(c);
    }
  }

  // Сортировка по высоте (убывание) для shelf packing
  const sorted = [...unique].sort((a, b) => b.height - a.height);

  // Shelf packing: раскладываем в ряды
  const positions = new Map<HTMLCanvasElement, AtlasEntry>();
  let cursorX = PADDING;
  let cursorY = PADDING;
  let rowHeight = 0;
  let atlasW = 0;
  let atlasH = 0;

  // Первый проход: оценить ширину (сумма ширин худшего случая не годится,
  // поэтому растим атлас динамически и в конце фиксируем размер)
  const placed: Array<{ canvas: HTMLCanvasElement; x: number; y: number }> = [];

  for (const c of sorted) {
    // Если канвас не влезает в текущий ряд — перенос на новый ряд
    if (cursorX + c.width + PADDING > MAX_ATLAS_SIZE) {
      cursorY += rowHeight + PADDING;
      cursorX = PADDING;
      rowHeight = 0;
    }
    if (cursorY + c.height + PADDING > MAX_ATLAS_SIZE) {
      logger.error('tile-atlas', `Atlas overflow: canvas ${c.width}x${c.height} does not fit in ${MAX_ATLAS_SIZE}px atlas`);
      continue; // пропускаем (не должно случиться: тайлы маленькие)
    }

    positions.set(c, { x: cursorX, y: cursorY, w: c.width, h: c.height });
    placed.push({ canvas: c, x: cursorX, y: cursorY });

    cursorX += c.width + PADDING;
    if (c.height > rowHeight) rowHeight = c.height;
    if (cursorX > atlasW) atlasW = cursorX;
  }
  atlasH = cursorY + rowHeight + PADDING;

  // Рисуем канвасы в офскрин-канвас атласа
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = Math.max(atlasW, 1);
  atlasCanvas.height = Math.max(atlasH, 1);
  const actx = atlasCanvas.getContext('2d')!;
  actx.imageSmoothingEnabled = false;
  for (const p of placed) {
    actx.drawImage(p.canvas, p.x, p.y);
  }

  // Загружаем в GPU
  const texture = regl.texture({
    data: atlasCanvas,
    width: atlasCanvas.width,
    height: atlasCanvas.height,
    mag: 'nearest' as const,
    min: 'nearest' as const,
    wrapS: 'clamp' as const,
    wrapT: 'clamp' as const,
  });

  logger.info(
    'tile-atlas',
    `Built atlas ${atlasCanvas.width}x${atlasCanvas.height} from ${unique.length} unique canvases (${canvases.length} total refs)`
  );

  return {
    texture,
    width: atlasCanvas.width,
    height: atlasCanvas.height,
    entries: positions,
    keys: unique,
  };
}

// ============================================================
// Утилиты
// ============================================================

/**
 * Получить нормализованные UV-координаты региона (0..1).
 */
export function entryToUV(entry: AtlasEntry, atlasW: number, atlasH: number): { u0: number; v0: number; u1: number; v1: number } {
  return {
    u0: entry.x / atlasW,
    v0: entry.y / atlasH,
    u1: (entry.x + entry.w) / atlasW,
    v1: (entry.y + entry.h) / atlasH,
  };
}

/**
 * Уничтожить GPU-текстуру атласа.
 * (regl уничтожит её автоматически при regl.destroy(), но для смены карты
 * можно освободить заранее)
 */
export function destroyAtlas(atlas: TileAtlas): void {
  try {
    (atlas.texture as any).destroy?.();
  } catch {
    // некоторые версии regl не имеют destroy() у текстуры — игнорируем
  }
}
