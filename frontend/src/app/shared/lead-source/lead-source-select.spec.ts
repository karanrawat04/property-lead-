import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { LeadSourceSelect } from './lead-source-select';
import { LeadSourceBadge } from './lead-source-badge';

@Component({
  imports: [FormField, LeadSourceSelect, LeadSourceBadge],
  template: `
    <app-lead-source-select [formField]="f.source" />
    <app-lead-source-badge [source]="model().source" />
  `,
})
class HostComponent {
  readonly model = signal({ source: '99acres' });
  readonly f = form(this.model);
}

describe('LeadSourceSelect & LeadSourceBadge', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('renders selected source icon and label in dropdown and badge', () => {
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('.source-trigger') as HTMLButtonElement;
    const badge = el.querySelector('.source-pill') as HTMLElement;

    expect(trigger.textContent).toContain('99acres');
    expect(trigger.querySelector('svg')).toBeTruthy();
    expect(badge.textContent).toContain('99acres');
    expect(badge.querySelector('svg')).toBeTruthy();
  });

  it('opens dropdown options with icons and updates Signal Form model on select', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('.source-trigger') as HTMLButtonElement;
    trigger.click();
    await fixture.whenStable();

    const options = Array.from(el.querySelectorAll('.source-option')) as HTMLButtonElement[];
    const whatsappOrWalkin = options.find((opt) => opt.textContent?.includes('Walk-in'));
    expect(whatsappOrWalkin).toBeTruthy();
    expect(whatsappOrWalkin!.querySelector('svg')).toBeTruthy();

    whatsappOrWalkin!.click();
    await fixture.whenStable();

    expect(host.model().source).toBe('Walk-in');
    expect(el.querySelector('.source-pill')?.textContent).toContain('Walk-in');
  });
});

