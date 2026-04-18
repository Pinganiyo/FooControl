/**
 * Utility to extract the dominant color from an image URL.
 */
import { getCachedColor, saveToColorCache } from './libraryCache';
import { getArtworkUrl } from './artwork';

export async function getDominantColor(imageUrl, cacheKey, artworkCacheKey) {
    // 1. Check Cache First
    if (cacheKey) {
        const cached = await getCachedColor(cacheKey);
        if (cached) return cached;
    }

    // Resolve local URL to bypass CORS
    const localUrl = await getArtworkUrl(imageUrl, artworkCacheKey || cacheKey);

    return new Promise((resolve) => {
        const img = new Image();
        // Since we resolved to a local file/blob or used CapacitorHttp, 
        // we can lead it as a local resource.
        img.crossOrigin = "Anonymous";
        img.src = localUrl;

        const timeout = setTimeout(() => {
            img.src = ""; // cancel loading
            resolve('rgb(59, 130, 246)');
        }, 3000);

        img.onload = () => {
            clearTimeout(timeout);
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Downscale for speed and to get average colors
                canvas.width = 50;
                canvas.height = 50;
                ctx.drawImage(img, 0, 0, 50, 50);

                const data = ctx.getImageData(0, 0, 50, 50).data;
                const colorMap = {};
                let maxBrightness = 0;
                let dominantColor = { r: 59, g: 130, b: 246 }; // Default Blue

                // Sample pixels (every 4th to be faster)
                for (let i = 0; i < data.length; i += 16) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    if (a < 128) continue; // Skip transparency

                    // We want vibrant colors, so skip very dark or very desaturated colors
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const saturation = max === 0 ? 0 : (max - min) / max;

                    if (brightness < 40 || brightness > 220) continue; 
                    if (saturation < 0.25) continue;

                    const colorKey = `${Math.floor(r/10)*10},${Math.floor(g/10)*10},${Math.floor(b/10)*10}`;
                    colorMap[colorKey] = (colorMap[colorKey] || 0) + 1;

                    if (brightness * saturation > maxBrightness) {
                        maxBrightness = brightness * saturation;
                        dominantColor = { r, g, b };
                    }
                }

                const finalColor = `rgb(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b})`;
                
                // 2. Save to Cache
                if (cacheKey) {
                    saveToColorCache(cacheKey, finalColor);
                }

                resolve(finalColor);
            } catch (e) {
                console.error("Color extraction failed", e);
                resolve('rgb(59, 130, 246)');
            }
        };

        img.onerror = () => {
            resolve('rgb(59, 130, 246)');
        };
    });
}

export function applyThemeColor(rgbString) {
    if (!rgbString) return;
    document.documentElement.style.setProperty('--accent-color', rgbString);
    const rgbaGlow = rgbString.replace('rgb', 'rgba').replace(')', ', 0.4)');
    document.documentElement.style.setProperty('--accent-glow', rgbaGlow);
    const rgbaLight = rgbString.replace('rgb', 'rgba').replace(')', ', 0.1)');
    document.documentElement.style.setProperty('--accent-light', rgbaLight);
    const rgbaBorder = rgbString.replace('rgb', 'rgba').replace(')', ', 0.2)');
    document.documentElement.style.setProperty('--accent-border', rgbaBorder);
}

export function resetThemeToDefault() {
    applyThemeColor('rgb(59, 130, 246)');
}
