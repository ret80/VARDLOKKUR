/* engine.ts – Полностью переработанный движок с рендерерами из entities.ts */

import { Application, Container, Graphics, Sprite, Texture, Text } from "pixi.js";
import { System as PhysSystem, Circle as PhysCircle, Vector as PhysVector } from "kinetics.ts";
import {
  T, Tl, WorldData, Vec, DropKind,
  generateOverworld, generateDungeon, solidTileAt, tileAt, zoneFor, DUNGEONS,
} from "./world";
import {
  Player, Enemy, Projectile, Drop,
  makeEnemy,
} from "./entities";
import { audio } from "./audio";

// Новые импорты из entities.ts (рендереры и интерфейсы данных)
import {
  IPlayerData, IEnemyData, INpcData, IDropData, IProjectileData,
  IChestData, IPedestalData, IShrineData, IDoorData, IBarrierData, IAltarData,
  IPlayerExtra,
  PlayerRenderer, EnemyRenderer, NpcRenderer, DropRenderer, ProjectileRenderer,
  ChestRenderer, PedestalRenderer, ShrineRenderer, DoorRenderer, BarrierRenderer, AltarRenderer
} from "./entities";

export type Screen = "title" | "play" | "pause" | "death" | "victory" | "quests" | "inventory" | "map";

export interface QuestView {
  id: string; title: string; desc: string; main: boolean; done: boolean; tracked: boolean;
}
export interface HudData {
  hp: number; maxHp: number; arrows: number; runes: number;
  hasSword: boolean; hasAxe: boolean; hasBow: boolean; hasHammer: boolean; hasKey: boolean; bear: boolean;
  swordUp: boolean; axeUp: boolean; furyRune: boolean; secretKnown: boolean; nornsFavor: boolean;
  hearts: number;
  zone: string; objective: string;
  time: string; kills: number; deaths: number; muted: boolean;
  quests: QuestView[]; trackedId: string;
}
export interface DialogueData { id: string; name: string; lines: string[] }
export interface Stats { time: string; kills: number; deaths: number; runes: number }
export interface EngineCallbacks {
  onHud: (h: HudData) => void;
  onScreen: (s: Screen) => void;
  onDialogue: (d: DialogueData | null) => void;
  onToast: (msg: string) => void;
  onStats: (s: Stats) => void;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: number; grav: number; alpha: number }
interface FloatText { txt: Text; life: number }
interface SlamZone { x: number; y: number; r: number; t: number; boom: boolean }
interface ChestRt { x: number; y: number; item: string; opened: boolean; g: Graphics }
interface PedestalRt { x: number; y: number; taken: boolean; guardsLeft: number; guardsSpawned: boolean; g: Graphics }
interface ShrineRt { x: number; y: number; g: Graphics }
interface NpcRt { id: string; name: string; x: number; y: number; g: Graphics }
interface DoorRt { x: number; y: number; open: number; locked: boolean; g: Graphics }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist2 = (ax: number, ay: number, bx: number, by: number) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const ZOOM = 1.18;

const TILE_COLORS: Record<number, string> = {
  [Tl.WATER]: "#0a1620", [Tl.SHORE]: "#4a5a64", [Tl.SNOW]: "#8b98a6", [Tl.SNOW2]: "#7e8b99",
  [Tl.PATH]: "#55636e", [Tl.FOREST]: "#26333c", [Tl.TREE]: "#1c262e", [Tl.ROCK]: "#515d6a",
  [Tl.MTN]: "#5f6b78", [Tl.SWAMP]: "#2c3a3e", [Tl.POOL]: "#1b2a30", [Tl.VILLAGE]: "#635a4c",
  [Tl.PALISADE]: "#463626", [Tl.HOUSE]: "#3a322c", [Tl.RUINS]: "#4e5a68", [Tl.COLUMN]: "#5a6570",
  [Tl.CAVE]: "#2b3646", [Tl.CAVEWALL]: "#1a222c", [Tl.STAIRS]: "#39424e", [Tl.DFLOOR]: "#39424e",
  [Tl.DWALL]: "#10151c", [Tl.ALTAR]: "#39424e",
};

export class Engine {
  private cbs: EngineCallbacks;
  private container: HTMLElement;
  private app!: Application;
  private ready: Promise<void>;

  // слои
  private world = new Container();
  private dynamic = new Container();
  private fxWorld = new Container();
  private floatLayer = new Container();
  private groundSpr: Sprite | null = null;
  private wallTiles: (Graphics | Sprite)[] = [];
  private fxScreen = new Graphics();
  private fogSpr: Sprite | null = null;
  private vignette: Sprite | null = null;
  private fadeG = new Graphics();
  private particleG = new Graphics();
  private canvasEl: HTMLCanvasElement | null = null;

  // вьюпорт
  private viewW = 480;
  private viewH = 270;

  // мир
  private ow!: WorldData;
  private dungeons: WorldData[] = [];
  private map!: WorldData;
  private phys!: PhysSystem;
  private playerBody!: PhysCircle;

  // сущности
  private player: Player = { x: 0, y: 0, vx: 0, vy: 0, r: 5, hp: 12, maxHp: 12, dir: { x: 0, y: 1 }, moving: false, animT: 0, swingT: 0, hurtT: 0, slowT: 0 };
  private playerG = new Graphics();
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private drops: Drop[] = [];
  private chests: ChestRt[] = [];
  private pedestals: PedestalRt[] = [];
  private shrines: ShrineRt[] = [];
  private npcs: NpcRt[] = [];
  private doors: DoorRt[] = [];
  private barrier: { x: number; y: number; active: boolean; g: Graphics } | null = null;
  private altar: { x: number; y: number; g: Graphics } | null = null;
  private bossRef: Enemy | null = null;
  private slamZones: SlamZone[] = [];
  private axeProj: Projectile | null = null;
  private axeState: "ready" | "out" = "ready";
  private takenAmbient = new Set<number>();
  private roofSnow = true;
  private houseSprites: { spr: Sprite; hw: number; hh: number; v: number; ruined: boolean }[] = [];

  /** Вкл/выкл снег на крышах домов (можно вызывать из UI). */
  setRoofSnow(on: boolean) {
    if (this.roofSnow === on) return;
    this.roofSnow = on;
    for (const h of this.houseSprites) h.spr.texture = this.houseTexture(h.hw, h.hh, h.v, h.ruined);
    audio.uiClick();
  }

  // состояние
  screen: Screen = "title";
  private flags = {
    hasSword: false, hasAxe: false, hasBow: false, hasHammer: false, hasKey: false,
    swordUp: false, axeUp: false, furyRune: false, nornsFavor: false, hearts: 2,
    arrows: 12, runes: 0, bear: false, bearGone: false,
    horn: false, hornDone: false, mead: false, meadDone: false, ore: false, oreDone: false,
    moss: false, amber: false, flower: false, shamanDone: false,
    diary: false, refugeeDone: false, secretKnown: false,
    bundle: false, merchantDone: false, relic: false, atoneDone: false, cullDone: false,
    killsByKind: {} as Record<string, number>,
    reaperDead: false, spiderDead: false, giantDead: false,
    snakeStarted: false, snakeDead: false,
    kills: 0, deaths: 0, shrineIdx: -1, shrineQuestDone: false, huntDone: false,
  };
  private openedChests = new Set<string>();
  private dialogueActive = false;
  private lastDialogueId = "";
  private talkCount = 0;
  private talkedSig = new Map<string, string>();
  private revealed = new Set<string>();
  private trackedQuest = "m1";
  private lastMain = "m1";
  private visitedShrines = new Set<number>();
  private takenPedestals = new Set<number>();
  private arrowA = -Math.PI / 2;
  private starting = false;

  // время/эффекты
  private realT = 0;
  private playTime = 0;
  private timeScale = 1;
  private tsTarget = 1;
  private hitstop = 0;
  private shake = 0;
  private fadeA = 0;
  private fadeTarget = 0;
  private deathT = 0;
  private zone = "";
  private stepT = 0;
  private hudTimer = 0;
  private mmTimer = 0;
  private lastMmKey = "";
  private cam = { x: 0, y: 0 };

  // туман
  private fogTimer = 42;
  private fogActive = false;
  private fogLeft = 0;
  private fogRadius = 2600;
  private fogSpawned = false;
  private fogWarned = false;

  // ввод
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private virt = { x: 0, y: 0, atk: false, axe: false, bow: false, act: false };
  private prevVirt = { atk: false, axe: false, act: false, bow: false };
  private bowHeld = false;
  private onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onResize = () => this.applyView();

  private minimap: HTMLCanvasElement | null = null;
  private mmBase: ImageData | null = null;
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private snow: { x: number; y: number; s: number; d: number; w: number }[] = [];
  private wallTexCache = new Map<string, Texture>();

  // Рендереры (все в одном объекте)
  private renderers = {
    player: new PlayerRenderer(),
    enemy: new EnemyRenderer(),
    npc: new NpcRenderer(),
    drop: new DropRenderer(),
    projectile: new ProjectileRenderer(),
    chest: new ChestRenderer(),
    pedestal: new PedestalRenderer(),
    shrine: new ShrineRenderer(),
    door: new DoorRenderer(),
    barrier: new BarrierRenderer(),
    altar: new AltarRenderer(),
  };

  constructor(container: HTMLElement, cbs: EngineCallbacks) {
    this.container = container;
    this.cbs = cbs;
    this.ready = this.init(container);
  }

  /* ================= инициализация ================= */
  private async init(container: HTMLElement) {
    const app = new Application();
    this.applyViewSize();
    await app.init({
      background: 0x05080d, antialias: false, resolution: 1,
      width: this.viewW, height: this.viewH,
    });
    this.app = app;
    const cv = app.canvas as HTMLCanvasElement;
    cv.classList.add("pixi");
    cv.style.position = "absolute";
    cv.style.inset = "0";
    cv.style.width = "100%";
    cv.style.height = "100%";
    container.appendChild(cv);
    this.canvasEl = cv;
    this.applyViewSize();
    app.renderer.resize(this.viewW, this.viewH);

    this.world.sortableChildren = true;
    this.dynamic.sortableChildren = true;
    this.fxWorld.addChild(this.particleG);
    this.world.addChild(this.dynamic);
    this.world.addChild(this.fxWorld);
    this.world.addChild(this.floatLayer);
    app.stage.addChild(this.world);

    // туман-мгла
    const fc = document.createElement("canvas");
    fc.width = 512; fc.height = 512;
    const fctx = fc.getContext("2d")!;
    const fg = fctx.createRadialGradient(256, 256, 96, 256, 256, 256);
    fg.addColorStop(0, "rgba(10,16,22,0)");
    fg.addColorStop(0.55, "rgba(10,16,22,0.55)");
    fg.addColorStop(1, "rgba(8,12,18,0.94)");
    fctx.fillStyle = fg; fctx.fillRect(0, 0, 512, 512);
    this.fogSpr = new Sprite(Texture.from(fc));
    this.fogSpr.anchor.set(0.5);
    this.fogSpr.visible = false;
    app.stage.addChild(this.fogSpr);

    app.stage.addChild(this.fxScreen);
    this.buildVignette();
    if (this.vignette) app.stage.addChild(this.vignette);
    app.stage.addChild(this.fadeG);

    for (let i = 0; i < 130; i++) {
      this.snow.push({ x: Math.random() * 640, y: Math.random() * 560, s: 14 + Math.random() * 26, d: Math.random() * 6, w: Math.random() < 0.3 ? 2 : 1 });
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);

    this.phys = new PhysSystem({
      tickRate: 60, friction: 0,
      collisionInfo: { cellSize: 4 }, useRAF: false,
    } as any);

    app.ticker.maxFPS = 60;
    app.ticker.add((tk) => this.tick(Math.min(tk.deltaMS / 1000, 0.05)));
  }

  private applyViewSize() {
    const cw = Math.max(1, this.container.clientWidth || window.innerWidth);
    const ch = Math.max(1, this.container.clientHeight || window.innerHeight);
    const aspect = cw / ch;
    let vw: number, vh: number;
    if (aspect >= 1) {
      vh = Math.round(270 / ZOOM);
      vw = Math.round(vh * aspect);
      if (vw > 760) { vw = 760; vh = Math.round(vw / aspect); }
    } else {
      vw = Math.round(235 / ZOOM);
      vh = Math.round(vw / aspect);
      if (vh > 760) { vh = 760; vw = Math.round(vh * aspect); }
    }
    this.viewW = Math.max(120, vw); this.viewH = Math.max(120, vh);
  }

  private applyView() {
    const ow = this.viewW, oh = this.viewH;
    this.applyViewSize();
    if ((this.viewW !== ow || this.viewH !== oh) && this.app) {
      this.app.renderer.resize(this.viewW, this.viewH);
      this.buildVignette();
    }
  }

  private buildVignette() {
    const vc = document.createElement("canvas");
    vc.width = this.viewW; vc.height = this.viewH;
    const vx = vc.getContext("2d")!;
    const grad = vx.createRadialGradient(this.viewW / 2, this.viewH / 2, this.viewH * 0.36, this.viewW / 2, this.viewH / 2, this.viewH * 0.8);
    grad.addColorStop(0, "rgba(5,8,13,0)");
    grad.addColorStop(1, "rgba(4,6,10,0.66)");
    vx.fillStyle = grad; vx.fillRect(0, 0, this.viewW, this.viewH);
    if (this.vignette) { this.vignette.texture.destroy(true); this.vignette.texture = Texture.from(vc); }
    else this.vignette = new Sprite(Texture.from(vc));
  }

  /* ================= публичное API ================= */
  async startGame() {
    if (this.starting) return;
    this.starting = true;
    try { await this.ready; } catch (e) {
      this.starting = false;
      console.error("Движок не запустился:", e);
      this.toast("Движок не смог запуститься");
      throw e;
    }
    audio.init();
    audio.startMusic();
    audio.uiClick();
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    try {
      this.ow = generateOverworld(seed);
      this.dungeons = DUNGEONS.map((cfg) => {
        const entry = this.ow.dungeonEntries.find((e) => e.id === cfg.id)!;
        return generateDungeon(seed, cfg, { x: entry.x * T + 8, y: (entry.y + 2) * T + 8 });
      });
    } catch (e) {
      this.starting = false;
      console.error("Сбой генерации мира:", e);
      this.toast("Ниды не сложились... Попробуйте ещё раз");
      throw e;
    }
    const f = this.flags;
    f.hasSword = false; f.hasAxe = false; f.hasBow = false; f.hasHammer = false; f.hasKey = false;
    f.swordUp = false; f.axeUp = false; f.furyRune = false; f.nornsFavor = false; f.hearts = 2;
    f.arrows = 12; f.runes = 0; f.bear = false; f.bearGone = false;
    f.horn = false; f.hornDone = false; f.mead = false; f.meadDone = false; f.ore = false; f.oreDone = false;
    f.moss = false; f.amber = false; f.flower = false; f.shamanDone = false;
    f.diary = false; f.refugeeDone = false; f.secretKnown = false;
    f.bundle = false; f.merchantDone = false; f.relic = false; f.atoneDone = false; f.cullDone = false;
    f.killsByKind = {};
    f.reaperDead = false; f.spiderDead = false; f.giantDead = false;
    f.snakeStarted = false; f.snakeDead = false;
    f.kills = 0; f.deaths = 0; f.shrineIdx = -1; f.shrineQuestDone = false; f.huntDone = false;
    this.visitedShrines.clear();
    this.takenPedestals.clear();
    this.takenAmbient.clear();
    this.trackedQuest = "m1"; this.lastMain = "m1";
    this.openedChests.clear();
    this.talkedSig.clear();
    this.revealed.clear();
    this.revealed.add("m1");
    this.player.hp = this.player.maxHp = 12;
    this.playTime = 0; this.zone = ""; this.talkCount = 0;
    this.fogTimer = 42; this.fogActive = false; this.fogRadius = 2600;
    audio.setFog(false);
    try {
      this.loadMap(this.ow, this.ow.spawn);
      this.setScreen("play");
      this.fadeA = 1;
      this.fadeTarget = 0;
      this.startDialogue("eirik");
      this.pushHud(true);
    } catch (e) {
      this.starting = false;
      console.error("Сбой загрузки мира:", e);
      this.setScreen("title");
      throw e;
    }
    this.starting = false;
  }

  backToTitle() { audio.uiClick(); this.setScreen("title"); }
  togglePause() {
    if (this.screen === "play") this.setScreen("pause");
    else if (this.screen === "pause") this.setScreen("play");
    audio.uiClick();
  }
  toggleMute() { audio.toggleMute(); this.pushHud(true); }
  setVirtual(v: Partial<typeof this.virt>) { Object.assign(this.virt, v); }
  attachMinimap(c: HTMLCanvasElement) {
    if (this.minimap !== c) { this.minimap = c; this.mmBase = null; }
  }

  openQuests() { if (this.screen === "play") this.setScreen("quests"); }
  openInventory() { if (this.screen === "play") this.setScreen("inventory"); }
  openMap() { if (this.screen === "play") this.setScreen("map"); }
  closeOverlay() {
    if (this.screen === "quests" || this.screen === "inventory" || this.screen === "map") this.setScreen("play");
  }
  trackQuest(id: string) {
    const { done } = this.questDesc(id);
    if (done) return;
    this.trackedQuest = id;
    const def = this.questDefs().find((q) => q.id === id);
    this.toast(def ? `Стрелка ведёт: ${def.title}` : "Цель обновлена");
    audio.uiClick();
    this.pushHud(true);
  }

  advanceDialogue() {
    this.dialogueActive = false;
    this.pressed.clear();
    this.cbs.onDialogue(null);
    const last = this.lastDialogueId;
    const f = this.flags;
    const p = this.player;
    if (last === "eirik" && !f.hasSword) {
      f.hasSword = true;
      audio.rune();
      this.toast("Ржавый Меч вернулся к тебе");
      this.burst(p.x, p.y, 0xc9a24b, 18, 90, 1.0, 2, -10);
      this.pushHud(true);
    }
    if (last === "astrid") {
      if (f.mead && !f.meadDone) {
        f.mead = false; f.meadDone = true;
        p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2);
        audio.rune(); this.toast("Зелье из дикого мёда: максимальное здоровье +2");
      } else {
        p.hp = p.maxHp; audio.heal();
      }
      this.burst(p.x, p.y, 0x7ee2a8, 12, 60, 0.8, 2, -20);
      this.pushHud(true);
    }
    if (last === "sigrid" && f.horn && !f.hornDone) {
      f.horn = false; f.hornDone = true; f.axeUp = true;
      audio.rune(); this.toast("Рог возвращён. Секира наточена о ледяной камень (+урон)");
      this.pushHud(true);
    }
    if (last === "harald" && f.ore && !f.oreDone) {
      f.ore = false; f.oreDone = true; f.swordUp = true;
      audio.rune(); this.toast("Сердце горы в горне. Меч закалён (+урон)");
      this.pushHud(true);
    }
    if (last === "shaman" && f.moss && f.amber && f.flower && !f.shamanDone) {
      f.moss = false; f.amber = false; f.flower = false; f.shamanDone = true; f.furyRune = true;
      audio.rune(); this.toast("Отвар Норн выпит. Руна Ярости: замах быстрее");
      this.pushHud(true);
    }
    if (last === "refugee" && f.diary && !f.refugeeDone) {
      f.diary = false; f.refugeeDone = true; f.secretKnown = true;
      audio.rune(); this.toast("Тайник старосты отмечен на карте");
      this.pushHud(true);
    }
    if (last === "merchant" && f.bundle && !f.merchantDone) {
      f.bundle = false; f.merchantDone = true; f.arrows += 10; f.secretKnown = true;
      audio.rune(); this.toast("Фьолнир доволен: +10 стрел, тайник отмечен");
      this.pushHud(true);
    }
    if (last === "brand") {
      if (!f.cullDone && (f.killsByKind["varg"] ?? 0) >= 4 && (f.killsByKind["draugr"] ?? 0) >= 4) {
        f.cullDone = true; p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2);
        audio.rune(); this.toast("Бранд кивает: максимальное здоровье +2");
        this.pushHud(true);
      }
    }
    if (last === "daughter" && f.bear && !f.bearGone) {
      f.bear = false; f.bearGone = true;
      p.maxHp += 2; p.hp = p.maxHp;
      audio.rune();
      this.toast("Кровавая Слеза: максимальное здоровье +2");
      this.burst(p.x, p.y, 0xc03050, 16, 80, 1.0, 2, -10);
      this.pushHud(true);
    }
  }

  private setScreen(s: Screen) { this.screen = s; this.cbs.onScreen(s); }
  private toast(msg: string) { this.cbs.onToast(msg); }
  private shakeIt(v: number) { this.shake = Math.min(12, this.shake + v); }
  private fadeTo(a: number) { this.fadeTarget = a; }

  /* ================= загрузка карты ================= */
  private loadMap(map: WorldData, spawn: Vec) {
    this.map = map;
    this.clearEntities();
    this.buildMapTextures(map);
    this.mmBase = null;

    const p = this.player;
    p.x = spawn.x; p.y = spawn.y; p.vx = 0; p.vy = 0; p.swingT = 0; p.hurtT = 0; p.slowT = 0;
    p.hp = Math.min(p.hp, p.maxHp);
    this.playerG.position.set(spawn.x, spawn.y);
    this.dynamic.addChild(this.playerG);
    this.playerG.zIndex = 100;

    this.playerBody = this.makeBody(p.r);
    this.playerBody.position.x = spawn.x; this.playerBody.position.y = spawn.y;
    this.cam.x = clamp(spawn.x - this.viewW / 2, 0, Math.max(0, map.W * T - this.viewW));
    this.cam.y = clamp(spawn.y - this.viewH / 2, 0, Math.max(0, map.H * T - this.viewH));

    for (const s of map.spawns) this.spawnEnemy(s.kind, s.x, s.y);
    this.ensureSpawnSafety(map, spawn);

    for (const c of map.chests) {
      const key = c.x + "_" + c.y;
      const rt: ChestRt = { x: c.x * T + 8, y: c.y * T + 8, item: c.item, opened: this.openedChests.has(key), g: new Graphics() };
      rt.g.position.set(rt.x, rt.y);
      this.renderers.chest.render(rt.g, { opened: rt.opened } as IChestData);
      this.chests.push(rt); this.dynamic.addChild(rt.g);
    }
    if (!map.isDungeon && this.flags.secretKnown) {
      const sk = map.stashSpot.x + "_" + map.stashSpot.y;
      const rt: ChestRt = { x: map.stashSpot.x * T + 8, y: map.stashSpot.y * T + 8, item: "heartPiece", opened: this.openedChests.has(sk), g: new Graphics() };
      rt.g.position.set(rt.x, rt.y);
      this.renderers.chest.render(rt.g, { opened: rt.opened } as IChestData);
      this.chests.push(rt); this.dynamic.addChild(rt.g);
    }
    map.pedestals.forEach((pd) => {
      const pi = map.pedestals.indexOf(pd);
      const rt: PedestalRt = {
        x: pd.x * T + 8, y: pd.y * T + 8, taken: this.takenPedestals.has(pi),
        guardsLeft: this.takenPedestals.has(pi) ? 0 : pd.guards.length, guardsSpawned: false, g: new Graphics(),
      };
      rt.g.position.set(rt.x, rt.y);
      this.pedestals.push(rt); this.dynamic.addChild(rt.g);
    });
    map.shrines.forEach((s) => {
      const rt: ShrineRt = { x: s.x * T + 8, y: s.y * T + 8, g: new Graphics() };
      rt.g.position.set(rt.x, rt.y);
      this.shrines.push(rt); this.dynamic.addChild(rt.g);
    });
    for (const n of map.npcs) {
      const rt: NpcRt = { id: n.id, name: n.name, x: n.x * T + 8, y: n.y * T + 8, g: new Graphics() };
      rt.g.position.set(rt.x, rt.y);
      this.npcs.push(rt); this.dynamic.addChild(rt.g);
    }
    if (!map.isDungeon) {
      map.souls.forEach((s, i) => {
        const rt: NpcRt = { id: `soul${i}`, name: "Потерянная душа", x: s.x * T + 8, y: s.y * T + 8, g: new Graphics() };
        rt.g.position.set(rt.x, rt.y);
        this.npcs.push(rt); this.dynamic.addChild(rt.g);
      });
    }
    if (map.isDungeon) {
      for (const d of map.doors) {
        const rt: DoorRt = { x: d.x, y: d.y, open: 0, locked: true, g: new Graphics() };
        rt.g.position.set(rt.x, rt.y);
        this.doors.push(rt); this.dynamic.addChild(rt.g);
      }
    } else {
      const b = { x: map.treeAltar.x * T + 8, y: (map.treeAltar.y + 5) * T + 8, active: this.flags.runes < 5 && !this.flags.snakeStarted, g: new Graphics() };
      b.g.position.set(b.x, b.y);
      this.barrier = b; this.dynamic.addChild(b.g);
      const a = { x: map.treeAltar.x * T + 8, y: map.treeAltar.y * T + 8, g: new Graphics() };
      a.g.position.set(a.x, a.y);
      this.altar = a; this.dynamic.addChild(a.g);
      this.spawnWorldDrops(map);
    }
  }

  private spawnWorldDrops(map: WorldData) {
    const add = (kind: DropKind, v: Vec) => {
      const d: Drop = { kind, x: v.x, y: v.y, t: Math.random() * 5, taken: false, magnet: false, g: new Graphics() };
      d.g.position.set(d.x, d.y);
      this.drops.push(d); this.dynamic.addChild(d.g);
    };
    const f = this.flags;
    if (!f.bearGone) add("bear", { x: map.bearSpot.x * T + 8, y: map.bearSpot.y * T + 8 });
    if (!f.hornDone && !f.horn) add("horn", { x: map.hornSpot.x * T + 8, y: map.hornSpot.y * T + 8 });
    if (!f.meadDone && !f.mead) add("mead", { x: map.meadSpot.x * T + 8, y: map.meadSpot.y * T + 8 });
    if (f.giantDead && !f.oreDone && !f.ore) add("ore", { x: map.oreSpot.x * T + 8, y: map.oreSpot.y * T + 8 });
    if (!f.shamanDone) {
      if (!f.moss) add("moss", { x: map.mossSpot.x * T + 8, y: map.mossSpot.y * T + 8 });
      if (!f.amber) add("amber", { x: map.amberSpot.x * T + 8, y: map.amberSpot.y * T + 8 });
      if (!f.flower) add("flower", { x: map.flowerSpot.x * T + 8, y: map.flowerSpot.y * T + 8 });
    }
    if (!f.refugeeDone && !f.diary) add("diary", { x: map.diarySpot.x * T + 8, y: map.diarySpot.y * T + 8 });
    if (!f.merchantDone && !f.bundle) add("bundle", { x: map.bundleSpot.x * T + 8, y: map.bundleSpot.y * T + 8 });
    if (!f.atoneDone && !f.relic) add("relic", { x: map.relicSpot.x * T + 8, y: map.relicSpot.y * T + 8 });
    if (!map.isDungeon) {
      map.ambient.forEach((a, i) => {
        if (this.takenAmbient.has(i)) return;
        add(a.kind, { x: a.x * T + 8, y: a.y * T + 8 });
        this.drops[this.drops.length - 1].ambientIdx = i;
      });
    }
  }

  private clearEntities() {
    for (const e of this.enemies) { e.g.destroy(); if (e.body) this.farBody(e.body); }
    for (const p of this.projectiles) p.g.destroy();
    for (const d of this.drops) d.g.destroy();
    for (const c of this.chests) c.g.destroy();
    for (const p of this.pedestals) p.g.destroy();
    for (const s of this.shrines) s.g.destroy();
    for (const n of this.npcs) n.g.destroy();
    for (const d of this.doors) d.g.destroy();
    for (const f of this.floats) f.txt.destroy();
    this.barrier?.g.destroy(); this.altar?.g.destroy();
    this.enemies = []; this.projectiles = []; this.drops = [];
    this.chests = []; this.pedestals = []; this.shrines = []; this.npcs = []; this.doors = [];
    this.floats = []; this.slamZones = []; this.bossRef = null;
    this.barrier = null; this.altar = null; this.axeProj = null; this.axeState = "ready";
    this.dynamic.removeChildren();
  }

  private farBody(b: PhysCircle | null) {
    if (!b) return;
    b.position.x = -9999; b.position.y = -9999;
    b.velocity.x = 0; b.velocity.y = 0;
  }

  private makeBody(r: number): PhysCircle {
    const b = new PhysCircle({
      form: { vertices: [new PhysVector(0, 0)] },
      radius: r, mass: 10, speed: 4000, rotate: false, elasticity: 0, angularSpeed: 0,
    } as any, this.phys);
    b.position = new PhysVector(b.position.x, b.position.y);
    this.phys.addEntity(b);
    return b;
  }

  private spawnEnemy(kind: Enemy["kind"], x: number, y: number): Enemy {
    const e = makeEnemy(kind, x, y, this.enemies.length);
    e.g.position.set(x, y);
    this.enemies.push(e);
    this.dynamic.addChild(e.g);
    e.body = this.makeBody(e.r);
    if (kind === "raven" || kind === "snake" || kind === "spider") this.farBody(e.body);
    else { e.body.position.x = x; e.body.position.y = y; }
    return e;
  }

  private ensureSpawnSafety(map: WorldData, spawn: Vec) {
    const safeR = map.isDungeon ? 170 : 300;
    for (const e of this.enemies) {
      const r = map.isDungeon ? 170 : e.kind === "crawler" ? 250 : safeR;
      if (dist2(e.x, e.y, spawn.x, spawn.y) < r * r && !e.hidden) {
        let moved = false;
        for (let tries = 0; tries < 26; tries++) {
          const a = Math.random() * Math.PI * 2;
          const d = map.isDungeon ? 200 + Math.random() * 120 : 340 + Math.random() * 220;
          const nx = spawn.x + Math.cos(a) * d, ny = spawn.y + Math.sin(a) * d;
          const tx = Math.floor(nx / T), ty = Math.floor(ny / T);
          if (tx > 1 && ty > 1 && tx < map.W - 2 && ty < map.H - 2 && !solidTileAt(map, tx, ty)) {
            e.x = nx; e.y = ny; e.g.position.set(nx, ny);
            if (e.body) { e.body.position.x = nx; e.body.position.y = ny; }
            moved = true; break;
          }
        }
        if (!moved) e.dead = true;
      }
    }
  }

  /* ================= ввод ================= */
  private keyDown(e: KeyboardEvent) {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    this.pressed.add(e.code);
    if (e.code === "Escape") {
      if (this.screen === "play") this.setScreen("pause");
      else if (this.screen === "pause") this.setScreen("play");
      else this.closeOverlay();
    }
    if (e.code === "KeyP") {
      if (this.screen === "play") this.setScreen("pause");
      else if (this.screen === "pause") this.setScreen("play");
    }
    if (e.code === "Tab" || e.code === "KeyI") {
      if (this.screen === "play") this.setScreen("inventory");
      else if (this.screen === "inventory") this.setScreen("play");
      audio.uiClick();
    }
    if (e.code === "KeyQ") {
      if (this.screen === "play") this.setScreen("quests");
      else if (this.screen === "quests") this.setScreen("play");
      audio.uiClick();
    }
    if (e.code === "KeyM") this.toggleMute();
    if (e.code === "KeyF" && this.screen === "play") this.useStoredHeart();
    if (e.code === "KeyN") {
      this.setRoofSnow(!this.roofSnow);
      this.toast(this.roofSnow ? "Снег на крышах: вкл" : "Снег на крышах: выкл");
    }
  }

  private useStoredHeart() {
    const p = this.player;
    if (p.hp >= p.maxHp) { this.float(p.x, p.y, "Здоровье полное", 0x6e7f8d); return; }
    if (this.flags.hearts <= 0) { this.float(p.x, p.y, "Сума пуста", 0x6e7f8d); return; }
    this.flags.hearts--;
    p.hp = Math.min(p.maxHp, p.hp + 4);
    audio.heal();
    this.burst(p.x, p.y, 0x7ee2a8, 10, 50, 0.8, 2, -20);
    this.float(p.x, p.y - 10, "+4", 0x7ee2a8);
    this.pushHud(true);
  }

  /* ================= главный цикл ================= */
  private tick(rdt: number) {
    if (!this.app) return;
    this.realT += rdt;
    this.timeScale += (this.tsTarget - this.timeScale) * Math.min(1, rdt * 8);
    this.fadeA += (this.fadeTarget - this.fadeA) * Math.min(1, rdt * 5);
    this.shake *= Math.pow(0.001, rdt);

    if (this.screen === "play" && !this.dialogueActive) {
      if (this.hitstop > 0) this.hitstop -= rdt;
      else this.update(rdt * this.timeScale, rdt);
      const inDanger = this.fogActive || this.bossRef !== null ||
        this.enemies.some((e) => !e.dead && e.aggro && dist2(e.x, e.y, this.player.x, this.player.y) < 130 * 130);
      audio.setIntensity(inDanger ? 1 : 0);
    } else {
      audio.setIntensity(0);
      this.pressed.clear();
      if (this.screen === "death") {
        this.deathT -= rdt;
        this.updateParticles(rdt);
        if (this.deathT <= 0 && this.screen === "death") this.respawn();
      }
    }

    const fx = this.fxScreen;
    fx.clear();
    if (!this.map?.isDungeon) {
      for (const f of this.snow) {
        f.y += f.s * rdt;
        f.x += Math.sin(this.realT * 0.8 + f.d) * 8 * rdt - 4 * rdt;
        if (f.y > this.viewH) { f.y = -2; f.x = Math.random() * this.viewW; }
        if (f.x < -2) f.x = this.viewW;
        fx.rect(f.x, f.y, f.w, f.w).fill({ color: 0xc8d8e8, alpha: 0.4 });
      }
    }
    this.drawGuide(fx);
    this.drawFog();
    this.drawWorldFx(rdt);

    const m = this.map;
    const tx = m ? (m.W * T > this.viewW ? clamp(this.player.x - this.viewW / 2, 0, m.W * T - this.viewW) : (m.W * T - this.viewW) / 2) : 0;
    const ty = m ? (m.H * T > this.viewH ? clamp(this.player.y - this.viewH / 2, 0, m.H * T - this.viewH) : (m.H * T - this.viewH) / 2) : 0;
    this.cam.x += (tx - this.cam.x) * Math.min(1, rdt * 6);
    this.cam.y += (ty - this.cam.y) * Math.min(1, rdt * 6);
    const shx = (Math.random() - 0.5) * this.shake, shy = (Math.random() - 0.5) * this.shake;
    this.world.position.set(-Math.round(this.cam.x + shx), -Math.round(this.cam.y + shy));

    // ==================== ОТРИСОВКА ЧЕРЕЗ РЕНДЕРЕРЫ ====================
    // 1. Игрок
    const playerExtra: IPlayerExtra = {
      hasSword: this.flags.hasSword,
      runes: this.flags.runes,
      swingDir: this.player.dir,
      aiming: this.bowHeld,
    };
    this.renderers.player.render(this.playerG, this.player as IPlayerData, this.realT, playerExtra);
    this.playerG.position.set(Math.round(this.player.x), Math.round(this.player.y));
    this.playerG.zIndex = this.player.y;

    // 2. Враги
    for (const e of this.enemies) {
      e.g.zIndex = e.kind === "raven" ? 100000 + e.y : e.y;
      e.g.visible = !e.dead && !(e.hidden && dist2(e.x, e.y, this.player.x, this.player.y) > 46 * 46);
      if (!e.dead) this.renderers.enemy.render(e.g, e as IEnemyData, this.realT);
    }

    // 3. NPC
    for (const n of this.npcs) {
      n.g.zIndex = n.y;
      const mark = this.npcHasMark(n.id);
      this.renderers.npc.render(n.g, { id: n.id, name: n.name } as INpcData, this.realT, { mark });
    }

    // 4. Снаряды
    for (const p of this.projectiles) {
      p.g.zIndex = p.y;
      this.renderers.projectile.render(p.g, p as IProjectileData, this.realT);
    }

    // 5. Дроп
    for (const d of this.drops) {
      if (!d.taken) {
        d.g.zIndex = d.y;
        this.renderers.drop.render(d.g, d as IDropData, this.realT);
      }
    }

    // 6. Сундуки
    for (const c of this.chests) {
      c.g.zIndex = c.y;
      this.renderers.chest.render(c.g, { opened: c.opened } as IChestData);
    }

    // 7. Пьедесталы
    for (const p of this.pedestals) {
      p.g.zIndex = p.y;
      this.renderers.pedestal.render(p.g, { taken: p.taken, guardsLeft: p.guardsLeft } as IPedestalData, this.realT);
    }

    // 8. Святилища
    for (const s of this.shrines) {
      s.g.zIndex = s.y;
      const lit = this.flags.shrineIdx >= this.shrines.indexOf(s);
      this.renderers.shrine.render(s.g, { lit } as IShrineData, this.realT);
    }

    // 9. Двери
    for (const d of this.doors) {
      d.g.zIndex = d.y;
      this.renderers.door.render(d.g, { open: d.open, locked: d.locked } as IDoorData);
    }

    // 10. Барьер
    if (this.barrier) {
      this.barrier.g.zIndex = this.barrier.y;
      this.barrier.g.visible = this.barrier.active;
      if (this.barrier.active) {
        this.renderers.barrier.render(this.barrier.g, { active: true } as IBarrierData, this.realT);
      }
    }

    // 11. Алтарь
    if (this.altar) {
      this.altar.g.zIndex = this.altar.y - 1;
      this.renderers.altar.render(this.altar.g, { runes: this.flags.runes } as IAltarData, this.realT);
    }

    this.fadeG.clear();
    if (this.fadeA > 0.01) this.fadeG.rect(-4, -4, this.viewW + 8, this.viewH + 8).fill({ color: 0x04060a, alpha: this.fadeA });

    this.hudTimer -= rdt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.15; this.pushHud(); }
    this.mmTimer -= rdt;
    if (this.mmTimer <= 0) {
      this.mmTimer = 0.15;
      const txi = Math.floor(this.player.x / T), tyi = Math.floor(this.player.y / T);
      const blink = Math.floor(this.realT * 3) % 2;
      const key = txi + "_" + tyi + "_" + blink + "_" + (this.map?.dungeonId ?? -1) + "_" + this.trackedQuest;
      if (key !== this.lastMmKey) { this.lastMmKey = key; this.drawMinimap(); }
    }
  }

  private npcHasMark(id: string): boolean {
    const sig = this.npcSig(id);
    if (!sig) return false;
    return this.talkedSig.get(id) !== sig;
  }

  private npcSig(id: string): string {
    const f = this.flags;
    switch (id) {
      case "eirik": return this.mainQuestId();
      case "raven": return this.mainQuestId();
      case "daughter": return f.bearGone ? "done" : f.bear ? "ret" : "q";
      case "sigrid": return f.hornDone ? "done" : f.horn ? "ret" : "";
      case "astrid": return f.meadDone ? "done" : f.mead ? "ret" : "";
      case "harald": return f.oreDone ? "done" : f.ore ? "ret" : "";
      case "shaman": {
        const got = [f.moss, f.amber, f.flower].filter(Boolean).length;
        return f.shamanDone ? "done" : got === 3 ? "ret" : "q" + got;
      }
      case "refugee": return f.refugeeDone ? "done" : f.diary ? "ret" : "q";
      case "brand": {
        const ok = (f.killsByKind["varg"] ?? 0) >= 4 && (f.killsByKind["draugr"] ?? 0) >= 4;
        return f.cullDone ? "done" : ok ? "ret" : "q";
      }
      case "merchant": return f.merchantDone ? "done" : f.bundle ? "ret" : "q";
      default: return "";
    }
  }

  private drawFog() {
    const px = this.player.x - this.cam.x, py = this.player.y - this.cam.y;
    if (this.fogSpr) {
      if (this.fogRadius < 2300) {
        this.fogSpr.visible = true;
        this.fogSpr.position.set(px, py);
        this.fogSpr.scale.set(this.fogRadius / 96);
        this.fogSpr.alpha = 1;
      } else this.fogSpr.visible = false;
    }
    const k = clamp(1 - this.fogRadius / 2300, 0, 1);
    if (k > 0.05) {
      const fx = this.fxScreen;
      const W = this.viewW, H = this.viewH;
      const L = 34 * k;
      fx.strokeStyle = { color: 0xbdeef8, width: 1, alpha: 0.5 * k };
      const corners: [number, number, number, number][] = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
      for (const [cx0, cy0, sx, sy] of corners) {
        fx.moveTo(cx0, cy0).lineTo(cx0 + sx * L, cy0);
        fx.moveTo(cx0, cy0).lineTo(cx0, cy0 + sy * L);
        fx.moveTo(cx0 + sx * L * 0.4, cy0).lineTo(cx0 + sx * L * 0.4, cy0 + sy * L * 0.4);
        fx.moveTo(cx0, cy0 + sy * L * 0.4).lineTo(cx0 + sx * L * 0.4, cy0 + sy * L * 0.4);
      }
      fx.stroke();
    }
  }

  private drawGuide(fx: Graphics) {
    if (this.screen !== "play" || this.dialogueActive || !this.map) return;
    const p = this.player;
    const tgt = this.trackedTarget();
    let wantA: number | null = null;
    if (p.moving && (p.vx !== 0 || p.vy !== 0)) wantA = Math.atan2(p.vy, p.vx);
    else if (tgt) wantA = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    if (wantA !== null) {
      let da = wantA - this.arrowA;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.arrowA += da * 0.16;
      const a = this.arrowA + Math.sin(this.realT * 2.1) * 0.09;
      const rad = 17 + Math.sin(this.realT * 2.6) * 2.2;
      const px = p.x - this.cam.x + Math.cos(a) * rad;
      const py = p.y - this.cam.y + Math.sin(a) * rad - 4;
      const pulse = 0.6 + Math.sin(this.realT * 5) * 0.3;
      fx.moveTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5)
        .lineTo(px + Math.cos(a + 2.5) * 4, py + Math.sin(a + 2.5) * 4)
        .lineTo(px + Math.cos(a - 2.5) * 4, py + Math.sin(a - 2.5) * 4)
        .closePath().fill({ color: 0xe8c979, alpha: pulse });
    }
    const hint = this.nearestInteractable();
    if (hint) {
      const hx = hint.x - this.cam.x, hy = hint.y - this.cam.y - 20 + Math.sin(this.realT * 5) * 1.5;
      fx.rect(hx - 6, hy - 6, 12, 10).fill({ color: 0x0a0f16, alpha: 0.85 });
      fx.rect(hx - 6, hy - 6, 12, 10).stroke({ color: 0xc9a24b, width: 1, alpha: 0.8 });
      fx.poly([hx - 2, hy - 3, hx + 2, hy - 3, hx + 2, hy - 1, hx, hy - 1, hx, hy + 2, hx - 2, hy + 2]).fill(0xe8dcc0);
    }
  }

  private drawWorldFx(rdt: number) {
    this.updateParticles(rdt);
    const g = this.particleG;
    g.clear();
    for (const p of this.particles) {
      g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size).fill({ color: p.color, alpha: p.alpha * (p.life / p.max) });
    }
    for (const z of this.slamZones) {
      const pr = 1 - z.t / 0.9;
      if (!z.boom) {
        g.circle(z.x, z.y, z.r * pr).stroke({ color: 0xe05050, width: 1.5, alpha: 0.5 + pr * 0.4 });
        g.circle(z.x, z.y, 2).fill({ color: 0xe08a3c, alpha: 0.8 });
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = this.realT * 0.7 + i * 2.1;
      const wx = this.player.x + Math.cos(a) * 26, wy = this.player.y - 8 + Math.sin(a * 1.7) * 10;
      g.circle(wx, wy, 1.5).fill({ color: 0x8fd8e8, alpha: 0.5 + Math.sin(this.realT * 3 + i) * 0.3 });
    }
  }

  /* ================= обновление ================= */
  private update(dt: number, rdt: number) {
    const p = this.player;
    this.playTime += dt;

    let ix = 0, iy = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iy -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iy += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
    ix += this.virt.x; iy += this.virt.y;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    if (mag > 0.12) p.dir = { x: ix / Math.max(1, mag), y: iy / Math.max(1, mag) };

    const tile = tileAt(this.map, Math.floor(p.x / T), Math.floor(p.y / T));
    let speed = 92;
    p.slowT = Math.max(0, p.slowT - dt);
    if (p.slowT > 0) speed *= 0.6;
    if (tile === Tl.SWAMP) speed = 62;
    if (tile === Tl.POOL) {
      speed = 48;
      if (Math.floor(this.realT * 1.4) !== Math.floor((this.realT - dt) * 1.4)) {
        this.damagePlayer(1, p.x, p.y + 10, true);
        this.burst(p.x, p.y + 4, 0x3a6a5c, 3, 20, 0.5, 2, -20);
      }
    }
    p.moving = mag > 0.12;
    if (p.moving) {
      p.animT += dt;
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.32; audio.step(); }
    }
    p.vx = ix * speed; p.vy = iy * speed;

    const bowKeyDown = this.keys.has("KeyL") || this.virt.bow;
    if (bowKeyDown && this.flags.hasBow) {
      if (!this.bowHeld) { this.bowHeld = true; audio.uiClick(); }
      this.tsTarget = 0.45;
    } else if (this.bowHeld) {
      this.bowHeld = false;
      this.tsTarget = 1;
      if (this.flags.arrows > 0) {
        this.flags.arrows--;
        const a = Math.atan2(p.dir.y, p.dir.x);
        this.fireProjectile("arrow", p.x + Math.cos(a) * 8, p.y - 2 + Math.sin(a) * 8, Math.cos(a) * 260, Math.sin(a) * 260, 2);
        audio.arrow();
        this.pushHud(true);
      } else this.float(p.x, p.y, "Нет стрел", 0xc9a24b);
    }
    if (!this.bowHeld) this.tsTarget = 1;

    const atkPressed = this.pressed.has("Space") || this.pressed.has("KeyK") || (this.virt.atk && !this.prevVirt.atk);
    const axePressed = this.pressed.has("KeyJ") || (this.virt.axe && !this.prevVirt.axe);
    const actPressed = this.pressed.has("KeyE") || (this.virt.act && !this.prevVirt.act);
    if (atkPressed) this.trySword();
    if (axePressed) this.tryAxe();
    if (actPressed) this.tryInteract();
    this.pressed.clear();
    this.prevVirt = { atk: this.virt.atk, axe: this.virt.axe, act: this.virt.act, bow: this.virt.bow };

    p.swingT = Math.max(0, p.swingT - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);

    this.stepPhysics(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateDrops(dt);

    for (const d of this.doors) {
      if (d.locked && this.flags.hasKey && dist2(d.x, d.y, p.x, p.y) < 24 * 24) {
        d.locked = false;
        this.flags.hasKey = false;
        d.open = 0.01;
        audio.door();
        this.toast("Ключ повернут — путь к стражу открыт");
        this.pushHud(true);
      }
      if (d.open < 1 && d.open > 0 && !d.locked) d.open = Math.min(1, d.open + dt * 2);
    }

    this.updateFog(dt, rdt);

    const zn = zoneFor(this.map, Math.floor(p.x / T), Math.floor(p.y / T));
    if (zn !== this.zone) {
      if (this.zone !== "") this.toast(zn);
      this.zone = zn;
      this.pushHud(true);
    }

    if (this.map.isDungeon && !this.dungeonBossDead(this.map.dungeonId) && !this.bossRef) {
      const br = this.map.bossRoom;
      if (p.x > br.x && p.x < br.x + br.w && p.y > br.y && p.y < br.y + br.h) this.startDungeonBoss();
    }

    this.checkQuestProgress();
  }

  private dungeonBossDead(id: number): boolean {
    const f = this.flags;
    if (id === 0) return f.reaperDead;
    if (id === 1) return f.spiderDead;
    return f.giantDead;
  }
  private setDungeonBossDead(id: number) {
    if (id === 0) this.flags.reaperDead = true;
    else if (id === 1) this.flags.spiderDead = true;
    else this.flags.giantDead = true;
  }

  /* ================= физика ================= */
  private circleHitsSolid(x: number, y: number, r: number): boolean {
    const m = this.map;
    if (!m) return false;
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
    const y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!solidTileAt(m, tx, ty)) continue;
      const cx = clamp(x, tx * T, tx * T + T), cy = clamp(y, ty * T, ty * T + T);
      if (dist2(x, y, cx, cy) < r * r) return true;
    }
    return false;
  }

  private solidRects(): { x: number; y: number; w: number; h: number }[] {
    const rs: { x: number; y: number; w: number; h: number }[] = [];
    for (const d of this.doors) {
      if (d.open < 0.9) rs.push({ x: d.x - 9, y: d.y - 8, w: 18, h: 16 });
    }
    if (this.barrier && this.barrier.active) rs.push({ x: this.barrier.x - 20, y: this.barrier.y - 8, w: 40, h: 16 });
    return rs;
  }

  private circleBlocked(x: number, y: number, r: number): boolean {
    if (this.circleHitsSolid(x, y, r)) return true;
    for (const rc of this.solidRects()) {
      const cx = clamp(x, rc.x, rc.x + rc.w), cy = clamp(y, rc.y, rc.y + rc.h);
      if (dist2(x, y, cx, cy) < r * r) return true;
    }
    return false;
  }

  private moveWithCollisions(e: { x: number; y: number; r: number }, dx: number, dy: number) {
    if (dx) { const nx = e.x + dx; if (!this.circleBlocked(nx, e.y, e.r)) e.x = nx; }
    if (dy) { const ny = e.y + dy; if (!this.circleBlocked(e.x, ny, e.r)) e.y = ny; }
  }

  private resolveTiles(e: { x: number; y: number; r: number }, safe: Vec) {
    for (let iter = 0; iter < 3; iter++) {
      if (!this.circleHitsSolid(e.x, e.y, e.r)) return;
      const m = this.map;
      const x0 = Math.floor((e.x - e.r) / T), x1 = Math.floor((e.x + e.r) / T);
      const y0 = Math.floor((e.y - e.r) / T), y1 = Math.floor((e.y + e.r) / T);
      let pushed = false;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (!solidTileAt(m, tx, ty)) continue;
        const cx = clamp(e.x, tx * T, tx * T + T), cy = clamp(e.y, ty * T, ty * T + T);
        const dx = e.x - cx, dy = e.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < e.r * e.r && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          e.x = cx + (dx / d) * e.r;
          e.y = cy + (dy / d) * e.r;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
    if (this.circleHitsSolid(e.x, e.y, e.r)) { e.x = safe.x; e.y = safe.y; }
  }

  private stepPhysics(dt: number) {
    const bodies: { e: { x: number; y: number; vx: number; vy: number; r: number }; b: PhysCircle | null; safe: Vec }[] = [];
    bodies.push({ e: this.player, b: this.playerBody, safe: { x: this.player.x, y: this.player.y } });
    for (const en of this.enemies) {
      if (en.dead || en.kind === "raven" || en.kind === "snake" || en.kind === "spider") {
        if (en.body && en.body.position.x > -5000) this.farBody(en.body);
        continue;
      }
      bodies.push({ e: en, b: en.body, safe: { x: en.x, y: en.y } });
    }
    for (const { e, b } of bodies) {
      if (!b) continue;
      this.moveWithCollisions(e, e.vx * dt, e.vy * dt);
      b.position.x = e.x; b.position.y = e.y;
      b.velocity.x = 0; b.velocity.y = 0;
    }
    try { (this.phys as any).update(); } catch { /* физика не критична */ }
    for (const { b } of bodies) { if (b) { b.velocity.x = 0; b.velocity.y = 0; } }
    for (const { e, b, safe } of bodies) {
      if (!b) continue;
      if (b.position.x !== e.x || b.position.y !== e.y) { e.x = b.position.x; e.y = b.position.y; }
      for (const rc of this.solidRects()) {
        const cx = clamp(e.x, rc.x, rc.x + rc.w), cy = clamp(e.y, rc.y, rc.y + rc.h);
        const dx = e.x - cx, dy = e.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < e.r * e.r && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          e.x = cx + (dx / d) * e.r; e.y = cy + (dy / d) * e.r;
        }
      }
      this.resolveTiles(e, safe);
      b.position.x = e.x; b.position.y = e.y;
    }
    if (this.flags.snakeStarted && !this.flags.snakeDead && !this.map.isDungeon) {
      const a = this.map.arena;
      const dx = this.player.x - a.x, dy = this.player.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > a.r - 6) {
        this.player.x = a.x + (dx / d) * (a.r - 6);
        this.player.y = a.y + (dy / d) * (a.r - 6);
        this.playerBody.position.x = this.player.x; this.playerBody.position.y = this.player.y;
      }
    }
    for (const en of this.enemies) {
      if (en.dead || en.kind !== "raven") continue;
      en.x += en.vx * dt; en.y += en.vy * dt;
      en.x = clamp(en.x, T, this.map.W * T - T);
      en.y = clamp(en.y, T, this.map.H * T - T);
    }
  }

  private hasLOS(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 10) return true;
    const steps = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (solidTileAt(this.map, Math.floor((x0 + dx * t) / T), Math.floor((y0 + dy * t) / T))) return false;
    }
    return true;
  }

  /* ================= бой ================= */
  private trySword() {
    const p = this.player;
    if (!this.flags.hasSword) { this.float(p.x, p.y, "Нужен клинок", 0x6e7f8d); return; }
    if (p.swingT > 0) return;
    p.swingT = this.flags.furyRune ? 0.17 : 0.22;
    audio.swing();
    const a = Math.atan2(p.dir.y, p.dir.x);
    const dmg = this.flags.swordUp ? 2 : 1;
    for (const e of this.enemies) {
      if (e.dead || e.hidden) continue;
      if (e.kind === "snake") {
        if (e.state === "open") {
          const ex = e.x + Math.sin(this.realT * 1.6) * 4, ey = e.y - 8;
          if (dist2(p.x + p.dir.x * 14, p.y + p.dir.y * 14, ex, ey) < 20 * 20) this.damageSnake(e);
        } else if (dist2(p.x, p.y, e.x, e.y) < (e.r + 18) * (e.r + 18)) {
          this.float(e.x, e.y - 24, "Чешуя крепче камня", 0x6e7f8d);
          audio.clang();
        }
        continue;
      }
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 24 + e.r) continue;
      const ea = Math.atan2(e.y - p.y, e.x - p.x);
      let da = Math.abs(ea - a);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > 1.2) continue;
      this.hitEnemy(e, dmg, p.x, p.y, false);
      if (this.flags.hasHammer && !e.dead && e.freezeT <= 0) { e.freezeT = 0.8; }
    }
  }

  private hitEnemy(e: Enemy, dmg: number, sx: number, sy: number, ignoreShield: boolean) {
    if (e.kind === "draugr" && !ignoreShield && e.freezeT <= 0) {
      const d = Math.hypot(e.x - sx, e.y - sy) || 1;
      const fromX = (sx - e.x) / d, fromY = (sy - e.y) / d;
      if (fromX * e.facing.x + fromY * e.facing.y > 0.35) {
        audio.clang();
        this.float(e.x, e.y - 10, "Щит!", 0x8f9aa8);
        this.burst(e.x + e.facing.x * 6, e.y + e.facing.y * 6, 0xc9a24b, 4, 50, 0.4, 1, 0);
        return;
      }
    }
    e.hp -= dmg;
    e.flashT = 0.12;
    audio.hit();
    this.float(e.x, e.y - 8, String(dmg), 0xe8dcc0);
    const d = Math.hypot(e.x - sx, e.y - sy) || 1;
    this.moveWithCollisions(e, ((e.x - sx) / d) * 5, ((e.y - sy) / d) * 5);
    this.burst(e.x, e.y - 4, 0xa03232, 5, 60, 0.5, 2, 30);
    this.hitstop = 0.03;
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    if (e.kind === "reaper" || e.kind === "spider" || e.kind === "giant") return;
    e.dead = true;
    this.farBody(e.body);
    e.path = null; e.pathI = 0;
    this.flags.kills++;
    this.flags.killsByKind[e.kind] = (this.flags.killsByKind[e.kind] ?? 0) + 1;
    if (this.flags.kills === 1) this.revealQuest("s_hunt");
    audio.kill();
    this.burst(e.x, e.y - 4, 0x1d232c, 10, 70, 0.7, 2, 20);
    this.burst(e.x, e.y - 4, 0xa03232, 6, 50, 0.6, 2, 30);
    this.hitstop = 0.05;
    if (e.guardOf >= 0 && e.guardOf < this.pedestals.length) {
      const pd = this.pedestals[e.guardOf];
      if (!pd.taken && pd.guardsLeft > 0) {
        pd.guardsLeft = Math.max(0, pd.guardsLeft - 1);
        if (pd.guardsLeft === 0) {
          audio.chime();
          this.toast("Печать пьедестала пала");
          this.burst(pd.x, pd.y - 6, 0x63d8c8, 16, 80, 0.8, 2, 0);
        }
      }
    }
    const roll = Math.random();
    if (e.kind !== "frost") {
      if (roll < 0.4) this.spawnDrop("heart", e.x, e.y);
      else if (roll < 0.62) this.spawnDrop("arrows", e.x, e.y);
    } else {
      this.spawnDrop(Math.random() < 0.5 ? "heart" : "arrows", e.x, e.y);
    }
  }

  private damageSnake(e: Enemy) {
    e.hp -= 1;
    e.flashT = 0.15;
    audio.hit();
    this.float(e.x, e.y - 28, "1", 0xe8c979);
    this.burst(e.x, e.y - 8, 0xe8c979, 10, 80, 0.7, 2, -10);
    this.shakeIt(3);
    if (e.hp <= 0) this.onSnakeDeath(e);
  }

  private onSnakeDeath(e: Enemy) {
    e.dead = true;
    this.farBody(e.body);
    this.bossRef = null;
    this.flags.snakeDead = true;
    audio.bossDie();
    this.shakeIt(10);
    this.burst(e.x, e.y - 8, 0xe8c979, 40, 140, 1.4, 3, -20);
    this.burst(e.x, e.y - 8, 0x24352c, 30, 100, 1.2, 3, 40);
    this.slamZones = [];
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].kind === "fire") this.removeProjectile(i);
    }
    this.cbs.onStats({ time: this.fmtTime(this.playTime), kills: this.flags.kills, deaths: this.flags.deaths, runes: this.flags.runes });
    window.setTimeout(() => { audio.victory(); this.setScreen("victory"); }, 1800);
  }

  private tryAxe() {
    const p = this.player;
    if (!this.flags.hasAxe) { this.float(p.x, p.y, "Секира у Жнеца", 0x6e7f8d); return; }
    if (this.axeState !== "ready") { audio.locked(); return; }
    this.axeState = "out";
    const a = Math.atan2(p.dir.y, p.dir.x);
    const dmg = this.flags.axeUp ? 2 : 1;
    const pr = this.fireProjectile("axe", p.x + Math.cos(a) * 8, p.y - 2 + Math.sin(a) * 8, Math.cos(a) * 200, Math.sin(a) * 200, dmg);
    this.axeProj = pr;
    audio.throwAxe();
  }

  private fireProjectile(kind: Projectile["kind"], x: number, y: number, vx: number, vy: number, dmg: number): Projectile {
    const pr: Projectile = { kind, x, y, vx, vy, r: kind === "fire" ? 5 : 4, dmg, life: kind === "axe" ? 6 : 2.2, dist: 0, returning: false, dead: false, spin: 0, g: new Graphics() };
    pr.g.position.set(x, y);
    this.projectiles.push(pr);
    this.dynamic.addChild(pr.g);
    return pr;
  }

  private removeProjectile(i: number) {
    const pr = this.projectiles[i];
    pr.g.destroy();
    if (this.axeProj === pr) { this.axeProj = null; this.axeState = "ready"; }
    this.projectiles.splice(i, 1);
  }

  private damagePlayer(dmg: number, sx: number, sy: number, pierce = false) {
    const p = this.player;
    if (!pierce && p.hurtT > 0) return;
    if (pierce && p.hurtT > 0.6) return;
    p.hp -= dmg;
    p.hurtT = 1.05;
    audio.hurt();
    this.shakeIt(4);
    this.burst(p.x, p.y - 4, 0xc03050, 8, 70, 0.6, 2, 20);
    this.float(p.x, p.y - 10, "-" + dmg, 0xe06060);
    const d = Math.hypot(p.x - sx, p.y - sy) || 1;
    this.moveWithCollisions(p, ((p.x - sx) / d) * 8, ((p.y - sy) / d) * 8);
    this.playerBody.position.x = p.x; this.playerBody.position.y = p.y;
    this.pushHud(true);
    if (p.hp <= 0) this.die();
  }

  private die() {
    this.flags.deaths++;
    this.playerG.visible = false;
    this.dialogueActive = false;
    this.cbs.onDialogue(null);
    audio.death();
    this.burst(this.player.x, this.player.y, 0x1d232c, 24, 90, 1.2, 2, -10);
    this.shakeIt(8);
    this.deathT = 2.4;
    this.cbs.onStats({ time: this.fmtTime(this.playTime), kills: this.flags.kills, deaths: this.flags.deaths, runes: this.flags.runes });
    this.setScreen("death");
  }

  private respawn() {
    const f = this.flags;
    this.playerG.visible = true;
    this.player.hp = this.player.maxHp;
    f.arrows = Math.ceil(f.arrows / 2);
    f.snakeStarted = false;
    const shrine = this.ow.shrines[Math.max(0, f.shrineIdx)];
    const spawn = f.shrineIdx >= 0 ? { x: shrine.x * T + 8, y: shrine.y * T + 8 } : this.ow.spawn;
    this.fadeTo(1);
    this.loadMap(this.ow, spawn);
    this.fadeTo(0);
    this.toast("Петля сомкнулась... Ниды вернули тебя");
    this.setScreen("play");
    this.pushHud(true);
  }

  /* ================= враги: ИИ ================= */
  private updateEnemies(dt: number) {
    const p = this.player;
    const inVillage = zoneFor(this.map, Math.floor(p.x / T), Math.floor(p.y / T)) === "Поселение выживших" ||
      zoneFor(this.map, Math.floor(p.x / T), Math.floor(p.y / T)) === "Воронья Гавань";
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.flashT = Math.max(0, e.flashT - dt);
      e.contactCd = Math.max(0, e.contactCd - dt);
      e.lungeT = Math.max(0, e.lungeT - dt);
      e.g.position.set(e.x, e.y);
      if (e.freezeT > 0) {
        e.freezeT -= dt;
        e.vx = 0; e.vy = 0;
        if (Math.random() < dt * 6) this.burst(e.x, e.y - 4, 0x9fe0ee, 1, 12, 0.5, 1, -10);
        continue;
      }
      if (e.kind === "reaper") { this.updateReaper(e, dt); continue; }
      if (e.kind === "spider") { this.updateSpider(e, dt); continue; }
      if (e.kind === "giant") { this.updateGiant(e, dt); continue; }
      if (e.kind === "snake") { this.updateSnake(e, dt); continue; }

      const d2p = dist2(e.x, e.y, p.x, p.y);
      const aggroR = e.kind === "raven" ? 150 : e.kind === "crawler" ? 42 : 100;
      const isFlyer = e.kind === "raven";
      const canSee = isFlyer || d2p > 300 * 300 ? isFlyer : this.hasLOS(e.x, e.y, p.x, p.y);
      if (inVillage && e.aggro) { e.aggro = false; e.path = null; }
      if (!e.aggro && !inVillage && d2p < aggroR * aggroR && canSee) e.aggro = true;
      if (e.aggro && !isFlyer && (!canSee || d2p > 300 * 300)) { e.aggro = false; e.path = null; }
      if (e.aggro && isFlyer && d2p > 300 * 300) e.aggro = false;

      e.vx = 0; e.vy = 0;
      const d = Math.sqrt(d2p);
      const stopD = e.r + p.r + 2;

      switch (e.kind) {
        case "draugr":
        case "frost": {
          if (e.aggro) {
            if (d > stopD + 1) this.followPath(e, p.x, p.y, e.speed, dt);
            if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
          } else if (Math.floor(e.t) % 4 === 0) {
            e.vx = Math.sin(e.t * 0.7 + e.seed) * e.speed * 0.3;
          }
          break;
        }
        case "varg": {
          if (e.aggro) {
            if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
            if (e.stateT > 0) {
              e.stateT -= dt;
              e.vx = e.facing.x * e.speed * 2.0;
              e.vy = e.facing.y * e.speed * 2.0;
              if (e.stateT <= 0) e.lungeT = 1.0;
            } else if (d < 46 && e.lungeT <= 0) {
              e.stateT = 0.35; audio.swing();
            } else if (d > stopD + 1) {
              this.followPath(e, p.x, p.y, e.speed, dt);
            }
          } else {
            e.vx = Math.sin(e.t * 0.9 + e.seed) * e.speed * 0.35;
            e.vy = Math.cos(e.t * 0.7 + e.seed) * e.speed * 0.35;
            if (e.vx !== 0 || e.vy !== 0) { const m = Math.hypot(e.vx, e.vy); e.facing = { x: e.vx / m, y: e.vy / m }; }
          }
          break;
        }
        case "raven": {
          if (e.aggro) {
            if (e.state !== "dive") {
              e.stateT -= dt;
              const orbit = 34 + Math.sin(e.t * 2 + e.seed) * 8;
              const tang = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
              const radial = d > orbit ? 1 : -0.6;
              e.vx = Math.cos(tang) * e.speed * 0.8 + ((p.x - e.x) / (d || 1)) * e.speed * 0.5 * radial;
              e.vy = Math.sin(tang) * e.speed * 0.8 + ((p.y - e.y) / (d || 1)) * e.speed * 0.5 * radial;
              if (d < 52 && e.stateT <= 0) { e.state = "dive"; e.stateT = 0.55; e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d }; audio.swing(); }
            } else {
              e.stateT -= dt;
              e.vx = e.facing.x * e.speed * 2.2;
              e.vy = e.facing.y * e.speed * 2.2;
              if (e.stateT <= 0) { e.state = "hover"; e.stateT = 1.4; }
            }
          } else {
            e.vx = Math.sin(e.t * 1.2 + e.seed) * 30;
            e.vy = Math.cos(e.t * 0.9 + e.seed) * 24;
          }
          if (e.vx !== 0) e.facing = { x: e.vx >= 0 ? 1 : -1, y: 0 };
          break;
        }
        case "shroom": {
          const sees = e.aggro && d2p < 105 * 105 && this.hasLOS(e.x, e.y, p.x, p.y);
          if (sees) {
            e.facing = { x: Math.sign(p.x - e.x) || 1, y: 0 };
            if (d < 40) {
              e.vx = ((e.x - p.x) / d) * 40;
              e.vy = ((e.y - p.y) / d) * 40;
            }
            e.stateT -= dt;
            if (e.state === "cool") {
              if (e.stateT <= 0) { e.state = "charge"; e.stateT = 0.7; }
            } else if (e.state !== "charge") {
              e.state = "charge"; e.stateT = 0.7;
            } else if (e.stateT <= 0) {
              e.state = "cool"; e.stateT = 2.5;
              this.fireProjectile("spore", e.x, e.y - 4, ((p.x - e.x) / d) * 74, ((p.y - e.y) / d) * 74, 1);
              this.burst(e.x, e.y - 6, 0x6a8a3a, 5, 30, 0.5, 2, -14);
              audio.splash();
            }
          } else { e.state = "idle"; }
          break;
        }
        case "crawler": {
          if (e.hidden) {
            if (d2p < 40 * 40) {
              e.hidden = false;
              this.burst(e.x, e.y, 0x3a3226, 10, 60, 0.5, 2, 40);
              audio.splash();
              e.aggro = true;
            }
            break;
          }
          if (e.aggro) {
            if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
            if (d > stopD) { e.vx = e.facing.x * e.speed; e.vy = e.facing.y * e.speed; }
          }
          break;
        }
      }

      if (e.aggro && !e.hidden && e.contactCd <= 0) {
        const rr = e.r + p.r + 5;
        if (d2p < rr * rr) {
          this.damagePlayer(e.dmg, e.x, e.y);
          if (e.kind === "frost") p.slowT = 1.6;
          e.contactCd = 1.1;
        }
      }
    }
  }

  private followPath(e: Enemy, tx: number, ty: number, speed: number, dt: number) {
    e.repathT -= dt;
    if (e.repathT <= 0 || !e.path) {
      e.repathT = 0.45 + Math.random() * 0.25;
      try {
        const path = this.map.nav.findPath({ x: e.x, y: e.y }, { x: tx, y: ty });
        e.path = path ? path.map((pt) => ({ x: pt.x, y: pt.y })) : null;
        e.pathI = 0;
      } catch { e.path = null; }
    }
    let gx = tx, gy = ty;
    if (e.path && e.pathI < e.path.length) {
      const wp = e.path[e.pathI];
      if (dist2(e.x, e.y, wp.x, wp.y) < 5 * 5) e.pathI++;
      if (e.pathI < e.path.length) { gx = e.path[e.pathI].x; gy = e.path[e.pathI].y; }
    }
    const dx = gx - e.x, dy = gy - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) { e.vx = (dx / d) * speed; e.vy = (dy / d) * speed; }
  }

  /* ================= боссы ================= */
  private startDungeonBoss() {
    const m = this.map;
    const id = m.dungeonId;
    const e = this.spawnEnemy(m.bossReward === "axe" ? "reaper" : m.bossReward === "bow" ? "spider" : "giant", m.bossSpot.x, m.bossSpot.y);
    e.state = "enter"; e.stateT = 1.0;
    if (id === 0) e.seed = 1;
    this.bossRef = e;
    const d = this.doors[0];
    if (d) { d.locked = true; d.open = 0; }
    audio.horn();
    this.toast(`${m.dungeonName}: страж пробудился`);
    this.shakeIt(5);
    this.burst(e.x, e.y, 0x8fd0e0, 20, 100, 1.0, 2, 0);
    this.pushHud(true);
  }

  private updateReaper(e: Enemy, dt: number) {
    const p = this.player;
    e.stateT -= dt;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    const phase2 = e.hp <= e.maxHp / 2;
    const spd = phase2 ? 72 : e.speed;
    if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
    switch (e.state) {
      case "enter":
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = phase2 ? 1.4 : 2.2; }
        break;
      case "chase":
        if (d > e.r + p.r + 4) { e.vx = e.facing.x * spd; e.vy = e.facing.y * spd; }
        else { e.vx = 0; e.vy = 0; }
        if (e.stateT <= 0 || d < 30) { e.state = "wind"; e.stateT = phase2 ? 0.42 : 0.6; e.vx = e.vy = 0; audio.swing(); }
        break;
      case "wind":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "swing"; e.stateT = 0.26; audio.swing(); this.shakeIt(3); }
        break;
      case "swing":
        e.vx = e.vy = 0;
        if (e.contactCd <= 0 && d < 40) { this.damagePlayer(2, e.x, e.y); e.contactCd = 0.6; }
        if (e.stateT <= 0) {
          e.state = "stuck"; e.stateT = phase2 ? 1.25 : 1.8;
          this.burst(e.x + e.facing.x * 12, e.y + e.facing.y * 12, 0x39424e, 8, 50, 0.5, 2, 30);
        }
        break;
      case "stuck":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = phase2 ? 1.4 : 2.2; }
        break;
    }
    if (e.contactCd <= 0 && d < e.r + p.r + 4) { this.damagePlayer(1, e.x, e.y); e.contactCd = 1.1; }
    if (e.hp <= 0 && !e.dead) { e.dead = true; this.farBody(e.body); this.onDungeonBossDeath(e); }
  }

  private updateSpider(e: Enemy, dt: number) {
    const p = this.player;
    e.stateT -= dt;
    e.vx = 0; e.vy = 0;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
    if (e.state === "enter" && e.stateT <= 0) { e.state = "aim"; e.stateT = 1.2; }
    else if (e.state === "aim" && e.stateT <= 0) {
      const base = Math.atan2(p.y - e.y, p.x - e.x);
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.25;
        this.fireProjectile("spore", e.x, e.y - 6, Math.cos(a) * 110, Math.sin(a) * 110, 1);
      }
      audio.splash();
      e.state = "ring"; e.stateT = 1.8;
    } else if (e.state === "ring" && e.stateT <= 0) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.fireProjectile("spore", e.x, e.y - 6, Math.cos(a) * 85, Math.sin(a) * 85, 1);
      }
      audio.splash();
      e.state = "aim"; e.stateT = 1.4;
    }
    if (Math.random() < dt * 0.12 && this.enemies.filter((x) => !x.dead && x.kind === "crawler").length < 2) {
      const a = Math.random() * Math.PI * 2;
      const c = this.spawnEnemy("crawler", e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26);
      c.hidden = false; c.aggro = true;
      this.burst(c.x, c.y, 0x3a3226, 8, 50, 0.5, 2, 30);
    }
    if (e.hp <= 0 && !e.dead) { e.dead = true; this.farBody(e.body); this.onDungeonBossDeath(e); }
  }

  private updateGiant(e: Enemy, dt: number) {
    const p = this.player;
    e.stateT -= dt;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    const phase2 = e.hp <= e.maxHp / 2;
    const spd = phase2 ? 58 : e.speed;
    if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
    switch (e.state) {
      case "enter":
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = 2.0; }
        break;
      case "chase":
        if (d > e.r + p.r + 4) { e.vx = e.facing.x * spd; e.vy = e.facing.y * spd; }
        else { e.vx = 0; e.vy = 0; }
        if (e.stateT <= 0 || d < 34) { e.state = "wind"; e.stateT = phase2 ? 0.4 : 0.62; e.vx = e.vy = 0; audio.swing(); }
        break;
      case "wind":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) {
          e.state = "swing"; e.stateT = 0.3;
          this.slamZones.push({ x: p.x, y: p.y, r: 30, t: 0.55, boom: false });
          audio.hit(); this.shakeIt(4);
        }
        break;
      case "swing":
        e.vx = e.vy = 0;
        if (e.contactCd <= 0 && d < 46) { this.damagePlayer(2, e.x, e.y); e.contactCd = 0.7; }
        if (e.stateT <= 0) { e.state = "stuck"; e.stateT = phase2 ? 1.1 : 1.7; this.shakeIt(3); }
        break;
      case "stuck":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = 2.0; }
        break;
    }
    if (e.contactCd <= 0 && d < e.r + p.r + 4) { this.damagePlayer(2, e.x, e.y); e.contactCd = 1.1; }
    if (e.hp <= 0 && !e.dead) { e.dead = true; this.farBody(e.body); this.onDungeonBossDeath(e); }
  }

  private onDungeonBossDeath(e: Enemy) {
    const m = this.map;
    this.setDungeonBossDead(m.dungeonId);
    this.bossRef = null;
    audio.bossDie();
    this.shakeIt(8);
    this.burst(e.x, e.y, 0x8fd0e0, 30, 130, 1.2, 3, 0);
    this.burst(e.x, e.y, 0x0d0f14, 20, 90, 1.0, 3, -20);
    const reward = m.bossReward;
    if (reward) this.spawnDrop(reward, e.x, e.y);
    const d = this.doors[0];
    if (d) { d.locked = false; d.open = 0.01; audio.door(); }
    const msg: Record<string, string> = {
      axe: "Жнец пал. Ледяная Секира твоя — метай её на [J]",
      bow: "Корень иссох. Лук Сумерек твой — целься на [L]",
      hammer: "Великан рассыпался. Рунический Молот твой — меч оглушает",
    };
    this.toast(msg[reward ?? "axe"]);
    this.tsTarget = 0.3;
    window.setTimeout(() => { this.tsTarget = 1; }, 900);
    this.pushHud(true);
  }

  private startSnakeBattle() {
    if (this.flags.snakeStarted) return;
    this.flags.snakeStarted = true;
    const m = this.map;
    const e = this.spawnEnemy("snake", m.snakeSpot.x, m.snakeSpot.y - 10);
    e.state = "closed"; e.stateT = 2.4; e.seed = 0.9;
    this.bossRef = e;
    audio.horn();
    this.toast("МИРАЖ ЁРМУНГАНДА");
    this.shakeIt(8);
    this.burst(e.x, e.y, 0x24352c, 26, 120, 1.2, 3, 0);
    this.pushHud(true);
  }

  private updateSnake(e: Enemy, dt: number) {
    const p = this.player;
    e.stateT -= dt;
    e.vx = 0; e.vy = 0;
    const mouthX = e.x + Math.sin(this.realT * 1.6) * 4;
    const mouthY = e.y - 2;
    if (e.state === "closed") {
      if (e.stateT <= 1.5 && e.seed > 0.5) {
        e.seed = 0.2;
        const base = Math.atan2(p.y - mouthY, p.x - mouthX);
        for (let i = -1; i <= 1; i++) {
          const a = base + i * 0.3;
          this.fireProjectile("fire", mouthX, mouthY, Math.cos(a) * 84, Math.sin(a) * 84, 1);
        }
        audio.splash();
      }
      if (e.stateT <= 0.7 && e.seed < 0.5) {
        e.seed = -1;
        this.slamZones.push(
          { x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 30, r: 26, t: 0.9, boom: false },
          { x: p.x + (Math.random() - 0.5) * 60, y: p.y + (Math.random() - 0.5) * 60, r: 22, t: 0.9, boom: false },
        );
        audio.locked();
      }
      if (e.stateT <= 0) { e.state = "open"; e.stateT = 3.0; audio.chime(); }
    } else if (e.state === "open") {
      if (e.stateT <= 0) { e.state = "closed"; e.stateT = 3.8; e.seed = 1; }
    }
    for (let i = this.slamZones.length - 1; i >= 0; i--) {
      const z = this.slamZones[i];
      z.t -= dt;
      if (z.t <= 0 && !z.boom) {
        z.boom = true;
        this.burst(z.x, z.y, 0xe08a3c, 14, 90, 0.7, 2, 30);
        this.shakeIt(5);
        audio.hit();
        if (dist2(p.x, p.y, z.x, z.y) < z.r * z.r) this.damagePlayer(1, z.x, z.y);
      }
      if (z.boom && z.t < -0.25) this.slamZones.splice(i, 1);
    }
  }

  /* ================= снаряды ================= */
  private pointSolid(x: number, y: number): boolean {
    return solidTileAt(this.map, Math.floor(x / T), Math.floor(y / T)) ||
      this.solidRects().some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  }

  private updateProjectiles(dt: number) {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.life <= 0) { this.removeProjectile(i); continue; }
      pr.spin += dt * 18;
      if (pr.kind === "axe") {
        if (!pr.returning) {
          pr.dist += Math.hypot(pr.vx, pr.vy) * dt;
          if (pr.dist > 130 || this.pointSolid(pr.x + pr.vx * dt, pr.y + pr.vy * dt)) pr.returning = true;
        }
        if (pr.returning) {
          const dx = p.x - pr.x, dy = p.y - 2 - pr.y;
          const d = Math.hypot(dx, dy) || 1;
          pr.vx = (dx / d) * 240; pr.vy = (dy / d) * 240;
          if (d < 12) {
            this.axeState = "ready"; this.axeProj = null;
            audio.pickup();
            this.removeProjectile(i);
            continue;
          }
        }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.g.position.set(pr.x, pr.y);
      if (pr.kind !== "axe" && this.pointSolid(pr.x, pr.y)) {
        this.burst(pr.x, pr.y, 0x6e7f8d, 4, 40, 0.3, 1, 0);
        this.removeProjectile(i);
        continue;
      }
      if (pr.kind === "arrow" || pr.kind === "axe") {
        let consumed = false;
        for (const e of this.enemies) {
          if (e.dead || e.hidden) continue;
          if (e.kind === "snake") {
            if (e.state === "open") {
              const ex = e.x + Math.sin(this.realT * 1.6) * 4, ey = e.y - 8;
              if (dist2(pr.x, pr.y, ex, ey) < 11 * 11) { this.damageSnake(e); consumed = true; break; }
            } else if (dist2(pr.x, pr.y, e.x, e.y) < (e.r + 6) * (e.r + 6)) {
              audio.clang(); consumed = true; break;
            }
            continue;
          }
          const rr = pr.r + e.r;
          if (dist2(pr.x, pr.y, e.x, e.y) < rr * rr) {
            if (pr.kind === "axe") {
              e.freezeT = 2.6;
              audio.freeze();
              this.burst(e.x, e.y, 0x9fe0ee, 12, 70, 0.7, 2, -10);
              this.float(e.x, e.y, "Заморожен", 0x9fe0ee);
              if (e.kind === "raven" || e.kind === "crawler") this.hitEnemy(e, pr.dmg, pr.x, pr.y, true);
            } else {
              this.hitEnemy(e, pr.dmg, pr.x, pr.y, true);
            }
            consumed = true;
            break;
          }
        }
        if (consumed) {
          if (pr.kind === "axe") pr.returning = true;
          else this.removeProjectile(i);
          continue;
        }
      } else {
        const rr = pr.r + p.r;
        if (p.hurtT <= 0 && dist2(pr.x, pr.y, p.x, p.y) < rr * rr) {
          this.damagePlayer(pr.dmg, pr.x, pr.y);
          this.removeProjectile(i);
          continue;
        }
      }
    }
  }

  /* ================= предметы ================= */
  private spawnDrop(kind: DropKind, x: number, y: number) {
    const d: Drop = { kind, x, y, t: Math.random() * 5, taken: false, magnet: kind === "heart" || kind === "arrows", g: new Graphics() };
    d.g.position.set(x, y);
    this.drops.push(d); this.dynamic.addChild(d.g);
  }

  private updateDrops(dt: number) {
    const p = this.player;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.taken) continue;
      d.t += dt;
      const d2 = dist2(d.x, d.y, p.x, p.y);
      if (d.magnet && d2 < 34 * 34 && d2 > 1) {
        const dd = Math.sqrt(d2);
        d.x += ((p.x - d.x) / dd) * 120 * dt;
        d.y += ((p.y - d.y) / dd) * 120 * dt;
        d.g.position.set(d.x, d.y);
      }
      if (d2 < 11 * 11) this.collectDrop(d, i);
    }
  }

  private collectDrop(d: Drop, i: number) {
    d.taken = true;
    if (d.ambientIdx !== undefined) this.takenAmbient.add(d.ambientIdx);
    d.g.destroy();
    this.drops.splice(i, 1);
    const p = this.player;
    const f = this.flags;
    switch (d.kind) {
      case "heart":
        if (p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 3);
          audio.pickup();
          this.float(p.x, p.y - 10, "+3", 0x7ee2a8);
          this.burst(p.x, p.y, 0x7ee2a8, 6, 40, 0.6, 2, -20);
        } else if (f.hearts < 9) {
          f.hearts++;
          audio.pickup();
          this.float(p.x, p.y - 10, "В суму [F]", 0x8fd8e8);
        } else {
          this.float(p.x, p.y, "Сума полна", 0x6e7f8d);
          return;
        }
        break;
      case "arrows":
        f.arrows += 5;
        audio.pickup();
        this.float(p.x, p.y - 10, "+5 стрел", 0xc9a24b);
        break;
      case "axe":
        f.hasAxe = true;
        audio.rune();
        this.toast("Ледяная Секира [J] — замораживает врагов и возвращается");
        this.burst(p.x, p.y, 0x9fe0ee, 20, 100, 1.0, 2, -10);
        break;
      case "bow":
        f.hasBow = true;
        audio.rune();
        this.toast("Лук Сумерек [удерживай L] — время замирает, стрела летит");
        this.burst(p.x, p.y, 0xe8c979, 20, 100, 1.0, 2, -10);
        break;
      case "hammer":
        f.hasHammer = true;
        audio.rune();
        this.toast("Рунический Молот — удары меча оглушают врагов");
        this.burst(p.x, p.y, 0x63d8c8, 20, 100, 1.0, 2, -10);
        break;
      case "bear":
        f.bear = true; audio.pickup();
        this.toast("Медвежонок из болота. Дочь ждёт его в Чёрном Лесу");
        break;
      case "horn":
        f.horn = true; audio.pickup();
        this.toast("Рог Сигрид. Отнеси его в Воронью Гавань");
        break;
      case "mead":
        f.mead = true; audio.pickup();
        this.toast("Дикий мёд. Астрид будет рада");
        break;
      case "ore":
        f.ore = true; audio.pickup();
        this.toast("Сердце горы. Харальд заждался");
        break;
      case "moss":
        f.moss = true; audio.pickup();
        this.toast("Болотный мох. Шаману пригодится");
        break;
      case "amber":
        f.amber = true; audio.pickup();
        this.toast("Горный янтарь. Шаману пригодится");
        break;
      case "flower":
        f.flower = true; audio.pickup();
        this.toast("Могильный цветок. Шаману пригодится");
        break;
      case "diary":
        f.diary = true; audio.pickup();
        this.toast("Дневник старосты сожжённой деревни");
        break;
      case "bundle":
        f.bundle = true; audio.pickup();
        this.toast("Потерянный тюк Фьолнира");
        break;
      case "relic":
        f.relic = true; audio.pickup();
        this.toast("Реликвия мёртвых. Древний алтарь зовёт");
        break;
      case "shard":
        f.arrows += 3;
        audio.pickup();
        this.float(p.x, p.y - 10, "+3 стрел", 0xbdeef8);
        break;
      case "bones":
        f.arrows += 2; p.hp = Math.min(p.maxHp, p.hp + 1);
        audio.pickup();
        this.float(p.x, p.y - 10, "Припасы", 0xcdd6dc);
        break;
      case "rune":
        f.runes++;
        audio.rune();
        this.shakeIt(3);
        this.toast(`Забытая Руна ${f.runes}/5 впитана`);
        this.burst(p.x, p.y, 0x63d8c8, 22, 110, 1.1, 2, -14);
        this.tsTarget = 0.35;
        window.setTimeout(() => { this.tsTarget = 1; }, 700);
        break;
    }
    this.pushHud(true);
  }

  /* ================= взаимодействие ================= */
  private nearestInteractable(): { kind: string; ref: any; x: number; y: number } | null {
    if (!this.map) return null;
    const p = this.player;
    let best: { kind: string; ref: any; x: number; y: number } | null = null;
    let bd = 22 * 22;
    const consider = (kind: string, ref: any, x: number, y: number) => {
      const d2 = dist2(x, y, p.x, p.y);
      if (d2 < bd) { bd = d2; best = { kind, ref, x, y }; }
    };
    for (const n of this.npcs) consider("npc", n, n.x, n.y);
    for (const c of this.chests) if (!c.opened) consider("chest", c, c.x, c.y);
    for (const pd of this.pedestals) if (!pd.taken) consider("pedestal", pd, pd.x, pd.y);
    this.shrines.forEach((s, i) => consider("shrine", { s, i }, s.x, s.y));
    if (this.altar && this.flags.runes >= 5 && !this.flags.snakeStarted) consider("altar", this.altar, this.altar.x, this.altar.y);
    if (this.flags.relic && !this.flags.atoneDone && !this.map.isDungeon) {
      consider("oldAltar", null, this.map.oldAltar.x * T + 8, this.map.oldAltar.y * T + 8);
    }
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (tileAt(this.map, tx + dx, ty + dy) === Tl.STAIRS) {
        consider("stairs", null, (tx + dx) * T + 8, (ty + dy) * T + 8);
      }
    }
    return best;
  }

  private tryInteract() {
    const hit = this.nearestInteractable();
    if (!hit) return;
    audio.uiClick();
    switch (hit.kind) {
      case "npc": this.startDialogue(hit.ref.id); break;
      case "chest": this.openChest(hit.ref); break;
      case "pedestal": this.takePedestal(hit.ref); break;
      case "shrine": this.useShrine(hit.ref.i); break;
      case "altar": this.startSnakeBattle(); break;
      case "oldAltar": {
        if (this.flags.relic && !this.flags.atoneDone) {
          this.flags.relic = false;
          this.flags.atoneDone = true;
          this.flags.nornsFavor = true;
          this.player.maxHp += 2; this.player.hp = this.player.maxHp;
          audio.rune();
          this.shakeIt(3);
          this.toast("Норны приняли дар: пьедесталы Рун видны на карте");
          this.burst(this.map.oldAltar.x * T + 8, this.map.oldAltar.y * T + 8, 0x63d8c8, 24, 110, 1.1, 2, -14);
          this.pushHud(true);
        }
        break;
      }
      case "stairs":
        if (this.map.isDungeon) this.exitToOverworld(this.map.exitSpot);
        else this.enterDungeon();
        break;
    }
  }

  private openChest(c: ChestRt) {
    c.opened = true;
    this.openedChests.add(Math.round((c.x - 8) / T) + "_" + Math.round((c.y - 8) / T));
    this.renderers.chest.render(c.g, { opened: true } as IChestData);
    audio.chest();
    this.burst(c.x, c.y - 6, 0xc9a24b, 14, 70, 0.8, 2, -20);
    switch (c.item) {
      case "bow":
        this.flags.hasBow = true;
        this.toast("Лук Сумерек [удерживай L] — время замирает, стрела летит");
        break;
      case "arrows":
        this.flags.arrows += 10;
        this.toast("+10 стрел");
        break;
      case "heartPiece":
        this.player.maxHp += 2;
        this.player.hp = this.player.maxHp;
        this.toast("Осколок жизни: максимальное здоровье +2");
        audio.rune();
        break;
      case "key":
        this.flags.hasKey = true;
        this.toast("Ключ стража. Дверь впереди ждёт");
        break;
    }
    this.pushHud(true);
  }

  private takePedestal(pd: PedestalRt) {
    if (pd.guardsLeft > 0) {
      audio.locked();
      this.float(pd.x, pd.y - 14, "Печать крепка", 0xa03232);
      if (!pd.guardsSpawned) {
        pd.guardsSpawned = true;
        const def = this.map.pedestals[this.pedestals.indexOf(pd)];
        for (const k of def.guards) {
          const a = Math.random() * Math.PI * 2;
          const e = this.spawnEnemy(k, pd.x + Math.cos(a) * 26, pd.y + Math.sin(a) * 26);
          e.aggro = true;
          e.guardOf = this.pedestals.indexOf(pd);
          this.burst(e.x, e.y, 0xe05050, 8, 60, 0.6, 2, 0);
        }
        this.toast("Стражи пьедестала восстали!");
        audio.horn();
      }
      return;
    }
    pd.taken = true;
    this.takenPedestals.add(this.pedestals.indexOf(pd));
    audio.chime();
    this.spawnDrop("rune", pd.x, pd.y - 6);
    this.burst(pd.x, pd.y - 6, 0x63d8c8, 16, 80, 0.9, 2, -10);
  }

  private useShrine(i: number) {
    this.flags.shrineIdx = i;
    const firstVisit = !this.map.isDungeon && !this.visitedShrines.has(i);
    if (firstVisit) {
      this.visitedShrines.add(i);
      this.revealQuest("s_shrines");
    }
    this.player.hp = this.player.maxHp;
    audio.chime();
    audio.heal();
    this.toast("Святилище запомнило тебя. Раны затянулись");
    this.burst(this.player.x, this.player.y, 0x8fd8e8, 16, 70, 1.0, 2, -20);
    this.pushHud(true);
  }

  private dungeonUnlocked(id: number): { ok: boolean; req: string } {
    const f = this.flags;
    if (id === 0) return { ok: f.hasSword, req: "Эйрик должен вручить тебе клинок" };
    if (id === 1) return { ok: f.hasAxe, req: "Путь преграждают корни — нужна Ледяная Секира" };
    return { ok: f.runes >= 5, req: `Крепость запечатана — нужно ещё ${5 - f.runes} Рун` };
  }

  private nearestDungeonEntry(): { id: number; name: string } | null {
    let best: { id: number; name: string } | null = null;
    let bd = 40 * 40;
    for (const en of this.ow.dungeonEntries) {
      const d2 = dist2(en.x * T + 8, en.y * T + 8, this.player.x, this.player.y);
      if (d2 < bd) { bd = d2; best = { id: en.id, name: en.name }; }
    }
    return best;
  }

  private enterDungeon() {
    if (this.flags.snakeStarted && !this.flags.snakeDead) return;
    const entry = this.nearestDungeonEntry();
    if (!entry) return;
    const gate = this.dungeonUnlocked(entry.id);
    if (!gate.ok) { audio.locked(); this.toast(gate.req); return; }
    const dun = this.dungeons[entry.id];
    audio.door();
    this.fadeTo(1);
    this.loadMap(dun, dun.spawn);
    this.fadeTo(0);
    this.toast(`${entry.name}. Найди ключ — и дверь к стражу`);
  }

  private exitToOverworld(spawn: Vec) {
    audio.door();
    this.fadeTo(1);
    this.loadMap(this.ow, spawn);
    this.fadeTo(0);
  }

  /* ================= туман ================= */
  private updateFog(dt: number, rdt: number) {
    if (this.map.isDungeon || this.flags.snakeDead) {
      this.fogRadius += (2600 - this.fogRadius) * Math.min(1, rdt * 2);
      return;
    }
    if (!this.fogActive) {
      this.fogTimer -= dt;
      this.fogRadius += (2600 - this.fogRadius) * Math.min(1, rdt * 2);
      if (!this.fogWarned && this.fogTimer < 4 && this.fogTimer > 0 && this.flags.hasSword) {
        this.fogWarned = true;
        audio.setFog(true);
        audio.horn();
        this.toast("Ветер стихает... Туман близко");
      }
      if (this.fogTimer <= 0 && this.flags.hasSword) {
        this.fogActive = true;
        this.fogLeft = 13;
        this.fogSpawned = false;
        audio.setFog(true);
        this.toast("ВОЛНА ТУМАНА. Ниды шепчут...");
      }
    } else {
      this.fogLeft -= dt;
      this.fogRadius += (78 - this.fogRadius) * Math.min(1, rdt * 1.4);
      if (!this.fogSpawned && this.fogLeft < 11.5) {
        this.fogSpawned = true;
        const p = this.player;
        for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 120 + Math.random() * 70;
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          const tx = Math.floor(x / T), ty = Math.floor(y / T);
          if (!solidTileAt(this.map, tx, ty) && x > T && y > T && x < (this.map.W - 1) * T && y < (this.map.H - 1) * T) {
            const e = this.spawnEnemy(Math.random() < 0.6 ? "frost" : "draugr", x, y);
            e.aggro = true;
            this.burst(x, y, 0x9fe0ee, 10, 60, 0.7, 2, 0);
          }
        }
      }
      if (this.fogLeft <= 0) {
        this.fogActive = false;
        this.fogWarned = false;
        this.fogTimer = (36 - this.flags.runes * 4) + Math.random() * 14;
        audio.setFog(false);
        this.toast("Туман рассеялся");
      }
    }
  }

  /* ================= квесты ================= */
  private mainQuestId(): string {
    const f = this.flags;
    if (!f.hasSword) return "m1";
    if (!f.reaperDead) return "m2";
    if (!f.spiderDead) return "m3";
    if (f.runes < 5) return "m4";
    if (!f.giantDead) return "m5";
    return "m6";
  }

  private questDefs(): { id: string; title: string; main: boolean }[] {
    return [
      { id: "m1", title: "Пробуждение", main: true },
      { id: "m2", title: "Первый Зов", main: true },
      { id: "m3", title: "Голос Леса", main: true },
      { id: "m4", title: "Забытые Руны", main: true },
      { id: "m5", title: "Горная Разруха", main: true },
      { id: "m6", title: "Рагнарёк", main: true },
      { id: "s_bear", title: "Игрушка для Дочери", main: false },
      { id: "s_horn", title: "Пропавший рог", main: false },
      { id: "s_mead", title: "Лучший мёд", main: false },
      { id: "s_ore", title: "Сердце горы", main: false },
      { id: "s_moss", title: "Отвар Норн", main: false },
      { id: "s_diary", title: "Тайна Сожжённой Деревни", main: false },
      { id: "s_cull", title: "Волк и Кость", main: false },
      { id: "s_bundle", title: "Потерянный груз", main: false },
      { id: "s_atone", title: "Эхо мёртвых", main: false },
      { id: "s_shrines", title: "Паломничество", main: false },
      { id: "s_hunt", title: "Зачистка Нидов", main: false },
    ];
  }

  private questDesc(id: string): { desc: string; done: boolean } {
    const f = this.flags;
    switch (id) {
      case "m1": return { desc: "Поговори с Эйриком Старшим — он вернёт твой клинок", done: f.hasSword };
      case "m2": return { desc: "Спустись в Склеп Хранителя (Руины) и срази Жнеца", done: f.reaperDead };
      case "m3": return { desc: "В Корне Иггдрасиля (Чёрный Лес) одолей Паука", done: f.spiderDead };
      case "m4": return { desc: `Собери Забытые Руны (${f.runes}/5) — сними печати пьедесталов`, done: f.runes >= 5 };
      case "m5": return { desc: "Штурмуй Каменную Крепость (Горы) и сокруши Великана", done: f.giantDead };
      case "m6": return { desc: "Сыграй Песнь Разрыва у Древа и убей Мираж Ёрмунганда", done: f.snakeDead };
      case "s_bear": {
        if (f.bearGone) return { desc: "Медвежонок вернулся к Безымянной Дочери", done: true };
        if (f.bear) return { desc: "Верни медвежонка Дочери в Чёрном Лесу", done: false };
        return { desc: "Найди медвежонка на дне болота", done: false };
      }
      case "s_horn": {
        if (f.hornDone) return { desc: "Рог Сигрид вернулся, секира наточена", done: true };
        if (f.horn) return { desc: "Отнеси рог Сигрид в Воронью Гавань", done: false };
        return { desc: "Найди рог Сигрид в горах", done: false };
      }
      case "s_mead": {
        if (f.meadDone) return { desc: "Зелье из дикого мёда сварено", done: true };
        if (f.mead) return { desc: "Отнеси мёд Астрид", done: false };
        return { desc: "Добудь дикий мёд в Чёрном Лесу", done: false };
      }
      case "s_ore": {
        if (f.oreDone) return { desc: "Меч закалён Сердцем горы", done: true };
        if (f.ore) return { desc: "Отнеси руду Харальду", done: false };
        return { desc: "Подбери Сердце горы после падения Великана", done: false };
      }
      case "s_moss": {
        if (f.shamanDone) return { desc: "Отвар Норн выпит, Руна Ярости твоя", done: true };
        const got = [f.moss, f.amber, f.flower].filter(Boolean).length;
        return { desc: `Собери шаману мох, янтарь и цветок (${got}/3)`, done: false };
      }
      case "s_diary": {
        if (f.refugeeDone) return { desc: "Дневник прочитан, тайник отмечен", done: true };
        if (f.diary) return { desc: "Отнеси дневник Беженке Гюнн", done: false };
        return { desc: "Найди дневник старосты в Сожжённой Деревне", done: false };
      }
      case "s_cull": {
        const v = Math.min(4, f.killsByKind["varg"] ?? 0), dr = Math.min(4, f.killsByKind["draugr"] ?? 0);
        if (f.cullDone) return { desc: "Бранд доволен", done: true };
        return { desc: `Прореди варгов (${v}/4) и драугров (${dr}/4)`, done: false };
      }
      case "s_bundle": {
        if (f.merchantDone) return { desc: "Фьолнир получил свой тюк", done: true };
        if (f.bundle) return { desc: "Отнеси тюк торговцу Фьолниру", done: false };
        return { desc: "Найди оброненный тюк на тракте", done: false };
      }
      case "s_atone": {
        if (f.atoneDone) return { desc: "Норны приняли дар", done: true };
        if (f.relic) return { desc: "Возложи реликвию на древний алтарь", done: false };
        return { desc: "Найди реликвию мёртвых в пустоши", done: false };
      }
      case "s_shrines": return {
        desc: `Зажги все святилища Нидов (${this.visitedShrines.size}/${this.ow ? this.ow.shrines.length : 4})`,
        done: f.shrineQuestDone,
      };
      case "s_hunt": return {
        desc: `Истреби порождений петли (${Math.min(12, f.kills)}/12)`,
        done: f.huntDone,
      };
      default: return { desc: "", done: false };
    }
  }

  private buildQuests(): QuestView[] {
    return this.questDefs()
      .filter((q) => this.revealed.has(q.id))
      .map((q) => {
        const { desc, done } = this.questDesc(q.id);
        return { id: q.id, title: q.title, desc, main: q.main, done, tracked: this.trackedQuest === q.id };
      });
  }

  private revealQuest(id: string, silent = false) {
    if (this.revealed.has(id)) return;
    this.revealed.add(id);
    const def = this.questDefs().find((q) => q.id === id);
    if (def && !silent) { audio.quest(); this.toast(`Новый квест: ${def.title}`); }
    this.pushHud(true);
  }

  private checkQuestProgress() {
    const cur = this.mainQuestId();
    if (cur !== this.lastMain) {
      this.lastMain = cur;
      this.revealQuest(cur, true);
      const def = this.questDefs().find((q) => q.id === cur);
      if (def) { this.toast(`Новая цель саги: ${def.title}`); audio.quest(); }
      const { done } = this.questDesc(this.trackedQuest);
      if (done) this.trackedQuest = cur;
      this.pushHud(true);
    }
    const f = this.flags;
    if (!f.huntDone && f.kills >= 12) {
      f.huntDone = true;
      f.arrows += 10;
      audio.chime();
      this.toast("Зачистка Нидов: дух-ворон принёс +10 стрел");
      this.pushHud(true);
    }
    if (!f.shrineQuestDone && this.ow && this.visitedShrines.size >= this.ow.shrines.length) {
      f.shrineQuestDone = true;
      this.player.maxHp += 2;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
      audio.rune();
      this.toast("Паломничество завершено: максимальное здоровье +2");
      this.pushHud(true);
    }
  }

  private trackedTarget(): Vec | null {
    if (!this.map) return null;
    const m = this.map;
    const f = this.flags;
    const px = (v: Vec) => ({ x: v.x * T + 8, y: v.y * T + 8 });
    const nearestOf = (pts: Vec[]): Vec | null => {
      let best: Vec | null = null; let bd = Infinity;
      for (const pt of pts) {
        const d2 = dist2(pt.x, pt.y, this.player.x, this.player.y);
        if (d2 < bd) { bd = d2; best = pt; }
      }
      return best;
    };
    const dungeonTarget = (id: number): Vec | null => {
      if (m.isDungeon) {
        return m.dungeonId === id
          ? { x: m.bossRoom.x + m.bossRoom.w / 2, y: m.bossRoom.y + m.bossRoom.h / 2 }
          : null;
      }
      const en = this.ow.dungeonEntries.find((e) => e.id === id);
      return en ? px(en) : null;
    };
    const npcSpot = (id: string): Vec | null => {
      const n = this.ow.npcs.find((x) => x.id === id);
      return n ? px(n) : null;
    };
    switch (this.trackedQuest) {
      case "m1": return m.isDungeon ? null : npcSpot("eirik") ?? px(m.villageA);
      case "m2": return dungeonTarget(0);
      case "m3": return dungeonTarget(1);
      case "m4": {
        if (m.isDungeon) return null;
        return nearestOf(this.pedestals.filter((p) => !p.taken).map((p) => ({ x: p.x, y: p.y })));
      }
      case "m5": return dungeonTarget(2);
      case "m6": return this.bossRef ? { x: this.bossRef.x, y: this.bossRef.y } : (m.isDungeon ? null : px(m.treeAltar));
      case "s_bear": {
        if (m.isDungeon || f.bearGone) return null;
        if (f.bear) return npcSpot("daughter");
        return px(m.bearSpot);
      }
      case "s_horn": {
        if (m.isDungeon || f.hornDone) return null;
        if (f.horn) return npcSpot("sigrid");
        return px(m.hornSpot);
      }
      case "s_mead": {
        if (m.isDungeon || f.meadDone) return null;
        if (f.mead) return npcSpot("astrid");
        return px(m.meadSpot);
      }
      case "s_ore": {
        if (m.isDungeon || f.oreDone) return null;
        if (f.ore) return npcSpot("harald");
        return px(m.oreSpot);
      }
      case "s_moss": {
        if (m.isDungeon || f.shamanDone) return null;
        if (f.moss && f.amber && f.flower) return npcSpot("shaman");
        const spots: Vec[] = [];
        if (!f.moss) spots.push(px(m.mossSpot));
        if (!f.amber) spots.push(px(m.amberSpot));
        if (!f.flower) spots.push(px(m.flowerSpot));
        return nearestOf(spots);
      }
      case "s_diary": {
        if (m.isDungeon || f.refugeeDone) return null;
        if (f.diary) return npcSpot("refugee");
        return px(m.diarySpot);
      }
      case "s_cull": {
        const alive = this.enemies.filter((e) => !e.dead && (e.kind === "varg" || e.kind === "draugr"));
        return alive.length ? nearestOf(alive.map((e) => ({ x: e.x, y: e.y }))) : null;
      }
      case "s_bundle": {
        if (m.isDungeon || f.merchantDone) return null;
        if (f.bundle) return npcSpot("merchant");
        return px(m.bundleSpot);
      }
      case "s_atone": {
        if (m.isDungeon || f.atoneDone) return null;
        if (f.relic) return px(m.oldAltar);
        return px(m.relicSpot);
      }
      case "s_shrines": {
        if (m.isDungeon) return null;
        const unv = m.shrines.filter((_, i) => !this.visitedShrines.has(i)).map((s) => px(s));
        return unv.length ? nearestOf(unv) : null;
      }
      case "s_hunt": {
        const alive = this.enemies.filter((e) => !e.dead && e.kind !== "snake");
        if (!alive.length) return null;
        return nearestOf(alive.map((e) => ({ x: e.x, y: e.y })));
      }
      default: return null;
    }
  }

  private trackedTitle(): string {
    const def = this.questDefs().find((q) => q.id === this.trackedQuest);
    return def ? def.title : "Сага";
  }

  /* ================= диалоги ================= */
  private startDialogue(id: string) {
    const d = this.dialogueFor(id);
    if (!d) return;
    this.dialogueActive = true;
    this.lastDialogueId = id;
    this.talkCount++;
    const sig = this.npcSig(id);
    if (sig) this.talkedSig.set(id, sig);
    const gives: Record<string, string> = {
      daughter: "s_bear", sigrid: "s_horn", astrid: "s_mead",
      shaman: "s_moss", refugee: "s_diary", brand: "s_cull", merchant: "s_bundle",
    };
    if (gives[id]) this.revealQuest(gives[id], true);
    if (id === "harald" && this.flags.giantDead) this.revealQuest("s_ore", true);
    audio.uiClick();
    this.cbs.onDialogue(d);
  }

  private dialogueFor(id: string): DialogueData | null {
    const f = this.flags;
    switch (id) {
      case "eirik": {
        let lines: string[];
        if (!f.hasSword) lines = [
          "Ты очнулся, Варлок. Снова.",
          "Когда волна выбросила тебя на берег, в руке ты сжимал этот клинок.",
          "Он был при тебе в час смерти — значит, он твой по праву петли.",
          "Возьми Ржавый Меч обратно. Без стали у воина нет и смерти.",
        ];
        else if (!f.reaperDead) lines = [
          "Клинок вспомнил твою руку.",
          "В Руинах Времени зияет Склеп Хранителя. Жнец стережёт порог.",
          "Убей его — и ледяная сталь станет твоей.",
        ];
        else if (!f.spiderDead) lines = [
          "Жнец пал... а петля всё крутится.",
          "В чаще Чёрного Леса гниёт Корень Иггдрасиля — Паук свил в нём гнездо.",
          "Одолей его, и Лук Сумерек станет твоим.",
        ];
        else if (f.runes < 5) lines = [
          `Забытых Рун пять, и ты нашёл ${f.runes}.`,
          "Каждую стерегут мёртвые. Печать падает вместе с ними.",
          "Спеши, Варлок. Древо гниёт.",
        ];
        else if (!f.giantDead) lines = [
          "Все пять Рун поют в твоей крови.",
          "Осталось одно: в Горах стоит Каменная Крепость, а в ней — Великан.",
          "Сокруши его, и молот богов станет твоим.",
        ];
        else lines = [
          "Три стража пали, и молот гудит в твоей руке.",
          "Иди к корням Иггдрасиля и сыграй Песнь Разрыва.",
          "И помни: пробудив Змея, ты разбудишь и всех нас... навсегда.",
        ];
        return { id, name: "Эйрик Старший", lines };
      }
      case "astrid": {
        if (f.meadDone) return { id, name: "Астрид", lines: ["Зелье из того мёда ещё варится.", "А пока — дай залатаю твои раны."] };
        if (f.mead) return { id, name: "Астрид", lines: ["Дикий мёд! Из него выйдет славное зелье силы.", "Отдай его мне — и я сделаю тебя крепче."] };
        return { id, name: "Астрид", lines: [
          "Постой спокойно, Варлок.",
          "Я залатаю твою душу, сколько смогу.",
          "Если добудешь дикий мёд в Чёрном Лесу — сварила бы зелье покрепче.",
        ] };
      }
      case "harald": {
        if (f.oreDone) return { id, name: "Харальд", lines: ["Твой клинок теперь поёт.", "Когда-то я ковал для живых. Теперь кую память о них."] };
        if (f.ore) return { id, name: "Харальд", lines: ["Сердце горы! Жаркое, как в день Рагнарёка.", "Отдай его — и я закалю твой меч."] };
        if (f.giantDead) return { id, name: "Харальд", lines: ["Слышал, Великан рассыпался в прах.", "В его останках должно быть Сердце горы. Принеси — закалю твой меч."] };
        const lore = [
          ["Когда-то я ковал для живых.", "Теперь кую память о них.", "Принеси мне бой — я выкую тебе славу."],
          ["Драугр держит щит к лицу. Бей сбоку — или заморозь и разбей."],
          ["Волны Тумана — это дыхание Змея. В тумане ходят его лучшие кошмары."],
          ["Гунгнира не будет. Копьё сломали ещё до петли.", "Но и клыка хватит, чтобы проткнуть глаз Миража."],
        ];
        return { id, name: "Харальд", lines: lore[this.talkCount % lore.length] };
      }
      case "raven": {
        const tips: Record<string, string> = {
          m1: "Кар-р! Поговори с Эйриком — он вернёт твой клинок!",
          m2: "Кар-р! Лестница в Склеп — в Руинах Времени. Жнец уязвим, когда коса в полу!",
          m3: "Кар-р! Корень Иггдрасиля — в чаще Чёрного Леса. Паук плюется кольцами!",
          m4: "Кар-р! Пьедесталы светятся бирюзой. Убей всех стражей печати.",
          m5: "Кар-р! Каменная Крепость — в Горах. Великан медленен, но не стой под кулаком!",
          m6: "Кар-р! Бей в глаз, когда пасть открыта!",
        };
        return { id, name: "Ворон-Говорун", lines: [tips[this.mainQuestId()] ?? "Кар-р!"] };
      }
      case "daughter": {
        if (f.bearGone) return { id, name: "Безымянная Дочь", lines: ["Спасибо... Мишка снова со мной.", "Когда петля лопнет — я не боюсь."] };
        if (f.bear) return { id, name: "Безымянная Дочь", lines: ["Он здесь! Я чувствую его запах болота!", "Возьми мою слезу, Варлок. Она сделает тебя крепче."] };
        return { id, name: "Безымянная Дочь", lines: ["Ты пахнешь живым миром...", "Мой медвежонок утонул в болоте, на востоке.", "Принеси его. Пожалуйста."] };
      }
      case "sigrid": {
        if (f.hornDone) return { id, name: "Сигрид", lines: ["Рог поёт на своём месте.", "Твоя секира теперь режет и мороз."] };
        if (f.horn) return { id, name: "Сигрид", lines: ["Ты нашёл его! Мой рог!", "В благодарность я наточу твою секиру о ледяной камень."] };
        return { id, name: "Сигрид", lines: ["Варги утащили мой сигнальный рог в горы.", "Без него Гавань нема перед туманом.", "Верни его — и я отплачу."] };
      }
      case "brand": {
        if (f.cullDone) return { id, name: "Бранд", lines: ["Хорошая была охота.", "Держись, Варлок."] };
        const ok = (f.killsByKind["varg"] ?? 0) >= 4 && (f.killsByKind["draugr"] ?? 0) >= 4;
        if (ok) return { id, name: "Бранд", lines: ["Вижу, волки и мертвецы тебя боятся.", "Это заслуживает награды."] };
        return { id, name: "Бранд", lines: ["Волки совсем обнаглели, и драугры с ними.", "Проредишь четверых волков и четверых мертвецов — отплачу."] };
      }
      case "shaman": {
        if (f.shamanDone) return { id, name: "Шаман Ульв", lines: ["Отвар подействовал. Чувствуешь?", "Ярость — тоже оружие, Варлок."] };
        const got = [f.moss, f.amber, f.flower].filter(Boolean).length;
        if (got === 3) return { id, name: "Шаман Ульв", lines: ["Всё принес. Славные дары.", "Отдай мне их — и я сварю Отвар Норн."] };
        return { id, name: "Шаман Ульв", lines: ["Мне нужны три дара: мох из болота, янтарь из гор, цветок из руин.", `Ты принёс ${got} из 3.`, "Принесёшь все — будет тебе Отвар Норн."] };
      }
      case "refugee": {
        if (f.refugeeDone) return { id, name: "Беженка Гюнн", lines: ["Спасибо, что вернул память старосте.", "Тайник он прятал в Руинах."] };
        if (f.diary) return { id, name: "Беженка Гюнн", lines: ["Дневник! Дай мне прочесть...", "Вот оно что. Староста оставил тайник. Отмечу тебе."] };
        return { id, name: "Беженка Гюнн", lines: ["Моя деревня сгорела. Староста успел спрятать дневник.", "Найди его в руинах — там вся наша память."] };
      }
      case "merchant": {
        if (f.merchantDone) return { id, name: "Торговец Фьолнир", lines: ["Торговля идёт, раз петля крутится.", "Загляни в тайник, что я тебе отметил."] };
        if (f.bundle) return { id, name: "Торговец Фьолнир", lines: ["Мой тюк! Вот это удача.", "Держи стрелы — и тайник один покажу."] };
        return { id, name: "Торговец Фьолнир", lines: ["Торговец я, Фьолнир. Хожу меж поселений.", "Обронил тюк с товаром где-то на тракте.", "Найдёшь — не обижу."] };
      }
      default: {
        if (id.startsWith("soul")) {
          const tips = [
            ["Я помню снег... он был тёплым.", "Берегись Морозного — его хватка сковывает ноги."],
            ["Щит драугра крепок спереди.", "Зайди сбоку. Или обрати его в лёд секирой."],
            ["Туман — это дыхание Змея.", "Когда он придёт, держись круга света."],
            ["Грибы плюются спорами издалека.", "Стрела решает всё одним выстрелом."],
            ["Волк кружит, прежде чем прыгнуть.", "Не стой там, куда он смотрит."],
            ["Я видел Древо. Оно плачет смолой.", "Пять Рун — и петля лопнет."],
            ["В ледяных осколках что-то блестит.", "Разбей — и найдёшь припасы."],
          ];
          const t = tips[Math.floor(Math.random() * tips.length)];
          return { id, name: "Потерянная душа", lines: t };
        }
        return null;
      }
    }
  }

  /* ================= HUD / миникарта ================= */
  private fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss < 10 ? "0" : ""}${ss}`;
  }

  private pushHud(force = false) {
    if (!this.map && !force) return;
    const { desc } = this.questDesc(this.trackedQuest);
    this.cbs.onHud({
      hp: Math.max(0, this.player.hp), maxHp: this.player.maxHp,
      arrows: this.flags.arrows, runes: this.flags.runes,
      hasSword: this.flags.hasSword, hasAxe: this.flags.hasAxe, hasBow: this.flags.hasBow,
      hasHammer: this.flags.hasHammer, hasKey: this.flags.hasKey, bear: this.flags.bear,
      swordUp: this.flags.swordUp, axeUp: this.flags.axeUp, furyRune: this.flags.furyRune,
      secretKnown: this.flags.secretKnown, nornsFavor: this.flags.nornsFavor,
      hearts: this.flags.hearts,
      zone: this.zone, objective: `${this.trackedTitle()} — ${desc}`,
      time: this.fmtTime(this.playTime), kills: this.flags.kills, deaths: this.flags.deaths,
      muted: audio.muted,
      quests: this.buildQuests(), trackedId: this.trackedQuest,
    });
  }

  private buildMmBase(map: WorldData) {
    const c = document.createElement("canvas");
    c.width = map.W * 2; c.height = map.H * 2;
    const cx = c.getContext("2d")!;
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      cx.fillStyle = TILE_COLORS[map.tiles[y * map.W + x]] ?? "#10151c";
      cx.fillRect(x * 2, y * 2, 2, 2);
    }
    this.mmBase = cx.getImageData(0, 0, c.width, c.height);
  }

  private drawMinimap() {
    const c = this.minimap;
    if (!c || !this.map) return;
    if (!this.mmBase) this.buildMmBase(this.map);
    if (c.width !== this.mmBase!.width || c.height !== this.mmBase!.height) {
      c.width = this.mmBase!.width; c.height = this.mmBase!.height;
    }
    const cx = c.getContext("2d");
    if (!cx || !this.mmBase) return;
    cx.putImageData(this.mmBase, 0, 0);
    cx.fillStyle = "#8fd8e8";
    for (const s of this.shrines) cx.fillRect(s.x / T * 2 - 1, s.y / T * 2 - 1, 2, 2);
    if (this.flags.secretKnown && !this.map.isDungeon) {
      cx.fillStyle = "#c9a24b";
      cx.fillRect(this.map.stashSpot.x * 2 - 1, this.map.stashSpot.y * 2 - 1, 3, 3);
    }
    if (this.flags.nornsFavor && !this.map.isDungeon) {
      cx.fillStyle = "#63d8c8";
      for (const p of this.pedestals) if (!p.taken) cx.fillRect(p.x / T * 2 - 1, p.y / T * 2 - 1, 2, 2);
    }
    const tgt = this.trackedTarget();
    if (tgt && Math.floor(this.realT * 3) % 2 === 0) {
      cx.fillStyle = "#e8c979";
      cx.fillRect(tgt.x / T * 2 - 1.5, tgt.y / T * 2 - 1.5, 3, 3);
    }
    cx.fillStyle = "#f4f8fc";
    cx.fillRect(this.player.x / T * 2 - 1, this.player.y / T * 2 - 1, 3, 3);
  }

  drawBigMap(c: HTMLCanvasElement) {
    const map = this.map;
    if (!map) return;
    const scale = Math.min(560 / (map.W * 2), 420 / (map.H * 2)) * 2;
    c.width = Math.round(map.W * scale);
    c.height = Math.round(map.H * scale);
    const cx = c.getContext("2d")!;
    cx.imageSmoothingEnabled = false;
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      cx.fillStyle = TILE_COLORS[map.tiles[y * map.W + x]] ?? "#10151c";
      cx.fillRect(x * scale, y * scale, scale, scale);
    }
    const dot = (wx: number, wy: number, r: number, color: string) => {
      cx.fillStyle = color;
      cx.beginPath();
      cx.arc(wx / T * scale, wy / T * scale, r, 0, Math.PI * 2);
      cx.fill();
    };
    for (const s of this.shrines) dot(s.x * T + 8, s.y * T + 8, 3, "#8fd8e8");
    if (!map.isDungeon) {
      for (const en of map.dungeonEntries) {
        const done = this.dungeonBossDead(en.id);
        dot(en.x * T + 8, en.y * T + 8, 5, done ? "#3d5a66" : "#c9a24b");
      }
      dot(map.treeAltar.x * T + 8, map.treeAltar.y * T + 8, 5, "#63d8c8");
      for (const p of this.pedestals) if (!p.taken) dot(p.x, p.y, 3, "#63d8c8");
      if (this.flags.secretKnown) dot(map.stashSpot.x * T + 8, map.stashSpot.y * T + 8, 4, "#c9a24b");
    } else if (!this.dungeonBossDead(map.dungeonId)) {
      dot(map.bossRoom.x + map.bossRoom.w / 2, map.bossRoom.y + map.bossRoom.h / 2, 5, "#e05050");
    }
    const tgt = this.trackedTarget();
    if (tgt) dot(tgt.x, tgt.y, 4, "#e8c979");
    dot(this.player.x, this.player.y, 4, "#f4f8fc");
  }

  /* ================= частицы/текст ================= */
  private burst(x: number, y: number, color: number, n: number, speed: number, life: number, size: number, grav: number) {
    if (this.particles.length > 420) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.5 + Math.random() * 0.7), max: life, size: size * (0.7 + Math.random() * 0.7),
        color, grav, alpha: 0.95,
      });
    }
  }

  private updateParticles(rdt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= rdt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * rdt;
      p.x += p.vx * rdt; p.y += p.vy * rdt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= rdt;
      f.txt.y -= 14 * rdt;
      f.txt.alpha = Math.max(0, f.life / 0.8);
      if (f.life <= 0) { f.txt.destroy(); this.floats.splice(i, 1); }
    }
  }

  private float(x: number, y: number, text: string, color: number) {
    const t = new Text({
      text,
      style: { fontFamily: "Alegreya Sans", fontSize: 9, fontWeight: "700", fill: color },
    });
    t.anchor.set(0.5);
    t.position.set(x, y - 12);
    this.floatLayer.addChild(t);
    this.floats.push({ txt: t, life: 0.8 });
    if (this.floats.length > 24) { const old = this.floats.shift()!; old.txt.destroy(); }
  }

  /* ================= текстуры карты ================= */
  private buildMapTextures(map: WorldData) {
    this.groundSpr?.destroy();
    for (const wt of this.wallTiles) wt.destroy();
    this.wallTiles = [];
    this.houseSprites = [];
    const { W, H } = map;
    const ruinedTiles = new Set<number>();
    for (const r of map.ruinedHouses)
      for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++)
        ruinedTiles.add((r.y + dy) * W + (r.x + dx));
    const gc = document.createElement("canvas"); gc.width = W * T; gc.height = H * T;
    const gx = gc.getContext("2d")!;

    const rnd = (x: number, y: number, s: number) => {
      const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
      return v - Math.floor(v);
    };
    const dither = (ctx: CanvasRenderingContext2D, x: number, y: number, base: string, dark: string, light: string) => {
      ctx.fillStyle = base;
      ctx.fillRect(x, y, T, T);
      for (let i = 0; i < 6; i++) {
        const px = x + Math.floor(rnd(x, y, i) * T);
        const py = y + Math.floor(rnd(y, x, i + 9) * T);
        ctx.fillStyle = i % 2 ? dark : light;
        ctx.fillRect(px, py, 1, 1);
      }
    };
    const pals: Record<number, { f: [string, string, string]; w: [string, string] }> = {
      0: { f: ["#39424e", "#2f3844", "#445060"], w: ["#10151c", "#232c38"] },
      1: { f: ["#3d4a3e", "#2f3830", "#4e5a4e"], w: ["#1c261c", "#2c362c"] },
      2: { f: ["#5a524a", "#4a423a", "#6a625a"], w: ["#2c2824", "#3a342e"] },
    };
    const pal = map.isDungeon ? pals[map.dungeonId] ?? pals[0] : null;

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x];
      const X = x * T, Y = y * T;
      switch (t) {
        case Tl.WATER:
          dither(gx, X, Y, "#0a1620", "#081219", "#12303e");
          if (rnd(x, y, 3) > 0.7) { gx.fillStyle = "#1d3a4a"; gx.fillRect(X + 3, Y + Math.floor(rnd(x, y, 5) * 12) + 2, 6, 1); }
          break;
        case Tl.SHORE: dither(gx, X, Y, "#4a5a64", "#3d4d57", "#5a6a74"); break;
        case Tl.SNOW: dither(gx, X, Y, "#8b98a6", "#7e8b99", "#9aa7b5"); break;
        case Tl.SNOW2: dither(gx, X, Y, "#7e8b99", "#717e8c", "#8d9aa8"); break;
        case Tl.PATH: dither(gx, X, Y, "#55636e", "#495762", "#61707b"); break;
        case Tl.FOREST: dither(gx, X, Y, "#26333c", "#1e2a32", "#2e3d47"); break;
        case Tl.MTN: dither(gx, X, Y, "#5f6b78", "#525e6b", "#6d7986"); break;
        case Tl.SWAMP: dither(gx, X, Y, "#2c3a3e", "#243034", "#354347"); break;
        case Tl.POOL:
          dither(gx, X, Y, "#1b2a30", "#152127", "#223339");
          gx.fillStyle = "#2a4a55";
          gx.fillRect(X + 3, Y + 4, 5, 1); gx.fillRect(X + 8, Y + 10, 4, 1);
          break;
        case Tl.VILLAGE: dither(gx, X, Y, "#635a4c", "#575043", "#6f6658"); break;
        case Tl.RUINS:
          dither(gx, X, Y, "#4e5a68", "#424d5a", "#5c6875");
          if (rnd(x, y, 7) > 0.75) { gx.fillStyle = "#39424e"; gx.fillRect(X + 2, Y + 2, 6, 1); gx.fillRect(X + 2, Y + 2, 1, 5); }
          break;
        case Tl.CAVE: dither(gx, X, Y, "#2b3646", "#222b38", "#343f50"); break;
        case Tl.CAVEWALL:
          gx.fillStyle = "#12181f"; gx.fillRect(X, Y, T, T);
          gx.fillStyle = "#1a222c"; gx.fillRect(X, Y, T, 6);
          break;
        case Tl.STAIRS:
          dither(gx, X, Y, "#39424e", "#2b3646", "#4e5a68");
          gx.fillStyle = "#222b38";
          gx.fillRect(X + 2, Y + 3, 12, 2); gx.fillRect(X + 3, Y + 7, 10, 2); gx.fillRect(X + 4, Y + 11, 8, 2);
          break;
        case Tl.DFLOOR:
          if (pal) dither(gx, X, Y, pal.f[0], pal.f[1], pal.f[2]);
          else dither(gx, X, Y, "#39424e", "#2f3844", "#445060");
          break;
        case Tl.DWALL:
          gx.fillStyle = pal ? pal.w[0] : "#10151c"; gx.fillRect(X, Y, T, T);
          gx.fillStyle = pal ? pal.w[1] : "#232c38"; gx.fillRect(X, Y, T, 5);
          break;
        case Tl.ALTAR:
          dither(gx, X, Y, "#39424e", "#2b3646", "#4e5a68");
          gx.fillStyle = "#63d8c8"; gx.fillRect(X + 7, Y + 7, 2, 2);
          break;
        case Tl.TREE: dither(gx, X, Y, "#1c262e", "#161f26", "#232e37"); break;
        case Tl.ROCK: dither(gx, X, Y, map.isDungeon ? "#39424e" : "#5f6b78", "#525e6b", "#6d7986"); break;
        case Tl.PALISADE: dither(gx, X, Y, "#3a3020", "#2e2618", "#46382a"); break;
        case Tl.HOUSE: {
          const ru = ruinedTiles.has(y * W + x);
          gx.fillStyle = ru ? "#191411" : "#2c2620";
          gx.fillRect(X, Y, T, T);
          if (ru && rnd(x, y, 21) > 0.6) { gx.fillStyle = "#0f0b08"; gx.fillRect(X + 3, Y + 3, 4, 3); }
          break;
        }
        case Tl.COLUMN: dither(gx, X, Y, "#4e5a68", "#424d5a", "#5c6875"); break;
        default:
          gx.fillStyle = TILE_COLORS[t] ?? "#10151c";
          gx.fillRect(X, Y, T, T);
      }
      if (
        t === Tl.TREE || t === Tl.ROCK || t === Tl.PALISADE ||
        t === Tl.COLUMN || t === Tl.DWALL || t === Tl.CAVEWALL
      ) {
        const ws = this.wallSprite(t, rnd(x, y, 11), rnd(x, y, 13), map.dungeonId);
        ws.position.set(X - 8, Y - 20);
        ws.zIndex = Y + T;
        this.wallTiles.push(ws);
        this.dynamic.addChild(ws);
      }
    }

    this.groundSpr = new Sprite(Texture.from(gc));
    this.groundSpr.zIndex = 0;
    this.dynamic.zIndex = 100;
    this.fxWorld.zIndex = 400;
    this.floatLayer.zIndex = 500;
    this.world.addChildAt(this.groundSpr, 0);

    const houseSeen = new Set<string>();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x];
      if (t !== Tl.HOUSE) continue;
      const key = `${x},${y}`;
      if (houseSeen.has(key)) continue;

      let hw = 1, hh = 1;
      while (x + hw < W && map.tiles[y * W + (x + hw)] === Tl.HOUSE) hw++;
      while (y + hh < H) {
        let rowOk = true;
        for (let dx = 0; dx < hw; dx++) {
          if (map.tiles[(y + hh) * W + (x + dx)] !== Tl.HOUSE) { rowOk = false; break; }
        }
        if (!rowOk) break;
        hh++;
      }

      for (let dy = 0; dy < hh; dy++) for (let dx = 0; dx < hw; dx++) {
        houseSeen.add(`${x + dx},${y + dy}`);
      }

      const m = this.houseMetrics(hw, hh);
      const isRuined = map.ruinedHouses.some((r) => r.x === x && r.y === y && r.w === hw && r.h === hh);
      const v = (rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 11) > 0.6 ? 2 : 0);
      const ws = new Sprite(this.houseTexture(hw, hh, v, isRuined));
      ws.position.set(x * T - m.marginX, y * T + hh * T + 1 - (m.wallTop + m.wallH + m.foundH));
      ws.zIndex = y * T + hh * T;
      this.wallTiles.push(ws);
      this.houseSprites.push({ spr: ws, hw, hh, v, ruined: isRuined });
      this.dynamic.addChild(ws);
    }
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

  private paintWall(ctx: CanvasRenderingContext2D, t: number, v: number, dungeonId: number) {
    const ox = 8, oy = 20;
    const P = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
      ctx.fillRect(x + ox, y + oy, w, h);
    };
    switch (t) {
      case Tl.TREE:
        if (v & 1) {
          P(7, 4, 3, 12, 0x241d14); P(7, 4, 1, 12, 0x2f2618);
          P(3, 2, 11, 3, 0x1d2b22); P(4, 2, 9, 1, 0xc8d3dc);
          P(4, -2, 9, 3, 0x24352a); P(5, -2, 7, 1, 0xc8d3dc);
          P(5, -6, 7, 3, 0x1d2b22); P(6, -6, 5, 1, 0xc8d3dc);
          P(6, -10, 5, 3, 0x24352a); P(7, -10, 3, 1, 0xc8d3dc);
          P(7, -13, 3, 3, 0x1d2b22); P(8, -13, 1, 1, 0xc8d3dc);
          P(6, 14, 5, 2, 0x8b98a6);
        } else {
          P(7, 0, 3, 16, 0x1a1611); P(7, 0, 1, 16, 0x262015);
          P(4, -6, 3, 2, 0x1a1611); P(3, -8, 2, 3, 0x1a1611);
          P(10, -4, 3, 2, 0x1a1611); P(12, -7, 2, 4, 0x1a1611);
          P(6, -8, 2, 3, 0x1a1611); P(9, -10, 2, 3, 0x1a1611);
          P(3, -9, 2, 1, 0x9fb4c4); P(12, -8, 2, 1, 0x9fb4c4); P(9, -11, 2, 1, 0x9fb4c4);
          P(6, 14, 5, 2, 0x8b98a6);
        }
        break;
      case Tl.ROCK:
        P(2, 5, 12, 10, 0x4e5a68);
        P(3, 4, 10, 4, 0x5c6875);
        P(2, 12, 12, 3, 0x39424e);
        if (v & 1) P(4, 4, 2, 1, 0x8f9aa8);
        break;
      case Tl.PALISADE:
        for (let i = 0; i < 4; i++) {
          const px = 1 + i * 4;
          P(px, -4, 3, 19, 0x4e3c28);
          P(px, -4, 1, 19, 0x63503a);
          P(px + 2, -4, 1, 19, 0x3a2c1c);
          P(px, -6, 3, 2, 0x5a4632);
          P(px + 1, -8, 1, 2, 0x6e5840);
        }
        P(0, 3, 16, 2, 0x463626);
        P(0, 3, 16, 1, 0x5a4632);
        break;
      case Tl.COLUMN: {
        P(5, -10, 7, 24, 0x515d6a);
        P(5, -10, 2, 24, 0x62707e);
        P(11, -10, 1, 24, 0x3f4a56);
        P(6, -12, 5, 2, 0x5c6875);
        P(7, -13, 3, 1, 0x6a7580);
        const rune = v & 1 ? 0x8fd8e8 : 0x7a8a98;
        P(8, -6, 1, 2, rune); P(9, -4, 1, 2, rune); P(8, -2, 2, 1, rune); P(9, 1, 1, 2, rune);
        P(4, 12, 9, 2, 0x39424e);
        P(4, 12, 9, 1, 0x8b98a6);
        if (v & 2) P(10, 5, 2, 3, 0x2e4234);
        break;
      }
      case Tl.DWALL: {
        const dark = dungeonId === 1 ? 0x1c261c : dungeonId === 2 ? 0x2c2824 : 0x10151c;
        const light = dungeonId === 1 ? 0x2c362c : dungeonId === 2 ? 0x3a342e : 0x232c38;
        P(0, 0, 16, 16, dark);
        P(0, 0, 16, 5, light);
        P(1, 9, 4, 4, 0x0a0e14); P(9, 7, 5, 5, 0x0a0e14);
        break;
      }
      case Tl.CAVEWALL:
        P(0, 0, 16, 16, 0x12181f);
        P(0, 0, 16, 6, 0x1a222c);
        P(2, 8, 3, 3, 0x0d1218); P(10, 10, 3, 3, 0x0d1218);
        break;
    }
  }

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

  private houseTexture(hw: number, hh: number, v: number, ruined: boolean): Texture {
    const key = `house_${hw}x${hh}_v${v}_r${ruined ? 1 : 0}_snow${this.roofSnow ? 1 : 0}`;
    let tex = this.wallTexCache.get(key);
    if (!tex) {
      const m = this.houseMetrics(hw, hh);
      const c = document.createElement("canvas");
      c.width = m.canvasW; c.height = m.canvasH;
      this.paintHouse(c.getContext("2d")!, hw, hh, v, ruined);
      tex = Texture.from(c);
      this.wallTexCache.set(key, tex);
    }
    return tex;
  }

  private paintHouse(ctx: CanvasRenderingContext2D, hw: number, hh: number, v: number, ruined = false) {
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
      if (ruined) {
        const dy = yB - h;
        R(dx - 2, dy - 2, w + 4, h + 2, 0x1a120c);
        R(dx, dy, w, h, 0x120c08);
        for (let i = 0; i < w; i += 5) R(dx + i, dy, 1, h, 0x241a12);
        for (let i = 0; i < w - 2; i++)
          R(dx + 1 + i, dy + h - 3 - (i & 1), 1, 2, 0x2c2016);
        return;
      }
      const dy = yB - h;
      R(dx - 2, dy - 2, w + 4, h + 2, 0x241a10); R(dx - 1, dy - 3, w + 2, 1, 0x241a10);
      R(dx, dy, w, h, 0x38281a);
      for (let i = 3; i < w - 1; i += 4) R(dx + i, dy + 1, 1, h - 1, 0x241809);
      R(dx, dy + 4, w, 1, 0x262b33); R(dx, dy + h - 5, w, 1, 0x262b33);
      R(dx + w - 3, dy + (h >> 1), 1, 2, 0x9aa4b2);
      if (snow) R(dx - 2, dy - 4, w + 4, 1, SNOW2, 0.9);
    };
    const win = (x0: number, y0: number) => {
      if (ruined) {
        R(x0 - 1, y0 - 1, 9, 9, 0x1a120c);
        R(x0, y0, 7, 7, 0x100a06);
        R(x0 + 2, y0, 1, 7, 0x241a12); R(x0, y0 + 4, 7, 1, 0x241a12);
        return;
      }
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
    const sideRoof = (ry: number, ey: number, x0: number, x1: number) => {
      R(x0 + 2, ry - 4, x1 - x0 - 4, 4, 0x35291c);
      if (snow) R(x0 + 3, ry - 5, x1 - x0 - 6, 1, SNOW2, 0.9);
      for (let y = ry; y < ey; y += 2) {
        const row = (y - ry) >> 1;
        R(x0, y, x1 - x0, 2, row % 2 ? 0x4a3a28 : 0x423222);
        for (let sx = x0 + (row % 2 ? 2 : 0); sx < x1; sx += 4) R(sx, y, 1, 2, 0x3a2c1c);
        if (snow && row % 2 === 1)
          for (let sx = x0 + 3 + ((row * 7) % 5); sx < x1 - 5; sx += 9) R(sx, y, 3, 1, SNOW, 0.75);
      }
      R(x0, ry - 2, x1 - x0, 2, 0x6a5a40);
      if (snow) R(x0 + 1, ry - 3, x1 - x0 - 2, 2, SNOW);
      crossBeams(x0 + 3, ry - 2); crossBeams(x1 - 3, ry - 2);
      R(x0, ey - 1, x1 - x0, 2, 0x5a4a34);
      icicles(x0, x1, ey + 1);
    };

    // ===== фундамент =====
    R(wx - 2, wallTop + wallH, wallW + 4, foundH, 0x3f444c);
    R(wx - 2, wallTop + wallH, wallW + 4, 1, 0x5a616c);
    for (let sx = wx - 1; sx < wx + wallW; sx += 6) R(sx, wallTop + wallH + 1, 3, 2, 0x4a505a);

    if (mode === "side") {
      logWall(wx, wallTop, wallW, wallH);
      door(Math.round(cx - 6), wallTop + wallH, 12, wallH - 3);
      win(wx + 6, wallTop + 5); win(wx + wallW - 13, wallTop + 5);
      sideRoof(topPad, wallTop, wx - 6, wx + wallW + 6);
    } else if (mode === "two") {
      logWall(wx, wallTop, wallW, wallH);
      const ledgeY = wallTop + 12;
      R(wx - 6, ledgeY - 1, wallW + 12, 1, 0x6a5a40);
      R(wx - 6, ledgeY, wallW + 12, 3, 0x4a3a28);
      R(wx - 6, ledgeY + 3, wallW + 12, 1, 0x2e2012);
      if (snow) R(wx - 6, ledgeY - 2, wallW + 12, 2, SNOW);
      icicles(wx - 6, wx + wallW + 6, ledgeY + 4);
      door(Math.round(cx - 7), wallTop + wallH, 14, 17);
      win(wx + 5, ledgeY + 9); win(wx + wallW - 13, ledgeY + 9);
      for (const ox of [cx - 14, cx - 4, cx + 6]) win(ox, wallTop + 3);
      sideRoof(topPad, wallTop, wx - 6, wx + wallW + 6);
    } else {
      logWall(wx, wallTop, wallW, wallH);
      const dw = 10, doorX = Math.round(cx - dw / 2);
      door(doorX, wallTop + wallH, dw, Math.min(17, wallH - 4));
      const gapL = doorX - 2 - wx, gapR = wx + wallW - (doorX + dw + 2);
      if (gapL >= 9 && !ruined) {
        const shX = wx + (gapL >> 1), shY = wallTop + Math.floor(wallH * 0.55);
        CIRC(shX, shY, 5, 0x262b33); CIRC(shX, shY, 4, v & 2 ? 0x8a3a34 : 0x3d5a66); CIRC(shX, shY, 1.5, 0xc9a24b);
        if (snow) R(shX - 4, shY - 6, 8, 1, SNOW2, 0.8);
      }
      if (gapR >= 9) win(doorX + dw + 2 + ((gapR - 7) >> 1), wallTop + Math.floor(wallH * 0.3));
      const ov = 6, eL = wx - ov, eR = wx + wallW + ov;
      const apF = topPad, apR = topPad - ridgeLen;
      PATH([[eL, wallTop], [cx, apF], [cx, apR], [eL + 2, wallTop - ridgeLen]], 0x403020);
      PATH([[eR, wallTop], [cx, apF], [cx, apR], [eR - 2, wallTop - ridgeLen]], 0x4a3a28);
      if (snow) for (let i = 1; i <= 3; i++) {
        R(cx - 4 - i * 3, apF - i * (ridgeLen / 4), 3, 1, SNOW, 0.7);
        R(cx + 2 + i * 2, apF - i * (ridgeLen / 4) + 1, 3, 1, SNOW, 0.7);
      }
      R(cx - 1, apR - 1, 2, ridgeLen + 3, snow ? SNOW : 0x6a5a40);
      const gH = wallTop - topPad;
      for (let i = 0; i < gH; i += 2) {
        const halfW = 1 + (wallW / 2 + ov - 1) * ((i + 2) / gH);
        const y = topPad + i;
        for (let x = Math.ceil(cx - halfW); x < cx + halfW; x += 3)
          R(x, y, Math.min(3, Math.ceil(cx + halfW) - x), 2, (Math.floor(x / 3) & 1) === 0 ? 0x4a3a28 : 0x423222);
        R(cx - halfW - 2, y - 1, 3, 2, 0x6a5a40); R(cx + halfW - 1, y - 1, 3, 2, 0x6a5a40);
        if (snow) { R(cx - halfW - 2, y - 2, 3, 1, SNOW); R(cx + halfW - 1, y - 2, 3, 1, SNOW); }
      }
      const ly0 = topPad + Math.floor(gH * 0.5);
      CIRC(cx, ly0, 4, 0x2e2012); CIRC(cx, ly0, 3, v & 1 ? 0xf8e0a0 : 0x241809);
      R(cx - 1, ly0 - 3, 1, 6, 0x2e2012); R(cx - 3, ly0 - 1, 6, 1, 0x2e2012);
      crossBeams(cx, topPad - 1);
      R(eL, wallTop - 1, eR - eL, 2, 0x5a4a34);
      icicles(eL, eR, wallTop + 1);
    }

    // ===== разрушения для руин =====
    if (ruined) {
      const canvasW = wallW + marginX * 2, canvasH = wallTop + wallH + foundH + 3;
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.45; ctx.fillStyle = "#1a1410"; ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.globalAlpha = 0.25; ctx.fillStyle = "#3a3a40"; ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      let s = hw * 71 + hh * 137 + v * 31 + 977;
      const rr = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const holes: [number, number, number, number][] = [];
      const nH = 2 + Math.floor(rr() * 2);
      for (let i = 0; i < nH; i++) {
        const w2 = 6 + Math.floor(rr() * 8), h2 = 4 + Math.floor(rr() * 6);
        holes.push([wx + Math.floor(rr() * (wallW - w2)), topPad + Math.floor(rr() * Math.max(4, wallTop - topPad - h2)), w2, h2]);
      }
      for (let i = 0; i < 5; i++)
        holes.push([wx + Math.floor(rr() * wallW), wallTop - 3 - Math.floor(rr() * 6), 3 + Math.floor(rr() * 4), 3 + Math.floor(rr() * 3)]);
      holes.push([wx + 2 + Math.floor(rr() * (wallW - 10)), wallTop + 4 + Math.floor(rr() * Math.max(4, wallH - 12)), 6 + Math.floor(rr() * 5), 5 + Math.floor(rr() * 4)]);
      ctx.globalCompositeOperation = "destination-out";
      for (const [hx, hy, w2, h2] of holes) ctx.fillRect(hx, hy, w2, h2);
      ctx.globalCompositeOperation = "source-over";
      for (const [hx, hy, w2, h2] of holes) {
        R(hx - 1, hy - 1, w2 + 2, 1, 0x150f0a); R(hx - 1, hy + h2, w2 + 2, 1, 0x150f0a);
        R(hx - 1, hy, 1, h2, 0x150f0a); R(hx + w2, hy, 1, h2, 0x150f0a);
        for (let bx = hx + 1; bx < hx + w2 - 1; bx += 3) R(bx, hy + 1, 1, h2 - 2, 0x241a12);
        if (rr() < 0.4) R(hx + 1 + Math.floor(rr() * (w2 - 2)), hy + h2 - 2, 1, 1, 0xe07030, 0.8);
      }
      for (let i = 0; i < 6; i++) {
        const dx = wx - 6 + Math.floor(rr() * (wallW + 12));
        R(dx, wallTop + wallH + foundH - 2 - Math.floor(rr() * 2), 3 + Math.floor(rr() * 4), 1, i % 2 ? 0x241d16 : 0x3a3630);
      }
      for (let i = 0; i < 6; i++) R(wx + 2 + i, wallTop - 2 + i, 2, 1, 0x1f1812);
      ctx.globalAlpha = 1;
    }
    // ===== сугробы у основания =====
    if (snow && !ruined) {
      R(wx - 3, wallTop + wallH + foundH - 2, wallW + 6, 1, SNOW2, 0.8);
      R(wx - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
      R(wx + wallW - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
    }
    ctx.globalAlpha = 1;
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    this.wallTexCache.forEach((tex) => tex.destroy(true));
    this.wallTexCache.clear();
    if (this.app) this.app.destroy(true);
  }
}