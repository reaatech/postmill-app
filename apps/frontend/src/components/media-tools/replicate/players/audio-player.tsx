'use client';

import React, { useRef, useEffect } from 'react';

interface AudioPlayerProps {
  src: string;
}

export function AudioPlayer({ src }: AudioPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!src || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = src;

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const drawWaveform = async () => {
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const data = audioBuffer.getChannelData(0);

      const width = canvas.width;
      const height = canvas.height;
      const step = Math.ceil(data.length / width);
      const amp = height / 2;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#2B5CD3';
      ctx.strokeStyle = '#2B5CD3';
      ctx.lineWidth = 1;

      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
          const datum = data[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
      }
    };

    drawWaveform().catch(() => {
      // Fallback: draw a flat line
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#2B5CD3';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
    });

    return () => {
      audioCtx.close().catch(() => {});
    };
  }, [src]);

  return (
    <div className="w-full">
      <audio ref={audioRef} controls className="w-full mb-2">
        <source src={src} />
      </audio>
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        className="w-full rounded-lg bg-gray-900"
      />
    </div>
  );
}
