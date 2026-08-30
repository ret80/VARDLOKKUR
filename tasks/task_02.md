Проблема найдена. В `buildMapTextures` дом создаётся вызовом `wallSprite(Tl.HOUSE, hw, hh, r1, r2, dungeonId)` — то есть размеры дома уходят в параметры `hwOrR1/hhOrR2`, а `houseW/houseH` остаются `0`. Из‑за этого канвас всегда 32×44, `paintWall` рисует дом 2×2 с обрезанием (крыша «сползает», стены обрезаются) — это и видно на скриншоте.

Ниже — переписанные функции: дом рисуется по реальным размерам (2x2…3x3), в скандинавском стиле (бревенчатый сруб с выпусками брёвен, двускатная крыша с досками‑баржбордами, перекрещенные слеги на коньке, круглое чердачное окно, дверь с железными полосами, щит у стены), снег на крыше отдельным флагом `roofSnow` с методом `setRoofSnow(on)` (и клавишей **N** для проверки).

**1. Поля движка + переключение снега**

```ts
// добавить в поля класса Engine
private roofSnow = true; // снег на крышах (можно выключить)
private houseSprites: { spr: Sprite; hw: number; hh: number; v: number }[] = [];

/** Вкл/выкл снег на крышах домов (можно вызывать из UI). */
setRoofSnow(on: boolean) {
  if (this.roofSnow === on) return;
  this.roofSnow = on;
  for (const h of this.houseSprites) h.spr.texture = this.houseTexture(h.hw, h.hh, h.v);
  audio.uiClick();
}
```

В `keyDown` (для быстрой проверки):

```ts
if (e.code === "KeyN") {
  this.setRoofSnow(!this.roofSnow);
  this.toast(this.roofSnow ? "Снег на крышах: вкл" : "Снег на крышах: выкл");
}
```

**2. `buildMapTextures` — исправленный цикл домов и вызовы `wallSprite`**

```ts
// в начале buildMapTextures, рядом с очистками:
this.houseSprites = [];

// цикл стеновых тайлов — новая сигнатура wallSprite(t, r1, r2, dungeonId):
const ws = this.wallSprite(t, rnd(x, y, 11), rnd(x, y, 13), map.dungeonId);
ws.position.set(X - 8, Y - 20);
ws.zIndex = Y + T;
this.wallTiles.push(ws);
this.dynamic.addChild(ws);

// цикл домов — заменяем целиком:
const m = this.houseMetrics(hw, hh);
const v = (rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 11) > 0.6 ? 2 : 0);
const ws = new Sprite(this.houseTexture(hw, hh, v));
// низ фундамента стоит на нижней кромке footprint'а дома
ws.position.set(x * T - m.marginX, y * T + 1 - m.wallTop - m.foundH);
ws.zIndex = y * T + hh * T; // сортировка по нижней кромке дома
this.wallTiles.push(ws);
this.houseSprites.push({ spr: ws, hw, hh, v });
this.dynamic.addChild(ws);
```

**3. Новые методы вместо старой отрисовки дома**

```ts
private houseMetrics(hw: number, hh: number) {
  const wallW = hw * T, wallH = hh * T;
  const roofH = Math.min(34, Math.max(20, Math.round(wallW * 0.62)));
  const topPad = 10, marginX = 12, foundH = 3, bottomPad = 3;
  const wallTop = topPad + roofH;
  return { wallW, wallH, roofH, topPad, marginX, foundH, wallTop,
           canvasW: wallW + marginX * 2, canvasH: wallTop + wallH + foundH + bottomPad };
}

private houseTexture(hw: number, hh: number, v: number): Texture {
  const key = `house_${hw}x${hh}_v${v}_snow${this.roofSnow ? 1 : 0}`;
  let tex = this.wallTexCache.get(key);
  if (!tex) {
    const m = this.houseMetrics(hw, hh);
    const c = document.createElement("canvas");
    c.width = m.canvasW; c.height = m.canvasH;
    this.paintHouse(c.getContext("2d")!, hw, hh, v);
    tex = Texture.from(c);
    this.wallTexCache.set(key, tex);
  }
  return tex;
}

private wallSprite(t: number, r1: number, r2: number, dungeonId: number): Sprite {
  let v = 0;
  if (t === Tl.TREE) v = (r2 > 0.5 ? 1 : 0) | (r2 > 0.7 ? 2 : 0);
  else if (t === Tl.ROCK) v = r1 > 0.5 ? 1 : 0;
  else if (t === Tl.COLUMN) v = (r1 > 0.5 ? 1 : 0) | (r2 > 0.7 ? 2 : 0);
  const key = t + "_" + v + "_" + dungeonId;
  let tex = this.wallTexCache.get(key);
  if (!tex) {
    const c = document.createElement("canvas");
    c.width = 32; c.height = 44;
    this.paintWall(c.getContext("2d")!, t, v, dungeonId);
    tex = Texture.from(c);
    this.wallTexCache.set(key, tex);
  }
  return new Sprite(tex);
}

private paintHouse(ctx: CanvasRenderingContext2D, hw: number, hh: number, v: number) {
  const { wallW, wallH, roofH, topPad, marginX, foundH, wallTop } = this.houseMetrics(hw, hh);
  const wx = marginX, cx = marginX + wallW / 2, overhang = 7, snow = this.roofSnow;
  const SNOW = 0xeef6fc, SNOW2 = 0xc8d8e8, ICE = 0xbdeef8;
  const R = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const CIRC = (x: number, y: number, r: number, c: number, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };

  // ===== фундамент из камня =====
  R(wx - 2, wallTop + wallH, wallW + 4, foundH, 0x3f444c);
  R(wx - 2, wallTop + wallH, wallW + 4, 1, 0x5a616c);
  for (let sx = wx - 1; sx < wx + wallW; sx += 6) R(sx, wallTop + wallH + 1, 3, 2, 0x4a505a);

  // ===== бревенчатый сруб =====
  R(wx, wallTop, wallW, wallH, 0x4a3624);
  for (let ly = 0; ly < wallH; ly += 4) {
    R(wx, wallTop + ly, wallW, 1, 0x6a543c);
    R(wx, wallTop + ly + 1, wallW, 2, 0x5a4430);
    R(wx, wallTop + ly + 3, wallW, 1, 0x2e2012);
  }
  // выпуски брёвен по углам
  for (let ly = 2; ly + 4 < wallH; ly += 8) {
    R(wx - 3, wallTop + ly, 3, 5, 0x2e2012);
    R(wx - 3, wallTop + ly + 1, 2, 3, 0x6a543c);
    R(wx + wallW, wallTop + ly, 3, 5, 0x2e2012);
    R(wx + wallW + 1, wallTop + ly + 1, 2, 3, 0x6a543c);
  }

  // ===== дверь =====
  const doorW = Math.max(10, Math.floor(wallW / 3));
  const doorH = Math.min(wallH - 4, Math.max(16, Math.floor(wallH * 0.6)));
  const doorX = Math.round(cx - doorW / 2);
  const doorY = wallTop + wallH - doorH;
  R(doorX - 2, doorY - 2, doorW + 4, doorH + 2, 0x241a10);
  R(doorX - 1, doorY - 3, doorW + 2, 1, 0x241a10);
  R(doorX, doorY, doorW, doorH, 0x38281a);
  for (let px = 3; px < doorW - 1; px += 4) R(doorX + px, doorY + 1, 1, doorH - 1, 0x241809);
  R(doorX, doorY + 4, doorW, 1, 0x262b33);           // железные полосы
  R(doorX, doorY + doorH - 6, doorW, 1, 0x262b33);
  R(doorX + doorW - 3, doorY + (doorH >> 1), 1, 2, 0x9aa4b2); // ручка
  if (snow) R(doorX - 2, doorY - 4, doorW + 4, 1, SNOW2, 0.9);

  // ===== щит на стене =====
  const gapL = doorX - 2 - wx;
  if (gapL >= 9) {
    const shX = wx + (gapL >> 1), shY = wallTop + Math.floor(wallH * 0.62);
    CIRC(shX, shY, 5, 0x262b33);
    CIRC(shX, shY, 4, v & 2 ? 0x8a3a34 : 0x3d5a66);
    CIRC(shX, shY, 1.5, 0xc9a24b);
    if (snow) R(shX - 4, shY - 6, 8, 1, SNOW2, 0.8);
  }

  // ===== окна =====
  const winS = 7, winY = wallTop + Math.floor(wallH * 0.3);
  const glow = v & 1 ? 0xf8e0a0 : 0xb8d0e8;
  const drawWin = (x0: number) => {
    R(x0 - 1, winY - 1, winS + 2, winS + 2, 0x2e2012);
    R(x0, winY, winS, winS, glow);
    R(x0 + 3, winY, 1, winS, 0x2e2012);
    R(x0, winY + 3, winS, 1, 0x2e2012);
    if (snow) R(x0 - 1, winY - 2, winS + 2, 1, SNOW, 0.9); // снежная полка над окном
  };
  const gapR = wx + wallW - (doorX + doorW + 2);
  if (gapR >= winS + 2) drawWin(doorX + doorW + 2 + ((gapR - winS) >> 1));
  if (hw >= 3 && gapL >= winS + 2) drawWin(wx + ((gapL - winS) >> 1));

  // ===== фронтон: вертикальные доски =====
  const rows = Math.floor(roofH / 2), halfMax = wallW / 2 + overhang;
  for (let i = 0; i < rows; i++) {
    const halfW = 2 + (halfMax - 2) * ((i + 1) / rows);
    const y = topPad + i * 2;
    for (let x = Math.ceil(cx - halfW); x < cx + halfW; x += 3) {
      R(x, y, Math.min(3, Math.ceil(cx + halfW) - x), 2,
        (Math.floor(x / 3) & 1) === 0 ? 0x4a3a28 : 0x403020);
    }
  }
  // круглое чердачное окошко
  const ly0 = topPad + Math.floor(roofH * 0.5);
  CIRC(cx, ly0, 4, 0x2e2012);
  CIRC(cx, ly0, 3, v & 1 ? 0xf8e0a0 : 0x241809);
  R(cx - 1, ly0 - 3, 1, 6, 0x2e2012);
  R(cx - 3, ly0 - 1, 6, 1, 0x2e2012);

  // ===== баржборды (доски по скатам) + снег =====
  for (let i = 0; i < rows; i++) {
    const halfW = 2 + (halfMax - 2) * ((i + 1) / rows);
    const y = topPad + i * 2;
    R(cx - halfW - 2, y - 1, 3, 2, 0x6a5a40);
    R(cx + halfW - 1, y - 1, 3, 2, 0x6a5a40);
    if (snow) {
      R(cx - halfW - 2, y - 2, 3, 1, SNOW);
      R(cx + halfW - 1, y - 2, 3, 1, SNOW);
    }
  }
  // ===== карниз + снежная полка + сосульки =====
  const eaveL = wx - overhang, eaveR = wx + wallW + overhang;
  R(eaveL, wallTop - 2, eaveR - eaveL, 2, 0x6a5a40);
  if (snow) {
    R(eaveL, wallTop - 4, eaveR - eaveL, 2, SNOW);
    R(eaveL, wallTop - 2, eaveR - eaveL, 1, SNOW2, 0.7);
    const off = (v & 1) ? 3 : 0;
    for (let ix = eaveL + 2 + off; ix < eaveR - 2; ix += 7)
      R(ix, wallTop, 1, (ix >> 3) & 1 ? 3 : 2, ICE, 0.9);
    R(cx - 4, topPad - 3, 9, 2, SNOW); // снежная шапка на коньке
  }
  // ===== перекрещенные слеги на коньке =====
  for (let i = 0; i < 5; i++) {
    R(cx - 5 + i, topPad - 2 - i, 2, 2, 0x3a2c1c);
    R(cx + 3 - i, topPad - 2 - i, 2, 2, 0x3a2c1c);
  }
  if (snow) { R(cx - 5, topPad - 7, 2, 1, SNOW); R(cx + 3, topPad - 7, 2, 1, SNOW); }

  // ===== сугробы у основания =====
  if (snow) {
    R(wx - 3, wallTop + wallH + foundH - 2, wallW + 6, 1, SNOW2, 0.8);
    R(wx - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
    R(wx + wallW - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
  }
  ctx.globalAlpha = 1;
}
```

**4. `paintWall`** — просто удаляем из него `case Tl.HOUSE` (вместе с двойным `break`) и параметры `houseW/houseH`: дома теперь рисует только `paintHouse`.

Что получилось:
- Дома 2×2, 2×3, 3×2, 3×3 рисуются по реальным размерам без обрезания; sprite позиционируется так, что фундамент стоит точно на тайлах дома, а `zIndex` по нижней кромке корректно перекрывает персонажей.
- Скандинавский вид: сруб с выпусками брёвен, каменный фундамент, двускатный фронтон из досок со скрещенными слегами, круглое чердачное окно, тёплый/холодный свет окон и цвет щита как вариации (`v`).
- Снег (шапка на коньке, полосы по скатам, полка на карнизе, сосульки, сугробы) рисуется только при `roofSnow === true`; выключение — `engine.setRoofSnow(false)` или клавиша **N**, текстуры при этом кешируются отдельно для обоих состояний, так что переключение мгновенное и без регенерации мира.