/* engine.ts – Оркестратор: создаёт EventBus, GameStore и системы */

import { Application, Container, Graphics, RenderTexture, Sprite, Texture } from "pixi.js";
import {
  T, Tl, WorldData, Vec,
  generateOverworld, generateDungeon, solidTileAt, tileAt, zoneFor, DUNGEONS,
} from "./world";
import {
  Player, Enemy, Projectile,
} from "./entities";
import {
  type ProjectileRt, type DropRt,
  type ChestRt, type PedestalRt, type ShrineRt,
  type NpcRt, type DoorRt,
} from "./store";
import { audio } from "./audio";
import { FxManager } from "./fx";
import {
  HouseSpriteEntry,
  WallTextureCache,
  HouseTextureCache,
  buildAllTileTextures,
} from "./tiles";
import { buildMinimapBase, buildBigMapBase, drawBigMap, drawMinimap } from "./map-display";

// Подсистемы
import { InputSystem } from "./input/input-system";
import { StateManager } from "./state/state-manager";

// Системы
import { EventBus } from "./event-bus";
import { GameStore, type GameStoreConfig } from "./store";
import { PlayerDomain } from "./store/player-domain";
import { clamp, dist2 } from "./utils";
import { QuestView } from "./types";
import { Vec2 } from "planck-js";
export type { QuestView } from "./types";
import { QuestSystem } from "./quests/quest-system";
import { DialogueSystem } from "./dialogue/dialogue-system";
import { HudSystem } from "./hud/hud-system";

// ECS интеграция
import { createEcsWorld, getEcsWorld } from './ecs/ecs-world';
import { initPrefabs } from './ecs/ecs-systems';
import { createEcsGameLoop, type EcsGameLoop } from './ecs/ecs-game-loop';
import { EcsMapLoader } from './ecs/ecs-map-loader';
import { PlanckWorld, Cat, type PhysicsCallbacks } from './physics/planck-world';

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

  // ECS интеграция
  private ecsWorld: any = null;
  private ecsGameLoop: EcsGameLoop | null = null;
  private ecsMapLoader: EcsMapLoader | null = null;
  private ecsPlayerBody: any = null;
  private ecsPlayerEid: number = -1;

  // Системы (ECS или legacy)
  private quests!: QuestSystem;
  private dialogue!: DialogueSystem;
  private hud!: HudSystem;

  // Слои
  private tileLayer = new Container();
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
  private realT = 0;
  private stepT = 0;
  private hudTimer = 0;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private mmBase: ImageData | null = null;

  // Мир
  private ow!: WorldData;
  private dungeons: WorldData[] = [];
  private map!: WorldData;

  // Состояние рендеринга
  private roofSnow = false;

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

  /** ECS callback для спавна стражей пьедестала */
  private guardSpawn(kind: string, x: number, y: number, pedestalIndex: number): void {
    if (!this.ecsWorld || !this.ecsMapLoader) return;
    const { createEnemyInEcs } = require('./ecs/ecs-bridge');
    const g = new Graphics();
    g.position.set(x, y);
    const eid = createEnemyInEcs(
      this.ecsWorld, kind, x, y, g, this.ecsMapLoader.planckWorld,
      Cat.Enemy, Cat.Enemy | Cat.Player | Cat.Projectile | Cat.Ground
    );
    this.dynamic.addChild(g);
    // Set aggro and guardOf via Enemy component (SoA)
    const { Enemy } = require('./ecs/ecs-components');
    Enemy.aggro[eid] = 1;
    Enemy.guardOf[eid] = pedestalIndex;
  }

  private getEnemyStats(kind: string): { r: number; hp: number; speed: number; dmg: number } {
    const stats: Record<string, { r: number; hp: number; speed: number; dmg: number }> = {
      draugr:  { r: 6, hp: 3, speed: 52, dmg: 1 },
      varg:    { r: 6, hp: 3, speed: 68, dmg: 1 },
      raven:   { r: 5, hp: 2, speed: 78, dmg: 1 },
      shroom:  { r: 5, hp: 3, speed: 40, dmg: 1 },
      crawler: { r: 6, hp: 2, speed: 56, dmg: 1 },
      frost:   { r: 7, hp: 4, speed: 48, dmg: 1 },
      reaper:  { r: 10, hp: 16, speed: 58, dmg: 1 },
      spider:  { r: 11, hp: 12, speed: 44, dmg: 1 },
      giant:   { r: 13, hp: 20, speed: 44, dmg: 2 },
      snake:   { r: 16, hp: 14, speed: 0,  dmg: 1 },
      ghost:   { r: 6, hp: 5, speed: 100, dmg: 1 },
    };
    return stats[kind] || { r: 5, hp: 1, speed: 50, dmg: 1 };
  }

  private _debugMode: boolean;

  constructor(container: HTMLElement, cbs: EngineCallbacks, debugMode: boolean = false) {
    this.container = container;
    this.cbs = cbs;
    this._debugMode = debugMode;
    this.ready = this.init(container);
  }

  /** Получить debug-флаг */
  get debugMode() { return this._debugMode; }

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
    this.tileLayer.sortableChildren = true;
    // dynamic НЕ sortableChildren — z-order определяется порядком addChild
    this.fxWorld.addChild(this.fx.worldParticleGraphics);
    this.world.addChild(this.tileLayer);
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

    // Инициализация ECS мира (только мир и префабы)
    this.ecsWorld = createEcsWorld();
    initPrefabs(this.ecsWorld);

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
        spawnEnemy: (kind: string, x: number, y: number) => null as any,
        loadMap: (map: WorldData, spawn: Vec) => eng.loadMap(map, spawn),
        setScreen: (s: Screen) => eng.setScreen(s),
        fadeTo: (a: number) => eng.fadeTo(a),
        toast: (msg: string) => eng.toast(msg),
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
    };
    const store = new GameStore(config);
    return store;
  }

  private instantiateSystems(store: GameStore) {
    // ECS world уже создан, Planck world будет создан в EcsMapLoader
    
    this.quests      = new QuestSystem(this.bus, store);
    this.dialogue    = new DialogueSystem(this.bus, store);
    this.hud         = new HudSystem(this.bus, store, this.quests);
    
    // Подписки на события движка
    this.bus.on("engine:enter-dungeon", (e) => this.enterDungeon(e));
    this.bus.on("engine:exit-dungeon", (e) => this.exitDungeon(e));
    this.bus.on("hud:float", (e) => this.float(e.x, e.y, e.text, e.color));
    this.bus.on("player:died", () => this.state.onPlayerDied());
    // Связываем смену экрана в state с уведомлением App.tsx
    this.state.setHandlers((s) => this.setScreen(s), (msg) => this.toast(msg));

    // Инициализация ECS Game Loop (после всех систем)
    if (this.ecsWorld) {
      this.ecsGameLoop = createEcsGameLoop({
        world: this.ecsWorld,
        bus: this.bus,
        store: this.store,
        planckWorld: null as any, // будет установлен после загрузки карты
        app: this.app,
        dynamic: this.dynamic,
        floatLayer: this.floatLayer,
        gameWorld: this.world,
        fx: this.fx,
        input: this.input,
        state: this.state,
        cam: this.cam,
        viewW: this.viewW,
        viewH: this.viewH,
        map: this.map,
        ow: this.ow,
        flags: this.flags,
        talkedSig: this.talkedSig,
        dialogueActive: this.dialogueActive,
        stepT: this.stepT,
        realT: this.realT,
        playerEid: -1,
        playerDomain: this.playerDomain,
        hud: this.hud,
        quests: this.quests,
        dialogue: this.dialogue,
        dungeonBossDead: this.dungeonBossDead.bind(this),
        toast: (msg: string) => this.toast(msg),
        float: (x: number, y: number, text: string, color: number) => this.float(x, y, text, color),
        pushHud: (force?: boolean) => this.pushHud(force),
        startDialogue: (id: string) => this.startDialogue(id),
        npcSig: (id: string) => this.npcSig(id),
        onStepAudio: () => audio.step(),
        stepTRef: this.stepT,
        realTRef: this.realT,
        guardSpawn: (kind: string, x: number, y: number, idx: number) => this.guardSpawn(kind, x, y, idx),
      });
    }
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

    // Debug mode: загружаем тестовую карту без генерации мира
    if (this._debugMode) {
      console.log("[Engine] DEBUG MODE: loading test map");
      try {
        const { createTestMap } = await import("./generators/createTestMap");
        const testMap = createTestMap(21, { x: 10 * 16 + 8, y: 10 * 16 + 8 });
        this.ow = testMap;
        this.store.setOw(this.ow);
      } catch (e) {
        this.starting = false;
        console.error("Сбой загрузки тестовой карты:", e);
        this.toast("Не удалось загрузить тестовую карту");
        throw e;
      }
    } else {
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
      // В debug-режиме пропускаем диалог с Эйриком
      if (!this._debugMode) {
        this.startDialogue("eirik");
      }
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

    this.cam.x = clamp(spawn.x - this.viewW / 2, 0, Math.max(0, map.W * T - this.viewW));
    this.cam.y = clamp(spawn.y - this.viewH / 2, 0, Math.max(0, map.H * T - this.viewH));

    // Очищаем float text перед загрузкой новой карты
    // Float text очищается в ECS render system

    // ECS загрузка карты
    this.loadMapEcs(map, spawn);
  }

  /** ECS загрузка карты */
  private loadMapEcs(map: WorldData, spawn: Vec) {
    // Сохраняем дропы перед очисткой мира
    const savedDrops = this.ecsGameLoop ? this.ecsGameLoop.getDropsForTransition() : [];

    // Строим текстуры — ground как фон, стены/дома в tileLayer
    const tileResult = buildAllTileTextures(map, this.roofSnow);
    
    // Ground texture — фон мира
    const groundSprite = new Sprite(tileResult.groundTexture);
    groundSprite.position.set(0, 0);
    groundSprite.zIndex = 0;
    this.tileLayer.addChildAt(groundSprite, 0);
    
    tileResult.wallSprites.forEach(ws => this.tileLayer.addChild(ws));
    tileResult.houseSprites.forEach(hs => this.tileLayer.addChild(hs.spr));
    this.wallCache = tileResult.wallCache;
    this.houseCache = tileResult.houseCache;

    // Создаём ECS Map Loader
    this.ecsMapLoader = new EcsMapLoader({
      world: this.ecsWorld,
      planckWorld: new PlanckWorld(),
      dynamicContainer: this.dynamic,
      openedChests: this.store.openedChests,
      takenPedestals: this.store.takenPedestals,
      visitedShrines: this.store.visitedShrines,
      flags: {
        secretKnown: this.flags.secretKnown,
        shrineIdx: this.flags.shrineIdx,
        runes: this.flags.runes,
        snakeStarted: this.flags.snakeStarted,
        hasKey: this.flags.hasKey,
      },
      map,
      spawn,
      viewW: this.viewW,
      viewH: this.viewH,
      savedDrops,
      toast: (msg) => this.toast(msg),
    });

    const result = this.ecsMapLoader.loadMap(this.playerG, this.playerDomain);
    this.ecsPlayerBody = result.playerBody;
    
    // Построить mmBase для minimap и big map
    this.mmBase = buildMinimapBase(map);
    
    // Установить PlanckWorld в game loop
    if (this.ecsGameLoop) {
      this.ecsGameLoop.setPlanckWorld(this.ecsMapLoader.planckWorld);
    }
    
    // Обновить playerEid в game loop
    if (this.ecsGameLoop) {
      this.ecsGameLoop.setPlayerEid(result.playerEid);
    }

    // Обновляем game loop с новыми данными (без legacy систем)
    if (this.ecsGameLoop) {
      // Пересоздаём game loop с новыми параметрами
      this.ecsGameLoop = createEcsGameLoop({
        world: this.ecsWorld,
        bus: this.bus,
        store: this.store,
        planckWorld: this.ecsMapLoader.planckWorld,
        app: this.app,
        dynamic: this.dynamic,
        floatLayer: this.floatLayer,
        gameWorld: this.world,
        fx: this.fx,
        input: this.input,
        state: this.state,
        cam: this.cam,
        viewW: this.viewW,
        viewH: this.viewH,
        map,
        ow: this.ow,
        flags: this.flags,
        talkedSig: this.talkedSig,
        dialogueActive: this.dialogueActive,
        stepT: this.stepT,
        realT: this.realT,
        playerEid: result.playerEid,
        playerDomain: this.playerDomain,
        hud: this.hud,
        quests: this.quests,
        dialogue: this.dialogue,
        dungeonBossDead: this.dungeonBossDead.bind(this),
        toast: (msg: string) => this.toast(msg),
        float: (x: number, y: number, text: string, color: number) => this.float(x, y, text, color),
        pushHud: (force?: boolean) => this.pushHud(force),
        startDialogue: (id: string) => this.startDialogue(id),
        npcSig: (id: string) => this.npcSig(id),
        onStepAudio: () => audio.step(),
        stepTRef: this.stepT,
        realTRef: this.realT,
        guardSpawn: (kind: string, x: number, y: number, idx: number) => this.guardSpawn(kind, x, y, idx),
      });
    }
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
    this.roofSnow = !this.roofSnow;
    this.toast(this.roofSnow ? "Снег на крышах: вкл" : "Снег на крышах: выкл");
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
      else {
        const effectiveDt = rdt * this.state.timeScale;
        // ECS Game Loop
        if (this.ecsGameLoop) {
          this.ecsGameLoop.tick(effectiveDt, 1);
          this.realT = this.ecsGameLoop.realT;
        }
      }
    } else {
      audio.setIntensity(0);
      if (this.state.screen === "death") {
        if (this.state.tickDeathTimer(rdt) <= 0 && this.state.screen === "death") this.respawn();
      }
    }

    // Рендеринг через ECS
    if (this.ecsGameLoop) this.ecsGameLoop.render(rdt);
    // Minimap update через утилиту из map-display.ts
    if (this.minimapCanvas && this.mmBase) {
      const ctx = this.minimapCanvas.getContext("2d");
      if (ctx) {
        drawMinimap(ctx, this.mmBase, {
          map: this.map,
          player: this.player,
          shrines: [],
          secretKnown: false,
          stashSpot: { x: 0, y: 0 },
          nornsFavor: false,
          pedestals: [],
          target: null,
          realT: this.realT,
        });
      }
    }
  }

  /* ================= NPC ================= */

  npcSig(id: string): string {
    return this.quests.npcSig(id);
  }

  mainQuestId(): string {
    return this.quests.mainQuestId();
  }

  /* ================= респавн ================= */

  dungeonBossDead(id: number): boolean {
    // Map dungeonId to boss name and check flags directly (avoids ECS loop recursion)
    const boss = DUNGEONS[id]?.boss;
    if (boss) return (this.flags as unknown as Record<string, boolean>)[`${boss}Dead`] === true;
    return false;
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
    // Всегда загружаем карту через ECS
    this.loadMap(this.ow, spawn);
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
    import('./ecs/ecs-systems/render-system').then(({ addFloatText }) => {
      import("pixi.js").then(({ Text }) => {
        addFloatText(this.floatLayer, { createText: (t: string, s: any) => new Text({ ...s, text: t }) }, x, y, text, color);
      });
    });
  }

  /* ================= big map (public) ================= */

  drawBigMap(c: HTMLCanvasElement) {
    if (!this.map) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Используем утилиту из map-display.ts для рендеринга большой карты
    drawBigMap(ctx, this.mmBase!, 2, {
      map: this.map,
      shrines: this.ow?.shrines ?? [],
      dungeonBossDead: this.dungeonBossDead.bind(this),
      dungeonEntries: this.ow?.dungeonEntries ?? [],
      treeAltar: this.ow?.treeAltar ?? { x: 0, y: 0 },
      player: { x: this.player.x, y: this.player.y },
      target: this.quests.trackedTarget(),
      secretKnown: this.flags.secretKnown,
      stashSpot: this.ow?.stashSpot ?? { x: 0, y: 0 },
      pedestals: (this.map.pedestals ?? []).map((p) => ({ x: p.x, y: p.y, taken: this.store.takenPedestals.has(`ped_${p.x}_${p.y}`) })),
      bossRoom: this.map.isDungeon ? this.map.bossRoom : { x: 0, y: 0, w: 0, h: 0 },
      bossSpot: this.map.isDungeon ? this.map.bossSpot : { x: 0, y: 0 },
      dungeonId: this.map.isDungeon ? 0 : -1,
    });
  }

  /* ===== Вспомогательные поля для доступа из других методов ===== */

  /* ===== Вспомогательные поля ===== */

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

  /* ===== Уничтожение ===== */

  destroy() {
    this.input.unregister();
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
