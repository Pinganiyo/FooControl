import React, { useRef } from 'react';
import { useBeefweb } from '../hooks/useBeefweb';
import { useTranslation } from '../contexts/TranslationContext';
import { playPause, playNext, playPrevious, setPosition } from '../api/beefweb';
import ProgressiveImage from './ProgressiveImage';
import { getApiUrl } from '../api/network';
import { getArtworkCacheKey } from '../api/artwork';

// Helper icons using SVG
const PlayIcon = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
const PauseIcon = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>;
const NextIcon = () => <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>;
const PrevIcon = () => <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>;

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Player({ beefwebState, onOpenQueue, onOpenAlbum }) {
    const { t } = useTranslation();
    const { playerState, isConnected, currentTime, upcomingTracks } = beefwebState;
    const progressRef = useRef(null);
    const holdTimer = useRef(null);

    const handlePointerDown = () => {
        holdTimer.current = setTimeout(() => {
            onOpenQueue();
        }, 600); // 600ms hold
    };

    const clearHold = () => {
        if (holdTimer.current) clearTimeout(holdTimer.current);
    };

    const activeItem = playerState?.activeItem;
    const isPlaying = playerState?.playbackState === 'playing';

    // Parse the data out of columns depending on what Server-Sent Events/Query provides
    // Our hook asked for %title%, %artist%, %album%, %length_seconds% in trcolumns
    const title = activeItem?.columns?.[0] || t('unknown_title');
    const artist = activeItem?.columns?.[1] || t('unknown_artist');
    const album = activeItem?.columns?.[2] || '';
    const duration = parseFloat(activeItem?.columns?.[3]) || activeItem?.duration || 0;

    // Use current time and ensure it doesn't exceed duration
    const displayTime = Math.min(currentTime, duration);
    const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

    const actualNextTrack = upcomingTracks ? upcomingTracks.find(t => t.isUpcoming) : null;
    const isShuffle = playerState?.playbackMode >= 3;

    const handleProgressClick = (e) => {
        if (!duration || !progressRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newPercent = clickX / rect.width;
        const newTime = duration * newPercent;
        setPosition(newTime).catch(console.error);
    };

    if (!isConnected && !playerState) {
        return (
            <div className="status-overlay">
                <div className="fancy-spinner" />
                <span>{t('connecting')}</span>
            </div>
        );
    }

    const artworkUrl = (activeItem && title && title !== 'Unknown Title')
        ? `${getApiUrl()}/artwork/current?maxWidth=1040&maxHeight=1040&_t=${encodeURIComponent(title + artist)}`
        : null;

    return (
        <div className="player-container">
            <div className="player-header">
                {t('now_playing')}
            </div>

            <div className={`album-art-container ${!isPlaying ? 'paused' : ''}`}>
                {activeItem ? (
                    <ProgressiveImage
                        src={artworkUrl}
                        className="album-art"
                        alt="Album Art"
                        onClick={onOpenAlbum}
                        style={{ cursor: 'pointer' }}
                        cacheKey={getArtworkCacheKey(artist, album, title)}
                        crossfade={true}
                    />
                ) : null}
                <div className="no-art" style={{ display: activeItem ? 'none' : 'flex' }}>
                    ♪
                </div>
            </div>

            <div className="track-info">
                <div className="track-title">{activeItem ? title : t('no_track_playing')}</div>
                <div className="track-artist">{activeItem ? artist : '-'}</div>
            </div>

            <div className="progress-container">
                <div className="progress-bar-bg" ref={progressRef} onClick={handleProgressClick}>
                    <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
                </div>
                <div className="time-info">
                    <span>{formatTime(displayTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            <div className="controls">
                <button className="control-btn secondary" onClick={playPrevious} aria-label="Previous">
                    <PrevIcon />
                </button>
                <button className="control-btn play-pause" onClick={playPause} aria-label={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button className="control-btn secondary" onClick={playNext} aria-label="Next">
                    <NextIcon />
                </button>
            </div>

            <div className="player-bottom-layout">
                {(actualNextTrack || isShuffle) && (
                    <div
                        className="up-next"
                        onPointerDown={handlePointerDown}
                        onPointerUp={clearHold}
                        onPointerLeave={clearHold}
                        onPointerCancel={clearHold}
                        title={t('hold_queue')}
                    >
                        {t('up_next')} <span>{actualNextTrack ? actualNextTrack.title : t('random_track')}</span>
                    </div>
                )}
            </div>
        </div>
    );
}