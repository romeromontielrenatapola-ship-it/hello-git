import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  public readonly isLightTheme = signal<boolean>(false);

  constructor() {
    // Check if running in browser environment (SSR safe)
    if (typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem('theme-preference');
      if (savedPreference === 'light') {
        this.setLightTheme(true);
      } else {
        this.setLightTheme(false);
      }
    }
  }

  public toggleTheme(): void {
    this.setLightTheme(!this.isLightTheme());
  }

  public setLightTheme(light: boolean): void {
    this.isLightTheme.set(light);
    if (typeof window !== 'undefined') {
      const root = document.documentElement;
      if (light) {
        root.classList.add('light-theme');
        localStorage.setItem('theme-preference', 'light');
      } else {
        root.classList.remove('light-theme');
        localStorage.setItem('theme-preference', 'dark');
      }
    }
  }
}
