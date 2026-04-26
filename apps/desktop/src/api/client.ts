import axios, { AxiosInstance } from 'axios';
import type { SquadPlayer, AllPlayer, TeamOverview, Match, TacticalDimension, APIConfig, MatchRecord } from '../types/api';

class APIClient {
  private client: AxiosInstance;
  private config: APIConfig = {
    baseURL: 'http://localhost:8000/api/v1',
    timeout: 10000,
  };

  constructor() {
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/ucluj/overview');
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  async getTeamOverview(): Promise<TeamOverview> {
    const response = await this.client.get<TeamOverview>('/ucluj/overview');
    return response.data;
  }

  async getSquad(): Promise<SquadPlayer[]> {
    const response = await this.client.get<SquadPlayer[]>('/ucluj/squad');
    return response.data;
  }

  async getPlayer(playerId: number): Promise<SquadPlayer> {
    const response = await this.client.get<SquadPlayer>(`/ucluj/squad/${playerId}`);
    return response.data;
  }

  async getMatchRecord(): Promise<MatchRecord> {
    const response = await this.client.get<MatchRecord>('/ucluj/match-record');
    return response.data;
  }

  async getTacticalProfile(): Promise<TacticalDimension[]> {
    const response = await this.client.get<TacticalDimension[]>('/ucluj/team-profile');
    return response.data;
  }

  async getAllPlayers(): Promise<AllPlayer[]> {
    const response = await this.client.get<AllPlayer[]>('/players/');
    return response.data;
  }

  async getTransferNeeds(): Promise<any[]> {
    try {
      const response = await this.client.get('/ucluj/transfer-needs');
      return response.data;
    } catch (error) {
      console.warn('Transfer needs endpoint not available, returning empty');
      return [];
    }
  }

  async getRecommendations(): Promise<any[]> {
    try {
      const response = await this.client.get('/recruitment/recommendations');
      return response.data;
    } catch (error) {
      console.warn('Recommendations endpoint not available, returning empty');
      return [];
    }
  }

  async searchTransfermarktPlayers(filters?: {
    age?: string;
    nationality?: string;
    position?: string;
    value?: string;
    league?: string;
  }): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (filters?.age) params.append('age', filters.age);
      if (filters?.nationality) params.append('nationality', filters.nationality);
      if (filters?.position) params.append('position', filters.position);
      if (filters?.value) params.append('value', filters.value);
      if (filters?.league) params.append('league', filters.league);

      // Use axios directly with full URL since scraper is not under /api/v1
      const response = await axios.get(`http://localhost:8000/api/scraper/players?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.warn('Transfermarkt scraper endpoint not available:', error);
      return { total: 0, players: [] };
    }
  }

  async getTransfermarktPlayerProfile(tmId: string): Promise<any> {
    try {
      // Use axios directly with full URL since scraper is not under /api/v1
      const response = await axios.get(`http://localhost:8000/api/scraper/player/${tmId}`);
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch player profile:', error);
      return null;
    }
  }
}

export const apiClient = new APIClient();
