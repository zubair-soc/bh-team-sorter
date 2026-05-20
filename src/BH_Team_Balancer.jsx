import React, { useState, useMemo } from 'react';
import { Users, Shirt, Star, AlertCircle, Shuffle, X, Upload, Download, FileSpreadsheet, FileText, Plus, ChevronDown } from 'lucide-react';

const HockeyTeamBalancerWithUpload = () => {
  // ── Season / Class (local state, Supabase-ready) ──────────────────────────
  const [seasons, setSeasons] = useState([
    { id: 1, name: 'Summer 2026', classes: [
      { id: 1, name: 'Sunday' },
      { id: 2, name: 'Wednesday' },
    ]},
  ]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(1);
  const [selectedClassId, setSelectedClassId] = useState(1);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [showNewClass, setShowNewClass] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newClassName, setNewClassName] = useState('');

  const selectedSeason = seasons.find(s => s.id === selectedSeasonId);
  const selectedClass = selectedSeason?.classes.find(c => c.id === selectedClassId);

  const addSeason = () => {
    if (!newSeasonName.trim()) return;
    const id = Math.max(...seasons.map(s => s.id), 0) + 1;
    setSeasons([...seasons, { id, name: newSeasonName.trim(), classes: [] }]);
    setSelectedSeasonId(id);
    setSelectedClassId(null);
    setNewSeasonName('');
    setShowNewSeason(false);
  };

  const addClass = () => {
    if (!newClassName.trim() || !selectedSeasonId) return;
    const classId = Math.max(...seasons.flatMap(s => s.classes.map(c => c.id)), 0) + 1;
    setSeasons(seasons.map(s =>
      s.id === selectedSeasonId
        ? { ...s, classes: [...s.classes, { id: classId, name: newClassName.trim() }] }
        : s
    ));
    setSelectedClassId(classId);
    setNewClassName('');
    setShowNewClass(false);
  };

  // ── Team names (inline editable) ──────────────────────────────────────────
  const [teamNames, setTeamNames] = useState({ team1: 'Teal Tanglers', team2: 'Orange Crush' });
  const [uploadError, setUploadError] = useState('');

  const sizes = ['M', 'L', 'XL', '2XL', 'G2XL'];
  const skaterSizes = ['M', 'L', 'XL', '2XL'];
  const sockSizes = ['L 30"', 'XL 32"'];

  // ── Inventory ─────────────────────────────────────────────────────────────
  const [inventory, setInventory] = useState({
    team1: { M: 2, L: 6, XL: 5, '2XL': 4, 'G2XL': 2 },
    team2: { M: 2, L: 6, XL: 5, '2XL': 4, 'G2XL': 2 }
  });

  const [sockInventory, setSockInventory] = useState({
    team1: { 'L 30"': 10, 'XL 32"': 10 },
    team2: { 'L 30"': 10, 'XL 32"': 10 }
  });

  const [players, setPlayers] = useState([
    { id: 1, name: '', rating: 5, preferredSize: 'M', isGoalie: false, isIR: false, isWoman: false, team: null }
  ]);

  const [friendGroups, setFriendGroups] = useState([]);
  const [newGroup, setNewGroup] = useState([]);

  // ── CSV Upload ────────────────────────────────────────────────────────────
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setUploadError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 2) { setUploadError('File must contain header row and at least one player'); return; }
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = header.findIndex(h => h.includes('name'));
        const ratingIdx = header.findIndex(h => h.includes('rating'));
        const sizeIdx = header.findIndex(h => h.includes('size') || h.includes('jersey'));
        const goalieIdx = header.findIndex(h => h.includes('goalie'));
        const irIdx = header.findIndex(h => h.includes('ir') || h.includes('injured'));
        const friendIdx = header.findIndex(h => h.includes('friend') || h.includes('group'));
        const womanIdx = header.findIndex(h => h.includes('woman') || h.includes('female') || h.includes('gender'));
        if (nameIdx === -1 || ratingIdx === -1 || sizeIdx === -1) {
          setUploadError('CSV must have columns: Name, Rating, Preferred Size (and optionally Goalie, IR, Woman, Friend Group)');
          return;
        }
        const newPlayers = [];
        const groupMap = new Map();
        lines.slice(1).forEach((line, idx) => {
          const cols = line.split(',').map(c => c.trim());
          const name = cols[nameIdx] || `Player ${idx + 1}`;
          const rating = parseInt(cols[ratingIdx]) || 5;
          const preferredSize = cols[sizeIdx]?.toUpperCase() || 'L';
          const isGoalie = goalieIdx !== -1 && (cols[goalieIdx]?.toLowerCase() === 'yes' || cols[goalieIdx]?.toLowerCase() === 'true' || cols[goalieIdx] === '1');
          const isIR = irIdx !== -1 && (cols[irIdx]?.toLowerCase() === 'yes' || cols[irIdx]?.toLowerCase() === 'true' || cols[irIdx] === '1');
          const isWoman = womanIdx !== -1 && (cols[womanIdx]?.toLowerCase() === 'yes' || cols[womanIdx]?.toLowerCase() === 'true' || cols[womanIdx] === '1' || cols[womanIdx]?.toLowerCase() === 'female' || cols[womanIdx]?.toLowerCase() === 'f' || cols[womanIdx]?.toLowerCase() === 'woman');
          const friendGroup = friendIdx !== -1 ? cols[friendIdx]?.trim() : '';
          const validSize = sizes.includes(preferredSize) ? preferredSize : 'L';
          const playerId = idx + 1;
          newPlayers.push({ id: playerId, name, rating: Math.max(1, Math.min(10, rating)), preferredSize: validSize, isGoalie, isIR, isWoman, team: null });
          if (friendGroup) {
            if (!groupMap.has(friendGroup)) groupMap.set(friendGroup, []);
            groupMap.get(friendGroup).push(playerId);
          }
        });
        const newFriendGroups = Array.from(groupMap.values()).filter(group => group.length >= 2);
        setPlayers(newPlayers);
        setFriendGroups(newFriendGroups);
        alert(`Successfully loaded ${newPlayers.length} players (${newPlayers.filter(p => p.isGoalie).length} goalies) and ${newFriendGroups.length} friend groups!`);
      } catch (error) { setUploadError(`Error parsing file: ${error.message}`); }
    };
    reader.onerror = () => setUploadError('Error reading file');
    reader.readAsText(file);
    event.target.value = '';
  };

  const downloadTemplate = () => {
    const template = `Name,Rating,Preferred Size,Goalie,IR,Woman,Friend Group\nJohn Smith,7,L,No,No,No,A\nJane Doe,8,M,No,No,Yes,A\nBob Wilson,6,XL,Yes,No,No,\nSarah Lee,9,2XL,No,No,Yes,B\nMike Jones,7,L,No,No,No,B\nTom Brown,5,M,No,Yes,No,\nLisa White,8,L,Yes,No,Yes,`;
    const a = document.createElement('a');
    a.href = `data:text/csv;base64,${btoa(unescape(encodeURIComponent(template)))}`;
    a.download = 'hockey_roster_template.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadForExcel = () => {
    const team1Players = players.filter(p => p.team === 'team1');
    const team2Players = players.filter(p => p.team === 'team2');
    let content = `HOCKEY ROSTER DATA - FOR EXCEL CREATION\nGenerated: ${new Date().toLocaleDateString()}\nSeason: ${selectedSeason?.name || ''} | Class: ${selectedClass?.name || ''}\n\nINSTRUCTIONS: Upload this file to Claude and say "Create an Excel spreadsheet from this hockey roster data"\n\n================================================================================\nTEAM NAMES\n================================================================================\nTeam 1: ${teamNames.team1}\nTeam 2: ${teamNames.team2}\n\n================================================================================\nTEAM 1: ${teamNames.team1.toUpperCase()}\n================================================================================\nName,Rating,Preferred Size,Assigned Size,Position,IR Status,Friend Group\n`;
    team1Players.forEach(player => {
      const groupIndex = friendGroups.findIndex(group => group.includes(player.id));
      content += `${player.name || 'Unknown'},${player.rating},${player.preferredSize},${player.assignedSize || 'TBD'},${player.isGoalie ? 'Goalie' : 'Skater'},${player.isIR ? 'IR' : 'Active'},${groupIndex >= 0 ? `Group ${groupIndex + 1}` : ''}\n`;
    });
    content += `\n================================================================================\nTEAM 2: ${teamNames.team2.toUpperCase()}\n================================================================================\nName,Rating,Preferred Size,Assigned Size,Position,IR Status,Friend Group\n`;
    team2Players.forEach(player => {
      const groupIndex = friendGroups.findIndex(group => group.includes(player.id));
      content += `${player.name || 'Unknown'},${player.rating},${player.preferredSize},${player.assignedSize || 'TBD'},${player.isGoalie ? 'Goalie' : 'Skater'},${player.isIR ? 'IR' : 'Active'},${groupIndex >= 0 ? `Group ${groupIndex + 1}` : ''}\n`;
    });
    const a = document.createElement('a');
    a.href = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(content)))}`;
    a.download = 'hockey_roster_for_excel.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadAdminRoster = () => {
    const team1Players = players.filter(p => p.team === 'team1');
    const team2Players = players.filter(p => p.team === 'team2');
    let content = `HOCKEY ROSTER DATA - FOR ADMIN PDF CREATION\nGenerated: ${new Date().toLocaleDateString()}\nSeason: ${selectedSeason?.name || ''} | Class: ${selectedClass?.name || ''}\n\nINSTRUCTIONS: Upload this file to Claude and say "Create an admin PDF roster from this data"\n\n================================================================================\nTEAM 1: ${teamNames.team1.toUpperCase()}\n================================================================================\n`;
    team1Players.forEach(player => {
      const groupIndex = friendGroups.findIndex(group => group.includes(player.id));
      content += `\n# | ${player.name || 'Unknown'} | Rating: ${player.rating}\n  Position: ${player.isGoalie ? 'Goalie' : 'Skater'}\n  Jersey: ${player.preferredSize} → ${player.assignedSize || 'TBD'}\n  Status: ${player.isIR ? 'IR' : 'Active'}${player.isWoman ? ' | Woman' : ''}\n  ${groupIndex >= 0 ? `Friend Group ${groupIndex + 1}` : 'No Group'}\n`;
    });
    content += `\nTotal: ${team1Players.length} | Rating: ${stats.team1.rating} | Avg: ${stats.team1.count > 0 ? (stats.team1.rating / stats.team1.count).toFixed(2) : 0}\n\n================================================================================\nTEAM 2: ${teamNames.team2.toUpperCase()}\n================================================================================\n`;
    team2Players.forEach(player => {
      const groupIndex = friendGroups.findIndex(group => group.includes(player.id));
      content += `\n# | ${player.name || 'Unknown'} | Rating: ${player.rating}\n  Position: ${player.isGoalie ? 'Goalie' : 'Skater'}\n  Jersey: ${player.preferredSize} → ${player.assignedSize || 'TBD'}\n  Status: ${player.isIR ? 'IR' : 'Active'}${player.isWoman ? ' | Woman' : ''}\n  ${groupIndex >= 0 ? `Friend Group ${groupIndex + 1}` : 'No Group'}\n`;
    });
    content += `\nTotal: ${team2Players.length} | Rating: ${stats.team2.rating} | Avg: ${stats.team2.count > 0 ? (stats.team2.rating / stats.team2.count).toFixed(2) : 0}\n`;
    const a = document.createElement('a');
    a.href = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(content)))}`;
    a.download = 'hockey_admin_roster.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadPublicRoster = () => {
    const team1Players = players.filter(p => p.team === 'team1');
    const team2Players = players.filter(p => p.team === 'team2');
    let content = `HOCKEY ROSTER\nSeason: ${selectedSeason?.name || ''} | Class: ${selectedClass?.name || ''}\nGenerated: ${new Date().toLocaleDateString()}\n\n================================================================================\nTEAM 1: ${teamNames.team1.toUpperCase()}\n================================================================================\n`;
    team1Players.forEach(player => { content += `# | ${player.name || 'Unknown'} - ${player.isGoalie ? 'Goalie' : 'Skater'}${player.isIR ? ' (IR)' : ''}\n`; });
    content += `\nTotal: ${team1Players.length} | Goalies: ${team1Players.filter(p => p.isGoalie).length}\n\n================================================================================\nTEAM 2: ${teamNames.team2.toUpperCase()}\n================================================================================\n`;
    team2Players.forEach(player => { content += `# | ${player.name || 'Unknown'} - ${player.isGoalie ? 'Goalie' : 'Skater'}${player.isIR ? ' (IR)' : ''}\n`; });
    content += `\nTotal: ${team2Players.length} | Goalies: ${team2Players.filter(p => p.isGoalie).length}\n`;
    const a = document.createElement('a');
    a.href = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(content)))}`;
    a.download = 'hockey_public_roster.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Player CRUD ───────────────────────────────────────────────────────────
  const addPlayer = () => {
    const newId = Math.max(...players.map(p => p.id), 0) + 1;
    setPlayers([...players, { id: newId, name: '', rating: 5, preferredSize: 'M', isGoalie: false, isIR: false, isWoman: false, team: null }]);
  };
  const updatePlayer = (id, field, value) => setPlayers(players.map(p => p.id === id ? { ...p, [field]: value } : p));
  const removePlayer = (id) => {
    setPlayers(players.filter(p => p.id !== id));
    setFriendGroups(friendGroups.map(g => g.filter(pid => pid !== id)).filter(g => g.length >= 2));
  };
  const updateInventory = (team, size, value) => setInventory({ ...inventory, [team]: { ...inventory[team], [size]: Math.max(0, parseInt(value) || 0) } });
  const updateSockInventory = (team, size, value) => setSockInventory({ ...sockInventory, [team]: { ...sockInventory[team], [size]: Math.max(0, parseInt(value) || 0) } });

  // ── Friend Groups ─────────────────────────────────────────────────────────
  const addToNewGroup = (playerId) => setNewGroup(newGroup.includes(playerId) ? newGroup.filter(id => id !== playerId) : [...newGroup, playerId]);
  const createFriendGroup = () => { if (newGroup.length >= 2) { setFriendGroups([...friendGroups, [...newGroup]]); setNewGroup([]); } };
  const removeFriendGroup = (index) => setFriendGroups(friendGroups.filter((_, i) => i !== index));

  // ── Balance Algorithm (unchanged) ─────────────────────────────────────────
  const balanceTeams = () => {
    const unassignedPlayers = [...players.filter(p => !p.team)];
    const newPlayerAssignments = {};
    players.forEach(p => { if (p.team) newPlayerAssignments[p.id] = p.team; });
    const unassignedPlayerIds = new Set(unassignedPlayers.map(p => p.id));
    const groupsToAssign = [];
    friendGroups.forEach(group => {
      const allUnassigned = group.every(id => unassignedPlayerIds.has(id));
      if (allUnassigned) {
        const groupPlayers = group.map(id => players.find(p => p.id === id));
        groupsToAssign.push({ playerIds: group, players: groupPlayers, rating: groupPlayers.reduce((sum, p) => sum + p.rating, 0), women: groupPlayers.filter(p => p.isWoman).length });
      }
    });
    groupsToAssign.sort((a, b) => b.rating - a.rating);
    groupsToAssign.forEach(group => {
      const t1r = Object.entries(newPlayerAssignments).filter(([_, t]) => t === 'team1').reduce((s, [id]) => s + players.find(p => p.id === parseInt(id)).rating, 0);
      const t2r = Object.entries(newPlayerAssignments).filter(([_, t]) => t === 'team2').reduce((s, [id]) => s + players.find(p => p.id === parseInt(id)).rating, 0);
      const t1w = Object.entries(newPlayerAssignments).filter(([_, t]) => t === 'team1').reduce((s, [id]) => s + (players.find(p => p.id === parseInt(id)).isWoman ? 1 : 0), 0);
      const t2w = Object.entries(newPlayerAssignments).filter(([_, t]) => t === 'team2').reduce((s, [id]) => s + (players.find(p => p.id === parseInt(id)).isWoman ? 1 : 0), 0);
      const assignTo = t1w < t2w ? 'team1' : t2w < t1w ? 'team2' : t1r <= t2r ? 'team1' : 'team2';
      group.playerIds.forEach(id => { newPlayerAssignments[id] = assignTo; unassignedPlayerIds.delete(id); });
    });
    const remaining = unassignedPlayers.filter(p => unassignedPlayerIds.has(p.id));
    const goalies = remaining.filter(p => p.isGoalie).sort((a, b) => b.rating - a.rating);
    goalies.forEach((g, i) => { newPlayerAssignments[g.id] = i % 2 === 0 ? 'team1' : 'team2'; unassignedPlayerIds.delete(g.id); });
    const skaters = remaining.filter(p => !p.isGoalie);
    const women = skaters.filter(p => p.isWoman).sort((a, b) => b.rating - a.rating);
    women.forEach((w, i) => { newPlayerAssignments[w.id] = i % 2 === 0 ? 'team1' : 'team2'; unassignedPlayerIds.delete(w.id); });
    const men = skaters.filter(p => !p.isWoman).sort((a, b) => b.rating - a.rating);
    men.forEach(player => {
      const t1r = Object.entries(newPlayerAssignments).filter(([_, t]) => t === 'team1').reduce((s, [id]) => s + players.find(p => p.id === parseInt(id)).rating, 0);
      const t2r = Object.entries(newPlayerAssignments).filter(([_, t]) => t === 'team2').reduce((s, [id]) => s + players.find(p => p.id === parseInt(id)).rating, 0);
      newPlayerAssignments[player.id] = t1r <= t2r ? 'team1' : 'team2';
    });
    const t1Inv = { ...inventory.team1 };
    const t2Inv = { ...inventory.team2 };
    const assignJerseys = (teamPlayers, inv) => {
      const nonIRGoalies = teamPlayers.filter(p => p.isGoalie && !p.isIR);
      const irGoalies = teamPlayers.filter(p => p.isGoalie && p.isIR);
      const nonIRSkaters = teamPlayers.filter(p => !p.isGoalie && !p.isIR).sort((a, b) => skaterSizes.indexOf(a.preferredSize) - skaterSizes.indexOf(b.preferredSize));
      const irSkaters = teamPlayers.filter(p => !p.isGoalie && p.isIR).sort((a, b) => skaterSizes.indexOf(a.preferredSize) - skaterSizes.indexOf(b.preferredSize));
      const assignGoalie = (p) => { p.assignedSize = inv['G2XL'] > 0 ? (inv['G2XL']--, 'G2XL') : 'TBD'; };
      const assignSkater = (p) => {
        const si = skaterSizes.indexOf(p.preferredSize);
        let assigned = false;
        for (let i = si; i < skaterSizes.length; i++) { if (inv[skaterSizes[i]] > 0) { p.assignedSize = skaterSizes[i]; inv[skaterSizes[i]]--; assigned = true; break; } }
        if (!assigned) p.assignedSize = 'TBD';
      };
      nonIRGoalies.forEach(assignGoalie); nonIRSkaters.forEach(assignSkater); irGoalies.forEach(assignGoalie); irSkaters.forEach(assignSkater);
    };
    const t1Players = players.filter(p => newPlayerAssignments[p.id] === 'team1');
    const t2Players = players.filter(p => newPlayerAssignments[p.id] === 'team2');
    assignJerseys(t1Players, t1Inv);
    assignJerseys(t2Players, t2Inv);
    setPlayers(players.map(p => {
      const assignedTeam = newPlayerAssignments[p.id] || null;
      const tp = assignedTeam === 'team1' ? t1Players.find(tp => tp.id === p.id) : assignedTeam === 'team2' ? t2Players.find(tp => tp.id === p.id) : null;
      return { ...p, team: assignedTeam, assignedSize: tp ? tp.assignedSize : undefined };
    }));
  };

  const clearTeams = () => setPlayers(players.map(p => ({ ...p, team: null, assignedSize: undefined })));

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const t1 = players.filter(p => p.team === 'team1');
    const t2 = players.filter(p => p.team === 'team2');
    const calc = (arr) => ({ count: arr.length, rating: arr.reduce((s, p) => s + p.rating, 0), goalies: arr.filter(p => p.isGoalie).length, ir: arr.filter(p => p.isIR).length, women: arr.filter(p => p.isWoman).length });
    let preferredSizeMet = 0, sizedUp = 0, unmetNeeds = 0;
    [...t1, ...t2].forEach(p => {
      if (p.assignedSize === p.preferredSize) preferredSizeMet++;
      else if (p.assignedSize && p.assignedSize !== 'TBD') sizedUp++;
      else unmetNeeds++;
    });
    return { team1: calc(t1), team2: calc(t2), jerseys: { preferredSizeMet, sizedUp, unmetNeeds } };
  }, [players]);

  // ── Group colors ──────────────────────────────────────────────────────────
  const groupColors = ['bg-blue-100 border-blue-300','bg-green-100 border-green-300','bg-purple-100 border-purple-300','bg-pink-100 border-pink-300','bg-yellow-100 border-yellow-300','bg-indigo-100 border-indigo-300','bg-red-100 border-red-300','bg-orange-100 border-orange-300'];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">🏒 BH Team Balancer</h1>
          <p className="text-slate-600">Balance teams by skill, manage jerseys, and respect friend groups</p>
        </div>

        {/* ── Season / Class Selector ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Season & Class</h2>
          <div className="flex flex-col md:flex-row gap-4">

            {/* Season */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-600 mb-1">Season</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedSeasonId || ''}
                    onChange={e => { setSelectedSeasonId(Number(e.target.value)); setSelectedClassId(null); }}
                    className="w-full appearance-none px-3 py-2 border rounded-lg pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-3 text-slate-400 pointer-events-none" />
                </div>
                <button onClick={() => setShowNewSeason(!showNewSeason)} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition" title="Add season">
                  <Plus size={18} />
                </button>
              </div>
              {showNewSeason && (
                <div className="flex gap-2 mt-2">
                  <input autoFocus value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSeason()} placeholder="e.g. Winter 2027" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={addSeason} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">Add</button>
                  <button onClick={() => { setShowNewSeason(false); setNewSeasonName(''); }} className="px-3 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 text-sm">Cancel</button>
                </div>
              )}
            </div>

            {/* Class */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-600 mb-1">Class</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedClassId || ''}
                    onChange={e => setSelectedClassId(Number(e.target.value))}
                    disabled={!selectedSeason || selectedSeason.classes.length === 0}
                    className="w-full appearance-none px-3 py-2 border rounded-lg pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {selectedSeason?.classes.length === 0 && <option value="">No classes yet</option>}
                    {selectedSeason?.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-3 text-slate-400 pointer-events-none" />
                </div>
                <button onClick={() => setShowNewClass(!showNewClass)} disabled={!selectedSeasonId} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-slate-300" title="Add class">
                  <Plus size={18} />
                </button>
              </div>
              {showNewClass && (
                <div className="flex gap-2 mt-2">
                  <input autoFocus value={newClassName} onChange={e => setNewClassName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addClass()} placeholder="e.g. Sunday" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={addClass} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">Add</button>
                  <button onClick={() => { setShowNewClass(false); setNewClassName(''); }} className="px-3 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 text-sm">Cancel</button>
                </div>
              )}
            </div>

          </div>
          {selectedSeason && selectedClass && (
            <p className="mt-3 text-sm text-slate-500">
              Currently editing: <span className="font-semibold text-slate-700">{selectedSeason.name} — {selectedClass.name}</span>
            </p>
          )}
        </div>

        {/* ── Team Names (inline editable) ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Team Names</h2>
          <div className="grid grid-cols-2 gap-4">
            {['team1', 'team2'].map(team => (
              <div key={team} className="border rounded-lg p-4">
                <label className="block text-xs font-medium text-slate-500 mb-1">{team === 'team1' ? 'Team 1' : 'Team 2'}</label>
                <input
                  type="text"
                  value={teamNames[team]}
                  onChange={e => setTeamNames({ ...teamNames, [team]: e.target.value })}
                  className="w-full text-lg font-semibold text-slate-800 border-0 border-b-2 border-transparent focus:border-blue-500 focus:outline-none bg-transparent pb-1 transition-colors"
                  placeholder="Enter team name"
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Jersey & Sock Inventory ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Shirt className="text-blue-600" />
            Inventory
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {['team1', 'team2'].map(team => (
              <div key={team} className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">{teamNames[team]}</h3>

                {/* Jerseys */}
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Jerseys</p>
                <div className="space-y-2 mb-4">
                  {sizes.map(size => (
                    <div key={size} className="flex items-center gap-2">
                      <label className="w-16 text-sm font-medium">{size}:</label>
                      <input type="number" min="0" value={inventory[team][size]} onChange={e => updateInventory(team, size, e.target.value)} className="flex-1 px-3 py-1 border rounded" />
                    </div>
                  ))}
                </div>

                {/* Socks */}
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Socks</p>
                <div className="space-y-2">
                  {sockSizes.map(size => (
                    <div key={size} className="flex items-center gap-2">
                      <label className="w-16 text-sm font-medium">{size}:</label>
                      <input type="number" min="0" value={sockInventory[team][size]} onChange={e => updateSockInventory(team, size, e.target.value)} className="flex-1 px-3 py-1 border rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CSV Upload ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Quick Start: Upload CSV</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
              <label className="flex-1 cursor-pointer">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-blue-500 transition text-center">
                  <Upload className="mx-auto mb-2 text-slate-400" size={32} />
                  <p className="text-sm font-medium text-slate-700">Click to upload CSV file</p>
                  <p className="text-xs text-slate-500 mt-1">Or drag and drop here</p>
                </div>
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
              <div className="flex flex-col gap-2 md:w-48">
                <button onClick={downloadTemplate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2">
                  <Download size={18} /> Template
                </button>
                <p className="text-xs text-slate-500 text-center">Download sample CSV</p>
              </div>
            </div>
            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-sm text-red-800">{uploadError}</p>
              </div>
            )}
            <div className="text-xs text-slate-500 space-y-1">
              <p><strong>Required:</strong> Name, Rating (1-10), Preferred Size (M/L/XL/2XL/G2XL)</p>
              <p><strong>Optional:</strong> Goalie, IR, Woman, Friend Group</p>
            </div>
          </div>
        </div>

        {/* ── Players ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="text-green-600" /> Players ({players.length})
            </h2>
            <button onClick={addPlayer} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">+ Add Player</button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {players.map(player => {
              const groupIndex = friendGroups.findIndex(g => g.includes(player.id));
              const groupColor = groupIndex >= 0 ? groupColors[groupIndex % groupColors.length] : 'bg-white';
              const borderClass = groupIndex >= 0 ? 'border-2' : 'border';
              return (
                <div key={player.id} className={`flex gap-2 items-center p-2 rounded ${groupColor} ${borderClass}`}>
                  <input type="text" placeholder="Name" value={player.name} onChange={e => updatePlayer(player.id, 'name', e.target.value)} className="flex-1 px-2 py-1 border rounded" />
                  <input type="number" min="1" max="10" value={player.rating} onChange={e => updatePlayer(player.id, 'rating', parseInt(e.target.value) || 5)} className="w-16 px-2 py-1 border rounded" title="Rating (1-10)" />
                  <select value={player.preferredSize} onChange={e => updatePlayer(player.id, 'preferredSize', e.target.value)} className="px-2 py-1 border rounded">
                    {sizes.map(size => <option key={size} value={size}>{size}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={player.isGoalie} onChange={e => updatePlayer(player.id, 'isGoalie', e.target.checked)} /> G</label>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={player.isIR} onChange={e => updatePlayer(player.id, 'isIR', e.target.checked)} /> IR</label>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={player.isWoman} onChange={e => updatePlayer(player.id, 'isWoman', e.target.checked)} /> W</label>
                  <button onClick={() => removePlayer(player.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><X size={18} /></button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Friend Groups ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Friend Groups</h2>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">Create New Group</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {players.map(player => (
                  <button key={player.id} onClick={() => addToNewGroup(player.id)} className={`px-3 py-1 rounded text-sm transition ${newGroup.includes(player.id) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    {player.name || `Player ${player.id}`}
                  </button>
                ))}
              </div>
              <button onClick={createFriendGroup} disabled={newGroup.length < 2} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-slate-300 transition">
                Create Group ({newGroup.length} selected)
              </button>
            </div>
            {friendGroups.map((group, index) => (
              <div key={index} className="border rounded-lg p-4 bg-slate-50">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium">Group {index + 1}</h3>
                  <button onClick={() => removeFriendGroup(index)} className="text-red-600 hover:bg-red-50 p-1 rounded"><X size={18} /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.map(playerId => {
                    const player = players.find(p => p.id === playerId);
                    return <span key={playerId} className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm">{player?.name || `Player ${playerId}`}</span>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Balance Button ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex gap-4">
            <button onClick={balanceTeams} className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold text-lg flex items-center justify-center gap-2">
              <Shuffle size={24} /> Balance Teams
            </button>
            <button onClick={clearTeams} className="px-6 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-bold text-lg">Clear Teams</button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Team Statistics</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {['team1','team2'].map(team => (
              <div key={team} className="border rounded-lg p-4">
                <h3 className="font-bold text-lg mb-3">{teamNames[team]}</h3>
                <div className="space-y-2 text-sm">
                  <p>Players: <span className="font-bold">{stats[team].count}</span></p>
                  <p>Total Rating: <span className="font-bold">{stats[team].rating}</span></p>
                  <p>Avg Rating: <span className="font-bold">{stats[team].count > 0 ? (stats[team].rating / stats[team].count).toFixed(1) : 0}</span></p>
                  <p>Goalies: <span className="font-bold">{stats[team].goalies}</span></p>
                  <p>Women: <span className="font-bold">{stats[team].women}</span></p>
                </div>
              </div>
            ))}
            <div className="border rounded-lg p-4">
              <h3 className="font-bold text-lg mb-3">Jerseys</h3>
              <div className="space-y-2 text-sm">
                <p className="text-green-600">✓ Preferred Size: <span className="font-bold">{stats.jerseys.preferredSizeMet}</span></p>
                <p className="text-yellow-600">↑ Sized Up: <span className="font-bold">{stats.jerseys.sizedUp}</span></p>
                <p className="text-red-600">✗ Unmet: <span className="font-bold">{stats.jerseys.unmetNeeds}</span></p>
              </div>
            </div>
          </div>
          {Math.abs(stats.team1.rating - stats.team2.rating) > stats.team1.count * 0.5 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded flex items-start gap-2">
              <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-yellow-800">Teams may be unbalanced. Rating difference: {Math.abs(stats.team1.rating - stats.team2.rating).toFixed(1)}</p>
            </div>
          )}
        </div>

        {/* ── Export ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Export Results</h2>
          <div className="grid grid-cols-3 gap-4">
            <button onClick={downloadForExcel} className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2">
              <FileSpreadsheet size={20} /> Excel
            </button>
            <button onClick={downloadAdminRoster} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center justify-center gap-2">
              <FileText size={20} /> Admin PDF
            </button>
            <button onClick={downloadPublicRoster} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center justify-center gap-2">
              <Users size={20} /> Public PDF
            </button>
          </div>
          <p className="text-sm text-slate-600 mt-3">Download formatted data and upload to Claude to create Excel spreadsheets or PDFs</p>
        </div>

        {/* ── Team Rosters ── */}
        <div className="grid md:grid-cols-2 gap-6">
          {['team1','team2'].map(team => {
            const teamPlayers = players.filter(p => p.team === team);
            const avgRating = teamPlayers.length > 0 ? (teamPlayers.reduce((s, p) => s + p.rating, 0) / teamPlayers.length).toFixed(2) : '0.00';
            return (
              <div key={team} className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-slate-800">{teamNames[team]} Roster</h2>
                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg">
                    <Star className="text-yellow-500" size={18} />
                    <span className="font-bold text-slate-700">{avgRating}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {teamPlayers.map(player => {
                    const groupIndex = friendGroups.findIndex(g => g.includes(player.id));
                    const groupColor = groupIndex >= 0 ? groupColors[groupIndex % groupColors.length] : 'bg-slate-50';
                    const borderClass = groupIndex >= 0 ? 'border-2' : '';
                    const assignedSize = player.assignedSize || 'TBD';
                    const sizedUp = assignedSize !== 'TBD' && assignedSize !== player.preferredSize;
                    const noSize = assignedSize === 'TBD';
                    return (
                      <div key={player.id} className={`p-3 rounded flex justify-between items-center ${groupColor} ${borderClass}`}>
                        <div>
                          <p className="font-medium">{player.name || `Player ${player.id}`}</p>
                          <p className="text-sm text-slate-600">
                            Rating: {player.rating} | Jersey: {player.preferredSize} → <span className={`font-medium ${noSize ? 'text-red-600' : sizedUp ? 'text-yellow-600' : 'text-green-600'}`}>{assignedSize}</span>
                            {player.isGoalie && ' | Goalie'}{player.isIR && ' | IR'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {teamPlayers.length === 0 && <p className="text-slate-400 text-center py-4">No players assigned</p>}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default HockeyTeamBalancerWithUpload;
