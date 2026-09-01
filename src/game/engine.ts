/* engine.ts – Оркестратор: создаёт EventBus, GameState и системы */

import { Application, Container, Graphics, RenderTexture, Sprite, Texture, Text } from "pixi.js";
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
import { FxManager } from "./fx";
import {
  TILE_COLORS,
  HouseSpriteEntry,
  WallTextureCache,
  HouseTextureCache,
  buildAllTileTextures,
  buildMinimapBase,
  drawMinimap,
  MinimapOverlays,
  buildBigMapBase,
  drawBigMap,
  BigMapOverlays,
} from "./tiles";

// Системы
import { EventBus } from "./event-bus";
import { GameState } from "./game-states";
import { QuestSystem } from "./system/quest-system";
import { DialogueSystem } from "./system/dialogue-system";
import { DropsSystem } from "./system/drops-system";
import { FogSystem } from "./system/fog-system";
import { PhysicsSystem } from "./system/physics-system";
import { CombatSystem } from "./system/combat-system";
import { AISystem } from "./system/ai-system";
import { InteractionSystem } from "./system/interaction-system";
import { HudSystem } from "./system/hud-system";

// Импорты рендереров
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
  quests: QuestView[]; trackedId: string; _version: number;
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

export class Engine {
  private cbs: EngineCallbacks;
  private container: HTMLElement;
  private app!: Application;
  private ready: Promise<void>;

  // EventBus и GameState
  private bus = new EventBus();
  private state!: GameState;

  // Системы
  private quests!: QuestSystem;
  private dialogue!: DialogueSystem;
  private drops!: DropsSystem;
  private fog!: FogSystem;
  private physics!: PhysicsSystem;
  private combat!: CombatSystem;
  private ai!: AISystem;
  private interaction!: InteractionSystem;
  private hud!: HudSystem;

  // слои
  private world = new Container();
  private dynamic = new Container();
  private fxWorld = new Container();
  private floatLayer = new Container();
  private groundSpr: Sprite | null = null;
  private wallTiles: (Graphics | Sprite)[] = [];
  private fxScreen = new Graphics();
  private fx = new FxManager();
  private fadeG = new Graphics();
  private canvasEl: HTMLCanvasElement | null = null;

  // вьюпорт
  private viewW = 480;
  private viewH = 270;
  private cam = { x: 0, y: 0 };

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
    this.viewW = Math.max(120, vw);
    this.viewH = Math.max(120, vh);
  }

  private applyView() {
    const ow = this.viewW, oh = this.viewH;
    this.applyViewSize();
    if ((this.viewW !== ow || this.viewH !== oh) && this.app) {
      this.app.renderer.resize(this.viewW, this.viewH);
    }
  }

  private respawn() {
    let spawn = this.map?.spawn ?? { x: 0, y: 0 };
    const f = this.flags;
    if (f.shrineIdx >= 0 && this.ow) {
      const s = this.ow.shrines[f.shrineIdx];
      if (s) spawn = { x: s.x * T + 8, y: s.y * T + 8 };
    }
    this.player.x = spawn.x; this.player.y = spawn.y;
    this.player.vx = 0; this.player.vy = 0;
    this.player.hp = this.player.maxHp;
    this.player.hurtT = 0;
    this.player.slowT = 0;
    this.player.swingT = 0;
    this.playerDead = false;
    this.setScreen("play");
    this.fadeA = 1;
    this.fadeTarget = 0;
    if (this.map.isDungeon) {
      this.loadMap(this.ow, spawn);
    }
    this.hud.pushHud(true);
    this.bus.emit("player:respawned", {});
  }

  private onPlayerDied() {
    if (this.playerDead) return;
    this.playerDead = true;
    this.flags.deaths++;
    this.setScreen("death");
    this.deathT = 1.8;
    audio.hurt();
  }

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
  private dropsArr: Drop[] = [];
  private chests: ChestRt[] = [];
  private pedestals: PedestalRt[] = [];
  private shrines: ShrineRt[] = [];
  private npcs: NpcRt[] = [];
  private doors: DoorRt[] = [];
  private barrier: { x: number; y: number; active: boolean; g: Graphics } | null = null;
  private altar: { x: number; y: number; g: Graphics } | null = null;
  private bossRef: Enemy | null = null;
  private slamZones: SlamZone[] = [];
  private takenAmbient = new Set<number>();
  private roofSnow = true;
  private houseSprites: HouseSpriteEntry[] = [];
  private wallCache = new WallTextureCache();
  private houseCache = new HouseTextureCache();

  /** Вкл/выкл снег на крышах домов (можно вызывать из UI). */
  setRoofSnow(on: boolean) {
    if (this.roofSnow === on) return;
    this.roofSnow = on;
    for (const h of this.houseSprites) h.spr.texture = this.houseCache.getTexture(h.hw, h.hh, h.v, h.ruined, this.roofSnow);
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
    dew: 0, fogWaves: 0, ghostBane: false,
  };
  private talkedSig = new Map<string, string>();
  private openedChests = new Set<string>();
  private dialogueActive = false;
  private talkCount = 0;
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
  private minimapCanvas: HTMLCanvasElement | null = null;
  private mmBase: ImageData | null = null;
  private floats: FloatText[] = [];
  private playerDead = false;

  // Рендереры
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

  // ввод
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private virt = { x: 0, y: 0, atk: false, axe: false, bow: false, act: false };
  private prevVirt = { atk: false, axe: false, act: false, bow: false };
  private bowHeld = false;
  private onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onResize = () => this.applyView();

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

    // Инициализация FX-менеджера
    this.fx.init(app, this.viewW, this.viewH);

    this.world.sortableChildren = true;
    this.dynamic.sortableChildren = true;
    this.fxWorld.addChild(this.fx.worldParticleGraphics);
    this.world.addChild(this.dynamic);
    this.world.addChild(this.fxWorld);
    this.world.addChild(this.floatLayer);
    app.stage.addChild(this.world);

    app.stage.addChild(this.fxScreen);
    this.fx.buildVignette();
    if (this.fx.vignette) app.stage.addChild(this.fx.vignette);

    this.fx.buildFogVignette();
    this.fx.buildNoiseTexture();
    if (this.fx.fogVignette) app.stage.addChild(this.fx.fogVignette!);

    app.stage.addChild(this.fadeG);

    this.fx.initSnow();
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

    // Создаём GameState и системы
    this.state = this.buildGameState();
    this.instantiateSystems(this.state);
  }

  private buildGameState(): GameState {
    const eng = this;
    const state: GameState = {
      get player() { return eng.player; },
      get enemies() { return eng.enemies; },
      get projectiles() { return eng.projectiles; },
      get drops() { return eng.dropsArr; },
      get chests() { return eng.chests; },
      get pedestals() { return eng.pedestals; },
      get shrines() { return eng.shrines; },
      get npcs() { return eng.npcs; },
      get doors() { return eng.doors; },
      get bossRef() { return eng.bossRef; }, set bossRef(v) { eng.bossRef = v; },

      get map() { return eng.map; },
      get ow() { return eng.ow; },
      get barrier() { return eng.barrier; },
      get altar() { return eng.altar; },

      get flags() { return eng.flags; },
      get screen() { return eng.screen; }, set screen(v) { eng.screen = v; },
      get realT() { return eng.realT; }, set realT(v) { eng.realT = v; },
      get playTime() { return eng.playTime; }, set playTime(v) { eng.playTime = v; },
      get zone() { return eng.zone; }, set zone(v) { eng.zone = v; },
      get talkCount() { return eng.talkCount; }, set talkCount(v) { eng.talkCount = v; },
      get revealed() { return eng.revealed; },
      get trackedQuest() { return eng.trackedQuest; }, set trackedQuest(v) { eng.trackedQuest = v; },
      get lastMain() { return eng.lastMain; }, set lastMain(v) { eng.lastMain = v; },
      get visitedShrines() { return eng.visitedShrines; },
      get takenPedestals() { return eng.takenPedestals; },
      get openedChests() { return eng.openedChests; },
      get takenAmbient() { return eng.takenAmbient; },

      get cbs() { return eng.cbs; },
      get spawnEnemy() { return eng.spawnEnemy.bind(eng); },
      get loadMap() { return eng.loadMap.bind(eng); },
      get setScreen() { return eng.setScreen.bind(eng); },
      get fadeTo() { return eng.fadeTo.bind(eng); },
      get toast() { return (msg: string) => eng.toast(msg); },
      get onProjectileAdd() { return (g: Graphics) => eng.dynamic.addChild(g); },
      get onDropAdd() { return (g: Graphics) => eng.dynamic.addChild(g); },
    };
    return state;
  }

  private instantiateSystems(state: GameState) {
    this.quests      = new QuestSystem(this.bus, state);
    this.dialogue    = new DialogueSystem(this.bus, state, this.fx);
    this.drops       = new DropsSystem(this.bus, state);
    this.fog         = new FogSystem(this.bus, state);
    this.physics     = new PhysicsSystem(state);
    this.combat      = new CombatSystem(this.bus, state, this.physics);
    this.ai          = new AISystem(this.bus, state, this.physics);
    this.interaction = new InteractionSystem(this.bus, state);
    this.hud         = new HudSystem(this.bus, state, this.quests);
    // Подписки на события движка
    this.bus.on("engine:enter-dungeon", (e) => this.enterDungeon(e));
    this.bus.on("engine:exit-dungeon", (e) => this.exitDungeon(e));
    this.bus.on("hud:float", (e) => this.float(e.x, e.y, e.text, e.color));
    this.bus.on("player:died", () => this.onPlayerDied());
  }

  private enterDungeon(e: { dungeonId: number }) {
    if (this.flags.snakeStarted && !this.flags.snakeDead) return;
    const dun = this.dungeons[e.dungeonId];
    if (!dun) return;
    audio.door();
    this.fadeTo(1);
    this.loadMap(dun, dun.spawn);
    this.fadeTo(0);
    this.toast(`${dun.name}: страж пробудился`);
  }

  private exitDungeon(e: { spawn: Vec }) {
    audio.door();
    this.fadeTo(1);
    this.loadMap(this.ow, e.spawn);
    this.fadeTo(0);
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
    f.ghostBane = false; f.dew = 0; f.fogWaves = 0;
    f.kills = 0; f.deaths = 0; f.shrineIdx = -1; f.shrineQuestDone = false; f.huntDone = false;
    this.visitedShrines.clear();
    this.takenPedestals.clear();
    this.takenAmbient.clear();
    this.trackedQuest = "m1"; this.lastMain = "m1";
    this.openedChests.clear();
    this.revealed.clear();
    this.revealed.add("m1");
    this.player.hp = this.player.maxHp = 12;
    this.playTime = 0; this.zone = ""; this.talkCount = 0;
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
    if (this.minimapCanvas !== c) { this.minimapCanvas = c; this.mmBase = this.map ? buildMinimapBase(this.map) : null; }
  }

  openQuests() { if (this.screen === "play") this.setScreen("quests"); }
  openInventory() { if (this.screen === "play") this.setScreen("inventory"); }
  openMap() { if (this.screen === "play") this.setScreen("map"); }
  closeOverlay() {
    if (this.screen === "quests" || this.screen === "inventory" || this.screen === "map") this.setScreen("play");
  }
  trackQuest(id: string) {
    this.trackedQuest = id;
    const def = this.quests.questDefs().find((q) => q.id === id);
    this.toast(def ? `Стрелка ведёт: ${def.title}` : "Цель обновлена");
    audio.uiClick();
    this.pushHud(true);
  }

  advanceDialogue() {
    this.dialogueActive = false;
    this.pressed.clear();
    this.cbs.onDialogue(null);
    this.bus.emit("dialogue:end", { id: this.dialogue.lastId });
  }

  private setScreen(s: Screen) { this.screen = s; this.cbs.onScreen(s); }
  private toast(msg: string) { this.cbs.onToast(msg); }
  private shakeIt(v: number) { /* через shake */ }
  private fadeTo(a: number) { this.fadeTarget = a; }

  /* ================= загрузка карты ================= */
  private loadMap(map: WorldData, spawn: Vec) {
    this.map = map;
    this.clearEntities();
    this.buildMapTextures(map);
    this.mmBase = buildMinimapBase(map);

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
      this.drops.spawnWorldDrops(map);
    }
  }

  private clearEntities() {
    for (const e of this.enemies) { e.g.destroy(); if (e.body) this.farBody(e.body); }
    for (const p of this.projectiles) p.g.destroy();
    for (const d of this.dropsArr) d.g.destroy();
    for (const c of this.chests) c.g.destroy();
    for (const p of this.pedestals) p.g.destroy();
    for (const s of this.shrines) s.g.destroy();
    for (const n of this.npcs) n.g.destroy();
    for (const d of this.doors) d.g.destroy();
    for (const f of this.floats) f.txt.destroy();
    this.barrier?.g.destroy(); this.altar?.g.destroy();
    this.enemies = []; this.projectiles = []; this.dropsArr = [];
    this.chests = []; this.pedestals = []; this.shrines = []; this.npcs = []; this.doors = [];
    this.floats = []; this.slamZones = []; this.bossRef = null;
    this.barrier = null; this.altar = null;
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
    if (kind === "raven" || kind === "snake" || kind === "spider" || kind === "ghost") this.farBody(e.body);
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
    this.fx.burst(p.x, p.y, 0x7ee2a8, 10, 50, 0.8, 2, -20);
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
      const inDanger = this.fog.active || this.bossRef !== null ||
        this.enemies.some((e) => !e.dead && e.aggro && dist2(e.x, e.y, this.player.x, this.player.y) < 130 * 130);
      audio.setIntensity(inDanger ? 1 : 0);
    } else {
      audio.setIntensity(0);
      this.pressed.clear();
      if (this.screen === "death") {
        this.deathT -= rdt;
        if (this.deathT <= 0 && this.screen === "death") this.respawn();
      }
    }

    const fx = this.fxScreen;
    fx.clear();
    if (!this.map?.isDungeon) {
      for (const f of this.fx.snow) {
        f.y += f.s * rdt;
        f.x += Math.sin(this.realT * 0.8 + f.d) * 8 * rdt - 4 * rdt;
        if (f.y > this.viewH) { f.y = -2; f.x = Math.random() * this.viewW; }
        if (f.x < -2) f.x = this.viewW;
        fx.rect(f.x, f.y, f.w, f.w).fill({ color: 0xc8d8e8, alpha: 0.4 });
      }
    }
    this.drawGuide(fx);
    this.fx.updateParticles(rdt);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= rdt;
      f.txt.y -= 14 * rdt;
      f.txt.alpha = Math.max(0, f.life / 0.8);
      if (f.life <= 0) { f.txt.destroy(); this.floats.splice(i, 1); }
    }
    this.fx.drawWorldFx(rdt, this.realT);
    const sg = this.fx.worldParticleG;
    for (const z of this.slamZones) {
      const pr = 1 - z.t / 0.9;
      if (!z.boom) {
        sg.circle(z.x, z.y, z.r * pr).stroke({ color: 0xe05050, width: 1.5, alpha: 0.5 + pr * 0.4 });
        sg.circle(z.x, z.y, 2).fill({ color: 0xe08a3c, alpha: 0.8 });
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = this.realT * 0.7 + i * 2.1;
      const wx = this.player.x + Math.cos(a) * 26, wy = this.player.y - 8 + Math.sin(a * 1.7) * 10;
      sg.circle(wx, wy, 1.5).fill({ color: 0x8fd8e8, alpha: 0.5 + Math.sin(this.realT * 3 + i) * 0.3 });
    }

    const m = this.map;
    const tx = m ? (m.W * T > this.viewW ? clamp(this.player.x - this.viewW / 2, 0, m.W * T - this.viewW) : (m.W * T - this.viewW) / 2) : 0;
    const ty = m ? (m.H * T > this.viewH ? clamp(this.player.y - this.viewH / 2, 0, m.H * T - this.viewH) : (m.H * T - this.viewH) / 2) : 0;
    this.cam.x += (tx - this.cam.x) * Math.min(1, rdt * 6);
    this.cam.y += (ty - this.cam.y) * Math.min(1, rdt * 6);
    const shx = (Math.random() - 0.5) * this.shake, shy = (Math.random() - 0.5) * this.shake;
    this.world.position.set(-Math.round(this.cam.x + shx), -Math.round(this.cam.y + shy));
    const fogHoles = this.fog.fogHoles();
    this.fx.updateFog(rdt, this.fog.radius, this.fog.active, this.map?.isDungeon ?? false, this.player.x, this.player.y, this.cam.x, this.cam.y, this.viewW, this.viewH, fogHoles);
    this.fx.drawFogRunes(fx, this.fog.radius, this.viewW, this.viewH);
    if (this.fog.fogWarned) this.fx.drawFogEyes(fx, true, this.realT, this.viewW, this.viewH);

    // ==================== ОТРИСОВКА ЧЕРЕЗ РЕНДЕРЕРЫ ====================
    const playerExtra: IPlayerExtra = {
      hasSword: this.flags.hasSword,
      runes: this.flags.runes,
      swingDir: this.player.dir,
      aiming: this.bowHeld,
    };
    this.renderers.player.render(this.playerG, this.player as IPlayerData, this.realT, playerExtra);
    this.playerG.position.set(Math.round(this.player.x), Math.round(this.player.y));
    this.playerG.zIndex = this.player.y;

    for (const e of this.enemies) {
      e.g.position.set(Math.round(e.x), Math.round(e.y));
      e.g.zIndex = e.kind === "raven" ? 100000 + e.y : e.y;
      e.g.visible = !e.dead && !(e.hidden && dist2(e.x, e.y, this.player.x, this.player.y) > 46 * 46);
      if (!e.dead) this.renderers.enemy.render(e.g, e as IEnemyData, this.realT);
    }
    for (const n of this.npcs) {
      n.g.zIndex = n.y;
      const mark = this.npcHasMark(n.id);
      this.renderers.npc.render(n.g, { id: n.id, name: n.name } as INpcData, this.realT, { mark });
    }
    for (const p of this.projectiles) {
      p.g.zIndex = p.y;
      this.renderers.projectile.render(p.g, p as IProjectileData, this.realT);
    }
    for (const d of this.dropsArr) {
      if (!d.taken) {
        d.g.zIndex = d.y;
        this.renderers.drop.render(d.g, d as IDropData, this.realT);
      }
    }
    for (const c of this.chests) {
      c.g.zIndex = c.y;
      this.renderers.chest.render(c.g, { opened: c.opened } as IChestData);
    }
    for (const p of this.pedestals) {
      p.g.zIndex = p.y;
      this.renderers.pedestal.render(p.g, { taken: p.taken, guardsLeft: p.guardsLeft } as IPedestalData, this.realT);
    }
    for (const s of this.shrines) {
      s.g.zIndex = s.y;
      const lit = this.flags.shrineIdx >= this.shrines.indexOf(s);
      this.renderers.shrine.render(s.g, { lit } as IShrineData, this.realT);
    }
    for (const d of this.doors) {
      d.g.zIndex = d.y;
      this.renderers.door.render(d.g, { open: d.open, locked: d.locked } as IDoorData);
    }
    if (this.barrier) {
      this.barrier.g.zIndex = this.barrier.y;
      this.barrier.g.visible = this.barrier.active;
      if (this.barrier.active) {
        this.renderers.barrier.render(this.barrier.g, { active: true } as IBarrierData, this.realT);
      }
    }
    if (this.altar) {
      this.altar.g.zIndex = this.altar.y - 1;
      this.renderers.altar.render(this.altar.g, { runes: this.flags.runes } as IAltarData, this.realT);
    }

    this.fadeG.clear();
    if (this.fadeA > 0.01) this.fadeG.rect(-4, -4, this.viewW + 8, this.viewH + 8).fill({ color: 0x04060a, alpha: this.fadeA });

    this.hudTimer -= rdt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.15; this.pushHud(); }
    this.updateMinimap();
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
        if (f.ghostBane) return "done";
        if (f.dew >= 3) return "ret";
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

  private mainQuestId(): string {
    const f = this.flags;
    if (!f.hasSword) return "m1";
    if (!f.reaperDead) return "m2";
    if (!f.spiderDead) return "m3";
    if (f.runes < 5) return "m4";
    if (!f.giantDead) return "m5";
    return "m6";
  }

  private drawGuide(fx: Graphics) {
    if (this.screen !== "play" || this.dialogueActive || !this.map) return;
    const p = this.player;
    const tgt = this.quests.trackedTarget();
    if (!tgt) return;
    let wantA: number | null = Math.atan2(tgt.y - p.y, tgt.x - p.x);
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
    // Подсказка взаимодействия (E)
    const hint = this.interaction.getNearestInteractable();
    if (hint) {
      const hx = hint.x - this.cam.x, hy = hint.y - this.cam.y - 20 + Math.sin(this.realT * 5) * 1.5;
      fx.rect(hx - 6, hy - 6, 12, 10).fill({ color: 0x0a0f16, alpha: 0.85 });
      fx.rect(hx - 6, hy - 6, 12, 10).stroke({ color: 0xc9a24b, width: 1, alpha: 0.8 });
      fx.poly([hx - 2, hy - 3, hx + 2, hy - 3, hx + 2, hy - 1, hx, hy - 1, hx, hy + 2, hx - 2, hy + 2]).fill(0xe8dcc0);
    }
  }

  private updateMinimap() {
    const m = this.map;
    if (!m) return;
    this.hud.mmTimer -= 0.016;
    if (this.hud.mmTimer > 0) return;
    this.hud.mmTimer = 0.15;
    const txi = Math.floor(this.player.x / T), tyi = Math.floor(this.player.y / T);
    const blink = Math.floor(this.realT * 3) % 2;
    const key = txi + "_" + tyi + "_" + blink + "_" + (m.dungeonId ?? -1) + "_" + this.trackedQuest;
    if (key !== this.hud.lastMmKey) {
      this.hud.lastMmKey = key;
      if (this.minimapCanvas && this.mmBase && m) {
        const cx = this.minimapCanvas.getContext("2d");
        if (cx) drawMinimap(cx, this.mmBase, {
          shrines: this.shrines,
          player: this.player,
          target: this.quests.trackedTarget(),
          secretKnown: this.flags.secretKnown,
          stashSpot: m.stashSpot,
          nornsFavor: this.flags.nornsFavor,
          pedestals: this.pedestals,
          map: m,
          realT: this.realT,
        });
      }
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
        this.bus.emit("player:damaged", { dmg: 1, sx: p.x, sy: p.y + 10 });
        this.fx.burst(p.x, p.y + 4, 0x3a6a5c, 3, 20, 0.5, 2, -20);
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
        this.bus.emit("projectile:fire", {
          kind: "arrow" as any,
          x: p.x + Math.cos(a) * 8, y: p.y - 2 + Math.sin(a) * 8,
          vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: 2,
        });
        audio.arrow();
        this.pushHud(true);
      } else this.float(p.x, p.y, "Нет стрел", 0xc9a24b);
    }
    if (!this.bowHeld) this.tsTarget = 1;

    const atkPressed = this.pressed.has("Space") || this.pressed.has("KeyK") || (this.virt.atk && !this.prevVirt.atk);
    const axePressed = this.pressed.has("KeyJ") || (this.virt.axe && !this.prevVirt.axe);
    const actPressed = this.pressed.has("KeyE") || (this.virt.act && !this.prevVirt.act);
    if (atkPressed) this.bus.emit("combat:trySword", {});
    if (axePressed) this.bus.emit("combat:tryAxe", {});
    if (actPressed) this.interaction.tryInteract((id) => this.startDialogue(id));
    this.pressed.clear();
    this.prevVirt = { atk: this.virt.atk, axe: this.virt.axe, act: this.virt.act, bow: this.virt.bow };

    p.swingT = Math.max(0, p.swingT - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);

    // Обновление AI врагов (задаёт vx/vy)
    this.ai.updateEnemies(dt);

    // Физика игрока
    this.physics.moveWithCollisions(p, p.vx * dt, p.vy * dt, this.map, this.doors, this.barrier);

    // Физика врагов (двигает по заданным AI vx/vy)
    for (const e of this.enemies) {
      if (e.dead || e.hidden || e.kind === "snake" || e.kind === "ghost") continue;
      this.physics.moveWithCollisions(e, e.vx * dt, e.vy * dt, this.map, this.doors, this.barrier);
    }

    // Призраки — флайеры: двигаются без физики, проходят сквозь стены
    for (const e of this.enemies) {
      if (e.dead || e.kind !== "ghost") continue;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx = 0; e.vy = 0;
    }

    // Обновление систем
    this.combat.updateProjectiles(dt);
    this.drops.updateDrops(dt);
    this.fog.updateFog(dt, rdt);

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

    const zn = zoneFor(this.map, Math.floor(p.x / T), Math.floor(p.y / T));
    if (zn !== this.zone) {
      if (this.zone !== "") this.toast(zn);
      this.zone = zn;
      this.pushHud(true);
    }

    if (this.map.isDungeon && !this.dungeonBossDead(this.map.dungeonId) && !this.bossRef) {
      const br = this.map.bossRoom;
      if (p.x > br.x && p.x < br.x + br.w && p.y > br.y && p.y < br.y + br.h) this.bus.emit("boss:start-dungeon", {});
    }
  }

  private dungeonBossDead(id: number): boolean {
    const f = this.flags;
    if (id === 0) return f.reaperDead;
    if (id === 1) return f.spiderDead;
    return f.giantDead;
  }

  /* ================= туман (вспомогательное) ================= */
  private get fogWarned(): boolean { return this.fog.fogWarned; }

  /* ================= диалоги ================= */
  private startDialogue(id: string) {
    const d = this.dialogue.startDialogue(id, (dd) => this.cbs.onDialogue(dd));
    if (!d) return;
    this.dialogueActive = true;
    this.talkCount++;
    const sig = this.npcSig(id);
    if (sig) this.talkedSig.set(id, sig);
  }

  /* ================= HUD ================= */
  private pushHud(force = false) {
    this.hud.pushHud(force);
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
    const result = buildAllTileTextures(map, this.roofSnow);
    this.wallCache = result.wallCache;
    this.houseCache = result.houseCache;
    this.groundSpr = new Sprite(result.groundTexture);
    this.groundSpr.zIndex = 0;
    this.dynamic.zIndex = 100;
    this.fxWorld.zIndex = 400;
    this.floatLayer.zIndex = 500;
    this.world.addChildAt(this.groundSpr, 0);
    for (const ws of result.wallSprites) {
      this.wallTiles.push(ws);
      this.dynamic.addChild(ws);
    }
    this.houseSprites = result.houseSprites;
  }

  /* ================= big map (public) ================= */
  drawBigMap(c: HTMLCanvasElement) {
    if (!this.map) return;
    const scale = Math.min(560 / (this.map.W * 2), 420 / (this.map.H * 2)) * 2;
    const base = buildBigMapBase(this.map);
    drawBigMap(c.getContext("2d")!, base, scale, {
      shrines: this.shrines,
      map: this.map,
      dungeonBossDead: this.dungeonBossDead.bind(this),
      bossRoom: this.map.bossRoom,
      bossSpot: this.map.bossSpot,
      dungeonId: this.map.dungeonId,
      player: this.player,
      target: this.quests.trackedTarget(),
      secretKnown: this.flags.secretKnown,
      stashSpot: this.map.stashSpot,
      pedestals: this.pedestals,
      dungeonEntries: this.map.dungeonEntries,
      treeAltar: this.map.treeAltar,
    });
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    this.wallCache.destroy();
    this.houseCache.destroy();
    if (this.app) this.app.destroy(true);
    this.fx.destroy();
    this.bus.clear();
  }
}
