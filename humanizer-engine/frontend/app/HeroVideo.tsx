'use client';

import { useState, useEffect, useRef } from 'react';

const VIDEOS = ['/hero-video-1.mp4', '/hero-video-2.mp4'];

export default function HeroVideo() {
  const [current, setCurrent] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.src = VIDEOS[current];
    v.load();
    v.play().catch(() => {});
  }, [current]);

  const handleEnded = () => {
    setCurrent((prev) => (prev + 1) % VIDEOS.length);
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover opacity-30"
        muted
        playsInline
        onEnded={handleEnded}
        autoPlay
      />
      {/* Gradient overlays for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#05050A]/60 via-[#05050A]/40 to-[#05050A]/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#05050A]/50 via-transparent to-[#05050A]/50" />
    </div>
  );
}
