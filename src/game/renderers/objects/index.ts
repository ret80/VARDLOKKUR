/* renderers/objects/index.ts — реестры рендереров объектов окружения (OCP) */

import { RendererRegistry } from "../core/registry";
import type { IChestData } from "../../models";
import type { IPedestalData } from "../../models";
import type { IShrineData } from "../../models";
import type { IDoorData } from "../../models";
import type { IBarrierData } from "../../models";
import type { IAltarData } from "../../models";

import { ChestRenderer } from "./ChestRenderer";
import { PedestalRenderer } from "./PedestalRenderer";
import { ShrineRenderer } from "./ShrineRenderer";
import { DoorRenderer } from "./DoorRenderer";
import { BarrierRenderer } from "./BarrierRenderer";
import { AltarRenderer } from "./AltarRenderer";

// Каждый тип объекта имеет ровно один рендерер — регим под ключом "default"
export const chestRegistry = new RendererRegistry<string, IChestData>()
  .register("default", new ChestRenderer());

export const pedestalRegistry = new RendererRegistry<string, IPedestalData>()
  .register("default", new PedestalRenderer());

export const shrineRegistry = new RendererRegistry<string, IShrineData>()
  .register("default", new ShrineRenderer());

export const doorRegistry = new RendererRegistry<string, IDoorData>()
  .register("default", new DoorRenderer());

export const barrierRegistry = new RendererRegistry<string, IBarrierData>()
  .register("default", new BarrierRenderer());

export const altarRegistry = new RendererRegistry<string, IAltarData>()
  .register("default", new AltarRenderer());

// Также экспортируем сами классы (для обратной совместимости)
export * from "./ChestRenderer";
export * from "./PedestalRenderer";
export * from "./ShrineRenderer";
export * from "./DoorRenderer";
export * from "./BarrierRenderer";
export * from "./AltarRenderer";
