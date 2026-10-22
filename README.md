# MESHCOMM: Decentralized Comms Prototype

A high-fidelity, network-free communications prototype in the spirit of Meshtastic and Bitchat. 

Built with a **Gruvbox ASCII terminal UI** that feels like firmware on a purpose-built comms device, functioning completely offline with **no internet uplink and no central server**.

---

## 1. Features

- **Real Wi-Fi Device-to-Device Link**: Peer discovery and message passing over UDP broadcast / unicast (`802.11` ad-hoc or local Wi-Fi without internet).
- **Zero Internet Dependency**: All assets bundled locally, zero CDN dependencies.
- **End-to-End Encryption**: Direct messages encrypted with ECDH key exchange + AES-256-GCM, indicated with an `[enc]` badge and delivery receipts `[✓ delivered]`.
- **Swappable Radio Architecture**: Transport abstraction layer with active `wifi` and pluggable stubs for `ble` (Bluetooth Low Energy) and `lora` (Semtech SX1262).
- **Interactive Mesh Map (Simulation Engine)**:
  - Real-time ASCII network graph showing real nodes (`sachin`, `rohan`) and virtual nodes (`n1`..`n8`).
  - Animated packet propagation (`━━▶`) with visible hop counter (`h1`, `h2`) and TTL decrement (`ttl: 7 → 6`).
  - Duplicate suppression visualization (`x dup`).
  - Interactive node failure (`/kill <node>` or clicking node) with dynamic rerouting around dead nodes.
- **Live / Sim Mode Indicator**: Clear honest framing (`[LIVE]` for real links, `[SIM]` for simulation scenarios).
- **Packet Inspector**: Deep inspection of raw packet headers (`src`, `dst`, `msgId`, `ttl`, `hops`, `transport`, `enc`, `payload`, `status`).

---

## 2. Quick Start

### Single Machine Dual-Node Demo (Fallback 1)

Open two terminal tabs on your machine:

**Terminal 1 (Node 1 - Sachin):**
```bash
npm run node1
# Opens Web UI at http://localhost:3000
```

**Terminal 2 (Node 2 - Rohan):**
```bash
npm run node2
# Opens Web UI at http://localhost:3001
```

Now open:
- `http://localhost:3000` in Browser Window 1
- `http://localhost:3001` in Browser Window 2

Both nodes will automatically discover each other over UDP and populate their peer lists!

---

### Two Physical Laptops / Phones on Same Hotspot

On Machine A:
```bash
npm start
# Listens on port 3000, UDP 41234
```

On Machine B:
```bash
npm start
# Auto-discovers Machine A on the local subnet via UDP broadcast
```

If venue Wi-Fi has client isolation enabled, you can connect your laptops to a phone hotspot (with mobile data turned off) or manually connect via `/connect <ip>:41234`.

---

## 3. Demo Walkthrough Script (3 to 4 minutes)

1. **Blackout Setup**: Show both devices connected to local Wi-Fi with internet turned off. Status bar reads `NO INTERNET`.
2. **Auto-Discovery**: Within 1-2 seconds, nodes discover each other. The peer counter updates to `peers: 1` and system prints `* rohan#7c21 joined the mesh`.
3. **Broadcast Message**: Type `anyone near the east gate?` on Device A. It appears instantly on Device B.
4. **Encrypted Direct Message**: Type `/dm rohan` then `meet at 5`. Show the `[enc]` badge and delivery status updating to `[✓ delivered]`.
5. **Inspect the Packet**: Open the `[inspect]` tab to show the cryptographic headers, TTL decrement, and transport badge.
6. **Switch to Mesh Map**: Switch to the `[map]` tab. Explain that this simulates the same protocol running across an entire multi-hop mesh.
7. **Run Scenarios**:
   - `[1 flood]`: Broadcast spreading across nodes, dropping redundant duplicates (`x dup`).
   - `[2 multi-hop dm]`: Packet hopping from node to node with TTL decrement.
   - `[3 kill node]`: Node fails (`FAILED`), active path breaks, route automatically heals and reroutes around the failure.
8. **Transport Swap Pitch**: *"The two-device link is live. The mesh behavior is a simulation of the same protocol. Only the radio layer changes when we move to LoRa hardware."*

---

## 4. Commands Reference

| Command | Action |
|---|---|
| `/dm <nick>` | Switch to direct message channel with `<nick>` |
| `/public` | Switch back to public broadcast channel |
| `/nick <name>` | Change your display nickname |
| `/map` | Switch to ASCII mesh network map view |
| `/nodes` | Switch to nodes signal/battery table view |
| `/inspect` | Open packet inspector for selected/last packet |
| `/scenario <1-3>` | Trigger scripted simulation scenario |
| `/kill <node>` | Take a virtual node offline |
| `/revive <node>` | Bring a virtual node back online |
| `/connect <ip:port>` | Connect to a manual peer endpoint |
| `/clear` | Clear message buffer |
| `/help` | Print help and command list |

**Keyboard navigation:**
- `Tab`: Cycle views (`chat` → `map` → `nodes` → `inspect` → `chat`)
- `Esc`: Instantly return to `chat` view
- `Enter`: Send message

---

## 5. Automated Tests

Run the test suites:
```bash
# Protocol & Transport Unit / Integration Tests
npm test

# Full End-to-End WebSocket & Dual-Node Integration Tests
npm run test:e2e
```
