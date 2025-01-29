const BlockHelper = require('../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const BlockManager = require('../../../core/blockprocessors/blockmanager.js');
const Hasher = require('../../../core/utils/hasher.js');
class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.blockManager = network.blockManager;
    }

    async handleMessage(message, req, res) {
        try {
            const action = message.action;

            // Handle actions based on 'action' field in the JSON body
            switch (action) {
                case 'registerDomain':
                    this.registerDomain(res, message);
                    return true;
                case 'lookupDomain':
                    this.lookupDomain(res, message);
                    return true;
                case 'updateDomain':
                    this.updateDomain(res, message);
                    return true;
                case 'getMyDomains':
                    this.getDomains(res, message);
                    return true;
                case 'getDefaultDomain':
                    this.getDefaultDomain(res, message)
                    return true;
                case 'transferDomain':
                    this.transferDomain(res, message);
                    return true;
                case 'setDefaultDomain':
                    this.setDefaultDomain(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err);
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
            return true;
        }

        return false;
    }

    // Add these methods to the RPCMessageHandler class

    async registerDomain(res, data) {
        if(!data.block)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if(parseResult.state == 'VALID')
        {
            // Propose the block to the consensus layer
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if(valid_block)
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Register block not accepted.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async lookupDomain(res, data) {
        const { domainName } = data;
        const domainAccount = await this.network.ledger.getAccount(Hasher.hashText(domainName));

        if (domainAccount) {
            const domain = {name: domainName, owner: domainAccount.owner, entries: domainAccount.entries};
            this.node.SendRPCResponse(res, { 
                success: true, 
                domain 
            });
        } else {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: 'Domain not found' 
            });
        }
    }

    async updateDomain(res, data) {
        if(!data.block)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if(parseResult.state == 'VALID')
        {
            // Propose the block to the consensus layer
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if(valid_block)
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Update block not accepted.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async transferDomain(res, data) {
        if(!data.block)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if(parseResult.state == 'VALID')
        {
            // Propose the block to the consensus layer
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if(valid_block)
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Transfer block not accepted.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async setDefaultDomain(res, data) {
        if(!data.block)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if(parseResult.state == 'VALID')
        {
            // Propose the block to the consensus layer
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if(valid_block)
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Set default block not accepted.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getDomains(res, data) {
        const { accountId } = data;
        const history = await this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            const domains = [];
            // Covert raw units to display units
            for(const tx of history) {
                if(tx.type == 'register') 
                {
                    const domainAccount = await this.network.ledger.getAccount(tx.toAccount);
                    if(domainAccount.owner == accountId)
                        domains.push({name: tx.domainName, owner: domainAccount.owner, entries: domainAccount.entries});
                }
                else if(tx.type == 'transfer' && tx.toAccount == accountId)
                {
                    const domainAccount = await this.network.ledger.getAccount(Hasher.hashText(tx.domainName));
                    if(domainAccount.owner == accountId)
                        domains.push({name: tx.domainName, owner: domainAccount.owner, entries: domainAccount.entries});
                }
            }
            this.node.SendRPCResponse(res, { success: true, domains });
        } else {
            this.node.SendRPCResponse(res, { success: true, domains: [] });
        }
    }

    async getDefaultDomain(res, data) {
        const { accountId } = data;
        const userAccount = await this.network.ledger.getAccount(accountId);
        if (userAccount) {
            this.node.SendRPCResponse(res, { success: true, domain: userAccount.defaultDomain });
        } else {
            this.node.SendRPCResponse(res, { success: true, domain: null });
        }
    }
}

module.exports = RPCMessageHandler;
