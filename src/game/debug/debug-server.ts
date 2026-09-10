/* debug-server.ts — WebSocket + REST сервер для отладки игры */

import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { LoggerFilters } from './logger';
import { logger } from './logger';

// ============================================================
// Типы команд
// ============================================================

export interface DebugCommand {
  type: string;
  [key: string]: any;
}

export interface DebugState {
  player: any;
  enemies: any[];
  fog: any;
  flags: any;
  map: any;
  time: any;
}

// ============================================================
// Debug Server
// ============================================================

export class DebugServer {
  private wss: WebSocketServer | null = null;
  private httpServer: any = null;
  private port: number;
  private gameState: DebugState | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private updateRate: number = 100; // 10 FPS
  private clients: Set<WebSocket> = new Set();
  
  // Callbacks для получения состояния
  private getPlayerState: () => any | null = () => null;
  private getEnemiesState: () => any[] = () => [];
  private getDropsState: () => any[] = () => [];
  private getProjectilesState: () => any[] = () => [];
  private getNpcsState: () => any[] = () => [];
  private getFogState: () => any = () => ({});
  private getFlags: () => any = () => ({});
  private getMap: () => any = () => ({});
  private getTime: () => any = () => ({ elapsed: 0, timeScale: 1, paused: false });
  private getWorldDump: () => any = () => ({ entities: [], stats: {} });
  private profileQueriesFn: () => any = () => ({ queries: [], totalTime: '0ms' });
  private inspectEntityFn: (eid: number) => any = () => null;
  
  // Logger reference
  private logger: { getLogs: (filters?: LoggerFilters) => any[]; getStats: () => { count: number; bytes: number }; clear: () => void } | null = null;
  
  // Callbacks для управления
  private teleportPlayer: (x: number, y: number) => boolean = () => false;
  private setPlayerHp: (hp: number) => boolean = () => false;
  private killPlayer: () => boolean = () => false;
  private respawnPlayer: () => void = () => {};
  private spawnEnemy: (kind: string, x: number, y: number) => number = () => -1;
  private removeEnemy: (eid: number) => boolean = () => false;
  private removeAllEnemies: () => number = () => 0;
  private removeAllGhosts: () => number = () => 0;
  private removeProjectile: (eid: number) => boolean = () => false;
  private removeDrop: (eid: number) => boolean = () => false;
  private setTimeScale: (scale: number) => void = () => {};
  private setFlag: (key: string, value: any) => void = () => {};
  private addRunes: (count: number) => void = () => {};
  private addArrows: (count: number) => void = () => {};
  private addHearts: (count: number) => void = () => {};
  private freePlayer: () => void = () => {};
  private fullHealPlayer: () => void = () => {};
  private clearDrops: () => number = () => 0;
  private clearProjectiles: () => number = () => 0;
  
  constructor(port: number = 3100) {
    this.port = port;
  }

  /** Установить колбэки для получения состояния */
  setGetters(getters: {
    getPlayerState?: () => any | null;
    getEnemiesState?: () => any[];
    getDropsState?: () => any[];
    getProjectilesState?: () => any[];
    getNpcsState?: () => any[];
    getFogState?: () => any;
    getFlags?: () => any;
    getMap?: () => any;
    getTime?: () => any;
    getWorldDump?: () => any;
    profileQueries?: () => any;
    inspectEntity?: (eid: number) => any;
  }): void {
    if (getters.getPlayerState) this.getPlayerState = getters.getPlayerState;
    if (getters.getEnemiesState) this.getEnemiesState = getters.getEnemiesState;
    if (getters.getDropsState) this.getDropsState = getters.getDropsState;
    if (getters.getProjectilesState) this.getProjectilesState = getters.getProjectilesState;
    if (getters.getNpcsState) this.getNpcsState = getters.getNpcsState;
    if (getters.getFogState) this.getFogState = getters.getFogState;
    if (getters.getFlags) this.getFlags = getters.getFlags;
    if (getters.getMap) this.getMap = getters.getMap;
    if (getters.getTime) this.getTime = getters.getTime;
    if (getters.getWorldDump) this.getWorldDump = getters.getWorldDump;
    if (getters.profileQueries) this.profileQueriesFn = getters.profileQueries;
    if (getters.inspectEntity) this.inspectEntityFn = getters.inspectEntity;
  }

  /** Установить логгер */
  setLogger(logger: { getLogs: (filters?: LoggerFilters) => any[]; getStats: () => { count: number; bytes: number }; clear: () => void }): void {
    this.logger = logger;
  }

  /** Установить колбэки для управления */
  setSetters(setters: {
    teleportPlayer?: (x: number, y: number) => boolean;
    setPlayerHp?: (hp: number) => boolean;
    killPlayer?: () => boolean;
    respawnPlayer?: () => void;
    spawnEnemy?: (kind: string, x: number, y: number) => number;
    removeEnemy?: (eid: number) => boolean;
    removeAllEnemies?: () => number;
    removeAllGhosts?: () => number;
    removeProjectile?: (eid: number) => boolean;
    removeDrop?: (eid: number) => boolean;
    setTimeScale?: (scale: number) => void;
    setFlag?: (key: string, value: any) => void;
    addRunes?: (count: number) => void;
    addArrows?: (count: number) => void;
    addHearts?: (count: number) => void;
    freePlayer?: () => void;
    fullHealPlayer?: () => void;
    clearDrops?: () => number;
    clearProjectiles?: () => number;
  }): void {
    if (setters.teleportPlayer) this.teleportPlayer = setters.teleportPlayer;
    if (setters.setPlayerHp) this.setPlayerHp = setters.setPlayerHp;
    if (setters.killPlayer) this.killPlayer = setters.killPlayer;
    if (setters.respawnPlayer) this.respawnPlayer = setters.respawnPlayer;
    if (setters.spawnEnemy) this.spawnEnemy = setters.spawnEnemy;
    if (setters.removeEnemy) this.removeEnemy = setters.removeEnemy;
    if (setters.removeAllEnemies) this.removeAllEnemies = setters.removeAllEnemies;
    if (setters.removeAllGhosts) this.removeAllGhosts = setters.removeAllGhosts;
    if (setters.removeProjectile) this.removeProjectile = setters.removeProjectile;
    if (setters.removeDrop) this.removeDrop = setters.removeDrop;
    if (setters.setTimeScale) this.setTimeScale = setters.setTimeScale;
    if (setters.setFlag) this.setFlag = setters.setFlag;
    if (setters.addRunes) this.addRunes = setters.addRunes;
    if (setters.addArrows) this.addArrows = setters.addArrows;
    if (setters.addHearts) this.addHearts = setters.addHearts;
    if (setters.freePlayer) this.freePlayer = setters.freePlayer;
    if (setters.fullHealPlayer) this.fullHealPlayer = setters.fullHealPlayer;
    if (setters.clearDrops) this.clearDrops = setters.clearDrops;
    if (setters.clearProjectiles) this.clearProjectiles = setters.clearProjectiles;
  }

  /** Запустить сервер */
  start(): void {
    this.httpServer = createHttpServer((req: IncomingMessage, res: any) => {
      // REST API — CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // REST API endpoints
      if (req.url === '/debug/state' && req.method === 'GET') {
        this.updateGameState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.gameState));
      } else if (req.url === '/debug/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', clients: this.clients.size }));
      } else if (req.url === '/debug/world-dump' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getWorldDump()));
      } else if (req.url === '/debug/profile' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.profileQueriesFn()));
      } else if (req.url === '/debug/inspect' && req.method === 'GET') {
        const url = new URL(req.url!, `http://localhost:${this.port}`);
        const eid = parseInt(url.searchParams.get('eid') || '0');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.inspectEntityFn(eid)));
      } else if (req.url === '/debug/logs' && req.method === 'GET') {
        const url = new URL(req.url!, `http://localhost:${this.port}`);
        const filters: LoggerFilters = {
          level: url.searchParams.get('level') as LoggerFilters['level'],
          module: url.searchParams.get('module') || undefined,
          search: url.searchParams.get('search') || undefined,
          before: url.searchParams.get('before') ? parseInt(url.searchParams.get('before')!) : undefined,
          limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        };
        let logsResult: any[] = [];
        let stats: { count: number; bytes: number } | null = null;
        if (this.logger) {
          logsResult = this.logger.getLogs(filters);
          stats = this.logger.getStats();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ logs: logsResult, stats }));
      } else if (req.url === '/debug/logs-stats' && req.method === 'GET') {
        let stats: { count: number; bytes: number } | null = null;
        if (this.logger) {
          stats = this.logger.getStats();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats || { count: 0, bytes: 0 }));
      } else if (req.url === '/debug/logs-clear' && req.method === 'POST') {
        if (this.logger) {
          this.logger.clear();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (req.url === '/debug/teleport' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          const result = this.teleportPlayer(body.x, body.y);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        });
      } else if (req.url === '/debug/spawn-enemy' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          const eid = this.spawnEnemy(body.kind, body.x, body.y);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ eid }));
        });
      } else if (req.url === '/debug/set-flag' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          this.setFlag(body.key, body.value);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } else if (req.url === '/debug/kill-player' && req.method === 'POST') {
        this.killPlayer();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (req.url === '/debug/respawn' && req.method === 'POST') {
        this.respawnPlayer();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (req.url === '/debug/set-hp' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          const result = this.setPlayerHp(body.hp);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        });
      } else if (req.url === '/debug/remove-enemy' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          const result = this.removeEnemy(body.eid);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        });
      } else if (req.url === '/debug/clear-enemies' && req.method === 'POST') {
        const count = this.removeAllEnemies();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ count }));
      } else if (req.url === '/debug/time-scale' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          this.setTimeScale(body.scale);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } else if (req.url === '/debug/add-runes' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          this.addRunes(body.count || 1);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } else if (req.url === '/debug/add-arrows' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          this.addArrows(body.count || 12);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } else if (req.url === '/debug/add-hearts' && req.method === 'POST') {
        this.handleJsonBody(req, (body: any) => {
          this.addHearts(body.count || 1);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found\n\nAvailable endpoints:\nGET /debug/state\nGET /debug/health\nGET /debug/world-dump\nGET /debug/profile\nGET /debug/inspect?eid=0\nGET /debug/logs?level=info&module=fog&search=player&limit=100\nGET /debug/logs-stats\nPOST /debug/logs-clear\nPOST /debug/teleport\nPOST /debug/spawn-enemy\nPOST /debug/set-flag\nPOST /debug/kill-player\nPOST /debug/respawn\nPOST /debug/set-hp\nPOST /debug/remove-enemy\nPOST /debug/clear-enemies\nPOST /debug/time-scale\nPOST /debug/add-runes\nPOST /debug/add-arrows\nPOST /debug/add-hearts');
      }
    });

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      logger.info('debug-server', `Client connected (${this.clients.size} total)`);

      // Отправить начальное состояние
      this.updateGameState();
      ws.send(JSON.stringify({ type: 'state', data: this.gameState }));

      ws.on('message', (message: any) => {
        let cmd: DebugCommand;
        try {
          cmd = JSON.parse(message.toString());
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
          return;
        }

        this.handleCommand(ws, cmd);
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('debug-server', `Client disconnected (${this.clients.size} total)`);
      });

      ws.on('error', (err: Error) => {
        logger.error('debug-server', `WebSocket error: ${err.message}`);
        this.clients.delete(ws);
      });
    });

    this.httpServer.listen(this.port, () => {
      logger.info('debug-server', `Running on http://localhost:${this.port}`);
      logger.info('debug-server', `WebSocket ws://localhost:${this.port}`);
      logger.info('debug-server', `REST API http://localhost:${this.port}/debug/state`);
    });

    // Периодическая отправка состояния
    this.startStateUpdates();
  }

  /** Остановить сервер */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    this.clients.clear();
    logger.info('debug-server', 'Stopped');
  }

  /** Периодическая отправка состояния */
  private startStateUpdates(): void {
    this.updateInterval = setInterval(() => {
      this.updateGameState();
      
      const msg = JSON.stringify({ type: 'state', data: this.gameState });
      for (const client of this.clients) {
        if (client.readyState === 1) { // OPEN
          client.send(msg);
        }
      }
    }, this.updateRate);
  }

  /** Обновить состояние игры */
  private updateGameState(): void {
    this.gameState = {
      player: this.getPlayerState(),
      enemies: this.getEnemiesState(),
      fog: this.getFogState(),
      flags: this.getFlags(),
      map: this.getMap(),
      time: this.getTime(),
    };
  }

  /** Обработка команд WebSocket */
  private handleCommand(ws: WebSocket, cmd: DebugCommand): void {
    const { type, ...args } = cmd;
    let result: any = null;
    let error: string | null = null;

    try {
      switch (type) {
        // ── Запросы ──
        case 'get-state':
          this.updateGameState();
          result = this.gameState;
          break;

        case 'get-player':
          result = this.gameState?.player;
          break;

        case 'get-enemies':
          result = this.gameState?.enemies;
          break;

        case 'get-drops':
          result = this.getDropsState();
          break;

        case 'get-projectiles':
          result = this.getProjectilesState();
          break;

        case 'get-npcs':
          result = this.getNpcsState();
          break;

        case 'get-fog-state':
          result = this.gameState?.fog;
          break;

        case 'get-flags':
          result = this.gameState?.flags;
          break;

        case 'get-time':
          result = this.gameState?.time;
          break;

        case 'world-dump':
          result = this.getWorldDump();
          break;

        case 'profile-queries':
          result = this.profileQueriesFn();
          break;

        case 'get-logs':
          const logFilters: LoggerFilters = {
            level: args.level,
            module: args.module,
            search: args.search,
            before: args.before,
            limit: args.limit,
          };
          result = this.logger ? this.logger.getLogs(logFilters) : [];
          break;

        case 'logs-stats':
          result = this.logger ? this.logger.getStats() : { count: 0, bytes: 0 };
          break;

        case 'logs-clear':
          if (this.logger) this.logger.clear();
          result = true;
          break;

        case 'inspect-entity':
          result = this.inspectEntityFn(args.eid);
          break;

        // ── Управление игроком ──
        case 'teleport':
          result = this.teleportPlayer(args.x, args.y);
          break;

        case 'set-hp':
          result = this.setPlayerHp(args.hp);
          break;

        case 'kill-player':
          result = this.killPlayer();
          break;

        case 'respawn':
          this.respawnPlayer();
          result = true;
          break;

        case 'free-player':
          this.freePlayer();
          result = true;
          break;

        case 'full-heal-player':
          this.fullHealPlayer();
          result = true;
          break;

        // ── Управление врагами ──
        case 'spawn-enemy':
          result = this.spawnEnemy(args.kind, args.x, args.y);
          break;

        case 'remove-enemy':
          result = this.removeEnemy(args.eid);
          break;

        case 'remove-all-enemies':
          result = this.removeAllEnemies();
          break;

        case 'remove-all-ghosts':
          result = this.removeAllGhosts();
          break;

        // ── Управление снарядами ──
        case 'remove-projectile':
          result = this.removeProjectile(args.eid);
          break;

        case 'clear-projectiles':
          result = this.clearProjectiles();
          break;

        // ── Управление дропами ──
        case 'remove-drop':
          result = this.removeDrop(args.eid);
          break;

        case 'clear-drops':
          result = this.clearDrops();
          break;

        // ── Управление временем ──
        case 'set-timescale':
          this.setTimeScale(args.scale);
          result = true;
          break;

        case 'freeze':
          this.setTimeScale(0);
          result = true;
          break;

        case 'unfreeze':
          this.setTimeScale(1);
          result = true;
          break;

        // ── Управление ресурсами ──
        case 'add-runes':
          this.addRunes(args.count || 1);
          result = true;
          break;

        case 'add-arrows':
          this.addArrows(args.count || 12);
          result = true;
          break;

        case 'add-hearts':
          this.addHearts(args.count || 1);
          result = true;
          break;

        // ── Управление флагами ──
        case 'set-flag':
          this.setFlag(args.key, args.value);
          result = true;
          break;

        default:
          error = `Unknown command: ${type}`;
      }
    } catch (e: any) {
      error = e.message || 'Command execution failed';
    }

    ws.send(JSON.stringify({
      type: 'response',
      command: type,
      result,
      error,
    }));
  }

  /** Вспомогательная функция для чтения JSON тела */
  private handleJsonBody(req: IncomingMessage, cb: (body: any) => void): void {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        cb(JSON.parse(body));
      } catch (e) {
        // Ignore parse errors
      }
    });
  }
}
