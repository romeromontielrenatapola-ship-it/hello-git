export type CardType = 'pokemon' | 'trainer' | 'energy';
export type CardElement = 'fire' | 'water' | 'electric' | 'grass' | 'dark' | 'light' | 'colorless';
export type CardRarity = 'common' | 'uncommon' | 'rare' | 'ultra-rare' | 'epic' | 'legendary';

export interface Card {
  id: string;
  name: string;
  type: CardType;
  element?: CardElement;
  rarity: CardRarity;
  hp?: number; // Only for pokemon
  attack?: number; // Base attack damage
  defense?: number; // Damage reduction
  cost?: number; // Energy cost required
  effect?: string; // Special trainer effects like 'HEAL_50', 'DRAW_2', etc.
  image_url?: string;
  description?: string;
  created_at?: string;
}

export interface UserCollection {
  id: string;
  user_id: string;
  card_id: string;
  quantity: number;
  card?: Card; // Optional joined Card data
  created_at?: string;
}
