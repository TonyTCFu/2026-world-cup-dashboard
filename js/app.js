// 2026年世界杯每日赛程快报 Dashboard - 核心逻辑控制

document.addEventListener("DOMContentLoaded", () => {
  // 全局状态管理
  // 获取用户本地日期 (格式为 YYYY-MM-DD)
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localDate = new Date(today.getTime() - (offset * 60 * 1000));
  const localDateString = localDate.toISOString().split('T')[0];

  // 检查本地日期是否在小组赛范围内 (2026-06-11 至 2026-06-27)
  const isWithinWorldCup = localDateString >= "2026-06-11" && localDateString <= "2026-06-27";
  const defaultDate = isWithinWorldCup ? localDateString : WORLDCUP_DATA.currentDate;

  const state = {
    currentDate: WORLDCUP_DATA.currentDate,
    selectedDate: defaultDate,
    activeTab: "tab-schedule",
    activeMatchDetailId: null, // 跟踪当前打开的详情弹窗比赛 ID
  };

  // DOM 节点缓存
  const dom = {
    headerMatchday: document.getElementById("header-matchday"),
    headerUpdateTime: document.getElementById("header-update-time"),
    statMatches: document.getElementById("stat-matches"),
    statGoals: document.getElementById("stat-goals"),
    statAvgGoals: document.getElementById("stat-avg-goals"),
    
    dateSlider: document.getElementById("date-slider"),
    scheduleDateTitle: document.getElementById("schedule-date-title"),
    scheduleMatchCount: document.getElementById("schedule-match-count"),
    matchScheduleList: document.getElementById("match-schedule-list"),
    
    reportDate: document.getElementById("report-date"),
    reportTitle: document.getElementById("report-title"),
    reportContent: document.getElementById("report-content"),
    reportStatOfDay: document.getElementById("report-stat-of-day"),
    momDetailBody: document.getElementById("mom-detail-body"),
    completedAnalysisList: document.getElementById("completed-analysis-list"),
    
    groupsGrid: document.getElementById("groups-grid"),
    previewsList: document.getElementById("previews-list"),
    
    modal: document.getElementById("match-detail-modal"),
    modalContent: document.getElementById("modal-body-content"),
    modalCloseBtn: document.getElementById("modal-close-btn"),
    
    tabButtons: document.querySelectorAll(".tab-btn"),
    tabPanels: document.querySelectorAll(".tab-panel"),
    prevDateBtn: document.querySelector(".prev-btn"),
    nextDateBtn: document.querySelector(".next-btn"),
  };

  // 提取 ESPN 数据统计指标并对其进行主客场排列调整
  function extractLiveStats(homeComp, awayComp, isHome) {
    if (!homeComp.statistics || !awayComp.statistics) return null;

    const findStat = (comp, name) => {
      const stat = comp.statistics.find(s => s.name === name);
      return stat ? Math.round(parseFloat(stat.displayValue)) : 0;
    };

    const rawHomePoss = findStat(homeComp, "possessionPct") || 50;
    const rawAwayPoss = 100 - rawHomePoss;

    const homePoss = isHome ? rawHomePoss : rawAwayPoss;
    const awayPoss = isHome ? rawAwayPoss : rawHomePoss;

    const rawHomeShots = findStat(homeComp, "totalShots");
    const rawAwayShots = findStat(awayComp, "totalShots");
    const homeShots = isHome ? rawHomeShots : rawAwayShots;
    const awayShots = isHome ? rawAwayShots : rawHomeShots;

    const rawHomeTarget = findStat(homeComp, "shotsOnTarget");
    const rawAwayTarget = findStat(awayComp, "shotsOnTarget");
    const homeTarget = isHome ? rawHomeTarget : rawAwayTarget;
    const awayTarget = isHome ? rawAwayTarget : rawHomeTarget;

    const rawHomeFouls = findStat(homeComp, "foulsCommitted");
    const rawAwayFouls = findStat(awayComp, "foulsCommitted");
    const homeFouls = isHome ? rawHomeFouls : rawAwayFouls;
    const awayFouls = isHome ? rawAwayFouls : rawHomeFouls;

    return {
      possession: [homePoss, awayPoss],
      shots: [homeShots, awayShots],
      target: [homeTarget, awayTarget],
      fouls: [homeFouls, awayFouls]
    };
  }

  // 浏览器端实时数据更新 (0 延迟抓取 ESPN 官方实时比分)
  async function fetchLiveScores() {
    try {
      const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260720";
      const res = await fetch(url);
      const data = await res.json();
      if (!data.events || data.events.length === 0) return;

      const TEAM_MAP = {
        "ROM": "ROU",
        "CGO": "COD",
        "DRC": "COD",
        "TUR": "ROU",
        "CUW": "CUR",
        "IRQ": "HON",
      };
      const mapTeam = (abbr) => TEAM_MAP[abbr] || abbr;

      let hasChanges = false;

      data.events.forEach(event => {
        const comp = event.competitions[0];
        if (!comp) return;

        const homeCompetitor = comp.competitors.find(c => c.homeAway === 'home');
        const awayCompetitor = comp.competitors.find(c => c.homeAway === 'away');
        if (!homeCompetitor || !awayCompetitor) return;

        const homeAbbr = mapTeam(homeCompetitor.team.abbreviation);
        const awayAbbr = mapTeam(awayCompetitor.team.abbreviation);

        const homeScore = parseInt(homeCompetitor.score || "0");
        const awayScore = parseInt(awayCompetitor.score || "0");
        const isCompleted = comp.status.type.completed;
        const detailStatus = comp.status.type.detail; // e.g. "FT", "Live 45'"
        const state = comp.status.type.state; // "pre", "in", "post"

        const match = WORLDCUP_DATA.matches.find(m => 
          (m.home === homeAbbr && m.away === awayAbbr) ||
          (m.home === awayAbbr && m.away === homeAbbr)
        );

        if (match) {
          const isHome = match.home === homeAbbr;
          const actualHomeScore = isHome ? homeScore : awayScore;
          const actualAwayScore = isHome ? awayScore : homeScore;
          const liveStats = extractLiveStats(homeCompetitor, awayCompetitor, isHome);

          if (isCompleted) {
            // 如果已完赛，且本地比分和状态不同，临时更新
            if (match.status !== "FT" || !match.score || match.score.home !== actualHomeScore || match.score.away !== actualAwayScore) {
              match.status = "FT";
              match.score = { home: actualHomeScore, away: actualAwayScore };
              hasChanges = true;
            }
            if (liveStats && (!match.stats || JSON.stringify(match.stats) !== JSON.stringify(liveStats))) {
              match.stats = liveStats;
              hasChanges = true;
            }
          } else if (state === "in") {
            // 如果进行中，且本地数据未更新比分或状态，临时更新
            if (match.status !== detailStatus || !match.score || match.score.home !== actualHomeScore || match.score.away !== actualAwayScore) {
              match.status = detailStatus || "Live";
              match.score = { home: actualHomeScore, away: actualAwayScore };
              hasChanges = true;
            }
            if (liveStats && (!match.stats || JSON.stringify(match.stats) !== JSON.stringify(liveStats))) {
              match.stats = liveStats;
              hasChanges = true;
            }
          } else if (state === "pre") {
            // 如果未开始，且本地被错误标记为 FT
            if (match.status !== "Scheduled") {
              match.status = "Scheduled";
              delete match.score;
              delete match.stats;
              hasChanges = true;
            }
          }
        }
      });

      if (hasChanges) {
        console.log("[实时数据] 浏览器端成功同步并渲染最新比分与技术统计！");
        // 重新渲染当前 Tab 和全球头部数据
        renderGlobalHeader();
        renderTabContent();

        // 如果当前有打开的详情弹窗，且该比赛的数据发生了更新，则重新渲染弹窗内容
        if (state.activeMatchDetailId) {
          window.viewMatchDetails(state.activeMatchDetailId);
        }
      }
    } catch (err) {
      console.warn("[实时数据] 无法在浏览器端直接请求 ESPN 数据 (可能跨域或无网络):", err);
    }
  }

  // 初始化应用
  function init() {
    renderGlobalHeader();
    renderDateSlider();
    renderTabContent();
    setupEventListeners();
    
    // 首次加载立即执行一次浏览器端实时数据对齐，随后每 30 秒轮询一次
    fetchLiveScores();
    setInterval(fetchLiveScores, 30 * 1000);
  }

  // ==========================================
  // 1. 全局数据面板计算与渲染
  // ==========================================
  function renderGlobalHeader() {
    const finishedMatches = WORLDCUP_DATA.matches.filter(m => m.status === "FT");
    const totalMatchesCount = 104; // 2026世界杯扩军后共104场
    const playedMatchesCount = finishedMatches.length;
    
    let totalGoals = 0;
    finishedMatches.forEach(m => {
      totalGoals += (m.score.home + m.score.away);
    });
    const avgGoals = playedMatchesCount > 0 ? (totalGoals / playedMatchesCount).toFixed(2) : "0.00";

    dom.headerMatchday.textContent = `第${WORLDCUP_DATA.currentMatchday}比赛日 (小组赛阶段)`;
    dom.headerUpdateTime.textContent = WORLDCUP_DATA.lastUpdated;
    
    dom.statMatches.textContent = `${playedMatchesCount} / ${totalMatchesCount}`;
    dom.statGoals.textContent = totalGoals;
    dom.statAvgGoals.textContent = avgGoals;
  }

  // ==========================================
  // 2. 日期滑动选择器 (Date Slider)
  // ==========================================
  function renderDateSlider() {
    dom.dateSlider.innerHTML = "";
    
    // 生成从 6月11日 到 6月27日 (小组赛阶段) 的日期数组
    const startDate = new Date("2026-06-11");
    const endDate = new Date("2026-06-27");
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split("T")[0];
      const dayNum = d.getDate();
      const month = d.getMonth() + 1;
      
      // 获取星期几
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const weekText = weekdays[d.getDay()];

      const dateCard = document.createElement("div");
      dateCard.className = `date-card ${dateString === state.selectedDate ? "active" : ""}`;
      dateCard.dataset.date = dateString;
      
      // 检查该日期是否有比赛完赛、进行中或未来安排
      const dayMatches = WORLDCUP_DATA.matches.filter(m => m.date === dateString);
      let statusDot = "";
      if (dayMatches.length > 0) {
        const hasLive = dayMatches.some(m => m.status !== "Scheduled" && m.status !== "FT");
        const hasFT = dayMatches.some(m => m.status === "FT");
        if (hasLive) {
          statusDot = `<span class="date-status-dot" style="background: var(--color-live);"></span>`;
        } else if (hasFT) {
          statusDot = `<span class="date-status-dot" style="background: var(--accent-cyan);"></span>`;
        } else {
          statusDot = `<span class="date-status-dot" style="background: var(--accent-blue);"></span>`;
        }
      }

      dateCard.innerHTML = `
        ${statusDot}
        <span class="date-card-week">${weekText}</span>
        <span class="date-card-day">${month}/${dayNum}</span>
      `;

      dateCard.addEventListener("click", () => {
        document.querySelectorAll(".date-card").forEach(c => c.classList.remove("active"));
        dateCard.classList.add("active");
        state.selectedDate = dateString;
        
        // 渲染赛程及对应分析
        renderScheduleTab();
        if (state.activeTab === "tab-analysis") {
          renderAnalysisTab();
        }
      });

      dom.dateSlider.appendChild(dateCard);
    }

    // 默认滚动至选中的日期卡片
    setTimeout(() => {
      const activeCard = dom.dateSlider.querySelector(".date-card.active");
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }, 100);
  }

  // ==========================================
  // 3. 今日赛程面板渲染 (Tab 1)
  // ==========================================
  function renderScheduleTab() {
    // 渲染日期标题
    const d = new Date(state.selectedDate);
    const zhDateString = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    dom.scheduleDateTitle.textContent = zhDateString;

    const dayMatches = WORLDCUP_DATA.matches.filter(m => m.date === state.selectedDate);
    dom.scheduleMatchCount.textContent = `${dayMatches.length} 场比赛`;
    
    dom.matchScheduleList.innerHTML = "";
    
    if (dayMatches.length === 0) {
      dom.matchScheduleList.innerHTML = `
        <div class="card" style="grid-column: 1/-1; padding: 3rem; text-align: center; color: var(--text-secondary);">
          <i class="fa-regular fa-calendar-times" style="font-size: 3rem; margin-bottom: 1rem; color: var(--text-muted);"></i>
          <p>当日无比赛安排，请切换日期查看其他赛程。</p>
        </div>
      `;
      return;
    }

    dayMatches.forEach(match => {
      const homeTeam = WORLDCUP_DATA.teams[match.home];
      const awayTeam = WORLDCUP_DATA.teams[match.away];
      
      const card = document.createElement("div");
      card.className = "card match-card animate-slide-up";
      
      // 比分/时间显示
      let scoreDisplay = `<span class="match-vs">VS</span>`;
      let statusClass = "scheduled";
      let statusText = match.time;

      if (match.status === "FT") {
        scoreDisplay = `<span class="match-score">${match.score.home} - ${match.score.away}</span>`;
        statusClass = "ft";
        statusText = "已结束 FT";
      } else if (match.status !== "Scheduled") {
        scoreDisplay = `<span class="match-score live">${match.score.home} - ${match.score.away}</span>`;
        statusClass = "live";
        statusText = `<i class="fa-solid fa-tower-broadcast animate-pulse"></i> ${match.status}`;
      }

      // 底部的详情/操作按钮
      let actionBtn = "";
      if (match.status === "FT") {
        actionBtn = `<button class="btn-details" onclick="window.viewMatchDetails(${match.id})"><i class="fa-solid fa-file-invoice-chart"></i> 详细战报</button>`;
      } else if (match.status !== "Scheduled") {
        actionBtn = `<button class="btn-details" onclick="window.viewMatchDetails(${match.id})"><i class="fa-solid fa-wave-square"></i> 实时统计</button>`;
      } else {
        actionBtn = `<button class="btn-details" onclick="window.viewMatchDetails(${match.id})"><i class="fa-solid fa-wand-magic-sparkles"></i> 赛前预测</button>`;
      }

      card.innerHTML = `
        <div class="match-card-header">
          <span class="match-group">${match.group}组</span>
          <span class="match-stadium"><i class="fa-solid fa-location-dot"></i> ${match.stadium}</span>
        </div>
        <div class="match-teams-box">
          <div class="match-team home">
            <span class="team-flag">${homeTeam.flag}</span>
            <span class="team-name">${homeTeam.name}</span>
          </div>
          <div class="match-score-area">
            ${scoreDisplay}
          </div>
          <div class="match-team away">
            <span class="team-flag">${awayTeam.flag}</span>
            <span class="team-name">${awayTeam.name}</span>
          </div>
        </div>
        <div class="match-card-footer">
          <span class="match-status-badge ${statusClass}">${statusText}</span>
          ${actionBtn}
        </div>
      `;
      dom.matchScheduleList.appendChild(card);
    });
  }

  // ==========================================
  // 4. 战况快报面板渲染 (Tab 2)
  // ==========================================
  function renderAnalysisTab() {
    const d = new Date(state.selectedDate);
    const zhDateString = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    dom.reportDate.textContent = zhDateString;

    const summary = WORLDCUP_DATA.dailySummaries[state.selectedDate];
    
    // 1. 渲染每日简报
    if (summary) {
      dom.reportTitle.textContent = summary.title;
      dom.reportContent.textContent = summary.content;
      dom.reportStatOfDay.textContent = summary.statOfTheDay;
      document.getElementById("report-stat-of-day-container").style.display = "flex";
      
      // 2. 渲染 MVP 信息
      const keyMatch = WORLDCUP_DATA.matches.find(m => m.id === summary.keyMatch);
      if (keyMatch && keyMatch.mvp) {
        const mvp = keyMatch.mvp;
        const mvpTeam = WORLDCUP_DATA.teams[mvp.team];
        dom.momDetailBody.innerHTML = `
          <div class="mom-avatar-box">
            <i class="fa-solid fa-crown mom-crown"></i>
            <div class="mom-photo-placeholder">
              <i class="fa-solid fa-user-ninja"></i>
            </div>
          </div>
          <div class="mom-name">${mvp.name}</div>
          <div class="mom-team-badge" style="background: rgba(255,215,0,0.15); border: 1px solid var(--accent-yellow); color: var(--accent-yellow);">
            ${mvpTeam.flag} ${mvpTeam.name}
          </div>
          <div class="mom-rating">
            <i class="fa-solid fa-star"></i> 评分 ${mvp.rating}
          </div>
          <div class="mom-reason">
            “ ${mvp.reason} ”
          </div>
        `;
        document.getElementById("mom-card-container").style.display = "flex";
      } else {
        dom.momDetailBody.innerHTML = `<p style="color:var(--text-muted);">当日暂无评选出的 MVP 球员。</p>`;
        document.getElementById("mom-card-container").style.display = "none";
      }
    } else {
      dom.reportTitle.textContent = "暂无今日简报";
      dom.reportContent.textContent = "当前日期尚未开赛，或今日战报数据尚未录入。请选择之前的比赛日查看。";
      document.getElementById("report-stat-of-day-container").style.display = "none";
      dom.momDetailBody.innerHTML = `<p style="color:var(--text-muted);">暂无 MVP 数据。</p>`;
      document.getElementById("mom-card-container").style.display = "none";
    }

    // 3. 渲染当天完赛的详细战况列表
    const dayFinishedMatches = WORLDCUP_DATA.matches.filter(m => m.date === state.selectedDate && m.status === "FT");
    dom.completedAnalysisList.innerHTML = "";

    if (dayFinishedMatches.length === 0) {
      dom.completedAnalysisList.innerHTML = `
        <div class="card" style="padding: 2.5rem; text-align: center; color: var(--text-secondary);">
          <i class="fa-solid fa-diagram-project" style="font-size: 2.5rem; margin-bottom: 0.8rem; color: var(--text-muted);"></i>
          <p>当日无已结束的比赛，暂无详细战术统计。您可以切换至已完赛日期查看分析。</p>
        </div>
      `;
      return;
    }

    dayFinishedMatches.forEach(match => {
      const homeTeam = WORLDCUP_DATA.teams[match.home];
      const awayTeam = WORLDCUP_DATA.teams[match.away];
      
      const detailCard = document.createElement("div");
      detailCard.className = "card aggression-card analysis-detail-card animate-slide-up";
      
      // 计算控球等对比百分比
      const possHome = match.stats ? match.stats.possession[0] : 50;
      const possAway = match.stats ? match.stats.possession[1] : 50;

      const shotsHome = match.stats ? match.stats.shots[0] : 0;
      const shotsAway = match.stats ? match.stats.shots[1] : 0;
      const shotsTotal = (shotsHome + shotsAway) || 1;
      const shotsHomePct = ((shotsHome / shotsTotal) * 100).toFixed(0);
      const shotsAwayPct = (100 - shotsHomePct).toFixed(0);

      const targetHome = match.stats ? match.stats.target[0] : 0;
      const targetAway = match.stats ? match.stats.target[1] : 0;
      const targetTotal = (targetHome + targetAway) || 1;
      const targetHomePct = ((targetHome / targetTotal) * 100).toFixed(0);
      const targetAwayPct = (100 - targetHomePct).toFixed(0);

      detailCard.innerHTML = `
        <div class="detail-card-top">
          <div class="detail-meta">
            <span class="detail-meta-group">${match.group}组</span>
            <span><i class="fa-solid fa-map-location-dot"></i> ${match.stadium}</span>
          </div>
          <div class="match-status-badge ft"><i class="fa-regular fa-circle-check"></i> 已完赛 FT</div>
        </div>

        <div class="score-banner-box">
          <div class="score-banner-team home">
            <span>${homeTeam.name}</span>
            <span style="font-size: 1.8rem;">${homeTeam.flag}</span>
          </div>
          <div class="score-banner-display">${match.score.home} - ${match.score.away}</div>
          <div class="score-banner-team away">
            <span style="font-size: 1.8rem;">${awayTeam.flag}</span>
            <span>${awayTeam.name}</span>
          </div>
        </div>

        <div class="stat-bars-container">
          <!-- 控球率 -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span>${possHome}%</span>
              <span class="stat-label-name">控球率</span>
              <span>${possAway}%</span>
            </div>
            <div class="stat-bar-outer">
              <div class="stat-bar-fill-home" style="width: ${possHome}%;"></div>
              <div class="stat-bar-fill-away" style="width: ${possAway}%;"></div>
            </div>
          </div>
          <!-- 射门数 -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span>${shotsHome}次</span>
              <span class="stat-label-name">射门次数</span>
              <span>${shotsAway}次</span>
            </div>
            <div class="stat-bar-outer">
              <div class="stat-bar-fill-home" style="width: ${shotsHomePct}%;"></div>
              <div class="stat-bar-fill-away" style="width: ${shotsAwayPct}%;"></div>
            </div>
          </div>
          <!-- 射正数 -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span>${targetHome}次</span>
              <span class="stat-label-name">射正次数</span>
              <span>${targetAway}次</span>
            </div>
            <div class="stat-bar-outer">
              <div class="stat-bar-fill-home" style="width: ${targetHomePct}%;"></div>
              <div class="stat-bar-fill-away" style="width: ${targetAwayPct}%;"></div>
            </div>
          </div>
        </div>

        <div class="tactical-review-box">
          <strong><i class="fa-solid fa-chess-board text-gradient"></i> 核心战术深度分析</strong>
          <p>${match.analysis || "暂无详细战术评论。"}</p>
        </div>
      `;
      dom.completedAnalysisList.appendChild(detailCard);
    });
  }

  // ==========================================
  // 5. 小组积分与预测面板渲染 (Tab 3)
  // ==========================================
  function renderStandingsTab() {
    dom.groupsGrid.innerHTML = "";
    
    // 1. 动态生成积分榜 (完全根据 finished 比赛数据进行实时统计计算)
    const standings = {};
    
    // 初始化 48 支球队的积分为零
    Object.keys(WORLDCUP_DATA.teams).forEach(code => {
      const team = WORLDCUP_DATA.teams[code];
      standings[code] = {
        code: code,
        name: team.name,
        flag: team.flag,
        group: team.group,
        mp: 0, w: 0, d: 0, l: 0,
        gf: 0, ga: 0, gd: 0, pts: 0
      };
    });

    // 统计已完赛的所有比赛
    WORLDCUP_DATA.matches.forEach(m => {
      if (m.status === "FT") {
        const home = standings[m.home];
        const away = standings[m.away];
        
        home.mp += 1;
        away.mp += 1;
        home.gf += m.score.home;
        home.ga += m.score.away;
        away.gf += m.score.away;
        away.ga += m.score.home;
        
        home.gd = home.gf - home.ga;
        away.gd = away.gf - away.ga;

        if (m.score.home > m.score.away) {
          home.w += 1;
          home.pts += 3;
          away.l += 1;
        } else if (m.score.home < m.score.away) {
          away.w += 1;
          away.pts += 3;
          home.l += 1;
        } else {
          home.d += 1;
          away.d += 1;
          home.pts += 1;
          away.pts += 1;
        }
      }
    });

    // 2. 按小组 A 到 L 渲染
    const groupsList = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    
    groupsList.forEach(groupLetter => {
      // 提取本小组成员并排序 (积分由高到低，净胜球由高到低，进球数由高到低)
      const groupTeams = Object.values(standings)
        .filter(t => t.group === groupLetter)
        .sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.gd !== a.gd) return b.gd - a.gd;
          if (b.gf !== a.gf) return b.gf - a.gf;
          return a.name.localeCompare(b.name);
        });

      const groupCard = document.createElement("div");
      groupCard.className = "card group-card animate-slide-up";

      // 渲染表格行
      let tableRowsHtml = "";
      groupTeams.forEach((t, index) => {
        let rowClass = "";
        // 模拟前两名直接出线，第三名根据情况可能出线
        if (index < 2) {
          rowClass = "row-qualify";
        } else if (index === 2) {
          rowClass = "row-qualify-3rd";
        }

        tableRowsHtml += `
          <tr class="${rowClass}">
            <td class="rank-col">${index + 1}</td>
            <td>
              <div class="team-col">
                <span class="team-col-flag">${t.flag}</span>
                <span>${t.name}</span>
              </div>
            </td>
            <td class="num-col">${t.mp}</td>
            <td class="num-col">${t.w}-${t.d}-${t.l}</td>
            <td class="num-col">${t.gd > 0 ? "+" + t.gd : t.gd}</td>
            <td class="pts-col">${t.pts}</td>
          </tr>
        `;
      });

      // 渲染小组出线预测概率条
      const prediction = WORLDCUP_DATA.groupPredictions[groupLetter];
      let predictionBarsHtml = "";
      
      if (prediction && prediction.odds) {
        // 按照晋级概率降序排列展示
        const sortedOdds = [...prediction.odds].sort((a,b) => b.qualifyProb - a.qualifyProb);
        sortedOdds.forEach(odd => {
          const t = standings[odd.team];
          predictionBarsHtml += `
            <div class="group-prob-row">
              <span class="group-prob-team">${t.flag} ${t.name}</span>
              <div class="group-prob-bar-outer">
                <div class="group-prob-bar-fill" style="width: ${odd.qualifyProb}%;"></div>
              </div>
              <span class="group-prob-num">${odd.qualifyProb}%</span>
            </div>
          `;
        });
      }

      groupCard.innerHTML = `
        <div class="group-title-bar">
          <h3>Group ${groupLetter} 小组积分榜</h3>
          <span class="qualify-hint">出线: 前2 + 8个成绩最好第3</span>
        </div>
        <table class="standings-table">
          <thead>
            <tr>
              <th class="rank-col">排名</th>
              <th>球队</th>
              <th class="num-col">赛</th>
              <th class="num-col">胜-平-负</th>
              <th class="num-col">净</th>
              <th class="pts-col">积分</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div class="group-prediction-preview">
          <div class="group-prediction-title">
            <i class="fa-solid fa-wand-magic-sparkles text-gradient"></i> AI 晋级出线模拟概率
          </div>
          <p class="group-prediction-text">${prediction ? prediction.preview : "暂无该组分析。"}</p>
          <div class="group-prediction-bars">
            ${predictionBarsHtml}
          </div>
        </div>
      `;

      dom.groupsGrid.appendChild(groupCard);
    });
  }

  // ==========================================
  // 6. 赛前预估及对局预测面板渲染 (Tab 4)
  // ==========================================
  function renderPredictionsTab() {
    dom.previewsList.innerHTML = "";
    
    // 筛选出尚未开始且有预估数据的所有比赛 (过滤掉已开赛或已结束的比赛)
    const upcomingMatches = WORLDCUP_DATA.matches.filter(m => m.preview && m.status === "Scheduled");
    
    if (upcomingMatches.length === 0) {
      dom.previewsList.innerHTML = `
        <div class="card" style="padding: 3rem; text-align: center; color: var(--text-secondary);">
          <i class="fa-solid fa-dice" style="font-size: 3rem; margin-bottom: 1rem; color: var(--text-muted);"></i>
          <p>当前暂无可预测的比赛。请关注后续更新。</p>
        </div>
      `;
      return;
    }

    upcomingMatches.forEach(match => {
      const homeTeam = WORLDCUP_DATA.teams[match.home];
      const awayTeam = WORLDCUP_DATA.teams[match.away];
      const prev = match.preview;
      
      const card = document.createElement("div");
      card.className = "card preview-card animate-slide-up";

      // 概率进度条数值
      const probHome = prev.wdl[0];
      const probDraw = prev.wdl[1];
      const probAway = prev.wdl[2];

      const d = new Date(match.date);
      const formattedDate = `${d.getMonth() + 1}月${d.getDate()}日 ${match.time}`;

      card.innerHTML = `
        <div class="preview-card-header">
          <div class="preview-meta">
            <span class="preview-meta-group">${match.group}组</span>
            <span><i class="fa-regular fa-clock"></i> ${formattedDate}</span>
            <span style="margin-left: 0.5rem;"><i class="fa-solid fa-location-dot"></i> ${match.stadium}</span>
          </div>
          <div class="match-status-badge scheduled">
            <i class="fa-solid fa-dice animate-pulse"></i> 预测热度: 高
          </div>
        </div>

        <div class="prediction-teams-box">
          <div class="prediction-team home">
            <span>${homeTeam.name}</span>
            <span style="font-size: 2rem;">${homeTeam.flag}</span>
          </div>
          <div class="prediction-vs-badge">VS</div>
          <div class="prediction-team away">
            <span style="font-size: 2rem;">${awayTeam.flag}</span>
            <span>${awayTeam.name}</span>
          </div>
        </div>

        <div class="prob-section">
          <div class="prob-label"><i class="fa-solid fa-calculator"></i> AI 胜平负概率分布</div>
          <div class="prob-legend">
            <div class="prob-legend-item">
              <span class="legend-dot home"></span>
              <span>${homeTeam.name}胜 ${probHome}%</span>
            </div>
            <div class="prob-legend-item">
              <span class="legend-dot draw"></span>
              <span>平局 ${probDraw}%</span>
            </div>
            <div class="prob-legend-item">
              <span class="legend-dot away"></span>
              <span>${awayTeam.name}胜 ${probAway}%</span>
            </div>
          </div>
          <div class="prob-bar-container">
            <div class="prob-segment home" style="width: ${probHome}%;" title="${homeTeam.name}胜 ${probHome}%"></div>
            <div class="prob-segment draw" style="width: ${probDraw}%;" title="平局 ${probDraw}%"></div>
            <div class="prob-segment away" style="width: ${probAway}%;" title="${awayTeam.name}胜 ${probAway}%"></div>
          </div>
        </div>

        <div class="preview-grid-details">
          <div class="matchup-analysis-box">
            <h4><i class="fa-solid fa-shield-halved"></i> 战术对决看点</h4>
            <p>${prev.matchup}</p>
          </div>
          <div class="injury-box">
            <h4><i class="fa-solid fa-triangle-exclamation"></i> 伤停情报</h4>
            <p style="margin-bottom: 0.4rem;"><strong>${homeTeam.name}</strong>: ${prev.injuries && prev.injuries.home ? prev.injuries.home : "无重要伤停"}</p>
            <p><strong>${awayTeam.name}</strong>: ${prev.injuries && prev.injuries.away ? prev.injuries.away : "无重要伤停"}</p>
          </div>
          <div class="key-players-box">
            <h4><i class="fa-solid fa-bullseye"></i> 关键核心对决</h4>
            <p class="key-player-names">${prev.keyPlayer}</p>
          </div>
        </div>
      `;
      
      dom.previewsList.appendChild(card);
    });
  }

  // ==========================================
  // 7. 单场比赛详情弹窗展示 (Modal details)
  // ==========================================
  window.viewMatchDetails = function(matchId) {
    state.activeMatchDetailId = matchId; // 记录激活 ID
    const match = WORLDCUP_DATA.matches.find(m => m.id === matchId);
    if (!match) return;

    const homeTeam = WORLDCUP_DATA.teams[match.home];
    const awayTeam = WORLDCUP_DATA.teams[match.away];
    
    let modalHtml = "";

    const d = new Date(match.date);
    const zhDateString = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${match.time}`;

    if (match.status !== "Scheduled") {
      // 已完赛或进行中的统计
      const possHome = match.stats ? match.stats.possession[0] : 50;
      const possAway = match.stats ? match.stats.possession[1] : 50;
      
      const shotsHome = match.stats ? match.stats.shots[0] : 0;
      const shotsAway = match.stats ? match.stats.shots[1] : 0;
      const shotsTotal = (shotsHome + shotsAway) || 1;
      const shotsHomePct = ((shotsHome / shotsTotal) * 100).toFixed(0);
      const shotsAwayPct = (100 - shotsHomePct).toFixed(0);

      const targetHome = match.stats ? match.stats.target[0] : 0;
      const targetAway = match.stats ? match.stats.target[1] : 0;
      const targetTotal = (targetHome + targetAway) || 1;
      const targetHomePct = ((targetHome / targetTotal) * 100).toFixed(0);
      const targetAwayPct = (100 - targetHomePct).toFixed(0);

      const foulsHome = match.stats ? match.stats.fouls[0] : 0;
      const foulsAway = match.stats ? match.stats.fouls[1] : 0;
      const foulsTotal = (foulsHome + foulsAway) || 1;
      const foulsHomePct = ((foulsHome / foulsTotal) * 100).toFixed(0);
      const foulsAwayPct = (100 - foulsHomePct).toFixed(0);

      modalHtml = `
        <div class="detail-meta" style="margin-bottom: 1rem;">
          <span class="detail-meta-group">${match.group}组</span>
          <span><i class="fa-solid fa-map-location-dot"></i> ${match.stadium}</span>
          <span style="margin-left: 1rem;"><i class="fa-regular fa-clock"></i> ${zhDateString}</span>
        </div>

        <div class="score-banner-box" style="margin-bottom: 2rem;">
          <div class="score-banner-team home">
            <span>${homeTeam.name}</span>
            <span style="font-size: 2.2rem;">${homeTeam.flag}</span>
          </div>
          <div class="score-banner-display">${match.score.home} - ${match.score.away}</div>
          <div class="score-banner-team away">
            <span style="font-size: 2.2rem;">${awayTeam.flag}</span>
            <span>${awayTeam.name}</span>
          </div>
        </div>

        <h3 style="font-size: 1.1rem; margin-bottom: 1rem;"><i class="fa-solid fa-chart-column"></i> 技术指标对比</h3>
        
        <div class="stat-bars-container" style="max-width: 100%; margin-bottom: 2rem;">
          <!-- 控球率 -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span>${possHome}%</span>
              <span class="stat-label-name">控球率</span>
              <span>${possAway}%</span>
            </div>
            <div class="stat-bar-outer">
              <div class="stat-bar-fill-home" style="width: ${possHome}%;"></div>
              <div class="stat-bar-fill-away" style="width: ${possAway}%;"></div>
            </div>
          </div>
          <!-- 射门数 -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span>${shotsHome}次</span>
              <span class="stat-label-name">射门次数</span>
              <span>${shotsAway}次</span>
            </div>
            <div class="stat-bar-outer">
              <div class="stat-bar-fill-home" style="width: ${shotsHomePct}%;"></div>
              <div class="stat-bar-fill-away" style="width: ${shotsAwayPct}%;"></div>
            </div>
          </div>
          <!-- 射正数 -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span>${targetHome}次</span>
              <span class="stat-label-name">射正次数</span>
              <span>${targetAway}次</span>
            </div>
            <div class="stat-bar-outer">
              <div class="stat-bar-fill-home" style="width: ${targetHomePct}%;"></div>
              <div class="stat-bar-fill-away" style="width: ${targetAwayPct}%;"></div>
            </div>
          </div>
          <!-- 犯规数 -->
          <div class="stat-row">
            <div class="stat-label-row">
              <span>${foulsHome}次</span>
              <span class="stat-label-name">犯规次数</span>
              <span>${foulsAway}次</span>
            </div>
            <div class="stat-bar-outer">
              <div class="stat-bar-fill-home" style="width: ${foulsHomePct}%;"></div>
              <div class="stat-bar-fill-away" style="width: ${foulsAwayPct}%;"></div>
            </div>
          </div>
        </div>

        ${(match.analysis && match.analysis.trim() !== "" && !match.analysis.includes("正在整理中")) ? `
          <div class="tactical-review-box" style="margin-bottom: 1.5rem;">
            <strong>战术解析:</strong>
            <p>${match.analysis}</p>
          </div>
        ` : ""}

        ${match.mvp ? `
          <div class="report-extra" style="background: rgba(255,215,0,0.04); border-color: rgba(255,215,0,0.15);">
            <i class="fa-solid fa-award info-icon" style="color: var(--accent-yellow);"></i>
            <div>
              <strong style="color:var(--accent-yellow);">本场最佳球员 (Man of the Match):</strong> 
              <span>${match.mvp.name} (${WORLDCUP_DATA.teams[match.mvp.team].name}) - 评分: ${match.mvp.rating}。理由: ${match.mvp.reason}</span>
            </div>
          </div>
        ` : ""}
      `;
    } else {
      // 未开赛的预测
      const prev = match.preview || { wdl: [33, 34, 33], matchup: "暂无分析", keyPlayer: "暂无关键球员" };
      const probHome = prev.wdl[0];
      const probDraw = prev.wdl[1];
      const probAway = prev.wdl[2];

      modalHtml = `
        <div class="detail-meta" style="margin-bottom: 1rem;">
          <span class="detail-meta-group">${match.group}组</span>
          <span><i class="fa-solid fa-map-location-dot"></i> ${match.stadium}</span>
          <span style="margin-left: 1rem;"><i class="fa-regular fa-clock"></i> ${zhDateString}</span>
        </div>

        <div class="prediction-teams-box" style="margin-bottom: 2rem; gap: 1.5rem;">
          <div class="prediction-team home">
            <span>${homeTeam.name}</span>
            <span style="font-size: 2.2rem;">${homeTeam.flag}</span>
          </div>
          <div class="prediction-vs-badge" style="font-size: 1rem;">PREVIEW</div>
          <div class="prediction-team away">
            <span style="font-size: 2.2rem;">${awayTeam.flag}</span>
            <span>${awayTeam.name}</span>
          </div>
        </div>

        <div class="prob-section" style="margin-bottom: 2rem;">
          <div class="prob-label"><i class="fa-solid fa-calculator"></i> AI 胜平负概率预测</div>
          <div class="prob-legend">
            <div class="prob-legend-item">
              <span class="legend-dot home"></span>
              <span>${homeTeam.name}胜 ${probHome}%</span>
            </div>
            <div class="prob-legend-item">
              <span class="legend-dot draw"></span>
              <span>平局 ${probDraw}%</span>
            </div>
            <div class="prob-legend-item">
              <span class="legend-dot away"></span>
              <span>${awayTeam.name}胜 ${probAway}%</span>
            </div>
          </div>
          <div class="prob-bar-container">
            <div class="prob-segment home" style="width: ${probHome}%;" title="${homeTeam.name}胜 ${probHome}%"></div>
            <div class="prob-segment draw" style="width: ${probDraw}%;" title="平局 ${probDraw}%"></div>
            <div class="prob-segment away" style="width: ${probAway}%;" title="${awayTeam.name}胜 ${probAway}%"></div>
          </div>
        </div>

        <div class="preview-grid-details">
          <div class="matchup-analysis-box">
            <h4><i class="fa-solid fa-shield-halved"></i> 战术对决看点</h4>
            <p>${prev.matchup}</p>
          </div>
          <div class="injury-box">
            <h4><i class="fa-solid fa-triangle-exclamation"></i> 伤停情报</h4>
            <p style="margin-bottom: 0.4rem;"><strong>${homeTeam.name}</strong>: ${prev.injuries && prev.injuries.home ? prev.injuries.home : "无重要伤停"}</p>
            <p><strong>${awayTeam.name}</strong>: ${prev.injuries && prev.injuries.away ? prev.injuries.away : "无重要伤停"}</p>
          </div>
          <div class="key-players-box">
            <h4><i class="fa-solid fa-bullseye"></i> 核心钥匙球员</h4>
            <p>${prev.keyPlayer}</p>
          </div>
        </div>
      `;
    }

    dom.modalContent.innerHTML = modalHtml;
    dom.modal.classList.add("active");
  };

  // ==========================================
  // 8. 导航控制与事件绑定
  // ==========================================
  function renderTabContent() {
    if (state.activeTab === "tab-schedule") {
      renderScheduleTab();
    } else if (state.activeTab === "tab-analysis") {
      renderAnalysisTab();
    } else if (state.activeTab === "tab-standings") {
      renderStandingsTab();
    } else if (state.activeTab === "tab-predictions") {
      renderPredictionsTab();
    }
  }

  function setupEventListeners() {
    // Tab 键切换
    dom.tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        dom.tabButtons.forEach(b => b.classList.remove("active"));
        dom.tabPanels.forEach(p => p.classList.remove("active"));
        
        btn.classList.add("active");
        const targetTab = btn.dataset.tab;
        document.getElementById(targetTab).classList.add("active");
        
        state.activeTab = targetTab;
        renderTabContent();
      });
    });

    // 模态弹窗关闭
    dom.modalCloseBtn.addEventListener("click", () => {
      dom.modal.classList.remove("active");
      state.activeMatchDetailId = null; // 重置激活 ID
    });
    dom.modal.addEventListener("click", (e) => {
      if (e.target === dom.modal) {
        dom.modal.classList.remove("active");
        state.activeMatchDetailId = null; // 重置激活 ID
      }
    });

    // 日历快捷左右按钮
    dom.prevDateBtn.addEventListener("click", () => {
      dom.dateSlider.scrollBy({ left: -200, behavior: "smooth" });
    });
    dom.nextDateBtn.addEventListener("click", () => {
      dom.dateSlider.scrollBy({ left: 200, behavior: "smooth" });
    });
  }

  // 启动运行
  init();
});
