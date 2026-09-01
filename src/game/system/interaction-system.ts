/* ============ InteractionSystem ============ */
import { EventBus } from "../event-bus";
import { GameState, GameEvents } from "../game-states";
import { WorldData, Vec, T, solidTileAt, tileAt, Tl } from "../world";
import { audio } from "../audio";
import { dist2 } from "../utils";

export class InteractionSystem {
  private state: GameState;
  private bus: EventBus;

  constructor(bus: EventBus, state: GameState) {
    this.bus = bus;
    this.state = state;
    bus.on("enemy:killed", (e) => this.onEnemyKilled(e));
  }

  private onEnemyKilled(e: { enemy: any }) {
    const g = e.enemy;
    if (g.guardOf < 0 || g.guardOf >= this.state.pedestals.length) return;
    const pd = this.state.pedestals[g.guardOf];
    if (!pd || pd.taken || pd.guardsLeft <= 0) return;
    pd.guardsLeft = Math.max(0, pd.guardsLeft - 1);
    if (pd.guardsLeft === 0) {
      this.bus.emit("toast", { msg: "Печать пьедестала пала" });
      audio.chime();
    }
    this.bus.emit("pedestal:guardKilled", { pedestalIndex: g.guardOf });
  }

  tryInteract(onDialogue: (id: string) => void) {
    const hit = this.findNearest();
    if (!hit) return;
    audio.uiClick();
    switch (hit.kind) {
      case "npc": onDialogue(hit.ref.id); break;
      case "chest": this.openChest(hit.ref); break;
      case "pedestal": this.takePedestal(hit.ref); break;
      case "shrine": this.useShrine(hit.ref.i); break;
      case "altar": this.bus.emit("boss:spawned", { kind: "snake" as any, id: -1 }); break;
      case "oldAltar": this.atone(); break;
      case "stairs": this.enterDungeonOrExit(); break;
    }
  }

  getNearestInteractable() {
    return this.findNearest();
  }

  private findNearest(): { kind: string; ref: any; x: number; y: number } | null {
    const m = this.state.map;
    const p = this.state.player;
    let best: { kind: string; ref: any; x: number; y: number } | null = null;
    let bd = 22 * 22;
    const consider = (kind: string, ref: any, x: number, y: number) => {
      const d2 = dist2(x, y, p.x, p.y);
      if (d2 < bd) { bd = d2; best = { kind, ref, x, y }; }
    };
    for (const n of this.state.npcs) consider("npc", n, n.x, n.y);
    for (const c of this.state.chests) if (!c.opened) consider("chest", c, c.x, c.y);
    for (const pd of this.state.pedestals) if (!pd.taken) consider("pedestal", pd, pd.x, pd.y);
    this.state.shrines.forEach((s: any, i: number) => consider("shrine", { s, i }, s.x, s.y));
    const f = this.state.flags;
    if (this.state.barrier && f.runes >= 5 && !f.snakeStarted) consider("altar", this.state.barrier, this.state.barrier.x, this.state.barrier.y);
    if (f.relic && !f.atoneDone && !m.isDungeon) {
      consider("oldAltar", null, m.oldAltar.x * T + 8, m.oldAltar.y * T + 8);
    }
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (tileAt(m, tx + dx, ty + dy) === Tl.STAIRS) {
        consider("stairs", null, (tx + dx) * T + 8, (ty + dy) * T + 8);
      }
    }
    return best;
  }

  private openChest(c: any) {
    c.opened = true;
    this.state.openedChests.add(Math.round((c.x - 8) / T) + "_" + Math.round((c.y - 8) / T));
    audio.chest();
    const f = this.state.flags;
    switch (c.item) {
      case "bow":
        f.hasBow = true;
        this.bus.emit("toast", { msg: "Лук Сумерек [удерживай L] — время замирает, стрела летит" });
        break;
      case "arrows":
        f.arrows += 10;
        this.bus.emit("toast", { msg: "+10 стрел" });
        break;
      case "heartPiece":
        this.state.player.maxHp += 2;
        this.state.player.hp = this.state.player.maxHp;
        this.bus.emit("toast", { msg: "Осколок жизни: максимальное здоровье +2" });
        audio.rune();
        break;
      case "key":
        f.hasKey = true;
        this.bus.emit("toast", { msg: "Ключ стража. Дверь впереди ждёт" });
        break;
    }
    this.bus.emit("hud:dirty", {});
  }

  private takePedestal(pd: any) {
    if (pd.guardsLeft > 0) {
      audio.locked();
      this.bus.emit("toast", { msg: "Печать крепка" });
      if (!pd.guardsSpawned) {
        pd.guardsSpawned = true;
        const def = this.state.map.pedestals[this.state.pedestals.indexOf(pd)];
        for (const k of def.guards) {
          const a = Math.random() * Math.PI * 2;
          const e = this.state.spawnEnemy(k, pd.x + Math.cos(a) * 26, pd.y + Math.sin(a) * 26);
          e.aggro = true;
          e.guardOf = this.state.pedestals.indexOf(pd);
        }
        this.bus.emit("toast", { msg: "Стражи пьедестала восстали!" });
        audio.horn();
      }
      return;
    }
    pd.taken = true;
    this.state.takenPedestals.add(this.state.pedestals.indexOf(pd));
    audio.chime();
    this.bus.emit("drop:spawn", { kind: "rune", x: pd.x, y: pd.y - 6 });
    this.bus.emit("pedestal:unsealed", { pedestalIndex: this.state.pedestals.indexOf(pd) });
  }

  private useShrine(i: number) {
    this.state.flags.shrineIdx = i;
    const firstVisit = !this.state.map.isDungeon && !this.state.visitedShrines.has(i);
    if (firstVisit) {
      this.state.visitedShrines.add(i);
      this.bus.emit("quest:reveal", { id: "s_shrines" });
    }
    this.state.player.hp = this.state.player.maxHp;
    audio.chime();
    audio.heal();
    this.bus.emit("toast", { msg: "Святилище запомнило тебя. Раны затянулись" });
    this.bus.emit("hud:dirty", {});
  }

  private atone() {
    const f = this.state.flags;
    if (!f.relic || f.atoneDone) return;
    f.relic = false;
    f.atoneDone = true;
    f.nornsFavor = true;
    this.state.player.maxHp += 2; this.state.player.hp = this.state.player.maxHp;
    audio.rune();
    this.bus.emit("toast", { msg: "Норны приняли дар: пьедесталы Рун видны на карте" });
    this.bus.emit("hud:dirty", {});
  }

  private enterDungeonOrExit() {
    const m = this.state.map;
    const f = this.state.flags;
    if (m.isDungeon) {
      this.bus.emit("engine:exit-dungeon", { spawn: m.exitSpot });
      return;
    }
    if (f.snakeStarted && !f.snakeDead) return;
    const entry = this.nearestDungeonEntry();
    if (!entry) return;
    const gate = this.dungeonUnlocked(entry.id);
    if (!gate.ok) { audio.locked(); this.bus.emit("toast", { msg: gate.req }); return; }
    this.bus.emit("engine:enter-dungeon", { dungeonId: entry.id, name: entry.name });
  }

  private nearestDungeonEntry(): { id: number; name: string } | null {
    let best: { id: number; name: string } | null = null;
    let bd = 40 * 40;
    for (const en of this.state.ow.dungeonEntries) {
      const d2 = dist2(en.x * T + 8, en.y * T + 8, this.state.player.x, this.state.player.y);
      if (d2 < bd) { bd = d2; best = { id: en.id, name: en.name }; }
    }
    return best;
  }

  private dungeonUnlocked(id: number): { ok: boolean; req: string } {
    const f = this.state.flags;
    if (id === 0) return { ok: f.hasSword, req: "Эйрик должен вручить тебе клинок" };
    if (id === 1) return { ok: f.hasAxe, req: "Путь преграждают корни — нужна Ледяная Секира" };
    return { ok: f.runes >= 5, req: `Крепость запечатана — нужно ещё ${5 - f.runes} Рун` };
  }
}


