'use client';

import { RouteError } from '@gitroom/frontend/components/errors/route-error';

export default function MediaError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} title="This media tool hit a snag" />;
}
