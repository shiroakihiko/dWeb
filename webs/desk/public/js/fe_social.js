

async function generatePostSecret() {
    return bufferToHex(nacl.randomBytes(32));
}

async function encryptPostContent(content, secret) {
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(JSON.stringify(content));
    const secretKey = await hashText(secret);
    const nonce = nacl.randomBytes(24);
    const encryptedMessage = nacl.secretbox(messageBytes, nonce, hexToUint8Array(secretKey));
    return btoa(nonce) + ':' + btoa(encryptedMessage);
}

async function decryptPostContent(encryptedContent, secret) {
    const messageParts = encryptedContent.split(':');
    const nonce = readBase64String(messageParts[0]);
    const encryptedBytes = readBase64String(messageParts[1]);
    const secretKey = await hashText(secret);
    
    
    const decryptedBytes = nacl.secretbox.open(encryptedBytes, nonce, hexToUint8Array(secretKey));
    if (!decryptedBytes) {
        throw new Error('Decryption failed');
    }
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decryptedBytes));
}

function readBase64String(data)
{
    const encryptedBytes = atob(data).split(",").map(Number);
    // Assuming you have an array of bytes (encryptedBytes)
    let arrayBufferRebuilt = new ArrayBuffer(encryptedBytes.length);
    let encryptedBytesUint8 = new Uint8Array(arrayBufferRebuilt);

    for (let i = 0; i < encryptedBytes.length; i++) {
      encryptedBytesUint8[i] = encryptedBytes[i];
    }
    
    return encryptedBytesUint8;
}

// Decrypt and display posts
async function decryptPost(post) {
    try {
        // Try to find our encrypted secret in the members list
        const encryptedSecret = post.members[desk.wallet.publicKey];
        if (!encryptedSecret) {
            return null; // We're not authorized to see this post
        }
        
        // Secre key the post was encrypted with
        const postSecret = await decryptMessageRSA(encryptedSecret, post.fromAccount);
        
        // Use the secret to decrypt the actual content
        const decryptedContent = await decryptPostContent(post.content, postSecret);
        return decryptedContent;
    } catch (error) {
        console.error('Error decrypting post:', error);
        return null;
    }
}

// Create and send a new post
async function createPost() {
    const content = quill.getSemanticHTML(); //tinymce.get('postContent').getContent();
    const memberInputs = document.querySelectorAll('.member-input');
    const members = Array.from(memberInputs).map(input => input.value.trim()).filter(Boolean);
    
    if (!content || members.length === 0) {
        alert('Please enter content and at least one member');
        return;
    }

    try {
        // Generate random secret for this post
        const postSecret = await generatePostSecret();
        
        // Encrypt post content with the secret
        const encryptedContent = await encryptPostContent(content, postSecret);
        
        // Encrypt the secret for each member
        const memberSecrets = {};
        for (const memberKey of members) {
            memberSecrets[memberKey] = await encryptMessageRSA(postSecret, memberKey);
        }
        
        const publicKey = desk.wallet.publicKey;
        const delegator = desk.gui.delegator;
        const lastBlockHashes = await getLastBlockHashes([publicKey, publicKey, delegator]);

        const block = {
            type: 'post',
            toAccount: publicKey,
            fromAccount: publicKey,
            delegator: delegator,
            content: encryptedContent,
            members: memberSecrets,
            previousBlockSender: lastBlockHashes[publicKey],
            previousBlockRecipient: lastBlockHashes[publicKey],
            previousBlockDelegator: lastBlockHashes[delegator],
            amount: 0,
            fee: '1000000000',
            burnAmount: '500000000',
            delegatorReward: '500000000'
        };

        block.signature = base64Encode(await signMessage(canonicalStringify(block)));

        const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'createPost', block });
        if (result.success) {
            alert('Post created successfully');
            fetchPosts();
        } else {
            alert('Error creating post: ' + result.message);
        }
    } catch (error) {
        console.error('Error creating post:', error);
        alert('Error creating post: ' + error.message);
    }
}


// Fetch and display posts for a specific user
async function fetchUserPosts(userKey) {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getPosts', accountId: userKey || desk.wallet.publicKey }); // Use provided key or default to current user
    if (result.success) {
        const postsContainer = document.getElementById('posts');
        postsContainer.innerHTML = '';
        
        // Add user header if viewing someone else's posts
        if (userKey && userKey !== desk.wallet.publicKey) {
            const userHeader = document.createElement('div');
            userHeader.className = 'user-header';
            userHeader.innerHTML = `
                <h3>Posts from: ${userKey.substring(0, 16)}...</h3>
                <button class="ui_button" onclick="viewOwnFeed()" class="return-button">Return to My Feed</button>
            `;
            postsContainer.appendChild(userHeader);
        }
        
        for (const post of result.posts) {
            const decryptedContent = await decryptPost(post);
            if (decryptedContent) {
                const postDiv = document.createElement('div');
                postDiv.className = 'post-item';
                postDiv.innerHTML = `
                    <div class="post-header">
                        <span class="post-author" onclick="viewUserFeed('${post.fromAccount}')" style="cursor: pointer;">
                            <strong>From:</strong> ${post.fromAccount.substring(0, 16)}...
                        </span>
                        <span class="timestamp">${new Date(post.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="post-content">
                        ${decryptedContent}
                    </div>
                `;
                postsContainer.appendChild(postDiv);
            }
        }
    } else {
        alert('Error fetching posts: ' + result.message);
    }
}

// View specific user's feed
function viewUserFeed(userKey) {
    updateUrlParams({ showUser: userKey });
    fetchUserPosts(userKey);
}

// Return to own feed
function viewOwnFeed() {
    window.location.hash = '';
    fetchUserPosts();
}
// Fetch and display posts
async function fetchPosts() {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getPosts', accountId: desk.wallet.publicKey });
    if (result.success) {
        const postsContainer = document.getElementById('posts');
        postsContainer.innerHTML = '';
        
        for (const post of result.posts) {
            const decryptedContent = await decryptPost(post);
            if (decryptedContent) {
                const postDiv = document.createElement('div');
                postDiv.className = 'post-item';
                postDiv.innerHTML = `
                    <div class="post-header">
                        <strong>From:</strong> ${post.fromAccount.substring(0, 16)}...
                        <span class="timestamp">${new Date(post.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="post-content">
                        ${decryptedContent}
                    </div>
                `;
                postsContainer.appendChild(postDiv);
            }
        }
    } else {
        alert('Error fetching posts: ' + result.message);
    }
}

// Add member input field
function addMemberInput() {
    const memberContainer = document.querySelector('.member-inputs');
    const inputDiv = document.createElement('div');
    inputDiv.className = 'member-input-container';
    inputDiv.innerHTML = `
        <input type="text" class="member-input" placeholder="Member public key">
        <button type="button" class="remove-member" onclick="this.parentElement.remove()">×</button>
    `;
    memberContainer.appendChild(inputDiv);
}
const VideoEmbed = Quill.import("formats/video");

class Video extends VideoEmbed {
    html () {
        return this.domNode.outerHTML;
    }
}
const Embed= Quill.import('blots/embed');


Quill.register(Video, true);
let quill;
// Initialize the page
document.addEventListener('social.html-init', function(event) {
    desk.gui.populateNetworkSelect('social');
    

    quill = new Quill('#postContent', {
      modules: {
        toolbar: '#postToolbar'
      },
      theme: 'snow'
    });
    /*
    // Remove any old tinymce instance
    //tinymce.remove();
    // Initialize TinyMCE
    tinymce.init({
        selector: '#postContent',
        menubar: false,
        plugins: 'lists link image file autoresize media youtube',
        toolbar: 'undo redo | styles | bold italic | alignleft aligncenter alignright alignjustify | outdent indent | image',
        content_style: '#postContent { font-family: Arial, sans-serif; font-size: 14px; }',
        branding: false,
        license_key: 'gpl',
    extended_valid_elements: 'iframe[src|width|height|name|align|frameborder|allowfullscreen]',  // Allow iframe with attributes
    media_dimensions: true,  // Allow media resizing
    
        // Enable drag-and-drop image support
        automatic_uploads: false,     // Disable automatic uploads as we're using base64
        images_dataimg_filter: function(img) {
            // Allow all images, including base64
            return img.src.startsWith('data:image');
        },
        file_picker_types: 'image', // Allow image picking in the file picker
        image_advtab: true, // Show advanced tab for image properties
    });*/
    
    // Check URL parameters for user feed
    const params = event.detail.linkParams;
    if (params.showUser) {
        fetchUserPosts(params.showUser);
    } else {
        fetchUserPosts();
    }
});