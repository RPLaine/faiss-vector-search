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
        const requestData = {
            query: query,
            ...modeConfig,
            template_name: config.query.defaultTemplate
        };
        
        console.log('📤 API Request:', {
            url: `${this.baseUrl}${config.api.endpoints.query}`,
            method: 'POST',
            body: requestData
        });
        
        try {
            const response = await fetch(`${this.baseUrl}${config.api.endpoints.query}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ API Error Response:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('📥 API Response:', data);
            return data;
        } catch (error) {
            console.error('❌ Query request failed:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const apiService = new APIService();
export default apiService;
