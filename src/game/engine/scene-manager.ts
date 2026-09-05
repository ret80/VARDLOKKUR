/* scene-manager.ts – Управление слоями сцены (PixiJS Containers) */

import { Application, Container, Graphics } from "pixi.js";

export class SceneManager {
  readonly tileLayer = new Container();
  readonly world = new Container();
  readonly dynamic = new Container();
  readonly fxWorld = new Container();
  readonly floatLayer = new Container();
  readonly fxScreen = new Graphics();
  readonly fadeG = new Graphics();

  constructor(private app: Application) {
    this.tileLayer.sortableChildren = true;
    this.world.sortableChildren = true;
    // dynamic НЕ sortableChildren — z-order определяется порядком addChild
  }

  /** Добавить все слои в stage приложения */
  attachToStage(): void {
    this.world.addChild(this.tileLayer);
    this.world.addChild(this.dynamic);
    this.world.addChild(this.fxWorld);
    this.world.addChild(this.floatLayer);
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.fxScreen);
    this.app.stage.addChild(this.fadeG);
  }

  /** Добавить FX-график в fxWorld */
  addFxGraphics(g: Graphics): void {
    this.fxWorld.addChild(g);
  }

  /** Добавить элемент на fxScreen */
  addFxScreenChild(child: any): void {
    this.app.stage.addChild(child);
  }

  /** Очистить tileLayer и уничтожить все спрайты */
  clearTiles(): void {
    for (const child of this.tileLayer.children) {
      if (child instanceof Container) {
        child.destroy({ destroyChildren: true, texture: true, baseTexture: true });
      }
    }
    this.tileLayer.removeChildren();
  }

  /** Очистить dynamic контейнер */
  clearDynamic(): void {
    for (const child of this.dynamic.children) {
      child.destroy({ destroyChildren: true, texture: true, baseTexture: true });
    }
    this.dynamic.removeChildren();
  }

  /** Очистить floatLayer */
  clearFloatLayer(): void {
    for (const child of this.floatLayer.children) {
      child.destroy({ destroyChildren: true, texture: true, baseTexture: true });
    }
    this.floatLayer.removeChildren();
  }

  /** Уничтожить все слои */
  destroy(): void {
    this.clearTiles();
    this.clearDynamic();
    this.clearFloatLayer();
    this.fxWorld.removeChildren();
    this.fxScreen.destroy({ texture: true, baseTexture: true });
    this.fadeG.destroy({ texture: true, baseTexture: true });
  }
}
