/* global XLSX */
import React, { useState, useMemo, useEffect } from 'react';
import { Users, Shirt, Star, AlertCircle, Shuffle, X, Upload, Download, FileSpreadsheet, FileText, Plus, ChevronDown } from 'lucide-react';

const defaultClassData = () => ({
  teamNames: { team1: 'Teal Tanglers', team2: 'Orange Crush' },
  inventory: {
    team1: { M: 0, L: 8, XL: 6, '2XL': 3, 'G2XL': 2 },
    team2: { M: 0, L: 8, XL: 6, '2XL': 3, 'G2XL': 2 }
  },
  sockInventory: {
    team1: { 'L 30"': 15, 'XL 32"': 4 },
    team2: { 'L 30"': 15, 'XL 32"': 4 }
  },
  players: [
    { id: 1, name: '', rating: 5, preferredSize: 'M', isGoalie: false, isIR: false, isWoman: false, team: null }
  ],
  friendGroups: [],
});

const SIZES = ['M', 'L', 'XL', '2XL', 'G2XL'];
const SKATER_SIZES = ['M', 'L', 'XL', '2XL'];
const SOCK_SIZES = ['L 30"', 'XL 32"'];

const HockeyTeamBalancer = () => {
  const sizes = SIZES;
  const skaterSizes = SKATER_SIZES;
  const sockSizes = SOCK_SIZES;

  // ── Seasons / Classes ─────────────────────────────────────────────────────
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
  const seasonClassLabel = `${selectedSeason?.name || ''} — ${selectedClass?.name || ''}`;

  // ── Per-class data store ──────────────────────────────────────────────────
  const [classStore, setClassStore] = useState({ 1: defaultClassData(), 2: defaultClassData() });

  const currentData = classStore[selectedClassId] ?? defaultClassData();
  const updateCurrent = (updater) => {
    setClassStore(prev => ({
      ...prev,
      [selectedClassId]: updater(prev[selectedClassId] ?? defaultClassData())
    }));
  };

  const { teamNames, inventory, sockInventory, players, friendGroups } = currentData;
  const setTeamNames    = (val) => updateCurrent(d => ({ ...d, teamNames: typeof val === 'function' ? val(d.teamNames) : val }));
  const setInventory    = (val) => updateCurrent(d => ({ ...d, inventory: typeof val === 'function' ? val(d.inventory) : val }));
  const setSockInventory= (val) => updateCurrent(d => ({ ...d, sockInventory: typeof val === 'function' ? val(d.sockInventory) : val }));
  const setPlayers      = (val) => updateCurrent(d => ({ ...d, players: typeof val === 'function' ? val(d.players) : val }));
  const setFriendGroups = (val) => updateCurrent(d => ({ ...d, friendGroups: typeof val === 'function' ? val(d.friendGroups) : val }));

  // ── UI state ──────────────────────────────────────────────────────────────
  const [newGroup, setNewGroup] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const [selectedForSwap, setSelectedForSwap] = useState(null);

  useEffect(() => { setNewGroup([]); setUploadError(''); setSelectedForSwap(null); }, [selectedClassId]);

  // ── Season / Class management ─────────────────────────────────────────────
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
      s.id === selectedSeasonId ? { ...s, classes: [...s.classes, { id: classId, name: newClassName.trim() }] } : s
    ));
    setClassStore(prev => ({ ...prev, [classId]: defaultClassData() }));
    setSelectedClassId(classId);
    setNewClassName('');
    setShowNewClass(false);
  };

  // ── CSV Upload (supports [Config] + [Players] sections) ───────────────────
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setUploadError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);

        // ── Parse config section ──────────────────────────────────────────
        let configMap = {};
        let playerLines = [];
        let inConfig = false, inPlayers = false;
        const hasConfig = lines.some(l => l.toLowerCase() === '[config]');

        if (hasConfig) {
          for (const line of lines) {
            const ll = line.toLowerCase();
            if (ll === '[config]') { inConfig = true; inPlayers = false; continue; }
            if (ll === '[players]') { inPlayers = true; inConfig = false; continue; }
            if (inConfig) {
              const [key, ...rest] = line.split(',');
              configMap[key.trim().toLowerCase()] = rest.join(',').trim();
            }
            if (inPlayers) playerLines.push(line);
          }
        } else {
          playerLines = lines;
        }

        // Apply config
        const newTeamNames = { ...teamNames };
        const newInventory = JSON.parse(JSON.stringify(inventory));
        const newSockInventory = JSON.parse(JSON.stringify(sockInventory));

        if (configMap['team1name']) newTeamNames.team1 = configMap['team1name'];
        if (configMap['team2name']) newTeamNames.team2 = configMap['team2name'];

        const invKeys = [
          ['team1_m','team1','M'], ['team1_l','team1','L'], ['team1_xl','team1','XL'],
          ['team1_2xl','team1','2XL'], ['team1_g2xl','team1','G2XL'],
          ['team2_m','team2','M'], ['team2_l','team2','L'], ['team2_xl','team2','XL'],
          ['team2_2xl','team2','2XL'], ['team2_g2xl','team2','G2XL'],
        ];
        invKeys.forEach(([key, team, size]) => {
          if (configMap[key] !== undefined) newInventory[team][size] = parseInt(configMap[key]) || 0;
        });
        const sockKeys = [
          ['team1_sock_l30','team1','L 30"'], ['team1_sock_xl32','team1','XL 32"'],
          ['team2_sock_l30','team2','L 30"'], ['team2_sock_xl32','team2','XL 32"'],
        ];
        sockKeys.forEach(([key, team, size]) => {
          if (configMap[key] !== undefined) newSockInventory[team][size] = parseInt(configMap[key]) || 0;
        });

        // ── Parse players ─────────────────────────────────────────────────
        if (playerLines.length < 2) { setUploadError('No player data found'); return; }
        const header = playerLines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx   = header.findIndex(h => h.includes('name'));
        const ratingIdx = header.findIndex(h => h.includes('rating'));
        const sizeIdx   = header.findIndex(h => h.includes('size') || h.includes('jersey'));
        const goalieIdx = header.findIndex(h => h.includes('goalie'));
        const irIdx     = header.findIndex(h => h.includes('ir') || h.includes('injured'));
        const friendIdx = header.findIndex(h => h.includes('friend') || h.includes('group'));
        const womanIdx  = header.findIndex(h => h.includes('woman') || h.includes('female') || h.includes('gender'));

        if (nameIdx === -1 || sizeIdx === -1) {
          setUploadError('Players section must have at least Name and Preferred Size columns');
          return;
        }

        const newPlayers = [];
        const groupMap = new Map();

        playerLines.slice(1).forEach((line, idx) => {
          const cols = line.split(',').map(c => c.trim());
          const name = cols[nameIdx] || `Player ${idx + 1}`;
          const isGoalie = goalieIdx !== -1 && ['yes','true','1'].includes(cols[goalieIdx]?.toLowerCase());
          const rawRating = ratingIdx !== -1 ? parseFloat(cols[ratingIdx]) : NaN;
          // Goalies don't need a rating — default to 0 so they don't affect team balance
          const rating = isGoalie ? 0 : (isNaN(rawRating) ? 5 : Math.max(0, Math.min(10, rawRating)));
          const preferredSize = cols[sizeIdx]?.toUpperCase() || 'L';
          const isIR    = irIdx !== -1     && ['yes','true','1'].includes(cols[irIdx]?.toLowerCase());
          const isWoman = womanIdx !== -1  && ['yes','true','1','female','f','woman'].includes(cols[womanIdx]?.toLowerCase());
          const friendGroup = friendIdx !== -1 ? cols[friendIdx]?.trim() : '';
          const validSize = sizes.includes(preferredSize) ? preferredSize : 'L';
          const playerId = idx + 1;
          newPlayers.push({ id: playerId, name, rating, preferredSize: validSize, isGoalie, isIR, isWoman, team: null });
          if (friendGroup) {
            if (!groupMap.has(friendGroup)) groupMap.set(friendGroup, []);
            groupMap.get(friendGroup).push(playerId);
          }
        });

        const newFriendGroups = Array.from(groupMap.values()).filter(g => g.length >= 2);

        // Apply everything at once
        updateCurrent(d => ({
          ...d,
          teamNames: newTeamNames,
          inventory: newInventory,
          sockInventory: newSockInventory,
          players: newPlayers,
          friendGroups: newFriendGroups,
        }));

        const skatersMissingRating = newPlayers.filter(p => !p.isGoalie && p.rating === 5 && ratingIdx !== -1 && !playerLines.slice(1)[newPlayers.indexOf(p)]?.split(',')[ratingIdx]?.trim()).length;
        alert(`Loaded ${newPlayers.length} players (${newPlayers.filter(p => p.isGoalie).length} goalies), ${newFriendGroups.length} friend groups${hasConfig ? ', and class config' : ''}!${skatersMissingRating > 0 ? `\n\n⚠️ ${skatersMissingRating} skater(s) have no rating — defaulted to 5.` : ''}`);
      } catch (err) { setUploadError(`Error parsing file: ${err.message}`); }
    };
    reader.onerror = () => setUploadError('Error reading file');
    reader.readAsText(file);
    event.target.value = '';
  };

  const downloadTemplate = () => {
    const template = [
      '[Config]',
      'Team1Name,Teal Tanglers',
      'Team2Name,Orange Crush',
      'Team1_M,2',
      'Team1_L,6',
      'Team1_XL,5',
      'Team1_2XL,4',
      'Team1_G2XL,2',
      'Team2_M,2',
      'Team2_L,6',
      'Team2_XL,5',
      'Team2_2XL,4',
      'Team2_G2XL,2',
      'Team1_Sock_L30,10',
      'Team1_Sock_XL32,10',
      'Team2_Sock_L30,10',
      'Team2_Sock_XL32,10',
      '[Players]',
      'Name,Rating,Preferred Size,Goalie,IR,Woman,Friend Group',
      'John Smith,7,L,No,No,No,A',
      'Jane Doe,6,M,No,No,Yes,A',
      'Bob Wilson,,G2XL,Yes,No,No,',
      'Sarah Lee,8,2XL,No,No,Yes,B',
      'Mike Jones,5,L,No,No,No,B',
      'Tom Brown,4,M,No,Yes,No,',
      'Lisa White,,G2XL,Yes,No,Yes,',
    ].join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;base64,${btoa(unescape(encodeURIComponent(template)))}`;
    a.download = 'bh_class_template.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Player CRUD ───────────────────────────────────────────────────────────
  const addPlayer = () => {
    const newId = Math.max(...players.map(p => p.id), 0) + 1;
    setPlayers(prev => [...prev, { id: newId, name: '', rating: 5, preferredSize: 'M', isGoalie: false, isIR: false, isWoman: false, team: null }]);
  };
  const updatePlayer = (id, field, value) => setPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  const removePlayer = (id) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
    setFriendGroups(prev => prev.map(g => g.filter(pid => pid !== id)).filter(g => g.length >= 2));
  };
  const updateInventory     = (team, size, value) => setInventory(prev => ({ ...prev, [team]: { ...prev[team], [size]: Math.max(0, parseInt(value) || 0) } }));
  const updateSockInventory = (team, size, value) => setSockInventory(prev => ({ ...prev, [team]: { ...prev[team], [size]: Math.max(0, parseInt(value) || 0) } }));

  // ── Friend Groups ─────────────────────────────────────────────────────────
  const addToNewGroup   = (id) => setNewGroup(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const createFriendGroup = () => { if (newGroup.length >= 2) { setFriendGroups(prev => [...prev, [...newGroup]]); setNewGroup([]); } };
  const removeFriendGroup = (idx) => setFriendGroups(prev => prev.filter((_, i) => i !== idx));

  // ── Jersey allocation helper ───────────────────────────────────────────────
  const assignJerseys = (teamPlayers, inv) => {
    const assignGoalie = (p) => { p.assignedSize = inv['G2XL'] > 0 ? (inv['G2XL']--, 'G2XL') : 'TBD'; };
    const assignSkater = (p) => {
      const si = skaterSizes.indexOf(p.preferredSize);
      let done = false;
      for (let i = si; i < skaterSizes.length; i++) {
        if (inv[skaterSizes[i]] > 0) { p.assignedSize = skaterSizes[i]; inv[skaterSizes[i]]--; done = true; break; }
      }
      if (!done) p.assignedSize = 'TBD';
    };
    teamPlayers.filter(p => p.isGoalie && !p.isIR).forEach(assignGoalie);
    teamPlayers.filter(p => !p.isGoalie && !p.isIR).sort((a, b) => skaterSizes.indexOf(a.preferredSize) - skaterSizes.indexOf(b.preferredSize)).forEach(assignSkater);
    teamPlayers.filter(p => p.isGoalie && p.isIR).forEach(assignGoalie);
    teamPlayers.filter(p => !p.isGoalie && p.isIR).sort((a, b) => skaterSizes.indexOf(a.preferredSize) - skaterSizes.indexOf(b.preferredSize)).forEach(assignSkater);
  };

  // ── Balance algorithm (goalies excluded from rating balance, count-aware) ──
  const balanceTeams = () => {
    const unassigned = players.filter(p => !p.team);
    const assignments = {};
    players.forEach(p => { if (p.team) assignments[p.id] = p.team; });
    const unassignedIds = new Set(unassigned.map(p => p.id));

    const skaterRatingOf = (team) => Object.entries(assignments)
      .filter(([, t]) => t === team)
      .reduce((s, [id]) => {
        const p = players.find(p => p.id === parseInt(id));
        return s + (p.isGoalie ? 0 : p.rating);
      }, 0);
    const countOf = (team) => Object.values(assignments).filter(t => t === team).length;
    const womenOf = (team) => Object.entries(assignments)
      .filter(([, t]) => t === team)
      .reduce((s, [id]) => s + (players.find(p => p.id === parseInt(id)).isWoman ? 1 : 0), 0);

    // Decide which team a player/group should go to: prioritize keeping
    // roster SIZE close, then break ties by skater rating.
    const pickTeam = (incomingCount = 1) => {
      const c1 = countOf('team1'), c2 = countOf('team2');
      const sizeDiff = (c1 + incomingCount) - c2;
      const sizeDiffAlt = (c2 + incomingCount) - c1;
      // If adding to team1 would make the gap worse than adding to team2, go to team2 (and vice versa)
      if (Math.abs(sizeDiff) > Math.abs(sizeDiffAlt)) return 'team2';
      if (Math.abs(sizeDiffAlt) > Math.abs(sizeDiff)) return 'team1';
      // Sizes would end up equally close either way — break tie by rating
      return skaterRatingOf('team1') <= skaterRatingOf('team2') ? 'team1' : 'team2';
    };

    // Friend groups (skater ratings only for balance decision, count-aware)
    const groups = friendGroups
      .filter(g => g.every(id => unassignedIds.has(id)))
      .map(g => ({
        playerIds: g,
        rating: g.reduce((s, id) => { const p = players.find(p => p.id === id); return s + (p.isGoalie ? 0 : p.rating); }, 0)
      }))
      .sort((a, b) => b.rating - a.rating);

    groups.forEach(g => {
      const w1 = womenOf('team1'), w2 = womenOf('team2');
      const t = w1 !== w2
        ? (w1 < w2 ? 'team1' : 'team2')
        : pickTeam(g.playerIds.length);
      g.playerIds.forEach(id => { assignments[id] = t; unassignedIds.delete(id); });
    });

    const remaining = unassigned.filter(p => unassignedIds.has(p.id));

    // Goalies: strictly alternate, one per team, not rating-based
    const goalies = remaining.filter(p => p.isGoalie);
    goalies.forEach((g, i) => { assignments[g.id] = i % 2 === 0 ? 'team1' : 'team2'; });

    // Women skaters — alternate by rating, but respect count balance
    const women = remaining.filter(p => !p.isGoalie && p.isWoman).sort((a, b) => b.rating - a.rating);
    women.forEach((w) => { assignments[w.id] = pickTeam(1); });

    // Men skaters — count-aware, rating as tiebreaker
    const men = remaining.filter(p => !p.isGoalie && !p.isWoman).sort((a, b) => b.rating - a.rating);
    men.forEach(p => { assignments[p.id] = pickTeam(1); });

    // Jersey allocation
    const t1Inv = { ...inventory.team1 };
    const t2Inv = { ...inventory.team2 };
    const t1p = players.map(p => ({ ...p, team: assignments[p.id] || p.team })).filter(p => p.team === 'team1');
    const t2p = players.map(p => ({ ...p, team: assignments[p.id] || p.team })).filter(p => p.team === 'team2');
    assignJerseys(t1p, t1Inv);
    assignJerseys(t2p, t2Inv);

    setPlayers(prev => prev.map(p => {
      const team = assignments[p.id] || p.team || null;
      const tp = team === 'team1' ? t1p.find(x => x.id === p.id) : team === 'team2' ? t2p.find(x => x.id === p.id) : null;
      return { ...p, team, assignedSize: tp ? tp.assignedSize : undefined };
    }));
  };

  const clearTeams = () => setPlayers(prev => prev.map(p => ({ ...p, team: null, assignedSize: undefined })));

  // ── Jersey usage / remaining (for swap UI) ────────────────────────────────
  const jerseyUsage = useMemo(() => {
    const usage = { team1: {}, team2: {} };
    sizes.forEach(s => { usage.team1[s] = 0; usage.team2[s] = 0; });
    players.forEach(p => {
      if (p.team && p.assignedSize && p.assignedSize !== 'TBD')
        usage[p.team][p.assignedSize] = (usage[p.team][p.assignedSize] || 0) + 1;
    });
    return usage;
  }, [players, sizes]);

  const jerseyRemaining = useMemo(() => ({
    team1: Object.fromEntries(sizes.map(s => [s, inventory.team1[s] - (jerseyUsage.team1[s] || 0)])),
    team2: Object.fromEntries(sizes.map(s => [s, inventory.team2[s] - (jerseyUsage.team2[s] || 0)])),
  }), [inventory, jerseyUsage, sizes]);

  // ── Re-run jersey allocation for a single team using CURRENT assignedSize
  // as a "soft preference" first (so players keep their jersey if it's still
  // available), then fill gaps using normal preferred-size logic. This fixes
  // players getting stuck on TBD after inventory frees up from other moves.
  const reallocateTeamJerseys = (teamPlayers, inv) => {
    const invCopy = { ...inv };
    const result = teamPlayers.map(p => ({ ...p }));

    // Pass 1: keep players in their current assigned size if it's not TBD
    // and still available (locks in existing happy assignments first)
    const locked = new Set();
    result.forEach(p => {
      if (p.assignedSize && p.assignedSize !== 'TBD' && invCopy[p.assignedSize] > 0) {
        invCopy[p.assignedSize]--;
        locked.add(p.id);
      }
    });

    // Pass 2: reassign everyone NOT locked using the normal allocation order
    const unlocked = result.filter(p => !locked.has(p.id));
    const assignGoalie = (p) => { p.assignedSize = invCopy['G2XL'] > 0 ? (invCopy['G2XL']--, 'G2XL') : 'TBD'; };
    const assignSkater = (p) => {
      const si = skaterSizes.indexOf(p.preferredSize);
      let done = false;
      for (let i = si; i < skaterSizes.length; i++) {
        if (invCopy[skaterSizes[i]] > 0) { p.assignedSize = skaterSizes[i]; invCopy[skaterSizes[i]]--; done = true; break; }
      }
      if (!done) p.assignedSize = 'TBD';
    };
    unlocked.filter(p => p.isGoalie && !p.isIR).forEach(assignGoalie);
    unlocked.filter(p => !p.isGoalie && !p.isIR).sort((a, b) => skaterSizes.indexOf(a.preferredSize) - skaterSizes.indexOf(b.preferredSize)).forEach(assignSkater);
    unlocked.filter(p => p.isGoalie && p.isIR).forEach(assignGoalie);
    unlocked.filter(p => !p.isGoalie && p.isIR).sort((a, b) => skaterSizes.indexOf(a.preferredSize) - skaterSizes.indexOf(b.preferredSize)).forEach(assignSkater);

    return result;
  };

  // ── Swap logic (full team-level jersey re-allocation, nobody stuck on TBD) ─
  const handlePlayerClick = (clickedId) => {
    if (!selectedForSwap) { setSelectedForSwap(clickedId); return; }
    if (selectedForSwap === clickedId) { setSelectedForSwap(null); return; }
    const a = players.find(p => p.id === selectedForSwap);
    const b = players.find(p => p.id === clickedId);
    if (!a || !b) { setSelectedForSwap(null); return; }

    const aNewTeam = b.team, bNewTeam = a.team;

    // Build the post-swap player list, then reallocate jerseys per team from scratch
    const swapped = players.map(p => {
      if (p.id === a.id) return { ...p, team: aNewTeam };
      if (p.id === b.id) return { ...p, team: bNewTeam };
      return p;
    });

    const t1Players = reallocateTeamJerseys(swapped.filter(p => p.team === 'team1'), inventory.team1);
    const t2Players = reallocateTeamJerseys(swapped.filter(p => p.team === 'team2'), inventory.team2);

    setPlayers(prev => prev.map(p => {
      const tp = t1Players.find(x => x.id === p.id) || t2Players.find(x => x.id === p.id);
      return tp ? { ...p, team: tp.team, assignedSize: tp.assignedSize } : p;
    }));
    setSelectedForSwap(null);
  };

  // ── One-way move (no swap-back required) ───────────────────────────────────
  const movePlayerToTeam = (playerId, newTeam) => {
    const moved = players.map(p => p.id === playerId ? { ...p, team: newTeam } : p);
    const t1Players = reallocateTeamJerseys(moved.filter(p => p.team === 'team1'), inventory.team1);
    const t2Players = reallocateTeamJerseys(moved.filter(p => p.team === 'team2'), inventory.team2);
    setPlayers(prev => prev.map(p => {
      const tp = t1Players.find(x => x.id === p.id) || t2Players.find(x => x.id === p.id);
      return tp ? { ...p, team: tp.team, assignedSize: tp.assignedSize } : p;
    }));
    setSelectedForSwap(null);
  };

  // ── Manual jersey override ──────────────────────────────────────────────────
  const setManualJersey = (playerId, size) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, assignedSize: size } : p));
  };



  // ── Stats (goalies excluded from rating totals) ────────────────────────────
  const stats = useMemo(() => {
    const t1 = players.filter(p => p.team === 'team1');
    const t2 = players.filter(p => p.team === 'team2');
    const calc = arr => ({
      count: arr.length,
      skaterRating: arr.filter(p => !p.isGoalie).reduce((s, p) => s + p.rating, 0),
      skaterCount: arr.filter(p => !p.isGoalie).length,
      goalies: arr.filter(p => p.isGoalie).length,
      ir: arr.filter(p => p.isIR).length,
      women: arr.filter(p => p.isWoman).length,
    });
    let preferredSizeMet = 0, sizedUp = 0, unmetNeeds = 0;
    [...t1, ...t2].forEach(p => {
      if (p.assignedSize === p.preferredSize) preferredSizeMet++;
      else if (p.assignedSize && p.assignedSize !== 'TBD') sizedUp++;
      else unmetNeeds++;
    });
    return { team1: calc(t1), team2: calc(t2), jerseys: { preferredSizeMet, sizedUp, unmetNeeds } };
  }, [players]);

  // ── Excel export ──────────────────────────────────────────────────────────
  const downloadForExcel = () => {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded yet. Please try again.'); return; }
    const t1 = players.filter(p => p.team === 'team1');
    const t2 = players.filter(p => p.team === 'team2');
    const allPlayers = [...t1, ...t2];
    if (allPlayers.length === 0) { alert('Balance teams first.'); return; }

    const TEAL='1A7A6E', ORANGE='D4520A', DARK='1E293B', LIGHT='F1F5F9', WHITE='FFFFFF', RED='DC2626', BORDER='CBD5E1';
    const mkFont = (color=WHITE, sz=11, bold=true) => ({ name:'Arial', bold, color, sz });
    const mkFill = (color) => ({ patternType:'solid', fgColor:{ rgb: color } });
    const mkBorder = () => { const s={style:'thin',color:{rgb:BORDER}}; return {top:s,bottom:s,left:s,right:s}; };
    const ctr = { horizontal:'center', vertical:'center', wrapText:true };
    const lft = { horizontal:'left', vertical:'center' };
    const stl = (ws, addr, s) => { if(!ws[addr]) ws[addr]={t:'s',v:''}; ws[addr].s=s; };

    const wb = XLSX.utils.book_new();
    const t1name = teamNames.team1, t2name = teamNames.team2;
    const firstDataRow = 4, lastDataRow = 3 + allPlayers.length;

    const rosterAOA = [
      [`BH Hockey — ${seasonClassLabel}`],
      ["Change a player's TEAM column to swap them. All summary stats update automatically."],
      ["#","Player Name","Team","Position","Rating","Pref. Size","Assigned Size","IR","Woman","Notes"],
      ...allPlayers.map((p,i) => [
        i+1, p.name||`Player ${p.id}`,
        p.team==='team1'?t1name:t2name,
        p.isGoalie?'Goalie':'Skater',
        p.isGoalie?'—':p.rating,
        p.preferredSize, p.assignedSize||'TBD',
        p.isIR?'Yes':'No', p.isWoman?'Yes':'No', ''
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rosterAOA);
    ws['!cols'] = [{wch:4},{wch:22},{wch:18},{wch:10},{wch:8},{wch:12},{wch:14},{wch:6},{wch:8},{wch:20}];
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}}];
    stl(ws,'A1',{font:mkFont(WHITE,14,true),fill:mkFill(DARK),alignment:ctr});
    stl(ws,'A2',{font:{name:'Arial',color:'64748B',sz:9,italic:true},fill:mkFill(LIGHT),alignment:ctr});
    ['A','B','C','D','E','F','G','H','I','J'].forEach(col => stl(ws,`${col}3`,{font:mkFont(WHITE,11,true),fill:mkFill(DARK),alignment:ctr,border:mkBorder()}));
    allPlayers.forEach((p,i) => {
      const row=i+4, rf=i%2===0?LIGHT:WHITE, tc=p.team==='team1'?TEAL:ORANGE;
      ['A','B','C','D','E','F','G','H','I','J'].forEach((col,ci) => {
        const addr=`${col}${row}`; if(!ws[addr]) ws[addr]={t:'s',v:''};
        let s={font:mkFont(DARK,10,false),alignment:ci===1?lft:ctr,border:mkBorder()};
        if(ci===2){s.font=mkFont(WHITE,10,true);s.fill=mkFill(tc);}
        else if(ci===7&&p.isIR){s.font=mkFont(RED,10,true);s.fill=mkFill('FEF2F2');}
        else if(ci===8&&p.isWoman){s.font=mkFont('7C3AED',10,true);s.fill=mkFill(rf);}
        else{s.fill=mkFill(rf);}
        ws[addr].s=s;
      });
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Roster');

    const cif = (team, xc, xv) => {
      const b=`COUNTIFS(Roster!C${firstDataRow}:C${lastDataRow},"${team}"`;
      return xc?b+`,Roster!${xc}${firstDataRow}:${xc}${lastDataRow},"${xv}")`:b+`)`;
    };
    const sif = (team) => `SUMIFS(Roster!E${firstDataRow}:E${lastDataRow},Roster!C${firstDataRow}:C${lastDataRow},"${team}",Roster!D${firstDataRow}:D${lastDataRow},"Skater")`;

    const summaryAOA = [
      [`Team Summary — ${seasonClassLabel}`],
      ['', t1name, t2name],
      ['Total Players',  {f:cif(t1name)},              {f:cif(t2name)}],
      ['Skater Rating',  {f:sif(t1name)},              {f:sif(t2name)}],
      ['Avg Skater Rtg', {f:'=IFERROR(B4/COUNTIFS(Roster!C'+firstDataRow+':C'+lastDataRow+',"'+t1name+'",Roster!D'+firstDataRow+':D'+lastDataRow+',"Skater"),0)'}, {f:'=IFERROR(C4/COUNTIFS(Roster!C'+firstDataRow+':C'+lastDataRow+',"'+t2name+'",Roster!D'+firstDataRow+':D'+lastDataRow+',"Skater"),0)'}],
      ['Goalies',        {f:cif(t1name,'D','Goalie')}, {f:cif(t2name,'D','Goalie')}],
      ['Women',          {f:cif(t1name,'I','Yes')},    {f:cif(t2name,'I','Yes')}],
      ['IR Players',     {f:cif(t1name,'H','Yes')},    {f:cif(t2name,'H','Yes')}],
      [],
      [{f:`=IF(ABS(B4-C4)>B3*0.5,"⚠️ Teams may be unbalanced — skater rating diff: "&TEXT(ABS(B4-C4),"0.0"),"✅ Teams are balanced")`}],
      [],
      ['Jersey Size Breakdown','',''],
      ['', t1name, t2name],
      ...['M','L','XL','2XL','G2XL'].map(sz => [
        sz,
        {f:`COUNTIFS(Roster!C${firstDataRow}:C${lastDataRow},"${t1name}",Roster!G${firstDataRow}:G${lastDataRow},"${sz}")`},
        {f:`COUNTIFS(Roster!C${firstDataRow}:C${lastDataRow},"${t2name}",Roster!G${firstDataRow}:G${lastDataRow},"${sz}")`},
      ])
    ];
    const ts = XLSX.utils.aoa_to_sheet(summaryAOA);
    ts['!cols']=[{wch:22},{wch:18},{wch:18}];
    ts['!merges']=[{s:{r:0,c:0},e:{r:0,c:2}},{s:{r:9,c:0},e:{r:9,c:2}},{s:{r:11,c:0},e:{r:11,c:2}}];
    stl(ts,'A1',{font:mkFont(WHITE,13,true),fill:mkFill(DARK),alignment:ctr});
    ['A','B','C'].forEach((col,i) => stl(ts,`${col}2`,{font:mkFont(WHITE,11,true),fill:mkFill(i===0?DARK:i===1?TEAL:ORANGE),alignment:ctr,border:mkBorder()}));
    for(let r=3;r<=8;r++){
      stl(ts,`A${r}`,{font:mkFont(DARK,10,true),fill:mkFill(LIGHT),alignment:lft,border:mkBorder()});
      ['B','C'].forEach(col => stl(ts,`${col}${r}`,{font:mkFont(DARK,10,false),fill:mkFill(WHITE),alignment:ctr,border:mkBorder()}));
    }
    stl(ts,'A10',{font:mkFont(DARK,10,true),alignment:ctr,border:mkBorder()});
    stl(ts,'A12',{font:mkFont(WHITE,11,true),fill:mkFill(DARK),alignment:ctr});
    ['B','C'].forEach((col,i) => stl(ts,`${col}13`,{font:mkFont(WHITE,11,true),fill:mkFill(i===0?TEAL:ORANGE),alignment:ctr,border:mkBorder()}));
    for(let r=14;r<=18;r++){
      stl(ts,`A${r}`,{font:mkFont(DARK,10,true),fill:mkFill(LIGHT),alignment:lft,border:mkBorder()});
      ['B','C'].forEach(col => stl(ts,`${col}${r}`,{font:mkFont(DARK,10,false),fill:mkFill(WHITE),alignment:ctr,border:mkBorder()}));
    }
    XLSX.utils.book_append_sheet(wb, ts, 'Team Summary');

    const safe = s => (s||'').replace(/\s+/g,'_');
    XLSX.writeFile(wb, `BH_Roster_${safe(selectedSeason?.name)}_${safe(selectedClass?.name)}.xlsx`, { bookType:'xlsx', type:'binary', cellStyles:true });
  };

  // ── Text exports ──────────────────────────────────────────────────────────
  const downloadAdminRoster = () => {
    const t1=players.filter(p=>p.team==='team1'), t2=players.filter(p=>p.team==='team2');
    let c=`HOCKEY ROSTER - ADMIN\nSeason/Class: ${seasonClassLabel}\nGenerated: ${new Date().toLocaleDateString()}\n\n================\nTEAM 1: ${teamNames.team1.toUpperCase()}\n================\n`;
    t1.forEach(p=>{const gi=friendGroups.findIndex(g=>g.includes(p.id));c+=`\n${p.name||'Unknown'} | ${p.isGoalie?'Goalie':'Skater'}${p.isGoalie?'':` | Rating: ${p.rating}`}\n  Jersey: ${p.preferredSize} → ${p.assignedSize||'TBD'} | Status: ${p.isIR?'IR':'Active'}${p.isWoman?' | W':''}\n  ${gi>=0?`Friend Group ${gi+1}`:'No Group'}\n`;});
    c+=`\nTotal: ${t1.length} | Skater Rating: ${stats.team1.skaterRating} | Avg: ${stats.team1.skaterCount>0?(stats.team1.skaterRating/stats.team1.skaterCount).toFixed(2):0}\n\n================\nTEAM 2: ${teamNames.team2.toUpperCase()}\n================\n`;
    t2.forEach(p=>{const gi=friendGroups.findIndex(g=>g.includes(p.id));c+=`\n${p.name||'Unknown'} | ${p.isGoalie?'Goalie':'Skater'}${p.isGoalie?'':` | Rating: ${p.rating}`}\n  Jersey: ${p.preferredSize} → ${p.assignedSize||'TBD'} | Status: ${p.isIR?'IR':'Active'}${p.isWoman?' | W':''}\n  ${gi>=0?`Friend Group ${gi+1}`:'No Group'}\n`;});
    c+=`\nTotal: ${t2.length} | Skater Rating: ${stats.team2.skaterRating} | Avg: ${stats.team2.skaterCount>0?(stats.team2.skaterRating/stats.team2.skaterCount).toFixed(2):0}\n`;
    const a=document.createElement('a'); a.href=`data:text/plain;base64,${btoa(unescape(encodeURIComponent(c)))}`;
    a.download='hockey_admin_roster.txt'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadPublicRoster = () => {
    const t1=players.filter(p=>p.team==='team1'), t2=players.filter(p=>p.team==='team2');
    let c=`HOCKEY ROSTER\nSeason/Class: ${seasonClassLabel}\nGenerated: ${new Date().toLocaleDateString()}\n\n================\nTEAM 1: ${teamNames.team1.toUpperCase()}\n================\n`;
    t1.forEach(p=>{c+=`${p.name||'Unknown'} — ${p.isGoalie?'Goalie':'Skater'}${p.isIR?' (IR)':''}\n`;});
    c+=`\nTotal: ${t1.length} | Goalies: ${stats.team1.goalies}\n\n================\nTEAM 2: ${teamNames.team2.toUpperCase()}\n================\n`;
    t2.forEach(p=>{c+=`${p.name||'Unknown'} — ${p.isGoalie?'Goalie':'Skater'}${p.isIR?' (IR)':''}\n`;});
    c+=`\nTotal: ${t2.length} | Goalies: ${stats.team2.goalies}\n`;
    const a=document.createElement('a'); a.href=`data:text/plain;base64,${btoa(unescape(encodeURIComponent(c)))}`;
    a.download='hockey_public_roster.txt'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const groupColors = ['bg-blue-100 border-blue-300','bg-green-100 border-green-300','bg-purple-100 border-purple-300','bg-pink-100 border-pink-300','bg-yellow-100 border-yellow-300','bg-indigo-100 border-indigo-300','bg-red-100 border-red-300','bg-orange-100 border-orange-300'];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">🏒 BH Team Balancer</h1>
          <p className="text-slate-600">Balance teams by skill, manage jerseys, and respect friend groups</p>
        </div>

        {/* ── Season / Class Selector ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Season & Class</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-600 mb-1">Season</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select value={selectedSeasonId||''} onChange={e=>{setSelectedSeasonId(Number(e.target.value));setSelectedClassId(null);}} className="w-full appearance-none px-3 py-2 border rounded-lg pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {seasons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-3 text-slate-400 pointer-events-none"/>
                </div>
                <button onClick={()=>setShowNewSeason(!showNewSeason)} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus size={18}/></button>
              </div>
              {showNewSeason&&(<div className="flex gap-2 mt-2">
                <input autoFocus value={newSeasonName} onChange={e=>setNewSeasonName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addSeason()} placeholder="e.g. Winter 2027" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                <button onClick={addSeason} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm">Add</button>
                <button onClick={()=>{setShowNewSeason(false);setNewSeasonName('');}} className="px-3 py-2 bg-slate-200 rounded-lg text-sm">Cancel</button>
              </div>)}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-600 mb-1">Class</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select value={selectedClassId||''} onChange={e=>setSelectedClassId(Number(e.target.value))} disabled={!selectedSeason||selectedSeason.classes.length===0} className="w-full appearance-none px-3 py-2 border rounded-lg pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400">
                    {selectedSeason?.classes.length===0&&<option value="">No classes yet</option>}
                    {selectedSeason?.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-3 text-slate-400 pointer-events-none"/>
                </div>
                <button onClick={()=>setShowNewClass(!showNewClass)} disabled={!selectedSeasonId} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300"><Plus size={18}/></button>
              </div>
              {showNewClass&&(<div className="flex gap-2 mt-2">
                <input autoFocus value={newClassName} onChange={e=>setNewClassName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addClass()} placeholder="e.g. Sunday" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                <button onClick={addClass} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm">Add</button>
                <button onClick={()=>{setShowNewClass(false);setNewClassName('');}} className="px-3 py-2 bg-slate-200 rounded-lg text-sm">Cancel</button>
              </div>)}
            </div>
          </div>
          {selectedSeason&&selectedClass&&<p className="mt-3 text-sm text-slate-500">Currently editing: <span className="font-semibold text-slate-700">{selectedSeason.name} — {selectedClass.name}</span></p>}
        </div>

        {/* ── Team Names ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Team Names</h2>
          <div className="grid grid-cols-2 gap-4">
            {['team1','team2'].map(team=>(
              <div key={team} className="border rounded-lg p-4">
                <label className="block text-xs font-medium text-slate-500 mb-1">{team==='team1'?'Team 1':'Team 2'}</label>
                <input type="text" value={teamNames[team]} onChange={e=>setTeamNames({...teamNames,[team]:e.target.value})} className="w-full text-lg font-semibold text-slate-800 border-0 border-b-2 border-transparent focus:border-blue-500 focus:outline-none bg-transparent pb-1 transition-colors" placeholder="Enter team name"/>
              </div>
            ))}
          </div>
        </div>

        {/* ── Inventory ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><Shirt className="text-blue-600"/> Inventory</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {['team1','team2'].map(team=>(
              <div key={team} className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">{teamNames[team]}</h3>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Jerseys</p>
                <div className="space-y-2 mb-4">
                  {sizes.map(size=>(
                    <div key={size} className="flex items-center gap-2">
                      <label className="w-16 text-sm font-medium">{size}:</label>
                      <input type="number" min="0" value={inventory[team][size]} onChange={e=>updateInventory(team,size,e.target.value)} className="flex-1 px-3 py-1 border rounded"/>
                    </div>
                  ))}
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Socks</p>
                <div className="space-y-2">
                  {sockSizes.map(size=>(
                    <div key={size} className="flex items-center gap-2">
                      <label className="w-16 text-sm font-medium">{size}:</label>
                      <input type="number" min="0" value={sockInventory[team][size]} onChange={e=>updateSockInventory(team,size,e.target.value)} className="flex-1 px-3 py-1 border rounded"/>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CSV Upload ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Import Class CSV</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
              <label className="flex-1 cursor-pointer">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-blue-500 transition text-center">
                  <Upload className="mx-auto mb-2 text-slate-400" size={32}/>
                  <p className="text-sm font-medium text-slate-700">Click to upload CSV</p>
                  <p className="text-xs text-slate-500 mt-1">Loads into: <strong>{selectedSeason?.name} — {selectedClass?.name||'no class selected'}</strong></p>
                </div>
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden"/>
              </label>
              <div className="flex flex-col gap-2 md:w-48">
                <button onClick={downloadTemplate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"><Download size={18}/> Template</button>
                <p className="text-xs text-slate-500 text-center">Includes config + players</p>
              </div>
            </div>
            {uploadError&&(<div className="p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2"><AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20}/><p className="text-sm text-red-800">{uploadError}</p></div>)}
            <div className="text-xs text-slate-500 space-y-1">
              <p><strong>[Config] section:</strong> Team names, jersey counts, sock counts</p>
              <p><strong>[Players] section:</strong> Name, Rating (blank for goalies), Preferred Size, Goalie, IR, Woman, Friend Group</p>
            </div>
          </div>
        </div>

        {/* ── Players ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users className="text-green-600"/> Players ({players.length})</h2>
            <button onClick={addPlayer} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">+ Add Player</button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {players.map(player=>{
              const gi=friendGroups.findIndex(g=>g.includes(player.id));
              return(
                <div key={player.id} className={`flex gap-2 items-center p-2 rounded ${gi>=0?groupColors[gi%groupColors.length]:'bg-white'} ${gi>=0?'border-2':'border'}`}>
                  <input type="text" placeholder="Name" value={player.name} onChange={e=>updatePlayer(player.id,'name',e.target.value)} className="flex-1 px-2 py-1 border rounded"/>
                  <input type="number" min="0" max="10" step="0.5" value={player.isGoalie?'':player.rating} onChange={e=>updatePlayer(player.id,'rating',parseFloat(e.target.value)||0)} disabled={player.isGoalie} placeholder={player.isGoalie?'—':''} className="w-16 px-2 py-1 border rounded disabled:bg-slate-100 disabled:text-slate-400" title={player.isGoalie?'Goalies have no rating':'Rating (0-10)'}/>
                  <select value={player.preferredSize} onChange={e=>updatePlayer(player.id,'preferredSize',e.target.value)} className="px-2 py-1 border rounded">
                    {sizes.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={player.isGoalie} onChange={e=>updatePlayer(player.id,'isGoalie',e.target.checked)}/> G</label>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={player.isIR} onChange={e=>updatePlayer(player.id,'isIR',e.target.checked)}/> IR</label>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={player.isWoman} onChange={e=>updatePlayer(player.id,'isWoman',e.target.checked)}/> W</label>
                  <button onClick={()=>removePlayer(player.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><X size={18}/></button>
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
                {players.map(p=>(
                  <button key={p.id} onClick={()=>addToNewGroup(p.id)} className={`px-3 py-1 rounded text-sm transition ${newGroup.includes(p.id)?'bg-blue-600 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    {p.name||`Player ${p.id}`}
                  </button>
                ))}
              </div>
              <button onClick={createFriendGroup} disabled={newGroup.length<2} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-slate-300 transition">Create Group ({newGroup.length} selected)</button>
            </div>
            {friendGroups.map((group,idx)=>(
              <div key={idx} className="border rounded-lg p-4 bg-slate-50">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium">Group {idx+1}</h3>
                  <button onClick={()=>removeFriendGroup(idx)} className="text-red-600 hover:bg-red-50 p-1 rounded"><X size={18}/></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.map(pid=>{const p=players.find(x=>x.id===pid);return<span key={pid} className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm">{p?.name||`Player ${pid}`}</span>;})}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Balance ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex gap-4">
            <button onClick={balanceTeams} className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold text-lg flex items-center justify-center gap-2"><Shuffle size={24}/> Balance Teams</button>
            <button onClick={clearTeams} className="px-6 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-bold text-lg">Clear Teams</button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Team Statistics</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {['team1','team2'].map(team=>(
              <div key={team} className="border rounded-lg p-4">
                <h3 className="font-bold text-lg mb-3">{teamNames[team]}</h3>
                <div className="space-y-2 text-sm">
                  <p>Players: <span className="font-bold">{stats[team].count}</span></p>
                  <p>Skater Rating: <span className="font-bold">{stats[team].skaterRating}</span></p>
                  <p>Avg Skater Rtg: <span className="font-bold">{stats[team].skaterCount>0?(stats[team].skaterRating/stats[team].skaterCount).toFixed(2):'—'}</span></p>
                  <p>Goalies: <span className="font-bold">{stats[team].goalies}</span></p>
                  <p>Women: <span className="font-bold">{stats[team].women}</span></p>
                  {stats[team].ir>0&&<p className="text-red-600">IR: <span className="font-bold">{stats[team].ir}</span></p>}
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
          {Math.abs(stats.team1.skaterRating-stats.team2.skaterRating)>Math.max(stats.team1.skaterCount,1)*0.5&&(
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded flex items-start gap-2">
              <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20}/>
              <p className="text-sm text-yellow-800">Teams may be unbalanced. Skater rating difference: {Math.abs(stats.team1.skaterRating-stats.team2.skaterRating).toFixed(1)}</p>
            </div>
          )}
        </div>

        {/* ── Export ── */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Export Results</h2>
          <div className="grid grid-cols-3 gap-4">
            <button onClick={downloadForExcel} className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2"><FileSpreadsheet size={20}/> Excel</button>
            <button onClick={downloadAdminRoster} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center justify-center gap-2"><FileText size={20}/> Admin PDF</button>
            <button onClick={downloadPublicRoster} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center justify-center gap-2"><Users size={20}/> Public PDF</button>
          </div>
          <p className="text-sm text-slate-600 mt-3">Excel downloads a live file — change the Team column to swap players and stats auto-update.</p>
        </div>

        {/* ── Swap UI ── */}
        {players.some(p=>p.team)&&(
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-slate-800">Swap Players</h2>
              {selectedForSwap
                ? <div className="flex items-center gap-2">
                    <span className="text-sm text-blue-700 font-medium bg-blue-50 px-3 py-1 rounded-full">
                      Selected: {players.find(p=>p.id===selectedForSwap)?.name||'Player'} — click who to swap with
                    </span>
                    <button onClick={()=>setSelectedForSwap(null)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                  </div>
                : <p className="text-sm text-slate-500">Click a player to swap, use → to move solo, or pick a jersey size directly</p>
              }
            </div>

            {/* Jersey remaining */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {['team1','team2'].map(team=>(
                <div key={team} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{teamNames[team]} — Jerseys Remaining</p>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map(size=>{
                      const rem=jerseyRemaining[team][size];
                      return(
                        <span key={size} className={`px-2 py-1 rounded text-xs font-bold border ${rem===0?'bg-red-50 text-red-600 border-red-200':rem<=1?'bg-yellow-50 text-yellow-700 border-yellow-200':'bg-green-50 text-green-700 border-green-200'}`}>
                          {size}: {rem}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {['team1','team2'].map(team=>{
                const tp=players.filter(p=>p.team===team);
                const avg=tp.filter(p=>!p.isGoalie).length>0?(tp.filter(p=>!p.isGoalie).reduce((s,p)=>s+p.rating,0)/tp.filter(p=>!p.isGoalie).length).toFixed(2):'—';
                return(
                  <div key={team} className={`border-2 rounded-lg overflow-hidden ${team==='team1'?'border-teal-400':'border-orange-400'}`}>
                    <div className={`${team==='team1'?'bg-teal-600':'bg-orange-600'} px-4 py-3 flex items-center justify-between`}>
                      <h3 className="font-bold text-white text-lg">{teamNames[team]}</h3>
                      <div className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-lg">
                        <Star className="text-yellow-300" size={16}/>
                        <span className="font-bold text-white text-sm">{avg} avg</span>
                        <span className="text-white/70 text-sm">· {tp.length} players</span>
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      {tp.map(player=>{
                        const gi=friendGroups.findIndex(g=>g.includes(player.id));
                        const assigned=player.assignedSize||'TBD';
                        const sizedUp=assigned!=='TBD'&&assigned!==player.preferredSize;
                        const noSize=assigned==='TBD';
                        const isSelected=selectedForSwap===player.id;
                        const otherTeam = team==='team1' ? 'team2' : 'team1';
                        const jerseyOptions = player.isGoalie ? ['G2XL'] : skaterSizes;
                        return(
                          <div key={player.id} onClick={()=>handlePlayerClick(player.id)}
                            className={`p-3 rounded-lg cursor-pointer transition-all select-none
                              ${isSelected?'ring-2 ring-blue-500 bg-blue-50 shadow-md scale-[1.02]'
                                :selectedForSwap?'hover:ring-2 hover:ring-blue-300 hover:bg-blue-50'
                                :gi>=0?groupColors[gi%groupColors.length]:'bg-slate-50 hover:bg-slate-100'}
                              ${gi>=0&&!isSelected?'border-2':'border border-slate-200'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800">{player.name||`Player ${player.id}`}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {player.isGoalie?'Goalie':`⭐ ${player.rating}`}
                                  {player.isWoman&&' · W'}
                                  {player.isIR&&<span className="text-red-500"> · IR</span>}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={assigned}
                                  onClick={e=>e.stopPropagation()}
                                  onChange={e=>{ e.stopPropagation(); setManualJersey(player.id, e.target.value); }}
                                  className={`text-sm font-bold px-1.5 py-1 rounded border-0 cursor-pointer ${noSize?'bg-red-100 text-red-600':sizedUp?'bg-yellow-100 text-yellow-700':'bg-green-100 text-green-700'}`}
                                  title="Manually set jersey size"
                                >
                                  <option value="TBD">TBD</option>
                                  {jerseyOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button
                                  onClick={e=>{ e.stopPropagation(); movePlayerToTeam(player.id, otherTeam); }}
                                  className="p-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-600 transition"
                                  title={`Move to ${teamNames[otherTeam]} (no swap-back needed)`}
                                >
                                  →
                                </button>
                              </div>
                            </div>
                            {sizedUp&&<p className="text-xs text-slate-400 mt-1 text-right">wanted {player.preferredSize}</p>}
                            {noSize&&<p className="text-xs text-red-400 mt-1 text-right">no jersey</p>}
                          </div>
                        );
                      })}
                      {tp.length===0&&<p className="text-slate-400 text-center py-6">No players assigned</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default HockeyTeamBalancer;
