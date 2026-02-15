/**
 * Weasco 4.0 — Student Database Engine
 */
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

let studentsData = [];
let currentPage = 'search';
let selectedClass = '';
let selectedDegree = '';
let selectedSort = 'default';
let minScoreFilter = 0;
let currentTheme = 'dark';
let navigationHistory = [];
let installedPlugins = new Set();
let seeChangesActive = false;
let sheetConvActive = false;
let searchPlusActive = false;
let studentHistory = {};

function safeGet(k,f){try{var v=localStorage.getItem(k);return v!==null?v:f;}catch(e){return f;}}
function safeSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function safeParse(s,f){try{return JSON.parse(s);}catch(e){return f;}}
function esc(s){if(!s)return '';var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function openExt(u){ipcRenderer.send('open-external',u);}
function $(s){return document.querySelector(s);}
function $$(s){return document.querySelectorAll(s);}
function tl(s){if(!s)return '';return s.replace(/İ/g,'i').replace(/I/g,'ı').toLowerCase();}

function loadStudents(){
    try{studentsData=JSON.parse(fs.readFileSync(path.join(__dirname,'data','students.json'),'utf8'));populateClassFilter();}
    catch(e){console.error(e);studentsData=[];}
}
function populateClassFilter(){
    var cf=$('#classFilter');if(!cf)return;
    var cls=[...new Set(studentsData.map(function(s){return s.sinif;}).filter(Boolean))].sort();
    cf.innerHTML='<option value="">Tüm Sınıflar</option>';
    cls.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;cf.appendChild(o);});
}

function toggleTheme(){
    currentTheme=currentTheme==='dark'?'light':'dark';
    document.body.className='theme-'+currentTheme;
    var l=$('#logo');if(l)l.src=currentTheme==='dark'?'assets/Weasco (3).png':'assets/Weasco (2).png';
    safeSet('weascoTheme',currentTheme);
}
function loadSavedTheme(){if(safeGet('weascoTheme','dark')!==currentTheme)toggleTheme();}

function processBiography(bioText){
    if(!bioText)return '';
    if(bioText==='?')return '<span class="bio-unknown">Bilgi mevcut değil.</span>';
    var safe=esc(bioText);
    safe=safe.replace(/\(\s*(?:Bkz\.|bkz\.)\s+([^)]+)\)/g,function(fm,inner){
        var parts=inner.split(',').map(function(p){return p.trim();});
        var linked=parts.map(function(part){
            var name=part.replace(/^(Bkz\.|bkz\.)\s*/i,'').trim();
            if(tl(name)==='omurgasızlık')return '<a href="#" class="bkz-link" data-url="https://sozluk.gov.tr/?ara=omurgas%C4%B1z">'+esc(name)+'</a>';
            var st=studentsData.find(function(s){return s.ad&&tl(s.ad.trim())===tl(name);});
            if(st)return '<a href="#" class="bkz-link" data-student="'+studentsData.indexOf(st)+'">'+esc(name)+'</a>';
            return '<span class="bkz-link-inactive">'+esc(name)+'</span>';
        });
        return '(Bkz. '+linked.join(', ')+')';
    });
    return safe;
}
function attachBkz(){
    $$('.bkz-link').forEach(function(l){l.addEventListener('click',function(e){
        e.preventDefault();e.stopPropagation();
        var u=this.getAttribute('data-url'),si=this.getAttribute('data-student');
        if(u)openExt(u);else if(si!==null)displayFullCard(parseInt(si));
    });});
}

function searchStudents(q){
    var t=tl(q.trim());if(!t)return [];
    var r=studentsData.filter(function(s){
        return tl(s.ad||'').indexOf(t)>=0||(s.okul_no||'').toString().indexOf(t)>=0||
               tl(s.etkinlikler||'').indexOf(t)>=0||tl(s.biyografi||'').indexOf(t)>=0||tl(s.sinif||'').indexOf(t)>=0;
    });
    return applyFilters(r);
}
function applyFilters(arr){
    var r=arr.slice();
    if(selectedClass)r=r.filter(function(s){return s.sinif===selectedClass;});
    if(searchPlusActive){
        if(selectedDegree)r=r.filter(function(s){return tl(s.basari_derecesi||'')===tl(selectedDegree);});
        if(minScoreFilter>0)r=r.filter(function(s){return(s.puan||0)>=minScoreFilter;});
        r=doSort(r);
    }
    return r;
}
function doSort(arr){
    if(selectedSort==='default')return arr;var s=arr.slice();
    switch(selectedSort){
        case 'puan-desc':s.sort(function(a,b){return(b.puan||0)-(a.puan||0);});break;
        case 'puan-asc':s.sort(function(a,b){return(a.puan||0)-(b.puan||0);});break;
        case 'ad-asc':s.sort(function(a,b){return(a.ad||'').localeCompare(b.ad||'','tr');});break;
        case 'ad-desc':s.sort(function(a,b){return(b.ad||'').localeCompare(a.ad||'','tr');});break;
        case 'no-asc':s.sort(function(a,b){return(a.okul_no||0)-(b.okul_no||0);});break;
    }return s;
}

function displayResults(students){
    var c=$('#content');if(!c)return;
    if(!students.length){c.innerHTML='<div class="no-result">Öğrenci bulunamadı.</div>';return;}
    if(students.length===1){displayPreview(students[0]);return;}
    var h=students.map(function(s){var i=studentsData.indexOf(s);return '<div class="result-item" data-index="'+i+'"><div class="result-item-name">'+esc(s.ad||'İsim Yok')+'</div><div class="result-item-details"><span class="result-badge">'+esc(s.sinif||'-')+'</span><span class="result-badge">'+(s.okul_no||'-')+'</span><span class="result-badge-score">'+(s.puan||'-')+' puan</span></div></div>';}).join('');
    c.innerHTML='<div class="results-list"><div class="results-header">'+students.length+' öğrenci bulundu</div>'+h+'</div>';
    $$('.result-item').forEach(function(it){it.addEventListener('click',function(){var i=parseInt(this.getAttribute('data-index'));if(!isNaN(i))displayPreview(studentsData[i]);});});
}
function displayPreview(student){
    var c=$('#content');if(!c||!student)return;var si=studentsData.indexOf(student);
    c.innerHTML='<div class="preview-card" id="previewCard"><div class="preview-name">'+esc(student.ad||'İsim Yok')+'</div><div class="preview-info"><span class="preview-badge">'+esc(student.sinif||'-')+'</span><span class="preview-badge">'+(student.okul_no||'-')+'</span></div><div class="preview-hint">Detayları görmek için tıklayın</div></div>';
    var card=$('#previewCard');if(card)card.addEventListener('click',function(){displayFullCard(si);});
}
function displayFullCard(index){
    if(index<0||index>=studentsData.length)return;
    var s=studentsData[index],c=$('#content');if(!c)return;
    navigationHistory.push({page:currentPage,index:index});
    var bio=processBiography(s.biyografi);
    var bioSec=(bio&&bio.length>0)?'<div class="bio-section"><div class="bio-label">Biyografi</div><div class="bio-text">'+bio+'</div></div>':'';
    var cc='result-card';
    var dc=getDC(s.basari_derecesi);
    var ch='';
    if(seeChangesActive){var changes=detectChanges(s);if(changes&&changes.puan){var diff=(changes.puan.new||0)-(changes.puan.old||0);ch='<span class="change-indicator" style="color:'+(diff>0?'#34C759':'#FF3B30')+'"> '+(diff>0?'↑':'↓')+' ('+changes.puan.old+'→'+changes.puan.new+')</span>';}}
    c.innerHTML='<div class="'+cc+'"><div class="student-name">'+esc(s.ad||'İsim Yok')+'</div><div class="card-grid"><div class="info-row"><div class="info-label">Okul No</div><div class="info-value">'+(s.okul_no||'-')+'</div></div><div class="info-row"><div class="info-label">Sınıf</div><div class="info-value">'+esc(s.sinif||'-')+'</div></div><div class="info-row"><div class="info-label">Etkinlikler</div><div class="info-value">'+esc(s.etkinlikler||'-')+'</div></div><div class="info-row"><div class="info-label">Başarı Derecesi</div><div class="info-value '+dc+'">'+esc(s.basari_derecesi||'-')+'</div></div><div class="info-row"><div class="info-label">Geliştirici Puanı</div><div class="info-value gp-value">'+(s.puan||'-')+ch+'</div></div></div>'+bioSec+'<button class="back-button" id="backButton">← Geri</button></div>';
    var bb=$('#backButton');if(bb)bb.addEventListener('click',function(){navigationHistory.pop();clearSearch();});
    attachBkz();
    if(sheetConvActive)addExportBtn('.result-card','student-card');
}
function getDC(d){if(!d)return '';var l=tl(d);if(l.indexOf('aşırı')>=0)return 'degree-extreme';if(l.indexOf('yüksek')>=0)return 'degree-high';if(l.indexOf('orta')>=0)return 'degree-mid';if(l.indexOf('düşük')>=0)return 'degree-low';return '';}

function clearSearch(){
    var c=$('#content'),si=$('#searchInput');
    if(c)c.innerHTML='<div class="empty-state"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div><div class="empty-text">Öğrenci aramak için yukarıdaki arama kutusunu kullanın</div></div>';
    if(si){si.value='';si.focus();}
    selectedClass='';var cf=$('#classFilter');if(cf)cf.value='';
    if(searchPlusActive){selectedDegree='';selectedSort='default';minScoreFilter=0;var df=$('#degreeFilter');if(df)df.value='';var sf=$('#sortFilter');if(sf)sf.value='default';var mf=$('#minScoreFilter');if(mf)mf.value='0';var mv=$('#minScoreVal');if(mv)mv.textContent='0';}
}
function performSearch(){
    var si=$('#searchInput');if(!si)return;var q=si.value.trim();
    if(!q&&!selectedClass&&!selectedDegree&&minScoreFilter<=0){clearSearch();return;}
    displayResults(!q?applyFilters(studentsData):searchStudents(q));
}
function showRandomStudent(){if(!studentsData.length)return;switchPage('search');displayFullCard(Math.floor(Math.random()*studentsData.length));}

function showLeaderboard(){
    var c=$('#content');if(!c)return;
    var sorted=studentsData.slice().sort(function(a,b){return(b.puan||0)-(a.puan||0);});
    var h=sorted.map(function(s,i){
        var rc='',ri=''+(i+1);if(i===0){rc='gold';ri='🥇';}else if(i===1){rc='silver';ri='🥈';}else if(i===2){rc='bronze';ri='🥉';}
        var ci='';if(seeChangesActive&&studentHistory[s.okul_no]){var old=studentHistory[s.okul_no].lastRank||(i+1),cur=i+1;if(cur<old)ci=' <span class="rank-up">↑'+(old-cur)+'</span>';else if(cur>old)ci=' <span class="rank-down">↓'+(cur-old)+'</span>';else ci=' <span class="rank-same">—</span>';studentHistory[s.okul_no].lastRank=cur;}
        return '<div class="leaderboard-item '+(i<3?'medal-'+rc:'')+'" data-index="'+studentsData.indexOf(s)+'"><div class="leaderboard-rank '+rc+'">'+ri+'</div><div class="leaderboard-info"><div class="leaderboard-name">'+esc(s.ad||'İsim Yok')+ci+'</div><div class="leaderboard-details">'+esc(s.sinif||'-')+' · '+(s.okul_no||'-')+'</div></div><div class="leaderboard-score">'+(s.puan||0)+'</div></div>';
    }).join('');
    if(seeChangesActive)safeSet('studentHistory',JSON.stringify(studentHistory));
    c.innerHTML='<div class="leaderboard"><div class="leaderboard-title">Puan Tablosu</div>'+h+'</div>';
    $$('.leaderboard-item').forEach(function(it){it.addEventListener('click',function(){var i=parseInt(this.getAttribute('data-index'));if(!isNaN(i)){switchPage('search');displayFullCard(i);}});});
    if(sheetConvActive)addExportBtn('.leaderboard','leaderboard');
}

function switchPage(page){
    currentPage=page;
    // Clean up any overlays/modals that might block UI
    var ov=$('.sheetconv-overlay');if(ov)ov.remove();
    var fc2=$('#filterCard');if(fc2)fc2.classList.remove('active');
    var ss=$('#searchSection'),ls=$('#luckySection');
    if(ss)ss.style.display=page==='search'?'flex':'none';
    if(ls)ls.style.display=page==='search'?'flex':'none';
    $$('.dock-btn').forEach(function(b){b.classList.remove('active');});
    var ab=$('.dock-btn[data-page="'+page+'"]');if(ab)ab.classList.add('active');
    if(page==='search')clearSearch();
    else if(page==='leaderboard')showLeaderboard();
    else if(page==='plugins')showPluginStore();
    else if(page.indexOf('plugin-')===0){try{loadPluginPage(page.replace('plugin-',''));}catch(e){console.error(e);}}
}

var availablePlugins=[
    {id:'duel',name:'Duel',version:'3.4',logo:'dueliconblacktheme.png',description:'Öğrencileri solo/team karşılaştırma.',author:'RedTux',versionBg:'#8B0000',versionColor:'#FF6B6B',hasTab:true},
    {id:'customcss',name:'WeaCSS Editor',version:'1.2',logo:'csslogo.png',description:'CSS ile özelleştirme.',author:'RedTux',versionBg:'#000080',versionColor:'#6B8BFF',hasTab:true},
    {id:'palette',name:'Palette',version:'1.0',logo:'palette.png',description:'Renk teması özelleştirme.',author:'RedTux',versionBg:'#C71585',versionColor:'#FFB6C1',hasTab:true},
    {id:'searchplus',name:'SearchPlus',version:'0.4',logo:'searchplus.png',description:'Filtre paneline başarı, puan, sıralama ekler.',author:'RedTux',versionBg:'#B8860B',versionColor:'#FFE4B5',hasTab:false},
    {id:'seechanges',name:'SeeChanges',version:'1.8',logo:'SeeChanges.png',description:'Puan/sıralama değişimlerini izler.',author:'RedTux',versionBg:'#4B0082',versionColor:'#E6E6FA',hasTab:false},
    {id:'sheetconv',name:'SheetConv',version:'1.3',logo:'SheetConv.png',description:'PDF, Excel, JSON, CSV export.',author:'RedTux',versionBg:'#008080',versionColor:'#AFEEEE',hasTab:false}
];

function loadInstalledPlugins(){installedPlugins=new Set(safeParse(safeGet('installedPlugins','[]'),[]));} 
function saveInstalledPlugins(){safeSet('installedPlugins',JSON.stringify([...installedPlugins]));}

function showPluginStore(){
    var c=$('#content');if(!c)return;
    var cards=availablePlugins.map(function(p){var inst=installedPlugins.has(p.id);return '<div class="plugin-card"><img src="assets/'+p.logo+'" alt="'+esc(p.name)+'" class="plugin-logo" onerror="this.style.background=\'var(--badge-bg)\';this.style.padding=\'16px\';"><div class="plugin-info"><div class="plugin-header"><h3>'+esc(p.name)+'</h3><span class="plugin-version" style="background:'+p.versionBg+';color:'+p.versionColor+';">v'+p.version+'</span>'+(p.hasTab?'':'<span class="plugin-tag">arka plan</span>')+'</div><p class="plugin-description">'+esc(p.description)+'</p><p class="plugin-author">by '+esc(p.author)+'</p><button class="plugin-action-btn '+(inst?'uninstall':'install')+'" data-plugin="'+p.id+'">'+(inst?'Kaldır':'Yükle')+'</button></div></div>';}).join('');
    c.innerHTML='<div class="plugin-store"><h1 class="plugin-store-title">Plugin Store</h1><div class="plugin-list">'+cards+'</div></div>';
    $$('.plugin-action-btn').forEach(function(b){b.addEventListener('click',function(){togglePlugin(this.getAttribute('data-plugin'),installedPlugins.has(this.getAttribute('data-plugin')),this);});});
}

function togglePlugin(id,inst,btn){
    if(inst){installedPlugins.delete(id);saveInstalledPlugins();if(id==='seechanges')seeChangesActive=false;if(id==='sheetconv')sheetConvActive=false;if(id==='searchplus'){searchPlusActive=false;removeSearchPlusUI();}showPluginStore();updateDockForPlugins();}
    else{if(btn){btn.textContent='Yükleniyor...';btn.disabled=true;}setTimeout(function(){installedPlugins.add(id);saveInstalledPlugins();if(id==='seechanges'){seeChangesActive=true;initSH();}if(id==='sheetconv')sheetConvActive=true;if(id==='searchplus'){searchPlusActive=true;injectSearchPlusUI();}showPluginStore();updateDockForPlugins();},800);}
}

function updateDockForPlugins(){
    var dock=$('.dock-container');if(!dock)return;
    dock.querySelectorAll('[data-plugin-dock]').forEach(function(b){b.remove();});
    installedPlugins.forEach(function(id){
        var p=availablePlugins.find(function(x){return x.id===id;});
        if(!p||!p.hasTab)return;
        var btn=document.createElement('button');btn.className='dock-btn';btn.setAttribute('data-page','plugin-'+id);btn.setAttribute('data-plugin-dock',id);btn.setAttribute('title',p.name);
        var img=document.createElement('img');img.src='assets/'+p.logo;img.alt=p.name;img.className='dock-plugin-icon';
        img.onerror=function(){this.remove();btn.textContent=p.name.charAt(0);btn.style.fontSize='18px';btn.style.fontWeight='700';};
        btn.appendChild(img);btn.addEventListener('click',function(){switchPage('plugin-'+id);});dock.appendChild(btn);
    });
}

function loadPluginPage(id){
    if(id==='duel')showDuelPlugin();else if(id==='customcss')showCustomCSSPlugin();else if(id==='palette')showPalettePlugin();
    else{var c=$('#content');if(c)c.innerHTML='<div class="no-result">Bu plugin için sayfa bulunamadı.</div>';}
}

// SEARCHPLUS
function injectSearchPlusUI(){
    removeSearchPlusUI();var fb=$('.filter-card-body');if(!fb)return;
    var bl=document.createElement('div');bl.id='searchPlusBlock';
    bl.innerHTML='<div class="sp-divider"></div><label class="sp-section-label">SearchPlus</label><label>Başarı Derecesi:</label><select class="filter-select-class" id="degreeFilter"><option value="">Tümü</option><option value="aşırı yüksek">Aşırı Yüksek</option><option value="yüksek">Yüksek</option><option value="orta">Orta</option><option value="düşük">Düşük</option></select><label>Sıralama:</label><select class="filter-select-class" id="sortFilter"><option value="default">Varsayılan</option><option value="puan-desc">Puan ↓</option><option value="puan-asc">Puan ↑</option><option value="ad-asc">İsim A→Z</option><option value="ad-desc">İsim Z→A</option><option value="no-asc">No ↑</option></select><label>Min Puan: <span id="minScoreVal" style="color:var(--primary-color);font-weight:700">0</span></label><input type="range" id="minScoreFilter" min="0" max="100" value="0" class="sp-range">';
    fb.appendChild(bl);
    var df=$('#degreeFilter'),sf=$('#sortFilter'),mf=$('#minScoreFilter'),mv=$('#minScoreVal');
    if(df)df.addEventListener('change',function(){selectedDegree=this.value;performSearch();});
    if(sf)sf.addEventListener('change',function(){selectedSort=this.value;performSearch();});
    if(mf){mf.addEventListener('input',function(){minScoreFilter=parseInt(this.value)||0;if(mv)mv.textContent=this.value;});mf.addEventListener('change',function(){performSearch();});}
}
function removeSearchPlusUI(){var e=$('#searchPlusBlock');if(e)e.remove();selectedDegree='';selectedSort='default';minScoreFilter=0;}

// DUEL
function showDuelPlugin(){var c=$('#content');if(!c)return;c.innerHTML='<div class="duel-plugin"><h1 class="duel-title">DUEL</h1><div class="duel-modes"><button class="duel-mode-btn" data-mode="solo">SOLO</button><button class="duel-mode-btn" data-mode="team">TEAM</button></div><div class="duel-content" id="duelContent"><p class="duel-placeholder">Bir mod seçin</p></div></div>';$$('.duel-mode-btn').forEach(function(b){b.addEventListener('click',function(){$$('.duel-mode-btn').forEach(function(x){x.classList.remove('active');});this.classList.add('active');var dc=$('#duelContent');if(!dc)return;if(this.getAttribute('data-mode')==='solo')loadDuelSolo(dc);else loadDuelTeam(dc);});});}
function getOpts(){return studentsData.map(function(s,i){return '<option value="'+i+'">'+esc(s.ad||'İsim Yok')+'</option>';}).join('');}
function loadDuelSolo(ct){ct.innerHTML='<div class="duel-solo"><select class="duel-select" id="duelPlayer1"><option value="">Oyuncu 1</option>'+getOpts()+'</select><div class="duel-vs">VS</div><select class="duel-select" id="duelPlayer2"><option value="">Oyuncu 2</option>'+getOpts()+'</select><button class="duel-fight-btn" id="duelSoloBtn">KARŞILAŞTIR</button><div class="duel-result" id="duelSoloResult"></div></div>';$('#duelSoloBtn').addEventListener('click',startDuelSolo);}
function calcScore(s){var dm={'aşırı yüksek':4,'yüksek':3,'orta':2,'düşük':1},gp=s.puan||0,d=tl(s.basari_derecesi||''),ds=0;for(var k in dm){if(tl(k)===d){ds=dm[k]*10;break;}}return{gp:gp,ds:ds,total:gp+ds};}
function startDuelSolo(){var v1=$('#duelPlayer1').value,v2=$('#duelPlayer2').value;if(!v1||!v2||v1===v2)return;var p1=studentsData[parseInt(v1)],p2=studentsData[parseInt(v2)];if(!p1||!p2)return;var s1=calcScore(p1),s2=calcScore(p2);var w=s1.total>s2.total?p1.ad:(s2.total>s1.total?p2.ad:'BERABERE');var r=$('#duelSoloResult');if(!r)return;r.innerHTML='<div class="duel-result-card"><h2>KAZANAN: '+esc(w)+'</h2><div class="duel-scores"><div class="duel-player-detail '+(s1.total>s2.total?'is-winner':'')+'"><h3>'+esc(p1.ad)+'</h3><p>GP: '+s1.gp+'</p><p>Başarı: +'+s1.ds+'</p><p class="total">TOPLAM: '+s1.total+'</p></div><div class="duel-player-detail '+(s2.total>s1.total?'is-winner':'')+'"><h3>'+esc(p2.ad)+'</h3><p>GP: '+s2.gp+'</p><p>Başarı: +'+s2.ds+'</p><p class="total">TOPLAM: '+s2.total+'</p></div></div></div>';}
function loadDuelTeam(ct){ct.innerHTML='<div class="duel-team"><div class="team-size-selector"><label>Takım:</label><select class="duel-select" id="teamSize" style="max-width:120px"><option value="2">2v2</option><option value="3">3v3</option><option value="4">4v4</option><option value="5">5v5</option></select></div><button class="duel-fight-btn secondary" id="setupTeamsBtn">OLUŞTUR</button><div id="teamSetup"></div></div>';$('#setupTeamsBtn').addEventListener('click',setupTeams);}
function setupTeams(){var ts=parseInt($('#teamSize').value||'2'),su=$('#teamSetup');if(!su)return;var o=getOpts(),t1='',t2='';for(var i=0;i<ts;i++){t1+='<select class="duel-select team1-player"><option value="">Oyuncu '+(i+1)+'</option>'+o+'</select>';t2+='<select class="duel-select team2-player"><option value="">Oyuncu '+(i+1)+'</option>'+o+'</select>';}su.innerHTML='<div class="team-grid"><div class="team-column"><h3>TAKIM 1</h3>'+t1+'</div><div class="duel-vs">VS</div><div class="team-column"><h3>TAKIM 2</h3>'+t2+'</div></div><button class="duel-fight-btn" id="startTeamBtn">KARŞILAŞTIR</button><div class="duel-result" id="duelTeamResult"></div>';$('#startTeamBtn').addEventListener('click',startDuelTeam);}
function startDuelTeam(){var gp=function(sel){return Array.from($$(sel)).map(function(s){return s.value?studentsData[parseInt(s.value)]:null;}).filter(Boolean);};var t1=gp('.team1-player'),t2=gp('.team2-player');if(!t1.length||!t2.length)return;var sc1=t1.reduce(function(s,p){return s+calcScore(p).total;},0),sc2=t2.reduce(function(s,p){return s+calcScore(p).total;},0);var w=sc1>sc2?'TAKIM 1':(sc2>sc1?'TAKIM 2':'BERABERE');var r=$('#duelTeamResult');if(!r)return;r.innerHTML='<div class="duel-result-card"><h2>KAZANAN: '+w+'</h2><div class="duel-scores"><div class="duel-player-detail '+(sc1>sc2?'is-winner':'')+'"><h3>TAKIM 1</h3><p>'+t1.map(function(p){return esc(p.ad);}).join(', ')+'</p><p class="total">TOPLAM: '+sc1+'</p></div><div class="duel-player-detail '+(sc2>sc1?'is-winner':'')+'"><h3>TAKIM 2</h3><p>'+t2.map(function(p){return esc(p.ad);}).join(', ')+'</p><p class="total">TOPLAM: '+sc2+'</p></div></div></div>';}

// CUSTOMCSS
function showCustomCSSPlugin(){var c=$('#content');if(!c)return;c.innerHTML='<div class="customcss-plugin"><h1 class="customcss-title">WeaCSS Editor</h1><textarea class="customcss-editor" id="customCSSEditor" placeholder="/* CSS */" spellcheck="false">'+esc(safeGet('customCSS',''))+'</textarea><div class="customcss-actions"><button class="customcss-btn apply" id="applyCSSBtn">Uygula</button><button class="customcss-btn reset" id="resetCSSBtn">Sıfırla</button></div></div>';$('#applyCSSBtn').addEventListener('click',function(){var css=$('#customCSSEditor').value;safeSet('customCSS',css);var st=$('#custom-css');if(!st){st=document.createElement('style');st.id='custom-css';document.head.appendChild(st);}st.textContent=css;});$('#resetCSSBtn').addEventListener('click',function(){safeSet('customCSS','');var e=$('#customCSSEditor');if(e)e.value='';var st=$('#custom-css');if(st)st.remove();});}

// PALETTE
function showPalettePlugin(){var c=$('#content');if(!c)return;var sp=safeGet('primaryColor','#9D7FFF'),ss=safeGet('secondaryColor','#FFFFFF');c.innerHTML='<div class="palette-plugin"><h1 class="palette-title">Palette</h1><div class="palette-controls"><div class="color-picker-group"><label>Birincil</label><input type="color" id="primaryColor" value="'+sp+'" class="color-picker"><span class="color-value" id="primaryValue">'+sp+'</span></div><div class="color-picker-group"><label>İkincil</label><input type="color" id="secondaryColor" value="'+ss+'" class="color-picker"><span class="color-value" id="secondaryValue">'+ss+'</span></div></div><div class="palette-actions"><button class="palette-btn apply" id="applyPaletteBtn">Uygula</button><button class="palette-btn reset" id="resetPaletteBtn">Sıfırla</button></div><div class="palette-preview"><h3>Önizleme</h3><button class="preview-button" id="previewBtn">Örnek</button><div class="preview-card-sample" id="previewCardSample">Kart</div></div></div>';var pi=$('#primaryColor'),si=$('#secondaryColor');var up=function(){$('#primaryValue').textContent=pi.value;$('#secondaryValue').textContent=si.value;var b=$('#previewBtn');if(b)b.style.background=pi.value;var cd=$('#previewCardSample');if(cd)cd.style.borderColor=pi.value;};pi.addEventListener('input',up);si.addEventListener('input',up);$('#applyPaletteBtn').addEventListener('click',function(){safeSet('primaryColor',pi.value);safeSet('secondaryColor',si.value);document.documentElement.style.setProperty('--primary-color',pi.value);document.documentElement.style.setProperty('--secondary-color',si.value);});$('#resetPaletteBtn').addEventListener('click',function(){safeSet('primaryColor','#9D7FFF');safeSet('secondaryColor','#FFFFFF');document.documentElement.style.setProperty('--primary-color','#9D7FFF');document.documentElement.style.setProperty('--secondary-color','#FFFFFF');showPalettePlugin();});}
function loadSavedPalette(){var p=safeGet('primaryColor',null),s=safeGet('secondaryColor',null);if(p)document.documentElement.style.setProperty('--primary-color',p);if(s)document.documentElement.style.setProperty('--secondary-color',s);}

// SEECHANGES
function initSH(){studentHistory=safeParse(safeGet('studentHistory','{}'),{});var sorted=studentsData.slice().sort(function(a,b){return(b.puan||0)-(a.puan||0);});sorted.forEach(function(s,i){if(!studentHistory[s.okul_no])studentHistory[s.okul_no]={puan:s.puan,basari_derecesi:s.basari_derecesi,lastRank:i+1};});safeSet('studentHistory',JSON.stringify(studentHistory));}
function detectChanges(s){if(!seeChangesActive)return null;var h=studentHistory[s.okul_no];if(!h)return null;return{puan:s.puan!==h.puan?{old:h.puan,new:s.puan}:null};}

// SHEETCONV
function addExportBtn(sel,type){var c=$(sel);if(!c||!sheetConvActive||c.querySelector('.sheetconv-btn'))return;var b=document.createElement('button');b.className='sheetconv-btn';b.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export';b.addEventListener('click',function(e){e.stopPropagation();showExportMenu(type);});c.style.position='relative';c.appendChild(b);}
function showExportMenu(type){var e=$('.sheetconv-overlay');if(e)e.remove();var ov=document.createElement('div');ov.className='sheetconv-overlay';var m=document.createElement('div');m.className='sheetconv-menu';m.innerHTML='<h4>Dışa Aktar</h4><button data-format="json">JSON</button><button data-format="csv">CSV</button><button data-format="pdf">PDF</button><button data-format="excel">Excel</button>';ov.appendChild(m);document.body.appendChild(ov);ov.addEventListener('click',function(ev){if(ev.target===ov)ov.remove();});m.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){doExport(type,b.getAttribute('data-format'));ov.remove();});});}
function doExport(dataType,format){
    var data,fn;
    if(dataType==='student-card'){var ne=$('.student-name');if(!ne)return;var st=studentsData.find(function(s){return s.ad===ne.textContent;});if(!st)return;data=[st];fn='student-'+st.okul_no;}
    else if(dataType==='leaderboard'){data=studentsData.slice().sort(function(a,b){return(b.puan||0)-(a.puan||0);});fn='leaderboard';}else return;
    if(format==='json'){dlBlob(JSON.stringify(data,null,2),'application/json',fn+'.json');}
    else if(format==='csv'){var h=['ad','okul_no','sinif','etkinlikler','basari_derecesi','puan','rutbe'];var rows=[h.join(',')];data.forEach(function(s){rows.push(h.map(function(k){return '"'+((s[k]||'').toString().replace(/"/g,'""'))+'"';}).join(','));});dlBlob('\uFEFF'+rows.join('\n'),'text/csv;charset=utf-8',fn+'.csv');}
    else if(format==='pdf'){try{var j=require('jspdf').jsPDF;var doc=new j();doc.setFontSize(16);doc.text(fn==='leaderboard'?'Puan Tablosu':(data[0].ad||''),20,20);doc.setFontSize(10);var y=35;data.forEach(function(s,i){doc.text((i+1)+'. '+(s.ad||'')+' | '+(s.sinif||'')+' | GP:'+(s.puan||0),20,y);y+=7;if(y>280){doc.addPage();y=20;}});var dl=path.join(require('os').homedir(),'Downloads');var fp=path.join(dl,fn+'-'+Date.now()+'.pdf');fs.writeFileSync(fp,Buffer.from(doc.output('arraybuffer')));alert('PDF: '+fp);}catch(e){alert('jspdf gerekli: npm install jspdf');}}
    else if(format==='excel'){try{var X=require('xlsx');var ws=X.utils.json_to_sheet(data),wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,'Data');var dl=path.join(require('os').homedir(),'Downloads');var fp=path.join(dl,fn+'-'+Date.now()+'.xlsx');X.writeFile(wb,fp);alert('Excel: '+fp);}catch(e){alert('xlsx gerekli: npm install xlsx');}}
}
function dlBlob(content,mime,name){try{var b=new Blob([content],{type:mime}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}}

// ═══════════════════════════════════════════════
// SETUP WIZARD
// ═══════════════════════════════════════════════

var setupMusic = null;
var setupMusicOn = true;

function shouldShowSetup() {
    return !safeGet('weasco_setup_done', null);
}

function startSetupMusic() {
    try {
        setupMusic = new Audio('assets/setupmusic.mp3');
        setupMusic.loop = true;
        setupMusic.volume = 0.4;
        if (setupMusicOn) setupMusic.play().catch(function(){});
    } catch(e) {}
}

function stopSetupMusic() {
    if (setupMusic) { setupMusic.pause(); setupMusic.currentTime = 0; setupMusic = null; }
}

function toggleSetupMusic() {
    setupMusicOn = !setupMusicOn;
    var btn = $('#wizardMusicBtn');
    if (btn) btn.innerHTML = setupMusicOn ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
    if (setupMusic) {
        if (setupMusicOn) setupMusic.play().catch(function(){});
        else setupMusic.pause();
    }
}

function showSetupWizard() {
    startSetupMusic();
    var container = $('.container');
    if (!container) return;

    // Hide main UI
    container.style.display = 'none';

    var wizard = document.createElement('div');
    wizard.id = 'setupWizard';
    wizard.className = 'wizard-overlay';
    wizard.innerHTML = '<div class="wizard-bg"><div class="wizard-particles" id="wizardParticles"></div></div>' +
        '<button class="wizard-music-btn" id="wizardMusicBtn" title="Müzik"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>' +
        '<div class="wizard-content">' +
            '<div class="wizard-step active" data-step="0">' +
                '<div class="wizard-logo-wrap"><img src="assets/Weasco (3).png" alt="Weasco" class="wizard-logo"></div>' +
                '<h1 class="wizard-title">Weasco 4.0</h1>' +
                '<p class="wizard-subtitle">MCO AIHL Öğrenci Sorgu Aracı</p>' +
                '<p class="wizard-desc">Hoş geldiniz. Weasco 4.0 kurulumuna başlamak için devam edin.</p>' +
                '<button class="wizard-btn primary" data-next="1">Başlayalım →</button>' +
            '</div>' +
            '<div class="wizard-step" data-step="1">' +
                '<div class="wizard-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></div>' +
                '<h2 class="wizard-step-title">Tema Seçin</h2>' +
                '<p class="wizard-desc">Weasco\'yu nasıl kullanmak istersiniz?</p>' +
                '<div class="wizard-theme-picker">' +
                    '<button class="wizard-theme-opt selected" data-theme="dark"><div class="wt-preview wt-dark"></div><span>Karanlık</span></button>' +
                    '<button class="wizard-theme-opt" data-theme="light"><div class="wt-preview wt-light"></div><span>Aydınlık</span></button>' +
                '</div>' +
                '<div class="wizard-nav"><button class="wizard-btn secondary" data-next="0">← Geri</button><button class="wizard-btn primary" data-next="2">Devam →</button></div>' +
            '</div>' +
            '<div class="wizard-step" data-step="2">' +
                '<div class="wizard-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707c.618 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.969a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z"/></svg></div>' +
                '<h2 class="wizard-step-title">Eklentiler</h2>' +
                '<p class="wizard-desc">Başlangıç eklentilerini seçin. Sonra Plugin Store\'dan değiştirebilirsiniz.</p>' +
                '<div class="wizard-plugin-grid" id="wizardPluginGrid"></div>' +
                '<div class="wizard-nav"><button class="wizard-btn secondary" data-next="1">← Geri</button><button class="wizard-btn primary" data-next="3">Devam →</button></div>' +
            '</div>' +
            '<div class="wizard-step" data-step="3">' +
                '<div class="wizard-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>' +
                '<h2 class="wizard-step-title">Veritabanı</h2>' +
                '<p class="wizard-desc">Veritabanınız hazır.</p>' +
                '<div class="wizard-stats">' +
                    '<div class="wizard-stat"><div class="wizard-stat-num" id="wizStatTotal">0</div><div class="wizard-stat-label">Öğrenci</div></div>' +
                    '<div class="wizard-stat"><div class="wizard-stat-num" id="wizStatClass">0</div><div class="wizard-stat-label">Sınıf</div></div>' +
                    '<div class="wizard-stat"><div class="wizard-stat-num" id="wizStatAvg">0</div><div class="wizard-stat-label">Ort. Puan</div></div>' +
                '</div>' +
                '<div class="wizard-nav"><button class="wizard-btn secondary" data-next="2">← Geri</button><button class="wizard-btn primary" data-next="4">Devam →</button></div>' +
            '</div>' +
            '<div class="wizard-step" data-step="4">' +
                '<div class="wizard-icon wizard-icon-big"><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>' +
                '<h2 class="wizard-step-title">Hazırsınız!</h2>' +
                '<p class="wizard-desc">Weasco 4.0 kullanıma hazır. Arama çubuğunu kullanarak öğrenci aramaya başlayabilirsiniz.</p>' +
                '<button class="wizard-btn primary finish" id="wizardFinishBtn">Weasco\'yu Başlat</button>' +
            '</div>' +
        '</div>' +
        '<div class="wizard-progress" id="wizardProgress"><div class="wizard-progress-bar" id="wizardProgressBar"></div></div>';
    document.body.appendChild(wizard);

    // Populate plugin grid
    var grid = $('#wizardPluginGrid');
    if (grid) {
        grid.innerHTML = availablePlugins.map(function(p) {
            return '<label class="wizard-plugin-item"><input type="checkbox" value="'+p.id+'" class="wizard-plugin-cb"><img src="assets/'+p.logo+'" class="wizard-plugin-icon" onerror="this.style.display=\'none\'"><div class="wizard-plugin-info"><strong>'+esc(p.name)+'</strong><small>'+esc(p.description)+'</small></div></label>';
        }).join('');
    }

    // Populate stats
    var total = studentsData.length;
    var classes = new Set(studentsData.map(function(s){return s.sinif;}).filter(Boolean)).size;
    var avg = total > 0 ? Math.round(studentsData.reduce(function(s,x){return s+(x.puan||0);},0)/total) : 0;
    var stEl = $('#wizStatTotal'); if(stEl) animateNumber(stEl, 0, total, 800);
    var scEl = $('#wizStatClass'); if(scEl) animateNumber(scEl, 0, classes, 600);
    var saEl = $('#wizStatAvg'); if(saEl) animateNumber(saEl, 0, avg, 1000);

    // Spawn particles
    spawnParticles();

    // Music toggle
    var mbtn = $('#wizardMusicBtn');
    if (mbtn) mbtn.addEventListener('click', toggleSetupMusic);

    // Navigation
    wizard.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-next]');
        if (!btn) return;
        var nextStep = parseInt(btn.getAttribute('data-next'));
        goToWizardStep(nextStep);
    });

    // Theme picker
    wizard.addEventListener('click', function(e) {
        var opt = e.target.closest('.wizard-theme-opt');
        if (!opt) return;
        $$('.wizard-theme-opt').forEach(function(o){o.classList.remove('selected');});
        opt.classList.add('selected');
        var theme = opt.getAttribute('data-theme');
        currentTheme = theme === 'dark' ? 'light' : 'dark'; // toggleTheme will flip it
        toggleTheme();
    });

    // Finish
    var finBtn = $('#wizardFinishBtn');
    if (finBtn) finBtn.addEventListener('click', finishSetup);
}

function goToWizardStep(step) {
    $$('.wizard-step').forEach(function(s){s.classList.remove('active');});
    var target = $('.wizard-step[data-step="'+step+'"]');
    if (target) target.classList.add('active');

    // Update progress bar
    var bar = $('#wizardProgressBar');
    if (bar) bar.style.width = (step / 4 * 100) + '%';

    // Animate stats when reaching step 3
    if (step === 3) {
        var total = studentsData.length;
        var classes = new Set(studentsData.map(function(s){return s.sinif;}).filter(Boolean)).size;
        var avg = total > 0 ? Math.round(studentsData.reduce(function(s,x){return s+(x.puan||0);},0)/total) : 0;
        animateNumber($('#wizStatTotal'), 0, total, 800);
        animateNumber($('#wizStatClass'), 0, classes, 600);
        animateNumber($('#wizStatAvg'), 0, avg, 1000);
    }
}

function animateNumber(el, from, to, duration) {
    if (!el) return;
    var start = performance.now();
    function tick(now) {
        var elapsed = now - start;
        var progress = Math.min(elapsed / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(from + (to - from) * eased);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function spawnParticles() {
    var container = $('#wizardParticles');
    if (!container) return;
    for (var i = 0; i < 30; i++) {
        var p = document.createElement('div');
        p.className = 'wizard-particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 8 + 's';
        p.style.animationDuration = (6 + Math.random() * 8) + 's';
        p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
        p.style.opacity = 0.1 + Math.random() * 0.3;
        container.appendChild(p);
    }
}

function finishSetup() {
    // Save selected plugins
    var checks = $$('.wizard-plugin-cb:checked');
    checks.forEach(function(cb) {
        var id = cb.value;
        installedPlugins.add(id);
        if (id === 'seechanges') { seeChangesActive = true; initSH(); }
        if (id === 'sheetconv') sheetConvActive = true;
        if (id === 'searchplus') { searchPlusActive = true; }
    });
    saveInstalledPlugins();

    safeSet('weasco_setup_done', '1');
    stopSetupMusic();

    // Fade out wizard
    var wiz = $('#setupWizard');
    if (wiz) {
        wiz.style.opacity = '0';
        wiz.style.transition = 'opacity 0.5s ease';
        setTimeout(function() {
            wiz.remove();
            var container = $('.container');
            if (container) {
                container.style.display = '';
                container.style.opacity = '0';
                container.style.transition = 'opacity 0.5s ease';
                setTimeout(function() { container.style.opacity = '1'; }, 50);
            }
            // Now run the normal init
            initApp();
        }, 500);
    }
}

// ═══════════════════════════════════════════════
// MAIN INIT
// ═══════════════════════════════════════════════

function initApp() {
    if (searchPlusActive) injectSearchPlusUI();
    updateDockForPlugins();
    var si=$('#searchInput'),sb=$('#searchButton'),tt=$('#themeToggle'),lb=$('#luckyButton');
    var ftb=$('#filterToggleBtn'),fc=$('#filterCard'),fcl=$('#filterClose'),cf=$('#classFilter'),lab=$('#listAllBtn');
    if(tt)tt.addEventListener('click',toggleTheme);
    if(lb)lb.addEventListener('click',showRandomStudent);
    var st2;if(si){si.addEventListener('input',function(){clearTimeout(st2);st2=setTimeout(function(){if(currentPage==='search')performSearch();},200);});si.addEventListener('keypress',function(e){if(e.key==='Enter'){clearTimeout(st2);performSearch();}});}
    if(sb)sb.addEventListener('click',performSearch);
    if(ftb&&fc)ftb.addEventListener('click',function(){fc.classList.toggle('active');});
    if(fcl&&fc)fcl.addEventListener('click',function(){fc.classList.remove('active');});
    if(cf)cf.addEventListener('change',function(){selectedClass=this.value;performSearch();if(fc)fc.classList.remove('active');});
    if(lab)lab.addEventListener('click',function(){selectedClass='';if(cf)cf.value='';if(si)si.value='';displayResults(applyFilters(studentsData));if(fc)fc.classList.remove('active');});
    $$('.dock-btn').forEach(function(b){b.addEventListener('click',function(){var p=this.getAttribute('data-page');if(p)switchPage(p);});});
    var gh=$('#githubLink'),rd=$('#redditLink');
    if(gh)gh.addEventListener('click',function(){openExt('https://github.com/TaxForRedTux/Weasco');});
    if(rd)rd.addEventListener('click',function(){openExt('https://www.reddit.com/r/weasco/');});
    if(si)si.focus();
}

document.addEventListener('DOMContentLoaded',function(){
    loadStudents();loadSavedTheme();
    var savedCSS=safeGet('customCSS','');if(savedCSS){var st=document.createElement('style');st.id='custom-css';st.textContent=savedCSS;document.head.appendChild(st);}
    loadSavedPalette();loadInstalledPlugins();
    if(installedPlugins.has('seechanges')){seeChangesActive=true;initSH();}
    if(installedPlugins.has('sheetconv'))sheetConvActive=true;
    if(installedPlugins.has('searchplus'))searchPlusActive=true;

    if (shouldShowSetup()) {
        showSetupWizard();
    } else {
        initApp();
    }
});