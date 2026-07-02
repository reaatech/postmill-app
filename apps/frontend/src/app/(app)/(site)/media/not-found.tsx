import { RouteNotFound } from '@gitroom/frontend/components/errors/route-not-found';

export default function MediaNotFound() {
  return (
    <RouteNotFound
      title="Tool not found"
      description="This media tool doesn't exist or isn't enabled for your organization."
      homeHref="/media"
      homeLabel="Back to media tools"
    />
  );
}
