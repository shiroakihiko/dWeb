// Color mapping for different log types
const logColors = {
    log: 'color: green;',     // Green for logs
    error: 'color: red;',    // Red for errors
    warn: 'color: orange;',  // Orange for warnings
    verbose: 'color: gray;', // Gray for verbose
    info: 'color: blue;'     // Blue for info
};

// Format the log message with the correct color and handle optional error information
function formatLogOutput(log) {
    const logStyle = logColors[log.type] || logColors.info;

    const time = new Date(log.timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false // Ensures 24-hour format
    });

    // If the log is an error, display it with additional error details (if available)
    if (log.type === 'error' && log.err) {
        return `<span style="color: #888; font-size: 10px;">${time}</span> <span style="${logStyle}">[${log.module}]</span> ${log.msg} - ${log.err}`;
    } else {
        return `<span style="color: #888; font-size: 10px;">${time}</span> <span style="${logStyle}">[${log.module}]</span> ${log.msg}`;
    }
}

// Create and populate network tabs dynamically
function createLogNetworkTabs(availableNetworks) {
    const tabControl = document.getElementById('tabControlLogs');
    const tabPages = document.getElementById('tabPagesLogs');
    
    // Clear existing tabs (not the log containers)
    tabControl.innerHTML = '';

    // Create the "All Logs" tab (visible by default)
    const allLogsTab = document.createElement('button');
    allLogsTab.innerText = 'All Logs';
    allLogsTab.classList.add('tabButton');
    allLogsTab.classList.add('ui_button');
    allLogsTab.onclick = () => toggleTabVisibility('logs', 'all');
    tabControl.appendChild(allLogsTab);

    // Create a container for each network log (hidden by default)
    const allLogsContainer = document.createElement('div');
    allLogsContainer.id = `tabPage_all`;
    allLogsContainer.classList.add('tabPage');
    allLogsContainer.style.display = 'block'; // Hide initially
    tabPages.appendChild(allLogsContainer);

    // Create individual tabs for each network and their log containers
    for (const networkId in availableNetworks) {
        if (networkId !== 'all') { // Skip the 'all' tab
            const tabButton = document.createElement('button');
            tabButton.innerText = availableNetworks[networkId].name.webName || networkId;
            tabButton.classList.add('tabButton');
            tabButton.classList.add('ui_button');
            tabButton.onclick = () => toggleTabVisibility('Logs', networkId);
            tabControl.appendChild(tabButton);

            // Create a container for each network log (hidden by default)
            const networkContainer = document.createElement('div');
            networkContainer.id = `tabPage_${networkId}`;
            networkContainer.classList.add('tabPage');
            networkContainer.style.display = 'none'; // Hide initially
            tabPages.appendChild(networkContainer);
        }
    }
}

// Function to display logs for a specific network or for all logs
function displayLogs(logs, networkId) {
    const logContainer = document.getElementById(`tabPage_${networkId}`);

    if(logContainer.childNodes.length >= 30)
        logContainer.removeChild(logContainer.childNodes[0]);

    if (logs.length === 0) {
        logContainer.innerHTML = `No logs available for ${networkId !== 'all' ? 'Network ' + networkId : 'All Logs'}.`;
        return;
    }
    // Let's only display the last 30
    logs = logs.slice(-30);
    

    logs.forEach(log => {
        const logDiv = document.createElement('div');
        logDiv.classList.add('log');

        const formattedLog = formatLogOutput(log);
        logDiv.innerHTML = `
            <div class="logEntry">
                <pre>${formattedLog}</pre>
            </div>
        `;

        logContainer.appendChild(logDiv);
    });
}

// Fetch all logs from the server
async function fetchAllLogs() {
    const result = await desk.networkRequest({ networkId: 'desk', method: 'getAllLogs' });
    if (result.success) {
        const logs = result.logs;
        console.log('All Logs:', logs);
        displayLogs(logs, 'all');
    } else {
        console.error('Failed to fetch logs');
    }
}

// Fetch network-specific logs
async function fetchNetworkLogs() {
    for (const networkId in desk.availableNetworks)
    {
        const result = await desk.networkRequest({ networkId: 'desk', method: 'getNetworkLogs', targetNetworkId: networkId });
        if (result.success) {
            const logs = result.logs;
            console.log(`Logs for Network ${networkId}:`, logs);
            displayLogs(logs, networkId);
        } else {
            console.error(`Failed to fetch logs for network ${networkId}`);
        }
    }
}

// Load on page initialization
document.addEventListener('logs.html-load', function() {
    // Call the function to fetch and display all logs
    fetchAllLogs();
    fetchNetworkLogs();

    // Create tabs dynamically (after fetching all logs)
    createLogNetworkTabs(desk.availableNetworks);

    // Subscribe to receive active logs (for socket updates)
    const socket = desk.socketHandler.getSocket('desk');
    const subscribeMessage = JSON.stringify({
        method: 'subscribe',
        topic: 'log_update'
    });
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const message = data.message;

        if (message.method === 'log_update') {
            if(message.log.networkId)
                displayLogs([message.log], message.log.networkId);
            
            displayLogs([message.log], 'all');
        }
    };
    socket.send(subscribeMessage);
});
