const path = require('path');
const fs = require('fs');

class ConfigHandler {
    // Get the main config
    static getMainConfig() {
        const configPath = path.join(process.cwd(), 'config', 'config.js');
        if (!fs.existsSync(configPath)) {
            return null;
        }
        const config = require(configPath);
        return config;
    }

    // Load a Web by name (finance, chat, etc.)
    static loadWeb(webName) {
        const webPath = path.join(process.cwd(), 'webs', webName, 'config', 'config.js');
        try {
            const webConfig = require(webPath);
            ConfigHandler.webs[webName] = webConfig;  // Store in static `webs`
        } catch (error) {
            console.error(`Error loading ${webName} web:`, error);
        }
    }

    // Get all networks from a specific Web, loads dynamically if not already loaded
    static getNetworks(webName) {
        if (!ConfigHandler.webs[webName]) {
            ConfigHandler.loadWeb(webName);  // Dynamically load the web config if not already loaded
        }

        const web = ConfigHandler.webs[webName];
        if (web) {
            return web.networks;
        }
        return null;  // Or throw an error if the web doesn't exist
    }

    // Get a specific network config from a Web, loads dynamically if not already loaded
    static getNetwork(webName, networkName) {
        if (!ConfigHandler.webs[webName]) {
            ConfigHandler.loadWeb(webName);  // Dynamically load the web config if not already loaded
        }

        const web = ConfigHandler.webs[webName];
        if (web && web.networks[networkName]) {
            return web.networks[networkName];
        }
        return null;  // Or throw an error if the network doesn't exist
    }

    // Add a new network to a Web and save the changes to the file
    static addNetwork(webName, networkName, networkConfig) {
        const web = ConfigHandler.webs[webName];
        if (web && !web.networks[networkName]) {
            web.networks[networkName] = networkConfig;
            ConfigHandler.saveWebConfig(webName, web);  // Save changes to file
        } else {
            console.error(`Network ${networkName} already exists or web not found.`);
        }
    }

    // Remove a network from a Web and save the changes to the file
    static removeNetwork(webName, networkName) {
        const web = ConfigHandler.webs[webName];
        if (web && web.networks[networkName]) {
            delete web.networks[networkName];
            ConfigHandler.saveWebConfig(webName, web);  // Save changes to file
        } else {
            console.error(`Network ${networkName} not found in ${webName}.`);
        }
    }
    
    // Remove a network from all webs using networkId and save the changes to the files
    static removeNetworkById(networkId) {
        let found = false;

        // Iterate through all webs to find the network by its networkId
        for (let webName in ConfigHandler.webs) {
            const web = ConfigHandler.webs[webName];
            if (web && web.networks) {
                const networkName = Object.keys(web.networks).find(
                    (name) => web.networks[name].networkId === networkId
                );

                // If the network is found, remove it
                if (networkName) {
                    delete web.networks[networkName];
                    ConfigHandler.saveWebConfig(webName, web);  // Save changes to file
                    console.log(`Network with ID ${networkId} removed from ${webName}.`);
                    found = true;
                    break; // Since networkId is unique, we can stop after finding and removing it
                }
            }
        }

        if (!found) {
            console.error(`Network with ID ${networkId} not found in any web.`);
        }
    }

    // Get a specific network config from a Web, loads dynamically if not already loaded
    static getNetworkById(networkId) {
        // Iterate through all webs to find the network by its networkId
        for (let webName in ConfigHandler.webs) {
            const web = ConfigHandler.webs[webName];
            if (web && web.networks) {
                const networkName = Object.keys(web.networks).find(
                    (name) => web.networks[name].networkId === networkId
                );

                // If the network is found, return it
                if (networkName) {
                    return web.networks[networkName];
                }
            }
        }

        return null;
    }

    // Update specific config settings for a network within a Web and save changes
    static setNetworkConfig(webName, networkName, newConfig) {
        const web = ConfigHandler.webs[webName];
        if (web && web.networks[networkName]) {
            const networkConfig = web.networks[networkName];
            // Update only the provided properties in newConfig
            Object.assign(networkConfig, newConfig);
            console.log(`Updated network config for ${networkName}:`, networkConfig);
            ConfigHandler.saveWebConfig(webName, web);  // Save changes to file
        } else {
            console.error(`Network ${networkName} not found in ${webName}.`);
        }
    }

    // Save the updated Web config to its file
    static saveWebConfig(webName, webConfig) {
        const webPath = path.join(process.cwd(), 'webs', webName, 'config', 'config.js');
        try {
            // Write the updated config back to the file
            fs.writeFileSync(webPath, `module.exports = ${JSON.stringify(webConfig, null, 4)};`, 'utf-8');
            console.log(`Web config for ${webName} saved successfully.`);
        } catch (error) {
            console.error(`Error saving web config for ${webName}:`, error);
        }
    }

    // Get all networks from all webs
    static getAllNetworks() {
        const allNetworks = [];
        for (let webName in ConfigHandler.webs) {
            const web = ConfigHandler.webs[webName];
            if (web && web.networks) {
                for (let networkName in web.networks) {
                    allNetworks.push({
                        webName: webName,
                        networkName: networkName,
                        networkId: web.networks[networkName].networkId,
                        network: web.networks[networkName]
                    });
                }
            }
        }
        return allNetworks;
    }

    // Get all networks from all webs
    static getAllWebs() {
        return Object.keys(ConfigHandler.webs);
    }
}

// Static variable to hold webs
ConfigHandler.webs = {};

module.exports = ConfigHandler;
