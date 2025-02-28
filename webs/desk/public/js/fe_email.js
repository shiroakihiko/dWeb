// Fetch recipient public key by email address
async function fetchRecipientPublicKey(emailAddress) {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'getPublicKeyByEmail', emailAddress });
    if (result.success) {
        return result.publicKey;
    } else {
        throw new Error('Failed to fetch recipient public key');
    }
}

// Sorts the object before stringifying it
function canonicalStringify(obj) {
    const sortedObj = Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
    }, {});
    return JSON.stringify(sortedObj);
}

// Add near the top with other functions
async function getAvatarHtml(accountId) {
    const thumbnail = await getThumbnail(accountId);
    if (thumbnail) {
        return `<img src="data:image/jpeg;base64,${thumbnail.instruction.data}" class="avatar" alt="User avatar">`;
    }
    return `<div class="avatar default-avatar">${accountId.substring(0, 2)}</div>`;
}

// Function to handle received email and display it in the history list
async function handleReceivedEmail(email, addToTop = false) {
    try {
        // Check if email already exists
        if (document.querySelector(`.email-preview-item[data-email-id="${email.hash}"]`)) {
            return; // Skip if email already displayed
        }

        // Try to find our encrypted secret in the members list
        const encryptedSecret = email.instruction.members[desk.wallet.publicKey];
        if (!encryptedSecret) {
            return; // We're not authorized to see this email
        }

        // Decrypt the secret
        const emailSecret = await decryptMessageRSA(encryptedSecret, email.account);
        
        // Use the secret to decrypt the actual content
        const decryptedContent = await decryptPostContent(email.instruction.content, emailSecret);
        const { subject, body } = decryptedContent;

        // Create an email preview div
        const emailDiv = document.createElement('div');
        emailDiv.className = 'email-preview-item';
        emailDiv.setAttribute('data-email-id', email.hash);
        
        const isOutgoing = email.account === desk.wallet.publicKey;
        const icon = isOutgoing ? '📤' : '📥';
        
        // Determine which account to show (recipient for outgoing, sender for incoming)
        const displayAccount = isOutgoing ? email.instruction.toAccount : email.account;
        
        // Format date in a shorter way
        const formatDate = (date) => {
            const now = new Date();
            const messageDate = new Date(date);
            
            // If it's today, show only time
            if (messageDate.toDateString() === now.toDateString()) {
                return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            // If it's this year, show date without year
            if (messageDate.getFullYear() === now.getFullYear()) {
                return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
            
            // Otherwise show short date with year
            return messageDate.toLocaleDateString([], { 
                year: '2-digit',
                month: 'short',
                day: 'numeric'
            });
        };

        const trimmedBody = body.replace(/^<p>/g, '').replace(/<\/p>$/g, '');
        emailDiv.innerHTML = `
            <div class="email-avatar">
                ${await getAvatarHtml(displayAccount)}
            </div>
            <div class="email-content">
                <div class="email-header">
                    <span class="email-sender">${await desk.gui.resolveAccountId(displayAccount, displayAccount.substring(0, 16))}...</span>
                    <span class="email-time">${formatDate(email.timestamp)}</span>
                </div>
                <div class="email-subject">${subject}</div>
                <div class="email-body-preview">
                    ${trimmedBody.substring(0, 100)}${trimmedBody.length > 100 ? '...' : ''}
                </div>
            </div>
        `;

        // Add click event to expand the email
        emailDiv.onclick = () => {
            document.querySelectorAll('.email-preview-item').forEach(item => {
                item.classList.remove('selected');
            });
            emailDiv.classList.add('selected');
            showEmailPreview(decryptedContent, email.account, email.timestamp, isOutgoing, email);
        };

        // Append the email preview to the history section
        const emailsContainer = document.getElementById('emails');
        if (addToTop) {
            emailsContainer.insertBefore(emailDiv, emailsContainer.firstChild);
            // Scroll to top when new email arrives
            if (window.innerWidth <= 768) {
                emailsContainer.scrollTop = 0;
            }
        } else {
            emailsContainer.appendChild(emailDiv);
        }
    } catch (error) {
        console.error('Error handling email:', error);
    }
}

// Function to show detailed email preview when clicked
async function showEmailPreview(emailContent, fromAccount, timestamp, isOutgoing, block) {
    const icon = isOutgoing ? '📤' : '📥';
    const previewDiv = document.getElementById('emailPreview');
    
    // Hide inbox on mobile before showing preview
    if (window.innerWidth <= 768) {
        document.querySelector('.email-sidebar').style.display = 'none';
        document.querySelector('.email-main').scrollIntoView();
    }
    
    previewDiv.innerHTML = `
        <button class="mobile-back-button" onclick="hideEmailPreview()">
            <i class="fas fa-arrow-left"></i> Back to Inbox
        </button>
        <div class="preview-header">
            <div class="preview-header-left">
                ${await getAvatarHtml(fromAccount)}
            </div>
            <div class="preview-header-content">
                <h4>${icon} From: <span class="blockexplorer-link" data-hash="${fromAccount}" data-networkId="${desk.gui.activeNetworkId}">
                    ${await desk.gui.resolveAccountId(fromAccount, fromAccount)}
                </span></h4>
                <p><strong>Subject:</strong> ${emailContent.subject}</p>
                <p><strong>Block:</strong> <span class="blockexplorer-link" data-hash="${block.hash}" data-networkId="${desk.gui.activeNetworkId}">${block.hash}</span></p>
                <p class="timestamp">${new Date(timestamp).toLocaleString()}</p>
            </div>
            <div class="preview-actions">
                <button class="ui_button primary" onclick='replyToEmail(${JSON.stringify(emailContent)}, "${fromAccount}")'>
                    <i class="fas fa-reply"></i> Reply
                </button>
            </div>
        </div>
        <div class="preview-content">
            ${emailContent.body}
        </div>
    `;
    
    document.getElementById('emailPreview').style.display = 'flex';
    document.getElementById('emailComposer').style.display = 'none';
    document.querySelector('.email-container').classList.add('show-preview');
}

// Add hideEmailPreview function
function hideEmailPreview() {
    document.getElementById('emailPreview').style.display = 'none';
    document.querySelector('.email-container').classList.remove('show-preview');
    
    // Show inbox again on mobile (no scroll needed)
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.email-sidebar');
        sidebar.style.display = 'flex';
    }
}

// Fetch email history from the server and render them
async function fetchEmailHistory() {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'getEmailHistory', accountId: desk.wallet.publicKey });
    if (result.success) {
        document.getElementById('emails').innerHTML = '';
        result.emails.forEach(handleReceivedEmail);
        // Scroll inbox to top after loading
        if (window.innerWidth <= 768) {
            const emailsContainer = document.getElementById('emails');
            emailsContainer.scrollTop = 0;
        }
    } else {
        alert('Error fetching email history: ' + result.message);
    }
}

// Send email
async function sendEmail() {
    const toAccount = document.getElementById('toAddress').value.trim();
    const subject = document.getElementById('subject').value.trim();
    const body = emailQuill.getSemanticHTML();

    if (!body) {
        alert('Please enter the message body');
        return;
    }

    try {
        // Generate random secret for this email
        const emailSecret = await generatePostSecret(); // Reuse the function from social.js
        
        // Encrypt email content with the secret
        const content = { subject, body };
        const encryptedContent = await encryptPostContent(content, emailSecret);
        
        // Encrypt the secret for both sender and recipient
        const memberSecrets = {};
        memberSecrets[toAccount] = await encryptMessageRSA(emailSecret, toAccount);
        memberSecrets[desk.wallet.publicKey] = await encryptMessageRSA(emailSecret, desk.wallet.publicKey); // Add ourselves

        const instruction = {
            type: 'email',
            account: desk.wallet.publicKey,
            toAccount: toAccount,
            amount: 0,
            content: encryptedContent,
            members: memberSecrets
        };
        const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
        if (sendResult.success) {
            DeskNotifier.playSound('emailOut');
            DeskNotifier.show({
                title: 'Email Sent',
                message: 'Email sent successfully',
                type: 'success',
                soundType: null
            });
            hideComposer(); // This will now properly show the inbox on mobile
            fetchEmailHistory();
        } else {
            DeskNotifier.show({
                title: 'Error',
                message: 'Error sending email: ' + result.message,
                type: 'error'
            });
        }
    } catch (error) {
        console.error('Error sending email:', error);
        alert('Error sending email: ' + error.message);
    }
}

let emailQuill = null;
// Load email history on page load
document.addEventListener('email.html-load', function(){
    desk.gui.populateNetworkSelect('email');
    desk.gui.onNetworkChange = function(){
        fetchEmailHistory();
    };
    fetchEmailHistory();
    
    const toolbarOptions = [

      [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

      [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
      ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
      [{ 'align': [] }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
      [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
      ['link', 'image', 'video'],

      ['blockquote', 'code-block'],

      ['clean']                                         // remove formatting button
    ];

    if(!emailQuill)
    {
        emailQuill = new Quill('#emailBody', {
            modules: {
                toolbar: toolbarOptions
            },
            theme: 'snow'
        });
    }

    // Add socket handler for new emails
    desk.messageHandler.addMessageHandler(desk.gui.activeNetworkId, (message) => {
        if (message.topic === 'action_confirmation' && message.action.instruction.type === 'email') {
            if (message.networkId == desk.gui.activeNetworkId) {
                if (message.action.instruction.toAccount === desk.wallet.publicKey || 
                    message.action.account === desk.wallet.publicKey) {
                    handleReceivedEmail(message.action, true); // true means add to top
                }
            }
        }
    });
});

document.addEventListener('email-init', function(){
    // Register email notification handler
    desk.messageHandler.registerNotificationHandler('email', async (action) => {
        try {
            // Try to find our encrypted secret in the members list
            const encryptedSecret = action.instruction.members[desk.wallet.publicKey];
            if (!encryptedSecret) {
                return; // We're not authorized to see this email
            }

            // Decrypt the secret
            const emailSecret = await decryptMessageRSA(encryptedSecret, action.account);
            
            // Use the secret to decrypt the actual content
            const decryptedContent = await decryptPostContent(action.instruction.content, emailSecret);
            const { subject } = decryptedContent;

            DeskNotifier.show({
                title: 'New Email Received',
                message: `Subject: ${subject}`,
                type: 'email'
            });
        } catch (error) {
            console.error('Error handling email notification:', error);
        }
    });
});

function showComposer() {
    // Hide inbox on mobile before showing composer
    if (window.innerWidth <= 768) {
        document.querySelector('.email-sidebar').style.display = 'none';
    }
    
    document.getElementById('emailComposer').style.display = 'flex';
    document.getElementById('emailPreview').style.display = 'none';
    document.querySelector('.email-container').classList.add('show-composer');
    
    // Clear previous content
    document.getElementById('toAddress').value = '';
    document.getElementById('subject').value = '';
    emailQuill.setContents([]);
}

function hideComposer() {
    document.getElementById('emailComposer').style.display = 'none';
    document.querySelector('.email-container').classList.remove('show-composer');
    
    // Show inbox again on mobile and scroll to inbox
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.email-sidebar');
        sidebar.style.display = 'flex';
        document.querySelector('.email-sidebar').scrollIntoView();
    }
}

// Add reply functionality
async function replyToEmail(emailContent, fromAccount) {
    showComposer();
    
    // Set recipient
    document.getElementById('toAddress').value = fromAccount;
    
    // Set subject (add Re: if not already present)
    let subject = emailContent.subject;
    if (!subject.startsWith('Re:')) {
        subject = 'Re: ' + subject;
    }
    document.getElementById('subject').value = subject;
    
    // Format original message in the body
    const timestamp = new Date().toLocaleString();
    const quotedMessage = `
<br><br>
<div class="email-quote">
    <div class="quote-header">On ${timestamp}, ${fromAccount.substring(0, 16)}... wrote:</div>
    <blockquote>
        ${emailContent.body}
    </blockquote>
</div>`;
    
    emailQuill.clipboard.dangerouslyPasteHTML(quotedMessage);
    
    // Move cursor to top of editor
    emailQuill.setSelection(0, 0);

    // Scroll to composer on mobile
    if (window.innerWidth <= 768) {
        document.querySelector('.email-main').scrollIntoView();
    }
}
