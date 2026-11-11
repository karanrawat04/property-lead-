import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { LeadsComponent } from './pages/leads/leads.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'leads', component: LeadsComponent, canActivate: [authGuard] },
  {
    path: 'followups',
    loadComponent: () =>
      import('./pages/followups/followups.component').then((m) => m.FollowupsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'inventory',
    loadComponent: () =>
      import('./pages/inventory/inventory.component').then((m) => m.InventoryComponent),
    canActivate: [authGuard],
  },
  {
    path: 'tags',
    loadComponent: () =>
      import('./pages/tags/tags.component').then((m) => m.TagsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
    canActivate: [authGuard],
  },
  { path: '', pathMatch: 'full', redirectTo: 'leads' },
  { path: '**', redirectTo: 'leads' },
];
