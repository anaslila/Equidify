// ===== CONFIGURATION & CONSTANTS =====
const CONFIG = {
    FINNHUB_API_KEY: 'your_finnhub_api_key_here', // Replace with your actual API key
    FINNHUB_BASE_URL: 'https://finnhub.io/api/v1',
    WEBSOCKET_URL: 'wss://ws.finnhub.io',
    UPDATE_INTERVAL: 30000, // 30 seconds
    CACHE_DURATION: 60000, // 1 minute
};

// Market status constants
const MARKET_STATUS = {
    OPEN: 'open',
    CLOSED: 'closed',
    PRE_MARKET: 'pre-market',
    AFTER_HOURS: 'after-hours'
};

// ===== GLOBAL VARIABLES =====
let websocket = null;
let subscribedSymbols = new Set();
let stockCache = new Map();
let watchlist = JSON.parse(localStorage.getItem('equidify_watchlist')) || [];
let deferredPrompt = null;
let updateServiceWorker = null;

// ===== DOM ELEMENTS =====
const elements = {
    // Navigation
    navMenu: document.getElementById('navMenu'),
    mobileMenuToggle: document.getElementById('mobileMenuToggle'),
    navLinks: document.querySelectorAll('.nav-link'),
    
    // PWA Elements
    updateBanner: document.getElementById('updateBanner'),
    updateBtn: document.getElementById('updateBtn'),
    dismissBtn: document.getElementById('dismissBtn'),
    installBanner: document.getElementById('installBanner'),
    installBtn: document.getElementById('installBtn'),
    installDismiss: document.getElementById('installDismiss'),
    
    // Market Overview
    marketStatus: document.getElementById('marketStatus'),
    marketStatusText: document.getElementById('marketStatusText'),
    spyIndex: document.getElementById('spyIndex'),
    diaIndex: document.getElementById('diaIndex'),
    qqqIndex: document.getElementById('qqqIndex'),
    
    // Stock Search
    stockSearch: document.getElementById('stockSearch'),
    searchBtn: document.getElementById('searchBtn'),
    quickStocks: document.querySelectorAll('.quick-stock'),
    stockResults: document.getElementById('stockResults'),
    
    // Watchlist
    watchlistItems: document.getElementById('watchlistItems'),
    
    // Loading
    loadingOverlay: document.getElementById('loadingOverlay'),
};

// ===== UTILITY FUNCTIONS =====
const utils = {
    // Format currency
    formatCurrency: (value, decimals = 2) => {
        if (value === null || value === undefined) return '--';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(value);
    },
    
    // Format percentage
    formatPercentage: (value, decimals = 2) => {
        if (value === null || value === undefined) return '--';
        const formatted = parseFloat(value).toFixed(decimals);
        return `${formatted >= 0 ? '+' : ''}${formatted}%`;
    },
    
    // Format large numbers
    formatLargeNumber: (value) => {
        if (value === null || value === undefined) return '--';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
        if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
        return utils.formatCurrency(value);
    },
    
    // Get change class
    getChangeClass: (change) => {
        if (change > 0) return 'positive text-success';
        if (change < 0) return 'negative text-danger';
        return '';
    },
    
    // Debounce function
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Show loading
    showLoading: () => {
        elements.loadingOverlay?.classList.remove('hidden');
    },
    
    // Hide loading
    hideLoading: () => {
        elements.loadingOverlay?.classList.add('hidden');
    },
    
    // Show toast notification
    showToast: (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: var(--bg-card);
            border: 1px solid var(--accent-${type === 'error' ? 'red' : type === 'success' ? 'green' : 'blue'});
            padding: 1rem 1.5rem;
            border-radius: var(--border-radius-lg);
            color: var(--text-primary);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// ===== API FUNCTIONS =====
const api = {
    // Base API request function
    request: async (endpoint, params = {}) => {
        const url = new URL(`${CONFIG.FINNHUB_BASE_URL}${endpoint}`);
        url.searchParams.append('token', CONFIG.FINNHUB_API_KEY);
        
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Request failed:', error);
            utils.showToast(`API Error: ${error.message}`, 'error');
            return null;
        }
    },
    
    // Get stock quote
    getQuote: async (symbol) => {
        const cacheKey = `quote_${symbol}`;
        const cached = stockCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) {
            return cached.data;
        }
        
        const data = await api.request('/quote', { symbol });
        if (data) {
            stockCache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
        }
        return data;
    },
    
    // Get company profile
    getProfile: async (symbol) => {
        const cacheKey = `profile_${symbol}`;
        const cached = stockCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_DURATION * 10) {
            return cached.data;
        }
        
        const data = await api.request('/stock/profile2', { symbol });
        if (data) {
            stockCache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
        }
        return data;
    },
    
    // Search stocks
    searchStocks: async (query) => {
        return await api.request('/search', { q: query });
    },
    
    // Get market status
    getMarketStatus: async () => {
        const now = new Date();
        const hours = now.getHours();
        const day = now.getDay();
        
        // Weekend
        if (day === 0 || day === 6) {
            return MARKET_STATUS.CLOSED;
        }
        
        // Market hours (9:30 AM - 4:00 PM EST)
        if (hours >= 9.5 && hours < 16) {
            return MARKET_STATUS.OPEN;
        } else if (hours >= 4 && hours < 9.5) {
            return MARKET_STATUS.PRE_MARKET;
        } else {
            return MARKET_STATUS.AFTER_HOURS;
        }
    }
};

// ===== WEBSOCKET FUNCTIONS =====
const websocketManager = {
    connect: () => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            return;
        }
        
        websocket = new WebSocket(`${CONFIG.WEBSOCKET_URL}?token=${CONFIG.FINNHUB_API_KEY}`);
        
        websocket.onopen = () => {
            console.log('WebSocket connected');
            // Subscribe to existing symbols
            subscribedSymbols.forEach(symbol => {
                websocketManager.subscribe(symbol);
            });
        };
        
        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'trade') {
                websocketManager.handleTradeUpdate(data);
            }
        };
        
        websocket.onclose = () => {
            console.log('WebSocket disconnected');
            // Reconnect after 5 seconds
            setTimeout(() => {
                websocketManager.connect();
            }, 5000);
        };
        
        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    },
    
    subscribe: (symbol) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({
                type: 'subscribe',
                symbol: symbol
            }));
            subscribedSymbols.add(symbol);
        }
    },
    
    unsubscribe: (symbol) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({
                type: 'unsubscribe',
                symbol: symbol
            }));
            subscribedSymbols.delete(symbol);
        }
    },
    
    handleTradeUpdate: (data) => {
        if (data.data && data.data.length > 0) {
            const trade = data.data[0];
            const symbol = trade.s;
            const price = trade.p;
            
            // Update UI elements with new price
            updatePriceDisplay(symbol, price);
        }
    }
};

// ===== UI UPDATE FUNCTIONS =====
function updatePriceDisplay(symbol, price) {
    // Update index cards
    const indexCard = document.querySelector(`[data-symbol="${symbol}"]`);
    if (indexCard) {
        const priceElement = indexCard.querySelector('.price');
        if (priceElement) {
            priceElement.textContent = utils.formatCurrency(price);
        }
    }
    
    // Update watchlist
    const watchlistItem = document.querySelector(`.watchlist-item[data-symbol="${symbol}"]`);
    if (watchlistItem) {
        const priceElement = watchlistItem.querySelector('.item-price');
        if (priceElement) {
            priceElement.textContent = utils.formatCurrency(price);
        }
    }
    
    // Update stock results
    const stockCard = document.querySelector(`.stock-card[data-symbol="${symbol}"]`);
    if (stockCard) {
        const priceElement = stockCard.querySelector('.current-price');
        if (priceElement) {
            priceElement.textContent = utils.formatCurrency(price);
        }
    }
}

async function updateMarketIndices() {
    const indices = ['SPY', 'DIA', 'QQQ'];
    
    for (const symbol of indices) {
        try {
            const quote = await api.getQuote(symbol);
            if (quote) {
                const card = document.getElementById(`${symbol.toLowerCase()}Index`);
                if (card) {
                    const priceElement = card.querySelector('.price');
                    const changeElement = card.querySelector('.change');
                    
                    if (priceElement) {
                        priceElement.textContent = utils.formatCurrency(quote.c);
                    }
                    
                    if (changeElement) {
                        const change = quote.dp;
                        changeElement.textContent = utils.formatPercentage(change);
                        changeElement.className = `change ${utils.getChangeClass(change)}`;
                    }
                }
                
                // Subscribe to WebSocket updates
                websocketManager.subscribe(symbol);
            }
        } catch (error) {
            console.error(`Error updating ${symbol}:`, error);
        }
    }
}

async function updateMarketStatus() {
    const status = await api.getMarketStatus();
    const statusIndicator = elements.marketStatus;
    const statusText = elements.marketStatusText;
    
    if (statusIndicator && statusText) {
        statusIndicator.className = `status-indicator status-${status}`;
        
        const statusMessages = {
            [MARKET_STATUS.OPEN]: 'Market Open',
            [MARKET_STATUS.CLOSED]: 'Market Closed',
            [MARKET_STATUS.PRE_MARKET]: 'Pre-Market',
            [MARKET_STATUS.AFTER_HOURS]: 'After Hours'
        };
        
        statusText.textContent = statusMessages[status] || 'Unknown';
    }
}

async function searchStock(query) {
    if (!query.trim()) return;
    
    utils.showLoading();
    
    try {
        const searchResults = await api.searchStocks(query.toUpperCase());
        
        if (searchResults && searchResults.result && searchResults.result.length > 0) {
            displaySearchResults(searchResults.result.slice(0, 5)); // Show top 5 results
        } else {
            // Try direct quote lookup
            const quote = await api.getQuote(query.toUpperCase());
            const profile = await api.getProfile(query.toUpperCase());
            
            if (quote && quote.c) {
                displayStockCard(query.toUpperCase(), quote, profile);
            } else {
                elements.stockResults.innerHTML = `
                    <div class="no-results">
                        <h3>No results found</h3>
                        <p>Try searching for a different stock symbol or company name.</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Search error:', error);
        utils.showToast('Search failed. Please try again.', 'error');
    } finally {
        utils.hideLoading();
    }
}

async function displaySearchResults(results) {
    const resultsHTML = results.map(result => `
        <div class="search-result-item" onclick="selectStock('${result.symbol}')">
            <div class="result-info">
                <span class="result-symbol">${result.symbol}</span>
                <span class="result-name">${result.description}</span>
            </div>
            <button class="btn btn-small btn-outline">Select</button>
        </div>
    `).join('');
    
    elements.stockResults.innerHTML = `
        <div class="search-results">
            <h3>Search Results</h3>
            ${resultsHTML}
        </div>
    `;
}

async function selectStock(symbol) {
    utils.showLoading();
    
    try {
        const [quote, profile] = await Promise.all([
            api.getQuote(symbol),
            api.getProfile(symbol)
        ]);
        
        if (quote) {
            displayStockCard(symbol, quote, profile);
            websocketManager.subscribe(symbol);
        }
    } catch (error) {
        console.error('Error loading stock:', error);
        utils.showToast('Failed to load stock data', 'error');
    } finally {
        utils.hideLoading();
    }
}

function displayStockCard(symbol, quote, profile) {
    const change = quote.c - quote.pc;
    const changePercent = (change / quote.pc) * 100;
    
    const cardHTML = `
        <div class="stock-card" data-symbol="${symbol}">
            <div class="stock-header">
                <div class="stock-info">
                    <h3>${profile?.name || symbol}</h3>
                    <div class="stock-symbol">${symbol}</div>
                </div>
                <div class="stock-price-info">
                    <div class="current-price">${utils.formatCurrency(quote.c)}</div>
                    <div class="price-change ${utils.getChangeClass(change)}">
                        ${utils.formatCurrency(change)} (${utils.formatPercentage(changePercent)})
                    </div>
                </div>
            </div>
            <div class="stock-details">
                <div class="detail-item">
                    <div class="detail-label">Open</div>
                    <div class="detail-value">${utils.formatCurrency(quote.o)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">High</div>
                    <div class="detail-value">${utils.formatCurrency(quote.h)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Low</div>
                    <div class="detail-value">${utils.formatCurrency(quote.l)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Previous Close</div>
                    <div class="detail-value">${utils.formatCurrency(quote.pc)}</div>
                </div>
            </div>
            <div class="stock-actions">
                <button class="btn btn-success" onclick="addToWatchlist('${symbol}', '${profile?.name || symbol}')">
                    Add to Watchlist
                </button>
                <button class="btn btn-primary" onclick="startTrade('${symbol}')">
                    Trade
                </button>
            </div>
        </div>
    `;
    
    elements.stockResults.innerHTML = cardHTML;
}

function addToWatchlist(symbol, name) {
    if (watchlist.find(item => item.symbol === symbol)) {
        utils.showToast('Stock already in watchlist', 'warning');
        return;
    }
    
    watchlist.push({
        symbol,
        name,
        addedAt: Date.now()
    });
    
    localStorage.setItem('equidify_watchlist', JSON.stringify(watchlist));
    updateWatchlistDisplay();
    websocketManager.subscribe(symbol);
    utils.showToast('Added to watchlist', 'success');
}

function removeFromWatchlist(symbol) {
    watchlist = watchlist.filter(item => item.symbol !== symbol);
    localStorage.setItem('equidify_watchlist', JSON.stringify(watchlist));
    updateWatchlistDisplay();
    websocketManager.unsubscribe(symbol);
    utils.showToast('Removed from watchlist', 'success');
}

async function updateWatchlistDisplay() {
    if (!elements.watchlistItems) return;
    
    if (watchlist.length === 0) {
        elements.watchlistItems.innerHTML = `
            <div class="empty-watchlist">
                <h3>Your watchlist is empty</h3>
                <p>Search for stocks above to add them to your watchlist</p>
            </div>
        `;
        return;
    }
    
    const watchlistHTML = await Promise.all(
        watchlist.map(async (item) => {
            try {
                const quote = await api.getQuote(item.symbol);
                const change = quote ? quote.c - quote.pc : 0;
                const changePercent = quote ? (change / quote.pc) * 100 : 0;
                
                return `
                    <div class="watchlist-item" data-symbol="${item.symbol}">
                        <div class="symbol">${item.symbol}</div>
                        <div class="company-name">${item.name}</div>
                        <div class="item-price">${quote ? utils.formatCurrency(quote.c) : '--'}</div>
                        <div class="item-change ${utils.getChangeClass(change)}">
                            ${quote ? utils.formatPercentage(changePercent) : '--'}
                        </div>
                        <div class="item-actions">
                            <button class="action-btn buy-btn" onclick="startTrade('${item.symbol}', 'buy')">Buy</button>
                            <button class="action-btn sell-btn" onclick="startTrade('${item.symbol}', 'sell')">Sell</button>
                            <button class="action-btn remove-btn" onclick="removeFromWatchlist('${item.symbol}')">Remove</button>
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error(`Error loading watchlist item ${item.symbol}:`, error);
                return `
                    <div class="watchlist-item error" data-symbol="${item.symbol}">
                        <div class="symbol">${item.symbol}</div>
                        <div class="company-name">${item.name}</div>
                        <div class="item-price">Error</div>
                        <div class="item-change">--</div>
                        <div class="item-actions">
                            <button class="action-btn remove-btn" onclick="removeFromWatchlist('${item.symbol}')">Remove</button>
                        </div>
                    </div>
                `;
            }
        })
    );
    
    elements.watchlistItems.innerHTML = watchlistHTML.join('');
    
    // Subscribe to all watchlist symbols
    watchlist.forEach(item => websocketManager.subscribe(item.symbol));
}

function startTrade(symbol, type = 'buy') {
    utils.showToast(`${type.toUpperCase()} order for ${symbol} - Feature coming soon!`, 'info');
    // TODO: Implement actual trading functionality
}

// ===== PWA FUNCTIONS =====
function initPWA() {
    // Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallBanner();
    });
    
    // App installed
    window.addEventListener('appinstalled', (e) => {
        console.log('PWA installed');
        hideInstallBanner();
        utils.showToast('App installed successfully!', 'success');
        deferredPrompt = null;
    });
    
    // Service Worker update available
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
        
        navigator.serviceWorker.register('sw.js').then((registration) => {
            registration.addEventListener('updatefound', () => {
                updateServiceWorker = registration.installing;
                showUpdateBanner();
            });
        });
    }
}

function showInstallBanner() {
    if (elements.installBanner) {
        elements.installBanner.classList.remove('hidden');
    }
}

function hideInstallBanner() {
    if (elements.installBanner) {
        elements.installBanner.classList.add('hidden');
    }
}

function showUpdateBanner() {
    if (elements.updateBanner) {
        elements.updateBanner.classList.remove('hidden');
    }
}

function hideUpdateBanner() {
    if (elements.updateBanner) {
        elements.updateBanner.classList.add('hidden');
    }
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
    // Mobile menu toggle
    elements.mobileMenuToggle?.addEventListener('click', () => {
        elements.navMenu?.classList.toggle('active');
    });
    
    // Search functionality
    elements.searchBtn?.addEventListener('click', () => {
        const query = elements.stockSearch?.value.trim();
        if (query) {
            searchStock(query);
        }
    });
    
    elements.stockSearch?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                searchStock(query);
            }
        }
    });
    
    // Quick stock buttons
    elements.quickStocks.forEach(button => {
        button.addEventListener('click', () => {
            const symbol = button.getAttribute('data-symbol');
            selectStock(symbol);
        });
    });
    
    // PWA install button
    elements.installBtn?.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('User accepted install');
            }
            deferredPrompt = null;
        }
    });
    
    // PWA update button
    elements.updateBtn?.addEventListener('click', () => {
        if (updateServiceWorker) {
            updateServiceWorker.postMessage({ action: 'skipWaiting' });
        }
    });
    
    // Dismiss buttons
    elements.installDismiss?.addEventListener('click', hideInstallBanner);
    elements.dismissBtn?.addEventListener('click', hideUpdateBanner);
    
    // Navigation links
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            elements.navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // TODO: Implement section navigation
            const section = link.getAttribute('href').substring(1);
            console.log(`Navigate to ${section}`);
        });
    });
    
    // Auto-update intervals
    setInterval(updateMarketIndices, CONFIG.UPDATE_INTERVAL);
    setInterval(updateWatchlistDisplay, CONFIG.UPDATE_INTERVAL);
    setInterval(updateMarketStatus, 60000); // Update every minute
}

// ===== INITIALIZATION =====
async function init() {
    console.log('Initializing Equidify...');
    
    try {
        // Check API key
        if (CONFIG.FINNHUB_API_KEY === 'your_finnhub_api_key_here') {
            utils.showToast('Please configure your Finnhub API key', 'warning');
        }
        
        // Initialize PWA
        initPWA();
        
        // Initialize event listeners
        initEventListeners();
        
        // Connect WebSocket
        websocketManager.connect();
        
        // Initial data load
        await Promise.all([
            updateMarketStatus(),
            updateMarketIndices(),
            updateWatchlistDisplay()
        ]);
        
        console.log('Equidify initialized successfully');
        utils.showToast('Welcome to Equidify!', 'success');
        
    } catch (error) {
        console.error('Initialization error:', error);
        utils.showToast('Failed to initialize app', 'error');
    }
}

// ===== GLOBAL FUNCTIONS (for onclick handlers) =====
window.addToWatchlist = addToWatchlist;
window.removeFromWatchlist = removeFromWatchlist;
window.selectStock = selectStock;
window.startTrade = startTrade;

// ===== START APP =====
document.addEventListener('DOMContentLoaded', init);

// ===== SERVICE WORKER MESSAGING =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CACHE_UPDATED') {
            console.log('Cache updated');
        }
    });
}

// ===== ERROR HANDLING =====
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    utils.showToast('An error occurred. Please refresh the page.', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    utils.showToast('Network error. Please check your connection.', 'error');
});

// ===== CLEANUP =====
window.addEventListener('beforeunload', () => {
    if (websocket) {
        websocket.close();
    }
});
