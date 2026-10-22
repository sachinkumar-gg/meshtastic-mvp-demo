# Design: Mesh Comms Prototype

Bitchat-style terminal UI, rendered in ASCII and Gruvbox colors. The interface should feel like firmware on a purpose-built comms device, not a web app.

Related doc: `PRD.md`

---

## 1. Design concept

The whole UI is monospace text. Structure comes from box-drawing characters, brackets, and prefixes instead of cards, shadows, and rounded corners. Every element looks like it could be printed on a tiny device screen. The one memorable element is the **mesh map**, drawn in ASCII, with packets animating along links one character at a time.

Principles:
1. **Text is the interface.** No icons, no images, no gradients. Status is shown with glyphs and words.
2. **One grid.** Everything snaps to a fixed character grid, so the layout reads like a terminal.
3. **Color means something.** Each Gruvbox accent has one job (see section 3), so the palette carries information.
4. **Honesty is visible.** A LIVE/SIM tag is always on screen.
5. **Quiet by default.** Motion only happens when a packet moves or a node changes state.

## 2. Typography

- **Typeface:** a single monospace family, used everywhere. Suggested: `JetBrains Mono`, with fallbacks `Fira Code`, `IBM Plex Mono`, `ui-monospace`, `Consolas`, `monospace`. Bundle the font locally so it works offline.
- **Size:** 14px base on desktop, 13px on phones. Line height 1.4.
- **Weights:** regular for body, bold for nicknames and active tabs. No italics.
- **Case:** sentence case for messages and labels. Do not use all caps except for fixed status tokens like `LIVE`, `SIM`, `NO INTERNET`.
- **Line length:** message text wraps at 80 columns maximum.

## 3. Color: Gruvbox (dark)

| Token | Hex | Use |
|---|---|---|
| `bg` | `#282828` | Screen background |
| `bg-alt` | `#3c3836` | Selected row, input bar, inspector panel |
| `border` | `#504945` | Box-drawing lines, dividers |
| `fg` | `#ebdbb2` | Primary text |
| `fg-dim` | `#a89984` | Timestamps, secondary labels, offline nodes |
| `green` | `#b8bb26` | Your own messages, online, delivered, LIVE |
| `yellow` | `#fabd2f` | Warnings, SIM tag, active hop, selected tab |
| `orange` | `#fe8019` | Hop badges, TTL values |
| `red` | `#fb4934` | Offline, failed, dropped duplicate |
| `blue` | `#83a598` | Other peers' nicknames, links |
| `aqua` | `#8ec07c` | Encrypted indicator, transport badge |
| `purple` | `#d3869b` | Broadcast/system messages |

Nickname colors: each peer gets a stable color from `blue`, `aqua`, `purple`, `orange`, `yellow`, derived from the node ID, so people are easy to tell apart. Your own nickname is always `green`.

Contrast: `fg` on `bg` is about 11:1. Keep `fg-dim` for non-essential text only.

## 4. Layout

Three views, switched by a tab row. All share the same header and status bar.

### 4.1 Frame

```
┌─[ MESHCOMM ]──────────────────────────────────────────────┐
│ you: sachin#a3f9      [LIVE]   wifi   peers: 2   NO INTERNET│
├────────────────────────────────────────────────────────────┤
│ [chat]  map   nodes   inspect                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                      (active view)                         │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ > _                                                        │
└────────────────────────────────────────────────────────────┘
```

- Header: app name, your identity, mode tag, transport, peer count, internet state.
- Tab row: the active tab is bold, `yellow`, wrapped in brackets.
- Input bar: always visible at the bottom, prefixed with `>`. Enter sends.
- Alignment: left aligned throughout. Status values right aligned in the header.

### 4.2 Chat view

```
 #public                                      2 peers online
 ────────────────────────────────────────────────────────────
 [14:02] * sachin#a3f9 joined the mesh
 [14:02] * rohan#7c21 joined the mesh
 [14:03] <rohan#7c21> anyone near the east gate?           [h1]
 [14:03] <sachin#a3f9> yes, heading there now      [✓ delivered]
 [14:04] <rohan#7c21> 🔒 meet at 5                          [h1]
 ────────────────────────────────────────────────────────────
 /dm rohan  /map  /nodes  /help
```

Conventions:
- `[hh:mm]` timestamp in `fg-dim`.
- `<nick#id>` in the peer's color (yours in `green`).
- System lines start with `*` in `purple`.
- Hop badge `[h1]`, `[h2]` in `orange` at the right edge. `[h0]` means direct neighbor.
- Delivery state on your own messages: `[sent]` in `fg-dim`, `[✓ delivered]` in `green`.
- Encrypted DMs show the `🔒` mark replaced by the plain-text token `[enc]` in `aqua`, to stay within ASCII.
- Direct message tabs use the format `@rohan` instead of `#public`.

### 4.3 Mesh map view (the hero)

```
 MESH MAP                                   mode: [SIM]  ttl: 7
 ────────────────────────────────────────────────────────────
              (n4)·······(n5)
             ·              ·
            ·                ·
   (n1)····(sachin)·······(n6)
             ·    ╲          ·
              ·     ╲        ·
               (n2)···(rohan)···(n7)
                         ·
                        (n3)

 legend: (●) online  (○) offline  ··· link  ━━▶ packet
 ────────────────────────────────────────────────────────────
 > scenario: [1 flood] [2 multi-hop dm] [3 kill node]
```

Rules:
- Nodes are `(name)` in `blue`; real nodes (sachin, rohan) are bold; virtual nodes are `fg-dim`.
- Links are `·` characters in `border` color.
- Active packet path is drawn with `━` and `▶` in `yellow`, advancing one hop at a time.
- Each hop prints the new hop count in `orange` beside the node: `(n4) h2 ttl5`.
- Offline nodes show as `(○ n6)` in `red`, with links to them removed.
- Dropped duplicates flash `x dup` in `red` next to the node.
- Range rings are optional: show as a dotted `. . .` circle when a node is selected.
- Scenario buttons are text tokens in brackets. Selecting one runs a fixed script. Pressing `k` then a node name kills it.

### 4.4 Nodes view

```
 NODES                                          sorted: signal
 ────────────────────────────────────────────────────────────
  id        nick      signal   hops   battery   last seen
  a3f9      sachin    ▂▄▆█     0      87%       now       you
  7c21      rohan     ▂▄▆_     0      64%       2s
  n4        ghost-4   ▂▄__     2      41%       9s        sim
 ────────────────────────────────────────────────────────────
```

- Signal bars use block characters `▂▄▆█` in `green`, with `_` for empty steps.
- Rows tagged `sim` in `yellow` are virtual nodes. Rows for real nodes have no tag.
- Offline rows are entirely `fg-dim`, with `red` for the status word `offline`.

### 4.5 Inspector view

```
 PACKET INSPECTOR                         msg: 0x4f2a91
 ────────────────────────────────────────────────────────────
  src        a3f9 (sachin)
  dst        broadcast
  msg id     4f2a91
  type       text
  ttl        7 → 6
  hops       a3f9 → n4 → n5 → 7c21
  transport  wifi
  enc        none
  payload    "anyone near the east gate?"
  status     delivered
 ────────────────────────────────────────────────────────────
```

- Field names in `fg-dim`, values in `fg`, TTL and hops in `orange`.
- Select a message in chat with the arrow keys, then open inspect to see its packet.

## 5. Components

| Component | Spec |
|---|---|
| Mode tag | `[LIVE]` in `green` when showing real traffic. `[SIM]` in `yellow` on the map during scenarios. Always visible in the header. |
| Internet tag | `NO INTERNET` in `red` on a `bg-alt` block. Reinforces the pitch. |
| Transport badge | `wifi` in `aqua`. Future values `ble`, `lora` shown dimmed in the inspector as pluggable. |
| Tabs | `[chat]  map   nodes   inspect`. Active tab bracketed and `yellow`. |
| Input | `> ` prompt, blinking block cursor `█`. Supports slash commands. |
| Hop badge | `[hN]` in `orange`. |
| Signal bars | `▂▄▆█` scale. |
| Toast | One-line message above the input, `bg-alt` background, disappears after 3s. |

## 6. Commands

Typing a slash command in the input bar:

| Command | Action |
|---|---|
| `/dm <nick>` | Open a direct message tab |
| `/nick <name>` | Change nickname |
| `/map` | Go to mesh map |
| `/nodes` | Go to node list |
| `/inspect` | Open inspector for last message |
| `/scenario <1-3>` | Run a demo scenario |
| `/kill <node>` / `/revive <node>` | Take a virtual node offline or online |
| `/help` | List commands |

Keyboard: `Tab` cycles views, arrow keys move selection, `Esc` returns to chat. Every command also has a clickable bracket token, so the UI works on phones.

## 7. Motion

- Cursor blink: 1s steps, only on the input bar.
- Packet travel: one hop every 400 to 600 ms along the map. Fixed timings so scenarios are repeatable.
- New message: appears instantly, with no slide or fade.
- Node state change: the node label flashes once in `yellow`, then settles into its new color.
- Respect `prefers-reduced-motion`: skip the cursor blink and show packet paths as static final states with the hop list printed below.

## 8. Responsive behavior

- **Desktop (80+ columns):** full frame as shown.
- **Phone (under 60 columns):** drop the box-drawing sides, keep top and bottom rules. Tabs become a single row of short tokens: `chat map nodes inspect`. The mesh map scales down to 6 to 8 virtual nodes and abbreviates nodes as `n1`..`n8`.
- Nodes table on phones shows only `nick`, `signal`, and `hops`.

## 9. Copy guidelines

- Plain, short, system-voice messages. Examples: `* rohan#7c21 joined the mesh`, `* link to n6 lost`, `* msg dropped: ttl 0`.
- Errors state what happened and what to do: `send failed: no peers in range. check hotspot and retry.`
- Empty states are invitations: `no peers yet. start the app on another device on this network.`
- Use the same word for the same action everywhere: always "send", "kill", "revive".

## 10. Accessibility

- Contrast: all primary text meets 4.5:1 against `bg`.
- Never rely on color alone: online/offline, delivered/failed, and LIVE/SIM all have text tokens too.
- Visible focus: focused element gets a `bg-alt` background and a `yellow` underline.
- Screen readers: the chat log is a live region; the map has a text equivalent (the nodes view and the inspector's hop list).

## 11. Implementation notes (for later)

- Render with a `<pre>`-style monospace grid or a canvas that draws characters on a fixed grid. For the map, a fixed-width character canvas keeps the ASCII lines aligned.
- Define the 12 color tokens as CSS variables so a light Gruvbox variant can be added later.
- Bundle the font and avoid any external requests, so the UI works with no internet.
- Keep the frame width in `ch` units so the box characters always line up.
