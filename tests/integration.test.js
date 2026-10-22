const assert = require('assert');
const WifiTransport = require('../src/transport/WifiTransport');
const Router = require('../src/protocol/Router');
const identity = require('../src/identity');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🧪 Starting Decentralized Comms Integration Test...');

  // Setup Node 1 (Sachin)
  const id1 = new identity.Identity({ id: 'a3f9', nickname: 'sachin' });
  const t1 = new WifiTransport({ port: 42234, broadcastAddr: '127.0.0.1' });
  const r1 = new Router(t1, id1);

  // Setup Node 2 (Rohan)
  const id2 = new identity.Identity({ id: '7c21', nickname: 'rohan' });
  const t2 = new WifiTransport({ port: 42235, broadcastAddr: '127.0.0.1' });
  const r2 = new Router(t2, id2);

  // Start transports
  await t1.start();
  await t2.start();

  // Add manual loopback peers so test runs reliably in sandbox environment
  t1.addManualPeer('127.0.0.1', 42235);
  t2.addManualPeer('127.0.0.1', 42234);

  // Start routers
  r1.start();
  r2.start();

  console.log('⏳ Waiting for peer discovery via heartbeat beacons...');
  await sleep(1000);

  // Test 1: Peer discovery
  const p1 = r1.getPeersList();
  const p2 = r2.getPeersList();
  console.log(`Node 1 peers count: ${p1.length}, Node 2 peers count: ${p2.length}`);
  assert(p1.some(p => p.id === '7c21'), 'Node 1 must have discovered Node 2 (7c21)');
  assert(p2.some(p => p.id === 'a3f9'), 'Node 2 must have discovered Node 1 (a3f9)');
  console.log('✅ Test 1 Passed: Peer discovery works bidirectional over UDP.');

  // Test 2: Broadcast messaging
  console.log('Testing broadcast message...');
  let broadcastReceived = null;
  r2.on('message', (msg) => {
    if (msg.type === 'broadcast' && msg.src === 'a3f9') {
      broadcastReceived = msg;
    }
  });

  await r1.sendBroadcast('anyone near the east gate?');
  await sleep(400);

  assert(broadcastReceived !== null, 'Node 2 must receive broadcast message');
  assert.strictEqual(broadcastReceived.text, 'anyone near the east gate?');
  assert.strictEqual(broadcastReceived.srcNick, 'sachin');
  console.log('✅ Test 2 Passed: Broadcast message sent and received intact.');

  // Test 3: Encrypted Direct Message & Delivery ACK
  console.log('Testing encrypted DM with delivery ACK...');
  let dmReceived = null;
  r1.on('message', (msg) => {
    if (msg.type === 'dm' && msg.src === '7c21') {
      dmReceived = msg;
    }
  });

  let ackDelivered = false;
  r2.on('message:delivered', (info) => {
    ackDelivered = true;
  });

  const sentDm = await r2.sendDirect('sachin', 'meet at 5', true);
  await sleep(600);

  assert(dmReceived !== null, 'Node 1 must receive direct message');
  assert.strictEqual(dmReceived.text, 'meet at 5');
  assert.strictEqual(dmReceived.encrypted, true);
  assert.strictEqual(ackDelivered, true, 'Node 2 must receive ACK confirming delivery');
  console.log('✅ Test 3 Passed: Encrypted DM delivered and ACK received.');

  // Test 4: Duplicate suppression
  console.log('Testing duplicate suppression...');
  let duplicateCount = 0;
  r2.on('duplicate:dropped', () => {
    duplicateCount++;
  });

  // Re-broadcast the same broadcast packet from r1 that r2 already received
  await t1.broadcast(broadcastReceived.packet);
  await sleep(200);
  assert(duplicateCount > 0, 'Duplicate packet should be detected and dropped');
  console.log('✅ Test 4 Passed: Duplicate packet suppression active.');

  // Cleanup
  r1.stop();
  r2.stop();
  await t1.stop();
  await t2.stop();

  console.log('\n🎉 ALL PROTOCOL & TRANSPORT TESTS PASSED SUCCESSFULLY!\n');
}

runTest().catch((err) => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
