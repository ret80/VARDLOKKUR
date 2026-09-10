/* DebugPanel.tsx — React overlay для отладки игры */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../game/debug/logger';

// ============================================================
// Типы
// ============================================================

interface DebugPlayer {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  arrows: number;
  runes: number;
  hearts: number;
  dead: boolean;
  moving: number;
  swingT: number;
  hurtT: number;
  slowT: number;
  hasSword: number;
}

interface DebugEnemy {
  eid: number;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: number;
  stateName: string;
  stateT: number;
  isGhost: boolean;
  leashX: number;
  leashY: number;
  aggro: number;
  fogOnly: number;
  fade: number;
  guardOf: number;
  speed: number;
  dmg: number;
  hidden: number;
  radius: number;
}

interface DebugDrop {
  eid: number;
  kind: string;
  x: number;
  y: number;
  life: number;
  t: number;
  magnet: number;
}

interface DebugProjectile {
  eid: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  dist: number;
}

interface DebugNpc {
  eid: number;
  id: string;
  name: string;
  x: number;
  y: number;
}

interface DebugTime {
  elapsed: number;
  timeScale: number;
  paused: boolean;
}

interface DebugGameState {
  player: DebugPlayer | null;
  enemies: DebugEnemy[];
  drops: DebugDrop[];
  projectiles: DebugProjectile[];
  npcs: DebugNpc[];
  fog: any;
  flags: any;
  map: any;
  time: DebugTime;
}

interface Toast {
  id: number;
  msg: string;
  type?: 'info' | 'success' | 'error';
}

// ============================================================
// WebSocket client
// ============================================================

const WS_URL = 'ws://localhost:3100';
const REST_BASE = 'http://localhost:3100';

function useDebugWebSocket() {
  const [state, setState] = useState<DebugGameState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const toastQueue = useRef<Toast[]>([]);
  const toastId = useRef(0);

  const addToast = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = ++toastId.current;
    toastQueue.current.push({ id, msg, type });
    setTimeout(() => {
      toastQueue.current = toastQueue.current.filter(t => t.id !== id);
    }, 3000);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addToast('Debug server connected', 'success');
    };

    ws.onclose = () => {
      setConnected(false);
      addToast('Debug server disconnected', 'error');
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state') {
          setState(data.data);
        }
      } catch (e) {
        // Ignore
      }
    };

    return () => {
      ws.close();
    };
  }, [addToast]);

  const sendCommand = useCallback((type: string, args?: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...(args || {}) }));
    }
  }, []);

  const restRequest = useCallback(async (method: string, path: string, body?: any) => {
    try {
      const res = await fetch(`${REST_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await res.json();
    } catch (e) {
      logger.error('debug-panel', `REST error: ${e}`);
      return null;
    }
  }, []);

  return { state, connected, sendCommand, restRequest, toasts: toastQueue.current };
}

// ============================================================
// UI Components
// ============================================================

const ENEMY_KINDS = ['draugr', 'varg', 'raven', 'shroom', 'crawler', 'frost', 'reaper', 'spider', 'giant', 'snake', 'ghost'];

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors ${
        active
          ? 'bg-[#1a3a4a] text-[#8fd8e8] border border-[#8fd8e844]'
          : 'bg-[#0a1520] text-[#4a5a68] hover:text-[#8fa0ae]'
      }`}
    >
      {label}
    </button>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`nord-panel p-3 ${className}`}>
      {title && (
        <div className="font-display text-[11px] tracking-[0.2em] text-[#8fd8e8] uppercase mb-2">{title}</div>
      )}
      {children}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center text-[11px]">
      <span className="text-[#4a5a68]">{label}</span>
      <span className="text-[#d8e2ea] font-mono">{String(value)}</span>
    </div>
  );
}

// ============================================================
// Tab Components
// ============================================================

function WorldTab({ state, sendCommand, restRequest }: { state: DebugGameState | null; sendCommand: (t: string, a?: any) => void; restRequest: (m: string, p: string, b?: any) => Promise<any> }) {
  const [dump, setDump] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [inspectEid, setInspectEid] = useState('0');
  const [inspectResult, setInspectResult] = useState<any>(null);

  const handleDump = async () => {
    const data = await restRequest('GET', '/debug/world-dump');
    setDump(data);
  };

  const handleProfile = async () => {
    const data = await restRequest('GET', '/debug/profile');
    setProfile(data);
  };

  const handleInspect = async () => {
    const eid = parseInt(inspectEid) || 0;
    const data = await restRequest('GET', `/debug/inspect?eid=${eid}`);
    setInspectResult(data);
  };

  return (
    <div className="space-y-3">
      <Card title="ECS Introspection">
        <div className="flex gap-2 mb-3">
          <button onClick={handleDump} className="btn-rune text-[11px] px-3">World Dump</button>
          <button onClick={handleProfile} className="btn-rune btn-ice text-[11px] px-3">Profile Queries</button>
        </div>

        {dump && (
          <div className="mb-3">
            <KeyValue label="Total Entities" value={dump.stats?.totalEntities ?? 0} />
            <KeyValue label="Alive Entities" value={dump.stats?.aliveEntities ?? 0} />
            <div className="mt-2 text-[10px] text-[#4a5a68]">Components:</div>
            {dump.stats?.componentCounts && Object.entries(dump.stats.componentCounts).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[10px]">
                <span className="text-[#4a5a68]">{k}</span>
                <span className="text-[#8fa0ae]">{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {profile && (
          <div className="mb-3 space-y-1">
            {profile.queries?.map((q: any, i: number) => (
              <div key={i} className="flex justify-between text-[10px]">
                <span className="text-[#8fa0ae]">{q.name}</span>
                <span className="text-[#c9a24b]">{q.count} entities · {q.elapsed}</span>
              </div>
            ))}
            <div className="text-[10px] text-[#4a5a68]">Total: {profile.totalTime}</div>
          </div>
        )}

        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={inspectEid}
            onChange={(e) => setInspectEid(e.target.value)}
            className="bg-[#0a1520] border border-[#2c3d4d] text-[#d8e2ea] text-xs px-2 py-1 w-20 font-mono"
            placeholder="eid"
          />
          <button onClick={handleInspect} className="btn-rune text-[11px] px-3">Inspect</button>
        </div>

        {inspectResult && (
          <div className="mt-2 text-[10px] font-mono text-[#8fa0ae] bg-[#0a1520] p-2 max-h-40 overflow-y-auto">
            {JSON.stringify(inspectResult, null, 2)}
          </div>
        )}
      </Card>
    </div>
  );
}

function PlayerTab({ state, sendCommand }: { state: DebugGameState | null; sendCommand: (t: string, a?: any) => void }) {
  const player = state?.player;
  const flags = state?.flags;
  const [teleportMode, setTeleportMode] = useState<'tiles' | 'pixels'>('tiles');

  return (
    <div className="space-y-3">
      <Card title="Player">
        {player ? (
          <>
            <KeyValue label="Position (px)" value={`${player.x.toFixed(0)}, ${player.y.toFixed(0)}`} />
            <KeyValue label="Position (tiles)" value={`${(player.x / 16).toFixed(1)}, ${(player.y / 16).toFixed(1)}`} />
            <KeyValue label="HP" value={`${player.hp} / ${player.maxHp}`} />
            <KeyValue label="Runes" value={player.runes} />
            <KeyValue label="Arrows (flags)" value={flags?.arrows ?? 0} />
            <KeyValue label="Hearts (flags)" value={flags?.hearts ?? 0} />
            <KeyValue label="Dead" value={player.dead ? 'YES' : 'NO'} />
            <KeyValue label="Has Sword" value={player.hasSword ? 'YES' : 'NO'} />
            <KeyValue label="Swing T" value={player.swingT.toFixed(2)} />
            <KeyValue label="Hurt T" value={player.hurtT.toFixed(2)} />
            <KeyValue label="Slow T" value={player.slowT.toFixed(2)} />
          </>
        ) : (
          <div className="text-[11px] text-[#4a5a68]">Player not found</div>
        )}
      </Card>

      <Card title="Actions">
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <span className="text-[10px] text-[#4a5a68]">Mode:</span>
            <button
              onClick={() => setTeleportMode('tiles')}
              className={`px-2 py-0.5 text-[10px] font-mono transition-colors ${
                teleportMode === 'tiles'
                  ? 'bg-[#1a3a4a] text-[#8fd8e8] border border-[#8fd8e844]'
                  : 'bg-[#0a1520] text-[#4a5a68] hover:text-[#8fa0ae]'
              }`}
            >
              TILES
            </button>
            <button
              onClick={() => setTeleportMode('pixels')}
              className={`px-2 py-0.5 text-[10px] font-mono transition-colors ${
                teleportMode === 'pixels'
                  ? 'bg-[#1a3a4a] text-[#8fd8e8] border border-[#8fd8e844]'
                  : 'bg-[#0a1520] text-[#4a5a68] hover:text-[#8fa0ae]'
              }`}
            >
              PIXELS
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="number"
              id="teleport-x"
              placeholder={teleportMode === 'tiles' ? 'X (tiles)' : 'X (px)'}
              className="bg-[#0a1520] border border-[#2c3d4d] text-[#d8e2ea] text-xs px-2 py-1 font-mono"
            />
            <input
              type="number"
              id="teleport-y"
              placeholder={teleportMode === 'tiles' ? 'Y (tiles)' : 'Y (px)'}
              className="bg-[#0a1520] border border-[#2c3d4d] text-[#d8e2ea] text-xs px-2 py-1 font-mono"
            />
            <button
              onClick={() => {
                const x = (document.getElementById('teleport-x') as HTMLInputElement)?.value;
                const y = (document.getElementById('teleport-y') as HTMLInputElement)?.value;
                if (x && y) {
                  let fx = parseFloat(x);
                  let fy = parseFloat(y);
                  if (teleportMode === 'tiles') {
                    fx *= 16;
                    fy *= 16;
                  }
                  sendCommand('teleport', { x: fx, y: fy });
                }
              }}
              className="btn-rune text-[11px] col-span-2"
            >
              Teleport
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              id="set-hp"
              placeholder="HP"
              className="bg-[#0a1520] border border-[#2c3d4d] text-[#d8e2ea] text-xs px-2 py-1 w-20 font-mono"
            />
            <button
              onClick={() => {
                const hp = (document.getElementById('set-hp') as HTMLInputElement)?.value;
                if (hp) sendCommand('set-hp', { hp: parseFloat(hp) });
              }}
              className="btn-rune text-[11px]"
            >
              Set HP
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => sendCommand('kill-player')} className="btn-rune btn-blood text-[11px]">Kill</button>
            <button onClick={() => sendCommand('respawn')} className="btn-rune btn-ice text-[11px]">Respawn</button>
            <button onClick={() => sendCommand('full-heal-player')} className="btn-rune text-[11px]">Full Heal</button>
            <button onClick={() => sendCommand('free-player')} className="btn-rune text-[11px]">Free Player</button>
          </div>
        </div>
      </Card>

      <Card title="Resources">
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => sendCommand('add-runes', { count: 1 })} className="btn-rune text-[10px]">+1 Rune</button>
          <button onClick={() => sendCommand('add-arrows', { count: 12 })} className="btn-rune text-[10px]">+12 Arrows</button>
          <button onClick={() => sendCommand('add-hearts', { count: 1 })} className="btn-rune text-[10px]">+1 Heart</button>
        </div>
      </Card>
    </div>
  );
}

function EnemiesTab({ state, sendCommand }: { state: DebugGameState | null; sendCommand: (t: string, a?: any) => void }) {
  const [spawnKind, setSpawnKind] = useState('draugr');
  const [spawnX, setSpawnX] = useState('');
  const [spawnY, setSpawnY] = useState('');

  return (
    <div className="space-y-3">
      <Card title="Spawn Enemy">
        <div className="grid grid-cols-3 gap-1.5">
          <select
            value={spawnKind}
            onChange={(e) => setSpawnKind(e.target.value)}
            className="bg-[#0a1520] border border-[#2c3d4d] text-[#d8e2ea] text-xs px-2 py-1 font-mono col-span-1"
          >
            {ENEMY_KINDS.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input
            type="number"
            value={spawnX}
            onChange={(e) => setSpawnX(e.target.value)}
            placeholder="X"
            className="bg-[#0a1520] border border-[#2c3d4d] text-[#d8e2ea] text-xs px-2 py-1 font-mono"
          />
          <input
            type="number"
            value={spawnY}
            onChange={(e) => setSpawnY(e.target.value)}
            placeholder="Y"
            className="bg-[#0a1520] border border-[#2c3d4d] text-[#d8e2ea] text-xs px-2 py-1 font-mono"
          />
          <button
            onClick={() => {
              if (spawnX && spawnY) {
                sendCommand('spawn-enemy', { kind: spawnKind, x: parseFloat(spawnX), y: parseFloat(spawnY) });
              }
            }}
            className="btn-rune text-[11px] col-span-3"
          >
            Spawn
          </button>
        </div>
      </Card>

      <Card title={`Enemies (${state?.enemies?.length ?? 0})`}>
        <div className="flex gap-1.5 mb-3">
          <button onClick={() => sendCommand('remove-all-enemies')} className="btn-rune btn-blood text-[10px]">Clear All</button>
          <button onClick={() => sendCommand('remove-all-ghosts')} className="btn-rune btn-blood text-[10px]">Clear Ghosts</button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {state?.enemies?.map((e) => (
            <div key={e.eid} className="flex items-center justify-between text-[10px] bg-[#0a1520] px-2 py-1">
              <div className="flex gap-2 items-center">
                <span className={`font-bold ${e.isGhost ? 'text-[#8fd8e8]' : 'text-[#d8e2ea]'}`}>{e.kind}</span>
                <span className="text-[#4a5a68]">#{e.eid}</span>
                <span className="text-[#8fa0ae]">{e.stateName}</span>
              </div>
              <div className="flex gap-1 items-center">
                <span className={`font-mono ${e.hp < e.maxHp ? 'text-[#e06060]' : 'text-[#8fd8e8]'}`}>{e.hp}/{e.maxHp}</span>
                <button
                  onClick={() => sendCommand('remove-enemy', { eid: e.eid })}
                  className="text-[#e06060] hover:text-[#ff8080] px-1"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {(!state?.enemies || state.enemies.length === 0) && (
            <div className="text-[10px] text-[#4a5a68] text-center py-4">No enemies</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function DropsTab({ state, sendCommand }: { state: DebugGameState | null; sendCommand: (t: string, a?: any) => void }) {
  return (
    <div className="space-y-3">
      <Card title={`Drops (${state?.drops?.length ?? 0})`}>
        <div className="flex gap-1.5 mb-3">
          <button onClick={() => sendCommand('clear-drops')} className="btn-rune btn-blood text-[10px]">Clear All</button>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {state?.drops?.map((d) => (
            <div key={d.eid} className="flex items-center justify-between text-[10px] bg-[#0a1520] px-2 py-1">
              <div className="flex gap-2 items-center">
                <span className="text-[#c9a24b]">{d.kind}</span>
                <span className="text-[#4a5a68]">#{d.eid}</span>
                <span className="text-[#8fa0ae]">{d.x.toFixed(0)},{d.y.toFixed(0)}</span>
              </div>
              <button
                onClick={() => sendCommand('remove-drop', { eid: d.eid })}
                className="text-[#e06060] hover:text-[#ff8080] px-1"
              >
                ×
              </button>
            </div>
          ))}
          {(!state?.drops || state.drops.length === 0) && (
            <div className="text-[10px] text-[#4a5a68] text-center py-4">No drops</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ProjectilesTab({ state, sendCommand }: { state: DebugGameState | null; sendCommand: (t: string, a?: any) => void }) {
  return (
    <div className="space-y-3">
      <Card title={`Projectiles (${state?.projectiles?.length ?? 0})`}>
        <div className="flex gap-1.5 mb-3">
          <button onClick={() => sendCommand('clear-projectiles')} className="btn-rune btn-blood text-[10px]">Clear All</button>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {state?.projectiles?.map((p) => (
            <div key={p.eid} className="flex items-center justify-between text-[10px] bg-[#0a1520] px-2 py-1">
              <div className="flex gap-2 items-center">
                <span className="text-[#e8c979]">{p.kind}</span>
                <span className="text-[#4a5a68]">#{p.eid}</span>
                <span className="text-[#8fa0ae]">dmg:{p.dmg}</span>
              </div>
              <button
                onClick={() => sendCommand('remove-projectile', { eid: p.eid })}
                className="text-[#e06060] hover:text-[#ff8080] px-1"
              >
                ×
              </button>
            </div>
          ))}
          {(!state?.projectiles || state.projectiles.length === 0) && (
            <div className="text-[10px] text-[#4a5a68] text-center py-4">No projectiles</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function FlagsTab({ state, sendCommand }: { state: DebugGameState | null; sendCommand: (t: string, a?: any) => void }) {
  const flags = state?.flags;
  if (!flags) return <div className="text-[11px] text-[#4a5a68]">Flags not available</div>;

  const flagGroups: Record<string, string[]> = {
    'Inventory': ['hasSword', 'hasAxe', 'hasBow', 'hasHammer', 'hasKey', 'swordUp', 'axeUp', 'furyRune', 'nornsFavor'],
    'Resources': ['hearts', 'arrows', 'runes', 'dew', 'fogWaves'],
    'Quest Items': ['bear', 'horn', 'mead', 'ore', 'moss', 'amber', 'flower', 'diary', 'bundle', 'relic'],
    'Quests': ['hornDone', 'meadDone', 'oreDone', 'shamanDone', 'refugeeDone', 'merchantDone', 'atoneDone', 'cullDone', 'shrineQuestDone', 'huntDone'],
    'Kills': ['reaperDead', 'spiderDead', 'giantDead', 'snakeStarted', 'snakeDead'],
    'World': ['secretKnown', 'ghostBane', 'shrineIdx'],
  };

  return (
    <div className="space-y-3">
      {Object.entries(flagGroups).map(([group, keys]) => (
        <Card key={group} title={group}>
          <div className="grid grid-cols-2 gap-1">
            {keys.map(key => {
              const value = (flags as any)[key];
              const displayValue = typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : value;
              return (
                <div key={key} className="flex justify-between items-center text-[10px]">
                  <span className="text-[#4a5a68]">{key}</span>
                  <span className={`font-mono ${typeof value === 'boolean' ? (value ? 'text-[#8fd8e8]' : 'text-[#4a5a68]') : 'text-[#d8e2ea]'}`}>
                    {displayValue}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

function TimeTab({ state, sendCommand }: { state: DebugGameState | null; sendCommand: (t: string, a?: any) => void }) {
  const time = state?.time;

  return (
    <div className="space-y-3">
      <Card title="Time Control">
        {time && (
          <>
            <KeyValue label="Elapsed" value={`${time.elapsed.toFixed(1)}s`} />
            <KeyValue label="Time Scale" value={time.timeScale} />
            <KeyValue label="Paused" value={time.paused ? 'YES' : 'NO'} />
          </>
        )}

        <div className="grid grid-cols-3 gap-1.5 mt-3">
          <button onClick={() => sendCommand('freeze')} className="btn-rune btn-blood text-[10px]">Freeze</button>
          <button onClick={() => sendCommand('unfreeze')} className="btn-rune btn-ice text-[10px]">Unfreeze</button>
          <button onClick={() => sendCommand('set-timescale', { scale: 1 })} className="btn-rune text-[10px]">1×</button>
          <button onClick={() => sendCommand('set-timescale', { scale: 10 })} className="btn-rune text-[10px]">10×</button>
          <button onClick={() => sendCommand('set-timescale', { scale: 60 })} className="btn-rune text-[10px]">60×</button>
          <button onClick={() => sendCommand('set-timescale', { scale: 120 })} className="btn-rune text-[10px]">120×</button>
        </div>
      </Card>

      <Card title="Map">
        {state?.map && (
          <>
            <KeyValue label="Name" value={state.map.name ?? 'Unknown'} />
            <KeyValue label="Is Dungeon" value={state.map.isDungeon ? 'YES' : 'NO'} />
            <KeyValue label="Tree Altar" value={`${(state.map.treeAltar as any)?.x ?? 0}, ${(state.map.treeAltar as any)?.y ?? 0}`} />
          </>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// Main Debug Panel
// ============================================================

export function DebugPanel() {
  const { state, connected, sendCommand, restRequest, toasts } = useDebugWebSocket();
  const [activeTab, setActiveTab] = useState('world');

  const tabs = [
    { id: 'world', label: 'World' },
    { id: 'player', label: 'Player' },
    { id: 'enemies', label: 'Enemies' },
    { id: 'drops', label: 'Drops' },
    { id: 'projectiles', label: 'Proj.' },
    { id: 'flags', label: 'Flags' },
    { id: 'time', label: 'Time' },
  ];

  return (
    <div className="fixed top-16 right-0 z-50 w-[360px] max-h-[calc(100vh-64px)] flex flex-col">
      {/* Connection indicator */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a1520] border-b border-[#2c3d4d]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-[#8fd8e8]' : 'bg-[#e06060]'}`} />
          <span className="text-[10px] font-mono tracking-wider text-[#4a5a68]">DEBUG</span>
        </div>
        <span className="text-[10px] text-[#4a5a68]">{connected ? 'connected' : 'disconnected'}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-2 py-2 bg-[#0a1520] border-b border-[#2c3d4d] overflow-x-auto">
        {tabs.map(tab => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            label={tab.label}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#0a1520]">
        {!connected && (
          <div className="nord-panel border-[#a0323288] p-3 text-[11px] text-[#e06060]">
            Not connected to debug server. Make sure the game is running with --debug flag.
          </div>
        )}

        {activeTab === 'world' && <WorldTab state={state} sendCommand={sendCommand} restRequest={restRequest} />}
        {activeTab === 'player' && <PlayerTab state={state} sendCommand={sendCommand} />}
        {activeTab === 'enemies' && <EnemiesTab state={state} sendCommand={sendCommand} />}
        {activeTab === 'drops' && <DropsTab state={state} sendCommand={sendCommand} />}
        {activeTab === 'projectiles' && <ProjectilesTab state={state} sendCommand={sendCommand} />}
        {activeTab === 'flags' && <FlagsTab state={state} sendCommand={sendCommand} />}
        {activeTab === 'time' && <TimeTab state={state} sendCommand={sendCommand} />}
      </div>

      {/* Toasts */}
      <div className="absolute bottom-2 left-2 right-2 space-y-1 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`anim-toast nord-panel px-3 py-1 text-[11px] text-center ${
              t.type === 'success' ? 'text-[#8fd8e8]' :
              t.type === 'error' ? 'text-[#e06060]' :
              'text-[#d8e2ea]'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
