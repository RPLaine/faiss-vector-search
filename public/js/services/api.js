/**
 * API Service Module
 * Handles HTTP requests to the backend API
 */

import config from '../config.js';

class APIService {
    constructor() {
        this.baseUrl = config.api.baseUrl;
    }

    /**
     * Fetch server status
     */
    async fetchStatus() {
        try {
            const response = await fetch(`${this.baseUrl}${config.api.endpoints.status}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch status:', error);
            throw error;
        }
    }

    /**
     * Send query to the API
     */
    async sendQuery(query, modeConfig) {
        try {
            const response = await fetch(`${this.baseUrl}${config.api.endpoints.query}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    ...modeConfig,
                    template_name: config.query.defaultTemplate
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Query request failed:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const apiService = new APIService();
export default apiService;
