const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

if (getArg('--port') || getArg('-p')) process.env.PORT = getArg('--port') || getArg('-p');
if (getArg('--udp') || getArg('-u')) process.env.UDP_PORT = getArg('--udp') || getArg('-u');
if (getArg('--nick') || getArg('-n')) process.env.NODE_NICK = getArg('--nick') || getArg('-n');
if (getArg('--id')) process.env.NODE_ID = getArg('--id');
if (getArg('--connect') || getArg('-c')) process.env.PEER_LIST = getArg('--connect') || getArg('-c');

const config = require('./src/config');
const identity = require('./src/identity');
const WifiTransport = require('./src/transport/WifiTransport');
const BleTransport = require('./src/transport/BleTransport');
const LoraTransport = require('./src/transport/LoraTransport');
const Router = require('./src/protocol/Router');
const meshTopology = require('./src/simulation/meshTopology');

// Discover all active local network IPv4 addresses
function getLocalIpAddresses() {
  const addresses = [];
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push({ interface: name, address: net.address });
        }
      }
    }
  } catch (e) {}
  return addresses;
}

// Initialize Transports
const wifiTransport = new WifiTransport({
  port: config.UDP_PORT,
  broadcastAddr: config.BROADCAST_ADDR
});
const bleTransport = new BleTransport();
const loraTransport = new LoraTransport();

// Active transport is Wi-Fi
const router = new Router(wifiTransport);

// Add initial manual peers if specified
if (config.PEER_LIST && config.PEER_LIST.length > 0) {
  for (const peerStr of config.PEER_LIST) {
    const [ip, port] = peerStr.split(':');
    wifiTransport.addManualPeer(ip, port || 41234);
  }
}

// MIME types for static offline file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml'
};

// HTTP Static File Server
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.join(__dirname, 'public', reqPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

const Packet = require('./src/protocol/Packet');
const clientNodes = new Map(); // ws -> { id, nick, battery, isMobile, ip }

function broadcastWs(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const client of wss.clients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
    }
  }
}

function sendPeerListToClient(targetWs) {
  if (targetWs.readyState !== 1) return;
  const currentClient = clientNodes.get(targetWs);
  const currentId = currentClient ? currentClient.id : identity.id;

  const allPeersMap = new Map();

  // 1. Add peers discovered via physical UDP Wi-Fi
  for (const p of router.getPeersList()) {
    if (p.id !== currentId && p.nick !== (currentClient ? currentClient.nick : identity.nickname)) {
      allPeersMap.set(p.id, p);
    }
  }

  // 2. Add other connected browser clients (e.g. phone vs laptop)
  for (const [ws, node] of clientNodes.entries()) {
    if (ws !== targetWs && node.id !== currentId) {
      allPeersMap.set(node.id, {
        id: node.id,
        nick: node.nick,
        ip: node.ip || 'local',
        battery: node.battery || 80,
        lastSeen: Date.now(),
        hops: 0,
        signal: 4,
        isVirtual: false,
        status: 'online'
      });
    }
  }

  // 3. If current client is a separate mobile/browser peer, include host identity if not already present
  const hasHost = Array.from(allPeersMap.values()).some(p => p.id === identity.id || p.nick === identity.nickname);
  if (currentId !== identity.id && !hasHost && (currentClient && currentClient.nick !== identity.nickname)) {
    allPeersMap.set(identity.id, {
      id: identity.id,
      nick: identity.nickname,
      ip: '127.0.0.1',
      battery: identity.battery,
      lastSeen: Date.now(),
      hops: 0,
      signal: 4,
      isVirtual: false,
      status: 'online'
    });
  }

  const peerList = Array.from(allPeersMap.values());
  targetWs.send(JSON.stringify({ type: 'peer:list', data: peerList }));
}

function broadcastPeerLists() {
  for (const ws of wss.clients) {
    if (ws.readyState === 1) {
      sendPeerListToClient(ws);
    }
  }
}

// Wire router events to WebSocket clients
router.on('message', (msg) => {
  broadcastWs('message:new', msg);
});

router.on('message:delivered', (info) => {
  broadcastWs('message:delivered', info);
});

router.on('peer:list', () => {
  broadcastPeerLists();
});

router.on('peer:joined', (peer) => {
  broadcastWs('peer:joined', peer);
  broadcastPeerLists();
});

router.on('peer:left', (peer) => {
  broadcastWs('peer:left', peer);
  broadcastPeerLists();
});

router.on('packet:inspector', (packet) => {
  broadcastWs('packet:inspector', packet);
});

router.on('duplicate:dropped', (info) => {
  broadcastWs('duplicate:dropped', info);
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;

  // Send initial snapshot
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      identity: identity.getPublicProfile(),
      peers: router.getPeersList(),
      messages: router.messages,
      transport: {
        active: 'wifi',
        udpPort: config.UDP_PORT,
        broadcastAddr: config.BROADCAST_ADDR,
        pluggable: ['ble', 'lora']
      },
      virtualNodes: meshTopology.virtualNodes,
      offlineVirtualNodes: Array.from(meshTopology.offlineNodes),
      internetStatus: 'NO INTERNET',
      localIps: getLocalIpAddresses(),
      networkUrls: getLocalIpAddresses().map(item => `http://${item.address}:${config.HTTP_PORT}`)
    }
  }));

  ws.on('close', () => {
    if (clientNodes.has(ws)) {
      const departing = clientNodes.get(ws);
      clientNodes.delete(ws);
      broadcastWs('peer:left', departing);
      broadcastPeerLists();
    }
  });

  ws.on('message', async (raw) => {
    try {
      const { action, payload } = JSON.parse(raw.toString('utf8'));

      switch (action) {
        case 'register_node':
          if (payload && payload.id) {
            const nodeData = {
              id: payload.id,
              nick: payload.nick || 'peer-' + payload.id,
              battery: payload.battery || 80,
              isMobile: Boolean(payload.isMobile),
              ip: clientIp,
              lastSeen: Date.now()
            };
            clientNodes.set(ws, nodeData);

            // Notify others
            for (const client of wss.clients) {
              if (client !== ws && client.readyState === 1) {
                client.send(JSON.stringify({ type: 'peer:joined', data: nodeData }));
              }
            }
            broadcastPeerLists();
          }
          break;

        case 'heartbeat':
          if (clientNodes.has(ws)) {
            clientNodes.get(ws).lastSeen = Date.now();
          }
          break;

        case 'send_broadcast':
          if (payload && payload.text) {
            const sender = clientNodes.get(ws) || identity;
            const srcId = payload.src || sender.id;
            const srcNick = payload.srcNick || sender.nick || sender.nickname;
            const msgId = payload.msgId || require('crypto').randomBytes(3).toString('hex');

            const msgRecord = {
              id: msgId,
              msgId: msgId,
              type: 'broadcast',
              src: srcId,
              srcNick: srcNick,
              dst: 'broadcast',
              channel: 'public',
              text: payload.text,
              timestamp: Date.now(),
              hops: [srcId],
              ttl: config.DEFAULT_TTL,
              encrypted: false,
              status: 'delivered',
              isOwn: false
            };
            msgRecord.packet = { ...msgRecord, msgId, payload: payload.text };

            // Crucial: mark as seen so local UDP loopback drops it
            router.seenMsgIds.set(msgId, Date.now());
            router.messages.push(msgRecord);

            // Echo back to sender as own
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'message:new', data: { ...msgRecord, isOwn: true } }));
            }

            // Send to other connected browser clients
            for (const client of wss.clients) {
              if (client !== ws && client.readyState === 1) {
                client.send(JSON.stringify({ type: 'message:new', data: msgRecord }));
              }
            }

            // Also broadcast over physical Wi-Fi UDP
            const packet = new Packet(msgRecord.packet);
            wifiTransport.broadcast(packet);
          }
          break;

        case 'send_dm':
          if (payload && payload.dst && payload.text) {
            const sender = clientNodes.get(ws) || identity;
            const srcId = payload.src || sender.id;
            const srcNick = payload.srcNick || sender.nick || sender.nickname;
            const msgId = payload.msgId || require('crypto').randomBytes(3).toString('hex');
            const isEnc = payload.encrypt !== false;

            const dmRecord = {
              id: msgId,
              msgId: msgId,
              type: 'dm',
              src: srcId,
              srcNick: srcNick,
              dst: payload.dst,
              dstNick: payload.dst,
              channel: srcNick, // For receiver, channel is sender
              text: payload.text,
              timestamp: Date.now(),
              hops: [srcId],
              ttl: config.DEFAULT_TTL,
              encrypted: isEnc,
              status: 'delivered',
              isOwn: false
            };
            dmRecord.packet = { ...dmRecord, msgId, payload: payload.text };

            // Mark as seen in router
            router.seenMsgIds.set(msgId, Date.now());

            // Check if recipient is a connected browser client
            let deliveredLocally = false;
            for (const [clientWs, clientNode] of clientNodes.entries()) {
              if (clientWs !== ws && (clientNode.nick.toLowerCase() === payload.dst.toLowerCase() || clientNode.id === payload.dst)) {
                if (clientWs.readyState === 1) {
                  clientWs.send(JSON.stringify({ type: 'message:new', data: dmRecord }));
                  deliveredLocally = true;
                }
                break;
              }
            }

            // Echo back to sender
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                type: 'message:new',
                data: {
                  ...dmRecord,
                  channel: payload.dst,
                  isOwn: true,
                  status: deliveredLocally ? 'delivered' : 'sent'
                }
              }));

              if (deliveredLocally) {
                ws.send(JSON.stringify({
                  type: 'message:delivered',
                  data: { msgId: msgId, refMsgId: msgId, deliveredTo: payload.dst }
                }));
              }
            }

            // If not delivered locally, route through router & UDP transport
            if (!deliveredLocally) {
              await router.sendDirect(payload.dst, payload.text, isEnc);
            }
          }
          break;

        case 'set_nick':
          if (payload && payload.nick) {
            if (clientNodes.has(ws)) {
              clientNodes.get(ws).nick = payload.nick;
              broadcastPeerLists();
            } else {
              identity.setNickname(payload.nick);
              router.broadcastHeartbeat();
              broadcastWs('identity:update', identity.getPublicProfile());
            }
          }
          break;

        case 'connect_peer':
          if (payload && payload.endpoint) {
            const [ip, p] = payload.endpoint.split(':');
            wifiTransport.addManualPeer(ip, p || config.UDP_PORT);
            router.broadcastHeartbeat();
          }
          break;

        case 'toggle_node':
          if (payload && payload.nodeId) {
            const newState = meshTopology.toggleNode(payload.nodeId);
            broadcastWs('node:state_change', {
              nodeId: payload.nodeId,
              status: newState,
              offlineNodes: Array.from(meshTopology.offlineNodes)
            });
          }
          break;

        case 'kill_node':
          if (payload && payload.nodeId) {
            meshTopology.killNode(payload.nodeId);
            broadcastWs('node:state_change', {
              nodeId: payload.nodeId,
              status: 'offline',
              offlineNodes: Array.from(meshTopology.offlineNodes)
            });
          }
          break;

        case 'revive_node':
          if (payload && payload.nodeId) {
            meshTopology.reviveNode(payload.nodeId);
            broadcastWs('node:state_change', {
              nodeId: payload.nodeId,
              status: 'online',
              offlineNodes: Array.from(meshTopology.offlineNodes)
            });
          }
          break;

        case 'trigger_scenario':
          if (payload && payload.scenarioId) {
            broadcastWs('scenario:start', {
              scenarioId: payload.scenarioId
            });
          }
          break;

        default:
          console.warn('[WS] Unknown action:', action);
      }
    } catch (err) {
      console.error('[WS] Error processing message:', err.message);
    }
  });
});

// Boot up
async function start() {
  await wifiTransport.start();
  await bleTransport.start();
  await loraTransport.start();
  router.start();

  server.listen(config.HTTP_PORT, '0.0.0.0', () => {
    const localIps = getLocalIpAddresses();
    console.log(`\n====================================================`);
    console.log(`[MESHCOMM] Node: ${identity.nickname}#${identity.id}`);
    console.log(`----------------------------------------------------`);
    console.log(`  Local UI:    http://localhost:${config.HTTP_PORT}`);
    if (localIps.length > 0) {
      for (const item of localIps) {
        console.log(`  Network UI:  http://${item.address}:${config.HTTP_PORT}  (${item.interface})`);
      }
    } else {
      console.log(`  Network UI:  (Connect to Wi-Fi / Hotspot to see local IP)`);
    }
    console.log(`  UDP Radio:   port ${config.UDP_PORT}`);
    console.log(`  Transport:   WiFi (active) | BLE & LoRa (ready)`);
    console.log(`  Internet:    NO INTERNET (100% local mesh link)`);
    console.log(`----------------------------------------------------`);
    console.log(`📱 TO OPEN ON ANOTHER PHONE OR LAPTOP ON SAME NETWORK:`);
    if (localIps.length > 0) {
      console.log(`   1. Ensure phone/laptop is on the same Wi-Fi / hotspot`);
      console.log(`   2. In browser, open: http://${localIps[0].address}:${config.HTTP_PORT}`);
    } else {
      console.log(`   Connect to your phone hotspot or Wi-Fi to share link`);
    }
    console.log(`====================================================\n`);
  });
}

start().catch((err) => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
