import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { form, FormField, required, email, minLength, maxLength, validate, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { extractApiError } from '../../core/api-error';
import { User } from '../../core/models';
import { formatIstDateTime, handlePhoneKeydown } from '../../core/validators';

interface AgentFormData {
  name: string;
  email: string;
  password: string;
  mobile_number: string;
  alt_number: string;
  address: string;
  date_of_joining: string;
  avatar_url: string;
  is_active: boolean;
}

@Component({
  selector: 'app-agents',
  standalone: true,
  imports: [CommonModule, FormsModule, FormField],
  template: `
    <div class="page-header">
      <div>
        <h2 class="page-title">Agent Management</h2>
        <p class="page-subtitle">Create and manage sales agents, assign leads, track team performance</p>
      </div>
      @if (auth.isAdmin()) {
        <button class="btn btn-primary" (click)="openCreateModal()">+ Add Agent</button>
      }
    </div>

    @if (feedback()) {
      <div class="alert" [class.alert-success]="!isError()" [class.alert-error]="isError()">
        {{ feedback() }}
      </div>
    }

    @if (loading()) {
      <div class="card" style="padding: 24px; text-align: center;">
        <p class="page-subtitle">Loading agent team...</p>
      </div>
    } @else if (agents().length === 0) {
      <div class="card">
        <div class="empty-state">No agents registered yet. Click "+ Add Agent" to onboard your first team member.</div>
      </div>
    } @else {
      <!-- Desktop Agents Table -->
      <div class="card desktop-only">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent Profile</th>
                <th>Contact Details</th>
                <th>Joining & Address</th>
                <th>Performance</th>
                <th>Status</th>
                <th style="width: 170px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (agent of agents(); track agent.id) {
                <tr>
                  <td>
                    <div class="agent-profile-cell">
                      @if (agent.avatar_url) {
                        <img [src]="'/' + agent.avatar_url" alt="{{ agent.name }}" class="agent-avatar-img" />
                      } @else {
                        <div class="agent-avatar-placeholder">{{ getInitials(agent.name) }}</div>
                      }
                      <div>
                        <div style="font-weight: 700; font-size: 15px;">{{ agent.name }}</div>
                        <div class="page-subtitle">{{ agent.email }}</div>
                        <span class="role-badge">{{ agent.role | uppercase }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    @if (agent.mobile_number) {
                      <div style="display:flex; align-items:center; gap:6px;">
                        <a class="phone-link" [href]="'tel:' + agent.mobile_number">📞 {{ agent.mobile_number }}</a>
                        <a
                          [href]="getWhatsAppUrl(agent.mobile_number, agent.name)"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="btn-mini btn-whatsapp"
                          title="WhatsApp Agent"
                        >💬</a>
                      </div>
                    } @else {
                      <span class="page-subtitle">No mobile</span>
                    }
                    @if (agent.alt_number) {
                      <div class="page-subtitle" style="margin-top: 3px;">Alt: {{ agent.alt_number }}</div>
                    }
                  </td>
                  <td>
                    <div style="font-weight: 600;">
                      📅 {{ agent.date_of_joining ? formatDate(agent.date_of_joining) : 'Not specified' }}
                    </div>
                    @if (agent.address) {
                      <div class="page-subtitle" style="max-width: 200px; margin-top: 3px;">
                        📍 {{ agent.address }}
                      </div>
                    }
                  </td>
                  <td>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <span class="badge badge-slate">{{ agent.assigned_leads_count ?? 0 }} Leads Assigned</span>
                      <div style="display:flex; gap:4px;">
                        <span class="pill pill-warm">🔥 {{ agent.hot_leads_count ?? 0 }} Hot</span>
                        <span class="pill pill-success">✓ {{ agent.won_leads_count ?? 0 }} Won</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="badge" [class.badge-emerald]="agent.is_active" [class.badge-red]="!agent.is_active">
                      {{ agent.is_active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <button class="btn btn-secondary btn-sm" (click)="openEditModal(agent)">Edit</button>
                      @if (auth.isAdmin()) {
                        <button class="btn btn-danger btn-sm" (click)="deleteAgent(agent)">Delete</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mobile Agents Card List -->
      <div class="mobile-only">
        <div class="mobile-card-list">
          @for (agent of agents(); track agent.id) {
            <article class="mobile-card">
              <div class="mobile-card-head">
                <div class="agent-profile-cell">
                  @if (agent.avatar_url) {
                    <img [src]="'/' + agent.avatar_url" alt="{{ agent.name }}" class="agent-avatar-img" />
                  } @else {
                    <div class="agent-avatar-placeholder">{{ getInitials(agent.name) }}</div>
                  }
                  <div>
                    <div style="font-weight: 700; font-size: 15.5px;">{{ agent.name }}</div>
                    <div class="page-subtitle">{{ agent.email }}</div>
                  </div>
                </div>
                <span class="badge" [class.badge-emerald]="agent.is_active" [class.badge-red]="!agent.is_active">
                  {{ agent.is_active ? 'Active' : 'Inactive' }}
                </span>
              </div>

              <div class="mobile-card-meta">
                <div>
                  <span class="mobile-meta-label">Mobile</span>
                  @if (agent.mobile_number) {
                    <a class="phone-link" [href]="'tel:' + agent.mobile_number">{{ agent.mobile_number }}</a>
                  } @else {
                    <span>—</span>
                  }
                </div>
                <div>
                  <span class="mobile-meta-label">Date of Joining</span>
                  <strong>{{ agent.date_of_joining ? formatDate(agent.date_of_joining) : '—' }}</strong>
                </div>
                <div>
                  <span class="mobile-meta-label">Assigned Work</span>
                  <span>{{ agent.assigned_leads_count ?? 0 }} Leads ({{ agent.hot_leads_count ?? 0 }} Hot)</span>
                </div>
                <div>
                  <span class="mobile-meta-label">Deals Won</span>
                  <strong class="text-emerald">{{ agent.won_leads_count ?? 0 }}</strong>
                </div>
                @if (agent.address) {
                  <div style="grid-column: 1 / -1;">
                    <span class="mobile-meta-label">Address</span>
                    <span>{{ agent.address }}</span>
                  </div>
                }
              </div>

              <div class="mobile-card-actions">
                @if (agent.mobile_number) {
                  <a [href]="'tel:' + agent.mobile_number" class="btn btn-secondary btn-sm" style="flex:1; text-align:center;">📞 Call</a>
                  <a [href]="getWhatsAppUrl(agent.mobile_number, agent.name)" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-whatsapp" style="flex:1; text-align:center;">💬 WhatsApp</a>
                }
                <button class="btn btn-secondary btn-sm" (click)="openEditModal(agent)">Edit</button>
                @if (auth.isAdmin()) {
                  <button class="btn btn-danger btn-sm" (click)="deleteAgent(agent)">Delete</button>
                }
              </div>
            </article>
          }
        </div>
      </div>
    }

    <!-- Add/Edit Agent Modal -->
    @if (modalOpen()) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingAgentId() ? 'Edit Agent Details' : 'Onboard New Agent' }}</h3>
            <button type="button" class="btn btn-secondary btn-sm" (click)="closeModal()">✕</button>
          </div>

          <form (submit)="saveAgent($event)" novalidate>
            <div class="modal-body">
              <!-- Avatar Upload Row -->
              <div class="avatar-upload-row" style="margin-bottom: 16px;">
                <div class="avatar-preview-box">
                  @if (avatarPreview()) {
                    <img [src]="avatarPreview()" alt="Avatar preview" class="avatar-preview-img" />
                  } @else {
                    <div class="avatar-preview-placeholder">👤</div>
                  }
                </div>
                <div style="flex: 1;">
                  <label>Profile Photo (Max 1 MB)</label>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    (change)="onFileSelected($event)"
                    style="margin-top: 6px;"
                  />
                  <div class="field-hint" style="margin-top: 4px;">Lightweight JPG, PNG, or WebP.</div>
                </div>
              </div>

              <div class="form-grid">
                <div class="form-group">
                  <label>Full Name <span class="req">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    [formField]="agentForm.name"
                  />
                  @if (agentForm.name().touched() && agentForm.name().errors().length) {
                    <span class="field-error">{{ agentForm.name().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Email (Login ID) <span class="req">*</span></label>
                  <input
                    type="email"
                    placeholder="agent@company.com"
                    [formField]="agentForm.email"
                  />
                  @if (agentForm.email().touched() && agentForm.email().errors().length) {
                    <span class="field-error">{{ agentForm.email().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>
                    {{ editingAgentId() ? 'Reset Password (optional)' : 'Password' }}
                    @if (!editingAgentId()) {
                      <span class="req">*</span>
                    }
                  </label>
                  <input
                    type="password"
                    placeholder="{{ editingAgentId() ? 'Leave blank to keep current' : 'Min 6 characters' }}"
                    [formField]="agentForm.password"
                  />
                  @if (agentForm.password().touched() && agentForm.password().errors().length) {
                    <span class="field-error">{{ agentForm.password().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Date of Joining (DD/MM/YYYY)</label>
                  <input
                    type="date"
                    [formField]="agentForm.date_of_joining"
                  />
                </div>

                <div class="form-group">
                  <label>Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 9876543210"
                    [formField]="agentForm.mobile_number"
                    (keydown)="onPhoneKey($event)"
                  />
                  @if (agentForm.mobile_number().touched() && agentForm.mobile_number().errors().length) {
                    <span class="field-error">{{ agentForm.mobile_number().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Alternate Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 011-23456789"
                    [formField]="agentForm.alt_number"
                    (keydown)="onPhoneKey($event)"
                  />
                  @if (agentForm.alt_number().touched() && agentForm.alt_number().errors().length) {
                    <span class="field-error">{{ agentForm.alt_number().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group full">
                  <label>Address</label>
                  <textarea
                    rows="2"
                    placeholder="Residential or office address..."
                    [formField]="agentForm.address"
                  ></textarea>
                  @if (agentForm.address().touched() && agentForm.address().errors().length) {
                    <span class="field-error">{{ agentForm.address().errors()[0].message }}</span>
                  }
                </div>

                @if (auth.isAdmin()) {
                  <div class="form-group full">
                    <label class="checkbox-row">
                      <input
                        type="checkbox"
                        [formField]="agentForm.is_active"
                      />
                      <span>Active Account (Can log in and receive leads)</span>
                    </label>
                  </div>
                }
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="submitting()">
                {{ submitting() ? 'Saving...' : editingAgentId() ? 'Update Agent' : 'Create Agent' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .agent-profile-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .agent-avatar-img {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #e2e8f0;
    }
    .agent-avatar-placeholder {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #1e293b;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .role-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      background: #e2e8f0;
      color: #475569;
      padding: 1px 6px;
      border-radius: 4px;
      margin-top: 3px;
    }
    .btn-mini {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 13px;
    }
    .btn-whatsapp {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .btn-whatsapp:hover { background: #bbf7d0; }
    .badge-emerald { background: #dcfce7; color: #166534; font-weight: 600; }

    .pill {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }
    .pill-success { background: #dcfce7; color: #166534; }
    .pill-warm { background: #fee2e2; color: #991b1b; }

    .avatar-upload-row {
      display: flex;
      align-items: center;
      gap: 14px;
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      border: 1px dashed #cbd5e1;
    }
    .avatar-preview-box {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      overflow: hidden;
      background: #ffffff;
      border: 2px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .avatar-preview-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .avatar-preview-placeholder {
      font-size: 24px;
      color: #94a3b8;
    }
  `],
})
export class AgentsComponent implements OnInit {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly agents = signal<User[]>([]);
  readonly loading = signal<boolean>(false);
  readonly submitting = signal<boolean>(false);
  readonly feedback = signal<string | null>(null);
  readonly isError = signal<boolean>(false);

  readonly modalOpen = signal<boolean>(false);
  readonly editingAgentId = signal<number | null>(null);
  readonly avatarPreview = signal<string | null>(null);
  private selectedAvatarFile: File | null = null;

  readonly agentModel = signal<AgentFormData>({
    name: '',
    email: '',
    password: '',
    mobile_number: '',
    alt_number: '',
    address: '',
    date_of_joining: '',
    avatar_url: '',
    is_active: true,
  });

  readonly agentForm = form(this.agentModel, (s) => {
    required(s.name, { message: 'Full name is required.' });
    minLength(s.name, 2, { message: 'Name must be at least 2 characters.' });
    maxLength(s.name, 100, { message: 'Name cannot exceed 100 characters.' });

    required(s.email, { message: 'Email is required.' });
    email(s.email, { message: 'Enter a valid email address.' });
    maxLength(s.email, 150, { message: 'Email cannot exceed 150 characters.' });

    validate(s.password, ({ value }) => {
      const v = value();
      if (!this.editingAgentId() && (!v || v.trim().length < 6)) {
        return { kind: 'minLength', message: 'Password must be at least 6 characters.' };
      }
      if (v && v.length > 255) {
        return { kind: 'maxLength', message: 'Password cannot exceed 255 characters.' };
      }
      return undefined;
    });

    maxLength(s.mobile_number, 30, { message: 'Mobile number cannot exceed 30 characters.' });
    validate(s.mobile_number, ({ value }) => {
      const v = value();
      if (v && v.trim() !== '' && !/^[0-9+\-\s()]{7,20}$/.test(v.trim())) {
        return { kind: 'pattern', message: 'Enter a valid 7–20 digit mobile number.' };
      }
      return undefined;
    });

    maxLength(s.alt_number, 30, { message: 'Alternate number cannot exceed 30 characters.' });
    validate(s.alt_number, ({ value }) => {
      const v = value();
      if (v && v.trim() !== '' && !/^[0-9+\-\s()]{7,20}$/.test(v.trim())) {
        return { kind: 'pattern', message: 'Enter a valid 7–20 digit alternate number.' };
      }
      return undefined;
    });

    maxLength(s.address, 500, { message: 'Address cannot exceed 500 characters.' });
  });

  onPhoneKey(event: KeyboardEvent): void {
    handlePhoneKeydown(event);
  }

  ngOnInit(): void {
    this.loadAgents();
  }

  async loadAgents(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.getAgents());
      if (res.success && res.data) {
        this.agents.set(res.data);
      }
    } catch (err) {
      this.showMessage(extractApiError(err, 'Failed to load agents.'), true);
    } finally {
      this.loading.set(false);
    }
  }

  openCreateModal(): void {
    this.editingAgentId.set(null);
    this.selectedAvatarFile = null;
    this.avatarPreview.set(null);
    this.agentModel.set({
      name: '',
      email: '',
      password: '',
      mobile_number: '',
      alt_number: '',
      address: '',
      date_of_joining: new Date().toISOString().substring(0, 10),
      avatar_url: '',
      is_active: true,
    });
    this.modalOpen.set(true);
  }

  openEditModal(agent: User): void {
    this.editingAgentId.set(agent.id);
    this.selectedAvatarFile = null;
    this.avatarPreview.set(agent.avatar_url ? '/' + agent.avatar_url : null);
    this.agentModel.set({
      name: agent.name,
      email: agent.email,
      password: '',
      mobile_number: agent.mobile_number || '',
      alt_number: agent.alt_number || '',
      address: agent.address || '',
      date_of_joining: agent.date_of_joining ? agent.date_of_joining.substring(0, 10) : '',
      avatar_url: agent.avatar_url || '',
      is_active: Boolean(agent.is_active),
    });
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.selectedAvatarFile = null;
    this.avatarPreview.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 1024 * 1024) {
        alert('File size exceeds 1 MB limit. Please select a smaller photo.');
        input.value = '';
        return;
      }
      this.selectedAvatarFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.avatarPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async saveAgent(event: Event): Promise<void> {
    event.preventDefault();
    submit(this.agentForm);

    const values = this.agentModel();
    if (!values.name || !values.email) {
      return;
    }
    if (!this.editingAgentId() && (!values.password || values.password.length < 6)) {
      alert('Password is required (minimum 6 characters).');
      return;
    }

    this.submitting.set(true);
    try {
      let avatarPath = values.avatar_url;
      if (this.selectedAvatarFile) {
        const uploadRes = await firstValueFrom(this.api.uploadAvatar(this.selectedAvatarFile));
        if (uploadRes.success && uploadRes.data?.url) {
          avatarPath = uploadRes.data.url;
        }
      }

      const payload: Partial<User> & { password?: string } = {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        mobile_number: values.mobile_number.trim() || null,
        alt_number: values.alt_number.trim() || null,
        address: values.address.trim() || null,
        date_of_joining: values.date_of_joining || null,
        avatar_url: avatarPath || null,
        is_active: values.is_active ? 1 : 0,
      };
      if (values.password.trim() !== '') {
        payload.password = values.password.trim();
      }

      if (this.editingAgentId()) {
        const res = await firstValueFrom(this.api.updateAgent(this.editingAgentId()!, payload));
        this.showMessage(res.message || 'Agent updated successfully.', false);
      } else {
        const res = await firstValueFrom(this.api.createAgent(payload));
        this.showMessage(res.message || 'Agent created successfully.', false);
      }

      this.closeModal();
      await this.loadAgents();
    } catch (err) {
      alert(extractApiError(err, 'Failed to save agent.'));
    } finally {
      this.submitting.set(false);
    }
  }

  async deleteAgent(agent: User): Promise<void> {
    if (!confirm(`Are you sure you want to delete agent "${agent.name}"? Assigned leads will be set to unassigned.`)) {
      return;
    }
    try {
      const res = await firstValueFrom(this.api.deleteAgent(agent.id));
      this.showMessage(res.message || 'Agent deleted.', false);
      await this.loadAgents();
    } catch (err) {
      this.showMessage(extractApiError(err, 'Failed to delete agent.'), true);
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (y && m && d) {
      return `${d}/${m}/${y}`;
    }
    return dateStr;
  }

  getWhatsAppUrl(phone: string, name: string): string {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(`Hi ${name}, checking in on property leads.`);
    return `https://wa.me/${cleanPhone}?text=${msg}`;
  }

  getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name[0] || 'A').toUpperCase();
  }

  private showMessage(msg: string, isErr: boolean): void {
    this.feedback.set(msg);
    this.isError.set(isErr);
    setTimeout(() => {
      if (this.feedback() === msg) {
        this.feedback.set(null);
      }
    }, 4500);
  }
}
