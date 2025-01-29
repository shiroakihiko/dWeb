class VoteQueue {
    constructor(network) {
        this.network = network;
        this.queues = new Map(); // electionId -> PriorityQueue
        this.processing = new Map();
        this.batchSize = 50;
        this.processInterval = 1000; // 1 second

        setInterval(() => this.processPendingVotes(), this.processInterval);
    }

    async addVote(vote, fromNodeId) {
        const weight = await this.network.ledger.getVoteWeight(vote.voterId) || '0';
        const timestamp = Date.now();
        const hash = await this.network.node.hash(`${vote.electionId}:${vote.voterId}:${timestamp}`);

        if (!this.queues.has(vote.electionId)) {
            this.queues.set(vote.electionId, []);
        }

        this.queues.get(vote.electionId).push({
            vote,
            fromNodeId,
            weight: new Decimal(weight),
            timestamp,
            hash
        });
    }

    async processPendingVotes() {
        for (const [electionId, queue] of this.queues.entries()) {
            if (queue.length === 0 || this.processing.has(electionId)) continue;

            this.processing.set(electionId, true);
            try {
                // Sort by weight first, then by hash for deterministic ordering
                queue.sort((a, b) => {
                    const weightDiff = b.weight.minus(a.weight);
                    if (!weightDiff.isZero()) return weightDiff.toNumber();
                    return a.hash.localeCompare(b.hash);
                });

                const batch = queue.splice(0, this.batchSize);
                await Promise.all(batch.map(item => 
                    this.network.consensus.electionManager.processVote(
                        item.vote.electionId,
                        item.vote.voterId,
                        item.vote.candidateId,
                        item.vote.signature,
                        item.weight.toString()
                    )
                ));
            } finally {
                this.processing.delete(electionId);
            }
        }
    }

    getMetrics() {
        return {
            queuedVotes: Array.from(this.queues.entries()).reduce(
                (acc, [electionId, queue]) => ({
                    ...acc,
                    [electionId]: queue.length
                }), {}
            ),
            processingElections: Array.from(this.processing.keys())
        };
    }
}

module.exports = VoteQueue; 