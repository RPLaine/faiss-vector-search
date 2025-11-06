/**
 * WebSocket Service Module
 * Handles WebSocket connection and message routing
 */

import config from '../config.js';
import { appState } from '../state.js';

class WebSocketService {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.messageHandlers = new Map();
        this.reconnectTimer = null;
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        try {
            this.ws = new WebSocket(config.api.wsUrl);
            
            this.ws.onopen = () => this.handleOpen();
            this.ws.onmessage = (event) => this.handleMessage(event);
            this.ws.onclose = () => this.handleClose();
            this.ws.onerror = (error) => this.handleError(error);
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Handle WebSocket open event
     */
    handleOpen() {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        appState.setState({ connected: true });
    }

    /**
     * Handle WebSocket message event
     */
    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data.type || data.action, data);
            
            // Route message to appropriate handler
            const type = data.type || data.action;
            const handlers = this.messageHandlers.get(type) || [];
            handlers.forEach(handler => handler(data));
            
            // Also notify wildcard handlers
            const wildcardHandlers = this.messageHandlers.get('*') || [];
            wildcardHandlers.forEach(handler => handler(data));
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }

    /**
     * Handle WebSocket close event
     */
    handleClose() {
        console.log('WebSocket disconnected');
        appState.setState({ connected: false });
        this.scheduleReconnect();
    }

    /**
     * Handle WebSocket error event
     */
    handleError(error) {
        console.error('WebSocket error:', error);
        appState.setState({ connected: false });
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= config.websocket.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        console.log(`Reconnecting in ${config.websocket.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, config.websocket.reconnectDelay);
    }

    /**
     * Register message handler
     */
    on(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }

    /**
     * Unregister message handler
     */
    off(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Send message through WebSocket
     */
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not connected, cannot send message');
        }
    }
}

// Export singleton instance
export const wsService = new WebSocketService();
export default wsService;
