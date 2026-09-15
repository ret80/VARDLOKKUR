/* renderer/index.ts — переэкспорт всех публичных API модуля рендерера */

export type {
  IRenderer,
  SpriteHandle,
  GraphicsHandle,
  LayerHandle,
  TextureHandle,
  ShaderHandle,
  UIElementHandle,
  SpriteCreateOptions,
  Vec2,
  Rect,
  Color,
} from './IRenderer';

export { PixiJSRenderer } from './PixiJSRenderer';

export type { RendererType } from './RendererFactory';
export {
  RendererFactory,
  setGlobalRenderer,
  getRenderer,
  isRendererInitialized,
  resetGlobalRenderer,
} from './RendererFactory';
