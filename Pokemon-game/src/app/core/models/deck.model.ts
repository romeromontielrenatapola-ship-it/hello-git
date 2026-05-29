import { Card } from './card.model';

export interface Deck {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  created_at?: string;
  cards_count?: number; // Calculated field
  deck_cards?: DeckCard[]; // Optional joined array of cards inside the deck
}

export interface DeckCard {
  id: string;
  deck_id: string;
  card_id: string;
  quantity: number;
  card?: Card; // Joined Card details
}
