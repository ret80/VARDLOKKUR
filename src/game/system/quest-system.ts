/* ============ QuestSystem ============ */
import { EventBus } from "../event-bus";
import { GameStore } from "../store";
import { Vec, T } from "../world";
import { audio } from "../audio";
import { IQuestProvider, QuestView } from "./quest-provider";

export class QuestSystem implements IQuestProvider {
  private store: GameStore;
  private bus: EventBus;

  constructor(bus: EventBus, store: GameStore) {
    this.bus = bus;
    this.store = store;
    bus.on("enemy:killed", (e) => this.onEnemyKilled(e));
    bus.on("drop:collected", (e) => this.onDropCollected(e));
    bus.on("dialogue:end", (e) => this.onDialogueEnd(e));
    bus.on("pedestal:unsealed", (e) => this.onPedestalUnsealed(e));
    bus.on("boss:killed", (e) => this.onBossKilled(e));
    bus.on("fog:waveEnd", (e) => this.onFogWaveEnd(e));
    bus.on("quest:reveal", (e) => this.revealQuest(e.id, e.silent));
  }

  private get flags() { return this.store.flags; }
  private get enemies() { return this.store.entities.enemies; }
  private get pedestals() { return this.store.entities.pedestals; }
  private get map() { return this.store.map; }
  private get ow() { return this.store.ow; }
  private get revealed() { return this.store.revealed; }
  private get trackedQuest() { return this.store.trackedQuest; }
  private set trackedQuest(v: string) { this.store.setTrackedQuest(v); }
  private get lastMain() { return this.store.lastMain; }
  private set lastMain(v: string) { this.store.setLastMain(v); }
  private get visitedShrines() { return this.store.visitedShrines; }

  private onEnemyKilled(e: { kind: string }) {
    this.flags.incrementKill(e.kind);
    if (this.flags.getTotalKills() === 1) this.bus.emit("quest:reveal", { id: "s_hunt" });
  }

  private onDropCollected(e: { kind: string }) {
    if (e.kind === "dew") {
      this.flags.incrementFlag("dew", 1);
      if (this.flags.getDew() >= 3) this.bus.emit("quest:reveal", { id: "s_ghost" });
    }
  }

  private onDialogueEnd(e: { id: string }) { this.checkQuestProgress(); }
  private onPedestalUnsealed(e: { pedestalIndex: number }) { this.checkQuestProgress(); }
  private onBossKilled(e: { id: number }) { this.checkQuestProgress(); }

  private onFogWaveEnd(e: { dropDew: boolean }) {
    this.flags.incrementFlag("fogWaves", 1);
    if (this.flags.fogWaves === 1) this.bus.emit("quest:reveal", { id: "s_ghost" });
  }

  /* ================= квесты ================= */
  mainQuestId(): string {
    if (!this.flags.hasItem("sword")) return "m1";
    if (!this.flags.isBossDead("reaper")) return "m2";
    if (!this.flags.isBossDead("spider")) return "m3";
    if (this.flags.getRunes() < 5) return "m4";
    if (!this.flags.isBossDead("giant")) return "m5";
    return "m6";
  }

  questDefs(): { id: string; title: string; main: boolean }[] {
    return [
      { id: "m1", title: "Пробуждение", main: true },
      { id: "m2", title: "Первый Зов", main: true },
      { id: "m3", title: "Голос Леса", main: true },
      { id: "m4", title: "Забытые Руны", main: true },
      { id: "m5", title: "Горная Разруха", main: true },
      { id: "m6", title: "Рагнарёк", main: true },
      { id: "s_bear", title: "Игрушка для Дочери", main: false },
      { id: "s_horn", title: "Пропавший рог", main: false },
      { id: "s_mead", title: "Лучший мёд", main: false },
      { id: "s_ore", title: "Сердце горы", main: false },
      { id: "s_moss", title: "Отвар Норн", main: false },
      { id: "s_diary", title: "Тайна Сожжённой Деревни", main: false },
      { id: "s_cull", title: "Волк и Кость", main: false },
      { id: "s_bundle", title: "Потерянный груз", main: false },
      { id: "s_atone", title: "Эхо мёртвых", main: false },
      { id: "s_shrines", title: "Паломничество", main: false },
      { id: "s_hunt", title: "Зачистка Нидов", main: false },
      { id: "s_ghost", title: "Голоса тумана", main: false },
    ];
  }

  questDesc(id: string): { desc: string; done: boolean } {
    const f = this.flags;
    const m = this.map;
    switch (id) {
      case "m1": return { desc: "Поговори с Эйриком Старшим — он вернёт твой клинок", done: f.hasItem("sword") };
      case "m2": return { desc: "Спустись в Склеп Хранителя (Руины) и срази Жнеца", done: f.isBossDead("reaper") };
      case "m3": return { desc: "В Корне Иггдрасиля (Чёрный Лес) одолей Паука", done: f.isBossDead("spider") };
      case "m4": return { desc: `Собери Забытые Руны (${f.getRunes()}/5) — сними печати пьедесталов`, done: f.getRunes() >= 5 };
      case "m5": return { desc: "Штурмуй Каменную Крепость (Горы) и сокруши Великана", done: f.isBossDead("giant") };
      case "m6": return { desc: "Сыграй Песнь Разрыва у Древа и убей Мираж Ёрмунганда", done: f.isBossDead("snake") };
      case "s_bear": {
        if (f.bearGone) return { desc: "Медвежонок вернулся к Безымянной Дочери", done: true };
        if (f.hasQuestItem("bear")) return { desc: "Верни медвежонка Дочери в Чёрном Лесу", done: false };
        return { desc: "Найди медвежонка на дне болота", done: false };
      }
      case "s_horn": {
        if (f.isQuestDone("hornDone")) return { desc: "Рог Сигрид вернулся, секира наточена", done: true };
        if (f.hasQuestItem("horn")) return { desc: "Отнеси рог Сигрид в Воронью Гавань", done: false };
        return { desc: "Найди рог Сигрид в горах", done: false };
      }
      case "s_mead": {
        if (f.isQuestDone("meadDone")) return { desc: "Зелье из дикого мёда сварено", done: true };
        if (f.hasQuestItem("mead")) return { desc: "Отнеси мёд Астрид", done: false };
        return { desc: "Добудь дикий мёд в Чёрном Лесу", done: false };
      }
      case "s_ore": {
        if (f.isQuestDone("oreDone")) return { desc: "Меч закалён Сердцем горы", done: true };
        if (f.hasQuestItem("ore")) return { desc: "Отнеси руду Харальду", done: false };
        return { desc: "Подбери Сердце горы после падения Великана", done: false };
      }
      case "s_moss": {
        if (f.isQuestDone("shamanDone")) return { desc: "Отвар Норн выпит, Руна Ярости твоя", done: true };
        const got = [f.hasQuestItem("moss"), f.hasQuestItem("amber"), f.hasQuestItem("flower")].filter(Boolean).length;
        return { desc: `Собери шаману мох, янтарь и цветок (${got}/3)`, done: false };
      }
      case "s_diary": {
        if (f.isQuestDone("refugeeDone")) return { desc: "Дневник прочитан, тайник отмечен", done: true };
        if (f.hasQuestItem("diary")) return { desc: "Отнеси дневник Беженке Гюнн", done: false };
        return { desc: "Найди дневник старосты в Сожжённой Деревне", done: false };
      }
      case "s_cull": {
        const v = Math.min(4, f.getKillCount("varg")), dr = Math.min(4, f.getKillCount("draugr"));
        if (f.isQuestDone("cullDone")) return { desc: "Бранд доволен", done: true };
        return { desc: `Прореди варгов (${v}/4) и драугров (${dr}/4)`, done: false };
      }
      case "s_bundle": {
        if (f.isQuestDone("merchantDone")) return { desc: "Фьолнир получил свой тюк", done: true };
        if (f.hasQuestItem("bundle")) return { desc: "Отнеси тюк торговцу Фьолниру", done: false };
        return { desc: "Найди оброненный тюк на тракте", done: false };
      }
      case "s_atone": {
        if (f.isQuestDone("atoneDone")) return { desc: "Норны приняли дар", done: true };
        if (f.hasQuestItem("relic")) return { desc: "Возложи реликвию на древний алтарь", done: false };
        return { desc: "Найди реликвию мёртвых в пустоши", done: false };
      }
      case "s_shrines": return {
        desc: `Зажги все святилища Нидов (${this.visitedShrines.size}/${this.ow ? this.ow.shrines.length : 4})`,
        done: f.isQuestCompleted("shrineQuest"),
      };
      case "s_hunt": return {
        desc: `Истреби порождений петли (${Math.min(12, f.getTotalKills())}/12)`,
        done: f.isQuestCompleted("hunt"),
      };
      case "s_ghost": {
        if (f.ghostBane) return { desc: "Клинок освящён — сталь бьёт призраков", done: true };
        if (f.getDew() >= 3) return { desc: "Отнеси Шаману 3 Туманной Росы", done: false };
        return { desc: `Переживи волну и собери Росу (${f.getDew()}/3)`, done: false };
      }
      default: return { desc: "", done: false };
    }
  }

  buildQuests(): QuestView[] {
    const defs = this.questDefs();
    return defs
      .filter((q) => this.revealed.has(q.id))
      .map((q) => {
        const { desc, done } = this.questDesc(q.id);
        return { id: q.id, title: q.title, desc, main: q.main, done, tracked: this.trackedQuest === q.id };
      });
  }

  revealQuest(id: string, silent = false) {
    if (this.revealed.has(id)) return;
    this.revealed.add(id);
    const def = this.questDefs().find((q) => q.id === id);
    if (def && !silent) { audio.quest(); this.bus.emit("toast", { msg: `Новый квест: ${def.title}` }); }
    this.bus.emit("hud:dirty", {});
  }

  checkQuestProgress() {
    const cur = this.mainQuestId();
    if (cur !== this.lastMain) {
      this.lastMain = cur;
      this.revealQuest(cur, true);
      const def = this.questDefs().find((q) => q.id === cur);
      if (def) { this.bus.emit("toast", { msg: `Новая цель саги: ${def.title}` }); audio.quest(); }
      const { done } = this.questDesc(this.trackedQuest);
      if (done) this.trackedQuest = cur;
      this.bus.emit("hud:dirty", {});
    }
    const f = this.flags;
    if (!f.isQuestCompleted("hunt") && f.getTotalKills() >= 12) {
      f.incrementFlag("huntDone", 0);
      f.incrementFlag("arrows", 10);
      audio.chime();
      this.bus.emit("toast", { msg: "Зачистка Нидов: дух-ворон принёс +10 стрел" });
      this.bus.emit("hud:dirty", {});
    }
    if (!f.isQuestCompleted("shrineQuest") && this.ow && this.visitedShrines.size >= this.ow.shrines.length) {
      f.incrementFlag("shrineQuestDone", 0);
      this.bus.emit("toast", { msg: "Паломничество завершено: максимальное здоровье +2" });
      this.bus.emit("hud:dirty", {});
    }
  }

  trackedTarget(): Vec | null {
    const m = this.map;
    if (!m) return null;
    const px = (v: Vec) => ({ x: v.x * T + 8, y: v.y * T + 8 });
    const nearestOf = (pts: Vec[]): Vec | null => {
      let best: Vec | null = null; let bd = Infinity;
      for (const pt of pts) {
        const d2 = (pt.x - this.store.player.x) ** 2 + (pt.y - this.store.player.y) ** 2;
        if (d2 < bd) { bd = d2; best = pt; }
      }
      return best;
    };
    const dungeonTarget = (id: number): Vec | null => {
      if (m.isDungeon) {
        return m.dungeonId === id
          ? { x: m.bossRoom.x + m.bossRoom.w / 2, y: m.bossRoom.y + m.bossRoom.h / 2 }
          : null;
      }
      const en = m.dungeonEntries.find((e) => e.id === id);
      return en ? px(en) : null;
    };
    const npcSpot = (id: string): Vec | null => {
      const n = this.ow?.npcs.find((x) => x.id === id);
      return n ? px(n) : null;
    };

    switch (this.trackedQuest) {
      case "m1": return m.isDungeon ? null : npcSpot("eirik") ?? px(m.villageA);
      case "m2": return dungeonTarget(0);
      case "m3": return dungeonTarget(1);
      case "m4": {
        if (m.isDungeon) return null;
        return nearestOf(this.pedestals.all.filter((p) => !p.taken).map((p) => ({ x: p.x, y: p.y })));
      }
      case "m5": return dungeonTarget(2);
      case "m6": return this.store.bossRef ? { x: this.store.bossRef.x, y: this.store.bossRef.y } : (m.isDungeon ? null : px(m.treeAltar));
      case "s_bear": {
        const f = this.flags;
        if (m.isDungeon || f.bearGone) return null;
        if (f.hasQuestItem("bear")) return npcSpot("daughter");
        return px(m.bearSpot);
      }
      case "s_horn": {
        const f = this.flags;
        if (m.isDungeon || f.isQuestDone("hornDone")) return null;
        if (f.hasQuestItem("horn")) return npcSpot("sigrid");
        return px(m.hornSpot);
      }
      case "s_mead": {
        const f = this.flags;
        if (m.isDungeon || f.isQuestDone("meadDone")) return null;
        if (f.hasQuestItem("mead")) return npcSpot("astrid");
        return px(m.meadSpot);
      }
      case "s_ore": {
        const f = this.flags;
        if (m.isDungeon || f.isQuestDone("oreDone")) return null;
        if (f.hasQuestItem("ore")) return npcSpot("harald");
        return px(m.oreSpot);
      }
      case "s_moss": {
        const f = this.flags;
        if (m.isDungeon || f.isQuestDone("shamanDone")) return null;
        if (f.hasQuestItem("moss") && f.hasQuestItem("amber") && f.hasQuestItem("flower")) return npcSpot("shaman");
        const spots: Vec[] = [];
        if (!f.hasQuestItem("moss")) spots.push(px(m.mossSpot));
        if (!f.hasQuestItem("amber")) spots.push(px(m.amberSpot));
        if (!f.hasQuestItem("flower")) spots.push(px(m.flowerSpot));
        return nearestOf(spots);
      }
      case "s_diary": {
        const f = this.flags;
        if (m.isDungeon || f.isQuestDone("refugeeDone")) return null;
        if (f.hasQuestItem("diary")) return npcSpot("refugee");
        return px(m.diarySpot);
      }
      case "s_cull": {
        const alive = this.enemies.all.filter((e) => !e.dead && (e.kind === "varg" || e.kind === "draugr"));
        return alive.length ? nearestOf(alive.map((e) => ({ x: e.x, y: e.y }))) : null;
      }
      case "s_bundle": {
        const f = this.flags;
        if (m.isDungeon || f.isQuestDone("merchantDone")) return null;
        if (f.hasQuestItem("bundle")) return npcSpot("merchant");
        return px(m.bundleSpot);
      }
      case "s_atone": {
        const f = this.flags;
        if (m.isDungeon || f.isQuestDone("atoneDone")) return null;
        if (f.hasQuestItem("relic")) return px(m.oldAltar);
        return px(m.relicSpot);
      }
      case "s_shrines": {
        if (m.isDungeon) return null;
        const unv = m.shrines.filter((_: any, i: number) => !this.visitedShrines.has(i)).map((s: any) => px(s));
        return unv.length ? nearestOf(unv) : null;
      }
      case "s_hunt": {
        const alive = this.enemies.all.filter((e) => !e.dead && e.kind !== "snake");
        if (!alive.length) return null;
        return nearestOf(alive.map((e) => ({ x: e.x, y: e.y })));
      }
      case "s_ghost": {
        const f = this.flags;
        if (m.isDungeon || f.ghostBane) return null;
        if (f.getDew() >= 3) return npcSpot("shaman");
        return null;
      }
      default: return null;
    }
  }

  trackedTitle(): string {
    const def = this.questDefs().find((q) => q.id === this.trackedQuest);
    return def ? def.title : "Сага";
  }
}
