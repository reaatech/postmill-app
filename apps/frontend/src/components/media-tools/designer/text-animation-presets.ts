import type { VideoClip } from './designer.store';
import type { EaseType } from './video-preview';

export interface TextAnimationPreset {
  name: string;
  keyframes: VideoClip['keyframes'];
}

export const TEXT_ANIMATION_PRESETS: TextAnimationPreset[] = [
  {
    name: 'Typewriter',
    keyframes: [
      { tMs: 0, props: { opacity: 0 }, ease: 'easeInOut' as EaseType },
      { tMs: 300, props: { opacity: 1 }, ease: 'easeInOut' as EaseType },
    ],
  },
  {
    name: 'Pop',
    keyframes: [
      { tMs: 0, props: { opacity: 0 }, ease: 'easeOut' as EaseType },
      { tMs: 400, props: { opacity: 1 }, ease: 'easeOut' as EaseType },
    ],
  },
  {
    name: 'Fade Up',
    keyframes: [
      { tMs: 0, props: { y: 20, opacity: 0 }, ease: 'easeOut' as EaseType },
      { tMs: 500, props: { y: 0, opacity: 1 }, ease: 'easeOut' as EaseType },
    ],
  },
  {
    name: 'Slide In Left',
    keyframes: [
      { tMs: 0, props: { x: -60, opacity: 0 }, ease: 'easeOut' as EaseType },
      { tMs: 500, props: { x: 0, opacity: 1 }, ease: 'easeOut' as EaseType },
    ],
  },
];
