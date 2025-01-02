const Ajv = require('ajv');
const Decimal = require('decimal.js');
const BlockHelper = require('../../utils/blockhelper.js');
const BlockFeeCalculator = require('../shared/feecalculator.js');

// This class validates fields that are shared among blocks
class SharedValidator {
    constructor(network) {
        this.network = network;
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    validateBlock(block, checks, schema)
    {
        // Check schema first without any additional data we put on it (e.g. validatorSignatures, hash)
        const blockStripped = { ...block };
        delete blockStripped.hash;
        delete blockStripped.validatorSignatures;
        delete blockStripped.delegatorTime;
        
        const validSchema = this.validSchema(schema, blockStripped);
        if (!validSchema)
            return { state: 'MALFORMED_BLOCK' };

        // Do the additional checks
        for (let check of checks) {
            if(check == 'hash')
            {
                if (!this.validateBlockNew(block))
                    return { state: 'BLOCK_EXISTS' };
            }
            else if(check == 'amount')
            {
                if (!this.validateAmount(block))
                    return { state: 'INSUFICIENT_BALANCE' };
            }
            else if(check == 'fee')
            {
                if (!this.validateFeeDistribution(block))
                    return { state: 'INVALID_FEE' };
            }
            else if(check == 'fromAccount')
            {
                if(!this.validateAccountExist(block.fromAccount))
                    return { state: 'ACCOUNT_NOT_FOUND' };
            }
            else if(check == 'delegator')
            {
                if(!this.accountIsDelegator(block.delegator))
                    return { state: 'DELEGATOR_NOT_FOUND' };
            }
            else if(check == 'previousBlockMatch')
            {
                if(!this.validateLastBlockMatch(block))
                    return { state: 'PREVIOUS_BLOCK_MISMATCH' };
            }
            else if(check == 'signature')
            {
                if(!this.validateSignature(block))
                    return { state: 'INVALID_SIGNATURE' };
            }
            else if(check == 'timestamp')
            {
                if(!this.validateTimestamp(block))
                    return { state: 'INVALID_TIMESTAMP' };
            }
            else if(check == 'networkSigned')
            {
                if(!this.signedByNetwork(block))
                    return { state: 'INVALID_NETWORK_SIGNATURES' };
            }
        }

        return { state: 'VALID' };
    }

    validSchema(schema, block) {
        try {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);
            const result = validate(block);
            if(!result)
                console.log('Validation for block failed:', validate.errors); // Shows the error messages

            return result;
        }
        catch(err)
        {
            console.log(err);
            return false;
        }
    }

    // Helpers ------------
    // Custom validation for amount check
    validateAmount(block) {
        // Validate that amount is non-negative
        if (new Decimal(block.amount).lt(0))
            return false;

        const senderAccount = this.network.ledger.getAccount(block.fromAccount);
        if (!senderAccount)
            return false;

        if (new Decimal(block.amount).gt(senderAccount.balance))
            return false;

        return true;
    }

    // Custom validation for fee distribution
    validateFeeDistribution(block) {
        // Validate that fee is non-negative
        if (new Decimal(block.fee).lt(0))
            return false;

        // Validate that the total the fee distrubtion matches the fee calulation
        const { delegatorReward, burnAmount } = this.feeCalculator.calculateFeeDistribution(block);
        if (new Decimal(delegatorReward).eq(block.delegatorReward) == false || new Decimal(burnAmount).eq(block.burnAmount) == false)
            return false;

        return true;
    }

    // Custom validation for account existence
    validateAccountExist(accountId) {
        return this.network.ledger.getAccount(accountId) != null;
    }

    // Custom validation to check if an account has voting weight (is a delegator)
    accountIsDelegator(accountId) {
        return this.network.ledger.getVoteWeight(accountId) != null;
    }

    // Custom validation for checking last block hash match
    validateLastBlockMatch(block) {
        // Check if all three "previousBlock" fields match their respective last block hashes
        const senderLastBlockHash = this.network.ledger.getLastBlockHash(block.fromAccount);
        if (block.previousBlockSender !== senderLastBlockHash)
            return false;

        const recipientLastBlockHash = this.network.ledger.getLastBlockHash(block.toAccount);
        if (block.previousBlockRecipient !== recipientLastBlockHash)
            return false;

        const delegatorLastBlockHash = this.network.ledger.getLastBlockHash(block.delegator);
        if (block.previousBlockDelegator !== delegatorLastBlockHash)
            return false;

        return true;
    }

    // Custom validation for block signature
    validateSignature(block) {
        return BlockHelper.verifySignatureWithPublicKey(block, block.signature, block.fromAccount);
    }

    // Verify timestamp and make sure the timestamps are not too far off
    // so timebased blocks (e.g. VoteEnd, Swaps) can be executed autonomously
    validateTimestamp(block) {
        // Allow max for a 5 minute disprecancy beween nodes
        const currentTimestamp = Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
        if (currentTimestamp - parseInt(block.delegatorTime) >= 300)
            return false;
    
        return true;
    }

    // Custom validation for block non-existence
    validateBlockNew(block) {
        return this.network.ledger.getBlock(block.hash) == null;
    }
    
    // This will go through all the peers and check if the peers make up
    // the majority of the voting power based on our local last known
    // network weight table
    signedByNetwork(block) {
        // Get last updated network voting weights for this account
        const networkAccount =  block.networkAccount;
        const lastNetworkVotingWeights = this.network.ledger.getNetworkValidatorWeights(networkAccount);

        console.log(networkAccount);
        console.log(lastNetworkVotingWeights);
        console.log(block);
        // If no previous network voting weights are found only the owner can change them
        if (!lastNetworkVotingWeights) {
            const originalOwnerSigned = BlockHelper.verifySignatureWithPublicKey(block, block.signature, networkAccount);
            if (originalOwnerSigned)
                return true;

            return false;
        }

        // Iterate over network voting weights and check if signatures are valid
        let totalVotingPower = 0;
        for (const nodeId in lastNetworkVotingWeights) {
            if (lastNetworkVotingWeights.hasOwnProperty(nodeId)) {
                const votingPower = lastNetworkVotingWeights[nodeId];

                // Check if the nodeId has a valid signature in the block
                if (block.validatorSignatures[nodeId]) {
                    const isSignatureValid = BlockHelper.verifySignatureWithPublicKey(block, block.validatorSignatures[nodeId], nodeId);

                    // If the signature is valid, add the voting power
                    if (isSignatureValid) {
                        totalVotingPower += votingPower;
                    }
                }
            }
        }

        // Check if the total voting power exceeds or is equal to 67%
        if (totalVotingPower >= 67) {
            return true;
        } else {
            return false;
        }
    }
}

module.exports = SharedValidator;
