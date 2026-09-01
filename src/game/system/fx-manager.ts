/* ============ IFxManager ============ */

/**
 * Интерфейс менеджера эффектов (DIP: DialogueSystem зависит от абстракции, а не от FxManager).
 * Позволяет подменять реализацию (mock для тестов, другую систему частиц).
 */
export interface IFxManager {
  /** Создать взрыв частиц в мировых координатах. */
  burst(x: number, y: number, color: number, n: number, speed: number, life: number, size: number, grav: number): void;
}
