/* ============ Drop Handlers — Strategy Pattern for Drop Collection ============
 *
 * Каждый тип дропа имеет свой обработчик, реализующий интерфейс DropHandler.
 * Это заменяет switch/case в DropsSystem.collectDrop на расширяемый дизайн
 * (OCP: новый дроп = новый handler, без модификации существующего кода).
 */

import { EventBus } from "./event-bus";
import { FlagDomain } from "./store/flag-domain";
import { IPlayerMutations } from "./store/player-domain";
import { DropKind } from "./world";
import { audio } from "./audio";

/** Минимальный интерфейс игрока для обработчиков дропов */
export interface IPlayerDropAccess {
  hp: number;
  maxHp: number;
}

/** Контекст, доступный обработчику дропа */
export interface DropContext {
  player: IPlayerDropAccess;
  flags: FlagDomain;
  bus: EventBus;
}

/** Интерфейс обработчика дропа */
export interface DropHandler {
  /** Тип дропа, для которого предназначен handler */
  kind: DropKind;

  /**
   * Обработка сбора дропа.
   * @returns `true` если дроп был обработан и нужно продолжить,
   *          `false` если дроп проигнорирован (например, инвентарь полон)
   */
  handle(ctx: DropContext): boolean;
}

/* ── Базовый хелпер для общих действий ── */

function playAndToast(
  bus: EventBus,
  audioFn: () => void,
  msg: string,
  audioMethod?: "pickup" | "rune"
): void {
  if (audioMethod === "rune") {
    audio.rune();
  } else {
    audio.pickup();
  }
  audioFn();
  bus.emit("toast", { msg });
}

/* ── Конкретные обработчики ── */

class HeartHandler implements DropHandler {
  readonly kind = "heart" as const;

  handle(ctx: DropContext): boolean {
    const { player, flags, bus } = ctx;
    if (player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 3);
      audio.pickup();
      bus.emit("toast", { msg: "+3" });
    } else if (flags.hearts < 9) {
      flags.hearts++;
      audio.pickup();
      bus.emit("toast", { msg: "В суму [F]" });
    } else {
      bus.emit("toast", { msg: "Сума полна" });
      return false;
    }
    return true;
  }
}

class ArrowsHandler implements DropHandler {
  readonly kind = "arrows" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.arrows += 5;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "+5 стрел" });
    return true;
  }
}

class AxeHandler implements DropHandler {
  readonly kind = "axe" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.hasAxe = true;
    audio.rune();
    ctx.bus.emit("toast", { msg: "Ледяная Секира [J] — замораживает врагов и возвращается" });
    return true;
  }
}

class BowHandler implements DropHandler {
  readonly kind = "bow" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.hasBow = true;
    audio.rune();
    ctx.bus.emit("toast", { msg: "Лук Сумерек [удерживай L] — время замирает, стрела летит" });
    return true;
  }
}

class HammerHandler implements DropHandler {
  readonly kind = "hammer" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.hasHammer = true;
    audio.rune();
    ctx.bus.emit("toast", { msg: "Рунический Молот — удары меча оглушают врагов" });
    return true;
  }
}

class BearHandler implements DropHandler {
  readonly kind = "bear" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.bear = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Медвежонок из болота. Дочь ждёт его в Чёрном Лесу" });
    return true;
  }
}

class HornHandler implements DropHandler {
  readonly kind = "horn" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.horn = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Рог Сигрид. Отнеси его в Воронью Гавань" });
    return true;
  }
}

class MeadHandler implements DropHandler {
  readonly kind = "mead" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.mead = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Дикий мёд. Астрид будет рада" });
    return true;
  }
}

class OreHandler implements DropHandler {
  readonly kind = "ore" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.ore = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Сердце горы. Харальд заждался" });
    return true;
  }
}

class MossHandler implements DropHandler {
  readonly kind = "moss" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.moss = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Болотный мох. Шаману пригодится" });
    return true;
  }
}

class AmberHandler implements DropHandler {
  readonly kind = "amber" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.amber = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Горный янтарь. Шаману пригодится" });
    return true;
  }
}

class FlowerHandler implements DropHandler {
  readonly kind = "flower" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.flower = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Могильный цветок. Шаману пригодится" });
    return true;
  }
}

class DewHandler implements DropHandler {
  readonly kind = "dew" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.dew = (ctx.flags.dew ?? 0) + 1;
    audio.pickup();
    ctx.bus.emit("toast", { msg: `Туманная Роса ${ctx.flags.dew}/3` });
    return true;
  }
}

class DiaryHandler implements DropHandler {
  readonly kind = "diary" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.diary = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Дневник старосты сожжённой деревни" });
    return true;
  }
}

class BundleHandler implements DropHandler {
  readonly kind = "bundle" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.bundle = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Потерянный тюк Фьолнира" });
    return true;
  }
}

class RelicHandler implements DropHandler {
  readonly kind = "relic" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.relic = true;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Реликвия мёртвых. Древний алтарь зовёт" });
    return true;
  }
}

class ShardHandler implements DropHandler {
  readonly kind = "shard" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.arrows += 3;
    audio.pickup();
    ctx.bus.emit("toast", { msg: "+3 стрел" });
    return true;
  }
}

class BonesHandler implements DropHandler {
  readonly kind = "bones" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.arrows += 2;
    ctx.player.hp = Math.min(ctx.player.maxHp, ctx.player.hp + 1);
    audio.pickup();
    ctx.bus.emit("toast", { msg: "Припасы" });
    return true;
  }
}

class RuneHandler implements DropHandler {
  readonly kind = "rune" as const;

  handle(ctx: DropContext): boolean {
    ctx.flags.runes++;
    audio.rune();
    ctx.bus.emit("toast", { msg: `Забытая Руна ${ctx.flags.runes}/5 впитана` });
    return true;
  }
}

/* ── Registry ── */

/**
 * Реестр обработчиков дропов.
 * Позволяет добавлять новые типы дропов без модификации DropsSystem.
 */
export class DropHandlerRegistry {
  private readonly handlers: Map<DropKind, DropHandler> = new Map();

  constructor() {
    // Регистрируем все обработчики по умолчанию
    const defaultHandlers: DropHandler[] = [
      new HeartHandler(),
      new ArrowsHandler(),
      new AxeHandler(),
      new BowHandler(),
      new HammerHandler(),
      new BearHandler(),
      new HornHandler(),
      new MeadHandler(),
      new OreHandler(),
      new MossHandler(),
      new AmberHandler(),
      new FlowerHandler(),
      new DewHandler(),
      new DiaryHandler(),
      new BundleHandler(),
      new RelicHandler(),
      new ShardHandler(),
      new BonesHandler(),
      new RuneHandler(),
    ];

    for (const handler of defaultHandlers) {
      this.handlers.set(handler.kind, handler);
    }
  }

  /** Зарегистрировать пользовательский обработчик */
  register(handler: DropHandler): void {
    this.handlers.set(handler.kind, handler);
  }

  /** Получить обработчик для типа дропа */
  get(kind: DropKind): DropHandler | undefined {
    return this.handlers.get(kind);
  }

  /** Обработать сбор дропа */
  collect(kind: DropKind, ctx: DropContext): boolean {
    const handler = this.handlers.get(kind);
    if (!handler) {
      console.warn(`[DropHandlerRegistry] No handler for drop kind: ${kind}`);
      return false;
    }
    return handler.handle(ctx);
  }
}
