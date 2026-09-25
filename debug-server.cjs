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
const crypto = require('crypto');

const PORT = 3100;
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_ENTRIES = 50000;

// ============================================================
// Сессии — поддержка нескольких запущенных игр одновременно
// ============================================================
// sessionId → { ws, gameState, connectedAt, label }
const sessions = new Map();

// Клиенты
const panelClients = new Set(); // Множество panel clients (DebugPanel)
// panel → { ws, selectedSessionId }
const panelSessionMap = new Map();

// ============================================================
// Pending profile queries (request-response between server and game clients)
// ============================================================
const pendingProfiles = new Map(); // requestId → { send: fn }
const pendingStats = new Map(); // requestId → { send: fn }

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

function pushLog(level, module, message, sessionId) {
  const entry = {
    time: Date.now(),
    level,
    module,
    message,
    sessionId,
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
    if (filters.sessionId) {
      result = result.filter(e => e.sessionId === filters.sessionId);
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

  // GET /debug/state — получить состояние последней сессии (legacy)
  if (req.method === 'GET' && url.pathname === '/debug/state') {
    const lastSession = sessions.size > 0 ? Array.from(sessions.values()).pop() : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(lastSession?.gameState || null));
  }

  // GET /debug/sessions — список всех активных сессий
  if (req.method === 'GET' && url.pathname === '/debug/sessions') {
    const list = Array.from(sessions.entries()).map(([id, s]) => {
      const gs = s.gameState;
      return {
        id,
        connectedAt: s.connectedAt,
        label: s.label || null,
        player: gs?.player || null,
        enemyCount: gs?.enemies?.length || 0,
        dropCount: gs?.drops?.length || 0,
        projectileCount: gs?.projectiles?.length || 0,
      };
    });
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ sessions: list, total: list.length }));
  }

  // GET /debug/sessions/:id/state — состояние конкретной сессии
  if (req.method === 'GET' && url.pathname.startsWith('/debug/sessions/')) {
    const parts = url.pathname.split('/');
    // /debug/sessions/:id/state
    if (parts.length >= 5 && parts[4] === 'state') {
      const sessionId = parts[3];
      const session = sessions.get(sessionId);
      if (!session) {
        return res.writeHead(404).end('Session not found');
      }
      return res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(session.gameState));
    }
    // /debug/sessions/:id/logs
    if (parts.length >= 5 && parts[4] === 'logs') {
      const sessionId = parts[3];
      const filters = {
        level: url.searchParams.get('level') || undefined,
        module: url.searchParams.get('module') || undefined,
        search: url.searchParams.get('search') || undefined,
        before: url.searchParams.get('before') || undefined,
        limit: url.searchParams.get('limit') || undefined,
        sessionId,
      };
      const logs = getLogs(filters);
      return res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ logs, stats: { count: logBuffer.length, bytes: logBufferBytes } }));
    }
    // /debug/sessions/:id — DELETE
    if (parts.length === 4 && req.method === 'DELETE') {
      const sessionId = parts[3];
      const session = sessions.get(sessionId);
      if (session) {
        session.ws.close(1000, 'Session closed by admin');
        sessions.delete(sessionId);
        log(`Session ${sessionId} closed by admin`);
      }
      return res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ success: true }));
    }
  }

  // GET /debug/health — проверка работоспособности
  if (req.method === 'GET' && url.pathname === '/debug/health') {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({
        status: 'ok',
        sessionCount: sessions.size,
        panelConnected: panelClients.size > 0,
      }));
  }

  // GET /debug/clients — список подключённых клиентов (legacy)
  if (req.method === 'GET' && url.pathname === '/debug/clients') {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({
        sessionCount: sessions.size,
        panelClients: panelClients.size,
      }));
  }

  // GET /debug/hello — проверка что сервер запущен
  if (req.method === 'GET' && url.pathname === '/debug/hello') {
    return res.writeHead(200, { 'Content-Type': 'text/plain' })
      .end('привет мир');
  }

  // GET /debug/world-dump — полный дамп мира (из последней сессии)
  if (req.method === 'GET' && url.pathname === '/debug/world-dump') {
    const lastSession = sessions.size > 0 ? Array.from(sessions.values()).pop() : null;
    const state = lastSession?.gameState;
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

  // GET /debug/stats — статистика ресурсов (forward to game client)
  if (req.method === 'GET' && url.pathname === '/debug/stats') {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingStats.delete(requestId);
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'timeout' }));
    }, 3000);
    pendingStats.set(requestId, {
      send: (data) => {
        clearTimeout(timer);
        pendingStats.delete(requestId);
        res.writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(data));
      },
    });
    let sent = 0;
    for (const [sid, session] of sessions) {
      if (session.ws.readyState === 1) {
        session.ws.send(JSON.stringify({ type: 'get-stats', requestId }));
        sent++;
        log(`[stats] sent get-stats to session ${sid}`);
      }
    }
    log(`[stats] sessions=${sessions.size} sent=${sent}`);
    if (sent === 0) {
      clearTimeout(timer);
      pendingStats.delete(requestId);
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'no game client ready' }));
    }
    return;
  }

  // GET /debug/profile — профилирование запросов (forward to game client)
  if (req.method === 'GET' && url.pathname === '/debug/profile') {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingProfiles.delete(requestId);
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ queries: [], totalTime: '0ms (timeout)' }));
    }, 3000);
    pendingProfiles.set(requestId, {
      send: (data) => {
        clearTimeout(timer);
        pendingProfiles.delete(requestId);
        res.writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(data));
      },
    });
    // Broadcast to all game clients
    for (const [sid, session] of sessions) {
      if (session.ws.readyState === 1) {
        session.ws.send(JSON.stringify({
          type: 'profile-queries',
          requestId,
        }));
      }
    }
    // If no game clients connected, return empty immediately
    if (sessions.size === 0) {
      clearTimeout(timer);
      pendingProfiles.delete(requestId);
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ queries: [], totalTime: '0ms (no game client)' }));
    }
    return;
  }

  // GET /debug/inspect?eid=N — инспекция сущности (из последней сессии)
  if (req.method === 'GET' && url.pathname === '/debug/inspect') {
    const eid = parseInt(url.searchParams.get('eid') || '0');
    const lastSession = sessions.size > 0 ? Array.from(sessions.values()).pop() : null;
    const state = lastSession?.gameState;
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

  // ============================================================
  // Game client подключение с ID сессии
  // ============================================================
  if (isGameClient) {
    let sessionId = url.searchParams.get('id');
    if (!sessionId) {
      // Если клиент не прислал ID — генерируем автоматически
      sessionId = crypto.randomUUID();
    }

    // Обновляем или создаём сессию
    if (sessions.has(sessionId)) {
      const existing = sessions.get(sessionId);
      log(`Session ${sessionId} reconnecting (was connected ${Date.now() - existing.connectedAt}ms ago)`);
      // Закрываем старый WS той же сессии
      existing.ws.close(1000, 'Reconnecting');
    }

    sessions.set(sessionId, {
      ws,
      gameState: null,
      connectedAt: Date.now(),
      label: url.searchParams.get('label') || null,
    });

    log(`Game session ${sessionId} connected from ${ip} (${sessions.size} sessions, ${panelClients.size} panels)`);

    // Отправляем клиенту подтверждение
    ws.send(JSON.stringify({
      type: 'connected',
      sessionId,
      message: 'Debug session established',
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'state') {
          const session = sessions.get(sessionId);
          if (!session) return;

          session.gameState = data.data;

          // Broadcast всем panel clients с sessionId
          const msg = JSON.stringify({
            type: 'state',
            sessionId,
            data: session.gameState,
          });
          for (const client of panelClients) {
            if (client.readyState === 1) {
              try {
                client.send(msg);
              } catch (e2) {
                // Ignore send errors to individual clients
              }
            }
          }

          // Логирование первого сообщения
          if (!ws._msgCount) ws._msgCount = 0;
          ws._msgCount++;
          if (ws._msgCount === 1) {
            log(`Session ${sessionId}: first state — player=${!!session.gameState?.player} enemies=${(session.gameState?.enemies || []).length}`);
          }
          if (ws._msgCount % 50 === 0) {
            log(`Session ${sessionId}: ${ws._msgCount} state updates sent`);
          }
        } else if (data.type === 'log') {
          pushLog(data.level || 'info', data.module || 'game', data.message || '', sessionId);
        } else if (data.type === 'profile-response') {
          const requestId = data.requestId;
          const handler = pendingProfiles.get(requestId);
          if (handler) {
            handler.send(data.result);
          }
        } else if (data.type === 'stats-response') {
          const requestId = data.requestId;
          const handler = pendingStats.get(requestId);
          if (handler) {
            handler.send(data.result);
          }
        }
      } catch (e) {
        log(`Session ${sessionId} error: ${e.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      log(`Session ${sessionId} closed: code=${code} reason="${reason.toString()}"`);
      sessions.delete(sessionId);
      log(`Session ${sessionId} removed (${sessions.size} sessions remaining)`);
    });

    ws.on('error', (err) => {
      log(`Session ${sessionId} WebSocket error: ${err.message}`);
    });

    return;
  }

  // ============================================================
  // Panel client подключение
  // ============================================================
  panelClients.add(ws);
  panelSessionMap.set(ws, { selectedSessionId: null });
  log(`Panel client connected (${panelClients.size} total)`);

  // Отправляем список сессий
  const sessionList = Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    connectedAt: s.connectedAt,
    label: s.label || null,
    player: s.gameState?.player || null,
    enemyCount: s.gameState?.enemies?.length || 0,
  }));
  ws.send(JSON.stringify({ type: 'session-list', sessions: sessionList }));

  // Отправляем последнюю сессию если есть
  const lastSession = sessions.size > 0 ? Array.from(sessions.values()).pop() : null;
  if (lastSession && lastSession.gameState) {
    ws.send(JSON.stringify({
      type: 'state',
      sessionId: Array.from(sessions.keys()).pop(),
      data: lastSession.gameState,
    }));
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'get-state') {
        // Определяем сессию
        const sessionId = data.sessionId || panelSessionMap.get(ws)?.selectedSessionId;
        const session = sessionId ? sessions.get(sessionId) : lastSession;
        if (session) {
          ws.send(JSON.stringify({ type: 'state', sessionId, data: session.gameState }));
        }
      } else if (data.type && data.type !== 'response') {
        // Определяем сессию для команды
        const sessionId = data.sessionId || panelSessionMap.get(ws)?.selectedSessionId;
        const session = sessionId ? sessions.get(sessionId) : lastSession;

        if (session && session.ws.readyState === 1) {
          // Формат: {type: 'command', teleport: {x, y}} — game-client.js ожидает
          const cmdData = { type: 'command' };
          const { type: cmdName, ...cmdArgs } = data;
          cmdData[cmdName] = cmdArgs;
          session.ws.send(JSON.stringify(cmdData));
          ws.send(JSON.stringify({
            type: 'response',
            command: cmdName,
            result: { sent: true },
            error: null,
            sessionId,
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'response',
            command: data.type,
            result: null,
            error: 'Game session not connected',
          }));
        }
      } else if (data.type === 'select-session') {
        // Panel выбирает конкретную сессию
        const sel = panelSessionMap.get(ws);
        if (sel) {
          sel.selectedSessionId = data.sessionId || null;
          log(`Panel selected session: ${sel.selectedSessionId || 'all'}`);
        }
      }
    } catch (e) {
      log(`Panel error: ${e.message}`);
      try {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
      } catch (e2) {
        // Ignore
      }
    }
  });

  ws.on('close', (code, reason) => {
    log(`Panel client disconnected: code=${code}`);
    panelClients.delete(ws);
    panelSessionMap.delete(ws);
    log(`${panelClients.size} panels remaining`);
  });

  ws.on('error', (err) => {
    log(`Panel WebSocket error: ${err.message}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  log(`Multi-session debug server running on http://localhost:${PORT}`);
  log(`Supports multiple game sessions. Connect with ?role=game&id=<uuid>`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  wss.close();
  server.close();
  log('Stopped');
  process.exit(0);
});
