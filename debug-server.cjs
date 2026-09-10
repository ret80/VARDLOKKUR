#!/usr/bin/env node
/* debug-server.cjs — Сервер-ретранслятор для отладки игры

Архитектура:
- Запускается отдельно на порту 3100
- Браузерная игра подключается как game client и пушит состояние
- DebugPanel подключается как panel client и получает состояние
- Команды от DebugPanel ретранслируются сервером к игре

Поток состояния:
  Игра ──{type: 'state', data: {...}}──→ Сервер ──→ DebugPanel

Поток команд:
  DebugPanel ──{type: 'teleport', x: 100, y: 200}──→ Сервер ──→ Игра
*/

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = 3100;
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_ENTRIES = 50000;

// Храним состояние, полученное от игры
let gameState = null;

// Клиенты
let gameClient = null; // Один game client (браузер)
const panelClients = new Set(); // Множество panel clients (DebugPanel)

// ============================================================
// Серверный буфер логов (кольцевой, 10 MB)
// ============================================================
const logBuffer = [];
let logBufferBytes = 0;

function trimLogs() {
  while (logBuffer.length > MAX_LOG_ENTRIES || logBufferBytes > MAX_LOG_BYTES) {
    const removed = logBuffer.shift();
    logBufferBytes -= removed._bytes;
  }
}

function pushLog(level, module, message) {
  const entry = {
    time: Date.now(),
    level,
    module,
    message,
  };
  // Estimate bytes
  entry._bytes = Buffer.byteLength(JSON.stringify(entry));
  logBuffer.push(entry);
  logBufferBytes += entry._bytes;
  trimLogs();
}

function getLogs(filters) {
  let result = logBuffer;
  if (filters) {
    if (filters.level) {
      const lvlOrder = ['debug', 'info', 'warn', 'error'];
      const minLevel = lvlOrder.indexOf(filters.level);
      result = result.filter(e => lvlOrder.indexOf(e.level) >= minLevel);
    }
    if (filters.module) {
      result = result.filter(e => e.module === filters.module);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(e => e.message.toLowerCase().includes(search));
    }
    if (filters.before) {
      result = result.filter(e => e.time < parseInt(filters.before));
    }
  }
  if (filters && filters.limit && result.length > filters.limit) {
    result = result.slice(-filters.limit);
  }
  // Remove internal _bytes field
  return result.map(({ _bytes, ...rest }) => rest);
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// Принять логи от игры (WebSocket)
function handleGameLog(msg) {
  try {
    const data = JSON.parse(msg.toString());
    if (data.type === 'log') {
      pushLog(data.level || 'info', data.module || 'game', data.message || '');
    }
  } catch (e) {
    // Ignore
  }
}

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

  // GET /debug/state — получить текущее состояние
  if (req.method === 'GET' && url.pathname === '/debug/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(gameState));
  }

  // GET /debug/health — проверка работоспособности
  if (req.method === 'GET' && url.pathname === '/debug/health') {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({
        status: 'ok',
        gameConnected: !!gameClient,
        panelConnected: panelClients.size > 0,
      }));
  }

  // GET /debug/clients — список подключённых клиентов
  if (req.method === 'GET' && url.pathname === '/debug/clients') {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({
        gameConnected: !!gameClient,
        panelClients: panelClients.size,
      }));
  }

  // GET /debug/hello — проверка что сервер запущен
  if (req.method === 'GET' && url.pathname === '/debug/hello') {
    return res.writeHead(200, { 'Content-Type': 'text/plain' })
      .end('привет мир');
  }

  // GET /debug/world-dump — полный дамп мира
  if (req.method === 'GET' && url.pathname === '/debug/world-dump') {
    const state = gameState;
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({
        entities: state?.enemies?.map(e => ({
          eid: e.eid,
          kind: e.kind,
          x: e.x,
          y: e.y,
          hp: e.hp,
          maxHp: e.maxHp,
          state: e.state,
          stateName: e.stateName,
        })) || [],
        stats: {
          totalEntities: (state?.enemies?.length || 0) + 1,
          aliveEntities: (state?.enemies?.filter(e => e.hp > 0).length || 0) + 1,
          componentCounts: {
            Player: 1,
            Enemy: state?.enemies?.length || 0,
          },
        },
      }));
  }

  // GET /debug/profile — профилирование запросов
  if (req.method === 'GET' && url.pathname === '/debug/profile') {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ queries: [], totalTime: '0ms' }));
  }

  // GET /debug/inspect?eid=N — инспекция сущности
  if (req.method === 'GET' && url.pathname === '/debug/inspect') {
    const eid = parseInt(url.searchParams.get('eid') || '0');
    const state = gameState;
    const entity = state?.enemies?.find(e => e.eid === eid) || null;
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(entity));
  }

  // GET /debug/logs — получить логи с фильтрами
  if (req.method === 'GET' && url.pathname === '/debug/logs') {
    const filters = {
      level: url.searchParams.get('level') || undefined,
      module: url.searchParams.get('module') || undefined,
      search: url.searchParams.get('search') || undefined,
      before: url.searchParams.get('before') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    };
    const logs = getLogs(filters);
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ logs, stats: { count: logBuffer.length, bytes: logBufferBytes } }));
  }

  // GET /debug/logs-stats — статистика логов
  if (req.method === 'GET' && url.pathname === '/debug/logs-stats') {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ count: logBuffer.length, bytes: logBufferBytes }));
  }

  // POST /debug/logs-clear — очистить логи
  if (req.method === 'POST' && url.pathname === '/debug/logs-clear') {
    logBuffer.length = 0;
    logBufferBytes = 0;
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ success: true }));
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const role = url.searchParams.get('role');
  const isGameClient = role === 'game';
  const ip = req.socket.remoteAddress || 'unknown';

  log(`New connection: role=${role || 'panel'} from ${ip}`);

  if (isGameClient) {
    if (gameClient && gameClient !== ws) {
      log('Closing old game client');
      gameClient.close();
    }
    gameClient = ws;
    log(`Game client connected (${panelClients.size} panels)`);
  } else {
    panelClients.add(ws);
    log(`Panel client connected (${panelClients.size} total)`);
    
    if (gameState) {
      ws.send(JSON.stringify({ type: 'state', data: gameState }));
    }
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (isGameClient) {
        if (data.type === 'state') {
          gameState = data.data;
          // Отправляем состояние всем panel clients
          const msg = JSON.stringify({ type: 'state', data: gameState });
          for (const client of panelClients) {
            if (client.readyState === 1) {
              try {
                client.send(msg);
              } catch (e2) {
                // Ignore send errors to individual clients
              }
            }
          }
          // Log first message with data preview
          if (!ws._msgCount) ws._msgCount = 0;
          ws._msgCount++;
          if (ws._msgCount === 1) {
            log(`Game client connected. First state: player=${!!gameState?.player} enemies=${(gameState?.enemies || []).length}`);
          }
          if (ws._msgCount % 50 === 0) {
            log(`Game client sent ${ws._msgCount} state updates`);
          }
        } else if (data.type === 'log') {
          // Принять логи от игры
          pushLog(data.level || 'info', data.module || 'game', data.message || '');
        }
      } else {
        if (data.type === 'get-state') {
          ws.send(JSON.stringify({ type: 'state', data: gameState }));
        } else if (data.type && data.type !== 'response') {
          if (gameClient && gameClient.readyState === 1) {
            // Формат: {type: 'command', teleport: {x, y}} — game-client.js ожидает
            const cmdData = { type: 'command' };
            // data.type содержит имя команды (teleport, set-hp и т.д.) — переносим её в тело
            const { type: cmdName, ...cmdArgs } = data;
            cmdData[cmdName] = cmdArgs;
            gameClient.send(JSON.stringify(cmdData));
            ws.send(JSON.stringify({
              type: 'response',
              command: cmdName,
              result: { sent: true },
              error: null,
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'response',
              command: data.type,
              result: null,
              error: 'Game client not connected',
            }));
          }
        }
      }
    } catch (e) {
      log(`Error: ${e.message}`);
      try {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
      } catch (e2) {
        // Ignore
      }
    }
  });

  ws.on('close', (code, reason) => {
    log(`WS close: role=${isGameClient ? 'game' : 'panel'} code=${code} reason="${reason.toString()}"`);
    if (isGameClient) {
      if (gameClient === ws) gameClient = null;
      log('Game client disconnected');
    } else {
      panelClients.delete(ws);
      log(`Panel client disconnected (${panelClients.size} total)`);
    }
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  log(`Running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  wss.close();
  server.close();
  log('Stopped');
  process.exit(0);
});
