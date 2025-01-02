const chalk = new (require('chalk')).Chalk();
const readline = require('readline');

class Logger {
    constructor(maxEntries = 5000) {
        this.network_logs = new Map();
        this.logs = [];
        this.callbacks = new Set();
        this.maxEntries = maxEntries;
        this.logLevel = 'verbose';
        this.filterText = '';
        
        this.logColors = {
            log: chalk.green,
            error: chalk.red,
            warn: chalk.hex('#FFA500'),
            verbose: chalk.gray,
            info: chalk.blue
        };

        // Initialize readline interface
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Setup input handling
        this.setupConsoleFilter();
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
            console.log(chalk.yellow(`Current filter: "${this.filterText}"`));
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
    
    addCallback(newCallback) {
        this.callbacks.add(newCallback);
    }

    addLogEntry(type, msg, module, networkId, err = null) {
        const logEntry = { type, module, msg, networkId, err, timestamp: new Date().toISOString() };
        
        // Only log to console if it passes both the log level and filter checks
        if (this.isSufficientLogLevel(type) && this.shouldLogWithFilter(logEntry)) {
            console.log(this.logColors[type](`[${module}]`) + ` ${msg}`);
            if (err) {
                console.log(err);
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

    fireCallbacks(log) {
        for (const callback of this.callbacks) {
            callback(log);
        }
    }

    getAllLogs() {
        return this.logs;
    }

    getNetworkLogs(networkId) {
        return this.network_logs.get(networkId) || [];
    }
    
    isSufficientLogLevel(logType) {
        if (this.logLevel == 'verbose')
            return true;
        else if (this.logLevel == 'info' && (logType != 'verbose'))
            return true;
        else if (this.logLevel == 'warn' && (logType != 'verbose' || logType != 'info'))
            return true;
        else if (this.logLevel == 'error' && (logType != 'verbose' || logType != 'info' || logType != 'warn'))
            return true;
        
        return false;
    }
}

module.exports = Logger;