const crypto = require('crypto');

class Packet {
  constructor(options = {}) {
    this.msgId = options.msgId || crypto.randomBytes(3).toString('hex');
    this.type = (options.type || 'BROADCAST').toUpperCase(); // 'BROADCAST', 'DM', 'HEARTBEAT', 'ACK'
    this.src = options.src;
    this.srcNick = options.srcNick || 'unknown';
    this.dst = options.dst || 'broadcast';
    this.dstNick = options.dstNick || null;
    this.timestamp = options.timestamp || Date.now();
    this.ttl = typeof options.ttl === 'number' ? options.ttl : 7;
    this.hops = Array.isArray(options.hops) ? options.hops : (options.src ? [options.src] : []);
    this.transport = options.transport || 'wifi';
    this.encrypted = Boolean(options.encrypted);
    this.payload = options.payload !== undefined ? options.payload : '';
    this.status = options.status || 'sent';
    // For ACK packets, refMsgId links back to the original message
    this.refMsgId = options.refMsgId || null;
    // Optional public key / battery attached to heartbeats
    this.publicKey = options.publicKey || null;
    this.battery = options.battery || null;
  }

  decrementTtl(currentNodeId) {
    this.ttl -= 1;
    if (currentNodeId && !this.hops.includes(currentNodeId)) {
      this.hops.push(currentNodeId);
    }
  }

  isExpired() {
    return this.ttl <= 0;
  }

  toJSON() {
    return {
      msgId: this.msgId,
      type: this.type,
      src: this.src,
      srcNick: this.srcNick,
      dst: this.dst,
      dstNick: this.dstNick,
      timestamp: this.timestamp,
      ttl: this.ttl,
      hops: this.hops,
      transport: this.transport,
      encrypted: this.encrypted,
      payload: this.payload,
      status: this.status,
      refMsgId: this.refMsgId,
      publicKey: this.publicKey,
      battery: this.battery
    };
  }

  serialize() {
    return JSON.stringify(this.toJSON());
  }

  static deserialize(jsonStringOrBuffer) {
    try {
      const data = JSON.parse(jsonStringOrBuffer.toString('utf8'));
      return new Packet(data);
    } catch (e) {
      return null;
    }
  }
}

module.exports = Packet;
