import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'credits',
    loadComponent: () => import('./credits/credits').then((m) => m.CreditsPage),
  },
  { path: '**', redirectTo: '' },
];
