/**
 * API Service Module
 * Handles HTTP requests to the backend API
 */

import config from '../config.js';

class APIService {
    constructor() {
        this.baseUrl = config.api.baseUrl;
        this.abortController = null;
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
        // Create new abort controller for this request
        this.abortController = new AbortController();
        
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
                body: JSON.stringify(requestData),
                signal: this.abortController.signal
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
            if (error.name === 'AbortError') {
                console.log('⏹️ Query aborted by user');
                throw new Error('Query cancelled by user');
            }
            console.error('❌ Query request failed:', error);
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    /**
     * Abort current query
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
            
            // Also notify the server to cancel processing
            fetch(`${this.baseUrl}/api/query/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            }).catch(error => {
                console.error('Failed to send cancellation to server:', error);
            });
            
            return true;
        }
        return false;
    }

    /**
     * Check if a query is in progress
     */
    isQueryInProgress() {
        return this.abortController !== null;
    }
}

// Export singleton instance
export const apiService = new APIService();
export default apiService;
