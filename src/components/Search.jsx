import React, { useState, useEffect } from 'react';
import { getAllCachedTracks } from '../api/libraryCache';
import { useTranslation } from '../contexts/TranslationContext';
import { playTargetItem } from '../api/beefweb';
import ProgressiveImage from './ProgressiveImage';
import { getApiUrl } from '../api/network';
import { getArtworkCacheKey } from '../api/artwork';
import { useLongPress } from '../hooks/useLongPress';

export default function Search({ beefwebState, onOpenMenu }) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [allTracks, setAllTracks] = useState([]);
    const [results, setResults] = useState([]);

    useEffect(() => {
        getAllCachedTracks().then(tracks => {
            if (tracks) setAllTracks(tracks);
        });
    }, []);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const q = query.toLowerCase();
        const filtered = allTracks.filter(t => 
            (t.title || '').toLowerCase().includes(q) || 
            (t.artist || '').toLowerCase().includes(q) || 
            (t.album || '').toLowerCase().includes(q)
        ).slice(0, 50); // Limit results for performance

        setResults(filtered);
    }, [query, allTracks]);

    const handlePlay = (track) => {
        playTargetItem(track.playlistId, track.itemIndex).then(() => {
            if (beefwebState && beefwebState.refresh) {
                beefwebState.refresh();
            }
        });
    };

    return (
        <div className="search-container">
            <header className="search-header">
                <div className="search-bar-wrapper">
                    <svg className="search-icon-inline" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input 
                        type="text" 
                        className="search-input" 
                        placeholder={t('search_placeholder')} 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>
            </header>

            <div className="search-results">
                {results.length > 0 ? (
                    results.map((track, i) => (
                        <SearchItem 
                            key={`search-res-${i}`} 
                            track={track} 
                            onClick={() => handlePlay(track)} 
                            onOpenMenu={(e) => onOpenMenu(e, track, results)}
                        />
                    ))
                ) : query.trim() ? (
                    <div className="no-results">{t('no_matches')} "{query}"</div>
                ) : (
                    <div className="search-placeholder">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <p>{t('search_desc')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function SearchItem({ track, onClick, onOpenMenu }) {
    // Row handles long press only
    const longPressProps = useLongPress(onOpenMenu, null);

    const handlePlay = (e) => {
        e.stopPropagation();
        onClick();
    };
    
    return (
        <div className="search-result-item" {...longPressProps}>
            <div className="search-result-art" onClick={handlePlay}>
                <ProgressiveImage 
                    src={`${getApiUrl()}/artwork/${track.playlistId}/${track.itemIndex}?_t=${encodeURIComponent(track.title)}&width=100`}
                    alt=""
                    cacheKey={getArtworkCacheKey(track.artist, track.album)}
                />
            </div>
            <div className="search-result-info" onClick={handlePlay}>
                <div className="search-result-title">{track.title}</div>
                <div className="search-result-meta">{track.artist} • {track.album}</div>
            </div>
        </div>
    );
}
