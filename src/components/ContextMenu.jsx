import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from '../contexts/TranslationContext';

const Icons = {
    PlayNext: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4l10 8-10 8V4z"/><path d="M19 5v14"/>
        </svg>
    ),
    Queue: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
    ),
    Shuffle: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>
        </svg>
    ),
    Play: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
    ),
    Playlist: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/>
        </svg>
    )
};

/**
 * Premium Context Menu with Glassmorphism
 */
const ContextMenu = ({ isOpen, x, y, track, isAlbum, onClose, onAction }) => {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Tiny delay to trigger CSS transition
            requestAnimationFrame(() => setIsVisible(true));
        } else {
            setIsVisible(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Constrain position so it doesn't go off-screen
    const menuWidth = 220;
    const menuHeight = isAlbum ? 240 : 240; // Roughly the same for now
    const padding = 20;

    let posX = x;
    let posY = y;

    if (x + menuWidth > window.innerWidth - padding) posX = window.innerWidth - menuWidth - padding;
    if (y + menuHeight > window.innerHeight - padding) posY = window.innerHeight - menuHeight - padding;
    if (posX < padding) posX = padding;
    if (posY < padding) posY = padding;

    const handleAction = (action) => {
        onAction(action, track);
        onClose();
    };

    return ReactDOM.createPortal(
        <div className={`context-menu-overlay ${isVisible ? 'active' : ''}`} onClick={onClose}>
            <div 
                className={`context-menu-container ${isVisible ? 'active' : ''}`}
                style={{ left: posX, top: posY }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="context-menu-header">
                    <div className="context-menu-track-info">
                        <span className="title">{track?.title || t('unknown_title')}</span>
                        <span className="artist">{track?.artist || t('unknown_artist')}</span>
                    </div>
                </div>

                <div className="context-menu-options">
                    {isAlbum ? (
                        <>
                            <button className="option-btn" onClick={() => handleAction('albumPlayNow')}>
                                <Icons.Play />
                                <span>{t('menu_play_now')}</span>
                            </button>
                            <button className="option-btn" onClick={() => handleAction('albumPlayShuffled')}>
                                <Icons.Shuffle />
                                <span>{t('menu_play_shuffled')}</span>
                            </button>
                            <button className="option-btn" onClick={() => handleAction('albumAddShuffled')}>
                                <Icons.Queue />
                                <span>{t('menu_add_shuffled')}</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="option-btn" onClick={() => handleAction('playNext')}>
                                <Icons.PlayNext />
                                <span>{t('play_next')}</span>
                            </button>
                            <button className="option-btn" onClick={() => handleAction('addToQueue')}>
                                <Icons.Queue />
                                <span>{t('add_to_queue')}</span>
                            </button>
                            <button className="option-btn" onClick={() => handleAction('playShuffle')}>
                                <Icons.Shuffle />
                                <span>{t('play_shuffle')}</span>
                            </button>
                        </>
                    )}
                    <div className="menu-divider" />
                    <button className="option-btn" onClick={() => handleAction('addToPlaylist')}>
                        <Icons.Playlist />
                        <span>{t('add_to_playlist')}</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ContextMenu;
