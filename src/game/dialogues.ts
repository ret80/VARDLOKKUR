/* ============ Dialogue Definitions — декларативные описания NPC ============
 *
 * Каждый NPC определяется как массив веток (branches).
 * При поиске диалога ветки перебираются по порядку — первая ветка,
 * condition которой возвращает не-null, выбирается как результат.
 *
 * Это устраняет switch/case из DialogueSystem и следует OCP:
 * новый NPC = новый массив, без модификации существующего кода.
 * */

import { DialogueData } from "./engine";

/** Контекст, передаваемый в condition (опционально) */
export interface DialogueContext {
  talkCount?: number;
  [key: string]: any;
}

/** Условие для ветки диалога. Возвращает строки или null. */
export type DialogueBranchCondition = (flags: Record<string, any>, ctx?: DialogueContext) => string[] | null;

/** Одна ветка диалога */
export interface DialogueBranch {
  id: string;
  name: string;
  condition: DialogueBranchCondition;
}

/** Все диалоги NPC */
export type DialogueDefinition = DialogueBranch[];

/** Маппинг NPC id → определение диалога */
export type DialogueDefinitions = Record<string, DialogueDefinition>;

// ─── Утилиты ───────────────────────────────────────────────────────────────

/** Проверка: все указанные флаги true */
function allTrue(flags: Record<string, any>, keys: string[]): boolean {
  return keys.every((k) => flags[k]);
}

/** Проверка: все указанные флаги false */
function allFalse(flags: Record<string, any>, keys: string[]): boolean {
  return keys.every((k) => !flags[k]);
}

// ─── NPC: Эйрик Старший ───────────────────────────────────────────────────

export const eirikDialogue: DialogueDefinition = [
  {
    id: "eirik", name: "Эйрик Старший",
    condition: (f) => {
      if (allFalse(f, ["hasSword"])) return [
        "Ты очнулся, Варлок. Снова.",
        "Когда волна выбросила тебя на берег, в руке ты сжимал этот клинок.",
        "Он был при тебе в час смерти — значит, он твой по праву петли.",
        "Возьми Ржавый Меч обратно. Без стали у воина нет и смерти.",
      ];
      if (!f.reaperDead) return [
        "Клинок вспомнил твою руку.",
        "В Руинах Времени зияет Склеп Хранителя. Жнец стережёт порог.",
        "Убей его — и ледяная сталь станет твоей.",
      ];
      if (!f.spiderDead) return [
        "Жнец пал... а петля всё крутится.",
        "В чаще Чёрного Леса гниёт Корень Иггдрасиля — Паук свил в нём гнездо.",
        "Одолей его, и Лук Сумерек станет твоим.",
      ];
      if (f.runes! < 5) return [
        `Забытых Рун пять, и ты нашёл ${f.runes}.`,
        "Каждую стерегут мёртвые. Печать падает вместе с ними.",
        "Спеши, Варлок. Древо гниёт.",
      ];
      if (!f.giantDead) return [
        "Все пять Рун поют в твоей крови.",
        "Осталось одно: в Горах стоит Каменная Крепость, а в ней — Великан.",
        "Сокруши его, и молот богов станет твоим.",
      ];
      return [
        "Три стража пали, и молот гудит в твоей руке.",
        "Иди к корням Иггдрасиля и сыграй Песнь Разрыва.",
        "И помни: пробудив Змея, ты разбудишь и всех нас... навсегда.",
      ];
    },
  },
];

// ─── NPC: Астрид ───────────────────────────────────────────────────────────

export const astridDialogue: DialogueDefinition = [
  {
    id: "astrid", name: "Астрид",
    condition: (f) => {
      if (f.meadDone) return ["Зелье из того мёда ещё варится.", "А пока — дай залатаю твои раны."];
      if (f.mead) return ["Дикий мёд! Из него выйдет славное зелье силы.", "Отдай его мне — и я сделаю тебя крепче."];
      return [
        "Постой спокойно, Варлок.",
        "Я залатаю твою душу, сколько смогу.",
        "Если добудешь дикий мёд в Чёрном Лесу — сварила бы зелье покрепче.",
      ];
    },
  },
];

// ─── NPC: Харальд ──────────────────────────────────────────────────────────

const haraldLore: string[][] = [
  ["Когда-то я ковал для живых.", "Теперь кую память о них.", "Принеси мне бой — я выкую тебе славу."],
  ["Драугр держит щит к лицу. Бей сбоку — или заморозь и разбей."],
  ["Волны Тумана — это дыхание Змея. В тумане ходят его лучшие кошмары."],
  ["Гунгнира не будет. Копьё сломали ещё до петли.", "Но и клыка хватит, чтобы проткнуть глаз Миража."],
];

export const haraldDialogue: DialogueDefinition = [
  {
    id: "harald", name: "Харальд",
    condition: (f, ctx) => {
      if (f.oreDone) return ["Твой клинок теперь поёт.", "Когда-то я ковал для живых. Теперь кую память о них."];
      if (f.ore) return ["Сердце горы! Жаркое, как в день Рагнарёка.", "Отдай его — и я закалю твой меч."];
      if (f.giantDead) return ["Слышал, Великан рассыпался в прах.", "В его останках должно быть Сердце горы. Принеси — закалю твой меч."];
      const tc = (ctx as { talkCount?: number })?.talkCount;
      const lore = haraldLore[tc !== undefined ? tc % haraldLore.length : 0];
      return lore;
    },
  },
];

// ─── NPC: Ворон-Говорун ───────────────────────────────────────────────────

const ravenTips: Record<string, string> = {
  m1: "Кар-р! Поговори с Эйриком — он вернёт твой клинок!",
  m2: "Кар-р! Лестница в Склеп — в Руинах Времени. Жнец уязвим, когда коса в полу!",
  m3: "Кар-р! Корень Иггдрасиля — в чаще Чёрного Леса. Паук плюётся кольцами!",
  m4: "Кар-р! Пьедесталы светятся бирюзой. Убей всех стражей печати.",
  m5: "Кар-р! Каменная Крепость — в Горах. Великан медленен, но не стой под кулаком!",
  m6: "Кар-р! Бей в глаз, когда пасть открыта!",
};

export const ravenDialogue: DialogueDefinition = [
  {
    id: "raven", name: "Ворон-Говорун",
    condition: () => [ravenTips.m1 ?? "Кар-р!"],
  },
];

// ─── NPC: Безымянная Дочь ──────────────────────────────────────────────────

export const daughterDialogue: DialogueDefinition = [
  {
    id: "daughter", name: "Безымянная Дочь",
    condition: (f) => {
      if (f.bearGone) return ["Спасибо... Мишка снова со мной.", "Когда петля лопнет — я не боюсь."];
      if (f.bear) return ["Он здесь! Я чувствую его запах болота!", "Возьми мою слезу, Варлок. Она сделает тебя крепче."];
      return ["Ты пахнешь живым миром...", "Мой медвежонок утонул в болоте, на востоке.", "Принеси его. Пожалуйста."];
    },
  },
];

// ─── NPC: Сигрид ───────────────────────────────────────────────────────────

export const sigridDialogue: DialogueDefinition = [
  {
    id: "sigrid", name: "Сигрид",
    condition: (f) => {
      if (f.hornDone) return ["Рог поёт на своём месте.", "Твоя секира теперь режет и мороз."];
      if (f.horn) return ["Ты нашёл его! Мой рог!", "В благодарность я наточу твою секиру о ледяной камень."];
      return ["Волги утащили мой сигнальный рог в горы.", "Без него Гавань нема перед туманом.", "Верни его — и я отплачу."];
    },
  },
];

// ─── NPC: Бранд ────────────────────────────────────────────────────────────

export const brandDialogue: DialogueDefinition = [
  {
    id: "brand", name: "Бранд",
    condition: (f) => {
      if (f.cullDone) return ["Хорошая была охота.", "Держись, Варлок."];
      const ok = (f.killsByKind?.["varg"] ?? 0) >= 4 && (f.killsByKind?.["draugr"] ?? 0) >= 4;
      if (ok) return ["Вижу, волки и мертвецы тебя боятся.", "Это заслуживает награды."];
      return ["Волки совсем обнаглели, и драугры с ними.", "Проредишь четверых волков и четверых мертвецов — отплачу."];
    },
  },
];

// ─── NPC: Шаман Ульв ──────────────────────────────────────────────────────

export const shamanDialogue: DialogueDefinition = [
  {
    id: "shaman", name: "Шаман Ульв",
    condition: (f) => {
      if (f.ghostBane) return ["Клинок освящён.", "Иди — туман больше не преграда."];
      if (f.dew! >= 3 && !f.ghostBane) return ["Туманная Роса... да, это то.", "Держи клинок — я освятил его в огне Древа.", "Теперь сталь бьёт призраков."];
      if (f.shamanDone) return ["Отвар подействовал. Чувствуешь?", "Ярость — тоже оружие, Варлок."];
      const got = [f.moss, f.amber, f.flower].filter(Boolean).length;
      if (got === 3) return ["Всё принес. Славные дары.", "Отдай мне их — и я сварю Отвар Норн."];
      return [
        "Мне нужны три дара: мох из болота, янтарь из гор, цветок из руин.",
        `Ты принёс ${got} из 3.`,
        "Принесёшь все — будет тебе Отвар Норн.",
      ];
    },
  },
];

// ─── NPC: Беженка Гюнн ─────────────────────────────────────────────────────

export const refugeeDialogue: DialogueDefinition = [
  {
    id: "refugee", name: "Беженка Гюнн",
    condition: (f) => {
      if (f.refugeeDone) return ["Спасибо, что вернул память старосте.", "Тайник он прятал в Руинах."];
      if (f.diary) return ["Дневник! Дай мне прочесть...", "Вот оно что. Староста оставил тайник. Отмечу тебе."];
      return ["Моя деревня сгорела. Староста успел спрятать дневник.", "Найди его в руинах — там вся наша память."];
    },
  },
];

// ─── NPC: Торговец Фьолнир ─────────────────────────────────────────────────

export const merchantDialogue: DialogueDefinition = [
  {
    id: "merchant", name: "Торговец Фьолнир",
    condition: (f) => {
      if (f.merchantDone) return ["Торговля идёт, раз петля крутится.", "Загляни в тайник, что я тебе отметил."];
      if (f.bundle) return ["Мой тюк! Вот это удача.", "Держи стрелы — и тайник один покажу."];
      return ["Торговец я, Фьолнир. Хожу меж поселений.", "Обронил тюк с товаром где-то на тракте.", "Найдёшь — не обижу."];
    },
  },
];

// ─── NPC: Потерянные души ──────────────────────────────────────────────────

const soulTips: string[][] = [
  ["Я помню снег... он был тёплым.", "Берегись Морозного — его хватка сковывает ноги."],
  ["Щит драугра крепок спереди.", "Зайди сбоку. Или обрати его в лёд секирой."],
  ["Туман — это дыхание Змея.", "Когда он придёт, держись круга света."],
  ["Грибы плюются спорами издалека.", "Стрела решает всё одним выстрелом."],
  ["Волк кружит, прежде чем прыгнуть.", "Не стой там, куда он смотрит."],
  ["Я видел Древо. Оно плачет смолой.", "Пять Рун — и петля лопнет."],
  ["В ледяных осколках что-то блестит.", "Разбей — и найдёшь припасы."],
];

export const soulDialogue: DialogueDefinition = [
  {
    id: "soul", name: "Потерянная душа",
    condition: () => {
      const t = soulTips[Math.floor(Math.random() * soulTips.length)];
      return t;
    },
  },
];

// ─── Сводная таблица всех диалогов ─────────────────────────────────────────

export const allDialogues: DialogueDefinitions = {
  eirik: eirikDialogue,
  astrid: astridDialogue,
  harald: haraldDialogue,
  raven: ravenDialogue,
  daughter: daughterDialogue,
  sigrid: sigridDialogue,
  brand: brandDialogue,
  shaman: shamanDialogue,
  refugee: refugeeDialogue,
  merchant: merchantDialogue,
  soul: soulDialogue,
};

/**
 * Найти диалог по NPC id.
 * Перебирает ветки — первая condition, возвращающая не-null, побеждает.
 */
export function resolveDialogue(
  id: string,
  flags: Record<string, any>,
  ctx?: Record<string, any>
): DialogueData | null {
  const def = allDialogues[id];
  if (!def) return null;

  for (const branch of def) {
    const lines = branch.condition(flags, ctx);
    if (lines !== null) {
      return { id: branch.id, name: branch.name, lines };
    }
  }

  return null;
}
