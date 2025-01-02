#!/usr/bin/env node

const ConfigHandler = require('./core/utils/confighandler.js');
const DecentralizedNetwork = require('./core/decentralizednetwork.js');
const path = require('path');
const fs = require('fs');

// Get command-line arguments
const args = process.argv.slice(2);  // Get arguments excluding the first two default ones (node and script path)

// Check if --test argument is passed
const isTestMode = args.includes('--test');

// Initialize the decentralized network
const dnet = new DecentralizedNetwork();

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

/*
// Initialize a blockchain network with or without test mode
dnet.add(new Blockchain({ testMode: isTestMode }), 'blockchain');

// Frontend Desk Service (Controlling node, providing access to all networks and apps)
dnet.add(new Desk({ testMode: isTestMode }), 'desk');
*/

// Name service
// dapp.add(new NameService({ testMode: isTestMode }), 'nameservice');

// File storage
// dapp.add(new StorageNet(), 'storagenet');

// Notification service (broadcaster)

// Email

// Login

// VPN

// Chat

// Tickers?

// Directory?
// Registering new networks, declaring the trusted nodes

// Exchange


// Network ID's need to be replaced with the genesis hash?
// That way communication is done to not a locally declared but global ID hash of the network
// Config folder that holds the configs for each network based on it's genesis hash?
