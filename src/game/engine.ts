/* engine.ts – Оркестратор: создаёт EventBus, GameStore и системы */

import { Application, Container, Graphics, RenderTexture, Sprite, Texture, Text } from "pixi.js";
import {
  T, Tl, WorldData, Vec,
  generateOverworld, generateDungeon, solidTileAt, tileAt, zoneFor, DUNGEONS,
} from "./world";
import {
  Player, Enemy, Projectile,
  makeEnemy,
} from "./entities";
import {
  type ProjectileRt, type DropRt,
  type ChestRt, type PedestalRt, type ShrineRt,
  type NpcRt, type DoorRt, type FloatText,
} from "./store";
import { audio } from "./audio";
import { FxManager } from "./fx";
import {
  TILE_COLORS,
  HouseSpriteEntry,
  WallTextureCache,
  HouseTextureCache,
  buildAllTileTextures,
  buildMinimapBase,
  buildBigMapBase,
  drawBigMap,
} from "./tiles";

// Подсистемы
import { InputSystem } from "./system/input-system";
import { StateManager } from "./system/state-manager";
import { EntityManager } from "./system/entity-manager";
import { MapLoader } from "./system/map-loader";
import { RenderSystem } from "./system/render-system";

// Системы
import { EventBus } from "./event-bus";
import { GameStore, type GameStoreConfig } from "./store";
import { PlayerDomain } from "./store/player-domain";
import { clamp, dist2 } from "./utils";
import { QuestView } from "./types";
export type { QuestView } from "./types";
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

/** Состояние виртуального джойстика. */
export interface VirtualInput {
  x: number; y: number;
  atk: boolean; axe: boolean; bow: boolean; act: boolean;
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

const ZOOM = 1.18;

export class Engine {
  private cbs: EngineCallbacks;
  private container: HTMLElement;
  private app!: Application;
  private ready: Promise<void>;

  // EventBus и GameStore
  private bus = new EventBus();
  private store!: GameStore;
  private playerDomain!: PlayerDomain;

  // Подсистемы
  private input = new InputSystem(this.bus);
  private state = new StateManager();
  private entityMgr!: EntityManager;
  private mapLoader!: MapLoader;
  private renderer!: RenderSystem;

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

  // Слои
  private world = new Container();
  private dynamic = new Container();
  private fxWorld = new Container();
  private floatLayer = new Container();
  private fxScreen = new Graphics();
  private fx = new FxManager();
  private fadeG = new Graphics();
  private canvasEl: HTMLCanvasElement | null = null;

  // Вьюпорт
  private viewW = 480;
  private viewH = 270;
  private cam = { x: 0, y: 0 };

  // Локальные данные (для рендеринга и обновления)
  private player: Player = { x: 0, y: 0, vx: 0, vy: 0, r: 5, hp: 12, maxHp: 12, dir: { x: 0, y: 1 }, moving: false, animT: 0, swingT: 0, hurtT: 0, slowT: 0 };
  private playerG = new Graphics();
  private playerBody: any = null;
  private floats: FloatText[] = [];
  private realT = 0;
  private stepT = 0;
  private hudTimer = 0;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private mmBase: ImageData | null = null;

  // Мир
  private ow!: WorldData;
  private dungeons: WorldData[] = [];
  private map!: WorldData;

  // Флаги
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
  private dialogueActive = false;
  private arrowA = -Math.PI / 2;
  public _arrowA = -Math.PI / 2;
  private starting = false;

  // Массивы сущностей (для передачи в EntityManager)
  private enemies: (Enemy & { g: Graphics })[] = [];
  private projectiles: ProjectileRt[] = [];
  private dropsArr: DropRt[] = [];
  private chests: ChestRt[] = [];
  private pedestals: PedestalRt[] = [];
  private shrines: ShrineRt[] = [];
  private npcs: NpcRt[] = [];
  private doors: DoorRt[] = [];

  constructor(container: HTMLElement, cbs: EngineCallbacks) {
    this.container = container;
    this.cbs = cbs;
    this.ready = this.init(container);
  }

  /* ================= инициализация ================= */

  private spawnEnemy(kind: Enemy["kind"], x: number, y: number): Enemy & { g: Graphics } {
    const e = makeEnemy(kind, x, y, this.enemies.length);
    const g = new Graphics();
    g.position.set(x, y);
    (e as Enemy & { g: Graphics }).g = g;
    this.enemies.push(e as Enemy & { g: Graphics });
    this.dynamic.addChild(g);
    const body = this.entityMgr.makeBody(e.r, { x, y });
    if (kind === "raven" || kind === "snake" || kind === "spider" || kind === "ghost") {
      this.entityMgr.farBody(body);
      (e as any).body = body;
    } else {
      (e as any).body = body;
    }
    return e as Enemy & { g: Graphics };
  }

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

    // Регистрируем ввод
    this.input.register();

    // Подписки на абстрактные действия ввода
    this.bus.on("input:pause", () => this.handlePause());
    this.bus.on("input:inventory", () => this.handleInventory());
    this.bus.on("input:quests", () => this.handleQuests());
    this.bus.on("input:mute", () => this.toggleMute());
    this.bus.on("input:use-heart", () => { if (this.state.screen === "play") this.useStoredHeart(); });
    this.bus.on("input:toggle-snow", () => this.handleSnow());
    this.bus.on("input:close-overlay", () => this.closeOverlay());

    this.applyViewSize();

    // Игровой цикл
    app.ticker.maxFPS = 60;
    app.ticker.add((tk) => this.tick(Math.min(tk.deltaMS / 1000, 0.05)));

    // Инициализируем подсистемы ДО buildGameStore
    this.entityMgr = new EntityManager(this.bus, {
      spawnEnemy: (kind: string, x: number, y: number) => this.spawnEnemy(kind as any, x, y),
      loadMap: (map: WorldData, spawn: Vec) => this.loadMap(map, spawn),
      toast: (msg: string) => this.toast(msg),
    }, {
      enemies: this.enemies,
      projectiles: this.projectiles,
      drops: this.dropsArr,
      chests: this.chests,
      pedestals: this.pedestals,
      shrines: this.shrines,
      npcs: this.npcs,
      doors: this.doors,
    }, this.dynamic);
    this.mapLoader = new MapLoader(this.bus, this.entityMgr, {
      enemies: this.enemies,
      projectiles: this.projectiles,
      drops: this.dropsArr,
      chests: this.chests,
      pedestals: this.pedestals,
      shrines: this.shrines,
      npcs: this.npcs,
      doors: this.doors,
    }, {
      spawnEnemy: (kind: string, x: number, y: number) => this.spawnEnemy(kind as any, x, y),
      loadMap: (map: WorldData, spawn: Vec) => this.loadMap(map, spawn),
      toast: (msg: string) => this.toast(msg),
    }, this.dynamic);

    // Создаём GameStore и системы
    this.store = this.buildGameStore();
    this.instantiateSystems(this.store);
  }

  private buildGameStore(): GameStore {
    const eng = this;
    // Создаём PlayerDomain с колбэками на события
    eng.playerDomain = new PlayerDomain(
      eng.player.hp,
      eng.player.maxHp,
      eng.player.x,
      eng.player.y,
      eng.player.vx,
      eng.player.vy,
      eng.player.dir,
      eng.player.r,
      {
        onDamaged: (dmg, sx, sy) => eng.bus.emit("player:damaged", { dmg, sx, sy }),
        onDied: () => eng.bus.emit("player:died", {}),
        onHealed: (amount) => eng.bus.emit("player:healed", { amount }),
        onHeartUsed: (amount) => eng.bus.emit("player:heartUsed", { amount }),
      }
    );
    const config: GameStoreConfig = {
      flags: eng.flags,
      player: eng.player,
      playerDomain: eng.playerDomain,
      services: {
        spawnEnemy: (kind: string, x: number, y: number) => eng.entityMgr?.spawnEnemy(kind as any, x, y)!,
        loadMap: (map: WorldData, spawn: Vec) => eng.loadMap(map, spawn),
        setScreen: (s: Screen) => eng.setScreen(s),
        fadeTo: (a: number) => eng.fadeTo(a),
        toast: (msg: string) => eng.toast(msg),
        onProjectileAdd: (g: Graphics) => eng.dynamic.addChild(g),
        onDropAdd: (g: Graphics) => eng.dynamic.addChild(g),
      },
      callbacks: {
        onHud: (data: any) => eng.pushHudData(data),
        onScreen: (s: Screen) => { eng.state.screen = s; eng.bus.emit("screen:change", { screen: s }); },
        onDialogue: (d: DialogueData | null) => {
          if (d) {
            eng.bus.emit("dialogue:start", { id: d.id });
          }
        },
        onToast: (msg: string) => eng.toast(msg),
        onStats: (data: any) => eng.bus.emit("hud:dirty", {}),
      },
      entitiesArrays: {
        enemies: this.enemies,
        projectiles: this.projectiles,
        drops: this.dropsArr,
        chests: this.chests,
        pedestals: this.pedestals,
        shrines: this.shrines,
        npcs: this.npcs,
        doors: this.doors,
      },
    };
    const store = new GameStore(config);
    return store;
  }

  private instantiateSystems(store: GameStore) {
    this.quests      = new QuestSystem(this.bus, store);
    this.dialogue    = new DialogueSystem(this.bus, store, this.fx);
    this.drops       = new DropsSystem(this.bus, store);
    this.fog         = new FogSystem(this.bus, store);
    this.physics     = new PhysicsSystem();
    this.combat      = new CombatSystem(this.bus, store, this.physics);
    this.ai          = new AISystem(this.bus, store, this.physics);
    this.interaction = new InteractionSystem(this.bus, store);
    this.hud         = new HudSystem(this.bus, store, this.quests);
    this.renderer    = new RenderSystem({
      entityMgr: this.entityMgr,
      fx: this.fx,
      fog: this.fog,
      quests: this.quests,
      hud: this.hud,
      interaction: this.interaction,
      npcSigProvider: this,
      talkedSig: this.talkedSig,
      flags: this.store.flags,
      store: { bossRef: () => this.store.bossRef, map: () => this.store.map ?? undefined },
    });
    // Подписки на события движка
    this.bus.on("engine:enter-dungeon", (e) => this.enterDungeon(e));
    this.bus.on("engine:exit-dungeon", (e) => this.exitDungeon(e));
    this.bus.on("hud:float", (e) => this.float(e.x, e.y, e.text, e.color));
    this.bus.on("player:died", () => this.state.onPlayerDied());
    // Связываем смену экрана в state с уведомлением App.tsx
    this.state.setHandlers((s) => this.setScreen(s), (msg) => this.toast(msg));
  }

  private enterDungeon(e: { dungeonId: number }) {
    if (this.flags.snakeStarted && !this.flags.snakeDead) return;
    const dun = this.dungeons[e.dungeonId];
    if (!dun) return;
    audio.door();
    this.fadeTo(1);
    this.loadMap(dun, dun.spawn);
    this.fadeTo(0);
    this.toast(`${dun.dungeonName}: страж пробудился`);
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
      this.store.setOw(this.ow);
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
    this.talkedSig.clear();
    this.player.hp = this.player.maxHp = 12;
    this.realT = 0;
    this.store.setZone("");
    audio.setFog(false);
    try {
      this.loadMap(this.ow, this.ow.spawn);
      this.setScreen("play");
      this.fadeTo(1);
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
    audio.uiClick();
    this.state.togglePause();
  }
  toggleMute() { audio.toggleMute(); this.pushHud(true); }
  setVirtual(v: Partial<VirtualInput>) { this.input.setVirtual(v); }
  attachMinimap(c: HTMLCanvasElement) {
    if (this.minimapCanvas !== c) { this.minimapCanvas = c; this.mmBase = this.map ? buildMinimapBase(this.map) : null; }
  }

  openQuests() { if (this.state.screen === "play") this.setScreen("quests"); }
  openInventory() { if (this.state.screen === "play") this.setScreen("inventory"); }
  openMap() { if (this.state.screen === "play") this.setScreen("map"); }
  closeOverlay() {
    if (this.state.screen === "quests" || this.state.screen === "inventory" || this.state.screen === "map") this.setScreen("play");
  }
  trackQuest(id: string) {
    this.store.trackedQuest = id;
    const def = this.quests.questDefs().find((q) => q.id === id);
    this.toast(def ? `Стрелка ведёт: ${def.title}` : "Цель обновлена");
    audio.uiClick();
    this.pushHud(true);
  }

  advanceDialogue() {
    this.dialogueActive = false;
    this.input.clearPressed();
    this.dialogue.endDialogue((dd) => this.cbs.onDialogue(dd));
  }

  private setScreen(s: Screen) { this.state.screen = s; this.cbs.onScreen(s); }
  private toast(msg: string) { this.cbs.onToast(msg); }
  private fadeTo(a: number) { this.state.setFadeTarget(a); }

  /* ================= загрузка карты ================= */
  private loadMap(map: WorldData, spawn: Vec) {
    this.map = map;
    this.store.setMap(map);

    const p = this.player;
    p.x = spawn.x; p.y = spawn.y;
    this.playerDomain.setPosition(spawn.x, spawn.y);
    this.playerDomain.setVelocity(0, 0);
    this.playerDomain.resetTimers();
    p.hp = Math.min(p.hp, p.maxHp);
    this.playerG.position.set(spawn.x, spawn.y);
    this.dynamic.addChild(this.playerG);
    this.playerG.zIndex = 100;

    // Физическое тело игрока
    this.playerBody = this.entityMgr.makeBody(p.r, spawn);

    this.cam.x = clamp(spawn.x - this.viewW / 2, 0, Math.max(0, map.W * T - this.viewW));
    this.cam.y = clamp(spawn.y - this.viewH / 2, 0, Math.max(0, map.H * T - this.viewH));

    // Загружаем карту через MapLoader
    this.mapLoader.loadMap(
      map, spawn,
      this.player, this.playerDomain, this.playerG,
      this.cam, this.viewW, this.viewH,
      this.flags, this.store,
      this.drops, this.entityMgr.entities.drops,
      this.floats,
      (msg) => this.toast(msg),
      (force?) => this.pushHud(force)
    );
  }

  /* ================= клавиши-обработчики ================= */

  private handlePause() {
    if (this.state.screen === "play") this.setScreen("pause");
    else if (this.state.screen === "pause") this.setScreen("play");
    else this.closeOverlay();
  }

  private handleInventory() {
    if (this.state.screen === "play") this.setScreen("inventory");
    else if (this.state.screen === "inventory") this.setScreen("play");
    audio.uiClick();
  }

  private handleQuests() {
    if (this.state.screen === "play") this.setScreen("quests");
    else if (this.state.screen === "quests") this.setScreen("play");
    audio.uiClick();
  }

  private handleSnow() {
    this.entityMgr.setRoofSnow(!this.entityMgr.roofSnow);
    this.toast(this.entityMgr.roofSnow ? "Снег на крышах: вкл" : "Снег на крышах: выкл");
  }

  private useStoredHeart() {
    const p = this.player;
    if (p.hp >= p.maxHp) { this.float(p.x, p.y, "Здоровье полное", 0x6e7f8d); return; }
    if (this.flags.hearts <= 0) { this.float(p.x, p.y, "Сума пуста", 0x6e7f8d); return; }
    this.flags.hearts--;
    this.playerDomain.heal(4);
    audio.heal();
    this.fx.burst(p.x, p.y, 0x7ee2a8, 10, 50, 0.8, 2, -20);
    this.float(p.x, p.y - 10, "+4", 0x7ee2a8);
    this.pushHud(true);
  }

  /* ================= главный цикл ================= */
  private tick(rdt: number) {
    if (!this.app) return;
    
    // Обновление StateManager и обработка состояний
    this.state.update(rdt);
    if (this.state.screen === "play" && !this.dialogueActive) {
      if (this.state.hitstop > 0) this.state.hitstop -= rdt;
      else this.update(rdt * this.state.timeScale, rdt);
    } else {
      audio.setIntensity(0);
      if (this.state.screen === "death") {
        if (this.state.tickDeathTimer(rdt) <= 0 && this.state.screen === "death") this.respawn();
      }
    }

    // Рендеринг делегируется RenderSystem
    this.realT = this.renderer.tick(
      rdt, this.app, this.realT, this.state, this.map, this.player, this.playerG,
      this.cam, this.viewW, this.viewH, this.floats, this.fadeG, this.fxScreen,
      this.world, this.hudTimer, (v: number) => { this.hudTimer = v; },
      ((f?: boolean) => this.pushHud(f)), () => {},
      this.minimapCanvas, this.mmBase
    );
  }

  /* ================= NPC ================= */

  npcSig(id: string): string {
    return this.quests.npcSig(id);
  }

  mainQuestId(): string {
    return this.quests.mainQuestId();
  }

  /* ================= обновление ================= */

  private update(dt: number, rdt: number) {
    const p = this.player;

    // Синхронизация PlayerDomain с реальным Player
    this.playerDomain.syncFrom({
      x: p.x, y: p.y,
      vx: p.vx, vy: p.vy,
      hp: p.hp, maxHp: p.maxHp,
      swingT: p.swingT, hurtT: p.hurtT, slowT: p.slowT,
    });

    // Получаем состояние ввода
    const input = this.input.getState();

    // Движение
    let ix = input.ix, iy = input.iy;
    const mag = Math.hypot(ix, iy);
    if (mag > 0.12) p.dir = { x: ix / Math.max(1, mag), y: iy / Math.max(1, mag) };

    const tile = tileAt(this.map, Math.floor(p.x / T), Math.floor(p.y / T));
    let speed = 92;
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
    p.vx = ix * speed;
    p.vy = iy * speed;

    // Лук
    const bowKeyDown = this.input.isKeyHeld("KeyL") || this.input.isBowVirtualHeld();
    if (bowKeyDown && this.flags.hasBow) {
      this.input.updateBow(true);
      this.state.setTsTarget(0.45);
    } else if (this.input.getBowHeld()) {
      this.input.updateBow(false);
      this.state.setTsTarget(1);
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
    if (!this.input.getBowHeld()) this.state.setTsTarget(1);

    // Действия
    if (input.atkPressed) this.bus.emit("combat:trySword", {});
    if (input.axePressed) this.bus.emit("combat:tryAxe", {});
    if (input.actPressed) this.interaction.tryInteract((id) => this.startDialogue(id));
    this.input.clearPressed();

    this.playerDomain.updateTimers(dt);

    // Обновление AI врагов
    this.ai.updateEnemies(dt);

    // Физика игрока
    this.physics.moveWithCollisions(p, p.vx * dt, p.vy * dt, this.map, this.entityMgr.entities.doors, this.entityMgr.barrier);

    // Физика врагов
    for (const e of this.entityMgr.entities.enemies) {
      if (e.dead || e.hidden || e.kind === "snake" || e.kind === "ghost") continue;
      this.physics.moveWithCollisions(e, e.vx * dt, e.vy * dt, this.map, this.entityMgr.entities.doors, this.entityMgr.barrier);
    }

    // Призраки — флайеры
    for (const e of this.entityMgr.entities.enemies) {
      if (e.dead || e.kind !== "ghost") continue;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx = 0; e.vy = 0;
    }

    // Обновление систем
    this.combat.updateProjectiles(dt);
    this.drops.updateDrops(dt);
    this.fog.updateFog(dt, rdt);

    for (const d of this.entityMgr.entities.doors) {
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
    if (zn !== this.store.zone) {
      if (this.store.zone !== "") this.toast(zn);
      this.store.setZone(zn);
      this.pushHud(true);
    }

    if (this.map.isDungeon && !this.dungeonBossDead(this.map.dungeonId) && !this.store.bossRef) {
      const br = this.map.bossRoom;
      if (p.x > br.x && p.x < br.x + br.w && p.y > br.y && p.y < br.y + br.h) this.bus.emit("boss:start-dungeon", {});
    }

    // Синхронизация Player ← PlayerDomain
    this.playerDomain.syncToPlayer(p);
  }

  /* ================= респавн ================= */

  dungeonBossDead(id: number): boolean {
    return this.combat.dungeonBossDead(id);
  }

  private respawn() {
    let spawn = this.map?.spawn ?? { x: 0, y: 0 };
    const f = this.flags;
    if (f.shrineIdx >= 0 && this.ow) {
      const s = this.ow.shrines[f.shrineIdx];
      if (s) spawn = { x: s.x * T + 8, y: s.y * T + 8 };
    }
    this.player.x = spawn.x; this.player.y = spawn.y;
    this.playerDomain.setPosition(spawn.x, spawn.y);
    this.playerDomain.setVelocity(0, 0);
    this.playerDomain.fullHeal();
    this.playerDomain.resetTimers();
    this.player.hp = this.playerDomain.fullHeal();
    this.state.playerDead = false;
    this.setScreen("play");
    this.fadeTo(1);
    if (this.map.isDungeon) {
      this.loadMap(this.ow, spawn);
    }
    this.hud.pushHud(true);
    this.bus.emit("player:respawned", {});
  }

  /* ================= диалоги ================= */

  private startDialogue(id: string) {
    const d = this.dialogue.startDialogue(id, (dd) => this.cbs.onDialogue(dd));
    if (!d) return;
    this.dialogueActive = true;
    const sig = this.npcSig(id);
    if (sig) this.talkedSig.set(id, sig);
  }

  /* ================= HUD ================= */

  private pushHud(force = false) {
    this.hud.pushHud(force);
  }

  private pushHudData(data: HudData) {
    this.cbs.onHud(data);
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

  /* ================= big map (public) ================= */

  drawBigMap(c: HTMLCanvasElement) {
    if (!this.map) return;
    const scale = Math.min(560 / (this.map.W * 2), 420 / (this.map.H * 2)) * 2;
    const base = buildBigMapBase(this.map);
    drawBigMap(c.getContext("2d")!, base, scale, {
      shrines: this.entityMgr.entities.shrines,
      map: this.map,
      dungeonBossDead: this.dungeonBossDead.bind(this),
      bossRoom: this.map.bossRoom,
      bossSpot: this.map.bossSpot,
      dungeonId: this.map.dungeonId,
      player: this.player,
      target: this.quests.trackedTarget(),
      secretKnown: this.flags.secretKnown,
      stashSpot: this.map.stashSpot,
      pedestals: this.entityMgr.entities.pedestals,
      dungeonEntries: this.map.dungeonEntries,
      treeAltar: this.map.treeAltar,
    });
  }

  /* ===== Вспомогательные поля для доступа из других методов ===== */

  /* ===== Рендереры ===== */
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

  /* ===== Вьюпорт ===== */

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

  /* ===== Туман (вспомогательное) ===== */
  private get fogWarned(): boolean { return this.fog.fogWarned; }

  /* ===== Уничтожение ===== */

  destroy() {
    this.input.unregister();
    this.entityMgr.destroy();
    this.wallCache.destroy();
    this.houseCache.destroy();
    if (this.app) this.app.destroy(true);
    this.fx.destroy();
    this.bus.clear();
  }

  /* ===== Вспомогательные поля ===== */
  private wallCache = new WallTextureCache();
  private houseCache = new HouseTextureCache();
}
