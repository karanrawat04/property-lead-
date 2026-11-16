import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AgentDropdownItem,
  ApiResponse,
  DashboardStats,
  EmailSettings,
  InventoryItem,
  Lead,
  LeadFollowup,
  LeadTemperature,
  ReminderLog,
  User,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // Leads
  getLeads(filters: Record<string, string | number | null | undefined> = {}): Observable<ApiResponse<Lead[]>> {
    let params = new HttpParams();
    for (const [key, val] of Object.entries(filters)) {
      if (val !== null && val !== undefined && val !== '') {
        params = params.set(key, String(val));
      }
    }
    return this.http.get<ApiResponse<Lead[]>>('/api/leads', { params });
  }

  getLead(id: number): Observable<ApiResponse<Lead>> {
    return this.http.get<ApiResponse<Lead>>(`/api/leads/${id}`);
  }

  createLead(payload: Partial<Lead>): Observable<ApiResponse<Lead>> {
    return this.http.post<ApiResponse<Lead>>('/api/leads', payload);
  }

  updateLead(id: number, payload: Partial<Lead>): Observable<ApiResponse<Lead>> {
    return this.http.put<ApiResponse<Lead>>(`/api/leads/${id}`, payload);
  }

  toggleLeadVisited(id: number, is_visited: boolean): Observable<ApiResponse<Lead>> {
    return this.http.patch<ApiResponse<Lead>>(`/api/leads/${id}/visit`, { is_visited });
  }

  deleteLead(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`/api/leads/${id}`);
  }

  setLeadTemperature(id: number, temperature: LeadTemperature): Observable<ApiResponse<{ id: number; temperature: LeadTemperature }>> {
    return this.http.patch<ApiResponse<{ id: number; temperature: LeadTemperature }>>(`/api/leads/${id}/temperature`, { temperature });
  }

  assignLead(id: number, assigned_agent_id: number | null): Observable<ApiResponse<{ id: number; assigned_agent_id: number | null; assigned_agent_name: string | null }>> {
    return this.http.patch<ApiResponse<{ id: number; assigned_agent_id: number | null; assigned_agent_name: string | null }>>(`/api/leads/${id}/assign`, { assigned_agent_id });
  }

  // Follow-ups
  getFollowupQueue(scope: string, extraFilters: Record<string, string | number | null | undefined> = {}): Observable<ApiResponse<Lead[]>> {
    let params = new HttpParams().set('scope', scope);
    for (const [key, val] of Object.entries(extraFilters)) {
      if (val !== null && val !== undefined && val !== '') {
        params = params.set(key, String(val));
      }
    }
    return this.http.get<ApiResponse<Lead[]>>('/api/followups/queue', { params });
  }

  addFollowup(
    leadId: number,
    payload: {
      followup_at: string;
      channel: string;
      outcome?: string | null;
      notes: string;
      next_followup_at?: string | null;
      needs_followup: boolean;
      marked_visited: boolean;
      status?: string;
    }
  ): Observable<ApiResponse<LeadFollowup>> {
    return this.http.post<ApiResponse<LeadFollowup>>(`/api/leads/${leadId}/followups`, payload);
  }

  deleteFollowup(followupId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`/api/followups/${followupId}`);
  }

  // Inventory (no file/photo uploads)
  getInventory(filters: Record<string, string | number | null | undefined> = {}): Observable<ApiResponse<InventoryItem[]>> {
    let params = new HttpParams();
    for (const [key, val] of Object.entries(filters)) {
      if (val !== null && val !== undefined && val !== '') {
        params = params.set(key, String(val));
      }
    }
    return this.http.get<ApiResponse<InventoryItem[]>>('/api/inventory', { params });
  }

  createInventory(payload: Partial<InventoryItem>): Observable<ApiResponse<InventoryItem>> {
    return this.http.post<ApiResponse<InventoryItem>>('/api/inventory', payload);
  }

  updateInventory(id: number, payload: Partial<InventoryItem>): Observable<ApiResponse<InventoryItem>> {
    return this.http.put<ApiResponse<InventoryItem>>(`/api/inventory/${id}`, payload);
  }

  deleteInventory(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`/api/inventory/${id}`);
  }

  // Email Reminder Settings
  getEmailSettings(): Observable<ApiResponse<{ settings: EmailSettings; logs: ReminderLog[] }>> {
    return this.http.get<ApiResponse<{ settings: EmailSettings; logs: ReminderLog[] }>>('/api/settings/email');
  }

  saveEmailSettings(payload: Record<string, unknown>): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>('/api/settings/email', payload);
  }

  sendTestEmail(test_email?: string): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>('/api/settings/email/test', { test_email });
  }

  sendDueRemindersNow(): Observable<ApiResponse<{ processed: number; sent: number; failed: number; message: string }>> {
    return this.http.post<ApiResponse<{ processed: number; sent: number; failed: number; message: string }>>(
      '/api/settings/email/send-due',
      {}
    );
  }

  rotateCronSecret(): Observable<ApiResponse<{ cron_secret: string }>> {
    return this.http.post<ApiResponse<{ cron_secret: string }>>('/api/settings/email/rotate-cron-secret', {});
  }

  // Dashboard Analytics
  getDashboardStats(): Observable<ApiResponse<DashboardStats>> {
    return this.http.get<ApiResponse<DashboardStats>>('/api/dashboard/stats');
  }

  // Agents Management
  getAgents(): Observable<ApiResponse<User[]>> {
    return this.http.get<ApiResponse<User[]>>('/api/agents');
  }

  getAgentsDropdown(): Observable<ApiResponse<AgentDropdownItem[]>> {
    return this.http.get<ApiResponse<AgentDropdownItem[]>>('/api/agents/dropdown');
  }

  createAgent(payload: Partial<User> & { password?: string }): Observable<ApiResponse<User>> {
    return this.http.post<ApiResponse<User>>('/api/agents', payload);
  }

  updateAgent(id: number, payload: Partial<User> & { password?: string }): Observable<ApiResponse<User>> {
    return this.http.put<ApiResponse<User>>(`/api/agents/${id}`, payload);
  }

  deleteAgent(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`/api/agents/${id}`);
  }

  uploadAvatar(file: File): Observable<ApiResponse<{ url: string; filename: string }>> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.post<ApiResponse<{ url: string; filename: string }>>('/api/agents/upload-avatar', formData);
  }
}

