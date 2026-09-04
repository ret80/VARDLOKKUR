/* ============ IQuestProvider ============ */
import { QuestView } from "../types";

/**
 * Интерфейс провайдера квестов (DIP: HudSystem зависит от абстракции, а не от QuestSystem).
 * Позволяет подменять реализацию (mock для тестов, другую систему квестов).
 */
export interface IQuestProvider {
  /** Описание квеста по ID. */
  questDesc(id: string): { desc: string; done: boolean };
  /** Полный список открытых квестов. */
  buildQuests(): QuestView[];
  /** Заголовок текущего отслеживаемого квеста. */
  trackedTitle(): string;
}

export type { QuestView };
