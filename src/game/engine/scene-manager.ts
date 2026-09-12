/* scene-manager.ts – Управление слоями сцены
   Этап 6: удалён import { Application, Container, Graphics } из pixi.js.
   Класс превращён в заглушку — слои больше не используются. */

export class SceneManager {
  /** @deprecated — Этап 6: tileLayer удалён */
  readonly tileLayer = { addChild: () => {}, addChildAt: () => {}, removeChildren: () => {} };
  /** @deprecated — Этап 6: world удалён */
  readonly world = { addChild: () => {}, removeChildren: () => {} };
  /** @deprecated — Этап 6: dynamic удалён */
  readonly dynamic = { addChild: () => {}, removeChildren: () => {}, children: [] };
  /** @deprecated — Этап 6: fxWorld удалён */
  readonly fxWorld = { addChild: () => {}, removeChildren: () => {} };
  /** @deprecated — Этап 6: floatLayer удалён */
  readonly floatLayer = { addChild: () => {}, removeChildren: () => {} };
  /** @deprecated — Этап 6: fxScreen удалён */
  readonly fxScreen = {};
  /** @deprecated — Этап 6: fadeG удалён */
  readonly fadeG = {};

  constructor(_app: unknown) {
    // Этап 6: Application больше не нужен
  }

  /** Добавить все слои в stage — заглушка (Этап 6) */
  attachToStage(): void {
    // Этап 6: слои больше не добавляются в PixiJS stage
  }

  /** Добавить FX-график — заглушка (Этап 6) */
  addFxGraphics(_g: unknown): void {
    // Этап 6: FX графика через PrimitiveBatcher
  }

  /** Добавить FX Screen Child — заглушка (Этап 6) */
  addFxScreenChild(_child: unknown): void {
    // Этап 6: FX screen больше не используется
  }

  /** Очистить dynamic контейнер — заглушка (Этап 6) */
  cleanupDestroyedSprites(_dc: { children: any[]; removeChild(child: any): void }): void {
    // Этап 6: больше не нужно
  }

  /** Очистить tileLayer — заглушка (Этап 6) */
  clearTiles(): void {
    // Этап 6: тайлы рендерятся через batchers
  }

  /** Очистить dynamic контейнер — заглушка (Этап 6) */
  clearDynamic(_preservePlayerG?: unknown): void {
    // Этап 6: больше не нужно
  }

  /** Очистить floatLayer — заглушка (Этап 6) */
  clearFloatLayer(): void {
    // Этап 6: больше не нужно
  }

  /** Уничтожить все слои — заглушка (Этап 6) */
  destroy(): void {
    // Этап 6: слои больше не используются
  }
}
