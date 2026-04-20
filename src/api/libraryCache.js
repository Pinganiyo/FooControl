import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { getApiUrl } from './network';
import { nativeFetch } from './beefweb';
import { preCacheArtwork, getArtworkCacheKey } from './artwork';

const isNative = Capacitor.isNativePlatform();

const DB_NAME = 'FooControlDB';
const DB_VERSION = 3; // Bumped for Artwork and individual tracks
const STORE_NAME = 'library';
const COLOR_STORE = 'colors';
const ARTWORK_STORE = 'artwork';
const TRACKS_STORE = 'tracks';

/**
 * NATIVE CACHE HELPERS (Preferences & Filesystem)
 */
async function saveToNativeMeta(key, data) {
    await Preferences.set({
        key: `meta_${key}`,
        value: JSON.stringify(data)
    });
}

async function getFromNativeMeta(key) {
    const { value } = await Preferences.get({ key: `meta_${key}` });
    return value ? JSON.parse(value) : null;
}

// Open (or create) the IndexedDB
const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME); 
            }
            if (!db.objectStoreNames.contains(COLOR_STORE)) {
                db.createObjectStore(COLOR_STORE); 
            }
            if (!db.objectStoreNames.contains(ARTWORK_STORE)) {
                db.createObjectStore(ARTWORK_STORE); 
            }
            if (!db.objectStoreNames.contains(TRACKS_STORE)) {
                // Tracks are stored with an index on path and album artist
                const trackStore = db.createObjectStore(TRACKS_STORE, { keyPath: 'id', autoIncrement: true });
                trackStore.createIndex('path', 'path', { unique: true });
                trackStore.createIndex('albumKey', 'albumKey', { unique: false });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
};

export async function getCachedData(key) {
    if (isNative) {
        return await getFromNativeMeta(key);
    }
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('DB Read Error', e);
        return null;
    }
}

export async function saveToCache(key, data) {
    if (isNative) {
        await saveToNativeMeta(key, data);
        return;
    }
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(data, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('DB Write Error', e);
    }
}

/**
 * ARTWORK CACHE HELPERS
 */
export async function getCachedArtwork(key) {
    if (!key) return null;
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(ARTWORK_STORE, 'readonly');
            const store = transaction.objectStore(ARTWORK_STORE);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

export async function saveToArtworkCache(key, blob) {
    if (!key || !blob) return;
    try {
        const db = await openDB();
        const transaction = db.transaction(ARTWORK_STORE, 'readwrite');
        const store = transaction.objectStore(ARTWORK_STORE);
        store.put(blob, key);
    } catch (e) {
        console.error('Artwork cache write error', e);
    }
}

/**
 * TRACKS CACHE HELPERS (Bulk)
 */
export async function saveTracksBulk(tracks) {
    if (isNative) {
        try {
            await Filesystem.writeFile({
                path: 'library_tracks.json',
                data: JSON.stringify(tracks),
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return;
        } catch (e) {
            console.error('Native track save failed', e);
        }
    }
    try {
        const db = await openDB();
        const transaction = db.transaction(TRACKS_STORE, 'readwrite');
        const store = transaction.objectStore(TRACKS_STORE);
        
        // Clear old tracks first to keep it clean (or we could update selectivey)
        store.clear();
        
        tracks.forEach(track => {
            store.add(track);
        });
        
        return new Promise((resolve) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
        });
    } catch (e) {
        console.error('Track bulk write error', e);
    }
}

export async function getAllCachedTracks() {
    if (isNative) {
        try {
            // Check existence first to avoid native plugin error spam on first install
            await Filesystem.stat({
                path: 'library_tracks.json',
                directory: Directory.Data
            });
            const result = await Filesystem.readFile({
                path: 'library_tracks.json',
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });
            return JSON.parse(result.data);
        } catch (e) {
            return [];
        }
    }
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(TRACKS_STORE, 'readonly');
            const store = transaction.objectStore(TRACKS_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve([]);
        });
    } catch (e) {
        return [];
    }
}
export async function getTracksByAlbum(albumName, artistName, albumKey) {
    const allTracks = await getAllCachedTracks();
    if (!allTracks || !allTracks.length) return [];

    const normAlbum = (albumName || '').toLowerCase().trim();
    const targetKey = albumKey || normAlbum;

    // Filter by album name only — any track with the same album tag belongs here
    const filtered = allTracks.filter(t => {
        if (t.albumKey && t.albumKey === targetKey) return true;
        return (t.album || '').toLowerCase().trim() === normAlbum;
    });

    // Sort by disc and track number
    return filtered.sort((a, b) => {
        if (a.discNum !== b.discNum) return (a.discNum || 1) - (b.discNum || 1);
        return (trackNo(a.trackNum) - trackNo(b.trackNum));
    });
}

function trackNo(val) {
    if (typeof val === 'number') return val;
    return parseInt(val, 10) || 0;
}

/**
 * COLOR CACHE HELPERS
 */
export async function getCachedColor(id) {
    if (!id) return null;
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(COLOR_STORE, 'readonly');
            const store = transaction.objectStore(COLOR_STORE);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

export async function saveToColorCache(id, color) {
    if (!id || !color) return;
    try {
        const db = await openDB();
        const transaction = db.transaction(COLOR_STORE, 'readwrite');
        const store = transaction.objectStore(COLOR_STORE);
        store.put(color, id);
    } catch (e) {
        console.error('Color cache write error', e);
    }
}

/**
 * Background Sync Engine
 * Crawls all playlists to build a flat list of tracks and unique albums.
 */
export async function performFullSync(onProgress) {
    const BASE_URL = getApiUrl();
    const COL_RAW = "%title%,%artist%,%album%,%length_seconds%,%tracknumber%,%date%,%album artist%,%path%,%discnumber%";
    const COLUMNS = encodeURIComponent(COL_RAW);
    
    // Helper to extract an array of artists from a multi-artist string
    const extractAllArtists = (artistStr) => {
        if (!artistStr) return ['Unknown Artist'];
        const parts = artistStr.split(/[;,]|\B\\\\\B/).map(p => p.trim()).filter(Boolean);
        return parts.length > 0 ? parts : ['Unknown Artist'];
    };

    try {
        const plRes = await nativeFetch({ url: `${BASE_URL}/playlists`, method: 'GET' });
        const plData = await plRes.json();
        const playlists = plData.playlists || [];
        
        const allTracks = [];
        const albumMap = new Map(); // key: Album|Artist
        const artistMap = new Map();
        const seenTrackKeys = new Set(); // To de-duplicate track counting for albums
        
        for (let i = 0; i < playlists.length; i++) {
            const pl = playlists[i];
            const totalItems = pl.itemCount;
            const CHUNK_SIZE = 5000;
            let fetchedSoFar = 0;
            
            while (fetchedSoFar < totalItems) {
                if (onProgress) onProgress(`Scanning ${pl.title}... (${fetchedSoFar}/${totalItems})`, (i / playlists.length) * 100);
                
                const range = `${fetchedSoFar}:${fetchedSoFar + CHUNK_SIZE}`;
                const itemRes = await nativeFetch({ url: `${BASE_URL}/playlists/${pl.id}/items/${range}?columns=${COLUMNS}`, method: 'GET' });
                if (!itemRes.ok) break;
                
                const itemData = await itemRes.json();
                const items = itemData.playlistItems?.items || [];
                if (items.length === 0) break;
                
                items.forEach((item, innerIndex) => {
                    const globalIndex = fetchedSoFar + innerIndex;
                    const title = item.columns[0] || 'Unknown';
                    const trackArtist = item.columns[1] || 'Unknown';
                    const album = item.columns[2] || 'Unknown Album';
                    const duration = parseFloat(item.columns[3]) || 0;
                    const trackNum = parseInt(item.columns[4], 10) || 0;
                    const dateStr = item.columns[5] || '';
                    const albumArtistRaw = item.columns[6] || '';
                    const path = item.columns[7] || '';
                    const discNum = parseInt(item.columns[8], 10) || 1;
                    
                    const yearMatch = dateStr.match(/\d{4}/);
                    const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
                    const rawArtistString = albumArtistRaw.trim() ? albumArtistRaw : trackArtist;
                    const allArtists = extractAllArtists(rawArtistString);
                    const mainArtist = allArtists[0];
                    const trackKey = `${path}|${title}`; // unique by path
                    // Album key is album name only — any track with the same album tag belongs together
                    const albumKey = (album || '').toLowerCase().trim();
                    
                    allTracks.push({
                        title, artist: trackArtist, album, duration, year, path,
                        albumArtist: mainArtist,
                        albumKey,
                        trackNum,
                        discNum,
                        playlistId: pl.id,
                        itemIndex: globalIndex
                    });
                    
                    if (albumMap.has(albumKey)) {
                        const existing = albumMap.get(albumKey);
                        if (!seenTrackKeys.has(trackKey)) {
                            existing.trackCount += 1;
                            seenTrackKeys.add(trackKey);
                        }
                        if (!existing.year && year) existing.year = year;
                        allArtists.forEach(a => existing.allArtistsSet.add(a.toLowerCase()));
                    } else {
                        seenTrackKeys.add(trackKey);
                        albumMap.set(albumKey, {
                            albumKey,
                            title: album,
                            artist: mainArtist,
                            allArtistsSet: new Set(allArtists.map(a => a.toLowerCase())),
                            year: year,
                            trackCount: 1,
                            playlistId: pl.id, 
                            itemIndex: globalIndex,
                            trackInfo: {
                                title,
                                artist: trackArtist,
                                path,
                                duration,
                                itemIndex: globalIndex,
                                playlistId: pl.id
                            }
                        });
                    }

                    // Populate Artist Map for ALL artists involved
                    allArtists.forEach(a => {
                        const normArtist = a.toLowerCase();
                        if (artistMap.has(normArtist)) {
                            artistMap.get(normArtist).trackCount += 1;
                        } else {
                            artistMap.set(normArtist, {
                                name: a, // preserving original case of the first encounter
                                trackCount: 1,
                                playlistId: pl.id, 
                                itemIndex: globalIndex
                            });
                        }
                    });
                });
                
                fetchedSoFar += items.length;
            }
        }
        
        const result = {
            lastUpdated: new Date().toISOString(),
            playlists,
            albums: Array.from(albumMap.values()).map(a => {
                const { allArtistsSet, ...rest } = a;
                return { ...rest, allArtistsKeys: Array.from(allArtistsSet) };
            }),
            artists: Array.from(artistMap.values()),
            tracksCount: allTracks.length
        };
        
        // Save to cache for persistence
        await saveToCache('library_data', result);
        
        // DE-DUPLICATE tracks by path for Search
        const uniqueTracks = [];
        const seenPaths = new Set();
        for (const t of allTracks) {
            if (!seenPaths.has(t.path)) {
                uniqueTracks.push(t);
                seenPaths.add(t.path);
            }
        }

        // Save tracks individually for better performance and reliability
        await saveTracksBulk(uniqueTracks);

        console.log('Sync Complete:', result);
        return result;
    } catch (e) {
        console.error('Sync Failed', e);
        throw e;
    }
}

/**
 * DEEP SYNC: Crawl specific folder paths
 */
export async function performDeepSync(roots, onProgress) {
    const BASE_URL = getApiUrl();
    const COL_RAW = "%title%,%artist%,%album%,%length_seconds%,%tracknumber%,%date%,%album artist%,%path%";
    const COLUMNS = encodeURIComponent(COL_RAW);
    
    try {
        if (onProgress) onProgress('Preparing Sync Playlist...', 0);
        
        // 1. Create a persistent sync playlist (or find existing)
        const plRes = await nativeFetch({ url: `${BASE_URL}/playlists`, method: 'GET' });
        const plData = await plRes.json();
        let syncPL = (plData.playlists || []).find(p => p.title === 'FooControl_Collections');
        
        let plId;
        if (!syncPL) {
            const createRes = await nativeFetch({ 
                url: `${BASE_URL}/playlists/add`, 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                data: { title: 'FooControl_Collections' }
            });
            syncPL = await createRes.json();
            plId = syncPL.id;
        } else {
            plId = syncPL.id;
            // Clear items first to re-scan
            await nativeFetch({ url: `${BASE_URL}/playlists/${plId}/items/all`, method: 'DELETE' });
        }
        
        // 2. Add roots to it
        if (onProgress) onProgress('Scanning Folders...', 10);
        const addRes = await nativeFetch({ 
            url: `${BASE_URL}/playlists/${plId}/items/add`, 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: { items: roots }
        });
        
        if (addRes.status === 403) {
            throw new Error("Folder access denied! You must enable 'Allow file system access' in foobar2000 -> Preferences -> Tools -> Beefweb.");
        }
        
        if (!addRes.ok) {
            throw new Error(`Failed to add folders: ${addRes.statusText}`);
        }
        
        // 3. Wait for foobar to finish scanning (poll headcount)
        let lastCount = -1;
        let stabilityCounter = 0;
        
        if (onProgress) onProgress('Syncing: finding tracks...', 20);
        
        // Poll for up to 10 minutes (600 seconds)
        for (let i = 0; i < 600; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const statRes = await nativeFetch({ url: `${BASE_URL}/playlists`, method: 'GET' });
            const statData = await statRes.json();
            const currentPL = statData.playlists.find(p => p.id === plId);
            const count = currentPL?.itemCount || 0;
            
            if (count > 0 && count === lastCount) {
                stabilityCounter++;
                // Wait for 10 seconds of stability instead of 3
                if (stabilityCounter >= 10) break; 
            } else {
                stabilityCounter = 0;
                lastCount = count;
                if (onProgress) onProgress(`Syncing: found ${count} tracks...`, 20 + Math.min((i / 30) * 10, 30));
            }
        }
        
        // 4. Scrape the metadata from THIS playlist
        if (onProgress) onProgress('Saving to Cache...', 60);
        const result = await scrapePlaylist(plId, onProgress);
        
        // 5. Cleanup: We no longer delete the playlist so AlbumView can still use it
        // but we've successfully scanned it.
        
        return result;
    } catch (e) {
        console.error('Deep Sync Failed', e);
        throw e;
    }
}

async function scrapePlaylist(plId, onProgress) {
    const BASE_URL = getApiUrl();
    const COL_RAW = "%title%,%artist%,%album%,%length_seconds%,%tracknumber%,%date%,%album artist%,%path%,%discnumber%";
    const COLUMNS = encodeURIComponent(COL_RAW);
    
    const extractAllArtists = (artistStr) => {
        if (!artistStr) return ['Unknown Artist'];
        const parts = artistStr.split(/[;,]|\B\\\\\B/).map(p => p.trim()).filter(Boolean);
        return parts.length > 0 ? parts : ['Unknown Artist'];
    };

    const plRes = await nativeFetch({ url: `${BASE_URL}/playlists`, method: 'GET' });
    const plData = await plRes.json();
    const playlists = plData.playlists || [];
    const pl = playlists.find(p => p.id === plId);
    if (!pl) throw new Error('Sync playlist lost');

    const totalItems = pl.itemCount;
    const allTracks = [];
    const albumMap = new Map();
    const artistMap = new Map();
    const seenTrackKeys = new Set();
    const CHUNK_SIZE = 5000;
    
    let fetched = 0;
    while (fetched < totalItems) {
        const range = `${fetched}:${fetched + CHUNK_SIZE}`;
        const itemRes = await nativeFetch({ url: `${BASE_URL}/playlists/${plId}/items/${range}?columns=${COLUMNS}`, method: 'GET' });
        if (!itemRes.ok) break;
        const itemData = await itemRes.json();
        const items = itemData.playlistItems?.items || [];
        
        items.forEach((item, innerIndex) => {
            const globalIndex = fetched + innerIndex;
            const path = item.columns[7] || '';
            const pathParts = path.split(/[\\\/]/);
            
            // Fallbacks for untagged tracks
            // Artist is usually the folder 2 levels up, Album is 1 level up
            // Example: .../Artist Name/Album Name/Song.flac
            const fallbackAlbum = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Unknown Album';
            const fallbackArtist = pathParts.length > 2 ? pathParts[pathParts.length - 3] : 'Unknown Artist';
            const fallbackTitle = pathParts.length > 0 ? pathParts[pathParts.length - 1].replace(/\.[^/.]+$/, "") : 'Unknown Title';

            const title = (item.columns[0] && item.columns[0] !== '?') ? item.columns[0] : fallbackTitle;
            const trackArtist = (item.columns[1] && item.columns[1] !== '?') ? item.columns[1] : fallbackArtist;
            const album = (item.columns[2] && item.columns[2] !== '?') ? item.columns[2] : fallbackAlbum;
            const duration = parseFloat(item.columns[3]) || 0;
            const trackNum = parseInt(item.columns[4], 10) || 0;
            const dateStr = item.columns[5] || '';
            const albumArtistRaw = item.columns[6] || '';
            const discNum = parseInt(item.columns[8], 10) || 1;
            
            const yearMatch = dateStr.match(/\d{4}/);
            const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
            
            const rawArtistString = albumArtistRaw.trim() ? albumArtistRaw : trackArtist;
            const allArtists = extractAllArtists(rawArtistString);
            const mainArtist = allArtists[0];
            const trackKey = `${path}|${title}`;
            // Album key is album name only — any track with the same album tag belongs together
            const albumKey = (album || '').toLowerCase().trim();
            
            allTracks.push({
                title, artist: trackArtist, album, duration, year, path,
                albumArtist: mainArtist,
                albumKey,
                trackNum,
                discNum,
                playlistId: plId,
                itemIndex: globalIndex
            });
            
            if (albumMap.has(albumKey)) {
                const existing = albumMap.get(albumKey);
                if (!seenTrackKeys.has(trackKey)) {
                    existing.trackCount += 1;
                    seenTrackKeys.add(trackKey);
                }
                allArtists.forEach(a => existing.allArtistsSet.add(a.toLowerCase()));
            } else {
                seenTrackKeys.add(trackKey);
                albumMap.set(albumKey, {
                    albumKey,
                    title: album,
                    artist: mainArtist,
                    allArtistsSet: new Set(allArtists.map(a => a.toLowerCase())),
                    year: year,
                    trackCount: 1,
                    playlistId: plId, 
                    itemIndex: globalIndex,
                    trackInfo: {
                        title,
                        artist: trackArtist,
                        path,
                        duration,
                        itemIndex: globalIndex,
                        playlistId: plId
                    }
                });
            }

            // Populate Artist Map for ALL artists
            allArtists.forEach(a => {
                const normArtist = a.toLowerCase();
                if (artistMap.has(normArtist)) {
                    artistMap.get(normArtist).trackCount += 1;
                } else {
                    artistMap.set(normArtist, {
                        name: a,
                        trackCount: 1,
                        playlistId: plId, // For artwork reference
                        itemIndex: globalIndex
                    });
                }
            });
        });
        fetched += items.length;
        if (onProgress) onProgress(`Finalizing... (${fetched}/${totalItems})`, 60 + (fetched/totalItems)*30);
    }

    const result = {
        lastUpdated: new Date().toISOString(),
        playlists, // Note: these are the playlists at time of sync
        albums: Array.from(albumMap.values()).map(a => {
            const { allArtistsSet, ...rest } = a;
            return { ...rest, allArtistsKeys: Array.from(allArtistsSet) };
        }),
        artists: Array.from(artistMap.values()),
        tracksCount: allTracks.length
    };
    
    await saveToCache('library_data', result);
    
    // DE-DUPLICATE tracks by path for Search
    const uniqueTracks = [];
    const seenPaths = new Set();
    for (const t of allTracks) {
        if (!seenPaths.has(t.path)) {
            uniqueTracks.push(t);
            seenPaths.add(t.path);
        }
    }
    
    await saveTracksBulk(uniqueTracks);

    return result;
}

/**
 * Caches artwork for all albums in the library.
 * This is a background task separate from the main sync.
 * @param {Array} albums - Array of album objects with playlistId, itemIndex, artist, title
 * @param {Function} onProgress - Callback(message, percent)
 */
export async function cacheAllArtwork(albums, onProgress, colorExtractorCb) {
    if (!isNative || !albums || albums.length === 0) return;
    const BASE_URL = getApiUrl();
    const { getArtworkQuality } = await import('./artwork');
    const quality = await getArtworkQuality();
    
    for (let j = 0; j < albums.length; j++) {
        const alb = albums[j];
        if (onProgress) onProgress(`Caching artwork ${j + 1}/${albums.length}`, Math.round((j / albums.length) * 100));
        
        const cacheKey = getArtworkCacheKey(alb.artist, alb.title);
        if (!cacheKey) continue; // Skip untagged albums
        
        let artUrl = `${BASE_URL}/artwork/${alb.playlistId}/${alb.itemIndex}`;
        if (quality !== 'max') {
            artUrl += `?width=${quality}`;
        }

        await preCacheArtwork(artUrl, cacheKey);
        
        if (colorExtractorCb) {
            const colorCacheKey = `color_${alb.artist}_${alb.title}`;
            try {
                // Background color caching. By this point the artwork is available locally.
                await colorExtractorCb(artUrl, colorCacheKey, cacheKey);
            } catch(e) {}
        }
    }
    
    if (onProgress) onProgress('Artwork ready!', 100);
}

