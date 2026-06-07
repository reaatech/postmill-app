'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FirstCommentField } from '@gitroom/frontend/components/new-launch/providers/shared/first-comment.field';

const TelegramSettings = () => {
  return (
    <>
      <FirstCommentField />
    </>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: TelegramSettings,
  CustomPreviewComponent: undefined,
  dto: undefined,
  maximumCharacters: 4096,
});
