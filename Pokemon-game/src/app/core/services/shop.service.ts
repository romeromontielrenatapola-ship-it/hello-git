import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { Card } from '../models/card.model';

@Injectable({
  providedIn: 'root'
})
export class ShopService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  public readonly lastOpenedCards = signal<Card[]>([]);
  public readonly isOpening = signal<boolean>(false);

  /**
   * Ejecuta el RPC `open_pack` de Supabase
   * @param cost Costo del sobre (default 300)
   * @returns Lista de cartas obtenidas o null si falló
   */
  public async openPack(cost: number = 300): Promise<Card[] | null> {
    const user = this.auth.user();
    const profile = this.auth.profile();

    if (!user || !profile) {
      this.toast.error('Debes iniciar sesión para acceder a la tienda.');
      return null;
    }

    if (profile.coins < cost) {
      this.toast.error(`Monedas insuficientes. Necesitas ${cost} 🪙.`);
      return null;
    }

    this.isOpening.set(true);

    try {
      const { data, error } = await this.supabase.client.rpc('open_pack', {
        p_user_id: user.id,
        p_pack_cost: cost
      });

      if (error) throw error;

      // La función ya descontó monedas y añadió XP en la BD.
      // Recargamos el perfil real para reflejar valores actualizados.
      await this.auth.loadProfile(user.id);

      const pulledCards = Array.isArray(data) ? (data as Card[]) : [];
      this.lastOpenedCards.set(pulledCards);

      // Guardar en historial de recompensas
      if (pulledCards.length > 0) {
        const historyRows = pulledCards.map((card: Card) => ({
          user_id: user.id,
          card_id: card.id
        }));
        // Ignorar errores del historial — no bloquear el flujo
        this.supabase.client.from('rewards_history').insert(historyRows).then(() => {});
      }

      return pulledCards;
    } catch (err: any) {
      console.error('Error al abrir sobre:', err.message);
      this.toast.error(
        err.message.includes('Not enough')
          ? 'Monedas insuficientes.'
          : 'Ocurrió un error en la red.'
      );
      return null;
    } finally {
      this.isOpening.set(false);
    }
  }

  /**
   * Recupera el historial reciente de cartas obtenidas del último sobre
   */
  public async fetchRecentRewards(): Promise<any[]> {
    const user = this.auth.user();
    if (!user) return [];

    try {
      const { data, error } = await this.supabase.client
        .from('rewards_history')
        .select(`
          id,
          created_at,
          cards:card_id ( id, name, rarity, image_url )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        // Tabla no disponible — ignorar silenciosamente
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  }
}
