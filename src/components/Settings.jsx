import React, { useState, useEffect } from 'react';
import { getServerUrl, setServerUrl, scanLocalNetwork } from '../api/network';
import { getPlayerState } from '../api/beefweb';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export default function Settings() {
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
        setSuccess('Settings saved!');
        setTimeout(() => setSuccess(''), 3000);
    };

    const handleScan = async () => {
        setIsScanning(true);
        setScanProgress('Starting network scan...');
        setError('');
        setSuccess('');
        
        try {
            const foundUrl = await scanLocalNetwork((msg) => setScanProgress(msg));
            if (foundUrl) {
                setUrl(foundUrl);
                setServerUrl(foundUrl);
                setSuccess(`Found server at ${foundUrl}!`);
            } else {
                setError('No foobar2000 server found on local network. Ensure Beefweb is running and "Allow file system access" is enabled.');
            }
        } catch (err) {
            setError('Scan failed: ' + err.message);
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
            <h2 className="settings-title">Menu & Settings</h2>

            <div className="settings-section">
                <h3>Customization</h3>
                <p className="settings-help">Personalize your experience with adaptive themes.</p>
                <div className="setting-control">
                    <div className="setting-label">
                        <span>Adaptive UI Color</span>
                        <p className="settings-help" style={{margin:0}}>Pull accent colors from the currently playing album cover.</p>
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
                <h3>Server Connection</h3>
                <p className="settings-help">The app needs to connect to the foobar2000 Beefweb API. If you are on the same Wi-Fi, you can auto-discover it.</p>
                
                <div className="input-group">
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                        <label>Server URL</label>
                        <span className={`conn-indicator ${connStatus}`}>
                            {connStatus === 'connected' ? '● Connected' : connStatus === 'checking' ? '○ Checking...' : '● Disconnected'}
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
                    <button className="btn-save" onClick={handleSave}>Save Settings</button>
                    <button 
                        className={`btn-scan ${isScanning ? 'loading' : ''}`} 
                        onClick={handleScan}
                        disabled={isScanning}
                    >
                        {isScanning ? 'Scanning...' : 'Auto-Discover Server'}
                    </button>
                </div>

                {scanProgress && <div className="scan-status">{scanProgress}</div>}
                {error && <div className="settings-error">{error}</div>}
                {success && <div className="settings-success">{success}</div>}
            </div>

            <div className="settings-section">
                <h3>About</h3>
                <p>FooControl v1.0.0</p>
                <p className="settings-help">Premium foobar2000 controller for Android & PWA.</p>
            </div>
        </div>
    );
}
