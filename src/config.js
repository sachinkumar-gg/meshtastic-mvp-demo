const os = require('os');

module.exports = {
  HTTP_PORT: parseInt(process.env.PORT || '3000', 10),
  UDP_PORT: parseInt(process.env.UDP_PORT || '41234', 10),
  BROADCAST_ADDR: process.env.BROADCAST_ADDR || '255.255.255.255',
  HEARTBEAT_INTERVAL_MS: 3000,
  PEER_TIMEOUT_MS: 12000,
  DEFAULT_TTL: 7,
  NODE_NICK: process.env.NODE_NICK || (os.userInfo().username || 'sachin'),
  NODE_ID: process.env.NODE_ID || null, // null generates random 4-char hex
  PEER_LIST: process.env.PEER_LIST ? process.env.PEER_LIST.split(',') : []
};
