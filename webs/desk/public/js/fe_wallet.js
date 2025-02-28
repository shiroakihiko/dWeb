


    // Function to fetch transaction history
    async function fetchTransactionHistory(accountId) {
        console.log("Fetching transaction history for:", accountId); // Debugging log
        const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'getTransactions', accountId });
        console.log("Transaction history result:", result); // Debugging log
        return result.success ? result.transactions : [];
    }

    // Function to update fee field based on the amount
    function updateFee() {
        const amount = parseFloat(document.getElementById('amount').value);
        const fee = (amount * 0.001).toFixed(8); // Calculate 0.1% fee
        document.getElementById('fee').value = fee;
    }


    // Function to send a transaction
    async function sendTransaction() {
        const toAccount = document.getElementById('toAccount').value.trim();
        const amount = convertToRawUnit(document.getElementById('amount').value.trim());

        if (!toAccount || !amount || !fee) {
            alert('Please enter recipient, amount, and fee');
            return;
        }

        if (new Decimal(amount).gt(convertToRawUnit(desk.gui.balance))) {
            alert('Insufficient balance');
            return;
        }

        const instruction = {
            type: 'send',
            account: desk.wallet.publicKey,
            toAccount: toAccount,
            amount: amount
        };

        const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
        if (sendResult.success) {
            alert('Transaction sent successfully');
            // Optionally, re-fetch transaction history here
            const transactions = await fetchTransactionHistory(desk.wallet.publicKey);
            clearTransactions();
            displayTransactions(transactions);
        } else {
            alert('Error sending transaction: ' + sendResult.message);
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

        if (tx.account == publicKey) {
            if (tx.account == tx.instruction.toAccount) {
                txType = 'Self-Send';
                iconClass = 'self-icon';
            } else {
                txType = 'Send';
                iconClass = 'send-icon';
                amount = '-' + amount;
            }
            previousBlockHash = tx.previousBlockSender;
        } else if (tx.instruction.type == 'reward' && tx.instruction.toAccount == publicKey) {
            txType = 'Reward';
            iconClass = 'reward-icon';
            amount = '+' + amount;
            previousBlockHash = tx.previousBlockDelegator;
        } else if (tx.instruction.toAccount == publicKey) {
            txType = 'Deposit';
            iconClass = 'receive-icon';
            amount = '+' + amount;
            previousBlockHash = tx.previousBlockRecipient;
        }

        const feeHtml = tx.instruction.fee ? `<div class="detail-row"><div class="detail-label">Fee:</div><div class="detail-value">${convertToDisplayUnit(tx.instruction.fee.amount)}</div></div>` : '';
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
                    <div class="detail-value hash-preview">
                        <span class="blockexplorer-link" data-hash="${tx.hash}" data-networkId="${desk.gui.activeNetworkId}">${tx.hash}</span>
                    </div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">From:</div>
                    <div class="detail-value">
                        <span class="blockexplorer-link" data-hash="${tx.account}" data-networkId="${desk.gui.activeNetworkId}">
                            ${await desk.gui.resolveAccountId(tx.account, tx.account)}
                        </span>
                    </div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">To:</div>
                    <div class="detail-value">
                        <span class="blockexplorer-link" data-hash="${tx.instruction.toAccount}" data-networkId="${desk.gui.activeNetworkId}">
                            ${await desk.gui.resolveAccountId(tx.instruction.toAccount, tx.instruction.toAccount)}
                        </span>
                    </div>
                </div>
                ${feeHtml}
            </div>
        `;

        txDiv.innerHTML = transactionHTML;
        return txDiv;
    }

    function clearTransactions() {
        const historyDiv = document.getElementById('transactions');
        historyDiv.innerHTML = '';
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
            case 'Reward':
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
                clearTransactions();
                displayTransactions(transactions);
            });
        });

        // Subscribe to the wallet account
        desk.socketHandler.subscribeToAccount(desk.gui.activeNetworkId, desk.wallet.publicKey)

        // Generate QR code for receiving
        generateReceiveQR();
    });;

    // Add wallet notification handler
    document.addEventListener('finance-init', function(){
        desk.messageHandler.registerNotificationHandler('send', async (action) => {
                try {
                    let notificationTitle = '';
                    let notificationMessage = '';
                    let amount = convertToDisplayUnit(action.instruction.amount);

                    if (action.instruction.toAccount === desk.wallet.publicKey) {
                        notificationTitle = 'Deposit Received';
                        notificationMessage = `Received ${amount} coins`;
                    } else if (action.account === desk.wallet.publicKey) {
                        notificationTitle = 'Transaction Sent';
                        notificationMessage = `Sent ${amount} coins`;
                    } else if (action.delegator === desk.wallet.publicKey) {
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
                        if (action.instruction.toAccount === desk.wallet.publicKey) {
                            DeskNotifier.playSound('walletIn');
                        } else if (action.account === desk.wallet.publicKey) {
                            DeskNotifier.playSound('walletOut');
                        }
                    }

                    // Check if transaction involves our account
                    if (action.instruction.toAccount === desk.wallet.publicKey || 
                        action.account === desk.wallet.publicKey) {
                        action.amount = convertToDisplayUnit(action.instruction.amount);
                        
                        // Add the new transaction to the display
                        displayTransactions([action]);
                    }
                } catch (error) {
                console.error('Error handling transaction notification:', error);
            }
        });
    });
