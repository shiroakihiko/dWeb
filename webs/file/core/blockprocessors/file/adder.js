const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');

class FileBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }
}

module.exports = FileBlockAdder;
