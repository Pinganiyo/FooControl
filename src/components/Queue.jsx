import React, { useState, useEffect, useRef } from 'react';
import { playTargetItem, movePlaylistItems } from '../api/beefweb';
import { useTranslation } from '../contexts/TranslationContext';
import { getApiUrl } from '../api/network';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

export default function Queue({ beefwebState, onClose, manualQueueOffset = 0 }) {
    const { t } = useTranslation();
    const { playerState, upcomingTracks } = beefwebState;
    const isShuffle = playerState?.playbackMode >= 3;
    const hasUpcoming = upcomingTracks.some(t => t.isUpcoming);

    const [localTracks, setLocalTracks] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [isDirty, setIsDirty] = useState(false);
    const syncTimerRef = useRef(null);

    // Sync sensors for touch/mouse
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Prepare items with IDs for Sortable
    useEffect(() => {
        if (!isDirty) {
            setLocalTracks(upcomingTracks.map((t, idx) => ({
                ...t,
                id: `${t.playlistId}-${t.itemIndex}-${idx}`
            })));
        }
    }, [upcomingTracks, isDirty]);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);
        
        if (!over || active.id === over.id) return;

        const oldIdx = localTracks.findIndex(t => t.id === active.id);
        const newIdx = localTracks.findIndex(t => t.id === over.id);

        if (oldIdx !== -1 && newIdx !== -1) {
            const newOrder = arrayMove(localTracks, oldIdx, newIdx);
            
            // Re-map the sortable IDs to the new order to keep them stable
            setLocalTracks(newOrder);
            setIsDirty(true);

            // Debounced sync to Foobar2000
            if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
            syncTimerRef.current = setTimeout(() => {
                const sourceItem = localTracks[oldIdx];
                const targetItem = localTracks[newIdx];
                
                // Beefweb move logic: move the source index to the target index
                movePlaylistItems(sourceItem.playlistId, [sourceItem.itemIndex], targetItem.itemIndex)
                    .then(() => {
                        setIsDirty(false);
                        if (beefwebState.refreshUpcoming) beefwebState.refreshUpcoming();
                    })
                    .catch(e => {
                        console.error("Sync failed", e);
                        setIsDirty(false);
                    });
            }, 2000);
        }
    };

    const handleItemClick = (playlistId, index) => {
        playTargetItem(playlistId, index).catch(console.error);
        onClose();
    };

    return (
        <div className="queue-container">
            <div className="queue-header">
                <button className="back-btn" onClick={onClose} aria-label="Back">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
                    </svg>
                </button>
                <h2>{t('songs_order')}</h2>
                <div style={{width: 28}}></div>
            </div>

            <div className="queue-list">
                {localTracks.length === 0 ? (
                    <div className="empty-queue">{t('no_upcoming')}</div>
                ) : (
                    <DndContext 
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        modifiers={[restrictToVerticalAxis]}
                    >
                        <SortableContext 
                            items={localTracks.filter(t => t.isUpcoming).map(t => t.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {localTracks.map((track, i) => (
                                <SortableItem 
                                    key={track.id}
                                    track={track}
                                    index={i}
                                    manualQueueOffset={manualQueueOffset}
                                    onClick={() => handleItemClick(track.playlistId, track.itemIndex)}
                                />
                            ))}
                        </SortableContext>

                        <DragOverlay adjustScale={false} dropAnimation={null}>
                            {activeId ? (
                                <QueueItemContent 
                                    track={localTracks.find(t => t.id === activeId)} 
                                    isOverlay 
                                />
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
                {(isShuffle && !hasUpcoming) && (
                    <div className="queue-item" style={{opacity: 0.7}}>
                        <div className="queue-item-icon-container" style={{background: 'transparent'}}>
                            <div className="queue-item-icon-fallback" style={{fontSize: '1.5rem'}}>🔀</div>
                        </div>
                        <div className="queue-item-info">
                            <div className="queue-item-title">{t('shuffle_mode')}</div>
                            <div className="queue-item-artist">{t('shuffle_desc')}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function SortableItem({ track, index, manualQueueOffset, onClick }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ 
        id: track.id,
        disabled: !track.isUpcoming
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition: null, // Disable all move animations
        visibility: isDragging ? 'hidden' : 'visible',
    };

    return (
        <div 
            ref={setNodeRef}
            style={style}
            className={`queue-item ${track.isPrevious ? 'previous' : ''} ${track.isCurrent ? 'current' : ''} ${track.isUpcoming && index === 0 ? 'next' : ''} ${(track.isUpcoming && (index < manualQueueOffset || track.isQueue)) ? 'cued' : ''}`}
        >
            <QueueItemContent 
                track={track} 
                onClick={onClick} 
                index={index} 
                manualQueueOffset={manualQueueOffset} 
                dndProps={{ attributes, listeners }}
            />
        </div>
    );
}

function QueueItemContent({ track, onClick, index, manualQueueOffset, isOverlay, dndProps }) {
    const { t } = useTranslation();
    if (!track) return null;
    const { attributes, listeners } = dndProps || {};
    const isNext = !isOverlay && track.isUpcoming && index === 0; 
    const isCued = !isOverlay && track.isUpcoming && (index < manualQueueOffset || track.isQueue);

    return (
        <div className={`queue-item-inner ${isOverlay ? 'overlay' : ''}`}>
            <div className="queue-item-content" onClick={onClick} style={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                <div className="queue-item-icon-container">
                    <img 
                        src={`${getApiUrl()}/artwork/${track.playlistId}/${track.itemIndex}?_t=${encodeURIComponent(track.title)}&width=150`}
                        alt="Art"
                        className="queue-item-art"
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }}
                    />
                    <div className="queue-item-icon-fallback" style={{display: 'none'}}>
                        {track.isQueue ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent-color)">
                                <path d="M4 15h16v-2H4v2zm0 4h16v-2H4v2zm0-8h16V9H4v2zm0-6v2h16V5H4z"/>
                            </svg>
                        ) : track.isCurrent ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        ) : (
                            <span style={{opacity: 0.5}}>{track.itemIndex + 1}</span>
                        )}
                    </div>
                </div>
                <div className="queue-item-info">
                    <div className="queue-item-title">
                        {track.title}
                        {isNext && <span className="queue-badge next">{t('next_badge')}</span>}
                        {isCued && !isNext && <span className="queue-badge cued">{t('cued_badge')}</span>}
                    </div>
                    <div className="queue-item-artist">{track.artist}</div>
                </div>
            </div>

            {track.isUpcoming && (
                <div className="drag-handle" {...attributes} {...listeners}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="5" y1="9" x2="19" y2="9" />
                        <line x1="5" y1="15" x2="19" y2="15" />
                    </svg>
                </div>
            )}
        </div>
    );
}
