
// Function to send verification request
async function sendVerificationRequest() {
    const message = document.getElementById('message').value.trim();
    const signature = document.getElementById('signature').value.trim();
    const publicKey = document.getElementById('publicKey').value.trim();

    if (!message || !signature || !publicKey) {
        alert('Please fill in all fields!');
        return;
    }

    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'verifySignature', message: message, signature: signature, publicKey: publicKey });
    // Handle the response and display the result
    if (result.success) {
        document.getElementById('resultMessage').textContent = 'Verification successful!';
    } else {
        document.getElementById('resultMessage').textContent = 'Verification failed: ' + result.message;
    }
}

// Function to sign message and send block
async function signAndSendBlock() {
    const signMessage = document.getElementById('signMessage').value;
    const privateKey = document.getElementById('privateKey').value.trim();

    if (!signMessage || !privateKey) {
        alert('Please fill in both the message and private key!');
        return;
    }

    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'signBlock', message: signMessage, privateKey: privateKey });
    // Handle the response and display the result
    if (result.success) {
        document.getElementById('resultMessage').textContent = 'Block signed. Signature: ' + result.signature;
    } else {
        document.getElementById('resultMessage').textContent = 'Error signing block: ' + result.message;
    }
}
