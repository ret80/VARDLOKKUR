/* ============ DropsSystem ============ */
import { EventBus } from "../event-bus";
import { GameStore } from "../store";
import { DropKind, Vec, T } from "../world";
import { dist2 } from "../utils";
import { Drop } from "../entities";
import { DropRt } from "../game-states";
import { Graphics } from "pixi.js";
import { audio } from "../audio";

export class DropsSystem {
  private store: GameStore;
  private bus: EventBus;

  constructor(bus: EventBus, store: GameStore) {
    this.bus = bus;
    this.store = store;
    bus.on("drop:spawn", (e) => this.spawnDrop(e.kind, e.x, e.y, e.life));
    bus.on("enemy:killed", (e) => this.rollDrops(e));
  }

  private get drops() { return this.store.entities.drops; }
  private get player() { return this.store.player; }
  private get flags() { return this.store.flags; }
  private get takenAmbient() { return this.store.takenAmbient; }

  spawnDrop(kind: DropKind, x: number, y: number, life?: number) {
    const d: DropRt = { kind, x, y, t: Math.random() * 5, taken: false, magnet: kind === "heart" || kind === "arrows" || kind === "dew", g: new Graphics(), life };
    d.g.position.set(x, y);
    this.store.services.onDropAdd(d.g);
    this.drops.add(d);
  }

  updateDrops(dt: number) {
    const p = this.player;
    for (let i = this.drops.all.length - 1; i >= 0; i--) {
      const d = this.drops.all[i] as DropRt;
      if (d.taken) continue;
      d.t += dt;
      if (d.life !== undefined) {
        d.life -= dt;
        if (d.life <= 0) {
          d.g.destroy();
          this.drops.remove(i);
          continue;
        }
        if (d.life < 5) d.g.alpha = 0.3 + 0.7 * Math.abs(Math.sin(d.life * 6));
      }
      const d2 = dist2(d.x, d.y, p.x, p.y);
      if (d.magnet && d2 < 34 * 34 && d2 > 1) {
        const dd = Math.sqrt(d2);
        d.x += ((p.x - d.x) / dd) * 120 * dt;
        d.y += ((p.y - d.y) / dd) * 120 * dt;
        d.g.position.set(d.x, d.y);
      }
      if (d2 < 11 * 11) this.collectDrop(i);
    }
  }

  private collectDrop(i: number) {
    const d = this.drops.all[i] as DropRt;
    d.taken = true;
    if (d.ambientIdx !== undefined) this.takenAmbient.add(d.ambientIdx);
    d.g.destroy();
    this.drops.remove(i);
    const p = this.player;
    const f = this.flags;
    switch (d.kind) {
      case "heart":
        if (p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 3);
          audio.pickup();
          this.bus.emit("toast", { msg: "+3" });
        } else if (f.hearts < 9) {
          f.hearts++;
          audio.pickup();
          this.bus.emit("toast", { msg: "В суму [F]" });
        } else {
          this.bus.emit("toast", { msg: "Сума полна" });
          return;
        }
        break;
      case "arrows":
        f.arrows += 5;
        audio.pickup();
        this.bus.emit("toast", { msg: "+5 стрел" });
        break;
      case "axe":
        f.hasAxe = true;
        audio.rune();
        this.bus.emit("toast", { msg: "Ледяная Секира [J] — замораживает врагов и возвращается" });
        break;
      case "bow":
        f.hasBow = true;
        audio.rune();
        this.bus.emit("toast", { msg: "Лук Сумерек [удерживай L] — время замирает, стрела летит" });
        break;
      case "hammer":
        f.hasHammer = true;
        audio.rune();
        this.bus.emit("toast", { msg: "Рунический Молот — удары меча оглушают врагов" });
        break;
      case "bear":
        f.bear = true; audio.pickup();
        this.bus.emit("toast", { msg: "Медвежонок из болота. Дочь ждёт его в Чёрном Лесу" });
        break;
      case "horn":
        f.horn = true; audio.pickup();
        this.bus.emit("toast", { msg: "Рог Сигрид. Отнеси его в Воронью Гавань" });
        break;
      case "mead":
        f.mead = true; audio.pickup();
        this.bus.emit("toast", { msg: "Дикий мёд. Астрид будет рада" });
        break;
      case "ore":
        f.ore = true; audio.pickup();
        this.bus.emit("toast", { msg: "Сердце горы. Харальд заждался" });
        break;
      case "moss":
        f.moss = true; audio.pickup();
        this.bus.emit("toast", { msg: "Болотный мох. Шаману пригодится" });
        break;
      case "amber":
        f.amber = true; audio.pickup();
        this.bus.emit("toast", { msg: "Горный янтарь. Шаману пригодится" });
        break;
      case "flower":
        f.flower = true; audio.pickup();
        this.bus.emit("toast", { msg: "Могильный цветок. Шаману пригодится" });
        break;
      case "dew":
        f.dew = (f.dew ?? 0) + 1;
        audio.pickup();
        this.bus.emit("toast", { msg: `Туманная Роса ${f.dew}/3` });
        break;
      case "diary":
        f.diary = true; audio.pickup();
        this.bus.emit("toast", { msg: "Дневник старосты сожжённой деревни" });
        break;
      case "bundle":
        f.bundle = true; audio.pickup();
        this.bus.emit("toast", { msg: "Потерянный тюк Фьолнира" });
        break;
      case "relic":
        f.relic = true; audio.pickup();
        this.bus.emit("toast", { msg: "Реликвия мёртвых. Древний алтарь зовёт" });
        break;
      case "shard":
        f.arrows += 3;
        audio.pickup();
        this.bus.emit("toast", { msg: "+3 стрел" });
        break;
      case "bones":
        f.arrows += 2; p.hp = Math.min(p.maxHp, p.hp + 1);
        audio.pickup();
        this.bus.emit("toast", { msg: "Припасы" });
        break;
      case "rune":
        f.runes++;
        audio.rune();
        this.bus.emit("toast", { msg: `Забытая Руна ${f.runes}/5 впитана` });
        break;
    }
    this.bus.emit("drop:collected", { kind: d.kind, x: d.x, y: d.y });
    this.bus.emit("hud:dirty", {});
  }

  private rollDrops(e: { enemy: any; kind: string; x: number; y: number }) {
    if (e.kind === "ghost") {
      // Призрак у змея (leash) — ничего не даёт
      if (e.enemy.leash) return;
      // Убийство: 90% шанс росы
      if (Math.random() < 0.9) {
        this.bus.emit("drop:spawn", { kind: "dew", x: e.x, y: e.y, life: 40 });
      }
      if (Math.random() < 0.35) {
        this.bus.emit("drop:spawn", { kind: Math.random() < 0.5 ? "shard" : "heart", x: e.x, y: e.y });
      }
      return;
    }
    const roll = Math.random();
    if (e.kind !== "frost") {
      if (roll < 0.4) this.bus.emit("drop:spawn", { kind: "heart", x: e.x, y: e.y });
      else if (roll < 0.62) this.bus.emit("drop:spawn", { kind: "arrows", x: e.x, y: e.y });
    } else {
      this.bus.emit("drop:spawn", { kind: Math.random() < 0.5 ? "heart" : "arrows", x: e.x, y: e.y });
    }
  }

  /* Спавн мировых дропов */
  spawnWorldDrops(map: any) {
    const add = (kind: DropKind, v: Vec) => {
      this.bus.emit("drop:spawn", { kind, x: v.x, y: v.y });
    };
    const f = this.flags;
    if (!f.bearGone) add("bear", { x: map.bearSpot.x * T + 8, y: map.bearSpot.y * T + 8 });
    if (!f.hornDone && !f.horn) add("horn", { x: map.hornSpot.x * T + 8, y: map.hornSpot.y * T + 8 });
    if (!f.meadDone && !f.mead) add("mead", { x: map.meadSpot.x * T + 8, y: map.meadSpot.y * T + 8 });
    if (f.giantDead && !f.oreDone && !f.ore) add("ore", { x: map.oreSpot.x * T + 8, y: map.oreSpot.y * T + 8 });
    if (!f.shamanDone) {
      if (!f.moss) add("moss", { x: map.mossSpot.x * T + 8, y: map.mossSpot.y * T + 8 });
      if (!f.amber) add("amber", { x: map.amberSpot.x * T + 8, y: map.amberSpot.y * T + 8 });
      if (!f.flower) add("flower", { x: map.flowerSpot.x * T + 8, y: map.flowerSpot.y * T + 8 });
    }
    if (!f.refugeeDone && !f.diary) add("diary", { x: map.diarySpot.x * T + 8, y: map.diarySpot.y * T + 8 });
    if (!f.merchantDone && !f.bundle) add("bundle", { x: map.bundleSpot.x * T + 8, y: map.bundleSpot.y * T + 8 });
    if (!f.atoneDone && !f.relic) add("relic", { x: map.relicSpot.x * T + 8, y: map.relicSpot.y * T + 8 });
    if (!map.isDungeon) {
      map.ambient.forEach((a: any, i: number) => {
        if (this.takenAmbient.has(i)) return;
        add(a.kind, { x: a.x * T + 8, y: a.y * T + 8 });
      });
    }
  }
}


