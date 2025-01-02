

class Broadcaster {
    constructor(node) {
        this.node = node;
    }

    // Broadcast votes to connected peers
    broadcastVotes(blocks) {
        this.node.peers.peerManager.connectedPeers.forEach((socket) => {
            this.node.sendMessage(socket, {
                type: 'blockVotes',
                blocks
            });
        });
        this.node.info(`Vote sent for ${blocks.length} blocks.`);
    }

    // Broadcast block confirmation to all peers
    broadcastBlockConfirmation(block) {
        this.node.sendAll({
            type: 'block_confirmation',
            block: block
        });
        this.node.sendSubscriberMessage('block_confirmation', { block: block });
        
        if(block.type == 'networkUpdate')
        {
            this.node.sendOtherNetworks({
                type: 'networkUpdate',
                block: block
            });
        }

        this.node.info(`Block ${block.hash} has been confirmed and broadcasted to peers.`);
    }

    // Broadcast network updates to all peers and other networks
    broadcastNetworkUpdate(block) {
        // Let nodes know we updated the networks data
        this.node.sendAll({
            type: 'localNetworkUpdateConfirmed',
            block: block
        });

        // Let other networks know about that update
        this.node.sendOtherNetworks({
            type: 'networkUpdate',
            block: block
        });

        this.node.log(`Block ${blockId} has been confirmed and broadcasted to peers.`);
    }

    // Broadcast logs to connected desk users
    broadcastLog(log) {
        this.node.sendSubscriberMessage('log_update', { log: log });
    }
}

module.exports = Broadcaster;
