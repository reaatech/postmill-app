export interface SafeZoneOverlay {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  description: string;
}

export interface ChannelPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  category: 'social' | 'story' | 'ad' | 'custom';
  safeZones?: SafeZoneOverlay[];
}

export const CHANNEL_PRESETS: ChannelPreset[] = [
  {
    id: 'ig-post',
    name: 'Instagram Post',
    width: 1080,
    height: 1080,
    category: 'social',
  },
  {
    id: 'ig-story',
    name: 'Instagram Story',
    width: 1080,
    height: 1920,
    category: 'story',
    safeZones: [
      {
        label: 'CTA Bar',
        x: 0,
        y: 1780,
        width: 1080,
        height: 140,
        description: 'CTA button bar at bottom',
      },
      {
        label: 'Top Safe Zone',
        x: 0,
        y: 0,
        width: 1080,
        height: 80,
        description: 'System UI at top',
      },
    ],
  },
  {
    id: 'ig-reel',
    name: 'Instagram Reel',
    width: 1080,
    height: 1920,
    category: 'story',
    safeZones: [
      {
        label: 'Bottom UI',
        x: 0,
        y: 1720,
        width: 1080,
        height: 200,
        description: 'Caption, like, comment, share',
      },
      {
        label: 'Top Safe Zone',
        x: 0,
        y: 0,
        width: 1080,
        height: 120,
        description: 'Account info + actions',
      },
    ],
  },
  {
    id: 'fb-post',
    name: 'Facebook Post',
    width: 1200,
    height: 630,
    category: 'social',
  },
  {
    id: 'fb-story',
    name: 'Facebook Story',
    width: 1080,
    height: 1920,
    category: 'story',
    safeZones: [
      {
        label: 'CTA Bar',
        x: 0,
        y: 1780,
        width: 1080,
        height: 140,
        description: 'CTA button bar at bottom',
      },
    ],
  },
  {
    id: 'x-post',
    name: 'X (Twitter) Post',
    width: 1200,
    height: 675,
    category: 'social',
  },
  {
    id: 'linkedin-post',
    name: 'LinkedIn Post',
    width: 1200,
    height: 627,
    category: 'social',
  },
  {
    id: 'linkedin-banner',
    name: 'LinkedIn Banner',
    width: 1584,
    height: 396,
    category: 'ad',
  },
  {
    id: 'tiktok',
    name: 'TikTok Video',
    width: 1080,
    height: 1920,
    category: 'story',
    safeZones: [
      {
        label: 'Bottom UI',
        x: 0,
        y: 1700,
        width: 1080,
        height: 220,
        description: 'Caption, like, comment, share, music',
      },
      {
        label: 'Top Safe Zone',
        x: 0,
        y: 0,
        width: 1080,
        height: 100,
        description: 'Creator info + actions',
      },
    ],
  },
  {
    id: 'yt-thumbnail',
    name: 'YouTube Thumbnail',
    width: 1280,
    height: 720,
    category: 'social',
  },
  {
    id: 'pinterest-pin',
    name: 'Pinterest Pin',
    width: 1000,
    height: 1500,
    category: 'social',
  },
  {
    id: 'custom',
    name: 'Custom Size',
    width: 1080,
    height: 1080,
    category: 'custom',
  },
];
