/* ============ Game Types ============ */

/** Представление квеста в HUD. */
export interface QuestView {
  id: string;
  title: string;
  desc: string;
  main: boolean;
  done: boolean;
  tracked: boolean;
}
