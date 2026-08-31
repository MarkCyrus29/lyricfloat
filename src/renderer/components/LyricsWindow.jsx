import React, { useRef, useEffect, useState, useMemo } from "react";
import { useApp } from "../context/AppContext.jsx";
import { TriangleAlert, HeartCrack, Search } from "lucide-react";

const FONT_SIZES = {
  small: { active: "text-base", inactive: "text-sm" },
  medium: { active: "text-lg", inactive: "text-base" },
  large: { active: "text-2xl", inactive: "text-lg" },
  "extra-large": { active: "text-3xl", inactive: "text-xl" },
};

export default function LyricsWindow() {
  const { song, playbackRef, lyrics, lyricsLoading, settings, updateSetting } =
    useApp();
  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [bgColor, setBgColor] = useState(
    settings.bgColor || "rgba(18,18,18,0.92)",
  );
  const [localOpacity, setLocalOpacity] = useState(settings.opacity ?? 0.92);
  const isTransparent = bgColor === 'transparent';

  const bgMode = settings.bgMode || 'album';

  const useDarkText = !isTransparent && bgMode === 'album' && song?.textColor === 'black';
  const tColors = useDarkText
    ? { base: 'text-black', hover: 'hover:text-black', o70: 'text-black/70', o60: 'text-black/60', o50: 'text-black/50', o40: 'text-black/40', o30: 'text-black/30' }
    : { base: 'text-white', hover: 'hover:text-white', o70: 'text-white/70', o60: 'text-white/60', o50: 'text-white/50', o40: 'text-white/40', o30: 'text-white/30' };


  const computedBg = useMemo(() => {
    if (isTransparent) return "transparent";
    if (bgMode === 'album' && song?.albumColor) {
      return song.albumColor.replace('rgb', 'rgba').replace(')', `, ${localOpacity})`);
    }
    if (bgColor.startsWith('rgba')) {
      return bgColor.replace(/[\d.]+\)$/, `${localOpacity})`);
    }
    return bgColor;
  }, [isTransparent, bgMode, song?.albumColor, localOpacity, bgColor]);

  // Listen for cursor enter/leave via IPC from main process cursor tracking
  useEffect(() => {
    const unsubEnter = window.electronAPI?.onMouseEnter(() =>
      setHovering(true),
    );
    const unsubLeave = window.electronAPI?.onMouseLeave(() =>
      setHovering(false),
    );
    return () => {
      unsubEnter?.();
      unsubLeave?.();
    };
  }, []);

  // Sync bgColor from settings
  useEffect(() => {
    if (settings.bgColor) setBgColor(settings.bgColor);
  }, [settings.bgColor]);

  useEffect(() => {
    if (settings.opacity !== undefined) setLocalOpacity(settings.opacity);
  }, [settings.opacity]);

  const [activeLine, setActiveLine] = useState(-1);

  // Sync activeLine via requestAnimationFrame for high performance
  useEffect(() => {
    if (!lyrics?.lines?.length || !lyrics.synced) {
      setActiveLine(-1);
      return;
    }

    let rafId;
    const checkLine = () => {
      if (!playbackRef?.current) return;

      const { positionMs, isPlaying, lastUpdateTime } = playbackRef.current;

      // Interpolate current position based on the last IPC update
      let currentPosMs = positionMs;
      if (isPlaying) {
        currentPosMs += (performance.now() - lastUpdateTime);
      }

      const posSeconds = currentPosMs / 1000;
      let active = -1;
      
      for (let i = 0; i < lyrics.lines.length; i++) {
        if (lyrics.lines[i].time <= posSeconds) {
          active = i;
        } else {
          break;
        }
      }

      setActiveLine((prev) => (prev !== active ? active : prev));
      rafId = requestAnimationFrame(checkLine);
    };

    rafId = requestAnimationFrame(checkLine);
    return () => cancelAnimationFrame(rafId);
  }, [lyrics, playbackRef]);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeLine]);

  const fontSize = FONT_SIZES[settings.fontSize] || FONT_SIZES.medium;

  const toggleTransparent = () => {
    const newVal = isTransparent ? "rgba(18,18,18,0.92)" : "transparent";
    updateSetting("bgColor", newVal);
    window.electronAPI?.previewSetting('bgColor', newVal);
    window.electronAPI?.saveSetting({ bgColor: newVal });
  };

  /* ---- RENDER ---- */

  // Empty state: no song
  if (!song) {
    return (
      <div
        className="drag w-full h-full flex items-center justify-center rounded-2xl relative"
        style={{ background: computedBg }}
      >
        <button onClick={() => window.electronAPI?.closeApp()} className={`no-drag absolute top-4 right-4 ${tColors.o50} ${tColors.hover} z-50 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors`} title="Close App">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div
          className="text-center px-6 py-8 rounded-2xl"
          style={
            isTransparent
              ? {
                  backgroundColor: "rgba(0,0,0,0.35)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }
              : {}
          }
        >
          <div className="text-4xl mb-4">🎵</div>
          <p className={`${tColors.o70} text-lg font-medium`}>
            Play a song to see lyrics
          </p>
          <p className={`${tColors.o40} text-sm mt-2`}>
            LyricFloat will auto-detect your music
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (lyricsLoading) {
    return (
      <div
        className="drag w-full h-full flex items-center justify-center rounded-2xl relative"
        style={{ background: computedBg }}
      >
        <button onClick={() => window.electronAPI?.closeApp()} className={`no-drag absolute top-4 right-4 ${tColors.o50} ${tColors.hover} z-50 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors`} title="Close App">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div
          className="text-center flex flex-col items-center px-6 py-8 rounded-2xl"
          style={
            isTransparent
              ? {
                  backgroundColor: "rgba(0,0,0,0.35)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }
              : {}
          }
        >
          <Search className={`animate-pulse text-4xl mb-4 ${tColors.base}`} />
          <p className={`${tColors.o70} text-lg font-medium`}>
            Looking up lyrics for
          </p>
          <p className={`${tColors.base} text-xl font-semibold mt-1`}>{song.title}</p>
          <p className={`${tColors.o50} text-sm mt-1`}>{song.artist}</p>
        </div>
      </div>
    );
  }

  // No lyrics found
  if (!lyrics?.lines?.length) {
    return (
      <div
        className="drag w-full h-full flex items-center justify-center rounded-2xl relative"
        style={{ background: computedBg }}
      >
        <button onClick={() => window.electronAPI?.closeApp()} className={`no-drag absolute top-4 right-4 ${tColors.o50} ${tColors.hover} z-50 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors`} title="Close App">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div
          className="text-center flex flex-col items-center px-6 py-8 rounded-2xl"
          style={
            isTransparent
              ? {
                  backgroundColor: "rgba(0,0,0,0.35)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }
              : {}
          }
        >
          <HeartCrack className={`animate-bounce text-4xl mb-4 ${tColors.base}`} />
          <p className={`${tColors.o70} text-lg font-medium`}>No lyrics found</p>
          <p className={`${tColors.base} text-base mt-1`}>
            {song.title} — {song.artist}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="drag w-full h-full flex flex-col rounded-2xl relative overflow-hidden transition-colors duration-1000"
      style={{ background: computedBg }}
    >
      {/* ---- Drag handle for unsynced (scroll area is no-drag) ---- */}
      {!lyrics.synced && <div className="drag h-12 flex-shrink-0" />}

      {/* ---- Lyrics scroll area ---- */}
      <div ref={scrollRef} className={`${lyrics.synced ? 'drag' : 'no-drag'} lyrics-scroll flex-1 px-6 ${lyrics.synced ? 'py-16' : 'pb-16'}`}>
        {lyrics.lines.map((line, i) => {
          const isActive = i === activeLine;
          const isPast = i < activeLine;
          const isUpcoming = i > activeLine;

          let colorClass = tColors.o50;
          if (isActive) colorClass = tColors.base;
          if (isPast) colorClass = tColors.o30;

          let sizeClass = fontSize.inactive;
          if (isActive) sizeClass = fontSize.active;

          return (
            <p
              key={i}
              ref={isActive ? activeRef : null}
              className={`lyric-line py-2 cursor-default select-none
    ${colorClass} ${sizeClass}
    ${isActive ? "font-semibold" : "font-normal"}
    ${
      isTransparent
        ? `${isActive ? "px-4" : "px-2"} ${i === 0 ? "rounded-t-lg" : ""} ${i === lyrics.length - 1 ? "rounded-b-lg" : ""}`
        : ""
    }`}
              style={
                isTransparent
                  ? {
                      backgroundColor: isActive
                        ? "rgba(0,0,0,0.45)"
                        : "rgba(0,0,0,0.2)",
                      backdropFilter: "blur(6px)",
                      WebkitBackdropFilter: "blur(6px)",
                      display: "block",
                      width: "100%",
                      paddingTop: isActive ? "10px" : undefined,
                      paddingBottom: isActive ? "10px" : undefined,
                    }
                  : {}
              }
            >
              {line.text?.replace(/\[\d+:\d+\.\d+\]/g, "").trim() || "♪"}
            </p>
          );
        })}
        {/* Bottom padding so last line can center */}
        <div className="h-[50vh]" />
      </div>

      {/* ---- Hover control bar (AFTER drag area in DOM so no-drag wins in hit-test) ---- */}
      <div
        className={`drag absolute top-0 left-0 right-0 z-50 px-4 py-3 flex flex-nowrap items-center gap-2
          bg-black/60 backdrop-blur-md transition-all duration-300
          ${hovering ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"}`}
      >
        {/* Song info */}
        <div className="flex-1 min-w-[120px]">
          <p className={`${tColors.base} text-sm font-semibold truncate`}>
            {song.title}
          </p>
          <p className={`${tColors.o60} text-xs truncate`}>{song.artist}</p>
        </div>

        {/* Clear / Transparent toggle */}
        <button
          onClick={toggleTransparent}
          className={`no-drag flex-shrink-0 text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 ${tColors.base} font-medium transition-colors`}
          title="Toggle transparent background"
        >
          {isTransparent ? "FILL" : "CLEAR"}
        </button>

        {/* Settings gear */}
        <button
          onClick={() => window.electronAPI?.openSettings()}
          className={`no-drag flex-shrink-0 ${tColors.o70} ${tColors.hover} transition-colors`}
          title="Settings"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={() => window.electronAPI?.closeApp()}
          className={`no-drag flex-shrink-0 ${tColors.o70} ${tColors.hover} transition-colors`}
          title="Close App"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Synced indicator */}
      {!lyrics.synced && (
        <div className={`absolute bottom-3 right-3 ${tColors.o30} text-xs flex items-center gap-0 flex-col bg-black/10 backdrop-blur-sm p-2  rounded-lg`}>
          <TriangleAlert className="text-amber-500 opacity-80" /> 
          <p className="text-amber-500 text-xs opacity-80 mt-1" >Unsynced lyrics</p>
          <p className={`${tColors.o30} text-xs opacity-80`}>you can scroll</p>
        </div>
      )}
    </div>
  );
}
