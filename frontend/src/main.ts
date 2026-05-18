import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Apply saved theme on startup
const savedTheme = localStorage.getItem('im3_theme') || 'theme-blue';
document.body.classList.add(savedTheme);

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
