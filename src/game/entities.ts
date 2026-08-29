/* Пиксель-арт "Вардлокур": герой, враги, боссы, NPC, предметы.
   Всё рисуется в Graphics каждый кадр — state-driven арт с тинтами. */
import { Graphics } from "pixi.js";
import type { EnemyKind, Vec } from "./world";

const P = (g: Graphics, x: number, y: number, w: number, h: number, c: number, a = 1) =>
  g.rect(x, y, w, h).fill({ color: c, alpha: a });

/* ============================ ГЕРОЙ ============================ */
export interface Player {
  x: number; y: number; vx: number; vy: number; r: number;
  hp: number; maxHp: number;
  dir: Vec; moving: boolean; animT: number; swingT: number; hurtT: number;
  slowT: number;
}
export interface PlayerDrawOpts {
  hasSword: boolean; runes: number; swingDir: Vec; aiming: boolean;
}

export function drawPlayer(g: Graphics, p: Player, time: number, o: PlayerDrawOpts) {
  g.clear();
  const bob = p.moving ? Math.sin(p.animT * 12) * 1.2 : Math.sin(time * 2) * 0.4;
  const blink = p.hurtT > 0 && Math.floor(time * 14) % 2 === 0;
  const alpha = blink ? 0.35 : 1;
  const legSwing = p.moving ? Math.sin(p.animT * 12) * 2.5 : 0;

  // тень
  g.ellipse(0, 5, 6, 2.4).fill({ color: 0x05080d, alpha: 0.5 * alpha });

  // ноги
  P(g, -4, 1 + legSwing * 0.3, 3, 4, 0x2c3038, alpha);
  P(g, 1, 1 - legSwing * 0.3, 3, 4, 0x2c3038, alpha);

  // плащ (развевается)
  const cape = Math.sin(time * 3) * 1;
  P(g, -6 + cape * 0.3, -8 + bob, 4, 11, 0x3d4a5c, alpha);
  P(g, -5 + cape * 0.3, -8 + bob, 2, 11, 0x4a5a70, alpha);

  // тело — кольчуга
  P(g, -4, -8 + bob, 8, 9, 0x4e5a68, alpha);
  P(g, -4, -8 + bob, 8, 2, 0x5c6875, alpha);
  // пояс с рунами
  P(g, -4, -1 + bob, 8, 2, 0x3a3226, alpha);
  if (o.runes > 0) P(g, -3, -1 + bob, Math.min(6, o.runes * 2), 1, 0x63d8c8, alpha);

  // голова
  P(g, -3, -14 + bob, 7, 6, 0xc8a88a, alpha);
  // волосы/капюшон
  P(g, -4, -15 + bob, 9, 3, 0x2c3038, alpha);
  P(g, -4, -13 + bob, 1, 4, 0x2c3038, alpha);
  // борода
  P(g, -2, -9 + bob, 5, 2, 0x8a7a62, alpha);
  // глаза
  const ex = p.dir.x > 0.3 ? 1 : p.dir.x < -0.3 ? -1 : 0;
  P(g, -1 + ex, -12 + bob, 1, 1, 0x0d1218, alpha);
  P(g, 2 + ex, -12 + bob, 1, 1, 0x0d1218, alpha);

  // рука + меч при замахе
  if (o.hasSword && p.swingT > 0) {
    const prog = 1 - p.swingT / 0.22;
    const baseA = Math.atan2(o.swingDir.y, o.swingDir.x);
    const sweep = baseA - 1.1 + prog * 2.2;
    const hx = Math.cos(sweep), hy = Math.sin(sweep);
    g.moveTo(hx * 5, -4 + bob + hy * 5)
      .lineTo(hx * 13, -4 + bob + hy * 13)
      .lineTo(hx * 13 + -hy * 2, -4 + bob + hy * 13 + hx * 2)
      .lineTo(hx * 5 + -hy * 2, -4 + bob + hy * 5 + hx * 2)
      .closePath().fill({ color: 0xb9c2c9, alpha });
    // дуга замаха
    g.arc(0, -4 + bob, 14, baseA - 1.2, baseA - 1.2 + prog * 2.4)
      .stroke({ color: 0xe8f4fc, width: 1.5, alpha: 0.5 * (1 - prog) });
  } else if (o.hasSword) {
    // меч за спиной/в руке
    P(g, 5, -10 + bob, 2, 8, 0xb9c2c9, alpha);
    P(g, 4, -4 + bob, 4, 1, 0x5a4632, alpha);
  }

  // прицел лука
  if (o.aiming) {
    const a = Math.atan2(p.dir.y, p.dir.x);
    g.arc(0, -4 + bob, 10, a - 0.6, a + 0.6).stroke({ color: 0xe8c979, width: 1, alpha: 0.7 });
    g.moveTo(Math.cos(a) * 8, -4 + bob + Math.sin(a) * 8)
      .lineTo(Math.cos(a) * 14, -4 + bob + Math.sin(a) * 14)
      .stroke({ color: 0xe8c979, width: 1.5, alpha: 0.9 });
  }

  // замедление (лёд)
  if (p.slowT > 0) {
    g.circle(0, -4 + bob, 9).stroke({ color: 0x9fe0ee, width: 1, alpha: 0.5 });
  }
}

/* ============================ ВРАГИ ============================ */
export interface Enemy {
  kind: EnemyKind;
  x: number; y: number; vx: number; vy: number; r: number;
  hp: number; maxHp: number; dmg: number; speed: number;
  facing: Vec; t: number; animT: number;
  state: string; stateT: number;
  aggro: boolean; dead: boolean; seed: number;
  hidden: boolean; lungeT: number; guardOf: number;
  freezeT: number; flashT: number; contactCd: number;
  path: { x: number; y: number }[] | null; pathI: number; repathT: number;
  g: Graphics; body: any;
}

export function makeEnemy(kind: EnemyKind, x: number, y: number, seedIdx: number): Enemy {
  const stats: Record<string, { r: number; hp: number; speed: number; dmg: number }> = {
    draugr: { r: 6, hp: 2, speed: 42, dmg: 1 },
    varg: { r: 5, hp: 2, speed: 66, dmg: 1 },
    raven: { r: 4, hp: 1, speed: 74, dmg: 1 },
    shroom: { r: 5, hp: 2, speed: 0, dmg: 1 },
    crawler: { r: 4, hp: 1, speed: 52, dmg: 1 },
    frost: { r: 7, hp: 5, speed: 30, dmg: 2 },
    reaper: { r: 10, hp: 11, speed: 58, dmg: 2 },
    spider: { r: 11, hp: 8, speed: 0, dmg: 1 },
    giant: { r: 12, hp: 16, speed: 46, dmg: 2 },
    snake: { r: 16, hp: 7, speed: 0, dmg: 2 },
  };
  const s = stats[kind];
  return {
    kind, x, y, vx: 0, vy: 0, r: s.r,
    hp: s.hp, maxHp: s.hp, dmg: s.dmg, speed: s.speed,
    facing: { x: 0, y: 1 }, t: 0, animT: 0,
    state: "idle", stateT: 0,
    aggro: false, dead: false, seed: Math.random() * 100,
    hidden: kind === "crawler", lungeT: 0, guardOf: -1,
    freezeT: 0, flashT: 0, contactCd: 0,
    path: null, pathI: 0, repathT: 0,
    g: new Graphics(), body: null,
  };
}

export function drawEnemy(e: Enemy, time: number) {
  const g = e.g;
  g.clear();
  if (e.dead) return;
  const bob = Math.sin(time * 3 + e.seed) * 0.8;
  const flash = e.flashT > 0;
  const frozen = e.freezeT > 0;
  const tint = (c: number) => flash ? 0xffffff : frozen ? 0x9fd8e8 : c;
  const a = e.hidden ? 0.25 : 1;
  const fx = e.facing.x >= 0 ? 1 : -1;

  switch (e.kind) {
    case "draugr": {
      g.ellipse(0, 5, 6, 2.2).fill({ color: 0x05080d, alpha: 0.5 * a });
      const step = Math.sin(e.t * 8) * 2;
      P(g, -4, 1 + step * 0.3, 3, 4, 0x2c3038, a); P(g, 1, 1 - step * 0.3, 3, 4, 0x2c3038, a);
      P(g, -4, -8 + bob, 8, 9, 0x55606c, a);
      P(g, -3, -13 + bob, 7, 6, 0x8f9aa8, a);
      P(g, -1 * fx + 0, -11 + bob, 1, 1, 0xe05050, a); P(g, 2 * fx, -11 + bob, 1, 1, 0xe05050, a);
      // щит в сторону взгляда
      P(g, fx * 5, -8 + bob, 3 * fx, 8, tint(0x4a3e2e), a);
      P(g, fx * 6, -6 + bob, 1 * fx, 3, 0x8a744a, a);
      break;
    }
    case "varg": {
      g.ellipse(0, 4, 7, 2.4).fill({ color: 0x05080d, alpha: 0.5 * a });
      const run = Math.sin(e.t * 14) * 2.5;
      P(g, -6, 0 + run * 0.3, 3, 4, 0xc8d3dc, a); P(g, 3, 0 - run * 0.3, 3, 4, 0xc8d3dc, a);
      P(g, -7, -6 + bob, 13, 6, tint(0xd8e2ea), a);
      P(g, -7, -6 + bob, 13, 2, tint(0xe8f0f6), a);
      P(g, fx * 5, -9 + bob, 5 * fx, 5, tint(0xd8e2ea), a);
      P(g, fx * 8, -8 + bob, 2 * fx, 1, 0xe05050, a);
      P(g, fx * 6, -11 + bob, 2 * fx, 3, tint(0xc8d3dc), a);
      // хвост
      P(g, -fx * 8, -6 + bob, 3 * -fx, 2, tint(0xc8d3dc), a);
      if (e.lungeT > 0) P(g, fx * 7, -6 + bob, 3 * fx, 1, 0xffffff, a);
      break;
    }
    case "raven": {
      const flap = Math.sin(e.t * 16) * 4;
      P(g, -3, -3 + bob, 6, 5, tint(0x1d232c), a);
      P(g, -2, -6 + bob, 5, 4, tint(0x242c38), a);
      P(g, fx * 3, -5 + bob, 3 * fx, 2, 0xe8c979, a);
      P(g, fx * 2, -6 + bob, 1, 1, 0xe05050, a);
      // крылья
      g.moveTo(-3, -2 + bob).lineTo(-9, -4 + bob - flap).lineTo(-4, 1 + bob).closePath().fill({ color: tint(0x161c24), alpha: a });
      g.moveTo(3, -2 + bob).lineTo(9, -4 + bob - flap).lineTo(4, 1 + bob).closePath().fill({ color: tint(0x161c24), alpha: a });
      break;
    }
    case "shroom": {
      g.ellipse(0, 4, 5, 2).fill({ color: 0x05080d, alpha: 0.5 * a });
      P(g, -2, -2 + bob, 5, 6, 0xb9b0a0, a);
      const charge = e.state === "charge" ? 1 + Math.sin(e.t * 20) * 0.1 : 1;
      g.ellipse(0, -4 + bob, 7 * charge, 5 * charge).fill({ color: tint(0x6a4a5c), alpha: a });
      g.ellipse(0, -6 + bob, 5 * charge, 2.5 * charge).fill({ color: tint(0x7d5a6e), alpha: a });
      P(g, -3, -5 + bob, 1, 1, 0xe8dcc0, a); P(g, 2, -4 + bob, 1, 1, 0xe8dcc0, a);
      P(g, -1, -2 + bob, 1, 1, 0x2a2228, a); P(g, 2, -2 + bob, 1, 1, 0x2a2228, a);
      break;
    }
    case "crawler": {
      if (e.hidden) {
        g.ellipse(0, 1, 5, 2.4).fill({ color: 0x3a3226, alpha: 0.6 });
        P(g, -3, -1, 6, 2, 0x4a4234, 0.7);
        break;
      }
      g.ellipse(0, 3, 6, 2.4).fill({ color: 0x05080d, alpha: 0.5 * a });
      const wig = Math.sin(e.t * 12) * 1.5;
      P(g, -5, -2 + bob, 10, 5, tint(0x4a5238), a);
      P(g, -5, -2 + bob, 10, 2, tint(0x5a6244), a);
      P(g, -6 + wig, 0 + bob, 2, 3, 0x3a4228, a); P(g, 4 - wig, 0 + bob, 2, 3, 0x3a4228, a);
      P(g, fx * 3, -1 + bob, 2, 1, 0xe0a030, a);
      break;
    }
    case "frost": {
      g.ellipse(0, 6, 8, 2.6).fill({ color: 0x05080d, alpha: 0.5 * a });
      const step = Math.sin(e.t * 6) * 1.5;
      P(g, -5, 1 + step * 0.3, 4, 5, 0x3a4a5c, a); P(g, 1, 1 - step * 0.3, 4, 5, 0x3a4a5c, a);
      P(g, -6, -9 + bob, 12, 11, tint(0x4a6a84), a);
      P(g, -6, -9 + bob, 12, 3, tint(0x6a8aa4), a);
      P(g, -4, -15 + bob, 9, 7, tint(0x8fb0c8), a);
      // ледяная корона
      P(g, -4, -17 + bob, 2, 3, 0x9fe0ee, a); P(g, 0, -18 + bob, 2, 4, 0xbdeef8, a); P(g, 3, -17 + bob, 2, 3, 0x9fe0ee, a);
      P(g, -1, -13 + bob, 1, 1, 0x0d2030, a); P(g, 2, -13 + bob, 1, 1, 0x0d2030, a);
      break;
    }
    case "reaper": {
      g.ellipse(0, 8, 9, 2.6).fill({ color: 0x05080d, alpha: 0.4 * a });
      const float = Math.sin(time * 2) * 2;
      // балахон
      g.moveTo(-8, 8 + float).lineTo(-6, -10 + float).lineTo(0, -16 + float).lineTo(6, -10 + float).lineTo(8, 8 + float).closePath()
        .fill({ color: tint(0x0d0f14), alpha: a });
      g.moveTo(-6, -10 + float).lineTo(0, -16 + float).lineTo(6, -10 + float).closePath()
        .fill({ color: tint(0x161a22), alpha: a });
      // череп
      P(g, -3, -12 + float, 7, 5, 0xc8d3dc, a);
      P(g, -2, -11 + float, 2, 2, 0x8fd0e0, a); P(g, 1, -11 + float, 2, 2, 0x8fd0e0, a);
      // коса (меняет положение по фазам)
      let blade = 0;
      if (e.state === "wind") blade = -0.8;
      else if (e.state === "swing") blade = 0.9;
      else if (e.state === "stuck") blade = 1.3;
      const bx = Math.cos(blade) * 12, by = Math.sin(blade) * 12;
      g.moveTo(8, -4 + float).lineTo(8 + bx, -4 + float + by)
        .stroke({ color: 0x3a3226, width: 2, alpha: a });
      g.arc(8 + bx, -4 + float + by, 6, blade + 1.6, blade + 3.4)
        .stroke({ color: tint(0xb9c2c9), width: 2, alpha: a });
      if (e.state === "wind") {
        g.circle(0, -2 + float, 12 + Math.sin(time * 20) * 2).stroke({ color: 0xe05050, width: 1, alpha: 0.4 });
      }
      break;
    }
    case "spider": {
      g.ellipse(0, 8, 12, 3).fill({ color: 0x05080d, alpha: 0.5 * a });
      const legA = Math.sin(time * 5) * 2;
      for (let i = 0; i < 4; i++) {
        const lx = -9 + i * 6;
        g.moveTo(lx, 0).lineTo(lx - 4, 8 + (i % 2 ? legA : -legA)).stroke({ color: tint(0x3d2f3a), width: 2, alpha: a });
        g.moveTo(lx, 0).lineTo(lx + 4, 8 - (i % 2 ? legA : -legA)).stroke({ color: tint(0x3d2f3a), width: 2, alpha: a });
      }
      g.ellipse(0, -2 + bob, 11, 8).fill({ color: tint(0x4a3a4e), alpha: a });
      g.ellipse(0, -6 + bob, 8, 5).fill({ color: tint(0x5a4a5e), alpha: a });
      // глаза светятся
      const eyePulse = 0.6 + Math.sin(time * 4) * 0.4;
      for (const ex of [-4, -1.5, 1.5, 4]) P(g, ex, -7 + bob, 1.5, 1.5, 0xe8c979, eyePulse * a);
      // клыки
      P(g, -2, -2 + bob, 1, 3, 0xd8e8d0, a); P(g, 1, -2 + bob, 1, 3, 0xd8e8d0, a);
      if (e.state === "ring") g.circle(0, -4, 14 + Math.sin(time * 10) * 2).stroke({ color: 0x6a8a3a, width: 1, alpha: 0.5 });
      break;
    }
    case "giant": {
      g.ellipse(0, 10, 13, 3).fill({ color: 0x05080d, alpha: 0.5 * a });
      const step = Math.sin(e.t * 4) * 1.5;
      P(g, -7, 2 + step * 0.3, 6, 8, 0x4e5a68, a); P(g, 1, 2 - step * 0.3, 6, 8, 0x4e5a68, a);
      P(g, -9, -12 + bob, 18, 15, tint(0x5a6570), a);
      P(g, -9, -12 + bob, 18, 4, tint(0x6a7580), a);
      P(g, -6, -19 + bob, 12, 8, tint(0x6a7580), a);
      P(g, -4, -17 + bob, 3, 2, 0xe08a3c, a); P(g, 1, -17 + bob, 3, 2, 0xe08a3c, a);
      // каменная броня / трещины во 2-й фазе
      if (e.hp <= e.maxHp / 2) {
        g.moveTo(-8, -8 + bob).lineTo(-2, -2 + bob).lineTo(-6, 2 + bob).stroke({ color: 0x39424e, width: 1.5, alpha: a });
        g.moveTo(6, -9 + bob).lineTo(2, -3 + bob).lineTo(7, 1 + bob).stroke({ color: 0x39424e, width: 1.5, alpha: a });
      }
      if (e.state === "wind") g.circle(0, 0, 16 + Math.sin(time * 18) * 2).stroke({ color: 0xe08a3c, width: 1.5, alpha: 0.5 });
      break;
    }
    case "snake": {
      const open = e.state === "open";
      const sway = Math.sin(time * 1.6) * 4;
      P(g, -10 + sway * 0.4, 6, 20, 14, tint(0x1c2a24), a);
      P(g, -8 + sway * 0.4, 6, 4, 14, tint(0x2a3d33), a);
      P(g, -16 + sway, -18, 32, 24, tint(0x24352c), a);
      P(g, -16 + sway, -18, 32, 4, tint(0x31463a), a);
      P(g, -13 + sway, -14, 26, 16, tint(0x1c2a24), a);
      P(g, -15 + sway, -22, 4, 5, tint(0x3d5245), a); P(g, 11 + sway, -22, 4, 5, tint(0x3d5245), a);
      if (open) {
        P(g, -10 + sway, -4, 20, 8, 0x0a0f0c, a);
        P(g, -8 + sway, -2, 3, 4, 0xd8e8d0, a); P(g, 5 + sway, -2, 3, 4, 0xd8e8d0, a);
        const eyePulse = 0.6 + Math.sin(time * 7) * 0.4;
        g.circle(sway, -8, 5).fill({ color: 0xe8c979, alpha: eyePulse * a });
        g.circle(sway, -8, 2).fill({ color: 0xfff3d6, alpha: eyePulse * a });
        // кольца-прицел вокруг уязвимого глаза
        g.circle(sway, -8, 8 + Math.sin(time * 6) * 2).stroke({ color: 0xe8c979, width: 1, alpha: eyePulse * 0.7 });
      } else {
        P(g, -10 + sway, -10, 6, 3, 0x05080d, a); P(g, 4 + sway, -10, 6, 3, 0x05080d, a);
        P(g, -8 + sway, -9, 2, 1, 0xe05050, a); P(g, 6 + sway, -9, 2, 1, 0xe05050, a);
        P(g, -6 + sway, -1, 12, 2, tint(0x16211b), a);
      }
      break;
    }
  }

  // полоска HP
  if (e.hp < e.maxHp && e.kind !== "snake") {
    const wdt = e.r * 2;
    P(g, -wdt / 2, -e.r - 9, wdt, 2, 0x0a0f16, 0.8);
    P(g, -wdt / 2, -e.r - 9, wdt * (e.hp / e.maxHp), 2, 0xe05050, 0.9);
  }
}

/* ============================ NPC ============================ */
export function drawNpc(g: Graphics, id: string, time: number, mark = true) {
  g.clear();
  const bob = Math.sin(time * 2 + id.length) * 0.5;
  g.ellipse(0, 5, 5, 2).fill({ color: 0x05080d, alpha: 0.5 });
  switch (id) {
    case "eirik":
      P(g, -4, -8 + bob, 8, 12, 0x5a4a6a); P(g, -4, -8 + bob, 8, 2, 0x6a5a7a);
      P(g, -3, -14 + bob, 7, 6, 0xc8a88a);
      P(g, -3, -15 + bob, 7, 2, 0xd8d3c8);
      P(g, -2, -9 + bob, 5, 3, 0xe8e3d8);
      P(g, 0, -12 + bob, 1, 1, 0x0d1218);
      P(g, -5, -10 + bob, 2, 14, 0x4a3e2e);
      break;
    case "astrid":
      P(g, -4, -8 + bob, 8, 12, 0x4a6a5a); P(g, -4, -8 + bob, 8, 2, 0x5a7a6a);
      P(g, -3, -14 + bob, 7, 6, 0xc8a88a);
      P(g, -4, -15 + bob, 9, 4, 0x8a5a3a);
      P(g, -2, -6 + bob, 4, 4, 0x6a8a7a);
      break;
    case "harald":
      P(g, -5, -8 + bob, 10, 12, 0x6a5a4a); P(g, -5, -8 + bob, 10, 3, 0x4e5a68);
      P(g, -3, -14 + bob, 7, 6, 0xc8a88a);
      P(g, -3, -9 + bob, 7, 3, 0x5a4632);
      P(g, 5, -12 + bob, 2, 10, 0x39424e);
      break;
    case "raven": {
      const flap = Math.sin(time * 6) * 2;
      P(g, -3, -8 + bob + flap * 0.2, 6, 6, 0x1d232c);
      P(g, -2, -12 + bob, 5, 5, 0x242c38);
      P(g, 3, -11 + bob, 3, 2, 0xe8c979);
      P(g, 3, -11 + bob, 1, 1, 0x8fd8e8);
      break;
    }
    case "daughter": {
      const a = 0.6 + Math.sin(time * 2.5) * 0.15;
      g.moveTo(-4, 4 + bob).lineTo(-3, -8 + bob).lineTo(3, -8 + bob).lineTo(4, 4 + bob).closePath()
        .fill({ color: 0x8fb0c8, alpha: a * 0.5 });
      P(g, -3, -13 + bob, 7, 6, 0xc8d8e8, a);
      P(g, -3, -14 + bob, 7, 3, 0x4a3e5c, a);
      P(g, -1, -11 + bob, 1, 1, 0x2a3444, a); P(g, 1, -11 + bob, 1, 1, 0x2a3444, a);
      break;
    }
    case "soul": {
      const fl = Math.sin(time * 2.4) * 2.5;
      const a = 0.5 + Math.sin(time * 3.1) * 0.15;
      g.moveTo(-4, 2 + fl).lineTo(0, 8 + fl).lineTo(4, 2 + fl).lineTo(2, 3 + fl).lineTo(0, 6 + fl).lineTo(-2, 3 + fl).closePath()
        .fill({ color: 0x8fd8e8, alpha: a * 0.5 });
      P(g, -4, -8 + fl, 9, 10, 0x8fd8e8, a * 0.75);
      P(g, -3, -11 + fl, 7, 4, 0xbdeef8, a);
      P(g, -2, -9 + fl, 2, 2, 0x0d1a24, a); P(g, 1, -9 + fl, 2, 2, 0x0d1a24, a);
      g.circle(0, -4 + fl, 8).stroke({ color: 0x8fd8e8, width: 1, alpha: a * 0.35 });
      break;
    }
    default:
      // обобщённый житель
      P(g, -4, -8 + bob, 8, 12, 0x5c5248); P(g, -4, -8 + bob, 8, 2, 0x6c6258);
      P(g, -3, -14 + bob, 7, 6, 0xc8a88a);
      P(g, -3, -15 + bob, 7, 3, 0x4a3e32);
      break;
  }
  const blink = Math.floor(time * 2) % 2 === 0;
  if (mark && blink) {
    P(g, -1, -20, 2, 4, 0xe8c979);
    P(g, -1, -15, 2, 2, 0xe8c979);
  }
}

/* ============================ ПРЕДМЕТЫ / ОБЪЕКТЫ ============================ */
export type DropKind = "heart" | "arrows" | "rune" | "axe" | "sword" | "bear"
  | "hammer" | "bow" | "horn" | "mead" | "ore" | "moss" | "amber" | "flower"
  | "diary" | "bundle" | "relic" | "shard" | "bones";

export interface Drop {
  kind: DropKind; x: number; y: number; t: number; taken: boolean; magnet: boolean;
  ambientIdx?: number;
  g: Graphics;
}

export function drawDrop(d: Drop, time: number) {
  const g = d.g;
  g.clear();
  if (d.taken) return;
  const bob = Math.sin(time * 3 + d.t) * 1.5;
  switch (d.kind) {
    case "heart":
      P(g, -3, -3 + bob, 2, 2, 0xe05070); P(g, 1, -3 + bob, 2, 2, 0xe05070);
      P(g, -3, -1 + bob, 6, 2, 0xe05070); P(g, -2, 1 + bob, 4, 1, 0xe05070); P(g, -1, 2 + bob, 2, 1, 0xe05070);
      break;
    case "arrows":
      P(g, -2, -4 + bob, 1, 7, 0x8a744a); P(g, -2, -5 + bob, 1, 2, 0xb9c2c9);
      P(g, 1, -2 + bob, 1, 6, 0x8a744a); P(g, 1, -3 + bob, 1, 2, 0xb9c2c9);
      break;
    case "rune": {
      const pulse = 0.7 + Math.sin(time * 4) * 0.3;
      P(g, -3, -5 + bob, 6, 8, 0x4e5a68);
      P(g, -2, -4 + bob, 4, 6, 0x63d8c8, pulse);
      P(g, -1, -3 + bob, 1, 4, 0x0d2a26); P(g, 0, -2 + bob, 2, 1, 0x0d2a26);
      g.circle(0, -1 + bob, 7).stroke({ color: 0x63d8c8, width: 1, alpha: pulse * 0.5 });
      break;
    }
    case "axe":
      P(g, -1, -5 + bob, 2, 9, 0x5a4632);
      P(g, -4, -5 + bob, 4, 4, 0x9fe0ee); P(g, -4, -5 + bob, 4, 1, 0xbdeef8);
      break;
    case "sword":
      P(g, -1, -6 + bob, 2, 8, 0xb9c2c9); P(g, -1, -6 + bob, 1, 8, 0xd8e2ea);
      P(g, -3, 1 + bob, 6, 1, 0x5a4632); P(g, -1, 2 + bob, 2, 2, 0x3a3226);
      break;
    case "bear":
      P(g, -3, -3 + bob, 6, 5, 0x6a5238); P(g, -3, -5 + bob, 6, 3, 0x7a6248);
      P(g, -4, -6 + bob, 2, 2, 0x6a5238); P(g, 2, -6 + bob, 2, 2, 0x6a5238);
      P(g, -1, -4 + bob, 1, 1, 0x0d1218); P(g, 1, -4 + bob, 1, 1, 0x0d1218);
      break;
    case "hammer":
      P(g, -1, -2 + bob, 2, 7, 0x5a4632);
      P(g, -4, -5 + bob, 8, 4, 0x63d8c8); P(g, -4, -5 + bob, 8, 1, 0xa8ece2);
      P(g, -2, -3 + bob, 1, 1, 0xe8c979); P(g, 2, -3 + bob, 1, 1, 0xe8c979);
      break;
    case "bow":
      g.arc(0, -2 + bob, 5, -1.3, 1.3).stroke({ color: 0x8a744a, width: 2 });
      g.moveTo(3.5, -5.6 + bob).lineTo(3.5, 1.6 + bob).stroke({ color: 0xd8e2ea, width: 1 });
      break;
    case "horn":
      g.moveTo(-3, -4 + bob).lineTo(3, -1 + bob).lineTo(2, 2 + bob).lineTo(-3, 0 + bob).closePath().fill(0xc9a24b);
      P(g, -3, -4 + bob, 2, 4, 0xe8c979);
      break;
    case "mead":
      P(g, -2, -4 + bob, 5, 6, 0xc8822a); P(g, -2, -4 + bob, 5, 2, 0xe8a84a);
      P(g, -1, -5 + bob, 3, 1, 0x8a744a);
      break;
    case "ore":
      P(g, -4, -3 + bob, 8, 5, 0x5a6570); P(g, -3, -5 + bob, 6, 3, 0x6a7580);
      P(g, -2, -4 + bob, 2, 2, 0xe08a3c); P(g, 1, -2 + bob, 2, 2, 0xe08a3c);
      g.circle(0, -2 + bob, 6).stroke({ color: 0xe08a3c, width: 1, alpha: 0.4 });
      break;
    case "moss":
      P(g, -3, -2 + bob, 6, 3, 0x4a6a3a); P(g, -2, -4 + bob, 2, 3, 0x6a8a4a);
      P(g, 1, -3 + bob, 2, 2, 0x8aa85a);
      break;
    case "amber":
      P(g, -2, -4 + bob, 4, 6, 0xc8822a); P(g, -1, -2 + bob, 2, 2, 0xf8d878);
      g.circle(0, -1 + bob, 6).stroke({ color: 0xe8c979, width: 1, alpha: 0.5 });
      break;
    case "flower":
      P(g, -1, -1 + bob, 1, 4, 0x5a7a4a);
      P(g, -3, -5 + bob, 2, 2, 0xc8d8e8); P(g, 1, -5 + bob, 2, 2, 0xc8d8e8);
      P(g, -1, -7 + bob, 2, 2, 0xc8d8e8); P(g, -1, -5 + bob, 2, 2, 0xe8c979);
      break;
    case "diary":
      P(g, -3, -4 + bob, 6, 6, 0x6a5238); P(g, -3, -4 + bob, 1, 6, 0x4a3826);
      P(g, -1, -3 + bob, 3, 1, 0xc9a684); P(g, -1, -1 + bob, 3, 1, 0xc9a684);
      break;
    case "bundle":
      P(g, -3, -3 + bob, 6, 5, 0x8a744a); P(g, -3, -3 + bob, 6, 1, 0xa8925e);
      P(g, -1, -4 + bob, 2, 1, 0x5a4632);
      break;
    case "relic": {
      const pulse = 0.7 + Math.sin(time * 4) * 0.3;
      P(g, -2, -6 + bob, 4, 7, 0x8f9aa8); P(g, -2, -6 + bob, 4, 1, 0xc8d3dc);
      P(g, -1, -4 + bob, 2, 3, 0x63d8c8, pulse);
      g.circle(0, -2 + bob, 7).stroke({ color: 0x63d8c8, width: 1, alpha: pulse * 0.5 });
      break;
    }
    case "shard": {
      const gl = 0.7 + Math.sin(time * 3 + d.t) * 0.3;
      g.moveTo(0, -8 + bob).lineTo(3, -2 + bob).lineTo(1, 2 + bob).lineTo(-2, 2 + bob).lineTo(-3, -3 + bob).closePath()
        .fill({ color: 0x9fc8dc, alpha: gl });
      P(g, -1, -6 + bob, 1, 5, 0xe8f4fc, gl * 0.9);
      break;
    }
    case "bones":
      P(g, -3, 0 + bob, 7, 1, 0xcdd6dc);
      P(g, -4, -1 + bob, 2, 2, 0xcdd6dc); P(g, 3, -1 + bob, 2, 2, 0xcdd6dc);
      P(g, -1, -3 + bob, 4, 3, 0xb9c2c9);
      break;
  }
}

export function drawChest(g: Graphics, opened: boolean) {
  g.clear();
  g.ellipse(0, 5, 7, 2.4).fill({ color: 0x05080d, alpha: 0.5 });
  P(g, -6, -2, 12, 7, 0x5a4632); P(g, -6, -2, 12, 2, 0x6e5840);
  P(g, -6, 3, 12, 2, 0x463626);
  if (opened) {
    P(g, -6, -6, 12, 4, 0x463626);
    P(g, -5, -5, 10, 2, 0x1d1610);
  } else {
    P(g, -6, -6, 12, 4, 0x6e5840);
    P(g, -1, -3, 2, 4, 0xc9a24b);
  }
}

export function drawPedestal(g: Graphics, sealed: boolean, hasRune: boolean, time: number) {
  g.clear();
  g.ellipse(0, 7, 8, 2.6).fill({ color: 0x05080d, alpha: 0.5 });
  P(g, -6, 2, 12, 4, 0x4e5a68); P(g, -6, 2, 12, 1, 0x5c6875);
  P(g, -4, -6, 8, 8, 0x39424e); P(g, -4, -6, 8, 1, 0x4e5a68);
  if (hasRune && !sealed) {
    const pulse = 0.6 + Math.sin(time * 3) * 0.4;
    P(g, -2, -12, 4, 6, 0x4e5a68);
    P(g, -1, -11, 2, 4, 0x63d8c8, pulse);
    g.circle(0, -9, 6).stroke({ color: 0x63d8c8, width: 1, alpha: pulse * 0.5 });
  }
  if (sealed) {
    const pulse = 0.5 + Math.sin(time * 5) * 0.3;
    g.circle(0, -2, 10).stroke({ color: 0xe05050, width: 1.5, alpha: pulse });
  }
}

export function drawShrine(g: Graphics, lit: boolean, time: number) {
  g.clear();
  g.ellipse(0, 7, 7, 2.4).fill({ color: 0x05080d, alpha: 0.5 });
  P(g, -5, 2, 10, 4, 0x4e5a68);
  P(g, -3, -8, 6, 10, 0x5c6875); P(g, -3, -8, 6, 1, 0x6a7580);
  P(g, -1, -10, 2, 3, 0x4e5a68);
  if (lit) {
    const fl = Math.sin(time * 8) * 1.5;
    P(g, -1, -14 + fl, 2, 4, 0x8fd8e8, 0.9);
    P(g, 0, -15 + fl, 1, 2, 0xbdeef8);
    g.circle(0, -12 + fl, 5).stroke({ color: 0x8fd8e8, width: 1, alpha: 0.4 });
  }
}

export function drawDoor(g: Graphics, open: number, locked: boolean) {
  g.clear();
  const h = 14 * (1 - open);
  if (h <= 0.5) return;
  P(g, -8, -h, 16, h, locked ? 0x2c2420 : 0x39424e);
  P(g, -8, -h, 16, 2, locked ? 0x3a302a : 0x4e5a68);
  if (locked) {
    P(g, -2, -h / 2 - 2, 4, 4, 0xc9a24b);
    P(g, -1, -h / 2 - 1, 2, 2, 0x0d1218);
  }
}

export function drawBarrier(g: Graphics, time: number, active: boolean) {
  g.clear();
  if (!active) return;
  const pulse = 0.5 + Math.sin(time * 3) * 0.3;
  for (let i = -2; i <= 2; i++) {
    const x = i * 8;
    P(g, x - 1, -20 + Math.sin(time * 2 + i) * 3, 2, 24, 0x63d8c8, pulse * 0.5);
  }
  g.rect(-20, -20, 40, 24).stroke({ color: 0x63d8c8, width: 1, alpha: pulse * 0.4 });
}

export function drawAltar(g: Graphics, runes: number, time: number) {
  g.clear();
  g.ellipse(0, 8, 12, 3).fill({ color: 0x05080d, alpha: 0.5 });
  P(g, -10, 2, 20, 5, 0x4e5a68); P(g, -10, 2, 20, 1, 0x5c6875);
  P(g, -7, -6, 14, 8, 0x39424e); P(g, -7, -6, 14, 1, 0x4e5a68);
  // корни древа над алтарём
  for (let i = -2; i <= 2; i++) {
    P(g, i * 5 - 1, -26 + Math.sin(time * 1.5 + i) * 2, 2, 20, 0x2c3626);
  }
  // руны на алтаре
  for (let i = 0; i < 5; i++) {
    const on = i < runes;
    P(g, -6 + i * 3, -3, 2, 2, on ? 0x63d8c8 : 0x232c38, on ? 0.9 : 1);
  }
  if (runes >= 5) {
    const pulse = 0.6 + Math.sin(time * 4) * 0.4;
    g.circle(0, -2, 14).stroke({ color: 0x63d8c8, width: 1.5, alpha: pulse });
  }
}

/* ============================ СНАРЯДЫ ============================ */
export type ProjectileKind = "arrow" | "axe" | "spore" | "fire";
export interface Projectile {
  kind: ProjectileKind; x: number; y: number; vx: number; vy: number; r: number;
  dmg: number; life: number; dist: number; returning: boolean; dead: boolean; spin: number;
  g: Graphics;
}

export function drawProjectile(p: Projectile, time: number) {
  const g = p.g;
  g.clear();
  const a = Math.atan2(p.vy, p.vx);
  const cos = Math.cos, sin = Math.sin;
  const rot = (x: number, y: number, ang: number): [number, number] =>
    [x * cos(ang) - y * sin(ang), x * sin(ang) + y * cos(ang)];
  const quad = (ang: number, pts: [number, number][], color: number) => {
    const r = pts.map((p0) => rot(p0[0], p0[1], ang));
    g.moveTo(r[0][0], r[0][1]);
    for (let i = 1; i < r.length; i++) g.lineTo(r[i][0], r[i][1]);
    g.closePath().fill({ color });
  };
  switch (p.kind) {
    case "arrow":
      quad(a, [[-5, -0.5], [4, -0.5], [4, 0.5], [-5, 0.5]], 0x8a744a);
      quad(a, [[3, -1], [6, 0], [3, 1]], 0xb9c2c9);
      quad(a, [[-5, -1.5], [-3, -1.5], [-3, 1.5], [-5, 1.5]], 0xd8e2ea);
      break;
    case "axe":
      quad(p.spin, [[-1, -5], [1, -5], [1, 4], [-1, 4]], 0x5a4632);
      quad(p.spin, [[-5, -5], [0, -5], [0, 0], [-5, 0]], 0x9fe0ee);
      g.circle(0, 0, 6).stroke({ color: 0x9fe0ee, width: 1, alpha: 0.3 });
      break;
    case "spore":
      g.circle(0, 0, 3).fill({ color: 0x8aa85a, alpha: 0.8 });
      g.circle(0, 0, 1.5).fill({ color: 0xb8d878 });
      break;
    case "fire": {
      const fl = Math.sin(time * 20) * 1;
      g.circle(0, 0, 4 + fl).fill({ color: 0xe08a3c, alpha: 0.8 });
      g.circle(0, 0, 2).fill({ color: 0xf8d878 });
      break;
    }
  }
}
