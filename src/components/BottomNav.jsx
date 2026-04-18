import React from 'react';

// Grid Icon
const ExplorerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"></rect>
    <rect x="14" y="3" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect>
    <rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);

// Music Note Icon
const SongIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13"></path>
    <circle cx="6" cy="18" r="3"></circle>
    <circle cx="18" cy="16" r="3"></circle>
  </svg>
);

// Search Icon
const SearchIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

// Hamburger Menu Icon
const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

export default function BottomNav({ currentView, onChangeView, isLibrarySyncing }) {
    
    // Safety check so we don't highlight background tabs when an overlay is active
    const isRootTabActive = (tabName) => {
        return currentView === tabName;
    }

    return (
        <div className="app-nav-bar">
            <div className={`nav-item ${isRootTabActive('explorer') ? 'active' : ''}`} onClick={() => onChangeView('explorer')}>
                <div className="nav-icon-wrapper">
                    <ExplorerIcon />
                    {isLibrarySyncing && <div className="nav-dot-sync"></div>}
                </div>
                <span>Explorer</span>
            </div>
            <div className={`nav-item ${isRootTabActive('player') ? 'active' : ''}`} onClick={() => onChangeView('player')}>
                <SongIcon />
                <span>Song</span>
            </div>
            <div className={`nav-item ${isRootTabActive('search') ? 'active' : ''}`} onClick={() => onChangeView('search')}>
                <SearchIcon />
                <span>Search</span>
            </div>
            <div className={`nav-item ${isRootTabActive('settings') ? 'active' : ''}`} onClick={() => onChangeView('settings')}>
                <MenuIcon />
                <span>Menu</span>
            </div>
        </div>
    );
}
