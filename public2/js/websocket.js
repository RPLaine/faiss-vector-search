/**
 * WebSocket Service for AI Journalist Agents
 */

export class WebSocketService {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.eventHandlers = new Map();
        this.connected = false;
        this.connectionStateCallback = null;
    }
    
    setConnectionStateCallback(callback) {
        this.connectionStateCallback = callback;
    }
    
    connect() {
        try {
            this.ws = new WebSocket(this.url);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connected = true;
                this.reconnectDelay = 1000;
                if (this.connectionStateCallback) {
                    this.connectionStateCallback(true);
                }
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.connected = false;
                if (this.connectionStateCallback) {
                    this.connectionStateCallback(false);
                }
                this.reconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connected = false;
                if (this.connectionStateCallback) {
                    this.connectionStateCallback(false);
                }
            };
            
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            this.connected = false;
            if (this.connectionStateCallback) {
                this.connectionStateCallback(false);
            }
            this.reconnect();
        }
    }
    
    reconnect() {
        setTimeout(() => {
            console.log('Reconnecting WebSocket...');
            this.connect();
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        }, this.reconnectDelay);
    }
    
    handleMessage(data) {
        const type = data.type;
        const handlers = this.eventHandlers.get(type);
        
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }
    
    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }
    
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
}
