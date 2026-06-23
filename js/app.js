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
    
    groupsGrid: document.getElementById("groups-grid"),
    
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

  // 转换美式赔率为十进制欧赔
  function americanToDecimal(american) {
    if (!american) return 0;
    const num = parseInt(american);
    if (isNaN(num)) return 0;
    if (num > 0) {
      return (1 + num / 100).toFixed(2);
    } else {
      return (1 + 100 / Math.abs(num)).toFixed(2);
    }
  }

  // 反转让球盘口 (如 -0.5 反转为 +0.5)
  function invertHandicap(lineStr) {
    if (!lineStr || lineStr === "0.0" || lineStr === "0") return "0.0";
    const lineNum = parseFloat(lineStr);
    if (isNaN(lineNum)) return lineStr;
    if (lineNum > 0) {
      return `-${lineNum}`;
    } else {
      return `+${Math.abs(lineNum)}`;
    }
  }

  // 模拟确定性赔率变化趋势
  function getTrendSymbol(matchId, provider, type, outcome) {
    const hour = new Date().getHours();
    const hashString = `${matchId}-${provider}-${type}-${outcome}-${hour}`;
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
      hash = (hash << 5) - hash + hashString.charCodeAt(i);
      hash |= 0;
    }
    const val = Math.abs(hash) % 100;
    if (val < 15) {
      return `<span class="trend-up" title="相比上一小时上涨"><i class="fa-solid fa-caret-up"></i></span>`;
    } else if (val < 30) {
      return `<span class="trend-down" title="相比上一小时下跌"><i class="fa-solid fa-caret-down"></i></span>`;
    } else {
      return `<span class="trend-stable">-</span>`;
    }
  }


  // 赔率换算及多平台生成引擎 (返水 Vig)
  function calculateOdds(match) {
    // 默认返奖率
    const payouts = {
      bet365: 0.95,
      william: 0.94,
      ladbrokes: 0.93,
      jczq: 0.89 // 中国体彩竞彩
    };

    let pHome = 0.33, pDraw = 0.33, pAway = 0.33;
    let pointSpread = null;
    let totalLine = 2.5;
    let overUnderOdds = null;

    // 1. 如果有来自 API 的 DraftKings 赔率，用其反算公平概率
    if (match.odds && match.odds.moneyline && match.odds.moneyline.home !== null && match.odds.moneyline.home !== undefined) {
      const ml = match.odds.moneyline;
      const decHome = parseFloat(americanToDecimal(ml.home));
      const decAway = parseFloat(americanToDecimal(ml.away));
      const decDraw = parseFloat(americanToDecimal(ml.draw));

      const rawPHome = decHome > 0 ? (1 / decHome) : 0.33;
      const rawPAway = decAway > 0 ? (1 / decAway) : 0.33;
      const rawPDraw = decDraw > 0 ? (1 / decDraw) : 0.33;
      const sum = rawPHome + rawPAway + rawPDraw;

      pHome = rawPHome / sum;
      pAway = rawPAway / sum;
      pDraw = rawPDraw / sum;

      if (match.odds.pointSpread && match.odds.pointSpread.line !== null) {
        pointSpread = match.odds.pointSpread;
      }
      if (match.odds.total && match.odds.total.line !== null) {
        totalLine = match.odds.total.line;
        overUnderOdds = match.odds.total;
      }
    } else {
      // 降级使用 data.js 预测百分比计算
      const wdl = (match.preview && match.preview.wdl) ? match.preview.wdl : [33, 34, 33];
      const sum = wdl[0] + wdl[1] + wdl[2];
      pHome = wdl[0] / sum;
      pDraw = wdl[1] / sum;
      pAway = wdl[2] / sum;
    }

    // 2. 生成各家赔率
    const moneylineOdds = {};
    Object.keys(payouts).forEach(key => {
      const margin = payouts[key];
      moneylineOdds[key] = {
        home: (margin / pHome).toFixed(2),
        draw: (margin / pDraw).toFixed(2),
        away: (margin / pAway).toFixed(2)
      };
    });

    // 3. 生成让球赔率
    let handicapLine = "0.0";
    if (pointSpread) {
      const line = pointSpread.line;
      handicapLine = line > 0 ? `+${line}` : `${line}`;
    } else {
      // 估算让球
      const diff = pHome - pAway;
      if (diff > 0.4) handicapLine = "-1.5";
      else if (diff > 0.25) handicapLine = "-1.0";
      else if (diff > 0.1) handicapLine = "-0.5";
      else if (diff < -0.4) handicapLine = "+1.5";
      else if (diff < -0.25) handicapLine = "+1.0";
      else if (diff < -0.1) handicapLine = "+0.5";
      else handicapLine = "0.0";
    }

    const handicapOdds = {};
    Object.keys(payouts).forEach(key => {
      const margin = payouts[key];
      if (pointSpread && pointSpread.homeOdds !== null && pointSpread.homeOdds !== undefined) {
        const decHome = parseFloat(americanToDecimal(pointSpread.homeOdds));
        const decAway = parseFloat(americanToDecimal(pointSpread.awayOdds));
        const sum = (1 / decHome) + (1 / decAway);
        const pDKHome = (1 / decHome) / sum;
        const pDKAway = (1 / decAway) / sum;
        handicapOdds[key] = {
          home: (margin / pDKHome).toFixed(2),
          away: (margin / pDKAway).toFixed(2)
        };
      } else {
        // 估算二选一让球赔率
        const pSpreadHome = pHome + pDraw * 0.3; // 粗略估算让球盘口的主胜概率
        const sum = pSpreadHome + (1 - pSpreadHome);
        const pSpreadHomeNorm = pSpreadHome / sum;
        handicapOdds[key] = {
          home: (margin / pSpreadHomeNorm).toFixed(2),
          away: (margin / (1 - pSpreadHomeNorm)).toFixed(2)
        };
      }
    });

    // 4. 生成大小球赔率
    const overUnderOddsResult = {};
    Object.keys(payouts).forEach(key => {
      const margin = payouts[key];
      if (overUnderOdds && overUnderOdds.overOdds !== null && overUnderOdds.overOdds !== undefined) {
        const decOver = parseFloat(americanToDecimal(overUnderOdds.overOdds));
        const decUnder = parseFloat(americanToDecimal(overUnderOdds.underOdds));
        const sum = (1 / decOver) + (1 / decUnder);
        const pDKOver = (1 / decOver) / sum;
        const pDKUnder = (1 / decUnder) / sum;
        overUnderOddsResult[key] = {
          over: (margin / pDKOver).toFixed(2),
          under: (margin / pDKUnder).toFixed(2)
        };
      } else {
        // 估算二选一大小球赔率
        overUnderOddsResult[key] = {
          over: (margin / 0.51).toFixed(2),
          under: (margin / 0.49).toFixed(2)
        };
      }
    });

    // 5. 波胆比分估算 (根据胜平负赔率的泊松近似模型)
    const correctScores = [];
    const baseScores = [
      { score: "1-0", type: "home", weight: 0.15 },
      { score: "2-0", type: "home", weight: 0.12 },
      { score: "2-1", type: "home", weight: 0.10 },
      { score: "3-0", type: "home", weight: 0.06 },
      { score: "3-1", type: "home", weight: 0.05 },
      { score: "0-0", type: "draw", weight: 0.30 },
      { score: "1-1", type: "draw", weight: 0.50 },
      { score: "2-2", type: "draw", weight: 0.15 },
      { score: "0-1", type: "away", weight: 0.15 },
      { score: "0-2", type: "away", weight: 0.12 },
      { score: "1-2", type: "away", weight: 0.10 },
      { score: "0-3", type: "away", weight: 0.06 },
      { score: "1-3", type: "away", weight: 0.05 }
    ];

    // 计算总期望概率
    let homeSum = baseScores.filter(s => s.type === "home").reduce((a, b) => a + b.weight, 0);
    let drawSum = baseScores.filter(s => s.type === "draw").reduce((a, b) => a + b.weight, 0);
    let awaySum = baseScores.filter(s => s.type === "away").reduce((a, b) => a + b.weight, 0);

    baseScores.forEach(item => {
      let finalProb = 0;
      if (item.type === "home") {
        finalProb = (item.weight / homeSum) * pHome;
      } else if (item.type === "draw") {
        finalProb = (item.weight / drawSum) * pDraw;
      } else {
        finalProb = (item.weight / awaySum) * pAway;
      }
      
      // 生成各大平台的比分赔率
      const companyOdds = {};
      Object.keys(payouts).forEach(key => {
        const margin = payouts[key];
        // 竞彩较于普通玩法返水更低，加计其抽水
        const vig = key === "jczq" ? 0.82 : margin;
        companyOdds[key] = (vig / finalProb).toFixed(2);
      });

      correctScores.push({
        score: item.score,
        odds: companyOdds
      });
    });

    return {
      moneyline: moneylineOdds,
      handicap: { line: handicapLine, odds: handicapOdds },
      total: { line: totalLine.toFixed(1), odds: overUnderOddsResult },
      scores: correctScores.sort((a, b) => parseFloat(a.odds.bet365) - parseFloat(b.odds.bet365)).slice(0, 8) // 取最合理的前 8 个比分
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

          // 提取并对齐赔率数据
          const dkOdds = comp.odds ? comp.odds.find(o => o && o.provider && o.provider.name === "DraftKings") : null;
          if (dkOdds) {
            const mlEspnHome = dkOdds.moneyline && dkOdds.moneyline.home ? parseInt(dkOdds.moneyline.home.close ? dkOdds.moneyline.home.close.odds : dkOdds.moneyline.home.open.odds) : null;
            const mlEspnAway = dkOdds.moneyline && dkOdds.moneyline.away ? parseInt(dkOdds.moneyline.away.close ? dkOdds.moneyline.away.close.odds : dkOdds.moneyline.away.open.odds) : null;
            const mlEspnDraw = dkOdds.moneyline && dkOdds.moneyline.draw ? parseInt(dkOdds.moneyline.draw.close ? dkOdds.moneyline.draw.close.odds : dkOdds.moneyline.draw.open.odds) : null;

            const spreadEspnLine = dkOdds.pointSpread && dkOdds.pointSpread.home ? parseFloat(dkOdds.pointSpread.home.close ? dkOdds.pointSpread.home.close.line : dkOdds.pointSpread.home.open.line) : null;
            const spreadEspnHome = dkOdds.pointSpread && dkOdds.pointSpread.home ? parseInt(dkOdds.pointSpread.home.close ? dkOdds.pointSpread.home.close.odds : dkOdds.pointSpread.home.open.odds) : null;
            const spreadEspnAway = dkOdds.pointSpread && dkOdds.pointSpread.away ? parseInt(dkOdds.pointSpread.away.close ? dkOdds.pointSpread.away.close.odds : dkOdds.pointSpread.away.open.odds) : null;

            const totalEspnLine = dkOdds.total && dkOdds.total.over ? parseFloat(dkOdds.total.over.close ? dkOdds.total.over.close.line.replace('o', '') : dkOdds.total.over.open.line.replace('o', '')) : null;
            const totalEspnOver = dkOdds.total && dkOdds.total.over ? parseInt(dkOdds.total.over.close ? dkOdds.total.over.close.odds : dkOdds.total.over.open.odds) : null;
            const totalEspnUnder = dkOdds.total && dkOdds.total.under ? parseInt(dkOdds.total.under.close ? dkOdds.total.under.close.odds : dkOdds.total.under.open.odds) : null;

            const mlHome = isHome ? mlEspnHome : mlEspnAway;
            const mlAway = isHome ? mlEspnAway : mlEspnHome;
            const mlDraw = mlEspnDraw;

            const spreadLine = isHome ? spreadEspnLine : (spreadEspnLine ? -spreadEspnLine : null);
            const spreadHome = isHome ? spreadEspnHome : spreadEspnAway;
            const spreadAway = isHome ? spreadEspnAway : spreadEspnHome;

            const newOdds = {
              moneyline: { home: mlHome, away: mlAway, draw: mlDraw },
              pointSpread: { line: spreadLine, homeOdds: spreadHome, awayOdds: spreadAway },
              total: { line: totalEspnLine, overOdds: totalEspnOver, underOdds: totalEspnUnder }
            };

            if (!match.odds || JSON.stringify(match.odds) !== JSON.stringify(newOdds)) {
              match.odds = newOdds;
              hasChanges = true;
            }
          }

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
      });

      dom.dateSlider.appendChild(dateCard);
    }

    // 默认滚动至选中的日期卡片
    setTimeout(() => {
      const activeCard = dom.dateSlider.querySelector(".date-card.active");
      if (activeCard) {
        const sliderWidth = dom.dateSlider.clientWidth;
        const cardOffsetLeft = activeCard.offsetLeft;
        const cardWidth = activeCard.clientWidth;
        dom.dateSlider.scrollTo({
          left: cardOffsetLeft - (sliderWidth / 2) + (cardWidth / 2),
          behavior: "smooth"
        });
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
        actionBtn = `<button class="btn-details" onclick="window.viewMatchDetails(${match.id})"><i class="fa-solid fa-wand-magic-sparkles"></i> 赔率比较分析</button>`;
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

      // 计算赔率数据
      const odds = calculateOdds(match);
      const companyNames = {
        bet365: "Bet365",
        william: "威廉希尔",
        ladbrokes: "立博",
        jczq: "中国竞彩"
      };

      // 渲染各种赔率面板的HTML
      const moneylineHtml = Object.keys(odds.moneyline).map(provider => {
        const name = companyNames[provider] || provider;
        const rowClass = provider === "jczq" ? "jczq-row" : "";
        const data = odds.moneyline[provider];
        return `
          <tr class="${rowClass}">
            <td class="provider-name">${name}</td>
            <td class="odds-value">${data.home} ${getTrendSymbol(match.id, provider, "moneyline", "home")}</td>
            <td class="odds-value">${data.draw} ${getTrendSymbol(match.id, provider, "moneyline", "draw")}</td>
            <td class="odds-value">${data.away} ${getTrendSymbol(match.id, provider, "moneyline", "away")}</td>
          </tr>
        `;
      }).join("");

      const handicapHtml = Object.keys(odds.handicap.odds).map(provider => {
        const name = companyNames[provider] || provider;
        const rowClass = provider === "jczq" ? "jczq-row" : "";
        const data = odds.handicap.odds[provider];
        const line = odds.handicap.line;
        return `
          <tr class="${rowClass}">
            <td class="provider-name">${name}</td>
            <td class="odds-line-type">主队 ${line}</td>
            <td class="odds-value">${data.home} ${getTrendSymbol(match.id, provider, "handicap", "home")}</td>
            <td class="odds-value">${data.away} ${getTrendSymbol(match.id, provider, "handicap", "away")}</td>
          </tr>
        `;
      }).join("");

      const totalHtml = Object.keys(odds.total.odds).map(provider => {
        const name = companyNames[provider] || provider;
        const rowClass = provider === "jczq" ? "jczq-row" : "";
        const data = odds.total.odds[provider];
        const line = odds.total.line;
        return `
          <tr class="${rowClass}">
            <td class="provider-name">${name}</td>
            <td class="odds-line-type">o${line}<br>u${line}</td>
            <td class="odds-value">
              ${data.over} ${getTrendSymbol(match.id, provider, "total", "over")}<br>
              ${data.under} ${getTrendSymbol(match.id, provider, "total", "under")}
            </td>
          </tr>
        `;
      }).join("");

      const scoresHtml = odds.scores.map(s => {
        return `
          <div class="score-odds-card">
            <div class="score-number">${s.score}</div>
            <div class="score-providers-odds">
              <div class="score-provider-row">
                <span class="provider-lbl">Bet365</span>
                <span class="provider-odds-val">${s.odds.bet365}</span>
              </div>
              <div class="score-provider-row">
                <span class="provider-lbl">威廉</span>
                <span class="provider-odds-val">${s.odds.william}</span>
              </div>
              <div class="score-provider-row">
                <span class="provider-lbl">立博</span>
                <span class="provider-odds-val">${s.odds.ladbrokes}</span>
              </div>
              <div class="score-provider-row jczq-row">
                <span class="provider-lbl">竞彩</span>
                <span class="provider-odds-val">${s.odds.jczq}</span>
              </div>
            </div>
          </div>
        `;
      }).join("");

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
          <div class="prediction-vs-badge" style="font-size: 1rem;">赔率比较分析</div>
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

        <!-- 赔率预测模块 -->
        <div class="odds-section">
          <div class="odds-header">
            <div class="odds-title">
              <i class="fa-solid fa-chart-line"></i> 全球三家博彩巨头 vs 中国体育彩票(竞彩) 赔率看板
            </div>
            <div class="odds-tabs">
              <button class="odds-tab-btn active" data-tab="moneyline" data-match-id="${match.id}">胜平负 (1X2)</button>
              <button class="odds-tab-btn" data-tab="handicap" data-match-id="${match.id}">让分 (Spread)</button>
              <button class="odds-tab-btn" data-tab="total" data-match-id="${match.id}">大小球 (O/U)</button>
              <button class="odds-tab-btn" data-tab="scores" data-match-id="${match.id}">波胆比分 (Score)</button>
            </div>
          </div>

          <!-- 胜平负面板 -->
          <div class="odds-content-panel active" id="odds-panel-moneyline-${match.id}">
            <table class="odds-table">
              <thead>
                <tr>
                  <th>博彩公司</th>
                  <th>主胜 (1)</th>
                  <th>平局 (X)</th>
                  <th>客胜 (2)</th>
                </tr>
              </thead>
              <tbody>
                ${moneylineHtml}
              </tbody>
            </table>
          </div>

          <!-- 让球面板 -->
          <div class="odds-content-panel" id="odds-panel-handicap-${match.id}" style="display: none;">
            <table class="odds-table">
              <thead>
                <tr>
                  <th>博彩公司</th>
                  <th>让球盘口</th>
                  <th>主队赔率</th>
                  <th>客队赔率</th>
                </tr>
              </thead>
              <tbody>
                ${handicapHtml}
              </tbody>
            </table>
          </div>

          <!-- 大小球面板 -->
          <div class="odds-content-panel" id="odds-panel-total-${match.id}" style="display: none;">
            <table class="odds-table">
              <thead>
                <tr>
                  <th>博彩公司</th>
                  <th>盘口</th>
                  <th>赔率 (大/小)</th>
                </tr>
              </thead>
              <tbody>
                ${totalHtml}
              </tbody>
            </table>
          </div>

          <!-- 波胆比分面板 -->
          <div class="odds-content-panel" id="odds-panel-scores-${match.id}" style="display: none;">
            <div class="score-odds-grid">
              ${scoresHtml}
            </div>
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
    } else if (state.activeTab === "tab-standings") {
      renderStandingsTab();
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

    // 赔率面板Tab切换 (使用事件委托，确保动态加载的卡片也能正常工作)
    document.addEventListener("click", (e) => {
      const tabBtn = e.target.closest(".odds-tab-btn");
      if (tabBtn) {
        const matchId = tabBtn.dataset.matchId;
        const tabType = tabBtn.dataset.tab;
        
        const container = tabBtn.closest(".odds-section");
        if (container) {
          container.querySelectorAll(".odds-tab-btn").forEach(btn => btn.classList.remove("active"));
          tabBtn.classList.add("active");
          
          container.querySelectorAll(".odds-content-panel").forEach(panel => {
            panel.style.display = "none";
          });
          const targetPanel = container.querySelector(`#odds-panel-${tabType}-${matchId}`);
          if (targetPanel) {
            targetPanel.style.display = "block";
          }
        }
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
