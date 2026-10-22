const EventEmitter = require('events');
const Packet = require('./Packet');
const identity = require('../identity');
const cryptoManager = require('../crypto');
const config = require('../config');

class Router extends EventEmitter {
  constructor(transport, identityInstance = null) {
    super();
    this.transport = transport;
    this.identity = identityInstance || identity;
    this.cryptoManager = (this.identity && this.identity.cryptoManager) ? this.identity.cryptoManager : cryptoManager;
    this.peers = new Map(); // id -> peerInfo
    this.seenMsgIds = new Map(); // msgId -> timestamp
    this.messages = []; // in-memory history of messages
    this.heartbeatInterval = null;
    this.cleanupInterval = null;

    this._setupTransportListeners();
  }

  _setupTransportListeners() {
    this.transport.on('packet', (packet, rinfo) => {
      this.handleIncomingPacket(packet, rinfo);
    });
  }

  start() {
    // Start periodic heartbeats
    this.heartbeatInterval = setInterval(() => {
      this.broadcastHeartbeat();
    }, config.HEARTBEAT_INTERVAL_MS);

    // Initial heartbeat immediately
    setTimeout(() => this.broadcastHeartbeat(), 200);

    // Periodic peer liveness check
    this.cleanupInterval = setInterval(() => {
      this._checkPeerLiveness();
    }, 2000);
  }

  stop() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  broadcastHeartbeat() {
    const packet = new Packet({
      type: 'HEARTBEAT',
      src: this.identity.id,
      srcNick: this.identity.nickname,
      dst: 'broadcast',
      ttl: 1,
      hops: [this.identity.id],
      transport: this.transport.name,
      publicKey: this.identity.publicKey,
      battery: this.identity.battery,
      payload: 'beacon'
    });

    this.transport.broadcast(packet);
  }

  handleIncomingPacket(packet, rinfo) {
    // Ignore packets sent by ourselves
    if (packet.src === this.identity.id) {
      return;
    }

    // Duplicate suppression check
    const now = Date.now();
    if (this.seenMsgIds.has(packet.msgId)) {
      this.emit('duplicate:dropped', {
        msgId: packet.msgId,
        src: packet.src,
        type: packet.type
      });
      return;
    }
    this.seenMsgIds.set(packet.msgId, now);

    // Clean up old seenMsgIds after 60 seconds
    if (this.seenMsgIds.size > 200) {
      for (const [id, time] of this.seenMsgIds.entries()) {
        if (now - time > 60000) this.seenMsgIds.delete(id);
      }
    }

    // Update peer table from packet sender
    this._updatePeerFromPacket(packet, rinfo);

    // Handle by packet type
    switch (packet.type) {
      case 'HEARTBEAT':
        // Heartbeat was handled by _updatePeerFromPacket
        break;

      case 'BROADCAST':
        this._handleBroadcastMessage(packet);
        break;

      case 'DM':
        this._handleDirectMessage(packet, rinfo);
        break;

      case 'ACK':
        this._handleAckPacket(packet);
        break;

      default:
        console.warn(`[Router] Unknown packet type: ${packet.type}`);
    }

    // Forward to packet inspector listener
    this.emit('packet:inspector', packet);
  }

  _updatePeerFromPacket(packet, rinfo) {
    const existing = this.peers.get(packet.src);
    const isNew = !existing;

    const peerData = {
      id: packet.src,
      nick: packet.srcNick || (existing ? existing.nick : 'peer-' + packet.src),
      ip: rinfo.address,
      port: rinfo.port,
      publicKey: packet.publicKey || (existing ? existing.publicKey : null),
      battery: packet.battery !== undefined && packet.battery !== null ? packet.battery : (existing ? existing.battery : 75),
      lastSeen: Date.now(),
      hops: 0, // Direct link
      signal: 4, // 4 bars for direct local WiFi
      isVirtual: false,
      status: 'online'
    };

    this.peers.set(packet.src, peerData);

    if (isNew) {
      this.emit('peer:joined', peerData);
    }
    this.emit('peer:list', this.getPeersList());
  }

  _checkPeerLiveness() {
    const now = Date.now();
    let changed = false;

    for (const [id, peer] of this.peers.entries()) {
      const elapsed = now - peer.lastSeen;
      if (elapsed > config.PEER_TIMEOUT_MS && peer.status !== 'offline') {
        peer.status = 'offline';
        peer.signal = 0;
        changed = true;
        this.emit('peer:left', peer);
      }
    }

    if (changed) {
      this.emit('peer:list', this.getPeersList());
    }
  }

  _handleBroadcastMessage(packet) {
    const messageRecord = {
      id: packet.msgId,
      type: 'broadcast',
      src: packet.src,
      srcNick: packet.srcNick,
      dst: 'broadcast',
      channel: 'public',
      text: typeof packet.payload === 'string' ? packet.payload : JSON.stringify(packet.payload),
      timestamp: packet.timestamp,
      hops: packet.hops,
      ttl: packet.ttl,
      encrypted: false,
      status: 'delivered',
      isOwn: false,
      packet: packet.toJSON()
    };

    this.messages.push(messageRecord);
    this.emit('message', messageRecord);
  }

  _handleDirectMessage(packet, rinfo) {
    // Check if DM is addressed to us
    if (packet.dst !== this.identity.id && packet.dstNick !== this.identity.nickname) {
      return; // Not for us
    }

    let decryptedText = packet.payload;
    if (packet.encrypted) {
      try {
        const peer = this.peers.get(packet.src);
        const peerPubKey = packet.publicKey || (peer && peer.publicKey);
        if (peerPubKey) {
          decryptedText = this.cryptoManager.decrypt(packet.payload, peerPubKey);
        } else {
          decryptedText = '[Encrypted message: missing public key]';
        }
      } catch (err) {
        decryptedText = `[Decryption failed: ${err.message}]`;
      }
    }

    const messageRecord = {
      id: packet.msgId,
      type: 'dm',
      src: packet.src,
      srcNick: packet.srcNick,
      dst: this.identity.id,
      dstNick: this.identity.nickname,
      channel: packet.srcNick, // Direct conversation with sender
      text: decryptedText,
      timestamp: packet.timestamp,
      hops: packet.hops,
      ttl: packet.ttl,
      encrypted: packet.encrypted,
      status: 'delivered',
      isOwn: false,
      packet: packet.toJSON()
    };

    this.messages.push(messageRecord);
    this.emit('message', messageRecord);

    // Send ACK back to the sender
    this._sendAck(packet, rinfo);
  }

  _sendAck(originalPacket, rinfo) {
    const ackPacket = new Packet({
      type: 'ACK',
      src: this.identity.id,
      srcNick: this.identity.nickname,
      dst: originalPacket.src,
      dstNick: originalPacket.srcNick,
      refMsgId: originalPacket.msgId,
      ttl: 7,
      hops: [this.identity.id],
      transport: this.transport.name,
      payload: 'ACK'
    });

    // Send direct if we know rinfo, otherwise broadcast
    const peer = this.peers.get(originalPacket.src);
    if (peer && peer.ip && peer.port) {
      this.transport.sendDirect(ackPacket, peer).catch(() => {
        this.transport.broadcast(ackPacket);
      });
    } else if (rinfo && rinfo.address && rinfo.port) {
      this.transport.sendDirect(ackPacket, { ip: rinfo.address, port: rinfo.port }).catch(() => {
        this.transport.broadcast(ackPacket);
      });
    } else {
      this.transport.broadcast(ackPacket);
    }
  }

  _handleAckPacket(packet) {
    if (packet.dst !== this.identity.id) return;

    // Find original outgoing message
    const msg = this.messages.find(m => m.id === packet.refMsgId);
    if (msg) {
      msg.status = 'delivered';
      this.emit('message:delivered', {
        msgId: msg.id,
        refMsgId: packet.refMsgId,
        deliveredTo: packet.srcNick
      });
    }
  }

  async sendBroadcast(text) {
    const packet = new Packet({
      type: 'BROADCAST',
      src: this.identity.id,
      srcNick: this.identity.nickname,
      dst: 'broadcast',
      ttl: config.DEFAULT_TTL,
      hops: [this.identity.id],
      transport: this.transport.name,
      payload: text
    });

    await this.transport.broadcast(packet);

    const messageRecord = {
      id: packet.msgId,
      type: 'broadcast',
      src: this.identity.id,
      srcNick: this.identity.nickname,
      dst: 'broadcast',
      channel: 'public',
      text: text,
      timestamp: packet.timestamp,
      hops: packet.hops,
      ttl: packet.ttl,
      encrypted: false,
      status: 'sent',
      isOwn: true,
      packet: packet.toJSON()
    };

    this.messages.push(messageRecord);
    this.emit('message', messageRecord);
    this.emit('packet:inspector', packet);

    return messageRecord;
  }

  async sendDirect(targetNickOrId, text, encrypt = true) {
    // Find target peer
    let targetPeer = null;
    for (const peer of this.peers.values()) {
      if (peer.nick.toLowerCase() === targetNickOrId.toLowerCase() || peer.id === targetNickOrId) {
        targetPeer = peer;
        break;
      }
    }

    const dstId = targetPeer ? targetPeer.id : targetNickOrId;
    const dstNick = targetPeer ? targetPeer.nick : targetNickOrId;

    let payload = text;
    let isEncrypted = false;

    if (encrypt && targetPeer && targetPeer.publicKey) {
      try {
        payload = this.cryptoManager.encrypt(text, targetPeer.publicKey);
        isEncrypted = true;
      } catch (err) {
        console.warn('[Router] Failed to encrypt DM, sending unencrypted:', err.message);
      }
    }

    const packet = new Packet({
      type: 'DM',
      src: this.identity.id,
      srcNick: this.identity.nickname,
      dst: dstId,
      dstNick: dstNick,
      ttl: config.DEFAULT_TTL,
      hops: [this.identity.id],
      transport: this.transport.name,
      encrypted: isEncrypted,
      publicKey: this.identity.publicKey,
      payload: payload
    });

    if (targetPeer && targetPeer.ip && targetPeer.port) {
      try {
        await this.transport.sendDirect(packet, targetPeer);
      } catch (e) {
        await this.transport.broadcast(packet);
      }
    } else {
      await this.transport.broadcast(packet);
    }

    const messageRecord = {
      id: packet.msgId,
      type: 'dm',
      src: this.identity.id,
      srcNick: this.identity.nickname,
      dst: dstId,
      dstNick: dstNick,
      channel: dstNick, // conversation tab
      text: text, // Plain text for local display
      timestamp: packet.timestamp,
      hops: packet.hops,
      ttl: packet.ttl,
      encrypted: isEncrypted,
      status: 'sent',
      isOwn: true,
      packet: packet.toJSON()
    };

    this.messages.push(messageRecord);
    this.emit('message', messageRecord);
    this.emit('packet:inspector', packet);

    return messageRecord;
  }

  getPeersList() {
    return Array.from(this.peers.values());
  }
}

module.exports = Router;
