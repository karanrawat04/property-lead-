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
  mobile_number?: string | null;
  alt_number?: string | null;
  address?: string | null;
  date_of_joining?: string | null;
  avatar_url?: string | null;
  is_active?: number | boolean;
  timezone?: string;
  assigned_leads_count?: number;
  hot_leads_count?: number;
  visited_leads_count?: number;
  won_leads_count?: number;
  overdue_count?: number;
  created_at?: string;
}

export interface AgentDropdownItem {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  mobile_number: string | null;
}

export interface HealthStatus {
  status: string;
  needs_setup: boolean;
  timezone: string;
  server_time: string;
  php_version: string;
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

export type LeadTemperature = 'Hot' | 'Warm' | 'Cold';

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
  assigned_agent_id?: number | null;
  assigned_agent_name?: string | null;
  assigned_agent_avatar?: string | null;
  assigned_agent_mobile?: string | null;
  inv_unique_code?: string | null;
  inv_unit_number?: string | null;
  inv_title?: string | null;
  is_visited: number | boolean;
  visited_at: string | null;
  needs_followup: number | boolean;
  next_followup_at: string | null;
  status: LeadStatus;
  temperature: LeadTemperature;
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

export interface AgentPerformanceItem {
  id: number;
  name: string;
  email: string;
  mobile_number: string | null;
  avatar_url: string | null;
  is_active: number | boolean;
  total_assigned: number;
  hot_count: number;
  visited_count: number;
  won_count: number;
  overdue_count: number;
}

export interface UrgentLeadItem {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  status: LeadStatus;
  temperature: LeadTemperature;
  needs_followup: number | boolean;
  next_followup_at: string | null;
  is_visited: number | boolean;
  inv_unit_number?: string | null;
  inv_title?: string | null;
  assigned_agent_name?: string | null;
  assigned_agent_avatar?: string | null;
}

export interface DashboardStats {
  role: 'admin' | 'agent';
  total_leads: number;
  hot_leads: number;
  warm_leads: number;
  cold_leads: number;
  visited_leads: number;
  closed_won_leads: number;
  closed_lost_leads: number;
  conversion_rate: number;
  overdue_followups: number;
  today_followups: number;
  upcoming_followups: number;
  status_breakdown: Record<string, number>;
  urgent_leads: UrgentLeadItem[];
  agents_performance: AgentPerformanceItem[];
}

