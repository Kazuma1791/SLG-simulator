// ==========================================
// 🛡️ 前端封印：禁止使用 F12 與右鍵 (防護小白作弊)
// ==========================================
// 1. 禁止滑鼠右鍵 (防「檢查」)
document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
});

// 2. 攔截各式開發者快捷鍵
document.addEventListener('keydown', function (e) {
    // 擋下 F12
    if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
    }
    // 擋下 Ctrl + Shift + I (開發者工具)
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
        e.preventDefault();
        return false;
    }
    // 擋下 Ctrl + Shift + J (控制台)
    if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
        e.preventDefault();
        return false;
    }
    // 擋下 Ctrl + U (檢視原始碼)
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
        e.preventDefault();
        return false;
    }
});

// 3. (選用) 偵測如果控制台被強制打開，就彈出警告或清空畫面
let devtools = function() {};
devtools.toString = function() {
    if (!window.isAdmin) {
        alert("⚠️ 系統警告：嚴禁開啟開發者工具，您的行為已被記錄！");
    }
    return '';
}
console.log('%c', devtools);
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, collection, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCaowUN5atHnnlfvGmfWA0PDyjfQU3Qr0U",
  authDomain: "slg-game-617b3.firebaseapp.com",
  projectId: "slg-game-617b3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentAlliance = null;
let myUid = null, myData = null, allCastles = [], worldBosses = [], worldNodes = [], hasCentered = false;
let godModeFog = false, isAdmin = false, currentAnnouncement = null; 

const TILE_SIZE = 55, WORLD_COLS = 200, WORLD_ROWS = 200, BASE_VISION_RADIUS = 5;
const RELOCATE_COOLDOWN = 12 * 60 * 60 * 1000; 
let currentVisionBonus = 0, camX = 0, camY = 0, zoom = 1.0;
const MIN_ZOOM = 0.05, MAX_ZOOM = 2.0;

const canvas = document.getElementById("worldCanvas"), ctx = canvas.getContext("2d");
let MAP_CACHE = [];
const exploredTiles = Array.from({ length: WORLD_COLS }, () => Array(WORLD_ROWS).fill(false));

const castleImgs = [];
for (let i = 1; i <= 7; i++) {
    const img = new Image(); img.src = `ico_buildings_haven_cityHall_0${i}.png`; castleImgs.push(img);
}

const imgDarkCapital = new Image(); imgDarkCapital.src = 'dark_capital.png';
const imgDarkFortress = new Image(); imgDarkFortress.src = 'dark_fortress.png';
const imgDarkCastle = new Image(); imgDarkCastle.src = 'dark_castle.png';
const imgDarkOutpost = new Image(); imgDarkOutpost.src = 'dark_outpost.png';
const imgBarbarian = new Image(); imgBarbarian.src = 'ico_buildings_stronghold_cyclopsMound.png';
const imgRelic = new Image(); imgRelic.src = 'relic.png'; 

const imgBossCore = new Image(); imgBossCore.src = 'boss_core.png';
const imgBossMid = new Image(); imgBossMid.src = 'boss_mid.png';
const imgBossOuter = new Image(); imgBossOuter.src = 'boss_outer.png';

const imgResFarm = new Image(); imgResFarm.src = 'res_farm.png';
const imgResLumber = new Image(); imgResLumber.src = 'res_lumber.png';
const imgResMine = new Image(); imgResMine.src = 'res_mine.png';
const imgWorldMap = new Image(); imgWorldMap.src = 'map.jpg';

const currentHourSeed = Math.floor(Date.now() / 3600000);
const epicLandmarks = [
    {name:'中央王都', x:115, y:95, pwr: 25000, c:'#facc15'}, 
    {name:'猩紅法師塔', x:148, y:32, pwr: 18000, c:'#ef4444'}, 
    {name:'迷霧監視塔', x:145, y:165, pwr: 12000, c:'#a855f7'}, 
    {name:'砂海要塞', x:65, y:185, pwr: 10000, c:'#f97316'}
];

const CFG = {
  buildings: { 
    castle:    { name: '主城',     desc: '提升其他建築等級上限，增強領地整體實力。', rate: 0,   baseW: 600, baseI: 600, baseTime: 1200, maxLevel: 99 },
    academy:   { name: '學院',     desc: '解鎖並提升軍事科技，強化部隊戰鬥力與屬性。', rate: 0,   baseW: 400, baseI: 400, baseTime: 900, maxLevel: 99 },
    builder:   { name: '工匠小屋', desc: '增加可同時升級的建築佇列數量。', rate: 0,   baseW: 2000, baseI: 2000, baseTime: 1800, maxLevel: 3 }, 
    wall:      { name: '城牆',     desc: '增強防禦力，降低城池遭敵軍攻打時的戰損比例。', rate: 0,   baseW: 800, baseI: 800, baseTime: 600, maxLevel: 99 },
    warehouse: { name: '地下倉庫', desc: '保護基礎資源，避免在城池被攻破時遭全數掠奪。', rate: 0,   baseW: 500, baseI: 500, baseTime: 400, maxLevel: 99 },
    lumber:    { name: '伐木場',   desc: '持續生產木材，用於升級建築與研發科技。', rate: 1.0, baseW: 100, baseI: 50,  baseTime: 300, maxLevel: 99 }, 
    mine:      { name: '鐵礦場',   desc: '持續生產鐵礦，是招募高階兵種的必備資源。', rate: 0.8, baseW: 50,  baseI: 100, baseTime: 300, maxLevel: 99 }, 
    farm:      { name: '農田',     desc: '持續生產糧草，用以維持龐大軍隊的日常消耗。', rate: 1.2, baseW: 80,  baseI: 80,  baseTime: 300, maxLevel: 99 }, 
    barracks:  { name: '兵營',     desc: '解鎖高階兵種，升級可提升單次招募士兵的數量。', rate: 0,   baseW: 200, baseI: 200, baseTime: 600, maxLevel: 99 } 
  },
  techs: {
    infantry_atk: { name: '步兵鍛甲', icon: '🛡️', desc: '提升步兵攻擊力 (+1/級)', baseW: 300, baseI: 300, baseTime: 600 },
    archer_atk:   { name: '弓兵矢志', icon: '🏹', desc: '提升弓兵攻擊力 (+1/級)', baseW: 300, baseI: 300, baseTime: 600 },
    cavalry_atk:  { name: '騎術改良', icon: '🐎', desc: '提升騎兵攻擊力 (+1/級)', baseW: 300, baseI: 300, baseTime: 600 },
    // 🐎 行軍加速
    march_speed: { 
      name: '急行軍隊', 
      icon: '🐎', 
      desc: '提升全軍行軍速度 (+8%/級)', 
      baseW: 300, 
      baseI: 150, 
      baseTime: 60 
    },
    // 🎒 負重強化
    troop_load: { 
      name: '輜重革新', 
      icon: '🎒', 
      desc: '提升部隊資源負重上限 (+15%/級)', 
      baseW: 400, 
      baseI: 100, 
      baseTime: 90 
    },
    // 🏥 醫院容量
    hospital_cap: { 
      name: '戰地救護', 
      icon: '🏥', 
      desc: '提升醫療所傷兵收容容量 (+3,000/級)', 
      baseW: 250, 
      baseI: 250, 
      baseTime: 60 
    }
  },
  troops: {
    infantry: { icon: '🛡️', name: '重裝步兵', w: 40, i: 30, f: 0,  pwr: 1, speed: 6, time: 20, reqLvl: 1, upkeep: 10 },
    archer:   { icon: '🏹', name: '長弓射手', w: 60, i: 10, f: 20, pwr: 2, speed: 4, time: 30, reqLvl: 3, upkeep: 25 },
    cavalry:  { icon: '🐎', name: '驃騎兵',   w: 20, i: 80, f: 60, pwr: 3, speed: 2, time: 45, reqLvl: 5, upkeep: 45 }
  }
};

function formatCompact(num) {
  if (isNaN(num)) return 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Math.floor(num).toString();
}

// ==========================================
// 💡 升級消耗：資源倍率拉高 (1.5 -> 1.62)，後期需要大量資源支撐
// ==========================================
function getUpgradeCost(key, level, isTech=false) { 
    const base = isTech ? CFG.techs[key] : CFG.buildings[key]; 
    if(!base) return {w:0, i:0, f:0};
    const curLv = level || 0;
    const m = Math.pow(1.62, curLv); 
    const cost = { 
        w: Math.floor((base.baseW || 100) * m), 
        i: Math.floor((base.baseI || 80) * m) 
    };
    if (base.baseF) {
        cost.f = Math.floor(base.baseF * m);
    }
    return cost; 
}
// ==========================================
// 💡 學院科技介面與數值加成計算模組
// ==========================================

// 1. 先定義數值加成文字的函數 (獨立在外，絕對不會抓不到)
function getTechEffectText(techKey, curLevel) {
  const lv = curLevel || 0;
  if (techKey === 'march_speed') {
    return `行軍速度：+${lv * 8}% ${lv > 0 ? `(下級: +${(lv + 1) * 8}%)` : ''}`;
  } else if (techKey === 'troop_load') {
    return `部隊負重：+${lv * 15}% ${lv > 0 ? `(下級: +${(lv + 1) * 15}%)` : ''}`;
  } else if (techKey === 'hospital_cap') {
    return `傷兵上限：+${(lv * 3000).toLocaleString()} ${lv > 0 ? `(下級: +${((lv + 1) * 3000).toLocaleString()})` : ''}`;
  } else if (techKey === 'infantry_atk' || techKey === 'archer_atk' || techKey === 'cavalry_atk') {
    return `部隊戰力：+${lv} ${lv > 0 ? `(下級: +${lv + 1})` : ''}`;
  }
  return '';
}

// 2. 學院彈窗渲染邏輯
window.openAcademyModal = function() {
  if (!myData) return;
  const modal = document.getElementById('academy-modal');
  const list = document.getElementById('academy-tech-list');
  if (!modal || !list) return;

  const isResearching = myData.researchQueue && myData.researchQueue.finishesAt > Date.now();
  let html = '';

  Object.keys(CFG.techs).forEach(k => {
    const t = CFG.techs[k];
    const curLv = (myData.research && myData.research[k]) || 0;
    const cost = window.getUpgradeCost ? window.getUpgradeCost(k, curLv, true) : getUpgradeCost(k, curLv, true);
    const timeSec = window.getUpgradeTime ? window.getUpgradeTime(k, curLv, true) : getUpgradeTime(k, curLv, true);
    const effectText = getTechEffectText(k, curLv);

    const hasRes = myData.wood >= cost.w && myData.iron >= cost.i && (!cost.f || myData.food >= cost.f);
    const canUpgrade = !isResearching && hasRes;

    html += `
      <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1; margin-right: 12px;">
          <div style="font-weight: bold; font-size: 15px; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
            <span>${t.icon || '🔬'}</span>
            <span>${t.name}</span>
            <span style="font-size: 12px; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 1px 6px; border-radius: 4px;">Lv.${curLv}</span>
          </div>
          <div style="color: #94a3b8; font-size: 12px; margin-top: 4px; line-height: 1.4;">
            ${t.desc || '提升部隊科技屬性'}
          </div>
          <div style="color: #34d399; font-size: 12px; font-weight: bold; margin-top: 4px;">
            ✨ 當前效果: ${effectText}
          </div>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 6px; display: flex; gap: 8px;">
            <span>🪵 木材: ${formatCompact(cost.w)}</span>
            <span>⛏️ 鐵礦: ${formatCompact(cost.i)}</span>
            ${cost.f ? `<span>🌾 糧草: ${formatCompact(cost.f)}</span>` : ''}
            <span>⏱️ 耗時: ${formatTime(timeSec)}</span>
          </div>
        </div>
        <div>
          <button onclick="startResearch('${k}')" ${canUpgrade ? '' : 'disabled'} 
            style="padding: 8px 14px; border-radius: 6px; border: none; font-weight: bold; cursor: ${canUpgrade ? 'pointer' : 'not-allowed'};
            background: ${canUpgrade ? '#3b82f6' : '#475569'}; color: ${canUpgrade ? '#ffffff' : '#94a3b8'};">
            ${isResearching && myData.researchQueue.target === k ? '研發中' : '研發'}
          </button>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;
  modal.style.display = 'block';
};
// ==========================================
// 💡 升級時間：線性+溫和指數成長，最高封頂 3 小時 (10,800 秒)
// ==========================================
function getUpgradeTime(key, level, isTech=false) { 
    const baseCfg = isTech ? CFG.techs[key] : CFG.buildings[key]; 
    if(!baseCfg) return 60;
    const base = baseCfg.baseTime || 60;
    const curLv = Math.max(0, (level||0) - 1);
    
    // 溫和成長曲線 (1.25 倍率)，避免後期幾百小時
    let calculatedTime = Math.floor(base * Math.pow(1.25, curLv));
    
    // 🔒 終極限制：單項升級最高上限為 3 小時 (10,800 秒)
    return Math.min(10800, calculatedTime); 
}

function formatTime(sec) {
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec/60) + 'm' + (sec%60 > 0 ? ' '+(sec%60)+'s' : '');
  return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm';
}

function getTileTypeRaw(x, y) { return 'plains'; }

function getStaticEntity(x, y, type) {
  if (x === 115 && y === 95) return { type: 'npc_capital', name: '👑 中央王都', reqPwr: 50000, loot: { wood: 1000000, iron: 1000000, food: 1000000, speedup1h: 10, resourceCard: 5 } };
  if (x === 148 && y === 32) return { type: 'npc_super_castle', name: '🗼 猩紅法師塔', reqPwr: 35000, loot: { iron: 300000, wood: 300000, food: 300000, speedup1h: 3 } };
  if (x === 145 && y === 165) return { type: 'npc_fortress', name: '👁️ 迷霧監視塔', reqPwr: 20000, loot: { wood: 150000, iron: 150000, food: 150000, speedup30m: 5 } };
  if (x === 65 && y === 185) return { type: 'npc_fortress', name: '🏜️ 砂海要塞', reqPwr: 15000, loot: { wood: 100000, iron: 100000, food: 100000, speedup30m: 3 } };

  if (type === 'water') return null;
  const v = Math.sin(x * 45.123 + y * 89.456) * 98765.4321; const r = v - Math.floor(v); 

  for (let lm of epicLandmarks) {
      const dist = Math.hypot(x - lm.x, y - lm.y);
      if (dist > 0 && dist <= 10) {
          if (dist <= 3) {
              if (r < 0.10) return { type: 'npc_faction_guard', name: `🏰 ${lm.name}·禁衛城堡 (Lv.3)`, faction: lm.name, pwr: Math.floor(lm.pwr*1.5), reqPwr: Math.floor(lm.pwr*1.5), loot: { wood: 30000, iron: 30000, speedup1h: 1 } };
              if (r < 0.35) return { type: 'res_mine', name: '💎 皇家晶礦脈', res: 'iron', cap: 500000, reqPwr: Math.floor(lm.pwr*0.5) };
              if (r < 0.60) return { type: 'res_farm', name: '🌾 皇家御用農莊', res: 'food', cap: 500000, reqPwr: Math.floor(lm.pwr*0.5) };
              if (r < 0.85) return { type: 'res_lumber', name: '🌲 神木林', res: 'wood', cap: 500000, reqPwr: Math.floor(lm.pwr*0.5) };
          } 
          else if (dist <= 6) {
              if (r < 0.08) return { type: 'npc_faction_guard', name: `🏯 ${lm.name}·前線要塞 (Lv.2)`, faction: lm.name, pwr: lm.pwr, reqPwr: lm.pwr, loot: { wood: 10000, iron: 10000, speedup5m: 5 } };
              if (r < 0.20) return { type: 'res_mine', name: '⛏️ 富脈鐵礦', res: 'iron', cap: 200000, reqPwr: Math.floor(lm.pwr*0.2) };
              if (r < 0.35) return { type: 'res_lumber', name: '🌲 豐饒古木林', res: 'wood', cap: 200000, reqPwr: Math.floor(lm.pwr*0.2) };
          }
          else {
              if (r < 0.04) return { type: 'npc_faction_guard', name: `🏕️ ${lm.name}·外圍營地 (Lv.1)`, faction: lm.name, pwr: Math.floor(lm.pwr*0.7), reqPwr: Math.floor(lm.pwr*0.7), loot: { wood: 5000, iron: 5000 } };
              if (r < 0.15) return { type: 'res_farm', name: '🌾 邊境屯田', res: 'food', cap: 100000, reqPwr: 2000 };
          }
          return null; 
      }
  }

  // 🌲 3. 一般野外隨機物件
  if (r < 0.002) return { type: 'npc_outpost', name: '🏕️ 黑暗前哨', reqPwr: 3000, loot: { wood: 15000, iron: 15000, food: 15000, speedup5m: 5 } };
  if (r < 0.010) return { type: 'barbarian', name: '👹 狂暴野蠻人', reqPwr: 800, loot: { iron: 8000, wood: 4000, food: 6000, speedup5m: 5 } };
  
  // 💡 4. 動態資源點生成 (分為 Lv.1 ~ Lv.5)
  if (r < 0.060) {
      // 1. 根據座標產生穩定的資源種類 (不會因為重整網頁而變換)
      const typeRoll = (x * 13 + y * 31) % 3;
      const types = [
          { t: 'res_farm', n: '🌾 農田', r: 'food' },
          { t: 'res_lumber', n: '🌲 伐木場', r: 'wood' },
          { t: 'res_mine', n: '⛏️ 鐵礦', r: 'iron' }
      ];
      const pick = types[typeRoll];
      
      // 2. 根據座標產生穩定的等級 (Lv.1 最多，Lv.5 最稀有)
      const lvRoll = (x * 47 + y * 83) % 100;
      let lv = 1;
      if (lvRoll >= 50) lv = 2; // 30% 機率
      if (lvRoll >= 80) lv = 3; // 15% 機率
      if (lvRoll >= 95) lv = 4; // 4% 機率
      if (lvRoll === 99) lv = 5; // 1% 機率 (極度稀有)
      
      // 3. 定義各等級的「蘊藏量(cap)」與「守軍戰力(reqPwr)」
      const stats = {
          1: { cap: 10000, reqPwr: 200 },     // 新手輕鬆佔領
          2: { cap: 30000, reqPwr: 1000 },    // 前期主力
          3: { cap: 100000, reqPwr: 5000 },   // 中期大礦
          4: { cap: 250000, reqPwr: 15000 },  // 兵家必爭之地
          5: { cap: 500000, reqPwr: 40000 }   // 終極寶藏，必須出動大軍
      };
      
      return { 
          type: pick.t, 
          name: `${pick.n} Lv.${lv}`, 
          res: pick.r, 
          cap: stats[lv].cap, 
          reqPwr: stats[lv].reqPwr 
      };
  }
  if (r < 0.065) return { type: 'barbarian', name: '👹 野蠻人部落', reqPwr: 100, loot: { iron: 1500, wood: 1000, food: 1200, speedup5m: 1 } };
  if (r < 0.080) return { type: 'relic', name: '🏛 破碎遺跡', reqFood: 30, loot: { wood: 500, iron: 500, food: 500 } };
  return null;
}

function initMapCache() {
  for(let x=0; x<WORLD_COLS; x++) { MAP_CACHE[x] = []; for(let y=0; y<WORLD_ROWS; y++) { let t = getTileTypeRaw(x,y); if (x===100 && y===100) t = 'plains'; MAP_CACHE[x][y] = { type: t, entity: getStaticEntity(x,y,t) }; } }
}
initMapCache();

function sanitizeData() {
  if (!myData.allianceId) myData.allianceId = null;
  if (!myData.allianceName) myData.allianceName = null;
  if (!myData) return;
  if (typeof myData.troops !== 'object') myData.troops = { infantry: 10, archer: 0, cavalry: 0 };
  ['infantry', 'archer', 'cavalry'].forEach(k => { if(isNaN(myData.troops[k]) || myData.troops[k]===null) myData.troops[k] = 0; });
  if (!myData.buildings || typeof myData.buildings !== 'object') myData.buildings = {};
  Object.keys(CFG.buildings).forEach(k => { if(isNaN(myData.buildings[k]) || myData.buildings[k]===null) myData.buildings[k] = (k==='builder'||k==='academy'||k==='wall'||k==='warehouse') ? 0 : 1; });
  if (!myData.research || typeof myData.research !== 'object') myData.research = {};
  Object.keys(CFG.techs).forEach(k => { if(isNaN(myData.research[k]) || myData.research[k]===null) myData.research[k] = 0; });

  if (!myData.items || typeof myData.items !== 'object') myData.items = { speedup5m: 3, speedup30m: 0, speedup1h: 0, renameCard: 0, resourceCard: 0, shieldCard: 1 };
  if (myData.items.speedup !== undefined) { myData.items.speedup5m = myData.items.speedup; delete myData.items.speedup; }
  ['speedup5m', 'speedup30m', 'speedup1h', 'renameCard', 'resourceCard', 'shieldCard'].forEach(k => { if(isNaN(myData.items[k]) || myData.items[k]===null) myData.items[k] = 0; });

  if (!Array.isArray(myData.buildQueues)) { myData.buildQueues = []; }
  myData.buildQueues = myData.buildQueues.filter(q => q && q.target && CFG.buildings[q.target]); 
  if (myData.researchQueue && (!myData.researchQueue.target || !CFG.techs[myData.researchQueue.target])) myData.researchQueue = null;
  if (myData.trainQueue && (!myData.trainQueue.type || !CFG.troops[myData.trainQueue.type])) myData.trainQueue = null;
  if (!Array.isArray(myData.marches)) myData.marches = [];
  myData.marches = myData.marches.filter(m => m !== null && m !== undefined); 
  if (!Array.isArray(myData.clearedPOI)) myData.clearedPOI = [];
  myData.clearedPOI = myData.clearedPOI.filter(p => p !== null && p !== undefined);
  if (!Array.isArray(myData.logs)) myData.logs = ['歡迎來到領地戰！'];
  if (!Array.isArray(myData.cheatLog)) myData.cheatLog = [];
  if (!Array.isArray(myData.claimedBosses)) myData.claimedBosses = [];
  if (!Array.isArray(myData.claimedAnnouncements)) myData.claimedAnnouncements = [];
    // 👇 初始化 VIP 數據
  if (!myData.vip || typeof myData.vip !== 'object') {
      myData.vip = { isActive: false, expiresAt: 0, lastClaimed: "" };
  }
  // ⏳ 每次登入/刷新時，檢查 VIP 是否已過期
  if (myData.vip.isActive && Date.now() > myData.vip.expiresAt) {
      myData.vip.isActive = false; // 自動取消特權
  }
    
  // 👇 任務與戰報初始化
  if (!Array.isArray(myData.reports)) myData.reports = [];
  const todayStr = new Date().toDateString();
  if (!myData.quests || myData.quests.dateStr !== todayStr) {
      myData.quests = { daily: { kills: 0, gather_wood: 0, upgrades: 0 }, claimed: [], dateStr: todayStr };
  }
  
  if (isNaN(myData.wood) || myData.wood === null) myData.wood = 200;
  if (isNaN(myData.iron) || myData.iron === null) myData.iron = 200;
  if (isNaN(myData.food) || myData.food === null) myData.food = 200;
  if (isNaN(myData.shieldEndsAt) || myData.shieldEndsAt === null) myData.shieldEndsAt = 0;
  if (isNaN(myData.lastRelocateTime) || myData.lastRelocateTime === null) myData.lastRelocateTime = 0;
  if (typeof myData.isBanned !== 'boolean') myData.isBanned = false;
}

// 💡 終極防外掛系統：數值驗證 + 設備連坐封鎖 (Device Ban)
function runAntiCheat() {
    if (isAdmin) return false;
    
    // 💀 1. 設備連坐檢查：如果這台裝置曾經被抓過，不管換什麼新帳號，一律瞬間死刑！
    if (localStorage.getItem('SLG_DEATH_MARK') === 'true') {
        if (!myData.isBanned) {
            myData.isBanned = true; myData.banReason = "使用被封鎖的違規設備登入 (連坐處分)";
            setDoc(doc(db, "players", myUid), { isBanned: true, banReason: myData.banReason }, { merge: true });
        }
        document.getElementById('ban-screen').style.display = 'flex';
        document.getElementById('ban-reason').innerText = "該設備已列入永久黑名單，禁止遊玩。";
        return true;
    }

    if (myData.isBanned) return true;

    let cheatDetected = false; let reason = "";
    const MAX_RESOURCE = 500000000; const MAX_TROOPS = 50000000; const MAX_ITEMS = 10000;

    const textRegex = /[<>"'`\\]/g;
    if (myData.name) myData.name = myData.name.replace(textRegex, "").substring(0, 12);
    if (myData.allianceName) myData.allianceName = myData.allianceName.replace(textRegex, "").substring(0, 10);

    const resKeys = ['wood', 'iron', 'food'];
    resKeys.forEach(k => { 
        if (!isFinite(myData[k]) || isNaN(myData[k]) || myData[k] < 0) myData[k] = 0; 
        if (myData[k] > MAX_RESOURCE) { cheatDetected = true; reason = `資源數量嚴重異常(${k})`; }
    });

    ['infantry', 'archer', 'cavalry'].forEach(k => {
        if (!isFinite(myData.troops[k]) || isNaN(myData.troops[k]) || myData.troops[k] < 0) myData.troops[k] = 0;
        if (myData.troops[k] > MAX_TROOPS) { cheatDetected = true; reason = `兵力數量嚴重異常(${k})`; }
    });

    if (myData.items.speedup5m > MAX_ITEMS || myData.items.shieldCard > MAX_ITEMS) { cheatDetected = true; reason = "道具數量超出硬上限"; }
    if (myData.buildings.castle > 100 || myData.buildings.builder > 5) { cheatDetected = true; reason = "建築等級異常"; }
    if (myData.buildQueues.length > 5 || myData.marches.length > 10) { cheatDetected = true; reason = "佇列資料惡意篡改"; }

    if (cheatDetected) {
        // 💀 2. 抓到作弊，立刻在設備植入「死刑印記」
        localStorage.setItem('SLG_DEATH_MARK', 'true');
        
        myData.isBanned = true; myData.banReason = reason;
        myData.cheatLog.unshift(`[${new Date().toLocaleString()}] 查獲: ${reason}`);
        setDoc(doc(db, "players", myUid), { isBanned: true, banReason: reason, cheatLog: myData.cheatLog }, { merge: true });
        document.getElementById('ban-screen').style.display = 'flex';
        document.getElementById('ban-reason').innerText = reason;
        return true; 
    }
    return false;
}

function getClearedPOI(x, y) {
  if (!myData || !myData.clearedPOI) return null;
  const found = myData.clearedPOI.find(poi => poi === `${x},${y}` || poi.startsWith(`${x},${y},`));
  if (!found) return null; const pts = found.split(','); return { x: parseInt(pts[0]), y: parseInt(pts[1]), time: pts[2] ? parseInt(pts[2]) : 0, type: pts[3] || 'unknown' };
}

async function spawnWorldBoss(id) {
  let bx, by, n, hp, m;
  if (id === 'BOSS_CORE') {
      bx = 28; by = 135; 
      n = '🌋 熔岩滅世魔龍'; hp = 500000; m = 20;
  } else if (id === 'BOSS_MID_1') {
      bx = 55; by = 120; 
      n = '🌪️ 深海漩渦巨妖'; hp = 150000; m = 8;
  } else if (id === 'BOSS_MID_2') {
      bx = 45; by = 35;  
      n = '❄️ 凜冬風暴巨鷹'; hp = 150000; m = 8;
  } else if (id === 'BOSS_MID_3') {
      bx = 160; by = 45; 
      n = '🩸 猩紅樹魔'; hp = 150000; m = 8;
  } else if (id === 'BOSS_MID_4') {
      bx = 160; by = 145; 
      n = '🌑 腐化岩魔'; hp = 150000; m = 8;
  } else {
      let overlap, tries = 0;
      do {
          overlap = false; tries++;
          bx = Math.floor(Math.random()*190+5); 
          by = Math.floor(Math.random()*190+5);
          for(let b of worldBosses) if(b.id!==id && (b.hp>0||b.despawnAt>Date.now()) && Math.hypot(b.x-bx,b.y-by)<10) {overlap=true;break;}
          if(overlap) continue;
          for(let c of allCastles) if(Math.hypot(c.x-bx, c.y-by)<8) {overlap=true;break;}
          if(overlap) continue;
          for(let i=-1; i<=2; i++) for(let j=-1; j<=2; j++) {
              const cell = MAP_CACHE[bx+i]?.[by+j];
              if(!cell || cell.type==='water' || cell.type==='mountain' || cell.entity) { overlap=true; break; }
          }
      } while(overlap && tries<1000);
      n = '🗿 大地岩魔'; hp = 50000; m = 3;
  }

  const bObj = { name: n, isBoss: true, x: bx, y: by, hp: hp, maxHp: hp, mult: m, spawnId: Date.now(), contributors: {}, despawnAt: Date.now() + 6 * 3600 * 1000 };
  const idx = worldBosses.findIndex(x=>x.id===id); 
  if(idx>=0) worldBosses[idx]={id,...bObj}; else worldBosses.push({id,...bObj});
  await setDoc(doc(db, "world_map", id), bObj);
}

window.toggleFogMode = () => {
  godModeFog = !godModeFog; 
  document.getElementById('btn-toggle-fog').innerText = godModeFog ? "👁️ 開啟迷霧" : "👁️ 關閉迷霧";
  document.getElementById('btn-toggle-fog').style.background = godModeFog ? "#ef4444" : "#7c3aed"; 
  updateFogOfWar();
};

window.switchTab = (tabName) => {
  document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active'); document.getElementById('btn-tab-' + tabName).classList.add('active');
  if (tabName === 'world') { setTimeout(resizeCanvas, 50); }
  if (tabName === 'radar' || tabName === 'gm') { window.refreshMap(); }
  if (tabName === 'mail') { window.renderAnnouncement(); }
};

const originalSwitchTab = window.switchTab;
window.switchTab = (t) => {
    if(typeof originalSwitchTab === 'function') originalSwitchTab(t);
    if(t === 'alliance') window.renderAllianceUI();
};

window.registerUser = () => {
  const e = document.getElementById("email-input").value, p = document.getElementById("password-input").value;
  if (!e || p.length < 6) return alert("信箱無效或密碼過短(6碼)！");
  createUserWithEmailAndPassword(auth, e, p).then(() => alert("✅ 註冊成功！")).catch(err => alert("❌ " + err.message));
};
window.loginUser = () => {
  const e = document.getElementById("email-input").value, p = document.getElementById("password-input").value;
  signInWithEmailAndPassword(auth, e, p).catch(() => alert("❌ 登入失敗！請檢查帳號密碼。"));
};
window.logoutUser = () => { signOut(auth).then(() => location.reload()); };
window.openGuideModal = () => { document.getElementById('guide-modal').style.display = 'flex'; };
window.closeGuideModal = () => { document.getElementById('guide-modal').style.display = 'none'; };

onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("login-panel").style.display = "none";
    const titleEl = document.getElementById('player-title');
    if (titleEl) titleEl.innerHTML = `<span style="color:#facc15;">🔄 同步雲端資料庫中...</span>`;
    
    myUid = user.uid;
    const playerRef = doc(db, "players", myUid), worldRef = doc(db, "world_map", myUid);
    
    try {
        const pSnap = await getDoc(playerRef);
        let d = null;
        if (!pSnap.exists()) {
          let startX, startY; do { startX = Math.floor(Math.random() * 180) + 10; startY = Math.floor(Math.random() * 180) + 10; } while (Math.hypot(startX - 100, startY - 100) <= 64);
          d = {
            name: `領主_${myUid.slice(0, 4)}`, x: startX, y: startY,
            wood: 200, iron: 200, food: 200, troops: { infantry: 10, archer: 0, cavalry: 0 },
            buildings: { castle: 1, builder: 0, academy: 0, wall: 0, warehouse: 0, lumber: 1, mine: 1, farm: 1, barracks: 1 },
            research: { infantry_atk: 0, archer_atk: 0, cavalry_atk: 0 },
            items: { speedup5m: 3, speedup30m: 0, speedup1h: 0, renameCard: 0, resourceCard: 0, shieldCard: 1 },
            freeRenameUsed: false, lastRelocateTime: 0, shieldEndsAt: 0, isBanned: false, banReason: "", cheatLog: [], claimedBosses: [],
            buildQueues: [], researchQueue: null, trainQueue: null, lastTick: Date.now(), clearedPOI: [], marches: [], logs: ['歡迎降生於這片大陸！獲得護盾1個！']
          };
          await setDoc(playerRef, d);
          myData = d;
          setTimeout(() => { window.openGuideModal(); }, 1500);
        } else {
          myData = pSnap.data(); 
          // 💡 核心修復：在存檔與初始化前，第一時間執行特赦，徹底洗白設備！
          if (myData.clearDeviceBan) {
              localStorage.removeItem('SLG_DEATH_MARK');
              myData.clearDeviceBan = false; // 清除完立刻關閉特赦令
          }
          sanitizeData(); 
          await setDoc(playerRef, myData, {merge:true});
        }

        isAdmin = (user.email === 'topacoau@gmail.com');

        const wSnap = await getDoc(worldRef);
        if (!wSnap.exists()) { 
          await setDoc(worldRef, { name: myData.name, x: myData.x, y: myData.y, troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry, castleLevel: myData.buildings.castle, shieldEndsAt: myData.shieldEndsAt }, {merge:true}); 
        } else { 
          await setDoc(worldRef, { castleLevel: myData.buildings.castle, shieldEndsAt: myData.shieldEndsAt }, {merge:true}); 
        }
    } catch (err) { console.error("雲端初始化拒絕:", err); if (titleEl) titleEl.innerHTML = `<span style="color:#ef4444; font-size:0.85rem;">🚨 伺服器拒絕存取！</span>`; }

    onSnapshot(playerRef, (docSnap) => {
      if (docSnap.exists()) {
        myData = docSnap.data();
        sanitizeData();
        // 💡 1. 如果收到管理員的「特赦令」，立刻清除瀏覽器裡的死刑印記！
        if (myData.clearDeviceBan) {
            localStorage.removeItem('SLG_DEATH_MARK');
        }
        // 💀 2. 如果收到封鎖指令，植入死刑印記
        else if (myData.triggerDeviceBan) {
            localStorage.setItem('SLG_DEATH_MARK', 'true');
        }

        // 3. 處理畫面顯示
        if (myData.isBanned) { 
            document.getElementById('ban-screen').style.display = 'flex'; 
            document.getElementById('ban-reason').innerText = myData.banReason || "違反遊戲規章"; 
            return; // 被封鎖者停止後續渲染
        } else { 
            document.getElementById('ban-screen').style.display = 'none'; 
        }

        isAdmin = (user.email === 'topacoau@gmail.com');
        document.getElementById('btn-tab-gm').style.display = isAdmin ? 'block' : 'none';

        updateFogOfWar();
        if (!hasCentered) { resizeCanvas(); centerCameraOn(myData.x, myData.y); hasCentered = true; }
        
        const isUnderAttack = myData.marches.some(m => m.type === 'defend_npc');
        document.getElementById('danger-overlay').style.display = isUnderAttack ? 'block' : 'none';
        try { window.renderSelf(); } catch(e) { }
      }
    });

    onSnapshot(doc(db, "world_map", "announcement"), (snap) => {
        if(snap.exists()) {
            currentAnnouncement = snap.data();
            if (myData && !myData.claimedAnnouncements.includes(currentAnnouncement.id)) {
                const b = document.getElementById('btn-tab-mail'); if(b) b.innerText = "📜 公告 🔴";
            }
            if(document.getElementById('tab-mail').classList.contains('active')) window.renderAnnouncement();
        }
    });

    const bossIds = ['BOSS_CORE'];
    for(let i=1; i<=4; i++) bossIds.push(`BOSS_MID_${i}`);
    for(let i=1; i<=10; i++) bossIds.push(`BOSS_OUTER_${i}`);

    bossIds.forEach(id => {
       onSnapshot(doc(db, "world_map", id), (snap) => {
          if (snap.exists()) {
             const idx = worldBosses.findIndex(b => b.id === id);
             if (idx >= 0) worldBosses[idx] = {id, ...snap.data()}; else worldBosses.push({id, ...snap.data()});
          } else { spawnWorldBoss(id); }
       });
    });

    await window.refreshMap();
    setInterval(localTick, 1000); requestAnimationFrame(renderLoop); setInterval(window.refreshMap, 60000);
  } else {
    document.getElementById("login-panel").style.display = "flex"; myUid = null; myData = null; isAdmin = false; document.getElementById('btn-tab-gm').style.display = 'none';
  }
});

window.renderAnnouncement = () => {
    const cont = document.getElementById('announcement-container'); 
    const mapBar = document.getElementById('map-announcement-bar');
    const mapText = document.getElementById('map-announcement-text');

    if (!currentAnnouncement) { 
        if(cont) cont.innerHTML = '<p style="color:#94a3b8; text-align:center;">目前沒有新公告。</p>'; 
        if(mapBar) mapBar.style.display = 'none';
        return; 
    }

    const a = currentAnnouncement;
    if (mapBar && mapText) {
        mapBar.style.display = 'block';
        mapText.innerText = a.text.replace(/\n/g, '  '); 
    }

    if (!cont) return;
    const isClaimed = myData.claimedAnnouncements && myData.claimedAnnouncements.includes(a.id);
    let rStr = [];
    if(a.wood) rStr.push(`🌲${formatCompact(a.wood)}`); 
    if(a.iron) rStr.push(`⛏️${formatCompact(a.iron)}`);
    if(a.food) rStr.push(`🌾${formatCompact(a.food)}`); 
    if(a.speed) rStr.push(`⚡1hx${a.speed}`);
    if(a.shield) rStr.push(`🛡️x${a.shield}`); 
    
    let btnHtml = '';
    if (rStr.length > 0) {
        if (isClaimed) btnHtml = `<button style="background:#475569; margin-top:10px; width:100%; border-radius:4px; padding:8px;" disabled>✅ 獎勵已領取</button>`;
        else btnHtml = `<button style="background:#10b981; margin-top:10px; width:100%; border-radius:4px; padding:8px; color:white; font-weight:bold;" onclick="window.claimAnnouncement('${a.id}')">🎁 領取全服補給</button>`;
    }
    cont.innerHTML = `<div style="background:#1e293b; padding:15px; border-radius:6px; border:1px solid #334155;"><div style="font-size:0.8rem; color:#94a3b8; margin-bottom:8px;">發布時間: ${new Date(a.timestamp).toLocaleString()}</div><div style="color:#fff; font-size:1rem; line-height:1.5; margin-bottom:12px; white-space:pre-wrap;">${a.text}</div>${rStr.length>0?`<div style="background:#0a0f1d; padding:8px; border-radius:4px; font-size:0.9rem; color:#38bdf8;">附贈物資：${rStr.join(' ')}</div>`:''}${btnHtml}</div>`;
};

window.claimAnnouncement = async (id) => {
    if (!currentAnnouncement || currentAnnouncement.id !== id || myData.claimedAnnouncements.includes(id)) return;
    const a = currentAnnouncement;
    if(a.wood) myData.wood += a.wood; 
    if(a.iron) myData.iron += a.iron; 
    if(a.food) myData.food += a.food; 
    if(a.speed) myData.items.speedup1h += a.speed;
    if(a.shield) myData.items.shieldCard += a.shield;
    
    myData.claimedAnnouncements.push(id); 
    myData.logs.unshift(`[系統] 成功領取全服公告補給！`);
    await savePrivateData();
    const btn = document.getElementById('btn-tab-mail'); if(btn) btn.innerText = "📜 公告";
    window.renderAnnouncement(); window.renderSelf();
};

window.gmSendAnnouncement = async () => {
    if (!isAdmin) return;
    const txt = document.getElementById('gm-announce-text').value.trim();
    if (!txt) return alert("請輸入公告內容！");
    const ann = { 
        id: 'ANN_' + Date.now(), 
        text: txt, 
        wood: parseInt(document.getElementById('gm-ann-wood').value)||0, 
        iron: parseInt(document.getElementById('gm-ann-iron').value)||0, 
        food: parseInt(document.getElementById('gm-ann-food').value)||0, 
        speed: parseInt(document.getElementById('gm-ann-speed').value)||0, 
        shield: parseInt(document.getElementById('gm-ann-shield').value)||0,
        timestamp: Date.now() 
    };
    await setDoc(doc(db, "world_map", "announcement"), ann); 
    alert("📢 全服公告與獎勵已發布！"); 
    document.getElementById('gm-announce-text').value = '';
};

window.addEventListener("beforeunload", () => { if (myUid && myData) savePrivateData(); });

window.selectGMTarget = (uid, name) => {
    const uidInput = document.getElementById('gm-target-uid');
    const nameLabel = document.getElementById('gm-selected-name');
    if (uidInput && nameLabel) {
        uidInput.value = uid; nameLabel.innerText = `${name} (UID: ${uid.slice(0,6)}...)`; nameLabel.style.color = '#10b981'; 
    }
};

window.gmAddRes = async (type, amount) => {
  if (!isAdmin) return;
  if (type === 'wood') myData.wood += amount; if (type === 'iron') myData.iron += amount; if (type === 'food') myData.food += amount;
  myData.logs.unshift(`[GM系統] 成功生成 ${amount} 單位物資！`);
  await savePrivateData(); try { window.renderSelf(); } catch(e){}
};

window.gmAddTroop = async (type, amount) => {
  if (!isAdmin) return;
  myData.troops[type] += amount;
  myData.logs.unshift(`[GM系統] 憑空徵召了 ${amount} 名部隊！`);
  await savePrivateData(); try{setDoc(doc(db, "world_map", myUid), { troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry }, { merge: true });}catch(e){}
  try { window.renderSelf(); } catch(e){}
};

window.gmRespawnBosses = () => {
  if (!isAdmin) return;
  const bossIds = ['BOSS_CORE'];
  for(let i=1; i<=4; i++) bossIds.push(`BOSS_MID_${i}`);
  for(let i=1; i<=10; i++) bossIds.push(`BOSS_OUTER_${i}`);
  bossIds.forEach(id => spawnWorldBoss(id)); 
  alert("已強制重生所有 世界 Boss！(已套用絕對淨空生成機制)");
};

window.gmClearQueues = async () => {
  if (!isAdmin) return;
  myData.buildQueues.forEach(q => q.finishesAt = Date.now());
  if(myData.researchQueue) myData.researchQueue.finishesAt = Date.now();
  if(myData.trainQueue) myData.trainQueue.finishesAt = Date.now();
  myData.logs.unshift(`[GM系統] 已動用時間魔法，所有隊列瞬間完成！`);
  await savePrivateData(); try { window.renderSelf(); } catch(e){}
};

window.gmTargetAction = async (action) => {
    if (!isAdmin) return;
    const targetUid = document.getElementById('gm-target-uid').value.trim();
    if (!targetUid) return alert("請先選取一名玩家！");
    const targetRef = doc(db, "players", targetUid);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) return alert("找不到該名玩家！");
    let tData = targetSnap.data();
    
    if (action === 'ban') { 
        tData.isBanned = true; 
        tData.banReason = "管理員手動永久封鎖"; 
        tData.triggerDeviceBan = true;  // 發送封鎖信號
        tData.clearDeviceBan = false; 
    }
    if (action === 'unban') { 
        tData.isBanned = false; 
        tData.banReason = ""; 
        tData.triggerDeviceBan = false; 
        tData.clearDeviceBan = true;    // 💡 核心：發送「遠端特赦」信號，要求玩家瀏覽器刪除黑名單印記
    }
    if (action === 'addRes') { tData.wood += 1000000; tData.iron += 1000000; tData.food += 1000000; }
    if (action === 'addTroops') { tData.troops.infantry += 100000; tData.troops.archer += 100000; tData.troops.cavalry += 100000; }
    if (action === 'addItems') { tData.items.shieldCard += 100; tData.items.speedup5m += 100; tData.items.speedup1h += 10; }
    if (action === 'clear') { tData.wood = 0; tData.iron = 0; tData.food = 0; tData.troops = {infantry:0, archer:0, cavalry:0}; }
    
    if (!Array.isArray(tData.logs)) tData.logs = [];
    tData.logs.unshift(`[系統警告] 管理員介入了您的帳號。`);
    await setDoc(targetRef, tData, {merge: true});
    
    if (action === 'addTroops' || action === 'clear') {
        const totalT = (tData.troops.infantry||0) + (tData.troops.archer||0) + (tData.troops.cavalry||0);
        await setDoc(doc(db, "world_map", targetUid), { troops: totalT }, {merge: true});
    }
    alert(`✅ 成功對玩家 ${tData.name} 執行操作！`); window.refreshMap();
};

window.gmExecuteCustom = async () => {
    if (!isAdmin) return;
    const targetUid = document.getElementById('gm-target-uid').value.trim();
    if (!targetUid) return alert("請先從下方列表選取玩家！");
    
    const field = document.getElementById('gm-custom-field').value.trim();
    const rawAmount = document.getElementById('gm-custom-amount').value;
    const amount = parseInt(rawAmount); // 嘗試轉換為數字
    
    const targetRef = doc(db, "players", targetUid);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) return alert("找不到該名玩家！");
    let tData = targetSnap.data();
    
    // 確保深層資料結構存在，避免報錯
    tData.troops = tData.troops || {};
    tData.items = tData.items || {};
    tData.buildings = tData.buildings || {};
    tData.research = tData.research || {};
    
    let updatedMap = false; // 是否需要同步更新世界地圖

    // 💡 1. 判斷並修改資源
    if (['wood', 'iron', 'food'].includes(field)) {
        if (isNaN(amount)) return alert("此欄位請輸入正確數字");
        tData[field] = amount;
    } 
    // 💡 2. 判斷並修改兵力
    else if (['infantry', 'archer', 'cavalry'].includes(field)) {
        if (isNaN(amount)) return alert("此欄位請輸入正確數字");
        tData.troops[field] = amount;
        updatedMap = true;
    } 
    // 💡 3. 判斷並修改所有背包道具
    else if (['speedup5m', 'speedup30m', 'speedup1h', 'shieldCard', 'renameCard', 'resourceCard'].includes(field)) {
        if (isNaN(amount)) return alert("此欄位請輸入正確數字");
        tData.items[field] = amount;
    } 
    // 💡 4. 判斷並修改「所有」建築等級 (自動比對 CFG 設定)
    else if (CFG.buildings[field] || field === 'castleLevel') {
        if (isNaN(amount)) return alert("此欄位請輸入正確數字");
        let bKey = field === 'castleLevel' ? 'castle' : field;
        tData.buildings[bKey] = amount;
        if (bKey === 'castle') updatedMap = true;
    } 
    // 💡 5. 判斷並修改「所有」科技等級 (自動比對 CFG 設定)
    else if (CFG.techs[field]) {
        if (isNaN(amount)) return alert("此欄位請輸入正確數字");
        tData.research[field] = amount;
    } 
    // 💡 6. 判斷並修改座標 (強制遷城)
    else if (field === 'x' || field === 'y') {
        if (isNaN(amount)) return alert("此欄位請輸入正確數字");
        tData[field] = amount;
        updatedMap = true;
    }
    // 💡 7. 判斷並強制修改/踢出聯盟 (支援文字輸入)
    else if (field === 'allianceName') {
        tData.allianceName = rawAmount === 'null' || rawAmount === '' ? null : rawAmount;
        updatedMap = true;
    } 
    else {
        return alert("未知的欄位名稱：" + field);
    }
    
    // 寫入系統日誌
    tData.logs = tData.logs || []; 
    tData.logs.unshift(`[GM系統] 您的【${field}】資料已被管理員手動修正。`);
    await setDoc(targetRef, tData, { merge: true });
    
    // 💡 8. 如果修改的內容會影響世界地圖，同步更新！
    if (updatedMap) {
        let mapUpdate = {};
        if (['infantry', 'archer', 'cavalry'].includes(field)) {
            mapUpdate.troops = (tData.troops.infantry||0) + (tData.troops.archer||0) + (tData.troops.cavalry||0);
        }
        if (field === 'castleLevel' || field === 'castle') mapUpdate.castleLevel = amount;
        if (field === 'allianceName') mapUpdate.allianceName = tData.allianceName;
        if (field === 'x') mapUpdate.x = amount;
        if (field === 'y') mapUpdate.y = amount;
        await setDoc(doc(db, "world_map", targetUid), mapUpdate, { merge: true });
    }
    
    alert(`✅ 已成功將玩家 ${tData.name} 的 [${field}] 修改為：${rawAmount}`);
};
window.gmAuditPlayer = async () => {
    if (!isAdmin) return;
    const targetUid = document.getElementById('gm-target-uid').value.trim();
    if(!targetUid) return alert("請先選取要審計的玩家！");
    const snap = await getDoc(doc(db, "players", targetUid));
    if(!snap.exists()) return alert("找不到玩家");
    const d = snap.data();
    
    let report = `📊【${d.name}】數據審計報告\n狀態：${d.isBanned ? '🔴 已封鎖 (' + d.banReason + ')' : '🟢 正常'}\n\n--- 當前數值檢測 ---\n`;
    let isSus = false;
    if(d.wood > 50000000) { report += `⚠️ 木材異常高: ${formatCompact(d.wood)}\n`; isSus = true; }
    if(d.iron > 50000000) { report += `⚠️ 鐵礦異常高: ${formatCompact(d.iron)}\n`; isSus = true; }
    if(d.food > 50000000) { report += `⚠️ 糧草異常高: ${formatCompact(d.food)}\n`; isSus = true; }
    if(d.troops && (d.troops.infantry > 5000000 || d.troops.archer > 5000000 || d.troops.cavalry > 5000000)) { report += `⚠ 兵力數量異常！\n`; isSus = true; }
    if(d.items && (d.items.speedup1h > 10000 || d.items.shieldCard > 10000)) { report += `⚠️ 道具數量異常！\n`; isSus = true; }
    if(!isSus) report += `✅ 當前數值無明顯異常\n`;
    report += `\n--- 外掛查緝紀錄 ---\n`;
    if (d.cheatLog && d.cheatLog.length > 0) { d.cheatLog.slice(0, 5).forEach(log => report += log + '\n'); } else { report += `無違規紀錄。\n`; }
    alert(report);
}

function resizeCanvas() {
  const frame = document.getElementById('map-frame');
  if(frame && canvas) { canvas.width = frame.clientWidth; canvas.height = frame.clientHeight; clampCamera(); }
}
window.addEventListener('resize', resizeCanvas);

function updateFogOfWar() {
  if (!myData) return;
  for (let x=0; x<WORLD_COLS; x++) exploredTiles[x].fill(false);
  
  if (godModeFog) { 
      for (let x=0; x<WORLD_COLS; x++) exploredTiles[x].fill(true); 
      return; 
  }
  
  const r = BASE_VISION_RADIUS + currentVisionBonus;
  const minX = Math.max(0, myData.x - r), maxX = Math.min(WORLD_COLS - 1, myData.x + r);
  const minY = Math.max(0, myData.y - r), maxY = Math.min(WORLD_ROWS - 1, myData.y + r);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (Math.hypot(x - myData.x, y - myData.y) <= r) exploredTiles[x][y] = true;
    }
  }
}

function clampCamera() {
  camX = Math.max(0, Math.min(camX, WORLD_COLS * TILE_SIZE - canvas.width / zoom)); 
  camY = Math.max(0, Math.min(camY, WORLD_ROWS * TILE_SIZE - canvas.height / zoom));
}
function centerCameraOn(tx, ty) {
  camX = (tx * TILE_SIZE + TILE_SIZE / 2) - (canvas.width / zoom) / 2;
  camY = (ty * TILE_SIZE + TILE_SIZE / 2) - (canvas.height / zoom) / 2;
  clampCamera();
}

async function savePrivateData() { 
    if (!myData || myData.isBanned) return;
    if (runAntiCheat()) return; 
    myData.lastTick = Date.now(); 
    try { 
        const cleanData = JSON.parse(JSON.stringify(myData));
        await setDoc(doc(db, "players", myUid), cleanData, { merge: true }); 
    } catch(e) {}
}

window.refreshMap = async function() {
  const snap = await getDocs(collection(db, "world_map"));
  allCastles = []; worldNodes = [];
  snap.forEach(d => { 
      const data = d.data();
      if(d.id === 'announcement') return;
      if(!data.isBoss && !data.isNode) allCastles.push({ id: d.id, ...data });
      if(data.isNode) worldNodes.push({ id: d.id, ...data });
  });
  if (document.getElementById('tab-radar').classList.contains('active')) renderRadar();
  if (isAdmin && document.getElementById('tab-gm').classList.contains('active')) renderGMPlayers();
};

function renderRadar() {
  if (!myData) return;
  const bContainer = document.getElementById('radar-boss-container');
  if (bContainer) {
      const bSorted = [...worldBosses].map(b => { b.dist = Math.hypot(b.x - myData.x, b.y - myData.y); return b; }).filter(b => b.hp > 0).sort((a,b) => a.dist - b.dist).slice(0, 5);
      if (bSorted.length === 0) { bContainer.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem;">目前世界和平，無首領肆虐。</p>'; }
      else {
        bContainer.innerHTML = bSorted.map(b => `
          <div style="background:#2e1065; border:1px solid #7c3aed; border-radius:6px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                  <strong style="color:#d946ef; font-size:1.05rem;">${b.name}</strong> <span style="color:#f87171; font-size:0.8rem;">(HP: ${Math.floor((b.hp/b.maxHp)*100)}%)</span><br>
                  <span style="font-size:0.8rem; color:#cbd5e1;">座標: (${b.x}, ${b.y}) | 距離: ${Math.ceil(b.dist)} 格</span>
              </div>
              <button onclick="window.locatePlayer(${b.x}, ${b.y})" style="background:#dc2626; padding:6px 12px; font-size:0.8rem;">📍 鎖定</button>
          </div>
        `).join('');
      }
  }

  const pContainer = document.getElementById('radar-players-container');
  if (pContainer) {
      const pSorted = [...allCastles].map(p => { p.dist = Math.hypot(p.x - myData.x, p.y - myData.y); return p; }).filter(p => p.id !== myUid).sort((a,b) => a.dist - b.dist).slice(0, 5);
      if (pSorted.length === 0) { pContainer.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem;">附近暫無其他勢力。</p>'; }
      else {
        pContainer.innerHTML = pSorted.map(p => {
          const isShielded = p.shieldEndsAt && p.shieldEndsAt > Date.now();
          return `
          <div style="background:#0a0f1d; border:1px solid #1e2c40; border-radius:6px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                  <strong style="color:#fff; font-size:1.05rem;">${p.name}</strong> <span style="color:#94a3b8; font-size:0.85rem;">(Lv.${p.castleLevel || 1})</span> ${isShielded?'<span style="color:#06b6d4; font-size:0.8rem;">[🛡️護盾中]</span>':''}<br>
                  <span style="font-size:0.8rem; color:#94a3b8;">座標: (${p.x}, ${p.y}) | 距離: ${Math.ceil(p.dist)} 格</span>
              </div>
              <button onclick="window.locatePlayer(${p.x}, ${p.y})" style="background:#0ea5e9; padding:6px 12px; font-size:0.8rem;">📍 偵查</button>
          </div>
        `}).join('');
      }
  }
}

function renderGMPlayers() {
  if(!isAdmin) return;
  const container = document.getElementById('gm-players-container');
  if (!container) return;
  
  const sorted = [...allCastles].filter(p => p.id !== myUid).sort((a,b) => (b.castleLevel||1) - (a.castleLevel||1));
  
  container.innerHTML = sorted.map(p => {
     const isShielded = p.shieldEndsAt && p.shieldEndsAt > Date.now();
     // 💡 新增：檢查該玩家是否擁有有效的 VIP
     const isVip = p.vip && p.vip.isActive && p.vip.expiresAt > Date.now();

     return `
      <div style="background:#1e293b; border:1px solid #334155; border-radius:6px; padding:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="window.selectGMTarget('${p.id}', '${p.name}')">
          <div style="pointer-events:none;">
              <strong style="color:#fff; font-size:0.95rem;">${p.name}</strong> 
              <span style="color:#fbbf24; font-size:0.85rem;">(Lv.${p.castleLevel || 1})</span> 
              ${isShielded ? '<span style="color:#06b6d4; font-size:0.75rem;">[🛡️]</span>' : ''}
              ${isVip ? '<span style="color:#facc15; font-size:0.8rem; font-weight:bold;">[👑 VIP]</span>' : ''}<br>
              <span style="font-size:0.75rem; color:#94a3b8;">ID: ${p.id.slice(0,6)}... | 座標: (${p.x}, ${p.y})</span>
          </div>
          <!-- 💡 將右側改為 Flex 容器，並排放置「尋找」與「發放 VIP」按鈕 -->
          <div style="display:flex; gap:6px;">
              <button onclick="event.stopPropagation(); window.locatePlayer(${p.x}, ${p.y})" style="background:#8b5cf6; padding:6px 10px; font-size:0.8rem; border-radius:4px; border:none; color:#fff;">📍 尋找</button>
              
              <!-- 呼叫我們寫好的 adminSetVIP 函數，並防止冒泡點擊 -->
              <button onclick="event.stopPropagation(); window.adminSetVIP('${p.id}', 30)" style="background: linear-gradient(to right, #f59e0b, #eab308); color:#000; padding:6px 10px; font-size:0.8rem; font-weight:bold; border-radius:4px; border:none;">發放 VIP</button>
          </div>
      </div>
    `}).join('');
}

window.locatePlayer = (x, y) => { window.switchTab('world'); centerCameraOn(x, y); };

// ==========================================
// 💡 遊戲主心跳 (行軍、採集、升級結算與離線報告)
// ==========================================
async function localTick() {
  if (!myData || myData.isBanned) return;
  sanitizeData(); 
  
  const now = Date.now(), dt = (now - myData.lastTick) / 1000; myData.lastTick = now;

  // 💡 【新增】離線進度報告 (若玩家離開超過 5 分鐘 / 300秒)
  if (dt > 300) {
      const upkeepPerSec = (myData.troops.infantry*CFG.troops.infantry.upkeep + myData.troops.archer*CFG.troops.archer.upkeep + myData.troops.cavalry*CFG.troops.cavalry.upkeep) / 3600;
      const farmProdPerSec = CFG.buildings.farm.rate * myData.buildings.farm;
      
      const pW = Math.floor(dt * (CFG.buildings.lumber.rate * myData.buildings.lumber));
      const pI = Math.floor(dt * (CFG.buildings.mine.rate * myData.buildings.mine));
      const pF = Math.floor(dt * farmProdPerSec);
      const cF = Math.floor(dt * upkeepPerSec);
      
      let logMsg = `📴 [離線報告] 歡迎歸來！您離開了 ${formatTime(Math.floor(dt))}。領地產出: 🌲${formatCompact(pW)} ⛏️${formatCompact(pI)}`;
      if (pF >= cF) {
          logMsg += ` 🌾+${formatCompact(pF - cF)} (扣除部隊消耗)`;
      } else {
          logMsg += ` 🌾-${formatCompact(cF - pF)} (糧草入不敷出)`;
      }
      
      myData.logs.unshift(logMsg);
  }
  
  if (typeof window.renderMarchHUD === 'function') {
      window.renderMarchHUD();
    // 顯示左側任務與戰報按鈕
    if (typeof window.renderSideMenu === 'function') window.renderSideMenu();
  }

  let cleanedMarches = [];
  let marchesChanged = false;

  for (let m of myData.marches) {
      if (m.type === 'attack_player' && now >= m.finishesAt) {
          const tC = allCastles.find(c => (c.id === m.targetUid || c.id === m.id));
          if (tC && tC.shieldEndsAt && tC.shieldEndsAt > now) {
              myData.logs.unshift(`🛡️ [戰報] 目標【${tC.name}】已開啟護盾，部隊無法攻擊，自動折返！`);
              m.type = 'return'; m.startX = m.targetX; m.startY = m.targetY;
              m.targetX = myData.x; m.targetY = myData.y; m.startTime = now;
              marchesChanged = true;
          }
      }
      
      if (m.type === 'return' && !m.timeFixed) {
          const dist = Math.hypot(myData.x - m.startX, myData.y - m.startY);
          m.finishesAt = m.startTime + Math.ceil(dist * 3 * 1000); 
          m.timeFixed = true;
          marchesChanged = true;
      }

      if (m.type === 'return' && now >= m.finishesAt) {
          if (m.troops) {
              myData.troops.infantry = (myData.troops.infantry || 0) + (m.troops.infantry || 0);
              myData.troops.archer = (myData.troops.archer || 0) + (m.troops.archer || 0);
              myData.troops.cavalry = (myData.troops.cavalry || 0) + (m.troops.cavalry || 0);
          }
          if (m.loot && (m.loot.wood > 0 || m.loot.iron > 0 || m.loot.food > 0 || m.loot.speedup1h > 0 || m.loot.speedup30m > 0 || m.loot.speedup5m > 0 || m.loot.resourceCard > 0)) {
              myData.wood += (m.loot.wood || 0);
              // 累積採集任務
              if (myData.quests) myData.quests.daily.gather_wood += (m.loot.wood || 0);
              myData.iron += (m.loot.iron || 0);
              myData.food += (m.loot.food || 0);
              if (m.loot.speedup5m) myData.items.speedup5m += m.loot.speedup5m;
              if (m.loot.speedup30m) myData.items.speedup30m += m.loot.speedup30m;
              if (m.loot.speedup1h) myData.items.speedup1h += m.loot.speedup1h;
              if (m.loot.resourceCard) myData.items.resourceCard += m.loot.resourceCard;

              let lootStr = `木:${formatCompact(m.loot.wood||0)} 鐵:${formatCompact(m.loot.iron||0)} 糧:${formatCompact(m.loot.food||0)}`;
              if (m.loot.speedup1h) lootStr += ` | ⚡1hx${m.loot.speedup1h}`;
              else if (m.loot.speedup30m) lootStr += ` | ⚡30mx${m.loot.speedup30m}`;
              else if (m.loot.speedup5m) lootStr += ` | ⚡5mx${m.loot.speedup5m}`;
              if (m.loot.resourceCard) lootStr += ` | 📦x${m.loot.resourceCard}`;

              myData.logs.unshift(`⛺ [部隊返鄉] 滿載而歸！帶回戰利品: ${lootStr}`);
          } else {
              myData.logs.unshift(`⛺ [部隊返鄉] 您的遠征軍已安全返回主城。`);
          }
          marchesChanged = true;
          try{ setDoc(doc(db, "world_map", myUid), { troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry }, { merge: true }); }catch(e){}
          continue; 
      }
      cleanedMarches.push(m);
  }
  
  if (myData.marches.length !== cleanedMarches.length) {
      myData.marches = cleanedMarches;
      marchesChanged = true;
  }
  if (marchesChanged) savePrivateData();

  const upkeepPerSec = (myData.troops.infantry*CFG.troops.infantry.upkeep + myData.troops.archer*CFG.troops.archer.upkeep + myData.troops.cavalry*CFG.troops.cavalry.upkeep) / 3600;
  const farmProdPerSec = CFG.buildings.farm.rate * myData.buildings.farm;
  
  myData.wood += dt * (CFG.buildings.lumber.rate * myData.buildings.lumber);
  myData.iron += dt * (CFG.buildings.mine.rate * myData.buildings.mine);
  myData.food += dt * farmProdPerSec - dt * upkeepPerSec;
  if (myData.food < 0) myData.food = 0;

  let needSave = false;
  
  for (let m of myData.marches) {
      if (m.type === 'gathering' && !m.npcWarned) {
          let nearLm = epicLandmarks.find(lm => Math.hypot(m.targetX - lm.x, m.targetY - lm.y) <= 12);
          if (nearLm && Math.random() < 0.02) { 
              m.npcWarned = true; 
              myData.marches.push({
                  id: 'NPC_ATK_' + Date.now(), type: 'npc_attack_node',
                  startX: nearLm.x, startY: nearLm.y, targetX: m.targetX, targetY: m.targetY,
                  startTime: now, finishesAt: now + 12000, 
                  npcName: nearLm.name, pwr: 15000 
              });
              myData.logs.unshift(`🚨 [領地警告] 您的採集部隊驚動了 ${nearLm.name}，NPC 守軍正前往發出警告！`);
              needSave = true;
          }
      }
  }
  
  let newCleared = [];
  for (let poi of myData.clearedPOI) {
    const parts = poi.split(',');
    if (parts.length >= 4) {
      const cTime = parseInt(parts[2]);
      if (now - cTime > 15 * 60 * 1000) continue; 
    }
    newCleared.push(poi);
  }
  if (newCleared.length !== myData.clearedPOI.length) { myData.clearedPOI = newCleared; needSave = true; }

  let newBuildQueues = [];
  for (let q of myData.buildQueues) {
    if (now >= q.finishesAt) {
      if(CFG.buildings[q.target]) {
         myData.buildings[q.target]++;
          // 累積建築升級任務
          if (myData.quests) myData.quests.daily.upgrades++;
         myData.logs.unshift(`[建造就緒] ${CFG.buildings[q.target].name} 升級至 Lv.${myData.buildings[q.target]}`);
         try{ setDoc(doc(db, "world_map", myUid), { castleLevel: myData.buildings.castle }, { merge: true }); }catch(e){}
      }
      needSave = true;
    } else { newBuildQueues.push(q); }
  }
  if (myData.buildQueues.length !== newBuildQueues.length) { myData.buildQueues = newBuildQueues; needSave = true; }

  if (myData.researchQueue && now >= myData.researchQueue.finishesAt) {
    if(CFG.techs[myData.researchQueue.target]) {
       myData.research[myData.researchQueue.target]++;
       myData.logs.unshift(`[科技突破] ${CFG.techs[myData.researchQueue.target].name} 升級至 Lv.${myData.research[myData.researchQueue.target]}`);
    }
    myData.researchQueue = null; needSave = true;
  }

  if (myData.trainQueue && now >= myData.trainQueue.finishesAt) {
    if(CFG.troops[myData.trainQueue.type]) {
       myData.troops[myData.trainQueue.type] += myData.trainQueue.count;
       myData.logs.unshift(`[徵兵就緒] ${myData.trainQueue.count} 名${CFG.troops[myData.trainQueue.type].name}入列`);
    }
    myData.trainQueue = null; needSave = true; 
    try{ setDoc(doc(db, "world_map", myUid), { troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry }, { merge: true }); }catch(e){}
  }

  worldBosses.forEach(boss => {
     if (boss.hp <= 0 && boss.contributors && boss.contributors[myUid]) {
         const claimId = `${boss.id}_${boss.spawnId}`;
         if (!myData.claimedBosses.includes(claimId)) {
             const myDmg = boss.contributors[myUid];
             const lW = myDmg * boss.mult; const lI = myDmg * boss.mult; const lF = myDmg * boss.mult;
             const s5 = Math.floor(myDmg / (2000/boss.mult));
             const s30 = boss.mult >= 5 ? Math.floor(myDmg / (10000/boss.mult)) : 0;
             const s1h = boss.mult >= 10 ? Math.floor(myDmg / (20000/boss.mult)) : 0;

             myData.wood += lW; myData.iron += lI; myData.food += lF;
             myData.items.speedup5m += s5; myData.items.speedup30m += s30; myData.items.speedup1h += s1h;
             myData.claimedBosses.push(claimId);

             let lootStr = `木:${formatCompact(lW)} 鐵:${formatCompact(lI)} 糧:${formatCompact(lF)}`;
             if (s1h) lootStr += ` | ⚡1hx${s1h}`; else if (s30) lootStr += ` | ⚡30mx${s30}`; else if (s5) lootStr += ` | ⚡5mx${s5}`;
             myData.logs.unshift(`🏆 [首領討伐成功] ${boss.name} 被擊殺！貢獻度 ${myDmg}，分得戰利品: ${lootStr}`);
             needSave = true;
         }
     }
     if (now > boss.despawnAt) { if (Math.random() < 0.05) spawnWorldBoss(boss.id); }
  });

  // 💡 野外勢力隨機攻城系統 (每秒 0.5% 機率觸發，約每 3 分鐘偵測一次)
  if (Math.random() < 0.005) {
    if (!myData.shieldEndsAt || myData.shieldEndsAt <= now) { 
      let nearestNPC = null, minDist = 15;
      
      // 掃描玩家周圍 15 格，尋找是否有任何 NPC 據點或外圍營地
      for(let tx = Math.max(0, myData.x - 15); tx <= Math.min(WORLD_COLS-1, myData.x + 15); tx++) {
        for(let ty = Math.max(0, myData.y - 15); ty <= Math.min(WORLD_ROWS-1, myData.y + 15); ty++) {
          const cell = MAP_CACHE[tx] && MAP_CACHE[tx][ty];
          // 如果發現 npc 開頭的實體 (包含剛加入的 npc_outpost)，且還沒被玩家通關摧毀
          if (cell && cell.entity && (cell.entity.type.startsWith('npc_')) && !getClearedPOI(tx, ty)) {
            const dist = Math.hypot(tx - myData.x, ty - myData.y);
            if (dist < minDist) { minDist = dist; nearestNPC = {x: tx, y: ty, ent: cell.entity}; }
          }
        }
      }
      
      // 如果附近有外圍營地，而且目前沒有「正在抵禦該營地」的隊列，就發動攻擊！
      if (nearestNPC && !myData.marches.some(m => m.type === 'defend_npc' && m.startX === nearestNPC.x && m.startY === nearestNPC.y)) {
        const timeMs = Math.ceil(minDist * 4 * 1000); 
        // 💡 敵軍強度會根據玩家的「主城等級」動態微調，確保有一點威脅感但不會秒殺新手
        const enemyPwr = Math.floor(200 + myData.buildings.castle * 250);
        
        myData.marches.push({
          id: 'M'+Date.now(), type: 'defend_npc', startX: nearestNPC.x, startY: nearestNPC.y, targetX: myData.x, targetY: myData.y,
          startTime: Date.now(), finishesAt: Date.now() + timeMs, npcPower: enemyPwr, npcName: nearestNPC.ent.name
        });
        
        // 觸發紅色警告日誌與戰報
        myData.logs.unshift(`🚨 [警報] 【${nearestNPC.ent.name}】的劫掠部隊正朝我方進軍！預計 ${formatTime(Math.ceil(timeMs/1000))} 抵達！`);
        if(window.addReport) {
            window.addReport(`🚨 敵襲警報`, `發現來自【${nearestNPC.ent.name}】的敵軍正朝主城進發！\n預估敵軍戰力：${formatCompact(enemyPwr)}\n\n(💡 請盡快招募士兵防禦，或在內政面板使用和平護盾！)`, false);
        }
        needSave = true;
      }
    }
  }

  let newMarches = [];
  for (let m of myData.marches) {
    if (now >= m.finishesAt && m.type !== 'gathering') {
      if (m.type === 'npc_attack_node') {
          let gMarchIdx = myData.marches.findIndex(mx => mx.type === 'gathering' && mx.targetX === m.targetX && mx.targetY === m.targetY);
          if (gMarchIdx !== -1) {
              let gMarch = myData.marches[gMarchIdx];
              let pwr = getPwrByTech(gMarch.troops, myData.research);
              if (pwr >= m.pwr) {
                  myData.logs.unshift(`⚔ [採集防衛] 成功擊退 ${m.npcName} 的驅逐軍！部隊可繼續安心採集。`);
              } else {
                  myData.marches[gMarchIdx].troops.infantry = Math.floor(gMarch.troops.infantry * 0.9); 
                  myData.logs.unshift(`☠️ [驅逐警告] 您遭到 ${m.npcName} 襲擊，損失少量兵力！請斟酌是否繼續採集。`);
              }
          }
          needSave = true; continue; 
      }
      else if (m.type === 'attack_player') { 
            const res = await resolveAttackPlayer_NEW(m); // 👈 這裡加上 _NEW
            if (res.survived) newMarches.push(createReturnMarch(m, res.troops, res.loot)); 
        }
      else if (m.type === 'attack_boss') { const res = await resolveAttackBoss(m); if (res.survived) newMarches.push(createReturnMarch(m, res.troops, res.loot)); }
      else if (m.type === 'defend_npc') { await resolveDefendNPC(m); }
      else if (m.type === 'occupy_node') { 
          const res = await resolveOccupyNode(m);
          if (res.isGathering) {
              m.type = 'gathering'; m.startTime = Date.now(); m.finishesAt = Date.now() + 3600 * 1000;
              m.capacity = res.cap; m.resType = res.resType;
              newMarches.push(m);
          } else if (res.survived) { newMarches.push(createReturnMarch(m, res.troops, res.loot)); }
      }
      else { 
          const res = await resolveInteractNPC(m); 
          if (res.survived) newMarches.push(createReturnMarch(m, res.troops, res.loot)); 
          
          // 💡 完美接住回傳的「復仇軍團」，讓它正式出現在地圖與 HUD 上！
          if (res.counterMarch) newMarches.push(res.counterMarch);
      }
      needSave = true;
    } 
    else if (m.type === 'gathering') {
      if (now >= m.finishesAt) {
          m.type = 'return'; m.loot = { wood:0, iron:0, food:0 }; m.loot[m.resType] = m.capacity;
          m.finishesAt = now + (now - m.startTime); 
          try { deleteDoc(doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`)); }catch(e){}
          myData.logs.unshift(`[採集完成] 駐紮部隊滿載而歸！`);
          newMarches.push(m);
          needSave = true;
      } else {
          newMarches.push(m);
          if (Math.floor(now/1000) % 10 === 0) {
              getDoc(doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`)).then(snap => {
                  if (snap.exists() && snap.data().uid !== myUid) {
                      const idx = myData.marches.findIndex(x => x.id === m.id);
                      if (idx !== -1) {
                          myData.marches[idx].type = 'return';
                          myData.marches[idx].loot = { wood:0, iron:0, food:0 };
                          myData.marches[idx].troops.infantry = Math.floor(myData.marches[idx].troops.infantry * 0.3);
                          myData.marches[idx].finishesAt = Date.now() + (Date.now() - myData.marches[idx].startTime);
                          myData.logs.unshift(`🚨 [資源爭奪] 您在 (${m.targetX}, ${m.targetY}) 的部隊遭到敵軍擊敗，已撤退！`);
                          savePrivateData();
                      }
                  }
              });
          }
      }
    }
    else { newMarches.push(m); }
  }
  
  if (needSave) { myData.marches = newMarches; await savePrivateData(); }
  
  if (typeof worldNodes !== 'undefined') {
      worldNodes.forEach(n => {
          if (n.uid === 'NPC' && typeof deleteDoc !== 'undefined') {
              try { deleteDoc(doc(db, "world_map", `NODE_${n.x}_${n.y}`)); } catch(e){}
          }
      });
  }

  try { window.renderSelf(); } catch(e){}
}

function createReturnMarch(oldMarch, survivedTroops, loot) {
  return { id: 'R'+Date.now(), type: 'return', startX: oldMarch.targetX, startY: oldMarch.targetY, targetX: oldMarch.startX, targetY: oldMarch.startY, startTime: Date.now(), finishesAt: Date.now() + (oldMarch.finishesAt - oldMarch.startTime), troops: survivedTroops, loot: loot || {} };
}

function getPwrByTech(troops, tech) {
  return (troops.infantry||0) * (CFG.troops.infantry.pwr + (tech.infantry_atk||0)) +
         (troops.archer||0) * (CFG.troops.archer.pwr + (tech.archer_atk||0)) +
         (troops.cavalry||0) * (CFG.troops.cavalry.pwr + (tech.cavalry_atk||0));
}

// ==========================================
// 💡 據點佔領結算系統 (修復 1 兵佔領 Bug)
// ==========================================
async function resolveOccupyNode(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0}, isGathering: false, cap: m.entity.cap, resType: m.entity.res };
  try {
    await runTransaction(db, async (transaction) => {
      const nodeRef = doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`);
      const snap = await transaction.get(nodeRef);
      let defender = snap.exists() ? snap.data() : null;
      
      // 我方真實戰力
      const attPwr = getPwrByTech(m.troops, m.techs || myData.research);
      
      if (defender && defender.uid !== myUid) {
          // 🆚 玩家對抗玩家 (PVP 爭奪資源點)
          const defPwr = getPwrByTech(defender.troops, defender.techs || {});
          if (attPwr > defPwr) {
              transaction.set(nodeRef, { isNode: true, uid: myUid, name: myData.name, troops: m.troops, techs: m.techs, x: m.targetX, y: m.targetY, type: m.entity.type });
              res.isGathering = true;
              myData.logs.unshift(`[佔領成功] 擊退了敵方佔領軍！部隊開始採集資源。`);
              if(window.addReport) window.addReport(`⚔️️ 掠奪資源點`, `成功擊敗敵方部隊並佔據資源點！`, true);
          } else {
              res.survived = false; // 戰敗全滅
              res.troops = {infantry:0, archer:0, cavalry:0};
              myData.logs.unshift(`[佔領失敗] 遭遇強大的敵軍防守，我方部隊全數陣亡！`);
              if(window.addReport) window.addReport(`☠️ 資源點爭奪失敗`, `力量懸殊，出征部隊已全數陣亡！`, false);
          }
      } else {
          // ⚔️ 對抗野生守軍 (PVE 戰鬥判定)
          const reqPwr = m.entity.reqPwr || 100; // 取得該資源點的戰力要求
          
          // 💡 關鍵修復：檢查我方戰力是否大於等於守軍
          if (attPwr >= reqPwr) {
              // ✅ 戰鬥勝利，計算輕微戰損 (戰力越碾壓，死越少兵)
              let lossRate = reqPwr > 0 ? (reqPwr / (attPwr + 1)) * 0.1 : 0; 
              res.troops.infantry = Math.max(0, m.troops.infantry - Math.floor(m.troops.infantry * lossRate));
              res.troops.archer = Math.max(0, m.troops.archer - Math.floor(m.troops.archer * lossRate));
              res.troops.cavalry = Math.max(0, m.troops.cavalry - Math.floor(m.troops.cavalry * lossRate));

              transaction.set(nodeRef, { isNode: true, uid: myUid, name: myData.name, troops: res.troops, techs: m.techs, x: m.targetX, y: m.targetY, type: m.entity.type });
              res.isGathering = true;
              myData.logs.unshift(`[抵達據點] 擊退野生守軍，部隊已駐紮並開始採集資源。`);
          } else {
              // ❌ 戰鬥失敗 (1兵流會直接死在這裡)
              res.survived = false;
              res.troops = {infantry:0, archer:0, cavalry:0}; // 部隊全軍覆沒
              myData.logs.unshift(`[佔領慘敗] 戰力不足以擊敗野生守軍，部隊全軍覆沒！`);
              if(window.addReport) window.addReport(`☠️ 佔領失敗`, `資源點守備戰力高達 ${formatCompact(reqPwr)}，我方戰鬥力 ${formatCompact(attPwr)} 不敵，全軍覆沒！`, false);
          }
      }
    });
    if (res.isGathering) window.refreshMap();
  } catch (e) { console.error(e); }
  return res;
}
// ==========================================
// 💡 世界 Boss 攻擊與傷害結算系統
// ==========================================
async function resolveAttackBoss(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0} };
  try {
    await runTransaction(db, async (transaction) => {
      const bossRef = doc(db, "world_map", m.targetUid);
      const bossSnap = await transaction.get(bossRef);
      if (!bossSnap.exists()) throw new Error("BossNotExist");
      
      let bossData = bossSnap.data();
      if (bossData.hp <= 0) throw new Error("BossDead");

      // 1. 計算我方部隊的總攻擊力
      const attPwr = getPwrByTech(m.troops, m.techs || myData.research);
      
      // 2. 造成傷害 (加上 90%~110% 的傷害浮動，更有真實感)
      let dmg = Math.floor(attPwr * (Math.random() * 0.2 + 0.9)); 
      if (dmg > bossData.hp) dmg = bossData.hp; // 不能超過殘血
      
      // 3. 扣除 Boss 血量，並記錄你的貢獻度 (打多少痛多少)
      bossData.hp -= dmg;
      bossData.contributors = bossData.contributors || {};
      bossData.contributors[myUid] = (bossData.contributors[myUid] || 0) + dmg;

      // 將傷害寫入雲端同步給所有玩家
      transaction.set(bossRef, bossData, { merge: true });

      // 4. 計算玩家戰損 (與史詩巨獸戰鬥，損失約 2% ~ 5% 的兵力)
      const lossRate = 0.02 + Math.random() * 0.03;
      res.troops.infantry = Math.floor(res.troops.infantry * (1 - lossRate));
      res.troops.archer = Math.floor(res.troops.archer * (1 - lossRate));
      res.troops.cavalry = Math.floor(res.troops.cavalry * (1 - lossRate));

      // 5. 寫入日誌與戰報信箱
      myData.logs.unshift(`[首領戰] 對 ${m.targetName} 造成了 ${formatCompact(dmg)} 點傷害！`);
      if(window.addReport) {
          window.addReport(`⚔️ 首領討伐戰報`, `部隊成功襲擊了【${m.targetName}】！\n造成傷害：💥 ${formatCompact(dmg)}\n戰鬥損失：約 ${Math.floor(lossRate*100)}% 兵力受傷陣亡。\n\n(💡 最終擊殺獎勵將於首領倒下時，系統會依據您的總貢獻度自動發放！)`, true);
      }
    });
    window.refreshMap();
  } catch (err) {
    res.survived = true;
    if (err.message === "BossDead") {
        myData.logs.unshift(`[撲空] ${m.targetName} 已經被擊殺，部隊折返。`);
        if(window.addReport) window.addReport(`💨 討伐撲空`, `目標【${m.targetName}】已經被其他領主搶先擊殺，部隊無功而返。`, false);
    } else {
        myData.logs.unshift(`[錯誤] 尋找 ${m.targetName} 失敗，部隊折返。`);
    }
  }
  return res;
}

async function resolveDefendNPC(m) {
  const wallBuff = 1 + (myData.buildings.wall || 0) * 0.05;
  const defPwr = getPwrByTech(myData.troops, myData.research) * wallBuff;
  
  if (defPwr >= m.npcPower) {
    const lossRatio = m.npcPower / (defPwr + 1);
    myData.troops.infantry -= Math.floor(myData.troops.infantry * lossRatio * 0.3); myData.troops.archer -= Math.floor(myData.troops.archer * lossRatio * 0.3); myData.troops.cavalry -= Math.floor(myData.troops.cavalry * lossRatio * 0.3);
    myData.wood += 200; myData.iron += 200; myData.food += 200;
    myData.logs.unshift(`[守城大捷] 成功擊退 ${m.npcName}！`);
    if(window.addReport) window.addReport(`🛡️ 守城大捷`, `成功擊退【${m.npcName}】的進攻！\n敵軍已全軍覆沒，城池安然無恙。`, true);
  } else {
    myData.troops.infantry = 0; myData.troops.archer = 0; myData.troops.cavalry = 0;
    const protectAmt = (myData.buildings.warehouse || 0) * 2000;
    const lW = Math.max(0, Math.floor((myData.wood - protectAmt) * 0.3));
    const lI = Math.max(0, Math.floor((myData.iron - protectAmt) * 0.3));
    const lF = Math.max(0, Math.floor((myData.food - protectAmt) * 0.3));
    myData.wood -= lW; myData.iron -= lI; myData.food -= lF;
    const bKeys = Object.keys(myData.buildings).filter(k => myData.buildings[k] > 1);
    let dLog = "";
    if (bKeys.length > 0) {
      const rKey = bKeys[Math.floor(Math.random() * bKeys.length)]; myData.buildings[rKey]--;
      dLog = `，且【${CFG.buildings[rKey].name}】遭破壞降級！`;
      try{ setDoc(doc(db, "world_map", myUid), { castleLevel: myData.buildings.castle }, { merge: true }); }catch(e){}
    }
    myData.logs.unshift(`[城防潰敗] ${m.npcName} 攻破防線！被掠奪資源${dLog}`);
    if(window.addReport) window.addReport(`🔥 城防潰敗`, `【${m.npcName}】攻破了您的防線！\n損失兵力：全軍覆沒\n損失物資：🌲${lW} ⛏️${lI} 🌾${lF}\n${dLog}`, false);
  }
  try{ setDoc(doc(db, "world_map", myUid), { troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry }, { merge: true }); }catch(e){}
}

// ==========================================
// 💡 PVE 與 PVP 戰鬥結算引擎 (含醫療所與負重)
// ==========================================
async function resolveInteractNPC(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0}, counterMarch: null };
  let reportText = "";
  
  if (m.entity.type === 'relic') { 
    res.loot = m.entity.loot; 
    myData.logs.unshift(`[發掘] 探險隊挖出巨量資源，正在返航中！`); 
    reportText = `探險隊成功發掘【${m.entity.name}】！`;
  } else {
    const attPwr = getPwrByTech(m.troops, m.techs || myData.research);
    const defPwr = m.entity.reqPwr || 100;

    if (attPwr >= defPwr) {
        // ✅ 戰鬥勝利
        let lossRate = (defPwr / (attPwr + 1)) * 0.15;
        
        let lInf = Math.floor(m.troops.infantry * lossRate); let wInf = Math.floor(lInf * 0.9);
        let lArc = Math.floor(m.troops.archer * lossRate); let wArc = Math.floor(lArc * 0.9);
        let lCav = Math.floor(m.troops.cavalry * lossRate); let wCav = Math.floor(lCav * 0.9);
        let overflow = window.addWounded(wInf, wArc, wCav); 
        
        res.troops.infantry = Math.max(0, m.troops.infantry - lInf);
        res.troops.archer = Math.max(0, m.troops.archer - lArc);
        res.troops.cavalry = Math.max(0, m.troops.cavalry - lCav);
        
        let maxLoad = window.getLoadCapacity(res.troops);
        let currentLoad = 0;
        ['food', 'wood', 'iron'].forEach(k => {
            let amt = m.entity.loot[k] || 0;
            if (currentLoad + amt > maxLoad) amt = maxLoad - currentLoad; 
            res.loot[k] = amt; currentLoad += amt;
        });

        reportText = `成功剿滅【${m.entity.name}】！\n戰鬥損失：🏥重傷 ${wInf+wArc+wCav} | ☠️陣亡 ${(lInf-wInf)+(lArc-wArc)+(lCav-wCav)+overflow}\n🎒 部隊負重：${formatCompact(currentLoad)} / ${formatCompact(maxLoad)}\n獲得戰利品：🌲${res.loot.wood} ⛏️${res.loot.iron} 🌾${res.loot.food}`;
        if(myData.quests) myData.quests.daily.kills++;

        let factionName = m.entity.faction;
        if (!factionName && ['中央王都','猩紅法師塔','迷霧監視塔','砂海要塞'].some(n => m.entity.name.includes(n))) {
            factionName = ['中央王都','猩紅法師塔','迷霧監視塔','砂海要塞'].find(n => m.entity.name.includes(n));
        }
        if (factionName) {
            myData.logs.unshift(`⚠️ 【${factionName}】守備軍已集結大軍朝您的主城反撲！`);
            res.counterMarch = { id: 'COUNTER_'+Date.now(), type: 'defend_npc', startX: m.targetX, startY: m.targetY, targetX: myData.x, targetY: myData.y, startTime: Date.now(), finishesAt: Date.now() + 30000, npcPower: (m.entity.reqPwr||15000)*1.2, npcName: `${factionName} 復仇軍團` };
        }
    } else {
        // ❌ 戰鬥失敗
        let wInf = Math.floor(m.troops.infantry * 0.7); let wArc = Math.floor(m.troops.archer * 0.7); let wCav = Math.floor(m.troops.cavalry * 0.7);
        window.addWounded(wInf, wArc, wCav);
        res.survived = false; res.troops = {infantry:0, archer:0, cavalry:0};
        reportText = `討伐遭遇慘敗！部隊潰散 (🏥 ${wInf+wArc+wCav} 人已送往醫療所)`;
        if(window.addReport) window.addReport(`☠️ 遠征失敗`, reportText, false);
        return res; // 這裡的 return 是合法的，因為它在函數內部
    }
  }
  myData.clearedPOI.push(`${m.targetX},${m.targetY},${Date.now()},${m.entity.type}`);
  if(window.addReport) window.addReport(`⚔️ 遠征大捷`, reportText, true);
  return res; // 這裡的 return 也是合法的
}

async function resolveAttackPlayer_NEW(m) {
  let res = { survived: false, troops: m.troops, loot: {wood:0, iron:0, food:0} };
  try {
    await runTransaction(db, async (transaction) => {
      const tPrivRef = doc(db, "players", m.targetUid), tPubRef = doc(db, "world_map", m.targetUid);
      const tDoc = await transaction.get(tPrivRef);
      if (!tDoc.exists()) throw new Error("城池空");
      const target = tDoc.data();
      if (target.shieldEndsAt && target.shieldEndsAt > Date.now()) throw new Error("Shielded"); 
      
      const attPwr = getPwrByTech(m.troops, m.techs);
      const defTroops = target.troops || {infantry:0, archer:0, cavalry:0};
      const defPwr = getPwrByTech(defTroops, target.research || {}) * (1 + (target.buildings.wall || 0) * 0.05);

      if (attPwr > defPwr) {
        // ✅ 攻擊方勝利 (防守方城破)
        let tWounded = target.wounded || {infantry:0, archer:0, cavalry:0};
        let tHospMax = 10000 + (target.buildings.castle || 1) * 5000;
        let tCurHosp = tWounded.infantry + tWounded.archer + tWounded.cavalry;
        ['infantry', 'archer', 'cavalry'].forEach(k => {
            let w = Math.floor(defTroops[k] * 0.7);
            let toAdd = Math.min(w, Math.max(0, tHospMax - tCurHosp));
            tWounded[k] += toAdd; tCurHosp += toAdd;
        });

        const maxLoad = window.getLoadCapacity(m.troops);
        const protectAmt = (target.buildings.warehouse || 0) * 2000;
        let currentLoad = 0;
        let steal = (resType) => {
            let available = Math.max(0, Math.floor((target[resType] - protectAmt) * 0.3));
            let take = Math.min(available, maxLoad - currentLoad);
            currentLoad += take; return take;
        };
        let lF = steal('food'); let lW = steal('wood'); let lI = steal('iron');

        let attLossRate = (defPwr / (attPwr + 1)) * 0.1;
        let wInf = Math.floor(m.troops.infantry * attLossRate); let wArc = Math.floor(m.troops.archer * attLossRate); let wCav = Math.floor(m.troops.cavalry * attLossRate);
        window.addWounded(wInf, wArc, wCav); 
        res.troops.infantry -= wInf; res.troops.archer -= wArc; res.troops.cavalry -= wCav;
        
        transaction.set(tPrivRef, { wood: target.wood - lW, iron: target.iron - lI, food: target.food - lF, troops: {infantry:0,archer:0,cavalry:0}, wounded: tWounded, logs: [`[城破] 遭到突襲！城池正在燃燒！防守部隊已盡數送醫。損失物資 🌲${lW} ⛏️${lI} 🌾${lF}`, ...(target.logs || [])] }, { merge: true });
        
        // ==========================================
        // 🔥 在這裡寫入燃燒狀態到世界地圖 🔥
        // ==========================================
        const burnTime = Date.now() + (30 * 60 * 1000); // 設定燃燒 30 分鐘
        transaction.set(tPubRef, { 
            troops: 0, 
            burnEndsAt: burnTime // 加入這個時間戳！
        }, { merge: true });
        // ==========================================
        
        res.survived = true; res.loot = { wood: lW, iron: lI, food: lF };
        if(window.addReport) window.addReport(`⚔️ 攻城勝利`, `成功攻破【${m.targetName}】！\n敵軍城池已陷入火海！🔥\n🎒 負重滿載率：${formatCompact(currentLoad)} / ${formatCompact(maxLoad)}\n掠奪物資：🌲${lW} ⛏️${lI} 🌾${lF}`, true);
      } else {
        // ❌ 攻擊方失敗
        let wInf = Math.floor(m.troops.infantry * 0.6); let wArc = Math.floor(m.troops.archer * 0.6); let wCav = Math.floor(m.troops.cavalry * 0.6);
        window.addWounded(wInf, wArc, wCav);
        transaction.set(tPrivRef, { logs: [`[堅壁清野] 成功擊退敵軍！`, ...(target.logs || [])] }, { merge: true });
        if(window.addReport) window.addReport(`☠️ 突擊失敗`, `進攻遭遇重創！我方不敵，殘兵已送醫 (🏥 ${wInf+wArc+wCav} 人)！`, false);
      }
    });
    window.refreshMap();
  } catch (err) { res.survived = true; }
  return res;
}

function renderLoop() {
  if (document.getElementById('tab-world').classList.contains('active')) drawWorldMap();
  requestAnimationFrame(renderLoop);
}

// ==========================================
// 🏹 大地圖行軍軌跡與動態箭頭渲染模組
// ==========================================
function drawMarchLines(ctx, marches, tileSize) {
  if (!marches || marches.length === 0) return;
  const now = Date.now();

  marches.forEach(m => {
    // 1. 計算進度百分比 (0.0 ~ 1.0)
    const totalDuration = m.finishesAt - m.startTime;
    if (totalDuration <= 0) return;
    const elapsed = now - m.startTime;
    const progress = Math.min(1, Math.max(0, elapsed / totalDuration));

    // 2. 轉換世界像素座標 (取格子中心點)
    const startPxX = m.startX * tileSize + tileSize / 2;
    const startPxY = m.startY * tileSize + tileSize / 2;
    const targetPxX = m.targetX * tileSize + tileSize / 2;
    const targetPxY = m.targetY * tileSize + tileSize / 2;

    // 當前部隊即時所在位置 (線性插值)
    const curPxX = startPxX + (targetPxX - startPxX) * progress;
    const curPxY = startPxY + (targetPxY - startPxY) * progress;

    // 3. 依部隊類型決定顏色與標籤
    let color = '#38bdf8'; // 天藍色 (我方出征)
    let label = '⚔️ 部隊';
    if (m.type === 'return') {
      color = '#10b981'; // 翠綠色 (返航)
      label = '📦 返航';
    } else if (m.type === 'defend_npc' || m.type === 'counter_attack') {
      color = '#ef4444'; // 紅色 (敵襲/反擊)
      label = `🚨 ${m.npcName || '敵軍'}`;
    } else if (m.type === 'attack_player') {
      color = '#f59e0b'; // 橘黃色 (攻打玩家)
      label = '⚔️ 攻城';
    }

    ctx.save();

    // 4. 繪製動態流動虛線
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const dashOffset = (now / 40) % 16;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -dashOffset;

    ctx.beginPath();
    ctx.moveTo(startPxX, startPxY);
    ctx.lineTo(targetPxX, targetPxY);
    ctx.stroke();

    // 5. 繪製箭頭實體
    const angle = Math.atan2(targetPxY - startPxY, targetPxX - startPxX);
    ctx.setLineDash([]); // 恢復實線
    ctx.fillStyle = color;
    ctx.beginPath();
    const arrowSize = 9;
    ctx.moveTo(
      curPxX + Math.cos(angle) * arrowSize * 1.5,
      curPxY + Math.sin(angle) * arrowSize * 1.5
    );
    ctx.lineTo(
      curPxX + Math.cos(angle + 2.4) * arrowSize,
      curPxY + Math.sin(angle + 2.4) * arrowSize
    );
    ctx.lineTo(
      curPxX + Math.cos(angle - 2.4) * arrowSize,
      curPxY + Math.sin(angle - 2.4) * arrowSize
    );
    ctx.closePath();
    ctx.fill();

    // 6. 繪製部隊頭頂膠囊名牌
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(curPxX - textWidth / 2 - 6, curPxY - 22, textWidth + 12, 16, 4);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, curPxX, curPxY - 14);

    ctx.restore();
  });
}

function drawWorldMap() {
  if (!myData || myData.isBanned) return; 
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-camX, -camY);

  const vW = canvas.width/zoom, vH = canvas.height/zoom;
  const radius = BASE_VISION_RADIUS + currentVisionBonus;
  const sC = Math.max(0, Math.floor(camX/TILE_SIZE)-1), eC = Math.min(WORLD_COLS, Math.ceil((camX+vW)/TILE_SIZE)+1);
  const sR = Math.max(0, Math.floor(camY/TILE_SIZE)-1), eR = Math.min(WORLD_ROWS, Math.ceil((camY+vH)/TILE_SIZE)+1);
  const t = Date.now();

  const mapPixelW = WORLD_COLS * TILE_SIZE;
  const mapPixelH = WORLD_ROWS * TILE_SIZE;
  
  if (imgWorldMap.complete && imgWorldMap.naturalHeight !== 0) {
      const vLeft = Math.max(0, camX), vTop = Math.max(0, camY);
      const vRight = Math.min(mapPixelW, camX + vW), vBottom = Math.min(mapPixelH, camY + vH);
      const cW = vRight - vLeft, cH = vBottom - vTop;

      if (cW > 0 && cH > 0) {
          const scaleX = imgWorldMap.naturalWidth / mapPixelW;
          const scaleY = imgWorldMap.naturalHeight / mapPixelH;
          ctx.drawImage(imgWorldMap, vLeft * scaleX, vTop * scaleY, cW * scaleX, cH * scaleY, vLeft, vTop, cW, cH);
      }
  } else {
      ctx.fillStyle = '#1e293b'; 
      ctx.fillRect(camX, camY, vW, vH);
  }

  for (let x = sC; x < eC; x++) {
    for (let y = sR; y < eR; y++) {
      if (x<0 || x>=WORLD_COLS || y<0 || y>=WORLD_ROWS) continue;
      const px = x*TILE_SIZE, py = y*TILE_SIZE;
      
      const isExplored = exploredTiles[x][y] || godModeFog;
      if (!isExplored) { 
          ctx.fillStyle='rgba(5, 8, 17, 0.9)'; 
          ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); 
          continue; 
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; 
      ctx.lineWidth = 1; ctx.strokeRect(px,py,TILE_SIZE,TILE_SIZE);

      const cell = MAP_CACHE[x] && MAP_CACHE[x][y];
      const isBossOverlap = worldBosses.some(b => (b.hp > 0 || b.despawnAt > t) && x >= b.x - 1 && x <= b.x + 2 && y >= b.y - 1 && y <= b.y + 2);

      if (cell && cell.entity && !allCastles.some(p => p.x === x && p.y === y) && !isBossOverlap) {
        const clrInfo = getClearedPOI(x, y);
        
        if (clrInfo) {
          ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🔥', px+TILE_SIZE/2, py+35);
        } else {
          if (cell.entity.type === 'npc_capital' || cell.entity.type === 'npc_super_castle') {
              ctx.shadowColor = '#facc15'; ctx.shadowBlur = 15 + Math.sin(t/200)*10;
              if (imgDarkCapital.complete && imgDarkCapital.naturalHeight !== 0) {
                  ctx.drawImage(imgDarkCapital, px - TILE_SIZE, py - TILE_SIZE, TILE_SIZE * 3, TILE_SIZE * 3);
              } else {
                  ctx.fillStyle = 'rgba(76, 29, 149, 0.6)'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              }
              ctx.shadowBlur = 0;
              ctx.fillStyle = '#facc15'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign='center'; 
              ctx.fillText(cell.entity.name.split(' ')[1]||'據點', px+TILE_SIZE/2, py + TILE_SIZE*2 - 10);
              
          } else if (cell.entity.type === 'npc_fortress') {
              ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10 + Math.sin(t/200)*5;
              if (imgDarkFortress.complete && imgDarkFortress.naturalHeight !== 0) {
                  ctx.drawImage(imgDarkFortress, px - TILE_SIZE/2, py - TILE_SIZE/2, TILE_SIZE * 2, TILE_SIZE * 2);
              } else {
                  ctx.fillStyle = 'rgba(153, 27, 27, 0.6)'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              }
              ctx.shadowBlur = 0;
              ctx.fillStyle = '#f87171'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign='center'; 
              ctx.fillText('黑暗要塞', px+TILE_SIZE/2, py + TILE_SIZE*1.5 - 5);
              
          } else if (cell.entity.type === 'npc_faction_guard') {
            const isLv3 = cell.entity.name.includes('Lv.3');
            const isLv2 = cell.entity.name.includes('Lv.2');
            
            if (isLv3) {
                ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10;
                if (imgDarkCastle.complete && imgDarkCastle.naturalHeight !== 0) ctx.drawImage(imgDarkCastle, px - 15, py - 15, TILE_SIZE + 30, TILE_SIZE + 30);
                else { ctx.font='28px sans-serif'; ctx.textAlign='center'; ctx.fillText('🏰', px+TILE_SIZE/2, py+30); }
                ctx.shadowBlur = 0;
            } else if (isLv2) {
                ctx.shadowColor = '#f97316'; ctx.shadowBlur = 8;
                if (imgDarkFortress.complete && imgDarkFortress.naturalHeight !== 0) ctx.drawImage(imgDarkFortress, px - 5, py - 5, TILE_SIZE + 10, TILE_SIZE + 10);
                else { ctx.font='24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🏯', px+TILE_SIZE/2, py+30); }
                ctx.shadowBlur = 0;
            } else {
                if (imgDarkOutpost.complete && imgDarkOutpost.naturalHeight !== 0) ctx.drawImage(imgDarkOutpost, px, py, TILE_SIZE, TILE_SIZE);
                else { ctx.font='20px sans-serif'; ctx.textAlign='center'; ctx.fillText('🏕️', px+TILE_SIZE/2, py+30); }
            }

            ctx.fillStyle = isLv3 ? '#ef4444' : (isLv2 ? '#f97316' : '#38bdf8'); 
            ctx.font = 'bold 10px sans-serif'; ctx.textAlign='center'; 
            
            const shortName = cell.entity.name.split('·')[1] || cell.entity.name;
            ctx.fillText(shortName, px+TILE_SIZE/2, py+50);
          } else if (cell.entity.type === 'npc_castle') {
              if (imgDarkCastle.complete && imgDarkCastle.naturalHeight !== 0) ctx.drawImage(imgDarkCastle, px - 10, py - 15, TILE_SIZE + 20, TILE_SIZE + 20);
              else { ctx.fillStyle = 'rgba(59, 7, 100, 0.6)'; ctx.fillRect(px+10, py+10, TILE_SIZE-20, TILE_SIZE-20); }
              ctx.fillStyle = '#f87171'; ctx.font = '11px sans-serif'; ctx.textAlign='center'; ctx.fillText('黑暗城堡', px+TILE_SIZE/2, py+45);
          } else if (cell.entity.type === 'npc_outpost') {
              if (imgDarkOutpost.complete && imgDarkOutpost.naturalHeight !== 0) ctx.drawImage(imgDarkOutpost, px - 5, py - 5, TILE_SIZE + 10, TILE_SIZE + 10);
              else { ctx.fillStyle = 'rgba(23, 23, 23, 0.6)'; ctx.fillRect(px+12, py+12, TILE_SIZE-24, TILE_SIZE-24); }
              ctx.fillStyle = '#f87171'; ctx.font = '10px sans-serif'; ctx.textAlign='center'; ctx.fillText('黑暗前哨', px+TILE_SIZE/2, py+45);
          } else if (cell.entity.type === 'barbarian') {
            if (imgBarbarian.complete && imgBarbarian.naturalHeight !== 0) ctx.drawImage(imgBarbarian, px - 2, py - 10, TILE_SIZE + 4, TILE_SIZE + 4);
            else { ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText('👹', px+TILE_SIZE/2, py+30); }
            ctx.fillStyle = '#f87171'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign='center'; ctx.fillText('野蠻人', px+TILE_SIZE/2, py+50);
          } else if (cell.entity.type === 'relic') {
            if (imgRelic.complete && imgRelic.naturalHeight !== 0) ctx.drawImage(imgRelic, px, py - 5, TILE_SIZE, TILE_SIZE);
            else { ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🏛️', px+TILE_SIZE/2, py+30); }
            ctx.fillStyle = '#38bdf8'; ctx.font = '10px sans-serif'; ctx.textAlign='center'; ctx.fillText('遺跡', px+TILE_SIZE/2, py+45);
          // 📜 全域公告 / 告示牌：若已領取則跳過不畫
          } else if (cell.entity.type === 'announcement' || cell.entity.type === 'notice') {
            // 💡 直接對齊公告物件的 id
            const annId = cell.entity.id;
            const isClaimed = myData.claimedAnnouncements && myData.claimedAnnouncements.includes(annId);
            
            // 若尚未領取，才繪製在地圖上；領取過後自動隱藏
            if (!isClaimed) {
              ctx.font = '24px sans-serif'; 
              ctx.textAlign = 'center'; 
              ctx.fillText('📜', px + TILE_SIZE / 2, py + 30);
              ctx.fillStyle = '#facc15'; 
              ctx.font = 'bold 10px sans-serif'; 
              ctx.textAlign = 'center';
              ctx.fillText(cell.entity.name || '公告', px + TILE_SIZE / 2, py + 45);
            }
          } else if (cell.entity.type.startsWith('res_')) {
            const isMine = worldNodes.some(n => n.x === x && n.y === y && n.uid === myUid);
            const isEnemy = worldNodes.some(n => n.x === x && n.y === y && n.uid !== myUid && n.uid !== 'NPC');
            
            let nearLm = null; let minDist = 999;
            epicLandmarks.forEach(lm => {
                let d = Math.hypot(x - lm.x, y - lm.y);
                if (d <= 10 && d < minDist) { minDist = d; nearLm = lm; }
            });
            
            const seed = x * 123 + y * 456 + currentHourSeed; 
            const isNpcOccupied = !isMine && !isEnemy && nearLm && (seed % 100 < 40); 

            let resImg = null; let fallbackEmoji = '';
            if (cell.entity.type === 'res_farm') { resImg = imgResFarm; fallbackEmoji = '🌾'; }
            else if (cell.entity.type === 'res_lumber') { resImg = imgResLumber; fallbackEmoji = '🌲'; }
            else if (cell.entity.type === 'res_mine') { resImg = imgResMine; fallbackEmoji = '⛏️'; }

            if (resImg && resImg.complete && resImg.naturalHeight !== 0) ctx.drawImage(resImg, px + 2, py - 10, TILE_SIZE - 4, TILE_SIZE - 4);
            else { ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText(fallbackEmoji, px+TILE_SIZE/2, py+28); }

            const resName = cell.entity.name.split(' ')[1] || '資源區';
            ctx.textAlign='center'; ctx.fillStyle = '#fef08a'; ctx.font = '10px sans-serif'; ctx.fillText(resName, px+TILE_SIZE/2, py+42);
            
            if (isMine) {
                ctx.fillStyle = '#10b981'; ctx.fillText('我方採集', px+TILE_SIZE/2, py+54);
            } else if (isEnemy) {
                ctx.fillStyle = '#ef4444'; ctx.fillText('敵方佔領', px+TILE_SIZE/2, py+54);
            } else if (isNpcOccupied) {
                ctx.fillStyle = '#f97316'; ctx.fillText(`⚠️ ${nearLm.name}駐守`, px+TILE_SIZE/2, py+54); 
            } else {
                ctx.fillStyle = '#38bdf8'; ctx.fillText('可佔領', px+TILE_SIZE/2, py+54);
            }
          }
        } 
      } 
    } 
  } 

  worldBosses.forEach(boss => {
     const isExplored = (exploredTiles[boss.x] && exploredTiles[boss.x][boss.y]) || godModeFog;
     if ((boss.hp > 0 || boss.despawnAt > t) && isExplored) {
        const bx = boss.x * TILE_SIZE, by = boss.y * TILE_SIZE;
        const bounce = 0; 
        const centerBx = bx + TILE_SIZE; 
        
        if (boss.hp <= 0) {
            ctx.font = '50px sans-serif'; ctx.textAlign='center'; ctx.fillText('☠️', centerBx, by + TILE_SIZE + 10);
            ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif'; ctx.fillText('首領遺骸', centerBx, by + TILE_SIZE + 30);
            ctx.fillStyle = '#64748b'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign='center';
            ctx.fillText(boss.name, centerBx, by + TILE_SIZE * 2 + 15);
        } else {
            let targetImg = imgBossOuter; let fallbackEmoji = '🗿';
            if (boss.id === 'BOSS_CORE') { targetImg = imgBossCore; fallbackEmoji = '🐉'; }
            else if (boss.id.startsWith('BOSS_MID')) { targetImg = imgBossMid; fallbackEmoji = '🦑'; }

            if (targetImg.complete && targetImg.naturalHeight !== 0) {
                ctx.drawImage(targetImg, bx, by + bounce, TILE_SIZE * 2, TILE_SIZE * 2);
            } else {
                ctx.font = '60px sans-serif'; ctx.textAlign='center'; ctx.fillText(fallbackEmoji, centerBx, by + TILE_SIZE + 20 + bounce);
            }
            
            const barW = TILE_SIZE * 1.5;
            const barX = bx + (TILE_SIZE * 2 - barW) / 2;
            ctx.fillStyle = '#ef4444'; ctx.fillRect(barX, by - 10 + bounce, barW * (boss.hp/boss.maxHp), 6);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(barX, by - 10 + bounce, barW, 6);
            
            ctx.fillStyle = '#facc15'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign='center';
            ctx.fillText(boss.name, centerBx, by + TILE_SIZE * 2 + 18 + bounce);
        }
     }
  });

  allCastles.forEach(p => {
    const isMe = (p.id === myUid);
    const isExplored = exploredTiles[p.x] && exploredTiles[p.x][p.y];
    if (!godModeFog && !isMe && !isExplored) return;
    
    const px = p.x*TILE_SIZE, py = p.y*TILE_SIZE;
    if (px<camX-TILE_SIZE*2 || px>camX+vW+TILE_SIZE*2 || py<camY-TILE_SIZE*2 || py>camY+vH+TILE_SIZE*2) return;

    const floatY = Math.sin(t / 250 + p.x) * 4;

    if (p.shieldEndsAt && p.shieldEndsAt > Date.now()) {
        ctx.save();
        ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 15 + Math.sin(Date.now()/150)*5; 
        ctx.beginPath(); ctx.arc(px+TILE_SIZE/2, py+TILE_SIZE/2 + floatY, 35, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.25)'; ctx.fill();
        
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)'; ctx.lineWidth = 3; 
        ctx.setLineDash([8, 4]); ctx.stroke();
        
        ctx.shadowBlur = 0; ctx.setLineDash([]);
        ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🛡️', px+TILE_SIZE/2, py - 35 + floatY);
        ctx.restore();
    }
    if (isMe) { 
        ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
        ctx.beginPath(); ctx.ellipse(px + TILE_SIZE/2, py + TILE_SIZE - 5 + floatY, 35, 15, 0, 0, Math.PI*2); ctx.fill();
        
        const grd = ctx.createLinearGradient(0, py - 120, 0, py + TILE_SIZE);
        grd.addColorStop(0, 'rgba(250, 204, 21, 0)');
        grd.addColorStop(1, 'rgba(250, 204, 21, 0.5)');
        ctx.fillStyle = grd;
        ctx.fillRect(px + TILE_SIZE/2 - 20, py - 120 + floatY, 40, 120 + TILE_SIZE/2);
        
        ctx.font = '35px sans-serif'; ctx.textAlign='center'; 
        ctx.fillText('👇', px + TILE_SIZE/2, py - 30 + floatY * 2.5);
    }
    
    let cLv = p.castleLevel || 1; let imgIdx = 0;
    if (cLv >= 20) imgIdx = 6; else if (cLv >= 17) imgIdx = 5; else if (cLv >= 13) imgIdx = 4;
    else if (cLv >= 9) imgIdx = 3; else if (cLv >= 6) imgIdx = 2; else if (cLv >= 3) imgIdx = 1;
    
    // 💡 1. 判斷該玩家是否為 VIP (擁有且未過期)
    const isVip = p.vip && p.vip.isActive && p.vip.expiresAt > Date.now();

    let currentCastleImg = castleImgs[imgIdx];
    
    if (currentCastleImg && currentCastleImg.complete && currentCastleImg.naturalHeight !== 0) {
        // 💡 2. 如果是 VIP，加上黃金發光與濾鏡特效
        if (isVip) {
            ctx.save();
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 20; // 邊緣發出黃金光暈
            ctx.filter = 'sepia(1) hue-rotate(15deg) saturate(3) brightness(1.2)'; // 城堡材質變成黃金
        }
        
        ctx.drawImage(currentCastleImg, px - 20, py - 30 + floatY, TILE_SIZE + 40, TILE_SIZE + 40);
        
        if (isVip) {
            ctx.restore(); 
        }
    } else {
        // 💡 3. 如果圖片沒載入 (備案方塊)，如果是 VIP 也是黃金配色
        ctx.fillStyle = isVip ? '#b45309' : (isMe?'#1d4ed8':'#991b1b'); 
        ctx.fillRect(px+12,py+16+floatY,31,26);
        ctx.fillStyle = isVip ? '#facc15' : (isMe?'#3b82f6':'#ef4444'); 
        ctx.fillRect(px+9,py+12+floatY,10,30); ctx.fillRect(px+36,py+12+floatY,10,30);
    }

    // ==========================================
    // 🔥 城池燃燒動態特效 🔥
    // ==========================================
    const isBurning = p.burnEndsAt && p.burnEndsAt > Date.now();
    
    if (isBurning) {
        const time = Date.now();
        const flicker1 = Math.sin(time / 150) * 4; 
        const flicker2 = Math.cos(time / 200) * 3; 
        
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🔥', px + TILE_SIZE / 2 - 15, py + 10 + floatY + flicker1);
        ctx.fillText('🔥', px + TILE_SIZE / 2 + 10, py - 5 + floatY + flicker2);
        
        ctx.font = '16px sans-serif';
        ctx.fillStyle = `rgba(0, 0, 0, ${0.5 + Math.sin(time/300)*0.2})`; 
        ctx.fillText('☁️', px + TILE_SIZE / 2, py - 25 + floatY - (time % 1000) / 50); 
    }
    // ==========================================

    if (zoom>0.5) {
      // 💡 4. VIP 的名字字體變成純金黃色
      if (isVip) {
          ctx.fillStyle = '#facc15'; 
      } else {
          ctx.fillStyle = isMe ? '#fef08a' : (p.allianceName && p.allianceName === myData.allianceName ? '#10b981' : '#fff'); 
      }
      
      ctx.font = isMe ? 'bold 12px sans-serif' : '11px sans-serif'; 
      ctx.textAlign='center';
      
      let dispName = p.allianceName ? `[${p.allianceName}] ${p.name}` : p.name;
      
      // 💡 5. VIP 名字加上皇冠
      if (isVip) dispName = '👑 ' + dispName;

      ctx.fillText(dispName, px+TILE_SIZE/2, py+60 + floatY); 
      ctx.fillStyle='#fbbf24'; ctx.fillText(`⚔️${formatCompact(p.troops||0)}`, px+TILE_SIZE/2, py-5 + floatY);
    }

  epicLandmarks.forEach((lm, idx) => {
      const cycle = 15000; 
      const phase = (t + idx * 4321) % (cycle * 2); 
      const isReturning = phase > cycle;
      const p = isReturning ? (1 - (phase - cycle)/cycle) : (phase / cycle);
      
      const periodId = Math.floor((t + idx * 4321) / (cycle * 2));
      const r1 = Math.sin(periodId * 12.9898 + idx) * 43758.5453;
      const angle = (r1 - Math.floor(r1)) * Math.PI * 2;
      const dist = 3 + ((r1 * 7) - Math.floor(r1 * 7)) * 4;
      
      const tgX = lm.x + Math.cos(angle) * dist;
      const tgY = lm.y + Math.sin(angle) * dist;
      
      const sX = lm.x*TILE_SIZE + TILE_SIZE/2, sY = lm.y*TILE_SIZE + TILE_SIZE/2;
      const eX = tgX*TILE_SIZE + TILE_SIZE/2, eY = tgY*TILE_SIZE + TILE_SIZE/2;
      const cX = sX + (eX - sX) * p, cY = sY + (eY - sY) * p;

      if (cX > camX-TILE_SIZE && cX < camX+vW+TILE_SIZE && cY > camY-TILE_SIZE && cY < camY+vH+TILE_SIZE) {
          ctx.beginPath(); ctx.setLineDash([4,4]); ctx.moveTo(sX, sY); ctx.lineTo(eX, eY);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth=1.5; ctx.stroke(); ctx.setLineDash([]);
          
          ctx.fillStyle = lm.c; ctx.beginPath(); ctx.arc(cX, cY, 6, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; 
          ctx.fillText(isReturning ? '📦' : '⛏️', cX, cY+3);
      }
  });

  // 🏹 繪製大地圖全新動態行軍軌跡與採集狀態
  if (myData.marches && myData.marches.length > 0) {
    // 1. 保留採集中標籤 (駐留在資源點上挖礦)
    myData.marches.forEach(m => {
      if (m.type === 'gathering') {
        const cX = m.targetX * TILE_SIZE + TILE_SIZE / 2;
        const cY = m.targetY * TILE_SIZE + TILE_SIZE / 2;
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(cX, cY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⛏', cX, cY + 4);

        const left = Math.ceil((m.finishesAt - t) / 1000);
        if (left > 0) {
          ctx.fillStyle = '#facc15';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(formatTime(left), cX, cY - 20);
        }
        ctx.textAlign = 'start';
     });

    // 2. 移動中部隊繪製全新流動虛線與方向箭頭 (排除原地採集的部隊)
    const movingMarches = myData.marches.filter(m => m.type !== 'gathering');
    drawMarchLines(ctx, movingMarches, TILE_SIZE);
  }
    // 🏹 在這裡加入行軍繪製呼叫！
  if (myData && myData.marches) {
    drawMarchLines(ctx, myData.marches, TILE_SIZE);
  }
    
  ctx.restore();
}

window.zoomMapBtn = (factor) => {
  const nZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
  if (nZ !== zoom) {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const wX = cx / zoom + camX, wY = cy / zoom + camY;
    zoom = nZ; camX = wX - cx / zoom; camY = wY - cy / zoom; clampCamera();
    document.getElementById('zoom-indicator').innerText = `${Math.round(zoom*100)}%`; 
  }
};

let isDragging = false, dragSX = 0, dragSY = 0, dragDist = 0;
let initialPinchDist = null, initialZoom = 1, pinchCenter = null;

function handleDown(e) {
  if (e.touches && e.touches.length === 2) {
    isDragging = false;
    initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    initialZoom = zoom;
    const r = canvas.getBoundingClientRect();
    const px = (e.touches[0].clientX + e.touches[1].clientX)/2 - r.left, py = (e.touches[0].clientY + e.touches[1].clientY)/2 - r.top;
    pinchCenter = { x: px, y: py, wX: px / zoom + camX, wY: py / zoom + camY };
    return;
  }
  isDragging=true; dragDist=0; canvas.style.cursor='grabbing'; document.getElementById("hover-hud").style.display='none';
  const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY;
  dragSX = cx; dragSY = cy;
}

function handleMove(e) {
  if (e.touches && e.touches.length === 2 && initialPinchDist) {
    e.preventDefault();
    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const nZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialZoom * (dist / initialPinchDist)));
    if (nZ !== zoom) {
      zoom = nZ; camX = pinchCenter.wX - pinchCenter.x / zoom; camY = pinchCenter.wY - pinchCenter.y / zoom;
      clampCamera(); document.getElementById('zoom-indicator').innerText = `${Math.round(zoom*100)}%`; 
    }
    return;
  }
  if (!isDragging) return;
  e.preventDefault();
  const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY;
  const dx = cx - dragSX, dy = cy - dragSY; dragDist += Math.hypot(dx,dy);
  dragSX = cx; dragSY = cy; camX -= dx/zoom; camY -= dy/zoom; clampCamera(); 
}

function handleUp(e) { 
  if (e.touches && e.touches.length < 2) initialPinchDist = null;
  isDragging = false; canvas.style.cursor='grab'; 
}

canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left; const py = e.clientY - r.top;
    const wX = px / zoom + camX; const wY = py / zoom + camY;
    const nZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    if (nZ !== zoom) {
        zoom = nZ; camX = wX - px / zoom; camY = wY - py / zoom; clampCamera();
        document.getElementById('zoom-indicator').innerText = `${Math.round(zoom*100)}%`; 
    }
}, { passive: false });

canvas.addEventListener("mousedown", handleDown); canvas.addEventListener("mousemove", handleMove); window.addEventListener("mouseup", handleUp);
canvas.addEventListener("touchstart", handleDown, {passive:false}); canvas.addEventListener("touchmove", handleMove, {passive:false}); window.addEventListener("touchend", handleUp);

let targetAction = null;
window.closeActionModal = () => { document.getElementById("action-modal").style.display='none'; targetAction=null; };

window.syncTroop = (type, source) => {
    const inputEl = document.getElementById(`send-${type}`);
    const sliderEl = document.getElementById(`slider-${type}`);
    let max = parseInt(inputEl.max) || 0;
    if (source === 'slider') {
        let val = parseInt(sliderEl.value) || 0;
        inputEl.value = val;
    } else {
        let val = parseInt(inputEl.value) || 0;
        if (val > max) val = max;
        if (val < 0) val = 0;
        inputEl.value = val;
        sliderEl.value = val;
    }
};

canvas.addEventListener("click", (e) => {
  if (myData && myData.isBanned) return; // 👈 加上這行：被封鎖者禁止點擊地圖
  if (dragDist > 10) return;
  const r = canvas.getBoundingClientRect();
  const cx = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : 0);
  const cy = e.clientY || (e.changedTouches ? e.changedTouches[0].clientY : 0);
  const sX = (cx - r.left) * (canvas.width / r.width), sY = (cy - r.top) * (canvas.height / r.height);
  const tX = Math.floor((sX/zoom+camX)/TILE_SIZE), tY = Math.floor((sY/zoom+camY)/TILE_SIZE);
  
  const tC = allCastles.find(p=>p.x===tX&&p.y===tY), cell = MAP_CACHE[tX] && MAP_CACHE[tX][tY], dist = Math.hypot(tX-myData.x, tY-myData.y);
  const wBoss = worldBosses.find(b => (b.hp > 0 || b.despawnAt > Date.now()) && tX >= b.x && tX <= b.x + 1 && tY >= b.y && tY <= b.y + 1);
  const isNearBoss = worldBosses.some(b => (b.hp > 0 || b.despawnAt > Date.now()) && tX >= b.x - 1 && tX <= b.x + 2 && tY >= b.y - 1 && tY <= b.y + 2);

  if (!godModeFog && dist > BASE_VISION_RADIUS+currentVisionBonus) return alert("🌫️ 迷霧區域無法鎖定目標！請派遣斥候或遷城靠近。");
  const queueStatus = `<span style="font-size:0.8rem; color:#facc15;">(行軍隊列: ${myData.marches.length}/3)</span>`;

  if (tC && tC.id!==myUid) {
    if (tC.shieldEndsAt && tC.shieldEndsAt > Date.now()) { return alert("🛡️ 目標處於和平護盾保護中，無法對其發起軍事行動！"); }
    if (tC.allianceName && myData.allianceName && tC.allianceName === myData.allianceName) { return alert("🛡️ 目標是您的歃血盟友，無法發起攻擊！"); }

    targetAction = { type: 'attack_player', targetUid: tC.id, name: tC.name, x: tX, y: tY, dist, techs: myData.research };
    document.getElementById("modal-title").innerHTML = `⚔️ 攻擊城池 ${queueStatus}`; 
    document.getElementById("modal-desc").innerHTML = `目標：【${tC.name}】 (Lv.${tC.castleLevel||1})<br>距離：${Math.ceil(dist)} 格<br><span style="color:#10b981; font-weight:bold;">🎁 預期掠奪: 敵方30%庫存資源</span>`;
    document.getElementById("troop-selector").style.display = 'block'; 
    document.getElementById("btn-confirm-action").style.display = 'block'; 
    document.getElementById("btn-confirm-action").innerText = "發動行軍"; 
    document.getElementById("btn-confirm-action").style.background = '#dc2626';
  }
  else if (wBoss) {
    if (wBoss.hp <= 0) return alert("☠️ 此首領已被擊殺，目前只剩下遺骸，請等待重生。");
    const suggestPwr = wBoss.mult === 20 ? 150000 : (wBoss.mult === 8 ? 50000 : 15000); 
    targetAction = { type: 'attack_boss', targetUid: wBoss.id, name: wBoss.name, x: tX, y: tY, dist, techs: myData.research };
    document.getElementById("modal-title").innerHTML = `🐉 討伐首領 ${queueStatus}`; 
    document.getElementById("modal-desc").innerHTML = `目標：【${wBoss.name}】<br>距離：${Math.ceil(dist)} 格<br>建議部隊戰力：<span style="color:#f87171;">${formatCompact(suggestPwr)}</span><br><span style="color:#10b981; font-weight:bold;">🎁 掉落大量加速道具與物資！</span><br><span style="color:#facc15; font-size:0.8rem;">🩸 獎勵將於首領倒下後統一根據貢獻度結算</span>`;
    document.getElementById("troop-selector").style.display = 'block'; document.getElementById("btn-confirm-action").style.display = 'block'; document.getElementById("btn-confirm-action").innerText = "發動討伐"; document.getElementById("btn-confirm-action").style.background = '#dc2626';
  }
  else if (cell && cell.entity && !getClearedPOI(tX,tY) && !isNearBoss) { 
    const ent = cell.entity;
    let actionTitle = '⚔ 討伐敵陣';
    if (ent.type.startsWith('res_')) {
        actionTitle = '🚩 佔領資源點';
        const isMine = worldNodes.some(n => n.x === tX && n.y === tY && n.uid === myUid);
        if (isMine) return alert("🛡️ 您的部隊已經佔領此地，正在採集中！");
    } else if (ent.type === 'relic') actionTitle = '🏛️ 奇蹟探險';
    else if (ent.type === 'npc_capital' || ent.type === 'npc_super_castle') actionTitle = '😈 攻略巨城';

    let lootStr = '';
    if (ent.type.startsWith('res_')) {
       lootStr = `<br><span style="color:#38bdf8; font-weight:bold;">🕒 佔領採集：需駐守 1 小時</span><br><span style="color:#10b981; font-weight:bold;">🎁 滿載收益: ${formatCompact(ent.cap)} ${ent.res==='wood'?'木材':(ent.res==='iron'?'鐵礦':'糧草')}</span>`;
    } else if (ent.loot) {
       lootStr = `<br><span style="color:#10b981; font-weight:bold;">🎁 戰利品: 🌲${formatCompact(ent.loot.wood||0)} ⛏️${formatCompact(ent.loot.iron||0)} 🌾${formatCompact(ent.loot.food||0)}`;
       if (ent.loot.speedup1h) lootStr += ` | ⚡1hx${ent.loot.speedup1h}`;
       else if (ent.loot.speedup30m) lootStr += ` | ⚡30mx${ent.loot.speedup30m}`;
       else if (ent.loot.speedup5m) lootStr += ` | ⚡5mx${ent.loot.speedup5m}`;
       if (ent.loot.resourceCard) lootStr += ` | 📦x${ent.loot.resourceCard}`;
       lootStr += `</span>`;
    }

    targetAction = { 
        type: ent.type.startsWith('res_') ? 'occupy_node' : (ent.type==='relic'?'relic':(ent.type==='npc_capital'||ent.type==='npc_super_castle'?'attack_capital':'attack_npc')), 
        entity: ent, x: tX, y: tY, dist, techs: myData.research 
    };
    
    document.getElementById("modal-title").innerHTML = `${actionTitle} ${queueStatus}`;
    document.getElementById("modal-desc").innerHTML = ent.type==='relic'? `探索需消耗 ${ent.reqFood} 糧食。${lootStr}`:`距離：${Math.ceil(dist)} 格<br>建議兵力戰力：${ent.reqPwr}${lootStr}`;
    document.getElementById("troop-selector").style.display = 'block'; document.getElementById("btn-confirm-action").style.display = 'block'; 
    document.getElementById("btn-confirm-action").innerText = ent.type.startsWith('res_') ? "發兵佔領" : "發動行軍"; 
    document.getElementById("btn-confirm-action").style.background = ent.type.startsWith('res_') ? '#8b5cf6' : '#dc2626';
  }
  else if (!tC && cell && cell.type !== 'water') {
    const timeSince = Date.now() - (myData.lastRelocateTime || 0);
    const remainMs = isAdmin ? 0 : RELOCATE_COOLDOWN - timeSince;
    const moveCost = Math.max(100, Math.ceil(dist * 50));
    
    if (remainMs > 0) {
        targetAction = null;
        document.getElementById("modal-title").innerHTML = `📍 領地搬遷 (冷卻中)`;
        document.getElementById("modal-desc").innerHTML = `傳送矩陣冷卻中，需等待 <span style="color:#ef4444; font-weight:bold;">${formatTime(Math.ceil(remainMs/1000))}</span> 後方可再次搬遷。`;
        document.getElementById("btn-confirm-action").style.display = 'none';
    } else {
        targetAction = { type: 'relocate', x: tX, y: tY, cost: moveCost };
        document.getElementById("modal-title").innerHTML = `📍 領地搬遷`;
        document.getElementById("modal-desc").innerHTML = `傳送至 (${tX}, ${tY})<br>距離：${Math.ceil(dist)} 格<br>消耗：${formatCompact(moveCost)}木, ${formatCompact(moveCost)}鐵, ${formatCompact(moveCost)}糧`;
        document.getElementById("btn-confirm-action").style.display = 'block';
        document.getElementById("btn-confirm-action").innerText = "確認遷城"; 
        document.getElementById("btn-confirm-action").style.background = '#0ea5e9';
    }
    document.getElementById("troop-selector").style.display = 'none'; 
  } else return;

  const bLvl = myData.buildings.barracks || 1; let unlockCount = 0;
  ['inf','arc','cav'].forEach(t => { 
    const full = t==='inf'?'infantry':(t==='arc'?'archer':'cavalry');
    if (bLvl >= CFG.troops[full].reqLvl) {
      document.getElementById(`row-${t}`).style.display = 'flex';
      const maxTroops = myData.troops[full] || 0;
      document.getElementById(`avail-${t}`).innerText = formatCompact(maxTroops); 
      document.getElementById(`send-${t}`).max = maxTroops; 
      document.getElementById(`send-${t}`).value = 0; 
      document.getElementById(`slider-${t}`).max = maxTroops; 
      document.getElementById(`slider-${t}`).value = 0; 
      unlockCount++;
    } else { document.getElementById(`row-${t}`).style.display = 'none'; }
  });
  document.getElementById('troop-lock-msg').style.display = unlockCount < 3 ? 'block' : 'none';
  document.getElementById("action-modal").style.display='flex';
});

document.getElementById("btn-confirm-action").addEventListener('click', async () => {
  if (myData && myData.isBanned) return; // 👈 加上這行：被封鎖者禁止發送部隊
  if (!targetAction) return;
    if (targetAction.type.startsWith('attack')) {
        if (myData.shieldEndsAt && myData.shieldEndsAt > Date.now()) {
            const confirmBreak = confirm("⚠️ 警告：發動軍事行動將會【立刻解除】您的和平護盾！確定要出兵嗎？");
            if (!confirmBreak) return;
            myData.shieldEndsAt = 0;
            await savePrivateData();
            window.renderSelf();
        }
    }

if (targetAction.type === 'relocate') {
    if (myData.wood < targetAction.cost || myData.iron < targetAction.cost || myData.food < targetAction.cost) return alert(`資源不足！需要各 ${targetAction.cost} 資源。`);
    myData.wood -= targetAction.cost; myData.iron -= targetAction.cost; myData.food -= targetAction.cost;
    myData.x = targetAction.x; myData.y = targetAction.y;
    myData.lastRelocateTime = Date.now();
    myData.logs.unshift(`[遷城] 傳送至 (${targetAction.x}, ${targetAction.y})`);
    
    await savePrivateData(); 
    try { await setDoc(doc(db, "world_map", myUid), { x: myData.x, y: myData.y }, { merge: true }); } catch(e){}
    
    window.closeActionModal(); 
    updateFogOfWar(); 
    centerCameraOn(myData.x, myData.y); 
    try { window.renderSelf(); } catch(e){} 
    window.refreshMap(); 
    return;
  }

  if (myData.marches && myData.marches.length >= 3) {
      return alert("⚔️ 您的行軍隊列已滿 (最多 3 隊)！請等待部隊返回。");
  }

  const sendInf = parseInt(document.getElementById('send-inf').value)||0;
  const sendArc = parseInt(document.getElementById('send-arc').value)||0;
  const sendCav = parseInt(document.getElementById('send-cav').value)||0;
  
  if (sendInf===0 && sendArc===0 && sendCav===0) return alert("請派遣部隊！");
  if (sendInf > myData.troops.infantry || sendArc > myData.troops.archer || sendCav > myData.troops.cavalry) return alert("兵力不足！");
  
  let spd = 2; 
  if (sendInf > 0) spd = Math.max(spd, CFG.troops.infantry.speed);
  if (sendArc > 0) spd = Math.max(spd, CFG.troops.archer.speed);
  
  // 💡 這裡必須使用 let，才能在下方重新賦值
  let timeMs = Math.ceil(targetAction.dist * spd * 1000);
  myData.troops.infantry -= sendInf; myData.troops.archer -= sendArc; myData.troops.cavalry -= sendCav;

  // 🐎 套用【急行軍隊】科技加成：每級提速 8%
  const speedTechLv = (myData.research && myData.research.march_speed) || 0;
  const speedMult = 1 + (speedTechLv * 0.08);
  timeMs = Math.ceil(timeMs / speedMult); // 縮短行軍時間毫秒數

  const newMarch = {
    id: 'M'+Date.now(), type: targetAction.type, startX: myData.x, startY: myData.y, targetX: targetAction.x, targetY: targetAction.y,
    startTime: Date.now(), finishesAt: Date.now()+timeMs, troops: { infantry: sendInf, archer: sendArc, cavalry: sendCav }, techs: myData.research
  };
  if (targetAction.entity) newMarch.entity = targetAction.entity;
  if (targetAction.targetUid) newMarch.targetUid = targetAction.targetUid;
  if (targetAction.npcPower) newMarch.npcPower = targetAction.npcPower;
  if (targetAction.name) newMarch.targetName = targetAction.name;

  myData.marches.push(newMarch);

  myData.logs.unshift(`[出征] 預計 ${formatTime(Math.ceil(timeMs/1000))} 後抵達。`);
  await savePrivateData(); 
  try{ await setDoc(doc(db, "world_map", myUid), { troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry }, { merge: true }); }catch(e){}
  window.closeActionModal(); 
  try{window.renderSelf();}catch(e){}
});

function genCard(title, lvl, info, resStr, progHtml, btnHtml) {
  return `<div class="item-card"><div style="flex:1"><strong style="font-size:1.05rem;">${title}</strong> <span style="color:#fbbf24;">Lv.${lvl}</span><div style="font-size:0.8rem;color:#94a3b8;margin:4px 0">${info}</div><div class="item-cost">${resStr}</div></div><div style="width:100px;text-align:right">${progHtml}${btnHtml}</div></div>`;
}

window.renderSelf = function() {
  if (myData.isBanned) return;
  try {
      const now = Date.now();
      const isShielded = myData.shieldEndsAt && myData.shieldEndsAt > now;
      const shieldText = isShielded ? `🛡️ 護盾中 (${formatTime(Math.ceil((myData.shieldEndsAt - now)/1000))})` : '';
      
      const titleEl = document.getElementById('player-title');
      if(titleEl) titleEl.innerHTML = `<span>👑 ${myData.name} <span style="color:#fbbf24; font-size:0.95rem;">(Lv.${myData.buildings.castle || 1})</span> <span style="font-size:0.85rem; color:#94a3b8;">(${myData.x}, ${myData.y})</span></span> <span id="shield-status-text" style="font-size:0.85rem; color:#06b6d4; font-weight:bold;">${shieldText}</span>`;
      
      const hrToSec = 3600;
      const upkeepPerHr = (myData.troops.infantry||0)*CFG.troops.infantry.upkeep + (myData.troops.archer||0)*CFG.troops.archer.upkeep + (myData.troops.cavalry||0)*CFG.troops.cavalry.upkeep;
      const woodProdPerHr = CFG.buildings.lumber.rate * (myData.buildings.lumber||1) * hrToSec;
      const ironProdPerHr = CFG.buildings.mine.rate * (myData.buildings.mine||1) * hrToSec;
      const farmProdPerSec = CFG.buildings.farm.rate * (myData.buildings.farm||1) * hrToSec;
      const netFood = farmProdPerSec - upkeepPerHr;

      if(document.getElementById('res-wood')) document.getElementById('res-wood').innerText = formatCompact(myData.wood); 
      if(document.getElementById('rate-wood')) document.getElementById('rate-wood').innerText = `+${formatCompact(woodProdPerHr)}/h`;
      if(document.getElementById('res-iron')) document.getElementById('res-iron').innerText = formatCompact(myData.iron); 
      if(document.getElementById('rate-iron')) document.getElementById('rate-iron').innerText = `+${formatCompact(ironProdPerHr)}/h`;
      if(document.getElementById('res-food')) document.getElementById('res-food').innerText = formatCompact(myData.food); 
      if(document.getElementById('rate-food')) {
          document.getElementById('rate-food').innerText = `${netFood>=0?'+':''}${formatCompact(Math.abs(netFood))}/h`;
          document.getElementById('rate-food').style.color = netFood>=0 ? '#10b981' : '#ef4444';
      }

      if(document.getElementById('res-inf')) document.getElementById('res-inf').innerText = formatCompact(myData.troops.infantry||0); 
      if(document.getElementById('res-arc')) document.getElementById('res-arc').innerText = formatCompact(myData.troops.archer||0); 
      if(document.getElementById('res-cav')) document.getElementById('res-cav').innerText = formatCompact(myData.troops.cavalry||0);

      const maxQueues = 1 + (myData.buildings.builder || 0);
      const bqText = document.getElementById('build-queue-text');
      if(bqText) bqText.innerText = `(${myData.buildQueues.length}/${maxQueues})`;

      const tasksContainer = document.getElementById('active-tasks-container');
      if (tasksContainer) {
          let tasksHtml = '';
          myData.buildQueues.forEach((q, idx) => {
             if (!q || !CFG.buildings[q.target]) return;
             const remainSec = Math.max(0, Math.ceil((q.finishesAt - now) / 1000));
             const totalSec = getUpgradeTime(q.target, myData.buildings[q.target]);
             const pct = Math.min(100, Math.max(0, 100 - (remainSec / totalSec * 100)));
             tasksHtml += `
                <div class="task-row" style="flex-direction: column; align-items: stretch;">
                   <div style="display:flex; justify-content:space-between;">
                       <span class="task-title" style="flex:1;">🏗️ 升級: ${CFG.buildings[q.target].name}</span>
                       <span class="task-time">倒數: ${formatTime(remainSec)}</span>
                   </div>
                   <div class="task-bar-bg"><div class="task-bar-fill" style="width:${pct}%;"></div></div>
                   <div class="speed-btn-group">
                       <button onclick="window.useSpeedUp('build', ${idx}, '5m')" style="background:#10b981;">⚡5分</button>
                       <button onclick="window.useSpeedUp('build', ${idx}, '30m')" style="background:#059669;">⚡30分</button>
                       <button onclick="window.useSpeedUp('build', ${idx}, '1h')" style="background:#047857;">⚡1小時</button>
                   </div>
                </div>
             `;
          });
          if (myData.researchQueue && myData.researchQueue.target && CFG.techs[myData.researchQueue.target]) {
             const q = myData.researchQueue;
             const remainSec = Math.max(0, Math.ceil((q.finishesAt - now) / 1000));
             const totalSec = getUpgradeTime(q.target, myData.research[q.target] || 0, true);
             const pct = Math.min(100, Math.max(0, 100 - (remainSec / totalSec * 100)));
             tasksHtml += `
                <div class="task-row" style="flex-direction: column; align-items: stretch;">
                   <div style="display:flex; justify-content:space-between;">
                       <span class="task-title" style="flex:1;">🧪 研發: ${CFG.techs[q.target].name}</span>
                       <span class="task-time">倒數: ${formatTime(remainSec)}</span>
                   </div>
                   <div class="task-bar-bg"><div class="task-bar-fill" style="width:${pct}%;"></div></div>
                   <div class="speed-btn-group">
                       <button onclick="window.useSpeedUp('research', 0, '5m')" style="background:#10b981;">⚡5分</button>
                       <button onclick="window.useSpeedUp('research', 0, '30m')" style="background:#059669;">⚡30分</button>
                       <button onclick="window.useSpeedUp('research', 0, '1h')" style="background:#047857;">⚡1小時</button>
                   </div>
                </div>
             `;
          }
          if (myData.trainQueue && myData.trainQueue.type && CFG.troops[myData.trainQueue.type]) {
             const q = myData.trainQueue;
             const remainSec = Math.max(0, Math.ceil((q.finishesAt - now) / 1000));
             const totalSec = CFG.troops[q.type].time * q.count;
             const pct = Math.min(100, Math.max(0, 100 - (remainSec / totalSec * 100)));
             tasksHtml += `
                <div class="task-row" style="flex-direction: column; align-items: stretch;">
                   <div style="display:flex; justify-content:space-between;">
                       <span class="task-title" style="flex:1;">⚔️ 招募: ${CFG.troops[q.type].name}</span>
                       <span class="task-time">倒數: ${formatTime(remainSec)}</span>
                   </div>
                   <div class="task-bar-bg"><div class="task-bar-fill" style="width:${pct}%;"></div></div>
                   <div class="speed-btn-group">
                       <button onclick="window.useSpeedUp('train', 0, '5m')" style="background:#10b981;">⚡5分</button>
                       <button onclick="window.useSpeedUp('train', 0, '30m')" style="background:#059669;">⚡30分</button>
                       <button onclick="window.useSpeedUp('train', 0, '1h')" style="background:#047857;">⚡1小時</button>
                   </div>
                </div>
             `;
          }
          if (tasksHtml === '') tasksHtml = '<p style="color:#94a3b8; font-size:0.85rem; text-align:center;">目前無進行中的任務</p>';
          tasksContainer.innerHTML = tasksHtml;
      }

      if(document.getElementById('inv-shield')) document.getElementById('inv-shield').innerText = myData.items.shieldCard || 0;
      if(document.getElementById('inv-speed5m')) document.getElementById('inv-speed5m').innerText = myData.items.speedup5m || 0;
      if(document.getElementById('inv-speed30m')) document.getElementById('inv-speed30m').innerText = myData.items.speedup30m || 0;
      if(document.getElementById('inv-speed1h')) document.getElementById('inv-speed1h').innerText = myData.items.speedup1h || 0;
      if(document.getElementById('inv-rename')) document.getElementById('inv-rename').innerText = myData.items.renameCard || 0;
      if(document.getElementById('inv-resource')) document.getElementById('inv-resource').innerText = myData.items.resourceCard || 0;

      const bContainer = document.getElementById('building-container');
      if (bContainer) {
          bContainer.innerHTML = Object.keys(CFG.buildings).map(key => {
            const lvl = myData.buildings[key] || 0;
            const cost = getUpgradeCost(key, lvl);
            const timeSec = getUpgradeTime(key, lvl);
            const queueObj = myData.buildQueues.find(q => q && q.target === key);
            const isMax = (key === 'builder' && lvl >= CFG.buildings.builder.maxLevel);
            const disabled = isMax || queueObj || myData.buildQueues.length >= maxQueues;
            
            let btnHtml = ''; let progressHtml = '';
            if (queueObj) {
                const remainSec = Math.max(0, Math.ceil((queueObj.finishesAt - now) / 1000));
                const pct = Math.min(100, Math.max(0, 100 - (remainSec / timeSec * 100)));
                btnHtml = `<span style="font-size:0.8rem; color:#facc15; text-align:center; display:block;">升級中 (${formatTime(remainSec)})</span>`;
                progressHtml = `<div class="progress-bar-bg" style="display:block;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>`;
            } else {
                btnHtml = `<button class="btn-upgrade" style="background:${isMax?'#475569':'#2563eb'};" onclick="window.upgradeBuilding('${key}')" ${disabled?'disabled':''}>${isMax?'已達上限':`升級 (${formatTime(timeSec)})`}</button>`;
            }

            return genCard(CFG.buildings[key].name, lvl, `<span style="color:#60a5fa;">${CFG.buildings[key].desc}</span><br>升級需 ${formatTime(timeSec)}`, `🌲${formatCompact(cost.w)} ⛏️${formatCompact(cost.i)}`, progressHtml, btnHtml);
          }).join('');
      }

      const rContainer = document.getElementById('research-container');
      if (rContainer) {
          if (myData.buildings.academy < 1) {
              rContainer.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem; padding:10px;">請先建造並升級【學院】來解鎖科技研發。</p>';
          } else {
              rContainer.innerHTML = Object.keys(CFG.techs).map(key => {
                  const d = CFG.techs[key];
                  const lvl = myData.research[key] || 0;
                  const cost = getUpgradeCost(key, lvl, true);
                  const timeSec = getUpgradeTime(key, lvl, true);
                  const isResearching = myData.researchQueue && myData.researchQueue.target === key;
                  const isMax = lvl >= myData.buildings.academy * 2;
                  
                  let btnHtml = ''; let progressHtml = '';
                  if (isResearching) {
                      const remainSec = Math.max(0, Math.ceil((myData.researchQueue.finishesAt - now) / 1000));
                      const pct = Math.min(100, Math.max(0, 100 - (remainSec / timeSec * 100)));
                      btnHtml = `<span style="font-size:0.8rem; color:#facc15; text-align:center; display:block;">研發中 (${formatTime(remainSec)})</span>`;
                      progressHtml = `<div class="progress-bar-bg" style="display:block;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>`;
                  } else {
                      btnHtml = `<button class="btn-upgrade" style="background:${isMax?'#475569':'#2563eb'}" onclick="window.startResearch('${key}')" ${isMax || myData.researchQueue?'disabled':''}>${isMax?'學院等級不足':`研發 (${formatTime(timeSec)})`}</button>`;
                  }

                  // 💡 取得科技的動態加成文字
                  const effectText = typeof getTechEffectText === 'function' ? getTechEffectText(key, lvl) : `效果等級: ${lvl}`;

                  // 💡 將原本寫死的 "附加戰力" 替換成 "功能描述" + "具體數值加成"
                  const detailHtml = `<span style="color:#94a3b8; font-size:0.75rem;">${d.desc || ''}</span><br/><span style="color:#34d399; font-weight:bold; font-size:0.8rem;">✨ ${effectText}</span>`;

                  return genCard(`${d.icon} ${d.name}`, lvl, detailHtml, `🌲${formatCompact(cost.w)} ⛏️${formatCompact(cost.i)}`, progressHtml, btnHtml);
              }).join('');
          }
      }

      const tContainer = document.getElementById('train-container');
      if (tContainer) {
          const bLvl = myData.buildings.barracks || 1;
          tContainer.innerHTML = Object.keys(CFG.troops).map(key => {
              const d = CFG.troops[key];
              
              if (bLvl < d.reqLvl) {
                  return `<div class="item-card" style="opacity:0.5; justify-content:flex-start;"><div><strong style="font-size:1.05rem;">🔒 未解鎖</strong><div style="font-size:0.8rem;color:#94a3b8;margin:4px 0">需 兵營 Lv.${d.reqLvl}</div></div><div style="width:100px;text-align:right"><button class="btn-upgrade" style="background:#475569;" disabled>未解鎖</button></div></div>`;
              }
              
              const buff = myData.research[`${key}_atk`] || 0;
              const isTraining = myData.trainQueue && myData.trainQueue.type === key;
              
              const trainCount = bLvl * 5; 
              const totalTime = d.time * trainCount;
              
              let btnHtml = ''; let progressHtml = '';
              
              if (isTraining) {
                  const remainSec = Math.max(0, Math.ceil((myData.trainQueue.finishesAt - now) / 1000));
                  const pct = Math.min(100, Math.max(0, 100 - (remainSec / totalTime * 100)));
                  btnHtml = `<span style="font-size:0.8rem; color:#facc15; text-align:center; display:block;">招募中 (${formatTime(remainSec)})</span>`;
                  progressHtml = `<div class="progress-bar-bg" style="display:block;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>`;
              } else {
                  btnHtml = `<button class="btn-upgrade" style="background:#059669;" onclick="window.trainTroopType('${key}')" ${myData.trainQueue?'disabled':''}>招募 ${formatCompact(trainCount)}名 (${formatTime(totalTime)})</button>`;
              }

              return genCard(`${d.icon} ${d.name}`, 0, `戰力: ${d.pwr}<span style="color:#10b981;">+${buff}</span> | 耗糧: 🌾${d.upkeep}/h`, `🌲${formatCompact(d.w * trainCount)} ⛏️${formatCompact(d.i * trainCount)} 🌾${formatCompact(d.f * trainCount)}`, progressHtml, btnHtml);
          }).join('');
      }

      const logList = document.getElementById('log-list');
      if (logList && myData.logs) logList.innerHTML = myData.logs.slice(0, 8).map(l => `<p>${l}</p>`).join('');

  } catch (e) {
      console.error("UI 渲染嚴重錯誤:", e);
  }
}

window.useResourceCard = async () => {
    if (!myData || myData.items.resourceCard <= 0) return alert("背包中沒有足夠的軍用物資卡！");
    myData.items.resourceCard--;
    const gain = 100000; 
    myData.wood += gain;
    myData.iron += gain;
    myData.food += gain;
    myData.logs.unshift(`[後勤補給] 成功開啟物資卡，獲得各項資源 ${formatCompact(gain)}！`);
    await savePrivateData();
    alert(`📦 開啟成功！\n獲得 木材/鐵礦/糧草 各 ${formatCompact(gain)}`);
    try { window.renderSelf(); } catch(e){}
};

window.useSpeedUp = async (type, idx = 0, speedType = '5m') => {
  if (!myData) return;
  const timeReduce = speedType === '1h' ? 3600000 : (speedType === '30m' ? 1800000 : 300000);
  const itemKey = speedType === '1h' ? 'speedup1h' : (speedType === '30m' ? 'speedup30m' : 'speedup5m');

  if (myData.items[itemKey] <= 0) return alert(`您沒有足夠的 [${speedType}] 加速道具！`);
  
  if (type === 'build') {
    if (myData.buildQueues.length === 0 || !myData.buildQueues[idx]) return alert("沒有進行中的建築隊列！");
    myData.items[itemKey]--;
    myData.buildQueues[idx].finishesAt -= timeReduce; 
    if (myData.buildQueues[idx].finishesAt < Date.now()) myData.buildQueues[idx].finishesAt = Date.now();
  } else if (type === 'research') {
    if (!myData.researchQueue) return alert("沒有進行中的研發隊列！");
    myData.items[itemKey]--;
    myData.researchQueue.finishesAt -= timeReduce; 
    if (myData.researchQueue.finishesAt < Date.now()) myData.researchQueue.finishesAt = Date.now();
  } else {
    if (!myData.trainQueue) return alert("該項目沒有進行中的隊列！");
    myData.items[itemKey]--;
    myData.trainQueue.finishesAt -= timeReduce; 
    if (myData.trainQueue.finishesAt < Date.now()) myData.trainQueue.finishesAt = Date.now();
  }
  await savePrivateData();
};

window.useShield = async () => {
  if (myData.items.shieldCard <= 0) return alert('背包中沒有和平護盾！');
  const now = Date.now();
  if (myData.shieldEndsAt && myData.shieldEndsAt > now) {
     if(!confirm('目前護盾依然有效，確定要覆蓋並重新計算 6 小時嗎？')) return;
  }
  myData.items.shieldCard--;
  myData.shieldEndsAt = now + 6 * 3600 * 1000;
  myData.logs.unshift(`[防禦系統] 啟動和平護盾，領地 6 小時內將免受攻擊！`);
  await savePrivateData();
  try{ await setDoc(doc(db, "world_map", myUid), { shieldEndsAt: myData.shieldEndsAt }, { merge: true }); }catch(e){}
  alert('🛡️ 護盾已啟動！');
  try{ window.renderSelf(); }catch(e){} window.refreshMap();
};

window.openRenameModal = () => { document.getElementById("rename-modal").style.display='flex'; };
window.closeRenameModal = () => { document.getElementById("rename-modal").style.display='none'; };
window.confirmRename = async () => {
  const newName = document.getElementById('rename-input').value.trim();
  if(newName.length < 2 || newName.length > 8) return alert('名字長度需為 2~8 字元！');
  if (!myData.freeRenameUsed) myData.freeRenameUsed = true;
  else if (myData.items.renameCard > 0) myData.items.renameCard--; else return alert('需要改名卡！');
  myData.name = newName; await savePrivateData(); try{await setDoc(doc(db, "world_map", myUid), { name: newName }, { merge: true });}catch(e){}
  alert("✅ 名稱已更改！"); window.closeRenameModal(); try{ window.renderSelf(); }catch(e){} window.refreshMap();
};

window.locateHome = () => { 
  if (myData) { 
      window.switchTab('world'); 
      setTimeout(() => { centerCameraOn(myData.x, myData.y); }, 60); 
  }
};
window.upgradeBuilding = async (key) => {
  const maxQueues = 1 + (myData.buildings.builder || 0);
  if (myData.buildQueues.some(q => q && q.target === key)) return alert('該設施正在升級中！');
  if (myData.buildQueues.length >= maxQueues) return alert('建築隊列已滿！請升級工匠小屋。');
  
  const lvl = myData.buildings[key], cost = getUpgradeCost(key, lvl);
  if (myData.wood < cost.w || myData.iron < cost.i) return alert('資源不足！');
  const timeSec = getUpgradeTime(key, lvl);
  myData.wood -= cost.w; myData.iron -= cost.i; 
  myData.buildQueues.push({ target: key, finishesAt: Date.now() + timeSec * 1000 }); 
  await savePrivateData();
};

window.startResearch = async (key) => {
  if (myData.researchQueue) return alert('已有科技正在研發！');
  const lvl = myData.research[key] || 0;
  const cost = getUpgradeCost(key, lvl, true);
  if (myData.wood < cost.w || myData.iron < cost.i) return alert('資源不足！');
  const timeSec = getUpgradeTime(key, lvl, true);
  myData.wood -= cost.w; myData.iron -= cost.i;
  myData.researchQueue = { target: key, finishesAt: Date.now() + timeSec * 1000 };
  await savePrivateData();
};

window.trainTroopType = async (typeKey) => {
  if (myData.trainQueue) return alert('已有部隊正在招募！');
  const req = CFG.troops[typeKey];
  const bLvl = myData.buildings.barracks || 1;
  const trainCount = bLvl * 5;
  
  const costW = req.w * trainCount;
  const costI = req.i * trainCount;
  const costF = req.f * trainCount;

  if (bLvl < req.reqLvl) return alert('兵營等級不足！');
  if (myData.wood < costW || myData.iron < costI || myData.food < costF) return alert('資源不足！');
  
  myData.wood -= costW; myData.iron -= costI; myData.food -= costF;
  myData.trainQueue = { type: typeKey, count: trainCount, finishesAt: Date.now() + (req.time * trainCount * 1000) }; 
  await savePrivateData(); 
  window.renderSelf();
};

window.createAlliance = async () => {
    const name = document.getElementById('alliance-name-input').value.trim();
    if(name.length < 2 || name.length > 10) return alert("聯盟名稱需為 2~10 字元！");
    myData.allianceName = name; await savePrivateData();
    try { await setDoc(doc(db, "world_map", myUid), { allianceName: name }, { merge: true }); } catch(e){}
    window.renderAllianceUI(); alert(`✅ 成功創建聯盟【${name}】！`); window.refreshMap();
};

window.joinAlliance = async (targetName = null) => {
    const name = targetName || document.getElementById('alliance-name-input').value.trim();
    if(!name || name.length < 2) return alert("請輸入或選擇有效的聯盟名稱！");
    myData.allianceName = name; await savePrivateData();
    try { await setDoc(doc(db, "world_map", myUid), { allianceName: name }, { merge: true }); } catch(e){}
    window.renderAllianceUI(); alert(`✅ 成功加入聯盟【${name}】！`); window.refreshMap();
};

window.leaveAlliance = async () => {
    if(!confirm("確定要退出目前聯盟嗎？")) return;
    myData.allianceName = null; await savePrivateData();
    try { await setDoc(doc(db, "world_map", myUid), { allianceName: null }, { merge: true }); } catch(e){}
    window.renderAllianceUI(); alert("已退出聯盟。"); window.refreshMap();
};

window.renderAllianceUI = () => {
    const createBox = document.getElementById('alliance-create-box');
    const mainBox = document.getElementById('alliance-main-box');
    if(!createBox || !mainBox) return;

    if (myData && myData.allianceName) {
        createBox.style.display = 'none'; mainBox.style.display = 'block';
        document.getElementById('my-alliance-title').innerText = `🛡️ 聯盟：[${myData.allianceName}]`;
        document.getElementById('my-alliance-leader').innerText = "共享勢力";
        
        const allies = allCastles.filter(c => c.allianceName === myData.allianceName);
        let membersHtml = `<div style="background:#0a0f1d; padding:6px 10px; border-radius:4px; font-size:0.85rem; color:#10b981;">👤 ${myData.name} (自己)</div>`;
        allies.forEach(a => {
            membersHtml += `<div style="background:#1e293b; padding:6px 10px; border-radius:4px; font-size:0.85rem; color:#cbd5e1; display:flex; justify-content:space-between; margin-top:4px;">
                <span>👤 ${a.name} (Lv.${a.castleLevel||1})</span>
                <button onclick="window.locatePlayer(${a.x}, ${a.y})" style="background:#2563eb; padding:2px 8px; border-radius:4px; font-size:0.7rem;">📍 尋找</button>
            </div>`;
        });
        document.getElementById('alliance-members-list').innerHTML = membersHtml;
    } else {
        createBox.style.display = 'block'; mainBox.style.display = 'none';
        
        const allianceCounts = {};
        allCastles.forEach(c => {
            if (c.allianceName) {
                allianceCounts[c.allianceName] = (allianceCounts[c.allianceName] || 0) + 1;
            }
        });
        
        const pubList = document.getElementById('public-alliances-list');
        if (pubList) {
            const sortedAlliances = Object.keys(allianceCounts).sort((a,b) => allianceCounts[b] - allianceCounts[a]);
            
            if (sortedAlliances.length === 0) {
                pubList.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem; text-align:center; padding:10px;">伺服器尚無任何聯盟，趕快創立第一個吧！</p>';
            } else {
                let listHtml = '';
                sortedAlliances.forEach(aName => {
                    listHtml += `
                        <div style="background:#1e293b; padding:8px 12px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; border: 1px solid #334155;">
                            <div>
                                <div style="color:#38bdf8; font-weight:bold; font-size:0.95rem;">[${aName}]</div>
                                <div style="color:#94a3b8; font-size:0.75rem; margin-top:2px;">👥 成員數: ${allianceCounts[aName]} 人</div>
                            </div>
                            <button onclick="window.joinAlliance('${aName}')" style="background:#10b981; padding:6px 12px; font-size:0.85rem; font-weight:bold; border-radius:4px; cursor:pointer;">加入</button>
                        </div>
                    `;
                });
                pubList.innerHTML = listHtml;
            }
        }
    }
};

window.recallMarch = async (marchId) => {
    const mIdx = myData.marches.findIndex(x => x.id === marchId);
    if (mIdx === -1) return;
    
    let m = myData.marches[mIdx];
    if (!confirm("確定要立即召回這支部隊嗎？")) return;

    const now = Date.now();
    const dist = Math.hypot(myData.x - m.targetX, myData.y - m.targetY);
    let returnTimeMs = 0;
    
    if (m.type === 'gathering') {
        returnTimeMs = Math.ceil(dist * 3 * 1000); 
        try { 
            if (typeof deleteDoc !== 'undefined') await deleteDoc(doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`)); 
        } catch(e) { console.warn("資源點釋放略過"); }
    } else if (m.finishesAt > now) {
        returnTimeMs = now - m.startTime; 
    } else {
        returnTimeMs = Math.ceil(dist * 3 * 1000); 
    }

    m.type = 'return';
    m.isGathering = false; 
    m.startX = m.targetX;
    m.startY = m.targetY;
    m.targetX = myData.x;
    m.targetY = myData.y;
    m.startTime = now;
    m.finishesAt = now + returnTimeMs;
    m.timeFixed = true; 

    myData.logs.unshift(`🎺 [軍事] 已下達召回指令，部隊返回中！`);
    await savePrivateData();
    window.renderMarchHUD(); 
};

window.renderMarchHUD = function() {
    if (!myData || !myData.marches) return;
    
    let hud = document.getElementById('march-hud');
    if (!hud) {
        hud = document.createElement('div');
        hud.id = 'march-hud';
        document.body.appendChild(hud);
    }
    
    const isMobile = window.innerWidth < 768;
    hud.style.cssText = `
        position: fixed; 
        right: ${isMobile ? '2px' : '15px'}; 
        top: ${isMobile ? '50px' : '75px'}; 
        z-index: 9999; 
        width: 220px; 
        display: flex; 
        flex-direction: column; 
        gap: 6px; 
        pointer-events: none;
        transform: ${isMobile ? 'scale(0.8)' : 'none'};
        transform-origin: top right;
    `;
    
    if (myData.marches.length === 0) {
        hud.innerHTML = '';
        return;
    }
    
    const now = Date.now();
    let html = '';
    
    myData.marches.forEach(m => {
        const isReturning = m.type === 'return';
        let stateText = '🛡️ 行軍中'; let bgColor = 'rgba(30, 41, 59, 0.85)'; let icon = '🛡️';
        
        if (m.type === 'defend_npc' || m.type === 'npc_attack_node') {
            stateText = '🚨 敵軍來襲'; bgColor = 'rgba(69, 10, 10, 0.85)'; icon = '☠️';
        } else if (m.type === 'gathering') {
            stateText = '⛏️ 採集中'; icon = '⛏️'; bgColor = 'rgba(6, 78, 59, 0.85)';
        } else if (isReturning) {
            stateText = '⛺ 返回中'; icon = '⛺';
        } else if (m.type === 'attack_player') {
            stateText = '⚔️ 攻擊中'; icon = '⚔'; bgColor = 'rgba(127, 29, 29, 0.85)';
        }

        const remain = Math.max(0, Math.ceil((m.finishesAt - now)/1000));
        const canRecall = (m.type !== 'return' && m.type !== 'defend_npc' && m.type !== 'npc_attack_node');

        let timeDisplay = formatTime(remain);
        if (m.type === 'gathering' && remain === 0) {
            timeDisplay = '⛏ 作業中...';
        } else if (remain === 0) {
            timeDisplay = '⏳ 結算中...';
        }

        html += `
        <div style="background: ${bgColor}; border: 1px solid #334155; border-radius: 6px; padding: 8px; color: white; pointer-events: auto; backdrop-filter: blur(4px); box-shadow: 0 4px 6px rgba(0,0,0,0.6);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                <span style="font-size:0.95rem; font-weight:bold; color:#38bdf8; text-shadow: 1px 1px 2px black;">${icon} ${stateText}</span>
                <span style="font-size:0.95rem; color:#facc15; font-weight:bold; text-shadow: 1px 1px 2px black;">${timeDisplay}</span>
            </div>
            <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom: 6px;">目標: (${m.targetX}, ${m.targetY})</div>
            <div style="display:flex; gap:6px;">
                <button onclick="window.locatePlayer(${m.targetX}, ${m.targetY})" style="flex:1; background:#2563eb; border:1px solid #1d4ed8; color:white; border-radius:4px; padding:6px; font-size:0.8rem; cursor:pointer; font-weight:bold;">📍 鎖定</button>
                ${canRecall ? `<button onclick="window.recallMarch('${m.id}')" style="flex:1; background:#d97706; border:1px solid #b45309; color:white; border-radius:4px; padding:6px; font-size:0.8rem; cursor:pointer; font-weight:bold;">🎺 召回</button>` : ''}
            </div>
        </div>`;
    });
    
    hud.innerHTML = html;
};
// ==========================================
// 💡 側邊按鈕、戰報與任務系統 UI 引擎
// ==========================================
window.renderSideMenu = function() {
    if (document.getElementById('side-menu-hud')) return;
    const div = document.createElement('div');
    div.id = 'side-menu-hud';
    div.style.cssText = 'position:fixed; left:10px; top:80px; z-index:9990; display:flex; flex-direction:column; gap:10px;';
    div.innerHTML = `
        <button id="btn-float-hospital" onclick="window.openHospitalModal()" style="background:#1e293b; border:1px solid #ef4444; color:white; padding:8px 12px; border-radius:8px; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.5); cursor:pointer;">🏥 醫療所</button>
        <button id="btn-float-report" onclick="window.openReportModal()" style="background:#1e293b; border:1px solid #3b82f6; color:white; padding:8px 12px; border-radius:8px; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.5); cursor:pointer;">📬 戰報</button>
        <button id="btn-float-quest" onclick="window.openQuestModal()" style="background:#1e293b; border:1px solid #10b981; color:white; padding:8px 12px; border-radius:8px; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.5); cursor:pointer;">🎯 任務</button>
    `;
    document.body.appendChild(div);
};

window.addReport = function(title, text, isWin = true) {
    if (!myData) return;
    if (!myData.reports) myData.reports = [];
    myData.reports.unshift({ id: 'RPT_'+Date.now(), title, text, isWin, time: Date.now() });
    if (myData.reports.length > 30) myData.reports.pop();
    const btn = document.getElementById('btn-float-report');
    if (btn) btn.innerHTML = '📬 戰報 <span style="background:red; color:white; border-radius:50%; padding:2px 6px; font-size:10px;">新</span>';
};

window.openReportModal = () => {
    let modal = document.getElementById('report-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; display:flex; justify-content:center; align-items:center;';
        document.body.appendChild(modal);
    }
    
    let rHtml = (myData.reports || []).map(r => `
        <div style="background:#0f172a; border-left:4px solid ${r.isWin ? '#10b981' : '#ef4444'}; padding:10px; margin-bottom:10px; border-radius:4px;">
            <div style="font-weight:bold; color:${r.isWin ? '#10b981' : '#ef4444'};">${r.title}</div>
            <div style="font-size:0.75rem; color:#94a3b8; margin:4px 0;">${new Date(r.time).toLocaleString()}</div>
            <div style="font-size:0.85rem; white-space:pre-wrap; color:#cbd5e1; line-height:1.4;">${r.text}</div>
        </div>
    `).join('');
    if (!rHtml) rHtml = '<p style="text-align:center; color:#94a3b8;">暫無戰報</p>';

    modal.innerHTML = `
    <div style="background:#1e293b; border:2px solid #3b82f6; border-radius:10px; width:320px; max-height:80vh; display:flex; flex-direction:column; color:white;">
        <h2 style="color:#38bdf8; margin:20px 20px 10px 20px;">📬 軍事戰報</h2>
        <div style="padding:0 20px; overflow-y:auto; flex:1;">${rHtml}</div>
        <div style="padding:20px;">
            <button onclick="document.getElementById('report-modal').style.display='none'; document.getElementById('btn-float-report').innerHTML='📬 戰報';" style="background:#ef4444; width:100%; padding:10px; font-weight:bold; border-radius:6px; cursor:pointer;">關閉</button>
        </div>
    </div>`;
    modal.style.display = 'flex';
};

window.openQuestModal = () => {
    let modal = document.getElementById('quest-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'quest-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; display:flex; justify-content:center; align-items:center;';
        document.body.appendChild(modal);
    }
    
    if (!myData.quests) return;
    const q = myData.quests.daily;
    const c = myData.quests.claimed;
    
    const q1Done = q.kills >= 3; const q1Claimed = c.includes('q1');
    const q2Done = q.upgrades >= 2; const q2Claimed = c.includes('q2');
    const q3Done = q.gather_wood >= 10000; const q3Claimed = c.includes('q3');

    // 💡 優化：把獎勵獨立寫在任務說明下方，讓玩家隨時都能看到！
    modal.innerHTML = `
    <div style="background:#1e293b; border:2px solid #10b981; border-radius:10px; width:300px; padding:20px; color:white;">
        <h2 style="color:#10b981; margin-top:0;">🎯 每日任務</h2>
        
        <div style="margin-bottom:10px; background:#0f172a; padding:10px; border-radius:6px; border-left: 4px solid #38bdf8;">
            <div style="font-weight:bold; color:#38bdf8; font-size:1.05rem;">⚔️ 擊殺野怪/敵軍 (${q.kills}/3)</div>
            <div style="font-size:0.85rem; color:#facc15; margin:6px 0;">🎁 獎勵：⚡5分加速 x 3</div>
            ${q1Claimed ? '<button disabled style="background:#475569; width:100%; border-radius:4px; padding:6px; border:none; color:#cbd5e1; font-weight:bold;">✅ 已領取</button>' : 
              (q1Done ? '<button onclick="window.claimQuest(\'q1\')" style="background:#10b981; width:100%; font-weight:bold; border-radius:4px; padding:6px; cursor:pointer; border:none; color:white;">領取獎勵</button>' : '<button disabled style="background:#334155; color:#94a3b8; width:100%; border-radius:4px; padding:6px; border:none; font-weight:bold;">未完成</button>')}
        </div>
        
        <div style="margin-bottom:10px; background:#0f172a; padding:10px; border-radius:6px; border-left: 4px solid #38bdf8;">
            <div style="font-weight:bold; color:#38bdf8; font-size:1.05rem;">🏗️ 升級任意建築 (${q.upgrades}/2)</div>
            <div style="font-size:0.85rem; color:#facc15; margin:6px 0;">🎁 獎勵：⚡1小時加速 x 1</div>
            ${q2Claimed ? '<button disabled style="background:#475569; width:100%; border-radius:4px; padding:6px; border:none; color:#cbd5e1; font-weight:bold;">✅ 已領取</button>' : 
              (q2Done ? '<button onclick="window.claimQuest(\'q2\')" style="background:#10b981; width:100%; font-weight:bold; border-radius:4px; padding:6px; cursor:pointer; border:none; color:white;">領取獎勵</button>' : '<button disabled style="background:#334155; color:#94a3b8; width:100%; border-radius:4px; padding:6px; border:none; font-weight:bold;">未完成</button>')}
        </div>
        
        <div style="margin-bottom:10px; background:#0f172a; padding:10px; border-radius:6px; border-left: 4px solid #38bdf8;">
            <div style="font-weight:bold; color:#38bdf8; font-size:1.05rem;">🌲 採集木材 (${formatCompact(q.gather_wood)} / 10K)</div>
            <div style="font-size:0.85rem; color:#facc15; margin:6px 0;">🎁 獎勵：📦 軍用物資卡 x 1</div>
            ${q3Claimed ? '<button disabled style="background:#475569; width:100%; border-radius:4px; padding:6px; border:none; color:#cbd5e1; font-weight:bold;">✅ 已領取</button>' : 
              (q3Done ? '<button onclick="window.claimQuest(\'q3\')" style="background:#10b981; width:100%; font-weight:bold; border-radius:4px; padding:6px; cursor:pointer; border:none; color:white;">領取獎勵</button>' : '<button disabled style="background:#334155; color:#94a3b8; width:100%; border-radius:4px; padding:6px; border:none; font-weight:bold;">未完成</button>')}
        </div>
        
        <button onclick="document.getElementById('quest-modal').style.display='none'" style="background:#ef4444; width:100%; padding:10px; font-weight:bold; border-radius:6px; margin-top:10px; cursor:pointer; border:none; color:white;">關閉</button>
    </div>`;
    modal.style.display = 'flex';
};

// 🛡️ 嚴格安全版：領取每日任務獎勵
window.claimQuest = async (qid) => {
    if (!myData || !myData.quests) return;
    const q = myData.quests.daily;
    
    // 💀 防駭客 1：檢查是否已經領取過，防止重複刷卡！
    if (myData.quests.claimed.includes(qid)) {
        return alert("⚠️ 系統警告：此獎勵已經領取過了，無法重複領取！");
    }
    
    // 💀 防駭客 2：嚴格檢查任務是否「真正達成」，防止用 F12 強制觸發！
    if (qid === 'q1' && q.kills < 3) return alert("⚠️ 非法操作：擊殺任務未達標！");
    if (qid === 'q2' && q.upgrades < 2) return alert("⚠️ 非法操作：升級任務未達標！");
    if (qid === 'q3' && q.gather_wood < 10000) return alert("⚠️ 非法操作：採集任務未達標！");

    // 通過所有驗證，正式發放獎勵
    myData.quests.claimed.push(qid);
    if (qid === 'q1') myData.items.speedup5m += 3;
    if (qid === 'q2') myData.items.speedup1h += 1;
    if (qid === 'q3') myData.items.resourceCard += 1;
    
    myData.logs.unshift(`[任務] 成功領取每日任務獎勵！`);
    await savePrivateData();
    window.openQuestModal();
    try{ window.renderSelf(); }catch(e){}
};
// ==========================================
// 💡 傷兵醫療與部隊負重核心系統
// ==========================================
window.addWounded = function(wInf, wArc, wCav) {
    const hospBonus = ((myData.research && myData.research.hospital_cap) || 0) * 3000;
    // 預設醫院容量：10,000 + (主城等級 * 5,000) + 科技加成
    let maxHosp = 10000 + (myData.buildings.castle || 1) * 5000 + hospBonus;
    let curHosp = (myData.wounded.infantry||0) + (myData.wounded.archer||0) + (myData.wounded.cavalry||0);
    let overflow = 0; // 因醫院爆滿而陣亡的數量

    let addTroop = (type, amount) => {
        let space = Math.max(0, maxHosp - curHosp);
        let toAdd = Math.min(amount, space);
        myData.wounded[type] = (myData.wounded[type] || 0) + toAdd;
        curHosp += toAdd;
        overflow += (amount - toAdd); // 裝不下的直接死亡
    };
    addTroop('infantry', wInf); addTroop('archer', wArc); addTroop('cavalry', wCav);
    return overflow; 
};

// 🎒 步兵負重 10, 弓兵負重 5, 騎兵負重 8
window.getLoadCapacity = function(troops) {
    let baseLoad = (troops.infantry||0)*10 + (troops.archer||0)*5 + (troops.cavalry||0)*8;
    let loadTechLv = (myData.research && myData.research.troop_load) || 0;
    return Math.floor(baseLoad * (1 + loadTechLv * 0.15));
};

window.openHospitalModal = () => {
    let modal = document.getElementById('hospital-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'hospital-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; display:flex; justify-content:center; align-items:center;';
        document.body.appendChild(modal);
    }
    
    if (!myData.wounded) myData.wounded = {infantry:0, archer:0, cavalry:0};
    let w = myData.wounded;
    let totalW = (w.infantry||0) + (w.archer||0) + (w.cavalry||0);
    const hospBonus = ((myData.research && myData.research.hospital_cap) || 0) * 3000;
    let maxHosp = 10000 + (myData.buildings.castle || 1) * 5000 + hospBonus;

    // 治療成本：每人 10 木材、15 糧食
    let costWood = totalW * 10; let costFood = totalW * 15;
    let canHeal = totalW > 0 && myData.wood >= costWood && myData.food >= costFood;

    modal.innerHTML = `
    <div style="background:#1e293b; border:2px solid #ef4444; border-radius:10px; width:300px; padding:20px; color:white;">
        <h2 style="color:#ef4444; margin-top:0;">🏥 醫療所</h2>
        <div style="background:#0f172a; padding:10px; border-radius:6px; margin-bottom:10px;">
            <div style="color:#94a3b8; font-size:0.85rem;">傷兵收容：${totalW} / ${maxHosp}</div>
            <div style="margin-top:10px; color:#fca5a5;">🛡️ 重傷步兵：${w.infantry||0}</div>
            <div style="color:#fca5a5;">🏹 重傷弓兵：${w.archer||0}</div>
            <div style="color:#fca5a5;">🐎 重傷騎兵：${w.cavalry||0}</div>
        </div>
        <div style="background:#0f172a; padding:10px; border-radius:6px; margin-bottom:10px;">
            <div style="font-weight:bold; color:#fbbf24;">治療所需物資：</div>
            <div>🌲 木材：${formatCompact(costWood)} ${myData.wood < costWood ? '❌' : '✅'}</div>
            <div>🌾 糧食：${formatCompact(costFood)} ${myData.food < costFood ? '❌' : '✅'}</div>
        </div>
        ${canHeal ? '<button onclick="window.healAllWounded()" style="background:#10b981; width:100%; font-weight:bold; border-radius:4px; padding:10px; cursor:pointer; border:none; color:white;">✨ 立即治療全部傷兵</button>' : '<button disabled style="background:#475569; width:100%; font-weight:bold; border-radius:4px; padding:10px; border:none; color:#94a3b8;">物資不足或無傷兵</button>'}
        <button onclick="document.getElementById('hospital-modal').style.display='none'" style="background:#ef4444; width:100%; padding:10px; font-weight:bold; border-radius:6px; margin-top:10px; cursor:pointer; border:none; color:white;">關閉</button>
    </div>`;
    modal.style.display = 'flex';
};

window.healAllWounded = async () => {
    let w = myData.wounded;
    let totalW = (w.infantry||0) + (w.archer||0) + (w.cavalry||0);
    let costWood = totalW * 10; let costFood = totalW * 15;
    if (myData.wood >= costWood && myData.food >= costFood) {
        myData.wood -= costWood; myData.food -= costFood;
        myData.troops.infantry += w.infantry; myData.troops.archer += w.archer; myData.troops.cavalry += w.cavalry;
        myData.wounded = {infantry:0, archer:0, cavalry:0};
        myData.logs.unshift(`[醫療] 成功治癒了 ${totalW} 名重傷士兵，部隊已歸隊！`);
        await savePrivateData(); window.openHospitalModal();
        try { window.renderSelf(); } catch(e){}
    }
};
// ==========================================
// 👑 VIP 系統：打開介面與領取獎勵
// ==========================================

window.openVipModal = function() {
    const modal = document.getElementById('vip-modal');
    const container = document.getElementById('vip-action-container');
    if (!modal || !container || !myData) return;

    // 如果 VIP 資料不存在，先初始化
    if (!myData.vip || typeof myData.vip !== 'object') {
        myData.vip = { isActive: false, expiresAt: 0, lastClaimed: "" };
    }

    // 檢查 VIP 是否過期
    if (myData.vip.isActive && Date.now() > myData.vip.expiresAt) {
        myData.vip.isActive = false; // 過期自動取消
    }

    if (myData.vip.isActive) {
        // ✅ 已經是 VIP，顯示領取按鈕
        const remainDays = Math.ceil((myData.vip.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        container.innerHTML = `
            <div style="color: #10b981; font-weight: bold; margin-bottom: 15px; font-size: 1.1rem;">
                ✅ 你的 VIP 剩餘 ${remainDays} 天
            </div>
            <button onclick="window.claimVipDaily()" style="width: 100%; padding: 14px; background: linear-gradient(to right, #f59e0b, #eab308); color: #000; border: none; border-radius: 8px; font-weight: bold; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                🎁 領取今日 VIP 獎勵
            </button>
        `;
    } else {
        // ❌ 還不是 VIP，顯示 PayMe 連結與備註提醒
        container.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                <p style="color: #fca5a5; font-size: 0.85rem; margin: 0; line-height: 1.4;">
                    請點擊下方 PayMe 連結付款，並在備註填寫你的<br>
                    <strong style="color: #fff; font-size: 1rem;">【玩家ID: ${myUid}】</strong><br>
                    管理員核對後將立即為您開通！
                </p>
            </div>
            <a href="https://payme.hsbc/0661b177b2f04214972535987915b5d6" target="_blank" 
               style="display: block; width: 100%; padding: 14px; background: #e3004f; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1.1rem; box-sizing: border-box; box-shadow: 0 4px 6px rgba(227, 0, 79, 0.3);">
               🔴 一按即 PayMe！
            </a>
        `;
    }
    modal.style.display = 'flex';
};

// 領取 VIP 每日獎勵
window.claimVipDaily = async function() {
    if (!myData.vip || !myData.vip.isActive) {
        return alert("你還不是 VIP 哦！");
    }
    
    const todayStr = new Date().toDateString();
    if (myData.vip.lastClaimed === todayStr) {
        return alert("今天已經領取過 VIP 專屬獎勵了，請明天再來！");
    }

    // 記錄今天已領取
    myData.vip.lastClaimed = todayStr;
    
    // 🎁 發送 VIP 每日豐厚獎勵
    myData.wood += 20000;
    myData.iron += 20000;
    myData.food += 20000;
    myData.items.speedup1h += 2;   // 1小時加速卡 x2
    myData.items.speedup30m += 4;  // 30分鐘加速卡 x4

    // 儲存資料到資料庫
    await savePrivateData();
    
    alert("🎉 成功領取 VIP 每日禮包！\n獲得：木/鐵/糧 x20000, 1小時加速卡x2, 30分鐘加速卡x4");
    
    // 關閉視窗並刷新畫面
    document.getElementById('vip-modal').style.display = 'none';
    if (typeof renderSelf === 'function') renderSelf();
};
// ==========================================
// 🛠️ 寫入資料庫邏輯：發放 VIP (同步寫入地圖版)
// ==========================================
window.adminSetVIP = async function(targetUid, days = 30) {
    const expiry = Date.now() + (days * 24 * 60 * 60 * 1000);
    
    // 準備好 VIP 資料
    const vipData = {
        isActive: true,
        expiresAt: expiry,
        lastClaimed: ""
    };
    
    try {
        // 1. 寫入 players 集合 (玩家私人資料，用來領取每日獎勵)
        await setDoc(doc(db, "players", targetUid), { vip: vipData }, { merge: true });
        
        // 2. 💡 寫入 world_map 集合 (公開地圖資料，這樣大地圖上才畫得出黃金城！)
        await setDoc(doc(db, "world_map", targetUid), { vip: vipData }, { merge: true });
        
        alert(`✅ 成功！\n已為玩家【${targetUid}】開通 30 天 VIP！`);
        
        // 自動刷新 GM 面板與大地圖，讓你馬上看到黃金城！
        if (typeof renderGMPlayers === 'function') renderGMPlayers();
        if (typeof window.refreshMap === 'function') window.refreshMap();
        
    } catch (e) {
        alert(`❌ 開通失敗：${e.message}`);
    }
};
// ==========================================
// 👑 玩家專用：VIP 介面與每日領獎邏輯
// ==========================================

window.openVipModal = function() {
    const modal = document.getElementById('vip-modal');
    const container = document.getElementById('vip-action-container');
    if (!modal || !container) return;

    // 檢查玩家目前的 VIP 狀態
    const vip = myData && myData.vip ? myData.vip : null;
    const now = Date.now();
    const isVip = vip && vip.isActive && vip.expiresAt > now;

    if (isVip) {
        // 🌟 身分為 VIP：計算剩餘天數
        const daysLeft = Math.ceil((vip.expiresAt - now) / (1000 * 60 * 60 * 24));
        
        // 檢查今天是否已經領過獎勵 (利用日期字串比對)
        const todayStr = new Date().toLocaleDateString();
        const alreadyClaimed = (vip.lastClaimed === todayStr);

        // 渲染 VIP 專屬介面 (顯示天數 + 領獎按鈕)
        container.innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                <h4 style="color: #10b981; margin: 0 0 5px 0;">👑 您的 VIP 已生效</h4>
                <p style="color: #cbd5e1; font-size: 0.85rem; margin: 0;">剩餘時間：<strong style="color: #facc15;">${daysLeft} 天</strong></p>
            </div>
            ${alreadyClaimed 
                ? `<button disabled style="background: #475569; color: #94a3b8; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; cursor: not-allowed;">✅ 今日已領取，明日再來</button>`
                : `<button onclick="window.claimVipReward()" style="background: linear-gradient(135deg, #10b981, #059669); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">🎁 領取今日豪華物資</button>`
            }
        `;
    } else {
        // ❌ 身分不是 VIP：顯示購買按鈕 (請把網址換成你的真實 PayMe 連結)
        container.innerHTML = `
            <button onclick="window.open('https://payme.hsbc/你的PayMe名稱', '_blank')" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                💳 前往 PayMe 購買 ($25)
            </button>
            <p style="color: #94a3b8; font-size: 0.75rem; margin-top: 10px;">付款時請在備註填寫您的 ID：<br><strong style="color: #facc15; font-size: 1.1rem; user-select: all;">${myUid}</strong></p>
        `;
    }
    
    // 顯示彈窗
    modal.style.display = 'flex';
};

// 🎁 點擊領獎的執行函數
window.claimVipReward = function() {
    // 雙重防護：確認真的有 VIP 且未過期
    if (!myData || !myData.vip || !myData.vip.isActive || myData.vip.expiresAt < Date.now()) return;
    
    const todayStr = new Date().toLocaleDateString();
    if (myData.vip.lastClaimed === todayStr) {
        alert("❌ 您今天已經領取過 VIP 獎勵了！");
        return;
    }

   // 💰 調整後的平衡版獎勵 (微量資源塞牙縫，重點給加速)
    myData.wood = (myData.wood || 0) + 5000;  // 從 20000 降到 5000
    myData.iron = (myData.iron || 0) + 5000;
    myData.food = (myData.food || 0) + 5000;
    
    if(!myData.items) myData.items = {};
    // 改給 2 張 30 分鐘加速，或者 1 張 1 小時加速，比較不會讓科技樹瞬間被秒升完
    myData.items.speed30m = (myData.items.speed30m || 0) + 2;

    // 標記今天已領取
    myData.vip.lastClaimed = todayStr;

    // 儲存進 Firebase (呼叫你原本的存檔函數)
    if (typeof savePrivateData === 'function') savePrivateData();
    
    alert("🎁 領取成功！\n獲得：木材 2w、鐵礦 2w、糧草 2w、1小時加速卡x2");
    
    // 重新渲染彈窗 (按鈕會立刻變成「✅ 今日已領取」)
    window.openVipModal();
};
