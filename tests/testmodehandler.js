const path = require('path');
const fs = require('fs');
const Wallet = require('../core/wallet/wallet.js');
const SendInstruction = require('../core/system/instruction/types/send/send.js');
const Decimal = require('decimal.js');

class TestModeHandler {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.excludedModules = ['desk'];
    }

    /**
     * Reset both configs and databases
     */
    fullReset() {
        console.log('Performing full reset (configs and databases)...');
        this.processWebModules(true, true);
    }

    /**
     * Reset only databases for sync
     */
    syncReset() {
        console.log('Performing sync reset (databases only)...');
        this.processWebModules(false, true);
    }

    /**
     * Process all web modules based on specified operations
     * @param {boolean} resetConfigs - Whether to reset networkIds in configs
     * @param {boolean} resetDatabases - Whether to clean databases
     */
    processWebModules(resetConfigs = false, resetDatabases = false) {
        const websDir = path.join(this.baseDir, 'webs');
        const webModules = fs.readdirSync(websDir);
        
        webModules
            .filter(module => !this.excludedModules.includes(module))
            .forEach(module => {
                const configPath = path.join(websDir, module, 'config', 'config.js');
                this.processModule(configPath, module, resetConfigs, resetDatabases);
            });
    }

    /**
     * Process a single module
     */
    processModule(configPath, module, resetConfigs, resetDatabases) {
        if (!fs.existsSync(configPath)) return;

        try {
            let config = require(configPath);
            let configModified = false;
            
            if (config.networks) {
                Object.keys(config.networks).forEach(network => {
                    const networkConfig = config.networks[network];
                    
                    // Reset networkId if requested
                    if (resetConfigs && networkConfig.networkId) {
                        delete networkConfig.networkId;
                        configModified = true;
                    }

                    // Clean database if requested
                    if (resetDatabases && networkConfig.dbPath) {
                        const dbPath = path.join(this.baseDir, networkConfig.dbPath);
                        this.cleanDatabase(dbPath);
                    }
                });
                
                // Write back the modified config if changes were made
                if (configModified) {
                    fs.writeFileSync(
                        configPath,
                        `module.exports = ${JSON.stringify(config, null, 4)};`
                    );
                    console.log(`Updated config for ${module}`);
                }
            }
        } catch (err) {
            console.error(`Error processing module ${module}:`, err);
        }
    }

    /**
     * Clean database directory
     */
    cleanDatabase(dbPath) {
        if (fs.existsSync(dbPath)) {
            try {
                fs.rmSync(dbPath, { recursive: true, force: true });
                console.log(`Removed database directory: ${dbPath}`);
            } catch (err) {
                console.error(`Error removing database directory ${dbPath}:`, err);
            }
        }
    }

    async runBlockValidationTest(network) {
        console.log('Running block validation test...');
        const Block = require('../core/system/block/block.js');
        const BlockHelper = require('../core/utils/blockhelper.js');

        const block = network.ledger.getBlockWithActions(network.ledger.getLastBlockHash());
        const blockObject = new Block(block);
        const firstNode = Object.keys(blockObject.validatorSignatures)[0];
        const validationResult = await BlockHelper.verifySignatureWithPublicKey(blockObject, blockObject.validatorSignatures[firstNode], firstNode);
        console.log(validationResult);
    }

    async stressLedger(network, numCalls = 100000) {
        console.log('Stressing ledger with get calls...');
        const ledger = network.ledger;
        const startTime = Date.now();
        let dbEntry = null;
        for(let i = 0; i < numCalls; i++) {
            if(i % 1000 === 0) console.log(`Total calls: ${i} in ${numCalls} ${(Date.now() - startTime)/1000}s`);
            dbEntry = ledger.getLastBlock();
        }
        const endTime = Date.now();
        const duration = endTime - startTime;
        console.log(`Time taken: ${duration}ms`);
        console.log(dbEntry)
    }

    async stressLedger2(network, numCalls = 100000) {
        const testObject = {
            hash: '3a81edae3c97212a1f8f59bcad13e4547a3e33373771412cb05700cf8ab91454',
            previousBlockHash: null,
            actions: [
              '441ac65533c1779ce1787d02400bf48c2ac024081c05f263695c86d93bc8d939'
            ],
            timestamp: 1740023150228,
            creator: '7421d9d0a2552e2fa0c17d60196334dc39ea6bd34976fcaa9c1dff8deca916a2',
            crossNetworkActions: { hashes: [], baseHash: null, validatorSignatures: {} },
            validatorSignatures: {
              '73ef501053557e8bac3c3299f445fb5456de1226369a0bcbac2a6f129bb2dde0': 'qwSacHAAwdebyHluzWodNYzNnat/9zK2RSIY7z7kWopeedx9igaRGCs9wtXL26i8AoKAKZZp93Ys9GxOETj1BA==',
              '7421d9d0a2552e2fa0c17d60196334dc39ea6bd34976fcaa9c1dff8deca916a2': 'w1oVGJ3GPT4EeIDyFGEJ9hKxloC2COjQMrSrbvUDWg95lU0sys8xE4R0nlWQPkzikAilHvLpcoeFLp0CAsFwAA=='
            }
          };

        const lmdb = require('lmdb');
        // Open the database
        const db = lmdb.open({
            path: './test'
        });
        
        // First, let's put a value
        await db.put('test-key', testObject);
    
        const startTime = process.hrtime.bigint();
        
        // Run 100k gets
        for (let i = 0; i < 100000; i++) {
            const value = await db.get('test-key');
            console.log(value);
        }
    
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1e6; // Convert to milliseconds
    
        console.log(`Completed 100,000 reads in ${duration.toFixed(2)}ms`);
        console.log(`Average read time: ${(duration / 100000).toFixed(4)}ms per operation`);
    
        // Cleanup
        await db.close();
    }

    async makeDelegatorPrimary(network) {
        // We'll send 70% of the balance to the delegator if the delegator has no balance yet
        const genesisAccountId = network.ledger.getGenesisAccount();
        const genesisAccount = network.ledger.getAccount(genesisAccountId);
        const delegatorTestAddress = '01c9decec4dee54f7f9b0d8490ee7ee6c58248f9de6c616444df8834c6955aa6';
        const delegator = network.ledger.getAccount(delegatorTestAddress);
        
        if(!delegator || new Decimal(delegator.balance).eq(0)) {
            console.log('Sending 70% balance to delegator');
            const seventyPercentBalance = new Decimal(genesisAccount.balance).mul(0.7).toString();
            const creationResult = await network.actionManager.createAction({
                type: 'send',
                account: genesisAccountId,
                toAccount: delegatorTestAddress,
                amount: seventyPercentBalance,
            });
            network.consensus.proposeAction(creationResult.action, (confirmedAction) => {
                console.log('Sent 70% balance to delegator');
            });
        }
    }

    async prepareNetwork(network) {
        console.log('Preparing network for multi node validation...');
        // We'll send half the balance to the delegator if the delegator has no blanace yet
        const genesisAccountId = network.ledger.getGenesisAccount();
        const genesisAccount = network.ledger.getAccount(genesisAccountId);
        const delegatorTestAddress = '01c9decec4dee54f7f9b0d8490ee7ee6c58248f9de6c616444df8834c6955aa6';
        const delegator = network.ledger.getAccount(delegatorTestAddress);
        
        if(!delegator || new Decimal(delegator.balance).eq(0)) {
            console.log('Sending half balance to delegator');
            const halfBalance = new Decimal(genesisAccount.balance).div(2).toString();
            const creationResult = await network.actionManager.createAction({
                type: 'send',
                account: genesisAccountId,
                toAccount: delegatorTestAddress,
                amount: halfBalance,
            });
            network.consensus.proposeAction(creationResult.action, (confirmedAction) => {
                console.log('Sent half balance to delegator');
            });
        }
    }

    /**
     * Find the genesis wallet file in the wallets directory
     * @returns {string|null} Path to genesis wallet or null if not found
     */
    findGenesisWallet(network) {
        const walletsDir = path.join(process.cwd(), 'wallets');
        const files = fs.readdirSync(walletsDir);
        console.log(network.webName, network.networkId);
        // Find the first file that matches the pattern (excluding node.json)
        const genesisWallet = files.find(file => 
            file === `${network.webName}_${network.networkId.substring(0, 12)}.json`
        );

        return genesisWallet ? path.join(walletsDir, genesisWallet) : null;
    }

    async analyzeLmdbSize(network) {
        console.log('Analyzing LMDB database size for network:', network.networkId);
        
        // Get database path from network
        const dbPath = path.join(this.baseDir, network.ledger.storage.path);
        console.log(`Database path: ${dbPath}`);
        
        // Get file sizes
        const dbFiles = fs.readdirSync(dbPath);
        let totalSize = 0;
        
        console.log('\nDatabase files:');
        dbFiles.forEach(file => {
            const filePath = path.join(dbPath, file);
            const stats = fs.statSync(filePath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            totalSize += stats.size;
            console.log(`${file}: ${fileSizeMB} MB`);
        });
        
        console.log(`\nTotal database size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
        
        // Analyze each database collection
        console.log('\nCollection statistics:');
        
        const collections = [
            { name: 'actions', db: network.ledger.actions },
            { name: 'accounts', db: network.ledger.accounts },
            { name: 'accountHistory', db: network.ledger.accountHistory },
            { name: 'voteweight', db: network.ledger.voteweight },
            { name: 'blocks', db: network.ledger.blocks },
            { name: 'crossactions', db: network.ledger.crossactions }
        ];
        
        for (const collection of collections) {
            try {
                const count = collection.db.getCount();
                console.log(`\n${collection.name}: ${count} entries`);
                
                // Sample data size analysis
                const sampleSize = Math.min(100, count);
                if (sampleSize > 0) {
                    let totalEntrySize = 0;
                    let largestEntry = { key: null, size: 0 };
                    let entrySizes = [];
                    
                    // Get a sample of entries
                    const entries = collection.db.getRange({}).slice(0, sampleSize);
                    
                    for (const entry of entries) {
                        const entrySize = this.getObjectSize(entry.value);
                        totalEntrySize += entrySize;
                        entrySizes.push(entrySize);
                        
                        if (entrySize > largestEntry.size) {
                            largestEntry = { 
                                key: entry.key, 
                                size: entrySize,
                                sample: this.truncateObject(entry.value)
                            };
                        }
                    }
                    
                    const avgSize = totalEntrySize / sampleSize;
                    const estimatedTotalSize = avgSize * count / (1024 * 1024);
                    
                    console.log(`  Average entry size: ${avgSize.toFixed(2)} bytes`);
                    console.log(`  Estimated total data size: ${estimatedTotalSize.toFixed(2)} MB`);
                    console.log(`  Largest entry: ${largestEntry.size} bytes`);
                    console.log(`  Largest entry key: ${largestEntry.key}`);
                    console.log(`  Largest entry sample:`, largestEntry.sample);
                    
                    // Calculate size distribution
                    entrySizes.sort((a, b) => a - b);
                    const median = entrySizes[Math.floor(entrySizes.length / 2)];
                    console.log(`  Median entry size: ${median} bytes`);
                    
                    // Check for potential issues
                    if (largestEntry.size > avgSize * 10) {
                        console.log(`  WARNING: Some entries are much larger than average!`);
                    }
                }
            } catch (err) {
                console.log(`  Error analyzing ${collection.name}: ${err.message}`);
            }
        }
        
        // Check for database fragmentation
        console.log('\nChecking for database fragmentation...');
        try {
            const env = network.ledger.storage.env;
            if (env && env.stat) {
                const stats = env.stat();
                console.log(`  Page size: ${stats.psize} bytes`);
                console.log(`  Total pages: ${stats.pages}`);
                console.log(`  Free pages: ${stats.free_pages}`);
                const fragmentation = (stats.free_pages / stats.pages) * 100;
                console.log(`  Fragmentation: ${fragmentation.toFixed(2)}%`);
                
                if (fragmentation > 20) {
                    console.log(`  WARNING: High fragmentation detected! Consider compacting the database.`);
                }
            } else {
                console.log('  Unable to access LMDB environment statistics');
            }
        } catch (err) {
            console.log(`  Error checking fragmentation: ${err.message}`);
        }
        
        console.log('\nAnalysis complete!');
    }

    // Helper method to calculate object size in bytes
    getObjectSize(obj) {
        const str = JSON.stringify(obj);
        // UTF-16 strings use 2 bytes per character
        return str.length * 2;
    }

    // Helper method to truncate large objects for display
    truncateObject(obj) {
        const str = JSON.stringify(obj);
        if (str.length <= 200) return obj;
        
        // For arrays, show first few elements
        if (Array.isArray(obj)) {
            return [...obj.slice(0, 3), `... (${obj.length - 3} more items)`];
        }
        
        // For objects, show a few properties
        if (typeof obj === 'object' && obj !== null) {
            const truncated = {};
            const keys = Object.keys(obj);
            keys.slice(0, 3).forEach(key => {
                truncated[key] = obj[key];
            });
            if (keys.length > 3) {
                truncated['...'] = `(${keys.length - 3} more properties)`;
            }
            return truncated;
        }
        
        return str.substring(0, 100) + '...';
    }
}

module.exports = TestModeHandler; 