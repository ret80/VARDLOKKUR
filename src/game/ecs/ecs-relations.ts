/* ecs-relations.ts — Relations для bitECS */

import { createRelation, type Relation } from 'bitecs';

// ── Иерархия ──

/** Родитель → дети (автоматически удаляет детей при удалении родителя) */
export const ChildOf = createRelation({ autoRemoveSubject: true });

// ── Боевые связи ──

/** Враг целится в сущность (exclusive — только одна цель) */
export const Targeting = createRelation({ exclusive: true });

/** Сущность имеет цель */
export const Targeted = createRelation();

// ── Инвентарь / содержимое ──

/** Контейнер содержит предмет */
export const Contains = createRelation({
  store: () => ({ amount: [] as number[] }),
});

// ── Состояния ──

/** Сущность в процессе удаления (deferred removal) */
export const Removing = {} as Record<number, boolean>;
