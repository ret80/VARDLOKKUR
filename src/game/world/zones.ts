/* zones.ts — константы и утилиты зон мира */

import type { WorldData } from '../generators/types';
import { T } from '../generators/types';
import { zoneFor } from '../generators/utils';

export enum VillageZone {
  SurvivorsSettlement = 'Поселение выживших',
  RavensHaven = 'Воронья Гавань',
}

export const VILLAGE_ZONE_NAMES = new Set<string>(Object.values(VillageZone));

export function isVillageZoneName(name: string | null | undefined): boolean {
  if (!name) return false;
  return VILLAGE_ZONE_NAMES.has(name);
}

export function isPlayerInVillage(
  map: WorldData,
  playerX: number,
  playerY: number
): boolean {
  const zone = zoneFor(map, Math.floor(playerX / T), Math.floor(playerY / T));
  return isVillageZoneName(zone);
}
