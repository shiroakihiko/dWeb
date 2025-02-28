const EventEmitter = require('events');

class ProposalQueue extends EventEmitter {
    constructor(network) {
        super();
        this.network = network;
        this.queue = new Map(); // hash -> ProposalItem
        this.maxQueueSize = 1000;
        this.maxAge = 60000; // 1 minute
    }

    /**
     * Add a proposal to the queue
     * @param {Proposal} proposal 
     * @param {number} priority 
     * @returns {boolean} Success
     */
    async enqueue(proposal, priority = 1) {
        if (this.queue.size >= this.maxQueueSize) {
            this.network.node.warn('Proposal queue is full');
            return false;
        }

        const item = {
            proposal,
            priority,
            addedAt: Date.now()
        };

        this.queue.set(proposal.hash, item);
        this.emit('proposal:queued', proposal);
        return true;
    }

    /**
     * Get next proposal from queue
     */
    async getNext() {
        const now = Date.now();
        let bestItem = null;
        let bestPriority = -1;

        for (const [hash, item] of this.queue) {
            // Skip expired items
            if (now - item.addedAt >= this.maxAge) {
                this.queue.delete(hash);
                continue;
            }

            if (item.priority > bestPriority) {
                bestPriority = item.priority;
                bestItem = item;
            }
        }

        return bestItem?.proposal || null;
    }

    /**
     * Remove proposal from queue
     */
    remove(hash) {
        this.queue.delete(hash);
    }

    getQueueMetrics() {
        return {
            queueSize: this.queue.size
        };
    }
}

module.exports = ProposalQueue; 