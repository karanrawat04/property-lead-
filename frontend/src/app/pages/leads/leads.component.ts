import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  disabled,
  email,
  form,
  FormField,
  maxLength,
  minLength,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { extractApiError } from '../../core/api-error';
import { InventoryItem, Lead, LeadStatus } from '../../core/models';
import { IstDatetimeField } from '../../shared/ist-datetime-field/ist-datetime-field';
import { LeadSourceBadge } from '../../shared/lead-source/lead-source-badge';
import { LeadSourceSelect } from '../../shared/lead-source/lead-source-select';
import {
  formatBudgetRange,
  formatIstDateTime,
  isBudgetRangeValid,
  isValidIstDateTimeValue,
  nowIstDateTimeLocal,
  parseOptionalNonNegativeNumber,
  toDateTimeLocalValue,
} from '../../core/validators';

@Component({
  selector: 'app-leads',
  imports: [CommonModule, FormsModule, FormField, IstDatetimeField, LeadSourceBadge, LeadSourceSelect],
  template: `
    <div class="page-header">
      <div>
        <h2 class="page-title">Leads Management</h2>
        <p class="page-subtitle">Add, update, track site visits, budgets, and schedule follow-ups</p>
      </div>
      <button class="btn btn-primary" (click)="openCreate()">+ Add Lead</button>
    </div>

    @if (feedback()) {
      <div class="alert" [class.alert-success]="!isError()" [class.alert-error]="isError()">
        {{ feedback() }}
      </div>
    }

    <div class="card" style="margin-bottom: 16px;">
      <div class="toolbar" style="margin-bottom: 0;">
        <input
          type="text"
          class="toolbar-input"
          placeholder="Search name, phone, email, location..."
          [ngModel]="filterSearch()"
          (ngModelChange)="filterSearch.set($event)"
          (keyup.enter)="loadLeads()"
        />
        <select class="toolbar-select" [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event); loadLeads()">
          <option value="">All Statuses</option>
          @for (s of statuses; track s) {
            <option [value]="s">{{ s }}</option>
          }
        </select>
        <select class="toolbar-select" [ngModel]="filterVisited()" (ngModelChange)="filterVisited.set($event); loadLeads()">
          <option value="">Visited: All</option>
          <option value="1">Visited Only</option>
          <option value="0">Not Visited</option>
        </select>
        <select class="toolbar-select" [ngModel]="filterFollowupScope()" (ngModelChange)="filterFollowupScope.set($event); loadLeads()">
          <option value="">Follow-up: All</option>
          <option value="overdue">Overdue Follow-ups</option>
          <option value="today">Due Today</option>
          <option value="due">Overdue + Today</option>
          <option value="upcoming">Upcoming</option>
        </select>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" (click)="loadLeads()">Filter</button>
          <button class="btn btn-secondary" (click)="resetFilters()">Reset</button>
        </div>
      </div>
    </div>

    @if (loading()) {
      <div class="card"><p class="page-subtitle">Loading leads...</p></div>
    } @else if (leads().length === 0) {
      <div class="card"><div class="empty-state">No leads matched your filters. Click "+ Add Lead" to create one.</div></div>
    } @else {
      <div class="card desktop-only">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lead Contact</th>
                <th>Budget & Requirement</th>
                <th>Visited</th>
                <th>Follow-up</th>
                <th>Status</th>
                <th style="width: 220px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (lead of leads(); track lead.id) {
                <tr>
                  <td>
                    <div style="font-weight: 700;">{{ lead.full_name }}</div>
                    <div><a class="phone-link" [href]="'tel:' + lead.phone">{{ lead.phone }}</a></div>
                    @if (lead.email) {
                      <div class="page-subtitle">{{ lead.email }}</div>
                    }
                    @if (lead.source) {
                      <div style="margin-top: 5px;">
                        <app-lead-source-badge [source]="lead.source" />
                      </div>
                    }
                  </td>
                  <td>
                    <div style="font-weight: 600;">{{ formatBudget(lead.budget_min, lead.budget_max) }}</div>
                    @if (lead.property_requirement || lead.preferred_location) {
                      <div class="page-subtitle">
                        {{ lead.property_requirement || '' }}
                        {{ lead.property_requirement && lead.preferred_location ? ' · ' : '' }}
                        {{ lead.preferred_location || '' }}
                      </div>
                    }
                    @if (lead.inv_unit_number) {
                      <div style="margin-top: 4px;">
                        <span class="mono-code">{{ lead.inv_unique_code }}</span>
                        <span style="margin-left: 5px; font-size: 12.5px;">
                          Unit {{ lead.inv_unit_number }} — {{ lead.inv_title }}
                        </span>
                      </div>
                    }
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-sm"
                      [class.btn-success]="lead.is_visited"
                      [class.btn-secondary]="!lead.is_visited"
                      (click)="toggleVisited(lead)"
                      title="Click to toggle visited status"
                    >
                      {{ lead.is_visited ? '✓ Visited' : 'Mark Visited' }}
                    </button>
                    @if (lead.is_visited && lead.visited_at) {
                      <div class="page-subtitle" style="margin-top: 4px;">{{ formatDt(lead.visited_at) }}</div>
                    }
                  </td>
                  <td>
                    @if (lead.needs_followup) {
                      <span class="badge" [class.badge-red]="isOverdue(lead)" [class.badge-amber]="!isOverdue(lead)">
                        {{ isOverdue(lead) ? 'Overdue' : 'Follow-up Needed' }}
                      </span>
                      <div style="font-size: 12.5px; margin-top: 4px; font-weight: 600;">
                        {{ formatDt(lead.next_followup_at) }}
                      </div>
                    } @else {
                      <span class="badge badge-slate">No Follow-up</span>
                    }
                    <div class="page-subtitle" style="margin-top: 3px;">
                      Logs: {{ lead.followup_count ?? 0 }}
                    </div>
                  </td>
                  <td>
                    <span class="badge" [ngClass]="statusBadgeClass(lead.status)">{{ lead.status }}</span>
                  </td>
                  <td>
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">
                      <button class="btn btn-primary btn-sm" (click)="openFollowupModal(lead)">Follow-up</button>
                      <button class="btn btn-secondary btn-sm" (click)="openEdit(lead)">Edit</button>
                      <button class="btn btn-danger btn-sm" (click)="deleteLead(lead)">Delete</button>
                    </div>
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
                  <a class="phone-link" [href]="'tel:' + lead.phone">{{ lead.phone }}</a>
                  @if (lead.email) {
                    <div class="page-subtitle">{{ lead.email }}</div>
                  }
                  @if (lead.source) {
                    <div style="margin-top: 5px;">
                      <app-lead-source-badge [source]="lead.source" />
                    </div>
                  }
                </div>
                <span class="badge" [ngClass]="statusBadgeClass(lead.status)">{{ lead.status }}</span>
              </div>

              <div class="mobile-card-meta">
                <div>
                  <span class="mobile-meta-label">Budget</span>
                  <strong>{{ formatBudget(lead.budget_min, lead.budget_max) }}</strong>
                </div>
                <div>
                  <span class="mobile-meta-label">Follow-up ({{ lead.followup_count ?? 0 }})</span>
                  @if (lead.needs_followup) {
                    <span class="badge" [class.badge-red]="isOverdue(lead)" [class.badge-amber]="!isOverdue(lead)">
                      {{ isOverdue(lead) ? 'Overdue' : 'Scheduled' }}
                    </span>
                    <div style="font-size: 12px; margin-top: 2px;">{{ formatDt(lead.next_followup_at) }}</div>
                  } @else {
                    <span>None</span>
                  }
                </div>
                @if (lead.property_requirement || lead.preferred_location) {
                  <div style="grid-column: 1 / -1;">
                    <span class="mobile-meta-label">Requirement</span>
                    <span>
                      {{ lead.property_requirement || '' }}
                      {{ lead.property_requirement && lead.preferred_location ? ' · ' : '' }}
                      {{ lead.preferred_location || '' }}
                    </span>
                  </div>
                }
                @if (lead.inv_unit_number) {
                  <div style="grid-column: 1 / -1;">
                    <span class="mobile-meta-label">Interested Unit</span>
                    <span class="mono-code">{{ lead.inv_unique_code }}</span>
                    <span style="margin-left: 6px;">Unit {{ lead.inv_unit_number }} — {{ lead.inv_title }}</span>
                  </div>
                }
              </div>

              <div class="mobile-card-actions">
                <button
                  type="button"
                  class="btn btn-sm"
                  [class.btn-success]="lead.is_visited"
                  [class.btn-secondary]="!lead.is_visited"
                  (click)="toggleVisited(lead)"
                >
                  {{ lead.is_visited ? '✓ Visited' : 'Mark Visited' }}
                </button>
                <button class="btn btn-primary btn-sm" (click)="openFollowupModal(lead)">Follow-up</button>
                <button class="btn btn-secondary btn-sm" (click)="openEdit(lead)">Edit</button>
                <button class="btn btn-danger btn-sm" (click)="deleteLead(lead)">Delete</button>
              </div>
            </article>
          }
        </div>
      </div>
    }

    <!-- Add / Edit Lead Modal -->
    @if (showLeadModal()) {
      <div class="modal-backdrop" (click)="closeLeadModal()">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingLeadId() ? 'Edit Lead' : 'Add New Lead' }}</h3>
            <button class="btn btn-secondary btn-sm" (click)="closeLeadModal()">✕</button>
          </div>
          <form (submit)="saveLead(); $event.preventDefault()" novalidate>
            <div class="modal-body">
              @if (modalError()) {
                <div class="alert alert-error">{{ modalError() }}</div>
              }
              <div class="form-grid">
                <div class="form-group">
                  <label>Full Name <span class="req">*</span></label>
                  <input type="text" [formField]="leadForm.full_name" placeholder="Client full name" />
                  @if (leadForm.full_name().touched() && leadForm.full_name().errors().length) {
                    <span class="field-error">{{ leadForm.full_name().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Phone Number <span class="req">*</span></label>
                  <input type="text" [formField]="leadForm.phone" placeholder="e.g. +91 9876543210" />
                  @if (leadForm.phone().touched() && leadForm.phone().errors().length) {
                    <span class="field-error">{{ leadForm.phone().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Email</label>
                  <input type="email" [formField]="leadForm.email" placeholder="client@example.com" />
                  @if (leadForm.email().touched() && leadForm.email().errors().length) {
                    <span class="field-error">{{ leadForm.email().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Lead Source</label>
                  <app-lead-source-select [formField]="leadForm.source" />
                </div>

                <div class="form-group">
                  <label>Budget Min (INR)</label>
                  <input type="text" inputmode="decimal" [formField]="leadForm.budget_min" placeholder="e.g. 4000000" />
                  @if (leadForm.budget_min().touched() && leadForm.budget_min().errors().length) {
                    <span class="field-error">{{ leadForm.budget_min().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Budget Max (INR)</label>
                  <input type="text" inputmode="decimal" [formField]="leadForm.budget_max" placeholder="e.g. 7500000" />
                  @if ((leadForm.budget_max().touched() || leadForm.budget_min().touched()) && leadForm.budget_max().errors().length) {
                    <span class="field-error">{{ leadForm.budget_max().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Requirement</label>
                  <input type="text" [formField]="leadForm.property_requirement" placeholder="e.g. 3 BHK Flat, Commercial Shop" />
                </div>

                <div class="form-group">
                  <label>Preferred Location</label>
                  <input type="text" [formField]="leadForm.preferred_location" placeholder="e.g. Sector 45, Noida" />
                </div>

                <div class="form-group">
                  <label>Interested Inventory Unit</label>
                  <select [formField]="leadForm.interested_inventory_id">
                    <option value="">— None Selected —</option>
                    @for (inv of inventory(); track inv.id) {
                      <option [value]="inv.id">
                        {{ inv.unique_code }} · Unit {{ inv.unit_number }} ({{ inv.title }})
                        {{ inv.tag_name ? '[' + inv.tag_name + ']' : '' }}
                      </option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label>Status</label>
                  <select [formField]="leadForm.status">
                    @for (s of statuses; track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label class="checkbox-row" style="margin-top: 8px;">
                    <input type="checkbox" [formField]="leadForm.is_visited" (change)="onVisitedCheckboxChange()" />
                    Lead has visited site
                  </label>
                </div>

                <div class="form-group">
                  <label>Visited Date & Time (DD/MM/YYYY · 24h IST)</label>
                  <app-ist-datetime-field [formField]="leadForm.visited_at" />
                  @if (leadForm.visited_at().touched() && leadForm.visited_at().errors().length) {
                    <span class="field-error">{{ leadForm.visited_at().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label class="checkbox-row" style="margin-top: 8px;">
                    <input type="checkbox" [formField]="leadForm.needs_followup" />
                    Have to take follow-up (Reminder enabled)
                  </label>
                </div>

                <div class="form-group">
                  <label>
                    Next Follow-up Date & Time (DD/MM/YYYY · 24h IST)
                    @if (leadModel().needs_followup) {
                      <span class="req">*</span>
                    }
                  </label>
                  <app-ist-datetime-field [formField]="leadForm.next_followup_at" />
                  @if ((leadForm.next_followup_at().touched() || leadForm.needs_followup().touched()) && leadForm.next_followup_at().errors().length) {
                    <span class="field-error">{{ leadForm.next_followup_at().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group full">
                  <label>Lead Notes</label>
                  <textarea rows="3" [formField]="leadForm.notes" placeholder="Client preferences, call summary, special notes..."></textarea>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeLeadModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="savingLead()">
                {{ savingLead() ? 'Saving...' : 'Save Lead' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Follow-up Log & Timeline Modal -->
    @if (showFollowupModal() && activeLead()) {
      <div class="modal-backdrop" (click)="closeFollowupModal()">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3>Follow-ups · {{ activeLead()!.full_name }}</h3>
              <div class="page-subtitle">{{ activeLead()!.phone }} · Budget: {{ formatBudget(activeLead()!.budget_min, activeLead()!.budget_max) }}</div>
            </div>
            <button class="btn btn-secondary btn-sm" (click)="closeFollowupModal()">✕</button>
          </div>
          <div class="modal-body">
            @if (followupError()) {
              <div class="alert alert-error">{{ followupError() }}</div>
            }

            <form (submit)="saveFollowup(); $event.preventDefault()" novalidate style="margin-bottom: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border);">
              <h4 style="margin: 0 0 12px; font-size: 14.5px;">Log New Follow-up</h4>
              <div class="form-grid">
                <div class="form-group">
                  <label>Follow-up Date & Time (DD/MM/YYYY · 24h IST) <span class="req">*</span></label>
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
                  <input type="text" [formField]="followupForm.outcome" placeholder="e.g. Interested, Requested brochure" />
                </div>
                <div class="form-group">
                  <label>Update Lead Status</label>
                  <select [formField]="followupForm.status">
                    @for (s of statuses; track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                  </select>
                </div>
                <div class="form-group full">
                  <label>Discussion / Follow-up Notes <span class="req">*</span></label>
                  <textarea rows="2" [formField]="followupForm.notes" placeholder="What was discussed?"></textarea>
                  @if (followupForm.notes().touched() && followupForm.notes().errors().length) {
                    <span class="field-error">{{ followupForm.notes().errors()[0].message }}</span>
                  }
                </div>
                <div class="form-group">
                  <label class="checkbox-row">
                    <input type="checkbox" [formField]="followupForm.marked_visited" />
                    Mark lead as Visited
                  </label>
                  <label class="checkbox-row" style="margin-top: 8px;">
                    <input type="checkbox" [formField]="followupForm.needs_followup" />
                    Have to take next follow-up
                  </label>
                </div>
                <div class="form-group">
                  <label>
                    Next Follow-up Date & Time (DD/MM/YYYY · 24h IST)
                    @if (followupModel().needs_followup) {
                      <span class="req">*</span>
                    }
                  </label>
                  <app-ist-datetime-field [formField]="followupForm.next_followup_at" />
                  @if ((followupForm.next_followup_at().touched() || followupForm.needs_followup().touched()) && followupForm.next_followup_at().errors().length) {
                    <span class="field-error">{{ followupForm.next_followup_at().errors()[0].message }}</span>
                  }
                </div>
              </div>
              <div style="margin-top: 12px; display:flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-primary" [disabled]="savingFollowup()">
                  {{ savingFollowup() ? 'Logging...' : 'Save Follow-up' }}
                </button>
              </div>
            </form>

            <h4 style="margin: 0 0 10px; font-size: 14.5px;">Follow-up History</h4>
            @if (loadingDetail()) {
              <p class="page-subtitle">Loading timeline...</p>
            } @else if ((activeLead()!.followups?.length || 0) === 0) {
              <p class="page-subtitle">No follow-ups logged yet for this lead.</p>
            } @else {
              <div class="timeline">
                @for (f of activeLead()!.followups!; track f.id) {
                  <div class="timeline-item">
                    <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
                      <div>
                        <span class="badge badge-blue">{{ f.channel }}</span>
                        @if (f.marked_visited) {
                          <span class="badge badge-green" style="margin-left:6px;">Site Visited</span>
                        }
                        @if (f.outcome) {
                          <strong style="margin-left:8px;">{{ f.outcome }}</strong>
                        }
                      </div>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span class="page-subtitle">{{ formatDt(f.followup_at) }}</span>
                        <button class="btn btn-danger btn-sm" (click)="deleteFollowup(f.id)">✕</button>
                      </div>
                    </div>
                    <p style="margin:6px 0 4px;">{{ f.notes }}</p>
                    @if (f.next_followup_at) {
                      <div class="page-subtitle">Next scheduled: {{ formatDt(f.next_followup_at) }}</div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .timeline-item {
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface-alt);
    }
  `,
})
export class LeadsComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly leads = signal<Lead[]>([]);
  protected readonly inventory = signal<InventoryItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly feedback = signal('');
  protected readonly isError = signal(false);

  // Filters
  protected readonly filterSearch = signal('');
  protected readonly filterStatus = signal('');
  protected readonly filterVisited = signal('');
  protected readonly filterFollowupScope = signal('');

  // Lead Modal
  protected readonly showLeadModal = signal(false);
  protected readonly editingLeadId = signal<number | null>(null);
  protected readonly savingLead = signal(false);
  protected readonly modalError = signal('');

  // Followup Modal
  protected readonly showFollowupModal = signal(false);
  protected readonly activeLead = signal<Lead | null>(null);
  protected readonly loadingDetail = signal(false);
  protected readonly savingFollowup = signal(false);
  protected readonly followupError = signal('');

  protected readonly statuses: LeadStatus[] = [
    'New',
    'Contacted',
    'Visited',
    'Negotiation',
    'Closed Won',
    'Closed Lost',
  ];
  protected readonly channels = ['Call', 'WhatsApp', 'Email', 'Site Visit', 'Meeting', 'Other'];

  protected readonly leadModel = signal({
    full_name: '',
    phone: '',
    email: '',
    source: '',
    budget_min: '',
    budget_max: '',
    property_requirement: '',
    preferred_location: '',
    interested_inventory_id: '',
    status: 'New' as LeadStatus,
    is_visited: false,
    visited_at: '',
    needs_followup: true,
    next_followup_at: '',
    notes: '',
  });

  protected readonly leadForm = form(this.leadModel, (s) => {
    required(s.full_name, { message: 'Full name is required.' });
    minLength(s.full_name, 2, { message: 'Full name must be at least 2 characters.' });
    maxLength(s.full_name, 120, { message: 'Full name cannot exceed 120 characters.' });

    required(s.phone, { message: 'Phone number is required.' });
    pattern(s.phone, /^[0-9+\-\s()]{7,20}$/, {
      message: 'Enter a valid 7–20 digit phone number.',
    });

    email(s.email, { message: 'Enter a valid email address.' });

    validate(s.budget_min, ({ value }) => {
      const parsed = parseOptionalNonNegativeNumber(value());
      if (Number.isNaN(parsed)) {
        return { kind: 'nonNegative', message: 'Minimum budget must be a non-negative number.' };
      }
      return undefined;
    });

    validate(s.budget_max, ({ value, valueOf }) => {
      const parsed = parseOptionalNonNegativeNumber(value());
      if (Number.isNaN(parsed)) {
        return { kind: 'nonNegative', message: 'Maximum budget must be a non-negative number.' };
      }
      if (!isBudgetRangeValid(valueOf(s.budget_min), value())) {
        return { kind: 'budgetRange', message: 'Max budget must be greater than or equal to Min budget.' };
      }
      return undefined;
    });

    disabled(s.visited_at, { when: ({ valueOf }) => !valueOf(s.is_visited) });
    validate(s.visited_at, ({ value }) => {
      if (!isValidIstDateTimeValue(value())) {
        return { kind: 'invalidDate', message: 'Enter a valid date in DD/MM/YYYY format.' };
      }
      return undefined;
    });

    required(s.next_followup_at, {
      message: 'Next follow-up date & time is required when follow-up is checked.',
      when: ({ valueOf }) => valueOf(s.needs_followup),
    });
    validate(s.next_followup_at, ({ value }) => {
      if (!isValidIstDateTimeValue(value())) {
        return { kind: 'invalidDate', message: 'Enter a valid date in DD/MM/YYYY format.' };
      }
      return undefined;
    });
  });

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
    required(s.followup_at, { message: 'Follow-up date & time is required.' });
    validate(s.followup_at, ({ value }) => {
      if (!isValidIstDateTimeValue(value())) {
        return { kind: 'invalidDate', message: 'Enter a valid date in DD/MM/YYYY format.' };
      }
      return undefined;
    });
    required(s.channel, { message: 'Channel is required.' });
    required(s.notes, { message: 'Follow-up notes are required.' });
    required(s.next_followup_at, {
      message: 'Please select the next follow-up date & time.',
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
    this.loadLeads();
    this.api.getInventory().subscribe({
      next: (res) => this.inventory.set(res.data || []),
    });
  }

  loadLeads(): void {
    this.loading.set(true);
    this.api
      .getLeads({
        search: this.filterSearch(),
        status: this.filterStatus(),
        is_visited: this.filterVisited(),
        followup_scope: this.filterFollowupScope(),
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.leads.set(res.data || []);
        },
        error: (err) => {
          this.loading.set(false);
          this.notify(extractApiError(err, 'Failed to load leads.'), true);
        },
      });
  }

  resetFilters(): void {
    this.filterSearch.set('');
    this.filterStatus.set('');
    this.filterVisited.set('');
    this.filterFollowupScope.set('');
    this.loadLeads();
  }

  openCreate(): void {
    this.editingLeadId.set(null);
    this.modalError.set('');
    this.leadModel.set({
      full_name: '',
      phone: '',
      email: '',
      source: '',
      budget_min: '',
      budget_max: '',
      property_requirement: '',
      preferred_location: '',
      interested_inventory_id: '',
      status: 'New',
      is_visited: false,
      visited_at: '',
      needs_followup: true,
      next_followup_at: nowIstDateTimeLocal(),
      notes: '',
    });
    this.leadForm().reset();
    this.showLeadModal.set(true);
  }

  openEdit(lead: Lead): void {
    this.editingLeadId.set(lead.id);
    this.modalError.set('');
    this.leadModel.set({
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email || '',
      source: lead.source || '',
      budget_min: lead.budget_min !== null && lead.budget_min !== undefined ? String(lead.budget_min) : '',
      budget_max: lead.budget_max !== null && lead.budget_max !== undefined ? String(lead.budget_max) : '',
      property_requirement: lead.property_requirement || '',
      preferred_location: lead.preferred_location || '',
      interested_inventory_id: lead.interested_inventory_id ? String(lead.interested_inventory_id) : '',
      status: lead.status,
      is_visited: !!lead.is_visited,
      visited_at: toDateTimeLocalValue(lead.visited_at),
      needs_followup: !!lead.needs_followup,
      next_followup_at: toDateTimeLocalValue(lead.next_followup_at),
      notes: lead.notes || '',
    });
    this.leadForm().reset();
    this.showLeadModal.set(true);
  }

  onVisitedCheckboxChange(): void {
    this.leadModel.update((m) => ({
      ...m,
      visited_at: m.is_visited ? (m.visited_at || nowIstDateTimeLocal()) : '',
    }));
  }

  closeLeadModal(): void {
    this.showLeadModal.set(false);
  }

  saveLead(): void {
    submit(this.leadForm, async () => {
      this.savingLead.set(true);
      this.modalError.set('');

      const v = this.leadModel();
      const payload: Partial<Lead> = {
        full_name: v.full_name.trim(),
        phone: v.phone.trim(),
        email: v.email.trim() || null,
        source: v.source || null,
        budget_min: parseOptionalNonNegativeNumber(v.budget_min),
        budget_max: parseOptionalNonNegativeNumber(v.budget_max),
        property_requirement: v.property_requirement.trim() || null,
        preferred_location: v.preferred_location.trim() || null,
        interested_inventory_id: v.interested_inventory_id ? Number(v.interested_inventory_id) : null,
        status: v.status,
        is_visited: !!v.is_visited,
        visited_at: v.is_visited && v.visited_at ? v.visited_at : null,
        needs_followup: !!v.needs_followup,
        next_followup_at: v.next_followup_at || null,
        notes: v.notes.trim() || null,
      };

      try {
        const res = this.editingLeadId()
          ? await firstValueFrom(this.api.updateLead(this.editingLeadId()!, payload))
          : await firstValueFrom(this.api.createLead(payload));
        this.savingLead.set(false);
        this.showLeadModal.set(false);
        this.notify(res.message || 'Lead saved.', false);
        this.loadLeads();
      } catch (err) {
        this.savingLead.set(false);
        this.modalError.set(extractApiError(err, 'Failed to save lead.'));
      }
    });
  }

  toggleVisited(lead: Lead): void {
    const nextVal = !lead.is_visited;
    this.api.toggleLeadVisited(lead.id, nextVal).subscribe({
      next: (res) => {
        this.notify(res.message || 'Updated visited status.', false);
        this.loadLeads();
      },
      error: (err) => this.notify(extractApiError(err, 'Failed to update visited status.'), true),
    });
  }

  deleteLead(lead: Lead): void {
    if (!confirm(`Delete lead "${lead.full_name}" and all its follow-up logs?`)) return;
    this.api.deleteLead(lead.id).subscribe({
      next: () => {
        this.notify(`Lead "${lead.full_name}" deleted.`, false);
        this.loadLeads();
      },
      error: (err) => this.notify(extractApiError(err, 'Failed to delete lead.'), true),
    });
  }

  openFollowupModal(lead: Lead): void {
    this.activeLead.set(lead);
    this.followupError.set('');
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
    this.showFollowupModal.set(true);
    this.refreshLeadDetail(lead.id);
  }

  closeFollowupModal(): void {
    this.showFollowupModal.set(false);
  }

  private refreshLeadDetail(leadId: number): void {
    this.loadingDetail.set(true);
    this.api.getLead(leadId).subscribe({
      next: (res) => {
        this.loadingDetail.set(false);
        if (res.data) {
          this.activeLead.set(res.data);
        }
      },
      error: () => this.loadingDetail.set(false),
    });
  }

  saveFollowup(): void {
    if (!this.activeLead()) return;
    submit(this.followupForm, async () => {
      this.savingFollowup.set(true);
      this.followupError.set('');
      const v = this.followupModel();
      const leadId = this.activeLead()!.id;

      try {
        await firstValueFrom(
          this.api.addFollowup(leadId, {
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
        this.savingFollowup.set(false);
        this.followupModel.update((m) => ({ ...m, outcome: '', notes: '', next_followup_at: '' }));
        this.followupForm().reset();
        this.refreshLeadDetail(leadId);
        this.loadLeads();
      } catch (err) {
        this.savingFollowup.set(false);
        this.followupError.set(extractApiError(err, 'Failed to log follow-up.'));
      }
    });
  }

  deleteFollowup(followupId: number): void {
    if (!this.activeLead() || !confirm('Delete this follow-up log entry?')) return;
    const leadId = this.activeLead()!.id;
    this.api.deleteFollowup(followupId).subscribe({
      next: () => {
        this.refreshLeadDetail(leadId);
        this.loadLeads();
      },
      error: (err) => this.followupError.set(extractApiError(err, 'Failed to delete follow-up.')),
    });
  }

  isOverdue(lead: Lead): boolean {
    if (!lead.needs_followup || !lead.next_followup_at) return false;
    if (lead.status === 'Closed Won' || lead.status === 'Closed Lost') return false;
    const d = new Date(lead.next_followup_at.replace(' ', 'T'));
    return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'Visited':
        return 'badge-green';
      case 'Negotiation':
        return 'badge-amber';
      case 'Closed Won':
        return 'badge-green';
      case 'Closed Lost':
        return 'badge-red';
      case 'Contacted':
        return 'badge-blue';
      default:
        return 'badge-slate';
    }
  }

  formatBudget = formatBudgetRange;
  formatDt = formatIstDateTime;

  private notify(msg: string, error: boolean): void {
    this.feedback.set(msg);
    this.isError.set(error);
  }
}
