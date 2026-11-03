import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { isLang } from './i18n/lang';
import { LanguageService } from './i18n/language.service';

@Component({
  imports: [RouterOutlet, RouterLink, TranslocoPipe],
  selector: 'lc-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly language = inject(LanguageService);

  protected onLangChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isLang(value)) void this.language.use(value);
  }
}
