import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { form, FormField, required, maxLength, submit, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { extractApiError } from '../../core/api-error';
import { Lead, LeadStatus, LeadTemperature } from '../../core/models';
import { IstDatetimeField } from '../../shared/ist-datetime-field/ist-datetime-field';
import { LeadSourceBadge } from '../../shared/lead-source/lead-source-badge';
import {
  formatBudgetRange,
  formatIstDateTime,
  isValidIstDateTimeValue,
  nowIstDateTimeLocal,
} from '../../core/validators';

@Component({
  selector: 'app-followups',
  imports: [CommonModule, FormField, IstDatetimeField, LeadSourceBadge],
  template: `
    <div class="page-header">
      <div>
        <h2 class="page-title">Follow-ups Queue</h2>
        <p class="page-subtitle">Leads marked "Have to take follow-up" ordered by scheduled IST time</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        @for (tab of scopes; track tab.key) {
          <button
            class="btn btn-sm"
            [class.btn-primary]="scope() === tab.key"
            [class.btn-secondary]="scope() !== tab.key"
            (click)="setScope(tab.key)"
          >
            {{ tab.label }}
          </button>
        }
      </div>
    </div>

    @if (feedback()) {
      <div class="alert" [class.alert-success]="!isError()" [class.alert-error]="isError()">
        {{ feedback() }}
      </div>
    }

    @if (loading()) {
      <div class="card"><p class="page-subtitle">Loading follow-up queue...</p></div>
    } @else if (leads().length === 0) {
      <div class="card"><div class="empty-state">No pending follow-ups in this view.</div></div>
    } @else {
      <div class="card desktop-only">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Next Follow-up (IST)</th>
                <th>Temp</th>
                <th>Lead Contact</th>
                <th>Assigned Agent</th>
                <th>Budget & Unit</th>
                <th>Visited</th>
                <th>Last Note</th>
                <th style="width: 150px;">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (lead of leads(); track lead.id) {
                <tr>
                  <td>
                    <span class="badge" [class.badge-red]="isOverdue(lead)" [class.badge-amber]="!isOverdue(lead)">
                      {{ isOverdue(lead) ? 'Overdue' : 'Scheduled' }}
                    </span>
                    <div style="margin-top:4px; font-weight:700;">{{ formatDt(lead.next_followup_at) }}</div>
                  </td>
                  <td>
                    <span class="temp-badge" [ngClass]="getTempClass(lead.temperature)">
                      {{ getTempIcon(lead.temperature) }} {{ lead.temperature }}
                    </span>
                  </td>
                  <td>
                    <div style="font-weight:700;">{{ lead.full_name }}</div>
                    <div style="display:flex; align-items:center; gap:6px; margin: 3px 0;">
                      <a class="phone-link" [href]="'tel:' + lead.phone">📞 {{ lead.phone }}</a>
                      <a
                        [href]="getWhatsAppUrl(lead.phone, lead.full_name)"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="btn-mini btn-whatsapp"
                        title="Chat on WhatsApp"
                      >💬</a>
                    </div>
                    <div class="page-subtitle">Status: {{ lead.status }}</div>
                    @if (lead.source) {
                      <div style="margin-top: 4px;"><app-lead-source-badge [source]="lead.source" /></div>
                    }
                  </td>
                  <td>
                    <span class="agent-tag">
                      👤 {{ lead.assigned_agent_name || 'Unassigned' }}
                    </span>
                  </td>
                  <td>
                    <div>{{ formatBudget(lead.budget_min, lead.budget_max) }}</div>
                    @if (lead.inv_unit_number) {
                      <div style="margin-top:3px;">
                        <span class="mono-code">{{ lead.inv_unique_code }}</span>
                        <span style="margin-left:4px;">{{ lead.inv_unit_number }}</span>
                      </div>
                    }
                  </td>
                  <td>
                    <button
                      class="btn btn-sm"
                      [class.btn-success]="lead.is_visited"
                      [class.btn-secondary]="!lead.is_visited"
                      (click)="toggleVisited(lead)"
                    >
                      {{ lead.is_visited ? '✓ Visited' : 'Mark Visited' }}
                    </button>
                  </td>
                  <td>
                    <div style="max-width: 260px;">{{ lead.last_followup_notes || lead.notes || '—' }}</div>
                  </td>
                  <td>
                    <button class="btn btn-primary btn-sm" (click)="openLogModal(lead)">Log Follow-up</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="mobile-only">
        <div class="mobile-card-list">
          @for (lead of leads(); track lead.id) {
            <article class="mobile-card">
              <div class="mobile-card-head">
                <div>
                  <div style="font-weight: 700; font-size: 15.5px;">{{ lead.full_name }}</div>
                  <div style="display:flex; align-items:center; gap:6px; margin: 3px 0;">
                    <a class="phone-link" [href]="'tel:' + lead.phone">📞 {{ lead.phone }}</a>
                    <a [href]="getWhatsAppUrl(lead.phone, lead.full_name)" target="_blank" rel="noopener noreferrer" class="btn-mini btn-whatsapp">💬</a>
                  </div>
                  @if (lead.source) {
                    <div style="margin-top: 4px;"><app-lead-source-badge [source]="lead.source" /></div>
                  }
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                  <span class="badge" [class.badge-red]="isOverdue(lead)" [class.badge-amber]="!isOverdue(lead)">
                    {{ isOverdue(lead) ? 'Overdue' : 'Scheduled' }}
                  </span>
                  <span class="temp-badge" [ngClass]="getTempClass(lead.temperature)">
                    {{ getTempIcon(lead.temperature) }} {{ lead.temperature }}
                  </span>
                </div>
              </div>

              <div class="mobile-card-meta">
                <div>
                  <span class="mobile-meta-label">Scheduled (IST)</span>
                  <strong>{{ formatDt(lead.next_followup_at) }}</strong>
                </div>
                <div>
                  <span class="mobile-meta-label">Assigned Agent</span>
                  <span>{{ lead.assigned_agent_name || 'Unassigned' }}</span>
                </div>
                <div>
                  <span class="mobile-meta-label">Budget</span>
                  <span>{{ formatBudget(lead.budget_min, lead.budget_max) }}</span>
                </div>
                @if (lead.inv_unit_number) {
                  <div>
                    <span class="mobile-meta-label">Unit</span>
                    <span class="mono-code">{{ lead.inv_unique_code }}</span>
                    <span style="margin-left: 4px;">{{ lead.inv_unit_number }}</span>
                  </div>
                }
                @if (lead.last_followup_notes || lead.notes) {
                  <div style="grid-column: 1 / -1;">
                    <span class="mobile-meta-label">Last Note</span>
                    <span>{{ lead.last_followup_notes || lead.notes }}</span>
                  </div>
                }
              </div>

              <div class="mobile-card-actions">
                <a [href]="'tel:' + lead.phone" class="btn btn-secondary btn-sm" style="flex:1; text-align:center;">📞 Call</a>
                <a [href]="getWhatsAppUrl(lead.phone, lead.full_name)" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-whatsapp" style="flex:1; text-align:center;">💬 WhatsApp</a>
                <button
                  class="btn btn-sm"
                  [class.btn-success]="lead.is_visited"
                  [class.btn-secondary]="!lead.is_visited"
                  (click)="toggleVisited(lead)"
                >
                  {{ lead.is_visited ? '✓ Visited' : 'Mark Visited' }}
                </button>
                <button class="btn btn-primary btn-sm" (click)="openLogModal(lead)">Log Follow-up</button>
              </div>
            </article>
          }
        </div>
      </div>
    }

    @if (showModal() && selectedLead()) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal-panel" style="max-width: 580px;" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Log Follow-up · {{ selectedLead()!.full_name }}</h3>
            <button class="btn btn-secondary btn-sm" (click)="closeModal()">✕</button>
          </div>
          <form (submit)="submitFollowup(); $event.preventDefault()" novalidate>
            <div class="modal-body">
              @if (modalError()) {
                <div class="alert alert-error">{{ modalError() }}</div>
              }
              <div class="form-grid">
                <div class="form-group">
                  <label>Follow-up Time (DD/MM/YYYY · 24h IST) <span class="req">*</span></label>
                  <app-ist-datetime-field [formField]="followupForm.followup_at" />
                  @if (followupForm.followup_at().touched() && followupForm.followup_at().errors().length) {
                    <span class="field-error">{{ followupForm.followup_at().errors()[0].message }}</span>
                  }
                </div>
                <div class="form-group">
                  <label>Channel <span class="req">*</span></label>
                  <select [formField]="followupForm.channel">
                    @for (ch of channels; track ch) {
                      <option [value]="ch">{{ ch }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label>Outcome</label>
                  <input type="text" [formField]="followupForm.outcome" placeholder="e.g. Site visit confirmed" />
                  @if (followupForm.outcome().touched() && followupForm.outcome().errors().length) {
                    <span class="field-error">{{ followupForm.outcome().errors()[0].message }}</span>
                  }
                </div>
                <div class="form-group">
                  <label>Lead Status</label>
                  <select [formField]="followupForm.status">
                    @for (s of statuses; track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                  </select>
                </div>
                <div class="form-group full">
                  <label>Notes <span class="req">*</span></label>
                  <textarea rows="3" [formField]="followupForm.notes" placeholder="Enter summary of call / visit..."></textarea>
                  @if (followupForm.notes().touched() && followupForm.notes().errors().length) {
                    <span class="field-error">{{ followupForm.notes().errors()[0].message }}</span>
                  }
                </div>
                <div class="form-group">
                  <label class="checkbox-row">
                    <input type="checkbox" [formField]="followupForm.marked_visited" />
                    Lead Visited
                  </label>
                  <label class="checkbox-row" style="margin-top:8px;">
                    <input type="checkbox" [formField]="followupForm.needs_followup" />
                    Schedule Next Follow-up
                  </label>
                </div>
                <div class="form-group">
                  <label>Next Follow-up (DD/MM/YYYY · 24h IST)</label>
                  <app-ist-datetime-field [formField]="followupForm.next_followup_at" />
                  @if ((followupForm.next_followup_at().touched() || followupForm.needs_followup().touched()) && followupForm.next_followup_at().errors().length) {
                    <span class="field-error">{{ followupForm.next_followup_at().errors()[0].message }}</span>
                  }
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : 'Save Follow-up' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: `
    .temp-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .temp-hot { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .temp-warm { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .temp-cold { background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .btn-mini {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 13px;
      line-height: 1;
    }
    .btn-whatsapp {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .btn-whatsapp:hover { background: #bbf7d0; }
    .agent-tag {
      font-size: 12px;
      background: #f1f5f9;
      color: #334155;
      padding: 3px 7px;
      border-radius: 4px;
      font-weight: 600;
    }
  `,
})
export class FollowupsComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly scope = signal<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  protected readonly leads = signal<Lead[]>([]);
  protected readonly loading = signal(true);
  protected readonly feedback = signal('');
  protected readonly isError = signal(false);

  protected readonly showModal = signal(false);
  protected readonly selectedLead = signal<Lead | null>(null);
  protected readonly saving = signal(false);
  protected readonly modalError = signal('');

  protected readonly scopes: Array<{ key: 'all' | 'overdue' | 'today' | 'upcoming'; label: string }> = [
    { key: 'all', label: 'All Pending' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'today', label: 'Due Today' },
    { key: 'upcoming', label: 'Upcoming' },
  ];

  protected readonly channels = ['Call', 'WhatsApp', 'Email', 'Site Visit', 'Meeting', 'Other'];
  protected readonly statuses: LeadStatus[] = [
    'New',
    'Contacted',
    'Visited',
    'Negotiation',
    'Closed Won',
    'Closed Lost',
  ];

  protected readonly followupModel = signal({
    followup_at: '',
    channel: 'Call',
    outcome: '',
    notes: '',
    marked_visited: false,
    needs_followup: true,
    next_followup_at: '',
    status: 'Contacted',
  });

  protected readonly followupForm = form(this.followupModel, (s) => {
    required(s.followup_at, { message: 'Follow-up time is required.' });
    validate(s.followup_at, ({ value }) => {
      if (!isValidIstDateTimeValue(value())) {
        return { kind: 'invalidDate', message: 'Enter a valid date in DD/MM/YYYY format.' };
      }
      return undefined;
    });
    required(s.channel, { message: 'Channel is required.' });
    maxLength(s.outcome, 150, { message: 'Outcome cannot exceed 150 characters.' });
    required(s.notes, { message: 'Notes are required.' });
    maxLength(s.notes, 1000, { message: 'Notes cannot exceed 1000 characters.' });
    required(s.next_followup_at, {
      message: 'Required when scheduling next follow-up.',
      when: ({ valueOf }) => valueOf(s.needs_followup),
    });
    validate(s.next_followup_at, ({ value }) => {
      if (!isValidIstDateTimeValue(value())) {
        return { kind: 'invalidDate', message: 'Enter a valid date in DD/MM/YYYY format.' };
      }
      return undefined;
    });
  });

  ngOnInit(): void {
    this.loadQueue();
  }

  setScope(s: 'all' | 'overdue' | 'today' | 'upcoming'): void {
    this.scope.set(s);
    this.loadQueue();
  }

  loadQueue(): void {
    this.loading.set(true);
    this.api.getFollowupQueue(this.scope()).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.leads.set(res.data || []);
      },
      error: (err) => {
        this.loading.set(false);
        this.notify(extractApiError(err, 'Failed to load follow-up queue.'), true);
      },
    });
  }

  toggleVisited(lead: Lead): void {
    this.api.toggleLeadVisited(lead.id, !lead.is_visited).subscribe({
      next: (res) => {
        this.notify(res.message || 'Visited status updated.', false);
        this.loadQueue();
      },
      error: (err) => this.notify(extractApiError(err, 'Failed to update visited status.'), true),
    });
  }

  openLogModal(lead: Lead): void {
    this.selectedLead.set(lead);
    this.modalError.set('');
    this.followupModel.set({
      followup_at: nowIstDateTimeLocal(),
      channel: 'Call',
      outcome: '',
      notes: '',
      marked_visited: !!lead.is_visited,
      needs_followup: true,
      next_followup_at: '',
      status: lead.status === 'New' ? 'Contacted' : lead.status,
    });
    this.followupForm().reset();
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  submitFollowup(): void {
    if (!this.selectedLead()) return;
    submit(this.followupForm, async () => {
      this.saving.set(true);
      this.modalError.set('');
      const v = this.followupModel();
      try {
        await firstValueFrom(
          this.api.addFollowup(this.selectedLead()!.id, {
            followup_at: v.followup_at,
            channel: v.channel,
            outcome: v.outcome.trim() || null,
            notes: v.notes.trim(),
            next_followup_at: v.next_followup_at || null,
            needs_followup: !!v.needs_followup,
            marked_visited: !!v.marked_visited,
            status: v.status || undefined,
          })
        );
        this.saving.set(false);
        this.showModal.set(false);
        this.notify('Follow-up logged successfully.', false);
        this.loadQueue();
      } catch (err) {
        this.saving.set(false);
        this.modalError.set(extractApiError(err, 'Failed to log follow-up.'));
      }
    });
  }

  isOverdue(lead: Lead): boolean {
    if (!lead.next_followup_at) return false;
    const d = new Date(lead.next_followup_at.replace(' ', 'T'));
    return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
  }

  formatDt = formatIstDateTime;
  formatBudget = formatBudgetRange;

  getWhatsAppUrl(phone: string, leadName: string): string {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const defaultMsg = encodeURIComponent(
      `Hello ${leadName}, following up on your property inquiry. Please let me know when we can connect.`
    );
    return `https://wa.me/${cleanPhone}?text=${defaultMsg}`;
  }

  getTempIcon(t: LeadTemperature): string {
    switch (t) {
      case 'Hot': return '🔥';
      case 'Warm': return '☀️';
      case 'Cold': return '❄️';
      default: return '☀️';
    }
  }

  getTempClass(t: LeadTemperature): string {
    switch (t) {
      case 'Hot': return 'temp-hot';
      case 'Warm': return 'temp-warm';
      case 'Cold': return 'temp-cold';
      default: return 'temp-warm';
    }
  }

  private notify(msg: string, error: boolean): void {
    this.feedback.set(msg);
    this.isError.set(error);
  }
}
