const crypto = require('crypto');

class CryptoManager {
  constructor() {
    this.ecdh = crypto.createECDH('prime256v1');
    this.publicKeyHex = this.ecdh.generateKeys('hex');
  }

  getPublicKey() {
    return this.publicKeyHex;
  }

  computeSharedSecret(peerPublicKeyHex) {
    try {
      const secret = this.ecdh.computeSecret(Buffer.from(peerPublicKeyHex, 'hex'));
      return crypto.createHash('sha256').update(secret).digest();
    } catch (err) {
      console.error('[Crypto] Error computing shared secret:', err.message);
      return null;
    }
  }

  encrypt(plaintext, peerPublicKeyHex) {
    const key = this.computeSharedSecret(peerPublicKeyHex);
    if (!key) {
      throw new Error('Unable to compute shared secret with peer');
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag
    };
  }

  decrypt(encryptedData, peerPublicKeyHex) {
    const key = this.computeSharedSecret(peerPublicKeyHex);
    if (!key) {
      throw new Error('Unable to compute shared secret with peer');
    }
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

const defaultCryptoManager = new CryptoManager();
defaultCryptoManager.CryptoManager = CryptoManager;

module.exports = defaultCryptoManager;
