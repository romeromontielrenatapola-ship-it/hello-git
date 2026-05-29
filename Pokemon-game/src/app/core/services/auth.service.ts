import { Injectable, PLATFORM_ID, inject, signal, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';
import { Profile } from '../models/profile.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  public readonly session = signal<any | null>(null);
  public readonly user = signal<any | null>(null);
  public readonly profile = signal<Profile | null>(null);
  public readonly loading = signal<boolean>(true);

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.loading.set(false);
      return;
    }

    try {
      // 1. Fetch initial session
      const { data: { session }, error } = await this.supabase.client.auth.getSession();
      if (error) throw error;

      if (session) {
        this.session.set(session);
        this.user.set(session.user);
        await this.loadProfile(session.user.id);
      }
    } catch (err: any) {
      console.error('Error al inicializar sesión:', err);
    } finally {
      this.loading.set(false);
    }

    // 2. Subscribe to auth changes
    this.supabase.client.auth.onAuthStateChange(async (event, session) => {
      // Wrap in zone to ensure change detection triggers in Angular
      this.zone.run(async () => {
        this.loading.set(true);
        if (session) {
          this.session.set(session);
          this.user.set(session.user);
          await this.loadProfile(session.user.id);
        } else {
          this.session.set(null);
          this.user.set(null);
          this.profile.set(null);
        }
        this.loading.set(false);
      });
    });
  }

  public async loadProfile(userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      this.profile.set(data as Profile);
    } catch (err: any) {
      console.error('Error al cargar perfil de entrenador:', err.message);
      this.toast.error('No se pudo sincronizar tu perfil de entrenador.');
    }
  }

  public async signUp(email: string, password: string, username: string, avatarUrl = '/assets/avatars/avatar_default.png'): Promise<boolean> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            avatar_url: avatarUrl
          }
        }
      });

      if (error) throw error;

      if (data.user && data.session) {
        this.toast.success('¡Registro exitoso! Perfil y mazo inicial creados.');
        this.router.navigate(['/dashboard']);
        return true;
      } else {
        this.toast.info('Registro iniciado. Por favor revisa tu correo electrónico para confirmar.', 6000);
        return true;
      }
    } catch (err: any) {
      this.toast.error(err.message || 'Error durante el registro.');
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  public async signIn(email: string, password: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.session) {
        this.toast.success('¡Sesión iniciada con éxito, Entrenador!');
        this.router.navigate(['/dashboard']);
        return true;
      }
      return false;
    } catch (err: any) {
      this.toast.error(err.message || 'Credenciales incorrectas o error al iniciar sesión.');
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  public async signOut(): Promise<void> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.client.auth.signOut();
      if (error) throw error;
      
      this.toast.info('Sesión cerrada. ¡Vuelve pronto, Entrenador!');
      this.router.navigate(['/login']);
    } catch (err: any) {
      this.toast.error(err.message || 'Error al cerrar sesión.');
    } finally {
      this.loading.set(false);
    }
  }
}
