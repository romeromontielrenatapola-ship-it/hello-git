import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShopService } from '../../../core/services/shop.service';
import { AudioService } from '../../../core/services/audio.service';
import { Card } from '../../../core/models/card.model';

type PackState = 'unopened' | 'tearing' | 'cards_down' | 'revealed';

interface VisualCard extends Card {
  isFlipped: boolean;
}

@Component({
  selector: 'app-pack-opener',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pack-opener.component.html',
  styleUrls: ['./pack-opener.component.css']
})
export class PackOpenerComponent {
  private readonly shop = inject(ShopService);
  private readonly audio = inject(AudioService);

  @Output() closed = new EventEmitter<void>();

  public state = signal<PackState>('unopened');
  public cards = signal<VisualCard[]>([]);
  public isOpening = this.shop.isOpening;

  public async openPack() {
    if (this.state() !== 'unopened') return;
    
    // Attempt to buy pack
    const pulledCards = await this.shop.openPack(300);
    
    if (pulledCards && pulledCards.length > 0) {
      this.state.set('tearing');
      this.audio.playPackTear();
      
      // Delay for tearing animation
      setTimeout(() => {
        this.cards.set(pulledCards.map(c => ({ ...c, isFlipped: false })));
        this.state.set('cards_down');
      }, 1500);
    }
  }

  public flipCard(index: number) {
    if (this.state() !== 'cards_down' && this.state() !== 'revealed') return;
    
    const currentCards = this.cards();
    if (currentCards[index].isFlipped) return;

    // Flip the card
    currentCards[index].isFlipped = true;
    this.cards.set([...currentCards]);
    
    // Play sound based on rarity
    this.audio.playReveal(currentCards[index].rarity);

    // Check if all are flipped
    if (currentCards.every(c => c.isFlipped)) {
      this.state.set('revealed');
    }
  }

  public close() {
    this.closed.emit();
  }
}
