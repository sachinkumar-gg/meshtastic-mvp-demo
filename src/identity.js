const crypto = require('crypto');
const config = require('./config');
const defaultCryptoManager = require('./crypto');

class Identity {
  constructor(options = {}) {
    this.id = options.id || config.NODE_ID || this._generateShortId();
    this.nickname = options.nickname || config.NODE_NICK || 'sachin';
    this.cryptoManager = options.cryptoManager || new defaultCryptoManager.CryptoManager();
    this.publicKey = this.cryptoManager.getPublicKey();
    this.battery = options.battery !== undefined ? options.battery : Math.floor(Math.random() * 25) + 75; // 75-100%
  }

  _generateShortId() {
    return crypto.randomBytes(2).toString('hex');
  }

  setNickname(nick) {
    if (nick && typeof nick === 'string') {
      const sanitized = nick.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
      if (sanitized.length > 0) {
        this.nickname = sanitized;
        return true;
      }
    }
    return false;
  }

  getPublicProfile() {
    return {
      id: this.id,
      nick: this.nickname,
      publicKey: this.publicKey,
      battery: this.battery
    };
  }
}

const defaultIdentity = new Identity();
defaultIdentity.Identity = Identity;

module.exports = defaultIdentity;
