// Initialize search
document.addEventListener('search.html-load', () => {
    desk.gui.populateNetworkSelect('search');
    
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    if (query) {
        document.getElementById('searchQuery').value = query;
        performSearch();
    }

    // Add event listener for enter key in search box
    document.getElementById('searchQuery').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    }); 
});

// Perform search
async function performSearch() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) return;

    const result = await desk.networkRequest({
        networkId: desk.gui.activeNetworkId,
        method: 'search',
        query: query
    });

    displayResults(result.results);
}
function openPage(contentId) {
    updateUrlParams({ pageLoad: contentId });
    loadPage('filesystem.html', null, JSON.stringify({loadPage: contentId}));
}
// Display search results
function displayResults(results) {
    const container = document.getElementById('searchResults');
    container.innerHTML = '';

    if (!results || results.length === 0) {
        container.innerHTML = '<div class="no-results">No results found</div>';
        return;
    }

    results.forEach(result => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'search-result';
        resultDiv.innerHTML = `
            <a class="result-title" onclick="openPage('${result.contentId}')">${result.title}</a>
            <div class="result-url">dweb://${result.contentId}</div>
            <div class="result-description">${result.description}</div>
        `;
        container.appendChild(resultDiv);
    });
}

// Submit page modal functions
function showSubmitModal() {
    document.getElementById('submitModal').style.display = 'block';
}

function closeSubmitModal() {
    document.getElementById('submitModal').style.display = 'none';
}

async function submitPage() {
    const url = document.getElementById('submitUrl').value.trim();

    if (!url) {
        alert('Please fill in the URL field');
        return;
    }

    const result = await desk.networkRequest({
        networkId: desk.gui.activeNetworkId,
        method: 'submitPage',
        url: url
    });

    if (result.success) {
        alert('Page submitted successfully!');
        closeSubmitModal();
    } else {
        alert('Failed to submit page: ' + result.message);
    }
}