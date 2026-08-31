# ТУМАН 2.0 — итоговый дизайн-документ

## 1. Как сейчас (по коду `engine.ts` / `fx.ts`)

- **Таймер:** старт 42с; волна длится **13с**; интервал `(36 − руны*4) + rand*14` ≈ **22–50с**, и чем больше рун, тем чаще.
- **Визуал:** `fx.redrawFog` рисует виньетку с **«окном» вокруг игрока** (holeR считается от позиции игрока) — туман живёт только по краям экрана.
- **Спавн:** на волне 1–2 **обычных** моба (60% морозный / 40% драугр) с аггро.
- **Зоны:** тумана нет в подземельях и после смерти Змея. **Деревни и святилища никак не защищены** от тумана (в деревнях просто деагрятся обычные мобы).
- **Награда:** нет. Волна даёт ноль ресурсов.

## 2. Почему это плохо

- «Окно» над игроком убивает суть: туман не «накатывает со всех сторон», он всегда где-то на периферии — угрозу не видно и не чувствуется.
- 13 секунд — волна заканчивается раньше, чем начинается: обычные мобы не делают туман событием.
- Интервал 22–50с — туман становится фоновым шумом, который только раздражает при фарме.
- Нет риска/награды: событие чисто наказующее, без лута и прогрессии.
- Нет укрытий: деревня и святилище — «дом и свет» — не спасают, значит нет тактики «переждать» и нет ритма напряжение/отдых.

## 3. Как будет

### 3.1 Туман на экране
- **Окна над игроком больше нет:** во время волны туман укрывает весь экран (рваные края + шум Перлина остаются).
- **Дыры в тумане — только святилища:** в `redrawFog` hole считается не от игрока, а от экранных проекций святилищ (мировые «прогалины света»).
- **Деревня = тумана нет:** волна не стартует в деревне; если забежал в деревню посреди волны — туман и призраки гаснут за ~2с («спрятался у очага»).

### 3.2 Ритм волн
- Длительность **40с**, интервал **80–110с** (−4с за руну, минимум 60с) — волна становится событием, между волнами успеваешь жить.
- **Телеграф 4с:** рог + тост «Ветер стихает...» + в `fx` — 2–3 пары светящихся глаз по кромке тумана до спавна.
- Подземелья и пост-Змей — без тумана (как сейчас).

### 3.3 Призраки (новый враг `ghost`)
- Спавн **2 + ⌊руны/2⌋, макс 4**; появление: alpha 0→0.85 за 1.5с; уход: alpha→0 за 2с и удаление.
- Поведение агрессивнее ворона: короче орбита, чаще дайв (×2.2), **проходят сквозь стены**, не нужен LOS.
- При касании вешают игроку **slow 0.8с** — «липнут», но между дайвами есть окно дышать.
- **Сейвзоны:** не входят в деревни и в радиус 56px вокруг святилищ; у святилища деагрятся и дрейфуют на кромке.
- **Иммунитет:** без освящения меч/секира/лук дают 0 урона + флоат «Не пробивает» (троттлинг 0.8с).
- **Лут:** при рассеивании волны каждый призрак с шансом 50% оставляет **Туманную Росу** на земле (собирается без убийства). После освящения: убийство = роса 100% + шанс осколка/сердца.

### 3.4 Роса → Шаман (прогрессия)
- Новый дроп `dew` (светящаяся капля).
- Квест шамана **«Голоса тумана»** (открывается после первой пережитой волны): принести **3 росы** → флаг `ghostBane` «Освящение клинка»: всё оружие бьёт призраков. Петля: пережил волну → собрал росу → получил оружие → фармишь призраков.

### 3.5 Туман у Алтаря Змея
- Пока `!snakeStarted`: вокруг `treeAltar` постоянный **тихий туман** (радиус ~350, без сжатия) + 1–2 призрака на привязи (не преследуют дальше 260px от алтаря). Финальная зона защищена саваном; подход с 5 рунами = испытание.

### 3.6 Было → стало

| Параметр | Сейчас | Станет |
|---|---|---|
| Окно тумана | вокруг игрока | нет; дыры только у святилищ |
| Длительность волны | 13с | 40с |
| Интервал | 22–50с | 60–110с |
| Враги волны | frost/draugr | призраки (2–4), приходят и уходят с туманом |
| Сейвзоны | нет | деревни (туман гаснет) + святилища (не атакуют) |
| Телеграф | только тост | рог + глаза в тумане за 4с |
| Награда | нет | Туманная Роса → освящение у шамана |
| У алтаря | нет тумана | постоянный тихий туман + призраки на привязи |

## 4. Почему это хорошо

- Туман получает **идентичность события**: накатывает со всех сторон, виден, слышен и телеграфирован.
- **Риск/награда:** волна = источник росы = путь к освящению, а не налог на время.
- **Ритм:** 40с страха / 60–110с покоя; деревня и святилища становятся осмысленными укрытиями («свет против тьмы»).
- **Контрплей без пыток:** иммунитет компенсируется телеграфом, сейвзонами, кулдаунами дайвов и фиксированной длительностью волны.
- **Атмосфера финала:** саван у Древа до вызова Змея делает барьер из 5 рун драматичным.

## 5. План по файлам (кодим после апрува)

- `world.ts`: `EnemyKind += "ghost"`, `DropKind += "dew"`.
- `entities.ts`: рендер призрака (поле `fade` для alpha), статы, рендер росы.
- `engine.ts`: переписанный `updateFog` (таймеры, деревня/святилища, спавн/десспавн призраков, роса, тихий туман у алтаря); ИИ призрака в `updateEnemies` (флайер, сейвзоны, slow); иммунитет в `hitEnemy`/снарядах; квест `s_ghost` + диалог шамана + `ghostBane`.
- `fx.ts`: `redrawFog` без дыры игрока, дыры по святилищам; телеграф-глаза.


Принято. Ниже — пошаговый план реализации «Тумана 2.0» по файлам, с готовым кодом для каждого шага. Порядок важен: сначала типы → рендер → логика → fx.

---

## ШАГ 1 — `world.ts`: типы

Добавляем `ghost` и `dew` в юнионы (одна строка каждая):

```typescript
export type EnemyKind = "draugr" | "varg" | "raven" | "shroom" | "crawler" | "frost"
  | "reaper" | "spider" | "giant" | "snake" | "ghost";

export type DropKind = "heart" | "arrows" | "axe" | "sword" | "bear" | "hammer" | "bow"
  | "horn" | "mead" | "ore" | "moss" | "amber" | "flower" | "diary" | "bundle"
  | "relic" | "shard" | "bones" | "rune" | "dew";
```

---

## ШАГ 2 — `entities.ts`: рендер призрака и росы

**2.1.** В `IEnemyData` и `Enemy` добавляем поля:

```typescript
// в IEnemyData и Enemy:
fade: number;          // 0..0.85 — прозрачность призрака
leash: Vec | null;     // привязь к алтарю (ambient-туман)
dropDew: boolean;      // оставить росу при рассеивании
```

**2.2.** В `ENEMY_STATS`:

```typescript
ghost: { r: 6, hp: 5, speed: 100, dmg: 1 },
```

**2.3.** В `makeEnemy` добавляем инициализацию:

```typescript
fade: kind === "ghost" ? 0 : 1,
leash: null,
dropDew: false,
```

**2.4.** В `renderEnemy` заменяем строку альфы и добавляем кейс:

```typescript
const a = (e.hidden ? 0.25 : 1) * e.fade;   // было: e.hidden ? 0.25 : 1
```

```typescript
case "ghost": {
  const float = Math.sin(time * 2.2 + e.seed) * 2;
  const aggr = e.aggro && e.state !== "dissipate";
  const BODY = 0xcfdce8, HI = 0xeef6fc, DK = 0x9fb4c8;
  g.ellipse(0, 8, 6, 2).fill({ color: 0x05080d, alpha: 0.3 * a });
  // капюшон + голова
  P(g, -2, -12 + float, 4, 1, HI, a);
  P(g, -3, -11 + float, 6, 1, BODY, a);
  P(g, -4, -10 + float, 8, 2, BODY, a);
  // тело с гранями
  P(g, -4, -8 + float, 8, 7, BODY, a);
  P(g, -4, -8 + float, 1, 7, HI, a);
  P(g, 3, -8 + float, 1, 7, DK, a);
  // лицо
  P(g, -2, -9 + float, 4, 3, 0x0d1a24, a);
  const eye = aggr ? 0xe05050 : 0x6a8aa4;
  P(g, -2, -8 + float, 1, 1, eye, a);
  P(g, 1, -8 + float, 1, 1, eye, a);
  if (aggr) P(g, -1, -7 + float, 2, 1, 0x0d1a24, a); // пасть
  // руки
  P(g, -5, -6 + float, 1, 3, BODY, a);
  P(g, 4, -6 + float, 1, 3, BODY, a);
  // рваный низ
  P(g, -4, -1 + float, 2, 2, DK, a);
  P(g, -1, -1 + float, 2, 3, DK, a);
  P(g, 2, -1 + float, 2, 2, DK, a);
  P(g, -1, 2 + float, 2, 1, DK, a * 0.7);
  break;
}
```

**2.5.** В `renderDrop` добавляем:

```typescript
case "dew": {
  const pulse = 0.7 + Math.sin(time * 4 + data.t) * 0.3;
  g.circle(0, -2 + bob, 5).stroke({ color: 0x8fd8e8, width: 1, alpha: pulse * 0.4 });
  P(g, -1, -4 + bob, 2, 3, 0x8fd8e8, pulse);
  P(g, -1, -1 + bob, 2, 1, 0xbdeef8, pulse);
  P(g, 0, -5 + bob, 1, 1, 0xbdeef8, pulse);
  break;
}
```

---

## ШАГ 3 — `engine.ts`: логика

**3.1. Флаги и поля** (в `flags` и в сброс `startGame`):

```typescript
// в flags:
ghostBane: false, dew: 0, fogWaves: 0,
// в startGame после f.snakeDead = false:
f.ghostBane = false; f.dew = 0; f.fogWaves = 0;
this.fogTimer = 60; this.fogAmbient = false;
```

Новые поля класса:

```typescript
private fogAmbient = false;
private ghostClangT = 0;
```

**3.2. Призрак — «флайер»** (проходит сквозь стены). В `spawnEnemy` и в `stepPhysics` добавляем `"ghost"` в условие флайеров:

```typescript
if (kind === "raven" || kind === "snake" || kind === "spider" || kind === "ghost") this.farBody(e.body);
// и в stepPhysics:
if (en.dead || en.kind === "raven" || en.kind === "snake" || en.kind === "spider" || en.kind === "ghost") { ...farBody...; continue; }
```

**3.3. Полный rewrite `updateFog`** + два хелпера:

```typescript
private fogHoles(): Vec[] {
  if (!this.map || this.map.isDungeon) return [];
  return this.map.shrines.map((s) => ({ x: s.x * T + 8, y: s.y * T + 8 }));
}

private ensureFogGhosts(n: number, leashed: boolean) {
  const f = this.flags, p = this.player, m = this.map;
  const alive = this.enemies.filter((e) => !e.dead && e.kind === "ghost").length;
  const cx = leashed ? m.treeAltar.x * T + 8 : p.x;
  const cy = leashed ? m.treeAltar.y * T + 8 : p.y;
  for (let i = alive; i < Math.min(4, n); i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 110 + Math.random() * 60;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (x < T || y < T || x > (m.W - 1) * T || y > (m.H - 1) * T) continue;
    const e = this.spawnEnemy("ghost", x, y);
    e.aggro = true; e.state = "hover"; e.stateT = 0.5 + Math.random();
    if (leashed) e.leash = { x: cx, y: cy };
    this.fx.burst(x, y, 0x8fd8e8, 10, 60, 0.7, 2, 0);
  }
}

private endFogWave(dropDew: boolean) {
  for (const e of this.enemies) {
    if (e.kind === "ghost" && !e.dead && e.state !== "dissipate") {
      e.state = "dissipate"; e.aggro = false;
      e.dropDew = dropDew && Math.random() < 0.5;
    }
  }
  this.fogActive = false; this.fogWarned = false; this.fogAmbient = false;
  this.fogTimer = Math.max(60, 80 - this.flags.runes * 4 + Math.random() * 30);
  this.flags.fogWaves++;
  if (this.flags.fogWaves === 1 && this.flags.shamanDone) this.revealQuest("s_ghost");
  audio.setFog(false);
  this.toast("Туман рассеялся");
}

private updateFog(dt: number, rdt: number) {
  const f = this.flags, p = this.player;
  this.ghostClangT = Math.max(0, this.ghostClangT - dt);
  if (this.map.isDungeon || f.snakeDead) {
    this.fogRadius += (2600 - this.fogRadius) * Math.min(1, rdt * 0.8);
    if (this.fogActive) this.endFogWave(false);
    return;
  }
  const zn = zoneFor(this.map, Math.floor(p.x / T), Math.floor(p.y / T));
  const inVillage = zn === "Поселение выживших" || zn === "Воронья Гавань";
  const ax = this.map.treeAltar.x * T + 8, ay = this.map.treeAltar.y * T + 8;
  const nearAltar = !f.snakeStarted && dist2(p.x, p.y, ax, ay) < 240 * 240;

  // Деревня = сейвзона: туман гаснет, призраки рассеиваются
  if (inVillage) {
    if (this.fogActive) this.endFogWave(true);
    this.fogRadius += (2600 - this.fogRadius) * Math.min(1, rdt * 0.8);
    return;
  }
  // Ambient-туман у статуи Змея — всегда, пока не вызван
  if (nearAltar) {
    if (!this.fogActive) {
      this.fogActive = true; this.fogAmbient = true;
      audio.setFog(true); this.toast("Саван Древа... оно не отпустит просто так");
    }
    this.fogAmbient = true;
    this.fogRadius += (350 - this.fogRadius) * Math.min(1, rdt * 0.6);
    this.ensureFogGhosts(2, true);
    return;
  }
  if (this.fogAmbient) this.endFogWave(true); // ушёл от статуи

  if (!this.fogActive) {
    this.fogTimer -= dt;
    this.fogRadius += (2600 - this.fogRadius) * Math.min(1, rdt * 0.8);
    if (!this.fogWarned && this.fogTimer < 4 && this.fogTimer > 0 && f.hasSword) {
      this.fogWarned = true;
      audio.setFog(true); audio.horn();
      this.toast("Ветер стихает... Туман близко");
    }
    if (this.fogTimer <= 0 && f.hasSword) {
      this.fogActive = true;
      this.fogLeft = 40;                 // было 13
      this.fogSpawned = false;
      this.fogRadius = 900;
      audio.setFog(true);
      this.toast("ВОЛНА ТУМАНА. Ниды шепчут...");
    }
  } else {
    this.fogLeft -= dt;
    this.fogRadius += (140 - this.fogRadius) * Math.min(1, rdt * 0.35);
    if (!this.fogSpawned && this.fogLeft < 38) {
      this.fogSpawned = true;
      this.ensureFogGhosts(2 + Math.floor(f.runes / 2), false); // 2..4
    }
    if (this.fogLeft <= 0) this.endFogWave(true);
  }
}
```

**3.4. ИИ призрака** — в `updateEnemies`:

- в общие строки: `const aggroR = e.kind === "raven" ? 150 : e.kind === "crawler" ? 42 : e.kind === "ghost" ? 160 : 100;` и `const isFlyer = e.kind === "raven" || e.kind === "ghost";`
- в контактный блок: `if (e.kind === "ghost") p.slowT = 0.8;`
- новый кейс в `switch`:

```typescript
case "ghost": {
  if (e.state === "dissipate") {
    e.fade = Math.max(0, e.fade - dt / 2);
    e.vx = Math.sin(e.t * 1.3 + e.seed) * 12; e.vy = -14;
    if (e.fade <= 0) {
      if (e.dropDew) this.spawnDrop("dew", e.x, e.y);
      e.dead = true; this.farBody(e.body);
    }
    break;
  }
  if (e.fade < 0.85) e.fade = Math.min(0.85, e.fade + dt / 1.5);
  if (inVillage) e.aggro = false;
  // святилища отталкивают
  let repX = 0, repY = 0;
  for (const s of this.shrines) {
    const sd2 = dist2(e.x, e.y, s.x, s.y);
    if (sd2 < 64 * 64) {
      e.aggro = false;
      const sd = Math.sqrt(sd2) || 1;
      repX = ((e.x - s.x) / sd) * 70; repY = ((e.y - s.y) / sd) * 70;
    }
  }
  if (repX || repY) { e.vx = repX; e.vy = repY; break; }
  // привязь у алтаря
  if (e.leash && dist2(e.x, e.y, e.leash.x, e.leash.y) > 260 * 260) {
    e.aggro = false;
    const ld = Math.hypot(e.leash.x - e.x, e.leash.y - e.y) || 1;
    e.vx = ((e.leash.x - e.x) / ld) * e.speed; e.vy = ((e.leash.y - e.y) / ld) * e.speed;
    break;
  }
  if (e.aggro) {
    if (e.state !== "dive") {
      e.stateT -= dt;
      const orbit = 26 + Math.sin(e.t * 2 + e.seed) * 6;
      const tang = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
      const radial = d > orbit ? 1 : -0.6;
      e.vx = Math.cos(tang) * e.speed * 0.9 + ((p.x - e.x) / (d || 1)) * e.speed * 0.6 * radial;
      e.vy = Math.sin(tang) * e.speed * 0.9 + ((p.y - e.y) / (d || 1)) * e.speed * 0.6 * radial;
      if (d < 60 && e.stateT <= 0) {
        e.state = "dive"; e.stateT = 0.6;
        e.facing = { x: (p.x - e.x) / (d || 1), y: (p.y - e.y) / (d || 1) };
        audio.swing();
      }
    } else {
      e.stateT -= dt;
      e.vx = e.facing.x * e.speed * 2.4; e.vy = e.facing.y * e.speed * 2.4;
      if (e.stateT <= 0) { e.state = "hover"; e.stateT = 0.9; }
    }
  } else {
    e.vx = Math.sin(e.t * 1.1 + e.seed) * 26;
    e.vy = Math.cos(e.t * 0.8 + e.seed) * 20 - 6;
  }
  if (e.vx !== 0) e.facing = { x: e.vx >= 0 ? 1 : -1, y: 0 };
  break;
}
```

**3.5. Иммунитет без освящения.** В начало `hitEnemy` (до щита драугра):

```typescript
if (e.kind === "ghost" && !this.flags.ghostBane) {
  if (this.ghostClangT <= 0) {
    this.ghostClangT = 0.8;
    audio.clang();
    this.float(e.x, e.y - 10, "Не пробивает", 0x8fd8e8);
  }
  return;
}
```

В цикле попадания стрел/секиры (`updateProjectiles`, перед `if (pr.kind === "axe")`):

```typescript
if (e.kind === "ghost" && !this.flags.ghostBane) {
  if (this.ghostClangT <= 0) {
    this.ghostClangT = 0.8; audio.clang();
    this.float(e.x, e.y - 10, "Не пробивает", 0x8fd8e8);
  }
  consumed = true; break;
}
```

**3.6. Лут призрака** — в `killEnemy` перед общим роллом:

```typescript
if (e.kind === "ghost") {
  this.spawnDrop("dew", e.x, e.y);                       // 100% с освящением
  if (Math.random() < 0.35) this.spawnDrop(Math.random() < 0.5 ? "shard" : "heart", e.x, e.y);
  return;
}
```

**3.7. Роса** — в `collectDrop`:

```typescript
case "dew":
  f.dew++;
  audio.pickup();
  this.float(p.x, p.y - 10, `Туманная Роса ${f.dew}/3`, 0x8fd8e8);
  if (f.dew >= 3) this.revealQuest("s_ghost");
  break;
```

**3.8. Квест «Голоса тумана»:**

```typescript
// questDefs:
{ id: "s_ghost", title: "Голоса тумана", main: false },
// questDesc:
case "s_ghost": {
  if (f.ghostBane) return { desc: "Клинок освящён — сталь бьёт призраков", done: true };
  if (f.dew >= 3) return { desc: "Отнеси Шаману 3 Туманной Росы", done: false };
  return { desc: `Переживи волну и собери Росу (${f.dew}/3)`, done: false };
}
// trackedTarget:
case "s_ghost": {
  if (m.isDungeon || f.ghostBane) return null;
  if (f.dew >= 3) return npcSpot("shaman");
  return null;
}
```

**3.9. Шаман** — три правки:

```typescript
// npcSig, case "shaman":
if (f.dew >= 3 && !f.ghostBane) return "ret";
// dialogueFor, case "shaman" — ПЕРВАЯ ветка:
if (f.dew >= 3 && !f.ghostBane) return { id, name: "Шаман Ульв", lines: [
  "Ты собрал Росу тумана. Она холодит ладони, как пальцы мертвеца.",
  "Дай мне три капли — и я закалю твою сталь в отваре духов.",
  "Тогда туман перестанет быть стеной между тобой и ими.",
] };
// advanceDialogue, добавить отдельным if:
if (last === "shaman" && f.dew >= 3 && !f.ghostBane) {
  f.dew -= 3; f.ghostBane = true;
  audio.rune();
  this.toast("Освящённый клинок: сталь бьёт призраков");
  this.fx.burst(p.x, p.y, 0x8fd8e8, 20, 100, 1.0, 2, -10);
  this.pushHud(true);
}
```

**3.10. Вызов fx в `tick`** — заменяем строку тумана и добавляем глаза:

```typescript
this.fx.updateFog(rdt, this.fogRadius, this.fogActive, this.map?.isDungeon ?? false,
  this.player.x, this.player.y, this.cam.x, this.cam.y, this.viewW, this.viewH, this.fogHoles());
this.fx.drawFogRunes(fx, this.fogRadius, this.viewW, this.viewH);
this.fx.drawFogEyes(fx, this.fogWarned && !this.fogActive, this.realT, this.viewW, this.viewH);
```

---

## ШАГ 4 — `fx.ts`: туман без окна + дыры у святилищ + глаза

**4.1.** Новая сигнатура `updateFog` (+ `holes`) и полный rewrite `redrawFog`:

```typescript
public updateFog(rdt: number, fogRadius: number, fogActive: boolean, isDungeon: boolean,
  playerX: number, playerY: number, camX: number, camY: number,
  viewW: number, viewH: number, holes: { x: number; y: number }[]) {
  this.redrawFog(rdt, fogRadius, camX, camY, viewW, viewH, holes);
}

public redrawFog(rdt: number, fogRadius: number, camX: number, camY: number,
  viewW: number, viewH: number, holes: { x: number; y: number }[]) {
  if (!this.fogCanvas || !this.fogCtx || !this.fogVignette) return;
  const active = fogRadius < 2300;
  this.fogVignette.visible = active;
  if (!active) return;
  this.fogNoiseT += rdt;
  const cw = this.fogCanvas.width, ch = this.fogCanvas.height;
  const ctx = this.fogCtx;
  const maxCanvas = Math.max(cw, ch);
  const fogK = clamp(1 - fogRadius / 2300, 0, 1);
  ctx.clearRect(0, 0, cw, ch);
  // 1. Туман НА ВЕСЬ экран — окна над игроком больше нет
  const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.2, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  g.addColorStop(0, `rgba(110,122,138,${(0.30 + 0.25 * fogK).toFixed(3)})`);
  g.addColorStop(1, `rgba(78,88,104,${(0.55 + 0.40 * fogK).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  // 2. Дрейфующие клочья
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + this.fogNoiseT * 0.05;
    const rr = maxCanvas * (0.25 + 0.3 * Math.abs(this.fogWaveNoise(a * 1.7 + 3.1, this.fogNoiseT * 0.7)));
    const bx = cw / 2 + Math.cos(a) * rr, by = ch / 2 + Math.sin(a) * rr;
    const blobR = maxCanvas * (0.08 + 0.08 * Math.abs(this.fogWaveNoise(a * 2.3, this.fogNoiseT * 0.6)));
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(1, blobR));
    bg.addColorStop(0, `rgba(96,108,124,${(0.22 * fogK + 0.08).toFixed(3)})`);
    bg.addColorStop(1, "rgba(96,108,124,0)");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(bx, by, Math.max(1, blobR), 0, Math.PI * 2); ctx.fill();
  }
  // 3. Шум Перлина по всему экрану
  if (this.noiseCanvas) {
    if (!this.fogMaskCanvas) { this.fogMaskCanvas = document.createElement("canvas"); this.fogMaskCtx = this.fogMaskCanvas.getContext("2d")!; }
    if (this.fogMaskCanvas.width !== cw) this.fogMaskCanvas.width = cw;
    if (this.fogMaskCanvas.height !== ch) this.fogMaskCanvas.height = ch;
    const mc = this.fogMaskCtx!;
    mc.globalCompositeOperation = "source-over";
    mc.clearRect(0, 0, cw, ch);
    mc.drawImage(this.noiseCanvas, 0, 0, cw, ch);
    ctx.globalAlpha = 0.2 + 0.3 * fogK;
    ctx.drawImage(this.fogMaskCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }
  // 4. ДЫРЫ ТОЛЬКО У СВЯТИЛИЩ (мировые координаты → экранные)
  ctx.globalCompositeOperation = "destination-out";
  for (const h of holes) {
    const hx = (h.x - camX + viewW * 0.05) * (cw / (viewW * 1.1));
    const hy = (h.y - camY + viewH * 0.05) * (ch / (viewH * 1.1));
    if (hx < -80 || hy < -80 || hx > cw + 80 || hy > ch + 80) continue;
    const hr = maxCanvas * 0.16;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    hg.addColorStop(0, "rgba(0,0,0,1)");
    hg.addColorStop(0.7, "rgba(0,0,0,0.8)");
    hg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  if (this.fogTex && this.fogRT && this.app) {
    this.fogTex.source.update();
    if (!this.fogCopySpr) this.fogCopySpr = new Sprite(this.fogTex);
    else this.fogCopySpr.texture = this.fogTex;
    this.app.renderer.render({ container: this.fogCopySpr, target: this.fogRT, clear: true });
  }
}
```

**4.2.** Телеграф-глаза (новый метод):

```typescript
public drawFogEyes(fx: Graphics, warn: boolean, realT: number, viewW: number, viewH: number) {
  if (!warn) return;
  for (let i = 0; i < 3; i++) {
    if (Math.floor(realT * 2 + i) % 3 === 0) continue; // моргание
    const sx = ((i + 0.5) / 3) * viewW + Math.sin(realT * 0.7 + i * 2.4) * 30;
    const sy = viewH * (0.18 + 0.25 * ((i * 37) % 3) / 3) + Math.cos(realT * 0.9 + i) * 12;
    fx.rect(sx, sy, 2, 1).fill({ color: 0xbdeef8, alpha: 0.5 });
    fx.rect(sx + 4, sy, 2, 1).fill({ color: 0xbdeef8, alpha: 0.5 });
  }
}
```

---

## ШАГ 5 — сверка с дизайном (чек-лист)

| Требование | Где закрыто |
|---|---|
| Нет окна над игроком, туман везде | `redrawFog` п.1 |
| Дыры только у святилищ | `redrawFog` п.4 + `fogHoles()` |
| Деревня: не стартует / гаснет | `updateFog` inVillage |
| У статуи — всегда до вызова Змея | `nearAltar` + `ensureFogGhosts(2, true)` |
| Длительность 40с, интервал 60–110с | `fogLeft = 40`, `endFogWave` |
| Телеграф: рог + глаза | warn-блок + `drawFogEyes` |
| Призраки 2–4, агрессивнее ворона, сквозь стены | `ensureFogGhosts`, кейс `"ghost"`, флайер |
| Fade in 1.5с / out 2с | `e.fade` в ИИ |
| Не входят в деревни/святилища | inVillage + отталкивание |
| Иммунитет + «Не пробивает» | `hitEnemy` + снаряды |
| Роса: 50% при рассеивании, 100% с освящением | `endFogWave`/`dropDew`, `killEnemy` |
| Квест шамана → освящение | `s_ghost` + диалог + `advanceDialogue` |
| Slow при касании | контактный блок |

Готов кодить следующие правки по факту плейтеста (баланс орбиты/дайва, радиусы дыр у святилищ) — скажи, когда проверишь.
