function initCheckboxSync(root = document) {
    const hiddenInputs = root.querySelectorAll('[data-sync-checkbox]');
    hiddenInputs.forEach((hiddenInput) => {
        const checkboxId = hiddenInput.dataset.syncCheckbox;
        if (!checkboxId) return;
        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) return;
        const sync = () => {
            hiddenInput.value = checkbox.checked ? 'true' : 'false';
        };
        sync();
        checkbox.addEventListener('change', sync);
    });
}

function initToggleTargets(root = document) {
    const toggles = root.querySelectorAll('[data-toggle-target]');
    const applyToggle = (checkbox) => {
        const targetId = checkbox.dataset.toggleTarget;
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (!target) return;
        target.classList.toggle('hidden', !checkbox.checked);
    };

    toggles.forEach((checkbox) => {
        applyToggle(checkbox);
        checkbox.addEventListener('change', () => applyToggle(checkbox));
    });
}

function initPasswordToggles(root = document) {
    root.querySelectorAll('[data-input]').forEach((toggle) => {
        toggle.addEventListener('click', (event) => {
            const inputId = event.currentTarget.dataset.input;
            if (!inputId) return;
            const input = document.getElementById(inputId);
            if (!input) return;
            const icon = event.currentTarget.querySelector('i');

            if (input.type === 'password') {
                input.type = 'text';
                if (icon) {
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                }
            } else {
                input.type = 'password';
                if (icon) {
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            }
        });
    });
}

function initAiProviderSettings(options = {}) {
    const selectId = options.selectId || 'aiProvider';
    const select = document.getElementById(selectId);
    if (!select) return;

    const providers = {
        openai: {
            sectionId: 'openaiSettings',
            requiredIds: ['openaiApiKey']
        },
        ollama: {
            sectionId: 'ollamaSettings',
            requiredIds: ['ollamaApiUrl', 'ollamaModel']
        },
        custom: {
            sectionId: 'customSettings',
            requiredIds: ['customBaseUrl', 'customApiKey', 'customModel']
        },
        azure: {
            sectionId: 'azureSettings',
            requiredIds: ['azureApiKey', 'azureEndpoint', 'azureDeploymentName', 'azureApiVersion']
        }
    };

    const sectionIds = Object.values(providers).map((provider) => provider.sectionId);
    const allRequiredIds = Object.values(providers).flatMap((provider) => provider.requiredIds);

    const applyProvider = () => {
        sectionIds.forEach((sectionId) => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('hidden');
            }
        });

        allRequiredIds.forEach((fieldId) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.required = false;
            }
        });

        const provider = providers[select.value];
        if (!provider) return;

        const activeSection = document.getElementById(provider.sectionId);
        if (activeSection) {
            activeSection.classList.remove('hidden');
        }

        provider.requiredIds.forEach((fieldId) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.required = true;
            }
        });
    };

    applyProvider();
    select.addEventListener('change', applyProvider);
}
