/**
 * Configuration Module
 * Centralized configuration for the RAG Terminal application
 */

export const config = {
    // API Configuration
    api: {
        baseUrl: 'http://localhost:8000',
        wsUrl: 'ws://localhost:8000/ws',
        endpoints: {
            query: '/api/query',
            status: '/api/status'
        }
    },

    // WebSocket Configuration
    websocket: {
        reconnectDelay: 5000,
        maxReconnectAttempts: 10
    },

    // UI Configuration
    ui: {
        separatorLength: 60,
        scrollBehavior: 'smooth'
    },

    // Query Configuration
    query: {
        defaultMode: 'full',
        modes: {
            full: { mode: 'full' },  // Complete pipeline: retrieval + optimization + improvement
            faiss: { mode: 'faiss' }, // Retrieval + single LLM call
            none: { mode: 'none' }   // Direct LLM, no context
        },
        defaultTemplate: 'base'
    }
};

export default config;
