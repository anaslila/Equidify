// Professional Stock Trading Platform
class TradingPlatform {
    constructor() {
        this.currentSection = 'dashboard';
        this.selectedStock = null;
        this.watchlist = [];
        this.portfolio = [];
        this.marketData = new Map();
        this.isMarketOpen = true;
        this.charts = {};
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadInitialData();
        this.startMarketDataUpdates();
        this.initializeCharts();
        this.updateMarketStatus();
    }

    // Event Binding
    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchSection(e.target.dataset.section);
            });
        });

        // Stock search
        const stockSearch = document.getElementById('stockSearch');
        stockSearch.addEventListener('input', this.debounce(this.searchStocks.bind(this), 300));

        // Trade form
        document.getElementById('quantity').addEventListener('input', this.calculateTradeValue.bind(this));
        document.getElementById('orderType').addEventListener('change', this.handleOrderTypeChange.bind(this));
        
        // Trade type buttons
        document.querySelectorAll('.trade-btn').forEach(btn => {
            btn.addEventListener('click', this.handleTradeTypeChange.bind(this));
        });

        // Watchlist tabs
        document.querySelectorAll('.movers-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', this.switchMoversTab.bind(this));
        });

        // Add stock button
        document.querySelector('.add-stock-btn').addEventListener('click', this.showAddStockModal.bind(this));

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', this.closeModal.bind(this));
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
    }

    // Navigation
    switchSection(sectionName) {
        // Update active navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // Update active section
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName).classList.add('active');

        this.currentSection = sectionName;
        this.loadSectionData(sectionName);
    }

    // Load section-specific data
    loadSectionData(section) {
        switch(section) {
            case 'watchlist':
                this.loadWatchlistData();
                break;
            case 'portfolio':
                this.loadPortfolioData();
                break;
            case 'analytics':
                this.updateAnalyticsCharts();
                break;
            case 'research':
                this.loadResearchData();
                break;
        }
    }

    // Stock Search Functionality
    searchStocks(e) {
        const query = e.target.value.trim();
        if (query.length < 2) {
            this.hideSearchResults();
            return;
        }

        const results = this.getStockSearchResults(query);
        this.displaySearchResults(results);
    }

    getStockSearchResults(query) {
        const stockDatabase = [
            { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', price: 2567.80, change: 1.25 },
            { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3456.90, change: -0.87 },
            { symbol: 'INFY', name: 'Infosys Ltd', price: 1678.45, change: 2.34 },
            { symbol: 'HDFC', name: 'HDFC Bank Ltd', price: 1456.30, change: -1.56 },
            { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', price: 945.67, change: 0.78 },
            { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', price: 876.54, change: 1.89 },
            { symbol: 'ITC', name: 'ITC Ltd', price: 432.10, change: -0.45 },
            { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', price: 1789.23, change: 2.67 },
            { symbol: 'LT', name: 'Larsen & Toubro Ltd', price: 2345.67, change: 1.34 },
            { symbol: 'SBIN', name: 'State Bank of India', price: 567.89, change: -0.23 }
        ];

        return stockDatabase.filter(stock => 
            stock.symbol.toLowerCase().includes(query.toLowerCase()) ||
            stock.name.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);
    }

    displaySearchResults(results) {
        const container = document.getElementById('searchResults');
        
        if (results.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.innerHTML = results.map(stock => `
            <div class="search-result-item" onclick="app.selectStock('${stock.symbol}', '${stock.name}', ${stock.price})">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${stock.symbol}</strong>
                        <div style="font-size: 12px; color: var(--text-secondary);">${stock.name}</div>
                    </div>
                    <div style="text-align: right;">
                        <div>₹${stock.price.toFixed(2)}</div>
                        <div class="stock-change ${stock.change >= 0 ? 'positive' : 'negative'}" style="font-size: 12px;">
                            ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        container.style.display = 'block';
    }

    selectStock(symbol, name, price) {
        this.selectedStock = { symbol, name, price };
        document.getElementById('stockSearch').value = `${symbol} - ${name}`;
        this.hideSearchResults();
        this.calculateTradeValue();
        this.showToast(`Selected ${symbol}`, 'success');
    }

    hideSearchResults() {
        document.getElementById('searchResults').style.display = 'none';
    }

    // Trading Interface
    handleTradeTypeChange(e) {
        document.querySelectorAll('.trade-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        this.calculateTradeValue();
    }

    handleOrderTypeChange() {
        const orderType = document.getElementById('orderType').value;
        const priceInput = document.getElementById('price');
        
        if (orderType === 'market') {
            priceInput.disabled = true;
            priceInput.value = this.selectedStock ? this.selectedStock.price.toFixed(2) : '';
        } else {
            priceInput.disabled = false;
        }
        
        this.calculateTradeValue();
    }

    calculateTradeValue() {
        const quantity = parseInt(document.getElementById('quantity').value) || 0;
        const orderType = document.getElementById('orderType').value;
        let price = 0;

        if (this.selectedStock) {
            if (orderType === 'market') {
                price = this.selectedStock.price;
            } else {
                price = parseFloat(document.getElementById('price').value) || this.selectedStock.price;
            }
        }

        const estimatedCost = quantity * price;
        document.getElementById('estimatedCost').textContent = `₹${estimatedCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    }

    // Portfolio Management
    loadPortfolioData() {
        const sampleHoldings = [
            { symbol: 'RELIANCE', name: 'Reliance Industries', qty: 50, avgCost: 2400.00, ltp: 2567.80, pl: 8390.00, dayChange: 1.25 },
            { symbol: 'TCS', name: 'Tata Consultancy Services', qty: 25, avgCost: 3500.00, ltp: 3456.90, pl: -1077.50, dayChange: -0.87 },
            { symbol: 'INFY', name: 'Infosys Ltd', qty: 75, avgCost: 1600.00, ltp: 1678.45, pl: 5883.75, dayChange: 2.34 },
            { symbol: 'HDFC', name: 'HDFC Bank Ltd', qty: 100, avgCost: 1500.00, ltp: 1456.30, pl: -4370.00, dayChange: -1.56 },
            { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', qty: 200, avgCost: 900.00, ltp: 945.67, pl: 9134.00, dayChange: 0.78 }
        ];

        const tbody = document.getElementById('holdingsBody');
        tbody.innerHTML = sampleHoldings.map(holding => `
            <tr>
                <td>
                    <div>
                        <strong>${holding.symbol}</strong>
                        <div style="font-size: 12px; color: var(--text-secondary);">${holding.name}</div>
                    </div>
                </td>
                <td>${holding.qty}</td>
                <td>₹${holding.avgCost.toFixed(2)}</td>
                <td>₹${holding.ltp.toFixed(2)}</td>
                <td class="${holding.pl >= 0 ? 'positive' : 'negative'}">
                    ${holding.pl >= 0 ? '+' : ''}₹${Math.abs(holding.pl).toFixed(2)}
                </td>
                <td class="${holding.dayChange >= 0 ? 'positive' : 'negative'}">
                    ${holding.dayChange >= 0 ? '+' : ''}${holding.dayChange.toFixed(2)}%
                </td>
                <td>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px;">
                        View Details
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // Watchlist Management
    loadWatchlistData() {
        const sampleWatchlist = [
            { symbol: 'RELIANCE', ltp: 2567.80, change: 32.45, changePercent: 1.28, volume: '12.5M' },
            { symbol: 'TCS', ltp: 3456.90, change: -29.87, changePercent: -0.86, volume: '8.7M' },
            { symbol: 'INFY', ltp: 1678.45, change: 38.34, changePercent: 2.34, volume: '15.2M' },
            { symbol: 'HDFC', ltp: 1456.30, change: -23.56, changePercent: -1.59, volume: '18.9M' },
            { symbol: 'ICICIBANK', ltp: 945.67, change: 7.35, changePercent: 0.78, volume: '22.1M' },
            { symbol: 'BHARTIARTL', ltp: 876.54, change: 16.23, changePercent: 1.89, volume: '9.8M' },
            { symbol: 'ITC', ltp: 432.10, change: -1.95, changePercent: -0.45, volume: '28.7M' },
            { symbol: 'KOTAKBANK', ltp: 1789.23, change: 46.67, changePercent: 2.68, volume: '6.4M' }
        ];

        const tbody = document.getElementById('watchlistBody');
        tbody.innerHTML = sampleWatchlist.map(stock => `
            <tr>
                <td><strong>${stock.symbol}</strong></td>
                <td>₹${stock.ltp.toFixed(2)}</td>
                <td class="${stock.change >= 0 ? 'positive' : 'negative'}">
                    ${stock.change >= 0 ? '+' : ''}₹${Math.abs(stock.change).toFixed(2)}
                </td>
                <td class="${stock.changePercent >= 0 ? 'positive' : 'negative'}">
                    ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%
                </td>
                <td>${stock.volume}</td>
                <td>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; margin-right: 6px;" 
                            onclick="app.quickBuy('${stock.symbol}')">
                        Buy
                    </button>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px;" 
                            onclick="app.quickSell('${stock.symbol}')">
                        Sell
                    </button>
                </td>
            </tr>
        `).join('');
    }

    quickBuy(symbol) {
        this.showToast(`Order placement is currently on hold for ${symbol}`, 'warning');
    }

    quickSell(symbol) {
        this.showToast(`Order placement is currently on hold for ${symbol}`, 'warning');
    }

    // Market Data Updates
    startMarketDataUpdates() {
        // Simulate real-time updates every 5 seconds
        setInterval(() => {
            if (this.isMarketOpen) {
                this.updateMarketData();
            }
        }, 5000);
    }

    updateMarketData() {
        // Update indices with random fluctuations
        this.updateIndexValue('nifty50', 19674.35);
        this.updateIndexValue('sensex', 65953.48);
        this.updateIndexValue('banknifty', 45123.75);
        this.updateIndexValue('niftyit', 28456.90);

        // Update portfolio value
        this.updatePortfolioSummary();
    }

    updateIndexValue(indexId, baseValue) {
        const element = document.getElementById(indexId);
        if (element) {
            const fluctuation = (Math.random() - 0.5) * 100; // ±50 points
            const newValue = baseValue + fluctuation;
            element.textContent = newValue.toFixed(2);
        }
    }

    updatePortfolioSummary() {
        // Simulate portfolio value changes
        const portfolioValue = 1567890 + (Math.random() - 0.5) * 10000;
        const dayPL = 12345 + (Math.random() - 0.5) * 5000;
        
        // Update portfolio chart if visible
        if (this.currentSection === 'dashboard' && this.charts.portfolioChart) {
            this.updatePortfolioChart();
        }
    }

    // Chart Initialization
    initializeCharts() {
        this.initPortfolioChart();
        
        // Initialize other charts when their sections are visited
        setTimeout(() => {
            if (this.currentSection === 'analytics') {
                this.initAnalyticsCharts();
            }
        }, 100);
    }

    initPortfolioChart() {
        const ctx = document.getElementById('portfolioChart');
        if (!ctx) return;

        // Generate sample data for the last 30 days
        const labels = [];
        const data = [];
        const baseValue = 1400000;
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }));
            
            const randomChange = (Math.random() - 0.5) * 50000;
            data.push(baseValue + randomChange + (i * 2000)); // Upward trend
        }

        this.charts.portfolioChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Portfolio Value',
                    data: data,
                    borderColor: '#1976d2',
                    backgroundColor: 'rgba(25, 118, 210, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return '₹' + (value / 100000).toFixed(1) + 'L';
                            }
                        }
                    }
                }
            }
        });
    }

    initAnalyticsCharts() {
        // Performance Chart
        const performanceCtx = document.getElementById('performanceChart');
        if (performanceCtx && !this.charts.performanceChart) {
            this.charts.performanceChart = new Chart(performanceCtx, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Portfolio Returns',
                        data: [5.2, 8.1, 12.5, 15.8, 18.2, 22.4],
                        borderColor: '#4caf50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        borderWidth: 2,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
        }

        // Sector Allocation Chart
        const sectorCtx = document.getElementById('sectorChart');
        if (sectorCtx && !this.charts.sectorChart) {
            this.charts.sectorChart = new Chart(sectorCtx, {
                type: 'doughnut',
                data: {
                    labels: ['IT', 'Banking', 'Energy', 'Healthcare', 'Others'],
                    datasets: [{
                        data: [35, 25, 20, 12, 8],
                        backgroundColor: [
                            '#1976d2',
                            '#4caf50',
                            '#ff9800',
                            '#f44336',
                            '#9c27b0'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
    }

    updateAnalyticsCharts() {
        // Refresh analytics charts when section is loaded
        setTimeout(() => {
            this.initAnalyticsCharts();
        }, 100);
    }

    // Movers Tab Switching
    switchMoversTab(e) {
        const tabName = e.target.dataset.tab;
        
        // Update active tab
        document.querySelectorAll('.movers-tabs .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');

        // Update active content
        document.querySelectorAll('.movers-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');
    }

    // Modal Management
    showAddStockModal() {
        const modal = document.getElementById('stockModal');
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    closeModal(e) {
        const modal = e.target.closest('.modal');
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    // Market Status Management
    updateMarketStatus() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const currentTime = hours * 60 + minutes;
        
        // Market hours: 9:15 AM to 3:30 PM (Indian time)
        const marketOpen = 9 * 60 + 15; // 9:15 AM
        const marketClose = 15 * 60 + 30; // 3:30 PM
        
        this.isMarketOpen = currentTime >= marketOpen && currentTime <= marketClose;
        
        const statusElement = document.getElementById('marketStatus');
        const indicator = document.querySelector('.live-indicator');
        
        if (this.isMarketOpen) {
            statusElement.textContent = 'Market Open';
            statusElement.className = 'status-open';
            indicator.style.backgroundColor = '#4caf50';
        } else {
            statusElement.textContent = 'Market Closed';
            statusElement.className = 'status-closed';
            indicator.style.backgroundColor = '#f44336';
        }
    }

    // Research Tools
    loadResearchData() {
        // Initialize research tools and data
        this.updateTechnicalIndicators();
    }

    updateTechnicalIndicators() {
        // Update technical indicators with simulated data
        const indicators = [
            { name: 'RSI (14)', value: (Math.random() * 40 + 30).toFixed(2) },
            { name: 'MACD', value: (Math.random() * 20 - 10).toFixed(2) },
            { name: 'Moving Avg (50)', value: '₹' + (2000 + Math.random() * 500).toFixed(2) }
        ];

        const indicatorList = document.querySelector('.indicator-list');
        if (indicatorList) {
            indicatorList.innerHTML = indicators.map(indicator => `
                <div class="indicator-item">
                    <span>${indicator.name}</span>
                    <span class="indicator-value ${parseFloat(indicator.value) > 0 ? 'positive' : ''}">${indicator.value}</span>
                </div>
            `).join('');
        }
    }

    // Keyboard Shortcuts
    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case '1':
                    e.preventDefault();
                    this.switchSection('dashboard');
                    break;
                case '2':
                    e.preventDefault();
                    this.switchSection('watchlist');
                    break;
                case '3':
                    e.preventDefault();
                    this.switchSection('portfolio');
                    break;
                case '4':
                    e.preventDefault();
                    this.switchSection('analytics');
                    break;
                case '5':
                    e.preventDefault();
                    this.switchSection('research');
                    break;
            }
        }
    }

    // Initial Data Loading
    loadInitialData() {
        // Load initial portfolio data
        this.loadPortfolioData();
        
        // Load initial watchlist
        this.loadWatchlistData();
        
        // Set up market data
        this.updateMarketData();
    }

    // Toast Notifications
    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${this.getToastIcon(type)}"></i>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        // Auto remove after 4 seconds
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => {
                if (toast.parentNode) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 4000);
    }

    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // Utility Functions
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new TradingPlatform();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Pause real-time updates when page is hidden
        console.log('Page hidden - pausing updates');
    } else {
        // Resume updates when page is visible
        console.log('Page visible - resuming updates');
        if (window.app) {
            window.app.updateMarketData();
        }
    }
});
