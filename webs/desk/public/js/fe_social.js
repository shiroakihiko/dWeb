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
async function decryptPost(action) {
    try {
        // Try to find our encrypted secret in the members list
        const encryptedSecret = action.instruction.members[desk.wallet.publicKey];
        if (!encryptedSecret) {
            return null; // We're not authorized to see this post
        }
        
        // Secre key the post was encrypted with
        const postSecret = await decryptMessageRSA(encryptedSecret, action.account);
        
        // Use the secret to decrypt the actual content
        const decryptedContent = await decryptPostContent(action.instruction.content, postSecret);
        return decryptedContent;
    } catch (error) {
        console.error('Error decrypting post:', error);
        return null;
    }
}

// Create and send a new post
async function createPost() {
    
    const content = quills.get('social-post').getSemanticHTML(); //tinymce.get('postContent').getContent();
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
        
        const fromAccount = desk.wallet.publicKey;
        const toAccount = desk.wallet.publicKey; // Post is to self
        const delegator = desk.gui.delegator;

        const instruction = {
            type: 'post',
            toAccount: toAccount,
            account: fromAccount,
            content: encryptedContent,
            members: memberSecrets,
            amount: 0
        };
        const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
        if (sendResult.success) {
            alert('Post created successfully');
            fetchUserPosts();
        } else {
            alert('Error creating post: ' + sendResult.message);
        }
    } catch (error) {
        console.error('Error creating post:', error);
        alert('Error creating post: ' + error.message);
    }
}

// Fetch and display posts for a specific user
async function fetchUserPosts(userKey) {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'getPosts', accountId: userKey || desk.wallet.publicKey });
    if (result.success) {
        displayPosts(result.posts, false, userKey);
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

// Initialize the page
document.addEventListener('social.html-load', function(event) {
    desk.gui.populateNetworkSelect('social');
    
    // Set up notification handler for post-related blocks
    desk.messageHandler.registerNotificationHandler('post', async (action) => { });
    
    // Set up message handler for post updates
    desk.messageHandler.addMessageHandler(desk.gui.activeNetworkId, async (message) => {
        try {
            const action = message.action;
            const instruction = action.instruction;
            if (instruction.type === 'post') {
                // Check if we're a member of this post
                const decryptedContent = await decryptPost(action);
                if (decryptedContent) {
                    // Add the new post to the display
                    displayPosts([{
                        fromAccount: action.account,
                        content: instruction.content,
                        members: instruction.members,
                        timestamp: Date.now()
                    }], true);
                    
                    DeskNotifier.show({
                        title: 'New Post',
                        message: action.account === desk.wallet.publicKey ? 
                            'Your post was published successfully' : 
                            `New post from ${await desk.gui.resolveAccountId(action.account, action.account)}`,
                        type: 'social'
                    });
                }
            }
        } catch (error) {
            console.error('Error handling post notification:', error);
        }
    });

    quill = new Quill('#postContent', {
        modules: {
            toolbar: '#postToolbar'
        },
        theme: 'snow'
    });
    quills.set(`social-post`, quill);
    
    // Check URL parameters for user feed
    const params = event.detail.linkParams;
    if (params.showUser) {
        fetchUserPosts(params.showUser);
    } else {
        fetchUserPosts();
    }
});

// New displayPosts function to handle both initial load and updates
async function displayPosts(posts, prepend = false, userKey = null) {
    const postsContainer = document.getElementById('posts');
    
    // If this is a fresh load (not prepending), clear the container
    if (!prepend) {
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
    }

    // Process each post
    for (const post of posts) {
        const decryptedContent = await decryptPost(post);
        if (decryptedContent) {
            const postElement = await createPostElement(post, decryptedContent);
            
            if (prepend) {
                // Add new post to the top
                postsContainer.insertBefore(postElement, postsContainer.firstChild);
                
                // Optional: Limit the number of displayed posts
                if (postsContainer.children.length > 50) {
                    postsContainer.lastChild.remove();
                }
            } else {
                postsContainer.appendChild(postElement);
            }
        }
    }
}

// Helper function to create post element
async function createPostElement(post, decryptedContent) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post-item';
    
    const resolvedName = await desk.gui.resolveAccountId(post.fromAccount, post.fromAccount.substring(0, 16));
    
    postDiv.innerHTML = `
        <div class="post-header">
            <span class="post-author" onclick="viewUserFeed('${post.fromAccount}')" style="cursor: pointer;">
                <strong>From:</strong> <span class="blockexplorer-link" data-hash="${post.fromAccount}" data-networkId="${desk.gui.activeNetworkId}">${resolvedName}...</span>
            </span>
            <span class="timestamp">${new Date(post.timestamp).toLocaleString()}</span>
        </div>
        <div class="post-content">
            ${decryptedContent}
        </div>
    `;
    
    return postDiv;
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