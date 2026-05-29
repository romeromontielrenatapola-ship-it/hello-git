import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CardService } from '../../core/services/card.service';
import { AudioService } from '../../core/services/audio.service';
import { ToastService } from '../../core/services/toast.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { UserCollection } from '../../core/models/card.model';

type FilterType = 'all' | 'pokemon' | 'trainer' | 'energy';
type FilterRarity = 'all' | 'common' | 'uncommon' | 'rare' | 'ultra-rare' | 'legendary';

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [CommonModule, FormsModule, CardComponent],
  templateUrl: './collection.component.html',
  styleUrl: './collection.component.css'
})
export class CollectionComponent implements OnInit {
  public readonly cardService = inject(CardService);
  public readonly audio = inject(AudioService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  public searchQuery = signal('');
  public filterType = signal<FilterType>('all');
  public filterRarity = signal<FilterRarity>('all');

  // PokeAPI query
  public pokeQuery = signal('');
  public importing = signal(false);

  public readonly filteredCollection = computed(() => {
    let items = this.cardService.collection();
    const q = this.searchQuery().toLowerCase();
    const type = this.filterType();
    const rarity = this.filterRarity();

    if (q) items = items.filter(i => i.card?.name.toLowerCase().includes(q));
    if (type !== 'all') items = items.filter(i => i.card?.type === type);
    if (rarity !== 'all') items = items.filter(i => i.card?.rarity === rarity);
    return items;
  });

  ngOnInit(): void {
    this.cardService.fetchUserCollection();
  }

  setType(t: FilterType): void {
    this.audio.playClick();
    this.filterType.set(t);
  }

  setRarity(r: FilterRarity): void {
    this.audio.playClick();
    this.filterRarity.set(r);
  }

  onCardClick(col: UserCollection): void {
    this.audio.playDrawCard();
  }

  goBack(): void {
    this.audio.playClick();
    this.router.navigate(['/dashboard']);
  }

  public async importPokemon(): Promise<void> {
    const q = this.pokeQuery().trim();
    if (!q) {
      this.toast.error('Por favor ingresa un nombre o ID nacional de Pokémon.');
      return;
    }

    this.audio.playEnergyAttach();
    this.importing.set(true);
    const success = await this.cardService.importPokemonFromApi(q);
    this.importing.set(false);

    if (success) {
      this.toast.success(`¡Pokémon "${q}" sincronizado e importado con éxito! 4 copias añadidas.`);
      this.pokeQuery.set('');
    } else {
      this.toast.error(`Error al conectar con PokeAPI. Verifica que "${q}" sea un Pokémon válido.`);
    }
  }
}
