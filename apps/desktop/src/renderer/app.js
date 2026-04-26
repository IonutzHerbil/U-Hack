const { apiClient } = require('../api/client');

class App {
  constructor() {
    this.language = 'ro';
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
    this.recruitmentRequestId = 0;
    this.recruitmentLoaded = false;
    this.overviewData = null;
    this.tacticalProfileData = null;

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
    this.translations = {
      ro: {
        'common.refresh': 'Reincarca',
        'common.apply': 'Aplica',
        'common.loading': 'Se incarca...',
        'language.label': 'Limba',
        'sidebar.tagline': 'Tablou de analiza',
        'nav.overview': 'Prezentare echipa',
        'nav.players': 'Jucatori',
        'nav.matches': 'Statistici meci',
        'nav.comparison': 'Comparatie jucatori',
        'nav.recruitment': 'Recrutare',
        'nav.scraper': 'Background Check',
        'overview.title': 'Prezentare echipa',
        'overview.played': 'Meciuri',
        'overview.wins': 'Victorii',
        'overview.draws': 'Egaluri',
        'overview.losses': 'Infrangeri',
        'overview.goalsFor': 'Goluri marcate',
        'overview.conceded': 'Goluri primite',
        'overview.points': 'Puncte',
        'overview.winRate': 'Rata victorii',
        'overview.topStrengths': 'Puncte forte',
        'overview.topWeaknesses': 'Puncte slabe',
        'overview.tacticalProfile': 'Profil tactic',
        'players.title': 'Jucatorii lotului',
        'players.formation': 'Formatie',
        'players.filterPosition': 'Filtreaza dupa pozitie',
        'players.allPositions': 'Toate pozitiile',
        'players.goalkeeper': 'Portar',
        'players.defenders': 'Fundasi',
        'players.midfielders': 'Mijlocasi',
        'players.forwards': 'Atacanti',
        'players.showStats': 'Afiseaza statistici pe teren',
        'players.enableDragDrop': 'Activeaza drag and drop',
        'players.substitutes': 'Rezerve si inlocuitori',
        'players.loadingSubstitutes': 'Se incarca rezervele...',
        'matches.title': 'Statistici meci',
        'comparison.title': 'Comparatie jucatori',
        'comparison.profileScout': 'Scouting profil',
        'comparison.profileScoutSubtitle': 'Trage orice varf al axei pentru a seta profilul tinta, iar cei mai potriviti jucatori din Liga 1 apar instant',
        'comparison.resetToPlayerA': 'Reset la Jucatorul A',
        'comparison.selectPlayerPrompt': 'Selecteaza un Jucator A de la U Cluj pentru a incepe scoutingul.',
        'recruitment.title': 'Recrutare',
        'recruitment.candidatesPerNeed': 'Candidati per nevoie',
        'recruitment.startPrompt': 'Incarca insight-urile de recrutare pentru a incepe.',
        'recruitment.priorityNeeds': 'Nevoi prioritare',
        'recruitment.shortlist': 'Lista scurta',
        'recruitment.noData': 'Nu exista date inca.',
        'status.connecting': 'Se conecteaza...',
        'status.connected': 'Conectat',
        'status.apiError': 'Eroare API',
        'status.disconnected': 'Deconectat',
        'toggle.pitchView': 'Vedere teren',
        'toggle.tableView': 'Vedere tabel',
        'placeholder.playerSearch': 'Cauta jucatori...',
        'placeholder.searchA': 'Cauta jucator U Cluj...',
        'placeholder.searchB': 'Cauta adversar din Liga 1...',
      },
      en: {
        'common.refresh': 'Refresh',
        'common.apply': 'Apply',
        'common.loading': 'Loading...',
        'language.label': 'Language',
        'sidebar.tagline': 'Analytics Dashboard',
        'nav.overview': 'Team Overview',
        'nav.players': 'Players',
        'nav.matches': 'Match Stats',
        'nav.comparison': 'Player Comparison',
        'nav.recruitment': 'Recruitment',
        'nav.scraper': 'Background Check',
        'overview.title': 'Team Overview',
        'overview.played': 'Played',
        'overview.wins': 'Wins',
        'overview.draws': 'Draws',
        'overview.losses': 'Losses',
        'overview.goalsFor': 'Goals For',
        'overview.conceded': 'Conceded',
        'overview.points': 'Points',
        'overview.winRate': 'Win Rate',
        'overview.topStrengths': 'Top Strengths',
        'overview.topWeaknesses': 'Top Weaknesses',
        'overview.tacticalProfile': 'Tactical Profile',
        'players.title': 'Squad Players',
        'players.formation': 'Formation',
        'players.filterPosition': 'Filter by Position',
        'players.allPositions': 'All Positions',
        'players.goalkeeper': 'Goalkeeper',
        'players.defenders': 'Defenders',
        'players.midfielders': 'Midfielders',
        'players.forwards': 'Forwards',
        'players.showStats': 'Show Stats on Pitch',
        'players.enableDragDrop': 'Enable Drag & Drop',
        'players.substitutes': 'Substitutes & Reserves',
        'players.loadingSubstitutes': 'Loading substitutes...',
        'matches.title': 'Match Statistics',
        'comparison.title': 'Player Comparison',
        'comparison.profileScout': 'Profile Scout',
        'comparison.profileScoutSubtitle': 'Drag any axis vertex to set your target profile, and the best Liga 1 matches appear instantly',
        'comparison.resetToPlayerA': 'Reset to Player A',
        'comparison.selectPlayerPrompt': 'Select a U Cluj Player A to start scouting.',
        'recruitment.title': 'Recruitment',
        'recruitment.candidatesPerNeed': 'Candidates per need',
        'recruitment.startPrompt': 'Load recruitment insights to start.',
        'recruitment.priorityNeeds': 'Priority Needs',
        'recruitment.shortlist': 'Shortlist',
        'recruitment.noData': 'No data yet.',
        'status.connecting': 'Connecting...',
        'status.connected': 'Connected',
        'status.apiError': 'API Error',
        'status.disconnected': 'Disconnected',
        'toggle.pitchView': 'Pitch View',
        'toggle.tableView': 'Table View',
        'placeholder.playerSearch': 'Search players...',
        'placeholder.searchA': 'Search U Cluj player...',
        'placeholder.searchB': 'Search Liga 1 opponent...',
      },
    };
    this.init();
  }

  init() {
    this.setupLanguageSelector();
    this.applyTranslations();
    this.setupNavigation();
    this.mountLanguageSelector(this.currentView);
    this.setupSearch();
    this.setupComparisonControls();
    this.checkAPIConnection();
    this.loadOverview();
  }

  t(key) {
    return this.translations[this.language]?.[key] || this.translations.ro[key] || key;
  }

  setupLanguageSelector() {
    const options = document.querySelectorAll('.language-option');
    if (!options.length) return;

    options.forEach((option) => {
      option.classList.toggle('active', option.dataset.language === this.language);
      option.setAttribute('aria-pressed', option.dataset.language === this.language ? 'true' : 'false');
      option.addEventListener('click', () => {
        this.language = option.dataset.language || 'ro';
        this.applyTranslations();
        this.refreshDynamicLabels();
        this.syncLanguageSelector();
        this.rerenderCurrentView();
      });
    });
  }

  mountLanguageSelector(viewName) {
    const switcher = document.getElementById('languageSwitcher');
    const header = document.querySelector(`#${viewName}View .view-header`);
    if (!switcher || !header) return;

    const title = header.querySelector('h2');
    if (title) {
      header.insertBefore(switcher, title.nextSibling);
      return;
    }

    header.prepend(switcher);
  }

  syncLanguageSelector() {
    document.querySelectorAll('.language-option').forEach((option) => {
      const isActive = option.dataset.language === this.language;
      option.classList.toggle('active', isActive);
      option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  applyTranslations() {
    document.documentElement.lang = this.language;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      element.textContent = this.t(key);
    });
    this.syncLanguageSelector();
  }

  refreshDynamicLabels() {
    const playerSearch = document.getElementById('playerSearch');
    const searchA = document.getElementById('searchA');
    const searchB = document.getElementById('searchB');
    if (playerSearch) playerSearch.placeholder = this.t('placeholder.playerSearch');
    if (searchA) searchA.placeholder = this.t('placeholder.searchA');
    if (searchB) searchB.placeholder = this.t('placeholder.searchB');

    const toggleText = document.getElementById('toggleText');
    const toggleIcon = document.getElementById('toggleIcon');
    if (toggleText && toggleIcon) {
      toggleText.textContent = this.isPitchView ? this.t('toggle.tableView') : this.t('toggle.pitchView');
      toggleIcon.textContent = this.isPitchView ? '📊' : '⚽';
    }
  }

  rerenderCurrentView() {
    if (this.currentView === 'overview') {
      this.rerenderOverview();
    }
  }

  rerenderOverview() {
    if (this.overviewData?.match_record) {
      this.renderMatchRecord(this.overviewData.match_record);
      this.renderStrengths(this.overviewData.top_strengths || []);
      this.renderWeaknesses(this.overviewData.top_weaknesses || []);
    }

    if (this.tacticalProfileData) {
      this.renderTacticalProfile(this.tacticalProfileData);
    }
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
    this.mountLanguageSelector(viewName);

    if (viewName === 'players' && this.players.length === 0) {
      this.loadPlayers();
    } else if (viewName === 'matches' && this.matches.length === 0) {
      this.loadMatches();
    } else if (viewName === 'comparison') {
      this.loadComparisonView();
    } else if (viewName === 'recruitment' && !this.recruitmentLoaded) {
      this.loadRecruitment();
    }
  }

  async checkAPIConnection() {
    const statusIndicator = document.getElementById('apiStatus');
    const statusText = document.getElementById('apiStatusText');

    try {
      const isConnected = await apiClient.checkHealth();
      if (isConnected) {
        statusIndicator.classList.add('connected');
        statusText.textContent = this.t('status.connected');
      } else {
        statusIndicator.classList.add('error');
        statusText.textContent = this.t('status.apiError');
      }
    } catch (error) {
      statusIndicator.classList.add('error');
      statusText.textContent = this.t('status.disconnected');
      console.error('API connection failed:', error);
    }
  }

  async loadOverview() {
    try {
      const overview = await apiClient.getTeamOverview();
      this.overviewData = overview;
      this.renderMatchRecord(overview.match_record);
      this.renderStrengths(overview.top_strengths);
      this.renderWeaknesses(overview.top_weaknesses);

      const tacticalProfile = await apiClient.getTacticalProfile();
      this.tacticalProfileData = tacticalProfile;
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
    const winsTitle = this.language === 'ro' ? 'Victorii' : 'Wins';
    const drawsTitle = this.language === 'ro' ? 'Egaluri' : 'Draws';
    const lossesTitle = this.language === 'ro' ? 'Infrangeri' : 'Losses';
    const summaryWins = this.language === 'ro' ? 'V' : 'W';
    const summaryDraws = this.language === 'ro' ? 'E' : 'D';
    const summaryLosses = this.language === 'ro' ? 'I' : 'L';
    bar.innerHTML = `
      <div class="ov-rb-seg ov-rb-win"  style="width:${wp}%" title="${winsTitle} ${wp}%"></div>
      <div class="ov-rb-seg ov-rb-draw" style="width:${dp}%" title="${drawsTitle} ${dp}%"></div>
      <div class="ov-rb-seg ov-rb-loss" style="width:${lp}%" title="${lossesTitle} ${lp}%"></div>
    `;
    bar.title = `W ${wp}% · D ${dp}% · L ${lp}%`;

  }

  renderStrengths(strengths) {
    const el = document.getElementById('topStrengths');
    el.className = '';
    el.innerHTML = strengths.map((s, i) => {
      const pct = Math.min((s.score / 100) * 100, 100);
      const label = this.language === 'ro' ? (s.label || s.label_en || '-') : (s.label_en || s.label || '-');
      return `
        <div class="ov-metric-row">
          <span class="ov-metric-rank ov-rank-str">${i + 1}</span>
          <span class="ov-metric-name">${label}</span>
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
      const label = this.language === 'ro' ? (w.label || w.label_en || '-') : (w.label_en || w.label || '-');
      return `
        <div class="ov-metric-row">
          <span class="ov-metric-rank ov-rank-wk">${i + 1}</span>
          <span class="ov-metric-name">${label}</span>
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
      const tierLabel = this.language === 'ro'
        ? (tier === 'FORTE' ? 'PUTERNIC' : tier === 'OK' ? 'OK' : 'SLAB')
        : (tier === 'FORTE' ? 'STRONG' : tier === 'OK' ? 'OK' : 'WEAK');
      const label = this.language === 'ro' ? (dim.label || dim.label_en || '-') : (dim.label_en || dim.label || '-');
      return `
        <div class="ov-dim-card">
          <div class="ov-dim-top">
            <span class="ov-dim-name">${label}</span>
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
    console.log('=== loadPlayers START ===');
    const tbody = document.getElementById('playersTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading players...</td></tr>';

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
    console.log('=== renderPitchView START ===');
    const pitchPlayers = document.getElementById('pitchPlayers');
    if (!pitchPlayers) {
      console.error('pitchPlayers element not found');
      return;
    }

    // Clear existing
    pitchPlayers.innerHTML = '';

    // Get pitch container and SVG dimensions
    const pitchContainer = document.querySelector('.pitch-container');
    const svg = document.querySelector('.football-pitch');
    if (!pitchContainer || !svg) {
      console.error('pitch-container or football-pitch not found');
      return;
    }

    console.log('Rendering', Object.keys(this.playerPositions).length, 'players on pitch');

    Object.values(this.playerPositions).forEach(({ x, y, player }) => {
      const playerCard = document.createElement('div');
      playerCard.className = 'player-card' + (this.dragDropEnabled ? ' draggable' : '');
      playerCard.dataset.playerId = player.player_id;

      // Position directly on the pitch using percentages
      playerCard.style.left = x + '%';
      playerCard.style.top = y + '%';

      const rating = player.overall ? player.overall.toFixed(1) : '-';
      const goals = player.raw?.goals || 0;
      const assists = player.raw?.assists || 0;
      const apps = player.apps || 0;

      // Get strengths and weaknesses
      const strengths = player.strengths || [];
      const weaknesses = player.weaknesses || [];

      playerCard.innerHTML = `
        <div class="player-card-inner">
          <div class="player-card-rating">${rating}</div>
          <div class="player-card-name" title="${player.name || 'Unknown'}">${player.name || 'Unknown'}</div>
          <div class="player-card-position">${player.position || '-'}</div>
          ${this.showPitchStats ? `
            <div class="player-card-stats">
              <div class="player-stat">
                <span class="player-stat-label">G:</span>
                <span class="player-stat-value">${goals}</span>
              </div>
              <div class="player-stat">
                <span class="player-stat-label">A:</span>
                <span class="player-stat-value">${assists}</span>
              </div>
              <div class="player-stat">
                <span class="player-stat-label">Apps:</span>
                <span class="player-stat-value">${apps}</span>
              </div>
            </div>
            ${strengths.length > 0 ? `
              <div class="player-card-traits">
                <div class="player-strengths" title="${strengths.join(', ')}">
                  <span class="trait-icon">💪</span> ${strengths.slice(0, 2).join(', ')}
                </div>
              </div>
            ` : ''}
            ${weaknesses.length > 0 ? `
              <div class="player-card-traits">
                <div class="player-weaknesses" title="${weaknesses.join(', ')}">
                  <span class="trait-icon">⚠️</span> ${weaknesses.slice(0, 2).join(', ')}
                </div>
              </div>
            ` : ''}
          ` : ''}
        </div>
      `;

      // Store player for click handler
      let clickStartTime = 0;
      let clickStartX = 0;
      let clickStartY = 0;

      playerCard.addEventListener('mousedown', (e) => {
        clickStartTime = Date.now();
        clickStartX = e.clientX;
        clickStartY = e.clientY;
      });

      playerCard.addEventListener('click', (e) => {
        const clickDuration = Date.now() - clickStartTime;
        const clickDeltaX = Math.abs(e.clientX - clickStartX);
        const clickDeltaY = Math.abs(e.clientY - clickStartY);

        // Only show detail if it wasn't a drag (quick click with minimal movement)
        if (clickDuration < 300 && clickDeltaX < 5 && clickDeltaY < 5) {
          e.stopPropagation();
          this.showPlayerDetail(player);
        }
      });

      if (this.dragDropEnabled) {
        this.makeDraggable(playerCard);
        this.makeDroppable(playerCard, player);
      }

      pitchPlayers.appendChild(playerCard);
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
          e.dataTransfer.setData('text/plain', player.player_id);
          e.dataTransfer.setData('source', 'bench');
          subCard.classList.add('dragging');
        });

        subCard.addEventListener('dragend', () => {
          subCard.classList.remove('dragging');
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
      toggleText.textContent = this.t('toggle.tableView');
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
      toggleText.textContent = this.t('toggle.pitchView');
      toggleIcon.textContent = '⚽';
    }
  }

  changeFormation(formation) {
    this.currentFormation = formation;
    this.assignPlayersToFormation();
    this.renderPitchView();
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

  makeDraggable(element) {
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, initialLeft, initialTop;

    const onMouseDown = (e) => {
      if (!this.dragDropEnabled) return;
      if (e.button !== 0) return;

      isDragging = true;
      hasMoved = false;
      element.classList.add('dragging');

      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(element.style.left);
      initialTop = parseFloat(element.style.top);

      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);

      // Consider it a drag if moved more than 5 pixels
      if (deltaX > 5 || deltaY > 5) {
        hasMoved = true;
      }

      const svg = document.querySelector('.football-pitch');
      if (!svg) return;

      const svgRect = svg.getBoundingClientRect();
      const newLeft = initialLeft + ((e.clientX - startX) / svgRect.width * 100);
      const newTop = initialTop + ((e.clientY - startY) / svgRect.height * 100);

      element.style.left = Math.max(5, Math.min(95, newLeft)) + '%';
      element.style.top = Math.max(5, Math.min(95, newTop)) + '%';
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        element.classList.remove('dragging');

        if (hasMoved) {
          // Save new position
          const playerId = element.dataset.playerId;
          if (this.playerPositions[playerId]) {
            this.playerPositions[playerId].x = parseFloat(element.style.left);
            this.playerPositions[playerId].y = parseFloat(element.style.top);
          }
        }
      }
    };

    element.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Store flag to prevent click event
    element.dataset.isDraggable = 'true';
    element.dataset.hasMoved = 'false';
  }

  makeDroppable(element, currentPlayer) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      element.classList.add('drop-target');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('drop-target');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      element.classList.remove('drop-target');

      const droppedPlayerId = parseInt(e.dataTransfer.getData('text/plain'));
      const source = e.dataTransfer.getData('source');

      if (source === 'bench') {
        // Substitute: swap bench player with pitch player
        const benchPlayer = this.players.find(p => p.player_id === droppedPlayerId);
        if (!benchPlayer) return;

        console.log(`Substituting ${currentPlayer.name} with ${benchPlayer.name}`);

        // Find the position slot
        const positionSlot = Object.values(this.playerPositions).find(
          pos => pos.player.player_id === currentPlayer.player_id
        );

        if (positionSlot) {
          // Replace player in the slot
          positionSlot.player = benchPlayer;
          delete this.playerPositions[currentPlayer.player_id];
          this.playerPositions[benchPlayer.player_id] = positionSlot;

          // Re-render both pitch and bench
          this.renderPitchView();
          this.renderSubstitutes();
        }
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

  getPriorityClass(priority) {
    const normalized = (priority || '').toLowerCase();
    if (normalized === 'high') return 'priority-high';
    if (normalized === 'medium') return 'priority-medium';
    return 'priority-low';
  }

  parseTraits(traits) {
    if (Array.isArray(traits)) return traits;
    if (typeof traits !== 'string') return [];
    try {
      const parsed = JSON.parse(traits.replace(/'/g, '"'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  formatMetricValue(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return value >= 10 ? value.toFixed(1) : value.toFixed(2);
  }

  async loadRecruitment() {
    const statusEl = document.getElementById('recruitmentStatus');
    const needsEl = document.getElementById('recruitmentNeeds');
    const shortlistEl = document.getElementById('recruitmentShortlist');
    const shortlistLimit = Number(document.getElementById('shortlistLimit')?.value || 4);

    if (!statusEl || !needsEl || !shortlistEl) return;

    statusEl.textContent = 'Loading recruitment data...';
    needsEl.innerHTML = '<div class="loading">Loading priority needs...</div>';
    shortlistEl.innerHTML = '<div class="loading">Loading shortlist...</div>';

    const requestId = ++this.recruitmentRequestId;
    const withTimeout = (promise, label, ms = 75000) => Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
      }),
    ]);

    const [recommendationsResult, shortlistResult] = await Promise.allSettled([
      withTimeout(apiClient.getRecruitmentRecommendations(), 'Recommendations'),
      withTimeout(apiClient.getRecruitmentShortlist(shortlistLimit), 'Shortlist'),
    ]);

    // Ignore stale responses if user clicked refresh/apply multiple times quickly.
    if (requestId !== this.recruitmentRequestId) return;

    const failures = [];

    if (recommendationsResult.status === 'fulfilled') {
      this.renderRecruitmentNeeds(recommendationsResult.value?.priority_needs || []);
    } else {
      console.error('Failed to load recruitment recommendations:', recommendationsResult.reason);
      needsEl.innerHTML = '<div style="color: var(--danger);">Could not load priority needs.</div>';
      failures.push('priority needs');
    }

    if (shortlistResult.status === 'fulfilled') {
      this.renderRecruitmentShortlist(shortlistResult.value?.shortlist || []);
    } else {
      console.error('Failed to load recruitment shortlist:', shortlistResult.reason);
      shortlistEl.innerHTML = '<div style="color: var(--danger);">Could not load shortlist.</div>';
      failures.push('shortlist');
    }

    if (failures.length === 0) {
      statusEl.textContent = `Updated shortlist with up to ${shortlistLimit} candidates per role.`;
    } else {
      statusEl.textContent = `Loaded with issues: ${failures.join(' and ')} unavailable.`;
    }
    this.recruitmentLoaded = true;
  }

  renderRecruitmentNeeds(needs) {
    const el = document.getElementById('recruitmentNeeds');
    if (!el) return;

    if (!needs.length) {
      el.innerHTML = '<div class="loading">No recruitment needs returned.</div>';
      return;
    }

    el.innerHTML = needs.map((need) => `
      <article class="need-card">
        <div class="need-card-header">
          <span class="need-position">${need.position}</span>
          <span class="need-priority ${this.getPriorityClass(need.priority)}">${need.priority || 'n/a'}</span>
        </div>
        <p class="need-reason">${need.reason || 'No reason provided.'}</p>
        <div class="need-meta">
          <span>Min minutes: <strong>${need.min_minutes ?? '-'}</strong></span>
          <span>Max age: <strong>${need.age_max ?? '-'}</strong></span>
        </div>
        <div class="need-section-label">Desired traits</div>
        <div class="need-tags">
          ${(need.desired_traits || []).map((trait) => `<span class="need-tag">${trait}</span>`).join('')}
        </div>
        <div class="need-section-label">Target metrics</div>
        <div class="need-tags">
          ${(need.target_metrics || []).map((metric) => `<span class="need-tag metric-tag">${metric}</span>`).join('')}
        </div>
      </article>
    `).join('');
  }

  renderRecruitmentShortlist(shortlist) {
    const el = document.getElementById('recruitmentShortlist');
    if (!el) return;

    if (!shortlist.length) {
      el.innerHTML = '<div class="loading">No shortlist candidates returned.</div>';
      return;
    }

    el.innerHTML = shortlist.map((item) => `
      <section class="shortlist-group">
        <div class="shortlist-group-header">
          <span class="need-position">${item.position}</span>
          <span class="need-priority ${this.getPriorityClass(item.priority)}">${item.priority || 'n/a'}</span>
        </div>
        <p class="need-reason">${item.reason || 'No reason provided.'}</p>
        <div class="candidate-list">
          ${(item.candidates || []).map((candidate) => {
            const traits = this.parseTraits(candidate.strengths);
            const topMetrics = (candidate.fit_metrics || []).slice(0, 3);
            return `
              <article class="candidate-card">
                <div class="candidate-main">
                  <div class="candidate-identity">
                    ${this._playerAvatar(candidate, '#8df5e6', 40)}
                    <div>
                    <div class="candidate-name">${candidate.name || 'Unknown'}</div>
                    <div class="candidate-meta">${candidate.team_slug || 'Unknown team'} · ${(candidate.position || '-').toUpperCase()} · ${candidate.minutes || 0} mins</div>
                    </div>
                  </div>
                  <div class="candidate-score">${this.formatMetricValue(candidate.fit_score)}</div>
                </div>
                <div class="candidate-rating">Overall: ${this.formatMetricValue(candidate.overall)}</div>
                ${traits.length ? `<div class="need-tags">${traits.map((trait) => `<span class="need-tag">${trait}</span>`).join('')}</div>` : ''}
                ${topMetrics.length ? `
                  <div class="candidate-metrics">
                    ${topMetrics.map((metric) => `<span class="metric-item">${metric.metric}: ${this.formatMetricValue(metric.value)}</span>`).join('')}
                  </div>
                ` : ''}
                ${candidate.verdict ? `<div class="candidate-verdict">${candidate.verdict}</div>` : ''}
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `).join('');
  }

  showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.className = '';
      element.innerHTML = `<span style="color: var(--danger);">${message}</span>`;
    }
  }

  // --- Risk Scout ---

  async runScraper() {
    const input     = document.getElementById('scraperInput');
    const statusEl  = document.getElementById('scraperStatus');
    const resultsEl = document.getElementById('scraperResults');
    const runBtn    = document.getElementById('scraperRunBtn');

    const playerName = (input.value || '').trim();
    if (!playerName) {
      statusEl.className = 'scraper-status error';
      statusEl.textContent = 'Please enter a player name.';
      return;
    }

    resultsEl.style.display = 'none';
    statusEl.className = 'scraper-status loading';
    statusEl.innerHTML = '<div class="scraper-spinner"></div> Searching for articles about <strong>' + playerName + '</strong>... this can take up to 60 s';
    runBtn.disabled = true;

    try {
      const data = await apiClient.getPlayerRisk(playerName);
      this.renderScraperResults(data);
      statusEl.className = 'scraper-status';
      statusEl.textContent = '';
    } catch (err) {
      statusEl.className = 'scraper-status error';
      const detail = (err && err.response && err.response.data && err.response.data.detail) || err.message || 'Unknown error';
      statusEl.textContent = 'Error: ' + detail;
      resultsEl.style.display = 'none';
    } finally {
      runBtn.disabled = false;
    }
  }

  renderScraperResults(data) {
    const resultsEl = document.getElementById('scraperResults');

    document.getElementById('scraperPlayerName').textContent = data.player || '--';

    // Character profile
    const traitsEl = document.getElementById('scraperTraits');
    const profile  = data.character_profile || [];

    if (profile.length === 0) {
      traitsEl.innerHTML = '<div class="scraper-no-traits">No risk traits detected &mdash; clean profile.</div>';
    } else {
      traitsEl.innerHTML = profile.map(function(t) {
        return '<div class="scraper-trait-row">'
          + '<span class="scraper-trait-label">' + t.trait + '</span>'
          + '<div class="scraper-trait-bar-wrap">'
            + '<div class="scraper-trait-bar-fill level-' + t.level + '" style="width:' + t.score + '%"></div>'
          + '</div>'
          + '<span class="scraper-trait-score">' + t.score + '</span>'
          + '<span class="scraper-trait-level level-' + t.level + '">' + t.level + '</span>'
          + '<span class="scraper-trait-desc">' + (t.description || '') + '</span>'
          + '</div>';
      }).join('');
    }

    // Source reports
    const reportsEl     = document.getElementById('scraperReports');
    const reports       = Array.isArray(data.reports) ? data.reports : [];
    const articleReports = reports.filter(function(r) { return typeof r === 'object'; });

    if (articleReports.length === 0) {
      reportsEl.innerHTML = '<div class="scraper-clean">No negative articles found.</div>';
    } else {
      reportsEl.innerHTML = articleReports.map(function(r) {
        var issues = (r.issues || []).map(function(issue) {
          return '<div class="scraper-issue">'
            + '<span class="scraper-issue-type type-' + issue.type + '">' + issue.type + '</span>'
            + '<span class="scraper-issue-summary">' + issue.summary + '</span>'
            + '<span class="scraper-issue-sev">sev ' + (+issue.severity).toFixed(1) + '</span>'
            + '</div>';
        }).join('');
        return '<div class="scraper-report-item">'
          + '<div class="scraper-report-title">' + (r.title || 'Untitled') + '</div>'
          + '<div class="scraper-report-url"><a href="' + r.url + '" target="_blank">' + r.url + '</a></div>'
          + '<div class="scraper-issue-list">' + issues + '</div>'
          + '</div>';
      }).join('');
    }

    resultsEl.style.display = 'block';
  }
}

const app = new App();
window.app = app;
