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

let myUid = null, myData = null, allCastles = [], worldBosses = [], worldNodes = [], hasCentered = false;
let godModeFog = false, isAdmin = false; 

// 🗺️ 地圖擴展為 200x200
const TILE_SIZE = 55, WORLD_COLS = 200, WORLD_ROWS = 200, BASE_VISION_RADIUS = 5;
const RELOCATE_COOLDOWN = 12 * 60 * 60 * 1000; 
let currentVisionBonus = 0, camX = 0, camY = 0, zoom = 1.0;
const MIN_ZOOM = 0.05, MAX_ZOOM = 2.0;

const canvas = document.getElementById("worldCanvas"), ctx = canvas.getContext("2d");
let MAP_CACHE = [];
const exploredTiles = Array.from({ length: WORLD_COLS }, () => Array(WORLD_ROWS).fill(false));

const castleImgs = [];
for (let i=1; i<=7; i++) { const img = new Image(); img.src = `ico_buildings_haven_cityHall_0${i}.png`; castleImgs.push(img); }
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
    castle: { name: '主城', baseW: 600, baseI: 600, baseTime: 1200, maxLevel: 99 },
    academy: { name: '學院', baseW: 400, baseI: 400, baseTime: 900, maxLevel: 99 },
    builder: { name: '工匠小屋', baseW: 2000, baseI: 2000, baseTime: 1800, maxLevel: 3 }, 
    wall: { name: '城牆', baseW: 800, baseI: 800, baseTime: 600, maxLevel: 99 },
    warehouse: { name: '地下倉庫', baseW: 500, baseI: 500, baseTime: 400, maxLevel: 99 },
    lumber: { name: '伐木場', rate: 1.0, baseW: 100, baseI: 50, baseTime: 300, maxLevel: 99 }, 
    mine: { name: '鐵礦場', rate: 0.8, baseW: 50, baseI: 100, baseTime: 300, maxLevel: 99 }, 
    farm: { name: '農田', rate: 1.2, baseW: 80, baseI: 80, baseTime: 300, maxLevel: 99 }, 
    barracks: { name: '兵營', baseW: 200, baseI: 200, baseTime: 600, maxLevel: 99 } 
  },
  techs: {
    infantry_atk: { name: '步兵鍛甲', icon: '🛡️', baseW: 300, baseI: 300, baseTime: 600 },
    archer_atk: { name: '弓兵矢志', icon: '🏹', baseW: 300, baseI: 300, baseTime: 600 },
    cavalry_atk: { name: '騎術改良', icon: '🐎', baseW: 300, baseI: 300, baseTime: 600 }
  },
  troops: {
    infantry: { icon: '🛡️', name: '重裝步兵', w: 40, i: 30, f: 0, pwr: 1, speed: 6, time: 20, reqLvl: 1, upkeep: 10 },
    archer: { icon: '🏹', name: '長弓射手', w: 60, i: 10, f: 20, pwr: 2, speed: 4, time: 30, reqLvl: 3, upkeep: 25 },
    cavalry: { icon: '🐎', name: '驃騎兵', w: 20, i: 80, f: 60, pwr: 3, speed: 2, time: 45, reqLvl: 5, upkeep: 45 }
  }
};

function formatCompact(num) {
  if (isNaN(num)) return 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Math.floor(num).toString();
}

function getUpgradeCost(k, l, t=false) { const b = t ? CFG.techs[k] : CFG.buildings[k]; if(!b) return {w:0,i:0}; const m = Math.pow(1.5, l||0); return { w: Math.floor(b.baseW * m), i: Math.floor(b.baseI * m) }; }
function getUpgradeTime(k, l, t=false) { const b = t ? CFG.techs[k] : CFG.buildings[k]; if(!b) return 60; return Math.floor((b.baseTime||60) * Math.pow(1.5, Math.max(0, (l||0) - 1))); }
function formatTime(s) { if(s<60) return s+'s'; if(s<3600) return Math.floor(s/60)+'m '+(s%60)+'s'; return Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m'; }

function getTileTypeRaw(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; const r = v - Math.floor(v);
  if (r < 0.55) return 'plains'; if (r < 0.75) return 'forest'; if (r < 0.88) return 'mountain'; return 'water';
}

function getStaticEntity(x, y, type) {
  if (x === 100 && y === 100) return { type: 'npc_capital', name: '😈 黑暗王城', reqPwr: 15000, loot: { wood: 500000, iron: 500000, food: 500000, speedup1h: 5, resourceCard: 2 } };
  if (type === 'water') return null;
  const dist = Math.hypot(x - 100, y - 100);
  const v = Math.sin(x * 45.123 + y * 89.456) * 98765.4321; const r = v - Math.floor(v); 
  
  if (dist <= 28) {
    if (r < 0.010) return { type: 'npc_fortress', name: '🏯 黑暗要塞', reqPwr: 5000, loot: { wood: 50000, iron: 50000, food: 50000, speedup30m: 3, resourceCard: 1 } };
    if (r < 0.025) return { type: 'npc_super_castle', name: '🏰 夢魘巨城', reqPwr: 8000, loot: { iron: 100000, wood: 100000, food: 100000, speedup1h: 1 } };
    if (r < 0.045) return { type: 'res_mine', name: '⛏️️ 核心晶礦', res: 'iron', cap: 100000, reqPwr: 1000 };
    return null;
  }
  if (dist <= 64) {
    if (r < 0.010) return { type: 'npc_castle', name: '🏰 黑暗城堡', reqPwr: 2000, loot: { wood: 20000, iron: 20000, food: 20000, speedup30m: 1 } };
    if (r < 0.035) return { type: 'barbarian', name: '👹 狂暴野蠻人', reqPwr: 800, loot: { iron: 8000, wood: 4000, food: 6000, speedup5m: 5 } };
    if (r < 0.055) return { type: 'res_farm', name: '🌾 豐饒農田', res: 'food', cap: 50000, reqPwr: 500 };
    if (r < 0.075) return { type: 'res_lumber', name: '🌲 茂密林地', res: 'wood', cap: 50000, reqPwr: 500 };
    return null;
  }
  if (r < 0.005) return { type: 'npc_outpost', name: '🏚️ 黑暗前哨', reqPwr: 300, loot: { wood: 5000, iron: 5000, food: 5000, speedup5m: 3 } };
  if (r < 0.025) return { type: 'barbarian', name: '👹 野蠻人部落', reqPwr: 100, loot: { iron: 1500, wood: 1000, food: 1200, speedup5m: 1 } };
  if (r < 0.045) return { type: 'relic', name: '🏛️ 破碎遺跡', reqFood: 30, loot: { wood: 500, iron: 500, food: 500 } };
  if (r < 0.065) return { type: 'res_farm', name: '🌾 小型農田', res: 'food', cap: 15000, reqPwr: 100 };
  if (r < 0.085) return { type: 'res_lumber', name: '🌲 散落林木', res: 'wood', cap: 15000, reqPwr: 100 };
  if (r < 0.100) return { type: 'res_mine', name: '⛏️ 露天鐵礦', res: 'iron', cap: 15000, reqPwr: 100 };
  return null;
}

function initMapCache() {
  for(let x=0; x<WORLD_COLS; x++) { MAP_CACHE[x] = []; for(let y=0; y<WORLD_ROWS; y++) { let t = getTileTypeRaw(x,y); if(x===100&&y===100) t='plains'; MAP_CACHE[x][y] = { type: t, entity: getStaticEntity(x,y,t) }; } }
}
initMapCache();

function sanitizeData() {
  if(!myData) return;
  if(typeof myData.troops !== 'object') myData.troops = {infantry:10, archer:0, cavalry:0};
  ['infantry','archer','cavalry'].forEach(k => { if(isNaN(myData.troops[k]) || myData.troops[k]===null) myData.troops[k] = 0; });
  if(typeof myData.buildings !== 'object') myData.buildings = {};
  Object.keys(CFG.buildings).forEach(k => { if(isNaN(myData.buildings[k]) || myData.buildings[k]===null) myData.buildings[k] = (k==='builder'||k==='academy'||k==='wall'||k==='warehouse')?0:1; });
  if(typeof myData.research !== 'object') myData.research = {};
  Object.keys(CFG.techs).forEach(k => { if(isNaN(myData.research[k]) || myData.research[k]===null) myData.research[k] = 0; });
  if(typeof myData.items !== 'object') myData.items = {speedup5m:3, speedup30m:0, speedup1h:0, renameCard:0, resourceCard:0, shieldCard:1};
  if(myData.items.speedup !== undefined) { myData.items.speedup5m = myData.items.speedup; delete myData.items.speedup; }
  ['speedup5m','speedup30m','speedup1h','renameCard','resourceCard','shieldCard'].forEach(k => { if(isNaN(myData.items[k]) || myData.items[k]===null) myData.items[k]=0; });
  if(!Array.isArray(myData.buildQueues)) myData.buildQueues = [];
  myData.buildQueues = myData.buildQueues.filter(q => q && q.target && CFG.buildings[q.target]);
  if(!Array.isArray(myData.marches)) myData.marches = [];
  myData.marches = myData.marches.filter(m => m !== null);
  if(!Array.isArray(myData.clearedPOI)) myData.clearedPOI = [];
  if(!Array.isArray(myData.logs)) myData.logs = ['歡迎來到領地戰！'];
  if(isNaN(myData.wood)) myData.wood = 200; if(isNaN(myData.iron)) myData.iron = 200; if(isNaN(myData.food)) myData.food = 200;
  if(typeof myData.isBanned !== 'boolean') myData.isBanned = false;
  if(!myData.cheatLog) myData.cheatLog = [];
  if(!myData.claimedBosses) myData.claimedBosses = [];
}

function runAntiCheat() {
    if(isAdmin || myData.isBanned) return false;
    let cheatDetected = false; let reason = "";
    if(myData.wood > 2000000000 || myData.iron > 2000000000 || myData.food > 2000000000) { cheatDetected=true; reason="資源異常"; }
    if(myData.troops.infantry > 2000000000 || myData.troops.archer > 2000000000 || myData.troops.cavalry > 2000000000) { cheatDetected=true; reason="兵力異常"; }
    if(myData.buildings.castle > 100) { cheatDetected=true; reason="建築異常"; }
    if(cheatDetected) {
        myData.isBanned = true; myData.banReason = reason; myData.cheatLog.unshift(`[${new Date().toLocaleString()}] 查獲: ${reason}`);
        setDoc(doc(db, "players", myUid), { isBanned: true, banReason: reason, cheatLog: myData.cheatLog }, { merge: true });
        document.getElementById('ban-screen').style.display = 'flex'; document.getElementById('ban-reason').innerText = reason; return true; 
    }
    return false;
}

function getClearedPOI(x, y) {
  if(!myData || !myData.clearedPOI) return null;
  const found = myData.clearedPOI.find(poi => poi.startsWith(`${x},${y},`));
  if(!found) return null; const pts = found.split(','); return { x: parseInt(pts[0]), y: parseInt(pts[1]), time: parseInt(pts[2]), type: pts[3] };
}

async function spawnWorldBoss(id) {
  let bx, by, bName, bHp, mult, overlap, tries = 0;
  do {
    overlap = false; tries++;
    if(id === 'BOSS_CORE') { bx=100+Math.floor(Math.random()*24-12); by=100+Math.floor(Math.random()*24-12); }
    else if(id.startsWith('BOSS_MID')) { bx=100+Math.floor(Math.random()*60-30); by=100+Math.floor(Math.random()*60-30); }
    else { bx=Math.floor(Math.random()*190+5); by=Math.floor(Math.random()*190+5); }
    
    const dist = Math.hypot(bx-100, by-100);
    if(id==='BOSS_CORE' && bx===100 && by===100) overlap = true;
    if(id.startsWith('BOSS_MID') && dist < 30) overlap = true;
    if(id.startsWith('BOSS_OUTER') && dist <= 70) overlap = true;
    
    for(let b of worldBosses) { if(b.id!==id && (b.hp>0 || b.despawnAt>Date.now()) && Math.hypot(b.x-bx, b.y-by)<15) { overlap=true; break; } }
    for(let i=0; i<=1; i++) for(let j=0; j<=1; j++) { let t=getTileTypeRaw(bx+i, by+j); if(t==='water'||t==='mountain') overlap=true; }
  } while(overlap && tries < 500);

  if(id === 'BOSS_CORE') { bName='🐉 滅世魔龍'; bHp=500000; mult=20; }
  else if(id.startsWith('BOSS_MID')) { bName=Math.random()>0.5?'🦑 深海巨妖':'🦅 風暴巨鷹'; bHp=150000; mult=8; }
  else { bName='🗿 大地岩魔'; bHp=50000; mult=3; }
  
  const newBoss = { id, name: bName, isBoss: true, x: bx, y: by, hp: bHp, maxHp: bHp, mult: mult, spawnId: Date.now(), contributors: {}, despawnAt: Date.now() + 6 * 3600 * 1000 };
  const idx = worldBosses.findIndex(b => b.id === id);
  if(idx >= 0) worldBosses[idx] = newBoss; else worldBosses.push(newBoss);
  await setDoc(doc(db, "world_map", id), newBoss);
}

window.toggleFogMode = () => { godModeFog = !godModeFog; document.getElementById('btn-toggle-fog').innerText = godModeFog ? "👁️ 開啟迷霧" : "👁️ 關閉迷霧"; document.getElementById('btn-toggle-fog').style.background = godModeFog ? "#ef4444" : "#7c3aed"; updateFogOfWar(); };
window.switchTab = (t) => { document.querySelectorAll('.tab-content, .tab-btn').forEach(e => e.classList.remove('active')); document.getElementById('tab-'+t).classList.add('active'); document.getElementById('btn-tab-'+t).classList.add('active'); if(t==='world') setTimeout(resizeCanvas,50); if(t==='radar'||t==='gm') window.refreshMap(); };
window.openGuideModal = () => { document.getElementById('guide-modal').style.display='flex'; };
window.closeGuideModal = () => { document.getElementById('guide-modal').style.display='none'; };
window.registerUser = () => { const e=document.getElementById("email-input").value, p=document.getElementById("password-input").value; if(!e||p.length<6) return alert("無效！"); createUserWithEmailAndPassword(auth,e,p).then(()=>alert("✅ 註冊成功！")).catch(err=>alert("❌ "+err.message)); };
window.loginUser = () => { const e=document.getElementById("email-input").value, p=document.getElementById("password-input").value; signInWithEmailAndPassword(auth,e,p).catch(()=>alert("❌ 登入失敗！")); };
window.logoutUser = () => { signOut(auth).then(()=>location.reload()); };

onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("login-panel").style.display = "none";
    myUid = user.uid;
    const pRef = doc(db, "players", myUid), wRef = doc(db, "world_map", myUid);
    
    try {
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) {
          let sx, sy; do { sx = Math.floor(Math.random() * 180)+10; sy = Math.floor(Math.random() * 180)+10; } while (Math.hypot(sx-100, sy-100)<=64);
          myData = {
            name: `領主_${myUid.slice(0, 4)}`, x: sx, y: sy,
            wood: 200, iron: 200, food: 200, troops: { infantry: 10, archer: 0, cavalry: 0 },
            buildings: { castle: 1, builder: 0, academy: 0, wall: 0, warehouse: 0, lumber: 1, mine: 1, farm: 1, barracks: 1 },
            research: { infantry_atk: 0, archer_atk: 0, cavalry_atk: 0 },
            items: { speedup5m: 3, speedup30m: 0, speedup1h: 0, renameCard: 0, resourceCard: 0, shieldCard: 1 },
            freeRenameUsed: false, lastRelocateTime: 0, shieldEndsAt: 0, isBanned: false, banReason: "", cheatLog: [], claimedBosses: [],
            buildQueues: [], researchQueue: null, trainQueue: null, lastTick: Date.now(), clearedPOI: [], marches: [], logs: ['歡迎降生於這片大陸！']
          };
          await setDoc(pRef, myData);
          setTimeout(() => window.openGuideModal(), 1500);
        } else {
          myData = pSnap.data(); sanitizeData(); await setDoc(pRef, myData, {merge:true});
        }
        isAdmin = (user.email === 'topacoau@gmail.com');
        const wSnap = await getDoc(wRef);
        if(!wSnap.exists()) await setDoc(wRef, { name: myData.name, x: myData.x, y: myData.y, troops: myData.troops.infantry, castleLevel: myData.buildings.castle }, {merge:true}); 
    } catch(e){}

    onSnapshot(pRef, (docSnap) => {
      if(docSnap.exists()) {
        myData = docSnap.data(); sanitizeData();
        if(myData.isBanned) { document.getElementById('ban-screen').style.display='flex'; return; } 
        isAdmin = (user.email === 'topacoau@gmail.com');
        document.getElementById('btn-tab-gm').style.display = isAdmin ? 'block' : 'none';
        updateFogOfWar();
        if(!hasCentered) { resizeCanvas(); centerCameraOn(myData.x, myData.y); hasCentered = true; }
        document.getElementById('danger-overlay').style.display = myData.marches.some(m=>m.type==='defend_npc') ? 'block' : 'none';
        try{ window.renderSelf(); }catch(e){}
      }
    });

    const bossIds = ['BOSS_CORE']; for(let i=1;i<=4;i++) bossIds.push(`BOSS_MID_${i}`); for(let i=1;i<=10;i++) bossIds.push(`BOSS_OUTER_${i}`);
    bossIds.forEach(id => { onSnapshot(doc(db, "world_map", id), (snap) => { if(snap.exists()){ const i = worldBosses.findIndex(b=>b.id===id); if(i>=0) worldBosses[i]={id,...snap.data()}; else worldBosses.push({id,...snap.data()}); } else spawnWorldBoss(id); }); });
    await window.refreshMap(); setInterval(localTick, 1000); requestAnimationFrame(renderLoop); setInterval(window.refreshMap, 60000);
  } else { document.getElementById("login-panel").style.display="flex"; myUid=null; myData=null; isAdmin=false; }
});
window.addEventListener("beforeunload", () => { if(myUid && myData) savePrivateData(); });

// ==========================================
// 👑 GM 功能
// ==========================================
window.selectGMTarget = (u,n) => { document.getElementById('gm-target-uid').value=u; document.getElementById('gm-selected-name').innerText=`${n} (${u.slice(0,6)})`; };
window.gmAddRes = async (t, a) => { if(!isAdmin) return; myData[t]+=a; await savePrivateData(); window.renderSelf(); };
window.gmAddTroop = async (t, a) => { if(!isAdmin) return; myData.troops[t]+=a; await savePrivateData(); window.renderSelf(); };
window.gmRespawnBosses = () => { if(!isAdmin) return; const b=['BOSS_CORE']; for(let i=1;i<=4;i++) b.push(`BOSS_MID_${i}`); for(let i=1;i<=10;i++) b.push(`BOSS_OUTER_${i}`); b.forEach(id=>spawnWorldBoss(id)); };
window.gmClearQueues = async () => { if(!isAdmin) return; myData.buildQueues.forEach(q=>q.finishesAt=Date.now()); if(myData.researchQueue) myData.researchQueue.finishesAt=Date.now(); if(myData.trainQueue) myData.trainQueue.finishesAt=Date.now(); await savePrivateData(); window.renderSelf(); };
window.gmTargetAction = async (act) => {
    if(!isAdmin) return; const t=document.getElementById('gm-target-uid').value.trim(); if(!t) return;
    const r=doc(db,"players",t); const s=await getDoc(r); if(!s.exists()) return; let d=s.data();
    if(act==='ban') d.isBanned=true; if(act==='unban') d.isBanned=false;
    if(act==='addRes') { d.wood+=1e6; d.iron+=1e6; d.food+=1e6; }
    if(act==='addTroops') { d.troops.infantry+=1e5; }
    if(act==='clear') { d.wood=0; d.troops.infantry=0; }
    await setDoc(r,d,{merge:true}); alert("操作成功");
};
window.gmExecuteCustom = async () => {
    if(!isAdmin) return; const t=document.getElementById('gm-target-uid').value.trim(); const f=document.getElementById('gm-custom-field').value; const a=parseInt(document.getElementById('gm-custom-amount').value);
    if(!t||isNaN(a)) return; const r=doc(db,"players",t); const s=await getDoc(r); if(!s.exists()) return; let d=s.data();
    if(['wood','iron','food'].includes(f)) d[f]=a;
    else if(['infantry','archer','cavalry'].includes(f)) d.troops[f]=a;
    else if(f==='castleLevel') d.buildings.castle=a;
    else d.items[f]=a;
    await setDoc(r,d,{merge:true}); alert("寫入成功");
};
window.gmAuditPlayer = async () => { if(!isAdmin) return; const t=document.getElementById('gm-target-uid').value.trim(); const s=await getDoc(doc(db,"players",t)); if(s.exists()) alert(`名稱: ${s.data().name}\n封鎖: ${s.data().isBanned}`); };

// ==========================================
// 地圖視窗控制
// ==========================================
function resizeCanvas() { const f = document.getElementById('map-frame'); if(f && canvas) { canvas.width=f.clientWidth; canvas.height=f.clientHeight; clampCamera(); } }
window.addEventListener('resize', resizeCanvas);
function updateFogOfWar() {
  if(!myData) return; for(let x=0;x<WORLD_COLS;x++) exploredTiles[x].fill(godModeFog);
  if(!godModeFog) {
      const r = BASE_VISION_RADIUS + currentVisionBonus;
      const minX=Math.max(0, myData.x-r), maxX=Math.min(WORLD_COLS-1, myData.x+r), minY=Math.max(0, myData.y-r), maxY=Math.min(WORLD_ROWS-1, myData.y+r);
      for(let x=minX; x<=maxX; x++) for(let y=minY; y<=maxY; y++) if(Math.hypot(x-myData.x, y-myData.y)<=r) exploredTiles[x][y]=true;
  }
}
function clampCamera() { camX=Math.max(0,Math.min(camX, WORLD_COLS*TILE_SIZE-canvas.width/zoom)); camY=Math.max(0,Math.min(camY, WORLD_ROWS*TILE_SIZE-canvas.height/zoom)); }
function centerCameraOn(tx,ty) { camX=(tx*TILE_SIZE+TILE_SIZE/2)-(canvas.width/zoom)/2; camY=(ty*TILE_SIZE+TILE_SIZE/2)-(canvas.height/zoom)/2; clampCamera(); }

async function savePrivateData() { if(!myData || myData.isBanned || runAntiCheat()) return; myData.lastTick = Date.now(); try{ await setDoc(doc(db, "players", myUid), myData, { merge: true }); }catch(e){} }

window.refreshMap = async function() {
  const snap = await getDocs(collection(db, "world_map"));
  allCastles = []; worldNodes = [];
  snap.forEach(d => { const data = d.data(); if(!data.isBoss && !data.isNode) allCastles.push({id:d.id,...data}); if(data.isNode) worldNodes.push({id:d.id,...data}); });
  if (document.getElementById('tab-radar').classList.contains('active')) renderRadar();
};

function renderRadar() {
  if(!myData) return;
  const bCont = document.getElementById('radar-boss-container');
  if(bCont) {
      const bs = [...worldBosses].map(b=>{b.dist=Math.hypot(b.x-myData.x,b.y-myData.y);return b;}).filter(b=>b.hp>0).sort((a,b)=>a.dist-b.dist).slice(0,5);
      bCont.innerHTML = bs.map(b=>`<div style="background:#2e1065; padding:10px; border-radius:6px; display:flex; justify-content:space-between;"><div><strong style="color:#d946ef">${b.name}</strong><br><span style="font-size:0.8rem;color:#cbd5e1;">(${b.x},${b.y}) | ${Math.ceil(b.dist)} 格</span></div><button onclick="window.locatePlayer(${b.x},${b.y})" style="background:#dc2626;padding:4px 8px;">鎖定</button></div>`).join('');
  }
  const pCont = document.getElementById('radar-players-container');
  if(pCont) {
      const ps = [...allCastles].map(p=>{p.dist=Math.hypot(p.x-myData.x,p.y-myData.y);return p;}).filter(p=>p.id!==myUid).sort((a,b)=>a.dist-b.dist).slice(0,5);
      pCont.innerHTML = ps.map(p=>`<div style="background:#0a0f1d; padding:10px; border-radius:6px; display:flex; justify-content:space-between;"><div><strong style="color:#fff">${p.name}</strong><br><span style="font-size:0.8rem;color:#94a3b8;">(${p.x},${p.y}) | ${Math.ceil(p.dist)} 格</span></div><button onclick="window.locatePlayer(${p.x},${p.y})" style="background:#0ea5e9;padding:4px 8px;">偵查</button></div>`).join('');
  }
}
window.locatePlayer = (x,y) => { window.switchTab('world'); centerCameraOn(x,y); };

// ==========================================
// 核心心跳 (包含採集結算)
// ==========================================
async function localTick() {
  if(!myData || myData.isBanned) return;
  sanitizeData(); const now = Date.now(), dt = (now - myData.lastTick) / 1000; myData.lastTick = now;
  
  myData.wood += dt * (CFG.buildings.lumber.rate * myData.buildings.lumber);
  myData.iron += dt * (CFG.buildings.mine.rate * myData.buildings.mine);
  myData.food += dt * (CFG.buildings.farm.rate * myData.buildings.farm) - dt * ((myData.troops.infantry*10+myData.troops.archer*25+myData.troops.cavalry*45)/3600);
  if(myData.food < 0) myData.food = 0;

  let needSave = false;
  myData.clearedPOI = myData.clearedPOI.filter(poi => { const t=parseInt(poi.split(',')[2]); return (now-t < 15*60*1000); });
  
  let nbq=[]; for(let q of myData.buildQueues) { if(now>=q.finishesAt) { myData.buildings[q.target]++; needSave=true; } else nbq.push(q); } myData.buildQueues=nbq;
  if(myData.researchQueue && now>=myData.researchQueue.finishesAt) { myData.research[myData.researchQueue.target]++; myData.researchQueue=null; needSave=true; }
  if(myData.trainQueue && now>=myData.trainQueue.finishesAt) { myData.troops[myData.trainQueue.type]+=myData.trainQueue.count; myData.trainQueue=null; needSave=true; }

  worldBosses.forEach(boss => {
     if (boss.hp <= 0 && boss.contributors && boss.contributors[myUid]) {
         const claimId = `${boss.id}_${boss.spawnId}`;
         if (!myData.claimedBosses.includes(claimId)) {
             const d = boss.contributors[myUid];
             myData.wood+=d*boss.mult; myData.iron+=d*boss.mult; myData.food+=d*boss.mult;
             myData.items.speedup5m+=Math.floor(d/(2000/boss.mult));
             myData.claimedBosses.push(claimId); myData.logs.unshift(`🏆 ${boss.name} 討伐獎勵已發放！`); needSave=true;
         }
     }
  });

  let nm=[]; for(let m of myData.marches) {
    if(now >= m.finishesAt && m.type !== 'gathering') {
      if(m.type === 'return') {
        myData.troops.infantry+=m.troops.infantry; myData.troops.archer+=m.troops.archer; myData.troops.cavalry+=m.troops.cavalry;
        myData.wood+=(m.loot.wood||0); myData.iron+=(m.loot.iron||0); myData.food+=(m.loot.food||0);
        myData.items.speedup5m+=(m.loot.speedup5m||0); myData.items.resourceCard+=(m.loot.resourceCard||0);
        myData.logs.unshift(`[歸城] 遠征軍返回。`); needSave=true;
      } 
      else if(m.type === 'occupy_node') {
          const rRef = doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`);
          getDoc(rRef).then(s => {
              if(!s.exists() || s.data().uid===myUid) { setDoc(rRef, {isNode:true,uid:myUid,x:m.targetX,y:m.targetY}); }
          });
          m.type='gathering'; m.startTime=Date.now(); m.finishesAt=Date.now()+3600*1000; nm.push(m);
      }
      else { nm.push(createReturnMarch(m, m.troops, m.loot||{})); }
    } else if (m.type === 'gathering') {
      if(now >= m.finishesAt) {
          m.type='return'; m.loot={wood:0,iron:0,food:0}; m.loot[m.resType||'wood']=50000; m.finishesAt=now+(now-m.startTime);
          try{deleteDoc(doc(db,"world_map",`NODE_${m.targetX}_${m.targetY}`));}catch(e){} nm.push(m); needSave=true;
      } else nm.push(m);
    } else nm.push(m);
  }
  if(needSave) { myData.marches=nm; await savePrivateData(); }
  try{ window.renderSelf(); }catch(e){}
}
function createReturnMarch(old, t, l) { return { id:'R'+Date.now(), type:'return', startX:old.targetX, startY:old.targetY, targetX:old.startX, targetY:old.startY, startTime:Date.now(), finishesAt:Date.now()+(old.finishesAt-old.startTime), troops:t, loot:l }; }

// ==========================================
// 🎨 渲染世界地圖 (200x200, 中世紀, 完全靜態)
// ==========================================
function renderLoop() { if(document.getElementById('tab-world').classList.contains('active')) drawWorldMap(); requestAnimationFrame(renderLoop); }

function drawWorldMap() {
  if(!myData||myData.isBanned) return; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.save(); ctx.scale(zoom,zoom); ctx.translate(-camX,-camY);
  const vW=canvas.width/zoom, vH=canvas.height/zoom; const r=BASE_VISION_RADIUS+currentVisionBonus;
  const sC=Math.max(0,Math.floor(camX/TILE_SIZE)-1), eC=Math.min(WORLD_COLS,Math.ceil((camX+vW)/TILE_SIZE)+1);
  const sR=Math.max(0,Math.floor(camY/TILE_SIZE)-1), eR=Math.min(WORLD_ROWS,Math.ceil((camY+vH)/TILE_SIZE)+1);
  const t=Date.now();

  for(let x=sC;x<eC;x++) for(let y=sR;y<eR;y++) {
      if(x<0||x>=WORLD_COLS||y<0||y>=WORLD_ROWS) continue; const px=x*TILE_SIZE, py=y*TILE_SIZE;
      if(!exploredTiles[x][y]) { ctx.fillStyle='#050811'; ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); continue; }
      
      const cell=MAP_CACHE[x]&&MAP_CACHE[x][y], dist=Math.hypot(x-100,y-100);
      const isCore=dist<=28, isMid=dist>28&&dist<=64;

      if(cell.type==='plains') { ctx.fillStyle=isCore?'#3b1c1c':isMid?'#544238':'#8f9779'; ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); ctx.strokeStyle=isCore?'rgba(239,68,68,0.15)':'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.moveTo(px+10,py+20); ctx.lineTo(px+15,py+12); ctx.stroke(); }
      else if(cell.type==='forest') { ctx.fillStyle=isCore?'#1a0d0d':isMid?'#33271e':'#3e522d'; ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); ctx.fillStyle=isCore?'#0a0505':isMid?'#1c1611':'#233318'; ctx.beginPath(); ctx.arc(px+25,py+25,12,0,Math.PI*2); ctx.fill(); }
      else if(cell.type==='mountain') { ctx.fillStyle=isCore?'#1f1313':isMid?'#3a3430':'#5c544d'; ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); ctx.fillStyle='#2b2724'; ctx.beginPath(); ctx.moveTo(px+27,py+8); ctx.lineTo(px+5,py+45); ctx.lineTo(px+50,py+45); ctx.fill(); }
      else { ctx.fillStyle=isCore?'#2b1116':isMid?'#2f3b4c':'#4a6b8c'; ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); }

      ctx.strokeStyle=isCore?'rgba(153,27,27,0.15)':'rgba(0,0,0,0.15)'; ctx.strokeRect(px,py,TILE_SIZE,TILE_SIZE);

      const isBossOverlap = worldBosses.some(b=>(b.hp>0||b.despawnAt>t) && x>=b.x-2 && x<=b.x+3 && y>=b.y-2 && y<=b.y+3);
      if(cell.entity && !allCastles.some(p=>p.x===x&&p.y===y) && !isBossOverlap) {
          const c=getClearedPOI(x,y); if(c) { ctx.font='24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🔥',px+TILE_SIZE/2,py+35); }
          else {
              ctx.textAlign='center';
              if(cell.entity.type==='npc_capital') { if(imgDarkCapital.complete) ctx.drawImage(imgDarkCapital,px-15,py-25,TILE_SIZE+30,TILE_SIZE+30); ctx.fillStyle='#f87171'; ctx.fillText('據點',px+TILE_SIZE/2,py+50); }
              else if(cell.entity.type==='npc_fortress') { if(imgDarkFortress.complete) ctx.drawImage(imgDarkFortress,px-10,py-15,TILE_SIZE+20,TILE_SIZE+20); }
              else if(cell.entity.type==='npc_castle') { if(imgDarkCastle.complete) ctx.drawImage(imgDarkCastle,px-5,py-10,TILE_SIZE+10,TILE_SIZE+10); }
              else if(cell.entity.type==='npc_outpost') { if(imgDarkOutpost.complete) ctx.drawImage(imgDarkOutpost,px-5,py-5,TILE_SIZE+10,TILE_SIZE+10); }
              else if(cell.entity.type==='barbarian') { if(imgBarbarian.complete) ctx.drawImage(imgBarbarian,px-2,py-10,TILE_SIZE+4,TILE_SIZE+4); else ctx.fillText('👹',px+TILE_SIZE/2,py+30); }
              else if(cell.entity.type==='relic') { if(imgRelic.complete) ctx.drawImage(imgRelic,px,py-5,TILE_SIZE,TILE_SIZE); else ctx.fillText('🏛️',px+TILE_SIZE/2,py+30); }
              else if(cell.entity.type.startsWith('res_')) {
                  const m=worldNodes.some(n=>n.x===x&&n.y===y&&n.uid===myUid), e=worldNodes.some(n=>n.x===x&&n.y===y&&n.uid!==myUid);
                  ctx.font='24px sans-serif'; ctx.fillText(cell.entity.type==='res_farm'?'🌾':cell.entity.type==='res_lumber'?'🌲':'⛏️',px+TILE_SIZE/2,py+35);
                  ctx.fillStyle=m?'#10b981':e?'#ef4444':'#38bdf8'; ctx.font='bold 10px sans-serif'; ctx.fillText(m?'採集中':e?'敵佔領':'資源',px+TILE_SIZE/2,py+48);
              }
          }
      }
  }

  worldBosses.forEach(b => {
     if((b.hp>0||b.despawnAt>t) && (exploredTiles[b.x]&&exploredTiles[b.x][b.y]||godModeFog)) {
        const bx=b.x*TILE_SIZE, by=b.y*TILE_SIZE, cx=bx+TILE_SIZE; 
        if(b.hp<=0) { ctx.font='50px sans-serif'; ctx.textAlign='center'; ctx.fillText('☠️',cx,by+TILE_SIZE+10); ctx.fillStyle='#94a3b8'; ctx.font='12px sans-serif'; ctx.fillText('首領遺骸',cx,by+TILE_SIZE+30); }
        else {
            let img=imgBossOuter; if(b.id==='BOSS_CORE') img=imgBossCore; else if(b.id.startsWith('BOSS_MID')) img=imgBossMid;
            if(img.complete) ctx.drawImage(img,bx,by,TILE_SIZE*2,TILE_SIZE*2);
            ctx.fillStyle='#ef4444'; ctx.fillRect(bx+13, by-10, 82*(b.hp/b.maxHp), 6); ctx.strokeStyle='#fff'; ctx.strokeRect(bx+13, by-10, 82, 6);
            ctx.fillStyle='#facc15'; ctx.font='bold 15px sans-serif'; ctx.textAlign='center'; ctx.fillText(b.name, cx, by+TILE_SIZE*2+18);
        }
     }
  });

  allCastles.forEach(p => {
    const isMe=(p.id===myUid), px=p.x*TILE_SIZE, py=p.y*TILE_SIZE;
    if(!godModeFog && !isMe && !exploredTiles[p.x][p.y]) return;
    if(px<camX-TILE_SIZE || px>camX+vW+TILE_SIZE || py<camY-TILE_SIZE || py>camY+vH+TILE_SIZE) return;
    if(p.shieldEndsAt > t) { ctx.beginPath(); ctx.arc(px+TILE_SIZE/2,py+TILE_SIZE/2,30,0,Math.PI*2); ctx.fillStyle='rgba(6,182,212,0.2)'; ctx.fill(); }
    let imgIdx = (p.castleLevel||1)>=20?6:(p.castleLevel>=17?5:(p.castleLevel>=13?4:(p.castleLevel>=9?3:(p.castleLevel>=6?2:(p.castleLevel>=3?1:0)))));
    if(castleImgs[imgIdx] && castleImgs[imgIdx].complete) ctx.drawImage(castleImgs[imgIdx], px-15, py-25, TILE_SIZE+30, TILE_SIZE+30);
    if(zoom>0.5) { ctx.fillStyle=isMe?'#fef08a':'#fff'; ctx.textAlign='center'; ctx.fillText(p.name, px+TILE_SIZE/2, py+52); }
  });

  myData.marches.forEach(m => {
      if(m.type==='gathering') { ctx.fillStyle='#10b981'; ctx.beginPath(); ctx.arc(m.targetX*TILE_SIZE+TILE_SIZE/2, m.targetY*TILE_SIZE+TILE_SIZE/2, 14, 0, Math.PI*2); ctx.fill(); return; }
      let p=Math.max(0,Math.min(1,(t-m.startTime)/(m.finishesAt-m.startTime)));
      const sX=m.startX*TILE_SIZE+TILE_SIZE/2, sY=m.startY*TILE_SIZE+TILE_SIZE/2, tX=m.targetX*TILE_SIZE+TILE_SIZE/2, tY=m.targetY*TILE_SIZE+TILE_SIZE/2;
      const cX=sX+(tX-sX)*p, cY=sY+(tY-sY)*p;
      ctx.beginPath(); ctx.setLineDash([6,6]); ctx.moveTo(sX,sY); ctx.lineTo(tX,tY); ctx.strokeStyle='rgba(239,68,68,0.8)'; ctx.lineWidth=2.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#dc2626'; ctx.beginPath(); ctx.arc(cX,cY,14,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

window.zoomMapBtn = (f) => { const n=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom*f)); if(n!==zoom){ const c=canvas.width/2, w=c/zoom+camX; zoom=n; camX=w-c/zoom; clampCamera(); document.getElementById('zoom-indicator').innerText=`${Math.round(zoom*100)}%`; } };
let isDrag=false, dsx=0, dsy=0;
canvas.addEventListener("mousedown", e=>{ isDrag=true; dsx=e.clientX; dsy=e.clientY; });
window.addEventListener("mouseup", ()=>isDrag=false);
canvas.addEventListener("mousemove", e=>{ if(!isDrag)return; camX-=(e.clientX-dsx)/zoom; camY-=(e.clientY-dsy)/zoom; dsx=e.clientX; dsy=e.clientY; clampCamera(); });
canvas.addEventListener("wheel", e=>{ e.preventDefault(); window.zoomMapBtn(e.deltaY<0?1.15:0.85); }, {passive:false});
canvas.addEventListener("touchstart", e=>{ isDrag=true; dsx=e.touches[0].clientX; dsy=e.touches[0].clientY; }, {passive:false});
canvas.addEventListener("touchmove", e=>{ if(!isDrag)return; e.preventDefault(); camX-=(e.touches[0].clientX-dsx)/zoom; camY-=(e.touches[0].clientY-dsy)/zoom; dsx=e.touches[0].clientX; dsy=e.touches[0].clientY; clampCamera(); }, {passive:false});
window.addEventListener("touchend", ()=>isDrag=false);

window.closeActionModal = () => { document.getElementById("action-modal").style.display='none'; };
window.syncTroop = (type, src) => { const i=document.getElementById(`send-${type}`), s=document.getElementById(`slider-${type}`); let v=parseInt(src==='slider'?s.value:i.value)||0; i.value=v; s.value=v; };

let targetAction = null;
canvas.addEventListener("click", e => {
  const r=canvas.getBoundingClientRect(), cx=e.clientX||(e.changedTouches?e.changedTouches[0].clientX:0), cy=e.clientY||(e.changedTouches?e.changedTouches[0].clientY:0);
  const tx=Math.floor(((cx-r.left)*(canvas.width/r.width)/zoom+camX)/TILE_SIZE), ty=Math.floor(((cy-r.top)*(canvas.height/r.height)/zoom+camY)/TILE_SIZE);
  const d=Math.hypot(tx-myData.x, ty-myData.y), cell=MAP_CACHE[tx]&&MAP_CACHE[tx][ty];
  if(cell && cell.entity) {
      targetAction = { type: cell.entity.type.startsWith('res_')?'occupy_node':'attack_npc', entity: cell.entity, x: tx, y: ty, dist: d };
      document.getElementById("modal-title").innerHTML = `出征 (隊列: ${myData.marches.length}/3)`; 
      document.getElementById("modal-desc").innerHTML = `${cell.entity.name} <br>距離: ${Math.ceil(d)}格`;
      document.getElementById("troop-selector").style.display='block'; document.getElementById("btn-confirm-action").style.display='block';
      document.getElementById("action-modal").style.display='flex';
      ['inf','arc','cav'].forEach(t => { const f=t==='inf'?'infantry':t==='arc'?'archer':'cavalry'; document.getElementById(`avail-${t}`).innerText=myData.troops[f]; document.getElementById(`send-${t}`).max=myData.troops[f]; document.getElementById(`slider-${t}`).max=myData.troops[f]; });
  }
});

document.getElementById("btn-confirm-action").addEventListener('click', () => {
  if(!targetAction || myData.marches.length>=3) return alert("隊列已滿！");
  const sI=parseInt(document.getElementById('send-inf').value)||0, sA=parseInt(document.getElementById('send-arc').value)||0, sC=parseInt(document.getElementById('send-cav').value)||0;
  if(sI===0&&sA===0&&sC===0) return alert("未派兵！");
  myData.troops.infantry-=sI; myData.troops.archer-=sA; myData.troops.cavalry-=sC;
  myData.marches.push({ id:'M'+Date.now(), type:targetAction.type, startX:myData.x, startY:myData.y, targetX:targetAction.x, targetY:targetAction.y, startTime:Date.now(), finishesAt:Date.now()+Math.ceil(targetAction.dist*2*1000), troops:{infantry:sI,archer:sA,cavalry:sC}, entity:targetAction.entity });
  savePrivateData(); window.closeActionModal(); window.renderSelf();
});

window.renderSelf = function() {
  if(myData.isBanned) return;
  document.getElementById('player-title').innerHTML = `<span>👑 ${myData.name} <span style="color:#fbbf24">(Lv.${myData.buildings.castle||1})</span></span>`;
  document.getElementById('res-wood').innerText=formatCompact(myData.wood); document.getElementById('res-iron').innerText=formatCompact(myData.iron); document.getElementById('res-food').innerText=formatCompact(myData.food);
  document.getElementById('res-inf').innerText=formatCompact(myData.troops.infantry); document.getElementById('res-arc').innerText=formatCompact(myData.troops.archer); document.getElementById('res-cav').innerText=formatCompact(myData.troops.cavalry);
  document.getElementById('inv-shield').innerText=myData.items.shieldCard||0; document.getElementById('inv-speed5m').innerText=myData.items.speedup5m||0; document.getElementById('inv-resource').innerText=myData.items.resourceCard||0;
  
  const bc=document.getElementById('building-container');
  if(bc) bc.innerHTML = Object.keys(CFG.buildings).map(k=>{ const l=myData.buildings[k]||0; return `<div class="item-card"><strong>${CFG.buildings[k].name} Lv.${l}</strong><button onclick="window.upgradeBuilding('${k}')">升級</button></div>`; }).join('');
}

window.useResourceCard = async () => { if(myData.items.resourceCard>0){ myData.items.resourceCard--; myData.wood+=100000; myData.iron+=100000; myData.food+=100000; await savePrivateData(); window.renderSelf(); alert("使用成功"); }};
window.useShield = async () => { if(myData.items.shieldCard>0){ myData.items.shieldCard--; myData.shieldEndsAt=Date.now()+6*3600*1000; await savePrivateData(); setDoc(doc(db,"world_map",myUid),{shieldEndsAt:myData.shieldEndsAt},{merge:true}); alert("護盾開啟"); }};
window.openRenameModal = () => document.getElementById("rename-modal").style.display='flex';
window.closeRenameModal = () => document.getElementById("rename-modal").style.display='none';
window.confirmRename = async () => { myData.name=document.getElementById('rename-input').value; await savePrivateData(); window.closeRenameModal(); window.renderSelf(); };
window.locateHome = () => centerCameraOn(myData.x, myData.y);
window.upgradeBuilding = async (k) => { const c=getUpgradeCost(k,myData.buildings[k]); if(myData.wood>=c.w){ myData.wood-=c.w; myData.buildQueues.push({target:k, finishesAt:Date.now()+10000}); await savePrivateData(); window.renderSelf(); }};
