    // Market and order book management
    class ExchangeManager {
        constructor() {
            this.activeMarket = null;
            this.orderBook = {
                buys: new Map(),
                sells: new Map()
            };
            this.activeOrders = new Map();
            this.tradeHistory = [];
            this.chart = null;
            this.activeBookTab = 'orderBook';
            this.balances = {};
        }

        async initializeChart() {
            if(this.chart) return;
            const ctx = document.getElementById('priceChart').getContext('2d');
            this.chart = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Price',
                        data: [],
                        borderColor: '#3b82f6',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'hour',
                                displayFormats: {
                                    hour: 'HH:mm'
                                }
                            },
                            title: {
                                display: true,
                                text: 'Time'
                            }
                        },
                        y: {
                            type: 'linear',
                            title: {
                                display: true,
                                text: 'Price'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true
                        }
                    }
                }
            });
        }

        async updateChartData() {
            const timeframe = document.getElementById('timeframe').value;
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getMarketData',
                baseNetwork: this.activeMarket.baseNetwork,
                quoteNetwork: this.activeMarket.quoteNetwork,
                timeframe: timeframe
            });

            if (result.success) {
                this.chart.data.datasets[0].data = result.trades.map(trade => ({
                    x: trade.timestamp,
                    y: trade.price
                }));
                this.chart.update();
            }
        }

        async loadMarkets() {
            const marketList = document.getElementById('marketList');
            marketList.innerHTML = '';
            
            const result = await desk.networkRequest({ 
                networkId: desk.gui.activeNetworkId, 
                method: 'getActiveMarkets'
            });

            if (result.success) {
                for (const market of result.markets) {
                    const marketRow = document.createElement('div');
                    marketRow.className = 'market-row';
                    
                    const statsResult = await desk.networkRequest({
                        networkId: desk.gui.activeNetworkId,
                        method: 'getMarketStats',
                        marketId: market.id
                    });

                    const stats = statsResult.success ? statsResult.stats : {
                        lastPrice: 0,
                        '24hHigh': 0,
                        '24hLow': 0,
                        '24hVolume': 0
                    };

                    marketRow.innerHTML = `
                        <div class="market-pair">
                            <span class="base-currency">DWEB</span>
                            <span class="separator">/</span>
                            <span class="quote-currency">${market.displayName}</span>
                        </div>
                        <div class="market-data">
                            <div class="market-price">${stats.lastPrice ? convertToDisplayUnit(stats.lastPrice) : '0.00000000'}</div>
                            <div class="market-volume">${stats['24hVolume'] ? convertToDisplayUnit(stats['24hVolume']) : '0.00000000'}</div>
                        </div>
                    `;

                    marketRow.dataset.marketId = market.id;
                    marketRow.onclick = () => this.selectMarket(market.id, `${market.baseNetwork}/${market.quoteNetwork}`);

                    // Get order book to check if market has orders
                    const orderBookResult = await desk.networkRequest({
                        networkId: desk.gui.activeNetworkId,
                        method: 'getOrderBook',
                        baseNetwork: market.baseNetwork,
                        quoteNetwork: market.quoteNetwork
                    });

                    const hasOrders = orderBookResult.success && 
                        (orderBookResult.orderBook.buys.length > 0 || 
                         orderBookResult.orderBook.sells.length > 0);
                    
                    marketRow.classList.add(hasOrders ? 'market-active' : 'market-inactive');
                    marketList.appendChild(marketRow);
                }
            }
        }

        async selectMarket(marketId, displayName) {
            const [baseNetwork, quoteNetwork] = marketId.split('-');
            this.activeMarket = { 
                id: marketId,
                displayName: displayName,
                baseNetwork: {
                    id: baseNetwork,
                    webName: null  // Will be populated from backend
                },
                quoteNetwork: {
                    id: quoteNetwork,
                    webName: null  // Will be populated from backend
                }
            };
            
            // Update market selection UI
            document.querySelectorAll('.market-row').forEach(row => {
                row.classList.remove('selected');
                if (row.dataset.marketId === marketId) {
                    row.classList.add('selected');
                }
            });

            // Update selected market display
            const selectedMarket = document.getElementById('selectedMarket');
            selectedMarket.textContent = displayName;
            selectedMarket.style.display = 'block';
            
            // Update button text and style for initial market selection
            this.updateOrderButton();
            
            // Get network names from backend
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getMarketBalances',
                marketId: marketId,
                account: desk.wallet.publicKey
            });

            if (result.success) {
                const { baseNetwork, quoteNetwork } = result.balances;
                this.activeMarket.baseNetwork.webName = baseNetwork.webName;
                this.activeMarket.quoteNetwork.webName = quoteNetwork.webName;
                
                // Update labels immediately after getting webNames
                this.updateOrderLabels();
            }

            // Load market data including balances
            await Promise.all([
                this.loadOrderBook(),
                this.loadMarketStats(),
                this.loadTradeHistory(),
                this.updateChartData(),
                this.updateBalanceDisplay()
            ]);
        }

        async loadOrderBook() {
            if (!this.activeMarket) return;

            console.log('Loading order book for market:', this.activeMarket);
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getOrderBook',
                baseNetwork: this.activeMarket.baseNetwork.id,
                quoteNetwork: this.activeMarket.quoteNetwork.id
            });

            console.log('Received order book:', result);

            if (result.success && result.orderBook) {
                // Convert arrays to Maps
                this.orderBook.buys = new Map();
                this.orderBook.sells = new Map();

                // Handle buys
                if (Array.isArray(result.orderBook.buys)) {
                    result.orderBook.buys.forEach(({price, orders}) => {
                        if (Array.isArray(orders)) {
                            this.orderBook.buys.set(price, orders);
                            console.log('Added buy orders at price', price, ':', orders);
                        }
                    });
                }

                // Handle sells
                if (Array.isArray(result.orderBook.sells)) {
                    result.orderBook.sells.forEach(({price, orders}) => {
                        if (Array.isArray(orders)) {
                            this.orderBook.sells.set(price, orders);
                            console.log('Added sell orders at price', price, ':', orders);
                        }
                    });
                }

                console.log('Processed order book:', this.orderBook);
                this.renderOrderBook();
            }
        }

        async loadMarketStats() {
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getMarketStats',
                marketId: this.activeMarket.id
            });

            if (result.success) {
                const stats = result.stats;
                
                // Update stats above chart
                document.getElementById('currentPrice').textContent = 
                    convertToDisplayUnit(stats.lastPrice);
                document.getElementById('dayVolume').textContent = 
                    convertToDisplayUnit(stats['24hVolume']);

                // Update detailed stats if they exist
                const marketStats = document.querySelector('.market-stats');
                if (marketStats) {
                    marketStats.innerHTML = `
                        <div class="stat-box">
                            <div class="stat-label">Last Price</div>
                            <div class="stat-value">${convertToDisplayUnit(stats.lastPrice)}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">24h High</div>
                            <div class="stat-value">${convertToDisplayUnit(stats['24hHigh'])}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">24h Volume</div>
                            <div class="stat-value">${convertToDisplayUnit(stats['24hVolume'])}</div>
                        </div>
                    `;
                }
            }
        }

        async loadTradeHistory() {
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getRecentTrades',
                baseNetwork: this.activeMarket.baseNetwork.id,
                quoteNetwork: this.activeMarket.quoteNetwork.id
            });

            if (result.success) {
                this.tradeHistory = result.trades;
                this.renderTradeHistory();
                this.updateChartData();
            }
        }

        renderOrderBook() {
            const sellOrders = document.getElementById('sellOrders');
            const buyOrders = document.getElementById('buyOrders');
            
            sellOrders.innerHTML = '';
            buyOrders.innerHTML = '';

            // Render sell orders (highest to lowest)
            if (this.orderBook.sells instanceof Map) {
                const sortedSellPrices = Array.from(this.orderBook.sells.keys())
                    .sort((a, b) => parseFloat(b) - parseFloat(a));

                for (const price of sortedSellPrices) {
                    const orders = this.orderBook.sells.get(price);
                    for (const order of orders) {
                        const row = document.createElement('div');
                        row.className = 'order-row sell';
                        row.innerHTML = `
                            <div class="price">${convertToDisplayUnit(price)}</div>
                            <div class="amount">${convertToDisplayUnit(order.amount)}</div>
                            <div class="total">${convertToDisplayUnit(price * order.amount)}</div>
                        `;
                        sellOrders.appendChild(row);
                    }
                }
            }

            // Render buy orders (highest to lowest)
            if (this.orderBook.buys instanceof Map) {
                const sortedBuyPrices = Array.from(this.orderBook.buys.keys())
                    .sort((a, b) => b - a);  // Sort descending

                for (const price of sortedBuyPrices) {
                    const orders = this.orderBook.buys.get(price);
                    for (const order of orders) {
                        const row = document.createElement('div');
                        row.className = 'order-row buy';
                        row.innerHTML = `
                            <div class="price">${convertToDisplayUnit(price)}</div>
                            <div class="amount">${convertToDisplayUnit(order.amount)}</div>
                            <div class="total">${convertToDisplayUnit(price * order.amount)}</div>
                        `;
                        buyOrders.appendChild(row);
                    }
                }
            }
        }

        createOrderRow(order, type) {
            const row = document.createElement('div');
            row.className = `order-row ${type}-order`;
            row.innerHTML = `
                <div>${convertToDisplayUnit(order.price)}</div>
                <div>${convertToDisplayUnit(order.amount)}</div>
                <div>${convertToDisplayUnit(order.price * order.amount)}</div>
            `;
            row.onclick = () => this.fillOrderForm(order);
            return row;
        }

        fillOrderForm(order) {
            document.getElementById('orderPrice').value = convertToDisplayUnit(order.price);
            document.getElementById('orderAmount').value = convertToDisplayUnit(order.amount);
            this.updateOrderTotal();
        }

        generateSecret() {
            // Generate a random 32-byte secret
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        }

        async placeOrder() {
            if (!this.activeMarket) {
                DeskNotifier.show({
                    title: 'Error',
                    message: 'Please select a market first',
                    type: 'error'
                });
                return;
            }

            const type = document.querySelector('.tab.active').dataset.tab;
            const price = convertToRawUnit(document.getElementById('orderPrice').value);
            const amount = convertToRawUnit(document.getElementById('orderAmount').value);

            // Basic input validation
            if (!price || !amount || price <= 0 || amount <= 0) {
                DeskNotifier.show({
                    title: 'Error',
                    message: 'Please enter valid price and amount',
                    type: 'error'
                });
                return;
            }

            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'placeOrder',
                account: desk.wallet.publicKey,
                amount: amount,
                price: price,
                type: type,
                baseNetwork: this.activeMarket.baseNetwork.id,
                quoteNetwork: this.activeMarket.quoteNetwork.id
            });

            if (result.success) {
                this.activeOrders.set(result.orderId, {
                    id: result.orderId,
                    account: desk.wallet.publicKey,
                    type: type,
                    price: price,
                    amount: amount,
                    timestamp: Date.now()
                });

                await Promise.all([
                    this.loadOrderBook(),
                    this.displayActiveOrders(),
                    this.updateBalanceDisplay() // Update balances after order
                ]);
                
                DeskNotifier.show({
                    title: 'Order Placed',
                    message: `${type.toUpperCase()} order placed successfully`,
                    type: 'success'
                });
            } else {
                DeskNotifier.show({
                    title: 'Order Failed',
                    message: result.message || 'Failed to place order',
                    type: 'error'
                });
            }
        }

        async displayActiveOrders() {
            const activeOrdersDiv = document.getElementById('activeOrders');
            if (!activeOrdersDiv) return;

            activeOrdersDiv.innerHTML = '';

            // Get active orders for current market
            for (const [orderId, order] of this.activeOrders) {
                if (order.account === desk.wallet.publicKey) {
                    const orderDiv = document.createElement('div');
                    orderDiv.className = `order-row ${order.type}`;
                    
                    orderDiv.innerHTML = `
                        <div class="order-header">
                            <span class="order-type">${order.type.toUpperCase()}</span>
                            <span class="order-price">${convertToDisplayUnit(order.price)}</span>
                        </div>
                        <div class="order-info">
                            <div>Amount: ${convertToDisplayUnit(order.amount)}</div>
                            <div>Total: ${convertToDisplayUnit(order.price * order.amount)}</div>
                            <div>Time: ${new Date(order.timestamp).toLocaleString()}</div>
                        </div>
                        <button class="cancel-order" data-orderid="${orderId}">Cancel</button>
                    `;

                    // Add cancel order handler
                    const cancelBtn = orderDiv.querySelector('.cancel-order');
                    cancelBtn.onclick = async () => {
                        const result = await desk.networkRequest({
                            networkId: desk.gui.activeNetworkId,
                            method: 'cancelOrder',
                            orderId: orderId,
                            account: desk.wallet.publicKey
                        });

                        if (result.success) {
                            this.activeOrders.delete(orderId);
                            this.displayActiveOrders();
                            DeskNotifier.show({
                                title: 'Order Cancelled',
                                message: 'Order has been cancelled successfully',
                                type: 'success'
                            });
                        }
                    };

                    activeOrdersDiv.appendChild(orderDiv);
                }
            }

            if (activeOrdersDiv.children.length === 0) {
                activeOrdersDiv.innerHTML = '<div class="no-orders">No active orders</div>';
            }
        }

        async cancelOrder(hash) {
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'cancelSwap',
                swapHash: hash
            });

            if (result.success) {
                this.activeOrders.delete(hash);
                await this.displayActiveOrders();
                await this.loadOrderBook();
            }
        }

        initializeEventListeners() {
            document.querySelectorAll('.tab').forEach(tab => {
                tab.onclick = () => {
                    document.querySelector('.tab.active').classList.remove('active');
                    tab.classList.add('active');
                    this.updateOrderButton();
                    this.updateOrderLabels(); // Update labels when switching tabs
                };
            });

            const priceInput = document.getElementById('orderPrice');
            const amountInput = document.getElementById('orderAmount');

            priceInput.oninput = () => {
                this.updateOrderTotal();
                this.updateOrderLabels();
            };
            amountInput.oninput = () => {
                this.updateOrderTotal();
                this.updateOrderLabels();
            };

            document.getElementById('placeOrderBtn').onclick = () => this.placeOrder();
            document.getElementById('timeframe').onchange = () => this.updateChartData();

            // Add book tab listeners
            document.querySelectorAll('.book-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    this.switchBookTab(tab.dataset.book);
                });
            });
        }

        updateOrderLabels() {
            if (!this.activeMarket?.baseNetwork?.webName || !this.activeMarket?.quoteNetwork?.webName) {
                return;
            }

            const type = document.querySelector('.tab.active').dataset.tab;
            const amountLabel = document.getElementById('amountLabel');
            const totalLabel = document.getElementById('totalLabel');
            const tradeSummary = document.getElementById('tradeSummary');

            // In DWEB/EMAIL pair:
            // baseNetwork is DWEB (what you pay with)
            // quoteNetwork is EMAIL (what you're trading)
            const paymentToken = this.activeMarket.baseNetwork.webName;  // DWEB
            const tradingToken = this.activeMarket.quoteNetwork.webName;    // EMAIL

            if (type === 'buy') {
                // Buying EMAIL with DWEB
                amountLabel.textContent = `Amount of ${tradingToken} to buy`;
                totalLabel.textContent = `Total ${paymentToken} to spend`;
                
                const amount = document.getElementById('orderAmount').value || '0';
                const total = document.getElementById('orderTotal').value || '0';
                tradeSummary.innerHTML = `
                    Buy ${amount} ${tradingToken} 
                    for ${total} ${paymentToken}
                `;
            } else {
                // Selling EMAIL for DWEB
                amountLabel.textContent = `Amount of ${tradingToken} to sell`;
                totalLabel.textContent = `Total ${paymentToken} to receive`;
                
                const amount = document.getElementById('orderAmount').value || '0';
                const total = document.getElementById('orderTotal').value || '0';
                tradeSummary.innerHTML = `
                    Sell ${amount} ${tradingToken} 
                    for ${total} ${paymentToken}
                `;
            }
        }

        updateOrderTotal() {
            const price = document.getElementById('orderPrice').value;
            const amount = document.getElementById('orderAmount').value;
            document.getElementById('orderTotal').value = (price * amount).toFixed(8);
            
            // Update the trade summary whenever values change
            this.updateOrderLabels();
        }

        updateOrderButton() {
            const orderBtn = document.getElementById('placeOrderBtn');
            const type = document.querySelector('.tab.active').dataset.tab;
            
            // Update button text and class
            orderBtn.textContent = `Place ${type.toUpperCase()} Order`;
            orderBtn.className = `ui_button ${type}-order-btn`;
        }

        async start() {
            document.addEventListener('exchange.html-load', async () => {
                desk.gui.populateNetworkSelect('exchange');
                this.initializeEventListeners();
                await this.initializeChart();
                await this.loadMarkets();

                const socket = desk.socketHandler.getSocket(desk.gui.activeNetworkId);
                const subscribeMessage = JSON.stringify({
                    method: 'subscribe',
                    topic: 'orderUpdate'
                });
                socket.send(subscribeMessage);
                // Listen for order updates
                desk.messageHandler.addMessageHandler(desk.gui.activeNetworkId, async (message) => {
                    if(message.topic == 'orderUpdate')
                    {
                        if (this.activeMarket && message.marketId === `${this.activeMarket.baseNetwork.id}-${this.activeMarket.quoteNetwork.id}`) {
                            if (message.type === 'new') {
                                this.handleNewOrder(message.order);
                            } else if (message.type === 'cancel') {
                                this.handleCancelOrder(message.orderId);
                            }
                            this.renderOrderBook();
                        }
                    }
                });
            });
        }

        handleNewOrder(order) {
            const side = order.type === 'buy' ? this.orderBook.buys : this.orderBook.sells;
            const priceStr = order.price.toString();
            
            if (!side.has(priceStr)) {
                side.set(priceStr, []);
            }
            side.get(priceStr).push(order);

            if (order.account === desk.wallet.publicKey) {
                this.activeOrders.set(order.id, order);
            }
        }

        handleCancelOrder(orderId) {
            // Remove from active orders if it's ours
            this.activeOrders.delete(orderId);

            // Remove from order book
            for (const side of [this.orderBook.buys, this.orderBook.sells]) {
                for (const [price, orders] of side) {
                    const filtered = orders.filter(o => o.id !== orderId);
                    if (filtered.length === 0) {
                        side.delete(price);
                    } else {
                        side.set(price, filtered);
                    }
                }
            }
        }

        async createSwap(counterParty, amount, quoteNetwork) {
            // Generate secret and hash for hashlock
            const secret = this.generateSecret();
            const secretHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
            const hashLock = Array.from(new Uint8Array(secretHash))
                .map(b => b.toString(16).padStart(2, '0')).join('');

            // Store secret for later claim
            localStorage.setItem(`swap_secret_${hashLock}`, secret);

            // Create actual swap block
            const block = {
                type: 'swap',
                account: desk.wallet.publicKey,
                toAccount: counterParty,
                amount: amount,
                quoteNetwork: quoteNetwork,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                delegator: desk.gui.delegator,
                hashLock: hashLock
            };

            addFeeToBlock(block);
            block.signature = base64Encode(await signMessage(canonicalStringify(block)));

            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'sendAction',
                action: block
            });

            if (result.success) {
                DeskNotifier.show({
                    title: 'Swap Created',
                    message: 'Successfully created swap',
                    type: 'success'
                });
                await this.loadOrderBook();
                return { success: true, hash: result.hash, secret: secret };
            } else {
                DeskNotifier.show({
                    title: 'Swap Failed',
                    message: result.message,
                    type: 'error'
                });
                return { success: false, message: result.message };
            }
        }

        async claimSwap(swapHash, secret, networkId) {
            const block = {
                type: 'swapClaim',
                account: desk.wallet.publicKey,
                swapHash: swapHash,
                secret: secret,
                delegator: desk.gui.delegator
            };

            addFeeToBlock(block);
            block.signature = base64Encode(await signMessage(canonicalStringify(block)));

            const result = await desk.networkRequest({
                networkId: networkId,
                method: 'sendAction',
                action: block
            });

            if (result.success) {
                DeskNotifier.show({
                    title: 'Claim Successful',
                    message: 'Successfully claimed swap',
                    type: 'success'
                });
                await this.loadOrderBook();
                await this.displayActiveOrders();
            } else {
                DeskNotifier.show({
                    title: 'Claim Failed',
                    message: result.message,
                    type: 'error'
                });
            }
        }

        switchBookTab(tabId) {
            // Update active tab
            document.querySelectorAll('.book-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.book === tabId);
            });

            // Show active content
            document.getElementById('orderBook').classList.toggle('active', tabId === 'orderBook');
            document.getElementById('activeOrders').classList.toggle('active', tabId === 'activeOrders');

            this.activeBookTab = tabId;
            if (tabId === 'activeOrders') {
                this.displayActiveOrders();
            } else {
                this.loadOrderBook();
            }
        }

        async loadBalances() {
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getAccountBalances',
                account: desk.wallet.publicKey
            });

            if (result.success) {
                this.balances = result.balances;
                this.updateBalanceDisplay();
            }
        }

        async updateBalanceDisplay() {
            if (!this.activeMarket) return;

            // Get balances for the active market
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getMarketBalances',
                marketId: this.activeMarket.id,
                account: desk.wallet.publicKey
            });

            if (result.success) {
                const { baseNetwork, quoteNetwork } = result.balances;
                
                // Update trading interface with balances
                const balanceInfo = document.createElement('div');
                balanceInfo.className = 'balance-info';
                balanceInfo.innerHTML = `
                    <div class="network-balance">
                        <span>${baseNetwork.webName}:</span>
                        <span>${convertToDisplayUnit(baseNetwork.balance)}</span>
                    </div>
                    <div class="network-balance">
                        <span>${quoteNetwork.webName}:</span>
                        <span>${convertToDisplayUnit(quoteNetwork.balance)}</span>
                    </div>
                `;

                // Insert balance info before the trading form
                const tradingForm = document.querySelector('.trading-form');
                const existingBalance = document.querySelector('.balance-info');
                if (existingBalance) {
                    existingBalance.replaceWith(balanceInfo);
                } else {
                    tradingForm.insertBefore(balanceInfo, tradingForm.firstChild);
                }
            }
        }

        // Optional: Method to show all balances somewhere else in the UI
        async showAllBalances() {
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getAccountBalances',
                account: desk.wallet.publicKey
            });

            if (result.success) {
                // Convert to array and sort by webName
                const balances = Object.entries(result.balances)
                    .map(([networkId, data]) => ({
                        networkId,
                        webName: data.webName,
                        balance: data.balance
                    }))
                    .sort((a, b) => a.webName.localeCompare(b.webName));

                // Display logic here if needed
            }
        }

        renderTradeHistory() {
            const tradeHistoryDiv = document.getElementById('tradeHistory');
            if (!tradeHistoryDiv) return;

            tradeHistoryDiv.innerHTML = '';

            // Sort trades by timestamp, newest first
            this.tradeHistory.sort((a, b) => b.timestamp - a.timestamp)
                .forEach(trade => {
                    const row = document.createElement('div');
                    row.className = 'trade-row';
                    
                    const time = new Date(trade.timestamp).toLocaleTimeString();
                    const price = convertToDisplayUnit(trade.price);
                    const amount = convertToDisplayUnit(trade.amount);
                    const total = convertToDisplayUnit(trade.price * trade.amount);
                    
                    row.innerHTML = `
                        <div class="trade-time">${time}</div>
                        <div class="trade-price">${price}</div>
                        <div class="trade-amount">${amount}</div>
                        <div class="trade-total">${total}</div>
                    `;

                    // Add color based on buyer/seller
                    if (trade.buyerNetwork === this.activeMarket.baseNetwork.id) {
                        row.classList.add('buy-trade');
                    } else {
                        row.classList.add('sell-trade');
                    }

                    tradeHistoryDiv.appendChild(row);
                });
        }
    }

    // Initialize exchange on page load
    document.addEventListener('exchange-init', function() {
        window.exchangeManager = new ExchangeManager();
        exchangeManager.start();
    });
