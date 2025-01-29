const path = require('path');
const fs = require('fs');

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
}

module.exports = TestModeHandler; 