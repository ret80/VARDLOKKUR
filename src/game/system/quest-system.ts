/* ============ QuestSystem ============ */

import { EventBus } from "../event-bus";
import { GameStore } from "../store";
import { audio } from "../audio";
import { IQuestProvider, QuestView } from "./quest-provider";
import { ALL_QUESTS, findQuestDef } from "./quest-definitions";
import { QuestTracker, IQuestTracker } from "./quest-tracker";

export class QuestSystem implements IQuestProvider {
  private store: GameStore;
  private bus: EventBus;
  private tracker: IQuestTracker;

  constructor(bus: EventBus, store: GameStore) {
    this.bus = bus;
    this.store = store;
    this.tracker = new QuestTracker(store, store.flags);

    bus.on("enemy:killed", (e) => this.onEnemyKilled(e));
    bus.on("drop:collected", (e) => this.onDropCollected(e));
    bus.on("dialogue:end", (e) => this.onDialogueEnd(e));
    bus.on("pedestal:unsealed", (e) => this.onPedestalUnsealed(e));
    bus.on("boss:killed", (e) => this.onBossKilled(e));
    bus.on("fog:waveEnd", (e) => this.onFogWaveEnd(e));
    bus.on("quest:reveal", (e) => this.revealQuest(e.id, e.silent));
  }

  /* ---- static definitions (backward compat) ---- */

  /** @deprecated Use `findQuestDef()` from quest-definitions instead. */
  questDefs(): { id: string; title: string; main: boolean }[] {
    return ALL_QUESTS;
  }

  /* ---- delegate to tracker ---- */

  trackedTarget(): ReturnType<IQuestTracker["trackedTarget"]> {
    return this.tracker.trackedTarget();
  }

  trackedTitle(): string {
    return this.tracker.trackedTitle();
  }

  /* ---- event handlers ---- */

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

  /* ================= main quest progression ================= */

  mainQuestId(): string {
    if (!this.flags.hasItem("sword")) return "m1";
    if (!this.flags.isBossDead("reaper")) return "m2";
    if (!this.flags.isBossDead("spider")) return "m3";
    if (this.flags.getRunes() < 5) return "m4";
    if (!this.flags.isBossDead("giant")) return "m5";
    return "m6";
  }

  /* ================= quest descriptions (dynamic) ================= */

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

  /* ================= public API ================= */

  buildQuests(): QuestView[] {
    return ALL_QUESTS
      .filter((q) => this.revealed.has(q.id))
      .map((q) => {
        const { desc, done } = this.questDesc(q.id);
        return { id: q.id, title: q.title, desc, main: q.main, done, tracked: this.trackedQuest === q.id };
      });
  }

  revealQuest(id: string, silent = false) {
    if (this.revealed.has(id)) return;
    this.revealed.add(id);
    const def = findQuestDef(id);
    if (def && !silent) { audio.quest(); this.bus.emit("toast", { msg: `Новый квест: ${def.title}` }); }
    this.bus.emit("hud:dirty", {});
  }

  checkQuestProgress() {
    const cur = this.mainQuestId();
    if (cur !== this.lastMain) {
      this.lastMain = cur;
      this.revealQuest(cur, true);
      const def = findQuestDef(cur);
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
}
