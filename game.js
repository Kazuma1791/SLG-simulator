import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, collection, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCaowUN5atHnnlfvGmfWA0PDyjfQU3Qr0U",
  authDomain: "slg-game-617b3.firebaseapp.com",
  projectId: "slg-game-617b3",
  storageBucket: "slg-game-617b3.firebasestorage.app",
  messagingSenderId: "418102371703",
  appId: "1:418102371703:web:d872ccee572039b65d2d72"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 💡 地圖擴大四倍：200 x 200，中心點為 100, 100
let myUid = null, myData = null, allCastles = [], worldBosses = [], worldNodes = [], hasCentered = false;
let godModeFog = false, isAdmin = false; 

const TILE_SIZE = 55, WORLD_COLS = 200, WORLD_ROWS = 200, BASE_VISION_RADIUS = 5;
const RELOCATE_COOLDOWN = 12 * 60 * 60 * 1000; 
let currentVisionBonus = 0, camX = 0, camY = 0, zoom = 1.0;
const MIN_ZOOM = 0.05, MAX_ZOOM = 2.0;

const canvas = document.getElementById("worldCanvas"), ctx = canvas.getContext("2d");
let MAP_CACHE = [];
const exploredTiles = Array.from({ length: WORLD_COLS }, () => Array(WORLD_ROWS).fill(false));

const castleImgs = [];
for (let i = 1; i <= 7; i++) {
    const img = new Image();
    img.src = `ico_buildings_haven_cityHall_0${i}.png`; 
    castleImgs.push(img);
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

const CFG = {
  buildings: { 
    castle:    { name: '主城',     rate: 0,   baseW: 600, baseI: 600, baseTime: 1200, maxLevel: 99 },
    academy:   { name: '學院',     rate: 0,   baseW: 400, baseI: 400, baseTime: 900, maxLevel: 99 },
    builder:   { name: '工匠小屋', rate: 0,   baseW: 2000, baseI: 2000, baseTime: 1800, maxLevel: 3 }, 
    wall:      { name: '城牆',     rate: 0,   baseW: 800, baseI: 800, baseTime: 600, maxLevel: 99 },
    warehouse: { name: '地下倉庫', rate: 0,   baseW: 500, baseI: 500, baseTime: 400, maxLevel: 99 },
    lumber:    { name: '伐木場',   rate: 1.0, baseW: 100, baseI: 50,  baseTime: 300, maxLevel: 99 }, 
    mine:      { name: '鐵礦場',   rate: 0.8, baseW: 50,  baseI: 100, baseTime: 300, maxLevel: 99 }, 
    farm:      { name: '農田',     rate: 1.2, baseW: 80,  baseI: 80,  baseTime: 300, maxLevel: 99 }, 
    barracks:  { name: '兵營',     rate: 0,   baseW: 200, baseI: 200, baseTime: 600, maxLevel: 99 } 
  },
  techs: {
    infantry_atk: { name: '步兵鍛甲', icon: '🛡️', baseW: 300, baseI: 300, baseTime: 600 },
    archer_atk:   { name: '弓兵矢志', icon: '🏹', baseW: 300, baseI: 300, baseTime: 600 },
    cavalry_atk:  { name: '騎術改良', icon: '🐎', baseW: 300, baseI: 300, baseTime: 600 }
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
    if(!base) return {w:0,i:0};
    const m = Math.pow(1.5, level||0); return { w: Math.floor(base.baseW * m), i: Math.floor(base.baseI * m) }; 
}
function getUpgradeTime(key, level, isTech=false) { 
    const baseCfg = isTech ? CFG.techs[key] : CFG.buildings[key]; 
    if(!baseCfg) return 60;
    const base = baseCfg.baseTime || 60; return Math.floor(base * Math.pow(1.5, Math.max(0, (level||0) - 1))); 
}
function formatTime(sec) {
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec/60) + 'm' + (sec%60 > 0 ? ' '+(sec%60)+'s' : '');
  return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm';
}

function getTileTypeRaw(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; const rand = v - Math.floor(v);
  if (rand < 0.55) return 'plains'; if (rand < 0.75) return 'forest'; if (rand < 0.88) return 'mountain'; return 'water';
}

// 💡 中心點改為 100,100，刪除流寇，加入野外資源據點
function getStaticEntity(x, y, type) {
  if (x === 100 && y === 100) return { type: 'npc_capital', name: '😈 黑暗王城', reqPwr: 15000, loot: { wood: 500000, iron: 500000, food: 500000, speedup1h: 5, resourceCard: 2 } };
  if (type === 'water') return null;
  const dist = Math.hypot(x - 100, y - 100);
  const v = Math.sin(x * 45.123 + y * 89.456) * 98765.4321; const rand = v - Math.floor(v); 
  
  if (dist <= 28) {
    if (rand < 0.010) return { type: 'npc_fortress', name: '🏯 黑暗要塞', reqPwr: 5000, loot: { wood: 50000, iron: 50000, food: 50000, speedup30m: 3, resourceCard: 1 } };
    if (rand < 0.025) return { type: 'npc_super_castle', name: '🏰 夢魘巨城', reqPwr: 8000, loot: { iron: 100000, wood: 100000, food: 100000, speedup1h: 1 } };
    if (rand < 0.045) return { type: 'res_mine', name: '⛏️ 核心晶礦', res: 'iron', cap: 100000, reqPwr: 1000 };
    return null;
  }
  if (dist <= 64) {
    if (rand < 0.010) return { type: 'npc_castle', name: '🏰 黑暗城堡', reqPwr: 2000, loot: { wood: 20000, iron: 20000, food: 20000, speedup30m: 1 } };
    if (rand < 0.035) return { type: 'barbarian', name: '👹 狂暴野蠻人', reqPwr: 800, loot: { iron: 8000, wood: 4000, food: 6000, speedup5m: 5 } };
    if (rand < 0.055) return { type: 'res_farm', name: '🌾 豐饒農田', res: 'food', cap: 50000, reqPwr: 500 };
    if (rand < 0.075) return { type: 'res_lumber', name: '🌲 茂密林地', res: 'wood', cap: 50000, reqPwr: 500 };
    return null;
  }
  if (rand < 0.005) return { type: 'npc_outpost', name: '🏚️ 黑暗前哨', reqPwr: 300, loot: { wood: 5000, iron: 5000, food: 5000, speedup5m: 3 } };
  if (rand < 0.025) return { type: 'barbarian', name: '👹 野蠻人部落', reqPwr: 100, loot: { iron: 1500, wood: 1000, food: 1200, speedup5m: 1 } };
  if (rand < 0.045) return { type: 'relic', name: '🏛️ 破碎遺跡', reqFood: 30, loot: { wood: 500, iron: 500, food: 500 } };
  if (rand < 0.065) return { type: 'res_farm', name: '🌾 小型農田', res: 'food', cap: 15000, reqPwr: 100 };
  if (rand < 0.085) return { type: 'res_lumber', name: '🌲 散落林木', res: 'wood', cap: 15000, reqPwr: 100 };
  if (rand < 0.100) return { type: 'res_mine', name: '⛏️ 露天鐵礦', res: 'iron', cap: 15000, reqPwr: 100 };
  return null;
}

function initMapCache() {
  for(let x=0; x<WORLD_COLS; x++) { MAP_CACHE[x] = []; for(let y=0; y<WORLD_ROWS; y++) { let t = getTileTypeRaw(x,y); if (x===100 && y===100) t = 'plains'; MAP_CACHE[x][y] = { type: t, entity: getStaticEntity(x,y,t) }; } }
}
initMapCache();

function sanitizeData() {
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
  
  if (isNaN(myData.wood) || myData.wood === null) myData.wood = 200;
  if (isNaN(myData.iron) || myData.iron === null) myData.iron = 200;
  if (isNaN(myData.food) || myData.food === null) myData.food = 200;
  if (isNaN(myData.shieldEndsAt) || myData.shieldEndsAt === null) myData.shieldEndsAt = 0;
  if (isNaN(myData.lastRelocateTime) || myData.lastRelocateTime === null) myData.lastRelocateTime = 0;
  if (typeof myData.isBanned !== 'boolean') myData.isBanned = false;
}

function runAntiCheat() {
    if (isAdmin || myData.isBanned) return false;
    let cheatDetected = false; let reason = "";
    const MAX_RESOURCE = 2000000000; const MAX_TROOPS = 2000000000; const MAX_ITEMS = 100000;
    if (myData.wood > MAX_RESOURCE || myData.iron > MAX_RESOURCE || myData.food > MAX_RESOURCE) { cheatDetected = true; reason = "修改資源數量異常"; }
    if (myData.troops.infantry > MAX_TROOPS || myData.troops.archer > MAX_TROOPS || myData.troops.cavalry > MAX_TROOPS) { cheatDetected = true; reason = "修改兵力數量異常"; }
    if (myData.items.speedup5m > MAX_ITEMS || myData.items.shieldCard > MAX_ITEMS || myData.items.resourceCard > MAX_ITEMS) { cheatDetected = true; reason = "修改道具數量異常"; }
    if (myData.buildings.castle > 100 || myData.buildings.builder > 10) { cheatDetected = true; reason = "修改建築等級異常"; }
    if (myData.name) myData.name = myData.name.replace(/[<>]/g, "").substring(0, 15);

    if (cheatDetected) {
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
  let bx, by, bName, bHp, mult, overlap;
  let tries = 0;
  do {
    overlap = false;
    tries++;
    if (id === 'BOSS_CORE') {
      bx=100+Math.floor(Math.random()*24-12); by=100+Math.floor(Math.random()*24-12);
    } else if (id.startsWith('BOSS_MID')) {
      bx=100+Math.floor(Math.random()*60-30); by=100+Math.floor(Math.random()*60-30);
    } else {
      bx=Math.floor(Math.random()*190+5); by=Math.floor(Math.random()*190+5);
    }
    
    const dist = Math.hypot(bx-100, by-100);
    if (id === 'BOSS_CORE' && bx===100 && by===100) { overlap = true; continue; }
    if (id.startsWith('BOSS_MID') && dist < 30) { overlap = true; continue; }
    if (id.startsWith('BOSS_OUTER') && dist <= 70) { overlap = true; continue; }
    
    for (let b of worldBosses) {
        if (b.id !== id && (b.hp > 0 || b.despawnAt > Date.now())) {
            if (Math.hypot(b.x - bx, b.y - by) < 15) { overlap = true; break; }
        }
    }
    if (overlap) continue;
    for (let i=0; i<=1; i++) {
        for (let j=0; j<=1; j++) {
            let type = getTileTypeRaw(bx+i, by+j);
            if (type === 'water' || type === 'mountain') overlap = true;
        }
    }
  } while(overlap && tries < 200);

  if (id === 'BOSS_CORE') { bName = '🐉 滅世魔龍'; bHp = 500000; mult = 20; }
  else if (id.startsWith('BOSS_MID')) { bName = Math.random()>0.5?'🦑 深海巨妖':'🦅 風暴巨鷹'; bHp = 150000; mult = 8; }
  else { bName = '🗿 大地岩魔'; bHp = 50000; mult = 3; }
  
  await setDoc(doc(db, "world_map", id), { name: bName, isBoss: true, x: bx, y: by, hp: bHp, maxHp: bHp, mult: mult, spawnId: Date.now(), contributors: {}, despawnAt: Date.now() + 6 * 3600 * 1000 });
}

// 💡 修正開關迷霧陣列重置的問題
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
          // 💡 新帳號降生地點適應 200x200
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
          myData = pSnap.data(); sanitizeData(); await setDoc(playerRef, myData, {merge:true});
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
        if (myData.isBanned) { document.getElementById('ban-screen').style.display = 'flex'; document.getElementById('ban-reason').innerText = myData.banReason || "違反遊戲規章"; return; } 
        else { document.getElementById('ban-screen').style.display = 'none'; }

        isAdmin = (user.email === 'topacoau@gmail.com');
        document.getElementById('btn-tab-gm').style.display = isAdmin ? 'block' : 'none';

        updateFogOfWar();
        if (!hasCentered) { resizeCanvas(); centerCameraOn(myData.x, myData.y); hasCentered = true; }
        
        const isUnderAttack = myData.marches.some(m => m.type === 'defend_npc');
        document.getElementById('danger-overlay').style.display = isUnderAttack ? 'block' : 'none';
        try { window.renderSelf(); } catch(e) { }
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

window.addEventListener("beforeunload", () => { if (myUid && myData) savePrivateData(); });

// ==========================================
// 👑 GM 面板操作
// ==========================================
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
  bossIds.forEach(id => spawnWorldBoss(id)); alert("已強制重生所有 世界 Boss！");
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
    
    if (action === 'ban') { tData.isBanned = true; tData.banReason = "管理員手動永久封鎖"; }
    if (action === 'unban') { tData.isBanned = false; tData.banReason = ""; }
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
    const field = document.getElementById('gm-custom-field').value;
    const amount = parseInt(document.getElementById('gm-custom-amount').value);
    if(isNaN(amount)) return alert("請輸入正確數值");
    
    const targetRef = doc(db, "players", targetUid);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) return alert("找不到該名玩家！");
    let tData = targetSnap.data();
    
    if(['wood','iron','food'].includes(field)) tData[field] = amount;
    if(['infantry','archer','cavalry'].includes(field)) { tData.troops = tData.troops || {}; tData.troops[field] = amount; }
    if(field.startsWith('speedup') || field === 'shieldCard') { tData.items = tData.items || {}; tData.items[field] = amount; }
    if(field === 'castleLevel') { tData.buildings = tData.buildings || {}; tData.buildings.castle = amount; }
    
    tData.logs = tData.logs || []; tData.logs.unshift(`[GM] 您的資料已被管理員手動修正。`);
    await setDoc(targetRef, tData, {merge: true});
    
    if(['infantry','archer','cavalry'].includes(field)) {
        const totalT = (tData.troops.infantry||0) + (tData.troops.archer||0) + (tData.troops.cavalry||0);
        await setDoc(doc(db, "world_map", targetUid), { troops: totalT }, {merge: true});
    }
    if(field === 'castleLevel') await setDoc(doc(db, "world_map", targetUid), { castleLevel: amount }, {merge: true});
    alert(`✅ 已將玩家 ${tData.name} 的 [${field}] 修改為 ${amount}`);
}

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
    if(d.troops && (d.troops.infantry > 5000000 || d.troops.archer > 5000000 || d.troops.cavalry > 5000000)) { report += `⚠️ 兵力數量異常！\n`; isSus = true; }
    if(d.items && (d.items.speedup1h > 10000 || d.items.shieldCard > 10000)) { report += `⚠️ 道具數量異常！\n`; isSus = true; }
    if(!isSus) report += `✅ 當前數值無明顯異常\n`;
    report += `\n--- 外掛查緝紀錄 ---\n`;
    if (d.cheatLog && d.cheatLog.length > 0) { d.cheatLog.slice(0, 5).forEach(log => report += log + '\n'); } else { report += `無違規紀錄。\n`; }
    alert(report);
}

// ==========================================
// 地圖與視圖更新
// ==========================================
function resizeCanvas() {
  const frame = document.getElementById('map-frame');
  if(frame && canvas) { canvas.width = frame.clientWidth; canvas.height = frame.clientHeight; clampCamera(); }
}
window.addEventListener('resize', resizeCanvas);

function updateFogOfWar() {
  if (!myData) return;
  // 💡 修復迷霧開關：先將所有格子重置為全黑
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
    try { await setDoc(doc(db, "players", myUid), myData, { merge: true }); } catch(e){}
}

// 💡 更新全域野外據點資訊
window.refreshMap = async function() {
  const snap = await getDocs(collection(db, "world_map"));
  allCastles = []; worldNodes = [];
  snap.forEach(d => { 
      const data = d.data();
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
     return `
      <div style="background:#1e293b; border:1px solid #334155; border-radius:6px; padding:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="window.selectGMTarget('${p.id}', '${p.name}')">
          <div style="pointer-events:none;">
              <strong style="color:#fff; font-size:0.95rem;">${p.name}</strong> <span style="color:#fbbf24; font-size:0.85rem;">(Lv.${p.castleLevel || 1})</span> ${isShielded?'<span style="color:#06b6d4; font-size:0.75rem;">[🛡️]</span>':''}<br>
              <span style="font-size:0.75rem; color:#94a3b8;">ID: ${p.id.slice(0,6)}... | 座標: (${p.x}, ${p.y})</span>
          </div>
          <button onclick="event.stopPropagation(); window.locatePlayer(${p.x}, ${p.y})" style="background:#8b5cf6; padding:6px 10px; font-size:0.8rem;">📍 尋找</button>
      </div>
    `}).join('');
}

window.locatePlayer = (x, y) => { window.switchTab('world'); centerCameraOn(x, y); };

// ==========================================
// 遊戲心跳與野外資源結算
// ==========================================
async function localTick() {
  if (!myData || myData.isBanned) return;
  sanitizeData(); 
  
  const now = Date.now(), dt = (now - myData.lastTick) / 1000; myData.lastTick = now;

  const hrToSec = 3600;
  const upkeepPerSec = (myData.troops.infantry*CFG.troops.infantry.upkeep + myData.troops.archer*CFG.troops.archer.upkeep + myData.troops.cavalry*CFG.troops.cavalry.upkeep) / hrToSec;
  const farmProdPerSec = CFG.buildings.farm.rate * myData.buildings.farm;
  
  myData.wood += dt * (CFG.buildings.lumber.rate * myData.buildings.lumber);
  myData.iron += dt * (CFG.buildings.mine.rate * myData.buildings.mine);
  myData.food += dt * farmProdPerSec - dt * upkeepPerSec;
  if (myData.food < 0) myData.food = 0;

  let needSave = false;
  
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
             myData.logs.unshift(`🏆 [首領討伐成功] ${boss.name} 被擊殺！您造成的傷害貢獻為 ${myDmg}，分得戰利品: ${lootStr}`);
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
        const enemyPwr = Math.floor(10 + myData.buildings.castle * 15);
        myData.marches.push({
          id: 'M'+Date.now(), type: 'defend_npc', startX: nearestNPC.x, startY: nearestNPC.y, targetX: myData.x, targetY: myData.y,
          startTime: Date.now(), finishesAt: Date.now() + timeMs, npcPower: enemyPwr, npcName: nearestNPC.ent.name
        });
        myData.logs.unshift(`🚨 [警戒] ${nearestNPC.ent.name} 敵軍正朝我方進軍！預計 ${formatTime(Math.ceil(timeMs/1000))} 抵達！`);
        needSave = true;
      }
    }
  }

  let newMarches = [];
  for (let m of myData.marches) {
    if (now >= m.finishesAt && m.type !== 'gathering') {
      if (m.type === 'return') {
        myData.troops.infantry += m.troops.infantry; myData.troops.archer += m.troops.archer; myData.troops.cavalry += m.troops.cavalry;
        myData.wood += (m.loot.wood || 0); myData.iron += (m.loot.iron || 0); myData.food += (m.loot.food || 0);
        if (m.loot.speedup5m) myData.items.speedup5m += m.loot.speedup5m;
        if (m.loot.speedup30m) myData.items.speedup30m += m.loot.speedup30m;
        if (m.loot.speedup1h) myData.items.speedup1h += m.loot.speedup1h;
        if (m.loot.resourceCard) myData.items.resourceCard += m.loot.resourceCard;
        
        let lootStr = `木:${formatCompact(m.loot.wood||0)} 鐵:${formatCompact(m.loot.iron||0)} 糧:${formatCompact(m.loot.food||0)}`;
        if (m.loot.speedup1h) lootStr += ` | ⚡1hx${m.loot.speedup1h}`;
        else if (m.loot.speedup30m) lootStr += ` | ⚡30mx${m.loot.speedup30m}`;
        else if (m.loot.speedup5m) lootStr += ` | ⚡5mx${m.loot.speedup5m}`;
        if (m.loot.resourceCard) lootStr += ` | 📦x${m.loot.resourceCard}`;
        
        if (m.loot.wood > 0 || m.loot.speedup5m > 0 || m.loot.resourceCard > 0) {
            myData.logs.unshift(`[歸城] 遠征軍安全返回。帶回 ${lootStr}`);
        } else { myData.logs.unshift(`[歸城] 遠征軍安全返回城池。`); }
        try{ setDoc(doc(db, "world_map", myUid), { troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry }, { merge: true }); }catch(e){}
      } 
      else if (m.type === 'attack_player') { const res = await resolveAttackPlayer(m); if (res.survived) newMarches.push(createReturnMarch(m, res.troops, res.loot)); } 
      else if (m.type === 'attack_boss') { const res = await resolveAttackBoss(m); if (res.survived) newMarches.push(createReturnMarch(m, res.troops, res.loot)); }
      else if (m.type === 'defend_npc') { await resolveDefendNPC(m); }
      // 💡 結算資源佔領戰
      else if (m.type === 'occupy_node') { 
          const res = await resolveOccupyNode(m);
          if (res.isGathering) {
              m.type = 'gathering'; m.startTime = Date.now(); m.finishesAt = Date.now() + 3600 * 1000;
              m.capacity = res.cap; m.resType = res.resType;
              newMarches.push(m);
          } else if (res.survived) { newMarches.push(createReturnMarch(m, res.troops, res.loot)); }
      }
      else { const res = await resolveInteractNPC(m); if (res.survived) newMarches.push(createReturnMarch(m, res.troops, res.loot)); }
      needSave = true;
    } 
    // 💡 採集中的狀態判定：期滿自動帶回、或被別人打飛
    else if (m.type === 'gathering') {
      if (now >= m.finishesAt) {
          m.type = 'return'; m.loot = { wood:0, iron:0, food:0 }; m.loot[m.resType] = m.capacity;
          m.finishesAt = now + (now - m.startTime); // 回程時間
          try { deleteDoc(doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`)); }catch(e){}
          myData.logs.unshift(`[採集完成] 駐紮部隊滿載而歸！`);
          newMarches.push(m);
          needSave = true;
      } else {
          newMarches.push(m);
          // 每 10 秒檢查一次自己是否還擁有該據點
          if (Math.floor(now/1000) % 10 === 0) {
              getDoc(doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`)).then(snap => {
                  if (snap.exists() && snap.data().uid !== myUid) {
                      const idx = myData.marches.findIndex(x => x.id === m.id);
                      if (idx !== -1) {
                          myData.marches[idx].type = 'return';
                          myData.marches[idx].loot = { wood:0, iron:0, food:0 };
                          myData.marches[idx].troops.infantry = Math.floor(myData.marches[idx].troops.infantry * 0.3); // 戰敗損失部隊
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
  try { window.renderSelf(); } catch(e){}
}

function createReturnMarch(oldMarch, survivedTroops, loot) {
  return { id: 'R'+Date.now(), type: 'return', startX: oldMarch.targetX, startY: oldMarch.targetY, targetX: oldMarch.startX, targetY: oldMarch.startY, startTime: Date.now(), finishesAt: Date.now() + (oldMarch.finishesAt - oldMarch.startTime), troops: survivedTroops, loot: loot };
}

function getPwrByTech(troops, tech) {
  return (troops.infantry||0) * (CFG.troops.infantry.pwr + (tech.infantry_atk||0)) +
         (troops.archer||0) * (CFG.troops.archer.pwr + (tech.archer_atk||0)) +
         (troops.cavalry||0) * (CFG.troops.cavalry.pwr + (tech.cavalry_atk||0));
}

// 💡 解決野外資源點佔領戰 (PVP)
async function resolveOccupyNode(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0}, isGathering: false, cap: m.entity.cap, resType: m.entity.res };
  try {
    await runTransaction(db, async (transaction) => {
      const nodeRef = doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`);
      const snap = await transaction.get(nodeRef);
      let defender = snap.exists() ? snap.data() : null;
      
      const attPwr = getPwrByTech(m.troops, m.techs);
      
      if (defender && defender.uid !== myUid) {
          const defPwr = getPwrByTech(defender.troops, defender.techs || {});
          if (attPwr > defPwr) {
              // 攻打成功，寫入新的佔領者
              transaction.set(nodeRef, { isNode: true, uid: myUid, name: myData.name, troops: m.troops, techs: m.techs, x: m.targetX, y: m.targetY, type: m.entity.type });
              res.isGathering = true;
              myData.logs.unshift(`[佔領成功] 擊退了敵方佔領軍！部隊開始採集資源。`);
          } else {
              res.survived = false;
              myData.logs.unshift(`[佔領失敗] 遭遇強大的敵軍防守，我方部隊全數陣亡！`);
          }
      } else {
          // 空地，直接佔領
          transaction.set(nodeRef, { isNode: true, uid: myUid, name: myData.name, troops: m.troops, techs: m.techs, x: m.targetX, y: m.targetY, type: m.entity.type });
          res.isGathering = true;
          myData.logs.unshift(`[抵達據點] 部隊已駐紮並開始採集資源。`);
      }
    });
    window.refreshMap();
  } catch (e) { console.error(e); }
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
  }
  try{ setDoc(doc(db, "world_map", myUid), { troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry }, { merge: true }); }catch(e){}
}

async function resolveInteractNPC(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0} };
  if (m.entity.type === 'relic') { 
    res.loot = m.entity.loot; myData.logs.unshift(`[發掘] 探險隊挖出巨量資源，正在返航中！`); 
  } else if (m.entity.type.startsWith('npc_')) {
    res.loot = m.entity.loot; 
    let loss = Math.floor(Math.random() * 5 + 2); 
    if (m.entity.type === 'npc_super_castle') loss = Math.floor(Math.random() * 50 + 20);
    else if (m.entity.type === 'npc_capital') loss = Math.floor(Math.random() * 30 + 10);
    if (res.troops.infantry > 0) res.troops.infantry = Math.max(0, res.troops.infantry - loss);
    myData.logs.unshift(`[遠征] 摧毀 ${m.entity.name}！滿載戰利品返航。`); 
  } else { 
    res.loot = m.entity.loot; if (res.troops.infantry > 0) res.troops.infantry -= Math.floor(Math.random() * 2); myData.logs.unshift(`[討伐] 成功剿滅 ${m.entity.name}！準備返航。`); 
  }
  myData.clearedPOI.push(`${m.targetX},${m.targetY},${Date.now()},${m.entity.type}`);
  return res;
}

async function resolveAttackBoss(m) {
  let res = { survived: true, troops: m.troops, loot: {wood:0, iron:0, food:0, speedup5m:0, speedup30m:0, speedup1h:0} };
  try {
    await runTransaction(db, async (transaction) => {
      const bRef = doc(db, "world_map", m.targetUid); const bDoc = await transaction.get(bRef);
      if (!bDoc.exists()) throw new Error("Boss dead");
      const boss = bDoc.data();
      if (boss.hp <= 0) throw new Error("Boss already dead");

      const pwr = getPwrByTech(m.troops, m.techs);
      const dmg = Math.min(boss.hp, pwr * 10 + Math.floor(Math.random()*50));
      
      boss.hp -= dmg; 
      if (boss.hp <= 0) { boss.hp = 0; boss.despawnAt = Date.now() + 15 * 60 * 1000; }
      
      boss.contributors = boss.contributors || {};
      boss.contributors[myUid] = (boss.contributors[myUid] || 0) + dmg;
      transaction.set(bRef, boss);
      myData.logs.unshift(`[首領戰] 部隊對 ${boss.name} 造成了 ${formatCompact(dmg)} 點傷害！(獎勵將於首領倒下後結算)`);
    });
  } catch (e) { myData.logs.unshift(`[首領戰] 抵達時首領已被擊敗或消失。`); }
  return res; 
}

async function resolveAttackPlayer(m) {
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
        const protectAmt = (target.buildings.warehouse || 0) * 2000;
        const lW = Math.max(0, Math.floor((target.wood - protectAmt) * 0.3));
        const lI = Math.max(0, Math.floor((target.iron - protectAmt) * 0.3));
        const lF = Math.max(0, Math.floor((target.food - protectAmt) * 0.3));

        const bKeys = Object.keys(target.buildings).filter(k => target.buildings[k] > 1);
        let dLog = ""; let pLevel = target.buildings.castle;
        if (bKeys.length > 0) {
          const rKey = bKeys[Math.floor(Math.random() * bKeys.length)]; target.buildings[rKey]--;
          dLog = `，且【${CFG.buildings[rKey].name}】遭破壞降級！`;
          if (rKey === 'castle') pLevel = target.buildings.castle;
        }
        transaction.set(tPrivRef, { wood: target.wood - lW, iron: target.iron - lI, food: target.food - lF, troops: {infantry:0,archer:0,cavalry:0}, buildings: target.buildings, logs: [`[城破] 遭到突襲！損失物資${dLog}`, ...(target.logs || [])] }, { merge: true });
        transaction.set(tPubRef, { troops: 0, castleLevel: pLevel }, { merge: true });
        res.survived = true; res.loot = { wood: lW, iron: lI, food: lF };
        myData.logs.unshift(`[大捷] 攻破 ${m.targetName}！滿載戰利品返航中。`);
      } else {
        transaction.set(tPrivRef, { logs: [`[堅壁清野] 擊退敵軍！`, ...(target.logs || [])] }, { merge: true });
        myData.logs.unshift(`[戰敗] 突擊 ${m.targetName} 遭遇重創，部隊全數陣亡！`);
      }
    });
    window.refreshMap();
  } catch (err) { 
    res.survived = true; 
    if (err.message === "Shielded") myData.logs.unshift(`[撤軍] 目標 ${m.targetName} 已開啟和平護盾，部隊折返。`);
    else myData.logs.unshift(`[撲空] 敵方已遷城，部隊折返。`); 
  }
  return res;
}

// ==========================================
// 🎨 渲染世界地圖 (200x200 靜態中世紀畫風)
// ==========================================
function renderLoop() {
  if (document.getElementById('tab-world').classList.contains('active')) drawWorldMap();
  requestAnimationFrame(renderLoop);
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

  for (let x = sC; x < eC; x++) {
    for (let y = sR; y < eR; y++) {
      if (x<0 || x>=WORLD_COLS || y<0 || y>=WORLD_ROWS) continue;
      const px = x*TILE_SIZE, py = y*TILE_SIZE;
      
      if (!exploredTiles[x][y]) { ctx.fillStyle='#050811'; ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); continue; }

      const cell = MAP_CACHE[x] && MAP_CACHE[x][y];
      // 💡 中心點改為 100,100
      const dist = Math.hypot(x-100, y-100);
      const isCore = dist <= 28, isMid = dist > 28 && dist <= 64;

      if (cell.type === 'plains') { 
        ctx.fillStyle = isCore ? '#3b1c1c' : (isMid ? '#544238' : '#8f9779'); 
        ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); 
        ctx.strokeStyle = isCore ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0,0,0,0.2)'; 
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px+10, py+20); ctx.lineTo(px+15, py+12); ctx.lineTo(px+20, py+20);
        ctx.moveTo(px+35, py+40); ctx.lineTo(px+40, py+32); ctx.lineTo(px+45, py+40);
        ctx.stroke();
      }
      else if (cell.type === 'forest') { 
        ctx.fillStyle = isCore ? '#1a0d0d' : (isMid ? '#33271e' : '#3e522d'); 
        ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); 
        ctx.fillStyle = isCore ? '#0a0505' : (isMid ? '#1c1611' : '#233318');
        ctx.beginPath(); ctx.moveTo(px+27, py+10); ctx.lineTo(px+15, py+35); ctx.lineTo(px+40, py+35); ctx.fill();
        ctx.beginPath(); ctx.moveTo(px+15, py+20); ctx.lineTo(px+5, py+45); ctx.lineTo(px+25, py+45); ctx.fill();
        ctx.beginPath(); ctx.moveTo(px+40, py+25); ctx.lineTo(px+30, py+45); ctx.lineTo(px+50, py+45); ctx.fill();
      }
      else if (cell.type === 'mountain') { 
        ctx.fillStyle = isCore ? '#1f1313' : (isMid ? '#3a3430' : '#5c544d'); 
        ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); 
        ctx.fillStyle = isCore ? '#0f0a0a' : (isMid ? '#241f1c' : '#2b2724'); 
        ctx.beginPath(); ctx.moveTo(px+27, py+8); ctx.lineTo(px+5, py+45); ctx.lineTo(px+27, py+45); ctx.fill();
        ctx.fillStyle = isCore ? '#2e1c1c' : (isMid ? '#4f4741' : '#6e655c'); 
        ctx.beginPath(); ctx.moveTo(px+27, py+8); ctx.lineTo(px+27, py+45); ctx.lineTo(px+50, py+45); ctx.fill();
        ctx.fillStyle = isCore ? '#7f1d1d' : (isMid ? '#9ca3af' : '#dcd7d4');
        ctx.beginPath(); ctx.moveTo(px+27, py+8); ctx.lineTo(px+18, py+23); ctx.lineTo(px+27, py+28); ctx.lineTo(px+35, py+23); ctx.fill();
      }
      else { 
        ctx.fillStyle = isCore ? '#2b1116' : (isMid ? '#2f3b4c' : '#4a6b8c'); 
        ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); 
        ctx.strokeStyle = isCore ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.3)'; 
        ctx.lineWidth = 1.5;
        const wave = Math.sin(t/500 + x + y) * 2;
        ctx.beginPath(); ctx.moveTo(px+10, py+20+wave); ctx.quadraticCurveTo(px+15, py+15+wave, px+20, py+20+wave); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px+30, py+35-wave); ctx.quadraticCurveTo(px+35, py+30-wave, px+40, py+35-wave); ctx.stroke();
      }

      ctx.strokeStyle = isCore ? 'rgba(153, 27, 27, 0.15)' : 'rgba(0, 0, 0, 0.15)'; 
      ctx.lineWidth = 1; ctx.strokeRect(px,py,TILE_SIZE,TILE_SIZE);

      const isExplored = exploredTiles[x][y] || godModeFog;
      if (!isExplored) { 
          ctx.fillStyle = isCore ? 'rgba(20, 5, 5, 0.75)' : (isMid ? 'rgba(25, 20, 20, 0.7)' : 'rgba(30, 20, 15, 0.7)');
          ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); 
          continue; 
      }

      const isBossOverlap = worldBosses.some(b => (b.hp > 0 || b.despawnAt > t) && x >= b.x - 1 && x <= b.x + 2 && y >= b.y - 1 && y <= b.y + 2);

      if (cell && cell.entity && !allCastles.some(p => p.x === x && p.y === y) && !isBossOverlap) {
        const clrInfo = getClearedPOI(x, y);
        // 💡 移除所有浮動動畫
        const floatY = 0; 
        
        if (clrInfo) {
          ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🔥', px+TILE_SIZE/2, py+35);
        } else {
          if (cell.entity.type === 'npc_capital' || cell.entity.type === 'npc_super_castle') {
              if (imgDarkCapital.complete && imgDarkCapital.naturalHeight !== 0) {
                  ctx.drawImage(imgDarkCapital, px - 15, py + floatY - 25, TILE_SIZE + 30, TILE_SIZE + 30);
              } else {
                  ctx.fillStyle = 'rgba(76, 29, 149, 0.6)'; ctx.fillRect(px+6, py+6, TILE_SIZE-12, TILE_SIZE-12);
              }
              ctx.fillStyle = '#f87171'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign='center'; ctx.fillText(cell.entity.name.split(' ')[1]||'據點', px+TILE_SIZE/2, py+50);
          } else if (cell.entity.type === 'npc_fortress') {
              if (imgDarkFortress.complete && imgDarkFortress.naturalHeight !== 0) {
                  ctx.drawImage(imgDarkFortress, px - 10, py + floatY - 15, TILE_SIZE + 20, TILE_SIZE + 20);
              } else {
                  ctx.fillStyle = 'rgba(153, 27, 27, 0.6)'; ctx.fillRect(px+6, py+6, TILE_SIZE-12, TILE_SIZE-12);
              }
              ctx.fillStyle = '#f87171'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign='center'; ctx.fillText('黑暗要塞', px+TILE_SIZE/2, py+50);
          } else if (cell.entity.type === 'npc_castle') {
              if (imgDarkCastle.complete && imgDarkCastle.naturalHeight !== 0) {
                  ctx.drawImage(imgDarkCastle, px - 5, py + floatY - 10, TILE_SIZE + 10, TILE_SIZE + 10);
              } else {
                  ctx.fillStyle = 'rgba(59, 7, 100, 0.6)'; ctx.fillRect(px+10, py+10, TILE_SIZE-20, TILE_SIZE-20);
              }
              ctx.fillStyle = '#f87171'; ctx.font = '10px sans-serif'; ctx.textAlign='center'; ctx.fillText('黑暗城堡', px+TILE_SIZE/2, py+45);
          } else if (cell.entity.type === 'npc_outpost') {
              if (imgDarkOutpost.complete && imgDarkOutpost.naturalHeight !== 0) {
                  ctx.drawImage(imgDarkOutpost, px - 5, py + floatY - 5, TILE_SIZE + 10, TILE_SIZE + 10);
              } else {
                  ctx.fillStyle = 'rgba(23, 23, 23, 0.6)'; ctx.fillRect(px+12, py+12, TILE_SIZE-24, TILE_SIZE-24);
              }
              ctx.fillStyle = '#f87171'; ctx.font = '10px sans-serif'; ctx.textAlign='center'; ctx.fillText('黑暗前哨', px+TILE_SIZE/2, py+45);
          } else if (cell.entity.type === 'barbarian') {
            if (imgBarbarian.complete && imgBarbarian.naturalHeight !== 0) {
                ctx.drawImage(imgBarbarian, px - 2, py + floatY - 10, TILE_SIZE + 4, TILE_SIZE + 4);
            } else {
                ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText('👹', px+TILE_SIZE/2, py+30+floatY);
            }
            ctx.fillStyle = '#f87171'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign='center'; ctx.fillText('野蠻人', px+TILE_SIZE/2, py+50);
          } else if (cell.entity.type === 'relic') {
            if (imgRelic.complete && imgRelic.naturalHeight !== 0) {
                ctx.drawImage(imgRelic, px, py + floatY - 5, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.font = '24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🏛️', px+TILE_SIZE/2, py+30+floatY);
            }
            ctx.fillStyle = '#38bdf8'; ctx.font = '10px sans-serif'; ctx.textAlign='center'; ctx.fillText('遺跡', px+TILE_SIZE/2, py+45);
          } else if (cell.entity.type.startsWith('res_')) {
            // 💡 渲染野外資源佔領點
            const isMine = worldNodes.some(n => n.x === x && n.y === y && n.uid === myUid);
            const isEnemy = worldNodes.some(n => n.x === x && n.y === y && n.uid !== myUid);
            ctx.font = '24px sans-serif'; ctx.textAlign='center'; 
            let emoji = cell.entity.type === 'res_farm' ? '🌾' : (cell.entity.type === 'res_lumber' ? '🌲' : '⛏️');
            ctx.fillText(emoji, px+TILE_SIZE/2, py+35);
            ctx.fillStyle = isMine ? '#10b981' : (isEnemy ? '#ef4444' : '#38bdf8');
            ctx.font = 'bold 10px sans-serif'; ctx.fillText(isMine ? '我方採集' : (isEnemy ? '敵方佔領' : '資源點'), px+TILE_SIZE/2, py+48);
          }
        }
      }
    }
  }

  worldBosses.forEach(boss => {
     const isExplored = (exploredTiles[boss.x] && exploredTiles[boss.x][boss.y]) || godModeFog;
     if ((boss.hp > 0 || boss.despawnAt > t) && isExplored) {
        const bx = boss.x * TILE_SIZE, by = boss.y * TILE_SIZE;
        // 💡 移除 Boss 的彈跳動畫
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
    if (px<camX-TILE_SIZE || px>camX+vW+TILE_SIZE || py<camY-TILE_SIZE || py>camY+vH+TILE_SIZE) return;

    const isShielded = p.shieldEndsAt && p.shieldEndsAt > t;
    if (isShielded) {
        ctx.beginPath(); ctx.arc(px+TILE_SIZE/2, py+TILE_SIZE/2, 30, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.2)'; ctx.fill();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.8)'; ctx.lineWidth = 2; ctx.stroke();
    }

    if (isMe) { ctx.strokeStyle='#facc15'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(px+TILE_SIZE/2,py+TILE_SIZE/2, 24,0,Math.PI*2); ctx.stroke(); }
    
    let cLv = p.castleLevel || 1;
    let imgIdx = 0;
    if (cLv >= 20) imgIdx = 6; else if (cLv >= 17) imgIdx = 5; else if (cLv >= 13) imgIdx = 4;
    else if (cLv >= 9) imgIdx = 3; else if (cLv >= 6) imgIdx = 2; else if (cLv >= 3) imgIdx = 1;
    
    let currentCastleImg = castleImgs[imgIdx];
    
    if (currentCastleImg && currentCastleImg.complete && currentCastleImg.naturalHeight !== 0) {
        ctx.drawImage(currentCastleImg, px - 15, py - 25, TILE_SIZE + 30, TILE_SIZE + 30);
    } else {
        ctx.fillStyle = isMe?'#1d4ed8':'#991b1b'; ctx.fillRect(px+12,py+16,31,26);
        ctx.fillStyle = isMe?'#3b82f6':'#ef4444'; ctx.fillRect(px+9,py+12,10,30); ctx.fillRect(px+36,py+12,10,30);
        ctx.fillStyle = '#0f172a'; ctx.fillRect(px+22,py+30,11,12);
    }

    if (zoom>0.5) {
      ctx.fillStyle=isMe?'#fef08a':'#fff'; ctx.font=isMe?'bold 12px sans-serif':'11px sans-serif'; ctx.textAlign='center';
      ctx.fillText(p.name, px+TILE_SIZE/2, py+52); ctx.fillStyle='#fbbf24'; ctx.fillText(`⚔️${formatCompact(p.troops||0)}`, px+TILE_SIZE/2, py+8);
    }
    ctx.textAlign='start';
  });

  if (myData.marches && myData.marches.length > 0) {
    myData.marches.forEach(m => {
      let p = Math.max(0, Math.min(1, (t-m.startTime)/(m.finishesAt-m.startTime)));
      
      // 💡 採集部隊靜止顯示
      if (m.type === 'gathering') {
          const cX = m.targetX*TILE_SIZE+TILE_SIZE/2, cY = m.targetY*TILE_SIZE+TILE_SIZE/2;
          ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(cX, cY, 14, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛏', cX, cY+4);
          const left = Math.ceil((m.finishesAt-t)/1000);
          if (left > 0) { ctx.fillStyle='#facc15'; ctx.font='bold 14px sans-serif'; ctx.fillText(formatTime(left), cX, cY-20); }
          return;
      }

      const sX = m.startX*TILE_SIZE+TILE_SIZE/2, sY = m.startY*TILE_SIZE+TILE_SIZE/2;
      const tX = m.targetX*TILE_SIZE+TILE_SIZE/2, tY = m.targetY*TILE_SIZE+TILE_SIZE/2;
      const cX = sX+(tX-sX)*p, cY = sY+(tY-sY)*p;

      ctx.beginPath(); ctx.setLineDash([6,6]); ctx.moveTo(sX, sY); ctx.lineTo(tX, tY);
      ctx.strokeStyle = m.type === 'return' ? 'rgba(59, 130, 246, 0.8)' : (m.type === 'defend_npc' ? 'rgba(147, 51, 234, 0.8)' : 'rgba(239, 68, 68, 0.8)');
      ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);

      ctx.fillStyle = m.type === 'return' ? '#2563eb' : (m.type === 'defend_npc' ? '#9333ea' : '#dc2626');
      ctx.beginPath(); ctx.arc(cX, cY, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(m.type === 'return' ? '🔙' : '⚔️', cX, cY+4);

      const left = Math.ceil((m.finishesAt-t)/1000);
      if (left > 0) { ctx.fillStyle='#facc15'; ctx.font='bold 14px sans-serif'; ctx.fillText(formatTime(left), cX, cY-20); }
      ctx.textAlign = 'start';
    });
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

  // 💡 加入隊列上限標示
  const queueStatus = `<span style="font-size:0.8rem; color:#facc15;">(行軍隊列: ${myData.marches.length}/3)</span>`;

  if (tC && tC.id!==myUid) {
    if (tC.shieldEndsAt && tC.shieldEndsAt > Date.now()) { return alert("🛡️ 目標處於和平護盾保護中，無法對其發起軍事行動！"); }
    targetAction = { type: 'attack_player', id: tC.id, name: tC.name, x: tX, y: tY, dist, techs: myData.research };
    document.getElementById("modal-title").innerHTML = `⚔️ 攻擊城池 ${queueStatus}`; 
    document.getElementById("modal-desc").innerHTML = `目標：【${tC.name}】 (Lv.${tC.castleLevel||1})<br>距離：${Math.ceil(dist)} 格<br><span style="color:#10b981; font-weight:bold;">🎁 預期掠奪: 敵方30%庫存資源</span>`;
    document.getElementById("troop-selector").style.display = 'block'; document.getElementById("btn-confirm-action").style.display = 'block'; document.getElementById("btn-confirm-action").innerText = "發動行軍"; document.getElementById("btn-confirm-action").style.background = '#dc2626';
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
    let actionTitle = '⚔️ 討伐敵陣';
    // 💡 若為資源點，更改文字與出征類型
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

document.getElementById("btn-confirm-action").addEventListener('click', () => {
  if (!targetAction) return;

  if (targetAction.type === 'relocate') {
    if (myData.wood < targetAction.cost || myData.iron < targetAction.cost || myData.food < targetAction.cost) return alert(`資源不足！需要各 ${targetAction.cost} 資源。`);
    myData.wood -= targetAction.cost; myData.iron -= targetAction.cost; myData.food -= targetAction.cost;
    myData.x = targetAction.x; myData.y = targetAction.y;
    myData.lastRelocateTime = Date.now();
    myData.logs.unshift(`[遷城] 傳送至 (${targetAction.x}, ${targetAction.y})`);
    savePrivateData(); try{setDoc(doc(db, "world_map", myUid), { x: myData.x, y: myData.y }, { merge: true });}catch(e){}
    window.closeActionModal(); updateFogOfWar(); centerCameraOn(myData.x, myData.y); try{window.renderSelf();}catch(e){} window.refreshMap(); return;
  }

  // 💡 隊列上限防護
  if (myData.marches && myData.marches.length >= 3) {
      return alert("⚔️ 您的行軍隊列已滿 (最多 3 隊)！請等待部隊返回。");
  }

  const sendInf = document.getElementById('row-inf').style.display==='none' ? 0 : (parseInt(document.getElementById('send-inf').value)||0);
  const sendArc = document.getElementById('row-arc').style.display==='none' ? 0 : (parseInt(document.getElementById('send-arc').value)||0);
  const sendCav = document.getElementById('row-cav').style.display==='none' ? 0 : (parseInt(document.getElementById('send-cav').value)||0);
  
  if (sendInf===0 && sendArc===0 && sendCav===0) return alert("請派遣部隊！");
  if (sendInf > myData.troops.infantry || sendArc > myData.troops.archer || sendCav > myData.troops.cavalry) return alert("兵力不足！");
  
  let spd = 2; 
  if (sendInf > 0) spd = Math.max(spd, CFG.troops.infantry.speed);
  if (sendArc > 0) spd = Math.max(spd, CFG.troops.archer.speed);
  
  const timeMs = Math.ceil(targetAction.dist * spd * 1000);
  myData.troops.infantry -= sendInf; myData.troops.archer -= sendArc; myData.troops.cavalry -= sendCav;

  myData.marches.push({
    id: 'M'+Date.now(), type: targetAction.type, startX: myData.x, startY: myData.y, targetX: targetAction.x, targetY: targetAction.y,
    startTime: Date.now(), finishesAt: Date.now()+timeMs, troops: { infantry: sendInf, archer: sendArc, cavalry: sendCav },
    targetUid: targetAction.id || targetAction.targetUid, targetName: targetAction.name, entity: targetAction.entity, npcPower: targetAction.npcPower, techs: myData.research
  });

  myData.logs.unshift(`[出征] 預計 ${formatTime(Math.ceil(timeMs/1000))} 後抵達。`);
  savePrivateData(); try{setDoc(doc(db, "world_map", myUid), { troops: myData.troops.infantry+myData.troops.archer+myData.troops.cavalry }, { merge: true });}catch(e){}
  window.closeActionModal(); try{window.renderSelf();}catch(e){}
});

window.renderSelf = function() {
  if (myData.isBanned) return;
  try {
      const now = Date.now();
      const isShielded = myData.shieldEndsAt && myData.shieldEndsAt > now;
      const shieldText = isShielded ? `🛡️ 護盾中 (${formatTime(Math.ceil((myData.shieldEndsAt - now)/1000))})` : '';
      
      const titleEl = document.getElementById('player-title');
      if(titleEl) titleEl.innerHTML = `<span>👑 ${myData.name} <span style="color:#fbbf24; font-size:0.95rem;">(Lv.${myData.buildings.castle || 1})</span> <span style="font-size:0.85rem; color:#94a3b8;">(${myData.x}, ${myData.y})</span></span> <span id="shield-status-text" style="font-size:0.85rem; color:#06b6d4; font-weight:bold;">${shieldText}</span>`;
      
      const hrToSec = 3600;
      const upkeepPerHr = myData.troops.infantry*CFG.troops.infantry.upkeep + myData.troops.archer*CFG.troops.archer.upkeep + myData.troops.cavalry*CFG.troops.cavalry.upkeep;
      const woodProdPerHr = CFG.buildings.lumber.rate * myData.buildings.lumber * hrToSec;
      const ironProdPerHr = CFG.buildings.mine.rate * myData.buildings.mine * hrToSec;
      const farmProdPerSec = CFG.buildings.farm.rate * myData.buildings.farm * hrToSec;
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

      if(document.getElementById('res-inf')) document.getElementById('res-inf').innerText = formatCompact(myData.troops.infantry); 
      if(document.getElementById('res-arc')) document.getElementById('res-arc').innerText = formatCompact(myData.troops.archer); 
      if(document.getElementById('res-cav')) document.getElementById('res-cav').innerText = formatCompact(myData.troops.cavalry);

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

            return `
            <div class="item-card">
                <div>
                <strong style="font-size:1.05rem;">${CFG.buildings[key].name}</strong> <span style="color:#fbbf24;">Lv.${lvl}</span>
                <div class="item-cost"><span>🌲${formatCompact(cost.w)}</span><span>⛏️${formatCompact(cost.i)}</span></div>
                </div>
                ${progressHtml}
                ${btnHtml}
            </div>`;
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

                  return `
                  <div class="item-card">
                      <div>
                      <strong style="font-size:1.05rem;">${d.icon} ${d.name}</strong> <span style="color:#fbbf24;">(Lv.${lvl})</span>
                      <div class="item-info">附加戰力: +${lvl}</div>
                      <div class="item-cost"><span>🌲${formatCompact(cost.w)}</span><span>⛏️${formatCompact(cost.i)}</span></div>
                      </div>
                      ${progressHtml}
                      ${btnHtml}
                  </div>`;
              }).join('');
          }
      }

      const tContainer = document.getElementById('train-container');
      if (tContainer) {
          const bLvl = myData.buildings.barracks || 1;
          tContainer.innerHTML = Object.keys(CFG.troops).map(key => {
              const d = CFG.troops[key];
              if (bLvl < d.reqLvl) return `<div class="item-card" style="opacity:0.5; justify-content:flex-start;"><div><strong style="font-size:1.05rem;">🔒 未解鎖</strong><div class="item-info">需 兵營 Lv.${d.reqLvl}</div></div><button class="btn-upgrade" style="background:#475569;" disabled>未解鎖</button></div>`;
              
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

              return `
              <div class="item-card" style="justify-content:flex-start;">
                  <div>
                  <strong style="font-size:1.05rem;">${d.icon} ${d.name}</strong>
                  <div class="item-info">戰力: ${d.pwr}<span style="color:#10b981;">+${buff}</span> | 耗糧: 🌾${d.upkeep}/h</div>
                  <div class="item-cost"><span>🌲${formatCompact(d.w * trainCount)}</span><span>⛏️${formatCompact(d.i * trainCount)}</span><span>🌾${formatCompact(d.f * trainCount)}</span></div>
                  </div>
                  ${progressHtml}
                  ${btnHtml}
              </div>`;
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

window.locateHome = () => { if (myData) { centerCameraOn(myData.x, myData.y); window.switchTab('world'); }};

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
  const costW = req.w * trainCount, costI = req.i * trainCount, costF = req.f * trainCount;

  if (myData.buildings.barracks < req.reqLvl) return alert('兵營等級不足！');
  if (myData.wood < costW || myData.iron < costI || myData.food < costF) return alert('資源不足！');
  myData.wood -= costW; myData.iron -= costI; myData.food -= costF;
  myData.trainQueue = { type: typeKey, count: trainCount, finishesAt: Date.now() + (req.time * trainCount * 1000) }; 
  await savePrivateData();
};
