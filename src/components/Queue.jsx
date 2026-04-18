import React from 'react';
import { playTargetItem } from '../api/beefweb';
import { getApiUrl } from '../api/network';

export default function Queue({ beefwebState, onClose, manualQueueOffset = 0 }) {
    const { playerState, upcomingTracks } = beefwebState;
    const isShuffle = playerState?.playbackMode >= 3;
    const hasUpcoming = upcomingTracks.some(t => t.isUpcoming);
    
    // Quick handle of playing a target item, then optionally closing queue
    const handleItemClick = (playlistId, index) => {
        playTargetItem(playlistId, index).catch(console.error);
        onClose(); // Optional: close queue when an item is selected
    };

    return (
        <div className="queue-container">
            <div className="queue-header">
                <button className="back-btn" onClick={onClose} aria-label="Back">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
                    </svg>
                </button>
                <h2>Songs Order</h2>
                <div style={{width: 28}}></div>
            </div>

            <div className="queue-list">
                {upcomingTracks.length === 0 ? (
                    <div className="empty-queue">No upcoming songs</div>
                ) : (
                    upcomingTracks.map((track, i) => {
                        const isNext = i === 0 && !track.isPrevious && !track.isCurrent;
                        const isCued = i < manualQueueOffset;
                        
                        return (
                            <div 
                                className={`queue-item ${track.isPrevious ? 'previous' : ''} ${track.isCurrent ? 'current' : ''} ${isNext ? 'next' : ''} ${isCued ? 'cued' : ''}`}
                                key={`${track.playlistId}-${track.itemIndex}-${i}`}
                                onClick={() => handleItemClick(track.playlistId, track.itemIndex)}
                            >
                            <div className="queue-item-icon-container">
                                <img 
                                    src={`${getApiUrl()}/artwork/${track.playlistId}/${track.itemIndex}?_t=${encodeURIComponent(track.title)}&width=150`}
                                    alt="Art"
                                    className="queue-item-art"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <div className="queue-item-icon-fallback" style={{display: 'none'}}>
                                    {track.isQueue ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent-color)">
                                            <path d="M4 15h16v-2H4v2zm0 4h16v-2H4v2zm0-8h16V9H4v2zm0-6v2h16V5H4z"/>
                                        </svg>
                                    ) : track.isCurrent ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    ) : (
                                        <span style={{opacity: 0.5}}>{track.itemIndex + 1}</span>
                                    )}
                                </div>
                            </div>
                            <div className="queue-item-info">
                                <div className="queue-item-title">
                                    {track.title}
                                    {isNext && <span className="queue-badge next">NEXT</span>}
                                    {isCued && !isNext && <span className="queue-badge cued">CUED</span>}
                                </div>
                                <div className="queue-item-artist">{track.artist}</div>
                            </div>
                            </div>
                        );
                    })
                )}
                {(isShuffle && !hasUpcoming) && (
                    <div className="queue-item" style={{opacity: 0.7}}>
                        <div className="queue-item-icon-container" style={{background: 'transparent'}}>
                            <div className="queue-item-icon-fallback" style={{fontSize: '1.5rem'}}>🔀</div>
                        </div>
                        <div className="queue-item-info">
                            <div className="queue-item-title">Shuffle Mode</div>
                            <div className="queue-item-artist">Next tracks will be selected randomly</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
