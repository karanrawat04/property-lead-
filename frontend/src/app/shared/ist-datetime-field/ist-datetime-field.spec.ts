import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { IstDatetimeField } from './ist-datetime-field';

@Component({
  imports: [FormField, IstDatetimeField],
  template: `<app-ist-datetime-field [formField]="f.dt" />`,
})
class HostComponent {
  readonly model = signal({ dt: '2026-11-25T14:30' });
  readonly f = form(this.model);
}

describe('IstDatetimeField', () => {
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

  it('displays DD/MM/YYYY and 24-hour HH:mm from ISO model value', () => {
    const el = fixture.nativeElement as HTMLElement;
    const dateInput = el.querySelector('input[type="text"]') as HTMLInputElement;
    const selects = el.querySelectorAll('select');

    expect(dateInput.value).toBe('25/11/2026');
    expect(selects[0].value).toBe('14');
    expect(selects[1].value).toBe('30');
  });

  it('updates Signal Form model when user enters DD/MM/YYYY and 24-hour time', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const dateInput = el.querySelector('input[type="text"]') as HTMLInputElement;
    const selects = el.querySelectorAll('select');

    dateInput.value = '09032027';
    dateInput.dispatchEvent(new Event('input'));
    selects[0].value = '21';
    selects[0].dispatchEvent(new Event('change'));
    selects[1].value = '45';
    selects[1].dispatchEvent(new Event('change'));

    await fixture.whenStable();

    expect(dateInput.value).toBe('09/03/2027');
    expect(host.model().dt).toBe('2027-03-09T21:45');
  });
});

