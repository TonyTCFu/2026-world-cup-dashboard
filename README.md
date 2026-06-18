# 2026 FIFA World Cup Daily Dashboard

这是一个高颜值的 **2026年世界杯每日赛程快报及战况分析 Dashboard**。支持移动端、平板与电脑等不同设备访问，提供深色玻璃轻奢风格界面，展现赛程比分、每日战报快报、出线预测、动态积分榜以及 AI 赛事模拟预测。

## 目录结构说明

- `index.html`：Dashboard 主界面（包含 HTML 结构和弹窗组件）
- `css/style.css`：极具视觉冲击力的 Vanilla CSS 样式（玻璃轻奢风，响应式设计）
- `js/app.js`：核心数据渲染、交互逻辑与动态积分排行榜重算算法
- `src/data.js`：核心赛事数据库（包括比分、MVP、战术简报、预测概率）
- `scripts/update_data.js`：一键自动更新脚本（Node.js 版），通过命令行直接录入新赛况，重算数据

---

## 本地开发与预览

1. **进入项目目录**：
   ```bash
   cd /Users/tonyfu/.gemini/antigravity/scratch/worldcup-dashboard
   ```

2. **启动本地 HTTP 服务**：
   可以使用 Node 附带的 `npx serve`（推荐）或 Python 快速服务：
   ```bash
   npx serve .
   # 或者使用 python
   python3 -m http.server 8000
   ```

3. **浏览器查看**：
   打开服务提供的 URL 地址（如 `http://localhost:3000` 或 `http://localhost:8000`）。

---

## 数据每日一键更新 (Automation)

您可以在录入数据时自动更新 `src/data.js` 中的比分，整个积分榜会在前端自动实时重新排序并高亮前两名。

### 使用参数快捷录入：

#### 示例 1：更新捷克 vs 南非的比分（ID 为 16，打完 1:1，修改状态为已结束 "FT"，并设定 MVP）
```bash
node scripts/update_data.js \
  --match 16 \
  --status "FT" \
  --score-home 1 \
  --score-away 1 \
  --possession "56,44" \
  --shots "13,9" \
  --target "5,4" \
  --fouls "10,13" \
  --analysis "捷克和南非上演了一场极其胶着的对抗。捷克依靠高空球优势频频施压，南非则凭借快速防守反击撕扯防线。最终双方1-1握手言和各取一分，在小组赛第一阶段的局势均十分微妙。" \
  --mvp-name "福斯特 (Lyle Foster)" \
  --mvp-team "RSA" \
  --mvp-rating 8.2 \
  --mvp-reason "在上半场打入关键的扳平反击进球，并且在锋线上完成了3次威胁盘带。"
```

#### 示例 2：更新 6月18日 当天的每日快报与战局摘要
```bash
node scripts/update_data.js \
  --date "2026-06-18" \
  --summary-title "生死战捷克战平南非，出线格局进入绞杀" \
  --summary-content "第8比赛日首场对决落下帷幕，捷克在先进一球的情况下未能保住胜局，被顽强的南非凭借反击1-1扳平。这场平局让两队的首胜希望双双落空，出线名额将留待末轮决定。今晚还将迎来瑞士 vs 波黑、加拿大 vs 卡塔尔、以及墨韩焦点对决。" \
  --stat-of-day "捷克前锋希克全场赢下了11次空中对抗，创下本届赛事单场空中争顶新纪录。" \
  --key-match 16
```

#### 示例 3：当时间推进到第二天时，修改首页默认显示的日期与比赛日
```bash
node scripts/update_data.js \
  --current-date "2026-06-19" \
  --current-matchday 9
```

---

## 放到公网 (Public Deployment)

### 选项 A：使用 Surge 极速一键发布 (最快捷)

1. 在当前目录下，直接运行以下命令：
   ```bash
   npx surge .
   ```
2. 首次运行会提示输入一个**邮箱地址**和**密码**来创建临时账户。
3. 输入您希望设置的域名（例如 `worldcup2026-dashboard.surge.sh`），然后按回车。
4. **大功告成！** 您的网站会立刻上线，可以在任何手机、电脑上访问此公网域名。

### 选项 B：使用 GitHub Pages (适合长期自动维护)

1. 创建一个新的 GitHub 仓库（例如 `worldcup-2026-dashboard`）。
2. 将此本地目录推送到该仓库中：
   ```bash
   git init
   git add .
   git commit -m "Initialize World Cup 2026 Dashboard"
   git remote add origin git@github.com:YOUR_USERNAME/worldcup-2026-dashboard.git
   git branch -M main
   git push -u origin main
   ```
3. 在 GitHub 仓库的 **Settings -> Pages** 下，选择 `Build and deployment` 为 `Deploy from a branch`，分支选择 `main`（或者 `/root`），点击 Save。
4. 几分钟后，您的 Dashboard 就会发布在 `https://YOUR_USERNAME.github.io/worldcup-2026-dashboard/`！
