


    // Function to fetch transaction history
    async function fetchTransactionHistory(accountId) {
        console.log("Fetching transaction history for:", accountId); // Debugging log
        const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getTransactions', accountId });
        console.log("Transaction history result:", result); // Debugging log
        return result.success ? result.transactions : [];
    }

    // Function to update fee field based on the amount
    function updateFee() {
        const amount = parseFloat(document.getElementById('amount').value);
        const fee = (amount * 0.001).toFixed(2); // Calculate 0.1% fee
        document.getElementById('fee').value = fee;
    }


    // Function to send a transaction
    async function sendTransaction() {
        const fromAccount = desk.wallet.publicKey;
        const toAccount = document.getElementById('toAccount').value.trim();
        const delegator = desk.gui.delegator;
        const amount = convertToRawUnit(document.getElementById('amount').value.trim());

        if (!toAccount || !amount || !fee) {
            alert('Please enter recipient, amount, and fee');
            return;
        }

        if (new Decimal(amount).gt(convertToRawUnit(desk.gui.balance))) {
            alert('Insufficient balance');
            return;
        }

        const block = {
            type: 'send',
            fromAccount: fromAccount,
            toAccount: toAccount,
            amount: amount,
            delegator: delegator
        };

        // Add fee to block
        addFeeToBlock(block);

        block.signature = base64Encode(await signMessage(canonicalStringify(block)));

        const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'sendBlock', block });
        if (result.success) {
            alert('Transaction sent successfully');
            // Optionally, re-fetch transaction history here
            const transactions = await fetchTransactionHistory(desk.wallet.publicKey);
            displayTransactions(transactions);
        } else {
            alert('Error sending transaction: ' + result.message);
        }
    }

    // Function to create HTML for a single transaction
    async function displayTransaction(tx) {
        const txDiv = document.createElement('div');
        txDiv.className = 'transaction-card';
        
        let txType = '';
        let previousBlockHash = null;
        let publicKey = desk.wallet.publicKey;
        let iconClass = '';
        let amount = tx.amount ? tx.amount : '0.0';

        if (tx.fromAccount == publicKey) {
            if (tx.fromAccount == tx.toAccount) {
                txType = 'Self-Send';
                iconClass = 'self-icon';
            } else {
                txType = 'Send';
                iconClass = 'send-icon';
                amount = '-' + amount;
            }
            previousBlockHash = tx.previousBlockSender;
        } else if (tx.toAccount == publicKey) {
            txType = 'Deposit';
            iconClass = 'receive-icon';
            amount = '+' + amount;
            previousBlockHash = tx.previousBlockRecipient;
        } else if (tx.delegator == publicKey) {
            txType = 'Fee Reward';
            iconClass = 'reward-icon';
            amount = '+' + amount;
            previousBlockHash = tx.previousBlockDelegator;
        }

        const feeHtml = tx.fee ? `<div class="detail-row"><div class="detail-label">Fee:</div><div class="detail-value">${convertToDisplayUnit(tx.fee.amount)}</div></div>` : '';
        const transactionHTML = `
            <div class="transaction-summary" onclick="toggleTransactionDetails(this)">
                <div class="transaction-icon ${iconClass}">
                    <i class="fas ${getTransactionIcon(txType)}"></i>
                </div>
                <div class="transaction-main">
                    <div class="transaction-amount">${amount}</div>
                    <div class="transaction-date">${txType} • ${new Date().toLocaleDateString()}</div>
                </div>
            </div>
            <div class="transaction-details">
                <div class="detail-row">
                    <div class="detail-label">Hash:</div>
                    <div class="detail-value hash-preview">${tx.hash}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Previous:</div>
                    <div class="detail-value hash-preview">${previousBlockHash}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">From:</div>
                    <div class="detail-value">
                        <span class="blockexplorer-link" data-hash="${tx.fromAccount}" data-networkId="${desk.gui.activeNetworkId}">
                            ${await desk.gui.resolveAccountId(tx.fromAccount, tx.fromAccount)}
                        </span>
                    </div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">To:</div>
                    <div class="detail-value">
                        <span class="blockexplorer-link" data-hash="${tx.toAccount}" data-networkId="${desk.gui.activeNetworkId}">
                            ${await desk.gui.resolveAccountId(tx.toAccount, tx.toAccount)}
                        </span>
                    </div>
                </div>
                ${feeHtml}
            </div>
        `;

        txDiv.innerHTML = transactionHTML;
        return txDiv;
    }

    // Function to display transactions in the UI
    async function displayTransactions(transactions) {
        const historyDiv = document.getElementById('transactions');
        
        // If transactions is empty, clear the display
        if (transactions.length === 0) {
            historyDiv.innerHTML = '<p>No transactions found</p>';
            return;
        }

        // If this is a new single transaction, add it to the top
        if (transactions.length === 1 && historyDiv.children.length > 0) {
            const txDiv = await displayTransaction(transactions[0]);
            historyDiv.insertBefore(txDiv, historyDiv.firstChild);
            
            // Optional: Limit the number of displayed transactions
            if (historyDiv.children.length > 50) {
                historyDiv.lastChild.remove();
            }
        } else {
            // Display all transactions
            historyDiv.innerHTML = '';
            for (const tx of transactions) {
                const txDiv = await displayTransaction(tx);
                historyDiv.appendChild(txDiv);
            }
        }
    }

    // Helper function to get the appropriate icon for transaction type
    function getTransactionIcon(txType) {
        switch (txType) {
            case 'Send':
                return 'fa-arrow-up';
            case 'Deposit':
                return 'fa-arrow-down';
            case 'Fee Reward':
                return 'fa-gift';
            case 'Self-Send':
                return 'fa-exchange-alt';
            default:
                return 'fa-circle';
        }
    }

    // Function to toggle transaction details
    function toggleTransactionDetails(element) {
        const details = element.nextElementSibling;
        details.classList.toggle('expanded');
    }

    // Generate QR code for receiving
    function generateReceiveQR() {
        const receiveAddress = desk.wallet.publicKey;
        document.getElementById('receiveAddress').textContent = receiveAddress;
        
        // Clear previous QR code
        document.getElementById('qrcode').innerHTML = '';
        
        // Generate new QR code with a gradient background
        new QRCode(document.getElementById('qrcode'), {
            text: receiveAddress,
            width: 200,
            height: 200,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }

    // QR Scanner functions
    let html5QrcodeScanner = null;

    function openQRScanner() {
        const modal = document.getElementById('qrScannerModal');
        modal.style.display = 'flex';
        
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader", 
            { 
                fps: 10, 
                qrbox: 250,
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true,
                hideStatusBar: true,
                showZoomSliderIfSupported: true,
                supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                aspectRatio: 1.0
            },
            false // Don't show the HTML element
        );
            
        html5QrcodeScanner.render(onScanSuccess, onScanError);
        
        // Remove the powered by section after render
        setTimeout(() => {
            const infoIcon = document.querySelector('#reader img[alt="Info icon"]');
            if (infoIcon) {
                const parentDiv = infoIcon.parentElement;
                const poweredByDiv = parentDiv.querySelector('div');
                if (poweredByDiv) {
                    poweredByDiv.remove();
                }
                infoIcon.remove();
            }
        }, 100);
    }

    function closeQRScanner() {
        const modal = document.getElementById('qrScannerModal');
        modal.style.display = 'none';
        
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }
    }

    function onScanSuccess(decodedText, decodedResult) {
        // Handle the scanned code here
        document.getElementById('toAccount').value = decodedText;
        closeQRScanner();
    }

    function onScanError(errorMessage) {
        // Handle scan error
        console.error(errorMessage);
    }

    document.addEventListener('wallet.html-load', function(e) {
        desk.gui.populateNetworkSelect('finance');
        const { publicKey, privateKey } = e.detail;

        document.getElementById('accountFrom').textContent = publicKey;
        desk.gui.getAccountInfo(desk.gui.activeNetworkId, publicKey).then(() => {
            fetchTransactionHistory(publicKey).then(transactions => {
                displayTransactions(transactions);
            });
        });

        // Generate QR code for receiving
        generateReceiveQR();
    });

    // Add wallet notification handler
    document.addEventListener('finance-init', function(){
        desk.messageHandler.registerNotificationHandler('send', async (block) => {
                try {
                    let notificationTitle = '';
                    let notificationMessage = '';
                    let amount = convertToDisplayUnit(block.amount);

                    if (block.toAccount === desk.wallet.publicKey) {
                        notificationTitle = 'Deposit Received';
                        notificationMessage = `Received ${amount} coins`;
                    } else if (block.fromAccount === desk.wallet.publicKey) {
                        notificationTitle = 'Transaction Sent';
                        notificationMessage = `Sent ${amount} coins`;
                    } else if (block.delegator === desk.wallet.publicKey) {
                        notificationTitle = 'Fee Reward';
                        notificationMessage = `Earned ${amount} coins in fees`;
                    }

                    if (notificationTitle) {
                        DeskNotifier.show({
                            title: notificationTitle,
                            message: notificationMessage,
                            type: 'transaction'
                        });
                        
                        // Play a sound based on transaction type
                        if (block.toAccount === desk.wallet.publicKey) {
                            DeskNotifier.playSound('walletIn');
                        } else if (block.fromAccount === desk.wallet.publicKey) {
                            DeskNotifier.playSound('walletOut');
                        }
                    }

                    // Check if transaction involves our account
                    if (message.block.toAccount === desk.wallet.publicKey || 
                        message.block.fromAccount === desk.wallet.publicKey ||
                        message.block.delegator === desk.wallet.publicKey) {
                        message.block.amount = convertToDisplayUnit(message.block.amount);
                        
                        // Add the new transaction to the display
                        displayTransactions([message.block]);
                    }
                } catch (error) {
                console.error('Error handling transaction notification:', error);
            }
        });
    });
