/**
 * meshMap.js: Mesh Map View Controller & Simulation Engine
 * Renders ASCII monospace network graph, link lines, multi-hop packet animations,
 * duplicate suppression drops, node failure & dynamic rerouting.
 */

class MeshMapController {
  constructor() {
    this.canvas = document.getElementById('mesh-ascii-canvas');
    this.modeIndicator = document.getElementById('map-mode-indicator');
    this.ttlCounter = document.getElementById('map-ttl-counter');

    this.nodes = {
      'sachin': { label: 'sachin', isReal: true, online: true, tag: '' },
      'rohan':  { label: 'rohan',  isReal: true, online: true, tag: '' },
      'n1':     { label: 'n1',     isReal: false, online: true, tag: '' },
      'n2':     { label: 'n2',     isReal: false, online: true, tag: '' },
      'n3':     { label: 'n3',     isReal: false, online: true, tag: '' },
      'n4':     { label: 'n4',     isReal: false, online: true, tag: '' },
      'n5':     { label: 'n5',     isReal: false, online: true, tag: '' },
      'n6':     { label: 'n6',     isReal: false, online: true, tag: '' },
      'n7':     { label: 'n7',     isReal: false, online: true, tag: '' },
      'n8':     { label: 'n8',     isReal: false, online: true, tag: '' }
    };

    this.activeLinks = new Map(); // "u-v" -> style ('normal', 'packet', 'severed')
    this.animating = false;
    this.scenarioTimer = null;

    this.setupListeners();
    this.render();
  }

  setupListeners() {
    // Scenario buttons
    document.querySelectorAll('.scenario-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const scenario = e.target.getAttribute('data-scenario');
        this.runScenario(scenario);
      });
    });

    // Make canvas click-interactive for toggling nodes
    if (this.canvas) {
      this.canvas.addEventListener('click', (e) => {
        const targetNode = e.target.getAttribute('data-node-id');
        if (targetNode) {
          this.toggleNode(targetNode);
        }
      });
    }
  }

  setNodeState(nodeId, online) {
    if (this.nodes[nodeId]) {
      this.nodes[nodeId].online = Boolean(online);
      this.render();
    }
  }

  toggleNode(nodeId) {
    if (this.nodes[nodeId]) {
      this.nodes[nodeId].online = !this.nodes[nodeId].online;
      if (window.app) {
        window.app.sendAction('toggle_node', { nodeId });
      }
      this.render();
      if (window.nodesViewController) {
        window.nodesViewController.render();
      }
    }
  }

  setMode(mode) {
    if (this.modeIndicator) {
      if (mode === 'LIVE') {
        this.modeIndicator.className = 'tag-live';
        this.modeIndicator.textContent = '[LIVE]';
      } else {
        this.modeIndicator.className = 'tag-sim';
        this.modeIndicator.textContent = '[SIM]';
      }
    }
  }

  resetState() {
    if (this.scenarioTimer) clearTimeout(this.scenarioTimer);
    this.animating = false;
    for (const id of Object.keys(this.nodes)) {
      this.nodes[id].online = true;
      this.nodes[id].tag = '';
    }
    this.activeLinks.clear();
    this.setMode('SIM');
    if (this.ttlCounter) this.ttlCounter.textContent = '7';
    this.render();
  }

  // Animate a live real message transmitted between sachin and rohan
  animateLiveMessage(packet) {
    this.setMode('LIVE');
    const isSachin = (packet.srcNick || '').toLowerCase().includes('sachin') || packet.src === 'a3f9';
    const from = isSachin ? 'sachin' : 'rohan';
    const to = isSachin ? 'rohan' : 'sachin';

    this.nodes[from].tag = 'h0 tx';
    this.activeLinks.set(`${from}-${to}`, 'packet');
    this.render();

    setTimeout(() => {
      this.nodes[to].tag = 'rx ✓';
      this.render();
      setTimeout(() => {
        this.nodes[from].tag = '';
        this.nodes[to].tag = '';
        this.activeLinks.delete(`${from}-${to}`);
        this.setMode('LIVE');
        this.render();
      }, 1500);
    }, 600);
  }

  async runScenario(scenarioId) {
    if (this.scenarioTimer) clearTimeout(this.scenarioTimer);
    this.resetState();
    this.setMode('SIM');

    // Highlight active button
    document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.scenario-btn[data-scenario="${scenarioId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (scenarioId === 'reset') {
      return;
    }

    if (scenarioId === '1') {
      await this.runScenario1Flood();
    } else if (scenarioId === '2') {
      await this.runScenario2MultiHop();
    } else if (scenarioId === '3') {
      await this.runScenario3KillAndReroute();
    }
  }

  // Helper sleep
  _sleep(ms) {
    return new Promise(resolve => {
      this.scenarioTimer = setTimeout(resolve, ms);
    });
  }

  // SCENARIO 1: Broadcast Flood with Duplicate Suppression
  async runScenario1Flood() {
    this.ttlCounter.textContent = '7';
    this.nodes['sachin'].tag = 'h0 tx';
    this.render();
    await this._sleep(500);

    // Hop 1: Fans out to n1, n4, n2
    this.ttlCounter.textContent = '6';
    this.activeLinks.set('sachin-n1', 'packet');
    this.activeLinks.set('sachin-n4', 'packet');
    this.activeLinks.set('sachin-n2', 'packet');
    this.nodes['n1'].tag = 'h1';
    this.nodes['n4'].tag = 'h1';
    this.nodes['n2'].tag = 'h1';
    this.render();
    await this._sleep(600);

    // Hop 2: Fans out to n5, rohan, while n6 gets reached
    this.ttlCounter.textContent = '5';
    this.activeLinks.delete('sachin-n1');
    this.activeLinks.set('n4-n5', 'packet');
    this.activeLinks.set('n2-rohan', 'packet');
    this.nodes['n5'].tag = 'h2';
    this.nodes['rohan'].tag = 'h2 rx';
    this.render();
    await this._sleep(600);

    // Hop 3: Reaches n6 from n5, while sachin-n6 gets duplicate drop
    this.ttlCounter.textContent = '4';
    this.activeLinks.delete('n4-n5');
    this.activeLinks.delete('n2-rohan');
    this.activeLinks.set('n5-n6', 'packet');
    this.nodes['n6'].tag = 'h3';
    // Duplicate dropped on secondary path
    this.nodes['n6'].tag += ' x dup';
    this.render();
    await this._sleep(1000);

    // Fade tags
    this.activeLinks.clear();
    await this._sleep(500);
    this.nodes['n6'].tag = 'h3';
    this.render();
  }

  // SCENARIO 2: Deterministic Multi-hop Direct Message (sachin -> n4 -> n5 -> n6 -> rohan)
  async runScenario2MultiHop() {
    this.ttlCounter.textContent = '7';
    this.nodes['sachin'].tag = 'h0 tx';
    this.render();
    await this._sleep(500);

    // Step 1: sachin -> n4
    this.ttlCounter.textContent = '6';
    this.activeLinks.set('sachin-n4', 'packet');
    this.nodes['n4'].tag = 'h1 ttl6';
    this.render();
    await this._sleep(600);

    // Step 2: n4 -> n5
    this.ttlCounter.textContent = '5';
    this.activeLinks.delete('sachin-n4');
    this.activeLinks.set('n4-n5', 'packet');
    this.nodes['n5'].tag = 'h2 ttl5';
    this.render();
    await this._sleep(600);

    // Step 3: n5 -> n6
    this.ttlCounter.textContent = '4';
    this.activeLinks.delete('n4-n5');
    this.activeLinks.set('n5-n6', 'packet');
    this.nodes['n6'].tag = 'h3 ttl4';
    this.render();
    await this._sleep(600);

    // Step 4: n6 -> rohan
    this.ttlCounter.textContent = '3';
    this.activeLinks.delete('n5-n6');
    this.activeLinks.set('n6-rohan', 'packet');
    this.nodes['rohan'].tag = 'h4 rx ✓';
    this.render();
    await this._sleep(800);

    this.activeLinks.clear();
    this.render();
  }

  // SCENARIO 3: Node Failure & Dynamic Rerouting
  async runScenario3KillAndReroute() {
    // 1. Initial attempt uses n2
    this.ttlCounter.textContent = '7';
    this.nodes['sachin'].tag = 'h0 tx';
    this.activeLinks.set('sachin-n2', 'packet');
    this.nodes['n2'].tag = 'h1';
    this.render();
    await this._sleep(600);

    // 2. n2 is killed! Fails!
    this.nodes['n2'].online = false;
    this.nodes['n2'].tag = 'FAILED';
    this.activeLinks.delete('sachin-n2');
    this.activeLinks.set('n2-rohan', 'severed');
    this.render();
    await this._sleep(800);

    // 3. Dynamic reroute around dead node n2 via n4 -> n5 -> n6 -> rohan
    if (window.chatController) {
      window.chatController.addSystemMessage('link to n2 lost. dynamic reroute via [n4, n5, n6]');
    }

    this.activeLinks.delete('n2-rohan');
    this.ttlCounter.textContent = '6';
    this.activeLinks.set('sachin-n4', 'packet');
    this.nodes['n4'].tag = 'reroute h1';
    this.render();
    await this._sleep(600);

    this.ttlCounter.textContent = '5';
    this.activeLinks.delete('sachin-n4');
    this.activeLinks.set('n4-n5', 'packet');
    this.nodes['n5'].tag = 'h2';
    this.render();
    await this._sleep(600);

    this.ttlCounter.textContent = '4';
    this.activeLinks.delete('n4-n5');
    this.activeLinks.set('n5-n6', 'packet');
    this.nodes['n6'].tag = 'h3';
    this.render();
    await this._sleep(600);

    this.ttlCounter.textContent = '3';
    this.activeLinks.delete('n5-n6');
    this.activeLinks.set('n6-rohan', 'packet');
    this.nodes['rohan'].tag = 'healed rx ✓';
    this.render();
    await this._sleep(800);

    this.activeLinks.clear();
    this.render();
  }

  // Helper formatting for a node label in ASCII
  _renderNodeSpan(id) {
    const node = this.nodes[id];
    if (!node) return `(${id})`;

    const isOnline = node.online;
    const tag = node.tag ? ` <span style="color: ${node.tag.includes('dup') || node.tag.includes('FAILED') ? 'var(--red)' : 'var(--orange)'}">${node.tag}</span>` : '';

    if (!isOnline) {
      return `<span data-node-id="${id}" style="color: var(--red); font-weight: bold; cursor: pointer;">(○ ${node.label})</span>${tag}`;
    }

    if (node.isReal) {
      const color = id === 'sachin' ? 'var(--green)' : 'var(--blue)';
      return `<span data-node-id="${id}" style="color: ${color}; font-weight: bold; cursor: pointer;">(● ${node.label})</span>${tag}`;
    }

    return `<span data-node-id="${id}" style="color: var(--fg-dim); cursor: pointer;">(${node.label})</span>${tag}`;
  }

  // Helper formatting for links
  _renderLink(u, v, symbol = '·······') {
    const key1 = `${u}-${v}`;
    const key2 = `${v}-${u}`;
    const linkState = this.activeLinks.get(key1) || this.activeLinks.get(key2);

    // If either node is offline, link is broken
    if (!this.nodes[u].online || !this.nodes[v].online) {
      return `<span style="color: #32302f;">       </span>`;
    }

    if (linkState === 'packet') {
      return `<span style="color: var(--yellow); font-weight: bold;">━━▶━━▶━</span>`;
    } else if (linkState === 'severed') {
      return `<span style="color: var(--red); font-weight: bold;">━╳╳╳╳━</span>`;
    }

    return `<span style="color: var(--border);">${symbol}</span>`;
  }

  _renderSlashLink(u, v, symbol = '·') {
    const key1 = `${u}-${v}`;
    const key2 = `${v}-${u}`;
    const linkState = this.activeLinks.get(key1) || this.activeLinks.get(key2);

    if (!this.nodes[u].online || !this.nodes[v].online) {
      return ` `;
    }
    if (linkState === 'packet') {
      return `<span style="color: var(--yellow); font-weight: bold;">▶</span>`;
    }
    return `<span style="color: var(--border);">${symbol}</span>`;
  }

  render() {
    if (!this.canvas) return;

    // Build the ASCII grid layout
    const L_n4_n5 = this._renderLink('n4', 'n5', '············');
    const L_n1_sachin = this._renderLink('n1', 'sachin', '····');
    const L_sachin_n6 = this._renderLink('sachin', 'n6', '··············');
    const L_n2_rohan = this._renderLink('n2', 'rohan', '···');
    const L_rohan_n7 = this._renderLink('rohan', 'n7', '·······');
    const L_n3_n8 = this._renderLink('n3', 'n8', '·······');

    const s_n4_vert = this._renderSlashLink('sachin', 'n4', '·');
    const s_n5_vert = this._renderSlashLink('n5', 'n6', '·');
    const s_sachin_n2 = this._renderSlashLink('sachin', 'n2', '·');
    const s_sachin_rohan = this._renderSlashLink('sachin', 'rohan', '╲');
    const s_rohan_n6 = this._renderSlashLink('rohan', 'n6', '·');
    const s_rohan_n3 = this._renderSlashLink('rohan', 'n3', '·');

    const lines = [
      `             ${this._renderNodeSpan('n4')}${L_n4_n5}${this._renderNodeSpan('n5')}`,
      `            ${s_n4_vert}                  ${s_n5_vert}`,
      `           ${s_n4_vert}                    ${s_n5_vert}`,
      `   ${this._renderNodeSpan('n1')}${L_n1_sachin}${this._renderNodeSpan('sachin')}${L_sachin_n6}${this._renderNodeSpan('n6')}`,
      `            ${s_sachin_n2}    ${s_sachin_rohan}                ${s_rohan_n6}`,
      `             ${s_sachin_n2}     ${s_sachin_rohan}              ${s_rohan_n6}`,
      `              ${this._renderNodeSpan('n2')}${L_n2_rohan}${this._renderNodeSpan('rohan')}${L_rohan_n7}${this._renderNodeSpan('n7')}`,
      `                         ${s_rohan_n3}          ·`,
      `                        ${this._renderNodeSpan('n3')}${L_n3_n8}${this._renderNodeSpan('n8')}`
    ];

    this.canvas.innerHTML = lines.join('\n');
  }
}

window.meshMapController = new MeshMapController();
