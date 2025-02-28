let globalAudioContext;

let localStream;

const DATA_TYPES = { VIDEO: 0x01, AUDIO: 0x02 };

const CONFIG = {
    scaleFactor: 0.5,
    jpegQuality: 0.5,
    frameInterval: 100,  // milliseconds between frames
    minFrameInterval: 50,  // minimum 50ms (20 fps)
    maxFrameInterval: 750, // maximum 500ms (2 fps)
    frameInterval: 100  // milliseconds between frames
};

const AUDIO_CONFIG = {
    bufferSize: 2048,
    maxBufferCount: 3,
    sampleRate: 48000
};

const CALL_STATE = {
    localStream: null,
    videoEnabled: true,
    audioEnabled: true,
    participants: new Map(), // Store participant info
    remoteStreams: new Map(), // Store remote video elements
    channelId: null,
    participantStats: new Map(), // Track participant statistics
    maxParticipants: 8, // Maximum number of participants
    layout: 'grid', // grid or focus
    channelInfo: {
        id: null,
        key: null
    },
    currentVideoProcessor: null,  // Add this to track the current processor
    videoReader: null,            // Add this to track the current reader
    isScreenSharing: false,
    networkStats: {
        lastMessageTime: Date.now(),
        bytesTransferred: 0,
        latency: 0
    },
    activeCallNotification: null,
    callKeepAliveInterval: null,
    callTimeout: 30000, // 30 seconds timeout for call acceptance
    callRequestInterval: null,
    isCallActive: false,
    pendingCallRequest: null,
    callTimeoutId: null,
    audioPlayers: new Map()
};

document.addEventListener('call-init', () => {});
document.addEventListener('page-open', (event) => {
    if (CALL_STATE.isCallActive) {
        if (event.detail.page === 'call.html') {
            if (floatingContainer) {
                floatingContainer.style.display = 'none';
                floatingContainer.classList.remove('collapsed');
                floatingContainer.innerHTML = '';
            }
        } else {
            if (floatingContainer) {
                floatingContainer.classList.remove('collapsed');
            }
        }
    }
});

function getMediaServerUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port = window.location.protocol === 'https:' ? '8445' : '8444';
    return `${protocol}//${window.location.hostname}:${port}`;
}

let mediaWs = null;
let currentRecipient = null;


// Add mobile detection
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Modify video constraints based on device
async function getVideoConstraints() {
    if (isMobile) {
        return {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: 16/9,
            facingMode: 'user',
            zoom: 1,
            resizeMode: 'none'
        };
    }
    return {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: 16/9,
        zoom: 1,
        resizeMode: 'none'
    };
}

async function startMedia() {
    try {
        const videoConstraints = await getVideoConstraints();
        CALL_STATE.localStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: {
                noiseSuppression: true,
                echoCancellation: true, // Optional: Enable echo cancellation
            }
        });
        
        // Adjust UI for mobile
        if (isMobile) {
            document.querySelector('.call-interface').classList.add('mobile');
            adjustMobileLayout();
        }

        document.getElementById('localVideo').srcObject = CALL_STATE.localStream;
        
        // Start video processing
        sendVideo();
        
        // Setup audio processing with proper error handling
        try {
            await setupAudioProcessing();
        } catch (audioError) {
            console.error('Audio processing setup failed:', audioError);
            showStatus('Audio setup failed, continuing with video only', 'warning');
        }
        
        // Enable control buttons
        document.getElementById('videoToggle').disabled = false;
        document.getElementById('audioToggle').disabled = false;
        document.getElementById('endButton').disabled = false;
        
        // Setup media device selection if available
        if ('enumerateDevices' in navigator.mediaDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            if (videoDevices.length > 1) {
                document.getElementById('cameraSwitch').style.display = 'block';
            }
        }

        // Hide screen share button on mobile
        if (isMobile) {
            document.getElementById('screenShareBtn').style.display = 'none';
        }
    } catch (err) {
        console.error('Error accessing media devices:', err);
        showStatus('Failed to access camera/microphone', 'error');
        throw err;
    }
}

async function videoFrameToArrayBuffer(videoFrame) {
    return await compressVideoFrame(videoFrame);
}

function getOrCreateAudioContext() {
    if (!globalAudioContext) {
        globalAudioContext = new AudioContext();
    }
    if (globalAudioContext.state === 'suspended') {
        globalAudioContext.resume().catch(err => console.error('Failed to resume AudioContext:', err));
    }
    return globalAudioContext;
}

function connectToMediaServer(mediaServerAddress, channelId) {
    const mediaServerUrl = mediaServerAddress;
    mediaWs = new WebSocket(mediaServerUrl);
    mediaWs.binaryType = 'arraybuffer';
    // Heartbeat setup
    const heartbeat = {
        interval: null,
        intervalMs: 30000, // 30 seconds
        
        start: function() {
            this.interval = setInterval(() => {
                if (mediaWs && mediaWs.readyState === WebSocket.OPEN) {
                    mediaWs.send('ping');
                }
            }, this.intervalMs);
        },
        
        stop: function() {
            if (this.interval) {
                clearInterval(this.interval);
            }
        }
    };
    
    mediaWs.onopen = () => {
        console.log(`Media WebSocket connection opened (${window.location.protocol === 'https:' ? 'WSS' : 'WS'})`);
        //heartbeat.start();
        // Send subscribe message with participant info
        mediaWs.send(JSON.stringify({
            method: 'subscribe',
            channelId: channelId,
            participantId: desk.wallet.publicKey
        }));

        // Add self to participants list (only if not already present)
        if (!CALL_STATE.participants.has(desk.wallet.publicKey)) {
            CALL_STATE.participants.set(desk.wallet.publicKey, {
                name: 'You',
                isLocal: true
            });
            updateParticipantsUI();
        }
        
        // Start monitoring systems
        monitorNetworkQuality();
        //setupBandwidthAdaptation();
    };

    mediaWs.onmessage = async (event) => {
        // Update last message time for latency calculation
        CALL_STATE.networkStats.lastMessageTime = Date.now();
        
        try {
            if (typeof event.data === 'string') {
                // Handle control messages
                const message = JSON.parse(event.data);
                console.log('Received control message:', message);

                if (message.type === 'channelState') {
                    // Clear existing remote participants (preserve local)
                    const selfParticipant = CALL_STATE.participants.get(desk.wallet.publicKey);
                    CALL_STATE.participants.clear();
                    
                    // Add back local participant
                    CALL_STATE.participants.set(desk.wallet.publicKey, selfParticipant || {
                        name: 'You',
                        isLocal: true
                    });

                    // Add remote participants
                    message.participants.forEach(participantId => {
                        // Ensure we have a valid ID and it's not the local user
                        if (participantId !== desk.wallet.publicKey && 
                            !CALL_STATE.participants.has(participantId)) {
                            
                            CALL_STATE.participants.set(participantId, {
                                name: participantId.substring(0, 8),
                                joined: new Date(),
                                isLocal: false
                            });
                        }
                    });
                    
                    updateParticipantsUI();
                } else if (message.type === 'participantJoined') {
                    if (message.participant !== desk.wallet.publicKey && 
                        !CALL_STATE.participants.has(message.participant)) {
                        CALL_STATE.participants.set(message.participant, {
                            name: message.participant.substring(0, 8),
                            joined: new Date()
                        });
                        updateParticipantsUI();
                    }
                } else if (message.type === 'participantLeft') {
                    if (message.participant !== desk.wallet.publicKey) {
                        CALL_STATE.participants.delete(message.participant);
                        updateParticipantsUI();
                    }
                }
            } else if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                
                if (data.byteLength === 0) return;

                // Update packet parsing to handle 64-byte IDs
                // Format: [type(1) | senderId(64) | iv(12) | encryptedData(rest)]
                const dataType = data[0];
                const senderId = new TextDecoder().decode(data.slice(1, 65)).trim();
                const iv = data.slice(65, 77);
                const encryptedData = data.slice(77);

                try {
                    const decryptedData = await decryptData(encryptedData, iv);
                    
                    if (dataType === DATA_TYPES.VIDEO) {
                        const blob = new Blob([decryptedData], { type: 'image/jpeg' });
                        const imageBitmap = await createImageBitmap(blob);
                        
                        // Get participant data
                        const participant = CALL_STATE.participants.get(senderId);
                        if (participant && participant.canvasContexts) {
                            // Update all canvases for this participant
                            participant.canvasContexts.forEach(ctx => {
                                // Update canvas size if needed
                                if (ctx.canvas.width !== imageBitmap.width || 
                                    ctx.canvas.height !== imageBitmap.height) {
                                    ctx.canvas.width = imageBitmap.width;
                                    ctx.canvas.height = imageBitmap.height;
                                }
                                ctx.drawImage(imageBitmap, 0, 0);
                            });
                        } else {
                            if (!CALL_STATE.participants.has(senderId)) {
                                CALL_STATE.participants.set(senderId, {
                                    name: senderId.substring(0, 8),
                                    joined: new Date(),
                                    isLocal: false,
                                    canvasContexts: new Set()
                                });
                                updateParticipantsUI();
                            }
                        }
                    } else if (dataType === DATA_TYPES.AUDIO) {
                        try {
                            const audioContext = getOrCreateAudioContext();
                            const audioData = new Float32Array(decryptedData.buffer);
                            
                            // Get or create audio player for this participant
                            let audioPlayer = CALL_STATE.audioPlayers.get(senderId);
                            if (!audioPlayer) {
                                audioPlayer = new AudioPlayer(audioContext);
                                CALL_STATE.audioPlayers.set(senderId, audioPlayer);
                                // Store gain node reference for volume control
                                CALL_STATE.remoteStreams.set(`${senderId}-gain`, audioPlayer.gainNode);
                            }
                            
                            // Add buffer to player
                            audioPlayer.addBuffer(audioData);
                        } catch (error) {
                            console.warn('Error processing audio from participant:', senderId, error);
                        }
                    }
                } catch (decryptError) {
                    console.warn('Decryption failed for participant:', senderId, decryptError);
                }
            }
        } catch (error) {
            console.error('Media processing failed:', error);
        }
    };

    mediaWs.onerror = (err) => {
        console.error(`Media WebSocket error (${window.location.protocol === 'https:' ? 'WSS' : 'WS'}):`, err);
        // Attempt to reconnect if the connection fails
        setTimeout(() => {
            if (!mediaWs || mediaWs.readyState === WebSocket.CLOSED) {
                console.log('Attempting to reconnect...');
                connectToMediaServer(CALL_STATE.channelInfo.mediaServerAddress, CALL_STATE.channelInfo.id);
            }
        }, 10000);
    };
    mediaWs.onclose = (result) => {
       //heartbeat.stop();
        console.log('Media WebSocket connection closed');
    }
}

async function setCallSocketHandler(networkId) {
    desk.messageHandler.addMessageHandler(networkId, async (message) => {
        if(message.networkId == networkId) {
            if(message.action.toAccount == desk.wallet.publicKey) {
                // Verify signature
                let signedAction = { ...message.action };
                delete signedAction.signatures;
        
                const isSignatureValid = await verifySignature(canonicalStringify(signedAction), message.action.signatures[message.action.account], message.action.account);
                if (!isSignatureValid) return;

                if (message.topic === 'call') {
                    switch (message.action.type) {
                        case 'callRequest':
                            // Ignore if call is already active or we already declined
                            if (CALL_STATE.isCallActive || CALL_STATE.pendingCallRequest?.declined) {
                                return;
                            }

                            // Show notification only for first request
                            if (!CALL_STATE.pendingCallRequest) {
                                CALL_STATE.pendingCallRequest = {
                                    account: message.action.account,
                                    channelId: message.action.channelId,
                                    message: message.action.message
                                };

                                // Play the incoming call sound with loop enabled
                                DeskNotifier.playSound('callIncoming', true);

                                CALL_STATE.activeCallNotification = DeskNotifier.show({
                                    title: 'Incoming Call',
                                    message: `Incoming call from ${await desk.gui.resolveAccountId(message.action.account, message.action.account.substring(0, 8))}`,
                                    type: 'call',
                                    duration: 0,
                                    // Remove soundType since we're handling the sound separately
                                    buttons: [{
                                        text: 'Accept',
                                        class: 'accept-btn',
                                        onClick: async () => {
                                            DeskNotifier.stopLoopingSound();
                                            try {
                                                if(isMobile) {
                                                    // On mobile we load the call page and then accept the call
                                                    loadPage('call.html', null, null, async () => {
                                                        const decryptedMessage = JSON.parse(await decryptMessageRSA(message.action.message, message.action.account));
                                                        await acceptCall(networkId, message.action.account, decryptedMessage);
                                                        CALL_STATE.isCallActive = true;
                                                        CALL_STATE.pendingCallRequest = null;
                                                    });
                                                } else {
                                                    // On desktop we accept the calls either in the call page or in the floating interface
                                                    // If presently not in the call page, create and initialize floating interface
                                                    if(desk.nav.currentPage != 'call.html') {
                                                        createFloatingContainer();
                                                        initializeFloatingInterface();
                                                    }
                                                    const decryptedMessage = JSON.parse(await decryptMessageRSA(message.action.message, message.action.account));
                                                    await acceptCall(networkId, message.action.account, decryptedMessage);
                                                    CALL_STATE.isCallActive = true;
                                                    CALL_STATE.pendingCallRequest = null;
                                                }
                                            } catch (err) {
                                                console.error('Error accepting call:', err);
                                                DeskNotifier.show({
                                                    title: 'Call Error',
                                                    message: 'Failed to accept call',
                                                    type: 'error'
                                                });
                                            }
                                        }
                                    }, {
                                        text: 'Decline',
                                        class: 'decline-btn',
                                        onClick: () => {
                                            DeskNotifier.stopLoopingSound();
                                            if (CALL_STATE.pendingCallRequest) {
                                                CALL_STATE.pendingCallRequest.declined = true;
                                                handleDeclineCall(message.action.account, message.action.channelId);
                                            }
                                        }
                                    }]
                                });
                            }
                            break;

                        case 'callAccepted':
                            // Caller receives this when callee accepts
                            try {
                                const decryptedMessage = JSON.parse(await decryptMessageRSA(message.action.message, message.action.account));
                                if (decryptedMessage.accepted && decryptedMessage.channelId === currentChannelId) {
                                    // Double check we have the callees media server address in the list of available media servers
                                    if(!CALL_STATE.availableMediaServers.find(server => server.url === decryptedMessage.mediaServerAddress)) {
                                        throw new Error('Callee did not provide a matching media server address');
                                    }
                                    CALL_STATE.channelInfo.mediaServerAddress = decryptedMessage.mediaServerAddress;

                                    // Start media before calling
                                    await startMedia();
                                    connectToMediaServer(CALL_STATE.channelInfo.mediaServerAddress, currentChannelId);

                                    // Stop outgoing call sound
                                    DeskNotifier.stopLoopingSound();
                                    
                                    // Clear call request interval since call is established
                                    if (CALL_STATE.callRequestInterval) {
                                        clearInterval(CALL_STATE.callRequestInterval);
                                        CALL_STATE.callRequestInterval = null;
                                    }
                                    if (CALL_STATE.callTimeoutId) {
                                        clearTimeout(CALL_STATE.callTimeoutId);
                                        CALL_STATE.callTimeoutId = null;
                                    }

                                    // Start media for caller
                                    CALL_STATE.isCallActive = true;

                                    showStatus('Call connected', 'success');
                                }
                            } catch (err) {
                                console.error('Error handling call acceptance:', err);
                            }
                            break;

                        case 'callEnded':
                        case 'callDeclined':
                            if (CALL_STATE.activeCallNotification) {
                                CALL_STATE.activeCallNotification.remove();
                                CALL_STATE.activeCallNotification = null;
                            }
                            DeskNotifier.stopLoopingSound();
                            CALL_STATE.pendingCallRequest = null;
                            if (CALL_STATE.isCallActive) {
                                DeskNotifier.playSound('callEnd');
                                CALL_STATE.isCallActive = false;
                                cleanupCall();
                            }
                            break;
                        case 'callKeepAlive':
                            console.log('Received call keep-alive message');
                            break;
                    }
                }
            }
        }
    });
    desk.socketHandler.getSocket(networkId)
        .send(JSON.stringify({
            method: 'subscribe', 
            topic: 'call'
        }));
}

// Replace startCallKeepAlive with continuous call request
function startCallRequest(recipientAccount, channelId, channelKey, mediaServers) {
    if (CALL_STATE.callRequestInterval) {
        clearInterval(CALL_STATE.callRequestInterval);
    }
    if(CALL_STATE.isCallActive) {
        return;
    }

    // Set initial timeout for call request
    CALL_STATE.callTimeoutId = setTimeout(() => {
        endCall();
        DeskNotifier.show({
            title: 'Call Ended',
            message: 'No answer received',
            type: 'error',
            soundType: 'callEnd'
        });
    }, 60000); // 60 second timeout for call acceptance

    CALL_STATE.callRequestInterval = setInterval(async () => {
        if (!CALL_STATE.isCallActive) {
            try {
                const callRequest = {
                    channelId: channelId,
                    channelKey: channelKey,
                    mediaServers: mediaServers,
                    timestamp: Date.now()
                };

                const encryptedMessage = await encryptMessageRSA(JSON.stringify(callRequest), recipientAccount);
                
                const action = {
                    nonce: Date.now(),
                    type: 'callRequest',
                    account: desk.wallet.publicKey,
                    toAccount: recipientAccount,
                    message: encryptedMessage,
                    channelId: channelId
                };
                await desk.action.signAction(action);

                await desk.networkRequest({ 
                    networkId: desk.gui.activeNetworkId, 
                    method: 'callRequest', 
                    action 
                });
            } catch (err) {
                console.error('Call request error:', err);
                endCall();
            }
        }
    }, 2000); // Send call request every 2 seconds
}

async function acceptCall(networkId, account, decryptedMessage) {
    try {
        const { channelId, channelKey, mediaServers } = decryptedMessage;
        
        // Store channel info
        CALL_STATE.channelInfo.id = channelId;
        CALL_STATE.channelInfo.key = channelKey;
        currentChannelId = channelId;
        currentRecipient = account;

        // Find available media servers we can use
        const availableMediaServers = await findAvailableMediaServers(networkId);
        if (!availableMediaServers.length) {
            throw new Error('No suitable media server found');
        }
        CALL_STATE.availableMediaServers = availableMediaServers;

        // Look for a matching media server in the list from the caller
        let bestMediaServer = null;
        for(const callersServer of mediaServers) {
          for(const ourServer of availableMediaServers) {
                if(ourServer.nodeId === callersServer.nodeId) {
                    bestMediaServer = ourServer;
                    break;
                }
            }
        }
        if (!bestMediaServer) {
            throw new Error('No matching media server found in the list of available servers who can act as relay');
        }
        CALL_STATE.channelInfo.mediaServerAddress = bestMediaServer.url;

        // Set up encryption before accepting
        await setEncryptionKey(channelKey);

        // Create accept message with confirmation
        const acceptMessage = {
            channelId: channelId,
            accepted: true,
            timestamp: Date.now(),
            mediaServerAddress: bestMediaServer.url
        };

        const encryptedResponse = await encryptMessageRSA(JSON.stringify(acceptMessage), account);

        const action = {
            nonce: Date.now(),
            type: 'callAccepted',
            account: desk.wallet.publicKey,
            toAccount: account,
            message: encryptedResponse,
            channelId: channelId
        };
        await desk.action.signAction(action);

        const result = await desk.networkRequest({
            networkId: networkId,
            method: 'acceptCall',
            action
        });

        if (result.success) {
            // Start media and show floating interface immediately
            await startMedia();
            connectToMediaServer(bestMediaServer.url, channelId);
            
            // Show status in floating interface
            showFloatingStatus('Call connected');
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        console.error('Error accepting call:', err);
        showFloatingStatus('Error accepting call: ' + err.message);
        throw err;
    }
}

async function makeCall(recipientAccount) {
    currentRecipient = recipientAccount;
    try {
        // Generate channel ID and encryption key
        const channelKey = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
        const channelId = CryptoJS.lib.WordArray.random(12).toString(CryptoJS.enc.Hex);
        
        CALL_STATE.channelInfo.id = channelId;
        CALL_STATE.channelInfo.key = channelKey;
        currentChannelId = channelId;

        // Find available media servers among connected peers
        const availableMediaServers = await findAvailableMediaServers(desk.gui.activeNetworkId);
        if (!availableMediaServers.length) {
            showStatus('No suitable media server found', 'error');
            return;
        }
        CALL_STATE.availableMediaServers = availableMediaServers;

        // Set up encryption before calling
        await setEncryptionKey(channelKey);

        // Start continuous call requests
        startCallRequest(recipientAccount, channelId, channelKey, availableMediaServers);
        DeskNotifier.playSound('callOutgoing', true, 6000);
        
        // Display channel info
        document.querySelector('.channel-info').style.display = 'grid';
        document.getElementById('channelIdDisplay').value = channelId;
        document.getElementById('channelKeyDisplay').value = channelKey;

        showStatus('Calling...', 'info');
    } catch (err) {
        console.error('Error in makeCall:', err);
        showStatus('Error making call: ' + err.message, 'error');
        endCall();
    }
}

// Add join call functionality
async function joinCall(channelId, channelKey) {
    try {
        CALL_STATE.channelInfo.id = channelId;
        CALL_STATE.channelInfo.key = channelKey;
        currentChannelId = channelId;
        
        document.querySelector('.channel-info').style.display = 'grid';
        document.getElementById('channelIdDisplay').value = channelId;
        document.getElementById('channelKeyDisplay').value = channelKey;
        
        await setEncryptionKey(channelKey);
        await startMedia();
        connectToMediaServer(channelId);
        
        // Update UI
        document.getElementById('callButton').disabled = true;
        document.getElementById('endButton').disabled = false;
        document.getElementById('joinButton').disabled = true;
        
        showStatus('Successfully joined call', 'success');
    } catch (err) {
        console.error('Error joining call:', err);
        showStatus('Failed to join call: ' + err.message, 'error');
    }
}

async function checkMediaServerReachable(address, wsPort, wssPort) {
    const sslActive = window.location.protocol === 'https:' ? true : false;

    if(sslActive) {
        try {
            const ws = new WebSocket(`wss://${address}:${wssPort}`);
            const result = await new Promise((resolve) => {
                ws.onopen = () => {
                    ws.close();
                    resolve(true);
                };
                ws.onerror = (err, err2) => {
                    console.log('WSS connection error:', err);
                    resolve(false);
                };
                ws.addEventListener('close', (event) => {
                    console.log('Connection closed. Code:', event.code, 'Reason:', event.reason);
                });
                // Timeout after 3 seconds
                setTimeout(() => resolve(false), 3000);
            });
            if (result) return { reachable: true, ssl: true, port: wssPort };
        } catch (err) {
            console.log('WSS connection failed:', err);
        }
    }
    else {
        // Try WSS first if available
        if (wssPort) {
            try {
                const ws = new WebSocket(`wss://${address}:${wssPort}`);
                const result = await new Promise((resolve) => {
                    ws.onopen = () => {
                        ws.close();
                        resolve(true);
                    };
                    ws.onerror = () => resolve(false);
                    // Timeout after 3 seconds
                    setTimeout(() => resolve(false), 3000);
                });
                if (result) return { reachable: true, ssl: true, port: wssPort };
            } catch (err) {
                console.log('WSS connection failed:', err);
            }
        }

        // Try WS if WSS failed or wasn't available
        try {
            const ws = new WebSocket(`ws://${address}:${wsPort}`);
            const result = await new Promise((resolve) => {
                ws.onopen = () => {
                    ws.close();
                    resolve(true);
                };
                ws.onerror = () => resolve(false);
                setTimeout(() => resolve(false), 3000);
            });
            if (result) return { reachable: true, ssl: false, port: wsPort };
        } catch (err) {
            console.log('WS connection failed:', err);
        }
    }

    return { reachable: false };
}

async function findAvailableMediaServers(networkId) {
    try {
        // Get list of nodes with call module
        const nodesResponse = await desk.networkRequest({
            networkId: networkId,
            method: 'getConnectedNodes'
        });

        if (!nodesResponse.success || !nodesResponse.nodes.length) {
            throw new Error('No nodes with call module found');
        }

        // Test each node's media server reachability
        const servers = [];
        for (const node of nodesResponse.nodes) {
            const sslActive = window.location.protocol === 'https:' ? true : false;
            const port = sslActive ? node.wssPort : node.wsPort;

            servers.push({
                nodeId: node.nodeId,
                address: node.address,
                port: port,
                ssl: sslActive,
                url: `${sslActive ? 'wss' : 'ws'}://${node.address}:${port}`
            });
        }

        return servers;

    } catch (err) {
        console.error('Error finding reachable media servers:', err);
        return [];
    }
}

async function sendVideo() {
    // Clean up existing video processing
    if (CALL_STATE.videoReader) {
        try {
            await CALL_STATE.videoReader.cancel();
        } catch (err) {
            console.warn('Error canceling video reader:', err);
        }
    }
    if (CALL_STATE.currentVideoProcessor) {
        CALL_STATE.currentVideoProcessor = null;
    }

    const videoTrack = CALL_STATE.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const videoProcessor = new MediaStreamTrackProcessor(videoTrack);
    CALL_STATE.currentVideoProcessor = videoProcessor;
    const reader = videoProcessor.readable.getReader();
    CALL_STATE.videoReader = reader;

    let lastFrameTime = Date.now();
    let frameDelay = CONFIG.frameInterval;

    async function processVideoFrame() {
        try {
            const currentTime = Date.now();
            const timeSinceLastFrame = currentTime - lastFrameTime;

            // Skip frame if not enough time has passed
            if (timeSinceLastFrame < frameDelay) {
                const { value } = await reader.read();
                if (value) value.close();
                requestAnimationFrame(processVideoFrame);
                return;
            }

            const { done, value } = await reader.read();
            if (done) return;

            const frameData = await videoFrameToArrayBuffer(value);
            
            if (frameData.byteLength === 0) {
                console.warn('Empty frame detected, skipping...');
                value.close();
                requestAnimationFrame(processVideoFrame);
                return;
            }

            if (mediaWs && mediaWs.readyState === WebSocket.OPEN) {
                const { encryptedData, iv } = await encryptData(frameData);
                
                const packet = new Uint8Array(1 + iv.byteLength + encryptedData.byteLength);
                packet[0] = DATA_TYPES.VIDEO;
                packet.set(new Uint8Array(iv), 1);
                packet.set(new Uint8Array(encryptedData), 1 + iv.byteLength);
                
                // Adjust frame delay based on WebSocket buffer state
                const bufferedAmount = mediaWs.bufferedAmount;
                if (bufferedAmount > 1024 * 1024) { // More than 1MB buffered
                    // Increase delay (slow down)
                    frameDelay = Math.min(frameDelay * 1.2, CONFIG.maxFrameInterval);
                } else if (bufferedAmount < 512 * 1024) { // Less than 512KB buffered
                    // Decrease delay (speed up)
                    frameDelay = Math.max(frameDelay * 0.8, CONFIG.minFrameInterval);
                }

                mediaWs.send(packet.buffer);
                CALL_STATE.networkStats.bytesTransferred += packet.byteLength;
                lastFrameTime = currentTime;
            }
            
            value.close();
            requestAnimationFrame(processVideoFrame);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error processing video frame:', err);
            }
        }
    }

    processVideoFrame();
}

async function setupAudioProcessing() {
    try {
        const audioContext = getOrCreateAudioContext();
        const source = audioContext.createMediaStreamSource(CALL_STATE.localStream);
        
        // Load the audio worklet module first
        await audioContext.audioWorklet.addModule('/desk/js/call/audio-processor.js');
        
        // Create audio worklet for processing
        const audioNode = new AudioWorkletNode(audioContext, 'audio-processor');
        source.connect(audioNode);
        
        audioNode.port.onmessage = async (event) => {
            const { data } = event;
            if (data.type === 'rawAudioData') {
                if (mediaWs && mediaWs.bufferedAmount < 256 * 1024) {
                    try {
                        // Create the packet with correct structure
                        const { encryptedData, iv } = await encryptData(data.audioData);
                        
                        if (mediaWs && mediaWs.readyState === WebSocket.OPEN) {
                            // Create packet: [type(1) | iv(12) | encryptedData(rest)]
                            const packet = new Uint8Array(1 + iv.byteLength + encryptedData.byteLength);
                            packet[0] = DATA_TYPES.AUDIO;
                            packet.set(new Uint8Array(iv), 1);
                            packet.set(new Uint8Array(encryptedData), 1 + iv.byteLength);
                            
                            mediaWs.send(packet.buffer);
                        }
                    } catch (error) {
                        console.error("Error encrypting audio data:", error);
                    }
                }
            }
        };
    } catch (error) {
        console.error('Error setting up audio processing:', error);
        throw error; // Propagate the error for proper handling
    }
}

let currentChannelId = null;

// Auto-refresh chat when the user selects a different channel
document.addEventListener('call.html-load', () => {
    desk.gui.populateNetworkSelect('call');
    /*desk.gui.onNetworkChange = function(){
        setCallSocketHandler();
    };
    setCallSocketHandler();*/

    // Call button handler
    document.getElementById('callButton').addEventListener('click', async () => {
        const recipientId = document.getElementById('recipientId').value.trim();
        if (!recipientId) {
            showStatus('Please enter a recipient ID', 'error');
            return;
        }

        try {
            document.getElementById('callButton').disabled = true;
            await makeCall(recipientId);
            document.getElementById('endButton').disabled = false;
            showStatus('Call initiated successfully', 'success');
        } catch (err) {
            showStatus('Failed to initiate call: ' + err.message, 'error');
            document.getElementById('callButton').disabled = false;
        }
    });

    // End button handler
    document.getElementById('endButton').addEventListener('click', async () => {
        try {
            await endCall();
            document.getElementById('callButton').disabled = false;
            document.getElementById('endButton').disabled = true;
            showStatus('Call ended', 'success');
        } catch (err) {
            showStatus('Error ending call: ' + err.message, 'error');
        }
    });

    document.getElementById('videoToggle').addEventListener('click', () => {
        updateMediaState('video', !CALL_STATE.videoEnabled);
    });

    document.getElementById('audioToggle').addEventListener('click', () => {
        updateMediaState('audio', !CALL_STATE.audioEnabled);
    });

    document.getElementById('cameraSwitch').addEventListener('click', switchCamera);

    document.getElementById('fullscreenToggle').addEventListener('click', toggleFullscreen);

    // Add join button handler
    document.getElementById('joinButton').addEventListener('click', async () => {
        const channelId = document.getElementById('joinChannelId').value.trim();
        const channelKey = document.getElementById('joinChannelKey').value.trim();
        
        if (!channelId || !channelKey) {
            showStatus('Please enter both Channel ID and Key', 'error');
            return;
        }
        
        await joinCall(channelId, channelKey);
    });
});

document.addEventListener('call-init', function(){
    Object.values(desk.availableNetworks).forEach(network => {
        const webName = network.name.webName;
        if(webName == 'call') {
            setCallSocketHandler(network.id);
        }
    });
});


async function endCall() {
    try {
        // Clear intervals and timeouts first
        if (CALL_STATE.callRequestInterval) {
            clearInterval(CALL_STATE.callRequestInterval);
            CALL_STATE.callRequestInterval = null;
        }
        if (CALL_STATE.callTimeoutId) {
            clearTimeout(CALL_STATE.callTimeoutId);
            CALL_STATE.callTimeoutId = null;
        }

        // Stop sounds
        DeskNotifier.stopLoopingSound();

        // Send end call signal if we have a recipient
        if (currentRecipient) {
            const action = {
                nonce: Date.now(),
                type: 'callEnded',
                account: desk.wallet.publicKey,
                toAccount: currentRecipient,
                channelId: currentChannelId
            };
            await desk.action.signAction(action);

            await desk.networkRequest({ 
                networkId: desk.gui.activeNetworkId, 
                method: 'endCall', 
                action 
            });
        }

        // Reset call state variables
        currentRecipient = null;
        currentChannelId = null;

        // Do complete cleanup
        cleanupCall();

    } catch (err) {
        console.error('Error ending call:', err);
        showStatus('Error ending call: ' + err.message, 'error');
    }
}

function cleanupCall() {
    try {
        // Stop all tracks in local stream
        if (CALL_STATE.localStream) {
            CALL_STATE.localStream.getTracks().forEach(track => {
                track.stop();
                CALL_STATE.localStream.removeTrack(track);
            });
            CALL_STATE.localStream = null;
        }

        // Clean up video processing
        if (CALL_STATE.videoReader) {
            CALL_STATE.videoReader.cancel();
            CALL_STATE.videoReader = null;
        }
        if (CALL_STATE.currentVideoProcessor) {
            CALL_STATE.currentVideoProcessor = null;
        }

        // Clean up audio context
        if (globalAudioContext) {
            globalAudioContext.close().catch(console.error);
            globalAudioContext = null;
        }

        // Close WebSocket connection
        if (mediaWs) {
            mediaWs.close();
            mediaWs = null;
        }

        // Reset video element
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = null;
        }

        // Clear all remote video elements
        CALL_STATE.remoteStreams.forEach((element) => {
            if (element.srcObject) {
                element.srcObject.getTracks().forEach(track => track.stop());
                element.srcObject = null;
            }
        });

        // Reset all state
        CALL_STATE.localStream = null;
        CALL_STATE.participants.clear();
        CALL_STATE.remoteStreams.clear();
        CALL_STATE.participantStats.clear();
        CALL_STATE.isScreenSharing = false;
        CALL_STATE.originalVideoTrack = null;
        CALL_STATE.channelInfo.id = null;
        CALL_STATE.channelInfo.key = null;
        CALL_STATE.isCallActive = false;
        clearTimeout(CALL_STATE.callTimeoutId);

        // Reset UI
        document.getElementById('callButton').disabled = false;
        document.getElementById('endButton').disabled = true;
        document.getElementById('videoToggle').disabled = true;
        document.getElementById('audioToggle').disabled = true;
        document.getElementById('screenShareBtn').classList.remove('active');
        document.querySelector('.participants-grid').innerHTML = '';
        document.querySelector('.channel-info').style.display = 'none';

        // Clear any remaining notifications
        if (CALL_STATE.activeCallNotification) {
            CALL_STATE.activeCallNotification.remove();
            CALL_STATE.activeCallNotification = null;
        }

        // Stop any sounds
        DeskNotifier.stopLoopingSound();

        // Handle floating container
        if (floatingContainer) {
            floatingContainer.style.display = 'none';
            floatingContainer.classList.remove('collapsed');
            floatingContainer.innerHTML = '';
        }

        showStatus('Call ended', 'success');

        // Clear canvas contexts
        CALL_STATE.participants.forEach(participant => {
            if (participant.canvasContexts) {
                participant.canvasContexts.clear();
            }
        });

        // Clean up audio players
        CALL_STATE.audioPlayers.forEach(player => {
            player.gainNode.disconnect();
        });
        CALL_STATE.audioPlayers.clear();

    } catch (err) {
        console.error('Error cleaning up call:', err);
    }
}

// Add error recovery
function handleMediaError(error) {
    console.error('Media error:', error);
    showStatus(`Media error: ${error.message}`, 'error');

    // Attempt to recover based on error type
    if (error.name === 'NotFoundError' || error.name === 'NotReadableError') {
        // Device error - try to reinitialize
        setTimeout(async () => {
            try {
                await startMedia();
            } catch (err) {
                showStatus('Failed to recover media devices', 'error');
            }
        }, 2000);
    }
}

// Add participant statistics tracking
function updateParticipantStats(participantId, stats) {
    if (!CALL_STATE.participantStats.has(participantId)) {
        CALL_STATE.participantStats.set(participantId, {
            lastUpdate: Date.now(),
            videoReceived: 0,
            audioReceived: 0,
            packetLoss: 0,
            latency: 0
        });
    }

    const participantStats = CALL_STATE.participantStats.get(participantId);
    Object.assign(participantStats, stats);
    participantStats.lastUpdate = Date.now();
}

function monitorNetworkQuality() {
    setInterval(() => {
        if (mediaWs && mediaWs.readyState === WebSocket.OPEN) {
            const now = Date.now();
            const quality = {
                bufferedAmount: mediaWs.bufferedAmount,
                latency: now - CALL_STATE.networkStats.lastMessageTime,
                bytesTransferred: CALL_STATE.networkStats.bytesTransferred,
                currentFrameInterval: CONFIG.frameInterval
            };

            const indicator = document.getElementById('networkQuality');
            if (!indicator) return;

            // Update icon and adjust quality based on network conditions
            let icon = 'signal';
            if (quality.bufferedAmount > 1024 * 1024 || quality.latency > 1000) {
                indicator.className = 'network-indicator network-poor';
                icon = 'signal';
                // Reduce quality and slow down frame rate
                CONFIG.scaleFactor = Math.max(CONFIG.scaleFactor * 0.9, 0.3);
                CONFIG.jpegQuality = Math.max(CONFIG.jpegQuality * 0.9, 0.3);
                CONFIG.frameInterval = Math.min(CONFIG.frameInterval * 1.2, CONFIG.maxFrameInterval);
            } else if (quality.latency > 500) {
                indicator.className = 'network-indicator network-medium';
                icon = 'signal';
            } else {
                indicator.className = 'network-indicator network-good';
                // Maybe increase quality and frame rate
                if (CONFIG.scaleFactor < 1) {
                    CONFIG.scaleFactor = Math.min(CONFIG.scaleFactor * 1.1, 1);
                    CONFIG.jpegQuality = Math.min(CONFIG.jpegQuality * 1.1, 1);
                    CONFIG.frameInterval = Math.max(CONFIG.frameInterval * 0.9, CONFIG.minFrameInterval);
                }
            }
            
            indicator.innerHTML = `<i class="fas fa-${icon}"></i>`;
        }
    }, 2000);
}

/*
function setupBandwidthAdaptation() {
    let lastBytesTransferred = 0;
    let lastCheckTime = Date.now();

    setInterval(() => {
        if (mediaWs) {
            const now = Date.now();
            const bytesTransferred = mediaWs.bufferedAmount;
            const timeDiff = now - lastCheckTime;
            const bytesDiff = bytesTransferred - lastBytesTransferred;
            
            const bitrate = (bytesDiff * 8) / (timeDiff / 1000); // bits per second

            // Adapt quality based on bitrate
            if (bitrate > 2000000) { // > 2 Mbps
                CONFIG.scaleFactor *= 0.9;
                CONFIG.jpegQuality *= 0.9;
            } else if (bitrate < 500000) { // < 500 Kbps
                CONFIG.scaleFactor = Math.min(CONFIG.scaleFactor * 1.1, 1.0);
                CONFIG.jpegQuality = Math.min(CONFIG.jpegQuality * 1.1, 1.0);
            }

            lastBytesTransferred = bytesTransferred;
            lastCheckTime = now;
        }
    }, 2000);
}*/

// Update handleDeclineCall function
async function handleDeclineCall(account, channelId) {
    try {
        const action = {
            nonce: Date.now(),
            type: 'callDeclined',
            account: desk.wallet.publicKey,
            toAccount: account,
            channelId: channelId
        };
        await desk.action.signAction(action);

        await desk.networkRequest({
            networkId: desk.gui.activeNetworkId,
            method: 'rejectCall',
            action
        });

        // Ensure notification is removed
        if (CALL_STATE.activeCallNotification) {
            CALL_STATE.activeCallNotification.remove();
            CALL_STATE.activeCallNotification = null;
        }
        
        // Clean up any media resources
        cleanupCall();
    } catch (err) {
        console.error('Error declining call:', err);
        showStatus('Error declining call: ' + err.message, 'error');
    }
}

// Add this function to handle page navigation while in call
function handleCallPageNavigation() {
    const currentPage = desk.nav.currentPage;
    if (currentPage !== 'call.html' && CALL_STATE.isCallActive) {
        desk.nav.moveCallToFloat();
    } else if (currentPage === 'call.html' && CALL_STATE.isCallActive) {
        desk.nav.restoreCallInterface();
    }
}

// Add event listener for page changes
document.addEventListener('page-changed', handleCallPageNavigation);

// Add this new class for audio buffering and playback
class AudioPlayer {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.bufferQueue = [];
        this.isPlaying = false;
        this.nextPlayTime = 0;
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
    }

    addBuffer(audioData) {
        // Add new buffer to queue
        this.bufferQueue.push(audioData);
        
        // Keep only recent buffers to prevent delay buildup
        while (this.bufferQueue.length > AUDIO_CONFIG.maxBufferCount) {
            this.bufferQueue.shift();
        }

        if (!this.isPlaying) {
            this.scheduleBuffers();
        }
    }

    scheduleBuffers() {
        if (this.bufferQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const audioData = this.bufferQueue.shift();
        
        // Create buffer with correct sample rate
        const audioBuffer = this.audioContext.createBuffer(1, audioData.length, AUDIO_CONFIG.sampleRate);
        audioBuffer.copyToChannel(audioData, 0);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode);

        // Calculate play time
        if (this.nextPlayTime < this.audioContext.currentTime) {
            this.nextPlayTime = this.audioContext.currentTime;
        }

        // Schedule this buffer
        source.start(this.nextPlayTime);
        
        // Calculate next play time
        const bufferDuration = audioBuffer.duration;
        this.nextPlayTime += bufferDuration;

        // Schedule next buffer before this one ends
        source.onended = () => {
            this.scheduleBuffers();
        };
    }

    setVolume(value) {
        this.gainNode.gain.value = value;
    }
}

