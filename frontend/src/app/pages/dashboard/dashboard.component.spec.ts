import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { routes } from '../../app.routes';
import { DashboardStats } from '../../core/models';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let httpTesting: HttpTestingController;

  const mockStats: DashboardStats = {
    role: 'admin',
    total_leads: 25,
    hot_leads: 8,
    warm_leads: 12,
    cold_leads: 5,
    visited_leads: 10,
    closed_won_leads: 6,
    closed_lost_leads: 2,
    conversion_rate: 24.0,
    overdue_followups: 3,
    today_followups: 2,
    upcoming_followups: 7,
    status_breakdown: {
      New: 5,
      Contacted: 6,
      Visited: 4,
      Negotiation: 2,
      'Closed Won': 6,
      'Closed Lost': 2,
    },
    urgent_leads: [
      {
        id: 1,
        full_name: 'Anjali Gupta',
        phone: '+91 9876543210',
        email: 'anjali@example.com',
        status: 'Contacted',
        temperature: 'Hot',
        needs_followup: true,
        next_followup_at: '2026-11-16 11:30:00',
        is_visited: false,
        inv_unit_number: '410 C',
        inv_title: 'Galaxy Towers',
        assigned_agent_name: 'Rahul Sharma',
      },
    ],
    agents_performance: [
      {
        id: 2,
        name: 'Rahul Sharma',
        email: 'rahul@example.com',
        mobile_number: '+91 9811122233',
        avatar_url: null,
        is_active: 1,
        total_assigned: 15,
        hot_count: 5,
        visited_count: 7,
        won_count: 4,
        overdue_count: 1,
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads and renders dashboard KPI statistics correctly', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const req = httpTesting.expectOne('/api/dashboard/stats');
    req.flush({ success: true, message: 'OK', data: mockStats });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Total Leads');
    expect(text).toContain('25');
    expect(text).toContain('Hot Leads');
    expect(text).toContain('8');
    expect(text).toContain('Anjali Gupta');
    expect(text).toContain('410 C');
    expect(text).toContain('Rahul Sharma');
  });

  it('generates correct one-click WhatsApp URL', () => {
    const comp = fixture.componentInstance;
    const url = comp.getWhatsAppUrl('+91 98765-43210', 'Anjali Gupta');
    expect(url).toContain('https://wa.me/919876543210?text=');
    expect(url).toContain('Anjali%20Gupta');
  });
});
