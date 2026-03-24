(function () {
    function boolLabel(value) { return value ? 'yes' : 'no'; }
    function nowIso() { return new Date().toISOString(); }

    function RadarDisplay() {
        this.radarScreen = document.getElementById('radarScreen');
        this.radarStateNode = document.getElementById('radarState');
        this.radarReadinessNode = document.getElementById('radarReadiness');
        this.retryRadarButton = document.getElementById('retryRadarButton');
        this.mainLayout = document.getElementById('mainLayout');
        this.diagnosticsDetails = document.getElementById('diagnosticsDetails');

        this.networkList = document.getElementById('networkItems');
        this.networkInfo = document.getElementById('networkInfo');
        this.scanButton = document.getElementById('scanButton');
        this.exportButton = document.getElementById('exportButton');
        this.clearButton = document.getElementById('clearButton');
        this.networkSearch = document.getElementById('networkSearch');

        this.layoutModeSelect = document.getElementById('layoutModeSelect');
        this.sortModeSelect = document.getElementById('sortModeSelect');
        this.filterModeSelect = document.getElementById('filterModeSelect');

        this.frontendStatus = document.getElementById('frontendStatus');
        this.featureProbeNode = document.getElementById('featureProbe');
        this.pollStatusNode = document.getElementById('pollStatus');
        this.radarMetricsNode = document.getElementById('radarMetrics');
        this.lastErrorNode = document.getElementById('lastError');

        this.version = '20260324c';
        this.networks = new Map();
        this.isScanning = false;
        this.updateInterval = null;
        this.searchQuery = '';
        this.lastPollTime = null;
        this.latestSignals = [];

        this.radarState = 'pending';
        this.radarRetryAttempts = 0;
        this.radarRetryTimer = null;

        var params = new URLSearchParams(window.location.search);
        this.fixtureMode = params.get('fixture') === 'stress';
        this.debugMode = params.get('debug') === '1';

        this.sortMode = 'signal';
        this.filterMode = 'all';
        this.layoutMode = 'balanced';

        this.init();
    }

    RadarDisplay.prototype.setStatus = function (message) { this.frontendStatus.textContent = message; };
    RadarDisplay.prototype.setLastError = function (message) { this.lastErrorNode.textContent = 'Last error: ' + message; };
    RadarDisplay.prototype.updatePollStatus = function (extra) {
        var stamp = this.lastPollTime ? new Date(this.lastPollTime).toLocaleTimeString() : 'never';
        this.pollStatusNode.textContent = 'Last poll: ' + stamp + (extra ? ' • ' + extra : '');
    };

    RadarDisplay.prototype.setRadarReadiness = function (state, details) {
        this.radarState = state;
        this.radarStateNode.textContent = details;
        this.radarReadinessNode.textContent = 'Radar state: ' + state + (details ? ' (' + details + ')' : '');
    };

    RadarDisplay.prototype.renderFeatureProbe = function () {
        var features = {
            fetch: typeof window.fetch === 'function',
            map: typeof window.Map === 'function',
            promise: typeof window.Promise === 'function',
            querySelector: typeof document.querySelector === 'function'
        };
        this.featureProbeNode.textContent = 'Features fetch:' + boolLabel(features.fetch) + ' Map:' + boolLabel(features.map) + ' Promise:' + boolLabel(features.promise) + ' querySelector:' + boolLabel(features.querySelector);

        if (!features.fetch || !features.map || !features.promise || !features.querySelector) {
            this.setStatus('Browser runtime too old for current frontend');
            this.setLastError('Browser compatibility issue suspected');
            return false;
        }
        return true;
    };

    RadarDisplay.prototype.applyLayoutMode = function (mode) {
        this.layoutMode = mode;
        this.mainLayout.setAttribute('data-layout-mode', mode);
        this.waitForRadarViewport(true);
    };

    RadarDisplay.prototype.configureDiagnosticsVisibility = function () {
        if (this.debugMode) {
            this.diagnosticsDetails.open = true;
            this.retryRadarButton.hidden = false;
            return;
        }
        if (window.innerWidth < 960) {
            this.diagnosticsDetails.open = false;
        } else {
            this.diagnosticsDetails.open = true;
        }
    };

    RadarDisplay.prototype.init = function () {
        try {
            this.setStatus('Frontend initialized');
            this.setLastError('none');
            this.updatePollStatus();
            this.setRadarReadiness('pending', 'Radar plotting pending');

            if (!this.renderFeatureProbe()) { return; }

            this.setupEventListeners();
            this.configureDiagnosticsVisibility();
            if (this.fixtureMode) { this.loadStressFixture(); }

            this.waitForRadarViewport(false);
            this.startAutoUpdate();
            this.updateStatistics();
        } catch (error) {
            console.error(error);
            this.setStatus('Frontend initialization failed');
            this.setLastError(String(error));
        }
    };

    RadarDisplay.prototype.setupEventListeners = function () {
        var self = this;
        this.scanButton.addEventListener('click', function () { self.toggleScan(); });
        this.exportButton.addEventListener('click', function () { self.exportData(); });
        this.clearButton.addEventListener('click', function () { self.clearData(); });
        this.retryRadarButton.addEventListener('click', function () { self.retryRadarLayout(); });

        this.networkSearch.addEventListener('input', function (event) {
            self.searchQuery = String(event.target.value || '').toLowerCase().trim();
            self.updateNetworkList();
        });

        this.layoutModeSelect.addEventListener('change', function (event) { self.applyLayoutMode(event.target.value); });
        this.sortModeSelect.addEventListener('change', function (event) { self.sortMode = event.target.value; self.updateNetworkList(); });
        this.filterModeSelect.addEventListener('change', function (event) { self.filterMode = event.target.value; self.updateNetworkList(); });

        window.addEventListener('resize', function () { self.onViewportChange(); });
        window.addEventListener('orientationchange', function () { self.onViewportChange(); });
        window.addEventListener('load', function () { self.onViewportChange(); });
    };

    RadarDisplay.prototype.onViewportChange = function () {
        this.configureDiagnosticsVisibility();
        this.waitForRadarViewport(true);
        this.updateRadarDisplay();
    };

    RadarDisplay.prototype.retryRadarLayout = function () {
        this.radarRetryAttempts = 0;
        this.waitForRadarViewport(true);
        this.updateRadarDisplay();
    };

    RadarDisplay.prototype.waitForRadarViewport = function (triggeredByRetry) {
        var self = this;
        var maxAttempts = 18;
        if (this.radarRetryTimer) {
            clearTimeout(this.radarRetryTimer);
            this.radarRetryTimer = null;
        }

        function check() {
            self.radarRetryAttempts += 1;
            var rect = self.radarScreen.getBoundingClientRect();
            var width = Math.round(rect.width);
            var height = Math.round(rect.height);
            self.radarMetricsNode.textContent = 'Radar: ' + width + 'x' + height;

            if (width >= 120 && height >= 120) {
                self.setRadarReadiness('ready', 'Radar viewport ready');
                return;
            }

            if (self.radarRetryAttempts < maxAttempts) {
                self.setRadarReadiness('retrying', 'Radar plotting delayed; retry ' + self.radarRetryAttempts + '/' + maxAttempts);
                self.radarRetryTimer = setTimeout(check, 160);
                return;
            }

            self.setRadarReadiness('failed', 'Container not ready, retrying on next poll');
            if (triggeredByRetry) {
                self.setLastError('Radar viewport stayed too small after retry window');
            }
        }

        this.radarRetryAttempts = 0;
        check();
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
                    var err = payload && payload.error && payload.error.message ? payload.error.message : 'Request failed: ' + response.status;
                    throw new Error(err);
                }
                return payload.data;
            });
        }).catch(function (error) {
            console.error(error);
            self.setStatus('API request failed');
            self.setLastError(String(error));
            throw error;
        });
    };

    RadarDisplay.prototype.toggleScan = function () { return this.isScanning ? this.stopScan() : this.startScan(); };

    RadarDisplay.prototype.startScan = function () {
        var self = this;
        return this.fetchV1('/api/v1/scan/start', { method: 'POST' }).then(function (data) {
            if (data.status === 'scan_started') {
                self.isScanning = true;
                self.scanButton.innerHTML = '<span class="status-indicator"></span>Stop Scan';
                self.updateStatus('Scanning...');
                document.getElementById('scanningOverlay').style.display = 'block';
            }
        });
    };

    RadarDisplay.prototype.stopScan = function () {
        var self = this;
        return this.fetchV1('/api/v1/scan/stop', { method: 'POST' }).then(function (data) {
            if (data.status === 'scan_stopped') {
                self.isScanning = false;
                self.scanButton.innerHTML = '<span class="status-indicator"></span>Start Scan';
                self.updateStatus('Stopped');
                document.getElementById('scanningOverlay').style.display = 'none';
            }
        });
    };

    RadarDisplay.prototype.exportData = function () {
        var self = this;
        this.fetchV1('/api/v1/export/json').then(function (data) {
            window.location.href = data.download_path;
            self.updateStatus('Data exported');
        });
    };

    RadarDisplay.prototype.clearData = function () {
        if (!window.confirm('Are you sure you want to clear all scan data?')) { return; }
        this.networks.clear();
        this.latestSignals = [];
        this.updateRadarDisplay();
        this.updateNetworkList();
        this.updateStatus('Data cleared');
    };

    RadarDisplay.prototype.startAutoUpdate = function () {
        var self = this;
        this.updateInterval = setInterval(function () {
            self.updateSignals();
            self.updateStatistics();
            if (self.radarState !== 'ready') { self.waitForRadarViewport(false); }
        }, 3000);
    };

    RadarDisplay.prototype.updateSignals = function () {
        var self = this;
        if (this.fixtureMode) { return; }

        this.fetchV1('/api/v1/signals').then(function (data) {
            if (!data.signals) {
                self.setStatus('No scan data available');
                return;
            }

            self.latestSignals = data.signals;
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

        var riskClass = 'low-risk';
        if (network.risk_score > 70) riskClass = 'high-risk';
        else if (network.risk_score > 30) riskClass = 'medium-risk';
        dot.classList.add(riskClass);

        dot.style.left = (metrics.centerX + (network.position.x * metrics.radius)) + 'px';
        dot.style.top = (metrics.centerY + (network.position.y * metrics.radius)) + 'px';

        var self = this;
        dot.addEventListener('click', function (event) { event.stopPropagation(); self.showNetworkInfo(network, event); });
        return dot;
    };

    RadarDisplay.prototype.updateRadarDisplay = function () {
        var self = this;
        this.radarScreen.querySelectorAll('.network-dot').forEach(function (dot) { dot.remove(); });

        if (this.radarState === 'failed') {
            this.radarStateNode.textContent = 'Radar plotting delayed. Container not ready. Retrying…';
        }

        this.networks.forEach(function (network) {
            var dot = self.createNetworkDot(network);
            if (dot) self.radarScreen.appendChild(dot);
        });
    };

    RadarDisplay.prototype.showNetworkInfo = function (network, event) {
        this.networkInfo.innerHTML = '<div><strong>' + (network.ssid || 'Hidden') + '</strong></div>' + '<div>' + network.bssid + '</div>' + '<div>Signal: ' + network.level + ' dBm</div>' + '<div>Distance: ' + Number(network.distance || 0).toFixed(1) + 'm</div>' + '<div>Risk: ' + network.risk_score + '/100</div>' + '<div>Security: ' + (network.capabilities || 'Unknown') + '</div>' + '<div>Frequency: ' + network.frequency + ' MHz</div>';
        this.networkInfo.style.left = (event.clientX + 10) + 'px';
        this.networkInfo.style.top = (event.clientY + 10) + 'px';
        this.networkInfo.style.display = 'block';
    };

    RadarDisplay.prototype.filteredAndSortedNetworks = function () {
        var self = this;
        var filtered = Array.from(this.networks.values()).filter(function (network) {
            if (self.filterMode === 'hidden' && !network.is_hidden) return false;
            if (self.filterMode === 'open' && !network.is_open) return false;
            if (self.filterMode === 'high-risk' && !(network.risk_score > 50)) return false;

            if (!self.searchQuery) return true;
            var ssid = String(network.ssid || '').toLowerCase();
            var bssid = String(network.bssid || '').toLowerCase();
            var vendor = String(network.vendor || '').toLowerCase();
            return ssid.indexOf(self.searchQuery) !== -1 || bssid.indexOf(self.searchQuery) !== -1 || vendor.indexOf(self.searchQuery) !== -1;
        });

        if (this.sortMode === 'risk') {
            filtered.sort(function (a, b) { return b.risk_score - a.risk_score; });
        } else if (this.sortMode === 'signal') {
            filtered.sort(function (a, b) { return b.level - a.level; });
        } else if (this.sortMode === 'recent') {
            filtered.sort(function (a, b) { return String(b.last_seen || '').localeCompare(String(a.last_seen || '')); });
        } else if (this.sortMode === 'ssid') {
            filtered.sort(function (a, b) { return String(a.ssid || '').localeCompare(String(b.ssid || '')); });
        }

        return filtered;
    };

    RadarDisplay.prototype.updateNetworkList = function () {
        var self = this;
        var networks = this.filteredAndSortedNetworks();

        this.networkList.innerHTML = networks.map(function (network) {
            return '<div class="network-item" data-bssid="' + network.bssid + '">' +
                '<div><strong>' + (network.ssid || 'Hidden') + '</strong></div>' +
                '<div class="text-xs">' + network.bssid + '</div>' +
                '<div>' + network.level + ' dBm • Risk ' + network.risk_score + '</div>' +
                '</div>';
        }).join('');

        this.networkList.querySelectorAll('.network-item').forEach(function (item) {
            item.addEventListener('click', function () {
                var dot = self.radarScreen.querySelector('[data-bssid="' + item.dataset.bssid + '"]');
                if (!dot) return;
                dot.style.transform = 'translate(-50%, -50%) scale(1.8)';
                setTimeout(function () { dot.style.transform = 'translate(-50%, -50%) scale(1)'; }, 600);
            });
        });
    };

    RadarDisplay.prototype.updateStatistics = function () {
        var self = this;
        if (this.fixtureMode) {
            var values = Array.from(this.networks.values());
            document.getElementById('totalNetworks').textContent = values.length;
            document.getElementById('activeNetworks').textContent = values.length;
            document.getElementById('highRiskNetworks').textContent = values.filter(function (n) { return n.risk_score > 50; }).length;
            document.getElementById('openNetworks').textContent = values.filter(function (n) { return n.is_open; }).length;
            document.getElementById('hiddenNetworks').textContent = values.filter(function (n) { return n.is_hidden; }).length;
            return;
        }

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
    RadarDisplay.prototype.updateLastUpdate = function (timestamp) { if (timestamp) document.getElementById('lastUpdate').textContent = new Date(timestamp).toLocaleTimeString(); };

    RadarDisplay.prototype.loadStressFixture = function () {
        var levels = [-32, -44, -58, -67, -78, -85];
        for (var i = 0; i < 70; i += 1) {
            var bssid = 'AA:BB:CC:' + String(i).padStart(2, '0') + ':DD:EE';
            var level = levels[i % levels.length];
            var risk = (i * 7) % 100;
            this.networks.set(bssid, {
                bssid: bssid,
                ssid: 'Very-Long-SSID-For-Stress-Validation-Network-' + String(i).padStart(3, '0'),
                level: level,
                last_seen: nowIso(),
                distance: Math.max(1, Math.abs(level) / 2),
                risk_score: risk,
                is_hidden: i % 9 === 0,
                is_open: i % 5 === 0,
                capabilities: i % 5 === 0 ? '[OPEN]' : '[WPA2-PSK-CCMP][ESS]',
                frequency: i % 2 === 0 ? 2412 : 5180,
                position: { x: Math.cos(i * 0.5) * ((i % 10) / 10), y: Math.sin(i * 0.5) * ((i % 10) / 10) }
            });
        }

        this.lastPollTime = nowIso();
        this.updatePollStatus('Fixture data active');
        this.updateStatus('Fixture: stress mode');
        this.updateRadarDisplay();
        this.updateNetworkList();
        this.updateLastUpdate(this.lastPollTime);
        this.setStatus('Live data loaded');
    };

    document.addEventListener('DOMContentLoaded', function () {
        try {
            new RadarDisplay();
        } catch (error) {
            console.error(error);
            var fallback = document.getElementById('frontendStatus');
            var lastError = document.getElementById('lastError');
            if (fallback) fallback.textContent = 'Frontend initialization failed';
            if (lastError) lastError.textContent = 'Last error: ' + String(error);
        }

        document.addEventListener('click', function (event) {
            if (!event.target.closest('.network-dot') && !event.target.closest('.network-info')) {
                document.getElementById('networkInfo').style.display = 'none';
            }
        });
    });
})();
