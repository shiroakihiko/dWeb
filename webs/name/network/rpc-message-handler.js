const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const Hasher = require('../../../core/utils/hasher.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.actionManager = network.actionManager;
    }

    async handleMessage(message, req, res) {
        try {
            const method = message.method;

            // Handle actions based on 'action' field in the JSON body
            switch (method) {
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
        if(!data.action)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if(parseResult.state == 'VALID')
        {
            // Propose the action to the consensus layer
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if(valid_action)
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Register action not accepted.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async lookupDomain(res, data) {
        const { domainName } = data;
        const domainAccount = this.network.ledger.getAccount(await Hasher.hashText(domainName));

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
        if(!data.action)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if(parseResult.state == 'VALID')
        {
            // Propose the action to the consensus layer
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if(valid_action)
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Update action not accepted.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async transferDomain(res, data) {
        if(!data.action)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if(parseResult.state == 'VALID')
        {
            // Propose the action to the consensus layer
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if(valid_action)
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Transfer action not accepted.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async setDefaultDomain(res, data) {
        if(!data.action)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if(parseResult.state == 'VALID')
        {
            // Propose the action to the consensus layer
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if(valid_action)
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Set default action not accepted.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getDomains(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            const domains = [];
            // Covert raw units to display units
            for(const tx of history) {
                if(tx.instruction.type == 'register') 
                {
                    const domainAccount = this.network.ledger.getAccount(tx.instruction.toAccount);
                    if(domainAccount && domainAccount.owner == accountId)
                        domains.push({name: tx.instruction.domainName, owner: domainAccount.owner, entries: domainAccount.entries});
                }
                else if(tx.instruction.type == 'transfer' && tx.instruction.toAccount == accountId)
                {
                    const domainAccount = this.network.ledger.getAccount(await Hasher.hashText(tx.instruction.domainName));
                    if(domainAccount && domainAccount.owner == accountId)
                        domains.push({name: tx.instruction.domainName, owner: domainAccount.owner, entries: domainAccount.entries});
                }
            }
            this.node.SendRPCResponse(res, { success: true, domains });
        } else {
            this.node.SendRPCResponse(res, { success: true, domains: [] });
        }
    }

    async getDefaultDomain(res, data) {
        const { accountId } = data;
        const userAccount = this.network.ledger.getAccount(accountId);
        if (userAccount) {
            this.node.SendRPCResponse(res, { success: true, domain: userAccount.defaultDomain });
        } else {
            this.node.SendRPCResponse(res, { success: true, domain: null });
        }
    }
}

module.exports = RPCMessageHandler;
