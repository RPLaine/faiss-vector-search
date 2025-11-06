/**
 * State Management Module
 * Manages application state and provides reactive updates
 */

class AppState {
    constructor() {
        this.state = {
            connected: false,
            processing: false,
            serverInfo: null,
            currentMode: 'optimize'
        };
        
        this.listeners = new Map();
    }

    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Update state and notify listeners
     */
    setState(updates) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...updates };
        
        // Notify listeners of changes
        Object.keys(updates).forEach(key => {
            if (prevState[key] !== this.state[key]) {
                this.notifyListeners(key, this.state[key], prevState[key]);
            }
        });
    }

    /**
     * Subscribe to state changes
     */
    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(key);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Notify listeners of state changes
     */
    notifyListeners(key, newValue, oldValue) {
        const callbacks = this.listeners.get(key) || [];
        callbacks.forEach(callback => callback(newValue, oldValue));
    }

    /**
     * Check if currently processing
     */
    isProcessing() {
        return this.state.processing;
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.state.connected;
    }

    /**
     * Get current mode
     */
    getCurrentMode() {
        return this.state.currentMode;
    }
}

// Export singleton instance
export const appState = new AppState();
export default appState;
