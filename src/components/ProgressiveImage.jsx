import React, { useState, useEffect, useRef } from 'react';
import { getArtworkUrl, getLocalArtworkUrl } from '../api/artwork';

/**
 * A premium progressive image loader with two-stage offline-first loading.
 * Uses a single batched state update to avoid GPU thrashing on Android.
 */
export default function ProgressiveImage({ src, alt, className, onClick, style, cacheKey, crossfade = false }) {
    const [imgState, setImgState] = useState({ 
        thumb: null, 
        full: null, 
        loaded: false,
        prevFull: null
    });
    const mountedRef = useRef(true);
    const timeoutRef = useRef(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => { 
            mountedRef.current = false; 
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!src && !cacheKey) {
            setImgState(prev => ({ thumb: null, full: null, loaded: false, prevFull: (crossfade && prev.loaded) ? prev.full : prev.prevFull }));
            return;
        }

        let cancelled = false;

        const load = async () => {
            // Only wipe the state if we are doing a crossfade transition.
            if (crossfade) {
                setImgState(prev => ({ 
                    thumb: null, 
                    full: null, 
                    loaded: false, 
                    // CRITICAL: If we already have a prevFull from a PREVIOUS skip that hasn't finished, 
                    // we must discard it now to avoid stacking multiple "ghost" images.
                    prevFull: (prev.loaded && prev.full) ? prev.full : null 
                }));
            } else {
                setImgState(prev => ({ ...prev, loaded: false }));
            }

            // STAGE 1: Instant local check
            if (cacheKey) {
                const local = await getLocalArtworkUrl(cacheKey);
                if (cancelled) return;
                if (local) {
                    setImgState(prev => ({ thumb: local, full: local, loaded: false, prevFull: prev.prevFull }));
                    return;
                }
            }

            // STAGE 2: Set a low-res thumb from remote while fetching full
            if (src) {
                const connector = src.includes('?') ? '&' : '?';
                const thumbUrl = `${src}${connector}width=64`;
                if (!cancelled) setImgState(prev => ({ thumb: thumbUrl, full: null, loaded: false, prevFull: prev.prevFull }));
            }

            // STAGE 3: Resolve full quality
            if (cacheKey && src) {
                try {
                    const fullUrl = await getArtworkUrl(src, cacheKey);
                    if (!cancelled && fullUrl) setImgState(prev => ({ ...prev, full: fullUrl }));
                } catch (e) {
                    if (!cancelled) setImgState(prev => ({ ...prev, full: src }));
                }
            } else if (src) {
                if (!cancelled) setImgState(prev => ({ ...prev, full: src }));
            }
        };

        load();

        return () => { cancelled = true; };
    }, [src, cacheKey]);

    const { thumb, full, loaded, prevFull } = imgState;

    // Crossfade timer: Remove prevFull after CSS opacity transition finishes
    useEffect(() => {
        if (full && prevFull && full !== prevFull) {
            // Safety timeout: always clear prevFull after 2 seconds even if 'loaded' never becomes true
            const safetyTimer = setTimeout(() => {
                if (mountedRef.current) {
                    setImgState(prev => ({ ...prev, prevFull: null }));
                }
            }, 2000);

            if (loaded) {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    if (mountedRef.current) {
                        setImgState(prev => ({ ...prev, prevFull: null }));
                    }
                }, 600); // 100ms extra buffer
            }

            return () => clearTimeout(safetyTimer);
        }
    }, [loaded, full, prevFull]);

    return (
        <div className={`progressive-img-container ${className || ''}`} style={style} onClick={onClick}>
            {/* The old image kept physically behind the new one to permit a crossfade */}
            {prevFull && prevFull !== full && (
                <img
                    key={`prev-${prevFull}`}
                    src={prevFull}
                    alt=""
                    className="prog-img prev"
                    aria-hidden="true"
                />
            )}

            {full ? (
                <>
                    {/* Full image layer */}
                    <img
                        key={`curr-${full}`}
                        src={full}
                        alt={alt}
                        className={`prog-img full ${(!crossfade || loaded) ? 'loaded' : ''}`}
                        onLoad={() => {
                            if (mountedRef.current) setImgState(prev => ({ ...prev, loaded: true }));
                        }}
                        loading="eager"
                        onError={(e) => { 
                            console.error("Full image load failed:", full);
                            if (mountedRef.current) setImgState(prev => ({ ...prev, full: null, loaded: true })); 
                        }}
                    />

                    {/* Blurry placeholder shown until full loads, ONLY if we don't already have a beautiful previous cover visible */}
                    {thumb && thumb !== full && !prevFull && (
                        <img
                            key={`thumb-${thumb}`}
                            src={thumb}
                            alt=""
                            className="prog-img thumb"
                            aria-hidden="true"
                        />
                    )}
                </>
            ) : thumb && !prevFull ? (
                <img
                    src={thumb}
                    alt={alt}
                    className="prog-img thumb"
                    aria-hidden="true"
                />
            ) : !prevFull && (
                <div className="img-placeholder">♪</div>
            )}
        </div>
    );
}

