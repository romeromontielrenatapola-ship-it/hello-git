import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { Deck, DeckCard } from '../models/deck.model';

@Injectable({
  providedIn: 'root'
})
export class DeckService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  public readonly decks = signal<Deck[]>([]);
  public readonly activeDeck = signal<Deck | null>(null);
  public readonly activeDeckCards = signal<DeckCard[]>([]);
  public readonly loading = signal<boolean>(false);

  public totalCards(deckCards: DeckCard[]): number {
    return deckCards.reduce((sum, dc) => sum + dc.quantity, 0);
  }

  public async fetchDecks(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('decks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.decks.set(data as Deck[]);
      const active = (data as Deck[]).find(d => d.is_active) ?? null;
      this.activeDeck.set(active);
      if (active) await this.fetchDeckCards(active.id);
    } catch (err: any) {
      console.error('Error al cargar mazos:', err.message);
    } finally {
      this.loading.set(false);
    }
  }

  public async fetchDeckCards(deckId: string): Promise<DeckCard[]> {
    try {
      const { data, error } = await this.supabase.client
        .from('deck_cards')
        .select('*, card:cards(*)')
        .eq('deck_id', deckId);
      if (error) throw error;
      this.activeDeckCards.set(data as DeckCard[]);
      return data as DeckCard[];
    } catch (err: any) {
      console.error('Error al cargar cartas del mazo:', err.message);
      return [];
    }
  }

  public async createDeck(name: string): Promise<Deck | null> {
    const user = this.auth.user();
    if (!user) return null;
    try {
      const { data, error } = await this.supabase.client
        .from('decks')
        .insert({ user_id: user.id, name, is_active: false })
        .select()
        .single();
      if (error) throw error;
      this.decks.update(prev => [data as Deck, ...prev]);
      this.toast.success(`Mazo "${name}" creado.`);
      return data as Deck;
    } catch (err: any) {
      this.toast.error('No se pudo crear el mazo.');
      return null;
    }
  }

  public async upsertCardInDeck(deckId: string, cardId: string, quantity: number): Promise<void> {
    if (quantity < 1 || quantity > 3) return;
    try {
      const { error } = await this.supabase.client
        .from('deck_cards')
        .upsert({ deck_id: deckId, card_id: cardId, quantity }, { onConflict: 'deck_id,card_id' });
      if (error) throw error;
    } catch (err: any) {
      this.toast.error('Error al actualizar carta del mazo.');
    }
  }

  public async removeCardFromDeck(deckId: string, cardId: string): Promise<void> {
    try {
      const { error } = await this.supabase.client
        .from('deck_cards')
        .delete()
        .eq('deck_id', deckId)
        .eq('card_id', cardId);
      if (error) throw error;
    } catch (err: any) {
      this.toast.error('Error al eliminar carta del mazo.');
    }
  }

  public async setActiveDeck(deckId: string): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    try {
      // Deactivate all decks
      await this.supabase.client
        .from('decks')
        .update({ is_active: false })
        .eq('user_id', user.id);
      // Activate selected
      await this.supabase.client
        .from('decks')
        .update({ is_active: true })
        .eq('id', deckId);
      await this.fetchDecks();
      this.toast.success('Mazo activo actualizado.');
    } catch (err: any) {
      this.toast.error('No se pudo cambiar el mazo activo.');
    }
  }

  public async deleteDeck(deckId: string): Promise<void> {
    try {
      const { error } = await this.supabase.client
        .from('decks')
        .delete()
        .eq('id', deckId);
      if (error) throw error;
      this.decks.update(prev => prev.filter(d => d.id !== deckId));
      this.toast.info('Mazo eliminado.');
    } catch (err: any) {
      this.toast.error('No se pudo eliminar el mazo.');
    }
  }
}
