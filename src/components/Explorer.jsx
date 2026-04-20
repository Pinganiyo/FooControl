import React, { useState, useEffect } from 'react';
import FolderBrowser from './FolderBrowser';
import ArtistBrowser from './ArtistBrowser';
import { useTranslation } from '../contexts/TranslationContext';
import ProgressiveImage from './ProgressiveImage';
import { getApiUrl } from '../api/network';
import { getArtworkCacheKey } from '../api/artwork';

export default function Explorer({ library, isSyncing, syncStatus, isArtworkCaching, artworkCacheStatus, onSync, onDeepSync, onOpenAlbum, onOpenMenu, onShuffleArtist, view, setView, selectedArtist, setSelectedArtist }) {
    const { t } = useTranslation();
    const [showDeepSyncSetup, setShowDeepSyncSetup] = useState(false);
    const [deepSyncPaths, setDeepSyncPaths] = useState('C:\\Users\\Ruben\\Music\\a.Flac\nC:\\Users\\Ruben\\Music\\M.Others');

    // Grid settings
    const [gridCols, setGridCols] = useState(() => {
        return parseInt(localStorage.getItem('explorer_cols')) || 2;
    });

    // Sort settings
    const [sortBy, setSortBy] = useState(() => {
        return localStorage.getItem('explorer_sort') || 'name';
    });

    // Album Type Filter (All, Albums, Singles)
    const [typeFilter, setTypeFilter] = useState(() => {
        return localStorage.getItem('explorer_type_filter') || 'all';
    });

    useEffect(() => {
        localStorage.setItem('explorer_cols', gridCols);
    }, [gridCols]);

    useEffect(() => {
        localStorage.setItem('explorer_sort', sortBy);
    }, [sortBy]);

    useEffect(() => {
        localStorage.setItem('explorer_type_filter', typeFilter);
    }, [typeFilter]);

    const toggleGrid = () => {
        setGridCols(prev => prev === 2 ? 3 : prev === 3 ? 4 : 2);
    };

    const getSortedAlbums = () => {
        let items = [];
        if (view === 'artist_albums' && selectedArtist) {
            const query = selectedArtist.toLowerCase();
            items = (library?.albums || []).filter(a => {
                if (a.allArtistsKeys) {
                    return a.allArtistsKeys.includes(query);
                }
                return (a.artist || '').toLowerCase() === query;
            });
        } else {
            if (!library?.albums) return [];
            items = [...library.albums];
        }

        // Apply Album Type Filter
        if (typeFilter === 'albums') {
            items = items.filter(a => (a.trackCount || 0) >= 2);
        } else if (typeFilter === 'singles') {
            items = items.filter(a => (a.trackCount || 0) < 2);
        }

        switch (sortBy) {
            case 'year':
                // Sub-sort by artist/title for consistent grouping
                return items.sort((a, b) => {
                    const yearDiff = (b.year || 0) - (a.year || 0);
                    if (yearDiff !== 0) return yearDiff;
                    return (a.artist || "").localeCompare(b.artist || "") || a.title.localeCompare(b.title);
                });
            case 'artist':
                return items.sort((a, b) => a.artist.localeCompare(b.artist));
            case 'tracks':
                return items.sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0));
            case 'name':
            default:
                return items.sort((a, b) => a.title.localeCompare(b.title));
        }
    };

    const sortedAlbums = getSortedAlbums();

    if (isSyncing) {
        return (
            <div className="explorer-container syncing">
                <div className="fancy-spinner"></div>
                <h2>{t('syncing_library')}</h2>
                <p>{syncStatus}</p>
            </div>
        );
    }

    const getTitle = () => {
        switch (view) {
            case 'albums': return t('all_albums');
            case 'artists': return t('artists');
            case 'artist_albums': return selectedArtist ? selectedArtist : t('artist_albums');
            case 'folders': return t('folders');
            default: return t('explore_library');
        }
    };

    return (
        <div className="explorer-container" style={{ '--album-grid-cols': gridCols }}>
            <header className="explorer-header menu-header">
                <div className="header-left">
                    {view !== 'menu' && (
                        <button className="back-btn-small" onClick={() => {
                            if (view === 'artist_albums') {
                                setView('artists');
                            } else {
                                setView('menu');
                            }
                        }} title={t('back')}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                    <h2 className="explorer-title">{getTitle()}</h2>
                </div>

                <div className="explorer-actions">
                    {view !== 'artist_albums' && view !== 'menu' && (
                        <button
                            className={`sync-btn-small ${showDeepSyncSetup ? 'active' : ''}`}
                            onClick={() => setShowDeepSyncSetup(!showDeepSyncSetup)}
                            title={t('deep_sync')}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                        </button>
                    )}
                    {view === 'artist_albums' && (
                        <button
                            className="sync-btn-small"
                            onClick={() => onShuffleArtist(selectedArtist)}
                            title={t('shuffle_artist')}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                            </svg>
                        </button>
                    )}
                    {(view === 'albums' || view === 'artist_albums') && (
                        <button className="sync-btn-small" onClick={toggleGrid} title={t('change_layout')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="14" y="14" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                            </svg>
                        </button>
                    )}
                    {view !== 'artist_albums' && view !== 'menu' && (
                        <button className={`sync-btn-small ${isArtworkCaching ? 'artwork-caching' : ''}`} onClick={onSync} title={isArtworkCaching ? artworkCacheStatus : t('sync_library')}>
                            <svg className={isSyncing ? 'spinning' : ''} width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                            </svg>
                        </button>
                    )}
                </div>
            </header>

            {showDeepSyncSetup && (
                <div className="deep-sync-overlay">
                    <h3>{t('deep_search_title')}</h3>
                    <p>{t('deep_search_help')}</p>
                    <textarea
                        className="deep-sync-textarea"
                        value={deepSyncPaths}
                        onChange={(e) => setDeepSyncPaths(e.target.value)}
                        placeholder="C:\Music"
                    />
                    <div className="deep-sync-actions">
                        <button className="btn-secondary" onClick={() => setShowDeepSyncSetup(false)}>{t('cancel')}</button>
                        <button className="btn-primary" onClick={() => {
                            const paths = deepSyncPaths.split('\n').map(p => p.trim()).filter(p => p);
                            onDeepSync(paths);
                            setShowDeepSyncSetup(false);
                        }}>{t('start_deep_scan')}</button>
                    </div>
                </div>
            )}

            {isArtworkCaching && (
                <div className="sync-banner artwork-caching-banner">
                    <div className="mini-spinner"></div>
                    <span className="sync-status-msg">🎨 {artworkCacheStatus || t('artwork_caching')}</span>
                </div>
            )}

            {isSyncing && (
                <div className="sync-banner">
                    <div className="mini-spinner"></div>
                    <span className="sync-status-msg">{syncStatus}</span>
                </div>
            )}

            {(view === 'albums' || view === 'artist_albums') && (
                <div className="filter-bar">
                    <div className="filter-group">
                        <select
                            className="sort-select"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                        >
                            <option value="name">{t('sort_name')}</option>
                            <option value="year">{t('sort_year')}</option>
                            {view !== 'artist_albums' && <option value="artist">{t('sort_artist')}</option>}
                            <option value="tracks">{t('sort_tracks')}</option>
                        </select>
                        <select
                            className="sort-select"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                        >
                            <option value="all">{t('filter_all')}</option>
                            <option value="albums">{t('filter_albums')}</option>
                            <option value="singles">{t('filter_singles')}</option>
                        </select>
                    </div>

                    <div className="album-count">
                        {sortedAlbums.length} {sortedAlbums.length === 1 ? t('album') : t('albums')}
                    </div>
                </div>
            )}

            <div className="explorer-content">
                {view === 'menu' ? (
                    <div className="explorer-menu">
                        <div className="menu-card" onClick={() => setView('artists')}>
                            <div className="menu-card-icon playlists">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="7" r="4" /><path d="M5.5 21v-2a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v2" /></svg>
                            </div>
                            <div className="menu-card-info">
                                <h3>{t('artists')}</h3>
                                <p>{library?.artists?.length || 0} {t('artists')}</p>
                            </div>
                        </div>

                        <div className="menu-card" onClick={() => setView('albums')}>
                            <div className="menu-card-icon albums">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                            </div>
                            <div className="menu-card-info">
                                <h3>{t('all_albums')}</h3>
                                <p>{library?.albums?.length || 0} {t('collections')}</p>
                            </div>
                        </div>

                        <div className="menu-card" onClick={() => setView('folders')}>
                            <div className="menu-card-icon folders">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                            </div>
                            <div className="menu-card-info">
                                <h3>{t('folders')}</h3>
                                <p>{library?.tracksCount || 0} {t('files_found')}</p>
                            </div>
                        </div>
                    </div>
                ) : (view === 'albums' || view === 'artist_albums') ? (
                    <div className="album-grid">
                        {sortedAlbums.map((album, i) => {
                            const showYearHeader = sortBy === 'year' && (i === 0 || album.year !== sortedAlbums[i - 1].year);

                            return (
                                <React.Fragment key={`album-wrapper-${i}`}>
                                    {showYearHeader && (
                                        <div className="grid-year-header">
                                            <span>{album.year || t('unknown_year')}</span>
                                            <div className="divider-line"></div>
                                        </div>
                                    )}
                                    <div 
                                        className="album-card" 
                                        onClick={() => onOpenAlbum(album)}
                                        onContextMenu={(e) => {
                                            onOpenMenu(e, album, [], true);
                                        }}
                                    >
                                        <div className="album-card-art-container">
                                            <ProgressiveImage
                                                src={(!isSyncing && album.itemIndex >= 0) ? `${getApiUrl()}/artwork/${album.playlistId}/${album.itemIndex}?_t=${encodeURIComponent(album.title)}&width=300` : null}
                                                alt={album.title}
                                                className="album-card-art"
                                                cacheKey={getArtworkCacheKey(album.artist, album.title)}
                                            />
                                        </div>
                                        <div className="album-card-info">
                                            <div className="album-card-title">{album.title}</div>
                                            <div className="album-card-artist">
                                                {view !== 'artist_albums' && `${album.artist} • `}{album.trackCount} {album.trackCount === 1 ? t('track') : t('tracks')}
                                            </div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                ) : view === 'artists' ? (
                    <ArtistBrowser
                        artists={library?.artists || []}
                        isSyncing={isSyncing}
                        onOpenArtist={(artistName) => {
                            setSelectedArtist(artistName);
                            setView('artist_albums');
                        }}
                        onShuffleArtist={onShuffleArtist}
                    />
                ) : (
                    <FolderBrowser onOpenAlbum={onOpenAlbum} onOpenMenu={onOpenMenu} />
                )}
            </div>
        </div>
    );
}
