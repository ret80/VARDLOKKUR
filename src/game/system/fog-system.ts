/* ============ FogSystem ============ */
import { EventBus } from "../event-bus";
import { GameState, GameEvents } from "../game-states";
import { WorldData, Vec, T, zoneFor } from "../world";
import { audio } from "../audio";
import { dist2 } from "../utils";

export class FogSystem {
  private state: GameState;
  private bus: EventBus;

  private fogTimer = 60;
  private fogActive = false;
  private fogLeft = 0;
  private fogRadius = 2600;
  private fogSpawned = false;
  private _fogWarned = false;
  private fogAmbient = false;
  private ghostClangT = 0;

  constructor(bus: EventBus, state: GameState) {
    this.bus = bus;
    this.state = state;
    bus.on("player:died", () => this.endWave(false));
  }

  get active(): boolean { return this.fogActive; }
  get radius(): number { return this.fogRadius; }
  get fogWarned(): boolean { return this._fogWarned; }

  updateFog(dt: number, rdt: number) {
    const f = this.state.flags, p = this.state.player, m = this.state.map;
    this.ghostClangT = Math.max(0, this.ghostClangT - dt);
    if (m.isDungeon || f.snakeDead) {
      this.fogRadius += (2600 - this.fogRadius) * Math.min(1, rdt * 0.8);
      if (this.fogActive) this.endWave(false);
      return;
    }
    const zn = zoneFor(m, Math.floor(p.x / T), Math.floor(p.y / T));
    const inVillage = zn === "Поселение выживших" || zn === "Поселение" || zn === "Воронья Гавань";
    const ax = m.treeAltar.x * T + 8, ay = m.treeAltar.y * T + 8;
    const nearAltar = !f.snakeStarted && dist2(p.x, p.y, ax, ay) < 240 * 240;

    if (inVillage) {
      if (this.fogActive) this.endWave(true);
      this.fogRadius += (2600 - this.fogRadius) * Math.min(1, rdt * 0.8);
      if (!this.fogActive) return;
      return;
    }
    if (nearAltar) {
      if (!this.fogActive) {
        this.fogActive = true; this.fogAmbient = true;
        audio.setFog(true); this.bus.emit("toast", { msg: "Саван Древа... оно не отпустит просто так" });
      }
      this.fogAmbient = true;
      this.fogRadius += (350 - this.fogRadius) * Math.min(1, rdt * 0.6);
      this.ensureGhosts(2, true);
      return;
    }
    if (this.fogAmbient) this.endWave(true);

    if (!this.fogActive) {
      this.fogTimer -= dt;
      this.fogRadius += (2600 - this.fogRadius) * Math.min(1, rdt * 0.8);
      if (!this._fogWarned && this.fogTimer < 4 && this.fogTimer > 0 && f.hasSword) {
        this._fogWarned = true;
        audio.setFog(true); audio.horn();
        this.bus.emit("toast", { msg: "Ветер стихает... Туман близко" });
      }
      if (this.fogTimer <= 0 && f.hasSword) {
        this.fogActive = true;
        this.fogLeft = 40;
        this.fogSpawned = false;
        this.fogRadius = 900;
        audio.setFog(true);
        this.bus.emit("toast", { msg: "ВОЛНА ТУМАНА. Ниды шепчут..." });
      }
    } else {
      this.fogLeft -= dt;
      this.fogRadius += (140 - this.fogRadius) * Math.min(1, rdt * 0.35);
      if (!this.fogSpawned && this.fogLeft < 38) {
        this.fogSpawned = true;
        this.ensureGhosts(2 + Math.floor(f.runes / 2), false);
      }
      if (this.fogLeft <= 0) this.endWave(true);
    }
  }

  fogHoles(): Vec[] {
    const m = this.state.map;
    if (!m || m.isDungeon) return [];
    return m.shrines.map((s: any) => ({ x: s.x * T + 8, y: s.y * T + 8 }));
  }

  /* ================= туман ================= */
  private ensureGhosts(n: number, leashed: boolean) {
    const f = this.state.flags, p = this.state.player, m = this.state.map;
    const alive = this.state.enemies.filter((e) => !e.dead && e.kind === "ghost").length;
    const cx = leashed ? m.treeAltar.x * T + 8 : p.x;
    const cy = leashed ? m.treeAltar.y * T + 8 : p.y;
    for (let i = alive; i < Math.min(4, n); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 110 + Math.random() * 60;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (x < T || y < T || x > (m.W - 1) * T || y > (m.H - 1) * T) continue;
      const e = this.state.spawnEnemy("ghost", x, y);
      e.aggro = true; e.state = "hover"; e.stateT = 0.5 + Math.random();
      if (leashed) e.leash = { x: cx, y: cy };
    }
  }

  private endWave(dropDew: boolean) {
    for (const e of this.state.enemies) {
      if (e.kind === "ghost" && !e.dead && e.state !== "dissipate") {
        e.state = "dissipate"; e.aggro = false;
        e.dropDew = !e.leash && dropDew && Math.random() < 0.4;
      }
    }
    this.fogActive = false; this._fogWarned = false; this.fogAmbient = false;
    this.fogSpawned = false;
    this.fogLeft = 0;
    this.fogTimer = Math.max(60, 80 - this.state.flags.runes * 4 + Math.random() * 30);
    this.state.flags.fogWaves = (this.state.flags.fogWaves ?? 0) + 1;
    audio.setFog(false);
    this.bus.emit("toast", { msg: "Туман рассеялся" });
    this.bus.emit("fog:waveEnd", { dropDew });
    this.bus.emit("fog:ghostDissipate", {});
  }
}


