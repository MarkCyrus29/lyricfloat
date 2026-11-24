import React, { useRef, useEffect, useState, useMemo, useCallback, memo } from "react";
import { useApp } from "../context/AppContext.jsx";
import {
  TriangleAlert,
  HeartCrack,
  Search,
  Music,
  Settings,
  LocateFixed,
  GripHorizontal,
} from "lucide-react";
import StateScreen from "./StateScreen.jsx";
import CloseButton from "./CloseButton.jsx";

const FONT_SIZES = {
  small: {
    active: "text-base",
    inactive: "text-sm",
    subActive: "text-xs",
    subInactive: "text-[11px]",
  },
  medium: {
    active: "text-lg",
    inactive: "text-base",
    subActive: "text-xs",
    subInactive: "text-xs",
  },
  large: {
    active: "text-2xl",
    inactive: "text-lg",
    subActive: "text-sm",
    subInactive: "text-xs",
  },
  "extra-large": {
    active: "text-3xl",
    inactive: "text-xl",
    subActive: "text-base",
    subInactive: "text-sm",
  },
};

const DARK_TEXT_COLORS = {
  base: "text-black",
  hover: "hover:text-black",
  o70: "text-black/70",
  o60: "text-black/60",
  o50: "text-black/50",
  o40: "text-black/40",
  o30: "text-black/30",
};

const LIGHT_TEXT_COLORS = {
  base: "text-white",
  hover: "hover:text-white",
  o70: "text-white/70",
  o60: "text-white/60",
  o50: "text-white/50",
  o40: "text-white/40",
  o30: "text-white/30",
};

const ACTIVE_TRANSPARENT_STYLE = {
  backgroundColor: "rgba(0,0,0,0.31)",
  display: "block",
  width: "100%",
};

const INACTIVE_TRANSPARENT_STYLE = {
  display: "block",
  width: "100%",
};

const TRANSPARENT_CONTAINER_STYLE = {
  backgroundColor: "rgba(0,0,0,0.2)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

function findActiveLineIndex(lines, posSeconds) {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= posSeconds) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

const LyricLine = memo(function LyricLine({
  text,
  translation,
  showTranslation,
  isActive,
  isPast,
  isTransparent,
  bouncy,
  colorClass,
  sizeClass,
  subColorClass,
  subSizeClass,
  activeRef,
}) {
  const trimmed = text?.trim();
  let stateMotionClass = "";
  if (bouncy) {
    if (isActive) {
      stateMotionClass = "lyric-line-bouncy-active";
    } else if (isPast) {
      stateMotionClass = "lyric-line-bouncy-past";
    } else {
      stateMotionClass = "lyric-line-bouncy-upcoming";
    }
  }

  return (
    <p
      ref={isActive ? activeRef : null}
      className={`lyric-line ${bouncy ? "lyric-line-bouncy" : ""} ${stateMotionClass} ${
        isActive ? "py-3.5 font-semibold" : "py-2 font-normal"
      } cursor-grab active:cursor-grabbing select-none ${colorClass} ${sizeClass} ${
        isTransparent ? (isActive ? "px-5" : "px-2.5") : ""
      }`}
      style={
        isTransparent
          ? isActive
            ? ACTIVE_TRANSPARENT_STYLE
            : INACTIVE_TRANSPARENT_STYLE
          : undefined
      }
    >
      {trimmed ? (
        <>
          <span className="block">{trimmed}</span>
          {showTranslation && translation && (
            <span
              className={`block font-normal mt-0.5 leading-snug ${subColorClass} ${subSizeClass}`}
            >
              {translation}
            </span>
          )}
        </>
      ) : (
        <Music className="inline-block w-4 h-4 opacity-75 align-middle" />
      )}
    </p>
  );
});

export default function LyricsWindow() {
  const {
    song,
    playback,
    playbackRef,
    subscribePlayback,
    lyrics,
    lyricsLoading,
    settings,
    updateSetting,
  } = useApp();
  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  const springRafRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const hasLeftSyncZoneRef = useRef(false);
  const snapSettleTimerRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const isTransparent = settings.bgColor === "transparent";
  const bouncy = settings.bouncyLyrics !== false;
  const showTranslation = settings.showTranslation !== false;
  const hasTranslation = Boolean(lyrics?.needsTranslation);

  const bgMode = settings.bgMode || "album";

  const useDarkText =
    !isTransparent && bgMode === "album" && song?.textColor === "black";
  const tColors = useDarkText ? DARK_TEXT_COLORS : LIGHT_TEXT_COLORS;

  const computedBg = useMemo(() => {
    if (isTransparent) return "transparent";
    if (bgMode === "album" && song?.albumColor) {
      return song.albumColor
        .replace("rgb", "rgba")
        .replace(")", `, ${settings.opacity})`);
    }
    if (settings.bgColor.startsWith("rgba")) {
      return settings.bgColor.replace(/[\d.]+\)$/, `${settings.opacity})`);
    }
    return settings.bgColor;
  }, [isTransparent, bgMode, song?.albumColor, settings.opacity, settings.bgColor]);

  // Reset manual scroll override whenever song or lyrics change
  useEffect(() => {
    hasLeftSyncZoneRef.current = false;
    if (snapSettleTimerRef.current) {
      clearTimeout(snapSettleTimerRef.current);
      snapSettleTimerRef.current = null;
    }
    setUserScrolled(false);
  }, [song?.title, song?.artist, lyrics]);

  // Listen for cursor enter/leave via IPC from main process cursor tracking
  useEffect(() => {
    const unsubEnter = window.electronAPI?.onMouseEnter(() =>
      setHovering(true)
    );
    const unsubLeave = window.electronAPI?.onMouseLeave(() =>
      setHovering(false)
    );
    return () => {
      unsubEnter?.();
      unsubLeave?.();
    };
  }, []);

  const [activeLine, setActiveLine] = useState(-1);

  // Deadline-based timer: wakes up only when the next lyric line arrives (or on seek/visibility change)
  useEffect(() => {
    if (!lyrics?.lines?.length || !lyrics.synced) {
      setActiveLine(-1);
      return;
    }

    let timerId = null;

    const syncAndSchedule = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!playbackRef?.current) return;

      const { positionMs, isPlaying, lastUpdateTime } = playbackRef.current;
      const currentPosMs = isPlaying
        ? positionMs + (performance.now() - lastUpdateTime)
        : positionMs;
      const active = findActiveLineIndex(lyrics.lines, currentPosMs / 1000);
      setActiveLine((prev) => (prev !== active ? active : prev));

      if (!isPlaying || document.hidden) return;

      const nextIndex = active + 1;
      if (nextIndex < lyrics.lines.length) {
        const nextTimeMs = lyrics.lines[nextIndex].time * 1000;
        const delayMs = Math.min(
          30000,
          Math.max(16, Math.ceil(nextTimeMs - currentPosMs))
        );
        timerId = setTimeout(syncAndSchedule, delayMs);
      }
    };

    syncAndSchedule();

    const unsubPlayback = subscribePlayback(syncAndSchedule);

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
      } else {
        syncAndSchedule();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timerId !== null) clearTimeout(timerId);
      unsubPlayback?.();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [lyrics, playback?.isPlaying, playbackRef, subscribePlayback]);

  // Smoothly glide the scroll container so the active lyric line is centered
  const scrollToActiveLine = useCallback(() => {
    if (springRafRef.current) {
      cancelAnimationFrame(springRafRef.current);
      springRafRef.current = null;
    }

    const container = scrollRef.current;
    const activeEl = activeRef.current;
    if (!container || !activeEl) return;

    const startScroll = container.scrollTop;
    const startTime = performance.now();
    const duration = bouncy ? 560 : 420; // ms

    // Smooth ease-out with a gentle, non-jarring cushion when bouncy is enabled
    const easeScroll = (t) => {
      if (t >= 1) return 1;
      if (!bouncy) {
        // Standard smooth cubic ease-out
        return 1 - Math.pow(1 - t, 3);
      }
      // Silky damped spring ease-out (single smooth overshoot of ~2.5% without backward oscillation jitter)
      const c1 = 0.9;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };

    isProgrammaticScrollRef.current = true;
    // Temporarily disable CSS scroll-behavior: smooth during rAF interpolation so frames don't double-ease
    container.style.scrollBehavior = "auto";

    const step = (now) => {
      if (!scrollRef.current || !activeRef.current) {
        isProgrammaticScrollRef.current = false;
        return;
      }
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);

      // Re-query live target center so expanding padding/height is tracked seamlessly
      const cRect = container.getBoundingClientRect();
      const aRect = activeEl.getBoundingClientRect();
      const currentTarget = Math.max(
        0,
        container.scrollTop + (aRect.top - cRect.top) - container.clientHeight / 2 + aRect.height / 2
      );
      const totalDelta = currentTarget - startScroll;

      if (Math.abs(totalDelta) >= 0.5) {
        container.scrollTop = startScroll + totalDelta * easeScroll(t);
      }

      if (t < 1) {
        springRafRef.current = requestAnimationFrame(step);
      } else {
        springRafRef.current = null;
        isProgrammaticScrollRef.current = false;
        container.style.scrollBehavior = "smooth";
      }
    };

    springRafRef.current = requestAnimationFrame(step);
  }, [bouncy]);

  // Auto-scroll to active line unless the user manually scrolled away
  useEffect(() => {
    if (userScrolled) return;
    scrollToActiveLine();

    return () => {
      if (springRafRef.current) {
        cancelAnimationFrame(springRafRef.current);
        springRafRef.current = null;
        isProgrammaticScrollRef.current = false;
      }
    };
  }, [activeLine, userScrolled, scrollToActiveLine, showTranslation, hasTranslation]);

  // Helper to measure pixel distance between the active line's center and the scroll container's center
  const getActiveLineCenterDistance = useCallback(() => {
    const container = scrollRef.current;
    const activeEl = activeRef.current;
    if (!container || !activeEl) return Infinity;
    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;
    const activeCenter = activeRect.top + activeRect.height / 2;
    return Math.abs(activeCenter - containerCenter);
  }, []);

  // Snap back to the active synced line and resume auto-scrolling
  const handleResync = useCallback(() => {
    hasLeftSyncZoneRef.current = false;
    if (snapSettleTimerRef.current) {
      clearTimeout(snapSettleTimerRef.current);
      snapSettleTimerRef.current = null;
    }
    setUserScrolled(false);
    scrollToActiveLine();
  }, [scrollToActiveLine]);

  // When user scrolls with mouse wheel or trackpad, pause auto-scroll and reveal the Sync button
  const handleUserScrollInteraction = useCallback(() => {
    if (!lyrics?.synced) return;
    if (springRafRef.current) {
      cancelAnimationFrame(springRafRef.current);
      springRafRef.current = null;
    }
    isProgrammaticScrollRef.current = false;
    if (scrollRef.current) {
      scrollRef.current.style.scrollBehavior = "smooth";
    }
    if (!userScrolled) {
      setUserScrolled(true);
    }
  }, [lyrics?.synced, userScrolled]);

  // Magnetic snap-to-sync when the user scrolls back into the active synced lyric and settles
  const handleScroll = useCallback(() => {
    if (!lyrics?.synced || !userScrolled || isProgrammaticScrollRef.current) return;

    const dist = getActiveLineCenterDistance();

    // Mark that the user has scrolled meaningfully away from the active lyric line
    if (dist > 95) {
      hasLeftSyncZoneRef.current = true;
    }

    if (snapSettleTimerRef.current) {
      clearTimeout(snapSettleTimerRef.current);
      snapSettleTimerRef.current = null;
    }

    // Wait briefly for the user's wheel/trackpad momentum to settle near the active line, then smoothly glide into center
    if (hasLeftSyncZoneRef.current && dist <= 75) {
      snapSettleTimerRef.current = setTimeout(() => {
        snapSettleTimerRef.current = null;
        if (getActiveLineCenterDistance() <= 75) {
          handleResync();
        }
      }, 160);
    }
  }, [lyrics?.synced, userScrolled, getActiveLineCenterDistance, handleResync]);

  // Full-window drag via pointer capture + main-process bounds tracking (preserves mouse-wheel scrolling everywhere)
  const handleWindowPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.closest("button, a, input, select, textarea, [data-no-drag]")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    window.electronAPI?.startWindowDrag();
  }, []);

  const handleWindowPointerUp = useCallback((e) => {
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    window.electronAPI?.stopWindowDrag();
  }, []);

  useEffect(() => {
    const stopOnBlur = () => window.electronAPI?.stopWindowDrag();
    window.addEventListener("blur", stopOnBlur);
    window.addEventListener("mouseup", stopOnBlur);
    return () => {
      window.removeEventListener("blur", stopOnBlur);
      window.removeEventListener("mouseup", stopOnBlur);
      window.electronAPI?.stopWindowDrag();
    };
  }, []);

  const fontSize = FONT_SIZES[settings.fontSize] || FONT_SIZES.medium;

  const toggleTransparent = () => {
    const newVal = isTransparent ? "rgba(18,18,18,0.92)" : "transparent";
    updateSetting("bgColor", newVal);
    window.electronAPI?.previewSetting("bgColor", newVal);
    window.electronAPI?.saveSetting({ bgColor: newVal });
  };

  const toggleTranslation = () => {
    const next = !showTranslation;
    updateSetting("showTranslation", next);
    window.electronAPI?.previewSetting("showTranslation", next);
  };

  /* ---- RENDER ---- */

  // Empty state: no song
  if (!song) {
    return (
      <StateScreen
        background={computedBg}
        isTransparent={isTransparent}
        tColors={tColors}
      >
        <Music className={`w-10 h-10 mb-4 ${tColors.base}`} />
        <p className={`${tColors.o70} text-lg font-medium`}>
          Play a song to see lyrics
        </p>
        <p className={`${tColors.o40} text-sm mt-2`}>
          LyricFloat will auto-detect your music
        </p>
      </StateScreen>
    );
  }

  // Loading state
  if (lyricsLoading) {
    return (
      <StateScreen
        background={computedBg}
        isTransparent={isTransparent}
        tColors={tColors}
      >
        <Search className={`animate-pulse w-10 h-10 mb-4 ${tColors.base}`} />
        <p className={`${tColors.o70} text-lg font-medium`}>
          Looking up lyrics for
        </p>
        <p className={`${tColors.base} text-xl font-semibold mt-1`}>
          {song.title}
        </p>
        <p className={`${tColors.o50} text-sm mt-1`}>{song.artist}</p>
      </StateScreen>
    );
  }

  // Instrumental state
  if (lyrics?.instrumental) {
    return (
      <StateScreen
        background={computedBg}
        isTransparent={isTransparent}
        tColors={tColors}
      >
        <Music className={`w-10 h-10 mb-4 ${tColors.base}`} />
        <p className={`${tColors.o70} text-lg font-medium`}>Instrumental</p>
        <p className={`${tColors.base} text-base mt-1`}>
          {song.title} — {song.artist}
        </p>
      </StateScreen>
    );
  }

  // No lyrics found
  if (!lyrics?.lines?.length) {
    return (
      <StateScreen
        background={computedBg}
        isTransparent={isTransparent}
        tColors={tColors}
      >
        <HeartCrack className={`animate-bounce w-10 h-10 mb-4 ${tColors.base}`} />
        <p className={`${tColors.o70} text-lg font-medium`}>No lyrics found</p>
        <p className={`${tColors.base} text-base mt-1`}>
          {song.title} — {song.artist}
        </p>
      </StateScreen>
    );
  }

  return (
    <div
      onPointerDown={handleWindowPointerDown}
      onPointerUp={handleWindowPointerUp}
      onPointerCancel={handleWindowPointerUp}
      onLostPointerCapture={() => window.electronAPI?.stopWindowDrag()}
      onMouseEnter={() => setHovering(true)}
      onMouseMove={() => !hovering && setHovering(true)}
      className="no-drag cursor-grab active:cursor-grabbing w-full h-full flex flex-col rounded-2xl relative overflow-hidden transition-colors duration-1000 select-none"
      style={{ background: computedBg }}
    >
      {/* ---- Subtle top-center drag handle icon ---- */}
      <div
        className={`h-8 flex-shrink-0 flex items-center justify-center pointer-events-none transition-opacity duration-200 ${
          hovering ? "opacity-0" : "opacity-60"
        } ${tColors.o40}`}
      >
        <GripHorizontal size={18} />
      </div>

      {/* ---- Lyrics scroll area (always scrollable AND draggable anywhere) ---- */}
      <div
        ref={scrollRef}
        onWheel={handleUserScrollInteraction}
        onTouchMove={handleUserScrollInteraction}
        onScroll={handleScroll}
        className="no-drag cursor-grab active:cursor-grabbing lyrics-scroll flex-1 px-6 pb-16"
      >
        {/* Single backdrop-filter layer in transparent mode instead of N per-line blur layers */}
        <div
          className={isTransparent ? "rounded-lg overflow-hidden" : undefined}
          style={isTransparent ? TRANSPARENT_CONTAINER_STYLE : undefined}
        >
          {lyrics.lines.map((line, i) => {
            const isActive = i === activeLine;
            const isPast = i < activeLine;

            let colorClass = tColors.o50;
            let subColorClass = tColors.o40;
            if (isActive) {
              colorClass = tColors.base;
              subColorClass = tColors.o70;
            } else if (isPast) {
              colorClass = tColors.o30;
              subColorClass = tColors.o30;
            }

            return (
              <LyricLine
                key={i}
                text={line.text}
                translation={line.translation}
                showTranslation={hasTranslation && showTranslation}
                isActive={isActive}
                isPast={isPast}
                isTransparent={isTransparent}
                bouncy={bouncy}
                colorClass={colorClass}
                sizeClass={isActive ? fontSize.active : fontSize.inactive}
                subColorClass={subColorClass}
                subSizeClass={isActive ? fontSize.subActive : fontSize.subInactive}
                activeRef={activeRef}
              />
            );
          })}
        </div>
        {/* Bottom padding so last line can center */}
        <div className="h-[50vh]" />
      </div>

      {/* ---- Hover control bar ---- */}
      <div
        onMouseEnter={() => setHovering(true)}
        className={`no-drag cursor-grab active:cursor-grabbing absolute top-0 left-0 right-0 z-50 px-4 py-3 flex flex-nowrap items-center gap-2
          bg-black/60 transition-opacity duration-200
          ${
            hovering
              ? "backdrop-blur-md opacity-100"
              : "opacity-0 pointer-events-none"
          }`}
      >
        {/* Song info */}
        <div className="flex-1 min-w-[100px]">
          <p className={`${tColors.base} text-sm font-semibold truncate`}>
            {song.title}
          </p>
          <p className={`${tColors.o60} text-xs truncate`}>{song.artist}</p>
        </div>

        {/* Translate toggle (ONLY shown when song language differs from user's preferredLanguage) */}
        {hasTranslation && (
          <button
            onClick={toggleTranslation}
            className={`no-drag cursor-pointer flex-shrink-0 text-xs px-2 py-1 rounded font-medium transition-colors ${
              showTranslation
                ? "bg-green-500 text-black hover:bg-green-400"
                : `bg-white/10 hover:bg-white/20 ${tColors.base}`
            }`}
            title="Toggle lyrics translation"
          >
            TRANSLATE
          </button>
        )}

        {/* Clear / Transparent toggle */}
        <button
          onClick={toggleTransparent}
          className={`no-drag cursor-pointer flex-shrink-0 text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 ${tColors.base} font-medium transition-colors`}
          title="Toggle transparent background"
        >
          {isTransparent ? "FILL" : "CLEAR"}
        </button>

        {/* Settings gear */}
        <button
          onClick={() => window.electronAPI?.openSettings()}
          className={`no-drag cursor-pointer flex-shrink-0 ${tColors.o70} ${tColors.hover} transition-colors`}
          title="Settings"
        >
          <Settings size={18} />
        </button>

        {/* Close */}
        <CloseButton
          className={`no-drag cursor-pointer flex-shrink-0 ${tColors.o70} ${tColors.hover} transition-colors`}
          size={18}
        />
      </div>

      {/* ---- Floating "Sync" button on bottom-right when user manually scrolled on synced lyrics ---- */}
      {lyrics.synced && userScrolled && (
        <button
          onClick={handleResync}
          className="no-drag absolute bottom-4 right-4 z-50 flex items-center gap-1.5 px-3.5 py-2 rounded-full
            bg-green-500 hover:bg-green-400 active:scale-95 text-black text-xs font-semibold
            shadow-lg shadow-black/40 transition-all duration-200 cursor-pointer"
          title="Return to current synced lyric"
        >
          <LocateFixed size={14} />
          <span>Sync</span>
        </button>
      )}

      {/* Unsynced indicator */}
      {!lyrics.synced && (
        <div
          className={`absolute bottom-3 right-3 ${tColors.o30} text-xs flex items-center gap-0 flex-col bg-black/10 backdrop-blur-sm p-2 rounded-lg`}
        >
          <TriangleAlert className="text-amber-500 opacity-80" />
          <p className="text-amber-500 text-xs opacity-80 mt-1">Unsynced lyrics</p>
          <p className={`${tColors.o30} text-xs opacity-80`}>you can scroll</p>
        </div>
      )}
    </div>
  );
}
