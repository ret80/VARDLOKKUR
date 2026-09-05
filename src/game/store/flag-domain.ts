/* ============ FlagDomain — типизированная модель игровых флагов ============ */

/** Полные игровые флаги */
export interface GameFlags {
  hasSword: boolean;
  hasAxe: boolean;
  hasBow: boolean;
  hasHammer: boolean;
  hasKey: boolean;
  swordUp: boolean;
  axeUp: boolean;
  furyRune: boolean;
  nornsFavor: boolean;
  hearts: number;
  arrows: number;
  runes: number;
  bear: boolean;
  bearGone: boolean;
  horn: boolean;
  hornDone: boolean;
  mead: boolean;
  meadDone: boolean;
  ore: boolean;
  oreDone: boolean;
  moss: boolean;
  amber: boolean;
  flower: boolean;
  shamanDone: boolean;
  diary: boolean;
  refugeeDone: boolean;
  secretKnown: boolean;
  bundle: boolean;
  merchantDone: boolean;
  relic: boolean;
  atoneDone: boolean;
  cullDone: boolean;
  killsByKind: Record<string, number>;
  reaperDead: boolean;
  spiderDead: boolean;
  giantDead: boolean;
  snakeStarted: boolean;
  snakeDead: boolean;
  ghostBane: boolean;
  dew: number;
  fogWaves: number;
  kills: number;
  deaths: number;
  shrineIdx: number;
  shrineQuestDone: boolean;
  huntDone: boolean;
}

/** Domain-модель флагов с типизированными методами */
export class FlagDomain {
  private flags: GameFlags;

  constructor(flags: GameFlags) {
    this.flags = flags;
  }

  /** Обновить ссылку на объект флагов */
  setFlags(flags: GameFlags): void {
    this.flags = flags;
  }

  // ── Предметы ──

  hasItem(item: "sword"): boolean;
  hasItem(item: "axe"): boolean;
  hasItem(item: "bow"): boolean;
  hasItem(item: "hammer"): boolean;
  hasItem(item: "key"): boolean;
  hasItem(item: string): boolean {
    switch (item) {
      case "sword": return this.flags.hasSword;
      case "axe": return this.flags.hasAxe;
      case "bow": return this.flags.hasBow;
      case "hammer": return this.flags.hasHammer;
      case "key": return this.flags.hasKey;
      default: return false;
    }
  }

  hasEnhancement(en: "swordUp"): boolean;
  hasEnhancement(en: "axeUp"): boolean;
  hasEnhancement(en: "furyRune"): boolean;
  hasEnhancement(en: "nornsFavor"): boolean;
  hasEnhancement(en: string): boolean {
    switch (en) {
      case "swordUp": return this.flags.swordUp;
      case "axeUp": return this.flags.axeUp;
      case "furyRune": return this.flags.furyRune;
      case "nornsFavor": return this.flags.nornsFavor;
      default: return false;
    }
  }

  // ── Ресурсы ──

  getArrows(): number { return this.flags.arrows; }
  getRunes(): number { return this.flags.runes; }
  getHearts(): number { return this.flags.hearts; }
  getDew(): number { return this.flags.dew ?? 0; }

  // ── Квесты ──

  hasQuestItem(item: "bear"): boolean;
  hasQuestItem(item: "horn"): boolean;
  hasQuestItem(item: "mead"): boolean;
  hasQuestItem(item: "ore"): boolean;
  hasQuestItem(item: "moss"): boolean;
  hasQuestItem(item: "amber"): boolean;
  hasQuestItem(item: "flower"): boolean;
  hasQuestItem(item: "diary"): boolean;
  hasQuestItem(item: "bundle"): boolean;
  hasQuestItem(item: "relic"): boolean;
  hasQuestItem(item: string): boolean {
    switch (item) {
      case "bear": return this.flags.bear;
      case "horn": return this.flags.horn;
      case "mead": return this.flags.mead;
      case "ore": return this.flags.ore;
      case "moss": return this.flags.moss;
      case "amber": return this.flags.amber;
      case "flower": return this.flags.flower;
      case "diary": return this.flags.diary;
      case "bundle": return this.flags.bundle;
      case "relic": return this.flags.relic;
      default: return false;
    }
  }

  isQuestDone(quest: "hornDone"): boolean;
  isQuestDone(quest: "meadDone"): boolean;
  isQuestDone(quest: "oreDone"): boolean;
  isQuestDone(quest: "shamanDone"): boolean;
  isQuestDone(quest: "refugeeDone"): boolean;
  isQuestDone(quest: "merchantDone"): boolean;
  isQuestDone(quest: "atoneDone"): boolean;
  isQuestDone(quest: "cullDone"): boolean;
  isQuestDone(quest: string): boolean {
    switch (quest) {
      case "hornDone": return this.flags.hornDone;
      case "meadDone": return this.flags.meadDone;
      case "oreDone": return this.flags.oreDone;
      case "shamanDone": return this.flags.shamanDone;
      case "refugeeDone": return this.flags.refugeeDone;
      case "merchantDone": return this.flags.merchantDone;
      case "atoneDone": return this.flags.atoneDone;
      case "cullDone": return this.flags.cullDone;
      default: return false;
    }
  }

  isQuestCompleted(quest: "shrineQuest"): boolean;
  isQuestCompleted(quest: "hunt"): boolean;
  isQuestCompleted(quest: string): boolean {
    switch (quest) {
      case "shrineQuest": return this.flags.shrineQuestDone;
      case "hunt": return this.flags.huntDone;
      default: return false;
    }
  }

  // ── Убийства ──

  getKillCount(kind: string): number { return this.flags.killsByKind[kind] ?? 0; }
  getTotalKills(): number { return this.flags.kills; }
  getDeaths(): number { return this.flags.deaths; }

  isBossDead(boss: "reaper"): boolean;
  isBossDead(boss: "spider"): boolean;
  isBossDead(boss: "giant"): boolean;
  isBossDead(boss: "snake"): boolean;
  isBossDead(boss: string): boolean {
    switch (boss) {
      case "reaper": return this.flags.reaperDead;
      case "spider": return this.flags.spiderDead;
      case "giant": return this.flags.giantDead;
      case "snake": return this.flags.snakeDead;
      default: return false;
    }
  }

  // ── Прямой доступ к флагам (для обратной совместимости) ──

  get hasSword(): boolean { return this.flags.hasSword; } set hasSword(v: boolean) { this.flags.hasSword = v; }
  get hasAxe(): boolean { return this.flags.hasAxe; } set hasAxe(v: boolean) { this.flags.hasAxe = v; }
  get hasBow(): boolean { return this.flags.hasBow; } set hasBow(v: boolean) { this.flags.hasBow = v; }
  get hasHammer(): boolean { return this.flags.hasHammer; } set hasHammer(v: boolean) { this.flags.hasHammer = v; }
  get hasKey(): boolean { return this.flags.hasKey; } set hasKey(v: boolean) { this.flags.hasKey = v; }
  get swordUp(): boolean { return this.flags.swordUp; } set swordUp(v: boolean) { this.flags.swordUp = v; }
  get axeUp(): boolean { return this.flags.axeUp; } set axeUp(v: boolean) { this.flags.axeUp = v; }
  get furyRune(): boolean { return this.flags.furyRune; } set furyRune(v: boolean) { this.flags.furyRune = v; }
  get nornsFavor(): boolean { return this.flags.nornsFavor; } set nornsFavor(v: boolean) { this.flags.nornsFavor = v; }
  get hearts(): number { return this.flags.hearts; } set hearts(v: number) { this.flags.hearts = v; }
  get arrows(): number { return this.flags.arrows; } set arrows(v: number) { this.flags.arrows = v; }
  get runes(): number { return this.flags.runes; } set runes(v: number) { this.flags.runes = v; }
  get bear(): boolean { return this.flags.bear; } set bear(v: boolean) { this.flags.bear = v; }
  get bearGone(): boolean { return this.flags.bearGone; } set bearGone(v: boolean) { this.flags.bearGone = v; }
  get horn(): boolean { return this.flags.horn; } set horn(v: boolean) { this.flags.horn = v; }
  get hornDone(): boolean { return this.flags.hornDone; } set hornDone(v: boolean) { this.flags.hornDone = v; }
  get mead(): boolean { return this.flags.mead; } set mead(v: boolean) { this.flags.mead = v; }
  get meadDone(): boolean { return this.flags.meadDone; } set meadDone(v: boolean) { this.flags.meadDone = v; }
  get ore(): boolean { return this.flags.ore; } set ore(v: boolean) { this.flags.ore = v; }
  get oreDone(): boolean { return this.flags.oreDone; } set oreDone(v: boolean) { this.flags.oreDone = v; }
  get moss(): boolean { return this.flags.moss; } set moss(v: boolean) { this.flags.moss = v; }
  get amber(): boolean { return this.flags.amber; } set amber(v: boolean) { this.flags.amber = v; }
  get flower(): boolean { return this.flags.flower; } set flower(v: boolean) { this.flags.flower = v; }
  get shamanDone(): boolean { return this.flags.shamanDone; } set shamanDone(v: boolean) { this.flags.shamanDone = v; }
  get diary(): boolean { return this.flags.diary; } set diary(v: boolean) { this.flags.diary = v; }
  get refugeeDone(): boolean { return this.flags.refugeeDone; } set refugeeDone(v: boolean) { this.flags.refugeeDone = v; }
  get secretKnown(): boolean { return this.flags.secretKnown; } set secretKnown(v: boolean) { this.flags.secretKnown = v; }
  get bundle(): boolean { return this.flags.bundle; } set bundle(v: boolean) { this.flags.bundle = v; }
  get merchantDone(): boolean { return this.flags.merchantDone; } set merchantDone(v: boolean) { this.flags.merchantDone = v; }
  get relic(): boolean { return this.flags.relic; } set relic(v: boolean) { this.flags.relic = v; }
  get atoneDone(): boolean { return this.flags.atoneDone; } set atoneDone(v: boolean) { this.flags.atoneDone = v; }
  get cullDone(): boolean { return this.flags.cullDone; } set cullDone(v: boolean) { this.flags.cullDone = v; }
  get killsByKind(): Record<string, number> { return this.flags.killsByKind; }
  get reaperDead(): boolean { return this.flags.reaperDead; } set reaperDead(v: boolean) { this.flags.reaperDead = v; }
  get spiderDead(): boolean { return this.flags.spiderDead; } set spiderDead(v: boolean) { this.flags.spiderDead = v; }
  get giantDead(): boolean { return this.flags.giantDead; } set giantDead(v: boolean) { this.flags.giantDead = v; }
  get snakeStarted(): boolean { return this.flags.snakeStarted; } set snakeStarted(v: boolean) { this.flags.snakeStarted = v; }
  get snakeDead(): boolean { return this.flags.snakeDead; } set snakeDead(v: boolean) { this.flags.snakeDead = v; }
  get ghostBane(): boolean { return this.flags.ghostBane; } set ghostBane(v: boolean) { this.flags.ghostBane = v; }
  get dew(): number { return this.flags.dew ?? 0; } set dew(v: number) { this.flags.dew = v; }
  get fogWaves(): number { return this.flags.fogWaves; } set fogWaves(v: number) { this.flags.fogWaves = v; }
  get kills(): number { return this.flags.kills; } set kills(v: number) { this.flags.kills = v; }
  get deaths(): number { return this.flags.deaths; } set deaths(v: number) { this.flags.deaths = v; }
  get shrineIdx(): number { return this.flags.shrineIdx; } set shrineIdx(v: number) { this.flags.shrineIdx = v; }
  get shrineQuestDone(): boolean { return this.flags.shrineQuestDone; } set shrineQuestDone(v: boolean) { this.flags.shrineQuestDone = v; }
  get huntDone(): boolean { return this.flags.huntDone; } set huntDone(v: boolean) { this.flags.huntDone = v; }

  // ── Мутаторы ──

  setFlag<K extends keyof GameFlags>(key: K, value: GameFlags[K]): void {
    this.flags[key] = value;
  }

  incrementFlag<K extends keyof GameFlags>(key: K, by: number = 1): void {
    const v = this.flags[key];
    if (typeof v === "number") this.flags[key] = v + by as GameFlags[K];
  }

  incrementKill(kind: string): void {
    this.flags.kills++;
    this.flags.killsByKind[kind] = (this.flags.killsByKind[kind] ?? 0) + 1;
  }

  // ── Сброс к начальным значениям ──

  reset(): void {
    this.flags.hasSword = false;
    this.flags.hasAxe = false;
    this.flags.hasBow = false;
    this.flags.hasHammer = false;
    this.flags.hasKey = false;
    this.flags.swordUp = false;
    this.flags.axeUp = false;
    this.flags.furyRune = false;
    this.flags.nornsFavor = false;
    this.flags.hearts = 2;
    this.flags.arrows = 12;
    this.flags.runes = 0;
    this.flags.bear = false;
    this.flags.bearGone = false;
    this.flags.horn = false;
    this.flags.hornDone = false;
    this.flags.mead = false;
    this.flags.meadDone = false;
    this.flags.ore = false;
    this.flags.oreDone = false;
    this.flags.moss = false;
    this.flags.amber = false;
    this.flags.flower = false;
    this.flags.shamanDone = false;
    this.flags.diary = false;
    this.flags.refugeeDone = false;
    this.flags.secretKnown = false;
    this.flags.bundle = false;
    this.flags.merchantDone = false;
    this.flags.relic = false;
    this.flags.atoneDone = false;
    this.flags.cullDone = false;
    this.flags.killsByKind = {};
    this.flags.reaperDead = false;
    this.flags.spiderDead = false;
    this.flags.giantDead = false;
    this.flags.snakeStarted = false;
    this.flags.snakeDead = false;
    this.flags.ghostBane = false;
    this.flags.dew = 0;
    this.flags.fogWaves = 0;
    this.flags.kills = 0;
    this.flags.deaths = 0;
    this.flags.shrineIdx = -1;
    this.flags.shrineQuestDone = false;
    this.flags.huntDone = false;
  }
}
