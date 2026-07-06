'use client';

import { FC, useMemo } from 'react';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { getTimezone } from '@gitroom/frontend/components/layout/set.timezone';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { Button } from '@gitroom/react/form/button';
import { CustomizePopover, DashboardSectionMeta } from './customize.popover';
import { greetingForUser } from './dashboard.utils';

interface DashboardHeaderProps {
  sections: DashboardSectionMeta[];
  showBriefButton?: boolean;
  onBriefClick?: () => void;
}

export const DashboardHeader: FC<DashboardHeaderProps> = ({
  sections,
  showBriefButton,
  onBriefClick,
}) => {
  const router = useRouter();
  const user = useUser();

  const greeting = useMemo(() => {
    const firstName = user?.profile?.name?.trim().split(/\s+/)[0] || 'there';
    const hour = dayjs().tz(getTimezone()).hour();
    return greetingForUser(firstName, hour);
  }, [user?.profile?.name]);

  const dateLabel = useMemo(
    () => dayjs().tz(getTimezone()).format('dddd, MMMM D'),
    []
  );

  return (
    <div className="flex flex-col gap-[8px] mb-[20px]">
      <div className="flex flex-col mobile:flex-row mobile:items-center mobile:justify-between gap-[8px]">
        <div>
          <h1 className="text-[20px] mobile:text-[24px] font-[600] text-textColor">
            {greeting}
          </h1>
          <p className="text-[13px] text-newTableText mt-[2px]">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-[8px]">
          <StreakComponent />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[8px]">
        {showBriefButton && (
          <Button
            secondary
            onClick={onBriefClick}
            className="px-[12px]"
            aria-label="Daily brief"
          >
            <span className="mr-[6px]">✨</span>
            Daily Brief
          </Button>
        )}
        <Button
          onClick={() => router.push('/posts/post')}
          className="px-[12px]"
          aria-label="New post"
        >
          + New Post
        </Button>
        <Button
          secondary
          onClick={() => router.push('/campaigns?new=1')}
          className="px-[12px]"
          aria-label="New campaign"
        >
          + New Campaign
        </Button>
        <CustomizePopover sections={sections} />
      </div>
    </div>
  );
};
