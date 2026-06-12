export type ProviderConfigStatus = 'configured' | 'active' | 'mounted' | 'enabled' | 'disabled';

export interface ProviderConfigDto {
  id: string;
  organizationId: string;
  identifier: string;
  name?: string;
  enabled: boolean;
  isActive?: boolean;
  mounted?: boolean;
  status: ProviderConfigStatus[];
  displayName?: string;
  capabilities?: string[];
  createdAt: Date;
  updatedAt: Date;
}
