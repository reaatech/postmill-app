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
  const zones = useMemo(
    () => {
      if (!presetId) return null;
      const preset = CHANNEL_PRESETS.find((p) => p.id === presetId);
      if (!preset) return null;

      if (preset.safeZones && preset.safeZones.length > 0) {
        return preset.safeZones;
      }

      return [
        {
          label: 'Title Safe (5%)',
          x: width * 0.05,
          y: height * 0.05,
          width: width * 0.9,
          height: height * 0.9,
          description: 'Generic title-safe area',
        },
      ];
    },
    [presetId, width, height],
  );

  if (!visible || !zones) return null;

  return (
    <>
      {zones.map((zone, i) => (
        <Group key={i} listening={false}>
          <Rect
            x={zone.x}
            y={zone.y}
            width={zone.width}
            height={zone.height}
            fill="rgba(255, 0, 0, 0.08)"
            stroke="rgba(255, 0, 0, 0.4)"
            strokeWidth={1}
            dash={[4, 4]}
          />
          <Text
            x={zone.x + 4}
            y={zone.y + 2}
            text={zone.label}
            fontSize={10}
            fill="rgba(255, 0, 0, 0.6)"
            fontFamily="Arial"
            listening={false}
          />
        </Group>
      ))}
    </>
  );
};
