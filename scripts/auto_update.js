// 2026年世界杯数据自动抓取与更新脚本 (ESPN API 驱动)
// 该脚本由 GitHub Actions 自动调用，抓取最新赛况并写入 data.js

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../src/data.js');

// 团队缩写映射 (ESPN 缩写 -> 本地数据代码)
const TEAM_MAP = {
  "ROM": "ROU", // 罗马尼亚
  "CGO": "COD", // 刚果(金)
  "DRC": "COD",
  "TUR": "ROU", // 土耳其 (ESPN) -> 罗马尼亚 (本地)
  "CUW": "CUR", // 库拉索 (ESPN: CUW -> 本地: CUR)
  "IRQ": "HON", // 伊拉克 (ESPN) -> 洪都拉斯 (本地)
};
const mapTeam = (abbr) => TEAM_MAP[abbr] || abbr;

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

async function run() {
  // 1. 导入本地现有数据
  let WORLDCUP_DATA;
  try {
    WORLDCUP_DATA = require(dataPath);
  } catch (err) {
    console.error("加载数据文件失败:", err);
    process.exit(1);
  }

  // 1.5 检查双信息更新频次条件 (开赛前1小时内每5分钟更新，其余时间每小时更新)
  const now = new Date();
  const getBeijingTime = () => {
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)); // 北京时间 UTC+8
  };
  const bjTime = getBeijingTime();
  const bjMinute = bjTime.getMinutes();

  // 检查是否有比赛满足条件：
  // a) 正在进行中 (status !== "Scheduled" && status !== "FT")
  // b) 开赛前1小时内 (status === "Scheduled" 且北京时间距离开赛时间在 0 至 60 分钟之间)
  const hasMatchRequiringFrequentUpdate = WORLDCUP_DATA.matches.some(m => {
    if (m.status !== "Scheduled" && m.status !== "FT") {
      return true; // 正在进行中
    }
    if (m.status === "Scheduled") {
      // 本地数据中的 date 和 time 均是北京时间，如 "2026-06-24" 和 "01:00"
      const matchStart = new Date(`${m.date}T${m.time}:00+08:00`);
      const diffMs = matchStart - bjTime;
      const diffMins = diffMs / (1000 * 60);
      return diffMins >= 0 && diffMins <= 60; // 距离开赛在1小时内
    }
    return false;
  });

  const isHourlyInterval = bjMinute < 5; // 整点更新 (每小时的前5分钟内触发一次)
  const isGithubCron = process.env.GITHUB_EVENT_NAME === 'schedule';

  if (isGithubCron && !hasMatchRequiringFrequentUpdate && !isHourlyInterval) {
    console.log(`[双信息更新过滤] 当前北京时间为 ${bjTime.toISOString().replace('T', ' ').slice(0, 19)} (分钟: ${bjMinute})。当前无正在进行或即将在一小时内开赛的赛事，且非整点，自动跳过抓取以节省 GitHub Actions 额度。`);
    process.exit(0);
  }

  console.log("正在从 ESPN API 获取最新世界杯赛程与比分...");
  // 2. 从 ESPN API 获取整个小组赛至决赛阶段的比赛
  const url = "http://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260720";
  
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (err) {
    console.error("网络请求失败:", err);
    process.exit(1);
  }

  if (!data.events || data.events.length === 0) {
    console.log("未在 ESPN 接口中获取到任何赛事信息。");
    process.exit(0);
  }

  let updatedCount = 0;
  let latestFinishedDate = "2026-06-11"; // 跟踪最新完赛的日期
  const datesToRegenerate = new Set();

  // 3. 循环处理 ESPN 赛事
  data.events.forEach(event => {
    const comp = event.competitions[0];
    if (!comp) return;

    const homeCompetitor = comp.competitors.find(c => c.homeAway === 'home');
    const awayCompetitor = comp.competitors.find(c => c.homeAway === 'away');
    if (!homeCompetitor || !awayCompetitor) return;

    const homeAbbr = mapTeam(homeCompetitor.team.abbreviation);
    const awayAbbr = mapTeam(awayCompetitor.team.abbreviation);
    
    // 获取比分与状态
    const homeScore = parseInt(homeCompetitor.score || "0");
    const awayScore = parseInt(awayCompetitor.score || "0");
    const isCompleted = comp.status.type.completed;
    const detailStatus = comp.status.type.detail; // e.g. "FT", "Live 45'"

    // 在本地赛程表中优先根据 ID 查找对应的比赛，以防淘汰赛/小组赛末轮队伍更新导致对碰名称变化
    const eventId = parseInt(event.id);
    let match = WORLDCUP_DATA.matches.find(m => m.id === eventId);
    
    // 如果匹配到已有比赛，且该比赛是淘汰赛阶段，则将实际晋级球队覆盖 placeholder 并确保组别为淘汰赛
    if (match) {
      const utcDate = new Date(event.date);
      const bjDate = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
      const matchDate = bjDate.toISOString().slice(0, 10);
      
      if (matchDate >= "2026-06-28" || match.group === "淘汰赛") {
        match.group = "淘汰赛";
        match.home = homeAbbr;
        match.away = awayAbbr;
      }
    } else {
      // 只有当双方都不是占位席位时，才允许降级按对碰寻找，避免误匹配重复占位符（如 RD32 vs RD32）
      const isPlaceholder = (code) => /^\d[A-L]$|^3RD$|^RD16|^QF|^SF|^RD32/.test(code);
      if (!isPlaceholder(homeAbbr) && !isPlaceholder(awayAbbr)) {
        match = WORLDCUP_DATA.matches.find(m => 
          (m.home === homeAbbr && m.away === awayAbbr) ||
          (m.home === awayAbbr && m.away === homeAbbr)
        );
      }
    }

    if (!match) {
      // 如果本地没有这场比赛，则动态添加它！
      const newId = parseInt(event.id);
      
      // 自动转换时间为北京时间
      const utcDate = new Date(event.date);
      const bjDate = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
      const matchDate = bjDate.toISOString().slice(0, 10);
      const matchTime = bjDate.toISOString().slice(11, 16);

      // 查询组别
      let group = "淘汰赛";
      // 小组赛阶段（2026-06-27 及之前）自动检测国家所属分组，之后全部归为淘汰赛
      if (matchDate <= "2026-06-27") {
        if (WORLDCUP_DATA.teams[homeAbbr] && WORLDCUP_DATA.teams[homeAbbr].group) {
          group = WORLDCUP_DATA.teams[homeAbbr].group;
        } else if (WORLDCUP_DATA.teams[awayAbbr] && WORLDCUP_DATA.teams[awayAbbr].group) {
          group = WORLDCUP_DATA.teams[awayAbbr].group;
        }
      }

      // 获取球场信息
      const stadium = comp.venue ? `${comp.venue.fullName}${comp.venue.address && comp.venue.address.city ? ' (' + comp.venue.address.city + ')' : ''}` : "世界级球场";

      match = {
        id: newId,
        date: matchDate,
        time: matchTime,
        group: group,
        home: homeAbbr,
        away: awayAbbr,
        status: "Scheduled",
        stadium: stadium
      };
      
      WORLDCUP_DATA.matches.push(match);
      console.log(`[动态新增] 发现全新比赛: ID ${newId} (${homeAbbr} vs ${awayAbbr})`);
    }

    if (match) {
      // 自动将赛事时间转换为北京时间 (UTC+8) 并更新赛程表
      const utcDate = new Date(event.date);
      const bjDate = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
      match.date = bjDate.toISOString().slice(0, 10);
      match.time = bjDate.toISOString().slice(11, 16);

      const isHome = match.home === homeAbbr;
      const actualHomeScore = isHome ? homeScore : awayScore;
      const actualAwayScore = isHome ? awayScore : homeScore;

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

        match.odds = {
          moneyline: { home: mlHome, away: mlAway, draw: mlDraw },
          pointSpread: { line: spreadLine, homeOdds: spreadHome, awayOdds: spreadAway },
          total: { line: totalEspnLine, overOdds: totalEspnOver, underOdds: totalEspnUnder }
        };
      }

      if (isCompleted) {
        // 更新为已完赛状态
        const homeShootout = homeCompetitor.shootoutScore !== undefined && homeCompetitor.shootoutScore !== null ? parseInt(homeCompetitor.shootoutScore) : null;
        const awayShootout = awayCompetitor.shootoutScore !== undefined && awayCompetitor.shootoutScore !== null ? parseInt(awayCompetitor.shootoutScore) : null;
        const actualHomeShootout = isHome ? homeShootout : awayShootout;
        const actualAwayShootout = isHome ? awayShootout : homeShootout;
        
        const hasPenalties = actualHomeShootout !== null && actualAwayShootout !== null && !isNaN(actualHomeShootout) && !isNaN(actualAwayShootout);
        const scoreChanged = !match.score || match.score.home !== actualHomeScore || match.score.away !== actualAwayScore ||
          (hasPenalties && (!match.score.penalties || match.score.penalties.home !== actualHomeShootout || match.score.penalties.away !== actualAwayShootout));
        
        if (match.status !== "FT" || scoreChanged) {
          match.status = "FT";
          match.score = { home: actualHomeScore, away: actualAwayScore };
          if (hasPenalties) {
            match.score.penalties = { home: actualHomeShootout, away: actualAwayShootout };
          }
          
          // 重新生成战术分析
          const homeName = WORLDCUP_DATA.teams[match.home] ? WORLDCUP_DATA.teams[match.home].name : match.home;
          const awayName = WORLDCUP_DATA.teams[match.away] ? WORLDCUP_DATA.teams[match.away].name : match.away;
          
          if (hasPenalties) {
            const shootWinner = actualHomeShootout > actualAwayShootout ? homeName : awayName;
            match.analysis = `在本场淘汰赛的激烈较量中，${homeName} 与 ${awayName} 展开了高水平的战术对决。双方在常规时间和加时赛中战成 ${actualHomeScore} 比 ${actualAwayScore} 平。最终在残酷的点球大战中，${shootWinner} 凭借更稳定的表现以点球比分 ${actualHomeShootout}-${actualAwayShootout} 战胜对手，成功晋级下一轮。双方球员拼尽全力，为球迷贡献了一场经典的世界杯大战。`;
          } else {
            match.analysis = `在本场 ${match.group} 组的激烈较量中，${homeName} 与 ${awayName} 展开了高水平 of 战术对决。比赛打得充满张力，最终比分定格在 ${actualHomeScore} 比 ${actualAwayScore}。双方球员在攻防两端都拼尽全力，为球迷贡献了一场精彩的世界杯博弈。`;
          }

          // 重新填充统计数据 (使用真实统计，没有则降级为默认估算值)
          const liveStats = extractLiveStats(homeCompetitor, awayCompetitor, isHome);
          if (liveStats) {
            match.stats = liveStats;
          } else {
            match.stats = {
              possession: [50, 50],
              shots: [11, 9],
              target: [5, 4],
              fouls: [12, 11]
            };
          }

          // 重新填充 MVP
          const winner = actualHomeScore > actualAwayScore ? match.home : (actualHomeScore < actualAwayScore ? match.away : null);
          const mvpTeam = winner || match.home;
          const mvpTeamName = WORLDCUP_DATA.teams[mvpTeam] ? WORLDCUP_DATA.teams[mvpTeam].name : mvpTeam;
          match.mvp = {
            name: `核心球员 (${mvpTeamName})`,
            team: mvpTeam,
            rating: 8.2,
            reason: "在整场比赛中展现了卓越的战术执行力，在攻防转换中起到了不可替代的枢纽作用。"
          };
          
          datesToRegenerate.add(match.date);
          updatedCount++;
        }
        
        // 记录最新完赛日期
        const matchDate = match.date; // YYYY-MM-DD
        if (matchDate > latestFinishedDate) {
          latestFinishedDate = matchDate;
        }
      } else if (comp.status.type.state === "in") {
        // 更新为进行中状态
        match.status = detailStatus || "Live";
        match.score = { home: actualHomeScore, away: actualAwayScore };
        
        // 进行中状态同步真实的实时统计数据
        const liveStats = extractLiveStats(homeCompetitor, awayCompetitor, isHome);
        if (liveStats) {
          match.stats = liveStats;
        }
        updatedCount++;
      } else if (comp.status.type.state === "pre") {
        // 如果 ESPN 接口中比赛还未开始，且本地被错误地标记为已完赛或有比分，则重置为未开始状态
        if (match.status !== "Scheduled") {
          match.status = "Scheduled";
          delete match.score;
          delete match.stats;
          delete match.mvp;
          delete match.analysis;
          datesToRegenerate.add(match.date);
          updatedCount++;
          console.log(`[重置] 比赛 ${match.id} (${match.home} vs ${match.away}) 还未开始，已重置为 Scheduled 状态。`);
        }
      }
    }
  });

  // 4. 动态推算当前的比赛日日期与第几天
  // 将 currentDate 设为最新完赛的日期（如果当前时间尚未推进）
  if (latestFinishedDate !== WORLDCUP_DATA.currentDate) {
    WORLDCUP_DATA.currentDate = latestFinishedDate;
    
    // 计算 currentMatchday (以 6月11日 为首日 1)
    const start = new Date("2026-06-11");
    const current = new Date(latestFinishedDate);
    const diffTime = Math.abs(current - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    WORLDCUP_DATA.currentMatchday = diffDays;
    
    console.log(`[同步] 当前系统日期变更为: ${latestFinishedDate} (第 ${diffDays} 比赛日)`);
  }

  // 5. 生成每日总结快报 (若当天完赛或比分发生变更，重新生成对应日期总结)
  // 首先，清除发生了比分更新的日期的旧版总结
  datesToRegenerate.forEach(d => {
    delete WORLDCUP_DATA.dailySummaries[d];
  });

  // 确信要检查和生成的日期列表
  const datesToCheck = new Set(datesToRegenerate);
  datesToCheck.add(WORLDCUP_DATA.currentDate);

  datesToCheck.forEach(d => {
    const currentSummary = WORLDCUP_DATA.dailySummaries[d];
    if (!currentSummary) {
      const finishedToday = WORLDCUP_DATA.matches.filter(m => m.date === d && m.status === "FT");
      if (finishedToday.length > 0) {
        const summaryText = finishedToday.map(m => {
          const homeName = WORLDCUP_DATA.teams[m.home] ? WORLDCUP_DATA.teams[m.home].name : m.home;
          const awayName = WORLDCUP_DATA.teams[m.away] ? WORLDCUP_DATA.teams[m.away].name : m.away;
          return `${homeName} ${m.score.home}-${m.score.away} ${awayName}`;
        }).join("；");

        // 计算该日期是第几个比赛日 (以 6月11日 为首日 1)
        const start = new Date("2026-06-11");
        const current = new Date(d);
        const diffTime = Math.abs(current - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        WORLDCUP_DATA.dailySummaries[d] = {
          title: `第${diffDays}比赛日战况汇总`,
          content: `在第${diffDays}比赛日中，完成了多场强强对话，具体赛果为：${summaryText}。各组出线形势逐渐明朗，比赛竞争进入白热化阶段。`,
          keyMatch: finishedToday[0].id,
          statOfTheDay: `今日比赛全部顺利完赛，各支代表队展现了精彩的攻防表现。`
        };
        console.log(`[自动生成] 录入/更新了日期为 ${d} 的每日简报。`);
      }
    }
  });

  // 6. 更新更新时间戳 (UTC -> 北京时间格式)
  WORLDCUP_DATA.lastUpdated = bjTime.toISOString().replace('T', ' ').slice(0, 19);

  // 7. 保存写回 data.js
  const output = `// 2026年世界杯核心数据文件
// 本数据由 GitHub Actions 自动化抓取于 ${WORLDCUP_DATA.lastUpdated}

const WORLDCUP_DATA = ${JSON.stringify(WORLDCUP_DATA, null, 2)};

// 兼容 Node.js 导出与前端 script 引入
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WORLDCUP_DATA;
}
`;

  fs.writeFileSync(dataPath, output, 'utf8');
  console.log(`[成功] 比分更新完毕，共更新/变动了 ${updatedCount} 场比赛。数据已存回 ${dataPath}`);
}

run();
