import React, { useState, useEffect } from 'react';
import { getServerUrl, setServerUrl, scanLocalNetwork } from '../api/network';
import { getPlayerState } from '../api/beefweb';
import { useTranslation } from '../contexts/TranslationContext';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { clearArtworkFilesystemCache, getArtworkQuality } from '../api/artwork';
import { getCachedData, cacheAllArtwork } from '../api/libraryCache';
import { setVolume } from '../api/beefweb';

const isNative = Capacitor.isNativePlatform();

export default function Settings({ beefwebState }) {
    const { t, language, setLanguage } = useTranslation();
    const [url, setUrl] = useState(getServerUrl());
    const [adaptiveColor, setAdaptiveColor] = useState(() => {
        return localStorage.getItem('adaptive_color_enabled') === 'true';
    });
    const [artworkQuality, setArtworkQuality] = useState('800');
    const [isScanning, setIsScanning] = useState(false);
    const [isResyncing, setIsResyncing] = useState(false);
    const [resyncProgress, setResyncProgress] = useState(null);
    const [connStatus, setConnStatus] = useState('checking'); // 'connected', 'error', 'checking'
    const [scanProgress, setScanProgress] = useState('');
    const [showResyncPrompt, setShowResyncPrompt] = useState(false);
    const [pendingQuality, setPendingQuality] = useState(null);
    const [debugInfo, setDebugInfo] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const loadSettings = async () => {
            const q = await getArtworkQuality();
            setArtworkQuality(q);
        };
        loadSettings();

        const interval = setInterval(() => {
            const lastData = localStorage.getItem('foocontrol_last_res');
            if (lastData) setDebugInfo(lastData);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleSave = () => {
        setServerUrl(url);
        setSuccess(t('settings_saved'));
        setTimeout(() => setSuccess(''), 3000);
    };

    const handleQualityChange = (val) => {
        if (val === artworkQuality) return;
        setPendingQuality(val);
        setShowResyncPrompt(true);
    };

    const confirmResync = async () => {
        setShowResyncPrompt(false);
        setIsResyncing(true);
        setError('');

        try {
            // 1. Save new quality
            await Preferences.set({ key: 'artwork_quality', value: pendingQuality });
            setArtworkQuality(pendingQuality);

            // 2. Clear cache
            await clearArtworkFilesystemCache();

            // 3. Trigger resync
            const library = await getCachedData('library_data');
            if (library && library.albums) {
                await cacheAllArtwork(library.albums, (msg, perc) => {
                    setResyncProgress({ msg, perc });
                });
                setSuccess(t('settings_saved'));
            } else {
                setSuccess(t('settings_saved') + " (Library sync needed to refresh covers fully)");
            }
        } catch (err) {
            setError("Resync failed: " + err.message);
        } finally {
            setIsResyncing(false);
            setResyncProgress(null);
            setPendingQuality(null);
        }
    };

    const handleScan = async () => {
        setIsScanning(true);
        setScanProgress(t('scanning'));
        setError('');
        setSuccess('');

        try {
            const foundUrl = await scanLocalNetwork((msg) => setScanProgress(msg));
            if (foundUrl) {
                setUrl(foundUrl);
                setServerUrl(foundUrl);
                setSuccess(`${t('found_server')} ${foundUrl}`);
            } else {
                setError(t('no_server_found'));
            }
        } catch (err) {
            setError(`${t('scan_failed')} ${err.message}`);
        } finally {
            setIsScanning(false);
            setScanProgress('');
        }
    };

    const handleToggleAdaptive = async (enabled) => {
        setAdaptiveColor(enabled);
        const valueStr = enabled ? 'true' : 'false';
        localStorage.setItem('adaptive_color_enabled', valueStr);
        if (isNative) {
            await Preferences.set({ key: 'adaptive_color_enabled', value: valueStr });
        }
        if (!enabled) {
            document.documentElement.style.setProperty('--accent-color', 'rgb(59, 130, 246)');
            document.documentElement.style.setProperty('--accent-glow', 'rgba(59, 130, 246, 0.4)');
        }
    };

    return (
        <div className="settings-container">
            <h2 className="settings-title">{t('settings_title')}</h2>

            <div className="settings-section">
                <h3>{t('customization')}</h3>
                <div className="setting-control">
                    <div className="setting-label">
                        <span>{t('adaptive_ui')}</span>
                        <p className="settings-help" style={{ margin: 0 }}>{t('adaptive_ui_help')}</p>
                    </div>
                    <label className="switch">
                        <input
                            type="checkbox"
                            checked={adaptiveColor}
                            onChange={(e) => handleToggleAdaptive(e.target.checked)}
                        />
                        <span className="slider round"></span>
                    </label>
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('playback')}</h3>
                <div className="setting-control-vertical">
                    <div className="setting-label">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-color)' }}>
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            </svg>
                            <span>{t('volume_label')}</span>
                        </div>
                    </div>
                    <div className="volume-slider-container">
                        <input
                            type="range"
                            className="volume-range-slider"
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round(100 * (1 - Math.min(1, Math.pow(Math.max(0, -(beefwebState?.playerState?.volume?.value || 0)) / 60, 0.25))))}
                            onChange={(e) => {
                                const pct = parseFloat(e.target.value);
                                // Curve: dB = -60 * (1 - pct/100)^4
                                // User updated to pow 4 for extreme control at high volume
                                const dB = -60 * Math.pow(1 - (pct / 100), 4);
                                setVolume(dB);
                            }}
                        />
                        <span className="volume-value-display">
                            {Math.round(100 * (1 - Math.min(1, Math.pow(Math.max(0, -(beefwebState?.playerState?.volume?.value || 0)) / 60, 0.25))))}%
                        </span>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('storage_quality')}</h3>
                <p className="settings-help">{t('quality_help')}</p>
                <div className="setting-control">
                    <div className="setting-label">
                        <span>{t('artwork_quality_label')}</span>
                    </div>
                    <select
                        className="settings-input"
                        style={{ width: 'auto', minWidth: '150px' }}
                        value={artworkQuality}
                        onChange={(e) => handleQualityChange(e.target.value)}
                        disabled={isResyncing}
                    >
                        <option value="540">{t('quality_540')}</option>
                        <option value="800">{t('quality_800')}</option>
                        <option value="1080">{t('quality_1080')}</option>
                        <option value="1200">{t('quality_1200')}</option>
                        <option value="max">{t('quality_max')}</option>
                    </select>
                </div>

                {showResyncPrompt && (
                    <div className="resync-prompt-overlay">
                        <div className="resync-prompt-card">
                            <p>{t('clear_cache_prompt')}</p>
                            <div className="prompt-actions">
                                <button className="btn-confirm" onClick={confirmResync}>{t('confirm_resync')}</button>
                                <button className="btn-cancel" onClick={() => setShowResyncPrompt(false)}>{t('cancel')}</button>
                            </div>
                        </div>
                    </div>
                )}

                {isResyncing && resyncProgress && (
                    <div className="sync-status-container" style={{ marginTop: '1rem' }}>
                        <div className="sync-progress-bar">
                            <div className="sync-progress-fill" style={{ width: `${resyncProgress.perc}%` }}></div>
                        </div>
                        <p className="settings-help">{resyncProgress.msg}</p>
                    </div>
                )}
            </div>

            <div className="settings-section">
                <h3>{t('regional')}</h3>
                <div className="setting-control">
                    <div className="setting-label">
                        <span>{t('language')}</span>
                        <p className="settings-help" style={{ margin: 0 }}>{t('language_help')}</p>
                    </div>
                    <select
                        className="settings-input"
                        style={{ width: 'auto', minWidth: '120px' }}
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                    >
                        <option value="en">English (US)</option>
                        <option value="es">Español</option>
                    </select>
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('server_conn')}</h3>
                <p className="settings-help">{t('server_help')}</p>

                <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <label>{t('server_url')}</label>
                        <span className={`conn-indicator ${connStatus}`}>
                            {connStatus === 'connected' ? `● ${t('connected')}` : connStatus === 'checking' ? `○ ${t('checking')}` : `● ${t('disconnected')}`}
                        </span>
                    </div>
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="http://192.168.1.XX:8880"
                        className="settings-input"
                    />
                </div>

                <div className="settings-actions">
                    <button className="btn-save" onClick={handleSave}>{t('save_settings')}</button>
                    <button
                        className={`btn-scan ${isScanning ? 'loading' : ''}`}
                        onClick={handleScan}
                        disabled={isScanning}
                    >
                        {isScanning ? t('scanning') : t('auto_discover')}
                    </button>
                </div>

                {scanProgress && <div className="scan-status">{scanProgress}</div>}
                {error && <div className="settings-error">{error}</div>}
                {success && <div className="settings-success">{success}</div>}
            </div>

            <div className="settings-section">
                <h3>{t('about')}</h3>
                <p>FooControl v1.0.0</p>
                <p className="settings-help">{t('premium_desc')}</p>
            </div>
        </div>
    );
}
