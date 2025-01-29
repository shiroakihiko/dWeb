

let floatingContainer = null;
let encryptionKey = null;

function showStatus(message, type) {
    const status = document.getElementById('callStatus');
    status.textContent = message;
    status.className = 'status ' + type;
    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}
document.addEventListener('call.html-leave', () => {
    if (CALL_STATE.isCallActive) {
        createFloatingContainer();
        initializeFloatingInterface();
    }
});

function createFloatingContainer() {
    if (!floatingContainer) {
        floatingContainer = document.createElement('div');
        floatingContainer.id = 'floatingVideoContainer';
        document.body.appendChild(floatingContainer);
        
        // Make container draggable
        makeDraggable(floatingContainer);
    }
}

// Add volume control for participants
function adjustParticipantVolume(participantId, volume) {
    const audioPlayer = CALL_STATE.audioPlayers.get(participantId);
    if (audioPlayer) {
        audioPlayer.setVolume(volume);
    }
}

function makeDraggable(element) {
    let isDragging = false;
    let isResizing = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let initialWidth;
    let initialHeight;

    element.addEventListener('mousedown', function(e) {
        // Check if we're in the bottom-right resize area (15x15 pixels)
        const isResizeArea = (e.offsetX >= element.offsetWidth - 15) && 
                           (e.offsetY >= element.offsetHeight - 15);

        // If clicking controls, return early
        if (e.target.closest('#floatingCallControls')) {
            return;
        }

        e.preventDefault();

        if (isResizeArea) {
            // Start resizing
            isResizing = true;
            initialX = e.clientX;
            initialY = e.clientY;
            initialWidth = element.offsetWidth;
            initialHeight = element.offsetHeight;
            element.style.cursor = 'se-resize';
        } else {
            // Start dragging
            isDragging = true;
            element.style.cursor = 'grabbing';
            initialX = e.clientX - element.offsetLeft;
            initialY = e.clientY - element.offsetTop;
        }
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging && !isResizing) return;
        e.preventDefault();

        if (isResizing) {
            // Handle resize
            const width = initialWidth + (e.clientX - initialX);
            const height = initialHeight + (e.clientY - initialY);

            // Apply min/max constraints
            const newWidth = Math.max(300, Math.min(800, width));
            const newHeight = Math.max(170, Math.min(600, height));

            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';

            // Update UI after resize
            updateParticipantsUI();
        } else if (isDragging) {
            // Handle drag
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            // Apply bounds
            if (currentX < 0) currentX = 0;
            if (currentY < 0) currentY = 0;
            if (currentX > window.innerWidth - element.offsetWidth) {
                currentX = window.innerWidth - element.offsetWidth;
            }
            if (currentY > window.innerHeight - element.offsetHeight) {
                currentY = window.innerHeight - element.offsetHeight;
            }

            element.style.left = currentX + 'px';
            element.style.top = currentY + 'px';
        }
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            element.style.cursor = 'grab';
        }
        if (isResizing) {
            isResizing = false;
            element.style.cursor = 'grab';
        }
    });

    // Update cursor on hover
    element.addEventListener('mousemove', function(e) {
        if (!isDragging && !isResizing) {
            const isResizeArea = (e.offsetX >= element.offsetWidth - 15) && 
                               (e.offsetY >= element.offsetHeight - 15);
            element.style.cursor = isResizeArea ? 'se-resize' : 'grab';
        }
    });
}

// Add new function to initialize floating interface
function initializeFloatingInterface() {
    const floatingContainer = document.getElementById('floatingVideoContainer');
    if (!floatingContainer) return;

    // Add click handler for collapsed state
    floatingContainer.addEventListener('click', (e) => {
        if (floatingContainer.classList.contains('collapsed')) {
            floatingContainer.classList.remove('collapsed');
            e.stopPropagation();
        }
    });

    // Create call controls if they don't exist
    if (!document.getElementById('floatingCallControls')) {
        const controls = document.createElement('div');
        controls.id = 'floatingCallControls';
        controls.innerHTML = `
            <button id="floatingVideoToggle" class="floating-btn ${!CALL_STATE.videoEnabled ? 'disabled' : ''}">
                <i class="fas fa-video"></i>
            </button>
            <button id="floatingAudioToggle" class="floating-btn ${!CALL_STATE.audioEnabled ? 'disabled' : ''}">
                <i class="fas fa-microphone"></i>
            </button>
            <button id="floatingEndCall" class="floating-btn">
                <i class="fas fa-phone-slash"></i>
            </button>
        `;
        floatingContainer.appendChild(controls);

        // Add event listeners for floating controls
        document.getElementById('floatingVideoToggle').onclick = (e) => {
            e.stopPropagation();
            const enabled = !CALL_STATE.videoEnabled;
            updateMediaState('video', enabled);
            e.currentTarget.classList.toggle('disabled', !enabled);
        };
        
        document.getElementById('floatingAudioToggle').onclick = (e) => {
            e.stopPropagation();
            const enabled = !CALL_STATE.audioEnabled;
            updateMediaState('audio', enabled);
            e.currentTarget.classList.toggle('disabled', !enabled);
        };
        
        document.getElementById('floatingEndCall').onclick = (e) => {
            e.stopPropagation();
            endCall();
        };
    }

    // Create participants grid if it doesn't exist
    let participantsGrid = floatingContainer.querySelector('.participants-grid');
    if (!participantsGrid) {
        participantsGrid = document.createElement('div');
        participantsGrid.className = 'participants-grid floating';
        floatingContainer.appendChild(participantsGrid);
    }

    // Show the floating container
    floatingContainer.style.display = 'block';
    updateParticipantsUI();
    
    // Make draggable
    makeDraggable(floatingContainer);
}

// Add floating status display
function showFloatingStatus(message) {
    if (!floatingContainer) return;
    
    let statusDiv = floatingContainer.querySelector('.floating-status');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.className = 'floating-status';
        floatingContainer.appendChild(statusDiv);
    }
    
    statusDiv.textContent = message;
    statusDiv.style.opacity = '1';
    
    setTimeout(() => {
        statusDiv.style.opacity = '0';
    }, 3000);
}

async function togglePictureInPicture(videoElement) {
    if (!document.pictureInPictureEnabled) {
        showStatus('Picture-in-Picture is not supported in this browser', 'error');
        return;
    }

    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (videoElement) {
            await videoElement.requestPictureInPicture();
        }
    } catch (err) {
        console.error('PiP error:', err);
        showStatus('Picture-in-Picture failed: ' + err.message, 'error');
    }
}

// Add orientation change handler
window.addEventListener('orientationchange', () => {
    if (isMobile) {
        setTimeout(adjustMobileLayout, 100);
    }
});

// Add this function to handle fullscreen
function toggleFullscreen() {
    const participantsPanel = document.querySelector('.participants-panel');
    
    if (!document.fullscreenElement) {
        participantsPanel.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// Add mobile layout adjustment
function adjustMobileLayout() {
    const container = document.querySelector('.call-container');
    const interface = document.querySelector('.call-interface');
    
    if (window.matchMedia("(orientation: portrait)").matches) {
        interface.style.gridTemplateColumns = '1fr';
        interface.style.gridTemplateRows = 'auto auto';
    } else {
        interface.style.gridTemplateColumns = '1fr 1fr';
        interface.style.gridTemplateRows = 'auto';
    }

    // Adjust video sizes
    const videoElements = document.querySelectorAll('video, canvas');
    videoElements.forEach(el => {
        el.style.maxWidth = '100%';
        el.style.height = 'auto';
    });
}

function toggleParticipantFullscreen(participantCard) {
    if (!document.fullscreenElement) {
        participantCard.requestFullscreen().then(() => {
            participantCard.classList.add('fullscreen');
        }).catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
            showStatus('Failed to enter fullscreen: ' + err.message, 'error');
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
                // Add a small delay to ensure smooth transition
                setTimeout(() => {
                    document.querySelector('.participant-card.fullscreen')?.classList.remove('fullscreen');
                }, 100);
            }).catch(err => {
                console.error('Error exiting fullscreen:', err);
                showStatus('Failed to exit fullscreen: ' + err.message, 'error');
            });
        }
    }
}

// Add fullscreen change event listener
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        // Ensure we remove fullscreen class when exiting via Esc key
        document.querySelector('.participant-card.fullscreen')?.classList.remove('fullscreen');
    }
});

// Add new toggle function
async function toggleScreenShare() {
    if (CALL_STATE.isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
}

// Add helper function to create participant cards
function createParticipantCard(id, participant) {
    const card = document.createElement('div');
    card.className = 'participant-card';
    card.id = `participant-card-${id}`;
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'participant-video';

    let mediaElement;
    if (participant.isLocal) {
        mediaElement = document.createElement('video');
        mediaElement.autoplay = true;
        mediaElement.muted = true;
        mediaElement.playsInline = true;
        mediaElement.srcObject = CALL_STATE.localStream;
        mediaElement.style.width = '100%';
        mediaElement.style.height = '100%';
        mediaElement.style.objectFit = 'contain';
        videoContainer.appendChild(mediaElement);
    } else {
        mediaElement = document.createElement('canvas');
        mediaElement.id = `remote-${id}`;
        mediaElement.width = 1280;
        mediaElement.height = 720;
        mediaElement.style.width = '100%';
        mediaElement.style.height = '100%';
        mediaElement.style.objectFit = 'contain';
        videoContainer.appendChild(mediaElement);
    }

    // Add fullscreen button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'participant-fullscreen-btn';
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.onclick = (e) => {
        e.stopPropagation();
        toggleParticipantFullscreen(card);
    };
    videoContainer.appendChild(fullscreenBtn);

    // Add PiP button only if the browser supports it
    if (document.pictureInPictureEnabled) {
        const pipBtn = document.createElement('button');
        pipBtn.className = 'participant-pip-btn';
        pipBtn.innerHTML = '<i class="fas fa-external-link-alt"></i>';
        pipBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                if (participant.isLocal) {
                    await togglePictureInPicture(mediaElement);
                } else {
                    // For remote participants, use the pre-created video element
                    const pipVideo = document.getElementById('pipVideo');
                    
                    // Stop any existing stream
                    if (pipVideo.srcObject) {
                        pipVideo.srcObject.getTracks().forEach(track => track.stop());
                    }

                    // Create a stream from the canvas that's showing the remote video
                    const canvas = document.getElementById(`remote-${id}`);
                    if (!canvas) {
                        throw new Error('Remote video canvas not found');
                    }

                    // Create a stream from the canvas
                    const stream = canvas.captureStream(30); // 30fps
                    pipVideo.srcObject = stream;
                    pipVideo.style.opacity = '0.01'; // Make briefly visible to trigger play

                    try {
                        // Start playing the video
                        const playPromise = pipVideo.play();
                        if (playPromise !== undefined) {
                            await playPromise;
                            // Once playing starts, request PiP
                            await togglePictureInPicture(pipVideo);
                            pipVideo.style.opacity = '0';

                            // Setup cleanup for when PiP is closed
                            const cleanup = () => {
                                if (pipVideo.srcObject) {
                                    pipVideo.srcObject.getTracks().forEach(track => track.stop());
                                    pipVideo.srcObject = null;
                                }
                            };

                            pipVideo.addEventListener('leavepictureinpicture', cleanup, { once: true });
                        }
                    } catch (err) {
                        pipVideo.style.opacity = '0';
                        if (pipVideo.srcObject) {
                            pipVideo.srcObject.getTracks().forEach(track => track.stop());
                            pipVideo.srcObject = null;
                        }
                        throw err;
                    }
                }
            } catch (err) {
                console.error('PiP error:', err);
                showStatus('Picture-in-Picture failed: ' + err.message, 'error');
            }
        };
        videoContainer.appendChild(pipBtn);
    }

    card.appendChild(videoContainer);

    // Add participant name and controls
    const nameDiv = document.createElement('div');
    nameDiv.className = 'participant-name';
    nameDiv.textContent = participant.name;
    videoContainer.appendChild(nameDiv);

    if (!participant.isLocal) {
        const controls = document.createElement('div');
        controls.className = 'participant-controls';
        const volumeControl = document.createElement('input');
        volumeControl.type = 'range';
        volumeControl.min = '0';
        volumeControl.max = '100';
        volumeControl.className = 'volume-control';
        volumeControl.onchange = (e) => adjustParticipantVolume(id, e.target.value / 100);
        controls.appendChild(volumeControl);
        videoContainer.appendChild(controls);
    }

    return card;
}

// Add this function to manage participant UI
function updateParticipantsUI() {
    const mainContainer = document.querySelector('.participants-grid:not(.floating)');
    const floatingContainer = document.querySelector('.participants-grid.floating');
    
    const containers = [mainContainer, floatingContainer].filter(Boolean);

    containers.forEach(container => {
        // Clear existing participants
        container.innerHTML = '';

        // Add local participant
        const localCard = createParticipantCard(desk.wallet.publicKey, {
            name: 'You',
            isLocal: true,
            stream: CALL_STATE.localStream
        });
        container.appendChild(localCard);

        // Add remote participants
        CALL_STATE.participants.forEach((participant, id) => {
            if (id !== desk.wallet.publicKey && id.length > 0) {
                const card = createParticipantCard(id, {
                    name: participant.name || id.substring(0, 8),
                    isLocal: false
                });
                container.appendChild(card);

                // Get the canvas in this card and store its context for later use
                const canvas = card.querySelector(`#remote-${id}`);
                if (canvas) {
                    // Store the canvas context in the participant data for both interfaces
                    if (!participant.canvasContexts) {
                        participant.canvasContexts = new Set();
                    }
                    participant.canvasContexts.add(canvas.getContext('2d'));
                }
            }
        });
    });
}


// Add this function for stream controls
function updateMediaState(type, enabled) {
    if (!CALL_STATE.localStream) return;
    
    if (type === 'video') {
        CALL_STATE.localStream.getVideoTracks().forEach(track => {
            track.enabled = enabled;
        });
        CALL_STATE.videoEnabled = enabled;
        document.getElementById('videoToggle')?.classList.toggle('disabled', !enabled);
        document.getElementById('floatingVideoToggle')?.classList.toggle('disabled', !enabled);
    } else if (type === 'audio') {
        CALL_STATE.localStream.getAudioTracks().forEach(track => {
            track.enabled = enabled;
        });
        CALL_STATE.audioEnabled = enabled;
        document.getElementById('audioToggle')?.classList.toggle('disabled', !enabled);
        document.getElementById('floatingAudioToggle')?.classList.toggle('disabled', !enabled);
    }
}
// Add copy to clipboard functionality
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    element.select();
    document.execCommand('copy');
    
    // Show feedback
    const originalText = element.previousElementSibling.textContent;
    element.previousElementSibling.textContent = 'Copied!';
    setTimeout(() => {
        element.previousElementSibling.textContent = originalText;
    }, 1000);
}

// Add this function to switch cameras
async function switchCamera() {
    if (!CALL_STATE.localStream) return;
    
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (videoDevices.length < 2) {
            console.warn('Only one camera available');
            return;
        }
        
        // Get current camera index and calculate next camera index
        const currentTrack = CALL_STATE.localStream.getVideoTracks()[0];
        const currentDeviceId = currentTrack.getSettings().deviceId;
        const currentIndex = videoDevices.findIndex(device => device.deviceId === currentDeviceId);
        const nextIndex = (currentIndex + 1) % videoDevices.length;
        const nextDevice = videoDevices[nextIndex];
        
        console.log('Available cameras:', videoDevices.map(d => d.label));
        console.log('Switching from camera:', currentIndex, 'to:', nextIndex);
        
        if (nextDevice) {
            // Stop the current track
            currentTrack.stop();
            
            // Get new stream with the next camera
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    deviceId: { exact: nextDevice.deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    aspectRatio: 16/9
                },
                audio: false
            });
            
            // Replace the video track in the local stream
            const newTrack = newStream.getVideoTracks()[0];
            const audioTrack = CALL_STATE.localStream.getAudioTracks()[0];
            
            // Create a new MediaStream with the new video track and existing audio track
            CALL_STATE.localStream = new MediaStream([newTrack, audioTrack]);
            
            // Update all local video elements
            document.querySelectorAll('video').forEach(videoElement => {
                if (videoElement.muted) { // This identifies local video elements
                    videoElement.srcObject = CALL_STATE.localStream;
                    videoElement.style.objectFit = 'contain';
                }
            });
            
            // Force participant UI update to refresh the local video
            updateParticipantsUI();
            
            // Restart the video sending process
            sendVideo();
            
            showStatus(`Switched to camera: ${nextDevice.label}`, 'success');
        }
    } catch (err) {
        console.error('Error switching camera:', err);
        showStatus('Failed to switch camera: ' + err.message, 'error');
    }
}





// Update startScreenShare
async function startScreenShare() {
    try {
        if (CALL_STATE.isScreenSharing) return;  // Prevent starting if already sharing
        
        // Only proceed if not mobile
        if (isMobile) {
            showStatus('Screen sharing is not supported on mobile devices', 'error');
            return;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                displaySurface: "monitor",
                logicalSurface: true,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });

        // Store the original video track to restore later
        CALL_STATE.originalVideoTrack = CALL_STATE.localStream.getVideoTracks()[0];
        
        // Replace video track with screen share
        const screenTrack = screenStream.getVideoTracks()[0];
        const audioTrack = CALL_STATE.localStream.getAudioTracks()[0];
        
        // Listen for when user stops screen sharing via browser UI
        screenTrack.onended = () => {
            stopScreenShare();
        };

        // Create new stream with screen track
        CALL_STATE.localStream = new MediaStream([screenTrack, audioTrack]);
        
        // Update state and UI
        CALL_STATE.isScreenSharing = true;
        const screenShareBtn = document.getElementById('screenShareBtn');
        screenShareBtn.classList.add('active');
        screenShareBtn.querySelector('i').classList.remove('fa-desktop');
        screenShareBtn.querySelector('i').classList.add('fa-stop-circle');
        
        // Update all local video elements
        document.querySelectorAll('video').forEach(videoElement => {
            if (videoElement.muted) {
                videoElement.srcObject = CALL_STATE.localStream;
            }
        });

        showStatus('Screen sharing started', 'success');
        
        // Restart video sending with screen content
        sendVideo();
    } catch (err) {
        console.error('Error starting screen share:', err);
        showStatus('Failed to start screen sharing: ' + err.message, 'error');
        CALL_STATE.isScreenSharing = false;
    }
}

// Update stopScreenShare
function stopScreenShare() {
    if (CALL_STATE.originalVideoTrack) {
        // Stop the screen share track
        CALL_STATE.localStream.getVideoTracks()[0].stop();
        
        const audioTrack = CALL_STATE.localStream.getAudioTracks()[0];
        CALL_STATE.localStream = new MediaStream([CALL_STATE.originalVideoTrack, audioTrack]);
        
        // Update all local video elements
        document.querySelectorAll('video').forEach(videoElement => {
            if (videoElement.muted) {
                videoElement.srcObject = CALL_STATE.localStream;
            }
        });

        // Update state and UI
        CALL_STATE.isScreenSharing = false;
        const screenShareBtn = document.getElementById('screenShareBtn');
        screenShareBtn.classList.remove('active');
        screenShareBtn.querySelector('i').classList.remove('fa-stop-circle');
        screenShareBtn.querySelector('i').classList.add('fa-desktop');
        
        showStatus('Screen sharing stopped', 'success');
        
        // Restart video sending with camera
        sendVideo();
        
        // Clear the stored track
        CALL_STATE.originalVideoTrack = null;
    }
}