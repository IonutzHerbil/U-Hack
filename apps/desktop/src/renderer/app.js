const { apiClient } = require('../api/client');

class App {
  constructor() {
    this.currentView = 'overview';
    this.players = [];
    this.matches = [];
    this.uclujPlayers = [];
    this.allPlayers = [];
    this.leaguePercentiles = null;
    this.targetProfile = {};
    this.draggingAxis = null;
    this.hoveredAxis = null;
    this.scoutCanvas = null;
    this.scoutCtx = null;
    this.COLOR_A = '#1ee8d4';
    this.COLOR_B = '#ff6b35';
    this.selectedA = null;
    this.selectedB = null;
    this.activePos = 'ALL';

    // Position group → position codes from the API
    this.POS_MAP = {
      ALL: null,
      GK:  ['gk'],
      CB:  ['cb','lcb','rcb'],
      FB:  ['lb','rb','lb5','rb5','lwb','rwb'],
      CM:  ['cm','cdm','lcmf','rcmf','ldmf','rdmf','lcmf3','amf','lamf','ramf','lm','rm'],
      FW:  ['lw','rw','lwf','rwf'],
      ST:  ['cf','ss'],
    };

    // Position-specific metric sets
    this.METRICS_BY_POS = {
      GK: [
        { key: 'savePct',    label: 'Save %' },
        { key: 'aerialPct',  label: 'Aerial %' },
        { key: 'exitPct',    label: 'Exit %' },
        { key: 'passAcc',    label: 'Pass Acc %' },
        { key: 'progPass90', label: 'Prog Passes/90' },
        { key: 'fwdPassPct', label: 'Fwd Pass %' },
        { key: 'possWon90',  label: 'Poss Won/90' },
        { key: 'defDuelPct', label: 'Def Duel %' },
      ],
      CB: [
        { key: 'aerialPct',  label: 'Aerial %' },
        { key: 'defDuelPct', label: 'Def Duel %' },
        { key: 'possWon90',  label: 'Poss Won/90' },
        { key: 'progPass90', label: 'Prog Passes/90' },
        { key: 'fwdPassPct', label: 'Fwd Pass %' },
        { key: 'passAcc',    label: 'Pass Acc %' },
        { key: 'intercept90',label: 'Intercepts/90' },
        { key: 'clearance90',label: 'Clearances/90' },
      ],
      FB: [
        { key: 'aerialPct',  label: 'Aerial %' },
        { key: 'defDuelPct', label: 'Def Duel %' },
        { key: 'possWon90',  label: 'Poss Won/90' },
        { key: 'progPass90', label: 'Prog Passes/90' },
        { key: 'cross90',    label: 'Crosses/90' },
        { key: 'crossAcc',   label: 'Cross Acc %' },
        { key: 'dribbles90', label: 'Dribbles/90' },
        { key: 'passAcc',    label: 'Pass Acc %' },
      ],
      CM: [
        { key: 'passAcc',    label: 'Pass Acc %' },
        { key: 'progPass90', label: 'Prog Passes/90' },
        { key: 'fwdPassPct', label: 'Fwd Pass %' },
        { key: 'keyPass90',  label: 'Key Passes/90' },
        { key: 'possWon90',  label: 'Poss Won/90' },
        { key: 'defDuelPct', label: 'Def Duel %' },
        { key: 'dribbles90', label: 'Dribbles/90' },
        { key: 'assists90',  label: 'Assists/90' },
      ],
      FW: [
        { key: 'goals90',    label: 'Goals/90' },
        { key: 'assists90',  label: 'Assists/90' },
        { key: 'xg90',       label: 'xG/90' },
        { key: 'keyPass90',  label: 'Key Passes/90' },
        { key: 'dribbles90', label: 'Dribbles/90' },
        { key: 'cross90',    label: 'Crosses/90' },
        { key: 'passAcc',    label: 'Pass Acc %' },
        { key: 'possWon90',  label: 'Poss Won/90' },
      ],
      ST: [
        { key: 'goals90',    label: 'Goals/90' },
        { key: 'xg90',       label: 'xG/90' },
        { key: 'assists90',  label: 'Assists/90' },
        { key: 'shots90',    label: 'Shots/90' },
        { key: 'aerialPct',  label: 'Aerial %' },
        { key: 'dribbles90', label: 'Dribbles/90' },
        { key: 'keyPass90',  label: 'Key Passes/90' },
        { key: 'possWon90',  label: 'Poss Won/90' },
      ],
      ALL: [
        { key: 'aerialPct',  label: 'Aerial %' },
        { key: 'defDuelPct', label: 'Def Duel %' },
        { key: 'possWon90',  label: 'Poss Won/90' },
        { key: 'progPass90', label: 'Prog Passes/90' },
        { key: 'fwdPassPct', label: 'Fwd Pass %' },
        { key: 'passAcc',    label: 'Pass Acc %' },
        { key: 'dribbles90', label: 'Dribbles/90' },
        { key: 'keyPass90',  label: 'Key Passes/90' },
      ],
    };
    this.comparisonMetrics = this.METRICS_BY_POS.ALL;
    this.init();
  }

  init() {
    this.setupNavigation();
    this.setupSearch();
    this.setupComparisonControls();
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
    } else if (viewName === 'comparison') {
      this.loadComparisonView();
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
    // Hero strip
    document.getElementById('heroPlayed').textContent  = record.played;
    document.getElementById('heroWins').textContent    = record.wins;
    document.getElementById('heroDraws').textContent   = record.draws;
    document.getElementById('heroLosses').textContent  = record.losses;
    document.getElementById('heroGF').textContent      = record.goals_for;
    document.getElementById('heroGA').textContent      = record.goals_against;
    document.getElementById('heroPts').textContent     = record.points ?? (record.wins * 3 + record.draws);
    document.getElementById('heroWinRate').textContent =
      `${record.win_rate_pct != null ? record.win_rate_pct : Math.round(record.wins / Math.max(record.played, 1) * 100)}%`;

    // Animated W/D/L result bar
    const n = record.played || 1;
    const wp = (record.wins   / n * 100).toFixed(1);
    const dp = (record.draws  / n * 100).toFixed(1);
    const lp = (record.losses / n * 100).toFixed(1);
    const bar = document.getElementById('resultBar');
    bar.innerHTML = `
      <div class="ov-rb-seg ov-rb-win"  style="width:${wp}%" title="Wins ${wp}%"></div>
      <div class="ov-rb-seg ov-rb-draw" style="width:${dp}%" title="Draws ${dp}%"></div>
      <div class="ov-rb-seg ov-rb-loss" style="width:${lp}%" title="Losses ${lp}%"></div>
    `;
    bar.title = `W ${wp}% · D ${dp}% · L ${lp}%`;

  }

  renderStrengths(strengths) {
    const el = document.getElementById('topStrengths');
    el.className = '';
    el.innerHTML = strengths.map((s, i) => {
      const pct = Math.min((s.score / 100) * 100, 100);
      return `
        <div class="ov-metric-row">
          <span class="ov-metric-rank ov-rank-str">${i + 1}</span>
          <span class="ov-metric-name">${s.label}</span>
          <div class="ov-metric-track">
            <div class="ov-metric-fill ov-fill-str" style="width:${pct}%"></div>
          </div>
          <span class="ov-metric-score ov-score-str">${s.score.toFixed(0)}</span>
        </div>`;
    }).join('');
  }

  renderWeaknesses(weaknesses) {
    const el = document.getElementById('topWeaknesses');
    el.className = '';
    el.innerHTML = weaknesses.map((w, i) => {
      const pct = Math.min((w.score / 100) * 100, 100);
      return `
        <div class="ov-metric-row">
          <span class="ov-metric-rank ov-rank-wk">${i + 1}</span>
          <span class="ov-metric-name">${w.label}</span>
          <div class="ov-metric-track">
            <div class="ov-metric-fill ov-fill-wk" style="width:${pct}%"></div>
          </div>
          <span class="ov-metric-score ov-score-wk">${w.score.toFixed(0)}</span>
        </div>`;
    }).join('');
  }

  renderTacticalProfile(profile) {
    const el = document.getElementById('tacticalProfile');
    el.className = 'ov-profile-grid';
    el.innerHTML = profile.map(dim => {
      const pct = Math.min(dim.score, 100);
      const tier = dim.tier || (pct >= 65 ? 'FORTE' : pct >= 45 ? 'OK' : 'SLAB');
      const tierColor = tier === 'FORTE' ? '#4ade80' : tier === 'OK' ? '#facc15' : '#f87171';
      const tierLabel = tier === 'FORTE' ? 'STRONG' : tier === 'OK' ? 'OK' : 'WEAK';
      return `
        <div class="ov-dim-card">
          <div class="ov-dim-top">
            <span class="ov-dim-name">${dim.label_en || dim.label}</span>
            <span class="ov-dim-tier" style="color:${tierColor}">${tierLabel}</span>
          </div>
          <div class="ov-dim-score-row">
            <span class="ov-dim-num" style="color:${tierColor}">${pct.toFixed(0)}</span>
            <span class="ov-dim-denom">/100</span>
          </div>
          <div class="ov-dim-track">
            <div class="ov-dim-fill" style="width:${pct}%;background:${tierColor}"></div>
          </div>
        </div>`;
    }).join('');
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

  setupComparisonControls() {
    // Position tabs
    document.getElementById('posTabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.pos-tab');
      if (!btn) return;
      document.querySelectorAll('.pos-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.activePos = btn.dataset.pos;
      this.leaguePercentiles = null;
      this.comparisonMetrics = this.METRICS_BY_POS[this.activePos] || this.METRICS_BY_POS.ALL;
      this.selectedA = null;
      this.selectedB = null;
      document.getElementById('selectedA').textContent = '—';
      document.getElementById('selectedB').textContent = '—';
      document.getElementById('searchA').value = '';
      document.getElementById('searchB').value = '';
      this.clearRadar();
      document.getElementById('comparisonBars').className = 'comparison-bars loading';
      document.getElementById('comparisonBars').textContent = 'Select two players to compare.';
      this.buildDropdown('A', '');
      this.buildDropdown('B', '');
      this.clearRadar();
    });

    // Scout reset button
    document.getElementById('scoutResetBtn')?.addEventListener('click', () => {
      this.initTargetProfile();
      this.drawScoutRadar();
      this.rankAndShowCandidates();
    });

    // Search inputs
    ['A', 'B'].forEach(side => {
      const input = document.getElementById(`search${side}`);
      const dropdown = document.getElementById(`dropdown${side}`);

      input?.addEventListener('focus', () => {
        this.buildDropdown(side, input.value);
        dropdown.classList.add('open');
      });
      input?.addEventListener('input', () => {
        this.buildDropdown(side, input.value);
        dropdown.classList.add('open');
      });
      document.addEventListener('click', e => {
        if (!input?.contains(e.target) && !dropdown?.contains(e.target)) {
          dropdown?.classList.remove('open');
        }
      });
    });
  }

  async loadComparisonView() {
    const bars = document.getElementById('comparisonBars');
    if (bars && this.uclujPlayers.length === 0) {
      bars.className = 'comparison-bars loading';
      bars.textContent = 'Loading player pool...';
    }

    try {
      if (this.uclujPlayers.length === 0) {
        const squad = await apiClient.getSquad();
        // Normalize U Cluj squad to a common shape
        this.uclujPlayers = squad
          .filter(p => (p.apps || 0) >= 5)
          .map(p => ({
            ...p,
            position_meta: p.position,
            stats: p.raw || {},
            team_label: 'U Cluj',
          }));
      }
      if (this.allPlayers.length === 0) {
        const uclujIds = new Set(this.uclujPlayers.map(p => p.player_id));
        const allFetched = await apiClient.getAllPlayers();
        this.allPlayers = allFetched.filter(p => !uclujIds.has(p.player_id) && (p.apps || p.match_count || 0) >= 5);
      }
      this.populateComparisonSelectors();
      this.renderComparison();
    } catch (error) {
      console.error('Failed to load comparison data:', error);
      if (bars) {
        bars.className = 'comparison-bars';
        bars.innerHTML = '<span style="color: var(--danger);">Failed to load players for comparison.</span>';
      }
    }
  }

  filteredPlayers(side) {
    const pool = side === 'A' ? this.uclujPlayers : this.allPlayers;
    const codes = this.POS_MAP[this.activePos];
    return [...pool]
      .filter(p => !codes || codes.includes((p.position_meta || '').toLowerCase()))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  buildDropdown(side, query) {
    const dropdown = document.getElementById(`dropdown${side}`);
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    const players = this.filteredPlayers(side).filter(p =>
      !q || (p.name || '').toLowerCase().includes(q)
    ).slice(0, 60);

    if (!players.length) {
      dropdown.innerHTML = '<div class="cmp-dropdown-empty">No players found</div>';
      return;
    }

    dropdown.innerHTML = players.map(p => {
      const pos = (p.position_meta || '-').toUpperCase();
      const isSelected = (side === 'A' && this.selectedA?.player_id === p.player_id) ||
                         (side === 'B' && this.selectedB?.player_id === p.player_id);
      return `<div class="cmp-dropdown-item${isSelected ? ' selected' : ''}" data-id="${p.player_id}">
        <span class="cmp-di-name">${p.name || 'Unknown'}</span>
        <span class="cmp-di-pos">${pos}</span>
      </div>`;
    }).join('');

    dropdown.querySelectorAll('.cmp-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = Number(item.dataset.id);
        const pool = side === 'A' ? this.uclujPlayers : this.allPlayers;
        const player = pool.find(p => p.player_id === id);
        if (!player) return;
        if (side === 'A') {
          this.selectedA = player;
          document.getElementById('selectedA').innerHTML =
            `<span style="color:${this.COLOR_A};font-weight:700">${player.name}</span>
             <span class="cmp-sel-pos">${(player.position_meta||'-').toUpperCase()}</span>`;
          this.initTargetProfile();
          this.setupScoutCanvas();
          this.drawScoutRadar();
          this.rankAndShowCandidates();
        } else {
          this.selectedB = player;
          document.getElementById('selectedB').innerHTML =
            `<span style="color:${this.COLOR_B};font-weight:700">${player.name}</span>
             <span class="cmp-sel-pos">${(player.position_meta||'-').toUpperCase()}</span>`;
        }
        document.getElementById(`search${side}`).value = '';
        dropdown.classList.remove('open');
        if (this.selectedA && this.selectedB) this.renderComparison();
      });
    });
  }

  populateComparisonSelectors() {
    this.buildDropdown('A', '');
    this.buildDropdown('B', '');
  }

  getPlayerComparisonStats(player) {
    const stats = player?.stats || player?.raw || {};
    const minutes = Math.max(1, player?.minutes || 0);
    const p90 = (v) => ((Number(v) || 0) * 90) / minutes;
    const pct = (num, den) => {
      const d = Number(den) || 0;
      return d > 0 ? ((Number(num) || 0) * 100) / d : 0;
    };
    return {
      aerialPct:   pct(stats.aerialDuelsWon, stats.aerialDuels),
      defDuelPct:  pct(stats.defensiveDuelsWon, stats.defensiveDuels),
      possWon90:   p90((Number(stats.opponentHalfRecoveries) || 0) + (Number(stats.counterpressingRecoveries) || 0)),
      progPass90:  p90(stats.successfulProgressivePasses || stats.progressivePasses),
      fwdPassPct:  pct(stats.successfulForwardPasses, stats.forwardPasses),
      passAcc:     pct(stats.successfulPasses, stats.passes),
      dribbles90:  p90(stats.successfulDribbles),
      keyPass90:   p90(stats.keyPasses),
      goals90:     p90(stats.goals),
      assists90:   p90(stats.assists),
      xg90:        p90(stats.xgShot),
      shots90:     p90(stats.shots),
      cross90:     p90(stats.crosses),
      crossAcc:    pct(stats.successfulCrosses, stats.crosses),
      intercept90: p90(stats.interceptions),
      clearance90: p90(stats.clearances),
      savePct:     pct(stats.gkSaves, stats.gkShotsAgainst),
      exitPct:     pct(stats.gkSuccessfulExits, stats.gkExits),
    };
  }

  computeLeaguePercentiles() {
    if (this.leaguePercentiles) return this.leaguePercentiles;
    const allStats = [...this.uclujPlayers, ...this.allPlayers].map(p => this.getPlayerComparisonStats(p));
    const percentiles = {};
    this.comparisonMetrics.forEach(m => {
      const values = allStats
        .map(s => s[m.key])
        .filter(v => isFinite(v) && v >= 0)
        .sort((a, b) => a - b);
      const idx = Math.floor(values.length * 0.95);
      percentiles[m.key] = Math.max(values[idx] || 1, 0.01);
    });
    this.leaguePercentiles = percentiles;
    return percentiles;
  }

  normalizeMetricValues(aStats, bStats) {
    const p = this.computeLeaguePercentiles();
    const normalized = {};
    this.comparisonMetrics.forEach(m => {
      normalized[m.key] = {
        aRaw: aStats[m.key],
        bRaw: bStats[m.key],
        a: Math.min((aStats[m.key] / p[m.key]) * 100, 100),
        b: Math.min((bStats[m.key] / p[m.key]) * 100, 100),
      };
    });
    return normalized;
  }

  renderComparison() {
    const bars = document.getElementById('comparisonBars');
    if (!bars) return;

    const playerA = this.selectedA;
    const playerB = this.selectedB;

    if (!playerA || !playerB || playerA.player_id === playerB.player_id) {
      bars.className = 'comparison-bars';
      bars.innerHTML = '<span style="color: var(--text-secondary);">Select two different players to compare.</span>';
      this.clearRadar();
      return;
    }

    const aStats = this.getPlayerComparisonStats(playerA);
    const bStats = this.getPlayerComparisonStats(playerB);
    const normalized = this.normalizeMetricValues(aStats, bStats);

    const nameA = playerA.name || 'Player A';
    const nameB = playerB.name || 'Player B';
    const posA = (playerA.position_meta || '-').toUpperCase();
    const posB = (playerB.position_meta || '-').toUpperCase();

    bars.className = 'comparison-bars';
    bars.innerHTML = `
      <div class="cmp-legend">
        <span class="cmp-legend-dot" style="background:${this.COLOR_A}"></span>
        <span class="cmp-legend-name" style="color:${this.COLOR_A}">${nameA}</span>
        <span class="cmp-legend-pos">${posA}</span>
        <span class="cmp-legend-dot" style="background:${this.COLOR_B};margin-left:16px"></span>
        <span class="cmp-legend-name" style="color:${this.COLOR_B}">${nameB}</span>
        <span class="cmp-legend-pos">${posB}</span>
      </div>
      ${this.comparisonMetrics.map(metric => {
        const item = normalized[metric.key];
        const fmtRaw = v => Number.isInteger(v) || v > 10 ? v.toFixed(0) : v.toFixed(2);
        return `
          <div class="cmp-bar-block">
            <div class="cmp-bar-header">
              <span class="cmp-bar-val" style="color:${this.COLOR_A}">${fmtRaw(item.aRaw)}</span>
              <span class="cmp-bar-label">${metric.label}</span>
              <span class="cmp-bar-val" style="color:${this.COLOR_B}">${fmtRaw(item.bRaw)}</span>
            </div>
            <div class="cmp-bar-row">
              <div class="cmp-bar-half cmp-bar-half--left">
                <div class="cmp-bar-fill" style="width:${item.a}%;background:${this.COLOR_A};opacity:0.85"></div>
              </div>
              <div class="cmp-bar-divider"></div>
              <div class="cmp-bar-half cmp-bar-half--right">
                <div class="cmp-bar-fill" style="width:${item.b}%;background:${this.COLOR_B};opacity:0.85"></div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    `;

    this.drawRadar(playerA, playerB, normalized);
  }

  clearRadar() {
    const canvas = document.getElementById('comparisonRadar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  drawRadar(playerA, playerB, normalized) {
    const canvas = document.getElementById('comparisonRadar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2 + 22;
    const maxR = 155;
    const levels = 5;
    const metrics = this.comparisonMetrics;
    const N = metrics.length;
    const step = (Math.PI * 2) / N;
    const CA = this.COLOR_A;
    const CB = this.COLOR_B;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, W, H);

    // ── concentric rings + ring % labels ──────────────────────────
    for (let l = 1; l <= levels; l++) {
      const r = (maxR / levels) * l;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + i * step;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = l === levels ? '#4a4a4a' : '#2a2a2a';
      ctx.lineWidth = l === levels ? 1.2 : 0.8;
      ctx.stroke();

      // % label on the top spoke
      const labelAngle = -Math.PI / 2;
      const lx = cx + Math.cos(labelAngle) * r + 4;
      const ly = cy + Math.sin(labelAngle) * r;
      ctx.fillStyle = '#555';
      ctx.font = '9px Segoe UI';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${l * 20}`, lx, ly);
    }

    // ── spokes ─────────────────────────────────────────────────────
    metrics.forEach((_, i) => {
      const a = -Math.PI / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
      ctx.strokeStyle = '#2e2e2e';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // ── draw polygon helper ────────────────────────────────────────
    const drawPolygon = (valuesMap, stroke, fill, dotColor) => {
      ctx.beginPath();
      metrics.forEach((m, i) => {
        const a = -Math.PI / 2 + i * step;
        const r = (valuesMap[m.key] / 100) * maxR;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // vertex dots
      metrics.forEach((m, i) => {
        const a = -Math.PI / 2 + i * step;
        const r = (valuesMap[m.key] / 100) * maxR;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();
        ctx.strokeStyle = '#0e0e0e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    };

    const aVals = {}, bVals = {};
    metrics.forEach(m => {
      aVals[m.key] = normalized[m.key].a;
      bVals[m.key] = normalized[m.key].b;
    });

    drawPolygon(bVals, CB, `rgba(255, 107, 53, 0.18)`, CB);
    drawPolygon(aVals, CA, `rgba(30, 232, 212, 0.18)`, CA);

    // ── axis labels ────────────────────────────────────────────────
    ctx.font = 'bold 11px Segoe UI';
    metrics.forEach((m, i) => {
      const a = -Math.PI / 2 + i * step;
      const pad = 22;
      const lx = cx + Math.cos(a) * (maxR + pad);
      const ly = cy + Math.sin(a) * (maxR + pad);
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      ctx.textAlign = cosA > 0.15 ? 'left' : cosA < -0.15 ? 'right' : 'center';
      ctx.textBaseline = sinA > 0.15 ? 'top' : sinA < -0.15 ? 'bottom' : 'middle';
      ctx.fillStyle = '#b0b0b0';
      ctx.fillText(m.label, lx, ly);
    });

    // ── legend ────────────────────────────────────────────────────
    const legend = [
      { name: playerA.name || 'Player A', pos: (playerA.position_meta || '-').toUpperCase(), color: CA },
      { name: playerB.name || 'Player B', pos: (playerB.position_meta || '-').toUpperCase(), color: CB },
    ];
    ctx.font = 'bold 12px Segoe UI';
    ctx.textBaseline = 'middle';
    let legendX = 14;
    const legendY = 18;
    legend.forEach(leg => {
      ctx.beginPath();
      ctx.arc(legendX + 6, legendY, 6, 0, Math.PI * 2);
      ctx.fillStyle = leg.color;
      ctx.fill();
      legendX += 16;
      ctx.fillStyle = leg.color;
      ctx.textAlign = 'left';
      ctx.fillText(leg.name, legendX, legendY);
      legendX += ctx.measureText(leg.name).width + 6;
      ctx.fillStyle = '#666';
      ctx.font = '11px Segoe UI';
      ctx.fillText(leg.pos, legendX, legendY);
      legendX += ctx.measureText(leg.pos).width + 24;
      ctx.font = 'bold 12px Segoe UI';
    });
  }

  // ── SCOUT ──────────────────────────────────────────────────────────────────

  initTargetProfile() {
    if (!this.selectedA) return;
    const p = this.computeLeaguePercentiles();
    const raw = this.getPlayerComparisonStats(this.selectedA);
    this.targetProfile = {};
    this.comparisonMetrics.forEach(m => {
      this.targetProfile[m.key] = Math.min((raw[m.key] / p[m.key]) * 100, 100);
    });
  }

  setupScoutCanvas() {
    if (this.scoutCanvas) return;
    const canvas = document.getElementById('scoutRadar');
    if (!canvas) return;
    this.scoutCanvas = canvas;
    this.scoutCtx = canvas.getContext('2d');
    canvas.addEventListener('mousedown', e => this.onScoutMouseDown(e));
    canvas.addEventListener('mousemove', e => this.onScoutMouseMove(e));
    canvas.addEventListener('mouseup',   e => this.onScoutMouseUp(e));
    canvas.addEventListener('mouseleave',() => { this.draggingAxis = null; this.hoveredAxis = null; this.drawScoutRadar(); });
  }

  _scoutGeometry() {
    const canvas = this.scoutCanvas;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2 + 20;
    const maxR = 148;
    const N = this.comparisonMetrics.length;
    const step = (Math.PI * 2) / N;
    return { W, H, cx, cy, maxR, N, step };
  }

  _canvasMouse(e) {
    const rect = this.scoutCanvas.getBoundingClientRect();
    const sx = this.scoutCanvas.width  / rect.width;
    const sy = this.scoutCanvas.height / rect.height;
    return { mx: (e.clientX - rect.left) * sx, my: (e.clientY - rect.top) * sy };
  }

  _hitAxis(mx, my) {
    const { cx, cy, maxR, N, step } = this._scoutGeometry();
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + i * step;
      const val = this.targetProfile[this.comparisonMetrics[i].key] ?? 50;
      const vx = cx + Math.cos(a) * (val / 100) * maxR;
      const vy = cy + Math.sin(a) * (val / 100) * maxR;
      if (Math.hypot(mx - vx, my - vy) < 18) return i;
    }
    return null;
  }

  onScoutMouseDown(e) {
    const { mx, my } = this._canvasMouse(e);
    this.draggingAxis = this._hitAxis(mx, my);
    if (this.draggingAxis !== null) this.scoutCanvas.style.cursor = 'grabbing';
  }

  onScoutMouseMove(e) {
    const { mx, my } = this._canvasMouse(e);
    if (this.draggingAxis !== null) {
      const { cx, cy, maxR, step } = this._scoutGeometry();
      const a = -Math.PI / 2 + this.draggingAxis * step;
      const projection = (mx - cx) * Math.cos(a) + (my - cy) * Math.sin(a);
      const newVal = Math.max(0, Math.min(100, (projection / maxR) * 100));
      this.targetProfile[this.comparisonMetrics[this.draggingAxis].key] = newVal;
      this.drawScoutRadar();
    } else {
      const hit = this._hitAxis(mx, my);
      if (hit !== this.hoveredAxis) {
        this.hoveredAxis = hit;
        this.scoutCanvas.style.cursor = hit !== null ? 'grab' : 'default';
        this.drawScoutRadar();
      }
    }
  }

  onScoutMouseUp() {
    if (this.draggingAxis !== null) {
      this.draggingAxis = null;
      this.scoutCanvas.style.cursor = this.hoveredAxis !== null ? 'grab' : 'default';
      this.rankAndShowCandidates();
    }
  }

  drawScoutRadar() {
    const canvas = this.scoutCanvas;
    if (!canvas) return;
    const ctx = this.scoutCtx;
    const { W, H, cx, cy, maxR, N, step } = this._scoutGeometry();
    const metrics = this.comparisonMetrics;
    const levels = 5;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, W, H);

    // rings + % labels
    for (let l = 1; l <= levels; l++) {
      const r = (maxR / levels) * l;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + i * step;
        i === 0 ? ctx.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r)
                : ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
      }
      ctx.closePath();
      ctx.strokeStyle = l === levels ? '#3a3a3a' : '#222';
      ctx.lineWidth = l === levels ? 1.2 : 0.7;
      ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.font = '9px Segoe UI';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${l * 20}`, cx + 4, cy - r);
    }

    // spokes
    metrics.forEach((_, i) => {
      const a = -Math.PI / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
      ctx.strokeStyle = '#252525';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // Player A reference polygon (teal, dashed)
    if (this.selectedA) {
      const p = this.computeLeaguePercentiles();
      const rawA = this.getPlayerComparisonStats(this.selectedA);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      metrics.forEach((m, i) => {
        const a = -Math.PI / 2 + i * step;
        const val = Math.min((rawA[m.key] / p[m.key]) * 100, 100);
        i === 0 ? ctx.moveTo(cx + Math.cos(a)*maxR*(val/100), cy + Math.sin(a)*maxR*(val/100))
                : ctx.lineTo(cx + Math.cos(a)*maxR*(val/100), cy + Math.sin(a)*maxR*(val/100));
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(30, 232, 212, 0.08)';
      ctx.strokeStyle = 'rgba(30, 232, 212, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Target polygon (white)
    ctx.beginPath();
    metrics.forEach((m, i) => {
      const a = -Math.PI / 2 + i * step;
      const val = this.targetProfile[m.key] ?? 50;
      i === 0 ? ctx.moveTo(cx + Math.cos(a)*maxR*(val/100), cy + Math.sin(a)*maxR*(val/100))
              : ctx.lineTo(cx + Math.cos(a)*maxR*(val/100), cy + Math.sin(a)*maxR*(val/100));
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Vertex dots + value labels
    metrics.forEach((m, i) => {
      const a = -Math.PI / 2 + i * step;
      const val = this.targetProfile[m.key] ?? 50;
      const vx = cx + Math.cos(a) * maxR * (val / 100);
      const vy = cy + Math.sin(a) * maxR * (val / 100);
      const isActive = this.draggingAxis === i;
      const isHovered = this.hoveredAxis === i;

      ctx.beginPath();
      ctx.arc(vx, vy, isActive ? 9 : isHovered ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#ffffff' : isHovered ? '#dddddd' : '#aaaaaa';
      ctx.fill();
      ctx.strokeStyle = '#0e0e0e';
      ctx.lineWidth = 2;
      ctx.stroke();

      // value label near vertex
      const labelPad = isActive || isHovered ? 22 : 0;
      if (isActive || isHovered) {
        const lx = cx + Math.cos(a) * (maxR * (val / 100) + labelPad);
        const ly = cy + Math.sin(a) * (maxR * (val / 100) + labelPad);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(val)}%`, lx, ly);
      }
    });

    // Axis labels
    ctx.font = 'bold 11px Segoe UI';
    metrics.forEach((m, i) => {
      const a = -Math.PI / 2 + i * step;
      const lx = cx + Math.cos(a) * (maxR + 22);
      const ly = cy + Math.sin(a) * (maxR + 22);
      ctx.textAlign = Math.cos(a) > 0.15 ? 'left' : Math.cos(a) < -0.15 ? 'right' : 'center';
      ctx.textBaseline = Math.sin(a) > 0.15 ? 'top' : Math.sin(a) < -0.15 ? 'bottom' : 'middle';
      ctx.fillStyle = this.hoveredAxis === i || this.draggingAxis === i ? '#ffffff' : '#999';
      ctx.fillText(m.label, lx, ly);
    });

    // Legend
    ctx.font = 'bold 11px Segoe UI';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.beginPath(); ctx.arc(14, 16, 5, 0, Math.PI*2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.fillStyle = '#ccc'; ctx.fillText('Target profile (drag to edit)', 24, 16);
    ctx.save(); ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(8, 34); ctx.lineTo(20, 34); ctx.strokeStyle = this.COLOR_A; ctx.lineWidth=2; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = this.COLOR_A;
    ctx.fillText(`${this.selectedA?.name || 'Player A'} (reference)`, 24, 34);
  }

  scorePlayer(player) {
    const p = this.computeLeaguePercentiles();
    const raw = this.getPlayerComparisonStats(player);
    let sumSq = 0;
    this.comparisonMetrics.forEach(m => {
      const playerVal = Math.min((raw[m.key] / p[m.key]) * 100, 100);
      const targetVal = this.targetProfile[m.key] ?? 50;
      sumSq += (targetVal - playerVal) ** 2;
    });
    const rms = Math.sqrt(sumSq / this.comparisonMetrics.length);
    return Math.max(0, Math.round(100 - rms));
  }

  rankAndShowCandidates() {
    const resultsEl = document.getElementById('scoutResults');
    if (!resultsEl) return;
    if (!this.selectedA || Object.keys(this.targetProfile).length === 0) {
      resultsEl.innerHTML = '<div class="scout-prompt">Select a U Cluj Player A to start scouting.</div>';
      return;
    }

    const scored = this.allPlayers.map(p => ({ player: p, score: this.scorePlayer(p) }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 4);

    const pPerc = this.computeLeaguePercentiles();

    resultsEl.innerHTML = `
      <div class="scout-results-header">
        <span>Top Candidates</span>
        <span class="scout-results-sub">vs target profile · ${this.activePos !== 'ALL' ? this.activePos : 'all positions'}</span>
      </div>
      ${top.map(({ player, score }, rank) => {
        const pos = (player.position_meta || '-').toUpperCase();
        const raw = this.getPlayerComparisonStats(player);
        const scoreColor = score >= 75 ? '#4ade80' : score >= 55 ? '#facc15' : '#f87171';
        const topMetrics = [...this.comparisonMetrics]
          .map(m => ({ label: m.label, val: Math.min((raw[m.key] / pPerc[m.key]) * 100, 100), raw: raw[m.key] }))
          .sort((a, b) => b.val - a.val)
          .slice(0, 3);
        return `
          <div class="scout-candidate">
            <div class="scout-cand-top">
              <span class="scout-cand-rank">#${rank + 1}</span>
              <span class="scout-cand-pos">${pos}</span>
              <span class="scout-cand-name">${player.name || 'Unknown'}</span>
              <span class="scout-cand-score" style="color:${scoreColor}">${score}%</span>
              <button class="scout-cand-btn" data-id="${player.player_id}">Compare →</button>
            </div>
            <div class="scout-cand-bars">
              ${topMetrics.map(stat => `
                <div class="scout-mini-bar-row">
                  <span class="scout-mini-label">${stat.label}</span>
                  <div class="scout-mini-track">
                    <div class="scout-mini-fill" style="width:${stat.val.toFixed(0)}%;background:${this.COLOR_B}"></div>
                    <div class="scout-mini-target" style="left:${(this.targetProfile[this.comparisonMetrics.find(m=>m.label===stat.label)?.key] ?? 50).toFixed(0)}%"></div>
                  </div>
                  <span class="scout-mini-val">${stat.val.toFixed(0)}</span>
                </div>`).join('')}
            </div>
          </div>
        `;
      }).join('')}
    `;

    resultsEl.querySelectorAll('.scout-cand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const player = this.allPlayers.find(p => p.player_id === id);
        if (!player) return;
        this.selectedB = player;
        document.getElementById('selectedB').innerHTML =
          `<span style="color:${this.COLOR_B};font-weight:700">${player.name}</span>
           <span class="cmp-sel-pos">${(player.position_meta||'-').toUpperCase()}</span>`;
        this.renderComparison();
        document.getElementById('comparisonView').scrollTop = document.getElementById('comparisonView').scrollHeight;
      });
    });
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
window.app = app;
