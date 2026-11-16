import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { extractApiError } from '../../core/api-error';
import { DashboardStats, LeadTemperature } from '../../core/models';
import { formatIstDateTime } from '../../core/validators';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-header">
      <div>
        <h2 class="page-title">
          {{ (auth.isAdmin() || stats()?.role === 'admin') ? 'Business Dashboard' : 'Agent Work Desk' }}
        </h2>
        <p class="page-subtitle">
          {{ (auth.isAdmin() || stats()?.role === 'admin')
              ? 'Real-time pipeline overview, lead temperature, conversions, and agent assignments'
              : 'Overview of your assigned leads, priority hot deals, and scheduled follow-ups' }}
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary btn-sm" (click)="loadStats()" [disabled]="loading()">
          ↻ Refresh
        </button>
        <a routerLink="/leads" class="btn btn-primary btn-sm">+ View Leads</a>
      </div>
    </div>

    @if (error()) {
      <div class="alert alert-error" style="margin-bottom: 16px;">
        {{ error() }}
      </div>
    }

    @if (loading()) {
      <div class="card" style="padding: 24px; text-align: center;">
        <p class="page-subtitle">Loading analytics dashboard...</p>
      </div>
    } @else if (stats()) {
      <!-- KPI Top Summary Grid -->
      <div class="kpi-grid">
        <div class="kpi-card card-blue">
          <div class="kpi-label">Total Leads</div>
          <div class="kpi-value">{{ stats()!.total_leads }}</div>
          <div class="kpi-sub">
            <span class="pill pill-success">{{ stats()!.closed_won_leads }} Won ({{ stats()!.conversion_rate }}%)</span>
          </div>
        </div>

        <div class="kpi-card card-hot">
          <div class="kpi-label">🔥 Hot Leads</div>
          <div class="kpi-value text-red">{{ stats()!.hot_leads }}</div>
          <div class="kpi-sub">
            <span class="pill pill-warm">☀️ {{ stats()!.warm_leads }} Warm</span>
            <span class="pill pill-cold" style="margin-left: 4px;">❄️ {{ stats()!.cold_leads }} Cold</span>
          </div>
        </div>

        <div class="kpi-card card-visited">
          <div class="kpi-label">Site Visits Done</div>
          <div class="kpi-value text-emerald">{{ stats()!.visited_leads }}</div>
          <div class="kpi-sub">
            {{ getVisitPercentage() }}% of total leads visited
          </div>
        </div>

        <div class="kpi-card" [class.card-alert]="stats()!.overdue_followups > 0">
          <div class="kpi-label">Follow-ups Queue</div>
          <div class="kpi-value" [class.text-red]="stats()!.overdue_followups > 0">
            {{ stats()!.overdue_followups + stats()!.today_followups }}
          </div>
          <div class="kpi-sub">
            <span class="pill pill-red">{{ stats()!.overdue_followups }} Overdue</span>
            <span class="pill pill-amber" style="margin-left: 4px;">{{ stats()!.today_followups }} Today</span>
          </div>
        </div>
      </div>

      <!-- Action Required: Urgent / Hot Leads Section -->
      <div class="card" style="margin-top: 18px;">
        <div class="card-head">
          <div>
            <h3 class="card-title">🚨 Action Required (Hot & Due Leads)</h3>
            <p class="page-subtitle">Instant WhatsApp & Call shortcuts to follow up immediately</p>
          </div>
          <a routerLink="/followups" class="btn btn-secondary btn-sm">Full Queue →</a>
        </div>

        @if (stats()!.urgent_leads.length === 0) {
          <div class="empty-state">No overdue follow-ups or urgent hot leads right now. Great job!</div>
        } @else {
          <div class="urgent-grid">
            @for (lead of stats()!.urgent_leads; track lead.id) {
              <div class="urgent-card" [class.urgent-hot]="lead.temperature === 'Hot'">
                <div class="urgent-head">
                  <div>
                    <div class="urgent-name">{{ lead.full_name }}</div>
                    @if (lead.inv_unit_number) {
                      <div class="urgent-unit">Unit {{ lead.inv_unit_number }} — {{ lead.inv_title }}</div>
                    }
                  </div>
                  <span class="temp-badge" [ngClass]="getTempClass(lead.temperature)">
                    {{ getTempIcon(lead.temperature) }} {{ lead.temperature }}
                  </span>
                </div>

                <div class="urgent-timing">
                  @if (lead.needs_followup && lead.next_followup_at) {
                    <div [class.timing-overdue]="isOverdue(lead.next_followup_at)" class="timing-badge">
                      ⏰ {{ isOverdue(lead.next_followup_at) ? 'Overdue: ' : 'Due: ' }} {{ formatDt(lead.next_followup_at) }}
                    </div>
                  } @else {
                    <div class="timing-badge">Status: {{ lead.status }}</div>
                  }
                  @if (lead.assigned_agent_name && (auth.isAdmin() || stats()?.role === 'admin')) {
                    <div class="agent-tag">
                      👤 {{ lead.assigned_agent_name }}
                    </div>
                  }
                </div>

                <!-- One-Click Call & WhatsApp -->
                <div class="urgent-actions">
                  <a [href]="'tel:' + lead.phone" class="btn-action btn-call" title="Call directly">
                    <span class="btn-icon">📞</span> Call
                  </a>
                  <a
                    [href]="getWhatsAppUrl(lead.phone, lead.full_name)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn-action btn-whatsapp"
                    title="Send WhatsApp message"
                  >
                    <span class="btn-icon">💬</span> WhatsApp
                  </a>
                  <a [routerLink]="['/leads']" [queryParams]="{ search: lead.phone }" class="btn-action btn-view" title="Open lead">
                    Details
                  </a>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Pipeline Funnel & Temperature Distribution Row -->
      <div class="dash-grid-2" style="margin-top: 18px;">
        <!-- Lead Pipeline Funnel -->
        <div class="card">
          <h3 class="card-title">Lead Status Pipeline</h3>
          <p class="page-subtitle" style="margin-bottom: 16px;">Conversion stages from New to Closed Won</p>

          <div class="pipeline-list">
            @for (step of pipelineStages; track step.key) {
              <div class="pipeline-row">
                <div class="pipeline-info">
                  <span class="pipeline-label">{{ step.label }}</span>
                  <span class="pipeline-count">
                    {{ getStatusCount(step.key) }} ({{ getStatusPercent(step.key) }}%)
                  </span>
                </div>
                <div class="pipeline-bar-bg">
                  <div
                    class="pipeline-bar-fill"
                    [style.background]="step.color"
                    [style.width.%]="getStatusPercent(step.key)"
                  ></div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Temperature Breakdown -->
        <div class="card">
          <h3 class="card-title">Lead Temperature Breakdown</h3>
          <p class="page-subtitle" style="margin-bottom: 16px;">Lead engagement priority distribution</p>

          <div class="temp-breakdown">
            <div class="temp-stat-row hot-row">
              <div class="temp-icon-box">🔥</div>
              <div class="temp-details">
                <div class="temp-row-title">Hot Leads</div>
                <div class="temp-row-sub">Ready to close, highly interested</div>
              </div>
              <div class="temp-count-box">
                <div class="temp-val text-red">{{ stats()!.hot_leads }}</div>
                <div class="temp-pct">{{ getTempPercent('Hot') }}%</div>
              </div>
            </div>

            <div class="temp-stat-row warm-row">
              <div class="temp-icon-box">☀️</div>
              <div class="temp-details">
                <div class="temp-row-title">Warm Leads</div>
                <div class="temp-row-sub">Considering options, followup scheduled</div>
              </div>
              <div class="temp-count-box">
                <div class="temp-val text-amber">{{ stats()!.warm_leads }}</div>
                <div class="temp-pct">{{ getTempPercent('Warm') }}%</div>
              </div>
            </div>

            <div class="temp-stat-row cold-row">
              <div class="temp-icon-box">❄️</div>
              <div class="temp-details">
                <div class="temp-row-title">Cold Leads</div>
                <div class="temp-row-sub">Low response, long term nurture</div>
              </div>
              <div class="temp-count-box">
                <div class="temp-val text-blue">{{ stats()!.cold_leads }}</div>
                <div class="temp-pct">{{ getTempPercent('Cold') }}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Agent Performance Table (Admin only) -->
      @if ((auth.isAdmin() || stats()?.role === 'admin') && stats()!.agents_performance.length > 0) {
        <div class="card" style="margin-top: 18px;">
          <div class="card-head">
            <div>
              <h3 class="card-title">👥 Agent Performance & Workload</h3>
              <p class="page-subtitle">Track lead delegation, active hot leads, and closures per team member</p>
            </div>
            <a routerLink="/agents" class="btn btn-secondary btn-sm">Manage Agents →</a>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Contact</th>
                  <th>Assigned Leads</th>
                  <th>Hot Leads</th>
                  <th>Visits Done</th>
                  <th>Deals Won</th>
                  <th>Overdue Alerts</th>
                  <th>Direct Connect</th>
                </tr>
              </thead>
              <tbody>
                @for (agent of stats()!.agents_performance; track agent.id) {
                  <tr>
                    <td>
                      <div class="agent-profile-cell">
                        @if (agent.avatar_url) {
                          <img [src]="'/' + agent.avatar_url" alt="{{ agent.name }}" class="agent-mini-avatar" />
                        } @else {
                          <div class="agent-avatar-placeholder">{{ getInitials(agent.name) }}</div>
                        }
                        <div>
                          <div style="font-weight: 700;">{{ agent.name }}</div>
                          <div class="page-subtitle">{{ agent.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      @if (agent.mobile_number) {
                        <a class="phone-link" [href]="'tel:' + agent.mobile_number">{{ agent.mobile_number }}</a>
                      } @else {
                        <span class="page-subtitle">—</span>
                      }
                    </td>
                    <td>
                      <span class="badge badge-slate" style="font-size: 13px;">{{ agent.total_assigned }} leads</span>
                    </td>
                    <td>
                      <span class="temp-badge temp-hot">{{ agent.hot_count }}</span>
                    </td>
                    <td>
                      <span class="badge badge-emerald">{{ agent.visited_count }}</span>
                    </td>
                    <td>
                      <strong class="text-emerald" style="font-size: 14px;">{{ agent.won_count }}</strong>
                    </td>
                    <td>
                      @if (agent.overdue_count > 0) {
                        <span class="badge badge-red">{{ agent.overdue_count }} Overdue</span>
                      } @else {
                        <span class="badge badge-emerald">0 Pending</span>
                      }
                    </td>
                    <td>
                      @if (agent.mobile_number) {
                        <div style="display:flex; gap:6px;">
                          <a [href]="'tel:' + agent.mobile_number" class="btn-mini btn-call" title="Call Agent">📞</a>
                          <a [href]="getWhatsAppUrl(agent.mobile_number, agent.name)" target="_blank" rel="noopener noreferrer" class="btn-mini btn-whatsapp" title="WhatsApp Agent">💬</a>
                        </div>
                      } @else {
                        <span class="page-subtitle">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }

    .kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 18px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .card-blue { border-left: 4px solid #2563eb; }
    .card-hot { border-left: 4px solid #ef4444; }
    .card-visited { border-left: 4px solid #10b981; }
    .card-alert { border-left: 4px solid #dc2626; background: #fffcfc; }

    .kpi-label {
      font-size: 12.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }

    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.15;
      margin: 8px 0;
    }

    .kpi-sub {
      font-size: 12.5px;
      color: #64748b;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }

    .pill {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }
    .pill-success { background: #dcfce7; color: #166534; }
    .pill-warm { background: #fef3c7; color: #92400e; }
    .pill-cold { background: #dbeafe; color: #1e40af; }
    .pill-red { background: #fee2e2; color: #991b1b; }
    .pill-amber { background: #ffedd5; color: #9a3412; }

    .text-red { color: #dc2626; }
    .text-amber { color: #d97706; }
    .text-blue { color: #2563eb; }
    .text-emerald { color: #059669; }

    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .urgent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }

    .urgent-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: box-shadow 0.15s ease;
    }
    .urgent-card:hover {
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .urgent-hot {
      border-color: #fecaca;
      background: #fffafa;
    }

    .urgent-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .urgent-name {
      font-weight: 700;
      font-size: 15px;
      color: #0f172a;
    }
    .urgent-unit {
      font-size: 12px;
      color: #64748b;
      margin-top: 1px;
    }

    .temp-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11.5px;
      font-weight: 700;
      white-space: nowrap;
    }
    .temp-hot { background: #fee2e2; color: #b91c1c; }
    .temp-warm { background: #fef3c7; color: #b45309; }
    .temp-cold { background: #dbeafe; color: #1d4ed8; }

    .urgent-timing {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 12px;
    }
    .timing-badge {
      font-weight: 600;
      color: #334155;
    }
    .timing-overdue {
      color: #dc2626;
      font-weight: 700;
    }
    .agent-tag {
      font-size: 11.5px;
      background: #f1f5f9;
      color: #475569;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .urgent-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .btn-action {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 12.5px;
      font-weight: 600;
      text-decoration: none;
      min-height: 38px;
    }
    .btn-call {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }
    .btn-call:hover { background: #bae6fd; }
    .btn-whatsapp {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .btn-whatsapp:hover { background: #bbf7d0; }
    .btn-view {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      max-width: 60px;
    }
    .btn-view:hover { background: #e2e8f0; }

    .dash-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 840px) {
      .dash-grid-2 { grid-template-columns: 1fr; }
    }

    .pipeline-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pipeline-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pipeline-info {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    .pipeline-label { font-weight: 600; color: #1e293b; }
    .pipeline-count { font-weight: 600; color: #64748b; font-size: 12.5px; }
    .pipeline-bar-bg {
      width: 100%;
      height: 9px;
      background: #f1f5f9;
      border-radius: 9999px;
      overflow: hidden;
    }
    .pipeline-bar-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.3s ease;
      min-width: 4px;
    }

    .temp-breakdown {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .temp-stat-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid transparent;
    }
    .hot-row { background: #fff5f5; border-color: #fed7d7; }
    .warm-row { background: #fffaf0; border-color: #feebc8; }
    .cold-row { background: #ebf8ff; border-color: #bee3f8; }

    .temp-icon-box { font-size: 22px; line-height: 1; }
    .temp-details { flex: 1; }
    .temp-row-title { font-weight: 700; font-size: 14px; color: #0f172a; }
    .temp-row-sub { font-size: 11.5px; color: #64748b; }
    .temp-count-box { text-align: right; }
    .temp-val { font-size: 18px; font-weight: 800; line-height: 1; }
    .temp-pct { font-size: 11.5px; color: #64748b; margin-top: 2px; }

    .agent-profile-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .agent-mini-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid #cbd5e1;
    }
    .agent-avatar-placeholder {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #334155;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-mini {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 13px;
    }
    .badge-emerald { background: #dcfce7; color: #166534; font-weight: 600; }
  `],
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly stats = signal<DashboardStats | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly pipelineStages = [
    { key: 'New', label: 'New Lead', color: '#3b82f6' },
    { key: 'Contacted', label: 'Contacted', color: '#6366f1' },
    { key: 'Visited', label: 'Site Visited', color: '#8b5cf6' },
    { key: 'Negotiation', label: 'Negotiation', color: '#f59e0b' },
    { key: 'Closed Won', label: 'Closed Won (Deal Done)', color: '#10b981' },
    { key: 'Closed Lost', label: 'Closed Lost', color: '#94a3b8' },
  ];

  ngOnInit(): void {
    this.loadStats();
  }

  async loadStats(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.getDashboardStats());
      if (res.success && res.data) {
        this.stats.set(res.data);
      } else {
        this.error.set(res.message || 'Failed to load dashboard stats.');
      }
    } catch (err) {
      this.error.set(extractApiError(err, 'Failed to fetch dashboard data.'));
    } finally {
      this.loading.set(false);
    }
  }

  getVisitPercentage(): number {
    const s = this.stats();
    if (!s || s.total_leads === 0) return 0;
    return Math.round((s.visited_leads / s.total_leads) * 100);
  }

  getStatusCount(statusKey: string): number {
    return this.stats()?.status_breakdown[statusKey] ?? 0;
  }

  getStatusPercent(statusKey: string): number {
    const s = this.stats();
    if (!s || s.total_leads === 0) return 0;
    const count = s.status_breakdown[statusKey] ?? 0;
    return Math.round((count / s.total_leads) * 100);
  }

  getTempPercent(temperature: LeadTemperature): number {
    const s = this.stats();
    if (!s || s.total_leads === 0) return 0;
    const count =
      temperature === 'Hot' ? s.hot_leads : temperature === 'Warm' ? s.warm_leads : s.cold_leads;
    return Math.round((count / s.total_leads) * 100);
  }

  getTempIcon(temperature: LeadTemperature): string {
    switch (temperature) {
      case 'Hot': return '🔥';
      case 'Warm': return '☀️';
      case 'Cold': return '❄️';
      default: return '☀️';
    }
  }

  getTempClass(temperature: LeadTemperature): string {
    switch (temperature) {
      case 'Hot': return 'temp-hot';
      case 'Warm': return 'temp-warm';
      case 'Cold': return 'temp-cold';
      default: return 'temp-warm';
    }
  }

  formatDt(isoString: string | null | undefined): string {
    return formatIstDateTime(isoString);
  }

  isOverdue(isoString: string | null | undefined): boolean {
    if (!isoString) return false;
    const clean = isoString.replace(' ', 'T');
    return new Date(clean).getTime() < Date.now();
  }

  getWhatsAppUrl(phone: string, leadName: string): string {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const defaultMsg = encodeURIComponent(
      `Hello ${leadName}, this is regarding your property requirement inquiry. When would be a good time to connect?`
    );
    return `https://wa.me/${cleanPhone}?text=${defaultMsg}`;
  }

  getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name[0] || 'A').toUpperCase();
  }
}
