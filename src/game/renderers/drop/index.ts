/* renderers/drop/index.ts — dropRegistry: регистрация всех видов дропов (OCP) */

import { RendererRegistry } from "../core/registry";
import type { IDropData } from "../../models";
import { HeartRenderer } from "./HeartRenderer";
import { ArrowsDropRenderer } from "./ArrowsDropRenderer";
import { RuneRenderer } from "./RuneRenderer";
import { AxeDropRenderer } from "./AxeDropRenderer";
import { SwordDropRenderer } from "./SwordDropRenderer";
import { BearRenderer } from "./BearRenderer";
import { HammerRenderer } from "./HammerRenderer";
import { BowRenderer } from "./BowRenderer";
import { HornRenderer } from "./HornRenderer";
import { MeadRenderer } from "./MeadRenderer";
import { OreRenderer } from "./OreRenderer";
import { MossRenderer } from "./MossRenderer";
import { AmberRenderer } from "./AmberRenderer";
import { FlowerRenderer } from "./FlowerRenderer";
import { DiaryRenderer } from "./DiaryRenderer";
import { BundleRenderer } from "./BundleRenderer";
import { RelicRenderer } from "./RelicRenderer";
import { ShardRenderer } from "./ShardRenderer";
import { BonesRenderer } from "./BonesRenderer";
import { DewRenderer } from "./DewRenderer";

export const dropRegistry = new RendererRegistry<string, IDropData>()
  .register("heart", new HeartRenderer())
  .register("arrows", new ArrowsDropRenderer())
  .register("rune", new RuneRenderer())
  .register("axe", new AxeDropRenderer())
  .register("sword", new SwordDropRenderer())
  .register("bear", new BearRenderer())
  .register("hammer", new HammerRenderer())
  .register("bow", new BowRenderer())
  .register("horn", new HornRenderer())
  .register("mead", new MeadRenderer())
  .register("ore", new OreRenderer())
  .register("moss", new MossRenderer())
  .register("amber", new AmberRenderer())
  .register("flower", new FlowerRenderer())
  .register("diary", new DiaryRenderer())
  .register("bundle", new BundleRenderer())
  .register("relic", new RelicRenderer())
  .register("shard", new ShardRenderer())
  .register("bones", new BonesRenderer())
  .register("dew", new DewRenderer());
