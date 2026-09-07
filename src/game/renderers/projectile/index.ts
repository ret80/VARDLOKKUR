/* renderers/projectile/index.ts — projectileRegistry: регистрация всех видов снарядов (OCP) */

import { RendererRegistry } from "../core/registry";
import type { IProjectileData } from "../../models";
import { ArrowProjectileRenderer } from "./ArrowProjectileRenderer";
import { AxeProjectileRenderer } from "./AxeProjectileRenderer";
import { SporeProjectileRenderer } from "./SporeProjectileRenderer";
import { FireProjectileRenderer } from "./FireProjectileRenderer";

export const projectileRegistry = new RendererRegistry<string, IProjectileData>()
  .register("arrow", new ArrowProjectileRenderer())
  .register("axe", new AxeProjectileRenderer())
  .register("spore", new SporeProjectileRenderer())
  .register("fire", new FireProjectileRenderer());
