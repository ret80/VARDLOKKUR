/* ============ QuestTracker ============ */

import { Vec, WorldData } from "../world";
import { GameStore } from "../store";
import { FlagDomain } from "../store/flag-domain";
import { findQuestDef } from "./quest-definitions";
import { resolveQuestTarget } from "./quest-targets";

/** Интерфейс трекера квестов (цель стрелки + заголовок). */
export interface IQuestTracker {
  /** Координаты цели для текущего отслеживаемого квеста. */
  trackedTarget(): Vec | null;
  /** Заголовок текущего отслеживаемого квеста. */
  trackedTitle(): string;
}

/**
 * Отвечает только за определение координат цели стрелки
 * и заголовка текущего квеста.
 *
 * Выделен из QuestSystem для соблюдения SRP.
 * Логика резоллинга каждой цели вынесена в quest-targets.ts (Strategy pattern).
 */
export class QuestTracker implements IQuestTracker {
  private store: GameStore;
  private flags: FlagDomain;
  private map: WorldData | null;
  private visitedShrines: Set<number>;
  private ow: WorldData | null;

  constructor(
    store: GameStore,
    flags: FlagDomain,
    map: WorldData | null,
    visitedShrines: Set<number>,
    ow: WorldData | null,
  ) {
    this.store = store;
    this.flags = flags;
    this.map = map;
    this.visitedShrines = visitedShrines;
    this.ow = ow;
  }

  /* ---- public ---- */

  trackedTarget(): Vec | null {
    const questId = this.store.trackedQuest;
    if (!questId) return null;

    return resolveQuestTarget(questId, {
      flags: this.flags,
      map: this.map,
      store: this.store,
      visitedShrines: this.visitedShrines,
      ow: this.ow,
    });
  }

  trackedTitle(): string {
    const def = findQuestDef(this.store.trackedQuest);
    return def ? def.title : "Сага";
  }
}
