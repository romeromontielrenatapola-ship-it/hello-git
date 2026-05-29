export interface Profile {
  id: string;
  username: string;
  avatar_url?: string;
  xp: number;
  level: number;
  coins: number;
  created_at?: string;
}
