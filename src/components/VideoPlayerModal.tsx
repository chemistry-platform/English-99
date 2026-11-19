/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  FastForward,
  CheckCircle,
  ShieldCheck,
  Check,
  RefreshCw,
} from 'lucide-react';
import { parseAndCleanMediaUrl, extractYouTubeId, extractGoogleDriveId, getGoogleDriveVideoFallbacks } from '../lib/urlParser';
import {
  getActiveFullscreenElement,
  requestCrossBrowserFullscreen,
  exitCrossBrowserFullscreen,
  tryUnlockOrientation,
} from '../lib/fullscreen';
import { VideoSeekBar } from './course/VideoSeekBar';
import { CourseLecture, ChemistryDocument, ExamOrAssignment, UserProfile } from '../types';
import {
  clearMediaSession,
  syncPlatformMediaSession,
  cleanupVideoElement,
  pauseOtherVideoElements,
  stripAutoplayParam,
} from '../lib/mediaSession';

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

interface VideoPlayerModalProps {
  lecture: CourseLecture | null;
  currentUser: UserProfile | null;
  onClose: () => void;
  onMarkCompleted: (lectureId: string) => void;
  isCompleted: boolean;
  onOpenDocument?: (doc: ChemistryDocument) => void;
  onOpenExam?: (exam: ExamOrAssignment) => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  lecture,
  currentUser,
  onClose,
  onMarkCompleted,
  isCompleted,
  onOpenDocument,
  onOpenExam,
}) => {
  const rawUrl = stripAutoplayParam((lecture?.videoUrl || '').trim());

  // Playback state
  const initialDur =
    lecture?.durationSeconds && Number.isFinite(lecture.durationSeconds) && lecture.durationSeconds > 0
      ? lecture.durationSeconds
      : lecture?.durationMinutes && Number.isFinite(lecture.durationMinutes) && lecture.durationMinutes > 0
      ? lecture.durationMinutes * 60
      : 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDur);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedQuality, setSelectedQuality] = useState('1080p (Full HD)');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<'forward' | 'backward' | null>(null);
  const [completedToast, setCompletedToast] = useState<string | null>(null);
  const [isEnded, setIsEnded] = useState(false);
  const [isPausedOverlay, setIsPausedOverlay] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>('16/9');
  const [driveStreamStage, setDriveStreamStage] = useState<0 | 1 | 2>(0);
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [isLandscape, setIsLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : true
  );
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) <= 768 : false
  );

  // Floating Watermark position
  const [watermarkPos, setWatermarkPos] = useState({ top: '22%', left: '25%' });

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const pollIntervalRef = useRef<any>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'center' | 'right' }>({ time: 0, side: 'center' });
  const clickTimeoutRef = useRef<any>(null);
  const pushedFsHistoryRef = useRef<boolean>(false);
  const lastTimeRef = useRef<number>(0);
  const pendingResumeTimeRef = useRef<number>(0);
  const ytContainerId = useRef<string>(`yt-player-${Date.now()}`);

  const parsedMedia = parseAndCleanMediaUrl(rawUrl, 'video');
  const isYouTube = parsedMedia.source === 'youtube' || Boolean(extractYouTubeId(rawUrl));
  const ytId = extractYouTubeId(rawUrl) || parsedMedia.external_id || parsedMedia.id || 'dQw4w9WgXcQ';
  const driveId = !isYouTube
    ? extractGoogleDriveId(rawUrl) || (lecture?.provider === 'drive' ? lecture.external_id || null : null)
    : null;
  const isDriveVideo = !isYouTube && (parsedMedia.source === 'drive' || lecture?.videoSource === 'drive' || Boolean(driveId));
  const driveFallbacks = getGoogleDriveVideoFallbacks(driveId || rawUrl);
  const isDriveFallbackMode = isDriveVideo && driveStreamStage === 2;
  const driveProxyUrl = driveFallbacks.fileId ? `/api/drive-stream?id=${encodeURIComponent(driveFallbacks.fileId)}` : driveFallbacks.primaryStreamUrl;
  const baseDriveStreamUrl =
    driveStreamStage === 0 ? driveProxyUrl : driveFallbacks.primaryStreamUrl;
  const activeVideoSrc = isDriveVideo
    ? reloadNonce > 0
      ? `${baseDriveStreamUrl}${baseDriveStreamUrl.includes('?') ? '&' : '?'}_t=${reloadNonce}`
      : baseDriveStreamUrl
    : lecture?.videoUrl || '';

  const handleReloadDriveVideo = () => {
    const freshTs = Date.now();
    setDriveStreamStage(0);
    setReloadNonce(freshTs);
    setIsEnded(false);
    setIsPausedOverlay(false);
    setIsPlaying(false);
    clearMediaSession();

    const freshSrc = isDriveVideo
      ? `${driveProxyUrl}${driveProxyUrl.includes('?') ? '&' : '?'}_t=${freshTs}`
      : stripAutoplayParam(lecture?.videoUrl || '');

    requestAnimationFrame(() => {
      if (nativeVideoRef.current && freshSrc) {
        nativeVideoRef.current.pause();
        nativeVideoRef.current.src = freshSrc;
        nativeVideoRef.current.load();
      }
    });
  };

  const handleCloseCleanly = () => {
    cleanupVideoElement(nativeVideoRef.current);
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.stopVideo?.();
        ytPlayerRef.current.destroy?.();
      } catch {}
    }
    setIsPlaying(false);
    clearMediaSession();
    onClose();
  };

  useEffect(() => {
    setDriveStreamStage(0);
    setReloadNonce(0);
    setIsEnded(false);
    setIsPausedOverlay(false);
    setIsPlaying(false);
    setCurrentTime(0);
    lastTimeRef.current = 0;
    pendingResumeTimeRef.current = 0;
    setDuration(initialDur);
    clearMediaSession();

    const vid = nativeVideoRef.current;
    return () => {
      cleanupVideoElement(vid);
      clearMediaSession();
    };
  }, [lecture?.id, rawUrl, initialDur]);

  // 1. Lock root & body scroll while modal is active & unlock orientation + cleanup video on unmount
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      cleanupVideoElement(nativeVideoRef.current);
      clearMediaSession();
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overscrollBehavior = originalBodyOverscroll;
      tryUnlockOrientation();
    };
  }, []);

  // 2. Handle Browser Back Button, Escape Key, and Cross-browser Fullscreen Change sync
  useEffect(() => {
    window.history.pushState({ modal: 'amr-video-player' }, '');
    const handlePopState = () => {
      if (getActiveFullscreenElement() || isCssFullscreen || isFullscreen) {
        pushedFsHistoryRef.current = false;
        setIsCssFullscreen(false);
        setIsFullscreen(false);
        void exitCrossBrowserFullscreen(nativeVideoRef.current);
      } else {
        handleCloseCleanly();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (getActiveFullscreenElement() || isCssFullscreen || isFullscreen) {
          setIsCssFullscreen(false);
          setIsFullscreen(false);
          void exitCrossBrowserFullscreen(nativeVideoRef.current);
          if (pushedFsHistoryRef.current) {
            pushedFsHistoryRef.current = false;
            try {
              if (window.history.state?.modal === 'amr-video-player-fs') {
                window.history.back();
              }
            } catch {}
          }
        } else {
          handleCloseCleanly();
        }
      }
    };
    const handleFullscreenChange = () => {
      const activeEl = getActiveFullscreenElement();
      if (!activeEl && !isCssFullscreen) {
        setIsFullscreen(false);
        tryUnlockOrientation();
        if (pushedFsHistoryRef.current) {
          pushedFsHistoryRef.current = false;
          try {
            if (window.history.state?.modal === 'amr-video-player-fs') {
              window.history.back();
            }
          } catch {}
        }
      } else if (activeEl) {
        setIsFullscreen(true);
      }
    };
    const handleVideoEndFs = () => {
      setIsCssFullscreen(false);
      setIsFullscreen(false);
      tryUnlockOrientation();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    const vidEl = nativeVideoRef.current;
    vidEl?.addEventListener('webkitendfullscreen', handleVideoEndFs);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      vidEl?.removeEventListener('webkitendfullscreen', handleVideoEndFs);
    };
  }, [onClose, isCssFullscreen, isFullscreen]);

  // 3. Floating Watermark Animation (Every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const top = Math.floor(15 + Math.random() * 65);
      const left = Math.floor(10 + Math.random() * 70);
      setWatermarkPos({ top: `${top}%`, left: `${left}%` });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // 4. Tab Visibility & pagehide: pause, cleanup src, and clear MediaSession when backgrounded or leaving page
  useEffect(() => {
    const stopAndRelease = () => {
      const vid = nativeVideoRef.current;
      if (vid && !vid.paused) {
        lastTimeRef.current = vid.currentTime || lastTimeRef.current;
      }
      if (isYouTube && ytPlayerRef.current?.pauseVideo) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }
      cleanupVideoElement(vid);
      setIsPlaying(false);
      clearMediaSession();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAndRelease();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', stopAndRelease);
    window.addEventListener('beforeunload', stopAndRelease);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', stopAndRelease);
      window.removeEventListener('beforeunload', stopAndRelease);
    };
  }, [isYouTube]);

  // 5. Controls auto-hide after exact 3 seconds (3000ms) of inactivity
  const resetControlsTimer = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSpeedMenu(false);
      setShowQualityMenu(false);
    }, 3000);
  };

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, isFullscreen, isCssFullscreen, isLandscape]);

  // 6. Live Orientation & Mobile Viewport Listener (Portrait Top Frame <-> Landscape Edge-to-Edge Fullscreen)
  useEffect(() => {
    const syncOrientation = () => {
      if (typeof window === 'undefined') return;
      const mqLandscape = window.matchMedia?.('(orientation: landscape)')?.matches;
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsLandscape(typeof mqLandscape === 'boolean' ? mqLandscape : w > h);
      setIsMobileViewport(Math.min(w, h) <= 768);
    };

    syncOrientation();
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);
    return () => {
      window.removeEventListener('resize', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
    };
  }, []);

  // 7. YouTube IFrame Player API initialization (Requirement 2)
  useEffect(() => {
    if (!isYouTube) return;

    let isSubscribed = true;

    const initYT = () => {
      if (!window.YT || !window.YT.Player) return;
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
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            cc_load_policy: 0,
            hl: 'en',
            origin: typeof window !== 'undefined' ? window.location.origin : '',
          },
          events: {
            onReady: (e: any) => {
              if (!isSubscribed) return;
              const dur = e.target.getDuration();
              if (dur && !isNaN(dur) && dur > 0) setDuration(dur);
            },
            onStateChange: (e: any) => {
              if (!isSubscribed) return;
              // 1: playing, 2: paused, 0: ended
              if (e.data === 1) {
                pauseOtherVideoElements(null);
                setIsPlaying(true);
                setIsEnded(false);
                setIsPausedOverlay(false);
              } else if (e.data === 2) {
                setIsPlaying(false);
                setIsPausedOverlay(true);
                clearMediaSession();
              } else if (e.data === 0) {
                setIsPlaying(false);
                setIsEnded(true);
                setIsPausedOverlay(true);
                clearMediaSession();
              }
            },
          },
        });
      } catch (err) {
        console.warn('YT Player init exception:', err);
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
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevReady) prevReady();
        if (isSubscribed) initYT();
      };
    }

    // Polling current playback time
    pollIntervalRef.current = setInterval(() => {
      if (ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
        try {
          const t = ytPlayerRef.current.getCurrentTime();
          const d = ytPlayerRef.current.getDuration();
          if (typeof t === 'number' && !isNaN(t)) setCurrentTime(t);
          if (typeof d === 'number' && !isNaN(d) && d > 0) setDuration(d);
        } catch {}
      }
    }, 400);

    return () => {
      isSubscribed = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.stopVideo?.();
          ytPlayerRef.current.destroy?.();
        } catch {}
      }
      ytPlayerRef.current = null;
      clearMediaSession();
    };
  }, [isYouTube, ytId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepSeek(10);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStepSeek(-10);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, isFullscreen, currentTime, duration]);

  const isYtFunctional = () => {
    return Boolean(
      ytPlayerRef.current &&
      typeof ytPlayerRef.current.pauseVideo === 'function' &&
      typeof ytPlayerRef.current.playVideo === 'function'
    );
  };

  // Actions
  const togglePlay = () => {
    if (isYouTube) {
      if (isYtFunctional()) {
        try {
          if (isPlaying) {
            ytPlayerRef.current.pauseVideo();
            setIsPlaying(false);
            setIsPausedOverlay(true);
            clearMediaSession();
          } else {
            pauseOtherVideoElements(null);
            ytPlayerRef.current.playVideo();
            setIsPlaying(true);
            setIsPausedOverlay(false);
            setIsEnded(false);
          }
        } catch (err) {
          console.warn('YT togglePlay warning:', err);
          setIsPlaying(!isPlaying);
        }
      } else {
        setIsPlaying(!isPlaying);
      }
    } else if (nativeVideoRef.current) {
      const vid = nativeVideoRef.current;
      try {
        if (isPlaying) {
          vid.pause();
          setIsPlaying(false);
          setIsPausedOverlay(true);
          clearMediaSession();
        } else {
          pauseOtherVideoElements(vid);
          if (!vid.getAttribute('src') && activeVideoSrc) {
            pendingResumeTimeRef.current = lastTimeRef.current;
            vid.src = activeVideoSrc;
            vid.load();
          }
          vid.play().catch(() => {});
          setIsPlaying(true);
          setIsPausedOverlay(false);
          setIsEnded(false);
        }
      } catch (err) {
        console.warn('Native video toggle play warning:', err);
      }
    }
  };

  useEffect(() => {
    if (!isPlaying || !lecture) {
      clearMediaSession();
      return;
    }
    syncPlatformMediaSession({
      title: lecture.title,
      chapter: lecture.chapter,
      onPlay: () => {
        if (isYouTube) ytPlayerRef.current?.playVideo?.();
        else nativeVideoRef.current?.play().catch(() => {});
      },
      onPause: () => {
        if (isYouTube) ytPlayerRef.current?.pauseVideo?.();
        else nativeVideoRef.current?.pause();
        setIsPlaying(false);
        setIsPausedOverlay(true);
        clearMediaSession();
      },
      onSeekBackward: () => handleStepSeek(-10),
      onSeekForward: () => handleStepSeek(10),
      onSeekTo: (t) => seekToTime(t),
    });
  }, [isPlaying, lecture, isYouTube]);

  // Single tap toggles controls ONLY for 3s (never pauses/plays); double-tap left/right seeks ±10s without pausing
  const handleSurfaceTap = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / (rect.width || 1);
    const side: 'left' | 'center' | 'right' = relX < 0.35 ? 'left' : relX > 0.65 ? 'right' : 'center';
    const now = Date.now();

    if (side !== 'center' && lastTapRef.current.side === side && now - lastTapRef.current.time < 320) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      lastTapRef.current = { time: 0, side: 'center' };
      handleStepSeek(side === 'right' ? 10 : -10);
      return;
    }

    lastTapRef.current = { time: now, side };
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
      if (showControls) {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        setShowControls(false);
        setShowSpeedMenu(false);
        setShowQualityMenu(false);
      } else {
        resetControlsTimer();
      }
    }, 220);
  };

  const toggleMute = () => {
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.mute === 'function' && typeof ytPlayerRef.current.unMute === 'function') {
        try {
          if (isMuted) {
            ytPlayerRef.current.unMute();
            setIsMuted(false);
          } else {
            ytPlayerRef.current.mute();
            setIsMuted(true);
          }
        } catch (err) {
          console.warn('YT toggleMute warning:', err);
          setIsMuted(!isMuted);
        }
      } else {
        setIsMuted(!isMuted);
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
        try {
          ytPlayerRef.current.setVolume(Math.round(newVol * 100));
          if (newVol === 0 && typeof ytPlayerRef.current.mute === 'function') {
            ytPlayerRef.current.mute();
          } else if (newVol > 0 && typeof ytPlayerRef.current.unMute === 'function') {
            ytPlayerRef.current.unMute();
          }
        } catch {}
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.volume = newVol;
      nativeVideoRef.current.muted = newVol === 0;
    }
  };

  const handleStepSeek = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(newTime, true);
        } catch {}
      }
      setCurrentTime(newTime);
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
    setDoubleTapFeedback(seconds > 0 ? 'forward' : 'backward');
    setTimeout(() => setDoubleTapFeedback(null), 700);
  };

  const seekToTime = (newTime: number) => {
    const clamped = Math.max(0, duration > 0 ? Math.min(duration, newTime) : newTime);
    setCurrentTime(clamped);
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(clamped, true);
        } catch {}
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.currentTime = clamped;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.setPlaybackRate === 'function') {
        try {
          ytPlayerRef.current.setPlaybackRate(speed);
        } catch {}
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.playbackRate = speed;
    }
  };

  // Fullscreen: Cross-browser + Safari/iOS support on CONTAINER so controls overlay stays visible
  const toggleFullscreen = async () => {
    resetControlsTimer();
    const activeNow = isFullscreen || isCssFullscreen || Boolean(getActiveFullscreenElement());
    if (activeNow) {
      setIsCssFullscreen(false);
      setIsFullscreen(false);
      await exitCrossBrowserFullscreen(nativeVideoRef.current);
      if (pushedFsHistoryRef.current) {
        pushedFsHistoryRef.current = false;
        try {
          if (window.history.state?.modal === 'amr-video-player-fs') {
            window.history.back();
          }
        } catch {}
      }
      return;
    }

    try {
      window.history.pushState(
        { ...(window.history.state || {}), modal: 'amr-video-player-fs' },
        ''
      );
      pushedFsHistoryRef.current = true;
    } catch {
      pushedFsHistoryRef.current = false;
    }

    const mode = await requestCrossBrowserFullscreen(containerRef.current, {
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
  };

  if (!lecture) return null;

  const isAnyFullscreen = isFullscreen || isCssFullscreen;
  const isMobilePortrait = isMobileViewport && !isLandscape && !isAnyFullscreen;
  const isEdgeToEdgeFullscreen = isAnyFullscreen || (isMobileViewport && isLandscape);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={
        isMobilePortrait
          ? 'fixed inset-0 z-[60] w-screen h-[100dvh] bg-black flex flex-col justify-start overflow-y-auto select-none animate-in fade-in'
          : 'fixed inset-0 z-[60] w-screen h-[100dvh] bg-black flex items-center justify-center overflow-hidden select-none animate-in fade-in'
      }
    >
      {/* Mobile Portrait Top Safe Spacer & Return Header */}
      {isMobilePortrait && (
        <div className="sticky top-0 z-40 w-full px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] bg-slate-950 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-amber-400 block truncate">{lecture.chapter}</span>
            <h3 className="text-xs font-extrabold text-white truncate">{lecture.title}</h3>
          </div>
          <button
            type="button"
            onClick={handleCloseCleanly}
            className="min-h-[44px] px-3 rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>
      )}

      {/* Video Container with Adaptive Portrait (Top) vs Edge-to-Edge Landscape Sizing */}
      <div
        ref={containerRef}
        onMouseMove={() => {
          if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)')?.matches) {
            resetControlsTimer();
          }
        }}
        style={
          isEdgeToEdgeFullscreen || isMobilePortrait || isDriveVideo
            ? undefined
            : { aspectRatio }
        }
        className={
          isEdgeToEdgeFullscreen
            ? 'fixed inset-0 w-[100dvw] h-[100dvh] max-w-none max-h-none bg-black flex items-center justify-center overflow-hidden group z-[9999]'
            : isMobilePortrait
            ? 'relative w-full h-[74dvh] min-h-[360px] max-h-[82dvh] bg-black flex items-center justify-center overflow-hidden group shrink-0 border-b border-slate-800/80'
            : 'relative w-full max-w-6xl h-[75dvh] min-h-[420px] max-h-[860px] bg-black flex items-center justify-center overflow-hidden group rounded-2xl'
        }
      >
        {/* Edge-to-Edge Fullscreen Exit X Button (>= 44px) so Drive/iOS users can always exit cleanly */}
        {isEdgeToEdgeFullscreen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isAnyFullscreen) {
                void toggleFullscreen();
              } else {
                handleCloseCleanly();
              }
            }}
            aria-label={isAnyFullscreen ? 'Exit Fullscreen' : 'Close Player'}
            title={isAnyFullscreen ? 'Exit Fullscreen (Esc)' : 'Close Player'}
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-40 min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-black/75 hover:bg-red-600 text-white border border-white/25 backdrop-blur-md shadow-xl flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Fullscreen Top Overlay: Subtle semi-transparent lecture title ONLY (hidden over Drive iframe) */}
        {isEdgeToEdgeFullscreen && !isDriveFallbackMode && (
          <div
            className={`pointer-events-none absolute top-0 inset-x-0 z-30 pl-[max(4rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.85rem,env(safe-area-inset-top))] pb-8 bg-gradient-to-b from-black/70 via-black/30 to-transparent transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <p className="text-xs sm:text-sm font-bold text-white/85 truncate">{lecture.title}</p>
          </div>
        )}

        {/* Top Floating Controls (Hidden in Fullscreen and hidden over mobile portrait Drive iframe where header/footer already provide them) */}
        {!isEdgeToEdgeFullscreen && !(isDriveFallbackMode && isMobilePortrait) && (
          <div
            className={`absolute top-[max(1rem,env(safe-area-inset-top))] ${
              isDriveFallbackMode ? 'left-4' : 'right-4'
            } z-40 flex items-center gap-2 transition-opacity duration-300 ${
              showControls || isDriveFallbackMode ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {isDriveVideo && (
              <button
                onClick={handleReloadDriveVideo}
                className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 text-amber-400 border border-amber-500/40 backdrop-blur-md shadow-lg text-xs font-bold transition-all cursor-pointer"
                title="Reload video and reset live stream"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Reload Stream</span>
              </button>
            )}

            <button
              onClick={() => void toggleFullscreen()}
              className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 backdrop-blur-md shadow-lg transition-all cursor-pointer"
              title="Fullscreen"
            >
              <Maximize className="w-4 h-4" />
            </button>

            <button
              onClick={handleCloseCleanly}
              className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-red-600/85 hover:bg-red-600 text-white backdrop-blur-md shadow-lg transition-all cursor-pointer"
              title="Close and return to platform (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Floating Moving Watermark: Student Name & Phone */}
        <div
          style={{ top: watermarkPos.top, left: watermarkPos.left }}
          className="absolute z-30 pointer-events-none transition-all duration-1000 ease-out flex flex-col items-center bg-black/40 backdrop-blur-[2px] px-2.5 py-1 rounded-lg border border-white/10 opacity-30 text-[11px] font-mono text-white"
        >
          <span className="font-bold text-amber-300">{currentUser?.fullName || 'English with Miss Asmaa Student'}</span>
          <span className="text-[10px] text-slate-300">{currentUser?.phone || currentUser?.studentCode || '01069780486'}</span>
        </div>

        {/* Double-tap Seek Feedback Ripple */}
        {doubleTapFeedback === 'forward' && (
          <div className="absolute right-16 z-30 flex flex-col items-center justify-center p-4 rounded-full bg-black/70 text-amber-400 animate-in zoom-in-75 fade-in">
            <FastForward className="w-10 h-10 animate-bounce" />
            <span className="text-xs font-bold font-mono mt-1">+10s</span>
          </div>
        )}
        {doubleTapFeedback === 'backward' && (
          <div className="absolute left-16 z-30 flex flex-col items-center justify-center p-4 rounded-full bg-black/70 text-amber-400 animate-in zoom-in-75 fade-in">
            <RotateCcw className="w-10 h-10 animate-spin" />
            <span className="text-xs font-bold font-mono mt-1">-10s</span>
          </div>
        )}

        {/* 1. Native <video id="mainVideo"> vs YouTube Player */}
        {isYouTube ? (
          <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-black">
            {/* Full 100% width/height with no scale so whiteboard edges are never cropped */}
            <div className="w-full h-full flex items-center justify-center [&_iframe]:w-full [&_iframe]:h-full [&_iframe]:border-0">
              <div id={ytContainerId.current} className="w-full h-full" />
            </div>

            {/* Transparent click layer over the iframe preventing direct clicks or right click */}
            <div
              onClick={handleSurfaceTap}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 z-20 cursor-pointer"
              title="Tap to play or pause • Double-tap left/right to seek"
            />
          </div>
        ) : (
          /* Unified Native HTML5 <video id="mainVideo"> player for Google Drive, Supabase & direct files with seamless /preview fallback */
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {!isDriveFallbackMode && (
              <video
                id="mainVideo"
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
                  if (nativeVideoRef.current) {
                    const vid = nativeVideoRef.current;
                    if (pendingResumeTimeRef.current > 0) {
                      try {
                        vid.currentTime = pendingResumeTimeRef.current;
                      } catch {}
                      pendingResumeTimeRef.current = 0;
                    }
                    if (vid.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
                      setDuration(vid.duration);
                    }
                    if (vid.videoWidth && vid.videoHeight) {
                      setAspectRatio(`${vid.videoWidth}/${vid.videoHeight}`);
                    }
                  }
                }}
                onLoadedData={() => {
                  const vid = nativeVideoRef.current;
                  if (vid?.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
                    setDuration(vid.duration);
                  }
                }}
                onCanPlay={() => {
                  const vid = nativeVideoRef.current;
                  if (vid?.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
                    setDuration(vid.duration);
                  }
                }}
                onDurationChange={() => {
                  const vid = nativeVideoRef.current;
                  if (vid?.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
                    setDuration(vid.duration);
                  }
                }}
                onPlay={() => {
                  pauseOtherVideoElements(nativeVideoRef.current);
                  setIsPlaying(true);
                  setIsPausedOverlay(false);
                  setIsEnded(false);
                }}
                onPause={() => {
                  setIsPlaying(false);
                  clearMediaSession();
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  setIsEnded(true);
                  setIsPausedOverlay(true);
                  clearMediaSession();
                }}
                onEmptied={() => {
                  setIsPlaying(false);
                  clearMediaSession();
                }}
                onTimeUpdate={() => {
                  if (nativeVideoRef.current) {
                    lastTimeRef.current = nativeVideoRef.current.currentTime;
                    setCurrentTime(nativeVideoRef.current.currentTime);
                    const dur = nativeVideoRef.current.duration;
                    if (dur && !isNaN(dur) && isFinite(dur)) {
                      setDuration(dur);
                    }
                  }
                }}
                onError={() => {
                  if (isDriveVideo && driveStreamStage === 0) {
                    setDriveStreamStage(1);
                  } else if (isDriveVideo && driveStreamStage === 1) {
                    setDriveStreamStage(2);
                    setIsPausedOverlay(false);
                    setIsPlaying(false);
                    clearMediaSession();
                  }
                }}
                className="w-full h-full object-contain pointer-events-none select-none"
              />
            )}

            {/* Fallback /preview iframe rendered strictly when stream fallback is triggered */}
            {isDriveFallbackMode && isDriveVideo && driveFallbacks.previewEmbedUrl && (
              <iframe
                src={stripAutoplayParam(driveFallbacks.previewEmbedUrl)}
                title={lecture?.title || 'Google Drive Video'}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
                className="w-full h-full border-0 relative z-10 block"
              />
            )}

            {/* Non-fullscreen vs Fullscreen Drive UI control shielding */}
            {isDriveFallbackMode && !isEdgeToEdgeFullscreen && (
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
            {isDriveFallbackMode && isEdgeToEdgeFullscreen && (
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

            {/* Transparent tap overlay only when native <video> is active so /preview fallback remains interactive */}
            {!isDriveFallbackMode && (
              <div
                onClick={handleSurfaceTap}
                onContextMenu={(e) => e.preventDefault()}
                className="absolute inset-0 z-20 cursor-pointer"
                title="Tap to show/hide controls • Double-tap left/right to seek"
              />
            )}
          </div>
        )}

        {/* Pause & End Custom Black Overlay (Tapping video surface toggles controls; only the Play button toggles playback) */}
        {!isDriveFallbackMode && (isPausedOverlay || isEnded) && (
          <div
            onClick={handleSurfaceTap}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute inset-0 z-25 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4 cursor-pointer animate-in fade-in"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              aria-label={isEnded ? 'Replay' : 'Play Video'}
              className="min-w-[80px] min-h-[80px] w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-amber-400 shadow-2xl hover:scale-110 transition-transform cursor-pointer"
            >
              <Play className="w-10 h-10 fill-amber-400 ml-1" />
            </button>
            {!isEdgeToEdgeFullscreen && (
              <>
                <div className="space-y-1">
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {lecture.chapter}
                  </span>
                  <h3 className="text-lg sm:text-xl font-bold text-white max-w-xl">
                    {lecture.title}
                  </h3>
                </div>
                <p className="text-xs text-amber-400/90 font-medium">
                  {isEnded ? 'Lecture finished • Press Play to replay ↻' : 'Press Play to continue ▶'}
                </p>
              </>
            )}
          </div>
        )}

        {/* Platform Logo Badge (Hidden in Fullscreen and Drive iframe mode) */}
        {!isEdgeToEdgeFullscreen && !isDriveFallbackMode && (
          <div className="absolute bottom-20 right-4 z-30 pointer-events-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 border border-amber-500/30 text-[11px] font-bold text-amber-400 shadow-xl backdrop-blur-md">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>English with Miss Asmaa</span>
          </div>
        )}

        {/* Always-visible center Play button on initial unplayed state */}
        {!isDriveFallbackMode && !isPlaying && !isPausedOverlay && !isEnded && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
              resetControlsTimer();
            }}
            aria-label="Play Video"
            className="absolute z-25 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500/95 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Play className="w-8 h-8 fill-slate-950 ml-0.5" />
          </button>
        )}

        {/* Center Touch Quick Controls - appear on touch and auto-hide cleanly after 3s */}
        {!isDriveFallbackMode && isPlaying && !isPausedOverlay && !isEnded && (
          <div
            className={`absolute inset-0 z-25 pointer-events-none flex items-center justify-center gap-6 sm:gap-10 transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepSeek(-10);
                resetControlsTimer();
              }}
              className={`min-w-[48px] min-h-[48px] px-3 rounded-full bg-black/65 hover:bg-black/85 text-amber-400 border border-white/15 backdrop-blur-md flex items-center justify-center gap-1 text-xs font-mono font-bold shadow-xl transition-transform active:scale-90 ${
                showControls ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              title="Rewind 10 seconds"
            >
              <RotateCcw className="w-4 h-4" />
              <span>-10</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
                resetControlsTimer();
              }}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-500/95 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-2xl transition-transform active:scale-90 ${
                showControls ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-7 h-7 fill-slate-950" /> : <Play className="w-7 h-7 fill-slate-950 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepSeek(10);
                resetControlsTimer();
              }}
              className={`min-w-[48px] min-h-[48px] px-3 rounded-full bg-black/65 hover:bg-black/85 text-amber-400 border border-white/15 backdrop-blur-md flex items-center justify-center gap-1 text-xs font-mono font-bold shadow-xl transition-transform active:scale-90 ${
                showControls ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              title="Forward 10 seconds"
            >
              <span>+10</span>
              <FastForward className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Custom Bottom Overlay Controls (Translucent gradient, auto-hides after 3s) */}
        {!isDriveFallbackMode && (
          <div
            className={`absolute inset-x-0 bottom-0 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 via-black/55 to-transparent transition-opacity duration-300 z-30 ${
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              resetControlsTimer();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              resetControlsTimer();
            }}
          >
            {/* Strict LTR Seek Bar */}
            <div className="mb-1.5">
              <VideoSeekBar
                currentTime={currentTime}
                duration={duration}
                onSeek={seekToTime}
                onInteract={resetControlsTimer}
              />
            </div>

            {/* Controls Bottom Row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Play, Step Seek, Volume */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold transition-transform active:scale-90 shadow-md cursor-pointer"
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleStepSeek(-10)}
                  className="min-w-[44px] min-h-[44px] px-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-white/15 text-xs font-bold font-mono transition-transform active:scale-90 cursor-pointer"
                  title="Rewind 10 seconds (-10s)"
                >
                  -10s
                </button>

                <button
                  type="button"
                  onClick={() => handleStepSeek(10)}
                  className="min-w-[44px] min-h-[44px] px-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-white/15 text-xs font-bold font-mono transition-transform active:scale-90 cursor-pointer"
                  title="Forward 10 seconds (+10s)"
                >
                  +10s
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/15 text-slate-200 hover:text-white flex items-center justify-center cursor-pointer"
                    title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <input
                    type="range"
                    dir="ltr"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-12 sm:w-16 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    title="Volume"
                  />
                </div>
              </div>

              {/* Right side in LTR: Mark Completed (only outside fullscreen), Quality, Speed 1x, Fullscreen */}
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold">
                {!isEdgeToEdgeFullscreen && (
                  <button
                    type="button"
                    onClick={() => {
                      onMarkCompleted(lecture.id);
                      setCompletedToast(
                        isCompleted
                          ? 'Lecture status updated successfully!'
                          : 'Lecture marked as completed and your progress has been updated! 🏆'
                      );
                      setTimeout(() => setCompletedToast(null), 3500);
                    }}
                    className={`min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">{isCompleted ? 'Completed ✓' : 'Mark Completed'}</span>
                  </button>
                )}
              {/* Quality Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    resetControlsTimer();
                    setShowQualityMenu(!showQualityMenu);
                    setShowSpeedMenu(false);
                  }}
                  className="min-h-[44px] px-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-blue-400 border border-white/15 text-[11px] cursor-pointer"
                >
                  {selectedQuality}
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-12 right-0 bg-slate-900 border border-slate-700 rounded-xl py-1 shadow-2xl z-40 text-xs w-36">
                    {['1080p (Full HD)', '720p (HD)', '480p (Data Saver)', 'Auto'].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setSelectedQuality(q);
                          setShowQualityMenu(false);
                        }}
                        className={`w-full min-h-[38px] text-left px-3 py-1.5 hover:bg-slate-800 flex items-center justify-between ${
                          selectedQuality === q ? 'text-blue-400 font-bold' : 'text-slate-300'
                        }`}
                      >
                        <span>{q}</span>
                        {selectedQuality === q && <Check className="w-3 h-3 text-blue-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Playback Speed 1x */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    resetControlsTimer();
                    setShowSpeedMenu(!showSpeedMenu);
                    setShowQualityMenu(false);
                  }}
                  className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-white/15 font-mono text-xs font-bold cursor-pointer"
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
                        className={`w-full min-h-[38px] text-left px-3 py-1.5 hover:bg-slate-800 ${
                          playbackSpeed === s ? 'text-amber-400 font-bold' : 'text-slate-300'
                        }`}
                      >
                        {s}x {s === 1 && '(Normal)'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
                title={isAnyFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              >
                {isAnyFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Completed Toast Banner */}
        {completedToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold shadow-2xl animate-in fade-in flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-white" />
            <span>{completedToast}</span>
          </div>
        )}
      </div>

      {/* Mobile Portrait Below-Video Info & Theater Actions (Hidden in Landscape / Fullscreen) */}
      {isMobilePortrait && (
        <div className="flex-1 w-full bg-[#0B1120] p-4 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-blue-400">{lecture.chapter}</span>
            <h4 className="text-base font-extrabold text-white leading-snug">{lecture.title}</h4>
            {lecture.description && (
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{lecture.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2"
            >
              <Maximize className="w-4 h-4 text-amber-400" />
              <span>Fullscreen</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onMarkCompleted(lecture.id);
                setCompletedToast(
                  isCompleted
                    ? 'Lecture status updated successfully!'
                    : 'Lecture marked as completed and your progress has been updated! 🏆'
                );
                setTimeout(() => setCompletedToast(null), 3500);
              }}
              className={`min-h-[46px] px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 ${
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
    </div>
  );
};
