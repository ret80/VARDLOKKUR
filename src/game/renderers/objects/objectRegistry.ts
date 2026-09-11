/* renderers/objects/objectRegistry.ts — единый реестр рендереров объектов окружения.
 *
 * Экземпляры рендереров создаются ОДИН РАЗ при загрузке модуля и переиспользуются
 * каждый кадр (рендереры stateless — всё состояние приходит через data/ctx).
 * Это устраняет аллокации `new *Renderer()` внутри игрового цикла.
 */

import { RendererRegistry } from "../core/registry";

import { ChestRenderer } from "./ChestRenderer";
import { PedestalRenderer } from "./PedestalRenderer";
import { ShrineRenderer } from "./ShrineRenderer";
import { DoorRenderer } from "./DoorRenderer";
import { BarrierRenderer } from "./BarrierRenderer";
import { AltarRenderer } from "./AltarRenderer";

// Синглтоны рендереров — единый источник экземплясов для objectRegistry.
export const chestRenderer = new ChestRenderer();
export const pedestalRenderer = new PedestalRenderer();
export const shrineRenderer = new ShrineRenderer();
export const doorRenderer = new DoorRenderer();
export const barrierRenderer = new BarrierRenderer();
export const altarRenderer = new AltarRenderer();

/**
 * Единый реестр объектов окружения по строковому ключу.
 * Данные передаются как any — конкретный тип data задаётся маппером в диспетчере
 * renderObjectsEcs (см. ecs-systems/render-system.ts).
 */
export const objectRegistry = new RendererRegistry<string, any>()
  .register("chest", chestRenderer)
  .register("pedestal", pedestalRenderer)
  .register("shrine", shrineRenderer)
  .register("door", doorRenderer)
  .register("barrier", barrierRenderer)
  .register("altar", altarRenderer);
