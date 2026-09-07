/* engine.ts – Оркестратор: создаёт EventBus, GameStore и системы */

import { Application, Container, Graphics, RenderTexture, Sprite, Texture, Text } from "pixi.js";
import { addFloatText } from './ecs/ecs-systems/render-system';
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
import { GameStore, type GameStoreConfig, WorldStore } from "./store";
import { PlayerDomain, type IEcsPlayerHelpers } from "./store/player-domain";
import type { GameFlags } from "./store/flag-domain";
import { INITIAL_FLAGS } from "./store/flag-domain";
import type { EnemyKind } from "./generators/types";
import { clamp, dist2 } from "./utils";
import { Vec2 } from "planck-js";

// Типы из central models
import type { Screen, VirtualInput, HudData, DialogueData, Stats, EngineCallbacks } from "./models";
import { QuestSystem } from "./quests/quest-system";
import { DialogueSystem } from "./dialogue/dialogue-system";
import { HudSystem } from "./hud/hud-system";

import type { World } from 'bitecs';
// ECS интеграция
import { createEcsWorld, getEcsWorld } from './ecs/ecs-world';
import { initPrefabs } from './ecs/ecs-systems';
import { createEcsGameLoop, type EcsGameLoop } from './ecs/ecs-game-loop';
import { EcsMapLoader } from './ecs/ecs-map-loader';
import { PlanckWorld, Cat, type PhysicsCallbacks, getEnemyCategory, getEnemyMask } from './physics/planck-world';
import { createEnemyInEcs } from './ecs/ecs-bridge';
import {
  Enemy as EcsEnemy,
  Shrine,
  Pedestal,
  Position,
  damageEntityEcs,
  healEntityEcs,
  fullHealEntityEcs,
  increaseMaxHpEcs,
} from './ecs/ecs-components';
import { query } from 'bitecs';
import { ViewportController } from './engine/viewport-controller';
import { SceneManager } from './engine/scene-manager';
import { ScreenRouter } from './engine/screen-router';
import { PlayerLifecycle } from './engine/player-lifecycle';
import { MapLoaderService } from './engine/map-loader-service';

// Импорты рендереров (только классы, функции удалены в ходе рефакторинга SOLID/ECS)
import {
  IPlayerData, IEnemyData, INpcData, IDropData, IProjectileData,
  IChestData, IPedestalData, IShrineData, IDoorData, IBarrierData, IAltarData,
  IPlayerExtra,
  PlayerRenderer,
  ChestRenderer,
  PedestalRenderer,
  ShrineRenderer,
  DoorRenderer,
  BarrierRenderer,
  AltarRenderer,
} from "./entities";

export class Engine {
  private cbs: EngineCallbacks;
  private container: HTMLElement;
  private app!: Application;
  private ready: Promise<void>;

  // Голосовые объёмы (для UI)
  get musicVol() { return audio.musicVol; }
  get soundVol() { return audio.soundVol; }

  // EventBus и GameStore
  private bus = new EventBus();
  private store!: GameStore;
  private playerDomain!: PlayerDomain;
  private playerHelpers!: IEcsPlayerHelpers;

  // Подсистемы
  private input = new InputSystem(this.bus);
  private state = new StateManager();

  // ECS интеграция
  private ecsWorld: World | null = null;
  private ecsGameLoop: EcsGameLoop | null = null;
  private ecsMapLoader: EcsMapLoader | null = null;
  private ecsPlayerBody: any = null;
  private ecsPlayerEid: number = -1;

  // Системы (ECS или legacy)
  private quests!: QuestSystem;
  private dialogue!: DialogueSystem;
  private hud!: HudSystem;

  // Слои сцены и вьюпорт
  private fx = new FxManager();
  private canvasEl: HTMLCanvasElement | null = null;
  private scene!: SceneManager;
  private viewport!: ViewportController;
  private screenRouter!: ScreenRouter;
  private playerLifecycle!: PlayerLifecycle;
  private mapLoader!: MapLoaderService;

  // Локальные данные (для рендеринга и обновления)
  // Все данные игрока теперь через this.store.player и this.store.flags
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

  // Состояние рендеринга (roofSnow хранится в store.roofSnow)
  private talkedSig = new Map<string, string>();
  private dialogueActiveRef = { value: false };
  private arrowA = -Math.PI / 2;
  public _arrowA = -Math.PI / 2;
  private starting = false;

  /** ECS callback для спавна стражей пьедестала */
  private guardSpawn(kind: string, x: number, y: number, pedestalIndex: number): void {
    if (!this.ecsWorld || !this.ecsMapLoader) return;
    const g = new Graphics();
    g.position.set(x, y);
    const enemyKind = kind as EnemyKind;
    const category = getEnemyCategory(enemyKind);
    const mask = getEnemyMask(enemyKind);
    const eid = createEnemyInEcs(
      this.ecsWorld, enemyKind, x, y, g, this.ecsMapLoader.planckWorld,
      category, mask
    );
    this.scene.dynamic.addChild(g);
    // Set aggro and guardOf via Enemy component (SoA)
    EcsEnemy.aggro[eid] = 1;
    EcsEnemy.guardOf[eid] = pedestalIndex;
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
    this.viewport = new ViewportController(container, null, { x: 0, y: 0 });
    this.viewport.applyViewSize();
    await app.init({
      background: 0x05080d, antialias: false, resolution: 1,
      width: this.viewport.viewW, height: this.viewport.viewH,
    });
    this.app = app;
    this.viewport = new ViewportController(container, app, { x: 0, y: 0 });
    this.scene = new SceneManager(app);
    const cv = app.canvas as HTMLCanvasElement;
    cv.classList.add("pixi");
    cv.style.position = "absolute";
    cv.style.inset = "0";
    cv.style.width = "100%";
    cv.style.height = "100%";
    container.appendChild(cv);
    this.canvasEl = cv;
    this.viewport.apply(app.renderer);

    // Инициализация FX-менеджера
    this.fx.init(app, this.viewport.viewW, this.viewport.viewH);

    // Слои сцены привязываются к stage (world, fxScreen, fadeG)
    this.scene.attachToStage();
    this.scene.addFxGraphics(this.fx.worldParticleGraphics);

    // Вигнетки и фейд размещаем в исходном порядке (fadeG поверх вигнеток)
    app.stage.removeChild(this.scene.fadeG);
    this.fx.buildVignette();
    if (this.fx.vignette) app.stage.addChild(this.fx.vignette);

    this.fx.buildFogVignette();
    this.fx.buildNoiseTexture();
    if (this.fx.fogVignette) app.stage.addChild(this.fx.fogVignette!);
    app.stage.addChild(this.scene.fadeG);
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

    this.viewport.apply(app.renderer);

    // Игровой цикл
    app.ticker.maxFPS = 60;
    app.ticker.add((tk) => this.tick(Math.min(tk.deltaMS / 1000, 0.05)));

    // Создаём GameStore и системы
    this.store = this.buildGameStore();
    this.instantiateSystems(this.store);
  }

  private buildGameStore(): GameStore {
    const eng = this;
    // Начальные значения (передаются в WorldStore)
    const initialFlags: GameFlags = { ...INITIAL_FLAGS };
    const initialPlayer: Player = {
      x: 0, y: 0, vx: 0, vy: 0, r: 5, hp: 12, maxHp: 12,
      dir: { x: 0, y: 1 }, moving: false, animT: 0, swingT: 0, hurtT: 0, slowT: 0,
    };

    // Создаём WorldStore — персистентное состояние мира
    const worldStore = new WorldStore({ flags: initialFlags });

    // ECS-хелперы для мутаций игрока (takeDamage, heal, etc.)
    eng.playerHelpers = {
      damageEntityEcs,
      healEntityEcs,
      fullHealEntityEcs,
      increaseMaxHpEcs,
    };

    // Создаём PlayerDomain — read-only view над ECS (eid будет установлен при загрузке карты)
    eng.playerDomain = new PlayerDomain(-1, eng.playerHelpers, {
      onDamaged: (dmg, sx, sy) => eng.bus.emit("player:damaged", { dmg, sx, sy }),
      onDied: () => eng.bus.emit("player:died", {}),
      onHealed: (amount) => eng.bus.emit("player:healed", { amount }),
      onHeartUsed: (amount) => eng.bus.emit("player:heartUsed", { amount }),
    });

    const config: GameStoreConfig = {
      player: initialPlayer,
      worldStore,
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
    
    this.quests      = new QuestSystem(this.bus, store, this.playerDomain);
    this.dialogue    = new DialogueSystem(this.bus, store, this.playerDomain);
    this.hud         = new HudSystem(this.bus, store, this.quests, this.playerDomain);
    this.screenRouter = new ScreenRouter(
      this.state, this.bus, store, this.quests,
      (s) => this.cbs.onScreen(s),
      (msg) => this.cbs.onToast(msg),
      () => audio.uiClick()
    );
    this.mapLoader = new MapLoaderService(this.scene, store, this.viewport, this.ecsWorld!);
    this.playerLifecycle = new PlayerLifecycle(
      store, this.playerDomain, this.bus, this.hud,
      {
        fadeTo: (a) => this.fadeTo(a),
        loadMap: (map, spawn) => this.loadMap(map, spawn),
        float: (x, y, text, color) => this.float(x, y, text, color),
        playHeal: () => audio.heal(),
        fxBurst: (x, y, color, count, size, life, speed, yOff) =>
          this.fx.burst(x, y, color, count, size, life, speed, yOff),
        resetDeath: () => { this.state.playerDead = false; },
      }
    );
    
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
        dynamic: this.scene.dynamic,
        floatLayer: this.scene.floatLayer,
        gameWorld: this.scene.world,
        fx: this.fx,
        input: this.input,
        state: this.state,
        cam: this.viewport.cam,
        viewW: this.viewport.viewW,
        viewH: this.viewport.viewH,
        map: this.map,
        ow: this.ow,
        flags: this.store.flags,
        talkedSig: { value: this.talkedSig },
        dialogueActive: this.dialogueActiveRef,
        stepT: this.stepT,
        realT: this.realT,
        playerEid: -1,
        playerDomain: this.playerDomain,
        playerHelpers: this.playerHelpers,
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
    if (this.store.flags.snakeStarted && !this.store.flags.snakeDead) return;
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

    this.store.flags.reset();
    this.talkedSig.clear();
    this.store.player.hp = this.store.player.maxHp = 12;
    this.realT = 0;
    this.store.setZone("");
    audio.setFog(false);
    try {
      this.loadMap(this.ow, this.ow.spawn);
      // Вычисляем начальную зону по позиции спавна
      const sx = Math.floor(this.ow.spawn.x / T);
      const sy = Math.floor(this.ow.spawn.y / T);
      this.store.setZone(zoneFor(this.ow, sx, sy));
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

  openQuests() { this.screenRouter.openQuests(); }
  openInventory() { this.screenRouter.openInventory(); }
  openMap() { this.screenRouter.openMap(); }
  openSettings() { this.screenRouter.openSettings(); }
  handleSettings() { this.screenRouter.handleSettings(); }
  closeOverlay() { this.screenRouter.closeOverlay(); }
  trackQuest(id: string) { this.screenRouter.trackQuest(id); }

  setMusicVolume(v: number) { audio.setMusicVolume(v); }
  setSoundVolume(v: number) { audio.setSoundVolume(v); }

  advanceDialogue() {
    this.dialogueActiveRef.value = false;
    this.input.clearPressed();
    this.dialogue.endDialogue((dd) => this.cbs.onDialogue(dd));
  }

  private setScreen(s: Screen) { this.screenRouter.setScreen(s); }
  private toast(msg: string) { this.cbs.onToast(msg); }
  private fadeTo(a: number) { this.state.setFadeTarget(a); }

  /* ================= загрузка карты ================= */
  private loadMap(map: WorldData, spawn: Vec) {
    this.map = map;
    this.store.setMap(map);

    const p = this.store.player;
    p.x = spawn.x; p.y = spawn.y;
    // HP/timers будут установлены ECS при создании Player (createPlayerInEcs)
    p.hp = Math.min(p.hp, p.maxHp);
    this.playerG.position.set(spawn.x, spawn.y);

    this.viewport.clampCamera(map.W * 16, map.H * 16, spawn.x, spawn.y);

    // ECS загрузка карты
    this.loadMapEcs(map, spawn);
  }

  /** ECS загрузка карты (делегирование в MapLoaderService) */
  private loadMapEcs(map: WorldData, spawn: Vec) {
    // Сохраняем дропы перед очисткой мира
    const savedDrops = this.ecsGameLoop ? this.ecsGameLoop.getDropsForTransition() : [];

    const result = this.mapLoader.loadMapEcs(
      map, spawn, this.playerDomain, this.playerG, savedDrops,
      (msg) => this.toast(msg)
    );
    this.ecsMapLoader = this.mapLoader.ecsMapLoader;
    this.ecsPlayerBody = result.playerBody;
    this.mmBase = this.mapLoader.mmBase;

    // Обновляем game loop с новыми данными (без пересоздания)
    if (this.ecsGameLoop) {
      this.ecsGameLoop.setPlanckWorld(this.ecsMapLoader!.planckWorld);
      this.ecsGameLoop.setPlayerEid(result.playerEid);
      this.playerDomain.setEid(result.playerEid);
      this.ecsGameLoop.updateConfig({
        map,
        flags: this.store.flags,
      });
    }
  }

  /* ================= клавиши-обработчики ================= */

  private handlePause() { this.screenRouter.handlePause(); }
  private handleInventory() { this.screenRouter.handleInventory(); }
  private handleQuests() { this.screenRouter.handleQuests(); }
  private handleSnow() { this.screenRouter.handleSnow(); }

  private useStoredHeart() {
    this.playerLifecycle.useStoredHeart();
  }

  /* ================= главный цикл ================= */
  private tick(rdt: number) {
    if (!this.app) return;
    
    // Обновление StateManager и обработка состояний
    this.state.update(rdt);
    if (this.state.screen === "play" && !this.dialogueActiveRef.value) {
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
    // Minimap update через ECS queries
    if (this.minimapCanvas && this.mmBase) {
      const ctx = this.minimapCanvas.getContext("2d");
      if (ctx) {
        // ECS shrines
        const shrines: Array<{ x: number; y: number; lit: number }> = [];
        if (this.ecsWorld) {
          for (const eid of query(this.ecsWorld, [Shrine, Position])) {
            shrines.push({ x: Position.x[eid], y: Position.y[eid], lit: Shrine.lit[eid] });
          }
        }
        // ECS pedestals
        const pedestals: Array<{ x: number; y: number; taken: boolean }> = [];
        if (this.ecsWorld) {
          for (const eid of query(this.ecsWorld, [Pedestal, Position])) {
            pedestals.push({ x: Position.x[eid], y: Position.y[eid], taken: !!Pedestal.taken[eid] });
          }
        }
        drawMinimap(ctx, this.mmBase, {
          map: this.map,
          player: this.store.player,
          shrines,
          secretKnown: this.store.flags.secretKnown,
          stashSpot: this.ow?.stashSpot ?? { x: 0, y: 0 },
          nornsFavor: this.store.flags.nornsFavor,
          pedestals,
          target: this.quests.trackedTarget(),
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
    if (boss) return (this.store.flags as unknown as Record<string, boolean>)[`${boss}Dead`] === true;
    return false;
  }

  private respawn() {
    this.playerLifecycle.respawn();
  }

  /* ================= диалоги ================= */

  private startDialogue(id: string) {
    const d = this.dialogue.startDialogue(id, (dd) => this.cbs.onDialogue(dd));
    if (!d) return;
    this.dialogueActiveRef.value = true;
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
    addFloatText(this.scene.floatLayer, text, x, y, color);
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
      player: { x: this.playerDomain.x, y: this.playerDomain.y },
      target: this.quests.trackedTarget(),
      secretKnown: this.store.flags.secretKnown,
      stashSpot: this.ow?.stashSpot ?? { x: 0, y: 0 },
      pedestals: (this.map.pedestals ?? []).map((p) => ({ x: p.x, y: p.y, taken: this.store.takenPedestals.has(`ped_${p.x}_${p.y}`) })),
      bossRoom: this.map.isDungeon ? this.map.bossRoom : { x: 0, y: 0, w: 0, h: 0 },
      bossSpot: this.map.isDungeon ? this.map.bossSpot : { x: 0, y: 0 },
      dungeonId: this.map.isDungeon ? 0 : -1,
    });
  }

  /* ===== Вспомогательные поля для доступа из других методов ===== */

  /* ===== Вспомогательные поля ===== */

  /* ===== Вьюпорт (делегирование в ViewportController) ===== */

  private applyViewSize() {
    this.viewport.applyViewSize();
  }

  private applyView() {
    this.viewport.apply(this.app ? this.app.renderer : null);
  }

  /* ===== Уничтожение ===== */

  destroy() {
    this.input.unregister();
    this.mapLoader?.destroy();
    if (this.app) this.app.destroy(true);
    this.fx.destroy();
    this.bus.clear();
  }
}
