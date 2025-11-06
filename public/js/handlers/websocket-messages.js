/**
 * WebSocket Message Handler Module
 * Routes WebSocket messages to appropriate display components
 */

import { appState } from '../state.js';
import { wsService } from '../services/websocket.js';
import { uiManager } from '../ui/manager.js';
import {
    displayRetrievalStart,
    displayRetrievalComplete,
    displayLLMRequest,
    displayLLMResponse,
    displayEvaluationStart,
    displayEvaluationComplete,
    displayTemperatureTest,
    displayImprovementIteration
} from '../ui/websocket-components.js';

class WebSocketMessageHandler {
    /**
     * Initialize message handlers
     */
    init() {
        // Connection established
        wsService.on('connection_established', (data) => {
            const status = data.status;
            uiManager.updateStatus(`${status.total_documents} docs | ${status.llm_model}`, true);
            appState.setState({ serverInfo: status });
        });

        // Query lifecycle
        wsService.on('query_start', (data) => {
            uiManager.appendOutput(`\n${'━'.repeat(60)}`, 'info');
            uiManager.appendOutput(`⚡ Starting query processing...`, 'system');
        });

        wsService.on('query_complete', (data) => {
            uiManager.appendOutput(`✅ Query completed in ${data.processing_time?.toFixed(2)}s`, 'success');
            uiManager.appendOutput(`${'━'.repeat(60)}\n`, 'info');
        });

        // Retrieval events
        wsService.on('retrieval_start', (data) => {
            displayRetrievalStart(data.data);
        });

        wsService.on('retrieval_complete', (data) => {
            displayRetrievalComplete(data.data);
        });

        // LLM events
        wsService.on('llm_request', (data) => {
            displayLLMRequest(data.data);
        });

        wsService.on('llm_response', (data) => {
            displayLLMResponse(data.data);
        });

        // Evaluation events
        wsService.on('evaluation_start', (data) => {
            displayEvaluationStart(data.data);
        });

        wsService.on('evaluation_complete', (data) => {
            displayEvaluationComplete(data.data);
        });

        // Optimization events
        wsService.on('temperature_test', (data) => {
            displayTemperatureTest(data.data);
        });

        // Improvement events
        wsService.on('improvement_iteration', (data) => {
            displayImprovementIteration(data.data);
        });
    }
}

// Export singleton instance
export const wsMessageHandler = new WebSocketMessageHandler();
export default wsMessageHandler;
