class RadarDisplay {
    constructor() {
        this.radarScreen = document.getElementById('radarScreen');
        this.networkList = document.getElementById('networkItems');
        this.networkInfo = document.getElementById('networkInfo');
        this.scanButton = document.getElementById('scanButton');
        this.exportButton = document.getElementById('exportButton');
        this.clearButton = document.getElementById('clearButton');

        this.networks = new Map();
        this.isScanning = false;
        this.updateInterval = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startAutoUpdate();
        this.updateStatistics();
    }

    setupEventListeners() {
        this.scanButton.addEventListener('click', () => this.toggleScan());
        this.exportButton.addEventListener('click', () => this.exportData());
        this.clearButton.addEventListener('click', () => this.clearData());
    }

    getRadarMetrics() {
        const rect = this.radarScreen.getBoundingClientRect();
        return {
            centerX: rect.width / 2,
            centerY: rect.height / 2,
            radius: rect.width / 2,
        };
    }

    async toggleScan() {
        if (this.isScanning) {
            await this.stopScan();
            return;
        }
        await this.startScan();
    }

    async startScan() {
        try {
            const response = await fetch('/api/scan/start');
            const data = await response.json();

            if (data.status === 'scan_started') {
                this.isScanning = true;
                this.scanButton.innerHTML = '<span class="status-indicator"></span>Stop Scan';
                this.updateStatus('Scanning...');
                document.getElementById('scanningOverlay').style.display = 'block';
            }
        } catch (error) {
            this.updateStatus('Error starting scan');
            console.error(error);
        }
    }

    async stopScan() {
        try {
            const response = await fetch('/api/scan/stop');
            const data = await response.json();

            if (data.status === 'scan_stopped') {
                this.isScanning = false;
                this.scanButton.innerHTML = '<span class="status-indicator"></span>Start Scan';
                this.updateStatus('Stopped');
                document.getElementById('scanningOverlay').style.display = 'none';
            }
        } catch (error) {
            this.updateStatus('Error stopping scan');
            console.error(error);
        }
    }

    async exportData() {
        try {
            const response = await fetch('/api/export/json');
            if (!response.ok) {
                this.updateStatus('Export failed');
                return;
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `radar_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            this.updateStatus('Data exported');
        } catch (error) {
            this.updateStatus('Export failed');
            console.error(error);
        }
    }

    clearData() {
        if (!window.confirm('Are you sure you want to clear all scan data?')) {
            return;
        }
        this.networks.clear();
        this.updateRadarDisplay();
        this.updateNetworkList();
        this.updateStatus('Data cleared');
    }

    startAutoUpdate() {
        this.updateInterval = setInterval(() => {
            this.updateSignals();
            this.updateStatistics();
        }, 3000);
    }

    async updateSignals() {
        try {
            const response = await fetch('/api/signals');
            const data = await response.json();

            if (!data.signals) {
                return;
            }
            data.signals.forEach((signal) => this.networks.set(signal.bssid, signal));
            this.updateRadarDisplay();
            this.updateNetworkList();
            this.updateLastUpdate(data.timestamp);
        } catch (error) {
            console.error(error);
        }
    }

    createNetworkDot(network) {
        const dot = document.createElement('div');
        dot.className = 'network-dot';
        dot.dataset.bssid = network.bssid;

        let riskClass = 'low-risk';
        if (network.risk_score > 70) riskClass = 'high-risk';
        else if (network.risk_score > 30) riskClass = 'medium-risk';
        dot.classList.add(riskClass);

        const { centerX, centerY, radius } = this.getRadarMetrics();
        const x = centerX + (network.position.x * radius);
        const y = centerY + (network.position.y * radius);

        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        dot.addEventListener('click', (event) => {
            event.stopPropagation();
            this.showNetworkInfo(network, event);
        });

        return dot;
    }

    updateRadarDisplay() {
        this.radarScreen.querySelectorAll('.network-dot').forEach((dot) => dot.remove());
        this.networks.forEach((network) => {
            this.radarScreen.appendChild(this.createNetworkDot(network));
        });
    }

    showNetworkInfo(network, event) {
        this.networkInfo.innerHTML = `
            <div><strong>${network.ssid || 'Hidden'}</strong></div>
            <div>${network.bssid}</div>
            <div>Signal: ${network.level} dBm</div>
            <div>Distance: ${network.distance.toFixed(1)}m</div>
            <div>Risk: ${network.risk_score}/100</div>
            <div>Security: ${network.capabilities || 'Unknown'}</div>
            <div>Frequency: ${network.frequency} MHz</div>
        `;

        this.networkInfo.style.left = `${event.clientX + 10}px`;
        this.networkInfo.style.top = `${event.clientY + 10}px`;
        this.networkInfo.style.display = 'block';
    }

    updateNetworkList() {
        const networks = Array.from(this.networks.values()).sort((a, b) => b.risk_score - a.risk_score);

        this.networkList.innerHTML = networks.map((network) => `
            <div class="network-item" data-bssid="${network.bssid}">
                <div><strong>${network.ssid || 'Hidden'}</strong></div>
                <div class="text-xs">${network.bssid}</div>
                <div>${network.level} dBm • Risk ${network.risk_score}</div>
            </div>
        `).join('');

        this.networkList.querySelectorAll('.network-item').forEach((item) => {
            item.addEventListener('click', () => {
                const dot = this.radarScreen.querySelector(`[data-bssid="${item.dataset.bssid}"]`);
                if (!dot) return;
                dot.style.transform = 'translate(-50%, -50%) scale(1.8)';
                setTimeout(() => { dot.style.transform = 'translate(-50%, -50%) scale(1)'; }, 600);
            });
        });
    }

    async updateStatistics() {
        try {
            const response = await fetch('/api/statistics');
            const stats = await response.json();
            document.getElementById('totalNetworks').textContent = stats.total_networks || 0;
            document.getElementById('activeNetworks').textContent = stats.active_networks || 0;
            document.getElementById('highRiskNetworks').textContent = stats.high_risk_networks || 0;
            document.getElementById('openNetworks').textContent = stats.open_networks || 0;
            document.getElementById('hiddenNetworks').textContent = stats.hidden_networks || 0;
        } catch (error) {
            console.error(error);
        }
    }

    updateStatus(message) {
        document.getElementById('statusText').textContent = message;
    }

    updateLastUpdate(timestamp) {
        if (!timestamp) return;
        document.getElementById('lastUpdate').textContent = new Date(timestamp).toLocaleTimeString();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RadarDisplay();

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.network-dot') && !event.target.closest('.network-info')) {
            document.getElementById('networkInfo').style.display = 'none';
        }
    });
});
