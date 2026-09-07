/* renderers/npc/index.ts — npcRegistry: регистрация всех видов NPC (OCP) */

import { RendererRegistry } from "../core/registry";
import type { INpcData } from "../../models";
import { EirikRenderer } from "./EirikRenderer";
import { AstridRenderer } from "./AstridRenderer";
import { HaraldRenderer } from "./HaraldRenderer";
import { RavenNpcRenderer } from "./RavenNpcRenderer";
import { DaughterRenderer } from "./DaughterRenderer";
import { SoulRenderer } from "./SoulRenderer";
import { GenericNpcRenderer } from "./GenericNpcRenderer";

export const npcRegistry = new RendererRegistry<string, INpcData>()
  .register("eirik", new EirikRenderer())
  .register("astrid", new AstridRenderer())
  .register("harald", new HaraldRenderer())
  .register("raven", new RavenNpcRenderer())
  .register("daughter", new DaughterRenderer())
  .register("soul", new SoulRenderer())
  .register("default", new GenericNpcRenderer());
