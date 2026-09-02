/* ============ DialogueSystem ============
 *
 * Thin dispatcher: передал id → получил DialogueData из declarative definitions.
 * Эффекты диалогов тоже вынесены из switch/case в отдельные методы-хендлеры.
 *
 * OCP: новый NPC = новый файл в dialogues.ts, без модификации системы.
 * */
import { EventBus } from "../event-bus";
import { GameStore } from "../store";
import { DialogueData } from "../engine";
import { audio } from "../audio";
import { IFxManager } from "./fx-manager";
import { resolveDialogue } from "../dialogues";

export class DialogueSystem {
  private store: GameStore;
  private bus: EventBus;
  private active = false;
  private _lastId = "";
  private fx: IFxManager;

  constructor(bus: EventBus, store: GameStore, fx: IFxManager) {
    this.bus = bus;
    this.store = store;
    this.fx = fx;
    bus.on("dialogue:end", (e) => this.applyDialogueEffects(e.id));
  }

  get activeDialogue(): boolean { return this.active; }
  get lastId(): string { return this._lastId; }

  startDialogue(id: string, onDialogue: (d: DialogueData | null) => void): DialogueData | null {
    const d = this.resolveDialogue(id);
    if (!d) return null;
    this.active = true;
    this._lastId = id;
    this.store.talkCount++;
    const gives: Record<string, string> = {
      daughter: "s_bear", sigrid: "s_horn", astrid: "s_mead",
      shaman: "s_moss", refugee: "s_diary", brand: "s_cull", merchant: "s_bundle",
    };
    if (gives[id]) this.bus.emit("quest:reveal", { id: gives[id], silent: true });
    if (id === "harald" && this.store.flags.giantDead) this.bus.emit("quest:reveal", { id: "s_ore", silent: true });
    audio.uiClick();
    onDialogue(d);
    return d;
  }

  endDialogue(onDialogue: (d: DialogueData | null) => void) {
    this.active = false;
    onDialogue(null);
    this.bus.emit("dialogue:end", { id: this._lastId });
  }

  private get playerDomain() { return this.store.playerDomain; }

  // ── Thin dispatcher: делегирует поиск диалога declarative definitions ──

  private resolveDialogue(id: string): DialogueData | null {
    const flags = this.store.flags as Record<string, any>;
    return resolveDialogue(id, flags, { talkCount: this.store.talkCount });
  }

  // ── Effects dispatch ──

  private applyDialogueEffects(id: string) {
    const handler = this.effectHandlers[id];
    handler?.();
  }

  // ── Effect handlers (по одному на NPC) ──

  private effect_eirik(id: string) {
    const f = this.store.flags;
    const p = this.store.player;
    if (!f.hasSword) {
      f.hasSword = true;
      audio.rune();
      this.bus.emit("toast", { msg: "Ржавый Меч вернулся к тебе" });
      this.fx.burst(p.x, p.y, 0xc9a24b, 18, 90, 1.0, 2, -10);
      this.bus.emit("hud:dirty", {});
    }
  }

  private effect_astrid(id: string) {
    const f = this.store.flags;
    const p = this.store.player;
    if (f.mead && !f.meadDone) {
      f.mead = false; f.meadDone = true;
      const r = this.playerDomain!.increaseMaxHp(2); p.maxHp = r.maxHp; p.hp = r.hp;
      audio.rune(); this.bus.emit("toast", { msg: "Зелье из дикого мёда: максимальное здоровье +2" });
    } else {
      p.hp = this.playerDomain!.fullHeal(); audio.heal();
    }
    this.fx.burst(p.x, p.y, 0x7ee2a8, 12, 60, 0.8, 2, -20);
    this.bus.emit("hud:dirty", {});
  }

  private effect_sigrid(id: string) {
    const f = this.store.flags;
    if (f.horn && !f.hornDone) {
      f.horn = false; f.hornDone = true; f.axeUp = true;
      audio.rune(); this.bus.emit("toast", { msg: "Рог возвращён. Секира наточена о ледяной камень (+урон)" });
      this.bus.emit("hud:dirty", {});
    }
  }

  private effect_harald(id: string) {
    const f = this.store.flags;
    if (f.ore && !f.oreDone) {
      f.ore = false; f.oreDone = true; f.swordUp = true;
      audio.rune(); this.bus.emit("toast", { msg: "Сердце горы в горне. Меч закалён (+урон)" });
      this.bus.emit("hud:dirty", {});
    }
  }

  private effect_shaman(id: string) {
    const f = this.store.flags;
    if (f.moss && f.amber && f.flower && !f.shamanDone) {
      f.moss = false; f.amber = false; f.flower = false; f.shamanDone = true; f.furyRune = true;
      audio.rune(); this.bus.emit("toast", { msg: "Отвар Норн выпит. Руна Ярости: замах быстрее" });
      this.bus.emit("hud:dirty", {});
    }
    if (f.dew! >= 3 && !f.ghostBane) {
      f.dew = 0; f.ghostBane = true;
      audio.rune(); this.bus.emit("toast", { msg: "Клинок освящён — сталь бьёт призраков" });
      this.bus.emit("hud:dirty", {});
    }
  }

  private effect_refugee(id: string) {
    const f = this.store.flags;
    if (f.diary && !f.refugeeDone) {
      f.diary = false; f.refugeeDone = true; f.secretKnown = true;
      audio.rune(); this.bus.emit("toast", { msg: "Тайник старосты отмечен на карте" });
      this.bus.emit("hud:dirty", {});
    }
  }

  private effect_merchant(id: string) {
    const f = this.store.flags;
    if (f.bundle && !f.merchantDone) {
      f.bundle = false; f.merchantDone = true; f.arrows! += 10; f.secretKnown = true;
      audio.rune(); this.bus.emit("toast", { msg: "Фьолнир доволен: +10 стрел, тайник отмечен" });
      this.bus.emit("hud:dirty", {});
    }
  }

  private effect_brand(id: string) {
    const f = this.store.flags;
    const p = this.store.player;
    if (!f.cullDone && (f.killsByKind?.["varg"] ?? 0) >= 4 && (f.killsByKind?.["draugr"] ?? 0) >= 4) {
      f.cullDone = true; const r = this.playerDomain!.increaseMaxHp(2); p.maxHp = r.maxHp; p.hp = r.hp;
      audio.rune(); this.bus.emit("toast", { msg: "Бранд кивает: максимальное здоровье +2" });
      this.bus.emit("hud:dirty", {});
    }
  }

  private effect_daughter(id: string) {
    const f = this.store.flags;
    const p = this.store.player;
    if (f.bear && !f.bearGone) {
      f.bear = false; f.bearGone = true;
      const r = this.playerDomain!.increaseMaxHp(2); p.maxHp = r.maxHp; p.hp = r.hp;
      audio.rune();
      this.bus.emit("toast", { msg: "Кровавая Слеза: максимальное здоровье +2" });
      this.fx.burst(p.x, p.y, 0xc03050, 16, 80, 1.0, 2, -10);
      this.bus.emit("hud:dirty", {});
    }
  }

  // ── Map effect handlers by NPC id (DIP: dispatch через таблицу, не switch) ──

  private effectHandlers: Record<string, () => void> = {
    eirik: () => this.effect_eirik("eirik"),
    astrid: () => this.effect_astrid("astrid"),
    sigrid: () => this.effect_sigrid("sigrid"),
    harald: () => this.effect_harald("harald"),
    shaman: () => this.effect_shaman("shaman"),
    refugee: () => this.effect_refugee("refugee"),
    merchant: () => this.effect_merchant("merchant"),
    brand: () => this.effect_brand("brand"),
    daughter: () => this.effect_daughter("daughter"),
  };
}
