import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { getLeadSourceMeta, LEAD_SOURCES } from './lead-source.data';
import { LeadSourceIcon } from './lead-source-icon';

@Component({
  selector: 'app-lead-source-select',
  imports: [LeadSourceIcon],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close()',
  },
  template: `
    <div class="source-select">
      <button
        type="button"
        class="source-trigger"
        [class.open]="open()"
        [disabled]="disabled()"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        (click)="toggle()"
        (blur)="onTriggerBlur()"
      >
        @if (selectedMeta(); as m) {
          <span class="trigger-value">
            <app-lead-source-icon [icon]="m.icon" [color]="m.color" [bg]="m.bg" />
            <span>{{ m.label }}</span>
          </span>
        } @else {
          <span class="trigger-placeholder">— Select Source —</span>
        }
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      @if (open()) {
        <div class="source-menu" role="listbox" aria-label="Lead sources">
          <button
            type="button"
            class="source-option"
            role="option"
            [attr.aria-selected]="value() === ''"
            [class.active]="value() === ''"
            (click)="select('')"
          >
            <span class="trigger-placeholder">— None —</span>
          </button>

          @for (src of sources; track src.value) {
            <button
              type="button"
              class="source-option"
              role="option"
              [attr.aria-selected]="value() === src.value"
              [class.active]="value() === src.value"
              (click)="select(src.value)"
            >
              <app-lead-source-icon [icon]="src.icon" [color]="src.color" [bg]="src.bg" />
              <span>{{ src.label }}</span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .source-select {
      position: relative;
      width: 100%;
    }
    .source-trigger {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 10px;
      min-height: 38px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: #ffffff;
      color: var(--text);
      font-size: 14px;
      font-family: inherit;
      cursor: pointer;
      text-align: left;
    }
    .source-trigger.open,
    .source-trigger:focus-visible {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
    }
    .trigger-value {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .trigger-placeholder {
      color: var(--text-muted);
    }
    .chevron {
      width: 18px;
      height: 18px;
      fill: var(--text-muted);
      flex-shrink: 0;
    }
    .source-menu {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 4px);
      background: #ffffff;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      box-shadow: var(--shadow-md);
      max-height: 250px;
      overflow-y: auto;
      padding: 4px;
      z-index: 30;
    }
    .source-option {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 0;
      background: transparent;
      border-radius: 7px;
      font-family: inherit;
      font-size: 13.5px;
      color: var(--text);
      cursor: pointer;
      text-align: left;
    }
    .source-option:hover {
      background: var(--surface-alt);
    }
    .source-option.active {
      background: var(--primary-soft);
      font-weight: 600;
    }
    @media (max-width: 767px) {
      .source-trigger {
        min-height: 42px;
        font-size: 16px;
      }
      .source-option {
        min-height: 42px;
        font-size: 15px;
      }
    }
  `,
})
export class LeadSourceSelect implements FormValueControl<string> {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  readonly value = model<string>('');
  readonly disabled = input<boolean>(false);
  readonly touch = output<void>();

  protected readonly sources = LEAD_SOURCES;
  protected readonly open = signal(false);
  protected readonly selectedMeta = computed(() => getLeadSourceMeta(this.value()));

  protected toggle(): void {
    if (this.disabled()) return;
    this.open.update((o) => !o);
  }

  protected close(): void {
    if (this.open()) {
      this.open.set(false);
      this.touch.emit();
    }
  }

  protected select(val: string): void {
    this.value.set(val);
    this.open.set(false);
    this.touch.emit();
  }

  protected onTriggerBlur(): void {
    if (!this.open()) {
      this.touch.emit();
    }
  }

  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.hostEl.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}

