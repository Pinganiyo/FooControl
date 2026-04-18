// API Abstraction for Beefweb Remote Control using Native Capacitor HTTP when available
import { CapacitorHttp } from '@capacitor/core';
import { getApiUrl } from './network';

const isNative = () => window.Capacitor?.isNativePlatform();

export async function nativeFetch(options) {
    if (isNative()) {
        const response = await CapacitorHttp.request({
            ...options
        });
        return {
            ok: response.status >= 200 && response.status < 300,
            json: async () => response.data,
            status: response.status
        };
    }
    // Fallback to standard fetch for browser/dev
    const { url, method, headers, data, ...extra } = options;
    const fetchOptions = {
        method,
        headers,
        ...extra
    };
    if (data) {
        fetchOptions.body = JSON.stringify(data);
    }
    return await fetch(url, fetchOptions);
}

export async function getPlayerState() {
    const cols = encodeURIComponent('%title%,%artist%,%album%,%length_seconds%');
    const url = `${getApiUrl()}/player?columns=${cols}`;
    
    const res = await nativeFetch({ url, method: 'GET' });
    if (!res.ok) throw new Error('Failed to fetch player state');
    
    let data = await res.json();
    
    // Some versions of Beefweb/foobar wrap the response in a "player" object
    if (data && data.player) {
        data = data.player;
    }
    
    // Save for debug box
    localStorage.setItem('foocontrol_last_res', JSON.stringify(data));
    return data;
}

export async function playPause() {
    await nativeFetch({ url: `${getApiUrl()}/player/play-pause`, method: 'POST' });
}

export async function playNext() {
    await nativeFetch({ url: `${getApiUrl()}/player/next`, method: 'POST' });
}

export async function playPrevious() {
    await nativeFetch({ url: `${getApiUrl()}/player/previous`, method: 'POST' });
}

export async function setVolume(volume) {
    await nativeFetch({
        url: `${getApiUrl()}/player`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { volume }
    });
}

export async function setPosition(position) {
    await nativeFetch({
        url: `${getApiUrl()}/player`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { position }
    });
}

const COMMON_COLS = encodeURIComponent('%title%,%artist%,%album%');

export async function getUpcomingTracks(playlistId, currentIndex, playbackMode = 0) {
    try {
        // Quick fetch of manual play queue
        const qUrl = `${getApiUrl()}/playqueue?columns=${COMMON_COLS}`;
        const qRes = await nativeFetch({ url: qUrl, method: 'GET' });
        const qData = qRes.ok ? await qRes.json() : { playQueue: [] };

        let upcoming = [];
        let history = []; // previous + current

        // Fetch Previous (up to 2) and Current track
        if (playlistId && currentIndex !== undefined) {
            const startIdx = Math.max(0, currentIndex - 2);
            const count = currentIndex - startIdx + 1;
            
            if (count > 0) {
                const hUrl = `${getApiUrl()}/playlists/${playlistId}/items/${startIdx}:${count}?columns=${COMMON_COLS}`;
                const histRes = await nativeFetch({ url: hUrl, method: 'GET' });
                if (histRes.ok) {
                    const histData = await histRes.json();
                    if (histData.playlistItems && histData.playlistItems.items) {
                        history = histData.playlistItems.items.map((item, i) => {
                            const actualIndex = startIdx + i;
                            return {
                                isQueue: false,
                                isPrevious: actualIndex < currentIndex,
                                isCurrent: actualIndex === currentIndex,
                                title: item.columns[0] || 'Unknown Title',
                                artist: item.columns[1] || 'Unknown Artist',
                                playlistId: playlistId,
                                itemIndex: actualIndex
                            };
                        });
                    }
                }
            }
        }
        
        // Push manual queued items next
        if (qData.playQueue && qData.playQueue.length > 0) {
            upcoming = qData.playQueue.map(item => ({
                isQueue: true,
                isUpcoming: true,
                title: item.columns[0] || 'Unknown Title',
                artist: item.columns[1] || 'Unknown Artist',
                playlistId: item.playlistId,
                itemIndex: item.itemIndex
            }));
        }

        const isShuffle = playbackMode >= 3;
        let remaining = Math.max(0, 15 - upcoming.length);

        if (!isShuffle && remaining > 0 && playlistId && currentIndex !== undefined) {
            const pUrl = `${getApiUrl()}/playlists/${playlistId}/items/${currentIndex + 1}:${remaining}?columns=${COMMON_COLS}`;
            const pRes = await nativeFetch({ url: pUrl, method: 'GET' });
            if (pRes.ok) {
                const pData = await pRes.json();
                if (pData.playlistItems && pData.playlistItems.items) {
                    const plItems = pData.playlistItems.items.map((item, i) => ({
                        isQueue: false,
                        isUpcoming: true,
                        title: item.columns[0] || 'Unknown Title',
                        artist: item.columns[1] || 'Unknown Artist',
                        playlistId: playlistId,
                        itemIndex: currentIndex + 1 + i
                    }));
                    upcoming = upcoming.concat(plItems);
                }
            }
        }
        
        return [...history, ...upcoming];
    } catch (e) {
        console.error("Failed to fetch upcoming tracks", e);
        return [];
    }
}

export async function playTargetItem(playlistId, index) {
    await nativeFetch({ url: `${getApiUrl()}/player/play/${playlistId}/${index}`, method: 'POST' });
}

export async function setPlaybackMode(mode) {
    await nativeFetch({
        url: `${getApiUrl()}/player`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { playbackMode: mode }
    });
}

export async function getAlbumTracks(playlistId, albumName) {
    if (!playlistId || !albumName) return [];
    try {
        const COL_RAW = "%title%,%artist%,%album%,%length_seconds%,%tracknumber%,%discnumber%,%path%";
        const COLUMNS = encodeURIComponent(COL_RAW);
        const url = `${getApiUrl()}/playlists/${playlistId}/items/0:5000?columns=${COLUMNS}`;
        
        const res = await nativeFetch({ url, method: 'GET' });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.playlistItems || !data.playlistItems.items) return [];

        const items = data.playlistItems.items;
        let albumTracks = [];
        
        for (let i = 0; i < items.length; i++) {
            const trackAlbum = items[i].columns[2];
            if (trackAlbum && trackAlbum === albumName) {
                const trkStr = items[i].columns[4];
                const discStr = items[i].columns[5];
                
                albumTracks.push({
                    title: items[i].columns[0] || 'Unknown Title',
                    artist: items[i].columns[1] || 'Unknown Artist',
                    album: items[i].columns[2],
                    duration: parseFloat(items[i].columns[3]) || 0,
                    trackNum: parseInt(trkStr, 10) || 0,
                    discNum: parseInt(discStr, 10) || 1,
                    playlistId: playlistId,
                    itemIndex: i,
                    path: items[i].columns[6] || ''
                });
            }
        }

        const seen = new Set();
        albumTracks = albumTracks.filter(track => {
            const id = `${track.discNum}-${track.trackNum}-${track.title}`;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        albumTracks.sort((a, b) => {
            if (a.discNum !== b.discNum) return a.discNum - b.discNum;
            return a.trackNum - b.trackNum;
        });

        return albumTracks;
    } catch (e) {
        console.error("Failed to fetch album tracks", e);
        return [];
    }
}

/**
 * Shuffles an album's tracks and plays them as a sequential playlist.
 * Creates/reuses a managed 'FooControl_Queue' playlist in foobar2000.
 * @param {Array} tracks - Array of track objects with a `path` property
 */
export async function playAlbumShuffled(tracks) {
    if (!tracks || tracks.length === 0) return;
    const BASE_URL = getApiUrl();

    // Fisher-Yates shuffle on a copy
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 1. Get or create FooControl playlist
    const plRes = await nativeFetch({ url: `${BASE_URL}/playlists`, method: 'GET' });
    const plData = await plRes.json();
    let queuePl = (plData.playlists || []).find(p => p.title === 'FooControl');

    let plId;
    if (!queuePl) {
        const createRes = await nativeFetch({
            url: `${BASE_URL}/playlists/add`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: { title: 'FooControl' }
        });
        const created = await createRes.json();
        plId = created.id;
    } else {
        plId = queuePl.id;
        // Clear existing contents using the correct Beefweb endpoint
        await nativeFetch({ url: `${BASE_URL}/playlists/${plId}/clear`, method: 'POST' });
    }

    // 2. Add shuffled track paths one by one
    // We add them individually because batch-adding triggers Foobar2000's auto-sorting,
    // which undoes our shuffle. Sequential appends guarantee the exact randomized order.
    const paths = shuffled.map(t => t.path).filter(Boolean);
    for (const path of paths) {
        await nativeFetch({
            url: `${BASE_URL}/playlists/${plId}/items/add`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: { items: [path] }
        });
    }

    // 3. Set sequential mode and play from index 0
    await setPlaybackMode(0);
    await playTargetItem(plId, 0);
}

/**
 * Adds a track to the playback queue.
 */
export async function addToQueue(playlistId, itemIndex) {
    const BASE_URL = getApiUrl();
    // Assuming Beefweb POST /playqueue/items/add
    await nativeFetch({
        url: `${BASE_URL}/playqueue/items/add`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { playlistIndex: playlistId, itemIndex }
    });
}

/**
 * Adds a track to the top of the playback queue (Play Next).
 */
export async function queueNext(playlistId, itemIndex) {
    const BASE_URL = getApiUrl();
    // Some Beefweb versions support addToTop, otherwise we'd need to manipulate the queue.
    // We'll try the standard approach first.
    await nativeFetch({
        url: `${BASE_URL}/playqueue/items/add`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { playlistIndex: playlistId, itemIndex, addToTop: true }
    });
}

/**
 * Shuffles a list of tracks but keeps the chosen one at the start.
 */
export async function playContextShuffled(tracks, startIndex) {
    if (!tracks || tracks.length === 0) return;
    
    // 1. Separate the first track
    const firstTrack = tracks[startIndex];
    const others = tracks.filter((_, i) => i !== startIndex);
    
    // 2. Shuffle the rest (Fisher-Yates)
    for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
    }
    
    // 3. Recombine
    const finalOrder = [firstTrack, ...others];
    
    // 4. Use existing playAlbumShuffled-like logic
    await playAlbumShuffled(finalOrder);
}

/**
 * Inserts tracks into a specific playlist at a target index.
 */
export async function insertIntoPlaylist(playlistId, targetIndex, paths) {
    const BASE_URL = getApiUrl();
    await nativeFetch({
        url: `${BASE_URL}/playlists/${playlistId}/items/add`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { 
            items: paths,
            index: targetIndex
        }
    });
}

/**
 * Gets or creates the primary FooControl playlist.
 */
export async function getOrCreatePlaylist() {
    const BASE_URL = getApiUrl();
    const plRes = await nativeFetch({ url: `${BASE_URL}/playlists`, method: 'GET' });
    const plData = await plRes.json();
    const playlists = plData.playlists || [];
    
    let fooPl = playlists.find(p => p.title === 'FooControl');
    if (fooPl) return fooPl.id;

    const createRes = await nativeFetch({
        url: `${BASE_URL}/playlists/add`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { title: 'FooControl' }
    });
    const created = await createRes.json();
    return created.id;
}

/**
 * Batch adds tracks to a playlist.
 */
export async function addTracksToPlaylist(playlistId, paths) {
    const BASE_URL = getApiUrl();
    // Batch add items
    await nativeFetch({
        url: `${BASE_URL}/playlists/${playlistId}/items/add`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { items: paths }
    });
}
