const Hasher = require('../../../core/utils/hasher.js');
const Decimal = require('decimal.js');
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;
const cheerio = require('cheerio');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.actionManager = network.actionManager;
        this.tfidf = new TfIdf();
    }

    async handleMessage(message, req, res) {
        try {
            const method = message.method;

            switch (method) {
                case 'search':
                    this.handleSearch(res, message);
                    return true;
                case 'submitPage':
                    this.handleSubmitPage(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error('Error in search RPC message handler: ' + err.message, err);
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request' });
            return true;
        }

        return false;
    }

    async handleSearch(res, data) {
        const { query } = data;
        
        // Handle autocomplete requests
        if (data.autocomplete) {
            const suggestions = await this.network.ledger.getAutocompleteSuggestions(query.toLowerCase());
            this.node.SendRPCResponse(res, { 
                success: true, 
                suggestions 
            });
            return;
        }
        
        // Regular search
        const queryTokens = tokenizer.tokenize(query.toLowerCase());
        const candidates = await this.network.ledger.getRelevantPages(queryTokens);
        
        // Refine results with semantic similarity
        const results = candidates.map(page => {
            const semanticScore = this.calculateSemanticSimilarity(queryTokens, page.tokens);
            const snippet = this.createSnippet(page.content, queryTokens);
            
            return {
                title: page.title,
                description: snippet,
                contentId: page.contentId,
                score: page.score * (1 + semanticScore)
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

        this.node.SendRPCResponse(res, { 
            success: true, 
            results 
        });
    }

    async handleSubmitPage(res, data) {
        const { url } = data;
        if (!url.includes('@') || !url.startsWith('dweb://')) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: 'Invalid URL format' 
            });
            return;
        }

        try {
            const contentId = url.replace('dweb://', '');
            const [contentIdPart, targetNetworkId] = contentId.split('@');
            
            // Set the peer message type
            const request = { type: 'getFile', contentId: contentIdPart };
            // Get the content from the target network
            const relayResult = await this.network.node.relayToTargetNetwork(
                targetNetworkId, 
                request,
                async (response) => {
                    if (response.timedOut) {
                        this.node.SendRPCResponse(res, { 
                            success: false, 
                            message: 'Content could not be fetched' 
                        });
                    } else {
                        if(response.file.instruction.isEncrypted) {
                            this.node.SendRPCResponse(res, { 
                                success: false, 
                                message: `Content is encrypted, can't be indexed` 
                            });
                        }
                        else {
                            // Extract metadata
                            const metadata = await this.extractMetadata(response.file.instruction.data);
                            
                            // Create the action
                            const createResult = await this.network.actionManager.createAction({
                                account: this.network.node.nodeId,
                                type: 'index',
                                toAccount: `${contentIdPart}@${targetNetworkId}`,
                                delegator: this.network.node.nodeId,
                                amount: '0',
                                title: metadata.title,
                                description: metadata.description,
                                content: metadata.content,
                                tokens: tokenizer.tokenize(
                                    (metadata.title + ' ' + metadata.description).toLowerCase()
                                ).sort(),
                                contentHash: await Hasher.hashText(metadata.content)
                            });

                            if(createResult.state == 'VALID') {
                                const action = createResult.action;
                                // Propose the action
                                const result = this.network.consensus.proposeAction(action);
                                if(result) {
                                    this.node.SendRPCResponse(res, { 
                                        success: true, 
                                        message: 'Page indexed successfully'
                                    });
                                }
                                else {
                                    this.node.SendRPCResponse(res, { 
                                        success: false, 
                                        message: 'Page index request failed'
                                    });
                                }
                            }
                            else {
                                this.node.SendRPCResponse(res, { 
                                    success: false, 
                                    message: 'Failed to create action'
                                });
                            }
                        }
                    }
                }
            );

            // Relay failed
            if (!relayResult) {
                this.node.SendRPCResponse(res, { 
                    success: false, 
                    message: 'Content could not be accessed' 
                });
                return;
            }


        } catch (error) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: 'Error processing request: ' + error.message 
            });
        }
    }

    // Metadata extraction (same as validator)
    async extractMetadata(content) {
        const $ = cheerio.load(content);
        
        let title = $('meta[name="title"]').attr('content') ||
                   $('meta[property="og:title"]').attr('content') ||
                   $('title').text() ||
                   $('h1').first().text();

        if (!title) {
            const textContent = $('body').text().trim();
            title = textContent.split(/\s+/).slice(0, 5).join(' ');
        }

        let description = $('meta[name="description"]').attr('content') ||
                         $('meta[property="og:description"]').attr('content') ||
                         $('p').first().text();

        if (!description) {
            const textContent = $('body').text().trim();
            description = textContent.split(/[.!?]+/)[0];
        }

        let textContent = $('body').text()
            .replace(/\s+/g, ' ')
            .trim();

        return {
            title: title.trim().substring(0, 200),
            description: description.trim().substring(0, 500),
            content: textContent.substring(0, 1000)
        };
    }

    // Helper methods
    calculateTermFrequency(term, tokens) {
        const termCount = tokens.filter(t => t === term).length;
        return termCount / tokens.length;
    }

    calculateInverseDocumentFrequency(term, documents) {
        let documentCount = 0;
        documents.forEach(doc => {
            if (doc.tokens.includes(term)) documentCount++;
        });
        return Math.log(documents.length / (1 + documentCount));
    }

    calculateSemanticSimilarity(queryTokens, docTokens) {
        const querySet = new Set(queryTokens);
        const docSet = new Set(docTokens);
        const intersection = new Set([...querySet].filter(x => docSet.has(x)));
        const union = new Set([...querySet, ...docSet]);
        return intersection.size / union.size;
    }

    createSnippet(content, queryTokens) {
        // Find the most relevant section of content
        const sentences = content.split(/[.!?]+/);
        let bestScore = 0;
        let bestSnippet = '';

        sentences.forEach(sentence => {
            const sentenceTokens = tokenizer.tokenize(sentence.toLowerCase());
            const score = this.calculateSemanticSimilarity(queryTokens, sentenceTokens);
            
            if (score > bestScore) {
                bestScore = score;
                bestSnippet = sentence;
            }
        });

        // If no good match found, use first few sentences
        if (!bestSnippet) {
            bestSnippet = sentences.slice(0, 2).join('. ');
        }

        // Truncate and clean up snippet
        return this.truncateSnippet(bestSnippet);
    }

    truncateSnippet(text, maxLength = 160) {
        if (text.length <= maxLength) return text;
        
        // Try to cut at last complete word
        const truncated = text.substr(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        
        return truncated.substr(0, lastSpace) + '...';
    }
}

module.exports = RPCMessageHandler;
