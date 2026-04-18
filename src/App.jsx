import React, { useState, useEffect } from 'react';
import Player from './components/Player';
import Queue from './components/Queue';
import AlbumView from './components/AlbumView';
import BottomNav from './components/BottomNav';
import Explorer from './components/Explorer';
import Search from './components/Search';
import { ExplorerScreen, SearchScreen } from './components/Placeholders';
import Settings from './components/Settings';
import { useBeefweb } from './hooks/useBeefweb';
import { useTranslation } from './contexts/TranslationContext';
import { getCachedData, performFullSync, performDeepSync, cacheAllArtwork, getAllCachedTracks } from './api/libraryCache';
import { getDominantColor, applyThemeColor } from './api/colorExtractor';
import { clearLocalArtworkCache, getArtworkCacheKey, preCacheArtwork } from './api/artwork';
import { getApiUrl, getServerUrlAsync, getServerUrl } from './api/network';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import ContextMenu from './components/ContextMenu';
import { addToQueue, queueNext, playContextShuffled, insertIntoPlaylist, getOrCreatePlaylist, playAlbumShuffled } from './api/beefweb';

const isNative = Capacitor.isNativePlatform();

function App() {
  const { t } = useTranslation();
  const beefwebState = useBeefweb();
  const [currentView, setCurrentView] = useState('player');
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  // Tracks items inserted after current song to handle "Add to Queue" vs "Play Next"
  const [manualQueueOffset, setManualQueueOffset] = useState(0);

  // Context Menu State
  const [menuState, setMenuState] = useState({
    isOpen: false,
    x: 0,
    y: 0,
    track: null,
    contextTracks: []
  });

  // Dual-Layer Background Crossfade State
  const [bgState, setBgState] = useState({
    activeLayer: 1,
    bg1: null,
    bg2: null
  });
  
  // Global Library Sync State
  const [libraryData, setLibraryData] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isArtworkCaching, setIsArtworkCaching] = useState(false);
  const [artworkCacheStatus, setArtworkCacheStatus] = useState('');

  useEffect(() => {
    initLibrary();
  }, []);

  const initLibrary = async () => {
    // 1. FAST HYDRATION: Load Library data from cache FIRST for zero-wait UI
    const cached = await getCachedData('library_data');
    if (cached) {
      setLibraryData(cached);
    }

    // 2. Load server configuration
    await getServerUrlAsync();

    // 3. Hydrate Settings (like adaptive color)
    if (isNative) {
      const { value } = await Preferences.get({ key: 'adaptive_color_enabled' });
      if (value !== null) {
        localStorage.setItem('adaptive_color_enabled', value);
      }
    }

    // 4. Auto-sync only if library is empty AND server is configured
    if (!cached) {
      const srv = getServerUrl();
      if (srv && (srv.startsWith('http://') || srv.startsWith('https://'))) {
        handleGlobalSync();
      }
      // If no server URL, user must configure it in Settings first.
    }
  };

  const handleGlobalSync = async () => {
    setIsSyncing(true);
    setSyncStatus(t('starting_sync'));
    try {
      const result = await performFullSync((msg) => setSyncStatus(msg));
      setLibraryData(result);
      clearLocalArtworkCache();
      // Start background artwork caching without blocking the UI
      if (result?.albums?.length) {
        startArtworkCaching(result.albums);
      }
    } catch (e) {
      console.error("Auto-sync failed", e);
      setSyncStatus(t('sync_failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeepSync = async (paths) => {
    setIsSyncing(true);
    setSyncStatus(t('starting_deep_sync'));
    try {
      const result = await performDeepSync(paths, (msg) => setSyncStatus(msg));
      setLibraryData(result);
      clearLocalArtworkCache();
      if (result?.albums?.length) {
        startArtworkCaching(result.albums);
      }
    } catch (e) {
      console.error("Deep sync failed", e);
      setSyncStatus(`${t('sync_error')} ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const startArtworkCaching = async (albums) => {
    setIsArtworkCaching(true);
    setArtworkCacheStatus(t('caching_artwork'));
    try {
      await cacheAllArtwork(albums, (msg) => setArtworkCacheStatus(msg), getDominantColor);
      clearLocalArtworkCache(); // Pick up the newly cached covers
    } catch (e) {
      console.error('Artwork caching failed', e);
    } finally {
      setIsArtworkCaching(false);
      setArtworkCacheStatus('');
    }
  };

  // ADAPTIVE THEMING EFFECT
  useEffect(() => {
    const isEnabled = localStorage.getItem('adaptive_color_enabled') === 'true';
    if (!isEnabled) return;

    // IMPORTANT: If we are viewing an album, don't let the "Now Playing" color overwrite it
    if (currentView === 'album') return;

    const activeItem = beefwebState.playerState?.activeItem;
    if (!activeItem) return;

    const title = activeItem.columns?.[0] || 'Unknown';
    const artist = activeItem.columns?.[1] || 'Unknown';
    const playlistId = activeItem.playlistId;
    const itemIndex = activeItem.index;

    if (playlistId && itemIndex >= 0) {
      // Small debounce (150ms) to let metadata "settle" and avoid intermediate color flashes
      const timer = setTimeout(() => {
        // If metadata is still Unknown, it might be a transient state during track skip
        if (title === 'Unknown' && artist === 'Unknown') return;

        const artUrl = `${getApiUrl()}/artwork/${playlistId}/${itemIndex}?_t=${encodeURIComponent(title + artist)}&width=100`;
        const colorCacheKey = `color_${artist}_${title}`;
        const artCacheKey = getArtworkCacheKey(artist, title);

        getDominantColor(artUrl, colorCacheKey, artCacheKey).then(newColor => {
          if (localStorage.getItem('adaptive_color_enabled') === 'true' && currentView !== 'album') {
            applyThemeColor(newColor);
          }
        });
      }, 150);

      // Reset manual queue offset when the song actually changes
      setManualQueueOffset(0);

      return () => clearTimeout(timer);
    }
  }, [beefwebState.playerState?.activeItem, currentView]);

  // PRECACHE NEXT TRACK ARTWORK
  useEffect(() => {
    const upcoming = beefwebState.upcomingTracks;
    if (upcoming && upcoming.length > 0) {
      const nextTrack = upcoming[0];
      const nextTitle = nextTrack.columns?.[0] || '';
      const nextArtist = nextTrack.columns?.[1] || '';
      
      if (nextTitle && nextTitle !== 'Unknown Title' && nextTrack.playlistId && nextTrack.index >= 0) {
        const cacheKey = getArtworkCacheKey(nextArtist, nextTitle);
        // Using identical fetch strategy to Player.jsx so ProgressiveImage gets a local bypass hit
        const artUrl = `${getApiUrl()}/artwork/${nextTrack.playlistId}/${nextTrack.index}?maxWidth=1040&maxHeight=1040&_t=${encodeURIComponent(nextTitle + nextArtist)}`;
        preCacheArtwork(artUrl, cacheKey).catch(() => {});
      }
    }
  }, [beefwebState.upcomingTracks]);

  const activeItem = beefwebState.playerState?.activeItem;
  const title = activeItem?.columns?.[0] || '';
  const artist = activeItem?.columns?.[1] || '';
  // Provide globally scoped artwork URL
  const artworkUrl = (activeItem && activeItem.index >= 0 && title && title !== 'Unknown Title') 
      ? `${getApiUrl()}/artwork/${activeItem.playlistId}/${activeItem.index}?_t=${encodeURIComponent(title + artist)}` 
      : null;

  // BACKGROUND CROSSFADE LOGIC
  useEffect(() => {
    setBgState(prev => {
      // If the URL hasn't actually changed, don't trigger a rotation
      const currentUrl = prev.activeLayer === 1 ? prev.bg1 : prev.bg2;
      if (currentUrl === artworkUrl) return prev;

      if (prev.activeLayer === 1) {
        return { ...prev, activeLayer: 2, bg2: artworkUrl };
      } else {
        return { ...prev, activeLayer: 1, bg1: artworkUrl };
      }
    });
  }, [artworkUrl]);

  const handleOpenMenu = (e, track, contextTracks = []) => {
    e.preventDefault();
    const x = e.clientX || (e.touches ? e.touches[0].clientX : 0);
    const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    setMenuState({
      isOpen: true,
      x,
      y,
      track,
      contextTracks
    });
  };

  const handleMenuAction = async (action, track) => {
    try {
      const fooPlaylistId = await getOrCreatePlaylist();
      const activeItem = beefwebState.playerState?.activeItem;
      const isPlayingFoo = activeItem?.playlistId === fooPlaylistId;

      if (action === 'playNext') {
        if (isPlayingFoo && activeItem.index >= 0) {
          // Insert EXACTLY after the current song. 
          // Newest "Play Next" takes the +1 spot.
          await insertIntoPlaylist(fooPlaylistId, activeItem.index + 1, [track.path]);
          setManualQueueOffset(prev => prev + 1);
          await beefwebState.refreshUpcoming();
        } else {
          // If not in FooControl or nothing playing, play immediately in FooControl
          await playContextShuffled([track], 0);
          setManualQueueOffset(0);
        }
      } else if (action === 'addToQueue') {
        if (isPlayingFoo && activeItem.index >= 0) {
          // Insert after all manual items added so far
          await insertIntoPlaylist(fooPlaylistId, activeItem.index + 1 + manualQueueOffset, [track.path]);
          setManualQueueOffset(prev => prev + 1);
          await beefwebState.refreshUpcoming();
        } else {
          // If not playing, just append to FooControl
          await insertIntoPlaylist(fooPlaylistId, 50000, [track.path]); 
        }
      } else if (action === 'playShuffle') {
        // Find index of track in contextTracks
        const idx = menuState.contextTracks.findIndex(t => t.itemIndex === track.itemIndex);
        if (idx !== -1) {
          await playContextShuffled(menuState.contextTracks, idx);
        }
      }
      
      if (beefwebState.refresh) beefwebState.refresh();
    } catch (e) {
      console.error("Context menu action failed", e);
    }
  };

  const handleShuffleArtist = async (artistName) => {
    try {
      const allTracks = await getAllCachedTracks();
      if (!allTracks || allTracks.length === 0) return;

      const query = artistName.toLowerCase();
      const artistTracks = allTracks.filter(t => {
        const trackArtist = (t.artist || '').toLowerCase();
        const albumArtist = (t.albumArtist || '').toLowerCase();
        return trackArtist === query || albumArtist === query;
      });

      if (artistTracks.length > 0) {
        await playAlbumShuffled(artistTracks);
        if (beefwebState.refresh) beefwebState.refresh();
        // Switch to player to see the result
        setCurrentView('player');
      }
    } catch (e) {
      console.error("Shuffle artist failed", e);
    }
  };

  return (
    <>
      <div className="status-bar-gradient" />
      <div className="dynamic-bg">
          <div 
            className={`bg-layer ${bgState.activeLayer === 1 ? 'active' : ''}`}
            style={{ backgroundImage: bgState.bg1 ? `url("${bgState.bg1}")` : 'none' }}
          />
          <div 
            className={`bg-layer ${bgState.activeLayer === 2 ? 'active' : ''}`}
            style={{ backgroundImage: bgState.bg2 ? `url("${bgState.bg2}")` : 'none' }}
          />
      </div>
      <div className="app-container">
        
        {/* Root Level Screens */}
        <div className={`screen ${currentView === 'explorer' ? 'active' : ''}`}>
          <Explorer 
            library={libraryData}
            isSyncing={isSyncing}
            syncStatus={syncStatus}
            isArtworkCaching={isArtworkCaching}
            artworkCacheStatus={artworkCacheStatus}
            onSync={handleGlobalSync}
            onDeepSync={handleDeepSync}
            onOpenAlbum={(album) => {
              setSelectedAlbum(album);
              setCurrentView('album');
            }} 
            onOpenMenu={handleOpenMenu}
            onShuffleArtist={handleShuffleArtist}
          />
        </div>
        <div className={`screen ${currentView === 'search' ? 'active' : ''}`}>
          <Search beefwebState={beefwebState} onOpenMenu={handleOpenMenu} />
        </div>
        <div className={`screen ${currentView === 'settings' ? 'active' : ''}`}>
          <Settings />
        </div>

        <div className={`screen player-screen ${currentView === 'player' ? 'active' : ''}`}>
          <Player 
              beefwebState={beefwebState} 
              onOpenQueue={() => setCurrentView('queue')} 
              onOpenAlbum={() => {
                  setSelectedAlbum(null); // use current track
                  setCurrentView('album');
              }}
          />
        </div>

        {/* Global Navigation Bar */}
        <BottomNav 
          currentView={currentView} 
          onChangeView={setCurrentView} 
          isLibrarySyncing={isSyncing} 
        />

        {/* Full-Screen Overlays (Queue & Album) */}
        <div className={`screen queue-screen ${currentView === 'queue' ? 'active' : ''}`}>
          <Queue 
              beefwebState={beefwebState} 
              onClose={() => setCurrentView('player')} 
              manualQueueOffset={manualQueueOffset}
          />
        </div>
        <div className={`screen album-screen ${currentView === 'album' ? 'active' : ''}`}>
          <AlbumView 
              beefwebState={beefwebState} 
              onClose={() => setCurrentView(selectedAlbum ? 'explorer' : 'player')} 
              albumData={selectedAlbum}
              onOpenMenu={handleOpenMenu}
          />
        </div>
      </div>

      <ContextMenu 
        {...menuState}
        onClose={() => setMenuState(prev => ({ ...prev, isOpen: false }))}
        onAction={handleMenuAction}
      />
    </>
  );
}

export default App;
