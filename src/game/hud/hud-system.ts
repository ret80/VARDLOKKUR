/* ============ HUDSystem ============ */
import { EventBus } from "../event-bus";
import { GameStore } from "../store";
import { HudData, Stats } from "../engine";
import { QuestView } from "../types";
import { IQuestProvider } from "../quests/quest-provider";
import { audio } from "../audio";

export class HudSystem {
  private store: GameStore;
  private bus: EventBus;
  private quests: IQuestProvider;
  private _lastMmKey = "";
  private _mmTimer = 0;
  private _lastQuestsHash = "";
  private _version = 0;

  get mmTimer() { return this._mmTimer; } set mmTimer(v: number) { this._mmTimer = v; }
  get lastMmKey() { return this._lastMmKey; } set lastMmKey(v: string) { this._lastMmKey = v; }

  constructor(bus: EventBus, store: GameStore, quests: IQuestProvider) {
    this.bus = bus;
    this.store = store;
    this.quests = quests;
    bus.on("hud:dirty", () => this.pushHud(true));
    bus.on("toast", (e) => this.store.callbacks.onToast(e.msg));
  }

  private get player() { return this.store.player; }
  private get flags() { return this.store.flags; }
  private get map() { return this.store.map; }
  private get trackedQuest() { return this.store.trackedQuest; }
  private get playTime() { return this.store.playTime; }
  private get realT() { return this.store.realT; }

  private questsHash(quests: QuestView[], trackedId: string): string {
    return `${quests.map(q => `${q.id}:${q.done}`).join("|")}:${trackedId}`;
  }

  fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss < 10 ? "0" : ""}${ss}`;
  }

  pushHud(force = false) {
    if (!this.map && !force) return;
    if (force) this._lastQuestsHash = "";
    const { desc } = this.quests.questDesc(this.trackedQuest);
    const quests = this.quests.buildQuests();
    const hash = this.questsHash(quests, this.trackedQuest);
    if (!force && hash === this._lastQuestsHash) return;
    this._lastQuestsHash = hash;
    this._version++;
    this.store.callbacks.onHud({
      hp: Math.max(0, this.player.hp), maxHp: this.player.maxHp,
      arrows: this.flags.getArrows(), runes: this.flags.getRunes(),
      hasSword: this.flags.hasItem("sword"), hasAxe: this.flags.hasItem("axe"), hasBow: this.flags.hasItem("bow"),
      hasHammer: this.flags.hasItem("hammer"), hasKey: this.flags.hasItem("key"), bear: this.flags.hasQuestItem("bear"),
      swordUp: this.flags.hasEnhancement("swordUp"), axeUp: this.flags.hasEnhancement("axeUp"), furyRune: this.flags.hasEnhancement("furyRune"),
      secretKnown: this.flags.secretKnown, nornsFavor: this.flags.nornsFavor,
      hearts: this.flags.getHearts(),
      zone: this.store.zone || "", objective: this.quests.trackedTitle() + " — " + desc,
      time: this.fmtTime(this.playTime), kills: this.flags.getTotalKills(), deaths: this.flags.getDeaths(),
      muted: audio.muted,
      quests, trackedId: this.trackedQuest, _version: this._version,
    });
  }

  onStats() {
    this.store.callbacks.onStats({
      time: this.fmtTime(this.playTime),
      kills: this.flags.getTotalKills(),
      deaths: this.flags.getDeaths(),
      runes: this.flags.getRunes(),
    });
  }

  updateMinimap(minimapCanvas: HTMLCanvasElement | null, mmBase: ImageData | null, map: any) {
    if (!minimapCanvas || !mmBase || !map) return;
    this._mmTimer -= 0.016;
    if (this._mmTimer > 0) return;
    this._mmTimer = 0.15;
    const txi = Math.floor(this.player.x / 16), tyi = Math.floor(this.player.y / 16);
    const blink = Math.floor(this.realT * 3) % 2;
    const key = txi + "_" + tyi + "_" + blink + "_" + (map.dungeonId ?? -1) + "_" + this.trackedQuest;
    if (key !== this._lastMmKey) {
      this._lastMmKey = key;
      const cx = minimapCanvas.getContext("2d");
      if (cx) {
        // Миникарта — вызов из tiles.ts
        // drawMinimap будет вызван из Engine
      }
    }
  }
}
