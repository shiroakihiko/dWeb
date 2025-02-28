const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const FileInstructionValidator = require('./validator.js');
const FileInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class FileInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new FileInstructionValidator(network);
        this.processor = new FileInstructionProcessor(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'file',
            contentType: params.contentType,
            fileName: params.fileName,
            isEncrypted: params.isEncrypted,
            data: params.data
        };
        
        return instruction;
    }

    async validateInstruction(validationData) {
        return await this.validator.validateInstruction(validationData);
    }

    async processInstruction(processData) {
        return await this.processor.processInstruction(processData);
    }
}

module.exports = FileInstruction;
