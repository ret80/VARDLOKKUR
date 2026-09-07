/* renderers/float/FloatTextLayer.ts — инкапсулирует addFloatText и updateFloatTexts */

import { Container, Text, TextStyle } from "pixi.js";

export interface FloatTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fill?: number;
  fontWeight?: string;
}

export class FloatTextLayer {
  constructor(private readonly layer: Container) {}

  add(x: number, y: number, text: string, color: number, style: FloatTextStyle = {}): void {
    const textStyle = new TextStyle({
      fontFamily: style.fontFamily ?? "Arial",
      fontSize: style.fontSize ?? 4,
      fill: style.fill ?? color,
    });
    const txt = new Text({
      text: text,
      style: textStyle,
    });
    txt.x = x;
    txt.y = y;
    txt.anchor.set(0.5, 0);
    txt.alpha = 0.7;
    this.layer.addChild(txt);
  }

  update(dt: number): void {
    const children = this.layer.children as Text[];
    for (let i = children.length - 1; i >= 0; i--) {
      const txt = children[i];
      txt.y -= 20 * dt;
      txt.alpha -= dt * 0.5;
      if (txt.alpha <= 0) {
        this.layer.removeChild(txt);
        txt.destroy();
      }
    }
  }

  get isEmpty(): boolean {
    return this.layer.children.length === 0;
  }
}
