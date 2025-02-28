const AccountUpdateManager = require('../../../../../ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class OfferInstructionCallback {
    constructor(network) {
        this.network = network;
        this.lastCallTime = false;
    }

    async actionCallback(action) {
        const currentTimestamp = Math.floor(Date.now() / 1000);

        // Throttle checks
        if (this.lastCallTime && (currentTimestamp - this.lastCallTime) < 60) {
            return true;
        }
        this.lastCallTime = currentTimestamp;

        const swapHash = action.hash;
        const accountManager = new AccountUpdateManager(this.network.ledger);
        const accountSwap = accountManager.getAccountUpdate(action.toAccount);
        
        // Check if swap is already completed or failed
        if (accountSwap.getCustomProperty('status') !== 'pending') {
            await this.network.ledger.actionCallbacks.removeCallback(swapHash);
            return true;
        }

        // Check if deadline has passed
        if (currentTimestamp >= parseInt(accountSwap.getCustomProperty('deadline'))) {
            await this.handleTimeout(action, accountSwap);
            return true;
        }

        // Check target network for completion
        await this.checkTargetNetwork(action, accountSwap);
        await accountManager.applyUpdates();

        return true;
    }

    async handleTimeout(action, accountSwap) { 
        // Create a new refund action that sends the balance back to the swap creator
        const refund = new RefundActionProcessor(this.network);
        const createResult = await refund.createAction(accountSwap.getCustomProperty('sender'), accountSwap.getCustomProperty('swapAccount'), accountSwap.getBalance());

        if(createResult.state == 'VALID')
        {
            this.network.consensus.proposeAction(createResult.action, async (confirmedAction)=>{
                await this.network.ledger.actionCallbacks.removeCallback(action.hash);
                if(confirmedAction)
                    this.notifyTargetNetwork(confirmedAction);
            });
        }
    }

    async checkTargetNetwork(action, accountSwap) {
        if (!this.network.node) return;

        const networkMessage = {
            type: 'checkSwapStatus',
            swapHash: action.hash,
            timestamp: Date.now()
        };

        try {
            this.network.node.sendTargetNetwork(action.targetNetwork, networkMessage, 
                async (response) => {
                    if (response && response.status === 'completed') {
                        await this.completeSwap(action, accountSwap);
                    }
                });
        } catch (error) {
            this.network.node.error(error);
        }
    }

    async completeSwap(action, accountSwap) {
        const accountManager = new AccountUpdateManager(this.network.ledger);
        accountSwap.updateCustomProperty('status', 'completed');
        await accountManager.applyUpdates();
        await this.network.ledger.actionCallbacks.removeCallback(action.hash);
    }
}

module.exports = OfferInstructionCallback;