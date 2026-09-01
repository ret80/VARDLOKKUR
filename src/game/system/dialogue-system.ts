/* ============ DialogueSystem ============ */
import { EventBus } from "../event-bus";
import { GameState, GameEvents } from "../game-states";
import { DialogueData } from "../engine";
import { audio } from "../audio";
import { IFxManager } from "./fx-manager";

export class DialogueSystem {
  private state: GameState;
  private bus: EventBus;
  private active = false;
  private _lastId = "";
  private fx: IFxManager;

  constructor(bus: EventBus, state: GameState, fx: IFxManager) {
    this.bus = bus;
    this.state = state;
    this.fx = fx;
    bus.on("dialogue:end", (e) => this.applyDialogueEffects(e.id));
  }

  get activeDialogue(): boolean { return this.active; }
  get lastId(): string { return this._lastId; }

  startDialogue(id: string, onDialogue: (d: DialogueData | null) => void): DialogueData | null {
    const d = this.dialogueFor(id);
    if (!d) return null;
    this.active = true;
    this._lastId = id;
    this.state.talkCount++;
    const gives: Record<string, string> = {
      daughter: "s_bear", sigrid: "s_horn", astrid: "s_mead",
      shaman: "s_moss", refugee: "s_diary", brand: "s_cull", merchant: "s_bundle",
    };
    if (gives[id]) this.bus.emit("quest:reveal", { id: gives[id], silent: true });
    if (id === "harald" && this.state.flags.giantDead) this.bus.emit("quest:reveal", { id: "s_ore", silent: true });
    audio.uiClick();
    onDialogue(d);
    return d;
  }

  endDialogue(onDialogue: (d: DialogueData | null) => void) {
    this.active = false;
    onDialogue(null);
  }

  private applyDialogueEffects(id: string) {
    const f = this.state.flags;
    const p = this.state.player;
    if (id === "eirik" && !f.hasSword) {
      f.hasSword = true;
      audio.rune();
      this.bus.emit("toast", { msg: "Ржавый Меч вернулся к тебе" });
      this.fx.burst(p.x, p.y, 0xc9a24b, 18, 90, 1.0, 2, -10);
      this.bus.emit("hud:dirty", {});
    }
    if (id === "astrid") {
      if (f.mead && !f.meadDone) {
        f.mead = false; f.meadDone = true;
        p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2);
        audio.rune(); this.bus.emit("toast", { msg: "Зелье из дикого мёда: максимальное здоровье +2" });
      } else {
        p.hp = p.maxHp; audio.heal();
      }
      this.fx.burst(p.x, p.y, 0x7ee2a8, 12, 60, 0.8, 2, -20);
      this.bus.emit("hud:dirty", {});
    }
    if (id === "sigrid" && f.horn && !f.hornDone) {
      f.horn = false; f.hornDone = true; f.axeUp = true;
      audio.rune(); this.bus.emit("toast", { msg: "Рог возвращён. Секира наточена о ледяной камень (+урон)" });
      this.bus.emit("hud:dirty", {});
    }
    if (id === "harald" && f.ore && !f.oreDone) {
      f.ore = false; f.oreDone = true; f.swordUp = true;
      audio.rune(); this.bus.emit("toast", { msg: "Сердце горы в горне. Меч закалён (+урон)" });
      this.bus.emit("hud:dirty", {});
    }
    if (id === "shaman" && f.moss && f.amber && f.flower && !f.shamanDone) {
      f.moss = false; f.amber = false; f.flower = false; f.shamanDone = true; f.furyRune = true;
      audio.rune(); this.bus.emit("toast", { msg: "Отвар Норн выпит. Руна Ярости: замах быстрее" });
      this.bus.emit("hud:dirty", {});
    }
    if (id === "shaman" && f.dew >= 3 && !f.ghostBane) {
      f.dew = 0; f.ghostBane = true;
      audio.rune(); this.bus.emit("toast", { msg: "Клинок освящён — сталь бьёт призраков" });
      this.bus.emit("hud:dirty", {});
    }
    if (id === "refugee" && f.diary && !f.refugeeDone) {
      f.diary = false; f.refugeeDone = true; f.secretKnown = true;
      audio.rune(); this.bus.emit("toast", { msg: "Тайник старосты отмечен на карте" });
      this.bus.emit("hud:dirty", {});
    }
    if (id === "merchant" && f.bundle && !f.merchantDone) {
      f.bundle = false; f.merchantDone = true; f.arrows += 10; f.secretKnown = true;
      audio.rune(); this.bus.emit("toast", { msg: "Фьолнир доволен: +10 стрел, тайник отмечен" });
      this.bus.emit("hud:dirty", {});
    }
    if (id === "brand") {
      if (!f.cullDone && (f.killsByKind["varg"] ?? 0) >= 4 && (f.killsByKind["draugr"] ?? 0) >= 4) {
        f.cullDone = true; p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2);
        audio.rune(); this.bus.emit("toast", { msg: "Бранд кивает: максимальное здоровье +2" });
        this.bus.emit("hud:dirty", {});
      }
    }
    if (id === "daughter" && f.bear && !f.bearGone) {
      f.bear = false; f.bearGone = true;
      p.maxHp += 2; p.hp = p.maxHp;
      audio.rune();
      this.bus.emit("toast", { msg: "Кровавая Слеза: максимальное здоровье +2" });
      this.fx.burst(p.x, p.y, 0xc03050, 16, 80, 1.0, 2, -10);
      this.bus.emit("hud:dirty", {});
    }
  }

  /* ================= диалоги ================= */
  private dialogueFor(id: string): DialogueData | null {
    const f = this.state.flags;
    switch (id) {
      case "eirik": {
        let lines: string[];
        if (!f.hasSword) lines = [
          "Ты очнулся, Варлок. Снова.",
          "Когда волна выбросила тебя на берег, в руке ты сжимал этот клинок.",
          "Он был при тебе в час смерти — значит, он твой по праву петли.",
          "Возьми Ржавый Меч обратно. Без стали у воина нет и смерти.",
        ];
        else if (!f.reaperDead) lines = [
          "Клинок вспомнил твою руку.",
          "В Руинах Времени зияет Склеп Хранителя. Жнец стережёт порог.",
          "Убей его — и ледяная сталь станет твоей.",
        ];
        else if (!f.spiderDead) lines = [
          "Жнец пал... а петля всё крутится.",
          "В чаще Чёрного Леса гниёт Корень Иггдрасиля — Паук свил в нём гнездо.",
          "Одолей его, и Лук Сумерек станет твоим.",
        ];
        else if (f.runes < 5) lines = [
          `Забытых Рун пять, и ты нашёл ${f.runes}.`,
          "Каждую стерегут мёртвые. Печать падает вместе с ними.",
          "Спеши, Варлок. Древо гниёт.",
        ];
        else if (!f.giantDead) lines = [
          "Все пять Рун поют в твоей крови.",
          "Осталось одно: в Горах стоит Каменная Крепость, а в ней — Великан.",
          "Сокруши его, и молот богов станет твоим.",
        ];
        else lines = [
          "Три стража пали, и молот гудит в твоей руке.",
          "Иди к корням Иггдрасиля и сыграй Песнь Разрыва.",
          "И помни: пробудив Змея, ты разбудишь и всех нас... навсегда.",
        ];
        return { id, name: "Эйрик Старший", lines };
      }
      case "astrid": {
        if (f.meadDone) return { id, name: "Астрид", lines: ["Зелье из того мёда ещё варится.", "А пока — дай залатаю твои раны."] };
        if (f.mead) return { id, name: "Астрид", lines: ["Дикий мёд! Из него выйдет славное зелье силы.", "Отдай его мне — и я сделаю тебя крепче."] };
        return { id, name: "Астрид", lines: [
          "Постой спокойно, Варлок.",
          "Я залатаю твою душу, сколько смогу.",
          "Если добудешь дикий мёд в Чёрном Лесу — сварила бы зелье покрепче.",
        ] };
      }
      case "harald": {
        if (f.oreDone) return { id, name: "Харальд", lines: ["Твой клинок теперь поёт.", "Когда-то я ковал для живых. Теперь кую память о них."] };
        if (f.ore) return { id, name: "Харальд", lines: ["Сердце горы! Жаркое, как в день Рагнарёка.", "Отдай его — и я закалю твой меч."] };
        if (f.giantDead) return { id, name: "Харальд", lines: ["Слышал, Великан рассыпался в прах.", "В его останках должно быть Сердце горы. Принеси — закалю твой меч."] };
        const lore = [
          ["Когда-то я ковал для живых.", "Теперь кую память о них.", "Принеси мне бой — я выкую тебе славу."],
          ["Драугр держит щит к лицу. Бей сбоку — или заморозь и разбей."],
          ["Волны Тумана — это дыхание Змея. В тумане ходят его лучшие кошмары."],
          ["Гунгнира не будет. Копьё сломали ещё до петли.", "Но и клыка хватит, чтобы проткнуть глаз Миража."],
        ];
        return { id, name: "Харальд", lines: lore[this.state.talkCount % lore.length] };
      }
      case "raven": {
        const tips: Record<string, string> = {
          m1: "Кар-р! Поговори с Эйриком — он вернёт твой клинок!",
          m2: "Кар-р! Лестница в Склеп — в Руинах Времени. Жнец уязвим, когда коса в полу!",
          m3: "Кар-р! Корень Иггдрасиля — в чаще Чёрного Леса. Паук плюется кольцами!",
          m4: "Кар-р! Пьедесталы светятся бирюзой. Убей всех стражей печати.",
          m5: "Кар-р! Каменная Крепость — в Горах. Великан медленен, но не стой под кулаком!",
          m6: "Кар-р! Бей в глаз, когда пасть открыта!",
        };
        return { id, name: "Ворон-Говорун", lines: [tips["m1"] ?? "Кар-р!"] };
      }
      case "daughter": {
        if (f.bearGone) return { id, name: "Безымянная Дочь", lines: ["Спасибо... Мишка снова со мной.", "Когда петля лопнет — я не боюсь."] };
        if (f.bear) return { id, name: "Безымянная Дочь", lines: ["Он здесь! Я чувствую его запах болота!", "Возьми мою слезу, Варлок. Она сделает тебя крепче."] };
        return { id, name: "Безымянная Дочь", lines: ["Ты пахнешь живым миром...", "Мой медвежонок утонул в болоте, на востоке.", "Принеси его. Пожалуйста."] };
      }
      case "sigrid": {
        if (f.hornDone) return { id, name: "Сигрид", lines: ["Рог поёт на своём месте.", "Твоя секира теперь режет и мороз."] };
        if (f.horn) return { id, name: "Сигрид", lines: ["Ты нашёл его! Мой рог!", "В благодарность я наточу твою секиру о ледяной камень."] };
        return { id, name: "Сигрид", lines: ["Варги утащили мой сигнальный рог в горы.", "Без него Гавань нема перед туманом.", "Верни его — и я отплачу."] };
      }
      case "brand": {
        if (f.cullDone) return { id, name: "Бранд", lines: ["Хорошая была охота.", "Держись, Варлок."] };
        const ok = (f.killsByKind["varg"] ?? 0) >= 4 && (f.killsByKind["draugr"] ?? 0) >= 4;
        if (ok) return { id, name: "Бранд", lines: ["Вижу, волки и мертвецы тебя боятся.", "Это заслуживает награды."] };
        return { id, name: "Бранд", lines: ["Волки совсем обнаглели, и драугры с ними.", "Проредишь четверых волков и четверых мертвецов — отплачу."] };
      }
      case "shaman": {
        if (f.ghostBane) return { id, name: "Шаман Ульв", lines: ["Клинок освящён.", "Иди — туман больше не преграда."] };
        if (f.dew >= 3 && !f.ghostBane) return { id, name: "Шаман Ульв", lines: ["Туманная Роса... да, это то.", "Держи клинок — я освятил его в огне Древа.", "Теперь сталь бьёт призраков."] };
        if (f.shamanDone) return { id, name: "Шаман Ульв", lines: ["Отвар подействовал. Чувствуешь?", "Ярость — тоже оружие, Варлок."] };
        const got = [f.moss, f.amber, f.flower].filter(Boolean).length;
        if (got === 3) return { id, name: "Шаман Ульв", lines: ["Всё принес. Славные дары.", "Отдай мне их — и я сварю Отвар Норн."] };
        return { id, name: "Шаман Ульв", lines: ["Мне нужны три дара: мох из болота, янтарь из гор, цветок из руин.", `Ты принёс ${got} из 3.`, "Принесёшь все — будет тебе Отвар Норн."] };
      }
      case "refugee": {
        if (f.refugeeDone) return { id, name: "Беженка Гюнн", lines: ["Спасибо, что вернул память старосте.", "Тайник он прятал в Руинах."] };
        if (f.diary) return { id, name: "Беженка Гюнн", lines: ["Дневник! Дай мне прочесть...", "Вот оно что. Староста оставил тайник. Отмечу тебе."] };
        return { id, name: "Беженка Гюнн", lines: ["Моя деревня сгорела. Староста успел спрятать дневник.", "Найди его в руинах — там вся наша память."] };
      }
      case "merchant": {
        if (f.merchantDone) return { id, name: "Торговец Фьолнир", lines: ["Торговля идёт, раз петля крутится.", "Загляни в тайник, что я тебе отметил."] };
        if (f.bundle) return { id, name: "Торговец Фьолнир", lines: ["Мой тюк! Вот это удача.", "Держи стрелы — и тайник один покажу."] };
        return { id, name: "Торговец Фьолнир", lines: ["Торговец я, Фьолнир. Хожу меж поселений.", "Обронил тюк с товаром где-то на тракте.", "Найдёшь — не обижу."] };
      }
      default: {
        if (id.startsWith("soul")) {
          const tips = [
            ["Я помню снег... он был тёплым.", "Берегись Морозного — его хватка сковывает ноги."],
            ["Щит драугра крепок спереди.", "Зайди сбоку. Или обрати его в лёд секирой."],
            ["Туман — это дыхание Змея.", "Когда он придёт, держись круга света."],
            ["Грибы плюются спорами издалека.", "Стрела решает всё одним выстрелом."],
            ["Волк кружит, прежде чем прыгнуть.", "Не стой там, куда он смотрит."],
            ["Я видел Древо. Оно плачет смолой.", "Пять Рун — и петля лопнет."],
            ["В ледяных осколках что-то блестит.", "Разбей — и найдёшь припасы."],
          ];
          const t = tips[Math.floor(Math.random() * tips.length)];
          return { id, name: "Потерянная душа", lines: t };
        }
        return null;
      }
    }
  }
}
