/* ai/index.ts — barrel export для AI-подсистемы врагов */

export {
  EnemyBrain,
  type AiContext,
} from './brain';

export {
  BrainRegistry,
  type BrainFactory,
} from './brain-registry';

export {
  aiUpdateSystem,
  type AiUpdateArgs,
} from './ai-system';

export * from './behaviors';
