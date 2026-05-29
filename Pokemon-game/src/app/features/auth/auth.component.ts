import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { AudioService } from '../../core/services/audio.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css'
})
export class AuthComponent {
  public readonly authService = inject(AuthService);
  public readonly audio = inject(AudioService);
  public readonly theme = inject(ThemeService);

  public readonly isLogin = signal<boolean>(true);

  // Form Inputs
  public email = '';
  public password = '';
  public username = '';
  public avatarUrl = '/assets/avatars/avatar_default.png';

  // Available Avatars
  public readonly avatars = [
    { name: 'Red', url: '/assets/avatars/avatar_red.png' },
    { name: 'Blue', url: '/assets/avatars/avatar_blue.png' },
    { name: 'Green', url: '/assets/avatars/avatar_green.png' },
    { name: 'Yellow', url: '/assets/avatars/avatar_yellow.png' }
  ];

  public toggleMode(login: boolean): void {
    this.audio.playClick();
    this.isLogin.set(login);
  }

  public selectAvatar(url: string): void {
    this.audio.playClick();
    this.avatarUrl = url;
  }

  public async onSubmit(): Promise<void> {
    this.audio.playClick();

    if (!this.email || !this.password) return;

    if (this.isLogin()) {
      await this.authService.signIn(this.email, this.password);
    } else {
      if (!this.username) return;
      await this.authService.signUp(this.email, this.password, this.username, this.avatarUrl);
    }
  }
}
