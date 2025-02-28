const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const Hasher = require('../../../core/utils/hasher.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
    }

    async handleMessage(message, req, res) {
        try {
            const method = message.method;

            switch (method) {
                case 'getOrderBook':
                    await this.getOrderBook(res, message);
                    return true;
                case 'getMarketStats':
                    await this.getMarketStats(res, message);
                    return true;
                case 'getRecentTrades':
                    await this.getRecentTrades(res, message);
                    return true;
                case 'getActiveMarkets':
                    await this.getActiveMarkets(res, message);
                    return true;
                case 'getSwapDetails':
                    await this.getSwapDetails(res, message);
                    return true;
                case 'getSwapState':
                    await this.getSwapState(res, message);
                    return true;
                case 'getAccountBalances':
                    await this.getAccountBalances(res, message);
                    return true;
                case 'getMarketBalances':
                    await this.getMarketBalances(res, message);
                    return true;
                case 'placeOrder':
                    await this.placeOrder(res, message);
                    return true;
                case 'cancelOrder':
                    await this.cancelOrder(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err);
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request' });
            return true;
        }
        return false;
    }

    convertToDisplayUnit(input)
    {
        return new Decimal(input).dividedBy(new Decimal('100000000')).toFixed(8, Decimal.ROUND_HALF_DOWN);
    }
    convertToRawUnit(input)
    {
        return new Decimal(input).times(new Decimal('100000000')).toFixed(0, Decimal.ROUND_HALF_DOWN);
    }
    formatFee(tx)
    {
        if(tx.instruction.fee)
        {
            if(tx.instruction.fee.amount)
                tx.instruction.fee.amount = this.convertToDisplayUnit(tx.instruction.fee.amount);
            if(tx.instruction.fee.delegatorReward)
                tx.instruction.fee.delegatorReward = this.convertToDisplayUnit(tx.instruction.fee.delegatorReward);
            if(tx.instruction.fee.burnAmount)
                tx.instruction.fee.burnAmount = this.convertToDisplayUnit(tx.instruction.fee.burnAmount);
        }
    }

    async getOrderBook(res, data) {
        console.log('Getting order book for:', data); // Debug log
        
        const marketId = `${data.baseNetwork}-${data.quoteNetwork}`;
        const orders = this.network.exchangeService.getMarketOrders(marketId);
        
        console.log('Order book:', orders); // Debug log
        
        this.node.SendRPCResponse(res, {
            success: true,
            orderBook: orders
        });
    }

    async getMarketStats(res, data) {
        const { baseNetwork, quoteNetwork } = data;
        const marketPair = `${baseNetwork}-${quoteNetwork}`;
        const stats = this.network.exchangeService.getMarketStats(marketPair);
        
        this.node.SendRPCResponse(res, {
            success: true,
            stats: stats
        });
    }

    async getRecentTrades(res, data) {
        const { baseNetwork, quoteNetwork } = data;
        const marketPair = `${baseNetwork}-${quoteNetwork}`;
        const trades = this.network.exchangeService.getRecentTrades(marketPair);
        
        this.node.SendRPCResponse(res, {
            success: true,
            trades: trades
        });
    }

    async getActiveMarkets(res, data) {
        const markets = this.network.exchangeService.getActiveMarkets();
        
        this.node.SendRPCResponse(res, {
            success: true,
            markets: markets
        });
    }

    async getSwapDetails(res, data) {
        const { swapHash, networkId } = data;
        
        // Get swap state account
        const swapStateId = await Hasher.hashText(`swapState(${swapHash})`);
        
        const swapState = this.network.ledger.getAccount(swapStateId);
        if (!swapState) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: 'Swap not found' 
            });
            return;
        }

        // Convert amounts to display units
        swapState.amount = this.convertToDisplayUnit(swapState.amount);
        swapState.minReceived = this.convertToDisplayUnit(swapState.minReceived);

        this.node.SendRPCResponse(res, {
            success: true,
            swap: swapState
        });
    }

    async getSwapState(res, data) {
        const { swapHash, networkId } = data;
        const state = await this.network.exchangeService.getSwapState(swapHash, networkId);
        
        if (!state) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: 'Swap state not found' 
            });
            return;
        }

        this.node.SendRPCResponse(res, {
            success: true,
            state: state
        });
    }

    async getAccountBalances(res, data) {       
        const { account } = data;
        const balances = await this.network.exchangeService.getAccountBalances(account);
        this.node.SendRPCResponse(res, { success: true, balances: balances });
    }
    async getMarketBalances(res, data) {
        const { marketId, account } = data;
        const balances = await this.network.exchangeService.getMarketBalances(marketId, account);
        this.node.SendRPCResponse(res, { success: true, balances: balances });
    }

    async placeOrder(res, data) {
        console.log('Placing order:', data);

        try {
            const result = await this.network.exchangeService.placeOrder({
                account: data.account,
                amount: data.amount,
                price: data.price,
                type: data.type,
                baseNetwork: data.baseNetwork,
                quoteNetwork: data.quoteNetwork
            });

            if (result.success) {
                console.log('Order placed successfully:', result);
            } else {
                console.error('Order placement failed:', result);
            }

            this.node.SendRPCResponse(res, result);
        } catch (error) {
            console.error('Error placing order:', error);
            this.node.SendRPCResponse(res, {
                success: false,
                message: error.message || 'Internal error placing order'
            });
        }
    }

    async cancelOrder(res, data) {
        const result = this.network.exchangeService.cancelOrder(
            data.orderId,
            data.account
        );
        
        this.node.SendRPCResponse(res, {
            success: true,
            result: result
        });
    }
}

module.exports = RPCMessageHandler;