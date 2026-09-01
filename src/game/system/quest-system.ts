/* ============ QuestSystem ============ */
import { EventBus } from "../event-bus";
import { GameState, GameEvents } from "../game-states";
import { WorldData, Vec, T } from "../world";
import { audio } from "../audio";

export class QuestSystem {
  private state: GameState;
  private bus: EventBus;

  constructor(bus: EventBus, state: GameState) {
    this.bus = bus;
    this.state = state;
    // Подписки
    bus.on("enemy:killed", (e) => this.onEnemyKilled(e));
    bus.on("drop:collected", (e) => this.onDropCollected(e));
    bus.on("dialogue:end", (e) => this.onDialogueEnd(e));
    bus.on("pedestal:unsealed", (e) => this.onPedestalUnsealed(e));
    bus.on("boss:killed", (e) => this.onBossKilled(e));
    bus.on("fog:waveEnd", (e) => this.onFogWaveEnd(e));
    bus.on("quest:reveal", (e) => this.revealQuest(e.id, e.silent));
  }

  private onEnemyKilled(e: { kind: string }) {
    this.state.flags.kills++;
    this.state.flags.killsByKind[e.kind] = (this.state.flags.killsByKind[e.kind] ?? 0) + 1;
    if (this.state.flags.kills === 1) this.bus.emit("quest:reveal", { id: "s_hunt" });
  }

  private onDropCollected(e: { kind: string }) {
    if (e.kind === "dew") {
      this.state.flags.dew = (this.state.flags.dew ?? 0) + 1;
      if (this.state.flags.dew >= 3) this.bus.emit("quest:reveal", { id: "s_ghost" });
    }
  }

  private onDialogueEnd(e: { id: string }) {
    this.checkQuestProgress();
  }

  private onPedestalUnsealed(e: { pedestalIndex: number }) {
    this.checkQuestProgress();
  }

  private onBossKilled(e: { id: number }) {
    this.checkQuestProgress();
  }

  private onFogWaveEnd(e: { dropDew: boolean }) {
    this.state.flags.fogWaves = (this.state.flags.fogWaves ?? 0) + 1;
    if (this.state.flags.fogWaves === 1) this.bus.emit("quest:reveal", { id: "s_ghost" });
  }

  /* ================= квесты ================= */
  mainQuestId(): string {
    const f = this.state.flags;
    if (!f.hasSword) return "m1";
    if (!f.reaperDead) return "m2";
    if (!f.spiderDead) return "m3";
    if (f.runes < 5) return "m4";
    if (!f.giantDead) return "m5";
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
    const f = this.state.flags;
    const m = this.state.map;
    switch (id) {
      case "m1": return { desc: "Поговори с Эйриком Старшим — он вернёт твой клинок", done: f.hasSword };
      case "m2": return { desc: "Спустись в Склеп Хранителя (Руины) и срази Жнеца", done: f.reaperDead };
      case "m3": return { desc: "В Корне Иггдрасиля (Чёрный Лес) одолей Паука", done: f.spiderDead };
      case "m4": return { desc: `Собери Забытые Руны (${f.runes}/5) — сними печати пьедесталов`, done: f.runes >= 5 };
      case "m5": return { desc: "Штурмуй Каменную Крепость (Горы) и сокруши Великана", done: f.giantDead };
      case "m6": return { desc: "Сыграй Песнь Разрыва у Древа и убей Мираж Ёрмунганда", done: f.snakeDead };
      case "s_bear": {
        if (f.bearGone) return { desc: "Медвежонок вернулся к Безымянной Дочери", done: true };
        if (f.bear) return { desc: "Верни медвежонка Дочери в Чёрном Лесу", done: false };
        return { desc: "Найди медвежонка на дне болота", done: false };
      }
      case "s_horn": {
        if (f.hornDone) return { desc: "Рог Сигрид вернулся, секира наточена", done: true };
        if (f.horn) return { desc: "Отнеси рог Сигрид в Воронью Гавань", done: false };
        return { desc: "Найди рог Сигрид в горах", done: false };
      }
      case "s_mead": {
        if (f.meadDone) return { desc: "Зелье из дикого мёда сварено", done: true };
        if (f.mead) return { desc: "Отнеси мёд Астрид", done: false };
        return { desc: "Добудь дикий мёд в Чёрном Лесу", done: false };
      }
      case "s_ore": {
        if (f.oreDone) return { desc: "Меч закалён Сердцем горы", done: true };
        if (f.ore) return { desc: "Отнеси руду Харальду", done: false };
        return { desc: "Подбери Сердце горы после падения Великана", done: false };
      }
      case "s_moss": {
        if (f.shamanDone) return { desc: "Отвар Норн выпит, Руна Ярости твоя", done: true };
        const got = [f.moss, f.amber, f.flower].filter(Boolean).length;
        return { desc: `Собери шаману мох, янтарь и цветок (${got}/3)`, done: false };
      }
      case "s_diary": {
        if (f.refugeeDone) return { desc: "Дневник прочитан, тайник отмечен", done: true };
        if (f.diary) return { desc: "Отнеси дневник Беженке Гюнн", done: false };
        return { desc: "Найди дневник старосты в Сожжённой Деревне", done: false };
      }
      case "s_cull": {
        const v = Math.min(4, f.killsByKind["varg"] ?? 0), dr = Math.min(4, f.killsByKind["draugr"] ?? 0);
        if (f.cullDone) return { desc: "Бранд доволен", done: true };
        return { desc: `Прореди варгов (${v}/4) и драугров (${dr}/4)`, done: false };
      }
      case "s_bundle": {
        if (f.merchantDone) return { desc: "Фьолнир получил свой тюк", done: true };
        if (f.bundle) return { desc: "Отнеси тюк торговцу Фьолниру", done: false };
        return { desc: "Найди оброненный тюк на тракте", done: false };
      }
      case "s_atone": {
        if (f.atoneDone) return { desc: "Норны приняли дар", done: true };
        if (f.relic) return { desc: "Возложи реликвию на древний алтарь", done: false };
        return { desc: "Найди реликвию мёртвых в пустоши", done: false };
      }
      case "s_shrines": return {
        desc: `Зажги все святилища Нидов (${this.state.visitedShrines.size}/${this.state.ow ? this.state.ow.shrines.length : 4})`,
        done: f.shrineQuestDone,
      };
      case "s_hunt": return {
        desc: `Истреби порождений петли (${Math.min(12, f.kills)}/12)`,
        done: f.huntDone,
      };
      case "s_ghost": {
        if (f.ghostBane) return { desc: "Клинок освящён — сталь бьёт призраков", done: true };
        if (f.dew >= 3) return { desc: "Отнеси Шаману 3 Туманной Росы", done: false };
        return { desc: `Переживи волну и собери Росу (${f.dew ?? 0}/3)`, done: false };
      }
      default: return { desc: "", done: false };
    }
  }

  buildQuests(): QuestView[] {
    const defs = this.questDefs();
    return defs
      .filter((q) => this.state.revealed.has(q.id))
      .map((q) => {
        const { desc, done } = this.questDesc(q.id);
        return { id: q.id, title: q.title, desc, main: q.main, done, tracked: this.state.trackedQuest === q.id };
      });
  }

  revealQuest(id: string, silent = false) {
    if (this.state.revealed.has(id)) return;
    this.state.revealed.add(id);
    const def = this.questDefs().find((q) => q.id === id);
    if (def && !silent) { audio.quest(); this.bus.emit("toast", { msg: `Новый квест: ${def.title}` }); }
    this.bus.emit("hud:dirty", {});
  }

  checkQuestProgress() {
    const cur = this.mainQuestId();
    if (cur !== this.state.lastMain) {
      this.state.lastMain = cur;
      this.revealQuest(cur, true);
      const def = this.questDefs().find((q) => q.id === cur);
      if (def) { this.bus.emit("toast", { msg: `Новая цель саги: ${def.title}` }); audio.quest(); }
      const { done } = this.questDesc(this.state.trackedQuest);
      if (done) this.state.trackedQuest = cur;
      this.bus.emit("hud:dirty", {});
    }
    const f = this.state.flags;
    if (!f.huntDone && f.kills >= 12) {
      f.huntDone = true;
      f.arrows += 10;
      audio.chime();
      this.bus.emit("toast", { msg: "Зачистка Нидов: дух-ворон принёс +10 стрел" });
      this.bus.emit("hud:dirty", {});
    }
    if (!f.shrineQuestDone && this.state.ow && this.state.visitedShrines.size >= this.state.ow.shrines.length) {
      f.shrineQuestDone = true;
      this.state.player.maxHp += 2;
      this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 2);
      audio.rune();
      this.bus.emit("toast", { msg: "Паломничество завершено: максимальное здоровье +2" });
      this.bus.emit("hud:dirty", {});
    }
  }

  trackedTarget(): Vec | null {
    const m = this.state.map;
    const f = this.state.flags;
    if (!m) return null;
    const px = (v: Vec) => ({ x: v.x * T + 8, y: v.y * T + 8 });
    const nearestOf = (pts: Vec[]): Vec | null => {
      let best: Vec | null = null; let bd = Infinity;
      for (const pt of pts) {
        const d2 = px2(pt.x, pt.y, this.state.player.x, this.state.player.y);
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
      const en = this.state.ow.dungeonEntries.find((e) => e.id === id);
      return en ? px(en) : null;
    };
    const npcSpot = (id: string): Vec | null => {
      const n = this.state.ow.npcs.find((x) => x.id === id);
      return n ? px(n) : null;
    };
    switch (this.state.trackedQuest) {
      case "m1": return m.isDungeon ? null : npcSpot("eirik") ?? px(m.villageA);
      case "m2": return dungeonTarget(0);
      case "m3": return dungeonTarget(1);
      case "m4": {
        if (m.isDungeon) return null;
        return nearestOf(this.state.pedestals.filter((p: any) => !p.taken).map((p: any) => ({ x: p.x, y: p.y })));
      }
      case "m5": return dungeonTarget(2);
      case "m6": return this.state.bossRef ? { x: this.state.bossRef.x, y: this.state.bossRef.y } : (m.isDungeon ? null : px(m.treeAltar));
      case "s_bear": {
        if (m.isDungeon || f.bearGone) return null;
        if (f.bear) return npcSpot("daughter");
        return px(m.bearSpot);
      }
      case "s_horn": {
        if (m.isDungeon || f.hornDone) return null;
        if (f.horn) return npcSpot("sigrid");
        return px(m.hornSpot);
      }
      case "s_mead": {
        if (m.isDungeon || f.meadDone) return null;
        if (f.mead) return npcSpot("astrid");
        return px(m.meadSpot);
      }
      case "s_ore": {
        if (m.isDungeon || f.oreDone) return null;
        if (f.ore) return npcSpot("harald");
        return px(m.oreSpot);
      }
      case "s_moss": {
        if (m.isDungeon || f.shamanDone) return null;
        if (f.moss && f.amber && f.flower) return npcSpot("shaman");
        const spots: Vec[] = [];
        if (!f.moss) spots.push(px(m.mossSpot));
        if (!f.amber) spots.push(px(m.amberSpot));
        if (!f.flower) spots.push(px(m.flowerSpot));
        return nearestOf(spots);
      }
      case "s_diary": {
        if (m.isDungeon || f.refugeeDone) return null;
        if (f.diary) return npcSpot("refugee");
        return px(m.diarySpot);
      }
      case "s_cull": {
        const alive = this.state.enemies.filter((e) => !e.dead && (e.kind === "varg" || e.kind === "draugr"));
        return alive.length ? nearestOf(alive.map((e) => ({ x: e.x, y: e.y }))) : null;
      }
      case "s_bundle": {
        if (m.isDungeon || f.merchantDone) return null;
        if (f.bundle) return npcSpot("merchant");
        return px(m.bundleSpot);
      }
      case "s_atone": {
        if (m.isDungeon || f.atoneDone) return null;
        if (f.relic) return px(m.oldAltar);
        return px(m.relicSpot);
      }
      case "s_shrines": {
        if (m.isDungeon) return null;
        const unv = m.shrines.filter((_: any, i: number) => !this.state.visitedShrines.has(i)).map((s: any) => px(s));
        return unv.length ? nearestOf(unv) : null;
      }
      case "s_hunt": {
        const alive = this.state.enemies.filter((e) => !e.dead && e.kind !== "snake");
        if (!alive.length) return null;
        return nearestOf(alive.map((e) => ({ x: e.x, y: e.y })));
      }
      case "s_ghost": {
        if (m.isDungeon || f.ghostBane) return null;
        if (f.dew >= 3) return npcSpot("shaman");
        return null;
      }
      default: return null;
    }
  }

  trackedTitle(): string {
    const def = this.questDefs().find((q) => q.id === this.state.trackedQuest);
    return def ? def.title : "Сага";
  }
}

interface QuestView {
  id: string; title: string; desc: string; main: boolean; done: boolean; tracked: boolean;
}

function px2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
