/* ============ InputSystem ============ */
import { EventBus } from "../event-bus";
import { dist2 } from "../utils";

/** Абстрактные действия ввода — без привязки к конкретным клавишам. */
export enum InputAction {
  Pause = "input:pause",
  Inventory = "input:inventory",
  Quests = "input:quests",
  Mute = "input:mute",
  UseHeart = "input:use-heart",
  ToggleSnow = "input:toggle-snow",
  CloseOverlay = "input:close-overlay",
}

/** Состояние ввода, передаваемое в Engine для обработки в update(). */
export interface InputState {
  ix: number;
  iy: number;
  bowHeld: boolean;
  atkPressed: boolean;
  axePressed: boolean;
  actPressed: boolean;
}

export class InputSystem {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private virt = { x: 0, y: 0, atk: false, axe: false, bow: false, act: false };
  private prevVirt = { atk: false, axe: false, act: false, bow: false };
  private bowHeld = false;

  private onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onResize = () => {};

  /** Маппинг кодов клавиш → действия ввода. */
  private actionMap = new Map<string, InputAction>([
    ["Escape", InputAction.Pause],
    ["KeyP", InputAction.Pause],
    ["Tab", InputAction.Inventory],
    ["KeyI", InputAction.Inventory],
    ["KeyQ", InputAction.Quests],
    ["KeyM", InputAction.Mute],
    ["KeyF", InputAction.UseHeart],
    ["KeyN", InputAction.ToggleSnow],
  ]);

  private static KEYDOWN_PREVENT = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"]);

  constructor(private bus: EventBus) {}

  register(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
  }

  unregister(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
  }

  /** Вызвать из keydown события. Возвращает true если событие нужно подавить. */
  keyDown(e: KeyboardEvent): boolean {
    if (InputSystem.KEYDOWN_PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) return true;
    this.keys.add(e.code);
    this.pressed.add(e.code);

    // Маппинг кода → абстрактное действие → эмит в EventBus
    const action = this.actionMap.get(e.code);
    if (action) {
      this.bus.emit(action, {});
    }

    return true;
  }

  setVirtual(v: Partial<typeof this.virt>): void {
    Object.assign(this.virt, v);
  }

  /** Получить текущее состояние ввода для update(). */
  getState(): InputState {
    let ix = 0, iy = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iy -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iy += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
    ix += this.virt.x;
    iy += this.virt.y;

    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }

    const bowHeld = this.bowHeld;
    const atkPressed = this.pressed.has("Space") || this.pressed.has("KeyK") || (this.virt.atk && !this.prevVirt.atk);
    const axePressed = this.pressed.has("KeyJ") || (this.virt.axe && !this.prevVirt.axe);
    const actPressed = this.pressed.has("KeyE") || (this.virt.act && !this.prevVirt.act);

    this.prevVirt = { atk: this.virt.atk, axe: this.virt.axe, act: this.virt.act, bow: this.virt.bow };
    this.pressed.clear();

    return { ix, iy, bowHeld, atkPressed, axePressed, actPressed };
  }

  /** Сбросить pressed-нажатия (вызывается после обработки). */
  clearPressed(): void {
    this.pressed.clear();
  }

  /** Обновить bowHeld (вызывается из Engine.update). */
  updateBow(bowKeyDown: boolean): void {
    if (bowKeyDown && !this.bowHeld) {
      this.bowHeld = true;
    } else if (!bowKeyDown && this.bowHeld) {
      this.bowHeld = false;
    }
  }

  getBowHeld(): boolean {
    return this.bowHeld;
  }

  /** Проверить, удерживается ли клавиша. */
  isKeyHeld(code: string): boolean {
    return this.keys.has(code);
  }

  /** Проверить, удерживается ли лук. */
  isBowVirtualHeld(): boolean {
    return this.virt.bow;
  }
}
