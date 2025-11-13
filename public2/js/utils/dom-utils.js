/**
 * DOM Utils - Helper functions for DOM manipulation
 * 
 * Pure utility functions with no side effects.
 */

export class DOMUtils {
    /**
     * Create an element with classes and attributes
     */
    static createElement(tag, options = {}) {
        const element = document.createElement(tag);
        
        if (options.className) {
            element.className = options.className;
        }
        
        if (options.id) {
            element.id = options.id;
        }
        
        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        
        if (options.dataset) {
            Object.entries(options.dataset).forEach(([key, value]) => {
                element.dataset[key] = value;
            });
        }
        
        if (options.innerHTML) {
            element.innerHTML = options.innerHTML;
        }
        
        if (options.textContent) {
            element.textContent = options.textContent;
        }
        
        return element;
    }
    
    /**
     * Show an element
     */
    static show(element) {
        if (element) {
            element.style.display = '';
        }
    }
    
    /**
     * Hide an element
     */
    static hide(element) {
        if (element) {
            element.style.display = 'none';
        }
    }
    
    /**
     * Toggle element visibility
     */
    static toggle(element) {
        if (!element) return;
        element.style.display = element.style.display === 'none' ? '' : 'none';
    }
    
    /**
     * Add class to element
     */
    static addClass(element, className) {
        if (element && className) {
            element.classList.add(className);
        }
    }
    
    /**
     * Remove class from element
     */
    static removeClass(element, className) {
        if (element && className) {
            element.classList.remove(className);
        }
    }
    
    /**
     * Toggle class on element
     */
    static toggleClass(element, className) {
        if (element && className) {
            element.classList.toggle(className);
        }
    }
    
    /**
     * Remove element from DOM
     */
    static remove(element) {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }
    
    /**
     * Clear all children from element
     */
    static clearChildren(element) {
        if (element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        }
    }
    
    /**
     * Scroll element into view smoothly
     */
    static scrollIntoView(element, options = {}) {
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: options.block || 'center',
                inline: options.inline || 'center',
                ...options
            });
        }
    }
}
