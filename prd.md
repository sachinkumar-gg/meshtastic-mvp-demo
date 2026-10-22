# PRD: Mesh Comms Prototype

A decentralised, network-free communications prototype in the spirit of Meshtastic and Bitchat.

- **Status:** Prototype for demo
- **Presentation date:** 2026-10-23
- **Owner:** Sachin
- **Related doc:** `design.md` (visual and interaction design)

---

## 1. Summary

We are building a high-fidelity prototype of a device-style messaging app that works with **no internet and no central server**. Two real devices talk to each other directly over a local Wi-Fi link (no internet uplink). A frontend simulation layer shows how the same protocol behaves as a full multi-hop mesh with many nodes.

We do not have LoRa modules. The architecture treats the radio as a swappable transport: Wi-Fi today, BLE or LoRa in production.

## 2. Problem

When cellular towers and the internet go down (disasters, remote areas, protests, festivals, outages), people lose the ability to communicate. Existing mesh tools such as Meshtastic and Bitchat solve this, but they need specific hardware or are hard to explain at a glance. We want a prototype that makes the idea understandable in minutes.

## 3. Goals

1. Show two physical devices exchanging messages with the internet disabled and no cloud server involved.
2. Show a Bitchat-style terminal UI that feels like a purpose-built comms device.
3. Show mesh behavior (multi-hop, TTL, rerouting, node failure) through a visualization layer.
4. Make the transport swap story clear: Wi-Fi now, LoRa/BLE later, protocol unchanged.

## 4. Non-goals

- Real multi-hop routing across physical devices.
- Real LoRa or Bluetooth radio support.
- Production-grade security, key management, or battery behavior.
- Accounts, cloud sync, or any internet dependency.
- Native mobile apps.

## 5. Users and demo audience

- **Primary audience:** judges and classmates evaluating the prototype.
- **Persona (story):** someone in a connectivity blackout who needs to message nearby people without infrastructure.

## 6. Scope: real vs simulated

| Capability | Real or simulated |
|---|---|
| Message exchange between two devices over local Wi-Fi | **Real** |
| Peer discovery and node identity | **Real** |
| Broadcast channel and direct messages | **Real** |
| Mesh map with extra virtual nodes | Simulated (frontend) |
| Multi-hop animation, TTL, duplicate suppression | Simulated (frontend) |
| Node failure and rerouting | Simulated (frontend) |
| Signal strength, battery, last seen | Simulated, tied to real events where possible |
| Packet inspector | Real fields for real messages, scripted for simulated ones |

The UI includes a clear **LIVE / SIM** indicator so the audience always knows which mode they are looking at.

## 7. Functional requirements

### 7.1 Node identity
- **FR-1:** On first launch, each node generates a short ID and a display nickname (user editable).
- **FR-2:** The identity is shown in the header and the node list.

### 7.2 Discovery
- **FR-3:** Nodes on the same local network discover each other automatically (UDP broadcast or mDNS).
- **FR-4:** The peer list updates live as nodes appear and disappear.
- **FR-5:** Peers show last-seen time and a signal indicator.

### 7.3 Messaging
- **FR-6:** Users can send messages to a public broadcast channel visible to all peers.
- **FR-7:** Users can send direct messages to one peer.
- **FR-8:** Messages carry a header: source ID, destination, message ID, timestamp, TTL.
- **FR-9:** Delivery status per message: sent, delivered.
- **FR-10 (should):** Direct messages are end-to-end encrypted, with a lock indicator in the UI.

### 7.4 Mesh visualization (simulated)
- **FR-11:** A mesh map screen shows the two real nodes plus 6 to 10 virtual nodes with range rings and links.
- **FR-12:** Sending a message can trigger an animated packet path across multiple hops with a visible hop counter and TTL decrement.
- **FR-13:** Duplicate suppression is shown ("already seen, dropped").
- **FR-14:** Clicking a node toggles it offline, and the path reroutes around it.
- **FR-15:** Scripted demo scenarios: broadcast flood, multi-hop direct message, node failure and reroute.
- **FR-16:** When a real message is sent between the two devices, a matching animation plays on the map.

### 7.5 Packet inspector
- **FR-17:** A panel shows header fields for a selected message: src, dst, msgID, TTL, hop path, transport.

### 7.6 Status and transport
- **FR-18:** A status bar shows: internet state ("NO INTERNET"), nodes in range, transport badge (WIFI, with BLE and LORA shown as pluggable), and LIVE/SIM mode.

## 8. Non-functional requirements

- **NFR-1 Offline:** The app must work with no internet. All assets are bundled locally, no CDN dependencies.
- **NFR-2 Reliability on demo day:** Simulation scenarios are deterministic and scripted so they never fail on stage.
- **NFR-3 Latency:** Real messages between devices appear in under 500 ms on a local network.
- **NFR-4 Portability:** Runs on Windows, macOS, and Linux laptops, and is viewable from a phone browser on the same network.
- **NFR-5 Setup time:** From clone to running in under 5 minutes on a fresh machine.

## 9. Architecture

```
[ Browser UI @ localhost ]  <--WebSocket-->  [ Local node server ]
                                                  |
                                       [ Transport interface ]
                                          |        |        |
                                        WiFi      BLE     LoRa
                                       (done)   (future) (future)
                                                  |
                                          [ Other node(s) ]
```

- **Node server:** Node.js or Python. Handles identity, discovery, message passing, and a WebSocket feed to the UI.
- **Transport interface:** a thin abstraction (`send`, `onReceive`, `peers`). Only the Wi-Fi implementation is built.
- **Frontend:** browser UI served by the node server. Includes the simulation engine for the mesh map.
- **Discovery:** UDP broadcast or mDNS on the local network.

## 10. Demo setup

- Two laptops (or laptop and phone) on a phone hotspot or router with internet uplink disabled.
- Each runs the app; each opens `localhost` in a browser.
- **Fallback 1:** two tabs or two server processes on one laptop.
- **Fallback 2:** a pre-recorded screen capture of the full demo.

## 11. Demo script (3 to 4 minutes)

1. Show both devices with internet off. Status bar reads NO INTERNET.
2. Nodes auto-discover each other. Peer list populates.
3. Send a broadcast from device A. It appears on device B.
4. Send an encrypted direct message. Show the lock and the packet inspector.
5. Switch to the mesh map. Explain that this simulates the same protocol at scale.
6. Run the scenario: message crosses several hops, kill a node, route heals.
7. Close on the architecture slide: swap Wi-Fi for LoRa and nothing else changes.

**Honest framing line:** "The two-device link is live. The mesh behavior is a simulation of the same protocol. Only the radio layer changes when we move to LoRa hardware."

## 12. Milestones (build order)

1. **M1 Real link:** node server, discovery, broadcast message between two devices.
2. **M2 UI shell:** terminal-style chat view, header, status bar (see `design.md`).
3. **M3 DMs and inspector:** direct messages, delivery status, packet inspector, optional encryption.
4. **M4 Mesh map:** virtual nodes, animated hops, TTL and duplicate suppression visuals.
5. **M5 Scenarios:** scripted demos, node kill and reroute, LIVE/SIM toggle.
6. **M6 Polish and rehearsal:** fallback tested, demo run twice end to end.

If time runs short, cut in this order: encryption, node failure animation, extra virtual nodes. Never cut the real two-device link.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi blocks device-to-device traffic (client isolation) | Use own phone hotspot or router; keep localhost fallback |
| Discovery fails across devices | Allow manual peer IP entry as backup |
| Judges think the mesh is faked | LIVE/SIM indicator and the honest framing line |
| Time shortage | Milestone cut order above; scripted scenarios keep the simulation cheap |

## 14. Success criteria

- Two devices exchange messages with internet disabled.
- The mesh map demo runs cleanly without manual intervention.
- Audience can explain afterward what is real, what is simulated, and how LoRa would replace the transport.

## 15. Future work

- Real BLE and LoRa transports behind the same interface.
- True multi-hop routing across physical nodes.
- Store-and-forward for offline nodes.
- Stronger encryption, channel passwords, and location sharing.
