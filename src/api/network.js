import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export const setServerUrl = async (url) => {
    if (url) {
        // Strip out trailing slash if present
        let cleanUrl = url.trim();
        if (cleanUrl.endsWith('/')) {
            cleanUrl = cleanUrl.slice(0, -1);
        }
        localStorage.setItem('foocontrol_server_url', cleanUrl);
        if (isNative) {
            await Preferences.set({ key: 'foocontrol_server_url', value: cleanUrl });
        }
    } else {
        localStorage.removeItem('foocontrol_server_url');
        if (isNative) {
            await Preferences.remove({ key: 'foocontrol_server_url' });
        }
    }
};

export const getServerUrl = () => {
    // Note: This remains synchronous for initial load, but we rely on App.jsx 
    // to hydrate the state from Preferences if needed.
    return localStorage.getItem('foocontrol_server_url') || '';
};

// Async version for reliable native load
export const getServerUrlAsync = async () => {
    if (isNative) {
        const { value } = await Preferences.get({ key: 'foocontrol_server_url' });
        if (value) {
            localStorage.setItem('foocontrol_server_url', value);
            return value;
        }
    }
    return getServerUrl();
};

export const getApiUrl = () => {
    const srv = getServerUrl();
    return srv ? `${srv}/api` : '/api';
};

/**
 * Sweeps common local subnets to find the foobar2000 server.
 */
export async function scanLocalNetwork(onProgress) {
    // Common home router subnets
    const subnets = ['192.168.1', '192.168.0', '192.168.178', '10.0.0'];
    const port = 8880; // Default foo_beefweb port
    
    const ips = [];
    // Also try localhost specifically
    ips.push('127.0.0.1');

    for (const subnet of subnets) {
        for (let i = 2; i <= 254; i++) {
            ips.push(`${subnet}.${i}`);
        }
    }

    const CHUNK_SIZE = 50; 
    
    for (let i = 0; i < ips.length; i += CHUNK_SIZE) {
        const chunk = ips.slice(i, i + CHUNK_SIZE);
        
        if (onProgress) {
            if (chunk[0] === '127.0.0.1') {
                onProgress('Scanning localhost...');
            } else {
                onProgress(`Scanning ${chunk[0]}...`);
            }
        }
        
        // Ping 50 IPs concurrently
        const promises = chunk.map(ip => {
            return new Promise((resolve) => {
                const url = `http://${ip}:${port}`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                    resolve(null);
                }, 3000); // 3s for mobile networks

                fetch(`${url}/api/player`, { 
                    method: 'GET',
                    signal: controller.signal 
                })
                .then(res => {
                    clearTimeout(timeoutId);
                    if (res.ok) resolve(url);
                    else resolve(null);
                })
                .catch(() => {
                    clearTimeout(timeoutId);
                    resolve(null);
                });
            });
        });

        // Wait for this chunk of 50 to finish
        const results = await Promise.all(promises);
        const foundUrl = results.find(r => r !== null);
        
        if (foundUrl) {
            return foundUrl;
        }
    }
    
    return null;
}
