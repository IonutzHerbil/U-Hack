const { apiClient } = require('../api/client');

class App {
  constructor() {
    this.currentView = 'overview';
    this.players = [];
    this.matches = [];
    this.uclujPlayers = [];
    this.allPlayers = [];
    this.filteredTransfermarktPlayers = [];
    this.tmSortState = null;
    this.leaguePercentiles = null;
    this.targetProfile = {};
    this.draggingAxis = null;
    this.hoveredAxis = null;
    this.scoutCanvas = null;
    this.scoutCtx = null;
    this.COLOR_A = '#fbbf24';
    this.COLOR_B = '#dc2626';
    this.selectedA = null;
    this.selectedB = null;
    this.activePos = 'ALL';

    // Pitch View State
    this.isPitchView = true;
    this.currentFormation = '4-3-3';
    this.showPitchStats = true;
    this.dragDropEnabled = false;
    this.startingEleven = [];
    this.substitutes = [];
    this.draggedPlayer = null;
    this.playerPositions = {};

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
    this.setupTableSorting();
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

  setupTableSorting() {
    this.currentSort = { column: null, direction: 'asc' };
    this.filteredPlayers = [];

    // Add click listeners to sortable headers
    setTimeout(() => {
      const headers = document.querySelectorAll('.data-table th.sortable');
      headers.forEach(header => {
        header.addEventListener('click', () => {
          const sortKey = header.getAttribute('data-sort');
          this.sortTable(sortKey);
        });
      });
    }, 100);
  }

  sortTable(column) {
    // Toggle direction if same column, otherwise reset to ascending
    if (this.currentSort.column === column) {
      this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSort.column = column;
      this.currentSort.direction = 'asc';
    }

    // Get the list to sort (filtered or all)
    const playersToSort = this.filteredPlayers.length > 0 ? this.filteredPlayers : this.players;

    // Sort the players
    const sorted = [...playersToSort].sort((a, b) => {
      let valA, valB;

      if (column === 'name') {
        valA = a.name || '';
        valB = b.name || '';
        return this.currentSort.direction === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (column === 'position') {
        valA = a.position || '';
        valB = b.position || '';
        return this.currentSort.direction === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (column === 'overall') {
        valA = a.overall || 0;
        valB = b.overall || 0;
      } else if (column === 'apps') {
        valA = a.apps || 0;
        valB = b.apps || 0;
      } else if (column === 'goals') {
        valA = a.raw?.goals || 0;
        valB = b.raw?.goals || 0;
      } else if (column === 'assists') {
        valA = a.raw?.assists || 0;
        valB = b.raw?.assists || 0;
      } else if (column === 'minutes') {
        valA = a.minutes || 0;
        valB = b.minutes || 0;
      } else if (column === 'goals90') {
        valA = (a.raw?.goals || 0) / Math.max((a.minutes || 1) / 90, 0.1);
        valB = (b.raw?.goals || 0) / Math.max((b.minutes || 1) / 90, 0.1);
      } else if (column === 'assists90') {
        valA = (a.raw?.assists || 0) / Math.max((a.minutes || 1) / 90, 0.1);
        valB = (b.raw?.assists || 0) / Math.max((b.minutes || 1) / 90, 0.1);
      }

      return this.currentSort.direction === 'asc' ? valA - valB : valB - valA;
    });

    // Update visual indicators
    document.querySelectorAll('.data-table th.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
    });
    const activeHeader = document.querySelector(`.data-table th[data-sort="${column}"]`);
    if (activeHeader) {
      activeHeader.classList.add(this.currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }

    this.renderPlayers(sorted);
  }

  filterTableByPosition(posGroup) {
    if (posGroup === 'ALL') {
      this.filteredPlayers = [];
      this.renderPlayers(this.players);
      return;
    }

    const posMap = {
      'GK': ['gk'],
      'DEF': ['cb', 'lcb', 'rcb', 'lb', 'rb', 'lb5', 'rb5', 'lwb', 'rwb'],
      'MID': ['cm', 'cdm', 'lcmf', 'rcmf', 'ldmf', 'rdmf', 'lcmf3', 'amf', 'lamf', 'ramf', 'lm', 'rm'],
      'FWD': ['lw', 'rw', 'lwf', 'rwf', 'cf', 'ss']
    };

    const validPositions = posMap[posGroup] || [];
    this.filteredPlayers = this.players.filter(p =>
      validPositions.some(pos => (p.position || '').toLowerCase().includes(pos))
    );

    this.renderPlayers(this.filteredPlayers);
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
    } else if (viewName === 'comparison') {
      this.loadComparisonView();
    } else if (viewName === 'scouting') {
      this.loadScoutingView();
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

    // Group dimensions by category using key matching
    const categoryKeys = {
      'ATTACK': ['combinatii_flancuri', 'joc_direct', 'contraatac_rapid'],
      'POSSESSION': ['combinatii_mijloc', 'joc_controlat', 'constructie_portar', 'minge_lunga'],
      'DEFENSE': ['pressing_retras', 'pressing_median', 'pressing_avansat', 'contrapressing', 'retragere_organizare']
    };

    let html = '';

    for (const [category, keys] of Object.entries(categoryKeys)) {
      const dimensions = profile.filter(dim => keys.includes(dim.key));

      if (dimensions.length === 0) continue;

      html += `<div class="tactical-category">
        <div class="tactical-category-header">${category}</div>
        <div class="tactical-category-items">`;

      dimensions.forEach(dim => {
        const pct = Math.min(dim.score, 100);
        const tier = dim.tier || (pct >= 65 ? 'FORTE' : pct >= 45 ? 'OK' : 'SLAB');
        const tierColor = tier === 'FORTE' ? '#fbbf24' : tier === 'OK' ? '#888888' : '#dc2626';
        const tierLabel = tier === 'FORTE' ? 'STRONG' : tier === 'OK' ? 'OK' : 'WEAK';

        html += `
          <div class="ov-dim-card">
            <span class="ov-dim-name">${dim.label_en || dim.label}</span>
            <span class="ov-dim-tier" style="color:${tierColor}">${tierLabel}</span>
            <div class="ov-dim-track">
              <div class="ov-dim-fill" style="width:${pct}%;background:${tierColor}"></div>
            </div>
            <span class="ov-dim-num">${pct.toFixed(0)}<span class="ov-dim-denom">/100</span></span>
          </div>`;
      });

      html += `</div></div>`;
    }

    el.innerHTML = html;
  }

  async loadPlayers() {
    console.log('=== loadPlayers START ===');
    const tbody = document.getElementById('playersTableBody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading">Loading players...</td></tr>';

    try {
      this.players = await apiClient.getSquad();
      console.log('Players loaded from API:', this.players.length);
      if (this.players.length > 0) {
        console.log('First player sample:', this.players[0]);
      }
      this.renderPlayers(this.players);

      // Initialize pitch view if active
      console.log('isPitchView:', this.isPitchView);
      if (this.isPitchView) {
        this.selectStartingEleven();
        this.assignPlayersToFormation();
        this.renderPitchView();
        this.renderSubstitutes();
      }
    } catch (error) {
      console.error('Failed to load players:', error);
      tbody.innerHTML = '<tr><td colspan="9" style="color: var(--danger);">Failed to load players</td></tr>';
    }
  }

  renderPlayers(players) {
    const tbody = document.getElementById('playersTableBody');
    if (players.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9">No players found</td></tr>';
      return;
    }

    // Update squad metrics
    this.updateSquadMetrics(players);

    tbody.innerHTML = players.map(p => {
      const goals = p.raw?.goals || 0;
      const assists = p.raw?.assists || 0;
      const mins = p.minutes || 0;
      const goals90 = mins > 0 ? (goals / (mins / 90)).toFixed(2) : '0.00';
      const assists90 = mins > 0 ? (assists / (mins / 90)).toFixed(2) : '0.00';

      // Color coding for performance
      const ratingColor = p.overall >= 7.0 ? 'var(--primary-color)' : p.overall < 6.0 ? 'var(--danger)' : 'var(--text-primary)';

      return `
      <tr>
        <td style="font-weight: 500;">${p.name || 'Unknown'}</td>
        <td>${p.position || '-'}</td>
        <td style="color: ${ratingColor};">${p.overall ? p.overall.toFixed(1) : '-'}</td>
        <td>${p.apps || 0}</td>
        <td>${goals}</td>
        <td>${assists}</td>
        <td>${mins}</td>
        <td style="color: var(--text-secondary);">${goals90}</td>
        <td style="color: var(--text-secondary);">${assists90}</td>
      </tr>
      `;
    }).join('');
  }

  updateSquadMetrics(players) {
    if (players.length === 0) return;

    const totalPlayers = players.length;
    const totalGoals = players.reduce((sum, p) => sum + (p.raw?.goals || 0), 0);
    const totalAssists = players.reduce((sum, p) => sum + (p.raw?.assists || 0), 0);
    const totalApps = players.reduce((sum, p) => sum + (p.apps || 0), 0);

    const playersWithRating = players.filter(p => p.overall);
    const avgRating = playersWithRating.length > 0
      ? (playersWithRating.reduce((sum, p) => sum + p.overall, 0) / playersWithRating.length).toFixed(1)
      : '-';

    // Update DOM
    const totalPlayersEl = document.getElementById('totalPlayers');
    const avgAgeEl = document.getElementById('avgAge');
    const avgRatingEl = document.getElementById('avgRating');
    const totalGoalsEl = document.getElementById('totalGoals');
    const totalAssistsEl = document.getElementById('totalAssists');

    if (totalPlayersEl) totalPlayersEl.textContent = totalPlayers;
    if (avgAgeEl) avgAgeEl.textContent = totalApps; // Show total apps instead of age
    if (avgRatingEl) avgRatingEl.textContent = avgRating;
    if (totalGoalsEl) totalGoalsEl.textContent = totalGoals;
    if (totalAssistsEl) totalAssistsEl.textContent = totalAssists;
  }

  filterPlayers(query) {
    const filtered = this.players.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.position && p.position.toLowerCase().includes(query.toLowerCase()))
    );
    this.renderPlayers(filtered);
  }

  // ===== PITCH VIEW METHODS =====

  getFormationPositions(formation) {
    // Horizontal pitch - left to right (GK on left, attackers on right)
    const formations = {
      '4-3-3': [
        { x: 10, y: 50, pos: 'GK' },
        // Defense
        { x: 25, y: 15, pos: 'LB' }, { x: 25, y: 38, pos: 'CB' }, { x: 25, y: 62, pos: 'CB' }, { x: 25, y: 85, pos: 'RB' },
        // Midfield
        { x: 50, y: 30, pos: 'CM' }, { x: 50, y: 50, pos: 'CM' }, { x: 50, y: 70, pos: 'CM' },
        // Attack
        { x: 75, y: 15, pos: 'LW' }, { x: 80, y: 50, pos: 'ST' }, { x: 75, y: 85, pos: 'RW' }
      ],
      '4-4-2': [
        { x: 10, y: 50, pos: 'GK' },
        { x: 25, y: 15, pos: 'LB' }, { x: 25, y: 38, pos: 'CB' }, { x: 25, y: 62, pos: 'CB' }, { x: 25, y: 85, pos: 'RB' },
        { x: 50, y: 15, pos: 'LM' }, { x: 50, y: 38, pos: 'CM' }, { x: 50, y: 62, pos: 'CM' }, { x: 50, y: 85, pos: 'RM' },
        { x: 78, y: 38, pos: 'ST' }, { x: 78, y: 62, pos: 'ST' }
      ],
      '3-5-2': [
        { x: 10, y: 50, pos: 'GK' },
        { x: 25, y: 25, pos: 'CB' }, { x: 25, y: 50, pos: 'CB' }, { x: 25, y: 75, pos: 'CB' },
        { x: 45, y: 10, pos: 'LWB' }, { x: 45, y: 33, pos: 'CM' }, { x: 45, y: 50, pos: 'CDM' }, { x: 45, y: 67, pos: 'CM' }, { x: 45, y: 90, pos: 'RWB' },
        { x: 75, y: 38, pos: 'ST' }, { x: 75, y: 62, pos: 'ST' }
      ],
      '4-2-3-1': [
        { x: 10, y: 50, pos: 'GK' },
        { x: 25, y: 15, pos: 'LB' }, { x: 25, y: 38, pos: 'CB' }, { x: 25, y: 62, pos: 'CB' }, { x: 25, y: 85, pos: 'RB' },
        { x: 42, y: 38, pos: 'CDM' }, { x: 42, y: 62, pos: 'CDM' },
        { x: 60, y: 15, pos: 'LW' }, { x: 60, y: 50, pos: 'CAM' }, { x: 60, y: 85, pos: 'RW' },
        { x: 80, y: 50, pos: 'ST' }
      ],
      '3-4-3': [
        { x: 10, y: 50, pos: 'GK' },
        { x: 25, y: 25, pos: 'CB' }, { x: 25, y: 50, pos: 'CB' }, { x: 25, y: 75, pos: 'CB' },
        { x: 48, y: 18, pos: 'LM' }, { x: 48, y: 42, pos: 'CM' }, { x: 48, y: 58, pos: 'CM' }, { x: 48, y: 82, pos: 'RM' },
        { x: 75, y: 20, pos: 'LW' }, { x: 80, y: 50, pos: 'ST' }, { x: 75, y: 80, pos: 'RW' }
      ],
      '4-1-4-1': [
        { x: 10, y: 50, pos: 'GK' },
        { x: 25, y: 15, pos: 'LB' }, { x: 25, y: 38, pos: 'CB' }, { x: 25, y: 62, pos: 'CB' }, { x: 25, y: 85, pos: 'RB' },
        { x: 42, y: 50, pos: 'CDM' },
        { x: 58, y: 15, pos: 'LM' }, { x: 58, y: 38, pos: 'CM' }, { x: 58, y: 62, pos: 'CM' }, { x: 58, y: 85, pos: 'RM' },
        { x: 80, y: 50, pos: 'ST' }
      ],
      '5-3-2': [
        { x: 10, y: 50, pos: 'GK' },
        { x: 25, y: 10, pos: 'LWB' }, { x: 25, y: 30, pos: 'CB' }, { x: 25, y: 50, pos: 'CB' }, { x: 25, y: 70, pos: 'CB' }, { x: 25, y: 90, pos: 'RWB' },
        { x: 52, y: 30, pos: 'CM' }, { x: 52, y: 50, pos: 'CM' }, { x: 52, y: 70, pos: 'CM' },
        { x: 78, y: 38, pos: 'ST' }, { x: 78, y: 62, pos: 'ST' }
      ]
    };
    return formations[formation] || formations['4-3-3'];
  }

  selectStartingEleven() {
    console.log('=== selectStartingEleven START ===');
    if (!this.players || this.players.length === 0) {
      console.error('No players available!');
      return;
    }

    console.log('Total players:', this.players.length);

    // Sort ALL players by overall rating
    const sorted = [...this.players].sort((a, b) => (b.overall || 0) - (a.overall || 0));

    // Initialize with top 11 as starting lineup
    this.startingEleven = sorted.slice(0, 11);

    // ALL remaining players are available as substitutes
    this.substitutes = sorted.slice(11);

    console.log('Starting eleven selected:', this.startingEleven.length);
    console.log('Substitutes available:', this.substitutes.length);
  }

  assignPlayersToFormation() {
    console.log('=== assignPlayersToFormation START ===');
    console.log('Formation:', this.currentFormation);
    console.log('All U Cluj players:', this.players.length);

    const positions = this.getFormationPositions(this.currentFormation);
    console.log('Formation positions:', positions);
    this.playerPositions = {};

    // Sort players by: 1) apps (most matches), 2) minutes, 3) overall rating
    // This gives us the "average starting 11" - players who actually play regularly
    const sorted = [...this.players].sort((a, b) => {
      const appsA = a.apps || 0;
      const appsB = b.apps || 0;

      if (appsB !== appsA) {
        return appsB - appsA; // More apps = higher priority
      }

      const minsA = a.minutes || 0;
      const minsB = b.minutes || 0;

      if (minsB !== minsA) {
        return minsB - minsA; // More minutes = higher priority
      }

      return (b.overall || 0) - (a.overall || 0); // Higher rating = higher priority
    });

    const availablePlayers = [...sorted];
    console.log('Available players count:', availablePlayers.length);
    console.log('Top 5 by playing time:', sorted.slice(0, 5).map(p => ({
      name: p.name,
      apps: p.apps,
      minutes: p.minutes,
      rating: p.overall?.toFixed(1)
    })));

    // Helper to match player to formation position
    const matchesPosition = (player, formationPos) => {
      if (!player.position) return false;
      const pos = player.position.toLowerCase();

      if (formationPos === 'GK') {
        return pos === 'gk';
      } else if (/CB|LB|RB|LWB|RWB/.test(formationPos)) {
        // Defenders
        return /^(cb|lcb|rcb|lb|rb|lwb|rwb|lb|rb)$/.test(pos);
      } else if (/CM|CDM|CAM|LM|RM/.test(formationPos)) {
        // Midfielders - include all variants: amf, lamf, ramf, dmf, ldmf, rdmf, etc
        return /^(cm|cdm|lcm|rcm|cam|lam|ram|amf|lamf|ramf|lm|rm|dmf|ldmf|rdmf|lcmf|rcmf)$/.test(pos);
      } else {
        // Forwards: ST, LW, RW
        return /^(st|cf|lw|rw|lwf|rwf|ss)$/.test(pos);
      }
    };

    // TWO-PASS ASSIGNMENT for better position matching

    // PASS 1: Assign players with exact position matches only
    positions.forEach((formationPos) => {
      const playerIndex = availablePlayers.findIndex(p => matchesPosition(p, formationPos.pos));

      if (playerIndex >= 0) {
        const player = availablePlayers.splice(playerIndex, 1)[0];
        console.log(`[EXACT] Assigned ${player.name} (${player.position}/${player.position_group}) to ${formationPos.pos}`);
        this.playerPositions[player.player_id] = { ...formationPos, player };
      }
    });

    console.log('After exact matching:', Object.keys(this.playerPositions).length, 'players assigned');
    console.log('Remaining players:', availablePlayers.length);

    // PASS 2: Fill remaining positions using position_group
    positions.forEach((formationPos) => {
      // Skip if already assigned
      const alreadyAssigned = Object.values(this.playerPositions).some(
        p => p.x === formationPos.x && p.y === formationPos.y
      );
      if (alreadyAssigned) return;

      let playerIndex = -1;

      if (formationPos.pos === 'GK') {
        playerIndex = availablePlayers.findIndex(p => p.position_group === 'GK');
      } else if (/CB|LB|RB|LWB|RWB/.test(formationPos.pos)) {
        playerIndex = availablePlayers.findIndex(p => p.position_group === 'DEF');
      } else if (/CM|CDM|CAM|LM|RM/.test(formationPos.pos)) {
        playerIndex = availablePlayers.findIndex(p => p.position_group === 'MID');
      } else {
        playerIndex = availablePlayers.findIndex(p => p.position_group === 'ATT' || p.position_group === 'FWD');
      }

      if (playerIndex >= 0) {
        const player = availablePlayers.splice(playerIndex, 1)[0];
        console.log(`[GROUP] Assigned ${player.name} (${player.position}/${player.position_group}) to ${formationPos.pos}`);
        this.playerPositions[player.player_id] = { ...formationPos, player };
      } else if (availablePlayers.length > 0) {
        // Last resort: take any available player
        const player = availablePlayers.shift();
        console.log(`[FALLBACK] Assigned ${player.name} (${player.position}/${player.position_group}) to ${formationPos.pos}`);
        this.playerPositions[player.player_id] = { ...formationPos, player };
      }
    });

    console.log('Final playerPositions:', Object.keys(this.playerPositions).length, 'players assigned');
    console.log('Remaining available players:', availablePlayers.length);
    console.log('=== assignPlayersToFormation END ===');
  }

  renderPitchView() {
    const pitchPlayers = document.getElementById('pitchPlayers');
    if (!pitchPlayers) return;

    pitchPlayers.innerHTML = '';

    // Attach container-level drop handlers once
    if (!this._pitchDropAttached) {
      this.setupPitchDropZone();
      this._pitchDropAttached = true;
    }

    Object.values(this.playerPositions).forEach(({ x, y, player }) => {
      const playerCard = document.createElement('div');
      playerCard.className = 'player-card' + (this.dragDropEnabled ? ' draggable' : '');
      playerCard.dataset.playerId = player.player_id;
      playerCard.style.left = x + '%';
      playerCard.style.top = y + '%';

      const rating = player.overall ? player.overall.toFixed(1) : '-';
      const goals = player.raw?.goals || 0;
      const assists = player.raw?.assists || 0;
      const apps = player.apps || 0;
      const strengths = player.strengths || [];
      const weaknesses = player.weaknesses || [];

      playerCard.innerHTML = `
        <div class="player-card-inner">
          <div class="player-card-rating">${rating}</div>
          <div class="player-card-name" title="${player.name || 'Unknown'}">${player.name || 'Unknown'}</div>
          <div class="player-card-position">${player.position || '-'}</div>
          ${this.showPitchStats ? `
            <div class="player-card-stats">
              <div class="player-stat"><span class="player-stat-label">G:</span><span class="player-stat-value">${goals}</span></div>
              <div class="player-stat"><span class="player-stat-label">A:</span><span class="player-stat-value">${assists}</span></div>
              <div class="player-stat"><span class="player-stat-label">Apps:</span><span class="player-stat-value">${apps}</span></div>
            </div>
            ${strengths.length > 0 ? `<div class="player-card-traits"><div class="player-strengths" title="${strengths.join(', ')}"><span class="trait-icon">💪</span> ${strengths.slice(0, 2).join(', ')}</div></div>` : ''}
            ${weaknesses.length > 0 ? `<div class="player-card-traits"><div class="player-weaknesses" title="${weaknesses.join(', ')}"><span class="trait-icon">⚠️</span> ${weaknesses.slice(0, 2).join(', ')}</div></div>` : ''}
          ` : ''}
        </div>
      `;

      let clickStartTime = 0, clickStartX = 0, clickStartY = 0;
      playerCard.addEventListener('mousedown', (e) => {
        clickStartTime = Date.now(); clickStartX = e.clientX; clickStartY = e.clientY;
      });
      playerCard.addEventListener('click', (e) => {
        if (Date.now() - clickStartTime < 300 &&
            Math.abs(e.clientX - clickStartX) < 5 &&
            Math.abs(e.clientY - clickStartY) < 5) {
          e.stopPropagation();
          this.showPlayerDetail(player);
        }
      });

      if (this.dragDropEnabled) {
        playerCard.draggable = true;
        playerCard.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', player.player_id.toString());
          e.dataTransfer.setData('source', 'pitch');
          playerCard.classList.add('dragging');
        });
        playerCard.addEventListener('dragend', () => {
          playerCard.classList.remove('dragging');
          document.querySelectorAll('.player-card.drop-target').forEach(el => el.classList.remove('drop-target'));
        });
        this.makeDroppable(playerCard, player);
      }

      pitchPlayers.appendChild(playerCard);
    });
  }

  setupPitchDropZone() {
    const container = document.querySelector('.pitch-container');
    const pitchPlayers = document.getElementById('pitchPlayers');
    if (!container || !pitchPlayers) return;

    container.addEventListener('dragover', (e) => {
      if (!this.dragDropEnabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('drop', (e) => {
      if (!this.dragDropEnabled) return;
      // Card drops call stopPropagation in makeDroppable, so this only fires on empty areas
      e.preventDefault();

      const playerId = parseInt(e.dataTransfer.getData('text/plain'));
      const source = e.dataTransfer.getData('source');

      if (source === 'pitch' && this.playerPositions[playerId]) {
        const rect = pitchPlayers.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        this.playerPositions[playerId].x = Math.max(5, Math.min(95, x));
        this.playerPositions[playerId].y = Math.max(5, Math.min(95, y));
        this.renderPitchView();
      }
      // bench → empty area: no-op (user must drop on a card to swap)
    });
  }

  renderSubstitutes() {
    const subsList = document.getElementById('subsList');
    if (!subsList) return;

    // Get all players NOT currently on the pitch
    const playersOnPitch = new Set(Object.keys(this.playerPositions).map(id => parseInt(id)));
    const availablePlayers = this.players.filter(p => !playersOnPitch.has(p.player_id));

    // Sort by: 1) apps, 2) minutes, 3) overall rating (same as starting 11)
    availablePlayers.sort((a, b) => {
      const appsA = a.apps || 0;
      const appsB = b.apps || 0;
      if (appsB !== appsA) return appsB - appsA;

      const minsA = a.minutes || 0;
      const minsB = b.minutes || 0;
      if (minsB !== minsA) return minsB - minsA;

      return (b.overall || 0) - (a.overall || 0);
    });

    if (availablePlayers.length === 0) {
      subsList.innerHTML = '<div class="loading">All players are on the pitch</div>';
      return;
    }

    subsList.innerHTML = '';

    availablePlayers.forEach(player => {
      const initials = player.name ? player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?';
      const rating = player.overall ? player.overall.toFixed(1) : '-';

      const subCard = document.createElement('div');
      subCard.className = 'sub-card';
      subCard.dataset.playerId = player.player_id;
      subCard.dataset.playerData = JSON.stringify(player);

      // Show substitution button when drag-drop is enabled
      const subButton = this.dragDropEnabled ? '<div class="sub-action">↔️</div>' : '';

      subCard.innerHTML = `
        <div class="sub-card-avatar">${initials}</div>
        <div class="sub-card-info">
          <div class="sub-card-name">${player.name || 'Unknown'}</div>
          <div class="sub-card-position">${player.position || '-'}</div>
        </div>
        <div class="sub-card-rating">${rating}</div>
        ${subButton}
      `;

      // Click to view details (not when drag-drop enabled)
      if (!this.dragDropEnabled) {
        subCard.addEventListener('click', () => this.showPlayerDetail(player));
      } else {
        // When drag-drop enabled, make substitutes draggable
        subCard.classList.add('sub-draggable');
        subCard.draggable = true;

        subCard.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', player.player_id.toString());
          e.dataTransfer.setData('source', 'bench');
          subCard.classList.add('dragging');
          console.log('Drag start from bench:', player.name, player.player_id);
        });

        subCard.addEventListener('dragend', () => {
          subCard.classList.remove('dragging');
          console.log('Drag end');
        });
      }

      subsList.appendChild(subCard);
    });
  }

  togglePitchView() {
    this.isPitchView = !this.isPitchView;
    const pitchContainer = document.getElementById('pitchViewContainer');
    const tableContainer = document.getElementById('tableViewContainer');
    const toggleBtn = document.getElementById('pitchViewToggle');
    const toggleText = document.getElementById('toggleText');
    const toggleIcon = document.getElementById('toggleIcon');

    if (this.isPitchView) {
      pitchContainer.style.display = 'block';
      tableContainer.style.display = 'none';
      toggleBtn.classList.add('active');
      toggleText.textContent = 'Table View';
      toggleIcon.textContent = '📊';

      // Render pitch view
      this.selectStartingEleven();
      this.assignPlayersToFormation();
      this.renderPitchView();
      this.renderSubstitutes();
    } else {
      pitchContainer.style.display = 'none';
      tableContainer.style.display = 'block';
      toggleBtn.classList.remove('active');
      toggleText.textContent = 'Pitch View';
      toggleIcon.textContent = '⚽';
    }
  }

  changeFormation(formation) {
    this.currentFormation = formation;

    // Get current players on pitch
    const currentPlayers = Object.values(this.playerPositions).map(pos => pos.player);

    // Get new formation positions
    const newPositions = this.getFormationPositions(formation);

    // Clear positions
    this.playerPositions = {};

    // Reassign same players to new formation positions
    currentPlayers.forEach((player, index) => {
      if (newPositions[index]) {
        this.playerPositions[player.player_id] = {
          ...newPositions[index],
          player
        };
      }
    });

    // If formation has more positions than current players, fill with bench players
    if (newPositions.length > currentPlayers.length) {
      const playersOnPitch = new Set(currentPlayers.map(p => p.player_id));
      const benchPlayers = this.players.filter(p => !playersOnPitch.has(p.player_id));

      for (let i = currentPlayers.length; i < newPositions.length && benchPlayers.length > 0; i++) {
        const player = benchPlayers.shift();
        this.playerPositions[player.player_id] = {
          ...newPositions[i],
          player
        };
      }
    }

    this.renderPitchView();
    this.renderSubstitutes();
  }

  filterByPosition(posFilter) {
    if (posFilter === 'ALL') {
      this.selectStartingEleven();
    } else {
      // Filter players and show them in subs
      const filtered = this.players.filter(p => {
        if (!p.position) return false;
        const pos = p.position.toUpperCase();
        if (posFilter === 'GK') return pos.includes('GK');
        if (posFilter === 'DEF') return /CB|LB|RB|LWB|RWB/.test(pos);
        if (posFilter === 'MID') return /CM|CDM|CAM|LM|RM|AM/.test(pos);
        if (posFilter === 'FWD') return /ST|CF|LW|RW|FW/.test(pos);
        return true;
      });
      this.substitutes = filtered;
    }
    this.assignPlayersToFormation();
    this.renderPitchView();
    this.renderSubstitutes();
  }

  togglePitchStats() {
    this.showPitchStats = document.getElementById('showStatsOnPitch').checked;
    this.renderPitchView();
  }

  toggleDragDrop() {
    this.dragDropEnabled = document.getElementById('enableDragDrop').checked;
    this.renderPitchView();
    this.renderSubstitutes(); // Re-render subs to enable/disable dragging
  }

  makeDroppable(element, currentPlayer) {
    element.addEventListener('dragover', (e) => {
      if (!this.dragDropEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      element.classList.add('drop-target');
    });

    element.addEventListener('dragleave', (e) => {
      // Only remove when actually leaving the card, not when entering a child
      if (!element.contains(e.relatedTarget)) {
        element.classList.remove('drop-target');
      }
    });

    element.addEventListener('drop', (e) => {
      if (!this.dragDropEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drop-target');

      const droppedPlayerId = parseInt(e.dataTransfer.getData('text/plain'));
      const source = e.dataTransfer.getData('source');
      if (droppedPlayerId === currentPlayer.player_id) return;

      if (source === 'bench') {
        const benchPlayer = this.players.find(p => p.player_id === droppedPlayerId);
        const slot = this.playerPositions[currentPlayer.player_id];
        if (!benchPlayer || !slot) return;

        slot.player = benchPlayer;
        delete this.playerPositions[currentPlayer.player_id];
        this.playerPositions[benchPlayer.player_id] = slot;

        this.renderPitchView();
        this.renderSubstitutes();
      } else if (source === 'pitch') {
        // Swap two pitch players
        const slotA = this.playerPositions[droppedPlayerId];
        const slotB = this.playerPositions[currentPlayer.player_id];
        if (!slotA || !slotB) return;

        [slotA.x, slotB.x] = [slotB.x, slotA.x];
        [slotA.y, slotB.y] = [slotB.y, slotA.y];
        [slotA.pos, slotB.pos] = [slotB.pos, slotA.pos];

        this.renderPitchView();
      }
    });
  }

  showPlayerDetail(player) {
    const panel = document.getElementById('playerDetailPanel');
    const body = document.getElementById('playerDetailBody');

    const initials = player.name ? player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?';
    const rating = player.overall ? player.overall.toFixed(1) : '-';
    const goals = player.raw?.goals || 0;
    const assists = player.raw?.assists || 0;
    const apps = player.apps || player.games_played || 0;
    const minutes = player.minutes || 0;
    const goalsP90 = player.goals_per90 ? player.goals_per90.toFixed(2) : '-';
    const assistsP90 = player.assists_per90 ? player.assists_per90.toFixed(2) : '-';

    body.innerHTML = `
      <div class="player-detail-header">
        <div class="player-detail-avatar">${initials}</div>
        <div class="player-detail-name">${player.name || 'Unknown Player'}</div>
        <div class="player-detail-position">${player.position || 'Position Unknown'}</div>
        <div class="player-detail-rating">${rating}</div>
      </div>

      <div class="player-detail-stats-grid">
        <div class="player-detail-stat">
          <div class="player-detail-stat-label">Appearances</div>
          <div class="player-detail-stat-value">${apps}</div>
        </div>
        <div class="player-detail-stat">
          <div class="player-detail-stat-label">Minutes</div>
          <div class="player-detail-stat-value">${minutes}</div>
        </div>
        <div class="player-detail-stat">
          <div class="player-detail-stat-label">Goals</div>
          <div class="player-detail-stat-value">${goals}</div>
        </div>
        <div class="player-detail-stat">
          <div class="player-detail-stat-label">Assists</div>
          <div class="player-detail-stat-value">${assists}</div>
        </div>
        <div class="player-detail-stat">
          <div class="player-detail-stat-label">Goals/90</div>
          <div class="player-detail-stat-value">${goalsP90}</div>
        </div>
        <div class="player-detail-stat">
          <div class="player-detail-stat-label">Assists/90</div>
          <div class="player-detail-stat-value">${assistsP90}</div>
        </div>
      </div>

      ${player.strengths && player.strengths.length > 0 ? `
        <div class="player-detail-section">
          <h4>Strengths</h4>
          <ul class="player-detail-list">
            ${player.strengths.map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${player.weaknesses && player.weaknesses.length > 0 ? `
        <div class="player-detail-section">
          <h4>Areas for Improvement</h4>
          <ul class="player-detail-list">
            ${player.weaknesses.map(w => `<li>${w}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${player.verdict ? `
        <div class="player-detail-section">
          <h4>Overall Assessment</h4>
          <div style="padding: 16px; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 8px; line-height: 1.6;">
            ${player.verdict}
          </div>
        </div>
      ` : ''}
    `;

    panel.style.display = 'flex';
  }

  closePlayerDetail() {
    const panel = document.getElementById('playerDetailPanel');
    panel.style.display = 'none';
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

  // Client-side photo cache: full_name → blob URL (avoids re-fetching on re-renders)
  _photoCache = {};

  _playerName(player) {
    return (typeof player === 'object')
      ? (player.full_name || player.name || '').trim()
      : (player || '').trim();
  }

  _playerAvatar(player, color, size = 52) {
    const name = this._playerName(player);
    const initials = name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
    const uid = `av-${name.replace(/\s+/g, '-').toLowerCase()}-${size}`;

    // If already cached, return an img pointing at the blob URL directly
    if (this._photoCache[name]) {
      return `
        <div class="player-avatar" style="width:${size}px;height:${size}px;border:2px solid ${color}">
          <img src="${this._photoCache[name]}" alt="${name}"
               style="width:100%;height:100%;object-fit:cover;object-position:top;position:absolute;inset:0">
        </div>`;
    }

    // Otherwise lazy-fetch once, store as blob URL, then swap the img src in-place
    const apiUrl = `http://localhost:8000/api/images/player?name=${encodeURIComponent(name)}`;
    // Kick off the fetch in the background after the element is in the DOM
    setTimeout(() => {
      if (this._photoCache[name]) return; // another render already fetched it
      const img = document.getElementById(uid);
      if (!img) return;
      fetch(apiUrl)
        .then(r => r.ok ? r.blob() : Promise.reject())
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          this._photoCache[name] = blobUrl;
          img.src = blobUrl;
          img.style.opacity = '1';
          const ini = document.getElementById(`ini-${uid}`);
          if (ini) ini.style.display = 'none';
        })
        .catch(() => { /* keep initials visible */ });
    }, 0);

    return `
      <div class="player-avatar" style="width:${size}px;height:${size}px;border:2px solid ${color}">
        <span class="player-avatar-initials" id="ini-${uid}" style="font-size:${Math.round(size*0.3)}px">${initials}</span>
        <img id="${uid}" alt="${name}"
             style="opacity:0;transition:opacity .3s;width:100%;height:100%;object-fit:cover;object-position:top;position:absolute;inset:0">
      </div>`;
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

    const nameA = playerA.full_name || playerA.name || 'Player A';
    const nameB = playerB.full_name || playerB.name || 'Player B';
    const posA = (playerA.position_meta || '-').toUpperCase();
    const posB = (playerB.position_meta || '-').toUpperCase();
    const teamA = playerA.team_label || 'U Cluj';
    const teamB = playerB.team_label || '';

    bars.className = 'comparison-bars';
    bars.innerHTML = `
      <div class="cmp-legend">
        <div class="cmp-legend-player">
          ${this._playerAvatar(playerA, this.COLOR_A, 56)}
          <div class="cmp-legend-info">
            <span class="cmp-legend-name" style="color:${this.COLOR_A}">${nameA}</span>
            <span class="cmp-legend-pos">${posA} · ${teamA}</span>
          </div>
        </div>
        <div class="cmp-legend-vs">VS</div>
        <div class="cmp-legend-player cmp-legend-player--right">
          <div class="cmp-legend-info cmp-legend-info--right">
            <span class="cmp-legend-name" style="color:${this.COLOR_B}">${nameB}</span>
            <span class="cmp-legend-pos">${posB}${teamB ? ' · ' + teamB : ''}</span>
          </div>
          ${this._playerAvatar(playerB, this.COLOR_B, 56)}
        </div>
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
              ${this._playerAvatar(player, this.COLOR_B, 40)}
              <span class="scout-cand-rank">#${rank + 1}</span>
              <span class="scout-cand-pos">${pos}</span>
              <span class="scout-cand-name">${player.full_name || player.name || 'Unknown'}</span>
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

  async loadScoutingView() {
    try {
      // Initialize scouting source
      this.scoutingSource = 'liga1';
      this.liga1Players = [];
      this.transfermarktPlayers = [];
      this.filteredScoutingPlayers = [];

      // Load Liga 1 players by default
      await this.loadLiga1Players();

      // Setup event listeners for Liga 1 filters
      const liga1Search = document.getElementById('liga1PlayerSearch');
      const liga1PosFilter = document.getElementById('liga1PositionFilter');
      const liga1TeamFilter = document.getElementById('liga1TeamFilter');
      const liga1RatingFilter = document.getElementById('liga1RatingFilter');

      if (liga1Search) liga1Search.addEventListener('input', () => this.filterScoutingPlayers());
      if (liga1PosFilter) liga1PosFilter.addEventListener('change', () => this.filterScoutingPlayers());
      if (liga1TeamFilter) liga1TeamFilter.addEventListener('change', () => this.filterScoutingPlayers());
      if (liga1RatingFilter) liga1RatingFilter.addEventListener('change', () => this.filterScoutingPlayers());

      // Setup event listener for Transfermarkt search
      const tmSearch = document.getElementById('tmPlayerSearch');
      if (tmSearch) tmSearch.addEventListener('input', () => this.filterScoutingPlayers());

      // Setup sorting
      setTimeout(() => {
        document.querySelectorAll('#scoutingPlayersTable th.sortable').forEach(header => {
          header.addEventListener('click', () => {
            const sortKey = header.getAttribute('data-sort');
            this.sortScoutingTable(sortKey);
          });
        });
      }, 100);
    } catch (error) {
      console.error('Failed to load scouting view:', error);
      const tbody = document.getElementById('scoutingPlayersTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" style="color: var(--danger);">Failed to load view</td></tr>';
      }
    }
  }

  async loadLiga1Players() {
    try {
      const tbody = document.getElementById('scoutingPlayersTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" style="color: var(--text-muted);">Loading Liga 1 players...</td></tr>';
      }

      // Load all Liga 1 players
      this.liga1Players = await apiClient.getAllPlayers();

      // Populate team filter
      const teams = [...new Set(this.liga1Players.map(p => p.team_slug).filter(Boolean))].sort();
      const teamFilter = document.getElementById('liga1TeamFilter');
      if (teamFilter) {
        teamFilter.innerHTML = '<option value="ALL">All Teams</option>' +
          teams.map(team => `<option value="${team}">${team.replace(/_/g, ' ').toUpperCase()}</option>`).join('');
      }

      // Set table headers for Liga 1
      this.setLiga1TableHeaders();

      // Render players
      this.filteredScoutingPlayers = [...this.liga1Players];
      this.renderScoutingPlayers(this.filteredScoutingPlayers);
    } catch (error) {
      console.error('Failed to load Liga 1 players:', error);
      const tbody = document.getElementById('scoutingPlayersTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" style="color: var(--danger);">Failed to load Liga 1 players</td></tr>';
      }
    }
  }

  setLiga1TableHeaders() {
    const thead = document.getElementById('scoutingTableHead');
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th class="sortable" data-sort="name">Name ↕</th>
          <th class="sortable" data-sort="team">Team ↕</th>
          <th class="sortable" data-sort="position">Position ↕</th>
          <th class="sortable" data-sort="overall">Rating ↕</th>
          <th class="sortable" data-sort="apps">Apps ↕</th>
          <th class="sortable" data-sort="goals">Goals ↕</th>
          <th class="sortable" data-sort="assists">Assists ↕</th>
          <th class="sortable" data-sort="minutes">Minutes ↕</th>
          <th>Physical</th>
          <th>Actions</th>
        </tr>
      `;
    }
  }

  setTransfermarktTableHeaders() {
    const thead = document.getElementById('scoutingTableHead');
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th class="sortable" data-sort="name">Name ↕</th>
          <th class="sortable" data-sort="age">Age ↕</th>
          <th class="sortable" data-sort="position">Position ↕</th>
          <th class="sortable" data-sort="nationality">Nationality ↕</th>
          <th class="sortable" data-sort="club">Club ↕</th>
          <th class="sortable" data-sort="league">League ↕</th>
          <th class="sortable" data-sort="value">Market Value ↕</th>
          <th>Actions</th>
        </tr>
      `;
    }
  }

  switchScoutingSource() {
    const sourceSelect = document.getElementById('scoutingSource');
    this.scoutingSource = sourceSelect?.value || 'liga1';

    const liga1Filters = document.getElementById('liga1Filters');
    const tmFilters = document.getElementById('transfermarktFilters');

    if (this.scoutingSource === 'liga1') {
      if (liga1Filters) liga1Filters.style.display = 'flex';
      if (tmFilters) tmFilters.style.display = 'none';
      this.setLiga1TableHeaders();
      if (this.liga1Players.length === 0) {
        this.loadLiga1Players();
      } else {
        this.filteredScoutingPlayers = [...this.liga1Players];
        this.filterScoutingPlayers();
      }
    } else {
      if (liga1Filters) liga1Filters.style.display = 'none';
      if (tmFilters) tmFilters.style.display = 'flex';
      this.setTransfermarktTableHeaders();
      const tbody = document.getElementById('scoutingPlayersTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="color: var(--text-muted);">Click "Search Transfermarkt" to find players...</td></tr>';
      }
    }
  }

  async searchTransfermarkt() {
    try {
      const tbody = document.getElementById('scoutingPlayersTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="color: var(--text-muted);">Searching Transfermarkt...</td></tr>';
      }

      const filters = {};

      const league = document.getElementById('tmLeagueFilter')?.value;
      const position = document.getElementById('tmPositionInput')?.value.trim();
      const nationality = document.getElementById('tmNationalityInput')?.value.trim();
      const age = document.getElementById('tmAgeInput')?.value.trim();

      if (league) filters.league = league;
      if (position) filters.position = position;
      if (nationality) filters.nationality = nationality;
      if (age) filters.age = age;

      const result = await apiClient.searchTransfermarktPlayers(filters);

      this.transfermarktPlayers = result?.players || [];
      this.filteredScoutingPlayers = [...this.transfermarktPlayers];
      this.renderScoutingPlayers(this.filteredScoutingPlayers);
    } catch (error) {
      console.error('Failed to search Transfermarkt:', error);
      const tbody = document.getElementById('scoutingPlayersTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="color: var(--danger);">Search failed. Make sure the Transfermarkt scraper API is running.</td></tr>';
      }
    }
  }

  renderScoutingPlayers(players) {
    const tbody = document.getElementById('scoutingPlayersTableBody');
    if (!tbody) return;

    if (players.length === 0) {
      const colspan = this.scoutingSource === 'liga1' ? '10' : '8';
      tbody.innerHTML = `<tr><td colspan="${colspan}" style="color: var(--text-muted);">No players found</td></tr>`;
      return;
    }

    if (this.scoutingSource === 'liga1') {
      // Render Liga 1 players
      tbody.innerHTML = players.map(p => {
        const ratingColor = p.overall >= 70 ? 'var(--primary-color)' : p.overall < 60 ? 'var(--danger)' : 'var(--text-primary)';
        const teamName = (p.team_slug || '').replace(/_/g, ' ').toUpperCase();
        const physicalScore = p.subscores?.Fizic || '-';

        return `
          <tr>
            <td style="font-weight: 500;">${p.name || p.full_name || 'Unknown'}</td>
            <td style="color: var(--text-secondary);">${teamName}</td>
            <td>${(p.position_group || p.position || '-').toUpperCase()}</td>
            <td style="color: ${ratingColor};">${p.overall ? p.overall.toFixed(1) : '-'}</td>
            <td>${p.apps || 0}</td>
            <td>${p.raw?.goals || 0}</td>
            <td>${p.raw?.assists || 0}</td>
            <td>${p.minutes || 0}</td>
            <td style="color: ${physicalScore >= 60 ? 'var(--primary-color)' : 'var(--text-secondary)'};">${typeof physicalScore === 'number' ? physicalScore.toFixed(1) : physicalScore}</td>
            <td>
              <button class="btn-action" onclick="app.viewLiga1Player(${p.player_id})">View</button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      // Render Transfermarkt players
      tbody.innerHTML = players.map(p => {
        const age = p.age || '-';
        const position = p.position || '-';
        const nationality = p.nationality || '-';
        const club = p.club || '-';
        const league = p.league_name || p.league || '-';
        const value = p.market_value || p.value || '-';
        const tmUrl = p.tm_url || `https://www.transfermarkt.com/player/profil/spieler/${p.tm_id}`;

        return `
          <tr>
            <td style="font-weight: 500;">
              <a href="${tmUrl}" target="_blank" style="color: var(--text-primary); text-decoration: none; cursor: pointer;">
                ${p.name || 'Unknown'}
              </a>
            </td>
            <td>${age}</td>
            <td>${position}</td>
            <td>${nationality}</td>
            <td style="color: var(--text-secondary);">${club}</td>
            <td style="color: var(--text-secondary);">${league}</td>
            <td style="color: var(--primary-color);">${value}</td>
            <td>
              <a href="${tmUrl}" target="_blank" class="btn-action" style="text-decoration: none; display: inline-block;">View</a>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  async viewLiga1Player(playerId) {
    const player = this.liga1Players.find(p => p.player_id === playerId);
    if (!player) {
      alert('Player not found');
      return;
    }

    const subscores = player.subscores || {};
    const strengths = player.strengths?.join(', ') || 'N/A';
    const weaknesses = player.weaknesses?.join(', ') || 'N/A';

    alert(`Player Profile:\n\nName: ${player.name}\nTeam: ${(player.team_slug || '').replace(/_/g, ' ').toUpperCase()}\nPosition: ${player.position_group || player.position}\nRating: ${player.overall ? player.overall.toFixed(1) : 'N/A'}\nApps: ${player.apps}\nGoals: ${player.raw?.goals || 0}\nAssists: ${player.raw?.assists || 0}\n\nPhysical: ${subscores.Fizic ? subscores.Fizic.toFixed(1) : 'N/A'}\nAttack: ${subscores.Atac ? subscores.Atac.toFixed(1) : 'N/A'}\nDefense: ${subscores.Apărare ? subscores.Apărare.toFixed(1) : 'N/A'}\n\nStrengths: ${strengths}\nWeaknesses: ${weaknesses}\n\nVerdict: ${player.verdict || 'N/A'}`);
  }

  async viewTransfermarktPlayer(tmId) {
    try {
      const profile = await apiClient.getTransfermarktPlayerProfile(tmId);
      if (profile) {
        alert(`Player Profile:\n\nName: ${profile.name}\nAge: ${profile.age}\nPosition: ${profile.position}\nNationality: ${profile.nationality}\nClub: ${profile.club}\nMarket Value: ${profile.market_value}`);
      } else {
        alert('Failed to load player profile');
      }
    } catch (error) {
      console.error('Failed to view player profile:', error);
      alert('Error loading player profile');
    }
  }

  filterScoutingPlayers() {
    if (this.scoutingSource === 'liga1') {
      // Filter Liga 1 players
      const searchQuery = document.getElementById('liga1PlayerSearch')?.value.toLowerCase() || '';
      const posFilter = document.getElementById('liga1PositionFilter')?.value || 'ALL';
      const teamFilter = document.getElementById('liga1TeamFilter')?.value || 'ALL';
      const ratingFilter = document.getElementById('liga1RatingFilter')?.value || 'ALL';

      let filtered = [...this.liga1Players];

      if (searchQuery) {
        filtered = filtered.filter(p =>
          (p.name || p.full_name || '').toLowerCase().includes(searchQuery) ||
          (p.team_slug || '').toLowerCase().includes(searchQuery)
        );
      }

      if (posFilter !== 'ALL') {
        filtered = filtered.filter(p => (p.position_group || '').toUpperCase() === posFilter);
      }

      if (teamFilter !== 'ALL') {
        filtered = filtered.filter(p => p.team_slug === teamFilter);
      }

      if (ratingFilter !== 'ALL') {
        if (ratingFilter === '75+') {
          filtered = filtered.filter(p => p.overall >= 75);
        } else if (ratingFilter === '70-75') {
          filtered = filtered.filter(p => p.overall >= 70 && p.overall < 75);
        } else if (ratingFilter === '65-70') {
          filtered = filtered.filter(p => p.overall >= 65 && p.overall < 70);
        } else if (ratingFilter === '60-65') {
          filtered = filtered.filter(p => p.overall >= 60 && p.overall < 65);
        } else if (ratingFilter === '60-') {
          filtered = filtered.filter(p => p.overall < 60);
        }
      }

      this.filteredScoutingPlayers = filtered;
    } else {
      // Filter Transfermarkt players
      const searchQuery = document.getElementById('tmPlayerSearch')?.value.toLowerCase() || '';

      if (!this.transfermarktPlayers || this.transfermarktPlayers.length === 0) {
        return;
      }

      let filtered = [...this.transfermarktPlayers];

      if (searchQuery) {
        filtered = filtered.filter(p =>
          (p.name || '').toLowerCase().includes(searchQuery) ||
          (p.club || '').toLowerCase().includes(searchQuery)
        );
      }

      this.filteredScoutingPlayers = filtered;
    }

    this.renderScoutingPlayers(this.filteredScoutingPlayers);
  }

  sortScoutingTable(column) {
    if (!this.scoutingSortState) {
      this.scoutingSortState = { column: null, direction: 'asc' };
    }

    // Toggle direction if same column
    if (this.scoutingSortState.column === column) {
      this.scoutingSortState.direction = this.scoutingSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.scoutingSortState.column = column;
      this.scoutingSortState.direction = 'asc';
    }

    const sorted = [...this.filteredScoutingPlayers].sort((a, b) => {
      let valA, valB;

      if (this.scoutingSource === 'liga1') {
        // Liga 1 sorting
        if (column === 'name') {
          valA = a.name || a.full_name || '';
          valB = b.name || b.full_name || '';
          return this.scoutingSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (column === 'team') {
          valA = a.team_slug || '';
          valB = b.team_slug || '';
          return this.scoutingSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (column === 'position') {
          valA = a.position_group || '';
          valB = b.position_group || '';
          return this.scoutingSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (column === 'overall') valA = a.overall || 0, valB = b.overall || 0;
        else if (column === 'apps') valA = a.apps || 0, valB = b.apps || 0;
        else if (column === 'goals') valA = a.raw?.goals || 0, valB = b.raw?.goals || 0;
        else if (column === 'assists') valA = a.raw?.assists || 0, valB = b.raw?.assists || 0;
        else if (column === 'minutes') valA = a.minutes || 0, valB = b.minutes || 0;
      } else {
        // Transfermarkt sorting
        if (column === 'name') {
          valA = a.name || '';
          valB = b.name || '';
          return this.scoutingSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (column === 'position') {
          valA = a.position || '';
          valB = b.position || '';
          return this.scoutingSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (column === 'nationality') {
          valA = a.nationality || '';
          valB = b.nationality || '';
          return this.scoutingSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (column === 'club') {
          valA = a.club || '';
          valB = b.club || '';
          return this.scoutingSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (column === 'league') {
          valA = a.league || '';
          valB = b.league || '';
          return this.scoutingSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (column === 'age') valA = a.age || 0, valB = b.age || 0;
        else if (column === 'value') {
          const parseValue = (v) => {
            if (!v) return 0;
            const str = String(v).toLowerCase();
            let num = parseFloat(str.replace(/[^0-9.]/g, ''));
            if (str.includes('m')) num *= 1000000;
            else if (str.includes('k')) num *= 1000;
            return num;
          };
          valA = parseValue(a.market_value || a.value);
          valB = parseValue(b.market_value || b.value);
        }
      }

      return this.scoutingSortState.direction === 'asc' ? valA - valB : valB - valA;
    });

    // Update visual indicators
    document.querySelectorAll('#scoutingPlayersTable th.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
    });
    const activeHeader = document.querySelector(`#scoutingPlayersTable th[data-sort="${column}"]`);
    if (activeHeader) {
      activeHeader.classList.add(this.scoutingSortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }

    this.renderScoutingPlayers(sorted);
  }

  renderTransferPriorities(needs) {
    const el = document.getElementById('transferPriorities');
    el.className = 'transfer-priority-list';

    // Handle different response structures
    const priorityList = needs?.priority_needs || needs;

    if (!priorityList || priorityList.length === 0) {
      el.innerHTML = '<div style="color: var(--text-muted); padding: 20px 0;">No priorities</div>';
      return;
    }

    el.innerHTML = priorityList.slice(0, 5).map(need => {
      const urgency = (need.priority || need.urgency || 'medium').toLowerCase();
      const position = need.position || need.role || 'Unknown';
      const reason = need.reason || need.description || 'No description';
      return `
        <div class="priority-item">
          <span class="priority-position">${position}</span>
          <span class="priority-reason">${reason}</span>
          <span class="priority-urgency ${urgency}">${urgency.toUpperCase()}</span>
        </div>
      `;
    }).join('');
  }

  renderScoutingRecommendations(recommendations) {
    const el = document.getElementById('scoutingRecommendations');
    el.className = 'scouting-recommendations';

    if (!recommendations || recommendations.length === 0) {
      el.innerHTML = '<div style="color: var(--text-muted); padding: 20px 0;">No recommendations</div>';
      return;
    }

    el.innerHTML = recommendations.slice(0, 8).map(rec => {
      const player = rec.player || rec;
      const score = rec.match_score || rec.overall || 75;
      const apps = player.apps || player.games_played || 0;
      const age = player.age || '-';
      return `
        <div class="recommendation-card" onclick="app.selectComparisonPlayer('B', ${player.player_id})">
          <span class="rec-name">${player.name || player.full_name}</span>
          <span class="rec-position">${(player.position_meta || player.position || '').toUpperCase()}</span>
          <span class="rec-stats">${apps} apps · ${age} yrs</span>
          <span class="rec-score">${Math.round(score)}</span>
        </div>
      `;
    }).join('');
  }

  drawValuePerformanceChart() {
    const canvas = document.getElementById('valuePerformanceChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();

      const x = 40 + ((width - 60) / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 20);
      ctx.stroke();
    }

    // Draw axes labels
    ctx.fillStyle = '#888888';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText('Performance Rating', width / 2 - 50, height - 5);

    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Value Score', -30, 0);
    ctx.restore();

    // Plot players
    const players = this.allPlayers.slice(0, 100);
    players.forEach(player => {
      const performance = player.overall || 50;
      const value = this.calculateValueScore(player);

      const x = 40 + ((performance / 100) * (width - 60));
      const y = height - 20 - ((value / 100) * (height - 20));

      // Color by position
      const posColor = this.getPositionColor(player.position_meta);

      ctx.fillStyle = posColor;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Highlight high-value, high-performance players
      if (performance > 70 && value > 70) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Draw legend
    const positions = [
      { key: 'gk', color: '#888888', label: 'GK' },
      { key: 'cb', color: '#fbbf24', label: 'DEF' },
      { key: 'cm', color: '#ffffff', label: 'MID' },
      { key: 'fw', color: '#dc2626', label: 'FWD' }
    ];

    let legendX = width - 120;
    let legendY = 20;
    positions.forEach(pos => {
      ctx.fillStyle = pos.color;
      ctx.beginPath();
      ctx.arc(legendX, legendY, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#888888';
      ctx.font = '11px sans-serif';
      ctx.fillText(pos.label, legendX + 10, legendY + 4);

      legendY += 18;
    });
  }

  drawPositionStrengthChart() {
    const canvas = document.getElementById('positionStrengthChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1f2e';
    ctx.fillRect(0, 0, width, height);

    // Calculate position strengths
    const positions = ['GK', 'DEF', 'MID', 'FWD'];
    const barWidth = (width - 100) / positions.length;
    const maxHeight = height - 60;

    positions.forEach((pos, i) => {
      const players = this.uclujPlayers.filter(p => {
        const meta = (p.position_meta || '').toLowerCase();
        if (pos === 'GK') return meta === 'gk';
        if (pos === 'DEF') return ['cb', 'lb', 'rb', 'lwb', 'rwb'].includes(meta);
        if (pos === 'MID') return ['cm', 'cdm', 'cam', 'lm', 'rm'].some(m => meta.includes(m));
        if (pos === 'FWD') return ['lw', 'rw', 'cf', 'st'].some(m => meta.includes(m));
        return false;
      });

      const avgRating = players.length > 0
        ? players.reduce((sum, p) => sum + (p.overall || 0), 0) / players.length
        : 0;

      const barHeight = (avgRating / 100) * maxHeight;
      const x = 50 + (i * barWidth) + (barWidth * 0.2);
      const barW = barWidth * 0.6;
      const y = height - 40 - barHeight;

      // Draw bar
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x, y, barW, barHeight);

      // Draw value label
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(avgRating.toFixed(1), x + barW / 2, y - 8);

      // Draw position label
      ctx.fillStyle = '#888888';
      ctx.font = '11px sans-serif';
      ctx.fillText(pos, x + barW / 2, height - 20);

      // Draw player count
      ctx.fillStyle = '#666666';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${players.length} players`, x + barW / 2, height - 5);
    });

    ctx.textAlign = 'left';
  }

  drawAgeDevelopmentChart() {
    const canvas = document.getElementById('ageDevelopmentChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    // Draw axes labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px sans-serif';
    ctx.fillText('Age', width / 2 - 10, height - 5);

    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Performance Rating', -45, 0);
    ctx.restore();

    // Plot squad players
    this.uclujPlayers.forEach(player => {
      const age = player.age || 25;
      const rating = player.overall || 50;

      const x = 50 + ((age - 18) / (35 - 18)) * (width - 70);
      const y = height - 20 - ((rating / 100) * (height - 20));

      const posColor = this.getPositionColor(player.position_meta);

      ctx.fillStyle = posColor;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Highlight U Cluj players
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw age markers
    ctx.fillStyle = '#666666';
    ctx.font = '10px sans-serif';
    for (let age = 20; age <= 35; age += 5) {
      const x = 50 + ((age - 18) / (35 - 18)) * (width - 70);
      ctx.fillText(age.toString(), x - 5, height - 5);
    }
  }

  calculateValueScore(player) {
    // Simple value calculation based on performance vs experience
    const rating = player.overall || 50;
    const age = player.age || 25;
    const apps = player.apps || 0;

    let value = rating;

    // Boost for younger players
    if (age < 25) value += (25 - age) * 2;

    // Boost for experience
    if (apps > 20) value += 5;
    if (apps > 50) value += 5;

    // Diminish for older players
    if (age > 30) value -= (age - 30) * 3;

    return Math.max(0, Math.min(100, value));
  }

  getPositionColor(posMeta) {
    const pos = (posMeta || '').toLowerCase();
    if (pos === 'gk') return '#888888';
    if (['cb', 'lb', 'rb', 'lwb', 'rwb'].includes(pos)) return '#fbbf24';
    if (pos.includes('m')) return '#ffffff';
    return '#dc2626';
  }

  selectComparisonPlayer(side, playerId) {
    // Switch to comparison view and select player
    this.switchView('comparison');
    // The actual selection would need to be implemented based on existing comparison logic
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
