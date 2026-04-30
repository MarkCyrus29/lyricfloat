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
  const { song, playback, lyrics, lyricsLoading, settings, updateSetting } =
    useApp();
  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [bgColor, setBgColor] = useState(
    settings.bgColor || "rgba(18,18,18,0.92)",
  );
  const [localOpacity, setLocalOpacity] = useState(settings.opacity ?? 0.92);
  const isTransparent = bgColor === 'transparent';

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

  // Determine active line index
  const activeLine = useMemo(() => {
    if (!lyrics?.lines?.length || !lyrics.synced) return -1;
    const posSeconds = (playback.positionMs || 0) / 1000;
    let active = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= posSeconds) {
        active = i;
      } else {
        break;
      }
    }
    return active;
  }, [lyrics, playback.positionMs]);

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
        style={{ background: bgColor }}
      >
        <button onClick={() => window.electronAPI?.closeApp()} className="no-drag absolute top-4 right-4 text-white/50 hover:text-white z-50 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors" title="Close App">
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
          <p className="text-white/70 text-lg font-medium">
            Play a song to see lyrics
          </p>
          <p className="text-white/40 text-sm mt-2">
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
        style={{ background: bgColor }}
      >
        <button onClick={() => window.electronAPI?.closeApp()} className="no-drag absolute top-4 right-4 text-white/50 hover:text-white z-50 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors" title="Close App">
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
          <Search className="animate-pulse text-4xl mb-4 text-white" />
          <p className="text-white/70 text-lg font-medium">
            Looking up lyrics for
          </p>
          <p className="text-white text-xl font-semibold mt-1">{song.title}</p>
          <p className="text-white/50 text-sm mt-1">{song.artist}</p>
        </div>
      </div>
    );
  }

  // No lyrics found
  if (!lyrics?.lines?.length) {
    return (
      <div
        className="drag w-full h-full flex items-center justify-center rounded-2xl relative"
        style={{ background: bgColor }}
      >
        <button onClick={() => window.electronAPI?.closeApp()} className="no-drag absolute top-4 right-4 text-white/50 hover:text-white z-50 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors" title="Close App">
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
          <HeartCrack className="animate-bounce text-4xl mb-4 text-white" />
          <p className="text-white/70 text-lg font-medium">No lyrics found</p>
          <p className="text-white text-base mt-1">
            {song.title} — {song.artist}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col rounded-2xl relative overflow-hidden"
      style={{ background: bgColor }}
    >
      {/* ---- Lyrics scroll area ---- */}
      <div ref={scrollRef} className="drag lyrics-scroll flex-1 px-6 py-16">
        {lyrics.lines.map((line, i) => {
          const isActive = i === activeLine;
          const isPast = i < activeLine;
          const isUpcoming = i > activeLine;

          let colorClass = "text-white/50";
          if (isActive) colorClass = "text-white";
          if (isPast) colorClass = "text-white/30";

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
        className={`no-drag absolute top-0 left-0 right-0 z-50 px-4 py-3 flex flex-nowrap items-center gap-2
          bg-black/60 backdrop-blur-md transition-all duration-300
          ${hovering ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"}`}
      >
        {/* Song info */}
        <div className="flex-1 min-w-[120px]">
          <p className="text-white text-sm font-semibold truncate">
            {song.title}
          </p>
          <p className="text-white/60 text-xs truncate">{song.artist}</p>
        </div>

        {/* Clear / Transparent toggle */}
        <button
          onClick={toggleTransparent}
          className="flex-shrink-0 text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          title="Toggle transparent background"
        >
          {isTransparent ? "FILL" : "CLEAR"}
        </button>

        {/* Settings gear */}
        <button
          onClick={() => window.electronAPI?.openSettings()}
          className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
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
          className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
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
        <div className="absolute bottom-3 right-3 text-white/30 text-xs">
          <TriangleAlert className="text-white" /> Unsynced lyrics
        </div>
      )}
    </div>
  );
}
