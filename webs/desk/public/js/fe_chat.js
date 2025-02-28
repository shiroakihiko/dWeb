let currentChannel = 'main'; // Default channel
let channelSecret = ''; // Optional secret for encryption
let currentChannelHash = '';

// To store active channels
let channels = {};

// Fetch and display the channel list
async function loadChannels() {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'getChannels' });
    if (result.success) {
        const channelsDiv = document.getElementById('channels');
        channelsDiv.innerHTML = ''; // Clear existing channels
        result.channels.forEach(channel => {
            const channelDiv = document.createElement('div');
            channelDiv.textContent = channel.name;
            channelDiv.className = 'channel';
            channelDiv.onclick = () => loadChannel(channel.name, channel.secret);
            channelsDiv.appendChild(channelDiv);
        });
    }
}

// Load a channel, setting up encryption and displaying history
async function loadChannel(channelName, secret = '') {
    currentChannel = channelName;
    channelSecret = secret;

    // Set up encryption based on channel name + secret
    const channelHash = await hashChannel(currentChannel, channelSecret);
    currentChannelHash = channelHash;
    await fetchMessages(channelHash);
    updateCurrentChannelDisplay();
}

// Update the current channel display
function updateCurrentChannelDisplay() {
    const currentChannelDisplay = document.getElementById('currentChannelDisplay');
    currentChannelDisplay.textContent = `Current Channel: ${currentChannel}`;
}

// Function to join a channel by name and secret
async function joinChannelByName() {
    const channelName = document.getElementById('joinChannelName').value.trim();
    const secret = document.getElementById('joinChannelSecret').value.trim();

    if (channelName) {
        loadChannel(channelName, secret);
    } else {
        alert('Please enter a valid channel name.');
    }
}

// Hash the channel name with the secret (if provided)
async function hashChannel(channelName, secret) {
    return await hashText(channelName + secret);  // Concatenate channel name and secret // Return the hex-encoded hash as the secret key
}


// Fetch chat messages from the server and display them
async function fetchMessages(channelHash) {
    desk.socketHandler.subscribeToAccount(desk.gui.activeNetworkId, channelHash);
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'getChannelHistory', accountId: channelHash });
    if (result.success) {
        const historyDiv = document.getElementById('chatHistory');
        historyDiv.innerHTML = '';  // Clear the existing chat history
        document.getElementById('users').innerHTML = '';  // Clear the existing chat history

        // Reverse the messages so the first ones are added last
        //const reversedMessages = result.messages.reverse();

        // Use a for...of loop to iterate over the reversed messages
        for (const message of result.messages) {
            await displayMessage(message);  // Display each message
        }
    }
}


// Add user to user list if they are not already there
function updateUserList(user) {
    const userListDiv = document.getElementById('users');
    if (!document.getElementById(user)) {
        const userDiv = document.createElement('div');
        userDiv.id = user;
        userDiv.textContent = user.substring(0, 12);  // Display shortened user id
        userListDiv.appendChild(userDiv);
    }
}
// Mapping of IRC color codes (0-15) to HTML colors
const colorMap = {
    '0': '#FFFFFF',   // White
    '1': '#000000',   // Black
    '2': '#00007F',   // Navy
    '3': '#009300',   // Green
    '4': '#FF0000',   // Red
    '5': '#7F0000',   // Maroon
    '6': '#9C009C',   // Purple
    '7': '#FC7F00',   // Orange
    '8': '#FFFF00',   // Yellow
    '9': '#00FC00',   // Light Green
    '10': '#009393',  // Teal
    '11': '#00FFFF',  // Cyan
    '12': '#0000FC',  // Royal Blue
    '13': '#FF00FF',  // Magenta
    '14': '#7F7F7F',  // Gray
    '15': '#D2D2D2',  // Light Gray
};

// Function to apply IRC formatting codes to a message (bold, italics, etc.)
function applyFormattingCodes(message) {
    // Apply bold formatting (^B)
    message = message.replace(/\^B(.*?)\^B/g, '<strong>$1</strong>');
    // Apply italics formatting (^I)
    message = message.replace(/\^I(.*?)\^I/g, '<em>$1</em>');
    // Apply underline formatting (^U)
    message = message.replace(/\^U(.*?)\^U/g, '<u>$1</u>');
    // Apply reverse formatting (^R)
    message = message.replace(/\^R(.*?)\^R/g, '<span style="text-transform: uppercase;">$1</span>');
    // Reset all formatting (^O)
    message = message.replace(/\^O/g, ''); // ^O removes all formatting

    return message;
}

// Function to apply IRC color codes (foreground and background) to a message
function applyColorCodes(message) {
    // Regex to match IRC color codes like ^K1,2 (foreground: red, background: green)
    const colorCodeRegex = /\^K(\d{1,2}),?(\d{1,2})?(.*?)\^K/g;

    return message.replace(colorCodeRegex, (match, foregroundCode, backgroundCode, text) => {
        // Get the foreground and background color codes, default to black for foreground and white for background
        const fgColor = colorMap[foregroundCode] || '#000000';
        const bgColor = backgroundCode ? colorMap[backgroundCode] || '#FFFFFF' : null;

        // Apply the colors to the text
        let style = `color: ${fgColor};`;
        if (bgColor) {
            style += ` background-color: ${bgColor};`;
        }

        // Wrap the text in a span with the appropriate color styles
        return `<span style="${style}">${text}</span>`;
    });
}

// Function to combine color and other formatting for IRC messages
function formatMessage(message) {
    if (typeof message === 'string') {
        // First, apply color formatting
        message = applyColorCodes(message);
        // Then, apply text formatting (bold, italics, etc.)
        message = applyFormattingCodes(message);
        return message;
    }
    return message;
}

// Add this function to handle dweb links
function handleDwebLink(url) {
    if (url.startsWith('dweb://')) {
        const contentId = url.replace('dweb://', '');
        loadPage('filesystem.html', null, JSON.stringify({loadPage: contentId}));
        return true;
    }
    return false;
}

// Update createMessageHTML function to handle formatting and dweb links
function createMessageHTML(time, fromAccount, content, isPending = false, messageId = null) {
    let messageText = typeof content === 'object' ? content.text : content;
    // Apply formatting to the message text
    messageText = formatMessage(messageText);
    
    // Handle dweb:// links
    messageText = messageText.replace(/(dweb:\/\/[^\s<>"]+)/g, 
        '<a href="#" onclick="handleDwebLink(\'$1\'); return false;">$1</a>');

    return `
        <div class="chat-message ${isPending ? 'pending' : ''}" ${messageId ? `data-message-id="${messageId}"` : ''}>
            <div class="message-header">
                <span class="time">[${time}]</span>
                <strong>&lt;${fromAccount}&gt;</strong>
            </div>
            <div class="message-content">
                <div class="message-text">${messageText}</div>
                ${typeof content === 'object' && content.preview ? `
                    <a href="${content.preview.url}" target="_blank" class="link-preview">
                        ${content.preview.imageData ? `
                            <div class="preview-image">
                                <img src="${content.preview.imageData}" alt="${content.preview.title}"></img>
                            </div>
                        ` : ''}
                        ${content.preview.type === 'video' ? `
                            <div class="preview-video">
                                <iframe width="560" height="315" 
                                    src="https://www.youtube.com/embed/${content.preview.videoId}" 
                                    frameborder="0" allowfullscreen>
                                </iframe>
                            </div>
                        ` : ''}
                        <div class="preview-content">
                            <div class="preview-title">${content.preview.title}</div>
                            <div class="preview-description">${content.preview.description || ''}</div>
                            <div class="preview-site">${content.preview.siteName || new URL(content.preview.url).hostname}</div>
                        </div>
                    </a>
                ` : ''}
            </div>
        </div>
    `;
}

// Update the displayMessage function
async function displayMessage(action) {
    const instruction = action.instruction;
    if(instruction.type == 'chatmsg') {
        updateUserList(action.account); // Update the user list
        
        let decryptedMessage = null;
        try {
            decryptedMessage = await decryptChatMessage(instruction.message, currentChannel, channelSecret);
        } catch(err) {
            return;
        }

        // Verify signature...
        let unsignedAction = desk.action.removeOverhead(action);
        const isSignatureValid = await verifySignature(canonicalStringify(unsignedAction), action.signatures[action.account], action.account);
        if (isSignatureValid) {
            const historyDiv = document.getElementById('chatHistory');
            const time = new Date(action.timestamp).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            // Check if this is a pending message being confirmed
            const pendingMsg = document.querySelector(`[data-message-id="${action.hash}"]`);
            if (pendingMsg) {
                // Update the existing pending message
                pendingMsg.classList.remove('pending');
                return; // Exit since we've updated the existing message
            }

            // If no pending message exists, add the new message
            const messageHTML = createMessageHTML(
                time,
                await desk.gui.resolveAccountId(action.account, action.account.substring(0, 12)),
                decryptedMessage,
                false,
                action.hash
            );
            addMessageToChatHistory(messageHTML, action.hash);
        }
    }
}

function addMessageToChatHistory(messageHTML, messageId = null)
{
    // Already exists? Remove pending.
    if(document.querySelector(`[data-message-id="${messageId}"]`)){
        document.querySelector(`[data-message-id="${messageId}"]`).classList.remove('pending');
        return;
    }
    const historyDiv = document.getElementById('chatHistory');
    historyDiv.insertAdjacentHTML('beforeend', formatMessage(messageHTML));
    historyDiv.scrollTop = historyDiv.scrollHeight;
}

async function decryptChatMessage(encryptedMessage, channelName, channelSecret) {
    const messageParts = encryptedMessage.split(':');  // Extract the encrypted message
    const nonce = base64Decode(messageParts[0]);
    const encryptedBytes = base64Decode(messageParts[1]);

    // Derive the secret key using channelName and channelSecret
    const secretKey = await hashChannel(channelName, channelSecret);

    // Decrypt the message using the derived secret key
    const decryptedBytes = nacl.secretbox.open(encryptedBytes, nonce, hexToUint8Array(secretKey));

    if (!decryptedBytes) {
        throw new Error('Decryption failed');
    }

    // Convert the decrypted bytes back into the original message
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decryptedBytes));
}

async function encryptChatMessage(message, channelName, channelSecret) {
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(JSON.stringify(message));

    // Use the channelName + channelSecret as the secret key
    const secretKey = await hashChannel(channelName, channelSecret);

    // Use nacl.secretBox for symmetric encryption (with a shared secret key)
    const nonce = nacl.randomBytes(24); // Generate nonce (unique for each message)
    const encryptedMessage = nacl.secretbox(messageBytes, nonce, hexToUint8Array(secretKey));

    // Return the base64 encoded result for transmission
    return base64Encode(nonce)+':'+base64Encode(encryptedMessage);
}

// Update the sendChatMessage function
async function sendChatMessage() {
    let messageBody = document.getElementById('messageInput').value.trim();
    if (!messageBody) return;

    // Clear input immediately
    document.getElementById('messageInput').value = '';

    // Process links before sending
    const processedMessage = await detectAndProcessLinks(messageBody);

    // Send the message
    const channelHash = await hashChannel(currentChannel, channelSecret);
    const encryptedMessage = await encryptChatMessage(processedMessage, currentChannel, channelSecret);

    const instruction = {
        type: 'chatmsg',
        account: desk.wallet.publicKey,
        toAccount: channelHash,
        amount: 0,
        message: encryptedMessage
    };
    const blockResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
    if (!blockResult.success) {
        alert('Error sending message: ' + blockResult.message);
        return;
    }
    
    const tempId = blockResult.hash;

    // Add message to chat with tempId
    const time = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    

    const messageHTML = createMessageHTML(
        time,
        await desk.gui.resolveAccountId(desk.wallet.publicKey, desk.wallet.publicKey.substring(0, 12)),
        processedMessage,
        true,
        tempId
    );
    addMessageToChatHistory(messageHTML, tempId);
}

function setSocketHandler()
{
    //const socket = desk.socketHandler.getSocket(desk.gui.activeNetworkId);
    // Handle incoming messages from the server
    desk.messageHandler.addMessageHandler(desk.gui.activeNetworkId, (message) => {
        if (message.topic === 'action_confirmation' && message.networkId == desk.gui.activeNetworkId)
        {
            displayMessage(message.action);
        }
    });
}
// Auto-refresh chat when the user selects a different channel
document.addEventListener('channelChanged', () => fetchMessages(currentChannel));
document.addEventListener('chat.html-load', () => {
    desk.gui.populateNetworkSelect('chat');
    desk.messageHandler.registerNotificationHandler('chatmsg', async (action) => {});
    desk.gui.onNetworkChange = function(){
        loadChannels();
        fetchMessages(currentChannelHash);
        setSocketHandler();
    };
    loadChannels();
    hashChannel(currentChannel, channelSecret).then((hash) => { fetchMessages(hash); currentChannelHash = hash; });
    setSocketHandler();
    // Add this to your existing script
    document.getElementById('messageInput').addEventListener('keydown', function(event) {
        // Check if the Enter key is pressed (key code 13) and it's not the Shift key (to prevent new lines)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();  // Prevent the default action of the Enter key (new line)
            sendChatMessage();       // Call the function to send the message
        }
    });


    // Update the mobile panel toggle
    if (window.innerWidth <= 768) {
        document.getElementById('toggleJoin').addEventListener('click', () => {
            document.getElementById('mobileJoinChannel').classList.add('show');
            document.querySelector('.mobile-overlay').classList.add('show');
        });
    }
    if (window.innerWidth <= 768) {
        // Toggle channels panel
        document.getElementById('toggleChannels').addEventListener('click', () => {
            document.querySelector('.right-panel').classList.add('show');
            document.querySelector('.mobile-overlay').classList.add('show');
        });

        // Toggle join panel
        document.getElementById('toggleJoin').addEventListener('click', () => {
            document.getElementById('mobileJoinChannel').classList.add('show');
            document.querySelector('.mobile-overlay').classList.add('show');
        });

        // Close panels when clicking overlay
        document.querySelector('.mobile-overlay').addEventListener('click', closeAllPanels);

        // Close panel buttons
        document.querySelectorAll('.close-panel').forEach(button => {
            button.addEventListener('click', closeAllPanels);
        });

        // Close panels when joining a channel
        const originalJoinChannel = joinChannelByName;
        joinChannelByName = async function() {
            await originalJoinChannel();
            closeAllPanels();
        };
    }
});

function closeAllPanels() {
    document.querySelector('.right-panel').classList.remove('show');
    document.getElementById('mobileJoinChannel').classList.remove('show');
    document.querySelector('.mobile-overlay').classList.remove('show');
}

async function detectAndProcessLinks(message) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = message.match(urlRegex);
    
    if (!matches) return message;

    const url = matches[0]; // Process first link only
    const result = await desk.networkRequest({ 
        networkId: desk.gui.activeNetworkId, 
        method: 'getLinkPreview', 
        url 
    });

    if (result.success && result.metadata) {
        return {
            text: message,
            preview: result.metadata
        };
    }

    return message;
}

// Add this function for mobile join
async function mobileJoinChannelByName() {
    const channelName = document.getElementById('mobileJoinChannelName').value.trim();
    const secret = document.getElementById('mobileJoinChannelSecret').value.trim();

    if (channelName) {
        await loadChannel(channelName, secret);
        closeAllPanels();
        // Clear the mobile inputs
        document.getElementById('mobileJoinChannelName').value = '';
        document.getElementById('mobileJoinChannelSecret').value = '';
    } else {
        alert('Please enter a valid channel name.');
    }
}
