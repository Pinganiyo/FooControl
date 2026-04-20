import { LocalNotifications } from '@capacitor/local-notifications';
import { playPause, playNext, playPrevious } from './beefweb';

const NOTIFICATION_ID = 4002;
const ACTION_TYPE_ID = 'PLAYBACK_CONTROLS';
const CHANNEL_ID = 'foocontrol_v3'; // Increased version to force fresh silent settings

let isInitialized = false;
let lastUpdateKey = ''; 
let lastTrackData = null; // Store to allow force-refresh in action listener

/**
 * Initializes notification action types and channels
 */
export async function initNotifications() {
    if (isInitialized) return;

    try {
        const { display } = await LocalNotifications.checkPermissions();
        if (display !== 'granted') {
            await LocalNotifications.requestPermissions();
        }

        // Fresh channel with ID v3
        await LocalNotifications.createChannel({
            id: CHANNEL_ID,
            name: 'FooControl Playback',
            description: 'Playback controls (Silent)',
            importance: 3, // 3 = DEFAULT (no popup/sound), 4 = HIGH (popup/sound)
            sound: null,
            vibration: false,
            visibility: 1
        });

        // Define buttons
        await LocalNotifications.registerActionTypes({
            types: [
                {
                    id: ACTION_TYPE_ID,
                    actions: [
                        { id: 'prev', title: '⏮', foreground: false },
                        { id: 'play_pause', title: '⏯', foreground: false },
                        { id: 'next', title: '⏭', foreground: false }
                    ]
                }
            ]
        });

        // Listen for button clicks
        LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
            if (action.actionId === 'play_pause') {
                await playPause();
            } else if (action.actionId === 'next') {
                await playNext();
            } else if (action.actionId === 'prev') {
                await playPrevious();
            }

            // FORCE REFRESH: Immediately reschedule to ensure the notification 
            // doesn't disappear if the OS tries to dismiss it after a background task.
            if (lastTrackData) {
                // We clear the key so syncPlaybackNotification actually sends the request
                lastUpdateKey = 'force'; 
                await syncPlaybackNotification(lastTrackData.track, lastTrackData.isPlaying, lastTrackData.artUrl);
            }
        });

        isInitialized = true;
    } catch (e) {
        console.error('[NotificationManager] Initialization failed', e);
    }
}

/**
 * Updates or creates the playback notification
 */
export async function syncPlaybackNotification(track, isPlaying, artUrl) {
    if (!isInitialized) await initNotifications();

    if (!track) {
        if (lastUpdateKey !== 'none') {
            await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
            lastUpdateKey = 'none';
            lastTrackData = null;
        }
        return;
    }

    const title = track.columns?.[0] || 'Unknown Title';
    const artist = track.columns?.[1] || 'Unknown Artist';
    
    const updateKey = `${title}-${artist}-${isPlaying}-${artUrl}`;
    if (updateKey === lastUpdateKey) return;

    // Cache current data for the action-listener forced refresh
    lastTrackData = { track, isPlaying, artUrl };

    try {
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: NOTIFICATION_ID,
                    title: title,
                    body: artist,
                    largeIcon: artUrl || 'res://ic_launcher',
                    smallIcon: 'res://ic_stat_name', 
                    actionTypeId: ACTION_TYPE_ID,
                    channelId: CHANNEL_ID,
                    ongoing: true, // Non-dismissible
                    autoCancel: false, // Don't dismiss on click
                    priority: 2, // MAX visibility
                    extra: { isPlaying }
                }
            ]
        });
        lastUpdateKey = updateKey;
    } catch (e) {
        console.error('[NotificationManager] Update failed', e);
    }
}

export async function clearPlaybackNotification() {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
    lastUpdateKey = '';
    lastTrackData = null;
}
