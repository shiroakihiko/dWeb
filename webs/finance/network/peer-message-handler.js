const RewardBlockProcessor = require('../core/blockprocessors/reward/reward.js');
class FinancePeerMessageHandler {

    constructor(network) {
        this.network = network;
    }

    async handleMessage(data, socket) {
        try {
            if (data.type === 'createReward') {
                this.handleCreateReward(data, socket);
                return true;
            }
        } catch(err) {
            this.network.node.error(err);
            return true;
        }

        return false;
    }

    handleCreateReward(data, socket) {
        this.network.node.info(`Cross network message for rewarding received! ${JSON.stringify(data)}`);
        
        const sourceNetworkId = data.sourceNetworkId; 
        const consensusBlock = data.consensusBlock;
        
        //if(sourceNetworkId != '') // Network we accept
        //    return false;

        // Verify all signatures, cross check with our local table of trusted peers for the governance network and verify their 67% quorum
        
        const rewardBlockProcessor = new RewardBlockProcessor(this.network);
        const rewardBlock = rewardBlockProcessor.createNewBlock(consensusBlock, sourceNetworkId, this.network.node.nodePrivateKey);
        this.network.node.log(`Reward creation state: ${rewardBlock.state}`);
        if(rewardBlock.state == 'VALID')
            this.network.consensus.proposeBlock(rewardBlock.block);
    }
}

module.exports = FinancePeerMessageHandler;
