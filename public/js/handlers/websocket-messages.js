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
    displayImprovementIteration,
    displayThresholdAttempt,
    displayTemperatureResponse,
    displayTemperatureEvaluation,
    displayImprovementResponse,
    displayImprovementEvaluation,
    displayQueryStart,
    displayQueryComplete
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
        displayQueryStart(data);
    });

    wsService.on('query_complete', (data) => {
        displayQueryComplete(data);
    });        // Retrieval events
        wsService.on('retrieval_start', (data) => {
            displayRetrievalStart(data.data);
        });

        wsService.on('threshold_attempt', (data) => {
            displayThresholdAttempt(data.data);
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

        wsService.on('temperature_response', (data) => {
            displayTemperatureResponse(data.data);
        });

        wsService.on('temperature_evaluation', (data) => {
            displayTemperatureEvaluation(data.data);
        });

        // Improvement events
        wsService.on('improvement_iteration', (data) => {
            displayImprovementIteration(data.data);
        });

        wsService.on('improvement_response', (data) => {
            displayImprovementResponse(data.data);
        });

        wsService.on('improvement_evaluation', (data) => {
            displayImprovementEvaluation(data.data);
        });
    }
}

// Export singleton instance
export const wsMessageHandler = new WebSocketMessageHandler();
export default wsMessageHandler;
