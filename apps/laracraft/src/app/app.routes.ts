import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./builds/build-list').then((m) => m.BuildListPage),
  },
  {
    // Placeholder until the editor page lands (M1).
    path: 'build/:id',
    loadComponent: () => import('./builds/build-placeholder').then((m) => m.BuildPlaceholderPage),
  },
  {
    path: 'credits',
    loadComponent: () => import('./credits/credits').then((m) => m.CreditsPage),
  },
  { path: '**', redirectTo: '' },
];
