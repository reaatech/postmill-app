'use client';

import { FileBox } from '@gitroom/frontend/components/files/file.component';

export const MediaLayoutComponent = () => {
  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all">
      <FileBox setMedia={() => {}} closeModal={() => {}} standalone={true} />
    </div>
  );
};
