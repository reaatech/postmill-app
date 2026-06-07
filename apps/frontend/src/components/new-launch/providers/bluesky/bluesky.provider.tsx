'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';
import { FirstCommentField } from '@gitroom/frontend/components/new-launch/providers/shared/first-comment.field';

const SettingsComponent = () => {
  return (
    <>
      <ThreadFinisher />
      <FirstCommentField />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: undefined,
  maximumCharacters: 300,
});
