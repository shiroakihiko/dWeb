// Thumbnail system state
let thumbnails = [];
let currentImage = null;
let thumbnailCache = new Map();

// Initialize the thumbnail system
document.addEventListener('thumbnail.html-load', (event) => {
    desk.gui.populateNetworkSelect('thumbnail');
    desk.gui.onNetworkChange = () => {
        thumbnailCache.clear(); // Clear cache on network change
        loadThumbnails();
    };
    loadThumbnails();
    
    // Set up WebSocket handling
    desk.messageHandler.registerNotificationHandler('thumbnail', async (block) => {
        try {
            if (block.fromAccount === desk.wallet.publicKey) {
                // Add the new thumbnail to the display
                displayThumbnails([block], true);
                
                // Show notification
                DeskNotifier.show({
                    title: 'New Thumbnail',
                    message: 'Thumbnail uploaded successfully',
                    type: 'thumbnail'
                });
            }
        } catch (error) {
            console.error('Error handling thumbnail notification:', error);
        }
    });
});

// Load thumbnails
async function loadThumbnails() {
    // Clear the cache when loading new thumbnails
    thumbnailCache.clear();
    
    const thumbnailNetworkId = getThumbnailNetworkId();
    if (!thumbnailNetworkId) {
        console.error('No thumbnail network available');
        return;
    }
    
    const result = await desk.networkRequest({ 
        networkId: thumbnailNetworkId, 
        method: 'getThumbnails', 
        accountId: desk.wallet.publicKey 
    });
    if (result.success) {
        thumbnails = result.thumbnails;
        displayThumbnails(result.thumbnails);
    }
}

// Display thumbnails
async function displayThumbnails(thumbnails, prepend = false) {
    const container = document.getElementById('thumbnails');
    
    // If thumbnails is empty, clear the display
    if (thumbnails.length === 0) {
        container.innerHTML = '<p>No thumbnails found</p>';
        return;
    }

    // Get the current default thumbnail
    const result = await desk.networkRequest({ 
        networkId: desk.gui.activeNetworkId, 
        method: 'getDefaultThumbnail', 
        accountId: desk.wallet.publicKey 
    });
    
    const defaultThumbnailId = result.success && result.thumbnail ? result.thumbnail.hash : null;

    // If this is a new single thumbnail, add it to the top
    if (thumbnails.length === 1 && prepend && container.children.length > 0) {
        const thumb = thumbnails[0];
        const div = createThumbnailElement(thumb, defaultThumbnailId);
        container.insertBefore(div, container.firstChild);
        
        // Optional: Limit the number of displayed thumbnails
        if (container.children.length > 50) {
            container.lastChild.remove();
        }
    } else {
        // Display all thumbnails
        container.innerHTML = '';
        thumbnails.forEach(thumb => {
            const div = createThumbnailElement(thumb, defaultThumbnailId);
            container.appendChild(div);
        });
    }
}

// Helper function to create thumbnail element
function createThumbnailElement(thumb, defaultThumbnailId) {
    const div = document.createElement('div');
    div.className = 'thumbnail-item';
    const isDefault = thumb.hash === defaultThumbnailId;
    
    div.innerHTML = `
        <img src="data:image/jpeg;base64,${thumb.instruction.data}" alt="${thumb.hash}">
        <div class="thumbnail-info">
            <div>ID: ${thumb.hash.substring(0, 8)}...</div>
            <div>${thumb.instruction.width}x${thumb.instruction.height}</div>
            ${isDefault ? 
                '<div class="default-badge">Default</div>' : 
                `<button onclick="setDefaultThumbnail('${thumb.hash}')">Set Default</button>`
            }
        </div>
    `;
    return div;
}

// Generate AI Image
async function generateAIImage() {
    const prompt = document.getElementById('promptInput').value;
    const generateButton = document.querySelector('[onclick="generateAIImage()"]');
    
    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }

    try {
        // Disable button and show loading state
        generateButton.disabled = true;
        generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        
        // Fixed dimensions for avatar
        const width = 512;
        const height = 512;
        
        const response = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ", avatar")}?width=${width}&height=${height}`);
        const blob = await response.blob();
        currentImage = await blobToBase64(blob);
        
        // Show preview
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = `<img src="data:image/jpeg;base64,${currentImage}">`;
    } catch (error) {
        alert('Error generating image: ' + error.message);
    } finally {
        // Re-enable button and restore original text
        generateButton.disabled = false;
        generateButton.innerHTML = 'Generate';
    }
}

document.addEventListener('thumbnail-init', (event) => {
    // Handle file input
    document.getElementById('fileInputThumbnail').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            currentImage = await processImage(file);
            const preview = document.getElementById('imagePreview');
            preview.innerHTML = `<img src="data:image/jpeg;base64,${currentImage}">`;
        }
    });
});

// Process and resize image
async function processImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Scale down if larger than 512x512
                if (width > 512 || height > 512) {
                    const ratio = Math.min(512/width, 512/height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to base64 and compress
                resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Upload thumbnail
async function uploadThumbnail() {
    if (!currentImage) {
        alert('Please select or generate an image first');
        return;
    }

    const img = new Image();
    img.onload = async () => {
        const instruction = {
            type: 'thumbnail',
            account: desk.wallet.publicKey,
            toAccount: desk.wallet.publicKey,
            amount: 0,
            data: currentImage,
            width: img.width,
            height: img.height
        };
        const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
        if (sendResult.success) {
            document.getElementById('fileInput').value = '';
            document.getElementById('promptInput').value = '';
            document.getElementById('imagePreview').innerHTML = '';
            currentImage = null;
            loadThumbnails();
        } else {
            alert('Error uploading thumbnail: ' + sendResult.message);
        }
    };
    img.src = `data:image/jpeg;base64,${currentImage}`;
}

// Helper function to convert blob to base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Set default thumbnail
async function setDefaultThumbnail(thumbnailId) {
    const thumbnailNetworkId = getThumbnailNetworkId();
    if (!thumbnailNetworkId) {
        alert('No thumbnail network available');
        return;
    }
    const instruction = {
        type: 'default',
        account: desk.wallet.publicKey,
        toAccount: desk.wallet.publicKey,
        thumbnailId: thumbnailId,
        amount: 0
    };

    const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
    if (sendResult.success) {
        // Clear the cache for this account since default changed
        thumbnailCache.delete(desk.wallet.publicKey);
        loadThumbnails();
    } else {
        alert('Error setting default thumbnail: ' + sendResult.message);
    }
}

// Add this helper function to get the thumbnail network ID
function getThumbnailNetworkId() {
    // Loop through available networks to find the first thumbnail network
    for (const networkId in desk.availableNetworks) {
        if (desk.availableNetworks[networkId].name.webName === 'thumbnail') {
            return networkId;
        }
    }
    return null; // Return null if no thumbnail network is found
}

// Modify getThumbnail function
async function getThumbnail(accountId) {
    // Check cache first
    if (thumbnailCache.has(accountId)) {
        return thumbnailCache.get(accountId);
    }

    const thumbnailNetworkId = getThumbnailNetworkId();
    if (!thumbnailNetworkId) {
        console.error('No thumbnail network available');
        return null;
    }

    // If not in cache, fetch from network
    const result = await desk.networkRequest({ 
        networkId: thumbnailNetworkId, 
        method: 'getDefaultThumbnail', 
        accountId: accountId 
    });

    if (result.success) {
        // Cache the result (even if it's null)
        thumbnailCache.set(accountId, result.thumbnail);
        return result.thumbnail;
    }
    
    return null;
}