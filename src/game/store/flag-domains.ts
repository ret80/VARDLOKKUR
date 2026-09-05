/* ============ Flag Domains — декомпозированные доменные группы флагов ============
 *
 * GameFlags разбит на доменные группы для улучшения типобезопасности и
 * уменьшения god object проблемы.
 *
 * Все группы собираются в GameFlags для обратной совместимости.
 */

// ── Инвентарь: оружие, улучшения ──

export interface InventoryFlags {
  hasSword: boolean;
  hasAxe: boolean;
  hasBow: boolean;
  hasHammer: boolean;
  hasKey: boolean;
  swordUp: boolean;
  axeUp: boolean;
  furyRune: boolean;
  nornsFavor: boolean;
}

// ── Ресурсы: здоровье, стрелы, руны, dew ──

export interface ResourceFlags {
  hearts: number;
  arrows: number;
  runes: number;
  dew: number;
  fogWaves: number;
}

// ── Квестовые предметы: bear, horn, mead, ore, и т.д. ──

export interface QuestItemFlags {
  bear: boolean;
  bearGone: boolean;
  horn: boolean;
  mead: boolean;
  ore: boolean;
  moss: boolean;
  amber: boolean;
  flower: boolean;
  diary: boolean;
  bundle: boolean;
  relic: boolean;
}

// ── Квесты: completed flags ──

export interface QuestFlags {
  hornDone: boolean;
  meadDone: boolean;
  oreDone: boolean;
  shamanDone: boolean;
  refugeeDone: boolean;
  merchantDone: boolean;
  atoneDone: boolean;
  cullDone: boolean;
  shrineQuestDone: boolean;
  huntDone: boolean;
}

// ── Убийства: боссы, счётчики ──

export interface KillFlags {
  reaperDead: boolean;
  spiderDead: boolean;
  giantDead: boolean;
  snakeStarted: boolean;
  snakeDead: boolean;
  killsByKind: Record<string, number>;
  kills: number;
  deaths: number;
}

// ── Мир: секреты, святилища ──

export interface WorldFlags {
  secretKnown: boolean;
  ghostBane: boolean;
  shrineIdx: number;
}

// ── Composed: полный набор GameFlags = все домены ──

/** Полный набор игровых флагов (composed из доменов) */
export interface GameFlags
  extends InventoryFlags,
          ResourceFlags,
          QuestItemFlags,
          QuestFlags,
          KillFlags,
          WorldFlags {}

/** Начальные значения для каждого домена */
export const INITIAL_FLAGS: GameFlags = {
  // Inventory
  hasSword: false,
  hasAxe: false,
  hasBow: false,
  hasHammer: false,
  hasKey: false,
  swordUp: false,
  axeUp: false,
  furyRune: false,
  nornsFavor: false,

  // Resources
  hearts: 2,
  arrows: 12,
  runes: 0,
  dew: 0,
  fogWaves: 0,

  // Quest Items
  bear: false,
  bearGone: false,
  horn: false,
  mead: false,
  ore: false,
  moss: false,
  amber: false,
  flower: false,
  diary: false,
  bundle: false,
  relic: false,

  // Quests
  hornDone: false,
  meadDone: false,
  oreDone: false,
  shamanDone: false,
  refugeeDone: false,
  merchantDone: false,
  atoneDone: false,
  cullDone: false,
  shrineQuestDone: false,
  huntDone: false,

  // Kills
  reaperDead: false,
  spiderDead: false,
  giantDead: false,
  snakeStarted: false,
  snakeDead: false,
  killsByKind: {},
  kills: 0,
  deaths: 0,

  // World
  secretKnown: false,
  ghostBane: false,
  shrineIdx: -1,
};

/** Типы для доступа к доменам */
export type FlagDomainKey = keyof GameFlags;

/** Map доменных групп к их типам */
export interface FlagDomainMap {
  inventory: Partial<InventoryFlags>;
  resources: Partial<ResourceFlags>;
  questItems: Partial<QuestItemFlags>;
  quests: Partial<QuestFlags>;
  kills: Partial<KillFlags>;
  world: Partial<WorldFlags>;
}

/** Получить доменную группу из GameFlags */
export function getFlagDomain<K extends keyof FlagDomainMap>(
  flags: GameFlags,
  domain: K
): FlagDomainMap[K] {
  const keys = getDomainKeys(domain);
  const result = {} as FlagDomainMap[K];
  for (const key of keys) {
    (result as any)[key] = (flags as any)[key];
  }
  return result;
}

function getDomainKeys<K extends keyof FlagDomainMap>(domain: K): string[] {
  switch (domain) {
    case 'inventory':
      return ['hasSword', 'hasAxe', 'hasBow', 'hasHammer', 'hasKey',
              'swordUp', 'axeUp', 'furyRune', 'nornsFavor'];
    case 'resources':
      return ['hearts', 'arrows', 'runes', 'dew', 'fogWaves'];
    case 'questItems':
      return ['bear', 'bearGone', 'horn', 'mead', 'ore', 'moss',
              'amber', 'flower', 'diary', 'bundle', 'relic'];
    case 'quests':
      return ['hornDone', 'meadDone', 'oreDone', 'shamanDone', 'refugeeDone',
              'merchantDone', 'atoneDone', 'cullDone', 'shrineQuestDone', 'huntDone'];
    case 'kills':
      return ['reaperDead', 'spiderDead', 'giantDead', 'snakeStarted', 'snakeDead',
              'killsByKind', 'kills', 'deaths'];
    case 'world':
      return ['secretKnown', 'ghostBane', 'shrineIdx'];
    default:
      return [];
  }
}
