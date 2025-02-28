#!/usr/bin/env node

const ConfigHandler = require('./core/utils/confighandler.js');
const DecentralizedNetwork = require('./core/decentralizednetwork.js');
const path = require('path');
const fs = require('fs');
const TestModeHandler = require('./tests/testmodehandler.js');
const { spawn } = require('child_process');

// Android requires a change of directory to the script's directory
if(process.platform == 'android')
{
    process.chdir(path.dirname(__filename));
    console.log(process.cwd());
}

// Get command-line arguments
const args = process.argv.slice(2);

// Check for test modes
const isTestLedger = args.includes('--test-ledger');
const isTestMode = args.includes('--test');
const isTestReset = args.includes('--test-reset');
const isTestSync = args.includes('--test-sync');
const isTestBlockValidation = args.includes('--test-block-validation');
const isTestDelegator = args.includes('--test-delegator');
const isAnalyzeDb = args.includes('--analyze-db');
const isAnalyzeActionProps = args.includes('--analyze-action-props');

// Handle test modes
if (isTestReset || isTestSync) {
    const testHandler = new TestModeHandler(__dirname);
    
    if (isTestReset) {
        testHandler.fullReset();
    } else if (isTestSync) {
        testHandler.syncReset();
    }
    
    process.exit(0);
}

// Initialize the decentralized network
const dnet = new DecentralizedNetwork();
dnet.initialize(() => {
    // Load main config
    const mainConfig = ConfigHandler.getMainConfig();

    // Load all network modules with their configs
    if(mainConfig)
    {
        dnet.logger.setLogLevel(mainConfig.logLevel);
        mainConfig.enabledNetworks.forEach((webModule) => {
            dnet.add(webModule);
        });
    }
});

if(isTestDelegator)
{
    setTimeout(() => {
        const testHandler = new TestModeHandler(__dirname);
        dnet.logger.setLogLevel('debug');
        for(const [networkId, network] of dnet.networks)
        {
            if(networkId === 'desk' || !network.ledger)
                continue;
            testHandler.makeDelegatorPrimary(network);
        }
    }, 10000);
}
if(isTestLedger)
{
    setTimeout(() => {
        const testHandler = new TestModeHandler(__dirname);
        dnet.logger.setLogLevel('debug');
        let inum = 0;
        for(const [networkId, network] of dnet.networks)
        {
            if(networkId === 'desk')
                continue;
            testHandler.stressLedger(network);
            
            if(inum >= 2)
                break; 
            inum += 1;
        }
    }, 10000);
}
if(isTestBlockValidation)
{
    setTimeout(() => {
        const testHandler = new TestModeHandler(__dirname);
        for(const [networkId, network] of dnet.networks)
        {
            if(networkId === 'desk')
                continue;
            testHandler.runBlockValidationTest(network);
        }
    }, 10000);
}
if(isAnalyzeDb) {
    setTimeout(() => {
        const testHandler = new TestModeHandler(__dirname);
        for(const [networkId, network] of dnet.networks) {
            if(networkId === 'desk' || !network.ledger)
                continue;
            testHandler.analyzeLmdbSize(network);
        }
    }, 10000);
}
if(isAnalyzeActionProps) {
    setTimeout(() => {
        const testHandler = new TestModeHandler(__dirname);
        for(const [networkId, network] of dnet.networks) {
            if(networkId === 'desk' || !network.ledger)
                continue;
            testHandler.analyzeActionProperties(network);
        }
    }, 10000);
}

// Sig close
process.on('SIGINT', async () => {
    console.log('SIGINT received');
    await dnet.stop();
    process.exit();
});
