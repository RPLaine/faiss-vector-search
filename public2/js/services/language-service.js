/**
 * Language Service
 * 
 * Centralized language/translation management service.
 * Loads translation files and provides translation function with parameter interpolation.
 * Notifies registered callbacks when language changes to trigger UI re-renders.
 */

export class LanguageService {
    constructor() {
        this.currentLanguage = 'en';
        this.translations = {};
        this.changeCallbacks = [];
        this.missingKeys = new Set();
    }

    /**
     * Load translation file for specified language
     * @param {string} lang - Language code ('en' or 'fi')
     * @returns {Promise<void>}
     */
    async loadLanguage(lang) {
        try {
            const response = await fetch(`/translations/${lang}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load translation file: ${response.status} ${response.statusText}`);
            }
            
            this.translations = await response.json();
            this.currentLanguage = lang;
            this.missingKeys.clear(); // Clear missing keys when loading new language
            
            console.log(`Loaded ${Object.keys(this.translations).length} translations for '${lang}'`);
            
            // Notify all registered callbacks
            this._notifyChange();
        } catch (error) {
            console.error(`Error loading language '${lang}':`, error);
            throw error;
        }
    }

    /**
     * Translate a key with optional parameter interpolation
     * @param {string} key - Translation key (e.g., 'app.title', 'alert.delete_confirm')
     * @param {Object} params - Parameters for interpolation (e.g., {name: 'Agent 1'})
     * @returns {string} - Translated text or key if translation missing
     */
    t(key, params = {}) {
        let text = this.translations[key];
        
        // If translation not found, warn and return key
        if (text === undefined) {
            if (!this.missingKeys.has(key)) {
                console.warn(`Translation missing for key: '${key}' (language: ${this.currentLanguage})`);
                this.missingKeys.add(key);
            }
            return `[${key}]`; // Return key wrapped in brackets to make it visible
        }
        
        // Interpolate parameters: Replace {param} with values
        // Example: "Hello {name}" + {name: "World"} → "Hello World"
        Object.keys(params).forEach(paramKey => {
            const placeholder = `{${paramKey}}`;
            text = text.replace(new RegExp(placeholder, 'g'), params[paramKey]);
        });
        
        return text;
    }

    /**
     * Get current language code
     * @returns {string} - Current language code
     */
    getLanguage() {
        return this.currentLanguage;
    }

    /**
     * Register callback to be notified when language changes
     * @param {Function} callback - Callback function (receives language code)
     */
    onChange(callback) {
        if (typeof callback === 'function') {
            this.changeCallbacks.push(callback);
        }
    }

    /**
     * Notify all registered callbacks about language change
     * @private
     */
    _notifyChange() {
        this.changeCallbacks.forEach(callback => {
            try {
                callback(this.currentLanguage);
            } catch (error) {
                console.error('Error in language change callback:', error);
            }
        });
    }

    /**
     * Get list of missing translation keys (for debugging)
     * @returns {Array<string>}
     */
    getMissingKeys() {
        return Array.from(this.missingKeys);
    }
}
