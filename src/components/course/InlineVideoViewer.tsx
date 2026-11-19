/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  FastForward,
  CheckCircle,
  RefreshCw,
  Clock,
  Video,
  X,
} from 'lucide-react';
import {
  parseAndCleanMediaUrl,
  extractYouTubeId,
  extractGoogleDriveId,
  getGoogleDriveVideoFallbacks,
} from '../../lib/urlParser';
import {
  getActiveFullscreenElement,
  requestCrossBrowserFullscreen,
  exitCrossBrowserFullscreen,
  tryUnlockOrientation,
} from '../../lib/fullscreen';
import { formatSecondsHHMMSS } from '../../lib/formatDuration';
import {
  clearMediaSession,
  syncPlatformMediaSession,
  cleanupVideoElement,
  pauseOtherVideoElements,
  stripAutoplayParam,
} from '../../lib/mediaSession';
import { VideoSeekBar } from './VideoSeekBar';
import { CourseLecture } from '../../types';

interface InlineVideoViewerProps {
  lectureId: string;
  sectionId: string;
  title: string;
  chapter?: string;
  description?: string;
  videoUrl: string;
  videoSource?: CourseLecture['videoSource'];
  durationMinutes?: number;
  durationSeconds?: number;
  isCompleted: boolean;
  onMarkCompleted: (lectureId: string) => void;
}

export const InlineVideoViewer: React.FC<InlineVideoViewerProps> = ({
  lectureId,
  sectionId,
  title,
  chapter,
  description,
  videoUrl,
  videoSource,
  durationMinutes,
  durationSeconds,
  isCompleted,
  onMarkCompleted,
}) => {
  const rawUrl = stripAutoplayParam((videoUrl || '').trim());

  const initialDuration =
    durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : durationMinutes && Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationMinutes * 60
      : 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<'forward' | 'backward' | null>(null);
  const [completedToast, setCompletedToast] = useState<string | null>(null);
  const [driveStreamStage, setDriveStreamStage] = useState<0 | 1 | 2>(0);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const stageContainerRef = useRef<HTMLDivElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const ytPollRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'center' | 'right' }>({
    time: 0,
    side: 'center',
  });
  const singleTapTimerRef = useRef<number | null>(null);
  const pushedFsHistoryRef = useRef<boolean>(false);
  const lastTimeRef = useRef<number>(0);
  const pendingResumeTimeRef = useRef<number>(0);
  const ytContainerId = useRef<string>(`inline-yt-${sectionId}-${Date.now()}`);

  const isAnyFullscreen = isFullscreen || isCssFullscreen;

  const parsedMedia = parseAndCleanMediaUrl(rawUrl, 'video');
  const isYouTube = parsedMedia.source === 'youtube' || Boolean(extractYouTubeId(rawUrl));
  const ytId = extractYouTubeId(rawUrl) || parsedMedia.external_id || parsedMedia.id || '';
  const driveId = !isYouTube ? extractGoogleDriveId(rawUrl) : null;
  const isDriveVideo =
    !isYouTube && (parsedMedia.source === 'drive' || videoSource === 'drive' || Boolean(driveId));
  const driveFallbacks = getGoogleDriveVideoFallbacks(driveId || rawUrl);
  const isDriveFallbackMode = isDriveVideo && driveStreamStage === 2;
  const driveProxyUrl = driveFallbacks.fileId
    ? `/api/drive-stream?id=${encodeURIComponent(driveFallbacks.fileId)}`
    : driveFallbacks.primaryStreamUrl;
  const baseDriveStreamUrl =
    driveStreamStage === 0 ? driveProxyUrl : driveFallbacks.primaryStreamUrl;
  const activeVideoSrc = isDriveVideo
    ? reloadNonce > 0
      ? `${baseDriveStreamUrl}${baseDriveStreamUrl.includes('?') ? '&' : '?'}_t=${reloadNonce}`
      : baseDriveStreamUrl
    : rawUrl;

  useEffect(() => {
    setDriveStreamStage(0);
    setReloadNonce(0);
    setCurrentTime(0);
    lastTimeRef.current = 0;
    pendingResumeTimeRef.current = 0;
    setDuration(initialDuration);
    setIsPlaying(false);
    setShowControls(true);
    clearMediaSession();

    const vid = nativeVideoRef.current;
    return () => {
      cleanupVideoElement(vid);
      clearMediaSession();
    };
  }, [sectionId, rawUrl, initialDuration]);

  // Exact 3-second (3000ms) auto-hide timer for controls overlay
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
      setShowSpeedMenu(false);
    }, 3000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
      if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
    };
  }, [resetControlsTimer]);

  const exitFullscreenCleanly = useCallback(async (fromPopState = false) => {
    setIsCssFullscreen(false);
    setIsFullscreen(false);
    await exitCrossBrowserFullscreen(nativeVideoRef.current);

    if (!fromPopState && pushedFsHistoryRef.current) {
      pushedFsHistoryRef.current = false;
      try {
        if (window.history.state?.modal === 'amr-inline-video-fs') {
          window.history.back();
        }
      } catch {}
    } else {
      pushedFsHistoryRef.current = false;
    }
  }, []);

  // Sync fullscreen events (Standard + Safari + iOS + browser Back button)
  useEffect(() => {
    const syncFs = () => {
      const activeEl = getActiveFullscreenElement();
      const nativeFs = Boolean(activeEl);
      if (!nativeFs && isFullscreen && !isCssFullscreen) {
        setIsFullscreen(false);
        tryUnlockOrientation();
        if (pushedFsHistoryRef.current) {
          pushedFsHistoryRef.current = false;
          try {
            if (window.history.state?.modal === 'amr-inline-video-fs') {
              window.history.back();
            }
          } catch {}
        }
      } else if (nativeFs && activeEl === stageContainerRef.current) {
        setIsFullscreen(true);
      }
    };

    const handleVideoEndFs = () => {
      void exitFullscreenCleanly(false);
    };

    const handlePopState = () => {
      if (isFullscreen || isCssFullscreen || getActiveFullscreenElement()) {
        pushedFsHistoryRef.current = false;
        void exitFullscreenCleanly(true);
      }
    };

    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    window.addEventListener('popstate', handlePopState);
    const vidEl = nativeVideoRef.current;
    vidEl?.addEventListener('webkitendfullscreen', handleVideoEndFs);

    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
      window.removeEventListener('popstate', handlePopState);
      vidEl?.removeEventListener('webkitendfullscreen', handleVideoEndFs);
    };
  }, [isFullscreen, isCssFullscreen, exitFullscreenCleanly]);

  // Lock root & body scroll in CSS fullscreen & cleanup on unmount
  useEffect(() => {
    if (!isAnyFullscreen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [isAnyFullscreen]);

  useEffect(() => {
    const stopPlaybackOnBackgroundOrLeave = (fullCleanup: boolean) => {
      const vid = nativeVideoRef.current;
      if (vid && !vid.paused) {
        lastTimeRef.current = vid.currentTime || lastTimeRef.current;
      }
      if (isYouTube && ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo?.();
        } catch {}
      }
      if (fullCleanup) {
        cleanupVideoElement(vid);
      } else if (vid) {
        cleanupVideoElement(vid);
      }
      setIsPlaying(false);
      clearMediaSession();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPlaybackOnBackgroundOrLeave(false);
      }
    };

    const handlePageHide = () => {
      stopPlaybackOnBackgroundOrLeave(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      cleanupVideoElement(nativeVideoRef.current);
      clearMediaSession();
      if (getActiveFullscreenElement() === stageContainerRef.current) {
        void exitCrossBrowserFullscreen(nativeVideoRef.current);
      } else {
        tryUnlockOrientation();
      }
    };
  }, [isYouTube]);

  // Initialize YouTube Player API when source is YouTube
  useEffect(() => {
    if (!isYouTube || !ytId) return;
    let cancelled = false;
    ytContainerId.current = `inline-yt-${sectionId}-${Date.now()}`;

    const initYT = () => {
      if (cancelled || !window.YT || !window.YT.Player) return;
      const el = document.getElementById(ytContainerId.current);
      if (!el) return;

      try {
        ytPlayerRef.current = new window.YT.Player(ytContainerId.current, {
          width: '100%',
          height: '100%',
          videoId: ytId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0,
            controls: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            iv_load_policy: 3,
            hl: 'en',
            origin: typeof window !== 'undefined' ? window.location.origin : '',
          },
          events: {
            onReady: (e: any) => {
              if (cancelled) return;
              const d = e.target.getDuration?.();
              if (d && Number.isFinite(d) && d > 0) setDuration(d);
            },
            onStateChange: (e: any) => {
              if (cancelled) return;
              if (e.data === 1) {
                setIsPlaying(true);
                pauseOtherVideoElements(null);
              } else if (e.data === 2 || e.data === 0) {
                setIsPlaying(false);
                clearMediaSession();
              }
            },
          },
        });
      } catch {
        // Ignore init warning
      }
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      const existingScript = document.getElementById('youtube-iframe-api');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevReady) prevReady();
        if (!cancelled) initYT();
      };
    }

    ytPollRef.current = window.setInterval(() => {
      if (ytPlayerRef.current?.getCurrentTime) {
        try {
          const t = ytPlayerRef.current.getCurrentTime();
          const d = ytPlayerRef.current.getDuration();
          if (typeof t === 'number' && Number.isFinite(t)) setCurrentTime(t);
          if (typeof d === 'number' && Number.isFinite(d) && d > 0) setDuration(d);
        } catch {}
      }
    }, 500);

    return () => {
      cancelled = true;
      if (ytPollRef.current) window.clearInterval(ytPollRef.current);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.stopVideo?.();
          ytPlayerRef.current.destroy?.();
        } catch {}
      }
      ytPlayerRef.current = null;
      clearMediaSession();
    };
  }, [isYouTube, ytId, sectionId]);

  const handleToggleFullscreen = useCallback(async () => {
    resetControlsTimer();
    const activeNow = isFullscreen || isCssFullscreen || Boolean(getActiveFullscreenElement());
    if (activeNow) {
      await exitFullscreenCleanly(false);
      return;
    }

    try {
      window.history.pushState(
        { ...(window.history.state || {}), modal: 'amr-inline-video-fs' },
        ''
      );
      pushedFsHistoryRef.current = true;
    } catch {
      pushedFsHistoryRef.current = false;
    }

    const mode = await requestCrossBrowserFullscreen(stageContainerRef.current, {
      videoEl: nativeVideoRef.current,
      lockLandscapeOnMobile: true,
    });
    if (mode === 'css-fallback') {
      setIsCssFullscreen(true);
      setIsFullscreen(true);
    } else {
      setIsCssFullscreen(false);
      setIsFullscreen(true);
    }
  }, [isFullscreen, isCssFullscreen, exitFullscreenCleanly, resetControlsTimer]);

  const togglePlay = useCallback(() => {
    resetControlsTimer();
    if (isYouTube && ytPlayerRef.current) {
      try {
        if (isPlaying) {
          ytPlayerRef.current.pauseVideo?.();
          setIsPlaying(false);
          clearMediaSession();
        } else {
          pauseOtherVideoElements(null);
          ytPlayerRef.current.playVideo?.();
          setIsPlaying(true);
        }
      } catch {
        setIsPlaying((p) => !p);
      }
      return;
    }

    const vid = nativeVideoRef.current;
    if (vid) {
      if (vid.paused) {
        pauseOtherVideoElements(vid);
        if (!vid.getAttribute('src') && activeVideoSrc) {
          pendingResumeTimeRef.current = lastTimeRef.current;
          vid.src = activeVideoSrc;
          vid.load();
        }
        vid.play().catch(() => {});
        setIsPlaying(true);
      } else {
        vid.pause();
        setIsPlaying(false);
        clearMediaSession();
      }
    }
  }, [isYouTube, isPlaying, activeVideoSrc, resetControlsTimer]);

  const seekToTime = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds);
      setCurrentTime(clamped);
      if (isYouTube && ytPlayerRef.current?.seekTo) {
        try {
          ytPlayerRef.current.seekTo(clamped, true);
        } catch {}
      } else if (nativeVideoRef.current) {
        nativeVideoRef.current.currentTime = clamped;
      }
    },
    [duration, isYouTube]
  );

  const handleStepSeek = useCallback(
    (deltaSeconds: number) => {
      resetControlsTimer();
      const base = nativeVideoRef.current
        ? nativeVideoRef.current.currentTime
        : currentTime;
      const maxCap = duration > 0 ? duration : 99999;
      const next = Math.max(0, Math.min(maxCap, base + deltaSeconds));
      seekToTime(next);
      setDoubleTapFeedback(deltaSeconds > 0 ? 'forward' : 'backward');
      window.setTimeout(() => setDoubleTapFeedback(null), 650);
    },
    [currentTime, duration, resetControlsTimer, seekToTime]
  );

  // Single tap toggles controls visibility ONLY (never pauses/plays); Double-tap right/left seeks ±10s without pausing
  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / (rect.width || 1);
    const side: 'left' | 'center' | 'right' = relX < 0.35 ? 'left' : relX > 0.65 ? 'right' : 'center';
    const now = Date.now();

    if (side !== 'center' && lastTapRef.current.side === side && now - lastTapRef.current.time < 320) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = { time: 0, side: 'center' };
      handleStepSeek(side === 'right' ? 10 : -10);
      return;
    }

    lastTapRef.current = { time: now, side };
    if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      if (showControls) {
        if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
        setShowControls(false);
        setShowSpeedMenu(false);
      } else {
        resetControlsTimer();
      }
    }, 220);
  };

  // Spacebar toggles play/pause & Esc exits fullscreen
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;

      if (e.code === 'Space') {
        if (isAnyFullscreen || stageContainerRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          togglePlay();
        }
      } else if (e.key === 'Escape' && isAnyFullscreen) {
        e.preventDefault();
        void exitFullscreenCleanly(false);
      } else if ((e.key === 'f' || e.key === 'F') && isAnyFullscreen) {
        e.preventDefault();
        void exitFullscreenCleanly(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAnyFullscreen, togglePlay, exitFullscreenCleanly]);

  const toggleMute = () => {
    resetControlsTimer();
    if (isYouTube && ytPlayerRef.current) {
      if (isMuted) {
        ytPlayerRef.current.unMute?.();
        setIsMuted(false);
      } else {
        ytPlayerRef.current.mute?.();
        setIsMuted(true);
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    resetControlsTimer();
    const v = parseFloat(e.target.value);
    setVolume(v);
    setIsMuted(v === 0);
    if (isYouTube && ytPlayerRef.current) {
      ytPlayerRef.current.setVolume?.(Math.round(v * 100));
      if (v === 0) ytPlayerRef.current.mute?.();
      else ytPlayerRef.current.unMute?.();
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.volume = v;
      nativeVideoRef.current.muted = v === 0;
    }
  };

  const handleSpeedChange = (speed: number) => {
    resetControlsTimer();
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
    if (isYouTube && ytPlayerRef.current?.setPlaybackRate) {
      try {
        ytPlayerRef.current.setPlaybackRate(speed);
      } catch {}
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.playbackRate = speed;
    }
  };

  const handleReloadDriveVideo = () => {
    const freshTs = Date.now();
    setDriveStreamStage(0);
    setReloadNonce(freshTs);
    setIsPlaying(false);
    clearMediaSession();
    if (nativeVideoRef.current && isDriveVideo) {
      const freshSrc = `${driveProxyUrl}${driveProxyUrl.includes('?') ? '&' : '?'}_t=${freshTs}`;
      nativeVideoRef.current.pause();
      nativeVideoRef.current.src = freshSrc;
      nativeVideoRef.current.load();
    }
  };

  const readNativeVideoDuration = () => {
    const vid = nativeVideoRef.current;
    if (vid?.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
      setDuration(vid.duration);
    }
  };

  // Bind MediaSession ONLY while actively playing; clear immediately when paused/unmounted
  useEffect(() => {
    if (!isPlaying) {
      clearMediaSession();
      return;
    }
    syncPlatformMediaSession({
      title,
      chapter,
      onPlay: () => {
        if (isYouTube) ytPlayerRef.current?.playVideo?.();
        else nativeVideoRef.current?.play().catch(() => {});
      },
      onPause: () => {
        if (isYouTube) ytPlayerRef.current?.pauseVideo?.();
        else nativeVideoRef.current?.pause();
        setIsPlaying(false);
        clearMediaSession();
      },
      onSeekBackward: () => handleStepSeek(-10),
      onSeekForward: () => handleStepSeek(10),
      onSeekTo: (t) => seekToTime(t),
    });
  }, [isPlaying, title, chapter, isYouTube, handleStepSeek, seekToTime]);

  if (!rawUrl) {
    return (
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-3 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto">
          <Video className="w-6 h-6" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No video link has been attached to this section yet. You can choose another section from the list.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={stageContainerRef}
      tabIndex={0}
      onContextMenu={(e) => e.preventDefault()}
      className={
        isAnyFullscreen
          ? 'fixed inset-0 z-[9999] w-[100dvw] h-[100dvh] bg-black flex items-center justify-center overflow-hidden select-none outline-none'
          : 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm flex flex-col select-none outline-none'
      }
    >
      {/* Normal Inline Top Header (Hidden completely in Fullscreen; NO blue minimize/maximize button here) */}
      {!isAnyFullscreen && (
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2.5 shrink-0 border-b bg-slate-50 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            {chapter && (
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 block truncate">
                {chapter}
              </span>
            )}
            <h3 className="text-sm sm:text-base font-extrabold truncate text-slate-900 dark:text-white">
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isDriveVideo && (
              <>
                <button
                  type="button"
                  onClick={handleReloadDriveVideo}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-400 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  title="Reload video"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Reload Stream</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleFullscreen()}
                  className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4 text-amber-400" />
                  <span>Fullscreen</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                onMarkCompleted(lectureId);
                setCompletedToast(
                  isCompleted
                    ? 'Completion status updated successfully'
                    : 'Lesson marked as completed and your progress saved!'
                );
                window.setTimeout(() => setCompletedToast(null), 3000);
              }}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isCompleted
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isCompleted ? 'Completed ✓' : 'Mark Completed'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Video Player Canvas */}
      <div
        onMouseMove={() => {
          if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)')?.matches) {
            resetControlsTimer();
          }
        }}
        className={`relative w-full bg-black flex items-center justify-center overflow-hidden ${
          isAnyFullscreen
            ? 'h-full w-full'
            : 'h-[72dvh] sm:h-[75dvh] min-h-[380px] max-h-[840px]'
        }`}
      >
        {/* Fullscreen X Exit Button (>= 44px) at top-left so user can always exit CSS/native fullscreen */}
        {isAnyFullscreen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void exitFullscreenCleanly(false);
            }}
            aria-label="Exit Fullscreen"
            title="Exit Fullscreen (Esc)"
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-40 min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-black/75 hover:bg-red-600 text-white border border-white/25 backdrop-blur-md shadow-xl flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Fullscreen Top Overlay: Subtle Semi-Transparent Lecture Title ONLY (hidden over Drive iframe) */}
        {isAnyFullscreen && !isDriveFallbackMode && (
          <div
            className={`pointer-events-none absolute top-0 inset-x-0 z-30 pl-[max(4rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.85rem,env(safe-area-inset-top))] pb-8 bg-gradient-to-b from-black/70 via-black/30 to-transparent transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <p className="text-xs sm:text-sm font-bold text-white/85 truncate">{title}</p>
          </div>
        )}

        {isYouTube ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black [&_iframe]:w-full [&_iframe]:h-full [&_iframe]:border-0">
            <div id={ytContainerId.current} className="w-full h-full" />
            <div
              onClick={handleSurfaceClick}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 z-10 cursor-pointer"
              title="Tap to show/hide controls • Double-tap left/right to seek"
            />
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {!isDriveFallbackMode && (
              <video
                ref={nativeVideoRef}
                src={activeVideoSrc}
                preload="metadata"
                autoPlay={false}
                controls={false}
                controlsList="nodownload noplaybackrate nofullscreen"
                disablePictureInPicture
                disableRemotePlayback
                playsInline
                {...({ 'webkit-playsinline': 'true', 'x-webkit-airplay': 'deny' } as Record<string, string>)}
                onContextMenu={(e) => e.preventDefault()}
                onLoadedMetadata={() => {
                  readNativeVideoDuration();
                  const vid = nativeVideoRef.current;
                  if (vid && pendingResumeTimeRef.current > 0) {
                    try {
                      vid.currentTime = pendingResumeTimeRef.current;
                    } catch {}
                    pendingResumeTimeRef.current = 0;
                  }
                }}
                onLoadedData={readNativeVideoDuration}
                onCanPlay={readNativeVideoDuration}
                onDurationChange={readNativeVideoDuration}
                onPlay={() => {
                  pauseOtherVideoElements(nativeVideoRef.current);
                  setIsPlaying(true);
                }}
                onPause={() => {
                  setIsPlaying(false);
                  clearMediaSession();
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  clearMediaSession();
                }}
                onEmptied={() => {
                  setIsPlaying(false);
                  clearMediaSession();
                }}
                onTimeUpdate={() => {
                  const vid = nativeVideoRef.current;
                  if (vid) {
                    lastTimeRef.current = vid.currentTime;
                    setCurrentTime(vid.currentTime);
                    readNativeVideoDuration();
                  }
                }}
                onError={() => {
                  if (isDriveVideo && driveStreamStage === 0) {
                    setDriveStreamStage(1);
                  } else if (isDriveVideo && driveStreamStage === 1) {
                    setDriveStreamStage(2);
                    setIsPlaying(false);
                    clearMediaSession();
                  }
                }}
                className="w-full h-full object-contain pointer-events-none select-none"
              />
            )}

            {isDriveFallbackMode && isDriveVideo && driveFallbacks.previewEmbedUrl && (
              <iframe
                src={stripAutoplayParam(driveFallbacks.previewEmbedUrl)}
                title={title}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
                className="w-full h-full border-0 relative z-10 block"
              />
            )}

            {/* Non-fullscreen vs Fullscreen Drive UI control shielding:
                Outside fullscreen, cleanly hide/shield Drive's top & bottom oversized control bars on phone/tablet/desktop;
                In fullscreen, expose Drive's full native controls cleanly while keeping top-right pop-out blocked */}
            {isDriveFallbackMode && !isAnyFullscreen && (
              <>
                <div
                  aria-hidden="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.preventDefault()}
                  className="absolute top-0 inset-x-0 h-14 bg-gradient-to-b from-black/95 via-black/75 to-transparent z-20 pointer-events-auto"
                />
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.preventDefault()}
                  className="absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-black/95 via-black/85 to-transparent z-20 pointer-events-auto flex items-center justify-between px-3 sm:px-4"
                >
                  <span className="text-[11px] font-bold text-slate-300 truncate">
                    Tap center of video to play or enter fullscreen for full controls
                  </span>
                  <span className="text-[11px] font-bold text-amber-400 shrink-0">
                    English with Miss Asmaa
                  </span>
                </div>
              </>
            )}
            {isDriveFallbackMode && isAnyFullscreen && (
              <div
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
                className="absolute top-0 right-0 w-24 h-14 bg-transparent z-20 pointer-events-auto"
              />
            )}

            {!isDriveFallbackMode && (
              <div
                onClick={handleSurfaceClick}
                onContextMenu={(e) => e.preventDefault()}
                className="absolute inset-0 z-10 cursor-pointer"
                title="Tap to show controls • Double-tap left/right to seek"
              />
            )}
          </div>
        )}

        {/* Double-tap Seek Feedback Ripple */}
        {doubleTapFeedback === 'forward' && (
          <div className="pointer-events-none absolute right-10 sm:right-16 z-30 flex flex-col items-center justify-center p-3.5 rounded-full bg-black/75 text-amber-400 animate-in zoom-in-75 fade-in">
            <FastForward className="w-8 h-8" />
            <span className="text-xs font-bold font-mono mt-1">+10s</span>
          </div>
        )}
        {doubleTapFeedback === 'backward' && (
          <div className="pointer-events-none absolute left-10 sm:left-16 z-30 flex flex-col items-center justify-center p-3.5 rounded-full bg-black/75 text-amber-400 animate-in zoom-in-75 fade-in">
            <RotateCcw className="w-8 h-8" />
            <span className="text-xs font-bold font-mono mt-1">-10s</span>
          </div>
        )}

        {/* Center Play Overlay Button when paused */}
        {!isDriveFallbackMode && !isPlaying && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            aria-label="Play Video"
            className="absolute z-20 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500/95 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-2xl transition-transform hover:scale-105 cursor-pointer"
          >
            <Play className="w-8 h-8 fill-slate-950 ml-0.5" />
          </button>
        )}

        {/* Floating Translucent Controls Overlay (Auto-hides after 3s inactivity) */}
        {!isDriveFallbackMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              resetControlsTimer();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              resetControlsTimer();
            }}
            className={`absolute inset-x-0 bottom-0 z-30 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 via-black/55 to-transparent transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Strict LTR Seek Bar */}
            <div className="mb-1">
              <VideoSeekBar
                currentTime={currentTime}
                duration={duration}
                onSeek={seekToTime}
                onInteract={resetControlsTimer}
              />
            </div>

            {/* Bottom Controls Row: Play/Seek/Volume on Left (LTR) — Speed 1x + Fullscreen Toggle on Far Right */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold cursor-pointer"
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-slate-950" />
                  ) : (
                    <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleStepSeek(-10)}
                  className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-white/15 text-xs font-mono font-bold flex items-center justify-center gap-1 cursor-pointer"
                  title="Rewind 10 seconds"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>10</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStepSeek(10)}
                  className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-white/15 text-xs font-mono font-bold flex items-center justify-center gap-1 cursor-pointer"
                  title="Forward 10 seconds"
                >
                  <span>10</span>
                  <FastForward className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-100 border border-white/15 flex items-center justify-center cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <input
                  type="range"
                  dir="ltr"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-12 sm:w-16 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  title="Volume"
                />
              </div>

              {/* Far-Right Group (in LTR: Speed 1x + Fullscreen Toggle) */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      resetControlsTimer();
                      setShowSpeedMenu((s) => !s);
                    }}
                    className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-white/15 font-mono text-xs font-bold cursor-pointer"
                  >
                    {playbackSpeed}x
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-12 right-0 bg-slate-900 border border-slate-700 rounded-xl py-1 shadow-2xl z-40 text-xs w-28">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSpeedChange(s)}
                          className={`w-full min-h-[38px] text-left px-3 py-1.5 hover:bg-slate-800 cursor-pointer ${
                            playbackSpeed === s ? 'text-amber-400 font-bold' : 'text-slate-300'
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleToggleFullscreen()}
                  className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white border border-white/15 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
                  title={isAnyFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isAnyFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {completedToast && !isAnyFullscreen && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-2xl bg-emerald-600 text-white text-xs font-bold shadow-xl flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span>{completedToast}</span>
          </div>
        )}
      </div>

      {/* Normal Inline Footer Info (only shown outside Fullscreen) */}
      {!isAnyFullscreen && (
        <div className="p-4 sm:p-5 bg-white dark:bg-[#0F172A] border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <p className="leading-relaxed line-clamp-2">{description || 'Interactive lesson inside the platform'}</p>
          <span className="inline-flex items-center gap-1 font-mono tabular-nums shrink-0 text-amber-600 dark:text-amber-400 font-bold">
            <Clock className="w-3.5 h-3.5" />
            {formatSecondsHHMMSS(duration)}
          </span>
        </div>
      )}
    </div>
  );
};
