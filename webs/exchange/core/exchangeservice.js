const Decimal = require('decimal.js');
const Hasher = require('../../../core/utils/hasher');

class ExchangeService {
    constructor(network) {
        this.network = network;
        this.monitoredNetworks = new Set();
        
        // Order book structure - using Maps for efficient lookups
        this.orderBooks = new Map(); // marketId -> {buys: Map(), sells: Map()}
        this.activeOrders = new Map(); // orderId -> orderDetails
        
        // Market data
        this.marketStats = new Map(); // networkPair -> {lastPrice, 24hHigh, 24hLow, volume}
        this.recentTrades = new Map(); // networkPair -> [trades]

        // Add new properties
        this.trackedSwaps = new Map();
    }

    initialize() {
        this.setupNetworkMonitoring();
        setInterval(() => {
            this.setupNetworkMonitoring();
            this.updateMarketStats();
        }, 30000);
    }

    setupNetworkMonitoring() {
        const networks = this.network.node.dnetwork.networks;
        const financeNetwork = Array.from(networks.entries())
            .find(([_, network]) => network.webName === 'finance');
        
        if (!financeNetwork) return;
        
        const financeId = financeNetwork[0];

        // Monitor all networks that could be involved in swaps
        for(const [networkId, network] of networks.entries()) {
            if (!this.monitoredNetworks.has(networkId) && 
                network.node && 
                network.node.broadcaster &&
                (networkId === financeId || network.type === 'module')) {
                network.node.broadcaster.addActionListener(
                    this.handleActionConfirmation.bind(this, networkId)
                );
                this.monitoredNetworks.add(networkId);
            }
        }
    }

    async handleActionConfirmation(networkId, action) {
        if (action.type === 'swap') {
            await this.handleSwapAction(networkId, action);
        }
        // We only monitor swap actions to update order book and market data
    }

    async handleSwapAction(networkId, action) {
        const marketPair = `${networkId}-${action.quoteNetwork}`;
        
        if (action.linkedSwapHash) {
            // This is a match/fill - update order book and add to trade history
            await this.handleOrderMatch(marketPair, action);
        } else {
            // New order - add to order book
            await this.addToOrderBook(marketPair, action);
        }
    }

    async addToOrderBook(marketPair, action) {
        if (!this.orderBooks.has(marketPair)) {
            this.orderBooks.set(marketPair, {
                buys: new Map(),  // price -> [orders]
                sells: new Map()  // price -> [orders]
            });
        }

        const orderBook = this.orderBooks.get(marketPair);
        const order = {
            hash: action.hash,
            account: action.account,
            amount: action.amount,
            minReceived: action.minReceived,
            price: new Decimal(action.minReceived).dividedBy(action.amount),
            timestamp: Date.now(),
            deadline: action.deadline
        };

        // Store in active orders
        this.activeOrders.set(action.hash, {
            ...order,
            marketPair
        });

        // Add to order book sorted by price
        const side = this.isMarketBuy(action) ? orderBook.buys : orderBook.sells;
        const priceStr = order.price.toString();
        if (!side.has(priceStr)) {
            side.set(priceStr, []);
        }
        side.get(priceStr).push(order);

        // Clean expired orders
        this.cleanExpiredOrders(marketPair);
    }

    async handleOrderMatch(marketPair, action) {
        // Remove original order from book
        if (this.activeOrders.has(action.linkedSwapHash)) {
            const originalOrder = this.activeOrders.get(action.linkedSwapHash);
            this.removeFromOrderBook(marketPair, originalOrder);
            this.activeOrders.delete(action.linkedSwapHash);

            // Add to trade history
            this.addToTradeHistory(marketPair, {
                price: originalOrder.price,
                amount: action.amount,
                timestamp: Date.now(),
                buyerNetwork: this.isMarketBuy(action) ? action.quoteNetwork : marketPair.split('-')[0],
                sellerNetwork: this.isMarketBuy(action) ? marketPair.split('-')[0] : action.quoteNetwork
            });
        }
    }

    removeFromOrderBook(marketPair, order) {
        const orderBook = this.orderBooks.get(marketPair);
        if (!orderBook) return;

        const side = this.isMarketBuy(order) ? orderBook.buys : orderBook.sells;
        const priceStr = order.price.toString();
        const index = side.get(priceStr).findIndex(o => o.hash === order.hash);
        if (index !== -1) {
            side.get(priceStr).splice(index, 1);
            if (side.get(priceStr).length === 0) {
                side.delete(priceStr);
            }
        }
    }

    cleanExpiredOrders(marketPair) {
        const orderBook = this.orderBooks.get(marketPair);
        if (!orderBook) return;

        const now = Date.now() / 1000;
        ['buys', 'sells'].forEach(side => {
            orderBook[side].forEach((orders, price) => {
                orderBook[side].set(price, orders.filter(order => {
                    const isValid = order.deadline > now;
                    if (!isValid) {
                        this.activeOrders.delete(order.hash);
                    }
                    return isValid;
                }));
                if (orderBook[side].get(price).length === 0) {
                    orderBook[side].delete(price);
                }
            });
        });
    }

    addToTradeHistory(marketPair, trade) {
        if (!this.recentTrades.has(marketPair)) {
            this.recentTrades.set(marketPair, []);
        }
        const trades = this.recentTrades.get(marketPair);
        trades.unshift(trade);
        trades.splice(100); // Keep last 100 trades

        this.updateMarketStats(marketPair, trade);
    }

    updateMarketStats(marketPair, newTrade = null) {
        if (!this.marketStats.has(marketPair)) {
            this.marketStats.set(marketPair, {
                lastPrice: 0,
                '24hHigh': 0,
                '24hLow': Infinity,
                '24hVolume': new Decimal(0)
            });
        }

        const stats = this.marketStats.get(marketPair);
        if (newTrade) {
            stats.lastPrice = newTrade.price;
            stats['24hHigh'] = Math.max(stats['24hHigh'], newTrade.price);
            stats['24hLow'] = Math.min(stats['24hLow'], newTrade.price);
            stats['24hVolume'] = stats['24hVolume'].plus(newTrade.amount);
        }

        // Clean old volume
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const trades = this.recentTrades.get(marketPair) || [];
        stats['24hVolume'] = trades
            .filter(t => t.timestamp > oneDayAgo)
            .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));
    }

    isMarketBuy(action) {
        // Determine if this is a buy or sell based on action data
        return action.amount > action.minReceived;
    }

    // Methods for RPC to get data
    getOrderBook(marketId) {
        if (!this.orderBooks.has(marketId)) {
            this.orderBooks.set(marketId, {
                buys: new Map(),  // price -> [orders]
                sells: new Map()  // price -> [orders]
            });
        }
        return this.orderBooks.get(marketId);
    }

    getMarketStats(marketPair) {
        return this.marketStats.get(marketPair) || {
            lastPrice: 0,
            '24hHigh': 0,
            '24hLow': 0,
            '24hVolume': 0
        };
    }

    getRecentTrades(marketPair) {
        return this.recentTrades.get(marketPair) || [];
    }

    getNetworkWebName(networkId) {
        const network = this.network.node.dnetwork.networks.get(networkId);
        return network ? network.webName : networkId;
    }

    getActiveMarkets() {
        const networks = Array.from(this.network.node.dnetwork.networks.entries());
        
        // Find the finance network
        const financeNetwork = networks.find(([_, network]) => network.webName === 'finance');
        if (!financeNetwork) return [];
        
        const financeId = financeNetwork[0];
        const marketPairs = [];

        // Only get module networks and create pairs with finance
        networks
            .filter(([_, network]) => 
                network.webName !== 'desk' && // Exclude desk
                network.webName !== 'finance' // Exclude finance itself
            )
            .forEach(([networkId, network]) => {
                // Only create finance/module pair (not both directions)
                const pair = `${financeId}-${networkId}`;
                marketPairs.push({
                    id: pair,
                    displayName: `${network.webName.toUpperCase()}`, // Just show the module name
                    baseNetwork: 'FINANCE', // Always finance
                    quoteNetwork: network.webName.toUpperCase() // The module being traded
                });
            });
        
        // Sort by module name
        marketPairs.sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        return marketPairs;
    }

    async getSwapState(swapHash, networkId) {
        const swapStateId = await Hasher.hashText(`swapState(${swapHash})`);
        
        const swapState = this.network.ledger.getAccount(swapStateId);
        if (!swapState) return null;

        // Check for linked swap if exists
        if (swapState.linkedSwapHash) {
            const linkedNetwork = swapState.quoteNetwork;
            const linkedSwapState = await this.network.node.requestFromNetwork(
                linkedNetwork,
                'getSwapDetails',
                { swapHash: swapState.linkedSwapHash }
            );
            if (linkedSwapState.success) {
                swapState.linkedSwap = linkedSwapState.swap;
            }
        }

        return swapState;
    }

    // Add method to track swap states
    trackSwapState(swapHash, networkId) {
        // Add to tracked swaps for UI updates
        if (!this.trackedSwaps.has(networkId)) {
            this.trackedSwaps.set(networkId, new Set());
        }
        this.trackedSwaps.get(networkId).add(swapHash);
    }

    async getAccountBalances(account) {
        const balances = {};
        const networks = this.network.node.dnetwork.networks;

        for (const [networkId, network] of networks.entries()) {
            try {
                const accountState = network.ledger.getAccount(account);
                balances[networkId] = {
                    balance: accountState ? accountState.balance : '0',
                    webName: network.webName.toUpperCase()
                };
            } catch (error) {
                console.error(`Error getting balance for ${networkId}:`, error);
                balances[networkId] = {
                    balance: '0',
                    webName: network.webName.toUpperCase()
                };
            }
        }

        return balances;
    }

    async getMarketBalances(marketPair, account) {
        const [baseNetwork, quoteNetwork] = marketPair.split('-');
        const networks = this.network.node.dnetwork.networks;

        const baseNetworkData = networks.get(baseNetwork);
        const quoteNetworkData = networks.get(quoteNetwork);
        
        if (!baseNetworkData || !quoteNetworkData) {
            return {
                success: false,
                message: 'Invalid network pair'
            };
        }

        const fromBalance = baseNetworkData.ledger.getAccount(account);
        const toBalance = quoteNetworkData.ledger.getAccount(account);

        return {
            baseNetwork: {
                id: baseNetwork,
                webName: baseNetworkData.webName.toUpperCase(),
                balance: fromBalance ? fromBalance.balance : '0'
            },
            quoteNetwork: {
                id: quoteNetwork,
                webName: quoteNetworkData.webName.toUpperCase(),
                balance: toBalance ? toBalance.balance : '0'
            }
        };
    }

    // Get all orders for a market
    getMarketOrders(marketId) {
        // Get the order book - make sure we're getting the right market ID
        console.log('Getting market orders for:', marketId);
        const orderBook = this.getOrderBook(marketId);
        console.log('Raw order book:', orderBook);
        
        // Convert Maps to arrays for transmission
        const buys = [];
        const sells = [];

        // Process buy orders - make sure we're iterating correctly
        if (orderBook.buys instanceof Map) {
            for (const [price, orders] of orderBook.buys.entries()) {
                console.log('Buy price level:', price, 'orders:', orders);
                if (Array.isArray(orders) && orders.length > 0) {
                    buys.push({
                        price: price,
                        orders: orders
                    });
                }
            }
        }

        // Process sell orders
        if (orderBook.sells instanceof Map) {
            for (const [price, orders] of orderBook.sells.entries()) {
                console.log('Sell price level:', price, 'orders:', orders);
                if (Array.isArray(orders) && orders.length > 0) {
                    sells.push({
                        price: price,
                        orders: orders
                    });
                }
            }
        }

        const result = { buys, sells };
        console.log('Formatted order book:', result);
        return result;
    }

    // Place a new order
    async placeOrder(order) {
        console.log('ExchangeService placing order:', order);

        // Check balance before placing order
        const marketId = `${order.baseNetwork}-${order.quoteNetwork}`;
        const balances = await this.getMarketBalances(marketId, order.account);

        // For buy orders, check base network balance (what we pay with)
        // For sell orders, check quote network balance (what we're selling)
        const requiredAmount = order.type === 'buy' 
            ? new Decimal(order.price).times(order.amount).dividedBy('100000000').toString() // Total cost for buy, adjust for raw unit price
            : order.amount; // Amount we're selling

        const availableBalance = order.type === 'buy'
            ? balances.baseNetwork.balance
            : balances.quoteNetwork.balance;

        console.log('Balance check:', {
            type: order.type,
            required: this.convertToDisplayUnit(requiredAmount),
            available: this.convertToDisplayUnit(availableBalance),
            rawRequired: requiredAmount,
            rawAvailable: availableBalance
        });

        if (new Decimal(availableBalance).lessThan(requiredAmount)) {
            return {
                success: false,
                message: `Insufficient balance. Required: ${this.convertToDisplayUnit(requiredAmount)}, Available: ${this.convertToDisplayUnit(availableBalance)}`
            };
        }

        const orderBook = this.getOrderBook(marketId);
        const orderId = Hasher.randomHash(32);

        const orderEntry = {
            id: orderId,
            account: order.account,
            amount: order.amount,
            price: order.price,
            timestamp: Date.now(),
            type: order.type,
            marketId: marketId
        };

        // Add to appropriate side of the book
        const side = order.type === 'buy' ? orderBook.buys : orderBook.sells;
        const priceStr = order.price.toString();

        if (!side.has(priceStr)) {
            side.set(priceStr, []);
        }
        const orders = side.get(priceStr);
        orders.push(orderEntry);
        console.log(`Added order to ${order.type} side at price ${priceStr}:`, orders);

        // Track active order
        this.activeOrders.set(orderId, orderEntry);

        // Log the entire order book after adding
        console.log('Order book after adding:', this.getMarketOrders(marketId));

        // Broadcast order update to subscribers
        this.network.node.sendSubscriberMessage('orderUpdate', {
            type: 'new',
            marketId: marketId,
            order: orderEntry
        });

        return {
            success: true,
            orderId: orderId
        };
    }

    // Cancel an order
    cancelOrder(orderId, account) {
        const order = this.activeOrders.get(orderId);
        if (!order || order.account !== account) {
            return { success: false, message: 'Order not found or unauthorized' };
        }

        // Remove from order book
        const orderBook = this.getOrderBook(order.marketId);
        const side = order.type === 'buy' ? orderBook.buys : orderBook.sells;
        const priceStr = order.price.toString();
        
        if (side.has(priceStr)) {
            const orders = side.get(priceStr).filter(o => o.id !== orderId);
            if (orders.length === 0) {
                side.delete(priceStr);
            } else {
                side.set(priceStr, orders);
            }
        }

        // Remove from active orders
        this.activeOrders.delete(orderId);

        // Broadcast cancel to subscribers
        this.network.node.sendSubscriberMessage('orderUpdate', {
            type: 'cancel',
            marketId: order.marketId,
            orderId: orderId
        });

        return { success: true };
    }

    convertToDisplayUnit(input)
    {
        return new Decimal(input).dividedBy(new Decimal('100000000')).toFixed(8, Decimal.ROUND_HALF_DOWN);
    }
    convertToRawUnit(input)
    {
        return new Decimal(input).times(new Decimal('100000000')).toFixed(0, Decimal.ROUND_HALF_DOWN);
    }
}

module.exports = ExchangeService;