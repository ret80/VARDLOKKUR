/* observe.mjs — пассивное подключение к debug-серверу как panel client */
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3100');
const t0 = Date.now();
const log = (...a) => console.log(((Date.now()-t0)/1000).toFixed(1)+'s', ...a);

let sessionId = null;
const samples = []; // {t, projectiles, archers}

ws.on('open', () => { log('OPEN'); });

ws.on('message', (raw) => {
  let msg; try { msg = JSON.parse(raw); } catch { return; }
  if (msg.type === 'connected') { log('connected', JSON.stringify(msg).slice(0,200)); return; }
  if (msg.type === 'session-list') {
    log('sessions:', msg.sessions.map(s=>`${s.id} hp=${s.player?.hp} enemies=${s.enemyCount ?? '?'}`).join(' | '));
    if (!sessionId && msg.sessions.length) {
      // берём сессию с наибольшим числом врагов (живая игра)
      const best = msg.sessions.slice().sort((a,b)=>(b.enemyCount??0)-(a.enemyCount??0))[0];
      sessionId = best.id;
      log('selecting', sessionId);
      ws.send(JSON.stringify({ type: 'select-session', sessionId }));
      ws.send(JSON.stringify({ type: 'get-state' }));
    }
    return;
  }
  if (msg.type === 'state') {
    const d = msg.data || {};
    const projs = (d.projectiles||[]).filter(p=>p.kind==='bone_arrow');
    const archers = (d.enemies||[]).filter(e=>e.kind==='skeleton_archer');
    if (projs.length || archers.length) {
      samples.push({ t: Date.now(), projs, archers: archers.map(a=>({eid:a.eid,hp:a.hp,x:a.x,y:a.y,state:a.stateName,aggro:a.aggro})) });
      if (projs.length) log('PROJECTILES', JSON.stringify(projs));
      if (archers.length) log('ARCHERS', JSON.stringify(samples[samples.length-1].archers));
    } else if (samples.length === 0 && Math.random() < 0.05) {
      log('state: no archers/arrows; enemies='+(d.enemies||[]).length+' projs='+(d.projectiles||[]).length+' kinds='+[...new Set((d.enemies||[]).map(e=>e.kind))].join(','));
    }
    return;
  }
  if (msg.type === 'response') { log('response', JSON.stringify(msg).slice(0,200)); return; }
  log('other', JSON.stringify(msg).slice(0,150));
});

ws.on('error', (e) => log('ERR', e.message));
ws.on('close', () => log('CLOSE'));

// держим 90 секунд, затем печатаем сводку
setTimeout(() => {
  log('=== SUMMARY ===');
  log('samples with arrows:', samples.filter(s=>s.projs.length).length);
  const arrowSamples = samples.flatMap(s=>s.projs.map(p=>({t:s.t,...p})));
  // анализ: смещение между последовательными сэмплами одного eid vs vx,vy
  const byEid = new Map();
  for (const a of arrowSamples) {
    const arr = byEid.get(a.eid) || []; arr.push(a); byEid.set(a.eid, arr);
  }
  for (const [eid, arr] of byEid) {
    log(`arrow eid=${eid}: ${arr.length} samples`);
    for (let i = 1; i < arr.length; i++) {
      const p0 = arr[i-1], p1 = arr[i];
      const dt = (p1.t - p0.t)/1000;
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const vAng = Math.atan2(p1.vy, p1.vx);
      const mAng = Math.atan2(dy, dx);
      let diff = Math.abs(mAng - vAng); if (diff > Math.PI) diff = 2*Math.PI - diff;
      log(`  dt=${dt.toFixed(3)}s dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} vx=${p1.vx.toFixed(1)} vy=${p1.vy.toFixed(1)} moveAng=${(mAng*180/Math.PI).toFixed(1)} velAng=${(vAng*180/Math.PI).toFixed(1)} diff=${(diff*180/Math.PI).toFixed(1)}deg`);
    }
  }
  // сводка по HP лучников
  const hpByEid = new Map();
  for (const s of samples) for (const a of s.archers) {
    const arr = hpByEid.get(a.eid) || []; arr.push({t:s.t, hp:a.hp, state:a.state}); hpByEid.set(a.eid, arr);
  }
  for (const [eid, arr] of hpByEid) {
    log(`archer eid=${eid}: hp trace = ${arr.map(r=>r.hp).join(', ')}`);
  }
  ws.close(); process.exit(0);
}, 90000);
