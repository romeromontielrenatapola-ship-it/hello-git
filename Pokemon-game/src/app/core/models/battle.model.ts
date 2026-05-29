import { Card } from './card.model';

export type TurnOwner = 'player' | 'opponent';
export type TurnPhase = 'draw' | 'energy' | 'main' | 'battle' | 'end';
export type BattleStatus = 'active' | 'victory' | 'defeat';

export interface BattleCard {
  battleId: string; // Unique GUID for this specific instance in the match
  card: Card;
  currentHp: number; // For pokemon: changes during battle
  attachedEnergy: Card[]; // Array of attached Energy cards
  hasAttackedThisTurn: boolean;
  canEvolve?: boolean; // For future expansions
}

export interface PlayerState {
  name: string;
  avatarUrl: string;
  lp: number; // Life Points (Starts at 4000)
  deck: BattleCard[]; // Remaining cards to draw
  hand: BattleCard[]; // Cards currently in hand
  active: BattleCard | null; // Pokémon in active battle spot (Exactly 1)
  bench: (BattleCard | null)[]; // Benched Pokémon (Exactly 3 slots)
  discard: BattleCard[]; // Discarded/Fallen cards
  energyAttachedThisTurn: boolean; // Limit 1 energy attachment per turn
}

export interface BattleLogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'attack' | 'heal' | 'energy' | 'trainer' | 'system' | 'victory' | 'defeat';
}

export interface BattleState {
  player: PlayerState;
  opponent: PlayerState;
  turn: TurnOwner;
  phase: TurnPhase;
  status: BattleStatus;
  turnNumber: number;
  logs: BattleLogEntry[];
}
