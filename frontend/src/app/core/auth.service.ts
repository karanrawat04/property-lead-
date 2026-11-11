import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiResponse, HealthStatus, User } from './models';

const TOKEN_STORAGE_KEY = 'plm_auth_token';
const USER_STORAGE_KEY = 'plm_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private _token = signal<string | null>(this.readStorage(TOKEN_STORAGE_KEY));
  private _user = signal<User | null>(this.loadStoredUser());

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());

  private readStorage(key: string): string | null {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        return localStorage.getItem(key);
      }
    } catch {
      // ignore storage errors in restricted environments
    }
    return null;
  }

  private writeStorage(key: string, value: string | null): void {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      }
    } catch {
      // ignore
    }
  }

  private loadStoredUser(): User | null {
    try {
      const raw = this.readStorage(USER_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  checkHealth(): Observable<ApiResponse<HealthStatus>> {
    return this.http.get<ApiResponse<HealthStatus>>('/api/health');
  }

  setupAdmin(payload: { name: string; email: string; password: string }): Observable<
    ApiResponse<{ token: string; expires_at: string; user: User }>
  > {
    return this.http
      .post<ApiResponse<{ token: string; expires_at: string; user: User }>>('/api/auth/setup', payload)
      .pipe(
        tap((res) => {
          if (res.success && res.data) {
            this.setSession(res.data.token, res.data.user);
          }
        })
      );
  }

  login(payload: { email: string; password: string }): Observable<
    ApiResponse<{ token: string; expires_at: string; user: User }>
  > {
    return this.http
      .post<ApiResponse<{ token: string; expires_at: string; user: User }>>('/api/auth/login', payload)
      .pipe(
        tap((res) => {
          if (res.success && res.data) {
            this.setSession(res.data.token, res.data.user);
          }
        })
      );
  }

  logout(callApi = true): void {
    if (callApi && this._token()) {
      this.http.post('/api/auth/logout', {}).subscribe({ error: () => {} });
    }
    this.writeStorage(TOKEN_STORAGE_KEY, null);
    this.writeStorage(USER_STORAGE_KEY, null);
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  changePassword(current_password: string, new_password: string): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>('/api/auth/change-password', {
      current_password,
      new_password,
    });
  }

  private setSession(token: string, user: User): void {
    this.writeStorage(TOKEN_STORAGE_KEY, token);
    this.writeStorage(USER_STORAGE_KEY, JSON.stringify(user));
    this._token.set(token);
    this._user.set(user);
  }
}
