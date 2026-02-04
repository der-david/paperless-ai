//settings.js
class FormManager {
    constructor() {
        this.form = document.getElementById('setupForm');
        this.aiProvider = document.getElementById('aiProvider');
        this.tokenLimit = document.getElementById('aiTokenLimit');
        this.responseTokens = document.getElementById('aiResponseTokens');
        this.showTags = document.getElementById('filterDocuments');
        this.aiProcessedTag = document.getElementById('addAiProcessedTag');
        this.usePromptTags = document.getElementById('aiUsePromptTags');
        this.systemPrompt = document.getElementById('aiSystemPrompt');
        this.systemPromptBtn = document.getElementById('systemPromptBtn');
        this.enableAutomaticProcessing = document.getElementById('enableAutomaticProcessing');
        this.initialize();
    }

    initialize() {
        this.toggleProviderSettings();
        this.toggleTagsInput();
        this.handleEnableAutomaticProcessing();
        this.syncCheckboxHidden('aiUseExistingData', 'aiUseExistingDataValue');
        this.syncCheckboxHidden('filterDocuments', 'filterDocumentsValue');
        this.syncCheckboxHidden('addAiProcessedTag', 'addAiProcessedTagValue');
        this.syncCheckboxHidden('aiUsePromptTags', 'aiUsePromptTagsValue');

        this.aiProvider.addEventListener('change', () => this.toggleProviderSettings());
        this.tokenLimit.addEventListener('input', () => this.validateTokenLimit());
        this.responseTokens.addEventListener('input', () => this.validateResponseTokens());
        this.showTags.addEventListener('change', () => this.toggleTagsInput());
        this.aiProcessedTag.addEventListener('change', () => this.toggleAiTagInput());
        this.usePromptTags.addEventListener('change', () => this.togglePromptTagsInput());
        if (this.enableAutomaticProcessing) {
            this.enableAutomaticProcessing.addEventListener('change', () => this.handleEnableAutomaticProcessing());
        }

        this.initializePasswordToggles();

        if (this.usePromptTags.checked) {
            this.disablePromptElements();
        }

        this.toggleAiTagInput();
        this.togglePromptTagsInput();
    }

    validateTokenLimit() {
        const value = parseInt(this.tokenLimit.value, 10);
        if (isNaN(value) || value < 1) {
            this.tokenLimit.setCustomValidity('Token Limit must be a positive integer.');
        } else {
            this.tokenLimit.setCustomValidity('');
        }
    }

    validateResponseTokens() {
        const value = parseInt(this.responseTokens.value, 10);
        if (isNaN(value) || value < 0) {
            this.responseTokens.setCustomValidity('Response tokens must be a non-negative integer.');
        } else {
            this.responseTokens.setCustomValidity('');
        }
    }

    handleEnableAutomaticProcessing() {
        if (!this.enableAutomaticProcessing) {
            return;
        }

        let hiddenInput = document.getElementById('enableAutomaticProcessingValue');
        if (!hiddenInput) {
            hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.id = 'enableAutomaticProcessingValue';
            hiddenInput.name = 'enableAutomaticProcessing';
            this.form.appendChild(hiddenInput);
        }

        hiddenInput.value = this.enableAutomaticProcessing.checked ? 'true' : 'false';

        const scanIntervalSection = document.getElementById('scanIntervalSection');
        if (scanIntervalSection) {
            scanIntervalSection.classList.toggle('hidden', !this.enableAutomaticProcessing.checked);
        }
    }

    toggleProviderSettings() {
        const provider = this.aiProvider.value;
        const openaiSettings = document.getElementById('openaiSettings');
        const ollamaSettings = document.getElementById('ollamaSettings');
        const customSettings = document.getElementById('customSettings');
        const azureSettings = document.getElementById('azureSettings');

        // Get all provider-specific fields
        const openaiKey = document.getElementById('openaiApiKey');
        const ollamaUrl = document.getElementById('ollamaApiUrl');
        const ollamaModel = document.getElementById('ollamaModel');
        const customBaseUrl = document.getElementById('customBaseUrl');
        const customApiKey = document.getElementById('customApiKey');
        const customModel = document.getElementById('customModel');
        const azureApiKey = document.getElementById('azureApiKey');
        const azureEndpoint = document.getElementById('azureEndpoint');
        const azureDeploymentName = document.getElementById('azureDeploymentName');
        const azureApiVersion = document.getElementById('azureApiVersion');

        // Restriction settings
        const restrictToExistingTags = document.getElementById('restrictToExistingTags');
        const restrictToExistingCorrespondents = document.getElementById('restrictToExistingCorrespondents');

        // External API settings
        const externalApiEnabled = document.getElementById('externalApiEnabled');
        const externalApiSettings = document.getElementById('externalApiSettings');
        const externalApiUrl = document.getElementById('externalApiUrl');
        const externalApiMethod = document.getElementById('externalApiMethod');
        const externalApiHeaders = document.getElementById('externalApiHeaders');
        const externalApiBody = document.getElementById('externalApiBody');
        const externalApiTimeout = document.getElementById('externalApiTimeout');
        const externalApiTransformationTemplate = document.getElementById('externalApiTransformationTemplate');


        // Hide all settings sections first
        openaiSettings.classList.add('hidden');
        ollamaSettings.classList.add('hidden');
        customSettings.classList.add('hidden');
        azureSettings.classList.add('hidden');

        // Reset all required fields
        openaiKey.required = false;
        ollamaUrl.required = false;
        ollamaModel.required = false;
        customBaseUrl.required = false;
        customApiKey.required = false;
        customModel.required = false;
        azureApiKey.required = false;
        azureEndpoint.required = false;
        azureDeploymentName.required = false;
        azureApiVersion.required = false;

        // Show and set required fields based on selected provider
        switch (provider) {
            case 'openai':
                openaiSettings.classList.remove('hidden');
                openaiKey.required = true;
                break;
            case 'ollama':
                ollamaSettings.classList.remove('hidden');
                ollamaUrl.required = true;
                ollamaModel.required = true;
                break;
            case 'custom':
                customSettings.classList.remove('hidden');
                customBaseUrl.required = true;
                customApiKey.required = true;
                customModel.required = true;
                break;
            case 'azure':
                azureSettings.classList.remove('hidden');
                azureApiKey.required = true;
                azureEndpoint.required = true;
                azureDeploymentName.required = true;
                azureApiVersion.required = true;
                break;
        }
    }

    // Rest of the class methods remain the same
    toggleTagsInput() {
        const showTags = this.showTags.checked;
        const tagsInputSection = document.getElementById('tagsInputSection');

        if (showTags) {
            tagsInputSection.classList.remove('hidden');
        } else {
            document.getElementById('filterIncludeTags').value = '';
            tagsInputSection.classList.add('hidden');
        }
    }

    toggleAiTagInput() {
        const showAiTag = this.aiProcessedTag.checked;
        const aiTagNameSection = document.getElementById('aiTagNameSection');

        if (showAiTag) {
            aiTagNameSection.classList.remove('hidden');
        } else {
            aiTagNameSection.classList.add('hidden');
        }
    }

    togglePromptTagsInput() {
        const usePromptTags = this.usePromptTags.checked;
        const promptTagsSection = document.getElementById('promptTagsSection');

        if (usePromptTags) {
            promptTagsSection.classList.remove('hidden');
            this.disablePromptElements();
        } else {
            promptTagsSection.classList.add('hidden');
            this.enablePromptElements();
        }
    }

    syncCheckboxHidden(checkboxId, hiddenId) {
        const checkbox = document.getElementById(checkboxId);
        const hiddenInput = document.getElementById(hiddenId);
        if (!checkbox || !hiddenInput) return;
        const sync = () => {
            hiddenInput.value = checkbox.checked ? 'true' : 'false';
        };
        sync();
        checkbox.addEventListener('change', sync);
    }

    disablePromptElements() {
        this.systemPrompt.disabled = true;
        this.systemPromptBtn.disabled = true;
        this.systemPrompt.classList.add('opacity-50', 'cursor-not-allowed');
        this.systemPromptBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    enablePromptElements() {
        this.systemPrompt.disabled = false;
        this.systemPromptBtn.disabled = false;
        this.systemPrompt.classList.remove('opacity-50', 'cursor-not-allowed');
        this.systemPromptBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    initializePasswordToggles() {
        document.querySelectorAll('[data-input]').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const inputId = e.currentTarget.dataset.input;
                this.togglePassword(inputId);
            });
        });
    }

    togglePassword(inputId) {
        const input = document.getElementById(inputId);
        const icon = input.nextElementSibling.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

// Tags Management
class TagsManager {
    constructor(
        tagInputId,
        tagsContainerId,
        tagsHiddenInputId
    ) {
        this.tagInput = document.getElementById(tagInputId); //'tagInput'
        this.tagsContainer = document.getElementById(tagsContainerId); // tagsContainer
        this.tagsHiddenInput = document.getElementById(tagsHiddenInputId); // tagsHiddenInput
        this.addTagButton = this.tagInput?.closest('.space-y-2')?.querySelector('button');

        if (this.tagInput && this.tagsContainer && this.addTagButton) {
            this.initialize();

            // Initialize existing tags with proper event handlers
            this.initializeExistingTags();
        }
    }

    initialize() {
        if (this.addTagButton) {
            this.addTagButton.addEventListener('click', () => this.addTag());
        }

        if (this.tagInput) {
            this.tagInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addTag();
                }
            });
        }
    }

    initializeExistingTags() {
        const existingTags = this.tagsContainer.querySelectorAll('.tag-chip');
        existingTags.forEach(tagElement => {
            const removeButton = tagElement.querySelector('button');
            if (removeButton) {
                this.initializeTagRemoval(removeButton);
            }
        });
    }

    initializeTagRemoval(button) {
        button.addEventListener('click', async () => {
            const result = await Swal.fire({
                title: 'Remove Tag',
                text: 'Are you sure you want to remove this tag?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Yes, remove it',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                customClass: {
                    container: 'my-swal'
                }
            });

            if (result.isConfirmed) {
                const tagElement = button.closest('.tag-chip');
                if (tagElement) {
                    tagElement.remove();
                    this.updateHiddenInput();
                }
            }
        });
    }

    async addTag() {
        if (!this.tagInput) return;

        const tagText = this.tagInput.value.trim();
        const specialChars = /[,;:\n\r\\/]/;

        if (specialChars.test(tagText)) {
            await Swal.fire({
                title: 'Invalid Characters',
                text: 'Tags cannot contain commas, semi-colons, colons, or line breaks.',
                icon: 'warning',
                confirmButtonText: 'OK',
                confirmButtonColor: '#3085d6',
                customClass: {
                    container: 'my-swal'
                }
            });
            return;
        }

        if (tagText) {
            const tag = this.createTagElement(tagText);
            this.tagsContainer.appendChild(tag);
            this.updateHiddenInput();
            this.tagInput.value = '';
        }
    }

    createTagElement(text) {
        const tag = document.createElement('div');
        tag.className = 'bg-blue-100 text-blue-800 px-3 py-1 rounded-full flex items-center gap-2 animate-fade-in tag-chip';

        const tagText = document.createElement('span');
        tagText.textContent = text;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'hover:text-blue-600';
        removeButton.innerHTML = '<i class="fas fa-times"></i>';

        this.initializeTagRemoval(removeButton);

        tag.appendChild(tagText);
        tag.appendChild(removeButton);

        return tag;
    }

    updateHiddenInput() {
        if (!this.tagsHiddenInput || !this.tagsContainer) return;

        const tags = Array.from(this.tagsContainer.querySelectorAll('.bg-blue-100 span'))
            .map(span => span.textContent.trim())
            .filter(tag => tag); // Remove any empty tags

        this.tagsHiddenInput.value = tags.join(',');
    }
}

// Prompt Management
class PromptManager {
    constructor() {
        this.systemPrompt = document.getElementById('aiSystemPrompt');
        this.exampleButton = document.getElementById('systemPromptBtn');
        this.initialize();
    }

    initialize() {
        this.exampleButton.addEventListener('click', () => this.prefillExample());
    }

    prefillExample() {
        const examplePrompt = `You are a personalized document analyzer. Your task is to analyze documents and extract relevant information.

Analyze the document content and extract the following information into a structured JSON object:

1. title: Create a concise, meaningful title for the document
2. correspondent: Identify the sender/institution but do not include addresses
3. tags: Select up to 4 relevant thematic tags
4. document_date: Extract the document date (format: YYYY-MM-DD)
5. document_type: Determine a precise type that classifies the document (e.g. Invoice, Contract, Employer, Information and so on)
6. language: Determine the document language (e.g. "de" or "en")

Important rules for the analysis:

For tags:
- FIRST check the existing tags before suggesting new ones
- Use only relevant categories
- Maximum 4 tags per document, less if sufficient (at least 1)
- Avoid generic or too specific tags
- Use only the most important information for tag creation
- The output language is the one used in the document! IMPORTANT!

For the title:
- Short and concise, NO ADDRESSES
- Contains the most important identification features
- For invoices/orders, mention invoice/order number if available
- The output language is the one used in the document! IMPORTANT!

For the correspondent:
- Identify the sender or institution
  When generating the correspondent, always create the shortest possible form of the company name (e.g. "Amazon" instead of "Amazon EU SARL, German branch")

For the document date:
- Extract the date of the document
- Use the format YYYY-MM-DD
- If multiple dates are present, use the most relevant one

For the language:
- Determine the document language
- Use language codes like "de" for German or "en" for English
- If the language is not clear, use "und" as a placeholder`;

        this.systemPrompt.value = examplePrompt;
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const formManager = new FormManager();
    const tagsManager = new TagsManager('tagInput','tagsContainer','filterIncludeTags');
    const excludeTagsManager = new TagsManager('excludeTagInput','excludeTagsContainer','filterExcludeTags');
    const promptTagsManager = new TagsManager('promptTagInput','promptTagsContainer','aiPromptTags');
    const promptManager = new PromptManager();

    // Initialize textarea newlines
    const systemPromptTextarea = document.getElementById('aiSystemPrompt');
    systemPromptTextarea.value = systemPromptTextarea.value.replace(/\\n/g, '\n');
});

// Form Submission Handler
document.addEventListener('DOMContentLoaded', (event) => {
    const systemPromptTextarea = document.getElementById('aiSystemPrompt');
    systemPromptTextarea.value = systemPromptTextarea.value.replace(/\\n/g, '\n');

    // Form submission handler
    const setupForm = document.getElementById('setupForm');
    setupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = setupForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {

            const formData = new FormData(setupForm);
            //remove from formData.aiSystemPrompt all ` chars
            /*
            if (formData.get('aiSystemPrompt')) {
                formData.set('aiSystemPrompt', formData.get('aiSystemPrompt').replace(/`/g, ''));
            }
            */
            const response = await fetch('/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(Object.fromEntries(formData))
            });

            const result = await response.json();

            if (result.success) {
                await Swal.fire({
                    icon: 'success',
                    title: 'Success!',
                    text: result.message,
                    timer: 2000,
                    showConfirmButton: false
                });

                if (result.restart) {
                    let countdown = 5;
                    const alert = Swal.fire({
                        title: 'Restarting...',
                        text: `Application will restart in ${countdown} seconds`,
                        icon: 'info',
                        showConfirmButton: false,
                        allowOutsideClick: false
                    });

                    const countdownInterval = setInterval(() => {
                        countdown--;
                        if (countdown < 0) {
                            clearInterval(countdownInterval);
                            window.location.reload();
                        } else {
                            Swal.update({
                                text: `Application will restart in ${countdown} seconds`
                            });
                        }
                    }, 1000);
                }
            } else {
                throw new Error(result.error || 'An unknown error occurred');
            }
        } catch (error) {
            await Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message
            });
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
});

class URLValidator {
    constructor() {
        this.urlInput = document.getElementById('paperlessApiUrl');
        this.isShowingError = false;
        this.initialize();
    }

    initialize() {
        this.urlInput.addEventListener('blur', () => this.validateURL());
    }

    async validateURL() {
        if (this.isShowingError) return;

        try {
            if (!this.urlInput.value) return;
            const url = new URL(this.urlInput.value);

            if (!['http:', 'https:'].includes(url.protocol)) {
                throw new Error('The URL must start with http:// or https://');
            }

            // Prüfe auf zusätzliche Pfade oder Parameter
            if (url.pathname !== '/' || url.search || url.hash) {
                throw new Error('The URL must not contain any paths, parameters, or trailing slashes after the port.');
            }

            // Automatische Formatierung der URL
            const formattedUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
            if (this.urlInput.value !== formattedUrl) {
                this.urlInput.value = formattedUrl;
            }

        } catch (error) {
            this.isShowingError = true;
            const result = await Swal.fire({
                icon: 'warning',
                title: 'Invalid URL',
                text: error.message,
                showCancelButton: true,
                confirmButtonText: 'Confirm anyway',
                cancelButtonText: 'Fix it',
                customClass: {
                    container: 'z-50'
                }
            });

            this.isShowingError = false;
            if (result.isDismissed) {
                this.sanitizeURL();
            }
        }
    }

    sanitizeURL() {
        try {
            if (!this.urlInput.value) return;
            const url = new URL(this.urlInput.value);
            this.urlInput.value = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Invalid URL',
                text: 'Please enter a valid URL. ( http[s]://your-paperless-instance:8000 )',
                customClass: {
                    container: 'z-50'
                }
            });
        }
    }
}

// Tooltip System
class TooltipManager {
    constructor() {
        this.initialize();
    }

    getTooltipPlacement() {
        return window.innerWidth < 768 ? 'bottom' : 'right';
    }

    initialize() {
        this.tooltipInstance = tippy('#urlHelp', {
            content: this.getTooltipContent(),
            allowHTML: true,
            placement: this.getTooltipPlacement(),
            interactive: true,
            theme: 'custom',
            maxWidth: 450,
            touch: 'hold',
            trigger: 'mouseenter click',
            zIndex: 40,
        });

        window.addEventListener('resize', () => {
            this.tooltipInstance[0].setProps({ placement: this.getTooltipPlacement() });
        });
    }

    getTooltipContent() {
        return `
            <div class="p-4 space-y-4">
                <h3 class="text-lg font-bold">API URL Configuration</h3>

                <div class="space-y-2">
                    <p>The URL should follow this format:</p>
                    <code class="block p-2 bg-gray-100 dark:bg-gray-800 rounded">
                        http://your-host:8000
                    </code>
                </div>

                <div class="space-y-2">
                    <p class="font-semibold">Important Notes:</p>
                    <ul class="list-disc pl-4 space-y-1">
                        <li>Must start with <u>http://</u> or <u>https://</u></li>
                        <li>Contains <strong>host/IP</strong> and optionally a <strong>port</strong></li>
                        <li>No additional paths or parameters</li>
                    </ul>
                </div>

                <div class="space-y-2">
                    <p class="font-semibold">Docker Network Configuration:</p>
                    <ul class="list-disc pl-4 space-y-1">
                        <li>Using <strong>localhost</strong> or <strong>127.0.0.1</strong> won't work in Docker bridge mode</li>
                        <li>Use your machine's local IP (e.g., <code>192.168.1.x</code>) instead</li>
                        <li>Or use the Docker container name if both services are in the same network</li>
                    </ul>
                </div>

                <div class="space-y-2">
                    <p class="font-semibold">Examples:</p>
                    <ul class="list-none space-y-1">
                        <li>🔸 Local IP: <code>http://192.168.1.100:8000</code></li>
                        <li>🔸 Container: <code>http://paperless-ngx:8000</code></li>
                        <li>🔸 Remote: <code>http://paperless.domain.com</code></li>
                    </ul>
                </div>

                <p class="text-sm italic mt-4">The /api endpoint will be added automatically.</p>
            </div>
        `;
    }
}

// Initialize all components
document.addEventListener('DOMContentLoaded', () => {
    const urlValidator = new URLValidator();
    const tooltipManager = new TooltipManager();
});


// Custom Fields Management
document.addEventListener('DOMContentLoaded', function() {
    // External API settings toggle
    const externalApiEnabled = document.getElementById('externalApiEnabled');
    const externalApiSettings = document.getElementById('externalApiSettings');

    if (externalApiEnabled && externalApiSettings) {
        externalApiEnabled.addEventListener('change', function() {
            if (this.checked) {
                externalApiSettings.classList.remove('hidden');
            } else {
                externalApiSettings.classList.add('hidden');
            }
        });
    }

    const fieldsList = document.getElementById('customFieldsList');
    const customFieldsJson = document.getElementById('aiCustomFields');

    const syncCustomFieldsJson = () => {
        if (!fieldsList || !customFieldsJson) return;

        const items = Array.from(fieldsList.querySelectorAll('.custom-field-item'));
        const fields = items.map((item) => {
            const name = item.dataset.fieldName || '';
            const dataType = item.dataset.fieldType || '';
            let extraData = {};
            try {
                extraData = item.dataset.fieldExtra ? JSON.parse(item.dataset.fieldExtra) : {};
            } catch (error) {
                extraData = {};
            }

            const descriptionInput = item.querySelector('.custom-field-description');
            const toggleInput = item.querySelector('.custom-field-toggle');

            return {
                name,
                data_type: dataType,
                enabled: Boolean(toggleInput?.checked),
                description: descriptionInput ? descriptionInput.value.trim() : '',
                extra_data: extraData
            };
        }).filter((field) => field.name && field.data_type && field.data_type !== 'documentlink');

        customFieldsJson.value = JSON.stringify({ custom_fields: fields });
    };

    if (fieldsList && customFieldsJson) {
        fieldsList.addEventListener('input', (event) => {
            if (event.target.closest('.custom-field-description')) {
                syncCustomFieldsJson();
            }
        });

        fieldsList.addEventListener('change', (event) => {
            if (event.target.closest('.custom-field-toggle')) {
                syncCustomFieldsJson();
            }
        });

        syncCustomFieldsJson();
    }

    // Observer for theme changes
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'data-theme') {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                updateThemeClasses(isDark);
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
});

function updateThemeClasses(isDark) {
    // Update custom field items
    const items = document.querySelectorAll('.custom-field-item');
    items.forEach(item => {
        // Background and border
        item.classList.toggle('bg-white', !isDark);
        item.classList.toggle('bg-gray-800', isDark);
        item.classList.toggle('border-gray-200', !isDark);
        item.classList.toggle('border-gray-700', isDark);

        // Text colors
        const title = item.querySelector('p.font-medium');
        if (title) {
            title.classList.toggle('text-gray-900', !isDark);
            title.classList.toggle('text-gray-100', isDark);
        }

        const subtitle = item.querySelector('p.text-sm');
        if (subtitle) {
            subtitle.classList.toggle('text-gray-500', !isDark);
            subtitle.classList.toggle('text-gray-400', isDark);
        }
    });

    // Update form inputs and selects
    const inputs = document.querySelectorAll('input:not([type="hidden"]), select');
    inputs.forEach(input => {
        input.classList.toggle('bg-white', !isDark);
        input.classList.toggle('bg-gray-800', isDark);
        input.classList.toggle('text-gray-900', !isDark);
        input.classList.toggle('text-gray-100', isDark);
        input.classList.toggle('border-gray-300', !isDark);
        input.classList.toggle('border-gray-600', isDark);
    });
}
