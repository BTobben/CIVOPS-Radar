(function () {
    var STORAGE_KEY = 'civops.panelOrder.v1';

    function nowIso() { return new Date().toISOString(); }

    function RadarDisplay() {
        this.mainLayout = document.getElementById('mainLayout');
        this.radarScreen = document.getElementById('radarScreen');
        this.radarStateNode = document.getElementById('radarState');
        this.radarReadinessNode = document.getElementById('radarReadiness');
        this.diagnosticsDetails = document.getElementById('diagnosticsDetails');

        this.menuToggle = document.getElementById('menuToggle');
        this.headerMenu = document.getElementById('headerMenu');

        this.scanButton = document.getElementById('scanButton');
        this.stopButton = document.getElementById('stopButton');
        this.newSessionButton = document.getElementById('newSessionButton');
        this.clearUiButton = document.getElementById('clearUiButton');

        this.networkList = document.getElementById('networkItems');
        this.networkSearch = document.getElementById('networkSearch');
        this.sortModeSelect = document.getElementById('sortModeSelect');
        this.filterModeSelect = document.getElementById('filterModeSelect');

        this.frontendStatus = document.getElementById('frontendStatus');
        this.featureProbeNode = document.getElementById('featureProbe');
        this.pollStatusNode = document.getElementById('pollStatus');
        this.radarMetricsNode = document.getElementById('radarMetrics');
        this.lastErrorNode = document.getElementById('lastError');
        this.lastActionNode = document.getElementById('lastAction');

        this.networkInfo = document.getElementById('networkInfo');

        this.panelRegistry = [
            { id: 'radar', defaultOrder: 10 },
            { id: 'statistics', defaultOrder: 20 },
            { id: 'controls', defaultOrder: 30 },
            { id: 'networks', defaultOrder: 40 },
            { id: 'diagnostics', defaultOrder: 50 }
        ];

        this.panelOrder = this.loadPanelOrder();
        this.isLayoutEditMode = false;

        this.networks = new Map();
        this.searchQuery = '';
        this.sortMode = 'signal';
        this.filterMode = 'all';
        this.lastPollTime = null;

        this.radarState = 'pending';
        this.radarRetryTimer = null;
        this.radarRetryAttempts = 0;

        this.pendingAction = null;
        this.isScanning = false;
        this.updateInterval = null;

        this.debugMode = new URLSearchParams(window.location.search).get('debug') === '1';

        this.init();
    }

    RadarDisplay.prototype.setStatus = function (message) { this.frontendStatus.textContent = message; };
    RadarDisplay.prototype.setLastError = function (message) { this.lastErrorNode.textContent = 'Last error: ' + message; };
    RadarDisplay.prototype.setLastAction = function (message) { this.lastActionNode.textContent = message; };
    RadarDisplay.prototype.updatePollStatus = function (extra) {
        var stamp = this.lastPollTime ? new Date(this.lastPollTime).toLocaleTimeString() : 'never';
        this.pollStatusNode.textContent = 'Last poll: ' + stamp + (extra ? ' • ' + extra : '');
    };

    RadarDisplay.prototype.setRadarReadiness = function (state, details) {
        this.radarState = state;
        this.radarStateNode.textContent = details;
        this.radarReadinessNode.textContent = 'Radar state: ' + state + ' (' + details + ')';
    };

    RadarDisplay.prototype.loadPanelOrder = function () {
        var defaults = {};
        this.panelRegistry.forEach(function (panel) { defaults[panel.id] = panel.defaultOrder; });
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { return defaults; }
            var parsed = JSON.parse(raw);
            return Object.assign(defaults, parsed);
        } catch (_err) {
            return defaults;
        }
    };

    RadarDisplay.prototype.savePanelOrder = function () {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.panelOrder));
    };

    RadarDisplay.prototype.applyPanelOrder = function () {
        var self = this;
        var ordered = this.panelRegistry.slice().sort(function (a, b) {
            return (self.panelOrder[a.id] || a.defaultOrder) - (self.panelOrder[b.id] || b.defaultOrder);
        });
        ordered.forEach(function (panel) {
            var node = self.mainLayout.querySelector('[data-panel-id="' + panel.id + '"]');
            if (node) { self.mainLayout.appendChild(node); }
            var input = self.mainLayout.querySelector('[data-order-input="' + panel.id + '"]');
            if (input) { input.value = self.panelOrder[panel.id]; }
        });
    };

    RadarDisplay.prototype.setLayoutEditMode = function (enabled) {
        this.isLayoutEditMode = enabled;
        this.mainLayout.querySelectorAll('.order-label').forEach(function (el) { el.hidden = !enabled; });
        this.setStatus(enabled ? 'Layout edit mode enabled' : 'Layout edit mode disabled');
    };

    RadarDisplay.prototype.bindPanelOrderInputs = function () {
        var self = this;
        this.mainLayout.querySelectorAll('.order-input').forEach(function (input) {
            input.addEventListener('change', function () {
                var id = input.getAttribute('data-order-input');
                var value = parseInt(input.value, 10);
                if (isNaN(value)) { return; }
                self.panelOrder[id] = value;
                self.savePanelOrder();
                self.applyPanelOrder();
                self.setLastAction('Layout order updated');
            });
        });
    };

    RadarDisplay.prototype.resetPanelOrder = function () {
        var self = this;
        this.panelRegistry.forEach(function (panel) { self.panelOrder[panel.id] = panel.defaultOrder; });
        this.savePanelOrder();
        this.applyPanelOrder();
        this.setLastAction('Layout reset to default');
    };

    RadarDisplay.prototype.renderFeatureProbe = function () {
        var hasFetch = typeof window.fetch === 'function';
        var hasMap = typeof window.Map === 'function';
        var hasPromise = typeof window.Promise === 'function';
        this.featureProbeNode.textContent = 'Features fetch:' + (hasFetch ? 'yes' : 'no') + ' Map:' + (hasMap ? 'yes' : 'no') + ' Promise:' + (hasPromise ? 'yes' : 'no');
        if (!hasFetch || !hasMap || !hasPromise) {
            this.setStatus('Browser runtime too old for current frontend');
            this.setLastError('Browser compatibility issue suspected');
            return false;
        }
        return true;
    };

    RadarDisplay.prototype.init = function () {
        this.applyPanelOrder();
        this.bindPanelOrderInputs();
        this.setStatus('Frontend initialized');
        this.setLastError('none');
        this.setLastAction('None');
        this.updatePollStatus();
        if (!this.renderFeatureProbe()) { return; }

        if (window.innerWidth < 960 && !this.debugMode) { this.diagnosticsDetails.open = false; }
        else { this.diagnosticsDetails.open = true; }

        this.setupEventListeners();
        this.waitForRadarViewport();
        this.startAutoUpdate();
        this.updateStatistics();
    };

    RadarDisplay.prototype.setupEventListeners = function () {
        var self = this;

        this.menuToggle.addEventListener('click', function () {
            self.headerMenu.hidden = !self.headerMenu.hidden;
        });

        this.headerMenu.querySelectorAll('[data-menu-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-menu-action');
                self.handleMenuAction(action);
                self.headerMenu.hidden = true;
            });
        });

        this.scanButton.addEventListener('click', function () { self.runAction('start-scan', function () { return self.startScan(); }); });
        this.stopButton.addEventListener('click', function () { self.runAction('stop-scan', function () { return self.stopScan(); }); });
        this.newSessionButton.addEventListener('click', function () { self.runAction('new-session', function () { return self.newSession(); }); });
        this.clearUiButton.addEventListener('click', function () { self.runAction('clear-ui', function () { return self.clearUi(); }); });

        this.networkSearch.addEventListener('input', function (event) { self.searchQuery = String(event.target.value || '').toLowerCase().trim(); self.updateNetworkList(); });
        this.sortModeSelect.addEventListener('change', function (event) { self.sortMode = event.target.value; self.updateNetworkList(); });
        this.filterModeSelect.addEventListener('change', function (event) { self.filterMode = event.target.value; self.updateNetworkList(); });

        window.addEventListener('resize', function () { self.waitForRadarViewport(); });
        window.addEventListener('orientationchange', function () { self.waitForRadarViewport(); });

        document.addEventListener('click', function (event) {
            if (!event.target.closest('.network-dot') && !event.target.closest('.network-info')) {
                self.networkInfo.style.display = 'none';
            }
            if (!event.target.closest('.header-actions')) {
                self.headerMenu.hidden = true;
            }
        });
    };

    RadarDisplay.prototype.handleMenuAction = function (action) {
        if (action === 'edit-layout') {
            this.setLayoutEditMode(!this.isLayoutEditMode);
        } else if (action === 'reset-layout') {
            this.resetPanelOrder();
        } else if (action === 'new-session') {
            this.runAction('new-session', this.newSession.bind(this));
        } else if (action === 'clear-ui') {
            this.runAction('clear-ui', this.clearUi.bind(this));
        } else if (action === 'toggle-diagnostics') {
            this.diagnosticsDetails.open = !this.diagnosticsDetails.open;
        } else if (action === 'retry-radar') {
            this.retryRadarLayout();
        }
    };

    RadarDisplay.prototype.runAction = function (name, fn) {
        var self = this;
        if (this.pendingAction) { return; }
        this.pendingAction = name;
        this.setLastAction('Pending: ' + name);
        this.setButtonsDisabled(true);

        Promise.resolve(fn()).then(function () {
            self.setLastAction('Success: ' + name);
        }).catch(function (error) {
            console.error(error);
            self.setLastAction('Failed: ' + name);
            self.setLastError(String(error));
        }).finally(function () {
            self.pendingAction = null;
            self.setButtonsDisabled(false);
        });
    };

    RadarDisplay.prototype.setButtonsDisabled = function (disabled) {
        [this.scanButton, this.stopButton, this.newSessionButton, this.clearUiButton].forEach(function (btn) {
            btn.disabled = disabled;
            btn.style.opacity = disabled ? '0.6' : '1';
        });
    };

    RadarDisplay.prototype.waitForRadarViewport = function () {
        var self = this;
        var attempts = 0;
        if (this.radarRetryTimer) { clearTimeout(this.radarRetryTimer); }

        function check() {
            attempts += 1;
            var rect = self.radarScreen.getBoundingClientRect();
            var w = Math.round(rect.width);
            var h = Math.round(rect.height);
            self.radarMetricsNode.textContent = 'Radar: ' + w + 'x' + h;
            if (w >= 120 && h >= 120) {
                self.setRadarReadiness('ready', 'viewport ready');
                return;
            }
            if (attempts < 18) {
                self.setRadarReadiness('retrying', 'delayed layout ' + attempts + '/18');
                self.radarRetryTimer = setTimeout(check, 180);
                return;
            }
            self.setRadarReadiness('failed', 'container not ready, retry on next poll');
        }

        check();
    };

    RadarDisplay.prototype.retryRadarLayout = function () {
        this.waitForRadarViewport();
        this.updateRadarDisplay();
        this.setLastAction('Manual radar retry');
    };

    RadarDisplay.prototype.getRadarMetrics = function () {
        var rect = this.radarScreen.getBoundingClientRect();
        return { centerX: rect.width / 2, centerY: rect.height / 2, radius: rect.width / 2, width: rect.width, height: rect.height };
    };

    RadarDisplay.prototype.fetchV1 = function (path, options) {
        var self = this;
        this.setStatus('Fetching ' + path + ' ...');
        return fetch(path, options).then(function (response) {
            return response.json().then(function (payload) {
                if (!response.ok || payload.ok === false) {
                    throw new Error(payload && payload.error && payload.error.message ? payload.error.message : 'Request failed: ' + response.status);
                }
                return payload.data;
            });
        }).catch(function (err) {
            self.setStatus('API request failed');
            self.setLastError(String(err));
            throw err;
        });
    };

    RadarDisplay.prototype.startScan = function () {
        var self = this;
        self.setStatus('Starting scan...');
        return this.fetchV1('/api/v1/scan/start', { method: 'POST' }).then(function (data) {
            if (data.status === 'scan_started') {
                self.isScanning = true;
                self.updateStatus('Scanning...');
                document.getElementById('scanningOverlay').style.display = 'block';
            }
        });
    };

    RadarDisplay.prototype.stopScan = function () {
        var self = this;
        self.setStatus('Stopping scan...');
        return this.fetchV1('/api/v1/scan/stop', { method: 'POST' }).then(function (data) {
            if (data.status === 'scan_stopped') {
                self.isScanning = false;
                self.updateStatus('Stopped');
                document.getElementById('scanningOverlay').style.display = 'none';
            }
        });
    };

    RadarDisplay.prototype.newSession = function () {
        this.networks.clear();
        this.updateRadarDisplay();
        this.updateNetworkList();
        this.updateLastUpdate(null);
        this.lastPollTime = null;
        this.updatePollStatus('session reset');
        this.updateStatus('New session created');
        this.setStatus('New session created');
        return Promise.resolve();
    };

    RadarDisplay.prototype.clearUi = function () {
        this.networks.clear();
        this.updateRadarDisplay();
        this.updateNetworkList();
        this.updateStatus('UI cleared');
        return Promise.resolve();
    };

    RadarDisplay.prototype.startAutoUpdate = function () {
        var self = this;
        this.updateInterval = setInterval(function () {
            self.updateSignals();
            self.updateStatistics();
            if (self.radarState !== 'ready') { self.waitForRadarViewport(); }
        }, 3000);
    };

    RadarDisplay.prototype.updateSignals = function () {
        var self = this;
        this.fetchV1('/api/v1/signals').then(function (data) {
            if (!data.signals) { self.setStatus('No scan data available'); return; }
            data.signals.forEach(function (signal) { self.networks.set(signal.bssid, signal); });
            self.lastPollTime = nowIso();
            self.updatePollStatus('Signals loaded: ' + data.signals.length);
            self.updateRadarDisplay();
            self.updateNetworkList();
            self.updateLastUpdate(self.lastPollTime);
            self.setStatus('Live data loaded');
        });
    };

    RadarDisplay.prototype.createNetworkDot = function (network) {
        var metrics = this.getRadarMetrics();
        if (metrics.width < 120 || metrics.height < 120) { return null; }
        var dot = document.createElement('div');
        dot.className = 'network-dot';
        dot.dataset.bssid = network.bssid;
        dot.classList.add(network.risk_score > 70 ? 'high-risk' : network.risk_score > 30 ? 'medium-risk' : 'low-risk');
        dot.style.left = (metrics.centerX + (network.position.x * metrics.radius)) + 'px';
        dot.style.top = (metrics.centerY + (network.position.y * metrics.radius)) + 'px';
        var self = this;
        dot.addEventListener('click', function (event) { event.stopPropagation(); self.showNetworkInfo(network, event); });
        return dot;
    };

    RadarDisplay.prototype.updateRadarDisplay = function () {
        var self = this;
        this.radarScreen.querySelectorAll('.network-dot').forEach(function (dot) { dot.remove(); });
        this.networks.forEach(function (network) {
            var dot = self.createNetworkDot(network);
            if (dot) { self.radarScreen.appendChild(dot); }
        });
    };

    RadarDisplay.prototype.showNetworkInfo = function (network, event) {
        this.networkInfo.innerHTML = '<div><strong>' + (network.ssid || 'Hidden') + '</strong></div>' + '<div>' + network.bssid + '</div><div>Signal: ' + network.level + ' dBm</div><div>Risk: ' + network.risk_score + '/100</div>';
        this.networkInfo.style.left = (event.clientX + 10) + 'px';
        this.networkInfo.style.top = (event.clientY + 10) + 'px';
        this.networkInfo.style.display = 'block';
    };

    RadarDisplay.prototype.filteredSortedNetworks = function () {
        var self = this;
        var filtered = Array.from(this.networks.values()).filter(function (network) {
            if (self.filterMode === 'hidden' && !network.is_hidden) return false;
            if (self.filterMode === 'open' && !network.is_open) return false;
            if (self.filterMode === 'high-risk' && network.risk_score <= 50) return false;
            if (!self.searchQuery) return true;
            var s = String(network.ssid || '').toLowerCase();
            var b = String(network.bssid || '').toLowerCase();
            var v = String(network.vendor || '').toLowerCase();
            return s.indexOf(self.searchQuery) !== -1 || b.indexOf(self.searchQuery) !== -1 || v.indexOf(self.searchQuery) !== -1;
        });

        if (this.sortMode === 'risk') filtered.sort(function (a, b) { return b.risk_score - a.risk_score; });
        else if (this.sortMode === 'signal') filtered.sort(function (a, b) { return b.level - a.level; });
        else if (this.sortMode === 'recent') filtered.sort(function (a, b) { return String(b.last_seen || '').localeCompare(String(a.last_seen || '')); });
        else if (this.sortMode === 'ssid') filtered.sort(function (a, b) { return String(a.ssid || '').localeCompare(String(b.ssid || '')); });
        return filtered;
    };

    RadarDisplay.prototype.updateNetworkList = function () {
        var self = this;
        var networks = this.filteredSortedNetworks();
        this.networkList.innerHTML = networks.map(function (n) {
            return '<div class="network-item" data-bssid="' + n.bssid + '"><div><strong>' + (n.ssid || 'Hidden') + '</strong></div><div>' + n.bssid + '</div><div>' + n.level + ' dBm • Risk ' + n.risk_score + '</div></div>';
        }).join('');

        this.networkList.querySelectorAll('.network-item').forEach(function (item) {
            item.addEventListener('click', function () {
                var dot = self.radarScreen.querySelector('[data-bssid="' + item.dataset.bssid + '"]');
                if (!dot) return;
                dot.style.transform = 'translate(-50%, -50%) scale(1.8)';
                setTimeout(function () { dot.style.transform = 'translate(-50%, -50%) scale(1)'; }, 500);
            });
        });
    };

    RadarDisplay.prototype.updateStatistics = function () {
        var self = this;
        this.fetchV1('/api/v1/statistics').then(function (stats) {
            document.getElementById('totalNetworks').textContent = stats.total_networks || 0;
            document.getElementById('activeNetworks').textContent = stats.active_networks || 0;
            document.getElementById('highRiskNetworks').textContent = stats.high_risk_networks || 0;
            document.getElementById('openNetworks').textContent = stats.open_networks || 0;
            document.getElementById('hiddenNetworks').textContent = stats.hidden_networks || 0;
            self.setStatus('Statistics updated');
        });
    };

    RadarDisplay.prototype.updateStatus = function (message) { document.getElementById('statusText').textContent = message; };
    RadarDisplay.prototype.updateLastUpdate = function (timestamp) {
        document.getElementById('lastUpdate').textContent = timestamp ? new Date(timestamp).toLocaleTimeString() : 'Never';
    };

    document.addEventListener('DOMContentLoaded', function () {
        try { new RadarDisplay(); }
        catch (error) {
            console.error(error);
            var status = document.getElementById('frontendStatus');
            if (status) { status.textContent = 'Frontend initialization failed'; }
        }
    });
})();
