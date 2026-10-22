const WebSocket = require('ws');
const assert = require('assert');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2E() {
  console.log('🚀 Running Full E2E WebSocket Integration Test across Node 1 (port 3000) and Node 2 (port 3001)...');

  const ws1 = new WebSocket('ws://localhost:3000');
  const ws2 = new WebSocket('ws://localhost:3001');

  const ws1Events = [];
  const ws2Events = [];

  ws1.on('message', (data) => ws1Events.push(JSON.parse(data.toString('utf8'))));
  ws2.on('message', (data) => ws2Events.push(JSON.parse(data.toString('utf8'))));

  await Promise.all([
    new Promise(res => ws1.on('open', res)),
    new Promise(res => ws2.on('open', res))
  ]);

  console.log('Connected to both WebSocket endpoints.');
  await sleep(1500);

  // 1. Verify init events
  const init1 = ws1Events.find(e => e.type === 'init');
  const init2 = ws2Events.find(e => e.type === 'init');

  assert(init1, 'Node 1 must emit init event');
  assert(init2, 'Node 2 must emit init event');

  console.log(`Node 1 identity: ${init1.data.identity.nick}#${init1.data.identity.id}`);
  console.log(`Node 2 identity: ${init2.data.identity.nick}#${init2.data.identity.id}`);

  assert.strictEqual(init1.data.identity.nick, 'sachin');
  assert.strictEqual(init2.data.identity.nick, 'rohan');
  console.log('✅ E2E Step 1: Identities verified.');

  // 2. Verify peer discovery over Wi-Fi UDP
  console.log('Checking live peers...');
  const peers1 = ws1Events.filter(e => e.type === 'peer:list').pop()?.data || init1.data.peers;
  const peers2 = ws2Events.filter(e => e.type === 'peer:list').pop()?.data || init2.data.peers;

  console.log(`Node 1 known peers: ${peers1.map(p => p.nick).join(', ')}`);
  console.log(`Node 2 known peers: ${peers2.map(p => p.nick).join(', ')}`);

  assert(peers1.some(p => p.nick === 'rohan'), 'Node 1 must see rohan');
  assert(peers2.some(p => p.nick === 'sachin'), 'Node 2 must see sachin');
  console.log('✅ E2E Step 2: Live peer discovery over UDP active.');

  // 3. Test sending broadcast from Node 1 to Node 2
  console.log('Sending broadcast from Node 1...');
  ws1.send(JSON.stringify({
    action: 'send_broadcast',
    payload: { text: 'anyone near the east gate?' }
  }));

  await sleep(600);

  const bcastMsgOnNode2 = ws2Events.find(e => e.type === 'message:new' && e.data.text === 'anyone near the east gate?');
  assert(bcastMsgOnNode2, 'Node 2 must receive broadcast message from Node 1');
  assert.strictEqual(bcastMsgOnNode2.data.srcNick, 'sachin');
  console.log('✅ E2E Step 3: Broadcast message received intact across live local Wi-Fi UDP link.');

  // 4. Test encrypted DM from Node 2 to Node 1 with ACK
  console.log('Sending encrypted DM from Node 2 to Node 1...');
  ws2.send(JSON.stringify({
    action: 'send_dm',
    payload: {
      dst: 'sachin',
      text: 'meet at 5',
      encrypt: true
    }
  }));

  await sleep(800);

  const dmMsgOnNode1 = ws1Events.find(e => e.type === 'message:new' && e.data.text === 'meet at 5');
  assert(dmMsgOnNode1, 'Node 1 must receive decrypted DM from Node 2');
  assert.strictEqual(dmMsgOnNode1.data.encrypted, true);

  const ackOnNode2 = ws2Events.find(e => e.type === 'message:delivered');
  assert(ackOnNode2, 'Node 2 must receive delivery ACK confirmation');
  console.log('✅ E2E Step 4: Encrypted DM delivered and ACK confirmation received.');

  // 5. Test killing a virtual node
  console.log('Testing node toggle / kill...');
  ws1.send(JSON.stringify({
    action: 'kill_node',
    payload: { nodeId: 'n2' }
  }));

  await sleep(300);
  const stateChange = ws1Events.find(e => e.type === 'node:state_change' && e.data.nodeId === 'n2');
  assert(stateChange, 'State change event must be received');
  assert.strictEqual(stateChange.data.status, 'offline');
  console.log('✅ E2E Step 5: Node kill and offline state synchronization passed.');

  ws1.close();
  ws2.close();

  console.log('\n🌟 ALL END-TO-END TESTS COMPLETED SUCCESSFULLY WITH ZERO ERRORS! 🌟\n');
}

runE2E().catch(err => {
  console.error('❌ E2E Failed:', err);
  process.exit(1);
});
