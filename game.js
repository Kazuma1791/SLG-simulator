// ==========================================
// 🛡️ 前端封印：禁止使用 F12 與右鍵 (防護小白作弊)
// ==========================================
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
document.addEventListener('keydown', function (e) {
    if (e.key === 'F12' || e.keyCode === 123) { e.preventDefault(); return false; }
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) { e.preventDefault(); return false; }
    if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) { e.preventDefault(); return false; }
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) { e.preventDefault(); return false; }
});
let devtools = function() {};
devtools.toString = function() {
    if (!window.isAdmin) alert("⚠️ 系統警告：嚴禁開啟開發者工具，您的行為已被記錄！");
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
    march_speed:  { name: '急行軍隊', icon: '🐎', desc: '提升全軍行軍速度 (+8%/級)', baseW: 300, baseI: 150, baseTime: 60 },
    troop_load:   { name: '輜重革新', icon: '🎒', desc: '提升部隊資源負重上限 (+15%/級)', baseW: 400, baseI: 100, baseTime: 90 },
    hospital_cap: { name: '戰地救護', icon: '🏥', desc: '提升醫療所傷兵收容容量 (+3,000/級)', baseW: 250, baseI: 250, baseTime: 60 }
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

function getUpgradeCost(key, level, isTech=false) { 
    const base = isTech ? CFG.techs[key] : CFG.buildings[key]; 
    if(!base) return {w:0, i:0, f:0};
    const curLv = level || 0;
    const m = Math.pow(1.62, curLv); 
    return { w: Math.floor((base.baseW || 100) * m), i: Math.floor((base.baseI || 80) * m), f: base.baseF ? Math.floor(base.baseF * m) : 0 }; 
}

function getTechEffectText(techKey, curLevel) {
  const lv = curLevel || 0;
  let nextText = "";
  
  if (lv > 0) {
      if (techKey === 'march_speed') nextText = " (下級: +" + ((lv + 1) * 8) + "%)";
      else if (techKey === 'troop_load') nextText = " (下級: +" + ((lv + 1) * 15) + "%)";
      else if (techKey === 'hospital_cap') nextText = " (下級: +" + ((lv + 1) * 3000).toLocaleString() + ")";
      else nextText = " (下級: +" + (lv + 1) + ")";
  }

  if (techKey === 'march_speed') return "行軍速度：+" + (lv * 8) + "%" + nextText;
  if (techKey === 'troop_load') return "部隊負重：+" + (lv * 15) + "%" + nextText;
  if (techKey === 'hospital_cap') return "傷兵上限：+" + (lv * 3000).toLocaleString() + nextText;
  if (techKey === 'infantry_atk' || techKey === 'archer_atk' || techKey === 'cavalry_atk') return "部隊戰力：+" + lv + nextText;
  return "";
} // 👈 就是漏了這個右括號！！！

window.openAcademyModal = function() {
  if (!myData) return;
  const modal = document.getElementById('academy-modal');
  const list = document.getElementById('academy-tech-list');
  if (!modal || !list) return;

  const isResearching = myData.researchQueue && myData.researchQueue.finishesAt > Date.now();
  let html = '';

  Object.keys(CFG.techs).forEach(k => {
    const t = CFG.techs[k];
    const curLv = (myData.research && myData.research[k]) ? myData.research[k] : 0;
    const cost = getUpgradeCost(k, curLv, true);
    const timeSec = getUpgradeTime(k, curLv, true);
    const effectText = getTechEffectText(k, curLv);
    
    let hasRes = false;
    if (myData.wood >= cost.w && myData.iron >= cost.i) {
        if (!cost.f || myData.food >= cost.f) {
            hasRes = true;
        }
    }
    const canUpgrade = !isResearching && hasRes;

    let foodHtml = "";
    if (cost.f) {
        foodHtml = "<span>🌾 糧草: " + formatCompact(cost.f) + "</span>";
    }

    let btnText = (isResearching && myData.researchQueue.target === k) ? '研發中' : '研發';
    let btnBg = canUpgrade ? '#3b82f6' : '#475569';
    let btnCursor = canUpgrade ? 'pointer' : 'not-allowed';
    let btnColor = canUpgrade ? '#ffffff' : '#94a3b8';
    
    let iconStr = t.icon ? t.icon : '🔬';

    html += `
      <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1; margin-right: 12px;">
          <div style="font-weight: bold; font-size: 15px; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
            <span>${iconStr}</span><span>${t.name}</span>
            <span style="font-size: 12px; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 1px 6px; border-radius: 4px;">Lv.${curLv}</span>
          </div>
          <div style="color: #94a3b8; font-size: 12px; margin-top: 4px;">${t.desc}</div>
          <div style="color: #34d399; font-size: 12px; font-weight: bold; margin-top: 4px;">✨ 當前效果: ${effectText}</div>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 6px; display: flex; gap: 8px;">
            <span>🪵 木材: ${formatCompact(cost.w)}</span><span>⛏️ 鐵礦: ${formatCompact(cost.i)}</span>
            ${foodHtml}<span>⏱ 耗時: ${formatTime(timeSec)}</span>
          </div>
        </div>
        <div>
          <button onclick="startResearch('${k}')" ${canUpgrade ? '' : 'disabled'} 
            style="padding: 8px 14px; border-radius: 6px; border: none; font-weight: bold; cursor: ${btnCursor}; background: ${btnBg}; color: ${btnColor};">
            ${btnText}
          </button>
        </div>
      </div>`;
  });

  list.innerHTML = html;
  modal.style.display = 'block';
};

function getUpgradeTime(key, level, isTech=false) { 
    const baseCfg = isTech ? CFG.techs[key] : CFG.buildings[key]; 
    if(!baseCfg) return 60;
    const base = baseCfg.baseTime || 60;
    const curLv = Math.max(0, (level||0) - 1);
    let calculatedTime = Math.floor(base * Math.pow(1.25, curLv));
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

  if (r < 0.002) return { type: 'npc_outpost', name: '🏕️ 黑暗前哨', reqPwr: 3000, loot: { wood: 15000, iron: 15000, food: 15000, speedup5m: 5 } };
  if (r < 0.010) return { type: 'barbarian', name: '👹 狂暴野蠻人', reqPwr: 800, loot: { iron: 8000, wood: 4000, food: 6000, speedup5m: 5 } };
  if (r < 0.060) {
      const typeRoll = (x * 13 + y * 31) % 3;
      const types = [{ t: 'res_farm', n: '🌾 農田', r: 'food' }, { t: 'res_lumber', n: '🌲 伐木場', r: 'wood' }, { t: 'res_mine', n: '⛏️ 鐵礦', r: 'iron' }];
      const pick = types[typeRoll];
      const lvRoll = (x * 47 + y * 83) % 100;
      let lv = 1; if (lvRoll >= 50) lv = 2; if (lvRoll >= 80) lv = 3; if (lvRoll >= 95) lv = 4; if (lvRoll === 99) lv = 5;
      const stats = { 1:{cap:10000,reqPwr:200}, 2:{cap:30000,reqPwr:1000}, 3:{cap:100000,reqPwr:5000}, 4:{cap:250000,reqPwr:15000}, 5:{cap:500000,reqPwr:40000} };
      return { type: pick.t, name: `${pick.n} Lv.${lv}`, res: pick.r, cap: stats[lv].cap, reqPwr: stats[lv].reqPwr };
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
  if (!myData.vip || typeof myData.vip !== 'object') myData.vip = { isActive: false, expiresAt: 0, lastClaimed: "" };
  if (myData.vip.isActive && Date.now() > myData.vip.expiresAt) myData.vip.isActive = false; 
    
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
  if (!Array.isArray(myData.dynamicNPCs)) myData.dynamicNPCs = [];
  if (typeof window.applyDynamicNPCs === 'function') window.applyDynamicNPCs();
}

function runAntiCheat() {
    if (isAdmin) return false;
    if (localStorage.getItem('SLG_DEATH_MARK') === 'true') {
        if (!myData.isBanned) {
            myData.isBanned = true; myData.banReason = "使用被封鎖的違規設備登入 (連坐處分)";
            setDoc(doc(db, "players", myUid), { isBanned: true, banReason: myData.banReason }, { merge: true });
        }
        document.getElementById('ban-screen').style.display = 'flex'; document.getElementById('ban-reason').innerText = "該設備已列入永久黑名單，禁止遊玩。";
        return true;
    }
    if (myData.isBanned) return true;
    let cheatDetected = false; let reason = "";
    const MAX_RESOURCE = 500000000; const MAX_TROOPS = 50000000; const MAX_ITEMS = 10000;
    const textRegex = /[<>"'`\\]/g;
    if (myData.name) myData.name = myData.name.replace(textRegex, "").substring(0, 12);
    if (myData.allianceName) myData.allianceName = myData.allianceName.replace(textRegex, "").substring(0, 10);
    ['wood', 'iron', 'food'].forEach(k => { 
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
        localStorage.setItem('SLG_DEATH_MARK', 'true');
        myData.isBanned = true; myData.banReason = reason;
        myData.cheatLog.unshift(`[${new Date().toLocaleString()}] 查獲: ${reason}`);
        setDoc(doc(db, "players", myUid), { isBanned: true, banReason: reason, cheatLog: myData.cheatLog }, { merge: true });
        document.getElementById('ban-screen').style.display = 'flex'; document.getElementById('ban-reason').innerText = reason;
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
  if (id === 'BOSS_CORE') { bx = 28; by = 135; n = '🌋 熔岩滅世魔龍'; hp = 500000; m = 20; } 
  else if (id === 'BOSS_MID_1') { bx = 55; by = 120; n = '🌪️️ 深海漩渦巨妖'; hp = 150000; m = 8; } 
  else if (id === 'BOSS_MID_2') { bx = 45; by = 35; n = '❄️ 凜冬風暴巨鷹'; hp = 150000; m = 8; } 
  else if (id === 'BOSS_MID_3') { bx = 160; by = 45; n = '🩸 猩紅樹魔'; hp = 150000; m = 8; } 
  else if (id === 'BOSS_MID_4') { bx = 160; by = 145; n = '🌑 腐化岩魔'; hp = 150000; m = 8; } 
  else {
      let overlap, tries = 0;
      do {
          overlap = false; tries++;
          bx = Math.floor(Math.random()*190+5); by = Math.floor(Math.random()*190+5);
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
  if (tabName === 'alliance') { window.renderAllianceUI(); }
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
          if (myData.clearDeviceBan) { localStorage.removeItem('SLG_DEATH_MARK'); myData.clearDeviceBan = false; }
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
        if (myData.clearDeviceBan) localStorage.removeItem('SLG_DEATH_MARK');
        else if (myData.triggerDeviceBan) localStorage.setItem('SLG_DEATH_MARK', 'true');

        if (myData.isBanned) { 
            document.getElementById('ban-screen').style.display = 'flex'; 
            document.getElementById('ban-reason').innerText = myData.banReason || "違反遊戲規章"; 
            return; 
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
        try { window.renderSideMenu(); } catch(e) { }
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
    if(a.shield) rStr.push(`🛡x${a.shield}`); 
    
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
        id: 'ANN_' + Date.now(), text: txt, 
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
  alert("已強制重生所有 世界 Boss！");
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
    
    if (action === 'ban') { tData.isBanned = true; tData.banReason = "管理員手動永久封鎖"; tData.triggerDeviceBan = true; tData.clearDeviceBan = false; }
    if (action === 'unban') { tData.isBanned = false; tData.banReason = ""; tData.triggerDeviceBan = false; tData.clearDeviceBan = true; }
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
    const amount = parseInt(rawAmount); 
    
    const targetRef = doc(db, "players", targetUid);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) return alert("找不到該名玩家！");
    let tData = targetSnap.data();
    
    tData.troops = tData.troops || {}; tData.items = tData.items || {};
    tData.buildings = tData.buildings || {}; tData.research = tData.research || {};
    let updatedMap = false; 

    if (['wood', 'iron', 'food'].includes(field)) { if (isNaN(amount)) return alert("請輸入正確數字"); tData[field] = amount; } 
    else if (['infantry', 'archer', 'cavalry'].includes(field)) { if (isNaN(amount)) return alert("請輸入正確數字"); tData.troops[field] = amount; updatedMap = true; } 
    else if (['speedup5m', 'speedup30m', 'speedup1h', 'shieldCard', 'renameCard', 'resourceCard'].includes(field)) { if (isNaN(amount)) return alert("請輸入正確數字"); tData.items[field] = amount; } 
    else if (CFG.buildings[field] || field === 'castleLevel') { if (isNaN(amount)) return alert("請輸入正確數字"); let bKey = field === 'castleLevel' ? 'castle' : field; tData.buildings[bKey] = amount; if (bKey === 'castle') updatedMap = true; } 
    else if (CFG.techs[field]) { if (isNaN(amount)) return alert("請輸入正確數字"); tData.research[field] = amount; } 
    else if (field === 'x' || field === 'y') { if (isNaN(amount)) return alert("請輸入正確數字"); tData[field] = amount; updatedMap = true; }
    else if (field === 'allianceName') { tData.allianceName = rawAmount === 'null' || rawAmount === '' ? null : rawAmount; updatedMap = true; } 
    else { return alert("未知的欄位名稱：" + field); }
    
    tData.logs = tData.logs || []; tData.logs.unshift(`[GM系統] 您的【${field}】資料已被手動修正。`);
    await setDoc(targetRef, tData, { merge: true });
    
    if (updatedMap) {
        let mapUpdate = {};
        if (['infantry', 'archer', 'cavalry'].includes(field)) mapUpdate.troops = (tData.troops.infantry||0) + (tData.troops.archer||0) + (tData.troops.cavalry||0);
        if (field === 'castleLevel' || field === 'castle') mapUpdate.castleLevel = amount;
        if (field === 'allianceName') mapUpdate.allianceName = tData.allianceName;
        if (field === 'x') mapUpdate.x = amount;
        if (field === 'y') mapUpdate.y = amount;
        await setDoc(doc(db, "world_map", targetUid), mapUpdate, { merge: true });
    }
    alert(`✅ 已成功修改！`);
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
      // 忽略系統公告與聯盟資料，不要當成城堡渲染
      if(d.id === 'announcement' || data.isAlliance) return; 
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
          <div style="display:flex; gap:6px;">
              <button onclick="event.stopPropagation(); window.locatePlayer(${p.x}, ${p.y})" style="background:#8b5cf6; padding:6px 10px; font-size:0.8rem; border-radius:4px; border:none; color:#fff;">📍 尋找</button>
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

  if (dt > 300) {
      const upkeepPerSec = (myData.troops.infantry*CFG.troops.infantry.upkeep + myData.troops.archer*CFG.troops.archer.upkeep + myData.troops.cavalry*CFG.troops.cavalry.upkeep) / 3600;
      const farmProdPerSec = CFG.buildings.farm.rate * myData.buildings.farm;
      const pW = Math.floor(dt * (CFG.buildings.lumber.rate * myData.buildings.lumber));
      const pI = Math.floor(dt * (CFG.buildings.mine.rate * myData.buildings.mine));
      const pF = Math.floor(dt * farmProdPerSec);
      const cF = Math.floor(dt * upkeepPerSec);
      
      let logMsg = `📴 [離線報告] 歡迎歸來！您離開了 ${formatTime(Math.floor(dt))}。領地產出: 🌲${formatCompact(pW)} ⛏️${formatCompact(pI)}`;
      if (pF >= cF) logMsg += ` 🌾+${formatCompact(pF - cF)} (扣除部隊消耗)`;
      else logMsg += ` 🌾-${formatCompact(cF - pF)} (糧草入不敷出)`;
      myData.logs.unshift(logMsg);
  }
  
  if (typeof window.renderMarchHUD === 'function') {
      window.renderMarchHUD();
      if (typeof window.renderSideMenu === 'function') window.renderSideMenu();
  }

  let cleanedMarches = [];
  let marchesChanged = false;

  for (let m of myData.marches) {
      if (m.type === 'attack_player' && now >= m.finishesAt) {
          const tC = allCastles.find(c => (c.id === m.targetUid || c.id === m.id));
          if (tC && tC.shieldEndsAt && tC.shieldEndsAt > now) {
              myData.logs.unshift(`🛡️️ [戰報] 目標【${tC.name}】已開啟護盾，部隊無法攻擊，自動折返！`);
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
      if (now - cTime > 3 * 24 * 60 * 60 * 1000) continue; // 延長原地點復活時間為 3 天 
    }
    newCleared.push(poi);
  }
  if (newCleared.length !== myData.clearedPOI.length) { myData.clearedPOI = newCleared; needSave = true; }

  let newBuildQueues = [];
  for (let q of myData.buildQueues) {
    if (now >= q.finishesAt) {
      if(CFG.buildings[q.target]) {
         myData.buildings[q.target]++;
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

  if (Math.random() < 0.005) {
    if (!myData.shieldEndsAt || myData.shieldEndsAt <= now) { 
      let nearestNPC = null, minDist = 15;
      for(let tx = Math.max(0, myData.x - 15); tx <= Math.min(WORLD_COLS-1, myData.x + 15); tx++) {
        for(let ty = Math.max(0, myData.y - 15); ty <= Math.min(WORLD_ROWS-1, myData.y + 15); ty++) {
          const cell = MAP_CACHE[tx] && MAP_CACHE[tx][ty];
          if (cell && cell.entity && (cell.entity.type.startsWith('npc_')) && !getClearedPOI(tx, ty)) {
            const dist = Math.hypot(tx - myData.x, ty - myData.y);
            if (dist < minDist) { minDist = dist; nearestNPC = {x: tx, y: ty, ent: cell.entity}; }
          }
        }
      }
      
      if (nearestNPC && !myData.marches.some(m => m.type === 'defend_npc' && m.startX === nearestNPC.x && m.startY === nearestNPC.y)) {
        const timeMs = Math.ceil(minDist * 4 * 1000); 
        const enemyPwr = Math.floor(200 + myData.buildings.castle * 250);
        myData.marches.push({
          id: 'M'+Date.now(), type: 'defend_npc', startX: nearestNPC.x, startY: nearestNPC.y, targetX: myData.x, targetY: myData.y,
          startTime: Date.now(), finishesAt: Date.now() + timeMs, npcPower: enemyPwr, npcName: nearestNPC.ent.name
        });
        myData.logs.unshift(`🚨 [警報] 【${nearestNPC.ent.name}】的劫掠部隊正朝我方進軍！預計 ${formatTime(Math.ceil(timeMs/1000))} 抵達！`);
        if(window.addReport) window.addReport(`🚨 敵襲警報`, `發現來自【${nearestNPC.ent.name}】的敵軍正朝主城進發！\n預估敵軍戰力：${formatCompact(enemyPwr)}\n\n(💡 請盡快招募士兵防禦，或在內政面板使用和平護盾！)`, false);
        needSave = true;
      }
    }
  }
// --- 🤖 NPC 模擬真人佔領資源系統 ---
  if (Math.random() < 0.05) { 
      if (!myData.npcMarches) myData.npcMarches = [];
      let npcList = [], resList = [];
      for(let tx = Math.max(0, myData.x - 15); tx <= Math.min(WORLD_COLS-1, myData.x + 15); tx++) {
          for(let ty = Math.max(0, myData.y - 15); ty <= Math.min(WORLD_ROWS-1, myData.y + 15); ty++) {
              const cell = MAP_CACHE[tx] && MAP_CACHE[tx][ty];
              if (!cell || !cell.entity || getClearedPOI(tx, ty)) continue;
              if (cell.entity.type.includes('npc_')) npcList.push({x: tx, y: ty, name: cell.entity.name.split(' ')[1] || 'NPC'});
              if (cell.entity.type.startsWith('res_')) resList.push({x: tx, y: ty});
          }
      }
      if (npcList.length > 0 && resList.length > 0 && myData.npcMarches.length < 4) {
          let rNpc = npcList[Math.floor(Math.random() * npcList.length)];
          let rRes = resList[Math.floor(Math.random() * resList.length)];
          // 確認該資源點沒有人正在採集
          if (!myData.npcMarches.some(m => m.targetX === rRes.x && m.targetY === rRes.y) && !myData.marches.some(m => m.targetX === rRes.x && m.targetY === rRes.y)) {
              let timeMs = Math.ceil(Math.hypot(rNpc.x - rRes.x, rNpc.y - rRes.y) * 5 * 1000); 
              myData.npcMarches.push({ id: 'NPCM_'+Date.now(), type: 'npc_gather', startX: rNpc.x, startY: rNpc.y, targetX: rRes.x, targetY: rRes.y, npcName: rNpc.name, startTime: now, finishesAt: now + timeMs });
              needSave = true;
          }
      }
  }
  if (myData.npcMarches) {
      let nextNpcMarches = [];
      myData.npcMarches.forEach(nm => {
          if (nm.type === 'npc_gather' && now >= nm.finishesAt) {
              nm.type = 'npc_gathering'; nm.finishesAt = now + 120000; // NPC 採集2分鐘就滿載
              nextNpcMarches.push(nm); needSave = true;
          } else if (nm.type === 'npc_gathering' && now >= nm.finishesAt) {
              myData.clearedPOI.push(`${nm.targetX},${nm.targetY},${now},res_gathered`);
              nm.type = 'npc_return'; nm.finishesAt = now + Math.ceil(Math.hypot(nm.startX-nm.targetX, nm.startY-nm.targetY) * 5 * 1000);
              let tx = nm.startX, ty = nm.startY; nm.startX = nm.targetX; nm.startY = nm.targetY; nm.targetX = tx; nm.targetY = ty;
              nextNpcMarches.push(nm); needSave = true;
          } else if (nm.type === 'npc_return' && now >= nm.finishesAt) {
              needSave = true; 
          } else { nextNpcMarches.push(nm); }
      });
      myData.npcMarches = nextNpcMarches;
  }
  // ----------------------------------
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
            const res = await resolveAttackPlayer_NEW(m);
            if (res.survived) newMarches.push(createReturnMarch(m, res.troops, res.loot)); 
        }
      else if (m.type === 'attack_boss') { const res = await resolveAttackBoss(m); if (res.survived) newMarches.push(createReturnMarch(m, res.troops, res.loot)); }
      else if (m.type === 'support_player') { 
          const res = await window.resolveSupportPlayer(m); 
          if (res.completed) myData.logs.unshift(`[支援抵達] 部隊已順利抵達盟友 ${m.targetName} 的城池並加入協防！`);
          else newMarches.push(createReturnMarch(m, m.troops, {})); 
      }
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
          if (res.counterMarch) newMarches.push(res.counterMarch);
          if (res.counterMarches) res.counterMarches.forEach(cm => newMarches.push(cm));
      }
      needSave = true;
    } 
    else if (m.type === 'gathering') {
      if (now >= m.finishesAt) {
          m.type = 'return'; m.loot = { wood:0, iron:0, food:0 }; m.loot[m.resType] = m.capacity;
          m.finishesAt = now + (now - m.startTime); 
          try { deleteDoc(doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`)); }catch(e){}
          myData.logs.unshift(`[採集完成] 駐紮部隊滿載而歸！`);
          myData.clearedPOI.push(`${m.targetX},${m.targetY},${now},res_gathered`);
          if (myData.clearedPOI.length > 500) myData.clearedPOI.shift();
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
              // 如果已經採集超過 10% 以上，召回時順便把資源點弄枯竭
                if (ratio > 0.1) {
                    myData.clearedPOI.push(`${m.startX},${m.startY},${Date.now()},res_gathered`);
                }
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

async function resolveOccupyNode(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0}, isGathering: false, cap: m.entity.cap, resType: m.entity.res };
  try {
    await runTransaction(db, async (transaction) => {
      const nodeRef = doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`);
      const snap = await transaction.get(nodeRef);
      let defender = snap.exists() ? snap.data() : null;
      
      const attPwr = getPwrByTech(m.troops, m.techs || myData.research);
      
      if (defender && defender.uid !== myUid) {
          const defPwr = getPwrByTech(defender.troops, defender.techs || {});
          if (attPwr > defPwr) {
              transaction.set(nodeRef, { isNode: true, uid: myUid, name: myData.name, troops: m.troops, techs: m.techs, x: m.targetX, y: m.targetY, type: m.entity.type });
              res.isGathering = true;
              myData.logs.unshift(`[佔領成功] 擊退了敵方佔領軍！部隊開始採集資源。`);
              if(window.addReport) window.addReport(`⚔ 掠奪資源點`, `成功擊敗敵方部隊並佔據資源點！`, true);
          } else {
              res.survived = false; 
              res.troops = {infantry:0, archer:0, cavalry:0};
              myData.logs.unshift(`[佔領失敗] 遭遇強大的敵軍防守，我方部隊全數陣亡！`);
              if(window.addReport) window.addReport(`☠️ 資源點爭奪失敗`, `力量懸殊，出征部隊已全數陣亡！`, false);
          }
      } else {
          const reqPwr = m.entity.reqPwr || 100; 
          
          if (attPwr >= reqPwr) {
              let lossRate = reqPwr > 0 ? (reqPwr / (attPwr + 1)) * 0.1 : 0; 
              res.troops.infantry = Math.max(0, m.troops.infantry - Math.floor(m.troops.infantry * lossRate));
              res.troops.archer = Math.max(0, m.troops.archer - Math.floor(m.troops.archer * lossRate));
              res.troops.cavalry = Math.max(0, m.troops.cavalry - Math.floor(m.troops.cavalry * lossRate));

              transaction.set(nodeRef, { isNode: true, uid: myUid, name: myData.name, troops: res.troops, techs: m.techs, x: m.targetX, y: m.targetY, type: m.entity.type });
              res.isGathering = true;
              myData.logs.unshift(`[抵達據點] 擊退野生守軍，部隊已駐紮並開始採集資源。`);
          } else {
              res.survived = false;
              res.troops = {infantry:0, archer:0, cavalry:0}; 
              myData.logs.unshift(`[佔領慘敗] 戰力不足以擊敗野生守軍，部隊全軍覆沒！`);
              if(window.addReport) window.addReport(`☠️ 佔領失敗`, `資源點守備戰力高達 ${formatCompact(reqPwr)}，我方戰鬥力 ${formatCompact(attPwr)} 不敵，全軍覆沒！`, false);
          }
      }
    });
    if (res.isGathering) window.refreshMap();
  } catch (e) { console.error(e); }
  return res;
}

async function resolveAttackBoss(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0} };
  try {
    await runTransaction(db, async (transaction) => {
      const bossRef = doc(db, "world_map", m.targetUid);
      const bossSnap = await transaction.get(bossRef);
      if (!bossSnap.exists()) throw new Error("BossNotExist");
      
      let bossData = bossSnap.data();
      if (bossData.hp <= 0) throw new Error("BossDead");

      const attPwr = getPwrByTech(m.troops, m.techs || myData.research);
      let dmg = Math.floor(attPwr * (Math.random() * 0.2 + 0.9)); 
      if (dmg > bossData.hp) dmg = bossData.hp; 
      
      bossData.hp -= dmg;
      bossData.contributors = bossData.contributors || {};
      bossData.contributors[myUid] = (bossData.contributors[myUid] || 0) + dmg;

      transaction.set(bossRef, bossData, { merge: true });

      const lossRate = 0.02 + Math.random() * 0.03;
      res.troops.infantry = Math.floor(res.troops.infantry * (1 - lossRate));
      res.troops.archer = Math.floor(res.troops.archer * (1 - lossRate));
      res.troops.cavalry = Math.floor(res.troops.cavalry * (1 - lossRate));

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

async function resolveInteractNPC(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0}, counterMarch: null };
  let reportText = "";
  
  if (m.entity.type === 'relic') { 
    res.loot = m.entity.loot; 
    myData.logs.unshift(`[發掘] 探險隊挖出巨量資源，正在返航中！`); 
    reportText = `探險隊成功發掘【${m.entity.name}】！`;
  } else {
    const attPwr = getPwrByTech(m.troops, m.techs || myData.research);
    let defPwr = m.entity.reqPwr || 100;
    
    let factionName = m.entity.faction || (['中央王都','猩紅法師塔','迷霧監視塔','砂海要塞'].find(n => m.entity.name.includes(n)));
    let supportCount = 0; let swarmSources = [];

    // 💡 模擬真人的區域聯防：周邊 6 格內的同陣營城池會提供 40% 戰力支援
    if (factionName && !m.entity.type.includes('relic')) {
        for (let dx = -6; dx <= 6; dx++) {
            for (let dy = -6; dy <= 6; dy++) {
                if (dx === 0 && dy === 0) continue;
                let nx = m.targetX + dx, ny = m.targetY + dy;
                let cell = MAP_CACHE[nx] && MAP_CACHE[nx][ny];
                if (cell && cell.entity && (cell.entity.faction === factionName || cell.entity.name.includes(factionName))) {
                    supportCount++;
                    defPwr += Math.floor((cell.entity.reqPwr || 1000) * 0.4); 
                    swarmSources.push({x: nx, y: ny, pwr: cell.entity.reqPwr});
                }
            }
        }
        if (supportCount > 0) myData.logs.unshift(`[情報] 目標呼叫了 ${supportCount} 座【${factionName}】城池進行聯防！敵軍戰力暴增至 ${formatCompact(defPwr)}！`);
    }
    if (attPwr >= defPwr) {
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

        reportText = `成功剿滅【${m.entity.name}】！\n戰鬥損失：🏥重傷 ${wInf+wArc+wCav} | ☠️️陣亡 ${(lInf-wInf)+(lArc-wArc)+(lCav-wCav)+overflow}\n🎒 部隊負重：${formatCompact(currentLoad)} / ${formatCompact(maxLoad)}\n獲得戰利品：🌲${res.loot.wood} ⛏️${res.loot.iron} 🌾${res.loot.food}`;
        if(myData.quests) myData.quests.daily.kills++;

        let factionName = m.entity.faction;
        if (!factionName && ['中央王都','猩紅法師塔','迷霧監視塔','砂海要塞'].some(n => m.entity.name.includes(n))) {
            factionName = ['中央王都','猩紅法師塔','迷霧監視塔','砂海要塞'].find(n => m.entity.name.includes(n));
        }
        if (factionName) {
            myData.logs.unshift(`⚠️ 警告！您激怒了【${factionName}】，敵方多座城池同時發動了聯合反撲！`);
            res.counterMarches = [];
            // 1. 被打的本體進行主力反擊
            res.counterMarches.push({ id: 'COUNTER_'+Date.now()+'_0', type: 'defend_npc', startX: m.targetX, startY: m.targetY, targetX: myData.x, targetY: myData.y, startTime: Date.now(), finishesAt: Date.now() + 30000, npcPower: (m.entity.reqPwr||15000)*1.2, npcName: `${factionName} 主力軍` });
            // 2. 周圍有協防的盟友城池，同時發起側翼包抄反撲
            for (let i = 0; i < Math.min(2, swarmSources.length); i++) {
                let s = swarmSources[i];
                let dist = Math.hypot(s.x - myData.x, s.y - myData.y);
                res.counterMarches.push({ id: 'COUNTER_'+Date.now()+'_'+(i+1), type: 'defend_npc', startX: s.x, startY: s.y, targetX: myData.x, targetY: myData.y, startTime: Date.now(), finishesAt: Date.now() + Math.ceil(dist * 3500) + 5000, npcPower: (s.pwr||10000)*1.2, npcName: `${factionName} 側翼援軍` });
            }
        }
    } else {
        let wInf = Math.floor(m.troops.infantry * 0.7); let wArc = Math.floor(m.troops.archer * 0.7); let wCav = Math.floor(m.troops.cavalry * 0.7);
        window.addWounded(wInf, wArc, wCav);
        res.survived = false; res.troops = {infantry:0, archer:0, cavalry:0};
        reportText = `討伐遭遇慘敗！部隊潰散 (🏥 ${wInf+wArc+wCav} 人已送往醫療所)`;
        if(window.addReport) window.addReport(`☠️ 遠征失敗`, reportText, false);
        return res; 
    }
  }
  myData.clearedPOI.push(`${m.targetX},${m.targetY},${Date.now()},${m.entity.type}`);
  if (myData.clearedPOI.length > 500) myData.clearedPOI.shift(); // 避免陣列無限膨脹，最多記錄500個墳墓
  
  // 清除舊的動態 NPC 記錄
  if (!myData.dynamicNPCs) myData.dynamicNPCs = [];
  const dIdx = myData.dynamicNPCs.findIndex(dn => dn.x === m.targetX && dn.y === m.targetY);
  if (dIdx !== -1) myData.dynamicNPCs.splice(dIdx, 1);

  // 在旁邊隨機生成新的野怪 (排除主城與大型要塞，只針對一般野怪)
  if (['barbarian', 'npc_outpost', 'relic'].includes(m.entity.type)) {
      if (typeof window.spawnDynamicNPC === 'function') window.spawnDynamicNPC(m.targetX, m.targetY, m.entity);
  }

  if(window.addReport) window.addReport(`⚔️ 遠征大捷`, reportText, true);
  return res;
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
        
        const burnTime = Date.now() + (30 * 60 * 1000); 
        transaction.set(tPubRef, { 
            troops: 0, 
            burnEndsAt: burnTime 
        }, { merge: true });
        
        res.survived = true; res.loot = { wood: lW, iron: lI, food: lF };
        if(window.addReport) window.addReport(`⚔️ 攻城勝利`, `成功攻破【${m.targetName}】！\n敵軍城池已陷入火海！🔥\n🎒 負重滿載率：${formatCompact(currentLoad)} / ${formatCompact(maxLoad)}\n掠奪物資：🌲${lW} ⛏️${lI} 🌾${lF}`, true);
      } else {
        let wInf = Math.floor(m.troops.infantry * 0.6); let wArc = Math.floor(m.troops.archer * 0.6); let wCav = Math.floor(m.troops.cavalry * 0.6);
        window.addWounded(wInf, wArc, wCav);
        transaction.set(tPrivRef, { logs: [`[堅壁清野] 成功擊退敵軍！`, ...(target.logs || [])] }, { merge: true });
        if(window.addReport) window.addReport(`☠ 突擊失敗`, `進攻遭遇重創！我方不敵，殘兵已送醫 (🏥 ${wInf+wArc+wCav} 人)！`, false);
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

function drawMarchLines(ctx, marches, tileSize) {
  if (!marches || marches.length === 0) return;
  const now = Date.now();

  marches.forEach(m => {
    const totalDuration = m.finishesAt - m.startTime;
    if (totalDuration <= 0) return;
    const elapsed = now - m.startTime;
    const progress = Math.min(1, Math.max(0, elapsed / totalDuration));

    const startPxX = m.startX * tileSize + tileSize / 2;
    const startPxY = m.startY * tileSize + tileSize / 2;
    const targetPxX = m.targetX * tileSize + tileSize / 2;
    const targetPxY = m.targetY * tileSize + tileSize / 2;

    const curPxX = startPxX + (targetPxX - startPxX) * progress;
    const curPxY = startPxY + (targetPxY - startPxY) * progress;

    let color = '#38bdf8'; 
    let label = '⚔️ 部隊';
    if (m.type === 'return') { color = '#10b981'; label = '📦 返航'; } 
    else if (m.type === 'defend_npc' || m.type === 'counter_attack') { color = '#ef4444'; label = `🚨 ${m.npcName || '敵軍'}`; } 
    else if (m.type === 'attack_player') { color = '#f59e0b'; label = '⚔️ 攻城'; }
    else if (m.type === 'npc_gather') { color = '#f97316'; label = `🏃 ${m.npcName || 'NPC'}佔領`; }
    else if (m.type === 'npc_return') { color = '#f97316'; label = `📦 ${m.npcName || 'NPC'}滿載`; }
    
    ctx.save();
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

    const angle = Math.atan2(targetPxY - startPxY, targetPxX - startPxX);
    ctx.setLineDash([]); 
    ctx.fillStyle = color;
    ctx.beginPath();
    const arrowSize = 9;
    ctx.moveTo(curPxX + Math.cos(angle) * arrowSize * 1.5, curPxY + Math.sin(angle) * arrowSize * 1.5);
    ctx.lineTo(curPxX + Math.cos(angle + 2.4) * arrowSize, curPxY + Math.sin(angle + 2.4) * arrowSize);
    ctx.lineTo(curPxX + Math.cos(angle - 2.4) * arrowSize, curPxY + Math.sin(angle - 2.4) * arrowSize);
    ctx.closePath();
    ctx.fill();

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
          if (clrInfo.type === 'res_gathered') {
              ctx.font = '20px sans-serif'; ctx.textAlign='center'; ctx.fillText('🪓', px+TILE_SIZE/2, py+32);
              ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.fillText('已枯竭', px+TILE_SIZE/2, py+48);
          } else {
              ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🔥', px+TILE_SIZE/2, py+35);
          }
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
                else { ctx.font='20px sans-serif'; ctx.textAlign='center'; ctx.fillText('🏕', px+TILE_SIZE/2, py+30); }
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
            else { ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🏛', px+TILE_SIZE/2, py+30); }
            ctx.fillStyle = '#38bdf8'; ctx.font = '10px sans-serif'; ctx.textAlign='center'; ctx.fillText('遺跡', px+TILE_SIZE/2, py+45);
          } else if (cell.entity.type === 'announcement' || cell.entity.type === 'notice') {
            const annId = cell.entity.id;
            const isClaimed = myData.claimedAnnouncements && myData.claimedAnnouncements.includes(annId);
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
    
    const isVip = p.vip && p.vip.isActive && p.vip.expiresAt > Date.now();
    let currentCastleImg = castleImgs[imgIdx];
    
    if (currentCastleImg && currentCastleImg.complete && currentCastleImg.naturalHeight !== 0) {
        if (isVip) {
            ctx.save();
            ctx.shadowColor = '#facc15'; ctx.shadowBlur = 20; 
            ctx.filter = 'sepia(1) hue-rotate(15deg) saturate(3) brightness(1.2)';
        }
        ctx.drawImage(currentCastleImg, px - 20, py - 30 + floatY, TILE_SIZE + 40, TILE_SIZE + 40);
        if (isVip) ctx.restore(); 
    } else {
        ctx.fillStyle = isVip ? '#b45309' : (isMe?'#1d4ed8':'#991b1b'); 
        ctx.fillRect(px+12,py+16+floatY,31,26);
        ctx.fillStyle = isVip ? '#facc15' : (isMe?'#3b82f6':'#ef4444'); 
        ctx.fillRect(px+9,py+12+floatY,10,30); ctx.fillRect(px+36,py+12+floatY,10,30);
    }

    const isBurning = p.burnEndsAt && p.burnEndsAt > Date.now();
    if (isBurning) {
        const time = Date.now();
        const flicker1 = Math.sin(time / 150) * 4; 
        const flicker2 = Math.cos(time / 200) * 3; 
        ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🔥', px + TILE_SIZE / 2 - 15, py + 10 + floatY + flicker1);
        ctx.fillText('🔥', px + TILE_SIZE / 2 + 10, py - 5 + floatY + flicker2);
        ctx.font = '16px sans-serif'; ctx.fillStyle = `rgba(0, 0, 0, ${0.5 + Math.sin(time/300)*0.2})`; 
        ctx.fillText('☁️', px + TILE_SIZE / 2, py - 25 + floatY - (time % 1000) / 50); 
    }

    if (zoom>0.5) {
      if (isVip) { ctx.fillStyle = '#facc15'; } 
      else { ctx.fillStyle = isMe ? '#fef08a' : (p.allianceName && p.allianceName === myData.allianceName ? '#10b981' : '#fff'); }
      ctx.font = isMe ? 'bold 12px sans-serif' : '11px sans-serif'; ctx.textAlign='center';
      let dispName = p.allianceName ? `[${p.allianceName}] ${p.name}` : p.name;
      if (isVip) dispName = '👑 ' + dispName;
      ctx.fillText(dispName, px+TILE_SIZE/2, py+60 + floatY); 
      ctx.fillStyle='#fbbf24'; ctx.fillText(`⚔️${formatCompact(p.troops||0)}`, px+TILE_SIZE/2, py-5 + floatY);
    }
    
    ctx.textAlign='start';
  }); 

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

  if (myData && myData.marches && myData.marches.length > 0) {
    myData.marches.forEach(m => {
      if (m.type === 'gathering') {
        const cX = m.targetX * TILE_SIZE + TILE_SIZE / 2;
        const cY = m.targetY * TILE_SIZE + TILE_SIZE / 2;
        ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(cX, cY, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛏', cX, cY + 4);
        const left = Math.ceil((m.finishesAt - t) / 1000);
        if (left > 0) {
          ctx.fillStyle = '#facc15'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(formatTime(left), cX, cY - 20);
        }
        ctx.textAlign = 'start';
      } 
    });
    const movingMarches = myData.marches.filter(m => m.type !== 'gathering');
    let allMoving = [...movingMarches];
    
    if (myData.npcMarches) {
        myData.npcMarches.forEach(m => {
            if (m.type === 'npc_gathering') {
                const cX = m.targetX * TILE_SIZE + TILE_SIZE / 2;
                const cY = m.targetY * TILE_SIZE + TILE_SIZE / 2;
                ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(cX, cY, 14, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛏', cX, cY + 4);
                const left = Math.ceil((m.finishesAt - Date.now()) / 1000);
                if (left > 0) { ctx.fillStyle = '#f97316'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(formatTime(left), cX, cY - 20); }
            } else {
                allMoving.push(m);
            }
        });
    }
    drawMarchLines(ctx, allMoving, TILE_SIZE);
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
  if (myData && myData.isBanned) return; 
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
    if (tC.allianceName && myData.allianceName && tC.allianceName === myData.allianceName) { 
        targetAction = { type: 'support_player', targetUid: tC.id, name: tC.name, x: tX, y: tY, dist, techs: myData.research };
        document.getElementById("modal-title").innerHTML = `🤝 支援盟友 ${queueStatus}`; 
        document.getElementById("modal-desc").innerHTML = `目標：【${tC.name}】 (Lv.${tC.castleLevel||1})<br>距離：${Math.ceil(dist)} 格<br><span style="color:#10b981; font-weight:bold;">🛡️ 派遣部隊協防 (抵達後將無償併入盟友城防守軍)</span>`;
        document.getElementById("troop-selector").style.display = 'block'; 
        document.getElementById("btn-confirm-action").style.display = 'block'; 
        document.getElementById("btn-confirm-action").innerText = "發動支援"; 
        document.getElementById("btn-confirm-action").style.background = '#3b82f6';
        return;
    }

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
  if (myData && myData.isBanned) return; 
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

  if (myData.marches && myData.marches.length >= 3) return alert("⚔️ 您的行軍隊列已滿 (最多 3 隊)！請等待部隊返回。");

  const sendInf = parseInt(document.getElementById('send-inf').value)||0;
  const sendArc = parseInt(document.getElementById('send-arc').value)||0;
  const sendCav = parseInt(document.getElementById('send-cav').value)||0;
  
  if (sendInf===0 && sendArc===0 && sendCav===0) return alert("請派遣部隊！");
  if (sendInf > myData.troops.infantry || sendArc > myData.troops.archer || sendCav > myData.troops.cavalry) return alert("兵力不足！");
  
  let spd = 2; 
  if (sendInf > 0) spd = Math.max(spd, CFG.troops.infantry.speed);
  if (sendArc > 0) spd = Math.max(spd, CFG.troops.archer.speed);
  
  let timeMs = Math.ceil(targetAction.dist * spd * 1000);
  myData.troops.infantry -= sendInf; myData.troops.archer -= sendArc; myData.troops.cavalry -= sendCav;

  const speedTechLv = (myData.research && myData.research.march_speed) || 0;
  const speedMult = 1 + (speedTechLv * 0.08);
  timeMs = Math.ceil(timeMs / speedMult); 

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
                let btnBg = isMax ? '#475569' : '#2563eb';
                let btnState = disabled ? 'disabled' : '';
                let btnText = isMax ? '已達上限' : '升級 (' + formatTime(timeSec) + ')';
                btnHtml = `<button class="btn-upgrade" style="background:${btnBg};" onclick="window.upgradeBuilding('${key}')" ${btnState}>${btnText}</button>`;
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
                      let btnBgR = isMax ? '#475569' : '#2563eb';
                      let btnStateR = (isMax || myData.researchQueue) ? 'disabled' : '';
                      let btnTextR = isMax ? '學院等級不足' : '研發 (' + formatTime(timeSec) + ')';
                      btnHtml = `<button class="btn-upgrade" style="background:${btnBgR}" onclick="window.startResearch('${key}')" ${btnStateR}>${btnTextR}</button>`;
                  }

                  const effectText = typeof getTechEffectText === 'function' ? getTechEffectText(key, lvl) : `效果等級: ${lvl}`;
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
              
              let btnHtml = ''; let progressHtml = '';
              if (isTraining) {
                  const totalTime = d.time * myData.trainQueue.count;
                  const remainSec = Math.max(0, Math.ceil((myData.trainQueue.finishesAt - now) / 1000));
                  const pct = Math.min(100, Math.max(0, 100 - (remainSec / totalTime * 100)));
                  btnHtml = `<span style="font-size:0.8rem; color:#facc15; text-align:center; display:block;">招募中 (${formatTime(remainSec)})</span>`;
                  progressHtml = `<div class="progress-bar-bg" style="display:block;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>`;
              } else {
                  // 這裡改成呼叫自訂招募彈窗
                  btnHtml = `<button class="btn-upgrade" style="background:#059669;" onclick="window.openTrainModal('${key}')" ${myData.trainQueue?'disabled':''}>自訂招募</button>`;
              }
              return genCard(`${d.icon} ${d.name}`, 0, `戰力: ${d.pwr}<span style="color:#10b981;">+${buff}</span> | 耗糧: 🌾${d.upkeep}/h`, `單兵消耗: 🌲${d.w} ⛏️${d.i} 🌾${d.f}`, progressHtml, btnHtml);
          }).join('');
      }

      const logList = document.getElementById('log-list');
      if (logList && myData.logs) logList.innerHTML = myData.logs.slice(0, 8).map(l => `<p>${l}</p>`).join('');

  } catch (e) { console.error("UI 渲染嚴重錯誤:", e); }
}

window.useResourceCard = async () => {
    if (!myData || myData.items.resourceCard <= 0) return alert("背包中沒有足夠的軍用物資卡！");
    myData.items.resourceCard--;
    const gain = 100000; 
    myData.wood += gain; myData.iron += gain; myData.food += gain;
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
  if (myData) { window.switchTab('world'); setTimeout(() => { centerCameraOn(myData.x, myData.y); }, 60); }
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

window.openTrainModal = (typeKey) => {
    if (myData.trainQueue) return alert('已有部隊正在招募中！');
    const req = CFG.troops[typeKey];
    const bLvl = myData.buildings.barracks || 1;
    
    // 單次招募上限 (兵營等級 * 50)，並計算目前資源最多能招募多少
    const limitMax = bLvl * 50;
    const maxByWood = req.w > 0 ? Math.floor(myData.wood / req.w) : limitMax;
    const maxByIron = req.i > 0 ? Math.floor(myData.iron / req.i) : limitMax;
    const maxByFood = req.f > 0 ? Math.floor(myData.food / req.f) : limitMax;
    let maxCount = Math.min(limitMax, maxByWood, maxByIron, maxByFood);
    
    if (maxCount < 1) return alert('資源不足以招募哪怕 1 名士兵！');

    let modal = document.getElementById('train-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'train-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; display:flex; justify-content:center; align-items:center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
    <div style="background:#1e293b; border:2px solid #059669; border-radius:10px; width:320px; padding:20px; color:white;">
        <h2 style="color:#10b981; margin-top:0;">⚔️ 招募 ${req.icon} ${req.name}</h2>
        <div style="background:#0f172a; padding:15px; border-radius:6px; margin-bottom:15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="color:#cbd5e1; font-size:0.9rem;">本次招募數量</span>
                <input type="number" id="train-input" min="1" max="${maxCount}" value="${maxCount}" oninput="window.syncTrainSlider('${typeKey}', this.value)">
            </div>
            <input type="range" id="train-slider" min="1" max="${maxCount}" value="${maxCount}" oninput="window.updateTrainCost('${typeKey}')">
            <p style="text-align:right; font-size:0.8rem; color:#64748b; margin:5px 0 0 0;">可招募上限: <span style="color:#facc15;">${maxCount}</span></p>
        </div>
        <div style="background:#0f172a; padding:15px; border-radius:6px; margin-bottom:15px; font-size:0.9rem;">
            <div style="font-weight:bold; color:#fbbf24; margin-bottom:8px;">總計消耗與時間：</div>
            <div id="train-cost-wood" style="margin-bottom:4px;">🌲 木材：${formatCompact(req.w * maxCount)}</div>
            <div id="train-cost-iron" style="margin-bottom:4px;">⛏️ 鐵礦：${formatCompact(req.i * maxCount)}</div>
            <div id="train-cost-food" style="margin-bottom:4px;">🌾 糧食：${formatCompact(req.f * maxCount)}</div>
            <div id="train-time" style="color:#38bdf8; margin-top:10px; font-weight:bold; border-top:1px solid #334155; padding-top:8px;">⏱ 耗時：${formatTime(req.time * maxCount)}</div>
        </div>
        <button onclick="window.confirmTrain('${typeKey}')" style="background:#10b981; width:100%; font-weight:bold; border-radius:6px; padding:12px; cursor:pointer; border:none; color:white; font-size:1.05rem;">確認發兵招募</button>
        <button onclick="document.getElementById('train-modal').style.display='none'" style="background:#ef4444; width:100%; padding:10px; font-weight:bold; border-radius:6px; margin-top:10px; cursor:pointer; border:none; color:white;">取消</button>
    </div>`;
    modal.style.display = 'flex';
};

window.updateTrainCost = (typeKey) => {
    const val = parseInt(document.getElementById('train-slider').value) || 1;
    document.getElementById('train-input').value = val;
    const req = CFG.troops[typeKey];
    document.getElementById('train-cost-wood').innerText = `🌲 木材：${formatCompact(req.w * val)}`;
    document.getElementById('train-cost-iron').innerText = `⛏️ 鐵礦：${formatCompact(req.i * val)}`;
    document.getElementById('train-cost-food').innerText = `🌾 糧食：${formatCompact(req.f * val)}`;
    document.getElementById('train-time').innerText = `⏱ 耗時：${formatTime(req.time * val)}`;
};

window.syncTrainSlider = (typeKey, val) => {
    const slider = document.getElementById('train-slider');
    let num = parseInt(val) || 1;
    if (num > parseInt(slider.max)) num = parseInt(slider.max);
    if (num < 1) num = 1;
    slider.value = num;
    window.updateTrainCost(typeKey);
};

window.confirmTrain = async (typeKey) => {
    const count = parseInt(document.getElementById('train-input').value);
    const req = CFG.troops[typeKey];
    const costW = req.w * count; const costI = req.i * count; const costF = req.f * count;

    if (myData.wood < costW || myData.iron < costI || myData.food < costF) return alert('資源不足！');
    
    myData.wood -= costW; myData.iron -= costI; myData.food -= costF;
    myData.trainQueue = { type: typeKey, count: count, finishesAt: Date.now() + (req.time * count * 1000) }; 
    await savePrivateData(); 
    document.getElementById('train-modal').style.display='none';
    window.renderSelf();
};

// ==========================================
// 💡 側邊按鈕、戰報、任務系統與醫療所
// ==========================================
window.renderSideMenu = function() {
    if (document.getElementById('side-menu-hud')) return;
    const div = document.createElement('div'); div.id = 'side-menu-hud';
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
        modal = document.createElement('div'); modal.id = 'report-modal';
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
            <button onclick="document.getElementById('report-modal').style.display='none'; document.getElementById('btn-float-report').innerHTML='📬 戰報';" style="background:#ef4444; width:100%; padding:10px; font-weight:bold; border-radius:6px; cursor:pointer; border:none; color:white;">關閉</button>
        </div>
    </div>`;
    modal.style.display = 'flex';
};

window.openQuestModal = () => {
    let modal = document.getElementById('quest-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'quest-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; display:flex; justify-content:center; align-items:center;';
        document.body.appendChild(modal);
    }
    
    if (!myData.quests) return;
    const q = myData.quests.daily; const c = myData.quests.claimed;
    const q1Done = q.kills >= 3; const q1Claimed = c.includes('q1');
    const q2Done = q.upgrades >= 2; const q2Claimed = c.includes('q2');
    const q3Done = q.gather_wood >= 10000; const q3Claimed = c.includes('q3');

    modal.innerHTML = `
    <div style="background:#1e293b; border:2px solid #10b981; border-radius:10px; width:300px; padding:20px; color:white;">
        <h2 style="color:#10b981; margin-top:0;">🎯 每日任務</h2>
        
        <div style="margin-bottom:10px; background:#0f172a; padding:10px; border-radius:6px; border-left: 4px solid #38bdf8;">
            <div style="font-weight:bold; color:#38bdf8; font-size:1.05rem;">⚔️ 擊殺野怪/敵軍 (${q.kills}/3)</div>
            <div style="font-size:0.85rem; color:#facc15; margin:6px 0;">🎁 獎勵：⚡5分加速 x 3</div>
            ${q1Claimed ? '<button disabled style="background:#475569; width:100%; border-radius:4px; padding:6px; border:none; color:#cbd5e1; font-weight:bold;">✅ 已領取</button>' : 
              (q1Done ? `<button onclick="window.claimQuest('q1')" style="background:#10b981; width:100%; font-weight:bold; border-radius:4px; padding:6px; cursor:pointer; border:none; color:white;">領取獎勵</button>` : '<button disabled style="background:#334155; color:#94a3b8; width:100%; border-radius:4px; padding:6px; border:none; font-weight:bold;">未完成</button>')}
        </div>
        
        <div style="margin-bottom:10px; background:#0f172a; padding:10px; border-radius:6px; border-left: 4px solid #38bdf8;">
            <div style="font-weight:bold; color:#38bdf8; font-size:1.05rem;">🏗️ 升級任意建築 (${q.upgrades}/2)</div>
            <div style="font-size:0.85rem; color:#facc15; margin:6px 0;">🎁 獎勵：⚡1小時加速 x 1</div>
            ${q2Claimed ? '<button disabled style="background:#475569; width:100%; border-radius:4px; padding:6px; border:none; color:#cbd5e1; font-weight:bold;">✅ 已領取</button>' : 
              (q2Done ? `<button onclick="window.claimQuest('q2')" style="background:#10b981; width:100%; font-weight:bold; border-radius:4px; padding:6px; cursor:pointer; border:none; color:white;">領取獎勵</button>` : '<button disabled style="background:#334155; color:#94a3b8; width:100%; border-radius:4px; padding:6px; border:none; font-weight:bold;">未完成</button>')}
        </div>
        
        <div style="margin-bottom:10px; background:#0f172a; padding:10px; border-radius:6px; border-left: 4px solid #38bdf8;">
            <div style="font-weight:bold; color:#38bdf8; font-size:1.05rem;">🌲 採集木材 (${formatCompact(q.gather_wood)} / 10K)</div>
            <div style="font-size:0.85rem; color:#facc15; margin:6px 0;">🎁 獎勵：📦 軍用物資卡 x 1</div>
            ${q3Claimed ? '<button disabled style="background:#475569; width:100%; border-radius:4px; padding:6px; border:none; color:#cbd5e1; font-weight:bold;">✅ 已領取</button>' : 
              (q3Done ? `<button onclick="window.claimQuest('q3')" style="background:#10b981; width:100%; font-weight:bold; border-radius:4px; padding:6px; cursor:pointer; border:none; color:white;">領取獎勵</button>` : '<button disabled style="background:#334155; color:#94a3b8; width:100%; border-radius:4px; padding:6px; border:none; font-weight:bold;">未完成</button>')}
        </div>
        <button onclick="document.getElementById('quest-modal').style.display='none'" style="background:#ef4444; width:100%; padding:10px; font-weight:bold; border-radius:6px; margin-top:10px; cursor:pointer; border:none; color:white;">關閉</button>
    </div>`;
    modal.style.display = 'flex';
};

window.claimQuest = async (qid) => {
    if (!myData || !myData.quests) return;
    const q = myData.quests.daily;
    if (myData.quests.claimed.includes(qid)) return alert("⚠️ 系統警告：此獎勵已經領取過了，無法重複領取！");
    if (qid === 'q1' && q.kills < 3) return alert("⚠️ 非法操作：擊殺任務未達標！");
    if (qid === 'q2' && q.upgrades < 2) return alert("⚠️ 非法操作：升級任務未達標！");
    if (qid === 'q3' && q.gather_wood < 10000) return alert("⚠️ 非法操作：採集任務未達標！");

    myData.quests.claimed.push(qid);
    if (qid === 'q1') myData.items.speedup5m += 3;
    if (qid === 'q2') myData.items.speedup1h += 1;
    if (qid === 'q3') myData.items.resourceCard += 1;
    
    myData.logs.unshift(`[任務] 成功領取每日任務獎勵！`);
    await savePrivateData(); window.openQuestModal(); try{ window.renderSelf(); }catch(e){}
};

window.addWounded = function(wInf, wArc, wCav) {
    const hospBonus = ((myData.research && myData.research.hospital_cap) || 0) * 3000;
    let maxHosp = 10000 + (myData.buildings.castle || 1) * 5000 + hospBonus;
    let curHosp = (myData.wounded.infantry||0) + (myData.wounded.archer||0) + (myData.wounded.cavalry||0);
    let overflow = 0; 

    let addTroop = (type, amount) => {
        let space = Math.max(0, maxHosp - curHosp);
        let toAdd = Math.min(amount, space);
        myData.wounded[type] = (myData.wounded[type] || 0) + toAdd;
        curHosp += toAdd; overflow += (amount - toAdd); 
    };
    addTroop('infantry', wInf); addTroop('archer', wArc); addTroop('cavalry', wCav);
    return overflow; 
};

window.getLoadCapacity = function(troops) {
    let baseLoad = (troops.infantry||0)*10 + (troops.archer||0)*5 + (troops.cavalry||0)*8;
    let loadTechLv = (myData.research && myData.research.troop_load) || 0;
    return Math.floor(baseLoad * (1 + loadTechLv * 0.15));
};

window.openHospitalModal = () => {
    let modal = document.getElementById('hospital-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'hospital-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; display:flex; justify-content:center; align-items:center;';
        document.body.appendChild(modal);
    }
    
    if (!myData.wounded) myData.wounded = {infantry:0, archer:0, cavalry:0};
    let w = myData.wounded;
    let totalW = (w.infantry||0) + (w.archer||0) + (w.cavalry||0);
    const hospBonus = ((myData.research && myData.research.hospital_cap) || 0) * 3000;
    let maxHosp = 10000 + (myData.buildings.castle || 1) * 5000 + hospBonus;

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
        await savePrivateData(); window.openHospitalModal(); try { window.renderSelf(); } catch(e){}
    }
};

window.adminSetVIP = async function(targetUid, days = 30) {
    const expiry = Date.now() + (days * 24 * 60 * 60 * 1000);
    const vipData = { isActive: true, expiresAt: expiry, lastClaimed: "" };
    try {
        await setDoc(doc(db, "players", targetUid), { vip: vipData }, { merge: true });
        await setDoc(doc(db, "world_map", targetUid), { vip: vipData }, { merge: true });
        alert(`✅ 成功！\n已為玩家【${targetUid}】開通 30 天 VIP！`);
        if (typeof renderGMPlayers === 'function') renderGMPlayers();
        if (typeof window.refreshMap === 'function') window.refreshMap();
    } catch (e) { alert(`❌ 開通失敗：${e.message}`); }
};

window.openVipModal = function() {
    const modal = document.getElementById('vip-modal');
    const container = document.getElementById('vip-action-container');
    if (!modal || !container || !myData) return;

    if (!myData.vip || typeof myData.vip !== 'object') myData.vip = { isActive: false, expiresAt: 0, lastClaimed: "" };
    if (myData.vip.isActive && Date.now() > myData.vip.expiresAt) myData.vip.isActive = false; 

    if (myData.vip.isActive) {
        const daysLeft = Math.ceil((myData.vip.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        const todayStr = new Date().toLocaleDateString();
        const alreadyClaimed = (myData.vip.lastClaimed === todayStr);

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
        container.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                <p style="color: #fca5a5; font-size: 0.85rem; margin: 0; line-height: 1.4;">
                    請點擊下方 PayMe 連結付款，並在備註填寫你的<br>
                    <strong style="color: #fff; font-size: 1rem;">【玩家ID: ${myUid}】</strong><br>
                    管理員核對後將立即為您開通！
                </p>
            </div>
            <a href="https://payme.hsbc/0661b177b2f04214972535987915b5d6" target="_blank" 
               style="display: block; width: 100%; padding: 14px; background: #e3004f; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1.1rem; box-sizing: border-box; text-align: center; box-shadow: 0 4px 6px rgba(227, 0, 79, 0.3);">
               🔴 一按即 PayMe！ ($25)
            </a>
        `;
    }
    modal.style.display = 'flex';
};

window.claimVipReward = async function() {
    if (!myData || !myData.vip || !myData.vip.isActive || myData.vip.expiresAt < Date.now()) return;
    const todayStr = new Date().toLocaleDateString();
    if (myData.vip.lastClaimed === todayStr) return alert("❌ 您今天已經領取過 VIP 獎勵了！");

    myData.wood = (myData.wood || 0) + 5000;  
    myData.iron = (myData.iron || 0) + 5000;
    myData.food = (myData.food || 0) + 5000;
    if(!myData.items) myData.items = {};
    myData.items.speed30m = (myData.items.speed30m || 0) + 2; 

    myData.vip.lastClaimed = todayStr;
    await savePrivateData();
    
    alert("🎁 領取成功！\n獲得：木/鐵/糧 各 5000、30分鐘加速卡 x2");
    window.openVipModal();
    if (typeof window.renderSelf === 'function') window.renderSelf();
};
// ==========================================
// 📱 手機版 UI 與流暢度優化
// ==========================================
const mobileStyles = document.createElement('style');
mobileStyles.innerHTML = `
  /* 讓所有彈窗適應手機寬度，開啟平滑滑動 */
  div[id$="-modal"] > div {
      width: 90% !important; max-width: 400px !important;
      max-height: 85vh !important; overflow-y: auto !important;
      -webkit-overflow-scrolling: touch; 
  }
  /* 增加按鈕的點擊回饋動畫，防止連點干擾 */
  button { touch-action: manipulation; transition: transform 0.1s ease; }
  button:active:not(:disabled) { transform: scale(0.95); }
  /* 拉桿與輸入框美化 */
  input[type=range] { width: 100%; margin: 10px 0; accent-color: #10b981; }
  input[type=number] { width: 80px; padding: 6px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; text-align: center; font-weight: bold; }
`;
document.head.appendChild(mobileStyles);
// ==========================================
// 🚀 動態行軍隊列顯示 (March HUD)
// ==========================================
window.renderMarchHUD = function() {
    if (!myData || !myData.marches) return;
    
    let hud = document.getElementById('march-hud-container');
    if (!hud) {
        hud = document.createElement('div');
        hud.id = 'march-hud-container';
        // 稍微加寬以容納按鈕
        hud.style.cssText = 'position:fixed; right:10px; top:80px; z-index:9980; display:flex; flex-direction:column; gap:8px; width:220px; pointer-events:none;';
        document.body.appendChild(hud);
    }
    
    if (myData.marches.length === 0) {
        hud.innerHTML = '';
        return;
    }

    const now = Date.now();
    let html = '';
    
    myData.marches.forEach((m) => {
        const remainSec = Math.max(0, Math.ceil((m.finishesAt - now) / 1000));
        const totalSec = Math.ceil((m.finishesAt - m.startTime) / 1000);
        let pct = totalSec > 0 ? Math.min(100, Math.max(0, 100 - (remainSec / totalSec * 100))) : 100;
        
        let actionName = '行軍中'; let icon = '🚀'; let color = '#38bdf8';
        if (m.type === 'gathering') { actionName = '採集中'; icon = '⛏️'; color = '#10b981'; } 
        else if (m.type === 'return') { actionName = '返回中'; icon = '📦'; color = '#34d399'; } 
        else if (m.type === 'attack_player' || m.type === 'attack_capital' || m.type === 'attack_npc') { actionName = '進攻中'; icon = '⚔️'; color = '#ef4444'; } 
        else if (m.type === 'defend_npc' || m.type === 'counter_attack') { actionName = '敵襲警戒'; icon = '🚨'; color = '#f97316'; } 
        else if (m.type === 'relic') { actionName = '探索中'; icon = '🏛️️'; color = '#a855f7'; } 
        else if (m.type === 'occupy_node') { actionName = '前往佔領'; icon = '🚩'; color = '#8b5cf6'; }

        let targetStr = m.targetName || m.npcName || `(${m.targetX}, ${m.targetY})`;
        
        // 建立「定位」按鈕
        let btnHtml = `<button onclick="window.locateMarchTarget(${m.targetX||m.startX}, ${m.targetY||m.startY})" style="background:#0ea5e9; color:white; border:none; border-radius:4px; padding:3px 8px; font-size:0.75rem; cursor:pointer; pointer-events:auto;">📍 定位</button>`;
        
        // 如果是「採集中」，增加「召回」按鈕
        if (m.type === 'gathering') {
            btnHtml += `<button onclick="window.recallMarch('${m.id}')" style="background:#ef4444; color:white; border:none; border-radius:4px; padding:3px 8px; font-size:0.75rem; margin-left:6px; cursor:pointer; pointer-events:auto;">↩️ 召回</button>`;
        }

        html += `
        <div style="background:rgba(15, 23, 42, 0.85); border:1px solid ${color}; border-radius:6px; padding:10px; color:white; pointer-events:auto; box-shadow:0 4px 6px rgba(0,0,0,0.4); backdrop-filter:blur(4px);">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9rem; margin-bottom:8px;">
                <span style="font-weight:bold; color:${color};">${icon} ${actionName}</span>
                <span style="color:#facc15; font-family:monospace; font-weight:bold;">${formatTime(remainSec)}</span>
            </div>
            <div style="font-size:0.8rem; color:#cbd5e1; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85px;">${targetStr}</span>
                <div>${btnHtml}</div>
            </div>
            <div style="background:#334155; height:5px; border-radius:3px; overflow:hidden;">
                <div style="background:${color}; height:100%; width:${pct}%; transition:width 1s linear;"></div>
            </div>
        </div>
        `;
    });
    
    hud.innerHTML = html;
};

// 📍 定位目標函數
window.locateMarchTarget = (tx, ty) => {
    window.switchTab('world');
    setTimeout(() => { centerCameraOn(tx, ty); }, 50);
};

// ↩️ 召回部隊函數
window.recallMarch = async (marchId) => {
    if (!myData) return;
    const idx = myData.marches.findIndex(m => m.id === marchId);
    if (idx === -1) return;
    
    let m = myData.marches[idx];
    if (m.type === 'gathering') {
        const confirmRecall = confirm("確定要提前召回部隊嗎？\n(系統將會依照已駐紮的時間，按比例結算並帶回資源！)");
        if (!confirmRecall) return;

        const now = Date.now();
        const totalTime = m.finishesAt - m.startTime;
        const elapsed = now - m.startTime;
        
        // 算出已經採集了百分之多少
        const ratio = Math.min(1, Math.max(0, elapsed / totalTime));
        
        // 計算按比例獲得的資源
        const partialLoot = Math.floor((m.capacity || 0) * ratio);
        
        m.type = 'return';
        m.loot = { wood: 0, iron: 0, food: 0 };
        if (m.resType) m.loot[m.resType] = partialLoot;
        
        // 重新計算返航時間與起終點
        const dist = Math.hypot(myData.x - m.targetX, myData.y - m.targetY);
        m.startX = m.targetX; 
        m.startY = m.targetY;
        m.targetX = myData.x;
        m.targetY = myData.y;
        m.startTime = now;
        m.finishesAt = now + Math.ceil(dist * 2.5 * 1000); // 計算返航速度
        m.timeFixed = true; 
        
        // 釋放地圖資源點，讓其他玩家可以佔領
        try { deleteDoc(doc(db, "world_map", `NODE_${m.startX}_${m.startY}`)); }catch(e){}
        
        myData.logs.unshift(`[召回部隊] 駐紮部隊已中斷採集，帶著 ${partialLoot} 資源返航中！`);
        await savePrivateData();
        window.renderMarchHUD();
        window.renderSelf();
    }
};
// ==========================================
// 🌟 野外 NPC 動態重生系統 (打死後隨機換位置)
// ==========================================
window.spawnDynamicNPC = function(oldX, oldY, entity) {
    if (!myData.dynamicNPCs) myData.dynamicNPCs = [];
    let tries = 0; let nx = oldX, ny = oldY;
    while (tries < 50) {
        // 在 4~12 格的距離內隨機找新地點
        let dist = 4 + Math.floor(Math.random() * 9); 
        let angle = Math.random() * Math.PI * 2;
        nx = Math.floor(oldX + Math.cos(angle) * dist);
        ny = Math.floor(oldY + Math.sin(angle) * dist);
        
        if (nx > 2 && nx < WORLD_COLS-2 && ny > 2 && ny < WORLD_ROWS-2) {
            const cell = MAP_CACHE[nx] && MAP_CACHE[nx][ny];
            // 確保新地點是空地、不是水域、沒有城堡、沒有現存實體、也沒有燃燒的墳墓
            if (cell && cell.type !== 'water' && !cell.entity && !allCastles.some(c=>c.x===nx&&c.y===ny) && !getClearedPOI(nx, ny)) {
                break;
            }
        }
        tries++;
    }
    if (tries < 50) {
        // 將新 NPC 寫入動態資料庫與地圖快取
        myData.dynamicNPCs.push({ x: nx, y: ny, entity: entity });
        if (MAP_CACHE[nx] && MAP_CACHE[nx][ny]) MAP_CACHE[nx][ny].entity = entity;
    }
};

window.applyDynamicNPCs = function() {
    if (!myData || !myData.dynamicNPCs) return;
    myData.dynamicNPCs.forEach(d => {
        if (MAP_CACHE[d.x] && MAP_CACHE[d.x][d.y]) {
            MAP_CACHE[d.x][d.y].entity = d.entity;
        }
    });
};
// ==========================================
// 🤝 聯盟系統 (創建、加入、退出、成員名單)
// ==========================================
window.renderAllianceUI = async function() {
    const container = document.getElementById('tab-alliance');
    if (!container) return;

    if (!myData.allianceName) {
        // --- 尚未加入聯盟：顯示創建與加入介面 ---
        container.innerHTML = `
            <div style="padding: 20px; color: white;">
                <h2 style="color: #38bdf8; text-align: center; margin-top:0;">🛡️ 聯盟大廳</h2>
                <p style="text-align: center; color: #94a3b8; font-size: 0.85rem;">加入聯盟，與戰友並肩作戰，享受免受盟友攻擊的保護！</p>
                
                <div style="background: #1e293b; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #334155;">
                    <h3 style="color: #10b981; margin-top: 0; font-size: 1.1rem;">👑 創建新聯盟</h3>
                    <input type="text" id="input-alliance-name" placeholder="輸入聯盟名稱 (最多6字)" maxlength="6" style="width: calc(100% - 16px); padding: 8px; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: white; margin-bottom: 10px;">
                    <button onclick="window.createAlliance()" style="background: #0ea5e9; color: white; border: none; padding: 10px; width: 100%; border-radius: 4px; font-weight: bold; cursor: pointer; transition: transform 0.1s;">創建聯盟 (需木鐵糧各 10,000)</button>
                </div>

                <div style="background: #1e293b; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #334155;">
                    <h3 style="color: #facc15; margin-top: 0; font-size: 1.1rem;">🤝 加入現有聯盟</h3>
                    <div id="alliance-list" style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
                        <p style="color: #64748b; text-align: center;">搜尋聯盟中...</p>
                    </div>
                </div>
            </div>
        `;
        window.loadAllianceList();
    } else {
        // --- 已加入聯盟：顯示內部名單 ---
        container.innerHTML = `
            <div style="padding: 20px; color: white;">
                <h2 style="color: #facc15; text-align: center; margin-top:0;">🛡️ [${myData.allianceName}] 聯盟內部</h2>
                
                <div style="background: #1e293b; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #334155;">
                    <h3 style="color: #38bdf8; margin-top: 0; font-size: 1.1rem;">👥 聯盟成員名單 (依戰力/市政廳排序)</h3>
                    <div id="alliance-members-list" style="max-height: 350px; overflow-y: auto; padding-right: 5px;">
                        <p style="color: #64748b; text-align: center;">讀取名單中...</p>
                    </div>
                </div>
                
                <button onclick="window.leaveAlliance()" style="background: #ef4444; color: white; border: none; padding: 12px; width: 100%; border-radius: 6px; font-weight: bold; cursor: pointer; margin-top: 20px; transition: transform 0.1s;">🚪 退出聯盟</button>
            </div>
        `;
        window.loadAllianceMembers();
    }
};

window.createAlliance = async () => {
    const name = document.getElementById('input-alliance-name').value.trim();
    if (!name || name.length > 6) return alert("請輸入有效的聯盟名稱 (1~6字)！");
    if (myData.wood < 10000 || myData.iron < 10000 || myData.food < 10000) return alert("創建聯盟需要 木材、鐵礦、糧草各 10,000！資源不足！");
    
    try {
        const refName = "ALLIANCE_" + name;
        const snap = await getDoc(doc(db, "world_map", refName));
        if (snap.exists()) return alert("該聯盟名稱已被使用，請換一個名字！");
        
        myData.wood -= 10000; myData.iron -= 10000; myData.food -= 10000;
        myData.allianceName = name;
        
        await setDoc(doc(db, "world_map", refName), {
            isAlliance: true, name: name, leader: myUid, members: [myUid], createdAt: Date.now()
        });
        
        await savePrivateData();
        await setDoc(doc(db, "world_map", myUid), { allianceName: name }, { merge: true });
        
        alert(`🎉 成功創建並成為 [${name}] 的盟主！`);
        window.renderAllianceUI(); window.refreshMap(); window.renderSelf();
    } catch (e) { alert("創建失敗: " + e.message); }
};

window.loadAllianceList = async () => {
    try {
        const snap = await getDocs(collection(db, "world_map"));
        let listHtml = '';
        snap.forEach(d => {
            const data = d.data();
            if (data.isAlliance) {
                listHtml += `
                <div style="background: #0f172a; padding: 12px; margin-bottom: 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #1e293b;">
                    <div>
                        <strong style="color: #38bdf8; font-size:1.1rem;">[${data.name}]</strong><br>
                        <span style="font-size: 0.8rem; color: #94a3b8;">成員數: ${data.members ? data.members.length : 1} 人</span>
                    </div>
                    <button onclick="window.joinAlliance('${data.name}')" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight:bold; cursor: pointer;">加入</button>
                </div>`;
            }
        });
        const listDiv = document.getElementById('alliance-list');
        if (listDiv) listDiv.innerHTML = listHtml || '<p style="color:#94a3b8; text-align:center;">伺服器目前還沒有任何聯盟，來做第一個建國的先驅者吧！</p>';
    } catch(e) {}
};

window.joinAlliance = async (name) => {
    try {
        const ref = doc(db, "world_map", "ALLIANCE_" + name);
        const snap = await getDoc(ref);
        if (!snap.exists()) return alert("找不到該聯盟，可能已被解散！");
        
        let data = snap.data();
        if (!data.members) data.members = [];
        if (!data.members.includes(myUid)) data.members.push(myUid);
        
        await setDoc(ref, { members: data.members }, { merge: true });
        
        myData.allianceName = name;
        myData.logs.unshift(`[聯盟] 恭喜您，已成功加入 ${name} 聯盟！`);
        
        await savePrivateData();
        await setDoc(doc(db, "world_map", myUid), { allianceName: name }, { merge: true });
        
        alert(`🎉 成功加入聯盟 [${name}]！`);
        window.renderAllianceUI(); window.refreshMap(); window.renderSelf();
    } catch (e) { alert("加入失敗: " + e.message); }
};

window.leaveAlliance = async () => {
    if (!confirm("🚪 確定要退出聯盟嗎？(退出後將失去盟友保護與支援)")) return;
    try {
        const oldName = myData.allianceName;
        const ref = doc(db, "world_map", "ALLIANCE_" + oldName);
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            let data = snap.data();
            if (data.members) {
                data.members = data.members.filter(uid => uid !== myUid);
                if (data.members.length === 0) {
                    await deleteDoc(ref); // 聯盟沒人自動解散
                } else {
                    if (data.leader === myUid) data.leader = data.members[0]; // 盟主退出自動傳位
                    await setDoc(ref, { members: data.members, leader: data.leader }, { merge: true });
                }
            }
        }
        
        myData.allianceName = null;
        myData.logs.unshift(`[聯盟] 您已離開了聯盟。`);
        
        await savePrivateData();
        await setDoc(doc(db, "world_map", myUid), { allianceName: null }, { merge: true });
        
        alert(`🚪 已退出聯盟！`);
        window.renderAllianceUI(); window.refreshMap(); window.renderSelf();
    } catch (e) { alert("退出失敗: " + e.message); }
};

window.loadAllianceMembers = async () => {
    try {
        // 利用本機快取的地圖玩家名單，快速找出盟友
        const members = allCastles.filter(c => c.allianceName === myData.allianceName);
        members.push({ id: myUid, name: myData.name, castleLevel: myData.buildings.castle, x: myData.x, y: myData.y });
        
        const uniqueMembers = []; const seen = new Set();
        members.forEach(m => { if(!seen.has(m.id)){ seen.add(m.id); uniqueMembers.push(m); }});
        uniqueMembers.sort((a,b) => (b.castleLevel||1) - (a.castleLevel||1)); // 等級高的排前面

        let html = uniqueMembers.map(m => `
            <div style="background: #0f172a; padding: 10px; margin-bottom: 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${m.id === myUid ? '#facc15' : '#38bdf8'};">
                <div>
                    <strong style="color: #fff;">${m.id === myUid ? '(我) ' : ''}${m.name}</strong> 
                    <span style="color: #facc15; font-size: 0.85rem;">(Lv.${m.castleLevel||1})</span><br>
                    <span style="font-size: 0.8rem; color: #94a3b8;">座標: (${m.x}, ${m.y})</span>
                </div>
                <button onclick="window.locatePlayer(${m.x}, ${m.y})" style="background: #0ea5e9; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight:bold; cursor: pointer; transition: 0.1s;">📍 尋找</button>
            </div>
        `).join('');
        
        const listDiv = document.getElementById('alliance-members-list');
        if (listDiv) listDiv.innerHTML = html;
    } catch(e) {}
};
// ==========================================
// 🤝 盟友派兵支援系統
// ==========================================
window.resolveSupportPlayer = async function(m) {
    let res = { completed: false };
    try {
        await runTransaction(db, async (transaction) => {
            const tPrivRef = doc(db, "players", m.targetUid);
            const tPubRef = doc(db, "world_map", m.targetUid);
            const tDoc = await transaction.get(tPrivRef);
            if (!tDoc.exists()) throw new Error("城池空");
            const target = tDoc.data();
            
            let targetTroops = target.troops || {infantry:0, archer:0, cavalry:0};
            targetTroops.infantry += m.troops.infantry; targetTroops.archer += m.troops.archer; targetTroops.cavalry += m.troops.cavalry;
            
            let allyLog = `[盟友支援] 盟友【${myData.name}】的支援部隊抵達！獲得兵力: 🛡️${m.troops.infantry} 🏹${m.troops.archer} 🐎${m.troops.cavalry}`;
            transaction.set(tPrivRef, { troops: targetTroops, logs: [allyLog, ...(target.logs || [])] }, { merge: true });
            
            const totalT = targetTroops.infantry + targetTroops.archer + targetTroops.cavalry;
            transaction.set(tPubRef, { troops: totalT }, { merge: true });
            res.completed = true;
        });
    } catch(e) {}
    return res;
};
