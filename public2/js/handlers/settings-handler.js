/**
 * Settings Handler
 * 
 * Handles user interactions with the settings modal.
 * Coordinates between UI elements, ModalManager, and SettingsController.
 */
export class SettingsHandler {
    constructor(settingsController, modalManager, loggerService) {
        this.settingsController = settingsController;
        this.modalManager = modalManager;
        this.logger = loggerService;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Settings button in header
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.handleOpenSettings());
        }

        // Modal close buttons
        const closeBtn = document.getElementById('closeSettingsBtn');
        const cancelBtn = document.getElementById('cancelSettingsBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.handleCloseSettings());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.handleCloseSettings());
        }

        // Modal overlay click to close
        const modal = document.getElementById('settingsModal');
        if (modal) {
            const overlay = modal.querySelector('.modal-overlay');
            if (overlay) {
                overlay.addEventListener('click', () => this.handleCloseSettings());
            }
        }

        // Tab switching
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.modalManager.switchSettingsTab(tabName);
            });
        });

        // Range input value displays
        const tempInput = document.getElementById('llmTemperature');
        const topPInput = document.getElementById('llmTopP');
        if (tempInput) {
            tempInput.addEventListener('input', (e) => {
                document.getElementById('llmTempValue').textContent = e.target.value;
            });
        }
        if (topPInput) {
            topPInput.addEventListener('input', (e) => {
                document.getElementById('llmTopPValue').textContent = e.target.value;
            });
        }

        // Add header button
        const addHeaderBtn = document.getElementById('addHeaderBtn');
        if (addHeaderBtn) {
            addHeaderBtn.addEventListener('click', () => {
                this.modalManager.addHeaderRow();
            });
        }

        // Save button
        const saveBtn = document.getElementById('saveSettingsBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.handleSaveSettings());
        }

        // Reset button
        const resetBtn = document.getElementById('resetSettingsBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.handleResetSettings());
        }
    }

    async handleOpenSettings() {
        try {
            this.logger.debug('Opening settings modal');
            
            // Load current settings
            const settings = await this.settingsController.loadSettings();
            
            // Populate modal
            this.modalManager.populateSettingsModal(settings);
            
            // Show modal
            this.modalManager.openSettingsModal();
            
        } catch (error) {
            this.logger.error('Failed to open settings:', error);
            alert(`Failed to load settings: ${error.message}`);
        }
    }

    handleCloseSettings() {
        this.modalManager.closeSettingsModal();
    }

    async handleSaveSettings() {
        try {
            this.logger.debug('Saving settings');
            
            // Get form data
            const { llm, prompts } = this.modalManager.getSettingsData();
            
            // Validate LLM config
            const llmErrors = this.settingsController.validateLLMConfig(llm);
            if (llmErrors.length > 0) {
                alert(`LLM Configuration errors:\n\n${llmErrors.join('\n')}`);
                return;
            }
            
            // Validate prompts
            const promptErrors = [];
            for (const [name, content] of Object.entries(prompts)) {
                const errors = this.settingsController.validatePrompt(name, content);
                if (errors.length > 0) {
                    promptErrors.push(`${name}: ${errors.join(', ')}`);
                }
            }
            if (promptErrors.length > 0) {
                alert(`Prompt validation errors:\n\n${promptErrors.join('\n')}`);
                return;
            }
            
            // Disable save button during save
            const saveBtn = document.getElementById('saveSettingsBtn');
            const originalText = saveBtn.textContent;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            try {
                // Save settings
                await this.settingsController.updateAllSettings(llm, prompts);
                
                // Close modal
                this.modalManager.closeSettingsModal();
                
                this.logger.info('Settings saved successfully');
                
            } finally {
                // Re-enable button
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
            }
            
        } catch (error) {
            this.logger.error('Failed to save settings:', error);
            alert(`Failed to save settings: ${error.message}`);
        }
    }

    async handleResetSettings() {
        if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
            return;
        }

        try {
            this.logger.debug('Resetting settings to defaults');
            
            // Disable reset button
            const resetBtn = document.getElementById('resetSettingsBtn');
            const originalText = resetBtn.textContent;
            resetBtn.disabled = true;
            resetBtn.textContent = 'Resetting...';
            
            try {
                // Reset settings
                const response = await this.settingsController.resetToDefaults();
                
                // Repopulate modal with defaults
                this.modalManager.populateSettingsModal(response.settings);
                
                this.logger.info('Settings reset to defaults');
                
            } finally {
                // Re-enable button
                resetBtn.disabled = false;
                resetBtn.textContent = originalText;
            }
            
        } catch (error) {
            this.logger.error('Failed to reset settings:', error);
            alert(`Failed to reset settings: ${error.message}`);
        }
    }
}
