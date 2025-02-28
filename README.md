# dWeb Framework: Decentralized Web Communication

<p align="center">
  <img src="webs/desk/public/images/dweb.png" alt="dWeb Logo" width="96"/>
</p>

**Author:** Shiro Akihiko  
**Contact:** [shiroakihiko@proton.me](mailto:shiroakihiko@proton.me)  
**Website:** [https://dweb1.com](https://dweb1.com)  
**Creators Public Key:** 73ef501053557e8bac3c3299f445fb5456de1226369a0bcbac2a6f129bb2dde0

---

## What is dWeb?

dWeb is a revolutionary framework that enables truly decentralized web applications through a multi-cluster architecture. It achieves ~500 transactions per second while maintaining complete privacy through browser-level encryption. Built entirely in JavaScript for maximum developer accessibility, dWeb represents the future of digital interaction: fast, private, and truly under your control.

### Key Features

- **High Performance:** ~500 transactions per second, outperforming traditional blockchains
- **End-to-End Encryption:** All communications encrypted in the browser before reaching any server
- **Energy Efficient:** Powered by Delegated Proof of Stake (DPoS), eliminating wasteful mining
- **Multi-Cluster Architecture:** Independent, specialized service clusters working together seamlessly
- **JavaScript-Based:** Built for web developers, with no specialized languages to learn
- **Modular Design:** Easy to extend with new services and custom implementations

---

## System Architecture

dWeb operates on three primary components:

### 1. Clusters

Self-governing units that provide specialized decentralized services. Each cluster:
- Operates under its own consensus model (typically DPoS)
- Defines its own trusted peers for cross-cluster communication
- Can vary in size from small local networks to large distributed systems

### 2. Nodes

The infrastructure participants of the network. Each node:
- Has its own private key for secure identification
- Can participate in multiple clusters simultaneously
- Relays messages between clusters to maintain system resilience

### 3. Users

End-users of the decentralized applications. Each user:
- Has a private key for secure authentication
- Can interact with multiple clusters and services
- Maintains control of their data through client-side encryption

### Cross-Cluster Communication

Messages between clusters require 67% consensus from trusted peers of the originating cluster, ensuring security while enabling specialized services to work together.

---

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/shiroakihiko/dweb.git
cd dweb
```

2. **Install dependencies**

```bash
npm install
```

3. **Start the dWeb node**

```bash
node dweb.js
```

4. **Access the user interface**

Open your browser and navigate to:
```
http://127.0.0.1:1225/desk/
```

---

## Creating a Decentralized Service

One of dWeb's strengths is how easily developers can create new decentralized services. Below is a practical example of implementing a chat service.

### Example: Building a Chat Service

Creating a decentralized service in dWeb involves five main components:

1. **Network Extension** - Extending the base Network class
2. **Instruction Definition** - Defining the service's operations
3. **Validation** - Ensuring data integrity
4. **Processing** - Handling the business logic
5. **Configuration** - Setting up both system-wide and service-specific configs

#### 1. Create the Chat Network (chat.js)

First, extend the base Network class to create your specialized service:

```javascript
const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const ChatMSGInstruction = require('./core/instructions/chatmsg/chatmsg.js');

class Chat extends Network {
    constructor(config) {
        super(config);
    }

    async initialize(node) {
        await super.initialize(node);
        this.actionManager.registerInstructionType('chatmsg', new ChatMSGInstruction(this));
    }

    Start(node) {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Chat;
```

#### 2. Define the Chat Message Instruction (chatmsg.js)

Create an instruction that defines what a chat message is and how it should be handled:

```javascript
const IInstruction = require('../../../../../core/system/interfaces/iinstruction.js');
const ChatMSGInstructionValidator = require('./validator.js');
const ChatMSGInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class ChatMSGInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new ChatMSGInstructionValidator(network);
        this.processor = new ChatMSGInstructionProcessor(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async createInstruction(params) {
        const instruction = {
            type: 'chatmsg',
            toAccount: params.toAccount,
            amount: params.amount,
            message: params.message
        };
        
        return instruction;
    }

    async validateInstruction(validationData) {
        return await this.validator.validateInstruction(validationData);
    }

    async processInstruction(processData) {
        return await this.processor.processInstruction(processData);
    }
}

module.exports = ChatMSGInstruction;
```

#### 3. Create a Validator (validator.js)

Define validation rules to ensure message integrity:

```javascript
const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class ChatMSGInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);

        this.addInstructionProperties({
            type: { type: 'string', enum: ['chatmsg'] },
            message: { type: 'string' }
        }, [
            'type',
            'message'
        ]);
    }
}

module.exports = ChatMSGInstructionValidator;
```

#### 4. Implement a Processor (processor.js)

Create the business logic for processing chat messages:

```javascript
const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class ChatMSGInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }
    
    // Add custom processing logic here
}

module.exports = ChatMSGInstructionProcessor;
```

#### 5. Configure Your Service

dWeb requires two configuration files to properly set up a service:

##### Main System Configuration (config/config.js)

Add your service to the list of enabled networks in the main configuration:

```javascript
module.exports = {
    "enabledNetworks": ['desk', 'chat', 'finance', 'exchange', 'thumbnail', 'search', 'call', 'email', 'file', 'social', 'governance', 'name'],
    "logLevel": 'debug',
    "useSSL": true
};
```

##### Service-Specific Configuration (webs/chat/config/config.js)

Create a configuration file for your service with network-specific settings:

```javascript
module.exports = {
    "networks": {
        "chat-testnet": {
            "peerPort": 1224,
            "rpcPort": 1225,
            "subscriptionPort": 1226,
            "peers": [
                "185.196.8.90:1224"
            ],
            "dbPath": "data/chat-testnet"
            // networkId is automatically generated
        }
    }
};
```

This configuration specifies:
- Network name (`chat-testnet`)
- Port numbers for peer communication, RPC calls, and subscriptions
- Initial peers to connect to
- Database storage path
- Unique network identifier

Once both configurations are in place, your service will be automatically loaded when the dWeb node starts. The service will be accessible via RPC calls to the specified port, allowing frontends to interact with it.

That's it! You've created a decentralized chat service that:
- Validates message structure
- Processes messages according to your business logic
- Applies a percentage-based fee system
- Integrates with the broader dWeb ecosystem
- Is properly configured for network communication

This modular approach allows you to focus on your service's unique features while leveraging dWeb's infrastructure for consensus, security, and cross-cluster communication.

---

## Service Integration Flow

When a dWeb node starts:

1. The main configuration (`config/config.js`) is loaded to determine which services to enable
2. For each enabled service, its specific configuration is loaded (e.g., `webs/chat/config/config.js`)
3. The service's network class is instantiated with its configuration
4. The service registers its instruction types during initialization
5. The service starts and registers its RPC message handlers
6. The service is now available for RPC calls from frontends

Frontends can then connect to the service via its RPC port and send instructions that will be validated, processed, and propagated through the network according to the consensus rules.

---

## Development Guidelines

We prioritize simplicity, inclusivity, and flexibility in the development process:

1. **JavaScript Only** - No TypeScript, keeping the codebase accessible to developers of all levels
2. **Modular Design** - Break down complex functionality into manageable classes or helper files
3. **Cluster Independence** - Each cluster maintains complete autonomy in governance and operation
4. **Flexible Consensus** - Clusters can choose their own consensus mechanisms (DPoS, PoW, etc.)
5. **Clear, Simple Code** - Prioritize readability and simplicity over complex abstractions

---

## Support the Project

If you find dWeb valuable and would like to support its continued development, please consider making a donation. Your contributions help maintain the project and enable new features.

<p align="center">
  <strong>Cryptocurrency Donations</strong>
</p>

<table align="center">
  <tr>
    <td align="center"><strong>Cryptocurrency</strong></td>
    <td align="center"><strong>Address</strong></td>
  </tr>
  <tr>
    <td align="center">Bitcoin (BTC)</td>
    <td><code>bc1qhw0vxsmn8duw3sq8lamcer8slnayedjhzfcyy3</code></td>
  </tr>
  <tr>
    <td align="center">Ethereum (ETH)</td>
    <td><code>0x74a1994A58A34510BF746D25566164BC56277Ab4</code></td>
  </tr>
  <tr>
    <td align="center">Solana (SOL)</td>
    <td><code>75cMB5J8nMrZM4XSZzBjM4psorfjBQ4R5pHbXon3gkCU</code></td>
  </tr>
  <tr>
    <td align="center">Monero (XMR)</td>
    <td><code>47GNFbRezsjbXVYqFGM7jyBFHmBdEDp18epaamrBBgcMhS2W553BXLgenWqNniwxSGFtaSa2op8u4Lds4HFSNznG1tu3oDY</code></td>
  </tr>
</table>

Your support is greatly appreciated and helps ensure the continued development of this open-source project.

---

## Contributing

We welcome contributions from developers of all skill levels. To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

<p align="center">
  <em>dWeb - Restoring freedom and openness to the internet</em>
</p>
