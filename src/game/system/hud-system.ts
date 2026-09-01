/* ============ HUDSystem ============ */
import { EventBus } from "../event-bus";
import { GameState, GameEvents } from "../game-states";
import { HudData, Stats } from "../engine";
import { QuestView } from "../types";
import { IQuestProvider } from "./quest-provider";
import { audio } from "../audio";

export class HudSystem {
  private state: GameState;
  private bus: EventBus;
  private quests: IQuestProvider;
  private _lastMmKey = "";
  private _mmTimer = 0;
  private _lastQuestsHash = "";
  private _version = 0;

  get mmTimer() { return this._mmTimer; } set mmTimer(v: number) { this._mmTimer = v; }
  get lastMmKey() { return this._lastMmKey; } set lastMmKey(v: string) { this._lastMmKey = v; }

  constructor(bus: EventBus, state: GameState, quests: IQuestProvider) {
    this.bus = bus;
    this.state = state;
    this.quests = quests;
    bus.on("hud:dirty", () => this.pushHud(true));
    bus.on("toast", (e) => this.state.cbs.onToast(e.msg));
  }

  private questsHash(quests: QuestView[], trackedId: string): string {
    return `${quests.map(q => `${q.id}:${q.done}`).join("|")}:${trackedId}`;
  }

  fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss < 10 ? "0" : ""}${ss}`;
  }

  pushHud(force = false) {
    if (!this.state.map && !force) return;
    if (force) this._lastQuestsHash = "";
    const { desc } = this.quests.questDesc(this.state.trackedQuest);
    const quests = this.quests.buildQuests();
    const hash = this.questsHash(quests, this.state.trackedQuest);
    if (!force && hash === this._lastQuestsHash) return;
    this._lastQuestsHash = hash;
    this._version++;
    this.state.cbs.onHud({
      hp: Math.max(0, this.state.player.hp), maxHp: this.state.player.maxHp,
      arrows: this.state.flags.arrows, runes: this.state.flags.runes,
      hasSword: this.state.flags.hasSword, hasAxe: this.state.flags.hasAxe, hasBow: this.state.flags.hasBow,
      hasHammer: this.state.flags.hasHammer, hasKey: this.state.flags.hasKey, bear: this.state.flags.bear,
      swordUp: this.state.flags.swordUp, axeUp: this.state.flags.axeUp, furyRune: this.state.flags.furyRune,
      secretKnown: this.state.flags.secretKnown, nornsFavor: this.state.flags.nornsFavor,
      hearts: this.state.flags.hearts,
      zone: this.state.zone || "", objective: `${this.quests.trackedTitle()} — ${desc}`,
      time: this.fmtTime(this.state.playTime), kills: this.state.flags.kills, deaths: this.state.flags.deaths,
      muted: audio.muted,
      quests, trackedId: this.state.trackedQuest, _version: this._version,
    });
  }

  onStats() {
    this.state.cbs.onStats({
      time: this.fmtTime(this.state.playTime),
      kills: this.state.flags.kills,
      deaths: this.state.flags.deaths,
      runes: this.state.flags.runes,
    });
  }

  updateMinimap(minimapCanvas: HTMLCanvasElement | null, mmBase: ImageData | null, map: any) {
    if (!minimapCanvas || !mmBase || !map) return;
    this._mmTimer -= 0.016;
    if (this._mmTimer > 0) return;
    this._mmTimer = 0.15;
    const txi = Math.floor(this.state.player.x / 16), tyi = Math.floor(this.state.player.y / 16);
    const blink = Math.floor(this.state.realT * 3) % 2;
    const key = txi + "_" + tyi + "_" + blink + "_" + (map.dungeonId ?? -1) + "_" + this.state.trackedQuest;
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
