// 2026年世界杯数据更新与重构脚本 (Node.js 版)
// 该脚本用于方便地通过命令行参数更新比分、分析、每日摘要，并自动更新时间戳

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../src/data.js');

// 1. 读取并导入现有数据
let WORLDCUP_DATA;
try {
  WORLDCUP_DATA = require(dataPath);
} catch (err) {
  console.error("加载数据文件失败，请检查路径:", dataPath, err);
  process.exit(1);
}

// 2. 解析命令行参数
const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};

let hasUpdates = false;

// 3. 处理比赛成绩更新
const matchIdStr = getArg('--match');
if (matchIdStr) {
  const matchId = parseInt(matchIdStr);
  const match = WORLDCUP_DATA.matches.find(m => m.id === matchId);
  if (!match) {
    console.error(`未找到 ID 为 ${matchId} 的比赛。`);
    process.exit(1);
  }
  
  const status = getArg('--status'); // e.g. "FT" or "Live 45'"
  const scoreHome = getArg('--score-home');
  const scoreAway = getArg('--score-away');
  
  if (status) {
    match.status = status;
    hasUpdates = true;
  }
  
  if (scoreHome !== null && scoreAway !== null) {
    match.score = {
      home: parseInt(scoreHome),
      away: parseInt(scoreAway)
    };
    hasUpdates = true;
  }
  
  // 战况技术统计 ( possession, shots, target, fouls格式为 "60,40" )
  const possession = getArg('--possession');
  const shots = getArg('--shots');
  const target = getArg('--target');
  const fouls = getArg('--fouls');
  
  if (possession || shots || target || fouls) {
    if (!match.stats) match.stats = {};
    
    if (possession) match.stats.possession = possession.split(',').map(Number);
    if (shots) match.stats.shots = shots.split(',').map(Number);
    if (target) match.stats.target = target.split(',').map(Number);
    if (fouls) match.stats.fouls = fouls.split(',').map(Number);
    hasUpdates = true;
  }
  
  // 战术深度解析
  const analysis = getArg('--analysis');
  if (analysis) {
    match.analysis = analysis;
    hasUpdates = true;
  }
  
  // MVP 评选
  const mvpName = getArg('--mvp-name');
  const mvpTeam = getArg('--mvp-team');
  const mvpRating = getArg('--mvp-rating');
  const mvpReason = getArg('--mvp-reason');
  
  if (mvpName || mvpTeam || mvpRating || mvpReason) {
    if (!match.mvp) match.mvp = {};
    if (mvpName) match.mvp.name = mvpName;
    if (mvpTeam) match.mvp.team = mvpTeam;
    if (mvpRating) match.mvp.rating = parseFloat(mvpRating);
    if (mvpReason) match.mvp.reason = mvpReason;
    hasUpdates = true;
  }
  
  console.log(`[成功] 比赛 ID ${matchId} 的数据已更新。`);
}

// 4. 处理每日快报更新
const dateStr = getArg('--date'); // e.g. "2026-06-18"
if (dateStr) {
  if (!WORLDCUP_DATA.dailySummaries[dateStr]) {
    WORLDCUP_DATA.dailySummaries[dateStr] = {};
  }
  const summary = WORLDCUP_DATA.dailySummaries[dateStr];
  
  const title = getArg('--summary-title');
  const content = getArg('--summary-content');
  const statStr = getArg('--stat-of-day');
  const keyMatchStr = getArg('--key-match');
  
  if (title) { summary.title = title; hasUpdates = true; }
  if (content) { summary.content = content; hasUpdates = true; }
  if (statStr) { summary.statOfTheDay = statStr; hasUpdates = true; }
  if (keyMatchStr) { summary.keyMatch = parseInt(keyMatchStr); hasUpdates = true; }
  
  console.log(`[成功] 日期 ${dateStr} 的战况快报已更新。`);
}

// 5. 修改当前日期和比赛日进度
const currentDate = getArg('--current-date');
if (currentDate) {
  WORLDCUP_DATA.currentDate = currentDate;
  hasUpdates = true;
  console.log(`[成功] 当前显示日期变更为: ${currentDate}`);
}

const currentMatchday = getArg('--current-matchday');
if (currentMatchday) {
  WORLDCUP_DATA.currentMatchday = parseInt(currentMatchday);
  hasUpdates = true;
  console.log(`[成功] 赛事进度比赛日变更为: 第 ${currentMatchday} 天`);
}

// 6. 保存并更新时间戳
if (hasUpdates) {
  // 模拟当前时间 (在当前时区生成 YYYY-MM-DD HH:mm:ss 格式)
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  const localNow = new Date(now.getTime() - offsetMs);
  const dateParts = localNow.toISOString().replace('T', ' ').slice(0, 19);
  
  WORLDCUP_DATA.lastUpdated = dateParts;
  
  const outputContent = `// 2026年世界杯核心数据文件
// 本数据最后更新时间模拟为 ${WORLDCUP_DATA.lastUpdated}

const WORLDCUP_DATA = ${JSON.stringify(WORLDCUP_DATA, null, 2)};

// 兼容 Node.js 导出与前端 script 引入
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WORLDCUP_DATA;
}
`;
  
  fs.writeFileSync(dataPath, outputContent, 'utf8');
  console.log(`[完成] 数据已成功写回 ${dataPath}，时间戳已自动更新为 ${WORLDCUP_DATA.lastUpdated}`);
} else {
  console.log("未检测到任何输入数据变更，数据未进行修改。");
  console.log("参数指南:");
  console.log("  --match <ID>           更新指定ID的比赛成绩");
  console.log("  --status <Status>      修改比赛状态，如 \"FT\" 或 \"Live 80'\"");
  console.log("  --score-home <Score>   主队进球");
  console.log("  --score-away <Score>   客队进球");
  console.log("  --possession <60,40>   两队控球比百分数");
  console.log("  --shots <15,10>        两队射门次数");
  console.log("  --target <7,4>         两队射正次数");
  console.log("  --fouls <12,14>        两队犯规次数");
  console.log("  --analysis <Text>      详细的战术分析文本");
  console.log("  --mvp-name <Name>      MVP球员姓名");
  console.log("  --mvp-team <Team>      MVP所属球队简写 (如 MEX)");
  console.log("  --mvp-rating <8.5>     MVP评分");
  console.log("  --mvp-reason <Text>    MVP高光理由");
  console.log("  --date <YYYY-MM-DD>    更新指定日期的摘要快报");
  console.log("  --summary-title <T>    当日战况摘要标题");
  console.log("  --summary-content <C>  当日战况摘要具体内容");
  console.log("  --stat-of-day <S>      当日之最统计数据");
  console.log("  --key-match <ID>       当日关键场次ID (用于关联MVP展示)");
  console.log("  --current-date <Date>  修改面板当前的显示日期");
  console.log("  --current-matchday <N> 修改当前进度日");
}
