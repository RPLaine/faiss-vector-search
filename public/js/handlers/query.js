/**
 * Query Handler Module
 * Handles query execution and command processing
 */

import config from '../config.js';
import { appState } from '../state.js';
import { apiService } from '../services/api.js';
import { uiManager } from '../ui/manager.js';
import { displayResponse, showHelp } from '../ui/components.js';
import { createCollapsibleCard } from '../ui/utils/card-builder.js';

class QueryHandler {
    /**
     * Execute a query or command
     */
    async execute(query) {
        if (!query) return;

        // Handle special commands
        if (query.toLowerCase() === 'clear') {
            uiManager.clearContent();
            return;
        }

        if (query.toLowerCase() === 'help') {
            showHelp();
            return;
        }

        // Handle mode selection commands
        const lowerQuery = query.toLowerCase();
        if (lowerQuery === 'full' || lowerQuery === 'faiss' || lowerQuery === 'none') {
            uiManager.setMode(lowerQuery);
            return;
        }

        // Check if already processing
        if (appState.isProcessing()) {
            uiManager.appendOutput('System: Please wait for current query to complete', 'error');
            return;
        }

        // Get mode configuration
        const mode = uiManager.getSelectedMode();
        const modeConfig = config.query.modes[mode];

        // Set processing state
        appState.setState({ processing: true });
        uiManager.setLoading(true);

        try {
            // Send query
            const result = await apiService.sendQuery(query, modeConfig);
            
            // Small delay to ensure WebSocket messages are processed
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Display response
            displayResponse(result);

        } catch (error) {
            // Check if query was cancelled
            if (error.message.includes('cancel')) {
                // Cancellation is handled by WebSocket event, no need to show error
                console.log('Query cancelled, UI updated via WebSocket');
            } else {
                // Display error as a card
                this.displayErrorCard(error);
            }
        } finally {
            appState.setState({ processing: false });
            uiManager.setLoading(false);
        }
    }

    /**
     * Display error as a card
     */
    displayErrorCard(error) {
        const errorMessage = error.message || 'Unknown error occurred';
        
        // Extract HTTP status if present
        const httpMatch = errorMessage.match(/HTTP (\d+):/);
        const statusCode = httpMatch ? httpMatch[1] : null;
        
        // Determine error icon and title based on status code
        let icon = '❌';
        let title = 'Error';
        
        if (statusCode) {
            switch (statusCode) {
                case '400':
                    title = 'Bad Request';
                    break;
                case '404':
                    title = 'Not Found';
                    break;
                case '409':
                    icon = '⚠️';
                    title = 'Conflict';
                    break;
                case '500':
                    title = 'Server Error';
                    break;
                case '503':
                    title = 'Service Unavailable';
                    break;
                default:
                    title = `HTTP ${statusCode} Error`;
            }
        }
        
        const { element } = createCollapsibleCard({
            title: `${icon} ${title}`,
            className: 'error',
            content: `<pre class="error-message">${errorMessage}</pre>`,
            collapsed: false
        });
        
        uiManager.appendElement(element);
    }

    /**
     * Execute from input field
     */
    async executeFromInput() {
        const query = uiManager.getQueryInput();
        uiManager.clearQueryInput();
        await this.execute(query);
    }

    /**
     * Stop current query processing
     */
    stop() {
        const aborted = apiService.abort();
        if (aborted) {
            console.log('⏹️ Query cancellation requested');
            // State reset and UI feedback will be handled by WebSocket 'query_cancelled' event
        }
    }
}

// Export singleton instance
export const queryHandler = new QueryHandler();
export default queryHandler;
