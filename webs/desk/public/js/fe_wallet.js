


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

    function calculateFeeDistribution(block) {
        const feeAmount = new Decimal(block.fee);
        let burnAmount = feeAmount;
        let delegatorReward = new Decimal(0);

        // If the delegator is not the sender and receiver
        if (block.delegator !== block.fromAccount && block.toAccount !== block.delegator) {
            delegatorReward = feeAmount.mul(0.5);  // Reward the delegator with 50% of the fee
            burnAmount = feeAmount.sub(delegatorReward);  // Subtract reward from feeAmount
        }

        return {
            delegatorReward: delegatorReward.toString(),
            burnAmount: burnAmount.toString()
        };
    }

    async function getLastBlockHashesWallet(accounts) {
        const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getLastBlockHashes', accounts });
        return result.success ? result.hashes : {};
    }

    // Function to send a transaction
    async function sendTransaction() {
        const fromAccount = desk.wallet.publicKey;
        const toAccount = document.getElementById('toAccount').value.trim();
        const delegator = desk.gui.delegator;
        const amount = convertToRawUnit(document.getElementById('amount').value.trim());
        const fee = convertToRawUnit(document.getElementById('fee').value.trim());

        if (!toAccount || !amount || !fee) {
            alert('Please enter recipient, amount, and fee');
            return;
        }

        if (new Decimal(amount).gt(convertToRawUnit(balance))) {
            alert('Insufficient balance');
            return;
        }

        const lastBlockHashes = await getLastBlockHashesWallet([fromAccount, toAccount, delegator]);

        const block = {
            type: 'send',
            fromAccount: fromAccount,
            toAccount: toAccount,
            amount: amount,
            delegator: delegator,
            fee: fee,
            burnAmount: 0,
            delegatorReward: 0,
            previousBlockSender: lastBlockHashes[fromAccount],
            previousBlockRecipient: lastBlockHashes[toAccount],
            previousBlockDelegator: lastBlockHashes[delegator]
        };
        const { delegatorReward, burnAmount } = calculateFeeDistribution(block);
        block.delegatorReward = delegatorReward;
        block.burnAmount = burnAmount;

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

    // Function to display transactions in the UI
    function displayTransactions(transactions) {
        const historyDiv = document.getElementById('transactions');
        historyDiv.innerHTML = '';

        if (transactions.length === 0) {
            historyDiv.innerHTML = '<p>No transactions found</p>';
            return;
        }

        transactions.forEach(tx => {
            let txType = '';
            let previousBlockHash = null;
            let publicKey = desk.wallet.publicKey;

            if (tx.fromAccount == publicKey) {
                if (tx.fromAccount == tx.toAccount) txType = 'Self-Send';
                else txType = 'Send';
                previousBlockHash = tx.previousBlockSender;
            } else if (tx.toAccount == publicKey) {
                txType = 'Deposit';
                previousBlockHash = tx.previousBlockRecipient;
            } else if (tx.delegator == publicKey) {
                txType = 'Fee Reward';
                previousBlockHash = tx.previousBlockDelegator;
            }

            const txDiv = document.createElement('div');
            txDiv.className = 'transaction';

            // Build transaction details
            const transactionDetails = `
            <strong>Hash:</strong> ${tx.hash} <br>
            <strong>Previous:</strong> ${previousBlockHash} <br>
            <strong>From:</strong> ${tx.fromAccount} <br>
            <strong>To:</strong> ${tx.toAccount} <br>
            <strong>Amount:</strong> ${tx.amount} <br>
            <strong>Fee:</strong> ${tx.fee} <br>
            <strong>Type:</strong> ${txType} <br>
            `;

            txDiv.innerHTML = transactionDetails;
            historyDiv.appendChild(txDiv);
        });
    }
    document.addEventListener('wallet.html-init', function(e) {
        desk.gui.populateNetworkSelect('finance');
        const { publicKey, privateKey } = e.detail;

        // Use passed context to initialize
        document.getElementById('accountFrom').textContent = publicKey;
        desk.gui.getAccountInfo(desk.gui.activeNetworkId, publicKey).then(() => {
            fetchTransactionHistory(publicKey).then(transactions => {
                displayTransactions(transactions);
            });
        });
    });
