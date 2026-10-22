const TransportInterface = require('./TransportInterface');

/**
 * BleTransport (Pluggable Radio Stub)
 * 
 * Demonstrates architecture pluggability for Bluetooth Low Energy GATT / Mesh.
 * Matches TransportInterface: send, broadcast, onReceive, getPeers.
 */
class BleTransport extends TransportInterface {
  constructor() {
    super('ble');
    this.status = 'pluggable_stub';
    this.description = 'Bluetooth Low Energy (GATT / Mesh Advertiser)';
  }

  async start() {
    console.log('[BleTransport] Radio stub ready. In production: binds to BLE peripheral/central.');
  }

  async broadcast(packet) {
    console.log(`[BleTransport] Broadcast packet ${packet.msgId} over BLE advertising payload (stub).`);
  }

  async sendDirect(packet, peer) {
    console.log(`[BleTransport] Send direct packet ${packet.msgId} to BLE peer ${peer.id} (stub).`);
  }

  getPeers() {
    return [];
  }

  async stop() {}
}

module.exports = BleTransport;
