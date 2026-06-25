'use client';

import React from 'react';

interface VideoPlayerProps {
  src: string;
}

export function VideoPlayer({ src }: VideoPlayerProps) {
  return (
    <div className="w-full rounded-xl overflow-hidden bg-black">
      <video controls playsInline className="w-full max-h-[480px]">
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
}
