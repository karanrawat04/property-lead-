import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AgentsComponent } from './agents.component';
import { routes } from '../../app.routes';
import { User } from '../../core/models';

describe('AgentsComponent', () => {
  let fixture: ComponentFixture<AgentsComponent>;
  let httpTesting: HttpTestingController;

  const mockAgents: User[] = [
    {
      id: 3,
      name: 'Vikas Mehra',
      email: 'vikas@prop.com',
      role: 'agent',
      mobile_number: '+91 9899001122',
      alt_number: '011-22334455',
      address: 'Tower 4, Greater Noida',
      date_of_joining: '2026-11-01',
      avatar_url: null,
      is_active: 1,
      assigned_leads_count: 12,
      hot_leads_count: 4,
      won_leads_count: 3,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentsComponent],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentsComponent);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('renders agent list with contact and performance metrics', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const req = httpTesting.expectOne('/api/agents');
    req.flush({ success: true, message: 'OK', data: mockAgents });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Vikas Mehra');
    expect(text).toContain('vikas@prop.com');
    expect(text).toContain('+91 9899001122');
    expect(text).toContain('12 Leads Assigned');
    expect(text).toContain('4 Hot');
    expect(text).toContain('01/11/2026');
  });

  it('generates agent initials and WhatsApp link correctly', () => {
    const comp = fixture.componentInstance;
    expect(comp.getInitials('Vikas Mehra')).toBe('VM');
    expect(comp.getInitials('Karan')).toBe('K');
    const waUrl = comp.getWhatsAppUrl('+91 9899001122', 'Vikas');
    expect(waUrl).toContain('https://wa.me/919899001122?text=');
  });
});
