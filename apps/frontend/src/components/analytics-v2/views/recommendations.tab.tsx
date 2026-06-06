'use client';

import { FC } from 'react';
import { useRouter } from 'next/navigation';
import { useRecommendations, RecommendationItem } from '../hooks/useRecommendations';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-[#F97066] border-[#F97066]',
  2: 'text-[#FFAC30] border-[#FFAC30]',
  3: 'text-[#1D9BF0] border-[#1D9BF0]',
};

export const RecommendationsTab: FC = () => {
  const t = useT();
  const router = useRouter();
  const { data, isLoading, error } = useRecommendations();
  const priorityLabels: Record<number, string> = {
    1: t('priority_high', 'High'),
    2: t('priority_medium', 'Medium'),
    3: t('priority_low', 'Low'),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px] text-textColor">
        {t('recommendations_loading', 'Loading recommendations...')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[200px] text-[#F97066]">
        {t('recommendations_load_error', 'Failed to load recommendations')}
      </div>
    );
  }

  const items = data?.recommendations || [];

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-newTableText">
        {t(
          'recommendations_empty',
          'No recommendations yet. Connect more channels and publish posts to get actionable insights.'
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
      {items.map((item: RecommendationItem, index: number) => (
        <div
          key={`rec-${index}`}
          className="bg-newBgColorInner rounded-[12px] border border-newTableBorder p-[20px] flex flex-col gap-[12px]"
        >
          <div className="flex items-center gap-[8px]">
            <span
              className={`text-[11px] font-semibold px-[8px] py-[2px] rounded-full border ${PRIORITY_COLORS[item.priority] || 'text-newTableText border-newTableText'}`}
            >
              {priorityLabels[item.priority] || t('priority_info', 'Info')}
            </span>
            <span className="text-[11px] text-newTableText capitalize">{item.type.replace(/_/g, ' ')}</span>
          </div>
          <h3 className="text-[15px] font-semibold text-textColor">{item.title}</h3>
          <p className="text-[13px] text-newTableText leading-relaxed">{item.description}</p>
          <button
            onClick={() => router.push(item.link)}
            className="self-start mt-auto px-[14px] py-[6px] bg-forth text-white text-[13px] font-medium rounded-[8px] transition-colors hover:opacity-80"
          >
            {item.action}
          </button>
        </div>
      ))}
    </div>
  );
};
