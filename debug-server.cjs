#!/usr/bin/env node
/* debug-server.js — standalone WebSocket + REST сервер для отладки */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = 3100;
let clients = new Set();
let gameState = null;
let updateInterval = null;

function updateGameState() {
  const globals = globalThis.__debugServerGlobals;
  if (!globals || !globals.getters) return;
  
  const g = globals.getters;
  gameState = {
    player: g.getPlayerState?.(),
    enemies: g.getEnemiesState?.(),
    drops: g.getDropsState?.(),
    projectiles: g.getProjectilesState?.(),
    npcs: g.getNpcsState?.(),
    fog: g.getFogState?.(),
    flags: g.getFlags?.(),
    map: g.getMap?.(),
    time: g.getTime?.(),
  };
}

function handleCommand(ws, cmd) {
  const { type, ...args } = cmd;
  let result = null;
  let error = null;

  const globals = globalThis.__debugServerGlobals;
  if (!globals) {
    error = 'Debug globals not initialized';
    ws.send(JSON.stringify({ type: 'response', command: type, result, error }));
    return;
  }

  const g = globals.getters || {};
  const s = globals.setters || {};

  try {
    switch (type) {
      // Запросы
      case 'get-state': updateGameState(); result = gameState; break;
      case 'get-player': result = gameState?.player; break;
      case 'get-enemies': result = gameState?.enemies; break;
      case 'get-drops': result = g?.getDropsState?.(); break;
      case 'get-projectiles': result = g?.getProjectilesState?.(); break;
      case 'get-npcs': result = g?.getNpcsState?.(); break;
      case 'get-fog-state': result = gameState?.fog; break;
      case 'get-flags': result = gameState?.flags; break;
      case 'get-time': result = gameState?.time; break;
      case 'world-dump': result = g?.getWorldDump?.(); break;
      case 'profile-queries': result = g?.profileQueries?.(); break;
      case 'inspect-entity': result = g?.inspectEntity?.(args.eid); break;

      // Управление игроком
      case 'teleport': result = g?.teleportPlayer?.(args.x, args.y); break;
      case 'set-hp': result = g?.setPlayerHp?.(args.hp); break;
      case 'kill-player': result = g?.killPlayer?.(); break;
      case 'respawn': g?.respawnPlayer?.(); result = true; break;
      case 'free-player': g?.freePlayer?.(); result = true; break;
      case 'full-heal-player': g?.fullHealPlayer?.(); result = true; break;

      // Управление врагами
      case 'spawn-enemy': result = g?.spawnEnemy?.(args.kind, args.x, args.y); break;
      case 'remove-enemy': result = g?.removeEnemy?.(args.eid); break;
      case 'remove-all-enemies': result = g?.removeAllEnemies?.(); break;
      case 'remove-all-ghosts': result = g?.removeAllGhosts?.(); break;

      // Управление снарядами
      case 'remove-projectile': result = g?.removeProjectile?.(args.eid); break;
      case 'clear-projectiles': result = g?.clearProjectiles?.(); break;

      // Управление дропами
      case 'remove-drop': result = g?.removeDrop?.(args.eid); break;
      case 'clear-drops': result = g?.clearDrops?.(); break;

      // Управление временем
      case 'set-timescale': g?.setTimeScale?.(args.scale); result = true; break;
      case 'freeze': g?.setTimeScale?.(0); result = true; break;
      case 'unfreeze': g?.setTimeScale?.(1); result = true; break;

      // Управление ресурсами
      case 'add-runes': g?.addRunes?.(args.count || 1); result = true; break;
      case 'add-arrows': g?.addArrows?.(args.count || 12); result = true; break;
      case 'add-hearts': g?.addHearts?.(args.count || 1); result = true; break;

      // Управление флагами
      case 'set-flag': s?.setFlag?.(args.key, args.value); result = true; break;

      default: error = `Unknown command: ${type}`;
    }
  } catch (e) {
    error = e.message || 'Command execution failed';
  }

  ws.send(JSON.stringify({ type: 'response', command: type, result, error }));
}

// Инициализируем globals
globalThis.__debugServerGlobals = {
  getters: {},
  setters: {},
  registerGetters(g) { globalThis.__debugServerGlobals.getters = g; },
  registerSetters(s) { globalThis.__debugServerGlobals.setters = s; },
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const globals = globalThis.__debugServerGlobals;
  const g = globals.getters || {};
  const s = globals.setters || {};

  // GET endpoints
  if (req.method === 'GET') {
    if (url.pathname === '/debug/state') {
      updateGameState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(gameState));
    }
    if (url.pathname === '/debug/health') {
      return res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ status: 'ok', clients: clients.size }));
    }
    if (url.pathname === '/debug/world-dump') {
      return res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(g.getWorldDump?.()));
    }
    if (url.pathname === '/debug/profile') {
      return res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(g.profileQueries?.()));
    }
    if (url.pathname === '/debug/inspect') {
      const eid = parseInt(url.searchParams.get('eid') || '0');
      return res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(g.inspectEntity?.(eid)));
    }
  }

  // POST endpoints
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      let result = null;
      try {
        const data = body ? JSON.parse(body) : {};
        if (url.pathname === '/debug/teleport') result = s.teleportPlayer?.(data.x, data.y);
        if (url.pathname === '/debug/spawn-enemy') result = s.spawnEnemy?.(data.kind, data.x, data.y);
        if (url.pathname === '/debug/set-flag') { s.setFlag?.(data.key, data.value); result = true; }
        if (url.pathname === '/debug/kill-player') result = s.killPlayer?.();
        if (url.pathname === '/debug/respawn') { s.respawnPlayer?.(); result = true; }
        if (url.pathname === '/debug/set-hp') result = s.setPlayerHp?.(data.hp);
        if (url.pathname === '/debug/remove-enemy') result = s.removeEnemy?.(data.eid);
        if (url.pathname === '/debug/clear-enemies') result = s.removeAllEnemies?.();
        if (url.pathname === '/debug/time-scale') { s.setTimeScale?.(data.scale); result = true; }
        if (url.pathname === '/debug/add-runes') { s.addRunes?.(data.count || 1); result = true; }
        if (url.pathname === '/debug/add-arrows') { s.addArrows?.(data.count || 12); result = true; }
        if (url.pathname === '/debug/add-hearts') { s.addHearts?.(data.count || 1); result = true; }
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result, success: true }));
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[debug-server] ✓ Client connected (${clients.size} total)`);

  updateGameState();
  ws.send(JSON.stringify({ type: 'state', data: gameState }));

  ws.on('message', (message) => {
    try {
      const cmd = JSON.parse(message.toString());
      handleCommand(ws, cmd);
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[debug-server] Client disconnected (${clients.size} total)`);
  });
});

server.listen(PORT, () => {
  console.log(`[debug-server] ✓ REST API  http://localhost:${PORT}/debug/state`);
  console.log(`[debug-server] ✓ WebSocket ws://localhost:${PORT}`);
  console.log(`[debug-server] ✓ Debug server ready`);
});

// Периодическая отправка состояния
updateInterval = setInterval(() => {
  updateGameState();
  const msg = JSON.stringify({ type: 'state', data: gameState });
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}, 100);

// Graceful shutdown
process.on('SIGINT', () => {
  if (updateInterval) clearInterval(updateInterval);
  wss.close();
  server.close();
  console.log('[debug-server] Stopped');
  process.exit(0);
});
