class DeskNavigation
{
    constructor() {
    }
    
    // Dynamic page loading function
    loadPage(page, link = null, params = null) {
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = 'Loading...';

        // Remove 'active' class from previous links
        const activeLinks = document.querySelectorAll('#links a.active');
        activeLinks.forEach(activeLink => activeLink.classList.remove('active'));

        // Add 'active' class to current link
        if (link) {
            link.classList.add('active');
        }

        // Parse any existing URL parameters
        params = params ? JSON.parse(params) : getUrlParams();

        fetch(`${page}`)
            .then(response => response.text())
            .then(data => {
                contentDiv.innerHTML = data;
                const initEvent = new CustomEvent(`${page}-init`, {
                    detail: {
                        publicKey: desk.wallet.publicKey,
                        privateKey: desk.wallet.privateKey,
                        linkParams: params // Pass URL parameters to the init event
                    }
                });
                document.dispatchEvent(initEvent);
            })
            .catch(error => {
                contentDiv.innerHTML = 'Failed to load content.';
                console.error('Error loading page:', error);
            });
    }
}