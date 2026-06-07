'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FirstCommentField } from '@gitroom/frontend/components/new-launch/providers/shared/first-comment.field';

const KickSettings = () => {
  return (
    <>
      <FirstCommentField />
    </>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  comments: 'no-media',
  minimumCharacters: [],
  SettingsComponent: KickSettings,
  CustomPreviewComponent: undefined,
  dto: undefined,
  maximumCharacters: 500,
});
