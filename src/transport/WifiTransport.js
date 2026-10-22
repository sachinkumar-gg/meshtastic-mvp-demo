const dgram = require('dgram');
const os = require('os');
const TransportInterface = require('./TransportInterface');
const Packet = require('../protocol/Packet');
const config = require('../config');

class WifiTransport extends TransportInterface {
  constructor(options = {}) {
    super('wifi');
    this.port = options.port || config.UDP_PORT;
    this.broadcastAddr = options.broadcastAddr || config.BROADCAST_ADDR;
    this.knownPorts = new Set([41234, 41235, 41236, this.port]);
    this.socket = null;
    this.bound = false;
    this.manualPeers = new Map(); // key -> { ip, port, addedAt }
  }

  // Get local network broadcast addresses for all active IPv4 interfaces
  _getBroadcastAddresses() {
    const addresses = new Set();
    addresses.add('255.255.255.255');
    addresses.add('127.0.0.1');

    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            // Calculate subnet broadcast address if netmask is available
            if (net.address && net.netmask) {
              const ipParts = net.address.split('.').map(Number);
              const maskParts = net.netmask.split('.').map(Number);
              const bcastParts = ipParts.map((part, idx) => (part | (~maskParts[idx] & 255)));
              addresses.add(bcastParts.join('.'));
            }
          }
        }
      }
    } catch (e) {
      // Fallback to standard broadcast
    }

    if (this.broadcastAddr && !addresses.has(this.broadcastAddr)) {
      addresses.add(this.broadcastAddr);
    }

    return Array.from(addresses);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        console.error(`[WifiTransport] UDP Socket error:`, err.message);
        this.emit('error', err);
      });

      this.socket.on('message', (msg, rinfo) => {
        const packet = Packet.deserialize(msg);
        if (packet) {
          this.emit('packet', packet, rinfo);
        }
      });

      this.socket.bind(this.port, () => {
        try {
          this.socket.setBroadcast(true);
        } catch (e) {
          console.warn('[WifiTransport] Unable to setBroadcast(true):', e.message);
        }
        this.bound = true;
        console.log(`[WifiTransport] Listening on UDP port ${this.port}`);
        resolve();
      });
    });
  }

  addManualPeer(ip, port = config.UDP_PORT) {
    const key = `${ip}:${port}`;
    this.manualPeers.set(key, { ip, port: parseInt(port, 10), addedAt: Date.now() });
    if (port) {
      this.knownPorts.add(parseInt(port, 10));
    }
    console.log(`[WifiTransport] Added manual peer: ${key}`);
  }

  async broadcast(packet) {
    if (!this.socket || !this.bound) return;

    const data = Buffer.from(typeof packet.serialize === 'function' ? packet.serialize() : JSON.stringify(packet));
    const targets = this._getBroadcastAddresses();
    const ports = Array.from(this.knownPorts);

    // Send to broadcast addresses on all known mesh ports
    for (const addr of targets) {
      for (const p of ports) {
        try {
          this.socket.send(data, 0, data.length, p, addr, () => {});
        } catch (e) {
          // ignore transient socket send errors
        }
      }
    }

    // Also send explicitly to any registered manual peers
    for (const peer of this.manualPeers.values()) {
      try {
        this.socket.send(data, 0, data.length, peer.port, peer.ip, () => {});
      } catch (e) {
        // ignore
      }
    }
  }

  async sendDirect(packet, peer) {
    if (!this.socket || !this.bound) return;
    if (!peer || !peer.ip || !peer.port) {
      throw new Error('Invalid peer endpoint for sendDirect');
    }

    const data = Buffer.from(typeof packet.serialize === 'function' ? packet.serialize() : JSON.stringify(packet));
    return new Promise((resolve, reject) => {
      this.socket.send(data, 0, data.length, peer.port, peer.ip, (err) => {
        if (err) {
          console.error(`[WifiTransport] Error sending direct to ${peer.ip}:${peer.port}:`, err.message);
          return reject(err);
        }
        resolve();
      });
    });
  }

  async stop() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
      this.bound = false;
    }
  }
}

module.exports = WifiTransport;
