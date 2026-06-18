// 打印一个完整事件的 JSON 结构
const url = "http://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

fetch(url)
  .then(res => res.json())
  .then(data => {
    if (data.events && data.events.length > 0) {
      console.log(JSON.stringify(data.events[0], null, 2).slice(0, 3000));
    }
  })
  .catch(err => console.error("Error:", err));
