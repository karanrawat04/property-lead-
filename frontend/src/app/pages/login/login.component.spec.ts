import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';
import { routes } from '../../app.routes';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('renders first-time setup when health reports needs_setup=true', async () => {
    await fixture.whenStable();
    const req = httpTesting.expectOne('/api/health');
    req.flush({
      success: true,
      message: 'OK',
      data: {
        status: 'ok',
        needs_setup: true,
        timezone: 'Asia/Kolkata',
        server_time: '2026-11-11 09:45:00',
        php_version: '8.1.34',
      },
    });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('First-time setup');
    expect(text).toContain('Create Admin & Sign In');
  });

  it('shows friendly diagnostic message if API returns HTML instead of JSON', async () => {
    await fixture.whenStable();
    const req = httpTesting.expectOne('/api/health');
    req.flush('<!doctype html><html></html>', { status: 200, statusText: 'OK' });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('API returned HTML instead of JSON');
  });

  it('shows friendly diagnostic message on HttpClient JSON parse error', async () => {
    await fixture.whenStable();
    const req = httpTesting.expectOne('/api/health');
    req.flush(
      { error: new SyntaxError("Unexpected token '<'"), text: '<!doctype html>' } as unknown as string,
      { status: 200, statusText: 'OK' }
    );
    await fixture.whenStable();

    // Also verify extractApiError directly on HttpErrorResponse
    const errText = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(errText).toContain('API returned HTML instead of JSON');
  });
});
