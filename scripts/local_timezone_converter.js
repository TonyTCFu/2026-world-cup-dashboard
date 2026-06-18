// 本地时区转换脚本：使用体育场（城市）的夏令时时区偏移，将所有比赛时间精确转换为北京时间 (UTC+8)
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../src/data.js');

// 各个体育场的 UTC 偏移小时数 (2026年6月夏令时)
const STADIUM_OFFSETS = {
  "阿兹特克体育场": -6,       // 墨西哥城 (UTC-6)
  "阿克伦体育场": -6,         // 瓜达拉哈拉 (UTC-6)
  "卑诗体育馆": -7,           // 温哥华 (UTC-7)
  "大都会人寿体育场": -4,     // 纽约 (UTC-4)
  "朗威体育场": -4,           // 夏洛特 (UTC-4)
  "洛杉矶体育场": -7,         // 洛杉矶 (UTC-7)
  "玫瑰碗球场": -7,           // 洛杉矶 (UTC-7)
  "NRG体育场": -5,            // 休斯敦 (UTC-5)
  "丰田体育场": -5,           // 休斯敦 (UTC-5)
  "多伦多体育场": -4,         // 多伦多 (UTC-4)
  "BMO球场": -4,             // 多伦多 (UTC-4)
  "李维斯体育场": -7,         // 圣克拉拉 (UTC-7)
  "吉列体育场": -4,           // 波士顿 (UTC-4)
  "大都会体育场": -4,         // 东卢瑟福 (UTC-4)
  "达拉斯体育场": -5,         // 达拉斯 (UTC-5)
  "梅赛德斯-奔驰体育场": -5,   // 亚特兰大 (UTC-5)
  "流明球场": -7              // 西雅图 (UTC-7)
};

function getOffset(stadiumName) {
  for (let key of Object.keys(STADIUM_OFFSETS)) {
    if (stadiumName.includes(key)) {
      return STADIUM_OFFSETS[key];
    }
  }
  return -5; // 默认偏移 (中部时间)
}

function run() {
  // 重新加载数据
  let WORLDCUP_DATA;
  try {
    // 清除 Node 的 require 缓存以重新加载文件
    delete require.cache[require.resolve(dataPath)];
    WORLDCUP_DATA = require(dataPath);
  } catch (err) {
    console.error("加载数据失败:", err);
    process.exit(1);
  }

  console.log("正在使用体育场本地夏令时偏移将比赛时间转换为北京时间 (UTC+8)...");

  const dateMapping = {};

  WORLDCUP_DATA.matches.forEach(match => {
    const offset = getOffset(match.stadium);
    const oldDate = match.date;
    
    // 解析当地时间，格式为 YYYY-MM-DDTHH:MM:00
    // 例如 "2026-06-11T18:00:00"
    const localDateTimeStr = `${match.date}T${match.time}:00`;
    
    // 构造当地时间的 Date 对象（根据偏移计算 UTC 时间）
    // 偏移为 -6 时，对应 UTC 时间是 localTime - (-6) 小时
    const localTime = new Date(localDateTimeStr);
    const utcTimeMs = localTime.getTime() - (offset * 60 * 60 * 1000);
    
    // 加上 8 小时得到北京时间
    const bjTime = new Date(utcTimeMs + 8 * 60 * 60 * 1000);
    
    // 格式化北京时间日期和时间
    // 格式化为北京时间的 YYYY-MM-DD
    const yyyy = bjTime.getFullYear();
    const mm = String(bjTime.getMonth() + 1).padStart(2, '0');
    const dd = String(bjTime.getDate()).padStart(2, '0');
    const bjDateString = `${yyyy}-${mm}-${dd}`;
    
    const hh = String(bjTime.getHours()).padStart(2, '0');
    const min = String(bjTime.getMinutes()).padStart(2, '0');
    const bjTimeString = `${hh}:${min}`;

    match.date = bjDateString;
    match.time = bjTimeString;

    // 记录旧日期到新北京时间日期的对应关系
    dateMapping[oldDate] = bjDateString;

    console.log(`Match ${match.id} (${match.home} vs ${match.away}): ${oldDate} ${localDateTimeStr.slice(11,16)} (偏移 ${offset}) -> 北京时间 ${bjDateString} ${bjTimeString}`);
  });

  // 映射每日简报的 Key 键值
  const newDailySummaries = {};
  Object.keys(WORLDCUP_DATA.dailySummaries).forEach(oldKey => {
    // 对应关系：旧日期对应的北京时间日期
    const newKey = dateMapping[oldKey] || oldKey;
    newDailySummaries[newKey] = WORLDCUP_DATA.dailySummaries[oldKey];
    console.log(`[简报映射] 日期: ${oldKey} -> ${newKey}`);
  });
  WORLDCUP_DATA.dailySummaries = newDailySummaries;

  // 重新计算北京时间下的 currentDate (当前最新的已完赛比赛日期)
  let latestFinishedBJDate = "2026-06-12"; // 首场比赛北京时间是 6月12日
  WORLDCUP_DATA.matches.forEach(m => {
    if (m.status === "FT" && m.date > latestFinishedBJDate) {
      latestFinishedBJDate = m.date;
    }
  });
  WORLDCUP_DATA.currentDate = latestFinishedBJDate;
  
  // 计算 currentMatchday (以北京时间首日 6月12日 为第 1 天)
  const start = new Date("2026-06-12");
  const current = new Date(latestFinishedBJDate);
  const diffTime = Math.abs(current - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  WORLDCUP_DATA.currentMatchday = diffDays;

  console.log(`[同步] 当前北京时间日期: ${latestFinishedBJDate} (第 ${diffDays} 比赛日)`);

  // 保存写回
  const output = `// 2026年世界杯核心数据文件
// 本数据已转换为北京时间 (UTC+8)

const WORLDCUP_DATA = ${JSON.stringify(WORLDCUP_DATA, null, 2)};

// 兼容 Node.js 导出与前端 script 引入
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WORLDCUP_DATA;
}
`;

  fs.writeFileSync(dataPath, output, 'utf8');
  console.log("本地时区转换成功！已写回 src/data.js");
}

run();
