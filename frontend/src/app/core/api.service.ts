import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ApiResponse,
  EmailSettings,
  InventoryItem,
  Lead,
  LeadFollowup,
  ReminderLog,
  TagItem,
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

  // Follow-ups
  getFollowupQueue(scope: string): Observable<ApiResponse<Lead[]>> {
    const params = new HttpParams().set('scope', scope);
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

  updateInventoryTag(id: number, tag_id: number | null): Observable<ApiResponse<InventoryItem>> {
    return this.http.patch<ApiResponse<InventoryItem>>(`/api/inventory/${id}/tag`, { tag_id });
  }

  deleteInventory(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`/api/inventory/${id}`);
  }

  // Tag Master
  getTags(): Observable<ApiResponse<TagItem[]>> {
    return this.http.get<ApiResponse<TagItem[]>>('/api/tags');
  }

  createTag(payload: Partial<TagItem>): Observable<ApiResponse<TagItem>> {
    return this.http.post<ApiResponse<TagItem>>('/api/tags', payload);
  }

  updateTag(id: number, payload: Partial<TagItem>): Observable<ApiResponse<TagItem>> {
    return this.http.put<ApiResponse<TagItem>>(`/api/tags/${id}`, payload);
  }

  deleteTag(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`/api/tags/${id}`);
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
}

