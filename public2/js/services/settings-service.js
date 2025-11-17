/**
 * Settings Service
 * 
 * Handles API calls for system settings (LLM configuration and prompts).
 */
export class SettingsService {
    /**
     * Get all settings.
     * @returns {Promise<Object>} Settings object with llm and prompts
     */
    async getSettings() {
        const response = await fetch('/api/settings');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to get settings`);
        }
        return await response.json();
    }

    /**
     * Update settings (LLM config and/or prompts).
     * @param {Object} settings - Settings object
     * @param {Object} [settings.llm] - LLM configuration
     * @param {Object} [settings.prompts] - Prompt templates
     * @returns {Promise<Object>} Updated settings
     */
    async updateSettings(settings) {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || `HTTP ${response.status}: Failed to update settings`);
        }
        
        return await response.json();
    }

    /**
     * Reset all settings to defaults.
     * @returns {Promise<Object>} Default settings
     */
    async resetSettings() {
        const response = await fetch('/api/settings/reset', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to reset settings`);
        }
        
        return await response.json();
    }
}
