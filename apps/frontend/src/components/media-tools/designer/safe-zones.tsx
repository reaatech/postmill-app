'use client';

import React, { FC, useMemo } from 'react';
import { Rect, Text, Group } from 'react-konva';
import { CHANNEL_PRESETS } from '@gitroom/nestjs-libraries/integrations/social/channel-presets';

interface SafeZoneOverlayProps {
  presetId?: string;
  width: number;
  height: number;
  visible: boolean;
}

export const SafeZoneOverlay: FC<SafeZoneOverlayProps> = ({
  presetId,
  width,
  height,
  visible,
}) => {
  const safeZones = useMemo(() => {
    if (!presetId) return [];
    const preset = CHANNEL_PRESETS.find((p) => p.id === presetId);
    return preset?.safeZones || [];
  }, [presetId]);

  if (!visible || safeZones.length === 0) return null;

  return (
    <>
      {safeZones.map((zone, i) => {
        const x = (zone.x / width) * width;
        const y = (zone.y / height) * height;
        const zWidth = (zone.width / width) * width;
        const zHeight = (zone.height / height) * height;

        return (
          <Group key={i} listening={false}>
            <Rect
              x={x}
              y={y}
              width={zWidth}
              height={zHeight}
              fill="rgba(255, 0, 0, 0.08)"
              stroke="rgba(255, 0, 0, 0.4)"
              strokeWidth={1}
              dash={[4, 4]}
            />
            <Text
              x={x + 4}
              y={y + 2}
              text={zone.label}
              fontSize={10}
              fill="rgba(255, 0, 0, 0.6)"
              fontFamily="Arial"
              listening={false}
            />
          </Group>
        );
      })}
    </>
  );
};
