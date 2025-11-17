/**
 * Settings Controller
 * 
 * Business logic for settings management.
 * Coordinates between SettingsService and UI components.
 */
export class SettingsController {
    constructor(settingsService, loggerService) {
        this.settingsService = settingsService;
        this.logger = loggerService;
        this.currentSettings = null;
    }

    /**
     * Load current settings from server.
     * @returns {Promise<Object>} Current settings
     */
    async loadSettings() {
        try {
            this.logger.debug('Loading settings from server');
            this.currentSettings = await this.settingsService.getSettings();
            this.logger.info('Settings loaded successfully');
            return this.currentSettings;
        } catch (error) {
            this.logger.error('Failed to load settings:', error);
            throw error;
        }
    }

    /**
     * Update LLM configuration.
     * @param {Object} llmConfig - LLM configuration object
     * @returns {Promise<Object>} Updated settings
     */
    async updateLLMConfig(llmConfig) {
        try {
            this.logger.debug('Updating LLM configuration');
            const response = await this.settingsService.updateSettings({ llm: llmConfig });
            this.currentSettings = response.settings;
            this.logger.info('LLM configuration updated successfully');
            return response;
        } catch (error) {
            this.logger.error('Failed to update LLM configuration:', error);
            throw error;
        }
    }

    /**
     * Update prompt templates.
     * @param {Object} prompts - Prompt templates object
     * @returns {Promise<Object>} Updated settings
     */
    async updatePrompts(prompts) {
        try {
            this.logger.debug('Updating prompt templates');
            const response = await this.settingsService.updateSettings({ prompts });
            this.currentSettings = response.settings;
            this.logger.info('Prompt templates updated successfully');
            return response;
        } catch (error) {
            this.logger.error('Failed to update prompts:', error);
            throw error;
        }
    }

    /**
     * Update both LLM config and prompts.
     * @param {Object} llmConfig - LLM configuration
     * @param {Object} prompts - Prompt templates
     * @param {Object} retrieval - Retrieval configuration
     * @returns {Promise<Object>} Updated settings
     */
    async updateAllSettings(llmConfig, prompts, retrieval = null) {
        try {
            this.logger.debug('Updating all settings');
            const payload = {
                llm: llmConfig,
                prompts: prompts
            };
            if (retrieval) {
                payload.retrieval = retrieval;
            }
            const response = await this.settingsService.updateSettings(payload);
            this.currentSettings = response.settings;
            this.logger.info('All settings updated successfully');
            return response;
        } catch (error) {
            this.logger.error('Failed to update settings:', error);
            throw error;
        }
    }

    /**
     * Reset all settings to defaults.
     * @returns {Promise<Object>} Default settings
     */
    async resetToDefaults() {
        try {
            this.logger.debug('Resetting settings to defaults');
            const response = await this.settingsService.resetSettings();
            this.currentSettings = response.settings;
            this.logger.info('Settings reset to defaults');
            return response;
        } catch (error) {
            this.logger.error('Failed to reset settings:', error);
            throw error;
        }
    }

    /**
     * Get current settings (from cache).
     * @returns {Object|null} Current settings or null if not loaded
     */
    getCurrentSettings() {
        return this.currentSettings;
    }

    /**
     * Validate LLM configuration.
     * @param {Object} config - LLM configuration to validate
     * @returns {Array<string>} Array of validation error messages (empty if valid)
     */
    validateLLMConfig(config) {
        const errors = [];

        if (!config.url || config.url.trim() === '') {
            errors.push('LLM URL is required');
        }

        if (!config.model || config.model.trim() === '') {
            errors.push('Model name is required');
        }

        if (!config.payload_type || !['message', 'completion'].includes(config.payload_type)) {
            errors.push('Payload type must be "message" or "completion"');
        }

        if (config.temperature !== undefined) {
            const temp = parseFloat(config.temperature);
            if (isNaN(temp) || temp < 0 || temp > 2) {
                errors.push('Temperature must be a number between 0 and 2');
            }
        }

        if (config.timeout !== undefined) {
            const timeout = parseInt(config.timeout);
            if (isNaN(timeout) || timeout <= 0) {
                errors.push('Timeout must be a positive number');
            }
        }

        if (config.max_tokens !== undefined) {
            const maxTokens = parseInt(config.max_tokens);
            if (isNaN(maxTokens) || maxTokens <= 0) {
                errors.push('Max tokens must be a positive integer');
            }
        }

        return errors;
    }

    /**
     * Validate prompt template.
     * @param {string} promptName - Name of the prompt
     * @param {string} content - Prompt content
     * @returns {Array<string>} Array of validation error messages (empty if valid)
     */
    validatePrompt(promptName, content) {
        const errors = [];

        // Required template variables for each prompt type
        const requirements = {
            'phase_0_planning': ['{agent_name}', '{agent_context}'],
            'task_execution': ['{agent_name}', '{goal}', '{task_name}', '{task_description}', '{expected_output}'],
            'task_validation': ['{task_name}', '{task_description}', '{expected_output}', '{actual_output}'],
            'hidden_context': []
        };

        const required = requirements[promptName] || [];
        const missing = required.filter(variable => !content.includes(variable));

        if (missing.length > 0) {
            errors.push(`Missing required template variables: ${missing.join(', ')}`);
        }

        return errors;
    }
    
    /**
     * Validate retrieval configuration.
     * @param {Object} config - Retrieval configuration to validate
     * @returns {Array<string>} Array of validation error messages (empty if valid)
     */
    validateRetrievalConfig(config) {
        const errors = [];

        if (config.enabled) {
            if (!config.embedding_model || config.embedding_model.trim() === '') {
                errors.push('Embedding model is required when retrieval is enabled');
            }

            if (config.hit_target !== undefined) {
                const hitTarget = parseInt(config.hit_target);
                if (isNaN(hitTarget) || hitTarget < 1 || hitTarget > 20) {
                    errors.push('Hit target must be a number between 1 and 20');
                }
            }

            if (config.top_k !== undefined) {
                const topK = parseInt(config.top_k);
                if (isNaN(topK) || topK < 1 || topK > 50) {
                    errors.push('Top K must be a number between 1 and 50');
                }
            }

            if (config.step !== undefined) {
                const step = parseFloat(config.step);
                if (isNaN(step) || step < 0.01 || step > 0.2) {
                    errors.push('Threshold step must be a number between 0.01 and 0.2');
                }
            }

            if (config.max_context_length !== undefined) {
                const maxContext = parseInt(config.max_context_length);
                if (isNaN(maxContext) || maxContext < 100 || maxContext > 20000) {
                    errors.push('Max context length must be a number between 100 and 20000');
                }
            }
        }

        return errors;
    }
}
