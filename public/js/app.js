/**
 * app.js: Main Client Application Controller
 * Handles WebSocket connection, command line interpretation, tab switching,
 * toast alerts, keyboard shortcuts, and coordinator for sub-views.
 */

class MeshApp {
  constructor() {
    this.ws = null;
    this.lastPacket = null;
    this.activeView = 'chat-view';
    this.networkUrls = [];
    this.localIps = [];

    // Persistent browser/device identity
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    let storedId = localStorage.getItem('mesh_node_id');
    let storedNick = localStorage.getItem('mesh_node_nick');

    if (!storedId) {
      storedId = Math.random().toString(16).substring(2, 6);
      localStorage.setItem('mesh_node_id', storedId);
    }

    if (!storedNick) {
      storedNick = isMobile ? 'phone' : (isLocalhost ? 'sachin' : 'peer-' + storedId);
      localStorage.setItem('mesh_node_nick', storedNick);
    }

    this.identity = {
      id: storedId,
      nick: storedNick,
      isMobile: isMobile,
      battery: Math.floor(Math.random() * 20) + 78
    };

    // DOM Elements
    this.identityBadge = document.getElementById('identity-badge');
    this.modeBadge = document.getElementById('mode-badge');
    this.peersCountBadge = document.getElementById('peers-count-badge');
    this.transportBadge = document.getElementById('transport-badge');
    this.cliInput = document.getElementById('cli-input');
    this.toastBar = document.getElementById('toast-bar');
    this.toastTimer = null;

    this.views = ['chat-view', 'map-view', 'nodes-view', 'inspector-view'];

    this.initTabs();
    this.initShortcuts();
    this.initInput();
    this.initKeybindings();
    this.connectWs();
  }

  // Toast Notification (auto-dismiss after 3s per design.md)
  showToast(text) {
    if (!this.toastBar) return;
    if (this.toastTimer) clearTimeout(this.toastTimer);

    this.toastBar.textContent = text;
    this.toastBar.classList.add('visible');

    this.toastTimer = setTimeout(() => {
      this.toastBar.classList.remove('visible');
    }, 3000);
  }

  // Switch between tabs / views
  switchView(viewId) {
    if (!this.views.includes(viewId)) return;
    this.activeView = viewId;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const target = btn.getAttribute('data-view');
      if (target === viewId) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        btn.textContent = `[${btn.id.replace('tab-', '')}]`;
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
        btn.textContent = btn.id.replace('tab-', '');
      }
    });

    // Update view panes
    document.querySelectorAll('.view-pane').forEach(pane => {
      if (pane.id === viewId) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });

    // If switching to map, render it
    if (viewId === 'map-view' && window.meshMapController) {
      window.meshMapController.render();
    } else if (viewId === 'nodes-view' && window.nodesViewController) {
      window.nodesViewController.render();
    }

    if (this.cliInput) this.cliInput.focus();
  }

  initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        this.switchView(targetView);
      });
    });
  }

  initShortcuts() {
    document.querySelectorAll('.shortcut-link').forEach(link => {
      link.addEventListener('click', () => {
        const cmd = link.getAttribute('data-cmd');
        if (cmd) {
          if (cmd.endsWith(' ')) {
            this.cliInput.value = cmd;
            this.cliInput.focus();
          } else {
            this.handleCommand(cmd);
          }
        }
      });
    });
  }

  initKeybindings() {
    window.addEventListener('keydown', (e) => {
      // Tab key cycles views
      if (e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = this.views.indexOf(this.activeView);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + this.views.length) % this.views.length
          : (currentIndex + 1) % this.views.length;
        this.switchView(this.views[nextIndex]);
        return;
      }

      // Esc key returns to chat
      if (e.key === 'Escape') {
        e.preventDefault();
        this.switchView('chat-view');
        return;
      }

      // Automatically focus input if typing alphanumeric character outside an input
      if (document.activeElement !== this.cliInput && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        this.cliInput.focus();
      }
    });
  }

  initInput() {
    if (!this.cliInput) return;

    this.cliInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.cliInput.value.trim();
        if (text) {
          this.cliInput.value = '';
          this.handleInput(text);
        }
      }
    });
  }

  handleInput(raw) {
    if (raw.startsWith('/')) {
      this.handleCommand(raw);
    } else {
      this.sendChatMessage(raw);
    }
  }

  handleCommand(cmdLine) {
    const parts = cmdLine.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
      case '/help':
        this.printHelp();
        break;

      case '/ip':
      case '/info':
        this.printNetworkInfo();
        break;

      case '/dm':
        if (!arg) {
          this.showToast('Usage: /dm <nickname>');
        } else {
          window.chatController.setChannel(arg);
          this.switchView('chat-view');
          this.showToast(`Switched channel to @${arg}`);
        }
        break;

      case '/public':
      case '/all':
        window.chatController.setChannel('public');
        this.switchView('chat-view');
        this.showToast('Switched to #public channel');
        break;

      case '/nick':
        if (!arg) {
          this.showToast('Usage: /nick <new_name>');
        } else {
          this.sendAction('set_nick', { nick: arg });
          this.showToast(`Nickname updated to ${arg}`);
        }
        break;

      case '/map':
        this.switchView('map-view');
        break;

      case '/nodes':
        this.switchView('nodes-view');
        break;

      case '/inspect':
        if (this.lastPacket) {
          window.inspectorController.inspectMessage(this.lastPacket);
        }
        this.switchView('inspector-view');
        break;

      case '/scenario':
        if (!arg || !['1', '2', '3'].includes(arg)) {
          this.showToast('Usage: /scenario <1|2|3>');
        } else {
          this.switchView('map-view');
          window.meshMapController.runScenario(arg);
        }
        break;

      case '/kill':
        if (!arg) {
          this.showToast('Usage: /kill <node>');
        } else {
          this.sendAction('kill_node', { nodeId: arg });
          if (window.meshMapController) {
            window.meshMapController.setNodeState(arg, false);
          }
          this.showToast(`Node ${arg} taken offline`);
        }
        break;

      case '/revive':
        if (!arg) {
          this.showToast('Usage: /revive <node>');
        } else {
          this.sendAction('revive_node', { nodeId: arg });
          if (window.meshMapController) {
            window.meshMapController.setNodeState(arg, true);
          }
          this.showToast(`Node ${arg} revived`);
        }
        break;

      case '/connect':
        if (!arg) {
          this.showToast('Usage: /connect <ip:port>');
        } else {
          this.sendAction('connect_peer', { endpoint: arg });
          this.showToast(`Connecting to manual peer ${arg}`);
        }
        break;

      case '/clear':
        if (window.chatController) {
          window.chatController.messages = [];
          window.chatController.render();
        }
        break;

      default:
        this.showToast(`Unknown command: ${cmd}. Type /help for command list.`);
    }
  }

  printNetworkInfo() {
    const lines = [
      '── NETWORK ACCESS ─────────────────────────────────────────────',
      ` Local machine: http://localhost:${window.location.port || 3000}`
    ];
    if (this.networkUrls && this.networkUrls.length > 0) {
      for (const url of this.networkUrls) {
        lines.push(` Phone/Laptop:  ${url}`);
      }
      lines.push(' ');
      lines.push(' Connect your phone or second laptop to the same');
      lines.push(' Wi-Fi or phone hotspot, and open the URL above.');
    } else {
      lines.push(' No external IP detected yet.');
      lines.push(' Connect to Wi-Fi or mobile hotspot to share with other devices.');
    }
    lines.push('───────────────────────────────────────────────────────────────');

    for (const line of lines) {
      window.chatController.addSystemMessage(line);
    }
    this.switchView('chat-view');
  }

  printHelp() {
    const helpLines = [
      '── COMMANDS ───────────────────────────────────────────────────',
      ' /dm <nick>           Open a direct message conversation',
      ' /public              Switch back to public broadcast channel',
      ' /nick <name>         Change your node nickname',
      ' /ip                  Show network URL for phone / second laptop',
      ' /map                 Switch to mesh network map view',
      ' /nodes               Switch to nodes table view',
      ' /inspect             Open packet inspector for latest packet',
      ' /scenario <1|2|3>    Run scripted demo scenario on map',
      ' /kill <node>         Take virtual node offline',
      ' /revive <node>       Bring virtual node online',
      ' /connect <ip:port>   Connect to manual peer endpoint',
      ' /clear               Clear messages in view',
      ' Tab                  Cycle through views (chat, map, nodes, inspect)',
      ' Esc                  Return to chat view',
      '───────────────────────────────────────────────────────────────'
    ];

    for (const line of helpLines) {
      window.chatController.addSystemMessage(line);
    }
    this.switchView('chat-view');
  }

  sendChatMessage(text) {
    const channel = window.chatController.currentChannel;
    if (channel === 'public') {
      this.sendAction('send_broadcast', {
        src: this.identity.id,
        srcNick: this.identity.nick,
        text
      });
    } else {
      // Direct message with peer
      this.sendAction('send_dm', {
        src: this.identity.id,
        srcNick: this.identity.nick,
        dst: channel,
        text,
        encrypt: true
      });
    }
  }

  sendAction(action, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, payload }));
    } else {
      this.showToast('Network error: local node server not connected');
    }
  }

  connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[MESHCOMM] Connected to local node server');
      this.showToast('Connected to mesh node server');
      this.updateHeader();
      this.sendAction('register_node', this.identity);

      if (!this.heartbeatTimer) {
        this.heartbeatTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendAction('heartbeat', { id: this.identity.id });
          }
        }, 3000);
      }
    };

    this.ws.onclose = () => {
      console.warn('[MESHCOMM] Disconnected from node server, retrying in 2s...');
      setTimeout(() => this.connectWs(), 2000);
    };

    this.ws.onerror = (err) => {
      console.error('[MESHCOMM] WebSocket error:', err);
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        this.handleWsEvent(type, data);
      } catch (err) {
        console.error('[MESHCOMM] Error parsing server message:', err);
      }
    };
  }

  handleWsEvent(type, data) {
    switch (type) {
      case 'init':
        if (!this.identity || !this.identity.id) {
          this.identity = data.identity;
        }
        this.peers = data.peers || [];
        this.networkUrls = data.networkUrls || [];
        this.localIps = data.localIps || [];
        this.updateHeader();

        if (window.nodesViewController) {
          window.nodesViewController.setLocalIdentity(this.identity);
          window.nodesViewController.setRealPeers(this.peers);
        }

        if (window.chatController) {
          if (Array.isArray(data.messages)) {
            data.messages.forEach(m => window.chatController.addMessage(m));
          }
          this.updatePeersStatus();
        }

        if (window.meshMapController && Array.isArray(data.offlineVirtualNodes)) {
          data.offlineVirtualNodes.forEach(nodeId => {
            window.meshMapController.setNodeState(nodeId, false);
          });
        }
        break;

      case 'identity:update':
        if (data.id === this.identity.id) {
          this.identity = data;
          this.updateHeader();
          if (window.nodesViewController) {
            window.nodesViewController.setLocalIdentity(this.identity);
          }
        }
        break;

      case 'message:new':
        this.lastPacket = data.packet || data;
        if (window.chatController) {
          window.chatController.addMessage(data);
        }
        if (window.inspectorController) {
          window.inspectorController.inspectMessage(data);
        }

        // Animate live real packet link on the map!
        if (window.meshMapController && (data.type === 'broadcast' || data.type === 'dm')) {
          window.meshMapController.animateLiveMessage(data.packet || data);
        }
        break;

      case 'message:delivered':
        if (window.chatController) {
          window.chatController.markDelivered(data.refMsgId || data.msgId, data.deliveredTo);
        }
        break;

      case 'peer:list':
        this.peers = data || [];
        this.updateHeader();
        if (window.nodesViewController) {
          window.nodesViewController.setRealPeers(this.peers);
        }
        this.updatePeersStatus();
        break;

      case 'peer:joined':
        this.showToast(`Peer discovered: ${data.nick}#${data.id}`);
        if (window.chatController) {
          window.chatController.addSystemMessage(`${data.nick}#${data.id} joined the mesh`);
        }
        break;

      case 'peer:left':
        this.showToast(`Peer offline: ${data.nick}#${data.id}`);
        if (window.chatController) {
          window.chatController.addSystemMessage(`link to ${data.nick}#${data.id} lost`);
        }
        break;

      case 'packet:inspector':
        this.lastPacket = data;
        if (window.inspectorController) {
          window.inspectorController.inspectMessage(data);
        }
        break;

      case 'duplicate:dropped':
        if (window.chatController) {
          // System notify or ignore
        }
        break;

      case 'node:state_change':
        if (window.meshMapController) {
          window.meshMapController.setNodeState(data.nodeId, data.status === 'online');
        }
        if (window.nodesViewController) {
          window.nodesViewController.render();
        }
        break;

      case 'scenario:start':
        if (window.meshMapController) {
          window.meshMapController.runScenario(data.scenarioId);
        }
        break;

      default:
        console.log('[MESHCOMM] Unhandled server event:', type, data);
    }
  }

  updateHeader() {
    if (this.identity && this.identityBadge) {
      this.identityBadge.textContent = `you: ${this.identity.nick}#${this.identity.id}`;
    }
    const onlinePeersCount = this.peers.filter(p => p.status !== 'offline').length;
    if (this.peersCountBadge) {
      this.peersCountBadge.textContent = `peers: ${onlinePeersCount}`;
    }
  }

  updatePeersStatus() {
    const onlineCount = this.peers.filter(p => p.status !== 'offline').length;
    const statusText = `${onlineCount} peer${onlineCount === 1 ? '' : 's'} online`;
    if (window.chatController && window.chatController.peersStatus) {
      window.chatController.peersStatus.textContent = statusText;
    }
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new MeshApp();
});
