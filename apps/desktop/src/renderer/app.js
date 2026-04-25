const { apiClient } = require('../api/client');

class App {
  constructor() {
    this.currentView = 'overview';
    this.players = [];
    this.matches = [];
    this.init();
  }

  init() {
    this.setupNavigation();
    this.setupSearch();
    this.checkAPIConnection();
    this.loadOverview();
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const view = item.getAttribute('data-view');
        this.switchView(view);
      });
    });
  }

  setupSearch() {
    const searchInput = document.getElementById('playerSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterPlayers(e.target.value);
      });
    }
  }

  switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const view = document.getElementById(`${viewName}View`);
    const navItem = document.querySelector(`[data-view="${viewName}"]`);

    if (view) view.classList.add('active');
    if (navItem) navItem.classList.add('active');

    this.currentView = viewName;

    if (viewName === 'players' && this.players.length === 0) {
      this.loadPlayers();
    } else if (viewName === 'matches' && this.matches.length === 0) {
      this.loadMatches();
    }
  }

  async checkAPIConnection() {
    const statusIndicator = document.getElementById('apiStatus');
    const statusText = document.getElementById('apiStatusText');

    try {
      const isConnected = await apiClient.checkHealth();
      if (isConnected) {
        statusIndicator.classList.add('connected');
        statusText.textContent = 'Connected';
      } else {
        statusIndicator.classList.add('error');
        statusText.textContent = 'API Error';
      }
    } catch (error) {
      statusIndicator.classList.add('error');
      statusText.textContent = 'Disconnected';
      console.error('API connection failed:', error);
    }
  }

  async loadOverview() {
    try {
      const overview = await apiClient.getTeamOverview();
      this.renderMatchRecord(overview.match_record);
      this.renderStrengths(overview.top_strengths);
      this.renderWeaknesses(overview.top_weaknesses);

      const tacticalProfile = await apiClient.getTacticalProfile();
      this.renderTacticalProfile(tacticalProfile);
    } catch (error) {
      console.error('Failed to load overview:', error);
      this.showError('matchRecord', 'Failed to load data');
    }
  }

  renderMatchRecord(record) {
    const element = document.getElementById('matchRecord');
    element.className = '';
    element.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
        <div>
          <div class="stat-value">${record.played}</div>
          <div class="stat-label">Played</div>
        </div>
        <div>
          <div class="stat-value" style="color: var(--success);">${record.wins}</div>
          <div class="stat-label">Wins</div>
        </div>
        <div>
          <div class="stat-value" style="color: var(--warning);">${record.draws}</div>
          <div class="stat-label">Draws</div>
        </div>
        <div>
          <div class="stat-value" style="color: var(--danger);">${record.losses}</div>
          <div class="stat-label">Losses</div>
        </div>
      </div>
    `;
  }

  renderStrengths(strengths) {
    const element = document.getElementById('topStrengths');
    element.className = '';
    element.innerHTML = strengths.map(s => `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>${s.label}</span>
          <span style="font-weight: 600; color: var(--success);">${s.score.toFixed(1)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(s.score / 10) * 100}%;"></div>
        </div>
      </div>
    `).join('');
  }

  renderWeaknesses(weaknesses) {
    const element = document.getElementById('topWeaknesses');
    element.className = '';
    element.innerHTML = weaknesses.map(w => `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>${w.label}</span>
          <span style="font-weight: 600; color: var(--danger);">${w.score.toFixed(1)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(w.score / 10) * 100}%; background-color: var(--danger);"></div>
        </div>
      </div>
    `).join('');
  }

  renderTacticalProfile(profile) {
    const element = document.getElementById('tacticalProfile');
    element.className = '';
    element.innerHTML = profile.map(dim => `
      <div class="profile-bar">
        <div class="profile-label">${dim.label}</div>
        <div class="profile-value">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${(dim.score / 10) * 100}%;"></div>
          </div>
          <div class="progress-score">${dim.score.toFixed(1)}</div>
        </div>
      </div>
    `).join('');
  }

  async loadPlayers() {
    const tbody = document.getElementById('playersTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading players...</td></tr>';

    try {
      this.players = await apiClient.getSquad();
      this.renderPlayers(this.players);
    } catch (error) {
      console.error('Failed to load players:', error);
      tbody.innerHTML = '<tr><td colspan="7" style="color: var(--danger);">Failed to load players</td></tr>';
    }
  }

  renderPlayers(players) {
    const tbody = document.getElementById('playersTableBody');
    if (players.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">No players found</td></tr>';
      return;
    }

    tbody.innerHTML = players.map(p => `
      <tr>
        <td style="font-weight: 500;">${p.name || 'Unknown'}</td>
        <td>${p.position || '-'}</td>
        <td>${p.overall ? p.overall.toFixed(1) : '-'}</td>
        <td>${p.apps || 0}</td>
        <td>${p.raw ? p.raw.goals || 0 : 0}</td>
        <td>${p.raw ? p.raw.assists || 0 : 0}</td>
        <td>${p.minutes || 0}</td>
      </tr>
    `).join('');
  }

  filterPlayers(query) {
    const filtered = this.players.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.position && p.position.toLowerCase().includes(query.toLowerCase()))
    );
    this.renderPlayers(filtered);
  }

  async loadMatches() {
    const tbody = document.getElementById('matchesTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading match data...</td></tr>';

    try {
      const matchRecord = await apiClient.getMatchRecord();
      this.renderMatchRecordTable(matchRecord);
    } catch (error) {
      console.error('Failed to load matches:', error);
      tbody.innerHTML = '<tr><td colspan="5" style="color: var(--danger);">Failed to load match data</td></tr>';
    }
  }

  renderMatchRecordTable(record) {
    const tbody = document.getElementById('matchesTableBody');
    tbody.innerHTML = `
      <tr>
        <td style="font-weight: 600;">Total Played</td>
        <td colspan="4">${record.played}</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Wins</td>
        <td colspan="4" style="color: var(--success);">${record.wins}</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Draws</td>
        <td colspan="4" style="color: var(--warning);">${record.draws}</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Losses</td>
        <td colspan="4" style="color: var(--danger);">${record.losses}</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Goals For</td>
        <td colspan="4">${record.goals_for}</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Goals Against</td>
        <td colspan="4">${record.goals_against}</td>
      </tr>
    `;
  }

  showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.className = '';
      element.innerHTML = `<span style="color: var(--danger);">${message}</span>`;
    }
  }
}

const app = new App();
