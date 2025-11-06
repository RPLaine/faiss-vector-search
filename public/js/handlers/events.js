/**
 * Event Handlers Module
 * Registers and manages UI event listeners
 */

import { queryHandler } from './query.js';
import { uiManager } from '../ui/manager.js';

class EventManager {
    /**
     * Register all event listeners
     */
    registerEvents() {
        this.registerQueryInputEvents();
        this.registerButtonEvents();
        this.registerMenuEvents();
        this.registerKeyboardShortcuts();
    }

    /**
     * Register query input events
     */
    registerQueryInputEvents() {
        const queryInput = document.getElementById('query-input');
        
        queryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                queryHandler.executeFromInput();
            }
        });
    }

    /**
     * Register button events
     */
    registerButtonEvents() {
        const executeBtn = document.getElementById('executeBtn');
        const clearBtn = document.getElementById('clearBtn');
        
        executeBtn.addEventListener('click', () => {
            queryHandler.executeFromInput();
        });
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                uiManager.clearContent();
                this.closeMenu();
            });
        }
    }

    /**
     * Register menu events
     */
    registerMenuEvents() {
        const menuBtn = document.getElementById('menuBtn');
        const menuModal = document.getElementById('menuModal');
        
        if (menuBtn && menuModal) {
            // Toggle menu on button click
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menuModal.classList.toggle('active');
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!menuModal.contains(e.target) && e.target !== menuBtn) {
                    menuModal.classList.remove('active');
                }
            });
        }
    }

    /**
     * Close menu modal
     */
    closeMenu() {
        const menuModal = document.getElementById('menuModal');
        if (menuModal) {
            menuModal.classList.remove('active');
        }
    }

    /**
     * Register keyboard shortcuts
     */
    registerKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+L: Clear terminal
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                uiManager.clearContent();
            }
        });
    }
}

// Export singleton instance
export const eventManager = new EventManager();
export default eventManager;
