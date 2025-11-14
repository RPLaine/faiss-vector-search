/**
 * Animation Utils - Helper functions for animations and transitions
 */

import { ANIMATION_DURATIONS } from '../constants.js';

/**
 * Easing Functions
 * All functions take t (0 to 1) and return eased value (0 to 1)
 */
export const Easing = {
    // Cubic easing - smooth acceleration and deceleration
    easeInOutCubic: (t) => t < 0.5 
        ? 4 * t * t * t 
        : 1 - Math.pow(-2 * t + 2, 3) / 2,
    
    // Quadratic easing - gentler than cubic
    easeInOutQuad: (t) => t < 0.5 
        ? 2 * t * t 
        : 1 - Math.pow(-2 * t + 2, 2) / 2,
    
    // Starts fast, ends slow
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    
    // Starts slow, ends fast
    easeInCubic: (t) => t * t * t,
    
    // Quadratic variants
    easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
    easeInQuad: (t) => t * t,
    
    // Linear (no easing)
    linear: (t) => t
};

export class AnimationUtils {
    /**
     * Add a temporary class for animation, then remove it
     */
    static animateClass(element, className, duration = ANIMATION_DURATIONS.FADE_IN) {
        if (!element) return Promise.resolve();
        
        return new Promise((resolve) => {
            element.classList.add(className);
            setTimeout(() => {
                element.classList.remove(className);
                resolve();
            }, duration);
        });
    }
    
    /**
     * Fade in an element
     */
    static fadeIn(element, duration = ANIMATION_DURATIONS.FADE_IN) {
        if (!element) return Promise.resolve();
        
        return new Promise((resolve) => {
            element.style.opacity = '0';
            element.style.display = '';
            
            requestAnimationFrame(() => {
                element.style.transition = `opacity ${duration}ms ease`;
                element.style.opacity = '1';
                
                setTimeout(() => {
                    element.style.transition = '';
                    resolve();
                }, duration);
            });
        });
    }
    
    /**
     * Fade out an element
     */
    static fadeOut(element, duration = ANIMATION_DURATIONS.FADE_OUT) {
        if (!element) return Promise.resolve();
        
        return new Promise((resolve) => {
            element.style.transition = `opacity ${duration}ms ease`;
            element.style.opacity = '0';
            
            setTimeout(() => {
                element.style.display = 'none';
                element.style.transition = '';
                element.style.opacity = '';
                resolve();
            }, duration);
        });
    }
    
    /**
     * Pulse animation (scale effect)
     */
    static pulse(element, duration = ANIMATION_DURATIONS.PULSE) {
        return this.animateClass(element, 'pulse-scale', duration);
    }
    
    /**
     * Staggered animation for multiple elements
     */
    static stagger(elements, animationFn, delay = ANIMATION_DURATIONS.GENERIC_STAGGER) {
        if (!elements || elements.length === 0) return Promise.resolve();
        
        const promises = elements.map((element, index) => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    animationFn(element).then(resolve);
                }, delay * index);
            });
        });
        
        return Promise.all(promises);
    }
    
    /**
     * Smooth scroll to position with easing
     */
    static smoothScroll(container, targetY, duration = ANIMATION_DURATIONS.SCROLL_SMOOTH) {
        if (!container) return Promise.resolve();
        
        return new Promise((resolve) => {
            const startTime = performance.now();
            const startScroll = container.scrollTop;
            const scrollChange = targetY - startScroll;
            
            const animateScroll = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = Easing.easeOutCubic(progress);
                
                const newScroll = startScroll + (scrollChange * easedProgress);
                container.scrollTop = Math.max(0, newScroll);
                
                if (progress < 1) {
                    requestAnimationFrame(animateScroll);
                } else {
                    resolve();
                }
            };
            
            requestAnimationFrame(animateScroll);
        });
    }
    
    /**
     * Animate a numeric value with easing
     * @param {number} startValue - Starting value
     * @param {number} endValue - Target value
     * @param {number} duration - Animation duration in milliseconds
     * @param {Function} onUpdate - Callback called each frame with current value
     * @param {Function} easingFn - Easing function (default: easeInOutQuad for smoother motion)
     * @returns {Promise} Resolves when animation completes
     */
    static animateValue(startValue, endValue, duration, onUpdate, easingFn = Easing.easeInOutQuad) {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const valueChange = endValue - startValue;
            
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = easingFn(progress);
                
                const currentValue = startValue + (valueChange * easedProgress);
                onUpdate(currentValue);
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };
            
            requestAnimationFrame(animate);
        });
    }
    
    /**
     * Wait for next animation frame (useful for forcing reflow)
     */
    static nextFrame() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });
    }
}
