const http = require('http');
const fs = require('fs');
const path = require('path');
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

function broadcastWs(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const client of wss.clients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
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

router.on('peer:list', (peers) => {
  broadcastWs('peer:list', peers);
});

router.on('peer:joined', (peer) => {
  broadcastWs('peer:joined', peer);
});

router.on('peer:left', (peer) => {
  broadcastWs('peer:left', peer);
});

router.on('packet:inspector', (packet) => {
  broadcastWs('packet:inspector', packet);
});

router.on('duplicate:dropped', (info) => {
  broadcastWs('duplicate:dropped', info);
});

wss.on('connection', (ws) => {
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
      internetStatus: 'NO INTERNET'
    }
  }));

  ws.on('message', async (raw) => {
    try {
      const { action, payload } = JSON.parse(raw.toString('utf8'));

      switch (action) {
        case 'send_broadcast':
          if (payload && payload.text) {
            await router.sendBroadcast(payload.text);
          }
          break;

        case 'send_dm':
          if (payload && payload.dst && payload.text) {
            await router.sendDirect(payload.dst, payload.text, payload.encrypt !== false);
          }
          break;

        case 'set_nick':
          if (payload && payload.nick) {
            identity.setNickname(payload.nick);
            router.broadcastHeartbeat();
            broadcastWs('identity:update', identity.getPublicProfile());
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
    console.log(`====================================================`);
    console.log(`[MESHCOMM] Node: ${identity.nickname}#${identity.id}`);
    console.log(`[MESHCOMM] Web UI: http://localhost:${config.HTTP_PORT}`);
    console.log(`[MESHCOMM] UDP Radio: port ${config.UDP_PORT}`);
    console.log(`[MESHCOMM] Transport: WiFi (active) | BLE & LoRa (ready)`);
    console.log(`[MESHCOMM] Internet: NO INTERNET (100% local mesh link)`);
    console.log(`====================================================`);
  });
}

start().catch((err) => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
