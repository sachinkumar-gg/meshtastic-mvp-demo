const TransportInterface = require('./TransportInterface');

/**
 * LoraTransport (Pluggable Radio Stub)
 * 
 * Demonstrates architecture pluggability for Semtech SX1262 / SX1276 LoRa radios (915MHz / 868MHz / 433MHz).
 * Matches TransportInterface: send, broadcast, onReceive, getPeers.
 */
class LoraTransport extends TransportInterface {
  constructor() {
    super('lora');
    this.status = 'pluggable_stub';
    this.description = 'LoRa Radio SX1262 SPI / Serial (Meshtastic-compatible PHY)';
  }

  async start() {
    console.log('[LoraTransport] Radio stub ready. In production: binds to UART / SPI radio module.');
  }

  async broadcast(packet) {
    console.log(`[LoraTransport] Broadcast packet ${packet.msgId} over LoRa RF frequency (stub).`);
  }

  async sendDirect(packet, peer) {
    console.log(`[LoraTransport] Send direct packet ${packet.msgId} to LoRa node ${peer.id} (stub).`);
  }

  getPeers() {
    return [];
  }

  async stop() {}
}

module.exports = LoraTransport;
