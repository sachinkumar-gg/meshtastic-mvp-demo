/**
 * nodesView.js: Nodes Table View Controller
 * Lists local node ('you'), discovered real peers, and virtual mesh nodes.
 * Displays signal bars (▂▄▆█), battery percentage, hops, last seen, and status tags.
 */

class NodesViewController {
  constructor() {
    this.tbody = document.getElementById('nodes-tbody');
    this.localIdentity = null;
    this.realPeers = [];
    this.virtualNodes = [
      { id: 'n1', nick: 'n1', hops: 1, battery: 82, signal: 3, lastSeen: '4s', isVirtual: true },
      { id: 'n2', nick: 'n2', hops: 1, battery: 74, signal: 4, lastSeen: '1s', isVirtual: true },
      { id: 'n3', nick: 'n3', hops: 2, battery: 60, signal: 2, lastSeen: '6s', isVirtual: true },
      { id: 'n4', nick: 'ghost-4', hops: 2, battery: 41, signal: 2, lastSeen: '9s', isVirtual: true },
      { id: 'n5', nick: 'n5', hops: 2, battery: 89, signal: 3, lastSeen: '3s', isVirtual: true },
      { id: 'n6', nick: 'n6', hops: 2, battery: 52, signal: 3, lastSeen: '5s', isVirtual: true },
      { id: 'n7', nick: 'n7', hops: 3, battery: 67, signal: 2, lastSeen: '12s', isVirtual: true },
      { id: 'n8', nick: 'n8', hops: 3, battery: 91, signal: 3, lastSeen: '7s', isVirtual: true }
    ];
  }

  setLocalIdentity(identity) {
    this.localIdentity = identity;
    this.render();
  }

  setRealPeers(peers) {
    this.realPeers = peers || [];
    this.render();
  }

  formatSignal(signalNum) {
    switch (signalNum) {
      case 4: return '▂▄▆█';
      case 3: return '▂▄▆_';
      case 2: return '▂▄__';
      case 1: return '▂___';
      default: return '____';
    }
  }

  formatLastSeen(timestampOrStr) {
    if (typeof timestampOrStr === 'string') return timestampOrStr;
    if (!timestampOrStr) return 'unknown';
    const sec = Math.floor((Date.now() - timestampOrStr) / 1000);
    if (sec <= 2) return 'now';
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m`;
  }

  render() {
    if (!this.tbody) return;
    this.tbody.innerHTML = '';

    const rows = [];

    // 1. You (local node)
    if (this.localIdentity) {
      rows.push({
        id: this.localIdentity.id,
        nick: this.localIdentity.nickname || this.localIdentity.nick,
        signal: 4,
        hops: 0,
        battery: this.localIdentity.battery || 87,
        lastSeen: 'now',
        isLocal: true,
        isVirtual: false,
        online: true
      });
    }

    // 2. Real discovered peers
    for (const peer of this.realPeers) {
      rows.push({
        id: peer.id,
        nick: peer.nick,
        signal: peer.signal !== undefined ? peer.signal : (peer.status === 'offline' ? 0 : 4),
        hops: peer.hops !== undefined ? peer.hops : 0,
        battery: peer.battery || 75,
        lastSeen: this.formatLastSeen(peer.lastSeen),
        isLocal: false,
        isVirtual: false,
        online: peer.status !== 'offline'
      });
    }

    // 3. Virtual simulated nodes
    for (const v of this.virtualNodes) {
      const isOnline = window.meshMapController ? window.meshMapController.nodes[v.id]?.online !== false : true;
      rows.push({
        id: v.id,
        nick: v.nick,
        signal: isOnline ? v.signal : 0,
        hops: v.hops,
        battery: v.battery,
        lastSeen: isOnline ? v.lastSeen : 'offline',
        isLocal: false,
        isVirtual: true,
        online: isOnline
      });
    }

    // Sort by signal descending
    rows.sort((a, b) => b.signal - a.signal);

    for (const r of rows) {
      const tr = document.createElement('tr');
      if (!r.online) {
        tr.style.color = 'var(--fg-dim)';
      }

      const signalDisplay = `<span class="signal-bars">${this.formatSignal(r.signal)}</span>`;
      let tagHtml = '';
      if (r.isLocal) {
        tagHtml = `<span class="tag-you-row">you</span>`;
      } else if (!r.online) {
        tagHtml = `<span class="tag-offline-row">offline</span>`;
      } else if (r.isVirtual) {
        tagHtml = `<span class="tag-sim-row">sim</span>`;
      }

      tr.innerHTML = `
        <td>${r.id}</td>
        <td style="font-weight: bold; color: ${r.isLocal ? 'var(--green)' : 'var(--fg)'};">${r.nick}</td>
        <td>${signalDisplay}</td>
        <td>${r.hops}</td>
        <td>${r.battery}%</td>
        <td>${r.lastSeen}</td>
        <td>${tagHtml}</td>
      `;

      this.tbody.appendChild(tr);
    }
  }
}

window.nodesViewController = new NodesViewController();
