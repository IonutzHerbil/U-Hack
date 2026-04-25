export interface SquadPlayer {
  player_id: number;
  name: string;
  position: string;
  overall: number;
  games_played: number;
  minutes: number;
  goals_per90?: number;
  assists_per90?: number;
  verdict?: string;
  strengths?: string[];
  weaknesses?: string[];
}

export interface AllPlayer {
  player_id: number;
  name: string;
  short_name?: string;
  nationality?: string;
  age?: number;
  position_meta?: string;
  position_name?: string;
  apps: number;
  minutes: number;
  match_count: number;
  stats: any;
}

export interface MatchRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
}

export interface TacticalDimension {
  key: string;
  label: string;
  score: number;
  description?: string;
  evidence?: string[];
}

export interface TeamOverview {
  generated_at: string;
  match_record: MatchRecord;
  squad_size: number;
  avg_squad_rating: number;
  top_strengths: Array<{ label: string; score: number }>;
  top_weaknesses: Array<{ label: string; score: number }>;
}

export interface Match {
  date: string;
  opponent: string;
  score: string;
  result: 'win' | 'draw' | 'loss';
  competition: string;
}

export interface APIConfig {
  baseURL: string;
  timeout: number;
}
