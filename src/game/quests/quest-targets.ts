/* ============ Quest Targets — Strategy Pattern ============ */

import { Vec, T, WorldData } from "../world";
import { GameStore } from "../store";
import { FlagDomain } from "../store/flag-domain";
import { query } from "bitecs";

/** Контекст для резолвера цели квеста. */
interface TargetContext {
  flags: FlagDomain;
  map: WorldData | null;
  store: GameStore;
  visitedShrines: Set<number>;
  ow: WorldData | null;
}

/** Получить всех живых врагов из ECS */
function getAliveEnemiesEcs(ctx: TargetContext): Array<{ kind: string; x: number; y: number }> {
  const world = ctx.store.ecsWorld;
  if (!world) return [];
  const { Enemy, Dead, Position } = require('../ecs/ecs-components');
  const result: Array<{ kind: string; x: number; y: number }> = [];
  for (const eid of query(world, [Enemy])) {
    if (!Dead[eid]) {
      result.push({ kind: Enemy[eid].kind, x: Position.x[eid], y: Position.y[eid] });
    }
  }
  return result;
}

/** Получить все незатронутые пьедесталы из ECS */
function getUntakenPedestalsEcs(ctx: TargetContext): Array<{ x: number; y: number }> {
  const world = ctx.store.ecsWorld;
  if (!world) return [];
  const { Pedestal, Position } = require('../ecs/ecs-components');
  const result: Array<{ x: number; y: number }> = [];
  for (const eid of query(world, [Pedestal])) {
    if (!Pedestal[eid].taken) {
      result.push({ x: Position.x[eid], y: Position.y[eid] });
    }
  }
  return result;
}

/** Фабрика резолвера цели квеста. */
type TargetResolver = (ctx: TargetContext) => Vec | null;

/* ---- helpers ---- */

function px(v: Vec): Vec {
  return { x: v.x * T + 8, y: v.y * T + 8 };
}

function nearestOf(player: { x: number; y: number }, pts: Vec[]): Vec | null {
  let best: Vec | null = null;
  let bd = Infinity;
  for (const pt of pts) {
    const d2 = (pt.x - player.x) ** 2 + (pt.y - player.y) ** 2;
    if (d2 < bd) { bd = d2; best = pt; }
  }
  return best;
}

function dungeonTarget(map: WorldData | null, id: number): Vec | null {
  if (!map) return null;
  if (map.isDungeon) {
    return map.dungeonId === id
      ? { x: map.bossRoom.x + map.bossRoom.w / 2, y: map.bossRoom.y + map.bossRoom.h / 2 }
      : null;
  }
  const en = map.dungeonEntries.find((e) => e.id === id);
  return en ? px(en) : null;
}

function npcSpot(ow: WorldData | null, id: string): Vec | null {
  if (!ow) return null;
  const n = ow.npcs.find((x: { id: string }) => x.id === id);
  return n ? px(n) : null;
}

/* ---- resolvers per quest ---- */

const RESOLVERS: Record<string, TargetResolver> = {
  m1(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon) return null;
    return npcSpot(ctx.ow, "eirik") ?? px(ctx.map.villageA);
  },

  m2(ctx) { return dungeonTarget(ctx.map, 0); },
  m3(ctx) { return dungeonTarget(ctx.map, 1); },

  m4(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon) return null;
    const pedestals = getUntakenPedestalsEcs(ctx);
    return pedestals.length ? nearestOf(ctx.store.player, pedestals) : null;
  },

  m5(ctx) { return dungeonTarget(ctx.map, 2); },

  m6(ctx) {
    // Ищем босса змея (Ёрмунганд) через ECS
    const world = ctx.store.ecsWorld;
    if (world) {
      const { Enemy, Dead, Position } = require('../ecs/ecs-components');
      for (const eid of query(world, [Enemy])) {
        if (!Dead[eid] && Enemy[eid].kind === 'snake') {
          return { x: Position.x[eid], y: Position.y[eid] };
        }
      }
    }
    if (!ctx.map) return null;
    if (ctx.map.isDungeon) return null;
    return px(ctx.map.treeAltar);
  },

  s_bear(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.bearGone) return null;
    if (ctx.flags.hasQuestItem("bear")) return npcSpot(ctx.ow, "daughter");
    return px(ctx.map.bearSpot);
  },

  s_horn(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.isQuestDone("hornDone")) return null;
    if (ctx.flags.hasQuestItem("horn")) return npcSpot(ctx.ow, "sigrid");
    return px(ctx.map.hornSpot);
  },

  s_mead(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.isQuestDone("meadDone")) return null;
    if (ctx.flags.hasQuestItem("mead")) return npcSpot(ctx.ow, "astrid");
    return px(ctx.map.meadSpot);
  },

  s_ore(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.isQuestDone("oreDone")) return null;
    if (ctx.flags.hasQuestItem("ore")) return npcSpot(ctx.ow, "harald");
    return px(ctx.map.oreSpot);
  },

  s_moss(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.isQuestDone("shamanDone")) return null;
    if (ctx.flags.hasQuestItem("moss") && ctx.flags.hasQuestItem("amber") && ctx.flags.hasQuestItem("flower")) {
      return npcSpot(ctx.ow, "shaman");
    }
    const spots: Vec[] = [];
    if (!ctx.flags.hasQuestItem("moss")) spots.push(px(ctx.map.mossSpot));
    if (!ctx.flags.hasQuestItem("amber")) spots.push(px(ctx.map.amberSpot));
    if (!ctx.flags.hasQuestItem("flower")) spots.push(px(ctx.map.flowerSpot));
    return nearestOf(ctx.store.player, spots);
  },

  s_diary(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.isQuestDone("refugeeDone")) return null;
    if (ctx.flags.hasQuestItem("diary")) return npcSpot(ctx.ow, "refugee");
    return px(ctx.map.diarySpot);
  },

  s_cull(ctx) {
    const alive = getAliveEnemiesEcs(ctx).filter((e) => e.kind === "varg" || e.kind === "draugr");
    return alive.length ? nearestOf(ctx.store.player, alive) : null;
  },

  s_bundle(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.isQuestDone("merchantDone")) return null;
    if (ctx.flags.hasQuestItem("bundle")) return npcSpot(ctx.ow, "merchant");
    return px(ctx.map.bundleSpot);
  },

  s_atone(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.isQuestDone("atoneDone")) return null;
    if (ctx.flags.hasQuestItem("relic")) return px(ctx.map.oldAltar);
    return px(ctx.map.relicSpot);
  },

  s_shrines(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon) return null;
    const unv = ctx.map.shrines
      .filter((_: any, i: number) => !ctx.visitedShrines.has(i))
      .map((s: any) => px(s));
    return unv.length ? nearestOf(ctx.store.player, unv) : null;
  },

  s_hunt(ctx) {
    const alive = getAliveEnemiesEcs(ctx).filter((e) => e.kind !== "snake");
    return alive.length ? nearestOf(ctx.store.player, alive) : null;
  },

  s_ghost(ctx) {
    if (!ctx.map) return null;
    if (ctx.map.isDungeon || ctx.flags.ghostBane) return null;
    if (ctx.flags.getDew() >= 3) return npcSpot(ctx.ow, "shaman");
    return null;
  },
};

/**
 * Resolve target coordinate for a tracked quest by ID.
 * Returns null if the quest has no target or is not tracked.
 */
export function resolveQuestTarget(
  questId: string,
  ctx: Omit<TargetContext, "flags"> & { flags: FlagDomain },
): Vec | null {
  const resolver = RESOLVERS[questId];
  return resolver ? resolver(ctx) : null;
}
