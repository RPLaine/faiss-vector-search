/**
 * Query Handler Module
 * Handles query execution and command processing
 */

import config from '../config.js';
import { appState } from '../state.js';
import { apiService } from '../services/api.js';
import { uiManager } from '../ui/manager.js';
import { displayResponse, showHelp } from '../ui/components.js';

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
            if (uiManager.setMode(lowerQuery)) {
                uiManager.appendOutput(`Mode set to: ${lowerQuery.toUpperCase()}`, 'success');
            } else {
                uiManager.appendOutput(`Failed to set mode: ${lowerQuery}`, 'error');
            }
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
            uiManager.appendOutput(`\n❌ Error: ${error.message}`, 'error');
            
            if (error.message.includes('fetch') || error.message.includes('Failed')) {
                uiManager.appendOutput('Tip: Ensure api_server.py is running on port 8000', 'info');
            }
        } finally {
            appState.setState({ processing: false });
            uiManager.setLoading(false);
        }
    }

    /**
     * Execute from input field
     */
    async executeFromInput() {
        const query = uiManager.getQueryInput();
        uiManager.clearQueryInput();
        await this.execute(query);
    }
}

// Export singleton instance
export const queryHandler = new QueryHandler();
export default queryHandler;
