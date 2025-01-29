const crypto = require('crypto');
const AccountUpdateManager = require('../../../ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class OfferBlockCallback {
    constructor(network) {
        this.network = network;
        this.lastCallTime = false;
    }

    async blockCallback(block) {
        const currentTimestamp = Math.floor(Date.now() / 1000);

        // Throttle checks
        if (this.lastCallTime && (currentTimestamp - this.lastCallTime) < 60) {
            return true;
        }
        this.lastCallTime = currentTimestamp;

        const swapHash = block.hash;
        const accountManager = new AccountUpdateManager(this.network.ledger);
        const accountSwap = await accountManager.getAccountUpdate(block.toAccount);
        
        // Check if swap is already completed or failed
        if (accountSwap.getCustomProperty('status') !== 'pending') {
            await this.network.ledger.blockCallbacks.removeCallback(swapHash);
            return true;
        }

        // Check if deadline has passed
        if (currentTimestamp >= parseInt(accountSwap.getCustomProperty('deadline'))) {
            await this.handleTimeout(block, accountSwap);
            return true;
        }

        // Check target network for completion
        await this.checkTargetNetwork(block, accountSwap);
        await accountManager.applyUpdates();

        return true;
    }

    async handleTimeout(block, accountSwap) { 
        // Create a new refund block that sends the balance back to the swap creator
        const refund = new RefundBlockProcessor(this.network);
        const newBlock = await refund.createNewBlock(accountSwap.getCustomProperty('sender'), accountSwap.getCustomProperty('swapAccount'), accountSwap.getBalance());

        if(newBlock.state == 'VALID')
        {
            this.network.consensus.proposeBlock(newBlock.block, async (confirmedBlock)=>{
                await this.network.ledger.blockCallbacks.removeCallback(block.hash);
                if(confirmedBlock)
                    this.notifyTargetNetwork(confirmedBlock);
            });
        }
    }

    async checkTargetNetwork(block, accountSwap) {
        if (!this.network.node) return;

        const networkMessage = {
            type: 'checkSwapStatus',
            swapHash: block.hash,
            timestamp: Date.now()
        };

        try {
            this.network.node.sendTargetNetwork(block.targetNetwork, networkMessage, 
                async (response) => {
                    if (response && response.status === 'completed') {
                        await this.completeSwap(block, accountSwap);
                    }
                });
        } catch (error) {
            this.network.node.error(error);
        }
    }

    async completeSwap(block, accountSwap) {
        const accountManager = new AccountUpdateManager(this.network.ledger);
        accountSwap.updateCustomProperty('status', 'completed');
        await accountManager.applyUpdates();
        await this.network.ledger.blockCallbacks.removeCallback(block.hash);
    }
}

module.exports = OfferBlockCallback;