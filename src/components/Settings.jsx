import React, { useState, useEffect } from 'react';
import { getServerUrl, setServerUrl, scanLocalNetwork } from '../api/network';
import { getPlayerState } from '../api/beefweb';
import { useTranslation } from '../contexts/TranslationContext';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export default function Settings() {
    const { t, language, setLanguage } = useTranslation();
    const [url, setUrl] = useState(getServerUrl());
    const [adaptiveColor, setAdaptiveColor] = useState(() => {
        return localStorage.getItem('adaptive_color_enabled') === 'true';
    });
    const [isScanning, setIsScanning] = useState(false);
    const [connStatus, setConnStatus] = useState('checking'); // 'connected', 'error', 'checking'
    const [scanProgress, setScanProgress] = useState('');
    const [debugInfo, setDebugInfo] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            const lastData = localStorage.getItem('foocontrol_last_res');
            if (lastData) setDebugInfo(lastData);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const checkCurrentConnection = async () => {
        if (!url) {
            setConnStatus('error');
            return;
        }
        setConnStatus('checking');
        try {
            await getPlayerState();
            setConnStatus('connected');
        } catch (e) {
            setConnStatus('error');
        }
    };

    const handleSave = () => {
        setServerUrl(url);
        setSuccess(t('settings_saved'));
        setTimeout(() => setSuccess(''), 3000);
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
            // Reset immediately when turned off
            document.documentElement.style.setProperty('--accent-color', 'rgb(59, 130, 246)');
            document.documentElement.style.setProperty('--accent-glow', 'rgba(59, 130, 246, 0.4)');
        }
    };

    return (
        <div className="settings-container">
            <h2 className="settings-title">{t('settings_title')}</h2>

            <div className="settings-section">
                <h3>{t('customization')}</h3>
                <p className="settings-help">{t('adaptive_ui_help')}</p>
                <div className="setting-control">
                    <div className="setting-label">
                        <span>{t('adaptive_ui')}</span>
                        <p className="settings-help" style={{margin:0}}>{t('adaptive_ui_help')}</p>
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
                <h3>{t('regional')}</h3>
                <p className="settings-help">{t('language_help')}</p>
                <div className="setting-control">
                    <div className="setting-label">
                        <span>{t('language')}</span>
                        <p className="settings-help" style={{margin:0}}>{t('language_help')}</p>
                    </div>
                    <select 
                        className="settings-input" 
                        style={{width:'auto', minWidth:'120px'}} 
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
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
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
