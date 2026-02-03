document.addEventListener('DOMContentLoaded', () => {
    const starCount = document.getElementById('starCount');
    if (!starCount) {
        return;
    }

    async function getStarsCount() {
        try {
            const response = await fetch('https://api.github.com/repos/clusterzx/paperless-ai');
            if (!response.ok) {
                throw new Error('Failed to fetch repo info');
            }

            const data = await response.json();
            starCount.textContent = data.stargazers_count.toLocaleString();
        } catch (error) {
            console.error('Failed to fetch stars count:', error);
        }
    }

    getStarsCount();
});
