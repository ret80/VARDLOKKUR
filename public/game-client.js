/* game-client.js — Скрипт для инжекции в браузер

Этот скрипт:
1. Создаёт window.__debugServerGlobals с методами registerGetters/registerSetters
2. Подключается к ws://localhost:3100 (debug-server.cjs)
3. Периодически (100ms) пушит состояние игры через getters
4. Принимает команды от сервера и выполняет через setters

Инжектируется в index.html через Vite middleware
*/

 (function () {
  'use strict';

  // Подключаемся к debug-серверу только если в URL есть ?debug
  var IS_DEBUG = window.location.search.indexOf('debug') !== -1;
  
  // Генерируем или восстанавливаем Session ID
  var SESSION_STORAGE_KEY = 'debugSessionId';
  var sessionId = null;
  
  function generateId() {
    try {
      // Используем crypto.randomUUID если доступен (браузеры)
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch (e) {
      // Fallback
    }
    // Fallback: генерируем простой UUID v4-подобный
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Пытаемся восстановить из localStorage
  try {
    sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  } catch (e) {
    // localStorage может быть недоступен
  }
  if (!sessionId) {
    sessionId = generateId();
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } catch (e) {
      // localStorage может быть недоступен
    }
  }
  
  var WS_URL = IS_DEBUG ? 'ws://localhost:3100?role=game&id=' + sessionId : null;
  var ws = null;
  var reconnectTimer = null;
  var connected = false;
  var getters = {};
  var setters = {};

  // Global API для engine.ts — регистрация колбэков
  window.__debugServerGlobals = {
    getters: {},
    setters: {},
    registerGetters: function(g) {
      Object.assign(getters, g);
      Object.assign(window.__debugServerGlobals.getters, g);
      console.log('[game-client] Registered getters:', Object.keys(g));
    },
    registerSetters: function(s) {
      Object.assign(setters, s);
      Object.assign(window.__debugServerGlobals.setters, s);
      console.log('[game-client] Registered setters:', Object.keys(s));
    },
    get connected() { return connected; },
    // Метод для отправки статистики ресурсов
    getStats: function() {
      if (!getters.getRenderer) return null;
      try {
        var stats = getters.getRenderer();
        return stats;
      } catch (e) {
        return { error: e.message };
      }
    },
    // Метод для отправки логов на сервер
    pushLog: function(level, module, message) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'log',
          sessionId: sessionId,
          level: level,
          module: module,
          message: message,
        }));
      }
    },
  };

  function connect() {
    if (!IS_DEBUG) return;
    if (ws && ws.readyState <= 1) return;
    
    console.log('[game-client] Connecting to debug server at', WS_URL);
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      console.error('[game-client] WebSocket constructor failed:', e);
      reconnectTimer = setTimeout(connect, 2000);
      return;
    }

    ws.onopen = function() {
      connected = true;
      console.log('[game-client] Connected to debug server! Session: ' + sessionId);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onclose = function() {
      connected = false;
      console.log('[game-client] Disconnected, retrying in 2s...');
      reconnectTimer = setTimeout(connect, 2000);
    };

    ws.onerror = function(err) {
      console.error('[game-client] WebSocket error:', err);
    };

    ws.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        
        // Подтверждение подключения от сервера
        if (data.type === 'connected') {
          console.log('[game-client] Server confirmed session: ' + data.sessionId);
        }
        
        // Профилирование запросов от debug сервера
        if (data.type === 'profile-queries') {
          try {
            var result = getters.profileQueries ? getters.profileQueries() : { queries: [], totalTime: '0ms' };
            ws.send(JSON.stringify({
              type: 'profile-response',
              requestId: data.requestId,
              result: result,
            }));
          } catch (e) {
            console.error('[game-client] profileQueries error:', e.message);
            ws.send(JSON.stringify({
              type: 'profile-response',
              requestId: data.requestId,
              result: { queries: [], totalTime: '0ms (error)', error: e.message },
            }));
          }
        }
        
        // Запрос статистики ресурсов
        if (data.type === 'get-stats') {
          console.log('[game-client] get-stats received, requestId:', data.requestId);
          try {
            var gsg = window.__debugServerGlobals;
            var result = gsg && gsg.getStats ? gsg.getStats() : { error: 'no getStats' };
            console.log('[game-client] get-stats result:', result);
            ws.send(JSON.stringify({
              type: 'stats-response',
              requestId: data.requestId,
              result: result,
            }));
          } catch (e) {
            console.error('[game-client] getStats error:', e.message);
            ws.send(JSON.stringify({
              type: 'stats-response',
              requestId: data.requestId,
              result: { error: e.message },
            }));
          }
        }
        
        // Выполняем команду от debug сервера
        // Формат: {type: 'command', teleport: {x, y}} или {type: 'command', set-hp: {hp: 10}}
        if (data.type === 'command') {
          var s = setters;
          var result = null;
          
          try {
            // Ищем ключи команд в объекте (кроме type)
            for (var key in data) {
              if (key === 'type') continue;
              var cmdName = key;
              var cmdArgs = data[key] || {};
              
              switch (cmdName) {
                case 'teleport':
                  result = s.teleportPlayer ? s.teleportPlayer(cmdArgs.x, cmdArgs.y) : null;
                  console.log('[game-client] teleport result:', result);
                  break;
                case 'set-hp':
                  result = s.setPlayerHp ? s.setPlayerHp(cmdArgs.hp) : null;
                  console.log('[game-client] set-hp result:', result);
                  break;
                case 'kill-player':
                  result = s.killPlayer ? s.killPlayer() : null;
                  console.log('[game-client] kill-player result:', result);
                  break;
                case 'respawn':
                  s.respawnPlayer && s.respawnPlayer();
                  result = true;
                  break;
                case 'free-player':
                  s.freePlayer && s.freePlayer();
                  result = true;
                  break;
                case 'full-heal-player':
                  s.fullHealPlayer && s.fullHealPlayer();
                  result = true;
                  break;
                case 'spawn-enemy':
                  result = s.spawnEnemy ? s.spawnEnemy(cmdArgs.kind, cmdArgs.x, cmdArgs.y) : null;
                  console.log('[game-client] spawn-enemy result:', result);
                  break;
                case 'remove-enemy':
                  result = s.removeEnemy ? s.removeEnemy(cmdArgs.eid) : null;
                  console.log('[game-client] remove-enemy result:', result);
                  break;
                case 'remove-all-enemies':
                  result = s.removeAllEnemies ? s.removeAllEnemies() : null;
                  console.log('[game-client] remove-all-enemies result:', result);
                  break;
                case 'remove-all-ghosts':
                  result = s.removeAllGhosts ? s.removeAllGhosts() : null;
                  console.log('[game-client] remove-all-ghosts result:', result);
                  break;
                case 'remove-projectile':
                  result = s.removeProjectile ? s.removeProjectile(cmdArgs.eid) : null;
                  break;
                case 'clear-projectiles':
                  result = s.clearProjectiles ? s.clearProjectiles() : null;
                  break;
                case 'remove-drop':
                  result = s.removeDrop ? s.removeDrop(cmdArgs.eid) : null;
                  break;
                case 'clear-drops':
                  result = s.clearDrops ? s.clearDrops() : null;
                  break;
                case 'set-timescale':
                  s.setTimeScale && s.setTimeScale(cmdArgs.scale);
                  result = true;
                  break;
                case 'freeze':
                  s.setTimeScale && s.setTimeScale(0);
                  result = true;
                  break;
                case 'unfreeze':
                  s.setTimeScale && s.setTimeScale(1);
                  result = true;
                  break;
                case 'add-runes':
                  s.addRunes && s.addRunes(cmdArgs.count || 1);
                  result = true;
                  break;
                case 'add-arrows':
                  s.addArrows && s.addArrows(cmdArgs.count || 12);
                  result = true;
                  break;
                case 'add-hearts':
                  s.addHearts && s.addHearts(cmdArgs.count || 1);
                  result = true;
                  break;
                case 'set-flag':
                  s.setFlag && s.setFlag(cmdArgs.key, cmdArgs.value);
                  result = true;
                  break;
                default:
                  console.warn('[game-client] Unknown command:', cmdName);
              }
            }
          } catch (e) {
            console.error('[game-client] Command execution error:', e);
          }
        }
      } catch (e) {
        console.error('[game-client] Error handling message:', e);
      }
    };
  }

  // Пушим состояние игры каждые 100ms (10 FPS)
  function pushState() {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    try {
      var g = getters;
      var state = {
        player: g.getPlayerState ? g.getPlayerState() : null,
        enemies: g.getEnemiesState ? g.getEnemiesState() : [],
        drops: g.getDropsState ? g.getDropsState() : [],
        projectiles: g.getProjectilesState ? g.getProjectilesState() : [],
        npcs: g.getNpcsState ? g.getNpcsState() : [],
        fog: g.getFogState ? g.getFogState() : {},
        flags: g.getFlags ? g.getFlags() : {},
        map: g.getMap ? g.getMap() : {},
        time: g.getTime ? g.getTime() : {},
      };
      ws.send(JSON.stringify({ type: 'state', sessionId: sessionId, data: state }));
    } catch (e) {
      console.error('[game-client] Error pushing state:', e);
    }
  }

  // Запускаем пуш состояния
  setInterval(pushState, 100);

  // Подключаемся при загрузке
  connect();
})();
