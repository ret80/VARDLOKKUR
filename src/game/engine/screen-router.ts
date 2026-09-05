/* screen-router.ts – Управление экранами и оверлеями */

import type { EventBus } from "../event-bus";
import type { GameStore } from "../store";
import type { StateManager } from "../state/state-manager";
import type { QuestSystem } from "../quests/quest-system";
import type { Screen } from "../models";

export type ScreenTransition =
  | { type: "set-screen"; screen: Screen }
  | { type: "toast"; message: string }
  | { type: "audio-ui-click" };

export class ScreenRouter {
  constructor(
    private state: StateManager,
    private bus: EventBus,
    private store: GameStore,
    private quests: QuestSystem,
    private onScreenChange: (screen: Screen) => void,
    private onToast: (msg: string) => void,
    private onAudioUiClick: () => void
  ) {}

  /** Переключить паузу / продолжить */
  handlePause(): void {
    if (this.state.screen === "play") {
      this.setScreen("pause");
    } else if (this.state.screen === "pause") {
      this.setScreen("play");
    } else {
      this.closeOverlay();
    }
  }

  /** Переключить инвентарь */
  handleInventory(): void {
    if (this.state.screen === "play") {
      this.setScreen("inventory");
    } else if (this.state.screen === "inventory") {
      this.setScreen("play");
    }
    this.onAudioUiClick();
  }

  /** Переключить квесты */
  handleQuests(): void {
    if (this.state.screen === "play") {
      this.setScreen("quests");
    } else if (this.state.screen === "quests") {
      this.setScreen("play");
    }
    this.onAudioUiClick();
  }

  /** Переключить снег на крышах */
  handleSnow(): void {
    const roofSnow = !this.store.roofSnow;
    this.store.roofSnow = roofSnow;
    this.onToast(roofSnow ? "Снег на крышах: вкл" : "Снег на крышах: выкл");
  }

  /** Закрыть любой оверлей и вернуться к игре */
  closeOverlay(): void {
    if (
      this.state.screen === "quests" ||
      this.state.screen === "inventory" ||
      this.state.screen === "map"
    ) {
      this.setScreen("play");
    }
  }

  /** Открыть квесты (если в игре) */
  openQuests(): void {
    if (this.state.screen === "play") this.setScreen("quests");
  }

  /** Открыть инвентарь (если в игре) */
  openInventory(): void {
    if (this.state.screen === "play") this.setScreen("inventory");
  }

  /** Открыть большую карту (если в игре) */
  openMap(): void {
    if (this.state.screen === "play") this.setScreen("map");
  }

  /** Установить экран */
  setScreen(screen: Screen): void {
    this.state.screen = screen;
    this.onScreenChange(screen);
  }

  /** Отслеживать квест по ID */
  trackQuest(id: string): void {
    this.store.trackedQuest = id;
    const def = this.quests.questDefs().find((q) => q.id === id);
    this.onToast(def ? `Стрелка ведёт: ${def.title}` : "Цель обновлена");
    this.onAudioUiClick();
    this.bus.emit("hud:dirty", {});
  }
}
