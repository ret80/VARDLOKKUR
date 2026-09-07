/* renderers/enemy/index.ts — enemyRegistry: регистрация всех видов врагов (OCP) */

import { RendererRegistry } from "../core/registry";
import type { IEnemyData } from "../../models";
import { DraugrRenderer } from "./DraugrRenderer";
import { VargRenderer } from "./VargRenderer";
import { RavenRenderer } from "./RavenRenderer";
import { ShroomRenderer } from "./ShroomRenderer";
import { CrawlerRenderer } from "./CrawlerRenderer";
import { FrostRenderer } from "./FrostRenderer";
import { ReaperRenderer } from "./ReaperRenderer";
import { SpiderRenderer } from "./SpiderRenderer";
import { GiantRenderer } from "./GiantRenderer";
import { SnakeRenderer } from "./SnakeRenderer";
import { GhostRenderer } from "./GhostRenderer";

export const enemyRegistry = new RendererRegistry<string, IEnemyData>()
  .register("draugr", new DraugrRenderer())
  .register("varg", new VargRenderer())
  .register("raven", new RavenRenderer())
  .register("shroom", new ShroomRenderer())
  .register("crawler", new CrawlerRenderer())
  .register("frost", new FrostRenderer())
  .register("reaper", new ReaperRenderer())
  .register("spider", new SpiderRenderer())
  .register("giant", new GiantRenderer())
  .register("snake", new SnakeRenderer())
  .register("ghost", new GhostRenderer());
