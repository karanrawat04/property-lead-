export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Record<string, string>;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'agent';
  timezone?: string;
}

export interface HealthStatus {
  status: string;
  needs_setup: boolean;
  timezone: string;
  server_time: string;
  php_version: string;
}

export interface TagItem {
  id: number;
  name: string;
  description: string | null;
  color: string;
  is_active: number | boolean;
  inventory_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryItem {
  id: number;
  unique_code: string;
  unit_number: string;
  title: string;
  property_type: string;
  location: string | null;
  floor_wing: string | null;
  area_sqft: number | null;
  price: number | null;
  tag_id: number | null;
  tag_name?: string | null;
  tag_description?: string | null;
  tag_color?: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export type LeadStatus =
  | 'New'
  | 'Contacted'
  | 'Visited'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost';

export interface LeadFollowup {
  id: number;
  lead_id: number;
  followup_at: string;
  channel: 'Call' | 'WhatsApp' | 'Email' | 'Site Visit' | 'Meeting' | 'Other';
  outcome: string | null;
  notes: string;
  next_followup_at: string | null;
  marked_visited: number | boolean;
  created_by_name?: string | null;
  created_at?: string;
}

export interface Lead {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  source: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_location: string | null;
  property_requirement: string | null;
  interested_inventory_id: number | null;
  inv_unique_code?: string | null;
  inv_unit_number?: string | null;
  inv_title?: string | null;
  inv_tag_name?: string | null;
  inv_tag_color?: string | null;
  is_visited: number | boolean;
  visited_at: string | null;
  needs_followup: number | boolean;
  next_followup_at: string | null;
  status: LeadStatus;
  notes: string | null;
  followup_count?: number;
  last_followup_at?: string | null;
  last_followup_notes?: string | null;
  followups?: LeadFollowup[];
  created_at?: string;
  updated_at?: string;
}

export interface EmailSettings {
  reminders_enabled: boolean;
  recipient_email: string;
  sender_name: string;
  sender_email: string;
  transport: 'brevo_api' | 'resend_api' | 'smtp' | 'php_mail';
  smtp_host: string;
  smtp_port: number;
  smtp_encryption: 'tls' | 'ssl' | 'none';
  smtp_username: string;
  has_smtp_password: boolean;
  has_api_key: boolean;
  remind_before_minutes: number;
  cron_secret: string;
  last_run_at: string | null;
  last_status: string | null;
}

export interface ReminderLog {
  id: number;
  lead_id: number | null;
  lead_name?: string | null;
  recipient_email: string;
  subject: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  sent_at: string;
}

