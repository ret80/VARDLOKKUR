/* renderers/index.ts — barrel-экспорт всех рендереров (SOLID: DIP) */

export * from "./core/types";
export * from "./core/registry";
export * from "./core/primitives";

export * from "./player/PlayerRenderer";
export * from "./enemy/index";
export * from "./npc/index";
export * from "./drop/index";
export * from "./projectile/index";
export * from "./objects/index";
export * from "./float/index";
