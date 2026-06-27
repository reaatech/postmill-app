// Shared campaign types + the entity-type slugs used by the tagger.
export type CampaignEntitySlug =
  | 'post'
  | 'channel'
  | 'vpn'
  | 'llm'
  | 'brand'
  | 'storage'
  | 'file'
  | 'set'
  | 'signature';

export interface Campaign {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
  createdAt: string;
  _count?: { posts: number };
}

export interface CampaignRef {
  id: string;
  name: string;
  color: string | null;
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
}

export interface ResolvedCampaignItem {
  id: string;
  name: string;
  icon?: string;
  subtitle?: string;
  entityType: CampaignEntitySlug;
  taggedAt?: string;
}
