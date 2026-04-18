import React, { useState, useEffect } from 'react';
import { getAlbumTracks, playTargetItem, setPlaybackMode, playAlbumShuffled } from '../api/beefweb';
import { useTranslation } from '../contexts/TranslationContext';
import ProgressiveImage from './ProgressiveImage';
import { getApiUrl } from '../api/network';
import { getDominantColor, applyThemeColor } from '../api/colorExtractor';
import { getArtworkCacheKey } from '../api/artwork';
import { getTracksByAlbum } from '../api/libraryCache';
import { useLongPress } from '../hooks/useLongPress';

export default function AlbumView({ beefwebState, onClose, albumData, onOpenMenu }) {
    const { t } = useTranslation();
    const { playerState } = beefwebState;
    const activeItem = playerState?.activeItem;

    // Determine which album to show: either from props (Explorer) or current player state
    const targetPlaylistId = albumData ? albumData.playlistId : activeItem?.playlistId;
    const targetAlbumName = albumData ? albumData.title : (activeItem?.columns?.[2] || 'Unknown Album');
    const targetArtistName = albumData ? albumData.artist : (activeItem?.columns?.[1] || 'Unknown Artist');
    const targetTrackIndex = albumData ? albumData.itemIndex : activeItem?.index;
    const targetTitle = albumData ? albumData.title : (activeItem?.columns?.[0] || '');
    const targetAlbumKey = albumData?.albumKey;

    const [tracks, setTracks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [isBuildingQueue, setIsBuildingQueue] = useState(false);

    const artworkUrl = (targetPlaylistId && targetTrackIndex >= 0)
        ? `${getApiUrl()}/artwork/${targetPlaylistId}/${targetTrackIndex}?_t=${encodeURIComponent(targetTitle + targetArtistName)}`
        : null;

    useEffect(() => {
        if (!targetAlbumName) return;

        // Fast path: tracks were pre-loaded (e.g., from FolderBrowser)
        if (albumData?.tracks?.length > 0) {
            setTracks(albumData.tracks);
            setIsLoading(false);
            setIsOffline(false);
            return;
        }

        setIsLoading(true);
        setIsOffline(false);

        const loadTracks = async () => {
            // PRIORITY 1: Local cache
            const cached = await getTracksByAlbum(targetAlbumName, null, targetAlbumKey);
            if (cached && cached.length > 0) {
                setTracks(cached);
                setIsOffline(false);
                setIsLoading(false);
                return;
            }

            // PRIORITY 2: Network fallback
            if (targetPlaylistId) {
                try {
                    const fetched = await getAlbumTracks(targetPlaylistId, targetAlbumName);
                    if (fetched && fetched.length > 0) {
                        setTracks(fetched);
                        setIsOffline(false);
                    }
                } catch (e) { }
            }

            setIsLoading(false);
        };

        loadTracks();
    }, [targetPlaylistId, targetAlbumName, targetAlbumKey, albumData?.tracks]);

    // ADAPTIVE COLOR FOR THE VIEWED ALBUM
    useEffect(() => {
        const isEnabled = localStorage.getItem('adaptive_color_enabled') === 'true';
        if (!isEnabled || !artworkUrl) return;

        // Add width=100 for faster extraction
        const thumbUrl = `${artworkUrl}&width=100`;
        const cacheKey = `color_album_${targetArtistName}_${targetAlbumName}`;

        const timer = setTimeout(() => {
            getDominantColor(thumbUrl, cacheKey).then(color => {
                if (localStorage.getItem('adaptive_color_enabled') === 'true') {
                    applyThemeColor(color);
                }
            });
        }, 50);

        return () => clearTimeout(timer);
    }, [artworkUrl]);

    const handlePlayTrack = (index, shuffleRest = false) => {
        setPlaybackMode(shuffleRest ? 4 : 0).then(() => {
            playTargetItem(targetPlaylistId, index).then(() => {
                if (beefwebState && beefwebState.refresh) {
                    beefwebState.refresh();
                }
            }).catch(console.error);
        });
    };

    const handlePlayAlbum = () => {
        if (tracks.length > 0) {
            handlePlayTrack(tracks[0].itemIndex, false);
        }
    };

    const handleShuffleAlbum = async () => {
        if (tracks.length === 0) return;
        setIsBuildingQueue(true);
        try {
            await playAlbumShuffled(tracks);
            if (beefwebState?.refresh) beefwebState.refresh();
        } catch (e) {
            console.error('Shuffle failed', e);
        } finally {
            setIsBuildingQueue(false);
        }
    };

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    return (
        <div className="album-screen-container">
            <button className="back-btn floating-back" onClick={onClose} aria-label="Back">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
                </svg>
            </button>

            <div className="album-content-overlay">
                <div className="album-hero-art">
                    <div className="album-hero-reflect-wrapper">
                        <ProgressiveImage
                            src={artworkUrl}
                            alt={targetAlbumName}
                            className="album-hero-img-full"
                            cacheKey={getArtworkCacheKey(targetArtistName, targetAlbumName)}
                        />
                    </div>
                    <div className="album-hero-title-overlay">
                        <h2 className="album-header-title">{targetAlbumName}</h2>
                        {isOffline && <span className="offline-badge">{t('offline_cache')}</span>}
                    </div>
                </div>

                <div className="album-header">

                    <div className="album-action-row">
                        <button className="album-action-btn primary" onClick={handlePlayAlbum}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            {t('play')}
                        </button>
                        <button className="album-action-btn secondary" onClick={handleShuffleAlbum} disabled={isBuildingQueue}>
                            {isBuildingQueue ? (
                                <div className="mini-spinner" style={{ width: 18, height: 18 }} />
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                                </svg>
                            )}
                            {isBuildingQueue ? t('building') : t('shuffle')}
                        </button>
                    </div>

                </div>

                <div className="album-tracklist">
                    {isLoading ? (
                        <div className="album-loading"><div className="fancy-spinner" /></div>
                    ) : (() => {
                        // Check if album has multiple discs
                        const discNums = [...new Set(tracks.map(t => t.discNum || 1))].sort((a, b) => a - b);
                        const isMultiDisc = discNums.length > 1;
                        let lastDisc = null;

                        return tracks.map((track, i) => {
                            const disc = track.discNum || 1;
                            const showDiscHeader = isMultiDisc && disc !== lastDisc;
                            lastDisc = disc;

                            return (
                                <React.Fragment key={`frag-${i}`}>
                                    {showDiscHeader && (
                                        <div className="disc-divider">
                                            <span>{t('disc')} {disc}</span>
                                        </div>
                                    )}
                                    <TrackRow 
                                        key={`album-trk-${i}`}
                                        track={track}
                                        index={i}
                                        isActive={track.itemIndex === activeItem?.index}
                                        isMultiDisc={isMultiDisc}
                                        onClick={() => handlePlayTrack(track.itemIndex, false)}
                                        onOpenMenu={(e) => onOpenMenu(e, track, tracks)}
                                        formatTime={formatTime}
                                    />
                                </React.Fragment>
                            );
                        });
                    })()}
                </div>
            </div>
        </div>
    );
}

function TrackRow({ track, index, isActive, isMultiDisc, onClick, onOpenMenu, formatTime }) {
    // Row handles long press only (for menu)
    const longPressProps = useLongPress(onOpenMenu, null);

    const handleTextClick = (e) => {
        e.stopPropagation();
        onClick();
    };

    return (
        <div className={`album-track-item ${isActive ? 'active' : ''}`} {...longPressProps}>
            <div className="album-track-num" onClick={handleTextClick}>
                {track.trackNum > 0 ? track.trackNum : index + 1}
            </div>
            <div className="album-track-info" onClick={handleTextClick}>
                <div className="album-track-title">{track.title}</div>
                {isMultiDisc && track.artist && (
                    <div className="album-track-artist">{track.artist}</div>
                )}
            </div>
            <div className="album-track-duration">{formatTime(track.duration)}</div>
        </div>
    );
}
