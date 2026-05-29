export type MissionType = 'win_battle' | 'play_cards' | 'deal_damage';

export interface DailyMission {
  id: string;
  user_id: string;
  title: string;
  description: string;
  type: MissionType;
  reward_xp: number;
  reward_coins: number;
  target_value: number;
  current_value: number;
  is_completed: boolean;
  is_claimed: boolean;
  created_at?: string;
}
