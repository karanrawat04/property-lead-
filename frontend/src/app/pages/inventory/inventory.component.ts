import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { form, FormField, required, minLength, maxLength, pattern, validate, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { InventoryItem } from '../../core/models';
import { handleNumericKeydown, parseOptionalNonNegativeNumber } from '../../core/validators';
import { extractApiError } from '../../core/api-error';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, FormField],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Inventory Master</h1>
        <p class="page-subtitle">Text and metadata details of property units (unique unit numbers like 410 C, 322 B)</p>
      </div>
      <button class="btn btn-primary" (click)="openCreate()">+ Add Inventory</button>
    </div>

    @if (feedback()) {
      <div class="alert" [class.alert-success]="!isError()" [class.alert-error]="isError()">
        {{ feedback() }}
      </div>
    }

    <div class="card" style="margin-bottom: 16px;">
      <div class="toolbar" style="margin-bottom: 0;">
        <input
          type="text"
          class="toolbar-input"
          placeholder="Search unique code, 410 C, project..."
          [ngModel]="filterSearch()"
          (ngModelChange)="filterSearch.set($event)"
          (keyup.enter)="loadInventory()"
        />
        <select class="toolbar-select" [ngModel]="filterType()" (ngModelChange)="filterType.set($event); loadInventory()">
          <option value="">All Property Types</option>
          @for (pt of propertyTypes; track pt) {
            <option [value]="pt">{{ pt }}</option>
          }
        </select>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" (click)="loadInventory()">Search</button>
          <button class="btn btn-secondary" (click)="resetFilters()">Reset</button>
        </div>
      </div>
    </div>

    @if (loading()) {
      <div class="card"><p class="page-subtitle">Loading inventory...</p></div>
    } @else if (items().length === 0) {
      <div class="card"><div class="empty-state">No inventory units found. Click "+ Add Inventory" to add units like 410 C or 322 B.</div></div>
    } @else {
      <div class="card desktop-only">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Unique Code</th>
                <th>Unit No.</th>
                <th>Project / Title</th>
                <th>Type & Floor</th>
                <th>Area / Price</th>
                <th style="width: 140px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr>
                  <td><span class="mono-code">{{ item.unique_code }}</span></td>
                  <td><strong>{{ item.unit_number }}</strong></td>
                  <td>
                    <div style="font-weight: 600;">{{ item.title }}</div>
                    @if (item.location) {
                      <div class="page-subtitle">{{ item.location }}</div>
                    }
                    @if (item.notes) {
                      <div class="page-subtitle" style="margin-top:2px;">{{ item.notes }}</div>
                    }
                  </td>
                  <td>
                    <div>{{ item.property_type }}</div>
                    @if (item.floor_wing) {
                      <div class="page-subtitle">{{ item.floor_wing }}</div>
                    }
                  </td>
                  <td>
                    <div>{{ item.area_sqft ? item.area_sqft + ' sq.ft.' : '—' }}</div>
                    <div style="font-weight: 600;">{{ formatPrice(item.price) }}</div>
                  </td>
                  <td>
                    <div style="display:flex; gap:6px;">
                      <button class="btn btn-secondary btn-sm" (click)="openEdit(item)">Edit</button>
                      <button class="btn btn-danger btn-sm" (click)="deleteItem(item)">Delete</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="mobile-only">
        <div class="mobile-card-list">
          @for (item of items(); track item.id) {
            <article class="mobile-card">
              <div class="mobile-card-head">
                <div>
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span class="mono-code">{{ item.unique_code }}</span>
                    <strong style="font-size: 15.5px;">Unit {{ item.unit_number }}</strong>
                  </div>
                  <div style="font-weight: 600; margin-top: 3px;">{{ item.title }}</div>
                  @if (item.location) {
                    <div class="page-subtitle">{{ item.location }}</div>
                  }
                </div>
              </div>

              <div class="mobile-card-meta">
                <div>
                  <span class="mobile-meta-label">Price</span>
                  <strong>{{ formatPrice(item.price) }}</strong>
                </div>
                <div>
                  <span class="mobile-meta-label">Type / Area</span>
                  <span>{{ item.property_type }}{{ item.area_sqft ? ' · ' + item.area_sqft + ' sq.ft.' : '' }}</span>
                </div>
                @if (item.floor_wing) {
                  <div>
                    <span class="mobile-meta-label">Floor / Wing</span>
                    <span>{{ item.floor_wing }}</span>
                  </div>
                }
                @if (item.notes) {
                  <div style="grid-column: 1 / -1;">
                    <span class="mobile-meta-label">Notes</span>
                    <span>{{ item.notes }}</span>
                  </div>
                }
              </div>

              <div class="mobile-card-actions">
                <button class="btn btn-secondary btn-sm" (click)="openEdit(item)">Edit</button>
                <button class="btn btn-danger btn-sm" (click)="deleteItem(item)">Delete</button>
              </div>
            </article>
          }
        </div>
      </div>
    }

    @if (showModal()) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingId() ? 'Edit Inventory Unit' : 'Add Inventory Unit' }}</h3>
            <button class="btn btn-secondary btn-sm" (click)="closeModal()">✕</button>
          </div>
          <form (submit)="saveItem(); $event.preventDefault()" novalidate>
            <div class="modal-body">
              @if (modalError()) {
                <div class="alert alert-error">{{ modalError() }}</div>
              }
              <div class="form-grid">
                <div class="form-group">
                  <label>Unique Distinguishing Code <span class="req">*</span></label>
                  <input type="text" [formField]="invForm.unique_code" placeholder="e.g. T1-410C or INV-322B" />
                  <span class="field-hint">Must be unique across all inventory items (auto-uppercased).</span>
                  @if (invForm.unique_code().touched() && invForm.unique_code().errors().length) {
                    <span class="field-error">{{ invForm.unique_code().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Unit / Flat / Shop Number <span class="req">*</span></label>
                  <input type="text" [formField]="invForm.unit_number" placeholder="e.g. 410 C, 322 B" />
                  @if (invForm.unit_number().touched() && invForm.unit_number().errors().length) {
                    <span class="field-error">{{ invForm.unit_number().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Project / Property Title <span class="req">*</span></label>
                  <input type="text" [formField]="invForm.title" placeholder="e.g. Green Valley Residency" />
                  @if (invForm.title().touched() && invForm.title().errors().length) {
                    <span class="field-error">{{ invForm.title().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Property Type</label>
                  <select [formField]="invForm.property_type">
                    @for (pt of propertyTypes; track pt) {
                      <option [value]="pt">{{ pt }}</option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label>Floor / Wing / Block</label>
                  <input type="text" [formField]="invForm.floor_wing" placeholder="e.g. 4th Floor, Wing C" />
                </div>

                <div class="form-group">
                  <label>Area (sq.ft.)</label>
                  <input
                    type="text"
                    inputmode="decimal"
                    [formField]="invForm.area_sqft"
                    placeholder="e.g. 1250"
                    (keydown)="onNumberKey($event, true)"
                  />
                  @if (invForm.area_sqft().touched() && invForm.area_sqft().errors().length) {
                    <span class="field-error">{{ invForm.area_sqft().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group">
                  <label>Price (INR)</label>
                  <input
                    type="text"
                    inputmode="decimal"
                    [formField]="invForm.price"
                    placeholder="e.g. 6500000"
                    (keydown)="onNumberKey($event, true)"
                  />
                  @if (invForm.price().touched() && invForm.price().errors().length) {
                    <span class="field-error">{{ invForm.price().errors()[0].message }}</span>
                  }
                </div>

                <div class="form-group full">
                  <label>Location / Address</label>
                  <input type="text" [formField]="invForm.location" placeholder="e.g. Sector 45, Gurugram" />
                </div>

                <div class="form-group full">
                  <label>Notes (Text only — no photos stored)</label>
                  <textarea rows="2" [formField]="invForm.notes" placeholder="Facing, parking, key details, owner info..."></textarea>
                  @if (invForm.notes().touched() && invForm.notes().errors().length) {
                    <span class="field-error">{{ invForm.notes().errors()[0].message }}</span>
                  }
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : 'Save Inventory' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: ``,
})
export class InventoryComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly showModal = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly feedback = signal('');
  protected readonly isError = signal(false);
  protected readonly modalError = signal('');

  protected readonly filterSearch = signal('');
  protected readonly filterType = signal('');

  protected readonly propertyTypes = [
    'Apartment',
    'Villa',
    'Plot',
    'Commercial',
    'Office',
    'Shop',
    'Warehouse',
    'Other',
  ];

  protected readonly invModel = signal({
    unique_code: '',
    unit_number: '',
    title: '',
    property_type: 'Apartment',
    floor_wing: '',
    area_sqft: '',
    price: '',
    location: '',
    notes: '',
  });

  protected readonly invForm = form(this.invModel, (s) => {
    required(s.unique_code, { message: 'Unique Inventory Code is required.' });
    minLength(s.unique_code, 2, { message: 'Unique code must be at least 2 characters.' });
    maxLength(s.unique_code, 60, { message: 'Unique code cannot exceed 60 characters.' });
    pattern(s.unique_code, /^[A-Za-z0-9\-_\/\s]+$/, {
      message: 'Only letters, numbers, spaces, -, _, or / are allowed.',
    });
    required(s.unit_number, { message: 'Unit number is required (e.g. 410 C, 322 B).' });
    maxLength(s.unit_number, 60, { message: 'Unit number cannot exceed 60 characters.' });
    required(s.title, { message: 'Property / Project title is required.' });
    minLength(s.title, 2, { message: 'Title must be at least 2 characters.' });
    maxLength(s.title, 150, { message: 'Title cannot exceed 150 characters.' });

    maxLength(s.floor_wing, 80, { message: 'Floor/Wing cannot exceed 80 characters.' });
    maxLength(s.location, 180, { message: 'Location cannot exceed 180 characters.' });
    maxLength(s.notes, 1000, { message: 'Notes cannot exceed 1000 characters.' });

    validate(s.area_sqft, ({ value }) => {
      const parsed = parseOptionalNonNegativeNumber(value());
      if (Number.isNaN(parsed)) {
        return { kind: 'nonNegative', message: 'Area must be a non-negative number.' };
      }
      return undefined;
    });

    validate(s.price, ({ value }) => {
      const parsed = parseOptionalNonNegativeNumber(value());
      if (Number.isNaN(parsed)) {
        return { kind: 'nonNegative', message: 'Price must be a non-negative number.' };
      }
      return undefined;
    });
  });

  onNumberKey(event: KeyboardEvent, allowDecimal: boolean = false): void {
    handleNumericKeydown(event, allowDecimal);
  }

  ngOnInit(): void {
    this.loadInventory();
  }

  loadInventory(): void {
    this.loading.set(true);
    this.api
      .getInventory({
        search: this.filterSearch(),
        property_type: this.filterType(),
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.items.set(res.data || []);
        },
        error: (err) => {
          this.loading.set(false);
          this.notify(extractApiError(err, 'Failed to load inventory.'), true);
        },
      });
  }

  resetFilters(): void {
    this.filterSearch.set('');
    this.filterType.set('');
    this.loadInventory();
  }

  openCreate(): void {
    this.editingId.set(null);
    this.modalError.set('');
    this.invModel.set({
      unique_code: '',
      unit_number: '',
      title: '',
      property_type: 'Apartment',
      floor_wing: '',
      area_sqft: '',
      price: '',
      location: '',
      notes: '',
    });
    this.invForm().reset();
    this.showModal.set(true);
  }

  openEdit(item: InventoryItem): void {
    this.editingId.set(item.id);
    this.modalError.set('');
    this.invModel.set({
      unique_code: item.unique_code,
      unit_number: item.unit_number,
      title: item.title,
      property_type: item.property_type || 'Apartment',
      floor_wing: item.floor_wing || '',
      area_sqft: item.area_sqft !== null && item.area_sqft !== undefined ? String(item.area_sqft) : '',
      price: item.price !== null && item.price !== undefined ? String(item.price) : '',
      location: item.location || '',
      notes: item.notes || '',
    });
    this.invForm().reset();
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  saveItem(): void {
    submit(this.invForm, async () => {
      this.saving.set(true);
      this.modalError.set('');
      const v = this.invModel();
      const payload: Partial<InventoryItem> = {
        unique_code: v.unique_code.trim().toUpperCase(),
        unit_number: v.unit_number.trim(),
        title: v.title.trim(),
        property_type: v.property_type || 'Apartment',
        floor_wing: v.floor_wing.trim() || null,
        area_sqft: parseOptionalNonNegativeNumber(v.area_sqft),
        price: parseOptionalNonNegativeNumber(v.price),
        location: v.location.trim() || null,
        notes: v.notes.trim() || null,
      };

      try {
        const res = this.editingId()
          ? await firstValueFrom(this.api.updateInventory(this.editingId()!, payload))
          : await firstValueFrom(this.api.createInventory(payload));
        this.saving.set(false);
        this.showModal.set(false);
        this.notify(res.message || 'Inventory saved.', false);
        this.loadInventory();
      } catch (err) {
        this.saving.set(false);
        this.modalError.set(extractApiError(err, 'Failed to save inventory.'));
      }
    });
  }

  deleteItem(item: InventoryItem): void {
    if (!confirm(`Delete inventory unit ${item.unique_code} (${item.unit_number})?`)) return;
    this.api.deleteInventory(item.id).subscribe({
      next: () => {
        this.notify(`Deleted ${item.unique_code}.`, false);
        this.loadInventory();
      },
      error: (err) => {
        this.notify(extractApiError(err, 'Failed to delete inventory unit.'), true);
      },
    });
  }

  formatPrice(price: number | null): string {
    if (price === null || price === undefined) return '—';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);
  }

  private notify(msg: string, error: boolean): void {
    this.feedback.set(msg);
    this.isError.set(error);
  }
}
