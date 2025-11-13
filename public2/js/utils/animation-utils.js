/**
 * Animation Utils - Helper functions for animations and transitions
 */

export class AnimationUtils {
    /**
     * Add a temporary class for animation, then remove it
     */
    static animateClass(element, className, duration = 300) {
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
    static fadeIn(element, duration = 300) {
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
    static fadeOut(element, duration = 300) {
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
    static pulse(element, duration = 300) {
        return this.animateClass(element, 'pulse-scale', duration);
    }
    
    /**
     * Staggered animation for multiple elements
     */
    static stagger(elements, animationFn, delay = 50) {
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
    static smoothScroll(container, targetY, duration = 800) {
        if (!container) return Promise.resolve();
        
        return new Promise((resolve) => {
            const startTime = performance.now();
            const startScroll = container.scrollTop;
            const scrollChange = targetY - startScroll;
            
            // Easing function (ease-out-cubic)
            const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
            
            const animateScroll = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = easeOutCubic(progress);
                
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
