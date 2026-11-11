import { Component, effect, input, model, output, signal } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import {
  formatIsoDateToDdMmYyyy,
  nowIstDateTimeLocal,
  parseDdMmYyyy,
} from '../../core/validators';

@Component({
  selector: 'app-ist-datetime-field',
  template: `
    <div class="ist-dt-wrap" [class.is-disabled]="disabled()">
      <div class="date-input-box">
        <input
          type="text"
          inputmode="numeric"
          maxlength="10"
          placeholder="DD/MM/YYYY"
          [value]="dateText()"
          [disabled]="disabled()"
          (input)="onDateInput($event)"
          (blur)="touch.emit()"
          aria-label="Date in DD/MM/YYYY format"
        />
        <label class="cal-btn" [class.disabled]="disabled()" title="Pick from calendar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
            />
          </svg>
          <input
            type="date"
            class="native-date-overlay"
            tabindex="-1"
            [value]="isoDate()"
            [disabled]="disabled()"
            (change)="onCalendarPick($event)"
          />
        </label>
      </div>

      <div class="time-select-group" aria-label="24-hour time">
        <select
          [disabled]="disabled()"
          (change)="onHourChange($event)"
          (blur)="touch.emit()"
          aria-label="Hour (00 to 23)"
        >
          @for (h of hours; track h) {
            <option [value]="h" [selected]="hour() === h">{{ h }}</option>
          }
        </select>
        <span class="colon">:</span>
        <select
          [disabled]="disabled()"
          (change)="onMinuteChange($event)"
          (blur)="touch.emit()"
          aria-label="Minute (00 to 59)"
        >
          @for (m of minutes; track m) {
            <option [value]="m" [selected]="minute() === m">{{ m }}</option>
          }
        </select>
      </div>

      <button
        type="button"
        class="btn btn-secondary btn-sm now-btn"
        [disabled]="disabled()"
        (click)="setNow()"
        title="Set current IST date and 24-hour time"
      >
        Now
      </button>
    </div>
  `,
  styles: `
    .ist-dt-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .date-input-box {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1 1 135px;
      min-width: 125px;
    }
    .date-input-box input[type='text'] {
      padding-right: 34px;
    }
    .cal-btn {
      position: absolute;
      right: 6px;
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 5px;
      overflow: hidden;
    }
    .cal-btn:hover:not(.disabled) {
      background: var(--bg);
      color: var(--primary);
    }
    .cal-btn.disabled {
      opacity: 0.45;
      pointer-events: none;
    }
    .cal-btn svg {
      width: 17px;
      height: 17px;
      fill: currentColor;
      pointer-events: none;
    }
    .native-date-overlay {
      position: absolute;
      inset: 0;
      opacity: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
      border: 0;
      padding: 0;
    }
    .time-select-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
    }
    .time-select-group select {
      width: auto;
      min-width: 62px;
      padding: 9px 6px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .colon {
      font-weight: 700;
      color: var(--text-muted);
    }
    .now-btn {
      flex: 0 0 auto;
    }
    .is-disabled {
      opacity: 0.65;
    }
  `,
})
export class IstDatetimeField implements FormValueControl<string> {
  readonly value = model<string>('');
  readonly disabled = input<boolean>(false);
  readonly touch = output<void>();

  protected readonly dateText = signal('');
  protected readonly isoDate = signal('');
  protected readonly hour = signal('10');
  protected readonly minute = signal('00');

  protected readonly hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  protected readonly minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  private lastEmitted = '';

  constructor() {
    effect(() => {
      const ext = this.value();
      if (ext === this.lastEmitted) {
        return;
      }
      this.syncFromExternal(ext);
    });
  }

  private syncFromExternal(ext: string): void {
    const trimmed = (ext || '').trim();
    if (trimmed === '') {
      this.dateText.set('');
      this.isoDate.set('');
      this.hour.set('10');
      this.minute.set('00');
      return;
    }
    const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
    if (m) {
      this.isoDate.set(m[1]);
      this.dateText.set(formatIsoDateToDdMmYyyy(m[1]));
      this.hour.set(m[2]);
      this.minute.set(m[3]);
    }
  }

  protected onDateInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const raw = inputEl.value;

    // Auto-insert slashes when user types digits (e.g. 11112026 -> 11/11/2026)
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    if (inputEl.value !== formatted) {
      inputEl.value = formatted;
    }
    this.dateText.set(formatted);
    this.emitCurrent();
  }

  protected onCalendarPick(event: Event): void {
    const iso = (event.target as HTMLInputElement).value;
    if (!iso) return;
    this.isoDate.set(iso);
    this.dateText.set(formatIsoDateToDdMmYyyy(iso));
    this.emitCurrent();
    this.touch.emit();
  }

  protected onHourChange(event: Event): void {
    this.hour.set((event.target as HTMLSelectElement).value);
    if (this.dateText().trim() !== '') {
      this.emitCurrent();
    }
  }

  protected onMinuteChange(event: Event): void {
    this.minute.set((event.target as HTMLSelectElement).value);
    if (this.dateText().trim() !== '') {
      this.emitCurrent();
    }
  }

  protected setNow(): void {
    const now = nowIstDateTimeLocal();
    this.syncFromExternal(now);
    this.lastEmitted = now;
    this.value.set(now);
    this.touch.emit();
  }

  private emitCurrent(): void {
    const dt = this.dateText().trim();
    if (dt === '') {
      this.isoDate.set('');
      this.lastEmitted = '';
      this.value.set('');
      return;
    }
    const iso = parseDdMmYyyy(dt);
    if (!iso) {
      this.isoDate.set('');
      const invalidMarker = `INVALID:${dt}`;
      this.lastEmitted = invalidMarker;
      this.value.set(invalidMarker);
      return;
    }
    this.isoDate.set(iso);
    const nextVal = `${iso}T${this.hour()}:${this.minute()}`;
    this.lastEmitted = nextVal;
    this.value.set(nextVal);
  }
}
