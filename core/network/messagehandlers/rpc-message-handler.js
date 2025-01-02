const BlockHelper = require('../../../core/utils/blockhelper');
const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const BlockManager = require('../../../core/blockprocessors/blockmanager.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.blockManager = network.blockManager;
    }

    async handleMessage(message, req, res) {
        try {
            const action = message.action;

            // Handle actions based on 'action' field in the JSON body
            switch (action) {
                case 'getAccount':
                    this.getAccount(res, message);
                    return true;
                case 'getDelegator':
                    this.getDelegator(res, message);
                    return true;
                case 'getBlocks':
                    this.getBlocks(res, message);
                    return true;
                case 'getPeers':
                    this.getPeers(res);
                    return true;
                case 'verifySignature':
                    this.verifySignature(res, message);
                    return true;
                case 'getBlock':
                    this.getBlock(res, message);
                    return true;
                case 'getAccountDetails':
                    this.getAccountDetails(res, message);
                    return true;
                case 'getLastBlockHashes':
                    this.getLastBlockHashes(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err);
            this.network.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
            return true;
        }

        return false;
    }

    convertToDisplayUnit(input)
    {
        return new Decimal(input).dividedBy(new Decimal('100000000')).toFixed(8, Decimal.ROUND_HALF_DOWN);
    }
    convertToRawUnit(input)
    {
        return new Decimal(input).times(new Decimal('100000000')).toFixed(0, Decimal.ROUND_HALF_DOWN);
    }

    getAccount(res, data) {
        const { accountId } = data;
        const accountInfo = this.network.ledger.getAccount(accountId);

        if (accountInfo != null) {
            // Convert internal raw unit to display unit

            accountInfo.balance = this.convertToDisplayUnit(accountInfo.balance);
            this.network.node.SendRPCResponse(res, { success: true, accountInfo });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Account not found' });
        }
    }

    // Get the delegator address for a specific account
    getDelegator(res, data) {
        const { accountId } = data;
        const delegator = this.network.ledger.getDelegator(accountId);
        if (delegator != null) {
            this.network.node.SendRPCResponse(res, { success: true, delegator });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Delegator not found' });
        }
    }

    // Get the account transaction history (action = account_history)
    getBlocks(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getTransactionHistoryForAccount(accountId);
        if (history && history.length > 0) {
            // Covert raw units to display units
            history.forEach((tx) => {
                tx.amount = this.convertToDisplayUnit(tx.amount);
                tx.fee = this.convertToDisplayUnit(tx.fee);
                tx.delegatorReward = this.convertToDisplayUnit(tx.delegatorReward);
                tx.burnAmount = this.convertToDisplayUnit(tx.burnAmount);
            });
            this.network.node.SendRPCResponse(res, { success: true, history });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'No transaction history found' });
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
    getBlock(res, data) {
        const { networkId, blockHash } = data;
        const block = this.network.ledger.getBlock(blockHash);
        if (block) {
            // Covert raw units to display units
            block.amount = this.convertToDisplayUnit(block.amount);
            block.fee = this.convertToDisplayUnit(block.fee);
            block.delegatorReward = this.convertToDisplayUnit(block.delegatorReward);
            block.burnAmount = this.convertToDisplayUnit(block.burnAmount);

            this.network.node.SendRPCResponse(res, { success: true, block: block });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'No block found' });
        }
    }

    // Get account details (balance, blocks)
    getAccountDetails(res, data) {
        const { networkId, accountId } = data;
        const accountInfo = this.network.ledger.getAccount(accountId);

        if (accountInfo != null) {
            const blocks = this.network.ledger.getTransactions(accountId);
            accountInfo.hash = accountId;
            accountInfo.balance = this.convertToDisplayUnit(accountInfo.balance);
            blocks.forEach(block => {
                block.amount = this.convertToDisplayUnit(block.amount);
                block.fee = this.convertToDisplayUnit(block.fee);
                block.delegatorReward = this.convertToDisplayUnit(block.delegatorReward);
                block.burnAmount = this.convertToDisplayUnit(block.burnAmount);
            });
            this.network.node.SendRPCResponse(res, { success: true, accountInfo: accountInfo, blocks: blocks });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Account not found' });
        }
    }

    // Get block details by hash with networkId
    getLastBlockHashes(res, data) {
        if (data.accounts) {
            const hashes = {};
            data.accounts.forEach((accountId) => {hashes[accountId] = this.network.ledger.getLastBlockHash(accountId);})
            this.network.node.SendRPCResponse(res, { success: true, hashes: hashes });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'No accounts specified' });
        }
    }
}

module.exports = RPCMessageHandler;
