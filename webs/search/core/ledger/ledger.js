const Ledger = require('../../../../core/ledger/ledger.js');
const Hasher = require('../../../../core/utils/hasher');

class SearchLedger extends Ledger {
    constructor(dbPath) {
        super(dbPath);
    }

    async initialize() {
        await super.initialize();
        
        // Initialize search-specific DBs
        this.termIndex = await this.storage.openDB({ name: 'termIndex' });
        this.prefixIndex = await this.storage.openDB({ name: 'prefixIndex' });
        this.contentIndex = await this.storage.openDB({ name: 'contentIndex' });
        
        // Cache settings
        this.queryCache = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        this.MAX_CACHE_SIZE = 1000;
    }

    async getAutocompleteSuggestions(prefix, limit = 5) {
        const prefixHash = await Hasher.hashText('term:' + prefix)
        const prefixAccount = this.getAccount(prefixHash);
        if (!prefixAccount) return [];

        const terms = prefixAccount.terms || [];
        const sortedTerms = [];
        for (const term of terms) {
            const termHash = await Hasher.hashText('term:' + term);
            const termAccount = this.getAccount(termHash);
            sortedTerms.push({
                term,
                count: termAccount?.docs?.length || 0
            });
        }

        return sortedTerms
            .sort((a, b) => b.count - a.count)
            .slice(0, limit)
            .map(item => item.term);
    }

    async getRelevantPages(queryTokens) {
        // Check cache first
        const cacheKey = queryTokens.sort().join('|');
        const cachedResults = this.getCachedResults(cacheKey);
        if (cachedResults) return cachedResults;

        const scores = new Map();
        let totalDocs = 0;

        // Count indexed documents
        const entries = this.accounts.getRange({});
        console.log('entries', entries);
        for (const entry of entries) {
            const account = entry.value;
            if (account.contentInfo) totalDocs++;
        }

        // Calculate scores using TF-IDF
        for (const token of queryTokens) {
            const termAccount = this.getAccount(await Hasher.hashText('term:' + token));
            if (!termAccount?.docs) continue;

            const idf = Math.log(totalDocs / (1 + termAccount.docs.length));
            termAccount.docs.forEach(({ contentId, weight }) => {
                scores.set(contentId, (scores.get(contentId) || 0) + (weight * idf));
            });
        }

        // Get top results
        const results = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([contentId, score]) => {
                const account = this.getAccount(contentId);
                const { title, description, content } = account.contentInfo;
                return { contentId, title, description, content, score };
            });

        this.cacheResults(cacheKey, results);
        return results;
    }

    getCachedResults(query) {
        const cached = this.queryCache.get(query);
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached.results;
        }
        return null;
    }

    cacheResults(query, results) {
        this.queryCache.set(query, {
            results,
            timestamp: Date.now()
        });
        this.cleanupCache();
    }

    cleanupCache() {
        const now = Date.now();
        for (const [query, data] of this.queryCache.entries()) {
            if (now - data.timestamp > this.CACHE_DURATION) {
                this.queryCache.delete(query);
            }
        }

        if (this.queryCache.size > this.MAX_CACHE_SIZE) {
            const entries = Array.from(this.queryCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
            toRemove.forEach(([query]) => this.queryCache.delete(query));
        }
    }
}

module.exports = SearchLedger; 