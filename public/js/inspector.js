/**
 * inspector.js: Packet Inspector Controller
 * Displays low-level packet header fields, hop route, TTL decrement, payload,
 * and highlights pluggable radio transports (Wi-Fi, BLE, LoRa).
 */

class InspectorController {
  constructor() {
    this.badgeMsgId = document.getElementById('inspect-msg-id-badge');
    this.fields = {
      src: document.getElementById('insp-src'),
      dst: document.getElementById('insp-dst'),
      msgId: document.getElementById('insp-msg-id'),
      type: document.getElementById('insp-type'),
      ttl: document.getElementById('insp-ttl'),
      hops: document.getElementById('insp-hops'),
      transport: document.getElementById('insp-transport'),
      enc: document.getElementById('insp-enc'),
      payload: document.getElementById('insp-payload'),
      status: document.getElementById('insp-status')
    };
  }

  inspectMessage(messageOrPacket) {
    if (!messageOrPacket) return;

    const pkt = messageOrPacket.packet || messageOrPacket;
    const msgId = pkt.msgId || messageOrPacket.id || 'unknown';

    if (this.badgeMsgId) {
      this.badgeMsgId.textContent = `msg: 0x${msgId}`;
    }

    if (this.fields.src) {
      this.fields.src.textContent = `${pkt.src || 'unknown'} (${pkt.srcNick || messageOrPacket.srcNick || 'peer'})`;
    }

    if (this.fields.dst) {
      this.fields.dst.textContent = pkt.dst || 'broadcast';
    }

    if (this.fields.msgId) {
      this.fields.msgId.textContent = msgId;
    }

    if (this.fields.type) {
      this.fields.type.textContent = (pkt.type || 'text').toLowerCase();
    }

    if (this.fields.ttl) {
      const origTtl = 7;
      const curTtl = typeof pkt.ttl === 'number' ? pkt.ttl : 7;
      this.fields.ttl.textContent = curTtl < origTtl ? `${origTtl} → ${curTtl}` : `${curTtl}`;
    }

    if (this.fields.hops) {
      const hopsList = Array.isArray(pkt.hops) && pkt.hops.length > 0 ? pkt.hops.join(' → ') : (pkt.src || 'direct');
      this.fields.hops.textContent = hopsList;
    }

    if (this.fields.transport) {
      this.fields.transport.textContent = pkt.transport || 'wifi';
    }

    if (this.fields.enc) {
      this.fields.enc.textContent = pkt.encrypted ? 'aes-256-gcm (e2e)' : 'none';
      this.fields.enc.style.color = pkt.encrypted ? 'var(--aqua)' : 'var(--fg)';
    }

    if (this.fields.payload) {
      let payloadStr = typeof pkt.payload === 'object' ? JSON.stringify(pkt.payload) : String(pkt.payload || messageOrPacket.text || '');
      this.fields.payload.textContent = `"${payloadStr}"`;
    }

    if (this.fields.status) {
      this.fields.status.textContent = pkt.status || messageOrPacket.status || 'delivered';
      this.fields.status.style.color = (pkt.status === 'delivered' || messageOrPacket.status === 'delivered') ? 'var(--green)' : 'var(--fg-dim)';
    }
  }
}

window.inspectorController = new InspectorController();
