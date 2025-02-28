//const readline = require('readline');

class Logger {
    constructor(maxEntries = 5000) {
        this.network_logs = new Map();
        this.logs = [];
        this.callbacks = new Set();
        this.maxEntries = maxEntries;
        this.logLevel = 'verbose';
        this.filterText = '';
        
        if (process.platform !== 'android') {
            const chalk = new (require('chalk')).Chalk();
            this.logColors = {
                log: chalk.green,
                error: chalk.red,
                warn: chalk.hex('#FFA500'),
                verbose: chalk.gray,
                info: chalk.blue,
                debug: chalk.gray,
                yellow: chalk.yellow
            };
        }
        else {
            this.logColors = {
                log: (msg) => msg,
                error: (msg) => msg,
                warn: (msg) => msg,
                verbose: (msg) => msg,
                info: (msg) => msg,
                debug: (msg) => msg,
                yellow: (msg) => msg
            };
        }

        /*
        // Initialize readline interface
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Setup input handling
        this.setupConsoleFilter();
        */
    }
    
    setupConsoleFilter() {
        // Clear the current line and move cursor to start
        process.stdout.write('\x1B[1G\x1B[0J');
        
        this.rl.on('line', (input) => {
            this.filterText = input.toLowerCase();
            // Clear console
            console.clear();
            // Reprint filtered logs
            this.reprintFilteredLogs();
            // Show current filter
            console.log(this.logColors.yellow(`Current filter: "${this.filterText}"`));
        });

        // Handle CTRL+C gracefully
        this.rl.on('SIGINT', () => {
            this.rl.close();
            process.exit();
        });
    }

    reprintFilteredLogs() {
        // Reprint only logs that match the filter
        this.logs.forEach(log => {
            if (this.shouldLogWithFilter(log)) {
                const formattedMsg = `${this.logColors[log.type](`[${log.module}]`)} ${log.msg}`;
                console.log(formattedMsg);
                if (log.err) {
                    console.log(log.err);
                }
            }
        });
    }

    shouldLogWithFilter(logEntry) {
        if (!this.filterText) return true;
        
        const searchText = `${logEntry.module} ${logEntry.msg}`.toLowerCase();
        return searchText.includes(this.filterText);
    }
    
    setLogLevel(logLevel) {
        this.logLevel = logLevel;
    }

    addLogEntry(type, msg, module, networkId, obj = null) {
        const logEntry = { type, module, msg, networkId, obj, timestamp: new Date().toISOString() };
        
        // Only log to console if it passes both the log level and filter checks
        if (this.isSufficientLogLevel(type) && this.shouldLogWithFilter(logEntry)) {
            console.log(this.logColors[type](`[${module}]`) + ` ${msg}`);
            if (obj) {
                console.log(obj);
            }
        }

        this.logs.push(logEntry);
        if (this.logs.length > this.maxEntries) {
            this.logs.shift();
        }

        if (networkId) {
            if (!this.network_logs.has(networkId)) {
                this.network_logs.set(networkId, []);
            }
            const networkLog = this.network_logs.get(networkId);
            networkLog.push(logEntry);
            if (networkLog.length > this.maxEntries) {
                networkLog.shift();
            }
        }

        this.fireCallbacks(logEntry);
    }

    // Logging functions
    log(msg, module = 'system', networkId = null) {
        this.addLogEntry('log', msg, module, networkId);
    }
    
    error(msg, err, module = 'system', networkId = null) {
        this.addLogEntry('error', msg, module, networkId, err);
    }
    
    warn(msg, module = 'system', networkId = null) {
        this.addLogEntry('warn', msg, module, networkId);
    }
    
    verbose(msg, module = 'system', networkId = null) {
        this.addLogEntry('verbose', msg, module, networkId);
    }
    
    info(msg, module = 'system', networkId = null) {
        this.addLogEntry('info', msg, module, networkId);
    }

    debug(msg, obj = null, module = 'system', networkId = null) {
        this.addLogEntry('debug', msg, module, networkId, obj);
    }

    fireCallbacks(log) {
        for (const callback of this.callbacks) {
            callback(log);
        }
    }
    
    addCallback(newCallback) {
        this.callbacks.add(newCallback);
    }

    removeCallback(callbackToRemove) {
        this.callbacks.delete(callbackToRemove);
    }

    getAllLogs() {
        return this.logs;
    }

    getNetworkLogs(networkId) {
        return this.network_logs.get(networkId) || [];
    }
    
    isSufficientLogLevel(logType) {
        if (this.logLevel == 'debug')
            return true;
        else if (this.logLevel == 'verbose' && (logType != 'debug'))
            return true;
        else if (this.logLevel == 'info' && (logType != 'debug' && logType != 'verbose'))
            return true;
        else if (this.logLevel == 'warn' && (logType != 'debug' && logType != 'verbose' && logType != 'info'))
            return true;
        else if (this.logLevel == 'error' && (logType != 'debug' && logType != 'verbose' && logType != 'info' && logType != 'warn'))
            return true;
        
        return false;
    }
}

module.exports = Logger;