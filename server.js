
текст ниже.
3. Нажмите **Commit changes**.

```js
'use strict';
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 3000);
const MAX_ROOM = 20;
const rooms = new Map();
const peers = new Map();

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const send = (ws, data) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
};
function members(room) {
  return rooms.get(room) || new Map();
}
function broadcast(room, data, except) {
  for (const [ws] of members(room)) {
    if (ws !== except) send(ws, data);
  }
}
function snapshot(room) {
  return [...members(room).values()].map(p => ({
    id: p.id, nick: p.nick, x: p.x, y: p.y, z: p.z, yaw: p.yaw
  }));
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      ok: true, service: 'youtuber-life-online', protocol: 1
    }));
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({ server, maxPayload: 2048 });

wss.on('connection', ws => {
  const id = randomUUID();
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: 'Invalid JSON' });
    }

    if (msg.type === 'join') {
      if (peers.has(ws)) return;
      const room = String(msg.room || 'city-1')
        .slice(0, 32).replace(/[^\w-]/g, '') || 'city-1';
      const nick = String(msg.nick || 'Игрок')
        .replace(/[<>\n\r]/g, '').slice(0, 20) || 'Игрок';
      const group = members(room);

      if (group.size >= MAX_ROOM) {
        return send(ws, { type: 'error', message: 'Комната заполнена' });
      }

      const player = { id, nick, x: 0, y: 0, z: 0, yaw: 0 };
      group.set(ws, player);
      rooms.set(room, group);
      peers.set(ws, { room, player });
      send(ws, { type: 'welcome', id, room, players: snapshot(room) });
      broadcast(room, { type: 'joined', player }, ws);
      return;
    }

    const peer = peers.get(ws);

    if (msg.type === 'leave' && peer) {
      const group = members(peer.room);
      group.delete(ws);
      peers.delete(ws);
      broadcast(peer.room, { type: 'left', id });
      if (!group.size) rooms.delete(peer.room);
      return;
    }

    if (msg.type === 'move' && peer) {
      const p = peer.player;
      p.x = clamp(msg.x, -10000, 10000);
      p.y = clamp(msg.y, -100, 1000);
      p.z = clamp(msg.z, -10000, 10000);
      p.yaw = clamp(msg.yaw, -100000, 100000);
      broadcast(peer.room, { type: 'moved', player: p }, ws);
    }
  });

  ws.on('close', () => {
    const peer = peers.get(ws);
    if (!peer) return;
    const group = members(peer.room);
    group.delete(ws);
    peers.delete(ws);
    broadcast(peer.room, { type: 'left', id });
    if (!group.size) rooms.delete(peer.room);
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Online server listening on ${PORT}`);
});
server.on('close', () => clearInterval(heartbeat));
```
