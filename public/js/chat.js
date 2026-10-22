/**
 * chat.js: Chat View Controller
 * Handles channel switching (#public and @peer), message rendering,
 * Gruvbox stable color assignment, hop counters, and delivery status.
 */

class ChatController {
  constructor() {
    this.container = document.getElementById('chat-messages');
    this.channelLabel = document.getElementById('current-channel-label');
    this.peersStatus = document.getElementById('active-peers-status');
    this.currentChannel = 'public'; // 'public' or peer nickname for DM
    this.messages = [];
    this.colorPalette = ['blue', 'aqua', 'purple', 'orange', 'yellow'];
  }

  getPeerColor(idOrNick) {
    if (!idOrNick) return 'blue';
    let hash = 0;
    for (let i = 0; i < idOrNick.length; i++) {
      hash = (hash << 5) - hash + idOrNick.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % this.colorPalette.length;
    return `var(--${this.colorPalette[idx]})`;
  }

  setChannel(channelName) {
    this.currentChannel = channelName;
    if (channelName === 'public') {
      this.channelLabel.textContent = '#public';
    } else {
      this.channelLabel.textContent = `@${channelName}`;
    }
    this.render();
  }

  formatTime(timestamp) {
    const d = new Date(timestamp || Date.now());
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `[${hh}:${mm}]`;
  }

  addSystemMessage(text) {
    const record = {
      type: 'system',
      text,
      timestamp: Date.now(),
      channel: this.currentChannel
    };
    this.messages.push(record);
    this.render();
  }

  addMessage(msgRecord) {
    const id = msgRecord.id || msgRecord.msgId || (msgRecord.packet && (msgRecord.packet.id || msgRecord.packet.msgId));

    // Check if we already have this message by ID or identical content, sender, and timestamp
    const exists = this.messages.some(m => {
      const existingId = m.id || m.msgId || (m.packet && (m.packet.id || m.packet.msgId));
      if (id && existingId && id === existingId) return true;
      if (m.text === msgRecord.text && m.src === msgRecord.src && Math.abs((m.timestamp || 0) - (msgRecord.timestamp || 0)) < 4000) {
        return true;
      }
      return false;
    });

    if (!exists) {
      this.messages.push(msgRecord);
      this.render();
    }
  }

  markDelivered(msgId, deliveredTo) {
    const msg = this.messages.find(m => m.id === msgId);
    if (msg) {
      msg.status = 'delivered';
      this.render();
    }
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    const filtered = this.messages.filter(m => {
      if (m.type === 'system') return true;
      if (this.currentChannel === 'public') {
        return m.channel === 'public' || m.dst === 'broadcast';
      } else {
        // Direct message conversation with specific peer
        return m.channel === this.currentChannel ||
               (m.dstNick && m.dstNick.toLowerCase() === this.currentChannel.toLowerCase()) ||
               (m.srcNick && m.srcNick.toLowerCase() === this.currentChannel.toLowerCase());
      }
    });

    for (const msg of filtered) {
      const line = document.createElement('div');
      line.className = 'msg-line';
      line.setAttribute('data-msg-id', msg.id || '');

      // Click to inspect message
      line.addEventListener('click', () => {
        if (window.inspectorController && (msg.packet || msg.id)) {
          window.inspectorController.inspectMessage(msg);
          if (window.app) window.app.switchView('inspector-view');
        }
      });

      if (msg.type === 'system') {
        line.innerHTML = `<span class="system-msg">* ${this._escapeHtml(msg.text)}</span>`;
        this.container.appendChild(line);
        continue;
      }

      // Main message line layout
      const timeStr = this.formatTime(msg.timestamp);
      const isOwn = Boolean(msg.isOwn);
      const senderColor = isOwn ? 'var(--green)' : this.getPeerColor(msg.srcNick || msg.src);
      const nickDisplay = `<span class="msg-sender" style="color: ${senderColor}">&lt;${this._escapeHtml(msg.srcNick || msg.src)}&gt;</span>`;
      const encBadge = msg.encrypted ? `<span class="token-enc">[enc]</span> ` : '';

      // Hop badge: [h0] direct neighbor, [h1], [h2]
      const hopsCount = Array.isArray(msg.hops) ? Math.max(0, msg.hops.length - 1) : 0;
      const hopBadge = `<span class="hop-badge">[h${hopsCount}]</span>`;

      // Delivery badge on own messages
      let deliveryBadge = '';
      if (isOwn) {
        if (msg.status === 'delivered') {
          deliveryBadge = `<span class="delivery-done">[✓ delivered]</span>`;
        } else {
          deliveryBadge = `<span class="delivery-sent">[sent]</span>`;
        }
      }

      line.innerHTML = `
        <div class="msg-main">
          <span class="msg-time">${timeStr}</span>
          ${nickDisplay}
          <span class="msg-text">${encBadge}${this._escapeHtml(msg.text)}</span>
        </div>
        <div class="msg-meta">
          ${deliveryBadge}
          ${hopBadge}
        </div>
      `;

      this.container.appendChild(line);
    }

    // Auto-scroll to bottom
    this.container.scrollTop = this.container.scrollHeight;
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.chatController = new ChatController();
