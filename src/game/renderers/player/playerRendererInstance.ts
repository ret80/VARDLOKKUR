/* renderers/player/playerRendererInstance.ts — синглтон PlayerRenderer (OCP: создаётся один раз) */

import { PlayerRenderer } from "./PlayerRenderer";

export const playerRenderer = new PlayerRenderer();
