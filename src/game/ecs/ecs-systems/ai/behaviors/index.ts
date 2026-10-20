/* behaviors/index.ts — сборка реестра мозгов по умолчанию.
 *
 * Каждый вид врага здесь регистрируется один раз. Чтобы добавить новый вид —
 * создай класс `EnemyBrain` и добавь строку в `createDefaultBrainRegistry()`,
 * не трогая AI-систему.
 */

import type { BrainRegistry } from '../brain-registry';
import { BrainRegistry as Registry } from '../brain-registry';
import { WanderBrain } from './wander';
import { GroundMeleeBrain } from './ground-melee';
import { SkeletonArcherBrain } from './skeleton-archer';
import { VargBrain } from './varg';
import { RavenBrain } from './raven';
import { ShroomBrain } from './shroom';
import { CrawlerBrain } from './crawler';
import { GhostBrain } from './ghost';
import { ReaperBrain } from './bosses/reaper';
import { GiantBrain } from './bosses/giant';
import { SpiderBrain } from './bosses/spider';
import { SnakeBrain } from './bosses/snake';

export {
  WanderBrain, GroundMeleeBrain, SkeletonArcherBrain, VargBrain,
  RavenBrain, ShroomBrain, CrawlerBrain, GhostBrain,
  ReaperBrain, GiantBrain, SpiderBrain, SnakeBrain,
};

export function createDefaultBrainRegistry(): BrainRegistry {
  return new Registry(new WanderBrain())
    // Наземные бойцы ближнего боя (одна и та же логика)
    .register('draugr', () => new GroundMeleeBrain())
    .register('skeleton', () => new GroundMeleeBrain())
    .register('frost', () => new GroundMeleeBrain())
    // Дальний бой / особые способности
    .register('skeleton_archer', () => new SkeletonArcherBrain())
    .register('varg', () => new VargBrain())
    .register('raven', () => new RavenBrain())
    .register('shroom', () => new ShroomBrain())
    .register('crawler', () => new CrawlerBrain())
    .register('ghost', () => new GhostBrain())
    // Боссы
    .register('reaper', () => new ReaperBrain())
    .register('giant', () => new GiantBrain())
    .register('spider', () => new SpiderBrain())
    .register('snake', () => new SnakeBrain());
}
