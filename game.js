import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, collection, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyCaowUN5atHnnlfvGmfWA0PDyjfQU3Qr0U",
  authDomain: "slg-game-617b3.firebaseapp.com",
  projectId: "slg-game-617b3"
});
const auth = getAuth(app), db = getFirestore(app);

let myUid = null, myData = null, allCastles = [], worldBosses = [], worldNodes = [], hasCentered = false;
let godModeFog = false, isAdmin = false; 

// 🗺️ 地圖 200x200
const TILE_SIZE = 55, WORLD_COLS = 200, WORLD_ROWS = 200, BASE_VISION_RADIUS = 5;
let currentVisionBonus = 0, camX = 0, camY = 0, zoom = 1.0;
const MIN_ZOOM = 0.05, MAX_ZOOM = 2.0;

const canvas = document.getElementById("worldCanvas"), ctx = canvas.getContext("2d");
const exploredTiles = Array.from({ length: WORLD_COLS }, () => Array(WORLD_ROWS).fill(false));

// 🖼️ 圖片載入系統優化
const I = { c:[], cap:new Image(), fort:new Image(), cas:new Image(), out:new Image(), barb:new Image(), relic:new Image(), bC:new Image(), bM:new Image(), bO:new Image() };
for (let i=1; i<=7; i++) { let im=new Image(); im.src=`ico_buildings_haven_cityHall_0${i}.png`; I.c.push(im); }
I.cap.src='dark_capital.png'; I.fort.src='dark_fortress.png'; I.cas.src='dark_castle.png'; I.out.src='dark_outpost.png';
I.barb.src='ico_buildings_stronghold_cyclopsMound.png'; I.relic.src='relic.png';
I.bC.src='boss_core.png'; I.bM.src='boss_mid.png'; I.bO.src='boss_outer.png';

const CFG = {
  buildings: { 
    castle:{ n:'主城', w:600, i:600, t:1200, m:99 }, academy:{ n:'學院', w:400, i:400, t:900, m:99 },
    builder:{ n:'工匠小屋', w:2000, i:2000, t:1800, m:3 }, wall:{ n:'城牆', w:800, i:800, t:600, m:99 },
    warehouse:{ n:'倉庫', w:500, i:500, t:400, m:99 }, lumber:{ n:'伐木場', r:1.0, w:100, i:50, t:300, m:99 }, 
    mine:{ n:'鐵礦場', r:0.8, w:50, i:100, t:300, m:99 }, farm:{ n:'農田', r:1.2, w:80, i:80, t:300, m:99 }, 
    barracks:{ n:'兵營', w:200, i:200, t:600, m:99 } 
  },
  techs: { inf:{ n:'步兵鍛甲', i:'🛡️', w:300, c:300, t:600 }, arc:{ n:'弓兵矢志', i:'🏹', w:300, c:300, t:600 }, cav:{ n:'騎術改良', i:'🐎', w:300, c:300, t:600 } },
  troops: {
    infantry:{ i:'🛡️', n:'重裝步兵', w:40, ir:30, f:0, p:1, s:6, t:20, req:1, up:10 },
    archer:{ i:'🏹', n:'長弓射手', w:60, ir:10, f:20, p:2, s:4, t:30, req:3, up:25 },
    cavalry:{ i:'🐎', n:'驃騎兵', w:20, ir:80, f:60, p:3, s:2, t:45, req:5, up:45 }
  }
};

const fmtC = n => isNaN(n)?0:(n>=1e6?(n/1e6).toFixed(1)+'M':(n>=1e3?(n/1e3).toFixed(1)+'K':Math.floor(n).toString()));
const getCost = (k,l,isT) => { const b=isT?CFG.techs[k]:CFG.buildings[k]; if(!b) return {w:0,i:0}; const m=Math.pow(1.5,l||0); return {w:Math.floor((b.w||b.baseW)*m), i:Math.floor((isT?b.c:b.i||b.baseI)*m)}; };
const getTime = (k,l,isT) => { const b=isT?CFG.techs[k]:CFG.buildings[k]; if(!b) return 60; return Math.floor((b.t||b.baseTime||60)*Math.pow(1.5,Math.max(0,(l||0)-1))); };
const fmtT = s => s<60?s+'s':(s<3600?Math.floor(s/60)+'m '+(s%60>0?(s%60)+'s':''):Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m');

function getTileTypeRaw(x, y) {
  const v = Math.sin(x*12.9898+y*78.233)*43758.5453, r = v-Math.floor(v);
  if(r<0.55) return 'plains'; if(r<0.75) return 'forest'; if(r<0.88) return 'mountain'; return 'water';
}

function getStaticEntity(x, y, type) {
  if(x===100 && y===100) return {type:'npc_capital', name:'😈 黑暗王城', reqPwr:15000, loot:{wood:5e5, iron:5e5, food:5e5, speedup1h:5, resourceCard:2}};
  if(type==='water') return null;
  const d = Math.hypot(x-100, y-100), v = Math.sin(x*45.123+y*89.456)*98765.4321, r = v-Math.floor(v); 
  if(d<=28){
    if(r<0.010) return {type:'npc_fortress', name:'🏯 黑暗要塞', reqPwr:5000, loot:{wood:5e4, iron:5e4, food:5e4, speedup30m:3, resourceCard:1}};
    if(r<0.025) return {type:'npc_super_castle', name:'🏰 夢魘巨城', reqPwr:8000, loot:{iron:1e5, wood:1e5, food:1e5, speedup1h:1}};
    if(r<0.045) return {type:'res_mine', name:'⛏️ 核心晶礦', res:'iron', cap:1e5, reqPwr:1000};
  } else if(d<=64){
    if(r<0.010) return {type:'npc_castle', name:'🏰 黑暗城堡', reqPwr:2000, loot:{wood:2e4, iron:2e4, food:2e4, speedup30m:1}};
    if(r<0.035) return {type:'barbarian', name:'👹 狂暴野蠻人', reqPwr:800, loot:{iron:8e3, wood:4e3, food:6e3, speedup5m:5}};
    if(r<0.055) return {type:'res_farm', name:'🌾 豐饒農田', res:'food', cap:5e4, reqPwr:500};
    if(r<0.075) return {type:'res_lumber', name:'🌲 茂密林地', res:'wood', cap:5e4, reqPwr:500};
  } else {
    if(r<0.005) return {type:'npc_outpost', name:'🏚️ 黑暗前哨', reqPwr:300, loot:{wood:5e3, iron:5e3, food:5e3, speedup5m:3}};
    if(r<0.025) return {type:'barbarian', name:'👹 野蠻人部落', reqPwr:100, loot:{iron:1500, wood:1000, food:1200, speedup5m:1}};
    if(r<0.045) return {type:'relic', name:'🏛️ 破碎遺跡', reqFood:30, loot:{wood:500, iron:500, food:500}};
    if(r<0.065) return {type:'res_farm', name:'🌾 小型農田', res:'food', cap:15000, reqPwr:100};
    if(r<0.085) return {type:'res_lumber', name:'🌲 散落林木', res:'wood', cap:15000, reqPwr:100};
    if(r<0.100) return {type:'res_mine', name:'⛏️ 露天鐵礦', res:'iron', cap:15000, reqPwr:100};
  } return null;
}

let MAP_CACHE = Array.from({length:WORLD_COLS}, (_,x)=>Array.from({length:WORLD_ROWS}, (_,y)=>{
  let t = getTileTypeRaw(x,y); if(x===100 && y===100) t='plains'; return {type:t, entity:getStaticEntity(x,y,t)};
}));

function sanitize() {
  if(!myData) return;
  ['wood','iron','food'].forEach(k=>{if(isNaN(myData[k])) myData[k]=200;});
  if(typeof myData.troops!=='object') myData.troops={infantry:10, archer:0, cavalry:0};
  ['infantry','archer','cavalry'].forEach(k=>{if(isNaN(myData.troops[k])) myData.troops[k]=0;});
  if(typeof myData.buildings!=='object') myData.buildings={};
  Object.keys(CFG.buildings).forEach(k=>{if(isNaN(myData.buildings[k])) myData.buildings[k]=(k==='builder'||k==='academy'||k==='wall'||k==='warehouse')?0:1;});
  if(typeof myData.research!=='object') myData.research={}; Object.keys(CFG.techs).forEach(k=>{if(isNaN(myData.research[k])) myData.research[k]=0;});
  if(typeof myData.items!=='object') myData.items={speedup5m:3,speedup30m:0,speedup1h:0,renameCard:0,resourceCard:0,shieldCard:1};
  ['speedup5m','speedup30m','speedup1h','renameCard','resourceCard','shieldCard'].forEach(k=>{if(isNaN(myData.items[k])) myData.items[k]=0;});
  myData.buildQueues = (Array.isArray(myData.buildQueues)?myData.buildQueues:[]).filter(q=>q&&q.target&&CFG.buildings[q.target]);
  if(myData.researchQueue && (!CFG.techs[myData.researchQueue.target])) myData.researchQueue=null;
  if(myData.trainQueue && (!CFG.troops[myData.trainQueue.type])) myData.trainQueue=null;
  myData.marches = (Array.isArray(myData.marches)?myData.marches:[]).filter(m=>m);
  myData.clearedPOI = Array.isArray(myData.clearedPOI)?myData.clearedPOI:[];
  myData.logs = Array.isArray(myData.logs)?myData.logs:['歡迎來到領地戰！'];
  myData.cheatLog = Array.isArray(myData.cheatLog)?myData.cheatLog:[];
  myData.claimedBosses = Array.isArray(myData.claimedBosses)?myData.claimedBosses:[];
  if(typeof myData.isBanned!=='boolean') myData.isBanned=false;
}

function checkCheat() {
    if(isAdmin||myData.isBanned) return false;
    let r=""; if(myData.wood>2e9||myData.iron>2e9||myData.food>2e9) r="資源異常";
    if(myData.troops.infantry>2e9||myData.troops.archer>2e9||myData.troops.cavalry>2e9) r="兵力異常";
    if(myData.buildings.castle>100) r="建築異常";
    if(r){ myData.isBanned=true; myData.banReason=r; myData.cheatLog.unshift(`[${new Date().toLocaleString()}] 查獲: ${r}`);
      setDoc(doc(db,"players",myUid),{isBanned:true,banReason:r,cheatLog:myData.cheatLog},{merge:true});
      document.getElementById('ban-screen').style.display='flex'; document.getElementById('ban-reason').innerText=r; return true; 
    } return false;
}

function getClearedPOI(x,y) { const f=myData?.clearedPOI.find(p=>p.startsWith(`${x},${y},`)); return f?{time:parseInt(f.split(',')[2])}:null; }
function getPwr(tr,te) { return (tr.infantry||0)*(CFG.troops.infantry.pwr+(te.infantry_atk||0)) + (tr.archer||0)*(CFG.troops.archer.pwr+(te.archer_atk||0)) + (tr.cavalry||0)*(CFG.troops.cavalry.pwr+(te.cavalry_atk||0)); }

// 💡 絕對淨空領域：嚴格防重疊的 Boss 生成器
async function spawnBoss(id) {
  let bx, by, n, hp, m, overlap, tries=0;
  do {
    overlap=false; tries++;
    if(id==='BOSS_CORE'){bx=100+Math.floor(Math.random()*24-12); by=100+Math.floor(Math.random()*24-12);}
    else if(id.startsWith('BOSS_MID')){bx=100+Math.floor(Math.random()*60-30); by=100+Math.floor(Math.random()*60-30);}
    else{bx=Math.floor(Math.random()*190+5); by=Math.floor(Math.random()*190+5);}
    
    const d=Math.hypot(bx-100,by-100);
    if((id==='BOSS_CORE'&&bx===100&&by===100) || (id.startsWith('BOSS_MID')&&d<30) || (id.startsWith('BOSS_OUTER')&&d<=70)) {overlap=true;continue;}
    
    // 1. 避開其他 Boss (至少 15 格距離)
    for(let b of worldBosses) if(b.id!==id && (b.hp>0||b.despawnAt>Date.now()) && Math.hypot(b.x-bx,b.y-by)<15) {overlap=true;break;}
    if(overlap) continue;
    
    // 2. 避開玩家主城 (至少 8 格距離)
    for(let c of allCastles) if(Math.hypot(c.x-bx, c.y-by)<8) {overlap=true;break;}
    if(overlap) continue;

    // 3. 嚴格地貌檢查：Boss 佔用與邊緣一圈 (4x4範圍)，不准有山脈、水域或任何實體物件(遺跡/城堡)
    for(let i=-1; i<=2; i++) {
        for(let j=-1; j<=2; j++) {
            const cell = MAP_CACHE[bx+i]?.[by+j];
            if(!cell || cell.type==='water' || cell.type==='mountain' || cell.entity) { overlap=true; break; }
        }
    }
  } while(overlap && tries<1000); // 放寬嘗試次數確保能找到空位

  if(id==='BOSS_CORE'){n='🐉 滅世魔龍';hp=5e5;m=20;}else if(id.startsWith('BOSS_MID')){n=Math.random()>.5?'🦑 深海巨妖':'🦅 風暴巨鷹';hp=1.5e5;m=8;}else{n='🗿 大地岩魔';hp=5e4;m=3;}
  const bObj = {id, name:n, isBoss:true, x:bx, y:by, hp:hp, maxHp:hp, mult:m, spawnId:Date.now(), contributors:{}, despawnAt:Date.now()+6*3600*1000};
  
  // 💡 生成後立刻寫入本地端陣列，防止高併發重複選點
  const idx = worldBosses.findIndex(x=>x.id===id); if(idx>=0) worldBosses[idx]=bObj; else worldBosses.push(bObj);
  await setDoc(doc(db,"world_map",id), bObj);
}

window.toggleFogMode = () => { godModeFog = !godModeFog; document.getElementById('btn-toggle-fog').innerText=godModeFog?"👁️️ 開啟迷霧":"👁️ 關閉迷霧"; updateFogOfWar(); };
window.switchTab = t => { document.querySelectorAll('.tab-content,.tab-btn').forEach(e=>e.classList.remove('active')); document.getElementById('tab-'+t).classList.add('active'); document.getElementById('btn-tab-'+t).classList.add('active'); if(t==='world') setTimeout(resizeCanvas,50); if(t==='radar'||t==='gm') window.refreshMap(); };
window.openGuideModal = () => document.getElementById('guide-modal').style.display='flex';
window.closeGuideModal = () => document.getElementById('guide-modal').style.display='none';
window.registerUser = () => { const e=document.getElementById("email-input").value, p=document.getElementById("password-input").value; if(!e||p.length<6) return alert("無效！"); createUserWithEmailAndPassword(auth,e,p).then(()=>alert("註冊成功！")).catch(e=>alert(e.message)); };
window.loginUser = () => { signInWithEmailAndPassword(auth,document.getElementById("email-input").value,document.getElementById("password-input").value).catch(()=>alert("登入失敗！")); };
window.logoutUser = () => signOut(auth).then(()=>location.reload());

onAuthStateChanged(auth, async u => {
  if (u) {
    document.getElementById("login-panel").style.display="none"; myUid = u.uid;
    const pRef=doc(db,"players",myUid), wRef=doc(db,"world_map",myUid);
    try {
        const s=await getDoc(pRef);
        if(!s.exists()){
          let sx,sy; do{sx=Math.floor(Math.random()*180)+10;sy=Math.floor(Math.random()*180)+10;}while(Math.hypot(sx-100,sy-100)<=64);
          await setDoc(pRef, { name:`領主_${myUid.slice(0,4)}`, x:sx, y:sy, wood:200, iron:200, food:200 });
          setTimeout(() => window.openGuideModal(), 1500);
        }
        isAdmin = (u.email==='topacoau@gmail.com');
    } catch(e){}

    onSnapshot(pRef, s => {
      if(s.exists()){
        myData=s.data(); sanitize(); if(myData.isBanned) return document.getElementById('ban-screen').style.display='flex';
        document.getElementById('btn-tab-gm').style.display = isAdmin?'block':'none';
        updateFogOfWar(); if(!hasCentered) { resizeCanvas(); centerCameraOn(myData.x, myData.y); hasCentered=true; }
        document.getElementById('danger-overlay').style.display = myData.marches.some(m=>m.type==='defend_npc')?'block':'none';
        window.renderSelf();
      }
    });

    const bIds=['BOSS_CORE']; for(let i=1;i<=4;i++)bIds.push(`BOSS_MID_${i}`); for(let i=1;i<=10;i++)bIds.push(`BOSS_OUTER_${i}`);
    bIds.forEach(id=>{ onSnapshot(doc(db,"world_map",id), s=>{ if(s.exists()){ const i=worldBosses.findIndex(b=>b.id===id); if(i>=0)worldBosses[i]={id,...s.data()}; else worldBosses.push({id,...s.data()});} else spawnBoss(id);}); });
    await window.refreshMap(); setInterval(localTick, 1000); requestAnimationFrame(renderLoop); setInterval(window.refreshMap, 60000);
  } else { document.getElementById("login-panel").style.display="flex"; myUid=null; myData=null; isAdmin=false; document.getElementById('btn-tab-gm').style.display='none';}
});

window.selectGMTarget = (u,n) => { document.getElementById('gm-target-uid').value=u; document.getElementById('gm-selected-name').innerText=`${n}`; document.getElementById('gm-selected-name').style.color='#10b981'; };
window.gmTargetAction = async (act) => {
    if(!isAdmin) return; const t=document.getElementById('gm-target-uid').value; if(!t) return;
    const r=doc(db,"players",t), s=await getDoc(r); if(!s.exists()) return; let d=s.data();
    if(act==='ban') d.isBanned=true; if(act==='unban') d.isBanned=false;
    if(act==='addRes'){ d.wood+=1e6; d.iron+=1e6; d.food+=1e6; } if(act==='addTroops') d.troops.infantry+=1e5; if(act==='clear'){ d.wood=0; d.troops.infantry=0; }
    await setDoc(r,d,{merge:true}); alert("操作成功"); window.refreshMap();
};
window.gmExecuteCustom = async () => {
    if(!isAdmin) return; const t=document.getElementById('gm-target-uid').value, f=document.getElementById('gm-custom-field').value, a=parseInt(document.getElementById('gm-custom-amount').value);
    if(!t||isNaN(a)) return; const r=doc(db,"players",t), s=await getDoc(r); if(!s.exists()) return; let d=s.data();
    if(['wood','iron','food'].includes(f)) d[f]=a; else if(['infantry','archer','cavalry'].includes(f)) d.troops[f]=a; else if(f==='castleLevel') d.buildings.castle=a; else d.items[f]=a;
    await setDoc(r,d,{merge:true}); alert("寫入成功");
};
window.gmClearQueues = async () => { if(!isAdmin) return; myData.buildQueues.forEach(q=>q.finishesAt=Date.now()); if(myData.researchQueue) myData.researchQueue.finishesAt=Date.now(); if(myData.trainQueue) myData.trainQueue.finishesAt=Date.now(); await savePrivateData(); window.renderSelf(); };
window.gmAuditPlayer = async () => { if(!isAdmin) return; const t=document.getElementById('gm-target-uid').value; const s=await getDoc(doc(db,"players",t)); if(s.exists()) alert(`名稱: ${s.data().name}\n封鎖: ${s.data().isBanned}`); };
window.gmRespawnBosses = () => { if(!isAdmin) return; const b=['BOSS_CORE']; for(let i=1;i<=4;i++) b.push(`BOSS_MID_${i}`); for(let i=1;i<=10;i++) b.push(`BOSS_OUTER_${i}`); b.forEach(id=>spawnBoss(id)); };

function resizeCanvas() { const f=document.getElementById('map-frame'); if(f&&canvas){ canvas.width=f.clientWidth; canvas.height=f.clientHeight; clampCamera(); } }
window.addEventListener('resize', resizeCanvas);
function updateFogOfWar() {
  if(!myData) return; for(let x=0;x<WORLD_COLS;x++) exploredTiles[x].fill(godModeFog);
  if(!godModeFog) { const r=BASE_VISION_RADIUS+currentVisionBonus, mX=Math.max(0,myData.x-r), xX=Math.min(WORLD_COLS-1,myData.x+r), mY=Math.max(0,myData.y-r), xY=Math.min(WORLD_ROWS-1,myData.y+r);
      for(let x=mX;x<=xX;x++) for(let y=mY;y<=xY;y++) if(Math.hypot(x-myData.x,y-myData.y)<=r) exploredTiles[x][y]=true; }
}
function clampCamera() { camX=Math.max(0,Math.min(camX, WORLD_COLS*TILE_SIZE-canvas.width/zoom)); camY=Math.max(0,Math.min(camY, WORLD_ROWS*TILE_SIZE-canvas.height/zoom)); }
function centerCameraOn(tx,ty) { camX=(tx*TILE_SIZE+TILE_SIZE/2)-(canvas.width/zoom)/2; camY=(ty*TILE_SIZE+TILE_SIZE/2)-(canvas.height/zoom)/2; clampCamera(); }
async function savePrivateData() { if(!myData||myData.isBanned||checkCheat()) return; myData.lastTick=Date.now(); try{ await setDoc(doc(db,"players",myUid),myData,{merge:true}); }catch(e){} }

window.refreshMap = async () => {
  const snap=await getDocs(collection(db,"world_map")); allCastles=[]; worldNodes=[];
  snap.forEach(d=>{ const v=d.data(); if(!v.isBoss&&!v.isNode)allCastles.push({id:d.id,...v}); if(v.isNode)worldNodes.push({id:d.id,...v}); });
  if(document.getElementById('tab-radar').classList.contains('active')) {
      const bC=document.getElementById('radar-boss-container'), pC=document.getElementById('radar-players-container');
      if(bC) bC.innerHTML = [...worldBosses].filter(b=>b.hp>0).map(b=>{b.d=Math.hypot(b.x-myData.x,b.y-myData.y); return b;}).sort((a,b)=>a.d-b.d).slice(0,5).map(b=>`<div style="background:#2e1065;padding:8px;border-radius:6px;display:flex;justify-content:space-between;"><span style="color:#d946ef">${b.name} (${Math.ceil(b.d)}格)</span><button onclick="window.locatePlayer(${b.x},${b.y})">鎖定</button></div>`).join('');
      if(pC) pC.innerHTML = [...allCastles].filter(p=>p.id!==myUid).map(p=>{p.d=Math.hypot(p.x-myData.x,p.y-myData.y); return p;}).sort((a,b)=>a.d-b.d).slice(0,5).map(p=>`<div style="background:#0a0f1d;padding:8px;border-radius:6px;display:flex;justify-content:space-between;"><span style="color:#fff">${p.name} (Lv.${p.castleLevel||1}) (${Math.ceil(p.d)}格)</span><button onclick="window.locatePlayer(${p.x},${p.y})">偵查</button></div>`).join('');
  }
  if(isAdmin&&document.getElementById('tab-gm').classList.contains('active')) {
      document.getElementById('gm-players-container').innerHTML = [...allCastles].filter(p=>p.id!==myUid).sort((a,b)=>(b.castleLevel||1)-(a.castleLevel||1)).map(p=>`<div style="background:#1e293b;padding:8px;cursor:pointer" onclick="window.selectGMTarget('${p.id}','${p.name}')"><span style="color:#fff">${p.name} (Lv.${p.castleLevel})</span> <button onclick="event.stopPropagation();window.locatePlayer(${p.x},${p.y})">找</button></div>`).join('');
  }
};
window.locatePlayer = (x,y) => { window.switchTab('world'); centerCameraOn(x,y); };

async function localTick() {
  if(!myData||myData.isBanned) return; sanitize(); const n=Date.now(), dt=(n-myData.lastTick)/1000; myData.lastTick=n;
  myData.wood += dt*(CFG.buildings.lumber.rate*myData.buildings.lumber); myData.iron += dt*(CFG.buildings.mine.rate*myData.buildings.mine);
  myData.food += dt*(CFG.buildings.farm.rate*myData.buildings.farm) - dt*((myData.troops.infantry*10+myData.troops.archer*25+myData.troops.cavalry*45)/3600);
  if(myData.food<0) myData.food=0; let needSave=false;
  myData.clearedPOI = myData.clearedPOI.filter(p => (n-parseInt(p.split(',')[2]) < 15*60*1000));
  
  let nbq=[]; for(let q of myData.buildQueues) { if(n>=q.finishesAt) { myData.buildings[q.target]++; try{setDoc(doc(db,"world_map",myUid),{castleLevel:myData.buildings.castle},{merge:true});}catch(e){} needSave=true; } else nbq.push(q); } myData.buildQueues=nbq;
  if(myData.researchQueue&&n>=myData.researchQueue.finishesAt) { myData.research[myData.researchQueue.target]++; myData.researchQueue=null; needSave=true; }
  if(myData.trainQueue&&n>=myData.trainQueue.finishesAt) { myData.troops[myData.trainQueue.type]+=myData.trainQueue.count; myData.trainQueue=null; try{setDoc(doc(db,"world_map",myUid),{troops:myData.troops.infantry+myData.troops.archer+myData.troops.cavalry},{merge:true});}catch(e){} needSave=true; }

  worldBosses.forEach(b => {
     if(b.hp<=0 && b.contributors?.[myUid]) {
         const cid=`${b.id}_${b.spawnId}`; if(!myData.claimedBosses.includes(cid)) {
             const d=b.contributors[myUid]; myData.wood+=d*b.mult; myData.iron+=d*b.mult; myData.food+=d*b.mult;
             myData.items.speedup5m+=Math.floor(d/(2000/b.mult)); myData.items.speedup30m+=(b.mult>=5?Math.floor(d/(10000/b.mult)):0); myData.items.speedup1h+=(b.mult>=10?Math.floor(d/(20000/b.mult)):0);
             myData.claimedBosses.push(cid); myData.logs.unshift(`🏆 ${b.name} 討伐獎勵已發放！`); needSave=true;
         }
     }
     if(n>b.despawnAt && Math.random()<0.05) spawnBoss(b.id);
  });

  let nm=[]; for(let m of myData.marches) {
    if(n >= m.finishesAt && m.type !== 'gathering') {
      if(m.type === 'return') {
        myData.troops.infantry+=m.troops.infantry; myData.troops.archer+=m.troops.archer; myData.troops.cavalry+=m.troops.cavalry;
        if(m.loot){ myData.wood+=m.loot.wood||0; myData.iron+=m.loot.iron||0; myData.food+=m.loot.food||0; myData.items.speedup5m+=m.loot.speedup5m||0; myData.items.speedup30m+=m.loot.speedup30m||0; myData.items.speedup1h+=m.loot.speedup1h||0; myData.items.resourceCard+=m.loot.resourceCard||0; }
        myData.logs.unshift(`[歸城] 遠征軍返回。`); needSave=true;
      } 
      else if(m.type === 'occupy_node') {
          const rRef = doc(db, "world_map", `NODE_${m.targetX}_${m.targetY}`);
          getDoc(rRef).then(s => {
              if(!s.exists() || s.data().uid===myUid) { setDoc(rRef, {isNode:true, uid:myUid, x:m.targetX, y:m.targetY, type:m.entity.type}); }
          });
          m.type='gathering'; m.startTime=Date.now(); m.finishesAt=Date.now()+3600*1000; nm.push(m);
      }
      else if(m.type === 'attack_player') {
          try {
            await runTransaction(db, async tr => {
              const tRef=doc(db,"players",m.targetUid), tDoc=await tr.get(tRef); if(!tDoc.exists()) throw new Error("Empty"); const tg=tDoc.data();
              if(tg.shieldEndsAt>Date.now()) throw new Error("Shielded");
              if(getPwr(m.troops,m.techs) > getPwr(tg.troops||{}, tg.research||{})*(1+(tg.buildings.wall||0)*0.05)) {
                  const pAmt = (tg.buildings.warehouse||0)*2000; const lw=Math.max(0,Math.floor((tg.wood-pAmt)*0.3)), li=Math.max(0,Math.floor((tg.iron-pAmt)*0.3)), lf=Math.max(0,Math.floor((tg.food-pAmt)*0.3));
                  tr.set(tRef, {wood:tg.wood-lw, iron:tg.iron-li, food:tg.food-lf, troops:{infantry:0,archer:0,cavalry:0}, logs:[`[城破] 遭到突襲損失慘重！`,...(tg.logs||[])]},{merge:true});
                  tr.set(doc(db,"world_map",m.targetUid),{troops:0},{merge:true});
                  nm.push({id:'R'+Date.now(), type:'return', startX:m.targetX, startY:m.targetY, targetX:m.startX, targetY:m.startY, startTime:Date.now(), finishesAt:Date.now()+(m.finishesAt-m.startTime), troops:m.troops, loot:{wood:lw,iron:li,food:lf}});
                  myData.logs.unshift(`[大捷] 攻破玩家城池！`);
              } else { tr.set(tRef, {logs:[`[防守] 成功擊退敵軍！`,...(tg.logs||[])]},{merge:true}); myData.logs.unshift(`[戰敗] 攻城失敗，部隊全滅！`); }
            });
          } catch(e) { myData.logs.unshift(`[撤軍] 目標有護盾或已飛走。`); nm.push({id:'R'+Date.now(), type:'return', startX:m.targetX, startY:m.targetY, targetX:m.startX, targetY:m.startY, startTime:Date.now(), finishesAt:Date.now()+(m.finishesAt-m.startTime), troops:m.troops, loot:{}}); }
      }
      else if(m.type === 'attack_boss') {
          try {
            await runTransaction(db, async tr => {
              const bRef=doc(db,"world_map",m.targetUid), bDoc=await tr.get(bRef); if(!bDoc.exists()||bDoc.data().hp<=0) throw new Error("Dead"); const boss=bDoc.data();
              const dmg = Math.min(boss.hp, getPwr(m.troops,m.techs)*10+Math.floor(Math.random()*50)); boss.hp-=dmg;
              if(boss.hp<=0){boss.hp=0;boss.despawnAt=Date.now()+15*60*1000;} boss.contributors=boss.contributors||{}; boss.contributors[myUid]=(boss.contributors[myUid]||0)+dmg;
              tr.set(bRef, boss); myData.logs.unshift(`[首領戰] 對 ${boss.name} 造成 ${fmtC(dmg)} 傷害！`);
            });
          } catch(e) { myData.logs.unshift(`[首領戰] 抵達時首領已被擊敗。`); }
          nm.push({id:'R'+Date.now(), type:'return', startX:m.targetX, startY:m.targetY, targetX:m.startX, targetY:m.startY, startTime:Date.now(), finishesAt:Date.now()+(m.finishesAt-m.startTime), troops:m.troops, loot:{}});
      }
      else {
          if(m.type==='defend_npc') {
              if(getPwr(myData.troops,myData.research)*(1+(myData.buildings.wall||0)*0.05) >= m.npcPower) {
                  myData.troops.infantry=Math.floor(myData.troops.infantry*0.9); myData.wood+=200; myData.iron+=200; myData.logs.unshift(`[守城大捷] 擊退 NPC 攻城！`);
              } else { myData.troops.infantry=0; myData.wood=Math.max(0,myData.wood-5000); myData.logs.unshift(`[城防潰敗] 遭到 NPC 掠奪！`); }
          } else {
              let loot = m.entity?.loot||{}; if(m.type==='attack_npc') myData.troops.infantry=Math.max(0,myData.troops.infantry-10);
              myData.clearedPOI.push(`${m.targetX},${m.targetY},${Date.now()}`); myData.logs.unshift(`[遠征] 討伐成功滿載而歸。`);
              nm.push({id:'R'+Date.now(), type:'return', startX:m.targetX, startY:m.targetY, targetX:m.startX, targetY:m.startY, startTime:Date.now(), finishesAt:Date.now()+(m.finishesAt-m.startTime), troops:m.troops, loot:loot});
          }
      }
      needSave=true;
    } else if (m.type === 'gathering') {
      if(n >= m.finishesAt) {
          m.type='return'; m.loot={wood:0,iron:0,food:0}; m.loot[m.resType||'wood']=50000; m.finishesAt=now+(now-m.startTime);
          try{deleteDoc(doc(db,"world_map",`NODE_${m.targetX}_${m.targetY}`));}catch(e){} nm.push(m); needSave=true; myData.logs.unshift(`[採集] 滿載而歸！`);
      } else { nm.push(m); if(Math.floor(n/1000)%10===0) getDoc(doc(db,"world_map",`NODE_${m.targetX}_${m.targetY}`)).then(s=>{ if(s.exists()&&s.data().uid!==myUid){ const i=myData.marches.findIndex(x=>x.id===m.id); if(i!==-1){ myData.marches[i].type='return'; myData.marches[i].troops.infantry=Math.floor(m.troops.infantry*0.3); myData.marches[i].finishesAt=Date.now()+(Date.now()-m.startTime); myData.logs.unshift(`🚨 資源點遭奪！部隊撤退。`); savePrivateData(); } } }); }
    } else nm.push(m);
  }
  if(needSave){ myData.marches=nm; await savePrivateData(); } try{window.renderSelf();}catch(e){}
}

function renderLoop() { if(document.getElementById('tab-world').classList.contains('active')) drawWorldMap(); requestAnimationFrame(renderLoop); }
function drawWorldMap() {
  if(!myData||myData.isBanned) return; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.save(); ctx.scale(zoom,zoom); ctx.translate(-camX,-camY);
  const vW=canvas.width/zoom, vH=canvas.height/zoom, t=Date.now(), sC=Math.max(0,Math.floor(camX/TILE_SIZE)-1), eC=Math.min(WORLD_COLS,Math.ceil((camX+vW)/TILE_SIZE)+1), sR=Math.max(0,Math.floor(camY/TILE_SIZE)-1), eR=Math.min(WORLD_ROWS,Math.ceil((camY+vH)/TILE_SIZE)+1);
  for(let x=sC;x<eC;x++) for(let y=sR;y<eR;y++){
      if(x<0||x>=WORLD_COLS||y<0||y>=WORLD_ROWS) continue; const px=x*TILE_SIZE, py=y*TILE_SIZE;
      if(!exploredTiles[x][y]){ ctx.fillStyle='#050811'; ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); continue; }
      const cell=MAP_CACHE[x]?.[y], dist=Math.hypot(x-100,y-100), isCore=dist<=28, isMid=dist>28&&dist<=64;
      if(cell.type==='plains') { ctx.fillStyle=isCore?'#3b1c1c':(isMid?'#544238':'#8f9779'); ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); ctx.strokeStyle=isCore?'rgba(239,68,68,0.15)':'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.moveTo(px+10,py+20); ctx.lineTo(px+15,py+12); ctx.stroke(); }
      else if(cell.type==='forest') { ctx.fillStyle=isCore?'#1a0d0d':(isMid?'#33271e':'#3e522d'); ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); ctx.fillStyle=isCore?'#0a0505':(isMid?'#1c1611':'#233318'); ctx.beginPath(); ctx.arc(px+25,py+25,12,0,Math.PI*2); ctx.fill(); }
      else if(cell.type==='mountain') { ctx.fillStyle=isCore?'#1f1313':(isMid?'#3a3430':'#5c544d'); ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); ctx.fillStyle='#2b2724'; ctx.beginPath(); ctx.moveTo(px+27,py+8); ctx.lineTo(px+5,py+45); ctx.lineTo(px+50,py+45); ctx.fill(); }
      else { ctx.fillStyle=isCore?'#2b1116':(isMid?'#2f3b4c':'#4a6b8c'); ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); }
      ctx.strokeStyle=isCore?'rgba(153,27,27,0.15)':'rgba(0,0,0,0.15)'; ctx.strokeRect(px,py,TILE_SIZE,TILE_SIZE);
      const isEx = exploredTiles[x][y] || godModeFog;
      if(!isEx) { ctx.fillStyle=isCore?'rgba(20,5,5,0.75)':(isMid?'rgba(25,20,20,0.7)':'rgba(30,20,15,0.7)'); ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE); continue; }
      
      const bOver = worldBosses.some(b=>(b.hp>0||b.despawnAt>t)&&x>=b.x-2&&x<=b.x+3&&y>=b.y-2&&y<=b.y+3);
      if(cell.entity && !allCastles.some(p=>p.x===x&&p.y===y) && !bOver) {
          if(getClearedPOI(x,y)) { ctx.font='24px sans-serif'; ctx.textAlign='center'; ctx.fillText('🔥',px+TILE_SIZE/2,py+35); }
          else {
              ctx.textAlign='center'; const eT=cell.entity.type;
              if(eT==='npc_capital'||eT==='npc_super_castle') { if(I.cap.complete)ctx.drawImage(I.cap,px-15,py-25,TILE_SIZE+30,TILE_SIZE+30); ctx.fillStyle='#f87171'; ctx.fillText('據點',px+TILE_SIZE/2,py+50); }
              else if(eT==='npc_fortress') { if(I.fort.complete)ctx.drawImage(I.fort,px-10,py-15,TILE_SIZE+20,TILE_SIZE+20); }
              else if(eT==='npc_castle') { if(I.cas.complete)ctx.drawImage(I.cas,px-5,py-10,TILE_SIZE+10,TILE_SIZE+10); }
              else if(eT==='npc_outpost') { if(I.out.complete)ctx.drawImage(I.out,px-5,py-5,TILE_SIZE+10,TILE_SIZE+10); }
              else if(eT==='barbarian') { if(I.barb.complete)ctx.drawImage(I.barb,px-2,py-10,TILE_SIZE+4,TILE_SIZE+4); else ctx.fillText('👹',px+TILE_SIZE/2,py+30); }
              else if(eT==='relic') { if(I.relic.complete)ctx.drawImage(I.relic,px,py-5,TILE_SIZE,TILE_SIZE); else ctx.fillText('🏛️',px+TILE_SIZE/2,py+30); }
              else if(eT.startsWith('res_')) {
                  const m=worldNodes.some(n=>n.x===x&&n.y===y&&n.uid===myUid), e=worldNodes.some(n=>n.x===x&&n.y===y&&n.uid!==myUid);
                  ctx.font='24px sans-serif'; ctx.fillText(eT==='res_farm'?'🌾':eT==='res_lumber'?'🌲':'⛏️',px+TILE_SIZE/2,py+35);
                  ctx.fillStyle=m?'#10b981':e?'#ef4444':'#38bdf8'; ctx.font='bold 10px sans-serif'; ctx.fillText(m?'採集中':e?'敵佔領':'資源',px+TILE_SIZE/2,py+48);
              }
          }
      }
  }

  worldBosses.forEach(b=>{
     if((b.hp>0||b.despawnAt>t) && (exploredTiles[b.x]?.[b.y]||godModeFog)){
        const bx=b.x*TILE_SIZE, by=b.y*TILE_SIZE, cx=bx+TILE_SIZE; 
        if(b.hp<=0){ ctx.font='50px sans-serif'; ctx.textAlign='center'; ctx.fillText('☠️',cx,by+TILE_SIZE+10); ctx.fillStyle='#94a3b8'; ctx.font='12px sans-serif'; ctx.fillText('首領遺骸',cx,by+TILE_SIZE+30); }
        else {
            let img=b.id==='BOSS_CORE'?I.bC:(b.id.startsWith('BOSS_MID')?I.bM:I.bO);
            if(img.complete) ctx.drawImage(img,bx,by,TILE_SIZE*2,TILE_SIZE*2);
            ctx.fillStyle='#ef4444'; ctx.fillRect(bx+13, by-10, 82*(b.hp/b.maxHp), 6); ctx.strokeStyle='#fff'; ctx.strokeRect(bx+13, by-10, 82, 6);
            ctx.fillStyle='#facc15'; ctx.font='bold 15px sans-serif'; ctx.textAlign='center'; ctx.fillText(b.name, cx, by+TILE_SIZE*2+18);
        }
     }
  });

  allCastles.forEach(p=>{
    const isMe=(p.id===myUid), px=p.x*TILE_SIZE, py=p.y*TILE_SIZE;
    if(!godModeFog && !isMe && !exploredTiles[p.x]?.[p.y]) return;
    if(px<camX-TILE_SIZE || px>camX+vW+TILE_SIZE || py<camY-TILE_SIZE || py>camY+vH+TILE_SIZE) return;
    if(p.shieldEndsAt > t) { ctx.beginPath(); ctx.arc(px+TILE_SIZE/2,py+TILE_SIZE/2,30,0,Math.PI*2); ctx.fillStyle='rgba(6,182,212,0.2)'; ctx.fill(); }
    let imgIdx = (p.castleLevel||1)>=20?6:(p.castleLevel>=17?5:(p.castleLevel>=13?4:(p.castleLevel>=9?3:(p.castleLevel>=6?2:(p.castleLevel>=3?1:0)))));
    if(I.c[imgIdx]?.complete) ctx.drawImage(I.c[imgIdx], px-15, py-25, TILE_SIZE+30, TILE_SIZE+30);
    if(zoom>0.5){ ctx.fillStyle=isMe?'#fef08a':'#fff'; ctx.textAlign='center'; ctx.fillText(p.name,px+TILE_SIZE/2,py+52); }
  });

  myData.marches.forEach(m=>{
      if(m.type==='gathering'){ ctx.fillStyle='#10b981'; ctx.beginPath(); ctx.arc(m.targetX*TILE_SIZE+TILE_SIZE/2, m.targetY*TILE_SIZE+TILE_SIZE/2, 14, 0, Math.PI*2); ctx.fill(); return; }
      let p=Math.max(0,Math.min(1,(t-m.startTime)/(m.finishesAt-m.startTime)));
      const sX=m.startX*TILE_SIZE+TILE_SIZE/2, sY=m.startY*TILE_SIZE+TILE_SIZE/2, tX=m.targetX*TILE_SIZE+TILE_SIZE/2, tY=m.targetY*TILE_SIZE+TILE_SIZE/2;
      const cX=sX+(tX-sX)*p, cY=sY+(tY-sY)*p;
      ctx.beginPath(); ctx.setLineDash([6,6]); ctx.moveTo(sX,sY); ctx.lineTo(tX,tY); ctx.strokeStyle='rgba(239,68,68,0.8)'; ctx.lineWidth=2.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#dc2626'; ctx.beginPath(); ctx.arc(cX,cY,14,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

window.zoomMapBtn = f => { const n=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom*f)); if(n!==zoom){ const c=canvas.width/2, w=c/zoom+camX; zoom=n; camX=w-c/zoom; clampCamera(); document.getElementById('zoom-indicator').innerText=`${Math.round(zoom*100)}%`; } };
let isDrag=false, dsx=0, dsy=0;
canvas.addEventListener("mousedown", e=>{ isDrag=true; dsx=e.clientX; dsy=e.clientY; });
window.addEventListener("mouseup", ()=>isDrag=false);
canvas.addEventListener("mousemove", e=>{ if(!isDrag)return; camX-=(e.clientX-dsx)/zoom; camY-=(e.clientY-dsy)/zoom; dsx=e.clientX; dsy=e.clientY; clampCamera(); });
canvas.addEventListener("wheel", e=>{ e.preventDefault(); window.zoomMapBtn(e.deltaY<0?1.15:0.85); }, {passive:false});
canvas.addEventListener("touchstart", e=>{ isDrag=true; dsx=e.touches[0].clientX; dsy=e.touches[0].clientY; }, {passive:false});
canvas.addEventListener("touchmove", e=>{ if(!isDrag)return; e.preventDefault(); camX-=(e.touches[0].clientX-dsx)/zoom; camY-=(e.touches[0].clientY-dsy)/zoom; dsx=e.touches[0].clientX; dsy=e.touches[0].clientY; clampCamera(); }, {passive:false});
window.addEventListener("touchend", ()=>isDrag=false);

window.closeActionModal = () => document.getElementById("action-modal").style.display='none';
window.syncTroop = (type, src) => { const i=document.getElementById(`send-${type}`), s=document.getElementById(`slider-${type}`); let v=parseInt(src==='slider'?s.value:i.value)||0; i.value=v; s.value=v; };

let targetAction = null;
canvas.addEventListener("click", e => {
  const r=canvas.getBoundingClientRect(), cx=e.clientX||(e.changedTouches?e.changedTouches[0].clientX:0), cy=e.clientY||(e.changedTouches?e.changedTouches[0].clientY:0);
  const tX=Math.floor(((cx-r.left)*(canvas.width/r.width)/zoom+camX)/TILE_SIZE), tY=Math.floor(((cy-r.top)*(canvas.height/r.height)/zoom+camY)/TILE_SIZE);
  const d=Math.hypot(tX-myData.x, tY-myData.y), cell=MAP_CACHE[tX]?.[tY], tC=allCastles.find(p=>p.x===tX&&p.y===tY);
  const wB=worldBosses.find(b=>(b.hp>0||b.despawnAt>Date.now())&&tX>=b.x&&tX<=b.x+1&&tY>=b.y&&tY<=b.y+1);
  const isNB=worldBosses.some(b=>(b.hp>0||b.despawnAt>Date.now())&&tX>=b.x-2&&tX<=b.x+3&&tY>=b.y-2&&tY<=b.y+3);
  
  if(!godModeFog && d>BASE_VISION_RADIUS+currentVisionBonus) return alert("迷霧區域無法鎖定目標！");
  const qs = `<span style="font-size:0.8rem; color:#facc15;">(隊列: ${myData.marches.length}/3)</span>`;

  if(tC && tC.id!==myUid) {
    if(tC.shieldEndsAt>Date.now()) return alert("目標有護盾保護！");
    targetAction={type:'attack_player',targetUid:tC.id,x:tX,y:tY,dist:d,techs:myData.research};
    document.getElementById("modal-title").innerHTML=`⚔️ 攻擊 ${qs}`; document.getElementById("modal-desc").innerHTML=`目標：${tC.name} (Lv.${tC.castleLevel||1})<br>距離：${Math.ceil(d)}格`;
  } else if(wB) {
    if(wB.hp<=0) return alert("首領已被擊殺，請等待重生。");
    targetAction={type:'attack_boss',targetUid:wB.id,x:tX,y:tY,dist:d,techs:myData.research};
    document.getElementById("modal-title").innerHTML=`🐉 討伐首領 ${qs}`; document.getElementById("modal-desc").innerHTML=`目標：${wB.name}<br>距離：${Math.ceil(d)}格`;
  } else if(cell?.entity && !getClearedPOI(tX,tY) && !isNB) {
    targetAction={type:cell.entity.type.startsWith('res_')?'occupy_node':'attack_npc', entity:cell.entity, x:tX, y:tY, dist:d, techs:myData.research};
    document.getElementById("modal-title").innerHTML=`${cell.entity.type.startsWith('res_')?'🚩 佔領':'⚔️ 討伐'} ${qs}`; document.getElementById("modal-desc").innerHTML=`${cell.entity.name}<br>距離：${Math.ceil(d)}格`;
  } else if(!tC && cell?.type!=='water') {
    targetAction={type:'relocate',x:tX,y:tY,cost:Math.max(100,Math.ceil(d*50))};
    document.getElementById("modal-title").innerHTML=`📍 遷城`; document.getElementById("modal-desc").innerHTML=`消耗各資源：${targetAction.cost}`;
    document.getElementById("troop-selector").style.display='none'; document.getElementById("btn-confirm-action").style.display='block'; return document.getElementById("action-modal").style.display='flex';
  } else return;

  document.getElementById("troop-selector").style.display='block'; document.getElementById("btn-confirm-action").style.display='block';
  ['inf','arc','cav'].forEach(t => { const f=t==='inf'?'infantry':(t==='arc'?'archer':'cavalry'); document.getElementById(`avail-${t}`).innerText=myData.troops[f]; document.getElementById(`send-${t}`).max=myData.troops[f]; document.getElementById(`slider-${t}`).max=myData.troops[f]; });
  document.getElementById("action-modal").style.display='flex';
});

document.getElementById("btn-confirm-action").addEventListener('click', () => {
  if(!targetAction) return;
  if(targetAction.type==='relocate'){
    if(myData.wood<targetAction.cost) return alert("資源不足！");
    myData.wood-=targetAction.cost; myData.iron-=targetAction.cost; myData.food-=targetAction.cost; myData.x=targetAction.x; myData.y=targetAction.y; myData.lastRelocateTime=Date.now(); savePrivateData();
    window.closeActionModal(); updateFogOfWar(); centerCameraOn(myData.x, myData.y); return window.refreshMap();
  }
  if(myData.marches.length>=3) return alert("隊列已滿！");
  const sI=parseInt(document.getElementById('send-inf').value)||0, sA=parseInt(document.getElementById('send-arc').value)||0, sC=parseInt(document.getElementById('send-cav').value)||0;
  if(sI===0&&sA===0&&sC===0) return alert("未派兵！");
  myData.troops.infantry-=sI; myData.troops.archer-=sA; myData.troops.cavalry-=sC;
  myData.marches.push({ id:'M'+Date.now(), type:targetAction.type, startX:myData.x, startY:myData.y, targetX:targetAction.x, targetY:targetAction.y, startTime:Date.now(), finishesAt:Date.now()+Math.ceil(targetAction.dist*2*1000), troops:{infantry:sI,archer:sA,cavalry:sC}, entity:targetAction.entity, targetUid:targetAction.targetUid });
  savePrivateData(); window.closeActionModal(); window.renderSelf();
});

function genCard(title, lvl, info, resStr, progHtml, btnHtml) { return `<div class="item-card"><div style="flex:1"><strong style="font-size:1.05rem;">${title}</strong> <span style="color:#fbbf24;">Lv.${lvl}</span><div style="font-size:0.8rem;color:#94a3b8;margin:4px 0">${info}</div><div class="item-cost">${resStr}</div></div><div style="width:100px;text-align:right">${progHtml}${btnHtml}</div></div>`; }

window.renderSelf = function() {
  if (myData.isBanned) return;
  document.getElementById('player-title').innerHTML = `<span>👑 ${myData.name} <span style="color:#fbbf24; font-size:0.95rem;">(Lv.${myData.buildings.castle || 1})</span></span> <span style="font-size:0.85rem; color:#06b6d4;">${myData.shieldEndsAt>Date.now()?'🛡️ 護盾中':''}</span>`;
  document.getElementById('res-wood').innerText=fmtC(myData.wood); document.getElementById('res-iron').innerText=fmtC(myData.iron); document.getElementById('res-food').innerText=fmtC(myData.food);
  document.getElementById('res-inf').innerText=fmtC(myData.troops.infantry); document.getElementById('res-arc').innerText=fmtC(myData.troops.archer); document.getElementById('res-cav').innerText=fmtC(myData.troops.cavalry);

  let tHtml = ''; const now = Date.now();
  const makeT = (title, q, totSec, typ, idx) => {
    if(!q) return ''; const rem = Math.max(0, Math.ceil((q.finishesAt-now)/1000)), pct = Math.min(100, Math.max(0, 100 - (rem/totSec*100)));
    return `<div class="task-row" style="flex-direction:column; align-items:stretch;"><div style="display:flex; justify-content:space-between;"><span style="flex:1;">${title}</span><span>${fmtT(rem)}</span></div><div class="task-bar-bg"><div class="task-bar-fill" style="width:${pct}%;"></div></div><div class="speed-btn-group"><button onclick="window.useSpeedUp('${typ}',${idx},'5m')" style="background:#10b981;">⚡5m</button><button onclick="window.useSpeedUp('${typ}',${idx},'30m')" style="background:#059669;">⚡30m</button><button onclick="window.useSpeedUp('${typ}',${idx},'1h')" style="background:#047857;">⚡1h</button></div></div>`;
  };
  myData.buildQueues.forEach((q,i) => tHtml += makeT(`🏗️ 升級: ${CFG.buildings[q.target].name}`, q, getTime(q.target,myData.buildings[q.target]), 'build', i));
  tHtml += makeT(`🧪 研發: ${CFG.techs[myData.researchQueue?.target]?.name}`, myData.researchQueue, getTime(myData.researchQueue?.target, myData.research[myData.researchQueue?.target], true), 'research', 0);
  tHtml += makeT(`⚔️ 招募部隊`, myData.trainQueue, 60, 'train', 0);
  document.getElementById('active-tasks-container').innerHTML = tHtml || '<p style="text-align:center; color:#94a3b8;">無進行中任務</p>';

  document.getElementById('inv-shield').innerText = myData.items.shieldCard; document.getElementById('inv-speed5m').innerText = myData.items.speedup5m; document.getElementById('inv-speed30m').innerText = myData.items.speedup30m; document.getElementById('inv-speed1h').innerText = myData.items.speedup1h; document.getElementById('inv-resource').innerText = myData.items.resourceCard;

  const bc = document.getElementById('building-container');
  if(bc) bc.innerHTML = Object.keys(CFG.buildings).map(k=>{
      const l = myData.buildings[k], c = getCost(k,l), t = getTime(k,l), q = myData.buildQueues.find(x=>x.target===k), isMax = (k==='builder'&&l>=3);
      return genCard(CFG.buildings[k].name, l, `升級需 ${fmtT(t)}`, `🌲${fmtC(c.w)} ⛏️${fmtC(c.i)}`, q?`<div style="color:#facc15;font-size:0.8rem">升級中</div>`:'', q?'':`<button style="background:${isMax?'#475569':'#2563eb'}" onclick="window.upgradeBuilding('${k}')" ${isMax?'disabled':''}>升級</button>`);
  }).join('');
  
  const rc = document.getElementById('research-container');
  if(rc) rc.innerHTML = Object.keys(CFG.techs).map(k=>{
      const l = myData.research[k]||0, c = getCost(k,l,true), t = getTime(k,l,true), q = myData.researchQueue?.target===k, isMax = l>=(myData.buildings.academy*2);
      return genCard(`${CFG.techs[k].icon} ${CFG.techs[k].name}`, l, `附加戰力 +${l}`, `🌲${fmtC(c.w)} ⛏️${fmtC(c.i)}`, q?`<div style="color:#facc15;font-size:0.8rem">研發中</div>`:'', q?'':`<button style="background:${isMax?'#475569':'#2563eb'}" onclick="window.startResearch('${k}')" ${isMax?'disabled':''}>研發</button>`);
  }).join('');

  document.getElementById('log-list').innerHTML = myData.logs.slice(0,8).map(l=>`<p>${l}</p>`).join('');
};

window.useResourceCard = async () => { if(myData.items.resourceCard>0){ myData.items.resourceCard--; myData.wood+=1e5; myData.iron+=1e5; myData.food+=1e5; await savePrivateData(); window.renderSelf(); alert("📦 開啟成功！"); }};
window.useShield = async () => { if(myData.items.shieldCard>0){ myData.items.shieldCard--; myData.shieldEndsAt=Date.now()+6*3600*1000; await savePrivateData(); window.renderSelf(); alert("🛡️️ 護盾啟動"); }};
window.useSpeedUp = async (t,i,s) => {
    const time=s==='1h'?3600000:(s==='30m'?1800000:300000), k=s==='1h'?'speedup1h':(s==='30m'?'speedup30m':'speedup5m');
    if(myData.items[k]<=0) return alert("數量不足");
    if(t==='build'&&myData.buildQueues[i]){ myData.items[k]--; myData.buildQueues[i].finishesAt-=time; }
    else if(t==='research'&&myData.researchQueue){ myData.items[k]--; myData.researchQueue.finishesAt-=time; }
    else if(t==='train'&&myData.trainQueue){ myData.items[k]--; myData.trainQueue.finishesAt-=time; }
    await savePrivateData(); window.renderSelf();
};
window.upgradeBuilding = async k => { const c=getCost(k,myData.buildings[k]), t=getTime(k,myData.buildings[k]); if(myData.wood>=c.w){ myData.wood-=c.w; myData.iron-=c.i; myData.buildQueues.push({target:k,finishesAt:Date.now()+t*1000}); await savePrivateData(); window.renderSelf(); }};
window.startResearch = async k => { const c=getCost(k,myData.research[k],true), t=getTime(k,myData.research[k],true); if(myData.wood>=c.w){ myData.wood-=c.w; myData.iron-=c.i; myData.researchQueue={target:k,finishesAt:Date.now()+t*1000}; await savePrivateData(); window.renderSelf(); }};
