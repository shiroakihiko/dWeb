const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');

class ChatMSGBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }
}

module.exports = ChatMSGBlockAdder;
