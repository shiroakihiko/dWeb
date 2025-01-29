# dWeb Framework: Scalable, Secure Multi-Cluster Communication

**Author:** Shiro Akihiko  
**Contact:** [shiroakihiko@proton.me](mailto:shiroakihiko@proton.me)
**Website:** [https://dweb1.com](https://dweb1.com)

---

## Introduction
**dWeb** aims to restore the freedom and openness that were once at the core of the internet. It enables decentralized data handling where applications no longer rely on centralized servers or monopolistic entities. Through collaboration and consensus, dWeb empowers individuals and communities to define their own networks and govern themselves, returning to a truly decentralized web.

---

## Executive Summary

dWeb enables decentralized web communication across independent clusters, where each cluster operates as a self-governing unit. These clusters provide decentralized services and applications, facilitating secure, scalable communication across networks. The system promotes distributed trust, transparency, and decentralization without relying on centralized authorities.

### Core Features

- **Decentralized Governance:** Each cluster begins with a private key controlled by the creator. Over time, authority is decentralized based on the chosen consensus for the network, ensuring distributed control among trusted peers.
- **Cross-Cluster Validation:** Messages exchanged between clusters are checked for a 67% consensus from trusted peers of that cluster to ensure data integrity and authenticity.
- **Selective Participation:** Nodes and users can join multiple clusters, with roles and voting weight based on each cluster’s rules, allowing for scalable and adaptive growth.
- **Private Key Security:** Each node and user holds a private key for secure, authenticated participation across multiple clusters, ensuring privacy and accountability.
- **Accessible Development:** Built on Node.js, dWeb is open and accessible to developers, promoting innovation and reducing barriers to entry.

---

## System Architecture

- **Clusters:** Self-governing units that offer decentralized services and applications. They can vary in size and interact with other clusters while maintaining full control over governance.
- **Nodes:** Nodes are the core participants of each cluster, holding unique private keys for secure interactions. They can relay messages between clusters to maintain system resilience.
- **Users:** Users interact with decentralized applications using their private keys, ensuring secure access across clusters.
- **Message Validation:** Messages are validated through signatures, and consensus requiring 67% authority from the originating cluster's trusted peers for cross-cluster communication.

---

## System Implementation

dWeb is built on fundamental principles ensuring decentralization and security across multiple networks:

1. **Cluster Creation:** Each cluster is created with a private key, with its public key serving as a unique identifier for communication and validation.
2. **Node Creation:** Each node holds a private key, enabling them to participate in multiple clusters while maintaining anonymity.
3. **Network State Messages:** Nodes share trust information within the cluster, enabling other networks to update their trust structure based on validated messages.
4. **Consensus Validation (Election):** Networks validate messages based on their consensus rules, ensuring that only trustworthy information is exchanged.
5. **Authority Representation:** Nodes hold voting power based on their authority percentage, ensuring fair message validation across clusters.

---

## Scalability and Security

dWeb is designed to scale without compromising security. The modular cluster design allows parallel processing and ensures that performance remains optimal as a multitute of independent clusters provide a service instead of a single one. Security is maintained using cryptographic methods, including digital signatures, public-private key pairs, and consensus mechanisms.

---

## Installation Guide

To get started with **dWeb**, follow these steps to install the required dependencies and run the system locally.

### Prerequisites

Before you begin, ensure that you have **Node.js** and **npm** installed on your system.

#### 1. Install Node.js and npm

If you don't have **Node.js** and **npm** installed, follow these steps:

- Go to the [Node.js official website](https://nodejs.org/) and follow their installation prompts.

After installation, verify the Node.js successful installation by running the following commands in the terminal:

```bash
node -v
npm -v
```

These commands should output the versions of Node.js and npm, confirming they are installed.

#### 2. Clone the dWeb Repository

Clone the dWeb Framework repository from GitHub to your local machine:

```bash
git clone https://github.com/shiroakihiko/dweb.git
cd dweb
```

#### 3. Install Dependencies

Navigate to the project directory and run the following command to install all required dependencies:

```bash
npm install
```

This command will download and install all the necessary modules listed in the package.json file.


#### 4. Start dWeb

Once the dependencies are installed, start the dweb system by running:

```bash
node dweb.js
```

This will launch the framework and start a local server on your machine, making it accessible for you to interact with.

#### 5. Access the User Interface

After the server is running, open your web browser and go to the following URL to access the dWeb Desk user interface:
```text
http://127.0.0.1:1225/desk/
```

You should now see the dWeb Desk interface where you can manage and interact with the decentralized networks.

---

## Coding Guidelines

We prioritize simplicity, inclusivity, and flexibility in the development process to ensure that contributors of all skill levels can participate. The following guidelines should be followed when contributing to the project:

1. **No TypeScript:** To ensure that the dWeb remains easy for developers of all levels and backgrounds to participant in, **no TypeScript** will be used. This keeps the codebase simple and approachable, staying with vanilla JavaScript ensures maximum ease of entry for new contributors.
   
2. **Modular Design:** The codebase should be modular and flexible. If a feature or functionality spans multiple pages of code (e.g., 3+ pages), it should be broken down into smaller, manageable **classes or helper files**. This encourages clarity, maintainability, and makes it easier for developers to understand and extend the system.

3. **Flexible Network Operations:** dWeb should not enforce any single way for networks to operate. **Clusters should have the freedom to choose their own consensus mechanism** (such as **DPoS**, **PoW**, or others) and **reward systems**. dWeb should be designed to allow for flexible, dynamic selection of core components based on the needs of the individual network, without imposing rigid constraints on how clusters must operate.

4. **Maintain Independence of Clusters:** Each cluster within dWeb must remain **autonomous**. The design of the system should not limit or constrain how each cluster governs itself or chooses the services it offers. This means ensuring that the ability to choose governance rules, consensus mechanisms, reward systems, and other key parameters is left entirely in the hands of the cluster creators and participants.

5. **Simplicity and Clarity:** We value simplicity in the code. Every piece of code should be easy to understand, even by those new to the project or to development in general. Avoid complex abstractions, unclear naming or overly sophisticated structures unless absolutely necessary.

6. **Collaboration and Open Contribution:** We believe in the power of open-source collaboration. We encourage all contributors to actively engage in discussions, code reviews, and development cycles. Everyone's voice matters, and we strive to ensure the framework remains open and community-driven.

By following these guidelines, we can ensure that dWeb remains a flexible, accessible, and powerful framework for the decentralized web, open to contributions from developers at all levels.

---
