/**
 * Settings Handler
 * 
 * Handles user interactions with the settings modal.
 * Coordinates between UI elements, ModalManager, and SettingsController.
 */
export class SettingsHandler {
    constructor(settingsController, modalManager, loggerService, languageService = null) {
        this.settingsController = settingsController;
        this.modalManager = modalManager;
        this.logger = loggerService;
        this.lang = languageService;
        
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
        const thresholdStepInput = document.getElementById('retrievalThresholdStep');
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
        if (thresholdStepInput) {
            thresholdStepInput.addEventListener('input', (e) => {
                document.getElementById('retrievalThresholdStepValue').textContent = e.target.value;
            });
        }
        
        // Retrieval enabled toggle
        const retrievalEnabledCheckbox = document.getElementById('retrievalEnabled');
        if (retrievalEnabledCheckbox) {
            retrievalEnabledCheckbox.addEventListener('change', () => {
                this.modalManager.toggleRetrievalSettings();
            });
        }
        
        // Rebuild index button
        const rebuildIndexBtn = document.getElementById('rebuildIndexBtn');
        if (rebuildIndexBtn) {
            rebuildIndexBtn.addEventListener('click', () => this.handleRebuildIndex());
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
        
        // Language selector
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.addEventListener('change', () => this.handleLanguageChange());
        }
    }

    async handleOpenSettings() {
        try {
            this.logger.debug('Opening settings modal');
            
            // Load current settings
            const settings = await this.settingsController.loadSettings();
            
            // Populate modal
            this.modalManager.populateSettingsModal(settings);
            
            // Populate language selector
            const languageSelect = document.getElementById('languageSelect');
            if (languageSelect && settings.language) {
                languageSelect.value = settings.language;
            }
            
            // Load retrieval stats
            await this.modalManager.loadRetrievalStats();
            
            // Show modal
            this.modalManager.openSettingsModal();
            
        } catch (error) {
            this.logger.error('Failed to open settings:', error);
            const message = this.lang ? this.lang.t('alert.load_settings_failed', { error: error.message }) : `Failed to load settings: ${error.message}`;
            alert(message);
        }
    }

    handleCloseSettings() {
        this.modalManager.closeSettingsModal();
    }
    
    async handleLanguageChange() {
        try {
            const languageSelect = document.getElementById('languageSelect');
            const language = languageSelect.value;
            
            this.logger.debug(`Changing language to: ${language}`);
            
            // Save language to backend
            const response = await fetch('/api/language', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to change language');
            }
            
            // Language change will be broadcast via WebSocket and handled by websocket-event-handler
            this.logger.info(`Language changed to: ${language}`);
            
        } catch (error) {
            this.logger.error('Failed to change language:', error);
            const message = this.lang ? this.lang.t('alert.language_change_failed', { error: error.message }) : `Failed to change language: ${error.message}`;
            alert(message);
        }
    }

    async handleSaveSettings() {
        try {
            this.logger.debug('Saving settings');
            
            // Get form data
            const { llm, prompts, retrieval } = this.modalManager.getSettingsData();
            
            // Validate LLM config
            const llmErrors = this.settingsController.validateLLMConfig(llm);
            if (llmErrors.length > 0) {
                const message = this.lang ? this.lang.t('alert.llm_config_errors', { errors: llmErrors.join('\n') }) : `LLM Configuration errors:\n\n${llmErrors.join('\n')}`;
                alert(message);
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
                const message = this.lang ? this.lang.t('alert.prompt_validation_errors', { errors: promptErrors.join('\n') }) : `Prompt validation errors:\n\n${promptErrors.join('\n')}`;
                alert(message);
                return;
            }
            
            // Validate retrieval config
            const retrievalErrors = this.settingsController.validateRetrievalConfig(retrieval);
            if (retrievalErrors.length > 0) {
                const message = this.lang ? this.lang.t('alert.llm_config_errors', { errors: retrievalErrors.join('\n') }) : `Retrieval Configuration errors:\n\n${retrievalErrors.join('\n')}`;
                alert(message);
                return;
            }
            
            // Disable save button during save
            const saveBtn = document.getElementById('saveSettingsBtn');
            const originalText = saveBtn.textContent;
            const savingText = this.lang ? this.lang.t('modal.settings.button.saving') : 'Saving...';
            saveBtn.disabled = true;
            saveBtn.textContent = savingText;
            
            try {
                // Save settings
                await this.settingsController.updateAllSettings(llm, prompts, retrieval);
                
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
            const message = this.lang ? this.lang.t('alert.save_settings_failed', { error: error.message }) : `Failed to save settings: ${error.message}`;
            alert(message);
        }
    }
    
    async handleRebuildIndex() {
        const confirmMessage = this.lang ? this.lang.t('confirm.rebuild_index') : 'Rebuild FAISS index from all .txt files in data2/?\n\nThis may take a few moments.';
        if (!confirm(confirmMessage)) {
            return;
        }
        
        try {
            const rebuildBtn = document.getElementById('rebuildIndexBtn');
            const originalText = rebuildBtn.textContent;
            const rebuildingText = this.lang ? this.lang.t('modal.settings.button.rebuilding') : 'Rebuilding...';
            rebuildBtn.disabled = true;
            rebuildBtn.textContent = rebuildingText;
            
            try {
                // Get all .txt files from data2/
                const response = await fetch('/api/retrieval/index/build', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_paths: [] // Empty means "scan data2/ directory"
                    })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to rebuild index');
                }
                
                const result = await response.json();
                
                // Reload stats
                await this.modalManager.loadRetrievalStats();
                
                const successMessage = this.lang ? this.lang.t('alert.rebuild_index_success', { message: result.message || 'Index is ready for use.' }) : `Index rebuilt successfully!\n\n${result.message || 'Index is ready for use.'}`;
                alert(successMessage);
                
            } finally {
                rebuildBtn.disabled = false;
                rebuildBtn.textContent = originalText;
            }
            
        } catch (error) {
            this.logger.error('Failed to rebuild index:', error);
            const message = this.lang ? this.lang.t('alert.rebuild_index_failed', { error: error.message }) : `Failed to rebuild index: ${error.message}`;
            alert(message);
        }
    }

    async handleResetSettings() {
        const confirmMessage = this.lang ? this.lang.t('confirm.reset_settings') : 'Are you sure you want to reset all settings to defaults?\n\nThis will reset:\n- LLM configuration\n- All prompt templates\n- Retrieval settings';
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            this.logger.debug('Resetting settings to defaults');
            
            // Disable reset button
            const resetBtn = document.getElementById('resetSettingsBtn');
            const originalText = resetBtn.textContent;
            const resettingText = this.lang ? this.lang.t('modal.settings.button.resetting') : 'Resetting...';
            resetBtn.disabled = true;
            resetBtn.textContent = resettingText;
            
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
            const message = this.lang ? this.lang.t('alert.reset_settings_failed', { error: error.message }) : `Failed to reset settings: ${error.message}`;
            alert(message);
        }
    }
}
