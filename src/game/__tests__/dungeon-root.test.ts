import { describe, expect, it } from 'vitest';
import { generateDungeon, DUNGEONS } from '../generators/dungeons';
import { Tl, idx, type WorldData } from '../generators/types';
import { floodReach } from '../generators/utils';

const SEEDS = [12345, 777, 42, 2024, 99999];

function build(seed: number): WorldData {
  return generateDungeon(seed, DUNGEONS[1], { x: 0, y: 0 });
}

/** Прямоугольник комнаты босса в тайлах. */
function bossRect(w: WorldData) {
  return {
    bx: Math.floor(w.bossRoom.x / 16),
    by: Math.floor(w.bossRoom.y / 16),
    bw: Math.floor(w.bossRoom.w / 16),
    bh: Math.floor(w.bossRoom.h / 16),
  };
}

describe('Корень Иггдрасиля (подземелье 1)', () => {
  it('имеет отдельную комнату босса, а не всю пещеру', () => {
    for (const seed of SEEDS) {
      const w = build(seed);
      const { bx, by, bw, bh } = bossRect(w);
      expect(bw).toBeGreaterThanOrEqual(12);
      expect(bh).toBeGreaterThanOrEqual(10);
      expect(w.bossRoom.w).toBeLessThan(w.W * 16 * 0.5);
      expect(w.bossRoom.h).toBeLessThan(w.H * 16 * 0.5);

      let floor = 0;
      let inBoss = 0;
      for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
        if (w.tiles[idx(w, x, y)] !== Tl.DFLOOR) continue;
        floor++;
        if (x >= bx && x < bx + bw && y >= by && y < by + bh) inBoss++;
      }
      // Пол комнаты босса — заметная, но не преобладающая доля всего пола.
      expect(inBoss).toBeLessThan(floor * 0.4);
    }
  });

  it('комната босса герметична: кольцо стен и единственный проход снизу', () => {
    for (const seed of SEEDS) {
      const w = build(seed);
      const { bx, by, bw, bh } = bossRect(w);
      expect(w.doors.length).toBe(1);
      const door = w.doors[0];
      expect(door.dir).toBe('down');
      const dcx = Math.floor(door.x / 16);
      const dcy = Math.floor(door.y / 16);

      const isWall = (x: number, y: number) => w.tiles[idx(w, x, y)] === Tl.DWALL;
      const inDoor = (x: number, y: number) => y === dcy && (x === dcx - 1 || x === dcx);

      for (let x = bx - 1; x <= bx + bw; x++) {
        expect(isWall(x, by - 1)).toBe(true);
        if (inDoor(x, by + bh)) expect(w.tiles[idx(w, x, by + bh)]).toBe(Tl.DFLOOR);
        else expect(isWall(x, by + bh)).toBe(true);
      }
      for (let y = by; y < by + bh; y++) {
        expect(isWall(bx - 1, y)).toBe(true);
        expect(isWall(bx + bw, y)).toBe(true);
      }
      expect(dcy).toBe(by + bh);

      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
        expect(w.tiles[idx(w, x, y)]).toBe(Tl.DFLOOR);
      }
      // Проход сразу за дверью прорублен к лабиринту.
      expect(w.tiles[idx(w, dcx, by + bh + 1)]).toBe(Tl.DFLOOR);
    }
  });

  it('вход, комната босса и весь пол связны', () => {
    for (const seed of SEEDS) {
      const w = build(seed);
      const ex = Math.floor(w.spawn.x / 16);
      const ey = Math.floor(w.spawn.y / 16);
      const reach = floodReach(w, ex, ey);
      const { bx, by, bw, bh } = bossRect(w);
      expect(reach[idx(w, bx + (bw >> 1), by + (bh >> 1))]).toBe(1);

      let unreachable = 0;
      for (let i = 0; i < w.W * w.H; i++) {
        if (w.tiles[i] === Tl.DFLOOR && !reach[i]) unreachable++;
      }
      expect(unreachable).toBe(0);
    }
  });

  it('в лабиринте много врагов, преимущественно грибов', () => {
    for (const seed of SEEDS) {
      const w = build(seed);
      expect(w.spawns.length).toBeGreaterThanOrEqual(20);
      const shrooms = w.spawns.filter((s) => s.kind === 'shroom').length;
      expect(shrooms).toBeGreaterThanOrEqual(10);
      for (const s of w.spawns) expect(DUNGEONS[1].pool).toContain(s.kind);
    }
  });
});
