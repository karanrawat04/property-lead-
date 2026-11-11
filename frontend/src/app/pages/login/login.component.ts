import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { email, form, FormField, minLength, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { extractApiError } from '../../core/api-error';

@Component({
  selector: 'app-login',
  imports: [FormField],
  template: `
    <div class="auth-shell">
      <div class="auth-card card">
        <div class="auth-brand">
          <div class="brand-mark">PL</div>
          <div>
            <h1>PropLead Manager</h1>
            <p class="page-subtitle">Real Estate Leads & Inventory (IST · Asia/Kolkata)</p>
          </div>
        </div>

        @if (errorMsg()) {
          <div class="alert alert-error">{{ errorMsg() }}</div>
        }

        @if (checkingHealth()) {
          <p class="page-subtitle">Connecting to server...</p>
        } @else if (needsSetup()) {
          <div class="alert alert-info">
            First-time setup: Create your Admin account to secure this software.
          </div>
          <form (submit)="submitSetup(); $event.preventDefault()" novalidate>
            <div class="form-group" style="margin-bottom: 12px;">
              <label>Full Name <span class="req">*</span></label>
              <input type="text" [formField]="setupForm.name" placeholder="e.g. Karan Rawat" />
              @if (setupForm.name().touched() && setupForm.name().errors().length) {
                <span class="field-error">{{ setupForm.name().errors()[0].message }}</span>
              }
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
              <label>Admin Email <span class="req">*</span></label>
              <input type="email" [formField]="setupForm.email" placeholder="you@example.com" />
              @if (setupForm.email().touched() && setupForm.email().errors().length) {
                <span class="field-error">{{ setupForm.email().errors()[0].message }}</span>
              }
            </div>

            <div class="form-group" style="margin-bottom: 16px;">
              <label>Password <span class="req">*</span></label>
              <input type="password" [formField]="setupForm.password" placeholder="Minimum 8 characters" />
              @if (setupForm.password().touched() && setupForm.password().errors().length) {
                <span class="field-error">{{ setupForm.password().errors()[0].message }}</span>
              }
            </div>

            <button class="btn btn-primary" style="width: 100%;" type="submit" [disabled]="submitting()">
              {{ submitting() ? 'Creating Admin...' : 'Create Admin & Sign In' }}
            </button>
          </form>
        } @else {
          <form (submit)="submitLogin(); $event.preventDefault()" novalidate>
            <div class="form-group" style="margin-bottom: 12px;">
              <label>Email <span class="req">*</span></label>
              <input type="email" [formField]="loginForm.email" placeholder="admin@example.com" autocomplete="email" />
              @if (loginForm.email().touched() && loginForm.email().errors().length) {
                <span class="field-error">{{ loginForm.email().errors()[0].message }}</span>
              }
            </div>

            <div class="form-group" style="margin-bottom: 16px;">
              <label>Password <span class="req">*</span></label>
              <input type="password" [formField]="loginForm.password" placeholder="Enter your password" autocomplete="current-password" />
              @if (loginForm.password().touched() && loginForm.password().errors().length) {
                <span class="field-error">{{ loginForm.password().errors()[0].message }}</span>
              }
            </div>

            <button class="btn btn-primary" style="width: 100%;" type="submit" [disabled]="submitting()">
              {{ submitting() ? 'Signing in...' : 'Sign In' }}
            </button>
          </form>
        }
      </div>
    </div>
  `,
  styles: `
    .auth-shell {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    }
    .auth-card {
      width: 100%;
      max-width: 420px;
      padding: 26px;
    }
    .auth-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .auth-brand h1 {
      margin: 0;
      font-size: 20px;
    }
    .brand-mark {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: var(--primary);
      color: #fff;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
  `,
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly checkingHealth = signal(true);
  protected readonly needsSetup = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal('');

  protected readonly loginModel = signal({
    email: '',
    password: '',
  });

  protected readonly loginForm = form(this.loginModel, (s) => {
    required(s.email, { message: 'Valid email is required.' });
    email(s.email, { message: 'Enter a valid email address.' });
    required(s.password, { message: 'Password is required.' });
  });

  protected readonly setupModel = signal({
    name: '',
    email: '',
    password: '',
  });

  protected readonly setupForm = form(this.setupModel, (s) => {
    required(s.name, { message: 'Name is required.' });
    minLength(s.name, 2, { message: 'Name must be at least 2 characters.' });
    required(s.email, { message: 'Email is required.' });
    email(s.email, { message: 'Enter a valid email address.' });
    required(s.password, { message: 'Password is required.' });
    minLength(s.password, 8, { message: 'Password must be at least 8 characters.' });
  });

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/leads']);
      return;
    }

    this.auth.checkHealth().subscribe({
      next: (res) => {
        this.checkingHealth.set(false);
        if (!res || typeof res !== 'object' || typeof res.success !== 'boolean') {
          this.errorMsg.set(
            'API returned HTML instead of JSON. Ensure the PHP backend is running and /api is proxied/routed to backend/api/index.php.'
          );
          return;
        }
        this.needsSetup.set(!!res.data?.needs_setup);
      },
      error: (err) => {
        this.checkingHealth.set(false);
        this.errorMsg.set(
          extractApiError(
            err,
            'Unable to connect to PHP API / MySQL database. Check backend configuration.'
          )
        );
      },
    });
  }

  submitLogin(): void {
    submit(this.loginForm, async () => {
      this.errorMsg.set('');
      this.submitting.set(true);
      try {
        await firstValueFrom(this.auth.login(this.loginModel()));
        this.submitting.set(false);
        await this.router.navigate(['/leads']);
      } catch (err) {
        this.submitting.set(false);
        this.errorMsg.set(extractApiError(err, 'Login failed.'));
      }
    });
  }

  submitSetup(): void {
    submit(this.setupForm, async () => {
      this.errorMsg.set('');
      this.submitting.set(true);
      try {
        await firstValueFrom(this.auth.setupAdmin(this.setupModel()));
        this.submitting.set(false);
        await this.router.navigate(['/leads']);
      } catch (err) {
        this.submitting.set(false);
        this.errorMsg.set(extractApiError(err, 'Setup failed.'));
      }
    });
  }
}
