import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { getCachedArtwork, saveToArtworkCache } from './libraryCache';

const isNative = Capacitor.isNativePlatform();

/**
 * Converts a Blob to a Base64 string (needed for Capacitor Filesystem)
 */
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
});

// In-memory cache for local file existence checks.
// Prevents hammering Filesystem.stat() for every album card on every render.
// null = not yet checked, false = confirmed missing, string = confirmed local path
const localUrlCache = new Map();

/**
 * Returns a local URL if the artwork is cached, otherwise null.
 * This is non-blocking and used for instant placeholders.
 */
export async function getLocalArtworkUrl(cacheKey) {
    if (!cacheKey || !isNative) return null;

    // Return memoized result if available (only if it's a valid string)
    if (localUrlCache.has(cacheKey) && typeof localUrlCache.get(cacheKey) === 'string') {
        return localUrlCache.get(cacheKey);
    }

    const filename = `${cacheKey}.jpg`;
    try {
        const result = await Filesystem.getUri({
            path: `covers/${filename}`,
            directory: Directory.Data
        });
        await Filesystem.stat({
            path: `covers/${filename}`,
            directory: Directory.Data
        });
        const url = Capacitor.convertFileSrc(result.uri);
        localUrlCache.set(cacheKey, url);
        return url;
    } catch (e) {
        // Don't permanently blacklist, just return null so it can try network then cache later
        return null;
    }
}

/**
 * Clears the in-memory cache (call after a sync completes so new covers are picked up).
 */
export function clearLocalArtworkCache() {
    localUrlCache.clear();
}

/**
 * Concurrency limiter for artwork downloads.
 * Prevents simultaneous CapacitorHttp arraybuffer fetches from OOM-ing the device.
 */
const MAX_CONCURRENT = 3;
let activeDownloads = 0;
const downloadQueue = [];

function acquireDownloadSlot() {
    return new Promise(resolve => {
        if (activeDownloads < MAX_CONCURRENT) {
            activeDownloads++;
            resolve();
        } else {
            downloadQueue.push(resolve);
        }
    });
}

function releaseDownloadSlot() {
    const next = downloadQueue.shift();
    if (next) {
        next(); // hand the slot to next waiter
    } else {
        activeDownloads--;
    }
}

/**
 * Fetches artwork from the server, caching it in IndexedDB or Native Filesystem.
 * Returns a URL that can be used in an <img> tag.
 */
export async function getArtworkUrl(remoteUrl, cacheKey) {
    if (!cacheKey) return remoteUrl;

    // 1. Try Instant Local Resolve
    const local = await getLocalArtworkUrl(cacheKey);
    if (local) return local;

    // 2. Check Web Cache (IndexedDB)
    if (!isNative) {
        const cachedBlob = await getCachedArtwork(cacheKey);
        if (cachedBlob) {
            return URL.createObjectURL(cachedBlob);
        }
    }

    if (!remoteUrl) return null;

    // 3. Throttled Network Fetch with Retries
    let retries = 2;
    let imageDataBase64 = null;

    while (retries >= 0 && !imageDataBase64) {
        await acquireDownloadSlot();
        try {
            if (isNative) {
                const response = await CapacitorHttp.get({
                    url: remoteUrl,
                    responseType: 'arraybuffer' 
                });

                if (response.status >= 200 && response.status < 300 && response.data) {
                    imageDataBase64 = response.data;
                }
            } else {
                const res = await fetch(remoteUrl);
                if (res.ok) {
                    const blob = await res.blob();
                    saveToArtworkCache(cacheKey, blob).catch(e => console.error("Cache save failed", e));
                    return URL.createObjectURL(blob);
                }
            }
        } catch (e) {
            console.warn(`Artwork fetch attempt failed (${retries} left):`, remoteUrl);
        } finally {
            releaseDownloadSlot();
        }
        
        if (!imageDataBase64 && retries > 0) {
            await new Promise(r => setTimeout(r, 500)); // Small pause before retry
        }
        retries--;
    }

    // 4. Save to Native Cache if we have data
    if (isNative && imageDataBase64) {
        const filename = `${cacheKey}.jpg`;
        try {
            try {
                await Filesystem.mkdir({
                    path: 'covers',
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e) { /* ignore if already exists */ }

            await Filesystem.writeFile({
                path: `covers/${filename}`,
                data: imageDataBase64,
                directory: Directory.Data
            });

            const uriResult = await Filesystem.getUri({
                path: `covers/${filename}`,
                directory: Directory.Data
            });
            const localUrl = Capacitor.convertFileSrc(uriResult.uri);
            localUrlCache.set(cacheKey, localUrl);
            return localUrl;
        } catch (e) {
            console.error("Native cache save failed", e);
        }
    }

    return remoteUrl; // Fallback to remote URL
}

/**
 * Helper to generate a consistent cache key for artwork.
 */
export function getArtworkCacheKey(artist, album, title) {
    const UNKNOWN_VALUES = ['unknown artist', 'unknown album', 'unknown title', 'unknown', '?', ''];
    const normArtist = (artist || '').toLowerCase().trim();
    const normAlbum = (album || '').toLowerCase().trim();
    const normTitle = (title || '').toLowerCase().trim();

    // If all provided values are empty or generic fallbacks, skip caching entirely
    const vals = [normArtist, normAlbum, normTitle].filter(v => v);
    if (vals.length === 0 || vals.every(v => UNKNOWN_VALUES.includes(v))) return null;

    // Sanitize for filename safety
    const key = `art_${artist || ''}_${album || ''}_${title || ''}`.toLowerCase();
    return key.replace(/[^a-z0-9_\-]/gi, '_');
}

/**
 * Pre-caches a low-resolution version of an artwork during sync.
 */
export async function preCacheArtwork(remoteUrl, cacheKey) {
    if (!remoteUrl || !cacheKey || !isNative) return;

    const filename = `${cacheKey}.jpg`;
    
    try {
        // Check if already exists
        try {
            await Filesystem.stat({
                path: `covers/${filename}`,
                directory: Directory.Data
            });
            return; // Already cached
        } catch (e) {}

        // Download via CapacitorHttp (use download slot to avoid flooding)
        await acquireDownloadSlot();
        try {
            const response = await CapacitorHttp.get({
                url: remoteUrl,
                responseType: 'arraybuffer'
            });

            if (response.status >= 200 && response.status < 300 && response.data) {
                try {
                    await Filesystem.mkdir({
                        path: 'covers',
                        directory: Directory.Data,
                        recursive: true
                    });
                } catch (e) {}

                await Filesystem.writeFile({
                    path: `covers/${filename}`,
                    data: response.data,
                    directory: Directory.Data
                });
            }
        } finally {
            releaseDownloadSlot();
        }
    } catch (e) { }
}
