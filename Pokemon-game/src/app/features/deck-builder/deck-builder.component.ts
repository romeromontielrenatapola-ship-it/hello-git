import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DeckService } from '../../core/services/deck.service';
import { CardService } from '../../core/services/card.service';
import { AudioService } from '../../core/services/audio.service';
import { ToastService } from '../../core/services/toast.service';
import { SqliteLocalService } from '../../core/services/sqlite-local.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { Card, UserCollection } from '../../core/models/card.model';
import { Deck, DeckCard } from '../../core/models/deck.model';

type FilterType = 'all' | 'pokemon' | 'trainer' | 'energy';
type FilterRarity = 'all' | 'common' | 'uncommon' | 'rare' | 'ultra-rare' | 'legendary';

@Component({
  selector: 'app-deck-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, CardComponent],
  templateUrl: './deck-builder.component.html',
  styleUrl: './deck-builder.component.css'
})
export class DeckBuilderComponent implements OnInit {
  public readonly deckService = inject(DeckService);
  public readonly cardService = inject(CardService);
  public readonly audio = inject(AudioService);
  private readonly sqlite = inject(SqliteLocalService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  // Selector for active editing deck
  public readonly selectedDeckId = signal<string | null>(null);
  public readonly selectedDeckCards = signal<DeckCard[]>([]);

  // Filtering user collection pane
  public searchQuery = signal('');
  public filterType = signal<FilterType>('all');
  public filterRarity = signal<FilterRarity>('all');
  public filterElement = signal<string>('all');

  // Custom Modals states
  public readonly showCreateModal = signal<boolean>(false);
  public newDeckName: string = 'Mazo Personalizado';
  public readonly showDeleteModal = signal<boolean>(false);

  // Find currently editing deck entity
  public readonly selectedDeck = computed(() => {
    return this.deckService.decks().find(d => d.id === this.selectedDeckId()) || null;
  });

  // Calculate total cards currently in the selected deck
  public readonly totalCards = computed(() => {
    return this.selectedDeckCards().reduce((sum, dc) => sum + dc.quantity, 0);
  });

  // Check if current deck is valid (minimum 10 cards)
  public readonly isDeckValid = computed(() => {
    return this.totalCards() >= 10;
  });

  // Dedicated computed list for energy cards in the collection
  public readonly energyCollection = computed(() => {
    return this.cardService.collection().filter(i => i.card?.type === 'energy');
  });

  // Filters user collection to show cards they own
  public readonly filteredCollection = computed(() => {
    let items = this.cardService.collection();
    const q = this.searchQuery().toLowerCase();
    const type = this.filterType();
    const rarity = this.filterRarity();
    const element = this.filterElement();

    if (q) items = items.filter(i => i.card?.name.toLowerCase().includes(q));
    if (type !== 'all') items = items.filter(i => i.card?.type === type);
    if (rarity !== 'all') items = items.filter(i => i.card?.rarity === rarity);
    if (element !== 'all') items = items.filter(i => i.card?.element === element);
    return items;
  });

  // Maps card id to quantity in the current selected deck for visual aids
  public readonly cardQuantitiesInDeck = computed(() => {
    const map: Record<string, number> = {};
    for (const dc of this.selectedDeckCards()) {
      map[dc.card_id] = dc.quantity;
    }
    return map;
  });

  async ngOnInit(): Promise<void> {
    this.audio.playClick();
    this.deckService.loading.set(true);
    await Promise.all([
      this.deckService.fetchDecks(),
      this.cardService.fetchUserCollection()
    ]);
    
    // Select the active deck initially if it exists, or the first deck
    const decks = this.deckService.decks();
    const active = decks.find(d => d.is_active) ?? decks[0] ?? null;
    if (active) {
      await this.selectDeck(active.id);
    } else {
      this.deckService.loading.set(false);
    }
  }

  private async syncTempDeckToSqlite(): Promise<void> {
    const deckId = this.selectedDeckId();
    if (!deckId) return;

    try {
      // Clear existing temp_deck items for this deck_id
      await this.sqlite.query(`DELETE FROM temp_deck WHERE deck_id = ?;`, [deckId]);

      // Insert all current cards
      for (const dc of this.selectedDeckCards()) {
        await this.sqlite.query(
          `INSERT INTO temp_deck (deck_id, card_id, quantity) VALUES (?, ?, ?);`,
          [deckId, dc.card_id, dc.quantity]
        );
      }
    } catch (sqle) {
      console.error('Error al sincronizar temp_deck en SQLite local:', sqle);
    }
  }

  public async selectDeck(deckId: string): Promise<void> {
    this.audio.playClick();
    this.selectedDeckId.set(deckId);
    this.deckService.loading.set(true);
    const cards = await this.deckService.fetchDeckCards(deckId);
    this.selectedDeckCards.set(cards);
    await this.syncTempDeckToSqlite();
    this.deckService.loading.set(false);
  }

  public openCreateModal(): void {
    console.log('openCreateModal executed - opening custom creation modal');
    this.audio.playClick();
    this.newDeckName = 'Mazo Personalizado';
    this.showCreateModal.set(true);
  }

  public closeCreateModal(): void {
    this.audio.playClick();
    this.showCreateModal.set(false);
  }

  public async confirmCreateDeck(): Promise<void> {
    const name = this.newDeckName.trim();
    console.log('confirmCreateDeck executed - name input:', name);
    if (!name) {
      this.toast.error('Por favor ingresa un nombre para el mazo.');
      return;
    }

    this.showCreateModal.set(false);
    this.deckService.loading.set(true);
    const newDeck = await this.deckService.createDeck(name);
    if (newDeck) {
      await this.selectDeck(newDeck.id);
    } else {
      this.deckService.loading.set(false);
    }
  }

  public openDeleteModal(): void {
    this.audio.playClick();
    const deck = this.selectedDeck();
    if (!deck) return;

    if (deck.is_active) {
      this.toast.error('No puedes eliminar tu mazo activo.');
      return;
    }
    this.showDeleteModal.set(true);
  }

  public closeDeleteModal(): void {
    this.audio.playClick();
    this.showDeleteModal.set(false);
  }

  public async confirmDeleteDeck(): Promise<void> {
    const deck = this.selectedDeck();
    if (!deck) return;

    this.showDeleteModal.set(false);
    this.deckService.loading.set(true);
    await this.deckService.deleteDeck(deck.id);
    
    // Select another deck
    const decks = this.deckService.decks();
    if (decks.length > 0) {
      await this.selectDeck(decks[0].id);
    } else {
      this.selectedDeckId.set(null);
      this.selectedDeckCards.set([]);
      this.deckService.loading.set(false);
    }
  }

  public async markActive(): Promise<void> {
    this.audio.playClick();
    const deck = this.selectedDeck();
    if (!deck) return;

    if (this.totalCards() < 10) {
      this.toast.error('Para activar este mazo debe contener al menos 10 cartas.');
      return;
    }

    this.deckService.loading.set(true);
    await this.deckService.setActiveDeck(deck.id);
    this.deckService.loading.set(false);
  }

  public async addCard(card: Card): Promise<void> {
    const deckId = this.selectedDeckId();
    if (!deckId) {
      this.toast.error('Por favor, selecciona o crea un mazo primero.');
      return;
    }

    // Get current copies in the deck
    const currentInDeck = this.cardQuantitiesInDeck()[card.id] ?? 0;

    // Check limit of 3 copies
    if (currentInDeck >= 3) {
      this.toast.warning('Límite del juego: Máximo 3 copias de una misma carta por mazo.');
      return;
    }

    // Find owned quantity in player collection
    const collectionItem = this.cardService.collection().find(c => c.card_id === card.id);
    const collectionQty = collectionItem?.quantity ?? 0;

    // Check if player has more copies available in their catalog
    if (currentInDeck >= collectionQty) {
      this.toast.warning(`No tienes más copias disponibles de ${card.name} en tu colección.`);
      return;
    }

    // Check deck maximum card limit (60 cards limit is standard but we enforce 60 max)
    if (this.totalCards() >= 60) {
      this.toast.warning('Límite del mazo alcanzado (Máximo 60 cartas). Quita algunas antes de agregar.');
      return;
    }

    this.audio.playDrawCard();
    
    // Add visually and trigger DB save
    this.deckService.loading.set(true);
    await this.deckService.upsertCardInDeck(deckId, card.id, currentInDeck + 1);
    
    // Reload cards
    const cards = await this.deckService.fetchDeckCards(deckId);
    this.selectedDeckCards.set(cards);
    await this.syncTempDeckToSqlite();
    this.deckService.loading.set(false);
  }

  public async removeCard(card: Card): Promise<void> {
    const deckId = this.selectedDeckId();
    if (!deckId) return;

    const currentInDeck = this.cardQuantitiesInDeck()[card.id] ?? 0;
    if (currentInDeck <= 0) return;

    this.audio.playClick();
    this.deckService.loading.set(true);

    if (currentInDeck === 1) {
      await this.deckService.removeCardFromDeck(deckId, card.id);
    } else {
      await this.deckService.upsertCardInDeck(deckId, card.id, currentInDeck - 1);
    }

    // Reload cards
    const cards2 = await this.deckService.fetchDeckCards(deckId);
    this.selectedDeckCards.set(cards2);
    await this.syncTempDeckToSqlite();
    this.deckService.loading.set(false);
  }

  public setType(t: FilterType): void {
    this.audio.playClick();
    this.filterType.set(t);
  }

  public setRarity(r: FilterRarity): void {
    this.audio.playClick();
    this.filterRarity.set(r);
  }

  public setElement(el: string): void {
    this.audio.playClick();
    this.filterElement.set(el);
  }

  public elementEmoji(element?: string): string {
    const map: Record<string, string> = {
      fire: '🔥', water: '💧', electric: '⚡', grass: '🌿',
      dark: '🌑', light: '☀️', colorless: '⭐'
    };
    return element ? (map[element] ?? '⭐') : '⭐';
  }

  public goBack(): void {
    this.audio.playClick();
    this.router.navigate(['/dashboard']);
  }
}
