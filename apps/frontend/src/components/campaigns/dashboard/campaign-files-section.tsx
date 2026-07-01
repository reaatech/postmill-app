'use client';

import { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';
import { ResolvedCampaignItem } from '@gitroom/frontend/components/campaigns/campaign-types';
import {
  PanelItem,
  AddItemsModal,
} from '@gitroom/frontend/components/campaigns/dashboard/tagged-items-panels';

// Dedicated Files section — the campaign's tagged files, promoted out of the
// Tagged Items panel into their own first-class tab (mirrors Channels).
export const CampaignFilesSection: FC<{
  campaignId: string;
  files: ResolvedCampaignItem[];
  onMutate: () => void;
}> = ({ campaignId, files, onMutate }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useModals();
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const remove = useCallback(
    async (entityType: string, entityId: string) => {
      if (removingKey) return;
      setRemovingKey(`${entityType}:${entityId}`);
      try {
        const r = await fetch(`/campaigns/${campaignId}/items/${entityType}/${entityId}`, {
          method: 'DELETE',
        });
        if (!r.ok) throw new Error();
        toaster.show(t('item_untagged', 'File removed'), 'success');
        onMutate();
      } catch {
        toaster.show(t('failed_to_untag_item', 'Failed to remove file'), 'warning');
      } finally {
        setRemovingKey(null);
      }
    },
    [campaignId, fetch, onMutate, removingKey, t, toaster]
  );

  const openAddModal = useCallback(() => {
    modal.openModal({
      title: t('add_files_to_campaign', 'Add files to campaign'),
      withCloseButton: true,
      children: (
        <AddItemsModal
          campaignId={campaignId}
          existingItems={{ file: files }}
          types={['file']}
          defaultType="file"
          onDone={() => {
            modal.closeAll();
            onMutate();
          }}
        />
      ),
    });
  }, [campaignId, files, modal, onMutate, t]);

  return (
    <div className="p-[16px] border border-newTableBorder rounded-[12px] bg-newBgColor">
      <div className="flex items-center justify-between mb-[12px]">
        <div className="flex items-center gap-[8px]">
          <h3 className="text-[16px] font-semibold text-textColor">{t('files', 'Files')}</h3>
          {files.length > 0 && (
            <span className="text-[12px] text-newTableText">({files.length})</span>
          )}
        </div>
        <Button onClick={openAddModal} className="!h-[32px] !px-[12px] text-[13px]">
          {t('add_files', 'Add files')}
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="text-[13px] text-newTableText text-center py-[24px]">
          {t('no_tagged_files', 'No files tagged yet. Click Add files to attach files to this campaign.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[8px]">
          {files.map((item) => (
            <PanelItem
              key={item.id}
              item={item}
              onRemove={remove}
              busy={removingKey === `${item.entityType}:${item.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CampaignFilesSection;
