// WebSocket client for the seat: server messages → bus, status/haptic → server.
import { MSG } from '../shared/contracts.js';

export function createNet(bus, { getPhase }) {
  let ws = null;
  let lastState = null;

  function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

  function connect() {
    ws = new WebSocket(`wss://${location.host}/ws?role=seat`);
    ws.onopen = () => bus.emit('net:status', { connected: true });
    ws.onclose = () => { bus.emit('net:status', { connected: false }); setTimeout(connect, 1500); };
    ws.onerror = () => ws.close();
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      const { t, ...p } = m;
      if (t === MSG.INPUT) bus.emit('input', { pitch: +p.pitch || 0, roll: +p.roll || 0, throttle: +p.throttle || 0, brake: !!p.brake, src: 'yoke' });
      else if (t === MSG.BUTTON) bus.emit('button', p);
      else if (t === MSG.CLOCK) bus.emit('clock', p);
      else if (t === MSG.JUMP) bus.emit('jump', p);
      else if (t === 'yoke') bus.emit('yoke:presence', p);
    };
  }

  bus.on('flight:state', s => { lastState = s; });
  bus.on('flight:touchdown', td => send({ t: MSG.HAPTIC, ms: td.grade === 'BUTTER' ? 120 : td.grade === 'GO_AROUND' ? 500 : 300 }));
  setInterval(() => send({ t: MSG.STATUS, phase: getPhase(), state: lastState }), 500);

  connect();
  return { send };
}
