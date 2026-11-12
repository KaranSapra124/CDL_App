"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

/**
 * Plays a module's HLS stream for admin checking. Chrome, Edge and Firefox use hls.js.
 * Safari plays HLS natively.
 */
export function VideoPreview({ moduleId, title, onClose }: { moduleId: number; title: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const src = `/api/admin/modules/${moduleId}/hls/master.m3u8`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ capLevelToPlayerSize: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError("This video could not be played. Try re-uploading it.");
      });
      return () => hls.destroy();
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }
    setError("This browser cannot play HLS video.");
  }, [src]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" role="dialog" aria-modal="true" aria-label={`Preview: ${title}`}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="truncate font-semibold text-slate-900">{title}</p>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            Close
          </button>
        </div>
        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <video ref={videoRef} controls className="aspect-video w-full rounded-xl bg-black" />
        )}
      </div>
    </div>
  );
}
