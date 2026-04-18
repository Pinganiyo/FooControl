import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
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

/**
 * Resizes an image and converts it to WebP.
 * @param {Blob|ArrayBuffer|string} data - Image data
 * @param {string|number} targetRes - Resolution limit or 'max'
 * @returns {Promise<Blob>}
 */
async function processArtwork(data, targetRes = 800) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (targetRes !== 'max') {
                const max = parseInt(targetRes, 10);
                if (width > max || height > max) {
                    if (width > height) {
                        height *= max / width;
                        width = max;
                    } else {
                        width *= max / height;
                        height = max;
                    }
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas conversion failed'));
            }, 'image/webp', 0.85); // High quality WebP
            
            // Clean up
            URL.revokeObjectURL(img.src);
        };
        img.onerror = () => reject(new Error('Failed to load image for processing'));
        
        if (data instanceof Blob) {
            img.src = URL.createObjectURL(data);
        } else if (data instanceof ArrayBuffer) {
            img.src = URL.createObjectURL(new Blob([data]));
        } else if (typeof data === 'string') {
            // Assume base64 from CapacitorHttp
            img.src = `data:image/jpeg;base64,${data}`;
        }
    });
}

/**
 * Fetches the user preferred artwork quality.
 */
export async function getArtworkQuality() {
    const { value } = await Preferences.get({ key: 'artwork_quality' });
    return value || '800';
}

// In-memory cache for local file existence checks.
const localUrlCache = new Map();

/**
 * Returns a local URL if the artwork is cached, otherwise null.
 */
export async function getLocalArtworkUrl(cacheKey) {
    if (!cacheKey || !isNative) return null;

    if (localUrlCache.has(cacheKey) && typeof localUrlCache.get(cacheKey) === 'string') {
        return localUrlCache.get(cacheKey);
    }

    // Prefer webp, fallback to jpg for legacy support
    const extensions = ['webp', 'jpg'];
    for (const ext of extensions) {
        const filename = `${cacheKey}.${ext}`;
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
        } catch (e) {}
    }
    return null;
}

/**
 * Clears the in-memory cache.
 */
export function clearLocalArtworkCache() {
    localUrlCache.clear();
}

/**
 * Purges the artwork directory on disk.
 */
export async function clearArtworkFilesystemCache() {
    if (!isNative) return;
    try {
        await Filesystem.rmdir({
            path: 'covers',
            directory: Directory.Data,
            recursive: true
        });
        clearLocalArtworkCache();
    } catch (e) {
        console.error("Failed to clear artwork directory", e);
    }
}

/**
 * Concurrency limiter for artwork downloads.
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
    if (next) next();
    else activeDownloads--;
}

/**
 * Fetches artwork from the server, caching it in IndexedDB or Native Filesystem.
 * Returns a URL that can be used in an <img> tag.
 */
export async function getArtworkUrl(remoteUrl, cacheKey) {
    if (!cacheKey) return remoteUrl;

    const local = await getLocalArtworkUrl(cacheKey);
    if (local) return local;

    if (!isNative) {
        const cachedBlob = await getCachedArtwork(cacheKey);
        if (cachedBlob) return URL.createObjectURL(cachedBlob);
    }

    if (!remoteUrl) return null;

    let retries = 2;
    let imageData = null;

    while (retries >= 0 && !imageData) {
        await acquireDownloadSlot();
        try {
            if (isNative) {
                const response = await CapacitorHttp.get({
                    url: remoteUrl,
                    responseType: 'arraybuffer' 
                });

                if (response.status >= 200 && response.status < 300 && response.data) {
                    imageData = response.data;
                }
            } else {
                const res = await fetch(remoteUrl);
                if (res.ok) {
                    const blob = await res.blob();
                    const quality = await getArtworkQuality();
                    const processed = await processArtwork(blob, quality);
                    saveToArtworkCache(cacheKey, processed).catch(e => console.error("Cache save failed", e));
                    return URL.createObjectURL(processed);
                }
            }
        } catch (e) {
            console.warn(`Artwork fetch attempt failed (${retries} left):`, remoteUrl);
        } finally {
            releaseDownloadSlot();
        }
        
        if (!imageData && retries > 0) {
            await new Promise(r => setTimeout(r, 500));
        }
        retries--;
    }

    if (isNative && imageData) {
        const filename = `${cacheKey}.webp`;
        try {
            try {
                await Filesystem.mkdir({
                    path: 'covers',
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e) {}

            const quality = await getArtworkQuality();
            const processedBlob = await processArtwork(imageData, quality);
            const base64 = await blobToBase64(processedBlob);

            await Filesystem.writeFile({
                path: `covers/${filename}`,
                data: base64,
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

    return remoteUrl;
}

/**
 * Helper to generate a consistent cache key for artwork.
 */
export function getArtworkCacheKey(artist, album, title) {
    const UNKNOWN_VALUES = ['unknown artist', 'unknown album', 'unknown title', 'unknown', '?', ''];
    const normArtist = (artist || '').toLowerCase().trim();
    const normAlbum = (album || '').toLowerCase().trim();
    const normTitle = (title || '').toLowerCase().trim();

    const vals = [normArtist, normAlbum, normTitle].filter(v => v);
    if (vals.length === 0 || vals.every(v => UNKNOWN_VALUES.includes(v))) return null;

    const key = `art_${artist || ''}_${album || ''}_${title || ''}`.toLowerCase();
    return key.replace(/[^a-z0-9_\-]/gi, '_');
}

/**
 * Pre-caches an optimized version of an artwork during sync.
 */
export async function preCacheArtwork(remoteUrl, cacheKey) {
    if (!remoteUrl || !cacheKey || !isNative) return;

    // Check if webp version exists
    const filename = `${cacheKey}.webp`;
    
    try {
        try {
            await Filesystem.stat({
                path: `covers/${filename}`,
                directory: Directory.Data
            });
            return;
        } catch (e) {}

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

                const quality = await getArtworkQuality();
                const processedBlob = await processArtwork(response.data, quality);
                const base64 = await blobToBase64(processedBlob);

                await Filesystem.writeFile({
                    path: `covers/${filename}`,
                    data: base64,
                    directory: Directory.Data
                });
            }
        } finally {
            releaseDownloadSlot();
        }
    } catch (e) { }
}

