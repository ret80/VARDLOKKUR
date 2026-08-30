Понял: нужны три разных проекции, как в олдскульных top‑down играх (Zelda‑стиль):

- **3×2 (вытянут по X)** — вид **сбоку**: длинный скат крыши с горизонтальным коньком, ряды дранки, торцевые перекрестья балок, полоса стены с дверью и окнами;
- **2×3 (вытянут по Y)** — вид **с торца**: фронтон с перекрестьем, а над ним крыша «уходит вверх» — два сходящихся ската с вертикальным коньком (барак виден в глубину);
- **3×3** — **два яруса**: нижний сруб с дверью, межъярусная кровля‑полка со снегом и сосульками, верхний ярус с окнами и высокая крыша.

Переписываю `houseMetrics` и `paintHouse` (остальное — кеш, `setRoofSnow`, позиция спрайта — остаётся, меняется только формула Y‑позиции на общую).

**1. `houseMetrics` — размеры по варианту**

```ts
private houseMetrics(hw: number, hh: number) {
  const wallW = hw * T, footH = hh * T;
  const marginX = 12, foundH = 3, bottomPad = 3;
  const mode: "side" | "front" | "two" =
    hw >= 3 && hh >= 3 ? "two" : hw > hh ? "side" : "front";
  let wallH: number, roofH: number, topPad: number, ridgeLen = 0;
  if (mode === "side")      { wallH = 18; roofH = 22; topPad = 8; }
  else if (mode === "two")  { wallH = 37; roofH = 24; topPad = 8; }
  else { ridgeLen = hh > hw ? 14 : 6; wallH = hh > hw ? 24 : 20; roofH = 18; topPad = ridgeLen + 8; }
  const wallTop = topPad + roofH;
  return { mode, wallW, footH, wallH, roofH, topPad, ridgeLen, marginX, foundH, wallTop,
           canvasW: wallW + marginX * 2, canvasH: wallTop + wallH + foundH + bottomPad };
}
```

**2. `paintHouse` — три ракурса**

```ts
private paintHouse(ctx: CanvasRenderingContext2D, hw: number, hh: number, v: number) {
  const { mode, wallW, wallH, topPad, marginX, foundH, wallTop, ridgeLen } = this.houseMetrics(hw, hh);
  const wx = marginX, cx = marginX + wallW / 2;
  const snow = this.roofSnow;
  const SNOW = 0xeef6fc, SNOW2 = 0xc8d8e8, ICE = 0xbdeef8;
  const R = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    ctx.globalAlpha = a; ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const CIRC = (x: number, y: number, r: number, c: number, a = 1) => {
    ctx.globalAlpha = a; ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  const PATH = (pts: [number, number][], c: number, a = 1) => {
    ctx.globalAlpha = a; ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  };
  const logWall = (x: number, y: number, w: number, h: number) => {
    R(x, y, w, h, 0x4a3624);
    for (let ly = 0; ly < h; ly += 4) {
      R(x, y + ly, w, 1, 0x6a543c); R(x, y + ly + 1, w, 2, 0x5a4430); R(x, y + ly + 3, w, 1, 0x2e2012);
    }
    for (let ly = 2; ly + 4 < h; ly += 8) {
      R(x - 3, y + ly, 3, 5, 0x2e2012); R(x - 3, y + ly + 1, 2, 3, 0x6a543c);
      R(x + w, y + ly, 3, 5, 0x2e2012); R(x + w + 1, y + ly + 1, 2, 3, 0x6a543c);
    }
  };
  const door = (dx: number, yB: number, w: number, h: number) => {
    const dy = yB - h;
    R(dx - 2, dy - 2, w + 4, h + 2, 0x241a10); R(dx - 1, dy - 3, w + 2, 1, 0x241a10);
    R(dx, dy, w, h, 0x38281a);
    for (let i = 3; i < w - 1; i += 4) R(dx + i, dy + 1, 1, h - 1, 0x241809);
    R(dx, dy + 4, w, 1, 0x262b33); R(dx, dy + h - 5, w, 1, 0x262b33);
    R(dx + w - 3, dy + (h >> 1), 1, 2, 0x9aa4b2);
    if (snow) R(dx - 2, dy - 4, w + 4, 1, SNOW2, 0.9);
  };
  const win = (x0: number, y0: number) => {
    R(x0 - 1, y0 - 1, 9, 9, 0x2e2012);
    R(x0, y0, 7, 7, v & 1 ? 0xf8e0a0 : 0xb8d0e8);
    R(x0 + 3, y0, 1, 7, 0x2e2012); R(x0, y0 + 3, 7, 1, 0x2e2012);
    if (snow) R(x0 - 1, y0 - 2, 9, 1, SNOW, 0.9);
  };
  const icicles = (x0: number, x1: number, y0: number) => {
    if (!snow) return;
    const off = (v & 1) ? 3 : 0;
    for (let ix = x0 + 2 + off; ix < x1 - 2; ix += 7) R(ix, y0, 1, (ix >> 3) & 1 ? 3 : 2, ICE, 0.9);
  };
  const crossBeams = (ex: number, ry: number) => {
    for (let i = 0; i < 4; i++) { R(ex - 3 + i, ry - i, 2, 2, 0x3a2c1c); R(ex + 1 - i, ry - i, 2, 2, 0x3a2c1c); }
    if (snow) { R(ex - 3, ry - 4, 2, 1, SNOW); R(ex + 1, ry - 4, 2, 1, SNOW); }
  };
  // горизонтальная крыша: скат к игроку, конёк вдоль X, задний скат сверху
  const sideRoof = (ry: number, ey: number, x0: number, x1: number) => {
    R(x0 + 2, ry - 4, x1 - x0 - 4, 4, 0x35291c);                    // задний скат
    if (snow) R(x0 + 3, ry - 5, x1 - x0 - 6, 1, SNOW2, 0.9);
    for (let y = ry; y < ey; y += 2) {                               // дранка переднего ската
      const row = (y - ry) >> 1;
      R(x0, y, x1 - x0, 2, row % 2 ? 0x4a3a28 : 0x423222);
      for (let sx = x0 + (row % 2 ? 2 : 0); sx < x1; sx += 4) R(sx, y, 1, 2, 0x3a2c1c);
      if (snow && row % 2 === 1)
        for (let sx = x0 + 3 + ((row * 7) % 5); sx < x1 - 5; sx += 9) R(sx, y, 3, 1, SNOW, 0.75);
    }
    R(x0, ry - 2, x1 - x0, 2, 0x6a5a40);                            // конёк
    if (snow) R(x0 + 1, ry - 3, x1 - x0 - 2, 2, SNOW);
    crossBeams(x0 + 3, ry - 2); crossBeams(x1 - 3, ry - 2);         // перекрестья по торцам
    R(x0, ey - 1, x1 - x0, 2, 0x5a4a34);                            // карниз
    icicles(x0, x1, ey + 1);
  };

  // ===== фундамент =====
  R(wx - 2, wallTop + wallH, wallW + 4, foundH, 0x3f444c);
  R(wx - 2, wallTop + wallH, wallW + 4, 1, 0x5a616c);
  for (let sx = wx - 1; sx < wx + wallW; sx += 6) R(sx, wallTop + wallH + 1, 3, 2, 0x4a505a);

  if (mode === "side") {
    // ===== 3x2: длинный дом, вид сбоку =====
    logWall(wx, wallTop, wallW, wallH);
    door(Math.round(cx - 6), wallTop + wallH, 12, wallH - 3);
    win(wx + 6, wallTop + 5); win(wx + wallW - 13, wallTop + 5);
    sideRoof(topPad, wallTop, wx - 6, wx + wallW + 6);
  } else if (mode === "two") {
    // ===== 3x3: двухъярусный дом =====
    logWall(wx, wallTop, wallW, wallH);
    const ledgeY = wallTop + 12;                                    // межъярусная кровля
    R(wx - 6, ledgeY - 1, wallW + 12, 1, 0x6a5a40);
    R(wx - 6, ledgeY, wallW + 12, 3, 0x4a3a28);
    R(wx - 6, ledgeY + 3, wallW + 12, 1, 0x2e2012);
    if (snow) R(wx - 6, ledgeY - 2, wallW + 12, 2, SNOW);
    icicles(wx - 6, wx + wallW + 6, ledgeY + 4);
    door(Math.round(cx - 7), wallTop + wallH, 14, 17);              // нижний ярус
    win(wx + 5, ledgeY + 9); win(wx + wallW - 13, ledgeY + 9);
    for (const ox of [cx - 14, cx - 4, cx + 6]) win(ox, wallTop + 3); // верхний ярус
    sideRoof(topPad, wallTop, wx - 6, wx + wallW + 6);
  } else {
    // ===== 2x2 / 2x3: вид с торца, крыша уходит вверх =====
    logWall(wx, wallTop, wallW, wallH);
    const dw = 10, doorX = Math.round(cx - dw / 2);
    door(doorX, wallTop + wallH, dw, Math.min(17, wallH - 4));
    const gapL = doorX - 2 - wx, gapR = wx + wallW - (doorX + dw + 2);
    if (gapL >= 9) {
      const shX = wx + (gapL >> 1), shY = wallTop + Math.floor(wallH * 0.55);
      CIRC(shX, shY, 5, 0x262b33); CIRC(shX, shY, 4, v & 2 ? 0x8a3a34 : 0x3d5a66); CIRC(shX, shY, 1.5, 0xc9a24b);
      if (snow) R(shX - 4, shY - 6, 8, 1, SNOW2, 0.8);
    }
    if (gapR >= 9) win(doorX + dw + 2 + ((gapR - 7) >> 1), wallTop + Math.floor(wallH * 0.3));
    // скаты, уходящие вглубь (левый темнее, правый светлее)
    const ov = 6, eL = wx - ov, eR = wx + wallW + ov;
    const apF = topPad, apR = topPad - ridgeLen;
    PATH([[eL, wallTop], [cx, apF], [cx, apR], [eL + 2, wallTop - ridgeLen]], 0x403020);
    PATH([[eR, wallTop], [cx, apF], [cx, apR], [eR - 2, wallTop - ridgeLen]], 0x4a3a28);
    if (snow) for (let i = 1; i <= 3; i++) {
      R(cx - 4 - i * 3, apF - i * (ridgeLen / 4), 3, 1, SNOW, 0.7);
      R(cx + 2 + i * 2, apF - i * (ridgeLen / 4) + 1, 3, 1, SNOW, 0.7);
    }
    R(cx - 1, apR - 1, 2, ridgeLen + 3, snow ? SNOW : 0x6a5a40);    // вертикальный конёк
    // фронтон: доски + баржборды со снегом
    const gH = wallTop - topPad;
    for (let i = 0; i < gH; i += 2) {
      const halfW = 1 + (wallW / 2 + ov - 1) * ((i + 2) / gH);
      const y = topPad + i;
      for (let x = Math.ceil(cx - halfW); x < cx + halfW; x += 3)
        R(x, y, Math.min(3, Math.ceil(cx + halfW) - x), 2, (Math.floor(x / 3) & 1) === 0 ? 0x4a3a28 : 0x423222);
      R(cx - halfW - 2, y - 1, 3, 2, 0x6a5a40); R(cx + halfW - 1, y - 1, 3, 2, 0x6a5a40);
      if (snow) { R(cx - halfW - 2, y - 2, 3, 1, SNOW); R(cx + halfW - 1, y - 2, 3, 1, SNOW); }
    }
    const ly0 = topPad + Math.floor(gH * 0.5);                      // круглое окно фронтона
    CIRC(cx, ly0, 4, 0x2e2012); CIRC(cx, ly0, 3, v & 1 ? 0xf8e0a0 : 0x241809);
    R(cx - 1, ly0 - 3, 1, 6, 0x2e2012); R(cx - 3, ly0 - 1, 6, 1, 0x2e2012);
    crossBeams(cx, topPad - 1);
    R(eL, wallTop - 1, eR - eL, 2, 0x5a4a34);
    icicles(eL, eR, wallTop + 1);
  }

  // ===== сугробы у основания =====
  if (snow) {
    R(wx - 3, wallTop + wallH + foundH - 2, wallW + 6, 1, SNOW2, 0.8);
    R(wx - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
    R(wx + wallW - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
  }
  ctx.globalAlpha = 1;
}
```

**3. Позиция спрайта в `buildMapTextures`** (общая формула, т.к. высота стены теперь не равна footprint):

```ts
const m = this.houseMetrics(hw, hh);
const v = (rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 11) > 0.6 ? 2 : 0);
const ws = new Sprite(this.houseTexture(hw, hh, v));
ws.position.set(x * T - m.marginX, y * T + hh * T + 1 - (m.wallTop + m.wallH + m.foundH));
ws.zIndex = y * T + hh * T;
this.wallTiles.push(ws);
this.houseSprites.push({ spr: ws, hw, hh, v });
this.dynamic.addChild(ws);
```

Что изменилось визуально:

- **3×2** — теперь это длинный «барак» в профиль: горизонтальный конёк со снежной шапкой и перекрестьями слег по обоим торцам, видимый задний скат над коньком, передний скат с рядами дранки и снежными языками, карниз с сосульками, а под ним низкая стена с дверью и двумя окнами.
- **2×3** — вид с торца: фронтон с досками, круглым окном и перекрестьем, а над ним крыша уходит вглубь кадра — два сходящихся ската (левый в тени, правой светлее) с вертикальным заснеженным коньком; дом читается длинным, как барак.
- **3×3** — двухъярусные хоромы: внизу сруб с широкой дверью и окнами, выше — снежная кровля‑полка с сосульками, верхний ярус с тремя окнами и высокая крыша с торцевыми перекрестьями.
- Снег по‑прежнему одним флагом: `engine.setRoofSnow(false)` / клавиша **N** — переключается мгновенно благодаря отдельному кешу текстур `snow0/snow1`.