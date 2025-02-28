const ActionHelper = require('../../utils/actionhelper');
const Decimal = require('decimal.js');  // Import Decimal for big number conversions

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.actionManager = network.actionManager;
        this.handlers = new Map();
        this.registerHandlers();
    }

    // Register all RPC handlers
    registerHandlers() {
        if(!this.network.ledger)
            return;

        this.registerHandler('sendAction', this.sendAction.bind(this));

        this.registerHandler('getAccount', this.getAccount.bind(this));
        this.registerHandler('getDelegator', this.getDelegator.bind(this));
        this.registerHandler('getActions', this.getActions.bind(this));
        this.registerHandler('getPeers', this.getPeers.bind(this));
        this.registerHandler('verifySignature', this.verifySignature.bind(this));
        this.registerHandler('getAction', this.getAction.bind(this));
        this.registerHandler('getAccountDetails', this.getAccountDetails.bind(this));
        this.registerHandler('getBlock', this.getBlock.bind(this));
        this.registerHandler('getLastBlockHash', this.getLastBlockHash.bind(this));
        this.registerHandler('getAccountNonce', this.getAccountNonce.bind(this));
    }

    // Register a single handler
    registerHandler(method, callback) {
        this.handlers.set(method, callback);
    }

    // Modified handleMessage to use registered handlers
    async handleMessage(message, req, res) {
        try {
            const handler = this.handlers.get(message.method);
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

    async sendAction(res, data) {
        if(!data.action)
        {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }
        const parseResult = await this.actionManager.prepareAction(data.action);
        if(parseResult.state == 'VALID')
        {
            const added = this.network.consensus.proposeAction(parseResult.action);
            if(added)
                this.network.node.SendRPCResponse(res, { success: true, hash: parseResult.action.hash });
            else
                this.network.node.SendRPCResponse(res, { success: false, message: 'Action not accepted' });
        }
        else {
            this.network.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getAccount(res, data) {
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
    async getDelegator(res, data) {
        const { accountId } = data;
        const delegator = this.network.ledger.getDelegator(accountId);
        if (delegator != null) {
            this.network.node.SendRPCResponse(res, { success: true, delegator });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Delegator not found' });
        }
    }

    // Get the account transaction history (action = account_history)
    async getActions(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getTransactionHistoryForAccount(accountId);
        if (history && history.length > 0) {
            // Covert raw units of instructions to display units
            history.forEach((tx) => {
                this.formatInstruction(tx.instruction);
            });
            this.network.node.SendRPCResponse(res, { success: true, history });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'No transaction history found' });
        }
    }

    formatInstruction(instruction)
    {
        if(instruction.fee)
            {
                if(instruction.fee.amount)
                    instruction.fee.amount = this.convertToDisplayUnit(instruction.fee.amount);
                if(instruction.fee.delegatorReward)
                    instruction.fee.delegatorReward = this.convertToDisplayUnit(instruction.fee.delegatorReward);
                if(instruction.fee.burnAmount)
                    instruction.fee.burnAmount = this.convertToDisplayUnit(instruction.fee.burnAmount);
            }
            if(instruction.amount)
              instruction.amount = this.convertToDisplayUnit(instruction.amount);
    }

    // Get the list of connected peers (action = getPeers)
    getPeers(res) {
        const peers = Array.from(this.network.node.peers.peerManager.connectedPeerAddresses); // Assuming the connected peers are stored here
        this.network.node.SendRPCResponse(res, { success: true, peers });
    }

    // Verify a signature against a message
    async verifySignature(res, data) {
        const { message, signature, publicKey } = data;

        try {
            const result = await ActionHelper.verifySignatureWithPublicKey(JSON.parse(message), signature, publicKey);
            this.network.node.SendRPCResponse(res, { success: result, message: '' });
        } catch (err) {
            this.network.node.SendRPCResponse(res, { success: false, message: err.message });
        }
    }

    // Get action details by hash with networkId
    async getAction(res, data) {
        const { networkId, actionHash } = data;
        const action = this.network.ledger.getAction(actionHash);
        if (action) {
            // Covert raw units of instructions to display units
            this.formatInstruction(action.instruction);

            this.network.node.SendRPCResponse(res, { success: true, action: action });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'No action found' });
        }
    }

    // Get account details (balance, actions)
    async getAccountDetails(res, data) {
        const { networkId, accountId } = data;
        const accountInfo = this.network.ledger.getAccount(accountId);

        if (accountInfo != null) {
            const actions = this.network.ledger.getAccountHistory(accountId);
            accountInfo.hash = accountId;
            accountInfo.balance = this.convertToDisplayUnit(accountInfo.balance);
            actions.forEach(action => {
                this.formatInstruction(action.instruction);
            });
            this.network.node.SendRPCResponse(res, { success: true, accountInfo: accountInfo, actions: actions });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Account not found' });
        }
    }

    async getLastBlockHash(res, data) {
        const hash = this.network.ledger.getLastBlockHash();
        this.network.node.SendRPCResponse(res, { success: true, hash: hash });
    }

    async getAccountNonce(res, data) {
        const { accountId } = data;
        const nonce = this.network.ledger.getAccountNonce(accountId);
        this.network.node.SendRPCResponse(res, { success: true, nonce: nonce });
    }

    // Get block details by hash
    async getBlock(res, data) {
        const { blockHash } = data;
        const block = this.network.ledger.getBlockWithActions(blockHash);
        
        if (block) {
            // Convert amounts in actions to display units
            if (block.actions) {
                block.actions.forEach(action => {
                    this.formatInstruction(action.instruction);
                });
            }
            
            this.network.node.SendRPCResponse(res, { success: true, block });
        } else {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Block not found' });
        }
    }
}

module.exports = RPCMessageHandler;
