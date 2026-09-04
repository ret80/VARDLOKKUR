/* ============ Quest Definitions ============ */

/** Декларативное определение квеста (только статические данные). */
export interface QuestDef {
  /** Уникальный ID квеста. */
  id: string;
  /** Отображаемое название. */
  title: string;
  /** Основной ли это квест (сага). */
  main: boolean;
}

/** Полный список квестов игры — чистые данные без логики. */
export const ALL_QUESTS: QuestDef[] = [
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

/** Быстрый поиск определения по ID. */
export function findQuestDef(id: string): QuestDef | undefined {
  return ALL_QUESTS.find((q) => q.id === id);
}
