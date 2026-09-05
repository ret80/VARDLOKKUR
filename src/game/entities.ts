/* entities.ts – реэкспорт-барrel для обратной совместимости.
 *
 * Рендереры перенесены в src/game/renderers/, баланс — в src/game/balance.ts,
 * типы сущностей — в src/game/models.ts. Этот файл сохранён, чтобы не ломать
 * существующие импорты, и может быть удалён после обновления потребителей.
 */

// Типы из world (обратная совместимость)
export type { EnemyKind, Vec, DropKind, ProjectileKind, ChestItem } from "./world";

// Типы сущностей и данные для отрисовки
export type {
  IPlayerData, IEnemyData, INpcData, IDropData, IProjectileData,
  IChestData, IPedestalData, IShrineData, IDoorData, IBarrierData, IAltarData,
  IPlayerExtra,
  Player, Enemy, Projectile, Drop,
} from "./models";

// Балансные данные
export { ENEMY_STATS, makeEnemy } from "./balance";

// Рендереры
export {
  renderPlayer, renderEnemy, renderNpc, renderDrop, renderProjectile,
  renderChest, renderPedestal, renderShrine, renderDoor, renderBarrier, renderAltar,
  PlayerRenderer, EnemyRenderer, NpcRenderer, DropRenderer, ProjectileRenderer,
  ChestRenderer, PedestalRenderer, ShrineRenderer, DoorRenderer, BarrierRenderer, AltarRenderer,
} from "./renderers";