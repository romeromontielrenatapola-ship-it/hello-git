import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { SqliteLocalService } from './sqlite-local.service';
import { Card, UserCollection } from '../models/card.model';

@Injectable({
  providedIn: 'root'
})
export class CardService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly sqlite = inject(SqliteLocalService);

  public readonly catalog = signal<Card[]>([]);
  public readonly collection = signal<UserCollection[]>([]);
  public readonly loading = signal<boolean>(false);

  public async fetchCatalog(): Promise<void> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('cards')
        .select('*')
        .order('rarity', { ascending: true });
      if (error) throw error;
      this.catalog.set(data as Card[]);
    } catch (err: any) {
      console.error('Error al cargar catálogo:', err.message);
    } finally {
      this.loading.set(false);
    }
  }

  public async fetchUserCollection(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('user_collection')
        .select('*, card:cards(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.collection.set(data as UserCollection[]);
    } catch (err: any) {
      console.error('Error al cargar colección:', err.message);
    } finally {
      this.loading.set(false);
    }
  }

  public async importPokemonFromApi(idOrName: string): Promise<boolean> {
    const user = this.auth.user();
    if (!user) return false;
    this.loading.set(true);

    try {
      // 1. Fetch from PokeAPI
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${idOrName.toLowerCase().trim()}`);
      if (!response.ok) throw new Error('Pokémon no encontrado en la API oficial.');
      const data = await response.json();

      // 2. Extract stats and map to TCG attributes
      const name = data.name.charAt(0).toUpperCase() + data.name.slice(1);
      const hp = data.stats.find((s: any) => s.stat.name === 'hp')?.base_stat ?? 60;
      const attack = data.stats.find((s: any) => s.stat.name === 'attack')?.base_stat ?? 40;
      const defense = data.stats.find((s: any) => s.stat.name === 'defense')?.base_stat ?? 10;
      
      // Determine element from type
      const primaryType = data.types[0]?.type.name ?? 'normal';
      const elementMap: Record<string, string> = {
        fire: 'fire', water: 'water', ice: 'water',
        electric: 'electric', grass: 'grass', bug: 'grass',
        ghost: 'dark', dark: 'dark', psychic: 'dark',
        dragon: 'colorless', flying: 'colorless', normal: 'colorless',
        ground: 'colorless', rock: 'colorless', steel: 'colorless', poison: 'grass', fighting: 'colorless'
      };
      const element = elementMap[primaryType] ?? 'colorless';

      // Rarity classification based on base experience
      const baseExp = data.base_experience ?? 100;
      let rarity = 'common';
      if (baseExp > 250) rarity = 'legendary';
      else if (baseExp > 180) rarity = 'ultra-rare';
      else if (baseExp > 120) rarity = 'rare';
      else if (baseExp > 80) rarity = 'uncommon';

      const imageUrl = data.sprites.other['official-artwork'].front_default ?? data.sprites.front_default ?? '/assets/cards/placeholder.png';
      const description = `Importado de PokeAPI. Tipo original: ${primaryType.toUpperCase()}. ID nacional #${data.id}.`;

      // 3. Register Card in Supabase cards catalog
      // First check if already exists to avoid duplicates
      const { data: existingCard, error: selectError } = await this.supabase.client
        .from('cards')
        .select('*')
        .eq('name', name)
        .maybeSingle();

      if (selectError) throw selectError;

      let cardId: string;

      if (existingCard) {
        cardId = existingCard.id;
      } else {
        const { data: newCard, error: insertError } = await this.supabase.client
          .from('cards')
          .insert({
            name,
            type: 'pokemon',
            element,
            rarity,
            hp,
            attack,
            defense,
            cost: Math.min(3, Math.max(1, Math.floor(attack / 30))),
            image_url: imageUrl,
            description
          })
          .select()
          .single();

        if (insertError) throw insertError;
        cardId = newCard.id;
      }

      // SQLite local persistence hook: save downloaded/consulted card
      try {
        const costVal = Math.min(3, Math.max(1, Math.floor(attack / 30)));
        await this.sqlite.query(
          `INSERT OR REPLACE INTO local_cards (id, name, type, element, rarity, hp, attack, defense, cost, image_url, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [cardId, name, 'pokemon', element, rarity, hp, attack, defense, costVal, imageUrl, description, new Date().toISOString()]
        );
      } catch (sqle) {
        console.error('Error al guardar en SQLite local:', sqle);
      }

      // 4. Add 4 copies of this card to player's collection
      // Check if already in user's collection
      const { data: existingColl, error: collError } = await this.supabase.client
        .from('user_collection')
        .select('*')
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .maybeSingle();

      if (collError) throw collError;

      if (existingColl) {
        // Increase quantity by 4
        const { error: updateError } = await this.supabase.client
          .from('user_collection')
          .update({ quantity: existingColl.quantity + 4 })
          .eq('id', existingColl.id);
        if (updateError) throw updateError;
      } else {
        // Insert new entry with 4 copies
        const { error: insertCollError } = await this.supabase.client
          .from('user_collection')
          .insert({
            user_id: user.id,
            card_id: cardId,
            quantity: 4
          });
        if (insertCollError) throw insertCollError;
      }

      // Reload user collection
      await this.fetchUserCollection();
      return true;
    } catch (err: any) {
      console.error('Error al importar desde PokeAPI:', err.message);
      return false;
    } finally {
      this.loading.set(false);
    }
  }
}
