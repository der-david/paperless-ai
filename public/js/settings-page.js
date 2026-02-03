document.addEventListener('DOMContentLoaded', () => {
    const apiKeyContainer = document.getElementById('apiKeyContainer');
    const copyNotification = document.getElementById('copyNotification');
    const regenerateBtn = document.getElementById('regenerateBtn');
    const regenerateIcon = document.getElementById('regenerateIcon');

    if (!apiKeyContainer || !copyNotification) {
        return;
    }

    let timeoutId;

    function showNotification(message, isError = false) {
        const notificationBox = copyNotification;
        const icon = notificationBox.querySelector('i');
        const text = notificationBox.querySelector('span');

        notificationBox.className = 'absolute right-0 top-0 mt-12 w-64 rounded-lg p-3 border';
        if (icon) {
            icon.className = 'mr-2 fas';
        }

        if (isError) {
            notificationBox.classList.add('bg-red-50', 'text-red-800', 'border-red-200');
            if (icon) {
                icon.classList.add('fa-exclamation-circle');
            }
        } else {
            notificationBox.classList.add('bg-green-50', 'text-green-800', 'border-green-200');
            if (icon) {
                icon.classList.add('fa-check-circle');
            }
        }

        if (text) {
            text.textContent = message;
        }
        notificationBox.classList.remove('hidden');
        notificationBox.classList.add('flex');

        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            notificationBox.classList.add('hidden');
            notificationBox.classList.remove('flex');
        }, 2000);
    }

    apiKeyContainer.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(apiKeyContainer.dataset.apiKey || '');
            showNotification('API key copied to clipboard!');
        } catch (error) {
            console.error('Failed to copy text: ', error);
            showNotification('Failed to copy API key!', true);
        }
    });

    apiKeyContainer.addEventListener('mouseleave', () => {
        apiKeyContainer.classList.add('blur-sm');
    });

    apiKeyContainer.addEventListener('mouseenter', () => {
        apiKeyContainer.classList.remove('blur-sm');
    });

    if (regenerateBtn && regenerateIcon) {
        regenerateBtn.addEventListener('click', async () => {
            regenerateBtn.disabled = true;
            regenerateIcon.classList.add('animate-spin');

            try {
                const response = await fetch('/api/key-regenerate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to regenerate key');
                }

                const data = await response.json();
                await new Promise((resolve) => setTimeout(resolve, 5000));

                apiKeyContainer.textContent = data.newKey;
                apiKeyContainer.dataset.apiKey = data.newKey;
                apiKeyContainer.title = data.newKey;

                showNotification('New API key generated!');
            } catch (error) {
                console.error('Error:', error);
                showNotification('Failed to regenerate API key!', true);
            } finally {
                regenerateBtn.disabled = false;
                regenerateIcon.classList.remove('animate-spin');
            }
        });
    }
});
