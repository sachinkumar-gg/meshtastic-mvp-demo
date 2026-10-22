const EventEmitter = require('events');

/**
 * TransportInterface
 * 
 * Thin abstraction for swappable radio/network transports.
 * Real implementation: WifiTransport (UDP broadcast / unicast)
 * Future implementations: BleTransport, LoraTransport
 */
class TransportInterface extends EventEmitter {
  constructor(name) {
    super();
    this.name = name; // 'wifi', 'ble', 'lora'
  }

  /**
   * Start transport listening and discovery
   */
  async start() {
    throw new Error('start() not implemented');
  }

  /**
   * Broadcast packet to all reachable nodes on this transport
   * @param {Packet} packet
   */
  async broadcast(packet) {
    throw new Error('broadcast() not implemented');
  }

  /**
   * Send packet directly to a specific peer endpoint
   * @param {Packet} packet
   * @param {Object} peer
   */
  async sendDirect(packet, peer) {
    throw new Error('sendDirect() not implemented');
  }

  /**
   * List known peers on this transport
   */
  getPeers() {
    return [];
  }

  /**
   * Stop transport and release sockets/handles
   */
  async stop() {
    throw new Error('stop() not implemented');
  }
}

module.exports = TransportInterface;
