'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type {
  AiDesignerSessionDto,
  AiDesignerMessagePayload,
} from '@gitroom/nestjs-libraries/ai-designer/ai-designer.types';

export interface AiDesignerSessionHydrate {
  session: AiDesignerSessionDto;
  messages: AiDesignerMessagePayload[];
}

export const useAiDesignerSession = (sessionId: string | null) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    if (!sessionId) return null;
    const res = await fetch(`/ai-designer/sessions/${sessionId}`);
    if (!res.ok) return null;
    return (await res.json()) as AiDesignerSessionHydrate;
  }, [fetch, sessionId]);
  return useSWR<AiDesignerSessionHydrate | null>(
    sessionId ? `ai-designer-session-${sessionId}` : null,
    load,
    { revalidateOnFocus: false }
  );
};
