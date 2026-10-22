/**
 * MeshTopology: Graph structure and simulation scenarios for the mesh map.
 * Defines virtual nodes, adjacency, pathfinding, and deterministic scenario scripts.
 */

class MeshTopology {
  constructor() {
    this.virtualNodes = [
      { id: 'n1', nick: 'n1', hops: 1, battery: 82, signal: 3, status: 'online' },
      { id: 'n2', nick: 'n2', hops: 1, battery: 74, signal: 4, status: 'online' },
      { id: 'n3', nick: 'n3', hops: 2, battery: 60, signal: 2, status: 'online' },
      { id: 'n4', nick: 'ghost-4', hops: 2, battery: 41, signal: 2, status: 'online' },
      { id: 'n5', nick: 'n5', hops: 2, battery: 89, signal: 3, status: 'online' },
      { id: 'n6', nick: 'n6', hops: 2, battery: 52, signal: 3, status: 'online' },
      { id: 'n7', nick: 'n7', hops: 3, battery: 67, signal: 2, status: 'online' },
      { id: 'n8', nick: 'n8', hops: 3, battery: 91, signal: 3, status: 'online' }
    ];

    // Node layout positions in a monospace character grid
    // Grid: columns ~ 60, rows ~ 14
    this.nodePositions = {
      'sachin': { x: 18, y: 5, label: 'sachin', isReal: true },
      'rohan':  { x: 38, y: 7, label: 'rohan',  isReal: true },
      'n1':     { x: 6,  y: 5, label: 'n1',     isReal: false },
      'n2':     { x: 22, y: 8, label: 'n2',     isReal: false },
      'n3':     { x: 38, y: 11, label: 'n3',    isReal: false },
      'n4':     { x: 20, y: 1, label: 'n4',     isReal: false },
      'n5':     { x: 36, y: 1, label: 'n5',     isReal: false },
      'n6':     { x: 42, y: 4, label: 'n6',     isReal: false },
      'n7':     { x: 52, y: 7, label: 'n7',     isReal: false },
      'n8':     { x: 50, y: 11, label: 'n8',    isReal: false }
    };

    // Default graph edges (bidirectional)
    this.edges = [
      ['n1', 'sachin'],
      ['sachin', 'n4'],
      ['sachin', 'n2'],
      ['sachin', 'n6'], // direct link option or alternate
      ['n4', 'n5'],
      ['n5', 'n6'],
      ['n2', 'rohan'],
      ['n6', 'rohan'],
      ['rohan', 'n3'],
      ['rohan', 'n7'],
      ['n3', 'n8'],
      ['n7', 'n8']
    ];

    this.offlineNodes = new Set();
  }

  isOnline(nodeId) {
    return !this.offlineNodes.has(nodeId);
  }

  killNode(nodeId) {
    this.offlineNodes.add(nodeId);
    return !this.isOnline(nodeId);
  }

  reviveNode(nodeId) {
    this.offlineNodes.delete(nodeId);
    return this.isOnline(nodeId);
  }

  toggleNode(nodeId) {
    if (this.offlineNodes.has(nodeId)) {
      this.offlineNodes.delete(nodeId);
      return 'online';
    } else {
      this.offlineNodes.add(nodeId);
      return 'offline';
    }
  }

  getAdjacencyList() {
    const adj = {};
    for (const id of Object.keys(this.nodePositions)) {
      adj[id] = [];
    }

    for (const [u, v] of this.edges) {
      if (this.isOnline(u) && this.isOnline(v)) {
        adj[u].push(v);
        adj[v].push(u);
      }
    }
    return adj;
  }

  findShortestPath(startNode, endNode) {
    if (!this.isOnline(startNode) || !this.isOnline(endNode)) return null;
    const adj = this.getAdjacencyList();
    const queue = [[startNode]];
    const visited = new Set([startNode]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === endNode) {
        return path;
      }

      for (const neighbor of (adj[current] || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
    return null; // No route available
  }
}

module.exports = new MeshTopology();
