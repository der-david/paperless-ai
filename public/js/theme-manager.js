(function initThemeManager() {
    function getThemeToggle() {
        return document.getElementById('themeToggle');
    }

    function getInitialTheme() {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'dark' || storedTheme === 'light') {
            return storedTheme;
        }

        const legacyDarkMode = localStorage.getItem('darkMode');
        return legacyDarkMode === 'true' ? 'dark' : 'light';
    }

    function applyTheme(theme, toggle) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        localStorage.setItem('darkMode', theme === 'dark' ? 'true' : 'false');

        document.dispatchEvent(new CustomEvent('theme:change', { detail: { theme } }));

        if (!toggle) {
            return;
        }

        const icon = toggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const toggle = getThemeToggle();
        if (!toggle) {
            return;
        }

        let theme = getInitialTheme();
        applyTheme(theme, toggle);

        toggle.addEventListener('click', () => {
            theme = theme === 'dark' ? 'light' : 'dark';
            applyTheme(theme, toggle);
        });
    });
})();
