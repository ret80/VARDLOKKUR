/* EnemyBehavior — интерфейс и registry для паттерна Strategy */

import type { Enemy } from "../entities";
import type { WorldData, Vec } from "../world";
import type { IPhysics } from "./physics-system";
import type { EventBus } from "../event-bus";
import type { GameStore } from "../store";
import type { EnemyKind } from "../world";

export interface EnemyBehavior {
  update(
    e: Enemy,
    dt: number,
    player: { x: number; y: number; r: number },
    map: WorldData,
    physics: IPhysics,
    bus: EventBus,
    store: GameStore,
    inVillage: boolean,
    realT: number,
  ): void;
}

export type EnemyKindMap = Record<EnemyKind, EnemyBehavior>;

export class BehaviorRegistry {
  private behaviors = new Map<EnemyKind, EnemyBehavior>();

  register(kind: EnemyKind, behavior: EnemyBehavior) {
    this.behaviors.set(kind, behavior);
  }

  get(kind: EnemyKind): EnemyBehavior | undefined {
    return this.behaviors.get(kind);
  }

  has(kind: EnemyKind): boolean {
    return this.behaviors.has(kind);
  }
}
