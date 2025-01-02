let currentChannel = 'main'; // Default channel
let channelSecret = ''; // Optional secret for encryption
let currentChannelHash = '';

// To store active channels
let channels = {};

// Fetch and display the channel list
async function loadChannels() {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getChannels' });
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
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getChannelHistory', accountId: channelHash });
    if (result.success) {
        const historyDiv = document.getElementById('chatHistory');
        historyDiv.innerHTML = '';  // Clear the existing chat history
        document.getElementById('users').innerHTML = '';  // Clear the existing chat history

        // Reverse the messages so the first ones are added last
        const reversedMessages = result.messages.reverse();

        // Use a for...of loop to iterate over the reversed messages
        for (const block of reversedMessages) {
            await displayMessage(block);  // Display each message
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
    // First, apply color formatting
    message = applyColorCodes(message);
    // Then, apply text formatting (bold, italics, etc.)
    message = applyFormattingCodes(message);
    return message;
}

async function displayMessage(block) {
    let decryptedMessage = null;
    try
    {
        decryptedMessage = await decryptChatMessage(block.message, currentChannel, channelSecret);
    }
    catch(err)
    {
        return;
    }

    // Verifying the chat message signature
    let signedBlock = { ...block };
    delete signedBlock.signature;
    delete signedBlock.validatorSignatures;
    delete signedBlock.hash;
    delete signedBlock.timestamp;
    delete signedBlock.delegatorTime;

    const isSignatureValid = await verifySignature(canonicalStringify(signedBlock), block.signature, block.fromAccount);
    if (isSignatureValid) {
        const historyDiv = document.getElementById('chatHistory');
        const messageDiv = document.createElement('div');

        // Format the message with colors and other formatting
        const formattedMessage = formatMessage(decryptedMessage);
        const time = new Date(block.timestamp).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false // Ensures 24-hour format
        });
        // Displaying the message with sender info and formatted content
        messageDiv.innerHTML = `<span class="time">[${time}]</span> <strong>&lt;${block.fromAccount.substring(0, 12)}&gt;</strong> ${formattedMessage}`;

        historyDiv.appendChild(messageDiv);

        // Update the user list if the user is not already listed
        const userListDiv = document.getElementById('users');
        if (!document.getElementById(block.fromAccount)) {
            const userDiv = document.createElement('div');
            userDiv.id = block.fromAccount;
            userDiv.textContent = block.fromAccount.substring(0, 12);
            userListDiv.appendChild(userDiv);
        }

        historyDiv.scrollTop = historyDiv.scrollHeight;  // Auto-scroll to bottom
    }
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

// Send a new message
async function sendChatMessage() {
    let messageBody = document.getElementById('messageInput').value.trim();
    if (!messageBody) return;

    const channelHash = await hashChannel(currentChannel, channelSecret);
    const encryptedMessage = await encryptChatMessage(messageBody, currentChannel, channelSecret);

    const block = await createChatMessageBlock(encryptedMessage, channelHash);

    // Send the block to the server
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'sendChatMessage', block });
    if (result.success) {
        document.getElementById('messageInput').value = ''; // Clear input field
    } else {
        alert('Error sending message: ' + result.message);
    }
}

// Create the message block with fee and other properties
async function createChatMessageBlock(encryptedMessage, channelHash) {
    const fromAccount = desk.wallet.publicKey;
    const toAccount = channelHash;
    const delegator = desk.gui.delegator;
    const lastBlockHashes = await getLastChatBlockHashes([fromAccount, toAccount, delegator]);

    const block = {
        type: 'chatmsg',
        fromAccount: fromAccount,  // Sender address
        toAccount: toAccount,    // Channel hash as toChannel
        amount: 0,
        delegator: delegator,
        fee: '1000000000',        // Optional: transaction fee
        burnAmount: '500000000',  // Optional: burn amount
        delegatorReward: '500000000',  // Optional: delegator reward
        message: encryptedMessage,
        previousBlockSender: lastBlockHashes[fromAccount],
        previousBlockRecipient: lastBlockHashes[toAccount],
        previousBlockDelegator: lastBlockHashes[delegator]
    };

    // Sign the block (for ledger integrity)
    const signature = await base64Encode(await signMessage(canonicalStringify(block)));
    block.signature = signature;

    return block;
}

// Fetch account info
async function getLastChatBlockHashes(accounts) {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getLastBlockHashes', accounts });
    return result.success ? result.hashes : {};
}
function setSocketHandler()
{
    const socket = desk.socketHandler.getSocket(desk.gui.activeNetworkId);
    // Handle incoming messages from the server
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const message = data.message;

        if (message.action === 'block_confirmation' && message.block.type === 'chatmsg')
        {
            if(message.networkId == desk.gui.activeNetworkId)
            {
                if(message.block.toAccount == currentChannelHash)
                {
                    displayMessage(message.block);
                    updateUserList(message.block.fromAccount); // Update the user list
                }
            }
        }
    };
}
// Auto-refresh chat when the user selects a different channel
document.addEventListener('channelChanged', () => fetchMessages(currentChannel));
document.addEventListener('chat.html-init', () => {
    desk.gui.populateNetworkSelect('chat');
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

});
