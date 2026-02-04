function getDashboardPageData() {
    const dataElement = document.getElementById('dashboard-data');
    if (!dataElement) {
        return null;
    }

    const tokenDistribution = JSON.parse(dataElement.dataset.tokenDistribution || '[]');
    const documentTypes = JSON.parse(dataElement.dataset.documentTypes || '[]');
    const documentCount = Number(dataElement.dataset.documentCount || 0);
    const processedCount = Number(dataElement.dataset.processedCount || 0);
    const inScopeCount = Number(dataElement.dataset.inScopeCount || Math.max(documentCount - processedCount, 0));
    const excludedCount = Number(dataElement.dataset.excludedCount || 0);
    const notIncludedCount = Number(dataElement.dataset.notIncludedCount || 0);
    const includeTagsActive = dataElement.dataset.includeTagsActive === 'true';
    const excludeTagsActive = dataElement.dataset.excludeTagsActive === 'true';
    const version = dataElement.dataset.version || '';

    return {
        tokenDistribution,
        documentTypes,
        documentCount,
        processedCount,
        inScopeCount,
        excludedCount,
        notIncludedCount,
        includeTagsActive,
        excludeTagsActive,
        version
    };
}

function getCurrentTheme() {
    return localStorage.getItem('theme') || 'light';
}

function getAxisTextColor() {
    return getCurrentTheme() === 'dark' ? '#ffffff' : '#000000';
}

function initTokenDistributionChart(data) {
    const canvas = document.getElementById('tokenDistribution');
    if (!canvas || !window.Chart) {
        return;
    }

    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: data.tokenDistribution.map((dist) => dist.range),
            datasets: [{
                label: 'Number of Documents',
                data: data.tokenDistribution.map((dist) => dist.count),
                backgroundColor: '#60a5fa'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    ticks: {
                        color: getAxisTextColor()
                    }
                },
                y: {
                    ticks: {
                        color: getAxisTextColor()
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: getAxisTextColor()
                    }
                }
            }
        }
    });
}

function initDocumentTypesChart(data) {
    const canvas = document.getElementById('documentTypes');
    if (!canvas || !window.Chart) {
        return;
    }

    new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: data.documentTypes.map((type) => type.type),
            datasets: [{
                data: data.documentTypes.map((type) => type.count),
                backgroundColor: ['#3b82f6', '#60a5fa', '#93c5fd']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true
                }
            }
        }
    });
}

async function checkForUpdates(currentVersion) {
    try {
        if (!currentVersion) {
            return;
        }

        const response = await fetch('https://api.github.com/repos/clusterzx/paperless-ai/releases/latest');
        if (!response.ok) {
            throw new Error('Failed to fetch release info');
        }

        const data = await response.json();
        const latestVersion = data.tag_name;

        const current = currentVersion.replace('v', '').split('.').map(Number);
        const latest = latestVersion.replace('v', '').split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            if ((latest[i] || 0) > (current[i] || 0)) {
                const latestVersionElement = document.getElementById('latestVersion');
                const notification = document.getElementById('updateNotification');
                if (!latestVersionElement || !notification) {
                    return;
                }

                latestVersionElement.textContent = latestVersion;
                notification.classList.remove('hidden');
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(20px)';

                setTimeout(() => {
                    notification.style.transition = 'all 0.3s ease-out';
                    notification.style.opacity = '1';
                    notification.style.transform = 'translateY(0)';
                }, 100);
                break;
            } else if ((latest[i] || 0) < (current[i] || 0)) {
                break;
            }
        }
    } catch (error) {
        console.error('Failed to check for updates:', error);
    }
}

window.triggerScan = async function triggerScan() {
    const button = document.getElementById('scanButton');
    if (!button || button.disabled) {
        return;
    }

    const icon = button.querySelector('i');
    const span = button.querySelector('span');

    button.disabled = true;
    button.classList.add('opacity-50', 'cursor-not-allowed');
    if (icon) {
        icon.classList.add('animate-spin');
    }
    if (span) {
        span.textContent = 'Scanning...';
    }

    try {
        const response = await fetch('/api/scan/now', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Scan failed');
        }

        const toast = document.getElementById('successToast');
        if (toast) {
            toast.classList.remove('hidden');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 3000);
        }
    } catch (error) {
        console.error('Scan failed:', error);
    } finally {
        button.disabled = false;
        button.classList.remove('opacity-50', 'cursor-not-allowed');
        if (icon) {
            icon.classList.remove('animate-spin');
        }
        if (span) {
            span.textContent = 'Scan Now';
        }
    }
};

function formatTimeAgo(dateString) {
    const date = new Date(`${dateString}Z`);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 5) {
        return 'just now';
    }
    if (seconds < 60) {
        return `${seconds} seconds ago`;
    }
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function updateProcessingStatus() {
    fetch('/api/processing-status')
        .then((response) => response.json())
        .then((data) => {
            const processingContainer = document.getElementById('processingContainer');
            const idleContainer = document.getElementById('idleContainer');
            const scanButton = document.getElementById('scanButton');
            if (!processingContainer || !idleContainer || !scanButton) {
                return;
            }

            if (data.currentlyProcessing) {
                processingContainer.classList.remove('hidden');
                idleContainer.classList.add('hidden');
                scanButton.disabled = true;

                const currentDocId = document.getElementById('currentDocId');
                const currentDocTitle = document.getElementById('currentDocTitle');
                if (currentDocId) {
                    currentDocId.textContent = `#${data.currentlyProcessing.documentId}`;
                }
                if (currentDocTitle) {
                    const trimmedTitle = data.currentlyProcessing.title.length > 50
                        ? `${data.currentlyProcessing.title.slice(0, 90)}...`
                        : data.currentlyProcessing.title;
                    currentDocTitle.textContent = trimmedTitle;
                }

                const lastProcessed = document.getElementById('lastProcessed');
                if (lastProcessed) {
                    lastProcessed.innerHTML = `
                        <span class="text-blue-600">
                            <i class="fas fa-spinner fa-spin"></i> Processing...
                        </span>`;
                }
            } else {
                processingContainer.classList.add('hidden');
                idleContainer.classList.remove('hidden');
                scanButton.disabled = false;

                const lastProcessed = document.getElementById('lastProcessed');
                if (lastProcessed) {
                    if (data.lastProcessed) {
                        lastProcessed.textContent = formatTimeAgo(data.lastProcessed.processed_at);
                    } else {
                        lastProcessed.textContent = 'No documents processed yet';
                    }
                }
            }

            const processedToday = document.getElementById('processedToday');
            if (processedToday) {
                processedToday.textContent = data.processedToday;
            }

            const statusLastUpdated = document.getElementById('statusLastUpdated');
            if (statusLastUpdated) {
                statusLastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString(navigator.language)}`;
            }
        })
        .catch((error) => console.error('Error fetching processing status:', error));
}

document.addEventListener('DOMContentLoaded', () => {
    const data = getDashboardPageData();
    if (!data) {
        return;
    }

    window.dashboardData = {
        documentCount: data.documentCount,
        processedCount: data.processedCount,
        inScopeCount: data.inScopeCount,
        excludedCount: data.excludedCount,
        notIncludedCount: data.notIncludedCount,
        includeTagsActive: data.includeTagsActive,
        excludeTagsActive: data.excludeTagsActive
    };

    initTokenDistributionChart(data);
    initDocumentTypesChart(data);
    checkForUpdates(data.version);
    updateProcessingStatus();
    setInterval(updateProcessingStatus, 3000);
});
