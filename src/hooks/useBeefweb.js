import { useState, useEffect } from 'react';
import { getUpcomingTracks, getPlayerState } from '../api/beefweb';
import { getApiUrl, getServerUrl } from '../api/network';

// Removed hardcoded SSE_URL here to build it dynamically in the hook.

export function useBeefweb() {
    const [playerState, setPlayerState] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [upcomingTracks, setUpcomingTracks] = useState([]);

    useEffect(() => {
        let eventSource = null;
        const currentSrv = getServerUrl();
        const isAndroid = window.Capacitor?.getPlatform() === 'android' || /Android/i.test(navigator.userAgent);

        const connect = async () => {
            // First, "knock on the door" with a manual fetch to get immediate data
            try {
                const initialState = await getPlayerState();
                setPlayerState(initialState);
                if (initialState.activeItem) {
                    setCurrentTime(initialState.activeItem.position || 0);
                }
                setIsConnected(true);
            } catch (err) {
                console.error("Initial fetch failed", err);
                setIsConnected(false);
            }

            // DISABLE SSE ON ANDROID: It constantly fails with CORS and poll works better
            if (isAndroid) {
                console.log("Android detected: Relying on native polling for sync.");
                return;
            }

            const apiBase = getApiUrl();
            const sseFullUrl = `${apiBase}/query/updates?player=true&trcolumns=%title%,%artist%,%album%,%length_seconds%`;
            
            eventSource = new EventSource(sseFullUrl);

            eventSource.onopen = () => {
                setIsConnected(true);
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data && data.player) {
                        setPlayerState(data.player);
                        if (data.player.activeItem) {
                            setCurrentTime(data.player.activeItem.position || 0);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse SSE data", e);
                }
            };

            eventSource.onerror = (err) => {
                setIsConnected(false);
                eventSource.close();
                // Try to reconnect after 3 seconds
                setTimeout(connect, 3000);
            };
        };

        if (currentSrv || true) { // Always try if no server set yet (defaults to /api)
            connect();
        }

        return () => {
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [getServerUrl()]);

    // SMART POLLING FALLBACK FOR ANDROID/CORS ISSUES
    // Since SSE (EventSource) often gets blocked by CORS on Android even with CapacitorHttp,
    // we use a periodic fetch as a fallback if the real-time connection isn't working perfectly.
    useEffect(() => {
        const poll = async () => {
            // Only poll if we don't have a working SSE connection
            // or if we want to ensure total sync on Android.
            try {
                const state = await getPlayerState();
                setPlayerState(state);
                if (state.activeItem) {
                    setCurrentTime(state.activeItem.position || 0);
                }
                setIsConnected(true);
            } catch (e) {
                console.error("Polling failed", e);
            }
        };

        const interval = setInterval(poll, 3000); // Poll every 3 seconds for better feels
        return () => clearInterval(interval);
    }, [getServerUrl()]);

    // Local timer to update progress smoothly
    useEffect(() => {
        let interval;
        if (playerState?.playbackState === 'playing') {
            interval = setInterval(() => {
                setCurrentTime(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [playerState?.playbackState]);

    // Fetch upcoming tracks whenever active item or playback mode changes
    useEffect(() => {
        if (playerState?.activeItem) {
            const mode = playerState.playbackMode || 0;
            getUpcomingTracks(playerState.activeItem.playlistId, playerState.activeItem.index, mode)
                .then(setUpcomingTracks);
        }
    }, [playerState?.activeItem?.playlistId, playerState?.activeItem?.index, playerState?.playbackMode]);

  const refreshUpcoming = async () => {
    if (playerState?.activeItem) {
      const mode = playerState.playbackMode || 0;
      const tracks = await getUpcomingTracks(playerState.activeItem.playlistId, playerState.activeItem.index, mode);
      setUpcomingTracks(tracks);
    }
  };

  const refresh = async () => {
    try {
      const state = await getPlayerState();
      setPlayerState(state);
      if (state.activeItem) {
        setCurrentTime(state.activeItem.position || 0);
      }
      await refreshUpcoming();
    } catch (e) {
      console.error("Manual refresh failed", e);
    }
  };

  return { playerState, isConnected, currentTime, upcomingTracks, refresh, refreshUpcoming };
}
