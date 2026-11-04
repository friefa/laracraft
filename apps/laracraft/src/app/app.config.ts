import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { provideI18n } from './i18n/i18n.providers';

// Zoneless change detection is the Angular default; zone.js is intentionally not loaded.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    environment.hashRouting
      ? provideRouter(appRoutes, withComponentInputBinding(), withHashLocation())
      : provideRouter(appRoutes, withComponentInputBinding()),
    provideI18n(),
  ],
};
