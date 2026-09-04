/* ecs-systems/index.ts — barrel export для всех систем */

export {
  initPrefabs,
  getPlayerPrefab,
  getEnemyPrefab,
} from './init-system';

export {
  movementSystem,
  directionFromVelocitySystem,
  timerSystem,
  playerMovementSystem,
  kinematicMovementSystem,
} from './movement-system';

export {
  lifeCheckSystem,
  deathCleanupSystem,
  stateTimerSystem,
  magnetSystem,
  returningProjectileSystem,
} from './life-system';

export {
  syncPositionToBody,
  syncVelocityToBody,
  syncBodyToPosition,
  createBodyForEntity,
  destroyBodyForEntity,
  circlesOverlap,
  checkEntityOverlap,
  findOverlappingEntities,
  hasLineOfSight,
  type PhysicsCallbacks,
} from './physics-system';

export {
  swordAttackSystem,
  axeThrowSystem,
  arrowShootSystem,
  projectileUpdateSystem,
  projectileEnemyCollisionSystem,
  damageEnemy,
  damagePlayer,
} from './combat-system';

export {
  aiUpdateSystem,
} from './ai-system';

export {
  spawnDrop,
  dropsUpdateSystem,
  spawnDropFromEnemy,
} from './drops-system';

export {
  fogUpdateSystem,
  spawnFogGhost,
} from './fog-system';

export {
  tryInteract,
  openChest,
  lightShrine,
  openDoor,
  takeFromPedestal,
} from './interaction-system';

export {
  type RenderSystemConfig,
  updateSpritePosition,
  renderSprites,
  renderVisibilitySystem,
  renderFlashSystem,
  renderPlayer,
  renderEnemies,
  renderProjectiles,
  renderDrops,
  renderNPCs,
  renderChests,
  renderPedestals,
  renderShrines,
  renderDoors,
  renderBarrier,
  renderAltar,
  addFloatText,
  updateFloatTexts,
  renderSystem,
} from './render-system';
