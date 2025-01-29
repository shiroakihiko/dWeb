const BlockHelper = require('../../../core/utils/blockhelper');
const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const BlockManager = require('../../../core/blockprocessors/blockmanager.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.blockManager = network.blockManager;
        this.handlers = new Map();
        this.registerHandlers();
    }

    // Register all RPC handlers
    registerHandlers() {
        if(!this.network.ledger)
            return;

        this.registerHandler('sendBlock', this.sendBlock.bind(this));

        this.registerHandler('getAccount', this.getAccount.bind(this));
        this.registerHandler('getDelegator', this.getDelegator.bind(this));
        this.registerHandler('getBlocks', this.getBlocks.bind(this));
        this.registerHandler('getPeers', this.getPeers.bind(this));
        this.registerHandler('verifySignature', this.verifySignature.bind(this));
        this.registerHandler('getBlock', this.getBlock.bind(this));
        this.registerHandler('getAccountDetails', this.getAccountDetails.bind(this));
        this.registerHandler('getLastBlockHashes', this.getLastBlockHashes.bind(this));
        this.registerHandler('getContainer', this.getContainer.bind(this));
    }

    // Register a single handler
    registerHandler(action, callback) {
        this.handlers.set(action, callback);
    }

    // Modified handleMessage to use registered handlers
    async handleMessage(message, req, res) {
        try {
            const handler = this.handlers.get(message.action);
            if (!handler) {
                return false;
            }
            handler(res, message);
            return true;
        } catch (err) {
            this.network.node.error('Error in RPCMessageHandler', err);
            this.network.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
            return true;
        }
    }

    convertToDisplayUnit(input)
    {
        return new Decimal(input).dividedBy(new Decimal('100000000')).toFixed(8, Decimal.ROUND_HALF_DOWN);
    }
    convertToRawUnit(input)
    {
        return new Decimal(input).times(new Decimal('100000000')).toFixed(0, Decimal.ROUND_HALF_DOWN);
    }

    async sendBlock(res, data) {
        if(!data.block)
        {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }
        const parseResult = await this.blockManager.prepareBlock(data.block);
        if(parseResult.state == 'VALID')
        {
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if(valid_block)
                this.network.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.network.node.SendRPCResponse(res, { success: false, message: 'Block not accepted' });
        }
        else {
            this.network.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getAccount(res, data) {
        const { accountId } = data;
        const accountInfo = await this.network.ledger.getAccount(accountId);

        if (accountInfo != null) {
            // Convert internal raw unit to display unit

            accountInfo.balance = this.convertToDisplayUnit(accountInfo.balance);
            this.network.node.SendRPCResponse(res, { success: true, accountInfo });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Account not found' });
        }
    }

    // Get the delegator address for a specific account
    async getDelegator(res, data) {
        const { accountId } = data;
        const delegator = await this.network.ledger.getDelegator(accountId);
        if (delegator != null) {
            this.network.node.SendRPCResponse(res, { success: true, delegator });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Delegator not found' });
        }
    }

    // Get the account transaction history (action = account_history)
    async getBlocks(res, data) {
        const { accountId } = data;
        const history = await this.network.ledger.getTransactionHistoryForAccount(accountId);
        if (history && history.length > 0) {
            // Covert raw units to display units
            history.forEach((tx) => {
                tx.amount = this.convertToDisplayUnit(tx.amount);
                this.formatFee(tx);
            });
            this.network.node.SendRPCResponse(res, { success: true, history });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'No transaction history found' });
        }
    }

    formatFee(tx)
    {
        if(tx.fee)
        {
            if(tx.fee.amount)
                tx.fee.amount = this.convertToDisplayUnit(tx.fee.amount);
            if(tx.fee.delegatorReward)
                tx.fee.delegatorReward = this.convertToDisplayUnit(tx.fee.delegatorReward);
            if(tx.fee.burnAmount)
                tx.fee.burnAmount = this.convertToDisplayUnit(tx.fee.burnAmount);
        }
    }

    // Get the list of connected peers (action = getPeers)
    getPeers(res) {
        const peers = Array.from(this.network.node.peers.peerManager.connectedPeerAddresses); // Assuming the connected peers are stored here
        this.network.node.SendRPCResponse(res, { success: true, peers });
    }

    // Verify a signature against a message
    verifySignature(res, data) {
        const { message, signature, publicKey } = data;

        try {
            const result = BlockHelper.verifySignatureWithPublicKey(JSON.parse(message), signature, publicKey);
            this.network.node.SendRPCResponse(res, { success: result, message: '' });
        } catch (err) {
            this.network.node.SendRPCResponse(res, { success: false, message: err.message });
        }
    }

    // Get block details by hash with networkId
    async getBlock(res, data) {
        const { networkId, blockHash } = data;
        const block = await this.network.ledger.getBlock(blockHash);
        if (block) {
            // Covert raw units to display units
            block.amount = block.amount ? this.convertToDisplayUnit(block.amount) : '0.0';
            this.formatFee(block);

            this.network.node.SendRPCResponse(res, { success: true, block: block });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'No block found' });
        }
    }

    // Get account details (balance, blocks)
    async getAccountDetails(res, data) {
        const { networkId, accountId } = data;
        const accountInfo = await this.network.ledger.getAccount(accountId);

        if (accountInfo != null) {
            const blocks = await this.network.ledger.getAccountHistory(accountId);
            accountInfo.hash = accountId;
            accountInfo.balance = this.convertToDisplayUnit(accountInfo.balance);
            blocks.forEach(block => {
                block.amount = block.amount ? this.convertToDisplayUnit(block.amount) : '0.0';
                this.formatFee(block);
            });
            this.network.node.SendRPCResponse(res, { success: true, accountInfo: accountInfo, blocks: blocks });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Account not found' });
        }
    }

    // Get block details by hash with networkId
    async getLastBlockHashes(res, data) {
        if (data.accounts) {
            const hashes = {};
            for (const accountId of data.accounts) {
                hashes[accountId] = await this.network.ledger.getLastBlockHash(accountId);
            }
            this.network.node.SendRPCResponse(res, { success: true, hashes: hashes });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'No accounts specified' });
        }
    }

    // Get container details by hash
    async getContainer(res, data) {
        const { containerHash } = data;
        const container = await this.network.ledger.getContainerWithBlocks(containerHash);
        
        if (container) {
            // Convert amounts in blocks to display units
            if (container.blocks) {
                container.blocks.forEach(block => {
                    block.amount = block.amount ? this.convertToDisplayUnit(block.amount) : '0.0';
                    this.formatFee(block);
                });
            }
            
            this.network.node.SendRPCResponse(res, { success: true, container });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Container not found' });
        }
    }
}

module.exports = RPCMessageHandler;
