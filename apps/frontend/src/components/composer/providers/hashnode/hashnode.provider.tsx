'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/composer/providers/high.order.provider';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { HashnodePublications } from '@gitroom/frontend/components/composer/providers/hashnode/hashnode.publications';
import { HashnodeTags } from '@gitroom/frontend/components/composer/providers/hashnode/hashnode.tags';
import { HashnodeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/hashnode.settings.dto';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import clsx from 'clsx';
import { FileComponent } from '@gitroom/frontend/components/files/file.component';
import { Canonical } from '@gitroom/react/form/canonical';
import { useShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';

const HashnodeSettings: FC = () => {
  const form = useSettings();
  const { date } = useIntegration();
  const postSelector = useShowPostSelector(date);
  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <Input label="Subtitle" {...form.register('subtitle')} />
      <Canonical
        date={date}
        label="Canonical Link"
        postSelector={postSelector}
        {...form.register('canonical')}
      />
      <FileComponent
        label="Cover picture"
        description="Add a cover picture"
        {...form.register('main_image')}
      />
      <div className="mt-[20px]">
        <HashnodePublications {...form.register('publication')} />
      </div>
      <div>
        <HashnodeTags label="Tags" {...form.register('tags')} />
      </div>
    </>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: HashnodeSettings,
  CustomPreviewComponent: undefined, // HashnodePreview,
  dto: HashnodeSettingsDto,
  maximumCharacters: 10000,
});
