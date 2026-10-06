const SKATER_SIZES = ['M', 'L', 'XL', '2XL'];

const jerseyPenaltyForTeam = (teamPlayers, inventory) => {
  const inv = { ...inventory };
  let penalty = 0;
  const skaters = teamPlayers.filter(p => !p.isGoalie).sort((a,b) =>
    SKATER_SIZES.indexOf(b.preferredSize) - SKATER_SIZES.indexOf(a.preferredSize));
  for (const p of teamPlayers.filter(p => p.isGoalie)) {
    if ((inv.G2XL || 0) > 0) inv.G2XL--; else penalty += 100;
  }
  for (const p of skaters) {
    const start = Math.max(0, SKATER_SIZES.indexOf(p.preferredSize));
    let found = false;
    for (let i=start;i<=Math.min(start+1,SKATER_SIZES.length-1);i++) {
      const s=SKATER_SIZES[i];
      if ((inv[s] || 0)>0) { inv[s]--; penalty += (i-start); found=true; break; }
    }
    if (!found) penalty += 100;
  }
  return penalty;
};

const impactScore = (players) => players
  .filter(p=>!p.isGoalie)
  .sort((a,b)=>b.rating-a.rating)
  .slice(0, Math.max(1, Math.ceil(players.filter(p=>!p.isGoalie).length * 0.25)))
  .reduce((s,p)=>s+p.rating,0);

const finalTuple = (t1,t2,inventory) => {
  const g1=t1.filter(p=>p.isGoalie).length, g2=t2.filter(p=>p.isGoalie).length;
  const w1=t1.filter(p=>p.isWoman).length, w2=t2.filter(p=>p.isWoman).length;
  const jersey = jerseyPenaltyForTeam(t1,inventory.team1)+jerseyPenaltyForTeam(t2,inventory.team2);
  const r1=t1.filter(p=>!p.isGoalie).reduce((s,p)=>s+p.rating,0);
  const r2=t2.filter(p=>!p.isGoalie).reduce((s,p)=>s+p.rating,0);
  const impact=Math.abs(impactScore(t1)-impactScore(t2));
  return [Math.abs(g1-g2),Math.abs(w1-w2),jersey,impact,Math.abs(r1-r2)];
};
const tupleLess=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i]) return a[i]<b[i];}return false;};

export function buildBalancedTeams(players, friendGroups, inventory) {
  const byId=new Map(players.map(p=>[p.id,p]));
  const grouped=new Set();
  const units=[];
  friendGroups.forEach((ids,idx)=>{
    const members=ids.map(id=>byId.get(id)).filter(Boolean);
    if(members.length>=2){members.forEach(p=>grouped.add(p.id));units.push({id:'g'+idx,members,isFriend:true});}
  });
  players.filter(p=>!grouped.has(p.id)).forEach(p=>units.push({id:p.id,members:[p],isFriend:false}));

  // Hard priorities first: friend groups, then goalies, then women, then stronger skaters.
  units.sort((a,b)=>{
    if(a.isFriend!==b.isFriend) return a.isFriend?-1:1;
    const ag=a.members.filter(p=>p.isGoalie).length,bg=b.members.filter(p=>p.isGoalie).length;
    if(ag!==bg)return bg-ag;
    const aw=a.members.filter(p=>p.isWoman).length,bw=b.members.filter(p=>p.isWoman).length;
    if(aw!==bw)return bw-aw;
    return b.members.reduce((s,p)=>s+(p.isGoalie?0:p.rating),0)-a.members.reduce((s,p)=>s+(p.isGoalie?0:p.rating),0);
  });

  const n=players.length;
  const targets=n%2===0?[[n/2,n/2]]:[[Math.floor(n/2),Math.ceil(n/2)],[Math.ceil(n/2),Math.floor(n/2)]];
  let best=null;

  for(const [cap1,cap2] of targets){
    let states=[{t1:[],t2:[]}];
    for(const unit of units){
      const next=[];
      for(const s of states){
        if(s.t1.length+unit.members.length<=cap1) next.push({t1:[...s.t1,...unit.members],t2:s.t2});
        if(s.t2.length+unit.members.length<=cap2) next.push({t1:s.t1,t2:[...s.t2,...unit.members]});
      }
      if(!next.length) continue;
      next.sort((a,b)=>{
        const ta=finalTuple(a.t1,a.t2,inventory),tb=finalTuple(b.t1,b.t2,inventory);
        return tupleLess(ta,tb)?-1:tupleLess(tb,ta)?1:0;
      });
      states=next.slice(0,1500);
    }
    for(const s of states.filter(s=>s.t1.length===cap1&&s.t2.length===cap2)){
      const tuple=finalTuple(s.t1,s.t2,inventory);
      if(!best||tupleLess(tuple,best.tuple)) best={...s,tuple};
    }
  }
  if(!best) throw new Error('Could not create equal rosters while keeping all friend groups together.');
  return {team1:best.t1,team2:best.t2,score:best.tuple};
}

export function allocateJerseys(teamPlayers, inventory) {
  const inv={...inventory}; const result=teamPlayers.map(p=>({...p}));
  result.filter(p=>p.isGoalie).forEach(p=>{p.assignedSize=(inv.G2XL||0)>0?'G2XL':'TBD';if(p.assignedSize!=='TBD')inv.G2XL--;});
  result.filter(p=>!p.isGoalie).sort((a,b)=>SKATER_SIZES.indexOf(b.preferredSize)-SKATER_SIZES.indexOf(a.preferredSize)).forEach(p=>{
    const start=Math.max(0,SKATER_SIZES.indexOf(p.preferredSize)); p.assignedSize='TBD';
    for(let i=start;i<=Math.min(start+1,SKATER_SIZES.length-1);i++){const s=SKATER_SIZES[i];if((inv[s]||0)>0){p.assignedSize=s;inv[s]--;break;}}
  });
  return result;
}

export function allocateSocks(teamPlayers, inventory) {
  const inv={...inventory}; const result=teamPlayers.map(p=>({...p}));
  result.forEach(p=>{
    const preferred=p.preferredSize==='2XL'?'XL 32"':'L 30"';
    const fallback=preferred==='L 30"'?'XL 32"':'L 30"';
    if((inv[preferred]||0)>0){p.assignedSockSize=preferred;inv[preferred]--;}
    else if((inv[fallback]||0)>0){p.assignedSockSize=fallback;inv[fallback]--;}
    else p.assignedSockSize='TBD';
  });
  return result;
}
