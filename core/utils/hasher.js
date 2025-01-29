const crypto = require('crypto');

class Hasher {
    constructor() {
    }
    // Create SHA-256 hash of any input
    static hashText(input) {
        // Create hash using SHA-256
        const hash = crypto.createHash('sha256');
        hash.update(input);
        return hash.digest('hex');
    }
}

module.exports = Hasher;
