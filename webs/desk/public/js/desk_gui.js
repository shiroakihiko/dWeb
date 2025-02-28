class DeskGui
{
    constructor() {
        this.activeNetworkId = null; // The presently actively selected network on a drop down
        this.delegator = null; // The delegator for the present account
        this.onNetworkChange = null; // Callback when network changed
        this.registerBlockExplorerLinks();
        this.initializeMobileNav();
        this.initializeAccountInfo();
    }
    
    registerBlockExplorerLinks()
    {
        document.body.addEventListener('click', function(event) {
            if (event.target && event.target.classList.contains('blockexplorer-link')) {
                const hash = event.target.getAttribute('data-hash');
                const networkId = event.target.getAttribute('data-networkId');
                loadPage('blockexplorer.html', event.target, JSON.stringify({ search: {query: hash, networkId} }));
            }
        });
    }
    
    // Function to dynamically update text content of blockexplorer links
    async updateBlockExplorerLinks(target) {
        // Find all elements with the class 'blockexplorer-link' within the target container
        const elements = target.querySelectorAll('.blockexplorer-link');

        for(let i = 0; i < elements.length; i++)
        {
            const element = elements[i];
            // Skip elements that have already been processed
            if (element.getAttribute('data-processed') === 'true') {
                continue; // Skip this element
            }
            // Extract accountId (you could get it from a data attribute or from the element's content)
            const accountId = element.getAttribute('data-hash');

            // Call desk.name.getDefaultDomain(accountId) to get the default domain
            const name = await desk.name.getDefaultDomain(accountId);

            if (name !== null) {
                // If the domain is not null, replace the text content with "Name (hash)"
                element.textContent = `${name} (${element.textContent})`;

                // Mark the element as processed
                element.setAttribute('data-processed', 'true');
            }
        }
    }

    async resolveAccountId(accountId, defaultOutput = null)
    {
        const name = await desk.name.getDefaultDomain(accountId);
        if(name != null)
            return `${name} (${defaultOutput})`;
        else
            return defaultOutput;
    }
    
    populateNetworkSelect(webName = null) {
        // Clear previous options
        document.getElementById('networkSelect').innerHTML = '';

        // Fetch available networks (which is an object)
        const networks = desk.availableNetworks;

        // Populate the network selection dropdown
        const networkSelect = document.getElementById('networkSelect');
        let firstNetwork = null;

        // Loop through the networks object
        Object.values(networks).forEach(network => {
            if (webName == null || network.name.webName == webName) {
                if (!firstNetwork) firstNetwork = network;

                const option = document.createElement('option');
                option.value = network.id;
                option.textContent = `[${network.name.webName}] (${network.name.networkName}): ${network.id}`;
                networkSelect.appendChild(option);
            }
        });

        // Set default network selection (first network in the list)
        if (firstNetwork) {
            networkSelect.value = firstNetwork.id;
            this.activeNetworkId = firstNetwork.id;
            this.getAccountInfo(this.activeNetworkId, desk.wallet.publicKey);
        }

        // Add onchange event listener to update activeNetworkId when the selection changes
        networkSelect.addEventListener('change', function(event) {
            this.activeNetworkId = event.target.value;
            this.getAccountInfo(this.activeNetworkId, desk.wallet.publicKey);
            console.log("Active Network ID changed to:", this.activeNetworkId);
            if(this.onNetworkChange)
                this.onNetworkChange();
        }.bind(this));
    }
    
    // Function to fetch account info
    async getAccountInfo(networkId, accountId) {
        console.log("Fetching account info for:", accountId); // Debugging log
        const result = await desk.networkRequest({ networkId: networkId, method: 'getAccount', accountId });
        if (result.success) {
            const balance = result.accountInfo.balance;
            const lastBlockHash = result.accountInfo.lastBlockHash;
            this.delegator = result.accountInfo.delegator ? result.accountInfo.delegator : this.getRandomDelegator(networkId); 
            this.isOperator = result.isOperator || false;
            this.balance = balance;
            
            document.getElementById('balance').textContent = balance;
            document.getElementById('delegator').textContent = await this.resolveAccountId(this.delegator, this.delegator);
            document.getElementById('delegator').className = 'blockexplorer-link'; 
            document.getElementById('delegator').setAttribute('data-hash', this.delegator);
            document.getElementById('delegator').setAttribute('data-networkId', networkId);
            document.getElementById('accountFrom').textContent = desk.wallet.publicKey;
            document.getElementById('accountFrom').className = 'blockexplorer-link';
            document.getElementById('accountFrom').setAttribute('data-hash', desk.wallet.publicKey);
            document.getElementById('accountFrom').setAttribute('data-networkId', networkId);
        } else {
            this.delegator = this.getRandomDelegator(networkId);
            document.getElementById('balance').textContent = '-new account-';
            document.getElementById('delegator').textContent = await this.resolveAccountId(this.delegator, this.delegator);
            document.getElementById('delegator').className = 'blockexplorer-link'; 
            document.getElementById('delegator').setAttribute('data-hash', this.delegator);
            document.getElementById('delegator').setAttribute('data-networkId', networkId);
            document.getElementById('accountFrom').textContent = desk.wallet.publicKey;
            document.getElementById('accountFrom').className = 'blockexplorer-link';
            document.getElementById('accountFrom').setAttribute('data-hash', desk.wallet.publicKey);
            document.getElementById('accountFrom').setAttribute('data-networkId', networkId);
        }
    }

    // Get a random delegator of a network
    getRandomDelegator(networkId)
    {
        if(desk.availableNetworks[networkId])
            if(desk.availableNetworks[networkId].delegators.length > 0)
                return desk.availableNetworks[networkId].delegators[0];
        
        return desk.wallet.publicKey; // Pick ourselves as delegator if there are no others in the network
    }
    
    async preloadWebModules(modules = []) {
        try {
            const result = await desk.networkRequest({
                networkId: 'desk',
                method: 'getAllWebModuleContent',
                modules: modules
            });
            
            if (result.success) {
                const contentDiv = document.getElementById('content');
                
                // Create containers for all modules
                for (const [pageName, content] of Object.entries(result.modules)) {
                    const page = pageName+'.html';
                    const pageContainer = document.createElement('div');
                    pageContainer.className = 'page-container';
                    pageContainer.id = `page-${pageName}`;
                    pageContainer.innerHTML = content;
                    pageContainer.style.display = 'none';
                    
                    contentDiv.appendChild(pageContainer);
                    desk.nav.loadedPages.set(page, pageContainer);
                }
            }
        } catch (error) {
            console.error('Error preloading web modules:', error);
        }
    }

    registerAllWebModules()
    {
        if(!desk.availableNetworks)
            return;

        // Loop through the networks object
        Object.values(desk.availableNetworks).forEach(network => {
            const webName = network.name.webName;
            const initEvent = new CustomEvent(`${webName}-init`, {
                detail: {
                    publicKey: desk.wallet.publicKey,
                    privateKey: desk.wallet.privateKey,
                }
            });
            document.dispatchEvent(initEvent);
        });
    }

    initializeMobileNav() {
        if (window.innerWidth <= 768) {
            // Create bottom navigation bar
            const navBar = document.createElement('div');
            navBar.className = 'mobile-nav-bar';
            
            // Define main navigation items
            const navItems = [
                { icon: 'fa-wallet', text: 'Wallet', page: 'wallet.html' },
                { icon: 'fa-envelope', text: 'Email', page: 'email.html' },
                { icon: 'fa-comments', text: 'Chat', page: 'chat.html' },
                { icon: 'fa-users', text: 'Social', page: 'social.html' },
                { icon: 'fa-ellipsis', text: 'More', action: 'toggleMenu' }
            ];

            navItems.forEach(item => {
                const navItem = document.createElement('div');
                navItem.className = 'mobile-nav-item';
                navItem.innerHTML = `
                    <i class="fas ${item.icon}"></i>
                    <span>${item.text}</span>
                `;

                if (item.page) {
                    navItem.addEventListener('click', () => {
                        loadPage(item.page, navItem);
                        this.setActiveNavItem(navItem);
                        // Hide menu if it's open
                        const links = document.getElementById('links');
                        links.style.display = 'none';
                    });
                } else if (item.action === 'toggleMenu') {
                    navItem.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent document click from immediately closing
                        const links = document.getElementById('links');
                        const currentDisplay = links.style.display;
                        links.style.display = currentDisplay === 'block' ? 'none' : 'block';
                    });
                }

                navBar.appendChild(navItem);
            });

            // Add to menu
            const menuElement = document.getElementById('menu');
            menuElement.appendChild(navBar);

            // Add click handlers to all menu links to close menu when clicked
            const menuLinks = document.getElementById('links').querySelectorAll('a');
            menuLinks.forEach(link => {
                link.addEventListener('click', () => {
                    const links = document.getElementById('links');
                    links.style.display = 'none';
                });
            });

            // Handle clicking outside to close menu
            document.addEventListener('click', (e) => {
                const links = document.getElementById('links');
                const menu = document.getElementById('menu');
                if (!menu.contains(e.target)) {
                    links.style.display = 'none';
                }
            });

            // Handle scroll behavior
            let lastScroll = 0;
            document.addEventListener('scroll', () => {
                const currentScroll = window.pageYOffset;
                const links = document.getElementById('links');
                
                if (currentScroll > lastScroll && currentScroll > 50) {
                    // Scrolling down - hide menu
                    links.style.display = 'none';
                }
                lastScroll = currentScroll;
            });
        }
    }

    setActiveNavItem(activeItem) {
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            item.classList.remove('active');
        });
        activeItem.classList.add('active');
    }

    initializeAccountInfo() {
        if (window.innerWidth <= 768) {
            const accountInfo = document.getElementById('accountInfo');
            if (!accountInfo) return;

            // Wrap the content in a details div and include the icon explicitly
            const content = accountInfo.innerHTML;
            accountInfo.innerHTML = `
                <h2>
                    Account Info
                    <i class="fas fa-chevron-down"></i>
                </h2>
                <div class="account-details">${content}</div>
            `;

            // Add click handler
            accountInfo.querySelector('h2').addEventListener('click', () => {
                accountInfo.classList.toggle('collapsed');
            });

            // Start collapsed
            accountInfo.classList.add('collapsed');
        }
    }
}