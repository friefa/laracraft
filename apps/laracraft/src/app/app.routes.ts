import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./builds/build-list').then((m) => m.BuildListPage),
  },
  {
    path: 'build/:id/guide',
    loadComponent: () => import('./guide/guide-page').then((m) => m.GuidePage),
  },
  {
    path: 'build/:id',
    loadComponent: () => import('./editor/editor-page').then((m) => m.EditorPage),
  },
  {
    path: 'credits',
    loadComponent: () => import('./credits/credits').then((m) => m.CreditsPage),
  },
  { path: '**', redirectTo: '' },
];
