const Block = require('../block/block.js');
const Signer = require('../../utils/signer.js');  // For encoding/decoding strings
const IInstruction = require('../interfaces/iinstruction');
const ActionHelper = require('../../utils/actionhelper');
const Hasher = require('../../utils/hasher');

/**
 * Cross Network Bridge (Sends actions to other networks, verifies actions from other networks)
 * 
 * @param {Network} network
 */
class CrossNetworkMessage {
    constructor(network) {
        this.network = network;
    }

    // Create action packages for all actions targeting a specific network
    getActionsForNetwork(block, targetNetworkId) {
        const actions = [];
        
        for (const action of block.actions) {
            if (action.instruction.targetNetwork === targetNetworkId) {
                actions.push(action);
            }
        }

        return actions;
    }

    // Create a batch of actions with proofs for all cross-network actions targeting a specific network
    createNetworkBatch(block, targetNetworkId) {
        const networkBatch = {
            actions: [],
            crossNetworkValidation: {
                crossNetworkHashes: block.crossNetworkActions.hashes,
                crossNetworkBaseHash: block.crossNetworkActions.baseHash,
                crossNetworkSignatures: block.crossNetworkActions.validatorSignatures,
                blockHash: block.hash,
                validatorSignatures: block.validatorSignatures // This is unnecessary? The baseHash is signed by the network. No need for a quorum check on the block itself?
            }
        };

        // Find all actions targeting this network
        const actions = this.getActionsForNetwork(block, targetNetworkId);
        if (actions.length > 0) {
            networkBatch.actions.push(...actions);
        }

        return networkBatch;
    }

    async verifyBatch(batch) {
        // 1. Verify cross-network baseHash
        const calculatedBaseHash = await Hasher.hashText(
            batch.blockHash + ':' + batch.crossNetworkHashes.join(':')
        );
        if (calculatedBaseHash !== batch.crossNetworkBaseHash) {
            throw new Error("Invalid cross-network base hash");
        }

        // 3. Verify cross-network signatures
        const crossNetworkSignaturesValid = await this.verifySignatures(
            batch.crossNetworkBaseHash, 
            batch.crossNetworkSignatures
        );
        if (!crossNetworkSignaturesValid) {
            throw new Error("Cross-network signatures invalid");
        }

        // 4. Verify each action in the batch
        for (const action of batch.actions) {
            if (!action.instruction.targetType) {
                throw new Error("Missing target instruction type");
            }

            // Verify action hash
            const calculatedActionHash = await ActionHelper.generateHash(action);
            if (calculatedActionHash !== action.hash) {
                throw new Error("Invalid action hash");
            }

            // Verify action is in cross-network actions
            if (!batch.crossNetworkHashes.includes(action.hash)) {
                throw new Error("Action not found in cross-network actions");
            }
        }

        return true;
    }

    async verifyAction(action, crossNetworkValidation) {
        // Verify action hash
        const calculatedActionHash = await ActionHelper.generateHash(action);
        if (calculatedActionHash !== action.hash) {
          return false;
        }

        const crossNetworkHashes = crossNetworkValidation.crossNetworkHashes;
        const crossNetworkBaseHash = crossNetworkValidation.crossNetworkBaseHash;
        const crossNetworkSignatures = crossNetworkValidation.crossNetworkSignatures;
        const crossNetworkBlockHash = crossNetworkValidation.blockHash;

        // Verify the base hash is correct
        const calculatedBaseHash = await Hasher.hashText(crossNetworkBlockHash + ':' + crossNetworkHashes.join(':'));
        if (calculatedBaseHash !== crossNetworkBaseHash) {
            return false;
        }

        // Verify cross-network action is part of the signed cross-network base hash
        if (!crossNetworkHashes.includes(action.hash)) {
            return false;
        }

        // Verify base hash is signed by network
        const targetNetworkAccount = action.instruction.targetNetworkAccount;
        const isSignedByNetwork = await this.signedByNetwork(crossNetworkBaseHash, targetNetworkAccount, crossNetworkSignatures);
        if (!isSignedByNetwork) {
            return false;
        }

        return true;
    }

    // Process and send all cross-network instructions to their target networks
    async sendCrossNetworkActions(block) {
        // Get all unique target networks from instructions
        const targetNetworks = new Set();
        
        for (const action of block.actions) {
            if (action.instruction.targetNetwork) {
                targetNetworks.add(action.instruction.targetNetwork);
            }
        }

        // Create and send batch for each target network
        for (const targetNetworkId of targetNetworks) {
            const batch = this.createNetworkBatch(block, targetNetworkId);
            if (batch.actions.length > 0) {
                // Peer passing
                console.log(`Sending batch (${batch.actions.length}) to network ${targetNetworkId}`);
                this.network.node.sendTargetNetwork(targetNetworkId, {
                    type: 'crossNetworkActions',
                    batch
                });

                // Local pass through
                for(const [networkId, network] of this.network.node.dnetwork.networks){
                    if(networkId == targetNetworkId)
                    {
                        network.consensus.crossNetworkMessage.handleCrossNetworkActions(batch);
                    }
                }
            }
        }
    }
    async handleCrossNetworkActions(batch) {
      // Track nonces for accounts that have actions
      const accountNonces = new Map();

      for (const action of batch.actions) {
          if(action.instruction.targetNetwork != this.network.networkId)
              continue;

          this.network.node.info(`Processing cross network action ${action.instruction.targetType}: ${action.hash}`);
          
          let account;
          if(action.instruction.targetType == 'createReward') {
              account = this.network.ledger.getGenesisAccount();
          } else if(action.instruction.targetType == 'networkUpdate') {
              account = action.instruction.targetNetworkAccount;
          }

          // Get or initialize nonce for this account
          let nonce;
          if(accountNonces.has(account)) {
              nonce = accountNonces.get(account);
              accountNonces.set(account, nonce + 1);
          } else {
              nonce = this.network.ledger.getAccountNonce(account) || 0;
          }

          if(action.instruction.targetType == 'createReward')
          {
              const createResult = await this.network.actionManager.createAction({
                  type: 'reward',
                  account: account,
                  nonce: nonce,
                  crossNetworkAction: action,
                  crossNetworkValidation: batch.crossNetworkValidation
              });
              if(createResult.state == 'VALID')
                  this.network.consensus.proposeAction(createResult.action);
              else
                  this.network.node.info(`Failed to create cross network action ${action.instruction.targetType}: ${action.hash}`);
          }
          else if(action.instruction.targetType == 'networkUpdate')
          {
              const createResult = await this.network.actionManager.createAction({
                  type: 'networkUpdate',
                  account: account,
                  nonce: nonce,
                  crossNetworkAction: action,
                  crossNetworkValidation: batch.crossNetworkValidation
              });
              if(createResult.state == 'VALID')
                  this.network.consensus.proposeAction(createResult.action);
              else
                  this.network.node.info(`Failed to create cross network action ${action.instruction.targetType}: ${action.hash}`);
          }
      }
    }

    // Helper methods remain the same
    async verifySignatures(hash, signatures) {
        for (const [validatorId, signature] of Object.entries(signatures)) {
            const validSignature = await Signer.verifySignatureWithPublicKey(
                hash,
                signature,
                validatorId
            );
            if (!validSignature) return false;
        }
        return true;
    }

    async signedByNetwork(message, networkAccount, validatorSignatures) {
        let lastNetworkVotingWeights;
        if(networkAccount)
            lastNetworkVotingWeights = this.network.ledger.getAccountValidatorWeights(networkAccount);
        else
            lastNetworkVotingWeights = this.network.ledger.getNetworkValidatorWeights();

      // If no previous network voting weights exist the owner needs to have signed the network message
      if (!lastNetworkVotingWeights) {
          const accountOwnerSignature = validatorSignatures[networkAccount];
          if(!accountOwnerSignature)
              return false;

          const validOwnerSignature = await Signer.verifySignatureWithPublicKey(message, accountOwnerSignature, networkAccount);
          if (validOwnerSignature)
              return true;
          else
              return false;
      }

      // Iterate over network voting weights and check if signatures meet the voting power threshold
      let totalVotingPower = 0;
      for (const nodeId in lastNetworkVotingWeights) {
          if (lastNetworkVotingWeights.hasOwnProperty(nodeId)) {
              const votingPower = lastNetworkVotingWeights[nodeId];

              // Check if the nodeId has a valid signature in the action
              if (validatorSignatures[nodeId]) {
                  const isSignatureValid = await Signer.verifySignatureWithPublicKey(message, validatorSignatures[nodeId], nodeId);

                  // If the signature is valid, add the voting power
                  if (isSignatureValid) {
                      totalVotingPower += votingPower;
                  }
              }
          }
      }

      // Check if the total voting power exceeds or is equal to 67%
      if (totalVotingPower >= 67) {
          return true;
      } else {
          return false;
      }
    }
}

module.exports = CrossNetworkMessage;