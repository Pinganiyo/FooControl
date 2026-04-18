import React, { useState, useEffect } from 'react';
import { getAllCachedTracks } from '../api/libraryCache';
import { useTranslation } from '../contexts/TranslationContext';
import { getArtworkCacheKey, getLocalArtworkUrl } from '../api/artwork';
import { getApiUrl } from '../api/network';
import ProgressiveImage from './ProgressiveImage';
import { playAlbumShuffled } from '../api/beefweb';
import { useLongPress } from '../hooks/useLongPress';

export default function FolderBrowser({ onOpenAlbum, onOpenMenu }) {
    const { t } = useTranslation();
    const [tracks, setTracks] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isBuildingQueue, setIsBuildingQueue] = useState(false);

    useEffect(() => {
        loadTracks();
    }, []);

    const loadTracks = async () => {
        setLoading(true);
        const allTracks = await getAllCachedTracks();
        if (allTracks && allTracks.length > 0) {
            setTracks(allTracks);
            const root = getCommonPathPrefix(allTracks);
            setCurrentPath(root);
            buildEntries(root, allTracks);
        }
        setLoading(false);
    };

    /**
     * Finds the deepest common directory shared by all tracks.
     */
    const getCommonPathPrefix = (allTracks) => {
        if (!allTracks || allTracks.length === 0) return '';
        const paths = allTracks
            .map(t => t.path?.replace(/\//g, '\\'))
            .filter(Boolean);
        
        if (paths.length === 0) return '';
        if (paths.length === 1) {
            const parts = paths[0].split('\\');
            parts.pop();
            return parts.join('\\');
        }

        // Find common prefix by splitting and comparing
        const splitPaths = paths.map(p => p.split('\\'));
        let commonParts = [];
        const first = splitPaths[0];

        for (let i = 0; i < first.length; i++) {
            const part = first[i];
            if (splitPaths.every(p => p[i] === part)) {
                commonParts.push(part);
            } else {
                break;
            }
        }

        return commonParts.join('\\');
    };

    /**
     * Returns the folders and files directly under a given path.
     */
    const getFolderContents = (searchPath, allTracks) => {
        const folderMap = new Map(); // folderName -> first track inside
        const files = [];

        const prefix = searchPath ? searchPath.replace(/\//g, '\\') + '\\' : '';

        allTracks.forEach(track => {
            if (!track.path) return;
            const norm = track.path.replace(/\//g, '\\');
            if (prefix && !norm.startsWith(prefix)) return;

            const relative = prefix ? norm.slice(prefix.length) : norm;
            if (!relative) return;

            const parts = relative.split('\\');
            if (parts.length > 1) {
                // This track is inside a sub-folder
                const folderName = parts[0];
                if (!folderMap.has(folderName)) {
                    folderMap.set(folderName, track); // save first track for cover
                }
            } else {
                // This track is directly in this folder
                files.push(track);
            }
        });

        return {
            folders: Array.from(folderMap.entries()).map(([name, firstTrack]) => ({ name, firstTrack })),
            files
        };
    };

    const buildEntries = (path, allTracks) => {
        const { folders, files } = getFolderContents(path, allTracks);

        const folderEntries = folders.map(({ name, firstTrack }) => {
            const fullPath = path ? `${path.replace(/[\\\/]$/, '')}\\${name}` : name;
            return { name, type: 'folder', path: fullPath, firstTrack };
        });

        const fileEntries = files.map(track => ({
            name: track.title || track.path?.split('\\').pop() || 'Unknown',
            type: 'file',
            track
        }));

        setEntries([
            ...folderEntries.sort((a, b) => a.name.localeCompare(b.name)),
            ...fileEntries.sort((a, b) => (a.track.trackNum || 999) - (b.track.trackNum || 999))
        ]);
    };

    const handleFolderClick = (folder) => {
        let target = folder.path;
        let contents = getFolderContents(target, tracks);

        // Auto-skip: if folder has exactly 1 subfolder and 0 files, descend automatically
        while (contents.folders.length === 1 && contents.files.length === 0) {
            target = `${target}\\${contents.folders[0].name}`;
            contents = getFolderContents(target, tracks);
        }

        // Leaf folder (only files inside) → open as AlbumView
        if (contents.folders.length === 0 && contents.files.length > 0) {
            const firstTrack = contents.files[0];
            const folderName = target.split('\\').pop();
            onOpenAlbum({
                title: folderName,
                artist: firstTrack.albumArtist || firstTrack.artist || 'Unknown Artist',
                playlistId: firstTrack.playlistId,
                itemIndex: firstTrack.itemIndex,
                albumKey: null,
                // Pass tracks directly so AlbumView doesn't need to query
                tracks: contents.files.sort((a, b) => {
                    if ((a.discNum || 1) !== (b.discNum || 1)) return (a.discNum || 1) - (b.discNum || 1);
                    return (a.trackNum || 999) - (b.trackNum || 999);
                })
            });
            return;
        }

        setCurrentPath(target);
        buildEntries(target, tracks);
    };

    const goBack = () => {
        const parts = currentPath.split(/[\\\/]/);
        parts.pop();
        const newPath = parts.join('\\');
        setCurrentPath(newPath);
        buildEntries(newPath, tracks);
    };

    const handleShuffleFolder = async () => {
        if (!tracks || tracks.length === 0) return;
        setIsBuildingQueue(true);
        try {
            const prefix = currentPath ? currentPath.replace(/\//g, '\\') + '\\' : '';
            const allNestedTracks = tracks.filter(t => {
                if (!t.path) return false;
                const norm = t.path.replace(/\//g, '\\');
                return prefix ? norm.startsWith(prefix) : true;
            });

            if (allNestedTracks.length > 0) {
                await playAlbumShuffled(allNestedTracks);
            }
        } catch (e) {
            console.error('Failed to shuffle folder', e);
        } finally {
            setIsBuildingQueue(false);
        }
    };

    const getArtworkSrc = (track) => {
        if (!track || !track.playlistId || track.itemIndex === undefined) return null;
        return `${getApiUrl()}/artwork/${track.playlistId}/${track.itemIndex}?width=150`;
    };

    if (loading) return <div className="placeholder">{t('explore_library')}...</div>;
    if (tracks.length === 0) return (
        <div className="empty-message" style={{ padding: '32px', textAlign: 'center', opacity: 0.5 }}>
            {t('no_matches')}
        </div>
    );

    return (
        <div className="folder-browser">
            <header className="folder-browser-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {currentPath && (
                        <button className="back-btn-small" onClick={goBack}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                    <div className="current-path-display">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6, opacity: 0.5, flexShrink: 0 }}>
                            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                        </svg>
                        {currentPath ? currentPath.split('\\').pop() : t('folders')}
                    </div>
                </div>

                <div className="folder-actions">
                    <button
                        className="album-action-btn secondary"
                        onClick={handleShuffleFolder}
                        disabled={isBuildingQueue}
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                        {isBuildingQueue ? (
                            <div className="mini-spinner" style={{ width: 16, height: 16 }} />
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                            </svg>
                        )}
                        {t('shuffle')}
                    </button>
                </div>
            </header>

            <div className="folder-entries">
                {entries.map((entry, i) => {
                    const artSrc = entry.type === 'folder'
                        ? getArtworkSrc(entry.firstTrack)
                        : getArtworkSrc(entry.track);

                    const cacheKey = entry.type === 'folder'
                        ? getArtworkCacheKey(entry.firstTrack?.albumArtist || entry.firstTrack?.artist, entry.firstTrack?.album)
                        : getArtworkCacheKey(entry.track?.artist, entry.track?.album);

                    if (entry.type === 'folder') {
                        return (
                            <div
                                key={`${entry.type}-${i}`}
                                className={`folder-entry ${entry.type}`}
                                onClick={() => handleFolderClick(entry)}
                            >
                                <div className="folder-entry-cover">
                                    <ProgressiveImage
                                        src={artSrc}
                                        alt={entry.name}
                                        className="folder-entry-art"
                                        cacheKey={cacheKey}
                                    />
                                </div>
                                <div className="entry-info">
                                    <div className="entry-name">{entry.name}</div>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.3, flexShrink: 0 }}>
                                    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                                </svg>
                            </div>
                        );
                    } else {
                        return (
                            <FileRow 
                                key={`file-${i}`}
                                entry={entry}
                                artSrc={artSrc}
                                cacheKey={cacheKey}
                                onOpenMenu={(e) => {
                                    const fileEntries = entries.filter(en => en.type === 'file').map(en => en.track);
                                    onOpenMenu(e, entry.track, fileEntries);
                                }}
                            />
                        );
                    }
                })}
            </div>
        </div>
    );
}

function FileRow({ entry, artSrc, cacheKey, onOpenMenu }) {
    // Row handles long press only
    const longPressProps = useLongPress(onOpenMenu, null);

    const handlePlay = (e) => {
        // Here we'd normally call a click handler passed from FolderBrowser
        // For now, FolderBrowser doesn't have a single-click 'play' logic 
        // that's different from the menu, but we'll prepare the structure.
        e.stopPropagation();
        // If there was a playTrack function, we'd call it here.
    };

    return (
        <div className="folder-entry file" {...longPressProps}>
            <div className="folder-entry-cover" onClick={handlePlay}>
                <ProgressiveImage
                    src={artSrc}
                    alt={entry.name}
                    className="folder-entry-art"
                    cacheKey={cacheKey}
                />
            </div>
            <div className="entry-info" onClick={handlePlay}>
                <div className="entry-name">{entry.name}</div>
                <div className="entry-meta">
                    {entry.track.artist}{entry.track.album ? ` • ${entry.track.album}` : ''}
                </div>
            </div>
        </div>
    );
}
