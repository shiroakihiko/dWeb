class DeskNavigation
{
    constructor() {
        this.currentPage = null;
        this.loadedPages = new Map(); // Store loaded page contents
        this.setupMobileMenu();
        this.addLoadingStyles();
        this.createProgressBar();
        this.history = [];
        this.currentIndex = -1;
        
        // Listen for browser back/forward buttons
        window.addEventListener('popstate', (event) => {
            if (event.state) {
                this.loadPage(event.state.page, null, JSON.stringify(event.state.params), true);
            }
        });
        
        // Add this to track active category
        this.activeCategory = null;
    }
    
    setupMobileMenu() {
        // Close menu when a link is clicked
        document.querySelectorAll('#menu #links a').forEach(link => {
            link.addEventListener('click', () => {
                document.getElementById('links').classList.remove('show');
            });
        });
    }
    
    addLoadingStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .progress-bar {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background: #4c7daf;
                transform: scaleX(0);
                transform-origin: left;
                transition: transform 0.2s ease-in-out;
                z-index: 1000;
                opacity: 0;
            }

            .progress-bar.active {
                opacity: 1;
            }

            .progress-bar.loading {
                transform: scaleX(0.3);
                transition: transform 0.6s ease-out;
            }

            .progress-bar.complete {
                transform: scaleX(1);
                transition: transform 0.2s ease-out;
            }

            .page-transition {
                animation: fadein 0.3s;
            }

            .active-page-indicator {
                position: fixed;
                left: 0;
                padding: 8px 16px;
                background: #4c7daf;
                color: white;
                border-radius: 0 4px 4px 0;
                font-size: 14px;
                transform: translateX(-100%);
                transition: transform 0.3s ease-out;
                z-index: 999;
            }

            .active-page-indicator.show {
                transform: translateX(0);
            }

            @keyframes fadein {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    createProgressBar() {
        this.progressBar = document.createElement('div');
        this.progressBar.className = 'progress-bar';
        document.body.appendChild(this.progressBar);

        this.pageIndicator = document.createElement('div');
        this.pageIndicator.className = 'active-page-indicator';
        document.body.appendChild(this.pageIndicator);
    }

    startLoading(pageName) {
        // Show progress bar
        this.progressBar.classList.add('active');
        this.progressBar.classList.add('loading');

        // Show page indicator
        this.pageIndicator.textContent = `Loading ${pageName}...`;
        this.pageIndicator.classList.add('show');

        // Simulate progress
        setTimeout(() => {
            if (this.progressBar.classList.contains('loading')) {
                this.progressBar.style.transform = 'scaleX(0.7)';
            }
        }, 300);
    }

    completeLoading() {
        this.progressBar.classList.add('complete');
        
        // Update page indicator
        this.pageIndicator.textContent = this.pageIndicator.textContent.replace('Loading', 'Loaded');
        
        setTimeout(() => {
            this.progressBar.classList.remove('active', 'loading', 'complete');
            this.progressBar.style.transform = '';
            
            // Hide page indicator with slight delay
            setTimeout(() => {
                this.pageIndicator.classList.remove('show');
            }, 1000);
        }, 300);
    }

    // Modify loadPage to use preloaded content when available
    loadPage(page, link = null, params = null, isHistoryNavigation = false, callback = null, forceReload = false) {
        const contentDiv = document.getElementById('content');
        const pageName = page.replace('.html', '');

        // Parse any existing URL parameters
        params = params ? JSON.parse(params) : getUrlParams();

        // Otherwise, load it individually (for cases where we need fresh content)
        this.startLoading(pageName);
        
        // If page is loaded and we're not forcing reload, just show it
        if (!forceReload && this.loadedPages.has(page)) {
            this.showPage(page, params, link);
            if (callback) callback();
            return false;
        }

        fetch(`${page}`)
            .then(response => response.text())
            .then(data => {
                // Set current page
                this.currentPage = page;
        
                // Handle history management
                if (!isHistoryNavigation) {
                    this.history = this.history.slice(0, this.currentIndex + 1);
                    this.history.push({ page, params });
                    this.currentIndex++;
                    
                    window.history.pushState(
                        { page, params },
                        '',
                        `#${page}${params ? '?' + new URLSearchParams(params).toString() : ''}`
                    );
                }
        
                // Create new container for the page
                const pageContainer = document.createElement('div');
                pageContainer.className = 'page-container';
                pageContainer.id = `page-${pageName}`;
                pageContainer.innerHTML = data;
                pageContainer.style.display = 'none';
        
                // Add to loadedPages if not already present
                if (!this.loadedPages.has(page)) {
                    this.loadedPages.set(page, pageContainer);
                    contentDiv.appendChild(pageContainer);
                }
                
                this.showPage(page, params, link);
        
                const initEvent = new CustomEvent(`${page}-load`, {
                    detail: {
                        publicKey: desk.wallet.publicKey,
                        privateKey: desk.wallet.privateKey,
                        linkParams: params
                    }
                });
                document.dispatchEvent(initEvent);
        
                if(callback) {
                    callback();
                }
            })
            .catch(error => {
                this.pageIndicator.textContent = `Failed to load ${pageName}`;
                this.pageIndicator.style.background = '#f44336';
                console.error('Error loading page:', error);
                
                setTimeout(() => {
                    this.pageIndicator.classList.remove('show');
                    this.pageIndicator.style.background = '#4CAF50';
                }, 3000);
            });
            
        return false;
    }
    showPage(page, params = null, link = null) {
        const pageName = page.replace('.html', '');
        const previousPage = this.currentPage;
        this.currentPage = page;

        // Dispatch page-leave event for previous page
        if (previousPage) {
            const leaveEvent = new CustomEvent(`${previousPage}-leave`);
            document.dispatchEvent(leaveEvent);
        }

        // Hide all page containers
        document.querySelectorAll('.page-container').forEach(container => {
            container.style.display = 'none';
        });

        
        // Remove 'active' class from previous links
        const activeLinks = document.querySelectorAll('#links a.active');
        activeLinks.forEach(activeLink => activeLink.classList.remove('active'));

        // Add 'active' class to current link if provided
        if (link) {
            link.classList.add('active');
        } else {
            const matchingLink = document.querySelector(`#links a[id="link-${pageName}"]`) || 
                               document.querySelector(`#links a[onclick*="${page}"]`);
            if (matchingLink) {
                matchingLink.classList.add('active');
            }
        }

        // Show the selected page
        const pageContainer = this.loadedPages.get(page);
        if (pageContainer) {
            pageContainer.style.display = 'block';
            pageContainer.classList.add('page-transition');
            
            // Dispatch page-open event
            const openEvent = new CustomEvent('page-open', { 
                detail: { 
                    page,
                    params 
                } 
            });
            document.dispatchEvent(openEvent);
            
            // Dispatch load event
            const loadEvent = new CustomEvent(`${page}-load`, {
                detail: {
                    publicKey: desk.wallet.publicKey,
                    privateKey: desk.wallet.privateKey,
                    linkParams: params
                }
            });
            document.dispatchEvent(loadEvent);
            
            setTimeout(() => {
                pageContainer.classList.remove('page-transition');
            }, 300);
        }

        // Expand category if needed
        this.expandCategoryForPage(page);
                
        // Complete loading animation
        this.completeLoading();
    }

    // Add this new method
    expandCategoryForPage(page) {
        // Find which category contains this page
        const categoryContent = document.querySelector(`.nav-category-content a[onclick*="${page}"]`);
        if (categoryContent) {
            const category = categoryContent.closest('.nav-category');
            if (category) {
                // Remove expanded class from all categories
                document.querySelectorAll('.nav-category').forEach(cat => {
                    cat.classList.remove('expanded');
                });
                // Expand this category
                category.classList.add('expanded');
                this.activeCategory = category;
            }
        }
    }
}

// Add this function globally
function toggleCategory(header) {
    const category = header.closest('.nav-category');
    const wasExpanded = category.classList.contains('expanded');
    
    // Close all categories
    document.querySelectorAll('.nav-category').forEach(cat => {
        cat.classList.remove('expanded');
    });
    
    // Toggle this category
    if (!wasExpanded) {
        category.classList.add('expanded');
        desk.nav.activeCategory = category;
    } else {
        desk.nav.activeCategory = null;
    }
}