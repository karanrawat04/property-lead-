export type LeadSourceIconKey =
  | 'walk_in'
  | 'phone'
  | 'referral'
  | 'website'
  | 'portal_99'
  | 'portal_mb'
  | 'portal_housing'
  | 'social'
  | 'other';

export interface LeadSourceOption {
  value: string;
  label: string;
  icon: LeadSourceIconKey;
  color: string;
  bg: string;
}

export const LEAD_SOURCES: readonly LeadSourceOption[] = [
  { value: 'Walk-in', label: 'Walk-in', icon: 'walk_in', color: '#0f766e', bg: '#ccfbf1' },
  { value: 'Phone Call', label: 'Phone Call', icon: 'phone', color: '#1d4ed8', bg: '#dbeafe' },
  { value: 'Referral', label: 'Referral', icon: 'referral', color: '#6d28d9', bg: '#ede9fe' },
  { value: 'Website', label: 'Website', icon: 'website', color: '#0369a1', bg: '#e0f2fe' },
  { value: '99acres', label: '99acres', icon: 'portal_99', color: '#b91c1c', bg: '#fee2e2' },
  { value: 'MagicBricks', label: 'MagicBricks', icon: 'portal_mb', color: '#b45309', bg: '#fef3c7' },
  { value: 'Housing.com', label: 'Housing.com', icon: 'portal_housing', color: '#7e22ce', bg: '#f3e8ff' },
  { value: 'Instagram / FB', label: 'Instagram / FB', icon: 'social', color: '#be185d', bg: '#fce7f3' },
  { value: 'Other', label: 'Other', icon: 'other', color: '#475569', bg: '#f1f5f9' },
];

export function getLeadSourceMeta(source: string | null | undefined): LeadSourceOption | null {
  if (!source) return null;
  const normalized = source.trim().toLowerCase();
  return (
    LEAD_SOURCES.find((s) => s.value.toLowerCase() === normalized) ?? {
      value: source,
      label: source,
      icon: 'other',
      color: '#475569',
      bg: '#f1f5f9',
    }
  );
}

