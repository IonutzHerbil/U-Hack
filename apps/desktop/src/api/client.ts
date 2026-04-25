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
}

export const apiClient = new APIClient();
