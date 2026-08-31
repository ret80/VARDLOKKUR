Отлично, закатываю в игру. Ниже — готовые замены для `entities.ts` (три рендерера) и `tiles.ts` (древний алтарь-дольмен), плюс одна строка для `world.ts`.

## entities.ts — заменяем три функции

**1. Святилище (перекрас, не сливается с дорогой):**

```typescript
function renderShrine(g: Graphics, data: IShrineData, time: number) {
  g.clear();
  g.ellipse(0, 7, 7, 2.4).fill({ color: 0x05080d, alpha: 0.5 });
  // основание — тёмный камень + золото
  P(g, -5, 2, 10, 4, 0x1a222c);
  P(g, -5, 2, 10, 1, 0x2c3642);
  P(g, -5, 5, 10, 1, 0xc9a24b);
  // столб
  P(g, -3, -8, 6, 10, 0x232c38);
  P(g, -3, -8, 2, 10, 0x2c3642);
  P(g, 2, -8, 1, 10, 0x141a22);
  P(g, -3, -3, 6, 1, 0xc9a24b);
  // руна на столбе (ярче, когда зажжено)
  const runeA = data.lit ? 0.9 : 0.45;
  P(g, -1, -6, 2, 2, 0x63d8c8, runeA);
  P(g, -1, -6, 1, 1, 0xbdeef8, runeA);
  // верхушка
  P(g, -1, -10, 2, 3, 0x2c3642);
  // снег на основании
  P(g, -5, 1, 2, 1, 0xeef6fc);
  P(g, 3, 1, 2, 1, 0xeef6fc);
  if (data.lit) {
    const fl = Math.sin(time * 8) * 1.5;
    P(g, -1, -14 + fl, 2, 4, 0x8fd8e8, 0.9);
    P(g, 0, -15 + fl, 1, 2, 0xbdeef8);
    g.circle(0, -12 + fl, 5).stroke({ color: 0x8fd8e8, width: 1, alpha: 0.4 });
  }
}
```

**2. Пьедестал (красный при стражах → бирюза после):**

```typescript
function renderPedestal(g: Graphics, data: IPedestalData, time: number) {
  g.clear();
  g.ellipse(0, 7, 8, 2.6).fill({ color: 0x05080d, alpha: 0.5 });
  P(g, -6, 2, 12, 4, 0x4e5a68); P(g, -6, 2, 12, 1, 0x5c6875);
  P(g, -4, -6, 8, 8, 0x39424e); P(g, -4, -6, 8, 1, 0x4e5a68);
  // камень с окошком — виден ВСЕГДА (пока руна не взята)
  P(g, -2, -12, 4, 6, 0x4e5a68);
  if (!data.taken) {
    const sealed = data.guardsLeft > 0;
    const col = sealed ? 0xe05050 : 0x63d8c8;   // печать крепка — красный, пала — бирюза
    const core = sealed ? 0xf8a0a0 : 0xbdeef8;
    const pulse = 0.6 + Math.sin(time * (sealed ? 5 : 3)) * 0.4;
    P(g, -1, -11, 2, 4, col, pulse);
    P(g, -1, -10, 1, 2, core, pulse);
    // кольцо ТЕПЕРЬ вокруг окошка (на месте бывшего голубого)
    g.circle(0, -9, 6).stroke({ color: col, width: 1, alpha: pulse * 0.6 });
  } else {
    P(g, -1, -11, 2, 4, 0x232c38); // пустое окошко
  }
}
```

**3. Алтарь Древа (идол с 5 слотами рун):**

```typescript
function renderAltar(g: Graphics, data: IAltarData, time: number) {
  g.clear();
  g.ellipse(0, 6, 8, 2).fill({ color: 0x05080d, alpha: 0.45 });
  const eyeP = 0.7 + Math.sin(time * 2.5) * 0.3;
  g.circle(0, -11, 5).fill({ color: 0xe8c979, alpha: 0.12 });
  // постамент со слотами рун
  P(g, -6, 2, 12, 4, 0x241a10);
  P(g, -6, 2, 12, 1, 0x3a2c1c);
  for (let i = 0; i < 5; i++) {
    const on = i < data.runes;
    P(g, -5 + i * 2, 3, 1, 1, on ? 0x63d8c8 : 0x1d1610, on ? 0.9 : 1);
  }
  // тело идола
  P(g, -3, -9, 6, 11, 0x5a4632);
  P(g, -3, -9, 2, 11, 0x6a543c);
  P(g, 2, -9, 1, 11, 0x3a2c1c);
  // руки
  P(g, -4, -6, 8, 2, 0x4a3624);
  P(g, -4, -6, 1, 2, 0x6a543c);
  P(g, 3, -6, 1, 2, 0x6a543c);
  // руна на груди
  P(g, -1, -3, 2, 3, 0x63d8c8, 0.8);
  P(g, -1, -2, 1, 1, 0xbdeef8, 0.9);
  // голова со снежной шапкой
  P(g, -4, -14, 8, 6, 0x6a543c);
  P(g, -4, -14, 8, 1, 0x7a6248);
  P(g, -4, -15, 8, 1, 0xeef6fc);
  // золотые глаза (пульсируют)
  P(g, -3, -12, 2, 2, 0xe8c979, eyeP);
  P(g, 1, -12, 2, 2, 0xe8c979, eyeP);
  P(g, -3, -12, 1, 1, 0xf8e0a0, eyeP);
  P(g, 1, -12, 1, 1, 0xf8e0a0, eyeP);
  P(g, -2, -10, 4, 1, 0x3a2c1c);
  // снег у основания
  P(g, -6, 1, 3, 1, 0xeef6fc);
  P(g, 3, 1, 3, 1, 0xeef6fc);
  if (data.runes >= 5) {
    const pulse = 0.6 + Math.sin(time * 4) * 0.4;
    g.circle(0, -4, 14).stroke({ color: 0x63d8c8, width: 1.5, alpha: pulse });
  }
}
```

## tiles.ts — древний алтарь-дольмен

**1.** В `TILE_COLORS`: `[Tl.ALTAR]: "#1a222c"` (вместо `#39424e` — чтобы и на миникарте не сливался).

**2.** В `buildGroundTexture` заменить `case Tl.ALTAR`:

```typescript
case Tl.ALTAR: dither(gx, X, Y, "#1a222c", "#141a22", "#232c38"); break;
```

**3.** В `paintWall` добавить кейс (дольмен):

```typescript
case Tl.ALTAR: {
  // нижняя плита + золото
  P(2, 13, 12, 3, 0x1a222c);
  P(2, 13, 12, 1, 0x2c3642);
  P(2, 15, 12, 1, 0xc9a24b);
  // боковые камни
  P(3, 5, 3, 8, 0x232c38); P(3, 5, 1, 8, 0x2c3642);
  P(10, 5, 3, 8, 0x232c38); P(12, 5, 1, 8, 0x141a22);
  // руна между камнями
  P(7, 6, 2, 6, 0x63d8c8); P(7, 7, 1, 4, 0xbdeef8);
  // верхняя плита + снег
  P(2, 2, 12, 3, 0x2c3642); P(2, 2, 12, 1, 0x39424e);
  P(2, 1, 12, 1, 0xeef6fc);
  P(3, 3, 1, 1, 0xc9a24b); P(12, 3, 1, 1, 0xc9a24b);
  break;
}
```

**4.** В `buildWallAndHouseSprites` добавить `t === Tl.ALTAR` в условие создания спрайтов:

```typescript
if (
  t === Tl.TREE || t === Tl.ROCK || t === Tl.PALISADE ||
  t === Tl.COLUMN || t === Tl.DWALL || t === Tl.CAVEWALL || t === Tl.ALTAR
) {
```

## world.ts — одна строка (план)

В `solidTileAt` добавить `t === Tl.ALTAR`, чтобы игрок не проходил сквозь дольмен:

```typescript
return t === Tl.TREE || ... || t === Tl.ALTAR;
```

Взаимодействие (`oldAltar` в engine.ts) работает без изменений: дистанция 22px дотягивается до соседней плитки.

**Итог:** святилище — тёмный камень с золотом и голубым пламенем; пьедестал — красный круг+окошко при стражах, бирюза после; алтарь Древа — идол; древний алтарь — дольмен-спрайт на тёмной подложке. В `engine.ts` правок не нужно. Следующим по списку остаётся спуск в склеп (решётка → портал) и забор — скажи, когда продолжать.