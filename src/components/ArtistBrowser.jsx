import React, { useState, useMemo } from 'react';
import ProgressiveImage from './ProgressiveImage';
import { useTranslation } from '../contexts/TranslationContext';
import { getApiUrl } from '../api/network';
import { getArtworkCacheKey } from '../api/artwork';

export default function ArtistBrowser({ artists = [], onOpenArtist, isSyncing }) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('tracks');

    const filteredAndSortedArtists = useMemo(() => {
        let result = [...artists];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(a => a.name.toLowerCase().includes(query));
        }

        switch (sortBy) {
            case 'name':
                result.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'tracks':
            default:
                result.sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0));
                break;
        }

        return result;
    }, [artists, searchQuery, sortBy]);

    if (isSyncing) {
        return (
            <div className="album-loading" style={{ marginTop: '4rem' }}>
                 <div className="fancy-spinner"></div>
                 <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>{t('syncing_library')}</p>
            </div>
        );
    }

    if (!artists || artists.length === 0) {
        return (
            <div className="empty-message" style={{ padding: '3rem', textAlign: 'center' }}>
                {t('no_matches')}
            </div>
        );
    }

    return (
        <div className="artist-browser">
            <div className="filter-bar">
                <div className="artist-search-wrapper">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input 
                        type="text" 
                        placeholder={t('search_placeholder')} 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                </div>
                
                <div className="sort-controls">
                    <span className="filter-label">Sort:</span>
                    <select 
                        className="sort-select" 
                        value={sortBy} 
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="tracks">{t('sort_tracks')}</option>
                        <option value="name">{t('sort_name')}</option>
                    </select>
                </div>
            </div>

            <div className="artist-count-label">
                {filteredAndSortedArtists.length} {t('artists')}
            </div>

            <div className="album-grid artist-grid">
                {filteredAndSortedArtists.map((artist, i) => (
                    <div key={`artist-card-${i}`} className="album-card artist-card" onClick={() => onOpenArtist(artist.name)}>
                        <div className="album-card-art-container artist-card-art-container">
                            <ProgressiveImage 
                                src={artist.itemIndex !== undefined ? `${getApiUrl()}/artwork/${artist.playlistId}/${artist.itemIndex}?_t=${encodeURIComponent(artist.name)}&width=300` : null} 
                                alt={artist.name}
                                className="album-card-art artist-card-art"
                                cacheKey={getArtworkCacheKey(artist.name, null)}
                            />
                        </div>
                        <div className="album-card-info artist-card-info">
                            <div className="album-card-title artist-card-title">{artist.name}</div>
                            <div className="album-card-artist artist-card-meta">
                                {artist.trackCount} {artist.trackCount === 1 ? t('track') : t('tracks')}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
