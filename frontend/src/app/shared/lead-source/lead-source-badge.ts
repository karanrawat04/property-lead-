import { Component, computed, input } from '@angular/core';
import { getLeadSourceMeta } from './lead-source.data';
import { LeadSourceIcon } from './lead-source-icon';

@Component({
  selector: 'app-lead-source-badge',
  imports: [LeadSourceIcon],
  template: `
    @if (meta(); as m) {
      <span class="source-pill" [style.color]="m.color" [style.background]="m.bg">
        <app-lead-source-icon [icon]="m.icon" [color]="m.color" [bg]="'transparent'" />
        <span>{{ m.label }}</span>
      </span>
    }
  `,
  styles: `
    .source-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px 2px 4px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
    }
  `,
})
export class LeadSourceBadge {
  readonly source = input<string | null | undefined>(null);
  protected readonly meta = computed(() => getLeadSourceMeta(this.source()));
}

