import { useState, useRef, useCallback } from 'react';

/**
 * A custom hook to detect mobile-friendly long press events.
 * @param {Function} onLongPress - Callback when hold threshold is met.
 * @param {Function} onClick - standard click fallback.
 * @param {Object} options - { delay, moveThreshold }
 */
export function useLongPress(onLongPress, onClick, { delay = 600, moveThreshold = 10 } = {}) {
    const timerRef = useRef(null);
    const startPosRef = useRef({ x: 0, y: 0 });
    const isLongPressActive = useRef(false);

    const start = useCallback((event) => {
        // Only trigger for primary pointer
        if (event.type === 'touchstart' && event.touches.length > 1) return;
        
        const clientX = event.clientX || (event.touches ? event.touches[0].clientX : 0);
        const clientY = event.clientY || (event.touches ? event.touches[0].clientY : 0);
        
        startPosRef.current = { x: clientX, y: clientY };
        isLongPressActive.current = false;

        timerRef.current = setTimeout(() => {
            isLongPressActive.current = true;
            onLongPress(event);
        }, delay);
    }, [onLongPress, delay]);

    const stop = useCallback((event) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        if (!isLongPressActive.current && onClick) {
            onClick(event);
        }
        isLongPressActive.current = false;
    }, [onClick]);

    const move = useCallback((event) => {
        if (!timerRef.current) return;

        const clientX = event.clientX || (event.touches ? event.touches[0].clientX : 0);
        const clientY = event.clientY || (event.touches ? event.touches[0].clientY : 0);
        
        const dist = Math.sqrt(
            Math.pow(clientX - startPosRef.current.x, 2) + 
            Math.pow(clientY - startPosRef.current.y, 2)
        );

        if (dist > moveThreshold) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, [moveThreshold]);

    return {
        onMouseDown: start,
        onMouseUp: stop,
        onMouseMove: move,
        onMouseLeave: stop,
        onTouchStart: start,
        onTouchEnd: stop,
        onTouchMove: move
    };
}
