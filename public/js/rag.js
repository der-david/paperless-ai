// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const apiStatus = document.getElementById('api-status');
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const typingIndicator = document.getElementById('typing-indicator');
const filtersToggle = document.getElementById('filters-toggle');
const filtersContent = document.getElementById('filters-content');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const startIndexingBtn = document.getElementById('start-indexing-btn');
const errorMessage = document.getElementById('error-message');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');
const correspondent = document.getElementById('correspondent');
const aiToggle = document.getElementById('ai-toggle');
const aiModelBadge = document.getElementById('ai-model-badge');
const aiModelName = document.getElementById('ai-model-name');

// State
let useAI = localStorage.getItem('useAI') !== 'false'; // Default: true
let isConnected = false; // Track connection status

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateAIToggle();
    autoResizeTextarea();
    messageInput.addEventListener('input', autoResizeTextarea);

    // Initialize status badges to "connecting" state
    updateStatusBadgesLoading();

    // Perform initial status check
    checkStatus();

    // Initialize event listeners
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    aiToggle.addEventListener('click', () => {
        useAI = !useAI;
        localStorage.setItem('useAI', useAI);
        updateAIToggle();
    });

    filtersToggle.addEventListener('click', () => {
        filtersContent.classList.toggle('hidden');
        const icon = filtersToggle.querySelector('i');
        if (filtersContent.classList.contains('hidden')) {
            icon.className = 'fas fa-chevron-down';
        } else {
            icon.className = 'fas fa-chevron-up';
        }
    });

    checkUpdatesBtn.addEventListener('click', async () => {
        checkUpdatesBtn.disabled = true;
        checkUpdatesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

        try {
            const response = await fetch('/api/rag/index/check');

            if (response.ok) {
                const data = await response.json();
                showSystemMessage(`Status: ${data.message}`);
                isConnected = true;
                updateStatusIndicator('online', 'Online');
            } else {
                showError('Error checking status');
                isConnected = false;
                updateStatusIndicator('offline', 'Offline');
                updateStatusBadgesOffline();
            }
        } catch (error) {
            showError(`Connection error: ${error.message}`);
            isConnected = false;
            updateStatusIndicator('offline', 'Offline');
            updateStatusBadgesOffline();
        } finally {
            checkUpdatesBtn.disabled = false;
            checkUpdatesBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Check for Updates';
        }
    });

    startIndexingBtn.addEventListener('click', async () => {
        startIndexingBtn.disabled = true;
        startIndexingBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';

        try {
            const response = await fetch('/api/rag/index', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    force: true,
                    background: true
                })
            });

            if (response.ok) {
                const data = await response.json();
                showSystemMessage(`Indexing started: ${data.status}`);
                updateStatusIndicator('indexing', 'Indexing in progress');

                // Update status badges to show indexing in progress
                addStatusBadge(false, 'Indexing', 'In Progress', 'warning');

                isConnected = true;
            } else {
                showError('Error starting indexing');
                isConnected = false;
                updateStatusIndicator('offline', 'Offline');
                updateStatusBadgesOffline();
            }
        } catch (error) {
            showError(`Connection error: ${error.message}`);
            isConnected = false;
            updateStatusIndicator('offline', 'Offline');
            updateStatusBadgesOffline();
        } finally {
            startIndexingBtn.disabled = false;
            startIndexingBtn.innerHTML = '<i class="fas fa-database"></i> Start Indexing';
        }
    });

    // Poll for status updates every 10 seconds
    setInterval(checkStatus, 10000);
});

function updateAIToggle() {
    if (useAI) {
        aiToggle.classList.add('active');
        aiToggle.title = 'Disable AI response';
    } else {
        aiToggle.classList.remove('active');
        aiToggle.title = 'Enable AI response';
    }
}

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
}

// Function to check RAG service status
async function checkStatus() {
    try {
        const response = await fetch('/api/rag/status');
        if (response.ok) {
            const data = await response.json();
            isConnected = true;
            updateStatus(data);
        } else {
            isConnected = false;
            updateStatusIndicator('offline', 'Offline');
            updateStatusBadgesOffline();
        }
    } catch (error) {
        console.error('Error checking status:', error);
        isConnected = false;
        updateStatusIndicator('offline', 'Offline');
        updateStatusBadgesOffline();
    }
}

function updateStatus(statusData) {
    // Update AI model info
    if (statusData.ai_status === 'ok') {
        const modelName = statusData.ai_model.toUpperCase();
        aiModelName.textContent = `AI MODEL: ${modelName}`;
    } else {
        aiModelName.textContent = 'AI: Not available';
    }

    // Update status indicator
    if (!statusData.server_up) {
        updateStatusIndicator('offline', 'Offline');
        updateStatusBadgesOffline();
        return;
    }

    if (statusData.indexing_status && statusData.indexing_status.running) {
        updateStatusIndicator('indexing', 'Indexing in progress');
    } else if (statusData.index_ready) {
        updateStatusIndicator('online', 'Ready');
    } else if (statusData.data_loaded) {
        updateStatusIndicator('indexing', 'Creating index');
    } else {
        updateStatusIndicator('indexing', 'Loading data');
    }

    // Update API status badges
    updateStatusBadges(statusData);
}

function updateStatusIndicator(status, text) {
    statusIndicator.className = `status-dot ${status}`;
    statusText.textContent = text;
}

function updateStatusBadgesLoading() {
    apiStatus.innerHTML = '';
    addStatusBadge(false, 'Server', 'Connecting...', 'warning');
    addStatusBadge(false, 'Data', 'Pending', 'warning');
    addStatusBadge(false, 'Index', 'Pending', 'warning');
}

function updateStatusBadgesOffline() {
    apiStatus.innerHTML = '';
    addStatusBadge(false, 'Server', 'Offline', 'error');
    addStatusBadge(false, 'Data', 'Unknown', 'error');
    addStatusBadge(false, 'Index', 'Unknown', 'error');
}

function updateStatusBadges(statusData) {
    apiStatus.innerHTML = '';

    // Server Status
    addStatusBadge(
        statusData.server_up,
        'Server',
        statusData.server_up ? 'Online' : 'Offline'
    );

    // Data Status
    if (statusData.data_loaded !== undefined) {
        addStatusBadge(
            statusData.data_loaded,
            'Data',
            statusData.data_loaded ? 'Loaded' : 'Not loaded'
        );
    }

    // Index Status
    if (statusData.index_ready !== undefined) {
        addStatusBadge(
            statusData.index_ready,
            'Index',
            statusData.index_ready ? 'Ready' : 'Not ready'
        );
    }

    // Indexing Status
    if (statusData.indexing_status && statusData.indexing_status.running) {
        addStatusBadge(
            false,
            'Indexing',
            'In Progress',
            'warning'
        );
    }

    // Document Count
    if (statusData.indexing_status && statusData.indexing_status.documents_count > 0) {
        addStatusBadge(
            true,
            'Documents',
            statusData.indexing_status.documents_count.toString(),
            'success'
        );
    } else if (statusData.indexing_status) {
        // If documents_count is 0 but we're connected, show as warning
        addStatusBadge(
            false,
            'Documents',
            statusData.indexing_status.documents_count.toString(),
            'warning'
        );
    }
}

function addStatusBadge(isSuccess, label, value, forceStatus = null) {
    const status = forceStatus || (isSuccess ? 'success' : 'error');
    const icon = status === 'success' ? 'check-circle' :
                status === 'warning' ? 'exclamation-triangle' : 'times-circle';

    const badge = document.createElement('div');
    badge.className = `status-badge ${status}`;
    badge.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${label}: ${value}</span>
    `;
    apiStatus.appendChild(badge);
}

function sendMessage() {
    const questionText = messageInput.value.trim();
    if (!questionText) return;

    // Check if we're connected before sending
    if (!isConnected) {
        showError("Cannot send message: Server is offline. Please check your connection.");
        return;
    }

    // Clear input and resize
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Add user message to chat
    addUserMessage(questionText);

    // Show typing indicator
    typingIndicator.classList.remove('hidden');

    // Clear error message
    errorMessage.classList.add('hidden');

    // Get filter values
    const fromDate = dateFrom.value;
    const toDate = dateTo.value;
    const correspondentValue = correspondent.value.trim();

    // Prepare request
    const endpoint = '/api/rag/ask';

    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            question: questionText,
            useAI: useAI,
            from_date: fromDate || undefined,
            to_date: toDate || undefined,
            correspondent: correspondentValue || undefined
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        // Hide typing indicator
        typingIndicator.classList.add('hidden');

        // Display answer with sources
        addAssistantMessage(data.answer, data.sources, data.model);

        // Update connection status
        isConnected = true;
        updateStatusIndicator('online', 'Online');
    })
    .catch(error => {
        // Hide typing indicator
        typingIndicator.classList.add('hidden');

        // Show error message
        showError(`Error: ${error.message}`);

        // Update connection status if there was an error
        isConnected = false;
        updateStatusIndicator('offline', 'Offline');
        updateStatusBadgesOffline();

        // Schedule an immediate status check
        setTimeout(checkStatus, 1000);
    });
}

function addUserMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message user';
    messageElement.textContent = message;
    chatContainer.appendChild(messageElement);
    scrollToBottom();
}

function addAssistantMessage(message, sources = [], modelUsed = null) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message assistant';

    // Format message with markdown
    let formattedMessage = message.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    if (!formattedMessage.startsWith('<p>')) formattedMessage = '<p>' + formattedMessage;
    if (!formattedMessage.endsWith('</p>')) formattedMessage += '</p>';

    let html = `<div class="markdown">${formattedMessage}</div>`;

    // Add model info if available
    if (modelUsed) {
        html += `<div class="result-meta">
                    <i class="fas fa-robot"></i> Answered with ${modelUsed}
                </div>`;
    }

    // Add sources if available
    if (sources && sources.length > 0) {
        html += `<div class="sources-container">
                    <div class="sources-title">
                        <span>Sources (${sources.length})</span>
                        <button class="sources-toggle" data-expanded="false">
                            Show all <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                    <div class="sources-list">`;

        sources.forEach((source, index) => {
            const date = source.date ? new Date(source.date).toLocaleDateString('en-US') : 'Unknown';
            const hidden = index > 0 ? ' hidden' : '';

            html += `
                <div class="source${hidden}" data-index="${index}">
                    <div class="source-title">${source.title || 'Unknown Title'}</div>
                    <p>${source.snippet || 'No excerpt available'}</p>
                    <div class="source-meta">
                        <span>${source.correspondent || 'Unknown Sender'}</span>
                        <span>${date}</span>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
    }

    messageElement.innerHTML = html;
    chatContainer.appendChild(messageElement);

    // Add event listener for sources toggle
    const toggleBtn = messageElement.querySelector('.sources-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const sourcesList = messageElement.querySelector('.sources-list');
            const sources = sourcesList.querySelectorAll('.source');
            const isExpanded = toggleBtn.getAttribute('data-expanded') === 'true';

            if (isExpanded) {
                // Collapse
                sources.forEach((source, index) => {
                    if (index > 0) source.classList.add('hidden');
                });
                toggleBtn.innerHTML = 'Show all <i class="fas fa-chevron-down"></i>';
                toggleBtn.setAttribute('data-expanded', 'false');
            } else {
                // Expand
                sources.forEach(source => source.classList.remove('hidden'));
                toggleBtn.innerHTML = 'Hide <i class="fas fa-chevron-up"></i>';
                toggleBtn.setAttribute('data-expanded', 'true');
            }
        });
    }

    scrollToBottom();
}

function showSystemMessage(message) {
    const systemMessage = document.createElement('div');
    systemMessage.className = 'system-message';
    systemMessage.textContent = message;
    chatContainer.appendChild(systemMessage);
    scrollToBottom();
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}
    
