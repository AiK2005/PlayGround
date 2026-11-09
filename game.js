(() => {
'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let W=innerWidth,H=innerHeight,DPR=1,now=0,last=0,playing=false,paused=false,scope=false,recoil=0,shotKick=0,windAngle=-.55,windSpeed=3.2,ammo=5,harvests=0,scoreTotal=0,logTimer=0,toastTimer=0;
const keys={},mouse={x:innerWidth*.5,y:innerHeight*.45,down:false},touchVector={x:0,y:0};
const player={x:1020,y:1280,angle:0,breath:100,stamina:100,speed:0,crouch:false,noise:0,step:0};
let deer=[],trees=[],shrubs=[],tracks=[],particles=[],seed=74321;
function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
function resize(){W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio||1,2);canvas.width=W*DPR;canvas.height=H*DPR;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0);document.body.classList.toggle('mobile',W<760)}
addEventListener('resize',resize);resize();
const world={w:2600,h:1900};
function makeWorld(){
  trees=[];shrubs=[];deer=[];
  for(let i=0;i<370;i++){
    const x=rand()*world.w,y=rand()*world.h;
    const meadow=((x-1320)/620)**2+((y-980)/490)**2;
    const river=Math.abs(x-(720+Math.sin(y*.004)*100))<80;
    if(meadow<1.12||river)continue;
    trees.push({x,y,r:15+rand()*19,hue:Math.floor(rand()*3),scale:.7+rand()*.65});
  }
  for(let i=0;i<205;i++){
    let x=rand()*world.w,y=rand()*world.h;
    shrubs.push({x,y,r:5+rand()*11,shade:rand()});
  }
  const herd=[[1195,760],[1320,700],[1460,825],[1550,995],[1260,1080],[1430,1210],[1110,940],[1620,765]];
  deer=herd.map((p,i)=>({x:p[0],y:p[1],vx:(rand()-.5)*8,vy:(rand()-.5)*8,dir:rand()*6.28,phase:rand()*8,state:'graze',alert:0,age:rand(),sex:i<4?'doe':'buck',hit:null,fallAt:0,trackTimer:0,alive:true}));
}
makeWorld();
function camera(){return{x:clamp(player.x-W*.5,0,world.w-W),y:clamp(player.y-H*.64,0,world.h-H)}}
function worldAt(sx,sy){const c=camera();return scope?{x:c.x+mouse.x+(sx-mouse.x)/2,y:c.y+mouse.y+(sy-mouse.y)/2}:{x:sx+c.x,y:sy+c.y}}
function setLog(text,duration=3){$('log').textContent=text;logTimer=duration}
function toast(text,sub=''){const el=$('toast');el.innerHTML=text+' &nbsp; <em>'+sub+'</em>';el.classList.add('show');toastTimer=2.4}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function inMeadow(x,y){return ((x-1320)/650)**2+((y-980)/520)**2<1}
function coverAt(x,y){let c=inMeadow(x,y)?.18:.55;for(const b of shrubs)if(Math.hypot(b.x-x,b.y-y)<b.r+12){c=Math.max(c,.72);break}return c}
function initAudio(){try{const A=window.AudioContext||window.webkitAudioContext;if(!window.audioCtx)window.audioCtx=new A();if(window.audioCtx.state==='suspended')window.audioCtx.resume()}catch(e){}}
function soundShot(){try{initAudio();const ac=window.audioCtx,t=ac.currentTime;const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();o.type='sawtooth';o.frequency.setValueAtTime(82,t);o.frequency.exponentialRampToValueAtTime(28,t+.19);f.type='lowpass';f.frequency.value=500;g.gain.setValueAtTime(.32,t);g.gain.exponentialRampToValueAtTime(.001,t+.45);o.connect(f).connect(g).connect(ac.destination);o.start(t);o.stop(t+.46)}catch(e){}}
function fire(){if(!playing||paused||ammo<=0)return;initAudio();ammo--;recoil=1;shotKick=.22;soundShot();updateAmmo();player.breath=Math.max(0,player.breath-19);player.noise=1;
  const aim=worldAt(mouse.x,mouse.y),cover=coverAt(player.x,player.y),moving=Math.abs(player.speed)>10;
  const sway=(scope?2.3:8)+(100-player.breath)*.085+(moving?12:0);const drift=Math.tan(windAngle)*windSpeed*(dist(player,aim)/160)*.32;
  const ax=aim.x+(rand()-.5)*sway+drift,ay=aim.y+(rand()-.5)*sway+Math.max(0,dist(player,aim)-170)*.025;
  let target=null,best=Infinity;
  for(const a of deer){if(!a.alive||a.state==='down')continue;const d=Math.hypot(a.x-ax,(a.y-7)-ay);if(d<30&&dist(player,a)<440&&d<best){best=d;target=a}}
  if(target){const dx=ax-target.x,dy=ay-target.y,c=Math.cos(target.dir),s=Math.sin(target.dir),lx=dx*c+dy*s,ly=-dx*s+dy*c+1;const body=Math.abs(lx)<17&&Math.abs(ly)<9;let placement=body?(Math.abs(ly)<4&&lx>-8&&lx<10?'LUNGS':(lx>10?'SHOULDER':'RUMP')):(Math.abs(lx)<12&&ly<-9?'NECK':'GRAZE');
    const clean=placement==='LUNGS'||placement==='NECK';target.hit={placement,clean,at:now,quality:clean?'Clean harvest':'Tracking required'};target.state=clean?'hit':'wounded';target.alert=1;target.fallAt=now+(clean?3.5:22+rand()*14);target.trackTimer=0;target.vx=Math.cos(target.dir)*25;target.vy=Math.sin(target.dir)*25;
    tracks.push({x:target.x,y:target.y,kind:clean?'impact':'blood',life:30});
    toast(clean?'VITAL SHOT':'ANIMAL WOUNDED',clean?'TRACKING REQUIRED':'FOLLOW THE SIGN');setLog(clean?'A clean lung hit. Give the animal time, then follow the sign.':'A marginal hit. Follow carefully; ethical recovery matters.',5);
  }else{toast('SHOT SENT', 'WATCH FOR MOVEMENT');setLog(ammo===0?'Magazine empty. Press R to reload.':'No confirmed hit. The report carried far across the meadow.',3);for(const a of deer)if(a.alive&&dist(player,a)<420)a.alert=1}
  for(let i=0;i<8;i++)particles.push({x:player.x,y:player.y-15,vx:(rand()-.5)*25,vy:-15-rand()*18,life:.7+rand()*.8});
}
function updateAmmo(){$('ammo').textContent=ammo}
function reload(){if(ammo<5&&playing&&!paused){ammo=5;updateAmmo();toast('RELOADED','5 ROUNDS READY')}}
function start(){playing=true;paused=false;$('intro').style.display='none';$('darken').style.display='none';last=performance.now();requestAnimationFrame(frame)}
$('start').addEventListener('click',start);$('claim').addEventListener('click',()=>{$('harvest').style.display='none';$('darken').style.display='none';paused=false;harvests++;scoreTotal+=parseInt($('score').textContent)||0;$('objective').textContent=`${harvests} field note${harvests===1?'':'s'} recorded · continue observing`;setLog('Field notes recorded. Take your time; the reserve is still alive.',4)});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY});
addEventListener('mousedown',e=>{if(!playing)return;if(e.button===2){scope=true;document.body.classList.add('scope-mode')}else if(e.button===0)fire()});
addEventListener('mouseup',e=>{if(e.button===2){scope=false;document.body.classList.remove('scope-mode')}});
addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='KeyR')reload();if(e.code==='ControlLeft'||e.code==='ControlRight')player.crouch=true;if(e.code==='KeyE')interact();if(e.code==='Escape'&&playing){paused=!paused;$('darken').style.display=paused?'block':'none';if(paused){$('darken').innerHTML='<div class="center-card"><div class="eyebrow">Field break</div><h1>Take a<br><span>breath.</span></h1><p>Your place in the reserve is being held.</p><div class="rule"></div><button class="btn" id="resume">RETURN TO THE FIELD</button></div>'; $('resume').onclick=()=>{$('darken').style.display='none';$('darken').innerHTML='';paused=false;last=performance.now();requestAnimationFrame(frame)}}}});
addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='ControlLeft'||e.code==='ControlRight')player.crouch=false});

function update(dt){
  now+=dt;player.noise=Math.max(0,player.noise-dt*.24);player.step+=dt;
  let mx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+touchVector.x,my=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+touchVector.y;
  const moving=mx||my,run=(keys.ShiftLeft||keys.ShiftRight)&&!player.crouch;
  if(moving){const m=Math.hypot(mx,my);mx/=m;my/=m;const rate=player.crouch?40:run?142:88;player.x+=mx*rate*dt;player.y+=my*rate*dt;player.speed=rate;player.noise=Math.max(player.noise,run?.58:.19);if(run)player.stamina=Math.max(0,player.stamina-dt*20)}else{player.speed=0;player.stamina=Math.min(100,player.stamina+dt*12)}
  player.x=clamp(player.x,40,world.w-40);player.y=clamp(player.y,40,world.h-40);
  player.breath=clamp(player.breath+(moving?(player.crouch?dt*2:-dt*(run?10:4)):dt*13),0,100);
  const cover=coverAt(player.x,player.y);$('coverBar').style.width=Math.round(cover*100)+'%';$('coverText').textContent=cover>.6?'CONCEALED':'EXPOSED';
  $('breathBar').style.width=Math.round(player.breath)+'%';$('breathText').textContent=player.breath>65?'STEADY':player.breath>30?'ELEVATED':'WINDING';$('breathBar').style.background=player.breath<30?'#c8805b':'#e4c87a';
  for(const a of deer){if(!a.alive)continue;const d=dist(player,a),downwind=Math.cos(Math.atan2(a.y-player.y,a.x-player.x)-windAngle)>.45;
    if(a.state==='down')continue;
    if(a.hit){a.trackTimer+=dt;if(now>=a.fallAt){a.state='down';a.vx=0;a.vy=0;tracks.push({x:a.x,y:a.y,kind:'blood',life:80});continue}if(a.state==='wounded'){a.x+=a.vx*dt;a.y+=a.vy*dt;a.dir=Math.atan2(a.vy,a.vx);a.vx*=Math.pow(.985,dt*60);a.vy*=Math.pow(.985,dt*60);if(Math.floor(a.trackTimer*1.7)!==Math.floor((a.trackTimer-dt)*1.7))tracks.push({x:a.x,y:a.y,kind:'blood',life:25});continue}}
    const scent=downwind&&d<180&&!player.crouch&&player.noise<.45;
    if(d<120&&(player.noise>.25||scent))a.alert=Math.max(a.alert,scent?.62:.35);
    if(d<85&&player.noise>.5)a.alert=1;
    if(a.alert>0){a.alert=Math.max(0,a.alert-dt*(a.state==='flee'?0.07:.26));if(a.alert>.35||a.state==='flee'){a.state='flee';const away=Math.atan2(a.y-player.y,a.x-player.x);a.dir=away+Math.sin(now*1.7+a.age)*.16;a.vx=Math.cos(a.dir)*(a.hit?28:75);a.vy=Math.sin(a.dir)*(a.hit?28:75);a.x+=a.vx*dt;a.y+=a.vy*dt;if(d>250&&!a.hit){a.state='graze';a.alert=0}}}
    else{if(a.state!=='graze')a.state='graze';a.vx+=Math.cos(now*.31+a.age)*dt*3;a.vy+=Math.sin(now*.27+a.age)*dt*3;const v=Math.hypot(a.vx,a.vy);if(v>8){a.vx*=8/v;a.vy*=8/v}a.x+=a.vx*dt;a.y+=a.vy*dt;if(v>1)a.dir=Math.atan2(a.vy,a.vx);if(Math.sin(now*.45+a.age)>0.99&&rand()<dt*.035)a.state='graze';}
    if(!inMeadow(a.x,a.y)&&!a.hit){const back=Math.atan2(980-a.y,1320-a.x);a.dir=back;a.vx=Math.cos(back)*13;a.vy=Math.sin(back)*13}
    a.x=clamp(a.x,120,world.w-120);a.y=clamp(a.y,120,world.h-120);
  }
  for(const t of tracks)t.life-=dt;tracks=tracks.filter(t=>t.life>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
  recoil=Math.max(0,recoil-dt*2.7);shotKick=Math.max(0,shotKick-dt);if(logTimer>0){logTimer-=dt;if(logTimer<=0)$('log').textContent=''}if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show')}
  updateObservation();
}
function updateObservation(){let nearest=null,nd=1e9;for(const a of deer){if(!a.alive||a.state==='down')continue;const d=dist(player,a);if(d<nd){nd=d;nearest=a}}if(nearest&&nd<360){$('range').textContent=Math.round(nd);$('species').textContent=`MULE DEER · ${nearest.sex.toUpperCase()} · ${nearest.state==='flee'?'ALERT':'CALM'}`}else{$('range').textContent='—';$('species').textContent='NO TARGET IDENTIFIED'}}
function drawGround(cam){
  ctx.fillStyle='#283b2e';ctx.fillRect(cam.x,cam.y,W,H);
  // Woodland floor variation, softly mottled clearings.
  for(let i=0;i<36;i++){const x=((i*317+43)%world.w),y=((i*571+211)%world.h);ctx.fillStyle=i%2?'rgba(106,122,78,.10)':'rgba(8,24,17,.15)';ctx.beginPath();ctx.ellipse(x,y,75+(i%5)*19,46+(i%7)*13,(i*.83)%6.28,0,Math.PI*2);ctx.fill()}
  // Alder meadow and sunlit grass.
  const grd=ctx.createRadialGradient(1320,940,60,1320,970,690);grd.addColorStop(0,'#899564');grd.addColorStop(.55,'#758657');grd.addColorStop(.83,'#596f48');grd.addColorStop(1,'rgba(51,71,48,0)');ctx.fillStyle=grd;ctx.beginPath();ctx.ellipse(1320,980,690,555,-.08,0,Math.PI*2);ctx.fill();
  // Small wetland stream, moving glints and darker banks.
  ctx.lineCap='round';ctx.beginPath();for(let y=cam.y-80;y<cam.y+H+100;y+=14){let x=730+Math.sin(y*.004)*105;if(y===cam.y-80)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.strokeStyle='#273d37';ctx.lineWidth=28;ctx.stroke();ctx.beginPath();for(let y=cam.y-80;y<cam.y+H+100;y+=14){let x=730+Math.sin(y*.004)*105;if(y===cam.y-80)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.strokeStyle='#52736c';ctx.lineWidth=16;ctx.stroke();
  ctx.globalAlpha=.45;ctx.lineWidth=1;for(let i=0;i<34;i++){const y=((i*91+now*9)%world.h),x=730+Math.sin(y*.004)*105;ctx.strokeStyle=i%2?'#aec0a0':'#3e5b50';ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+5,y+3);ctx.stroke()}ctx.globalAlpha=1;
  // Old game trail through meadow.
  ctx.beginPath();for(let y=620;y<1380;y+=12){let x=1190+Math.sin(y*.009)*88;if(y===620)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.strokeStyle='rgba(99,91,62,.42)';ctx.lineWidth=15;ctx.stroke();ctx.strokeStyle='rgba(177,160,108,.27)';ctx.lineWidth=8;ctx.stroke();
  // Grass flecks are stable and only drawn in view.
  for(let i=0;i<260;i++){const x=((i*197+73)%world.w),y=((i*311+47)%world.h);if(x<cam.x-20||x>cam.x+W+20||y<cam.y-20||y>cam.y+H+20)continue;ctx.strokeStyle=i%3?'rgba(187,188,119,.30)':'rgba(47,70,42,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+(i%4),y-3-(i%5));ctx.stroke()}
  // Fallen limbs and mossy stones.
  for(let i=0;i<30;i++){const x=(i*389+147)%world.w,y=(i*271+221)%world.h;if(x<cam.x-40||x>cam.x+W+40||y<cam.y-40||y>cam.y+H+40)continue;ctx.fillStyle=i%2?'#69664b':'#4b5840';ctx.beginPath();ctx.ellipse(x,y,6+i%8,3+i%3,.3*i,0,Math.PI*2);ctx.fill()}
}
function drawTree(t){const {x,y,r}=t;ctx.save();ctx.translate(x,y);ctx.scale(t.scale,t.scale);ctx.fillStyle='rgba(8,18,12,.27)';ctx.beginPath();ctx.ellipse(9,8,r*1.25,r*.65,.2,0,6.28);ctx.fill();ctx.fillStyle='#594d36';ctx.fillRect(-3,-5,6,13);const colors=[['#294333','#35553b','#416344'],['#304536','#3b5940','#496749'],['#263d33','#315143','#3d5d42']][t.hue];for(let j=0;j<3;j++){ctx.fillStyle=colors[j];ctx.beginPath();ctx.moveTo(0,-r*1.62+j*r*.42);ctx.lineTo(-r*.95+j*r*.18,r*.55+j*r*.02);ctx.lineTo(r*.95-j*r*.18,r*.55+j*r*.02);ctx.closePath();ctx.fill()}ctx.fillStyle='rgba(190,187,125,.09)';ctx.beginPath();ctx.moveTo(-r*.12,-r*1.2);ctx.lineTo(-r*.58,r*.25);ctx.lineTo(-r*.24,r*.25);ctx.closePath();ctx.fill();ctx.restore()}
function drawShrub(s){ctx.fillStyle='rgba(14,28,18,.30)';ctx.beginPath();ctx.ellipse(s.x+3,s.y+3,s.r*1.3,s.r*.7,0,0,6.28);ctx.fill();ctx.fillStyle=s.shade>.5?'#435b37':'#536a3c';ctx.beginPath();ctx.ellipse(s.x,s.y,s.r*1.3,s.r*.75,0,0,6.28);ctx.fill();ctx.fillStyle='rgba(170,176,112,.25)';ctx.beginPath();ctx.arc(s.x-s.r*.3,s.y-s.r*.25,2.1,0,6.28);ctx.fill()}
function drawDeer(a){
  ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.dir);const anim=Math.sin(now*9+a.phase)*2.1*(a.state==='flee'||a.state==='wounded'?1:0.25);
  ctx.fillStyle='rgba(18,26,17,.24)';ctx.beginPath();ctx.ellipse(2,7,23,9,.04,0,6.28);ctx.fill();
  if(a.state==='down'){
    ctx.rotate(.1);ctx.fillStyle='#98734d';ctx.beginPath();ctx.ellipse(0,0,19,9,0,0,6.28);ctx.fill();ctx.fillStyle='#b19068';ctx.beginPath();ctx.ellipse(13,-6,9,4,-.4,0,6.28);ctx.fill();ctx.fillStyle='#e2d4b0';ctx.beginPath();ctx.ellipse(-10,1,7,5,0,0,6.28);ctx.fill();ctx.strokeStyle='#5e5038';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(18,-7);ctx.lineTo(22,-12);ctx.lineTo(25,-14);ctx.moveTo(22,-12);ctx.lineTo(22,-16);ctx.moveTo(20,-10);ctx.lineTo(17,-14);ctx.stroke();ctx.restore();return;
  }
  // Four independently moving legs; a relaxed deer barely stirs, a spooked animal bounds.
  const stride=a.state==='flee'||a.state==='wounded'?anim*1.9:anim*.4;ctx.strokeStyle='#73583d';ctx.lineWidth=2.2;ctx.lineCap='round';
  for(const [x,phase] of [[-9,1],[7,-1]])for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(x,side*3);ctx.lineTo(x+stride*phase,side*7+6);ctx.lineTo(x+stride*phase+2,side*7+13);ctx.stroke()}
  ctx.fillStyle='#9a754e';ctx.beginPath();ctx.ellipse(0,0,18,8,0,0,6.28);ctx.fill();ctx.fillStyle='#c2a277';ctx.beginPath();ctx.ellipse(-2,-2,11,4.7,-.06,0,6.28);ctx.fill();ctx.fillStyle='#e6dcc0';ctx.beginPath();ctx.ellipse(-11,1,6.5,5,0,0,6.28);ctx.fill();
  ctx.fillStyle='#906d49';ctx.beginPath();ctx.moveTo(9,-5);ctx.lineTo(13,-11);ctx.lineTo(18,-12);ctx.lineTo(19,-8);ctx.lineTo(13,-2);ctx.closePath();ctx.fill();ctx.fillStyle='#a98256';ctx.beginPath();ctx.ellipse(19,-10,5,3,-.24,0,6.28);ctx.fill();ctx.fillStyle='#392d24';ctx.beginPath();ctx.arc(22,-10,1,0,6.28);ctx.fill();
  // ears and white tail flash
  ctx.fillStyle='#a47b52';ctx.beginPath();ctx.ellipse(14,-15,5,2,-.55,0,6.28);ctx.fill();ctx.beginPath();ctx.ellipse(14,-5,5,2,.55,0,6.28);ctx.fill();
  if(a.sex==='buck'){ctx.strokeStyle='#d5c6a1';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(17,-12);ctx.lineTo(18,-18);ctx.lineTo(15,-21);ctx.moveTo(18,-18);ctx.lineTo(21,-21);ctx.lineTo(22,-24);ctx.moveTo(18,-18);ctx.lineTo(18,-23);ctx.moveTo(17,-12);ctx.lineTo(16,-17);ctx.lineTo(12,-20);ctx.moveTo(16,-17);ctx.lineTo(13,-17);ctx.stroke()}
  if(a.state==='flee'){ctx.fillStyle='#eee4c9';ctx.beginPath();ctx.ellipse(-14,0,3,5,0,0,6.28);ctx.fill()}
  ctx.restore();
}
function drawPlayer(){ctx.save();ctx.translate(player.x,player.y);const aim=worldAt(mouse.x,mouse.y);player.angle=Math.atan2(aim.y-player.y,aim.x-player.x);ctx.rotate(player.angle);
  ctx.fillStyle='rgba(8,15,10,.35)';ctx.beginPath();ctx.ellipse(0,7,14,9,0,0,6.28);ctx.fill();ctx.fillStyle='#433e30';ctx.beginPath();ctx.ellipse(-3,0,7,9,0,0,6.28);ctx.fill();ctx.fillStyle='#756746';ctx.beginPath();ctx.ellipse(0,0,8,6,0,0,6.28);ctx.fill();ctx.fillStyle='#b19a70';ctx.beginPath();ctx.arc(7,0,4.2,0,6.28);ctx.fill();ctx.strokeStyle='#302c22';ctx.lineCap='round';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(3,-2);ctx.lineTo(12,-2);ctx.lineTo(22,-2);ctx.stroke();ctx.strokeStyle='#bcb096';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(12,-2);ctx.lineTo(25,-2);ctx.stroke();ctx.restore();
}
function drawWorld(){const cam=camera();ctx.save();if(scope){ctx.translate(mouse.x,mouse.y);ctx.scale(2,2);ctx.translate(-mouse.x,-mouse.y)}ctx.translate(-cam.x,-cam.y);drawGround(cam);
  const items=[];for(const t of trees)if(t.x>cam.x-50&&t.x<cam.x+W+50&&t.y>cam.y-80&&t.y<cam.y+H+80)items.push({y:t.y,type:0,obj:t});for(const s of shrubs)if(s.x>cam.x-30&&s.x<cam.x+W+30&&s.y>cam.y-30&&s.y<cam.y+H+30)items.push({y:s.y,type:1,obj:s});for(const a of deer)if(a.alive&&a.x>cam.x-60&&a.x<cam.x+W+60&&a.y>cam.y-60&&a.y<cam.y+H+60)items.push({y:a.y,type:2,obj:a});items.push({y:player.y,type:3,obj:player});items.sort((a,b)=>a.y-b.y);
  for(const it of items){if(it.type===0)drawTree(it.obj);else if(it.type===1)drawShrub(it.obj);else if(it.type===2)drawDeer(it.obj);else drawPlayer()}
  for(const t of tracks){ctx.globalAlpha=clamp(t.life/(t.kind==='blood'?15:6),0,.7);if(t.kind==='blood'){ctx.fillStyle='#9d694b';ctx.beginPath();ctx.ellipse(t.x,t.y,2.3,1.3,.4,0,6.28);ctx.fill()}else{ctx.fillStyle='#e8dfc7';ctx.beginPath();ctx.arc(t.x,t.y,3,0,6.28);ctx.fill();ctx.strokeStyle='#66513b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(t.x-5,t.y);ctx.lineTo(t.x+5,t.y);ctx.stroke()}}ctx.globalAlpha=1;
  for(const p of particles){ctx.globalAlpha=clamp(p.life,0,1)*.4;ctx.fillStyle='#e1d5b5';ctx.beginPath();ctx.arc(p.x,p.y,2,0,6.28);ctx.fill()}ctx.globalAlpha=1;ctx.restore();
  // Minimal muzzle smoke and an understated vignette lend a field-glass feel.
  const v=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.25,W/2,H/2,Math.max(W,H)*.73);v.addColorStop(0,'rgba(9,14,10,0)');v.addColorStop(1,'rgba(7,12,9,.28)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
  if(recoil>0){ctx.strokeStyle=`rgba(231,219,185,${recoil*.35})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(mouse.x,mouse.y,12+recoil*25,0,6.28);ctx.stroke()}
}
function interact(){if(!playing||paused)return;let found=null,d=1e9;for(const a of deer){if(a.alive&&a.state==='down'){const n=dist(player,a);if(n<70&&n<d){found=a;d=n}}}if(!found){let wounded=deer.find(a=>a.alive&&a.state==='wounded');if(wounded&&dist(player,wounded)<100){toast('GIVE IT TIME','FOLLOW THE SIGN');return}toast('NOTHING TO EXAMINE','MOVE CLOSER');return}const placement=found.hit?.placement||'LUNGS',clean=found.hit?.clean;const points=clean?92:58;$('harvestTitle').textContent=found.sex==='buck'?'Mule deer · mature buck':'Mule deer · doe';$('harvestText').textContent=clean?'Recovered after a responsible wait. The shot passed through the vital zone; the animal was not disturbed after impact.':'Recovered after following the sign. Shot placement was less than ideal; patience and restraint matter in the field.';$('placement').textContent=placement;$('recovery').textContent=clean?'SHORT TRACK':'FOLLOWED SIGN';$('score').textContent=String(points);$('harvest').style.display='block';$('darken').style.display='block';paused=true;found.alive=false;found.state='harvested';}

// Touch-friendly field controls: drag the left pad to move, tap scenery to aim.
let stickId=null;const stick=$('stick'),stickDot=$('stickDot');
function moveStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),max=34,n=Math.min(1,len/max);touchVector.x=len?dx/len*n:0;touchVector.y=len?dy/len*n:0;stickDot.style.transform=`translate(${touchVector.x*max}px,${touchVector.y*max}px)`}
stick.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e)});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId){e.preventDefault();moveStick(e)}});
function stopStick(e){if(e.pointerId===stickId){stickId=null;touchVector.x=touchVector.y=0;stickDot.style.transform='translate(0,0)'}}stick.addEventListener('pointerup',stopStick);stick.addEventListener('pointercancel',stopStick);
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){mouse.x=e.clientX;mouse.y=e.clientY}});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&e.buttons){mouse.x=e.clientX;mouse.y=e.clientY}});
$('fireBtn').addEventListener('click',fire);$('crouchBtn').addEventListener('click',()=>{player.crouch=!player.crouch;$('crouchBtn').textContent=player.crouch?'STAND':'CROUCH'});
$('scopeBtn').addEventListener('click',()=>{scope=!scope;document.body.classList.toggle('scope-mode',scope);$('scopeBtn').textContent=scope?'SCOPE ON':'SCOPE'});
$('interactBtn').addEventListener('click',interact);
function syncAim(){document.documentElement.style.setProperty('--aim-x',mouse.x+'px');document.documentElement.style.setProperty('--aim-y',mouse.y+'px')}
function frame(t){if(!playing||paused)return;const dt=Math.min(.04,(t-last)/1000||.016);last=t;update(dt);syncAim();ctx.clearRect(0,0,W,H);drawWorld();requestAnimationFrame(frame)}
// Paint the reserve behind the title screen so the first frame is already playable-looking.
ctx.clearRect(0,0,W,H);drawWorld();syncAim();
})();
