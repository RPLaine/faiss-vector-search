/**
 * Main Application Entry Point
 * Initializes and coordinates all application modules
 */

import { appState } from './state.js';
import { apiService } from './services/api.js';
import { wsService } from './services/websocket.js';
import { domBuilder } from './ui/dom-builder.js';
import { uiManager } from './ui/manager.js';
import { eventManager } from './handlers/events.js';
import { wsMessageHandler } from './handlers/websocket-messages.js';

class App {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this.initialized) {
            console.warn('App already initialized');
            return;
        }

        try {
            console.log('Initializing RAG Terminal Application...');

            // Build DOM structure
            domBuilder.buildStructure();
            console.log('✓ DOM structure built');

            // Initialize UI
            uiManager.init();
            console.log('✓ UI Manager initialized');

            // Register event handlers
            eventManager.registerEvents();
            console.log('✓ Event handlers registered');

            // Initialize WebSocket message handlers
            wsMessageHandler.init();
            console.log('✓ WebSocket message handlers initialized');

            // Connect to WebSocket
            wsService.connect();
            console.log('✓ WebSocket connection initiated');

            // Subscribe to state changes
            this.subscribeToStateChanges();
            console.log('✓ State change subscriptions registered');

            // Load initial status
            await this.loadInitialStatus();
            console.log('✓ Initial status loaded');

            // Show welcome message
            uiManager.showWelcome();
            console.log('✓ Welcome message displayed');

            // Focus input
            uiManager.focusQueryInput();

            this.initialized = true;
            console.log('✅ Application initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize application:', error);
            uiManager.appendOutput('Error: Failed to initialize application', 'error');
            uiManager.appendOutput(error.message, 'error');
        }
    }

    /**
     * Load initial server status
     */
    async loadInitialStatus() {
        try {
            const status = await apiService.fetchStatus();
            uiManager.updateStatus(`${status.total_documents} docs | ${status.llm_model}`, true);
            appState.setState({ serverInfo: status });
        } catch (error) {
            console.error('Failed to load initial status:', error);
            uiManager.updateStatus('Cannot connect to server', false);
            uiManager.appendOutput('Error: Cannot connect to RAG API server', 'error');
            uiManager.appendOutput('Please ensure api_server.py is running on port 8000', 'info');
        }
    }

    /**
     * Subscribe to state changes
     */
    subscribeToStateChanges() {
        // Update UI when connection state changes
        appState.subscribe('connected', (connected) => {
            if (connected) {
                uiManager.appendOutput('System: Connected to RAG server', 'system');
            } else {
                uiManager.appendOutput('System: Disconnected from server', 'error');
            }
        });

        // Update UI when processing state changes
        appState.subscribe('processing', (processing) => {
            uiManager.setLoading(processing);
        });
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        wsService.disconnect();
        console.log('Application cleanup completed');
    }
}

// Create and initialize app when DOM is ready
const app = new App();

// Initialize on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    // DOM already loaded
    app.init();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => app.cleanup());

// Export for debugging
window.ragApp = app;

export default app;
