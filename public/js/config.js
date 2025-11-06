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
        defaultMode: 'optimize',
        modes: {
            optimize: { use_context: true, optimize: true, improve: false },
            faiss: { use_context: true, optimize: false, improve: false },
            none: { use_context: false, optimize: false, improve: false }
        },
        defaultTemplate: 'base'
    }
};

export default config;
