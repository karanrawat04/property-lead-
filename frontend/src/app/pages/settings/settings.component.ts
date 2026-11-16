import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { email, form, FormField, max, min, minLength, required, submit, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { extractApiError } from '../../core/api-error';
import { EmailSettings, ReminderLog } from '../../core/models';
import { formatIstDateTime, handleNumericKeydown, parseEmailList } from '../../core/validators';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, FormField],
  template: `
    <div class="page-header">
      <div>
        <h2 class="page-title">Email Reminder Setup & Security</h2>
        <p class="page-subtitle">Configure follow-up reminder emails directly from the UI (Timezone: Asia/Kolkata)</p>
      </div>
    </div>

    @if (feedback()) {
      <div class="alert" [class.alert-success]="!isError()" [class.alert-error]="isError()">
        {{ feedback() }}
      </div>
    }

    <div class="settings-layout">
      <div class="card">
        <h3 style="margin:0 0 8px;">Follow-up Email Reminders</h3>
        <div class="alert alert-info" style="margin-bottom: 14px;">
          <strong>InfinityFree Tip:</strong> InfinityFree free hosting blocks outbound SMTP ports (25/465/587) and disables PHP <code>mail()</code>.
          For reliable delivery on InfinityFree free tier, use <strong>Brevo API</strong> or <strong>Resend API</strong> (uses HTTPS cURL).
          If using a paid/VPS PHP host, you can use <strong>SMTP</strong> directly.
        </div>

        @if (loading()) {
          <p class="page-subtitle">Loading email settings...</p>
        } @else {
          <form (submit)="saveEmailSettings(); $event.preventDefault()" novalidate>
            <div class="form-grid">
              <div class="form-group full">
                <label class="checkbox-row">
                  <input type="checkbox" [formField]="emailForm.reminders_enabled" />
                  Enable Follow-up Reminder Emails
                </label>
              </div>

              <div class="form-group full">
                <label>Reminder Recipient Emails <span class="req">*</span></label>
                @if (recipientEmails().length > 0) {
                  <div class="recipient-chips">
                    @for (rcpt of recipientEmails(); track rcpt) {
                      <span class="recipient-chip">
                        <span>{{ rcpt }}</span>
                        <button
                          type="button"
                          class="chip-remove"
                          (click)="removeRecipientEmail(rcpt)"
                          [attr.aria-label]="'Remove ' + rcpt"
                        >
                          ×
                        </button>
                      </span>
                    }
                  </div>
                }
                <div style="display:flex; gap:8px; align-items:center;">
                  <input
                    type="email"
                    [ngModel]="recipientDraft()"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="recipientDraft.set($event); recipientDraftError.set('')"
                    (keydown.enter)="addRecipientFromDraft($event)"
                    placeholder="Add recipient email (or paste comma-separated list)"
                    style="flex:1;"
                  />
                  <button type="button" class="btn btn-secondary btn-sm" (click)="addRecipientFromDraft()">
                    + Add
                  </button>
                </div>
                <span class="field-hint">
                  Add one or more email addresses that should receive follow-up reminders.
                </span>
                @if (recipientDraftError()) {
                  <span class="field-error">{{ recipientDraftError() }}</span>
                }
                @if (emailForm.recipient_email().touched() && emailForm.recipient_email().errors().length) {
                  <span class="field-error">{{ emailForm.recipient_email().errors()[0].message }}</span>
                }
              </div>

              <div class="form-group">
                <label>Remind Before (minutes)</label>
                <input
                  type="number"
                  [formField]="emailForm.remind_before_minutes"
                  (keydown)="onNumberKey($event)"
                />
                <span class="field-hint">e.g. 60 = send reminder up to 60 mins before scheduled time.</span>
                @if (emailForm.remind_before_minutes().touched() && emailForm.remind_before_minutes().errors().length) {
                  <span class="field-error">{{ emailForm.remind_before_minutes().errors()[0].message }}</span>
                }
              </div>

              <div class="form-group">
                <label>Sender Name</label>
                <input type="text" [formField]="emailForm.sender_name" placeholder="Property Lead Manager" />
              </div>

              <div class="form-group">
                <label>Sender Email <span class="req">*</span></label>
                <input type="email" [formField]="emailForm.sender_email" placeholder="verified-sender@yourdomain.com" />
                @if (emailForm.sender_email().touched() && emailForm.sender_email().errors().length) {
                  <span class="field-error">{{ emailForm.sender_email().errors()[0].message }}</span>
                }
              </div>

              <div class="form-group full">
                <label>Email Transport</label>
                <select [formField]="emailForm.transport">
                  <option value="brevo_api">Brevo HTTP API (Recommended for InfinityFree)</option>
                  <option value="resend_api">Resend HTTP API (Recommended for InfinityFree)</option>
                  <option value="smtp">Direct SMTP (Gmail / Zoho / Custom SMTP)</option>
                  <option value="php_mail">PHP mail() (Standard hosting)</option>
                </select>
              </div>

              @if (transportValue() === 'brevo_api' || transportValue() === 'resend_api') {
                <div class="form-group full">
                  <label>
                    {{ transportValue() === 'brevo_api' ? 'Brevo API Key' : 'Resend API Key' }}
                    @if (settings()?.has_api_key) {
                      <span class="badge badge-green" style="margin-left:6px;">Saved</span>
                    }
                  </label>
                  <div style="display:flex; gap:8px; align-items:center;">
                    <input
                      [type]="showApiKey() ? 'text' : 'password'"
                      [formField]="emailForm.api_key"
                      [placeholder]="settings()?.has_api_key ? 'Leave blank to keep existing API key' : 'Paste your xkeysib-... API key'"
                      style="flex:1;"
                    />
                    <button type="button" class="btn btn-secondary btn-sm" (click)="showApiKey.set(!showApiKey())">
                      {{ showApiKey() ? 'Hide' : 'Show' }}
                    </button>
                  </div>
                  @if (transportValue() === 'brevo_api') {
                    <span class="field-hint">
                      Use a Brevo <strong>v3 API Key</strong> (starts with <code>xkeysib-...</code>, ~90 chars) from Brevo → SMTP &amp; API → API Keys (not an SMTP key <code>xsmtpsib-...</code>).
                    </span>
                  }
                </div>
              }

              @if (transportValue() === 'smtp') {
                <div class="form-group">
                  <label>SMTP Host</label>
                  <input type="text" [formField]="emailForm.smtp_host" placeholder="smtp.gmail.com" />
                </div>
                <div class="form-group">
                  <label>SMTP Port</label>
                  <input
                    type="number"
                    [formField]="emailForm.smtp_port"
                    placeholder="587"
                    (keydown)="onNumberKey($event)"
                  />
                </div>
                <div class="form-group">
                  <label>Encryption</label>
                  <select [formField]="emailForm.smtp_encryption">
                    <option value="tls">STARTTLS (587)</option>
                    <option value="ssl">SSL (465)</option>
                    <option value="none">None (25)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>SMTP Username</label>
                  <input type="text" [formField]="emailForm.smtp_username" placeholder="you@gmail.com" />
                </div>
                <div class="form-group full">
                  <label>
                    SMTP Password / App Password
                    @if (settings()?.has_smtp_password) {
                      <span class="badge badge-green" style="margin-left:6px;">Saved</span>
                    }
                  </label>
                  <input
                    type="password"
                    [formField]="emailForm.smtp_password"
                    [placeholder]="settings()?.has_smtp_password ? 'Leave blank to keep existing password' : 'Enter SMTP password'"
                  />
                </div>
              }
            </div>

            <div class="settings-btn-row">
              <button type="submit" class="btn btn-primary" [disabled]="savingEmail()">
                {{ savingEmail() ? 'Saving...' : 'Save Settings' }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="sendTestEmail()" [disabled]="testingEmail()">
                {{ testingEmail() ? 'Sending Test...' : 'Send Test Email' }}
              </button>
              <button type="button" class="btn btn-success" (click)="runDueNow()" [disabled]="runningDue()">
                {{ runningDue() ? 'Checking Due...' : 'Send Due Reminders Now' }}
              </button>
            </div>
          </form>

          @if (settings()) {
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
              <h4 style="margin: 0 0 6px;">Automated Reminder Cron URL</h4>
              <p class="page-subtitle" style="margin-bottom: 8px;">
                Call this URL every 15–30 minutes using InfinityFree Cron Jobs or cron-job.org to receive automatic follow-up reminders:
              </p>
              <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <input type="text" readonly [value]="cronUrl()" style="flex:1; min-width: 220px; font-family: monospace; font-size: 12px;" />
                <button type="button" class="btn btn-secondary btn-sm" (click)="copyCronUrl()">Copy URL</button>
                <button type="button" class="btn btn-secondary btn-sm" (click)="rotateSecret()">Rotate Key</button>
              </div>
              @if (settings()!.last_run_at) {
                <div class="page-subtitle" style="margin-top: 8px;">
                  Last run: {{ formatDt(settings()!.last_run_at) }} — {{ settings()!.last_status }}
                </div>
              }
            </div>
          }
        }
      </div>

      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h3 style="margin:0 0 12px;">Change Login Password</h3>
          <form (submit)="changePassword(); $event.preventDefault()" novalidate>
            <div class="form-group" style="margin-bottom: 12px;">
              <label>Current Password <span class="req">*</span></label>
              <input type="password" [formField]="passwordForm.current_password" />
              @if (passwordForm.current_password().touched() && passwordForm.current_password().errors().length) {
                <span class="field-error">{{ passwordForm.current_password().errors()[0].message }}</span>
              }
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
              <label>New Password (min 8 chars) <span class="req">*</span></label>
              <input type="password" [formField]="passwordForm.new_password" />
              @if (passwordForm.new_password().touched() && passwordForm.new_password().errors().length) {
                <span class="field-error">{{ passwordForm.new_password().errors()[0].message }}</span>
              }
            </div>
            <button type="submit" class="btn btn-primary" [disabled]="savingPassword()">
              {{ savingPassword() ? 'Updating...' : 'Update Password' }}
            </button>
          </form>
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px;">Recent Reminder Email Logs</h3>
          @if (logs().length === 0) {
            <p class="page-subtitle">No reminder emails sent yet.</p>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time (IST)</th>
                    <th>Subject</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (log of logs(); track log.id) {
                    <tr>
                      <td style="white-space: nowrap;">{{ formatDt(log.sent_at) }}</td>
                      <td>
                        <div>{{ log.subject }}</div>
                        @if (log.error_message) {
                          <div class="field-error">{{ log.error_message }}</div>
                        }
                      </td>
                      <td>
                        <span class="badge" [class.badge-green]="log.status === 'sent'" [class.badge-red]="log.status === 'failed'">
                          {{ log.status }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .settings-layout {
      display: grid;
      grid-template-columns: 1.25fr 1fr;
      gap: 16px;
      align-items: start;
    }
    .settings-btn-row {
      margin-top: 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .recipient-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }
    .recipient-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--primary-soft);
      color: var(--primary);
      border: 1px solid #bfdbfe;
      font-size: 12.5px;
      font-weight: 600;
    }
    .chip-remove {
      border: 0;
      background: transparent;
      color: var(--primary);
      font-size: 16px;
      line-height: 1;
      padding: 0 2px;
      cursor: pointer;
      font-weight: 700;
    }
    @media (max-width: 960px) {
      .settings-layout {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 600px) {
      .settings-btn-row .btn {
        flex: 1 1 100%;
      }
    }
  `,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly settings = signal<EmailSettings | null>(null);
  protected readonly logs = signal<ReminderLog[]>([]);
  protected readonly feedback = signal('');
  protected readonly isError = signal(false);

  protected readonly savingEmail = signal(false);
  protected readonly testingEmail = signal(false);
  protected readonly runningDue = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly showApiKey = signal(false);
  protected readonly recipientDraft = signal('');
  protected readonly recipientDraftError = signal('');

  protected readonly emailModel = signal({
    reminders_enabled: false,
    recipient_email: '',
    sender_name: 'Property Lead Manager',
    sender_email: '',
    transport: 'brevo_api' as EmailSettings['transport'],
    smtp_host: '',
    smtp_port: 587,
    smtp_encryption: 'tls' as EmailSettings['smtp_encryption'],
    smtp_username: '',
    smtp_password: '',
    api_key: '',
    remind_before_minutes: 60,
  });

  protected readonly emailForm = form(this.emailModel, (s) => {
    validate(s.recipient_email, ({ value, valueOf }) => {
      const parsed = parseEmailList(value());
      if (parsed.invalid.length > 0) {
        return { kind: 'invalidEmails', message: `Invalid email(s): ${parsed.invalid.join(', ')}` };
      }
      if (valueOf(s.reminders_enabled) && parsed.emails.length === 0) {
        return { kind: 'required', message: 'Add at least one recipient email when reminders are enabled.' };
      }
      return undefined;
    });
    email(s.sender_email, { message: 'Enter a valid sender email address.' });
    min(s.smtp_port, 1, { message: 'Port must be at least 1.' });
    max(s.smtp_port, 65535, { message: 'Port cannot exceed 65535.' });
    min(s.remind_before_minutes, 0, { message: 'Must be 0 or greater.' });
    max(s.remind_before_minutes, 10080, { message: 'Cannot exceed 10080 minutes (7 days).' });
  });

  protected readonly passwordModel = signal({
    current_password: '',
    new_password: '',
  });

  protected readonly passwordForm = form(this.passwordModel, (s) => {
    required(s.current_password, { message: 'Current password is required.' });
    required(s.new_password, { message: 'New password is required.' });
    minLength(s.new_password, 8, { message: 'New password must be at least 8 characters.' });
  });

  protected readonly transportValue = computed(() => this.emailModel().transport);
  protected readonly recipientEmails = computed(
    () => parseEmailList(this.emailModel().recipient_email).emails
  );

  protected readonly cronUrl = computed(() => {
    const secret = this.settings()?.cron_secret || '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/api/reminders/cron?key=${secret}`;
  });

  onNumberKey(event: KeyboardEvent): void {
    handleNumericKeydown(event, false);
  }

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading.set(true);
    this.api.getEmailSettings().subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.data) {
          this.settings.set(res.data.settings);
          this.logs.set(res.data.logs || []);
          this.emailModel.set({
            reminders_enabled: res.data.settings.reminders_enabled,
            recipient_email: res.data.settings.recipient_email,
            sender_name: res.data.settings.sender_name,
            sender_email: res.data.settings.sender_email,
            transport: res.data.settings.transport,
            smtp_host: res.data.settings.smtp_host,
            smtp_port: res.data.settings.smtp_port,
            smtp_encryption: res.data.settings.smtp_encryption,
            smtp_username: res.data.settings.smtp_username,
            smtp_password: '',
            api_key: '',
            remind_before_minutes: res.data.settings.remind_before_minutes,
          });
          this.emailForm().reset();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.notify(extractApiError(err, 'Failed to load settings.'), true);
      },
    });
  }

  protected addRecipientFromDraft(event?: Event): boolean {
    if (event) {
      event.preventDefault();
    }
    const raw = this.recipientDraft().trim();
    if (raw === '') {
      return true;
    }
    const parsed = parseEmailList(raw);
    if (parsed.invalid.length > 0) {
      this.recipientDraftError.set(`Invalid email(s): ${parsed.invalid.join(', ')}`);
      return false;
    }
    const merged = parseEmailList([...this.recipientEmails(), ...parsed.emails].join(', ')).emails;
    this.emailModel.update((m) => ({ ...m, recipient_email: merged.join(', ') }));
    this.recipientDraft.set('');
    this.recipientDraftError.set('');
    return true;
  }

  protected removeRecipientEmail(target: string): void {
    const remaining = this.recipientEmails().filter(
      (e) => e.toLowerCase() !== target.toLowerCase()
    );
    this.emailModel.update((m) => ({ ...m, recipient_email: remaining.join(', ') }));
  }

  private buildEmailPayload(): Record<string, unknown> {
    const v = this.emailModel();
    return {
      reminders_enabled: !!v.reminders_enabled,
      recipient_email: v.recipient_email.trim(),
      sender_name: v.sender_name.trim() || 'Property Lead Manager',
      sender_email: v.sender_email.trim(),
      transport: v.transport,
      smtp_host: v.smtp_host.trim(),
      smtp_port: Number(v.smtp_port || 587),
      smtp_encryption: v.smtp_encryption,
      smtp_username: v.smtp_username.trim(),
      smtp_password: v.smtp_password,
      api_key: v.api_key.trim(),
      remind_before_minutes: Number(v.remind_before_minutes ?? 60),
    };
  }

  saveEmailSettings(): void {
    if (!this.addRecipientFromDraft()) {
      return;
    }
    submit(this.emailForm, async () => {
      this.savingEmail.set(true);
      try {
        const res = await firstValueFrom(this.api.saveEmailSettings(this.buildEmailPayload()));
        this.savingEmail.set(false);
        this.notify(res.message || 'Settings saved.', false);
        this.loadSettings();
      } catch (err) {
        this.savingEmail.set(false);
        this.notify(extractApiError(err, 'Failed to save email settings.'), true);
      }
    });
  }

  async sendTestEmail(): Promise<void> {
    if (!this.addRecipientFromDraft()) {
      return;
    }
    this.testingEmail.set(true);
    try {
      if (this.emailForm().valid()) {
        await firstValueFrom(this.api.saveEmailSettings(this.buildEmailPayload()));
      }
      const recipient = this.emailModel().recipient_email.trim() || undefined;
      const res = await firstValueFrom(this.api.sendTestEmail(recipient));
      this.testingEmail.set(false);
      this.notify(res.message || 'Test email sent!', false);
      this.loadSettings();
    } catch (err) {
      this.testingEmail.set(false);
      this.notify(extractApiError(err, 'Test email failed.'), true);
      this.loadSettings();
    }
  }

  runDueNow(): void {
    this.runningDue.set(true);
    this.api.sendDueRemindersNow().subscribe({
      next: (res) => {
        this.runningDue.set(false);
        this.notify(res.message || 'Processed due reminders.', false);
        this.loadSettings();
      },
      error: (err) => {
        this.runningDue.set(false);
        this.notify(extractApiError(err, 'Failed to run due reminders.'), true);
      },
    });
  }

  copyCronUrl(): void {
    navigator.clipboard?.writeText(this.cronUrl());
    this.notify('Cron URL copied to clipboard.', false);
  }

  rotateSecret(): void {
    if (!confirm('Rotate cron secret? Any existing cron job using the old URL will need to be updated.')) return;
    this.api.rotateCronSecret().subscribe({
      next: () => {
        this.notify('Cron key rotated.', false);
        this.loadSettings();
      },
      error: (err) => this.notify(extractApiError(err, 'Failed to rotate key.'), true),
    });
  }

  changePassword(): void {
    submit(this.passwordForm, async () => {
      this.savingPassword.set(true);
      const { current_password, new_password } = this.passwordModel();
      try {
        const res = await firstValueFrom(this.auth.changePassword(current_password, new_password));
        this.savingPassword.set(false);
        this.passwordModel.set({ current_password: '', new_password: '' });
        this.passwordForm().reset();
        this.notify(res.message || 'Password updated.', false);
      } catch (err) {
        this.savingPassword.set(false);
        this.notify(extractApiError(err, 'Failed to update password.'), true);
      }
    });
  }

  formatDt = formatIstDateTime;

  private notify(msg: string, error: boolean): void {
    this.feedback.set(msg);
    this.isError.set(error);
  }
}
