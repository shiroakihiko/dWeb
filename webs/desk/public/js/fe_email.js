

// Generate a random nonce
function nonce() {
    return nacl.randomBytes(nacl.box.nonceLength);
}

// Fetch account info
async function getLastBlockHashes(accounts) {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getLastBlockHashes', accounts });
    return result.success ? result.hashes : {};
}


// Fetch recipient public key by email address
async function fetchRecipientPublicKey(emailAddress) {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getPublicKeyByEmail', emailAddress });
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
// Function to handle received email and display it in the history list
async function handleReceivedEmail(email) {
    try {
        // Decrypt the email message
        const decryptedMessage = await decryptMessageRSA(email.message, email.fromAccount);
        if(!decryptedMessage)
            return;
        const parsedMessage = JSON.parse(decryptedMessage);
        const { subject, body } = parsedMessage;

        // Verifying the email signature
        let signedBlock = { ...email };
        delete signedBlock.signature;
        delete signedBlock.validatorSignatures;
        delete signedBlock.hash;
        delete signedBlock.timestamp;
        delete signedBlock.delegatorTime;

        const isSignatureValid = await verifySignature(canonicalStringify(signedBlock), email.signature, email.fromAccount);
        if (!isSignatureValid) return;

        // Create an email preview div
        const emailDiv = document.createElement('div');
        emailDiv.className = 'email-preview-item';
        emailDiv.innerHTML = `
        <div class="email-header">
        <strong>From:</strong> ${email.fromAccount.substring(0, 16)}...
        ${subject}
        <span class="timestamp">${new Date(email.timestamp).toLocaleString()}</span>
        </div>
        <div class="email-body-preview">
        ${body.substring(0, 100)}...
        </div>
        `;

        // Add click event to expand the email
        emailDiv.onclick = () => showEmailPreview(parsedMessage, email.fromAccount, email.timestamp);

        // Append the email preview to the history section
        document.getElementById('emails').appendChild(emailDiv);
    } catch (error) {
        console.error('Error handling email:', error);
    }
}

// Function to show detailed email preview when clicked
function showEmailPreview(emailContent, fromAccount, timestamp) {
    const previewDiv = document.getElementById('emailPreview');
    previewDiv.innerHTML = `
    <h4>From: ${fromAccount}</h4>
    <p><strong>Timestamp:</strong> ${new Date(timestamp).toLocaleString()}</p>
    <p><strong>Subject:</strong> ${emailContent.subject}</p>
    <div id="emailDisplayBody">${emailContent.body}</div>
    `;
    document.getElementById('emailPreview').style.display = 'block';
}

// Fetch email history from the server and render them
async function fetchEmailHistory() {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getEmailHistory', accountId: desk.wallet.publicKey });
    if (result.success) {
        document.getElementById('emails').innerHTML = '';
        result.emails.forEach(handleReceivedEmail);
    } else {
        alert('Error fetching email history: ' + result.message);
    }
}

// Send email
async function sendEmail() {
    const toAccount = document.getElementById('toAddress').value.trim();
    const subject = document.getElementById('subject').value.trim();
    const body = quill.getSemanticHTML();
    //const body = tinymce.get('emailBody').getContent();

    if (!body) {
        alert('Please enter the message body');
        return;
    }

    //const recipientPublicKey = await fetchRecipientPublicKey(toAccount);
    const recipientPublicKey = toAccount;
    const message = { subject, body };
    const encryptedMessage = await encryptMessageRSA(JSON.stringify(message), recipientPublicKey);

    const fromAccount = desk.wallet.publicKey;
    const delegator = desk.gui.delegator;
    const lastBlockHashes = await getLastBlockHashes([fromAccount, toAccount, delegator]);

    const block = {
        type: 'email',
        fromAccount: fromAccount,
        toAccount: toAccount,
        amount: 0,
        delegator: delegator,
        fee: '1000000000',
        burnAmount: '500000000',
        delegatorReward: '500000000',
        message: encryptedMessage,
        previousBlockSender: lastBlockHashes[fromAccount],
        previousBlockRecipient: lastBlockHashes[toAccount],
        previousBlockDelegator: lastBlockHashes[delegator]
    };

    block.signature = base64Encode(await signMessage(canonicalStringify(block)));

    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'sendEmail', block });
    if (result.success) {
        alert('Email sent successfully');
        fetchEmailHistory();
    } else {
        alert('Error sending email: ' + result.message);
    }
}


// Load email history on page load
document.addEventListener('email.html-init', function(){
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

    quill = new Quill('#emailBody', {
      modules: {
        toolbar: toolbarOptions
      },
      theme: 'snow'
    });
});
