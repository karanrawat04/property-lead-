import { Component, OnInit, inject, signal } from '@angular/core';
import { form, FormField, maxLength, minLength, pattern, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { extractApiError } from '../../core/api-error';
import { TagItem } from '../../core/models';

@Component({
  selector: 'app-tags',
  imports: [FormField],
  template: `
    <div class="page-header">
      <div>
        <h2 class="page-title">Tag Master</h2>
        <p class="page-subtitle">Create and manage inventory status tags (For Sale, For Rent, Sold, etc.) with descriptions</p>
      </div>
      <button class="btn btn-primary" (click)="openCreate()">+ Add Tag</button>
    </div>

    @if (feedback()) {
      <div class="alert" [class.alert-success]="!isError()" [class.alert-error]="isError()">
        {{ feedback() }}
      </div>
    }

    @if (loading()) {
      <div class="card"><p class="page-subtitle">Loading tags...</p></div>
    } @else if (tags().length === 0) {
      <div class="card"><div class="empty-state">No tags found. Click "+ Add Tag" to create your first tag.</div></div>
    } @else {
      <div class="card desktop-only">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tag</th>
                <th>Description</th>
                <th>Inventory Units</th>
                <th>Status</th>
                <th style="width: 160px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (tag of tags(); track tag.id) {
                <tr>
                  <td>
                    <span class="badge" [style.background]="tag.color + '20'" [style.color]="tag.color">
                      <span class="dot" [style.background]="tag.color"></span>
                      {{ tag.name }}
                    </span>
                  </td>
                  <td>{{ tag.description || '—' }}</td>
                  <td><strong>{{ tag.inventory_count ?? 0 }}</strong> unit(s)</td>
                  <td>
                    @if (tag.is_active) {
                      <span class="badge badge-green">Active</span>
                    } @else {
                      <span class="badge badge-slate">Inactive</span>
                    }
                  </td>
                  <td>
                    <div style="display:flex; gap:6px;">
                      <button class="btn btn-secondary btn-sm" (click)="openEdit(tag)">Edit</button>
                      <button class="btn btn-danger btn-sm" (click)="deleteTag(tag)">Delete</button>
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
          @for (tag of tags(); track tag.id) {
            <article class="mobile-card">
              <div class="mobile-card-head">
                <span class="badge" [style.background]="tag.color + '20'" [style.color]="tag.color">
                  <span class="dot" [style.background]="tag.color"></span>
                  {{ tag.name }}
                </span>
                @if (tag.is_active) {
                  <span class="badge badge-green">Active</span>
                } @else {
                  <span class="badge badge-slate">Inactive</span>
                }
              </div>

              <div class="mobile-card-meta">
                <div style="grid-column: 1 / -1;">
                  <span class="mobile-meta-label">Description</span>
                  <span>{{ tag.description || '—' }}</span>
                </div>
                <div>
                  <span class="mobile-meta-label">Inventory Units</span>
                  <strong>{{ tag.inventory_count ?? 0 }} unit(s)</strong>
                </div>
              </div>

              <div class="mobile-card-actions">
                <button class="btn btn-secondary btn-sm" (click)="openEdit(tag)">Edit</button>
                <button class="btn btn-danger btn-sm" (click)="deleteTag(tag)">Delete</button>
              </div>
            </article>
          }
        </div>
      </div>
    }

    @if (showModal()) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal-panel" style="max-width: 500px;" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingId() ? 'Edit Tag' : 'Create Tag' }}</h3>
            <button class="btn btn-secondary btn-sm" (click)="closeModal()">✕</button>
          </div>
          <form (submit)="saveTag(); $event.preventDefault()" novalidate>
            <div class="modal-body">
              @if (modalError()) {
                <div class="alert alert-error">{{ modalError() }}</div>
              }
              <div class="form-grid">
                <div class="form-group">
                  <label>Tag Name <span class="req">*</span></label>
                  <input type="text" [formField]="tagForm.name" placeholder="e.g. For Sale, Rent, Sold" />
                  @if (tagForm.name().touched() && tagForm.name().errors().length) {
                    <span class="field-error">{{ tagForm.name().errors()[0].message }}</span>
                  }
                </div>
                <div class="form-group">
                  <label>Badge Color</label>
                  <input type="color" [formField]="tagForm.color" style="height: 38px; padding: 3px;" />
                </div>
                <div class="form-group full">
                  <label>Description</label>
                  <textarea rows="3" [formField]="tagForm.description" placeholder="Describe when to apply this tag..."></textarea>
                </div>
                <div class="form-group full">
                  <label class="checkbox-row">
                    <input type="checkbox" [formField]="tagForm.is_active" />
                    Active (available in inventory dropdowns)
                  </label>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving...' : 'Save Tag' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: `
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
  `,
})
export class TagsComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly tags = signal<TagItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly showModal = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly feedback = signal('');
  protected readonly isError = signal(false);
  protected readonly modalError = signal('');

  protected readonly tagModel = signal({
    name: '',
    description: '',
    color: '#2563eb',
    is_active: true,
  });

  protected readonly tagForm = form(this.tagModel, (s) => {
    required(s.name, { message: 'Tag name is required.' });
    minLength(s.name, 2, { message: 'Tag name must be at least 2 characters.' });
    maxLength(s.name, 60, { message: 'Tag name cannot exceed 60 characters.' });
    required(s.color, { message: 'Color is required.' });
    pattern(s.color, /^#[0-9A-Fa-f]{6}$/, { message: 'Must be a valid hex color.' });
  });

  ngOnInit(): void {
    this.loadTags();
  }

  loadTags(): void {
    this.loading.set(true);
    this.api.getTags().subscribe({
      next: (res) => {
        this.loading.set(false);
        this.tags.set(res.data || []);
      },
      error: (err) => {
        this.loading.set(false);
        this.notify(extractApiError(err, 'Failed to load tags.'), true);
      },
    });
  }

  openCreate(): void {
    this.editingId.set(null);
    this.modalError.set('');
    this.tagModel.set({ name: '', description: '', color: '#2563eb', is_active: true });
    this.tagForm().reset();
    this.showModal.set(true);
  }

  openEdit(tag: TagItem): void {
    this.editingId.set(tag.id);
    this.modalError.set('');
    this.tagModel.set({
      name: tag.name,
      description: tag.description || '',
      color: tag.color || '#2563eb',
      is_active: !!tag.is_active,
    });
    this.tagForm().reset();
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  saveTag(): void {
    submit(this.tagForm, async () => {
      this.saving.set(true);
      this.modalError.set('');
      const raw = this.tagModel();
      const payload = {
        name: raw.name.trim(),
        description: raw.description.trim() || null,
        color: raw.color || '#2563eb',
        is_active: !!raw.is_active,
      };

      try {
        const res = this.editingId()
          ? await firstValueFrom(this.api.updateTag(this.editingId()!, payload))
          : await firstValueFrom(this.api.createTag(payload));
        this.saving.set(false);
        this.showModal.set(false);
        this.notify(res.message || 'Tag saved.', false);
        this.loadTags();
      } catch (err) {
        this.saving.set(false);
        this.modalError.set(extractApiError(err, 'Failed to save tag.'));
      }
    });
  }

  deleteTag(tag: TagItem): void {
    const count = Number(tag.inventory_count || 0);
    const msg =
      count > 0
        ? `Delete tag "${tag.name}"? It is currently assigned to ${count} inventory unit(s) and will be unassigned from them.`
        : `Delete tag "${tag.name}"?`;
    if (!confirm(msg)) return;

    this.api.deleteTag(tag.id).subscribe({
      next: () => {
        this.notify(`Tag "${tag.name}" deleted.`, false);
        this.loadTags();
      },
      error: (err) => {
        this.notify(extractApiError(err, 'Failed to delete tag.'), true);
      },
    });
  }

  private notify(msg: string, error: boolean): void {
    this.feedback.set(msg);
    this.isError.set(error);
  }
}
