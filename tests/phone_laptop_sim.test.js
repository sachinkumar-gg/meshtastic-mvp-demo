const WebSocket = require('ws');
const assert = require('assert');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPhoneLaptopSimulation() {
  console.log('📱 Testing Phone + Laptop Multi-Device Simulation on single server...');

  // Start server on port 3050 for test
  process.env.PORT = '3050';
  process.env.UDP_PORT = '43234';
  const serverProcess = require('../server');

  await sleep(1000);

  // Client 1: Laptop (Sachin)
  const laptopWs = new WebSocket('ws://localhost:3050');
  const laptopEvents = [];
  laptopWs.on('message', data => laptopEvents.push(JSON.parse(data.toString('utf8'))));

  await new Promise(res => laptopWs.on('open', res));
  laptopWs.send(JSON.stringify({
    action: 'register_node',
    payload: { id: 'a3f9', nick: 'sachin', isMobile: false, battery: 92 }
  }));

  await sleep(400);

  // Client 2: Phone
  const phoneWs = new WebSocket('ws://localhost:3050');
  const phoneEvents = [];
  phoneWs.on('message', data => phoneEvents.push(JSON.parse(data.toString('utf8'))));

  await new Promise(res => phoneWs.on('open', res));
  phoneWs.send(JSON.stringify({
    action: 'register_node',
    payload: { id: '7c21', nick: 'phone', isMobile: true, battery: 68 }
  }));

  await sleep(600);

  // Check laptop discovered phone
  const laptopPeers = laptopEvents.filter(e => e.type === 'peer:list').pop()?.data || [];
  console.log(`Laptop known peers:`, laptopPeers.map(p => p.nick));
  assert(laptopPeers.some(p => p.nick === 'phone'), 'Laptop must see phone as peer');

  // Check phone discovered laptop
  const phonePeers = phoneEvents.filter(e => e.type === 'peer:list').pop()?.data || [];
  console.log(`Phone known peers:`, phonePeers.map(p => p.nick));
  assert(phonePeers.some(p => p.nick === 'sachin'), 'Phone must see laptop as peer');

  console.log('✅ Step 1: Laptop & Phone auto-discovered each other!');

  // Test broadcast from Phone to Laptop
  phoneWs.send(JSON.stringify({
    action: 'send_broadcast',
    payload: { src: '7c21', srcNick: 'phone', text: 'anyone near the east gate?' }
  }));

  await sleep(400);
  const laptopBcast = laptopEvents.find(e => e.type === 'message:new' && e.data.text === 'anyone near the east gate?');
  assert(laptopBcast, 'Laptop must receive broadcast from phone');
  assert.strictEqual(laptopBcast.data.srcNick, 'phone');
  console.log('✅ Step 2: Broadcast from phone delivered to laptop!');

  // Test DM from Laptop to Phone with ACK
  laptopWs.send(JSON.stringify({
    action: 'send_dm',
    payload: { src: 'a3f9', srcNick: 'sachin', dst: 'phone', text: 'meet at 5', encrypt: true }
  }));

  await sleep(500);
  const phoneDm = phoneEvents.find(e => e.type === 'message:new' && e.data.text === 'meet at 5');
  assert(phoneDm, 'Phone must receive direct message from laptop');
  assert.strictEqual(phoneDm.data.srcNick, 'sachin');

  const laptopAck = laptopEvents.find(e => e.type === 'message:delivered');
  assert(laptopAck, 'Laptop must receive delivery confirmation ACK');
  console.log('✅ Step 3: Direct message from laptop delivered to phone with ACK!');

  laptopWs.close();
  phoneWs.close();

  console.log('\n🎉 ALL MULTI-DEVICE (PHONE + LAPTOP) TESTS PASSED!\n');
  process.exit(0);
}

testPhoneLaptopSimulation().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
