import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { AudioService } from '../../core/services/audio.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-multiplayer-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multiplayer-lobby.component.html',
  styleUrl: './multiplayer-lobby.component.css'
})
export class MultiplayerLobbyComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  public readonly auth = inject(AuthService);
  public readonly audio = inject(AudioService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  public readonly rooms = signal<any[]>([]);
  public readonly loading = signal<boolean>(false);
  public readonly roomNameInput = signal<string>('');

  private pollInterval: any = null;

  ngOnInit(): void {
    this.audio.playClick();
    this.fetchRooms();
    // Poll rooms every 2.5 seconds to refresh lobby in real-time
    this.pollInterval = setInterval(() => this.fetchRooms(), 2500);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  public async fetchRooms(): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('multiplayer_rooms')
        .select('*, host_profile:profiles!player_host(*)')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.rooms.set(data || []);
    } catch (err: any) {
      console.error('Error al cargar salas:', err.message);
    }
  }

  public async createRoom(): Promise<void> {
    const user = this.auth.user();
    const profile = this.auth.profile();
    if (!user || !profile) return;

    const name = this.roomNameInput().trim();
    if (!name) {
      this.toast.error('Por favor ingresa un identificador de red para tu sala.');
      return;
    }

    this.audio.playEnergyAttach();
    this.loading.set(true);

    try {
      const { data, error } = await this.supabase.client
        .from('multiplayer_rooms')
        .insert({
          name,
          player_host: profile.id,
          status: 'waiting'
        })
        .select()
        .single();

      if (error) throw error;
      this.toast.success(`Sala "${name}" registrada en Supabase. Esperando rival...`);
      this.router.navigate(['/battle'], { queryParams: { roomId: data.id } });
    } catch (err: any) {
      this.toast.error('Error al registrar la sala en la nube.');
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  public async joinRoom(room: any): Promise<void> {
    const profile = this.auth.profile();
    if (!profile) return;

    if (room.player_host === profile.id) {
      // Re-enter their own room if host
      this.router.navigate(['/battle'], { queryParams: { roomId: room.id } });
      return;
    }

    this.audio.playEnergyAttach();
    this.loading.set(true);

    try {
      const { error } = await this.supabase.client
        .from('multiplayer_rooms')
        .update({
          player_guest: profile.id,
          status: 'active',
          current_turn: room.player_host // Host starts first
        })
        .eq('id', room.id);

      if (error) throw error;

      this.toast.success(`¡Enlace completado! Entrando a la arena multijugador.`);
      this.router.navigate(['/battle'], { queryParams: { roomId: room.id } });
    } catch (err: any) {
      this.toast.error('Falla al establecer enlace con la sala.');
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  public goBack(): void {
    this.audio.playClick();
    this.router.navigate(['/dashboard']);
  }
}
