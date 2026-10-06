/* global XLSX */
import React, { useState, useMemo, useEffect } from 'react';
import { Users, Shirt, Star, AlertCircle, Shuffle, X, Upload, Download, FileSpreadsheet, FileText, Plus, ChevronDown, Archive, Trash2, LogOut } from 'lucide-react';
import { supabase } from './supabaseClient';
import { buildBalancedTeams, allocateJerseys, allocateSocks } from './teamBalancer';

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
    { id: crypto.randomUUID(), name: '', rating: 5, preferredSize: 'M', isGoalie: false, isWoman: false, team: null }
  ],
  friendGroups: [],
  teamColors: { team1: '#0f766e', team2: '#ea580c' },
});

const SIZES = ['M', 'L', 'XL', '2XL', 'G2XL'];
const SKATER_SIZES = ['M', 'L', 'XL', '2XL'];
const SOCK_SIZES = ['L 30"', 'XL 32"'];

const HockeyTeamBalancer = () => {
  const sizes = SIZES;
  const skaterSizes = SKATER_SIZES;
  const sockSizes = SOCK_SIZES;

  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [classStore, setClassStore] = useState({});
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [showNewClass, setShowNewClass] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newGroup, setNewGroup] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const [selectedForSwap, setSelectedForSwap] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [seasonBusy, setSeasonBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [hasAccess, setHasAccess] = useState(null);

  const selectedSeason = seasons.find(s => s.id === selectedSeasonId);
  const selectedClass = selectedSeason?.classes?.find(x => x.id === selectedClassId);
  const seasonClassLabel = [selectedSeason?.name, selectedClass?.name].filter(Boolean).join(' — ');

  const currentData = classStore[selectedClassId] ?? defaultClassData();
  const updateCurrent = (updater) => {
    if (!selectedClassId) return;
    setClassStore(prev => ({ ...prev, [selectedClassId]: updater(prev[selectedClassId] ?? defaultClassData()) }));
  };

  const { teamNames, inventory, sockInventory, players, friendGroups, teamColors = defaultClassData().teamColors } = currentData;
  const setTeamNames = val => updateCurrent(d => ({ ...d, teamNames: typeof val === 'function' ? val(d.teamNames) : val }));
  const setInventory = val => updateCurrent(d => ({ ...d, inventory: typeof val === 'function' ? val(d.inventory) : val }));
  const setSockInventory = val => updateCurrent(d => ({ ...d, sockInventory: typeof val === 'function' ? val(d.sockInventory) : val }));
  const setPlayers = val => updateCurrent(d => ({ ...d, players: typeof val === 'function' ? val(d.players) : val }));
  const setFriendGroups = val => updateCurrent(d => ({ ...d, friendGroups: typeof val === 'function' ? val(d.friendGroups) : val }));
  const setTeamColors = val => updateCurrent(d => ({ ...d, teamColors: typeof val === 'function' ? val(d.teamColors || defaultClassData().teamColors) : val }));

  useEffect(() => { setNewGroup([]); setUploadError(''); setSelectedForSwap(null); }, [selectedClassId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session ?? null); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null); setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (e) => {
    e.preventDefault();
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    if (error) setLoginError(error.message);
  };

  const loadClass = async (classId, seasonList = seasons) => {
    if (!classId) return;
    setRosterLoaded(false);
    setSaveState('Loading…');
    const klass = seasonList.flatMap(s => s.classes || []).find(x => x.id === classId);
    if (!klass) return;

    const [{ data: dbPlayers, error: pe }, { data: assignments, error: ae }] = await Promise.all([
      supabase.from('bh_players').select('*').eq('class_id', classId).order('created_at'),
      supabase.from('bh_team_assignments').select('*').eq('class_id', classId).order('sort_order')
    ]);
    if (pe || ae) {
      setSaveState('Load failed');
      setLoginError((pe || ae).message);
      return;
    }

    const assignmentMap = new Map((assignments || []).map(a => [a.player_id, a]));
    const groupMap = new Map();
    const mappedPlayers = (dbPlayers || []).map(p => {
      const a = assignmentMap.get(p.id);
      if (p.friend_group) {
        if (!groupMap.has(p.friend_group)) groupMap.set(p.friend_group, []);
        groupMap.get(p.friend_group).push(p.id);
      }
      return {
        id: p.id,
        name: p.name,
        rating: p.goalie ? 0 : Number(p.rating ?? 5),
        preferredSize: p.preferred_size || 'L',
        isGoalie: p.goalie,
        isWoman: p.woman,
        team: a?.team === 1 ? 'team1' : a?.team === 2 ? 'team2' : null,
        assignedSize: a?.assigned_size || undefined,
        assignedSockSize: a?.assigned_sock_size || undefined,
      };
    });

    setClassStore(prev => ({ ...prev, [classId]: {
      ...defaultClassData(),
      teamNames: { team1: klass.team1_name, team2: klass.team2_name },
      teamColors: { team1: klass.team1_color, team2: klass.team2_color },
      inventory: klass.inventory?.jerseys || defaultClassData().inventory,
      sockInventory: klass.inventory?.socks || defaultClassData().sockInventory,
      players: mappedPlayers,
      friendGroups: Array.from(groupMap.values()).filter(g => g.length >= 2),
    }}));
    setRosterLoaded(true);
    setSaveState('Saved');
  };

  const loadSeasons = async (preferredSeasonId = null, preferredClassId = null) => {
    if (!session?.user) return;
    const [{ data: seasonRows, error: se }, { data: classRows, error: ce }, { data: accessRows, error: accessError }] = await Promise.all([
      supabase.from('bh_seasons').select('*').order('created_at', { ascending: false }),
      supabase.from('bh_classes').select('*').order('sort_order').order('created_at'),
      supabase.from('bh_staff_access').select('user_id,active').eq('user_id', session.user.id)
    ]);
    if (accessError || !accessRows?.[0]?.active) {
      setHasAccess(false);
      setLoginError('This account is not authorized for BH Team Sorter.');
      return;
    }
    setHasAccess(true);
    if (se || ce) { setLoginError((se || ce).message); return; }

    const mapped = (seasonRows || []).map(s => ({ ...s, classes: (classRows || []).filter(c => c.season_id === s.id) }));
    setSeasons(mapped);
    const season = mapped.find(s => s.id === preferredSeasonId) || mapped.find(s => s.status === 'active') || mapped[0] || null;
    const klass = season?.classes?.find(x => x.id === preferredClassId) || season?.classes?.[0] || null;
    setSelectedSeasonId(season?.id || null);
    setSelectedClassId(klass?.id || null);
    if (klass) await loadClass(klass.id, mapped);
    else { setRosterLoaded(false); setSaveState(''); }
  };

  useEffect(() => { if (session?.user) loadSeasons(); }, [session?.user?.id]);

  const addSeason = async () => {
    if (!newSeasonName.trim() || !session?.user) return;
    setSeasonBusy(true);
    const { data, error } = await supabase.from('bh_seasons').insert({
      name: newSeasonName.trim(), created_by: session.user.id
    }).select().single();
    setSeasonBusy(false);
    if (error) return alert(error.message);
    setNewSeasonName(''); setShowNewSeason(false);
    await loadSeasons(data.id, null);
  };

  const selectSeason = async (id) => {
    const season = seasons.find(s => s.id === id);
    setSelectedSeasonId(id);
    const klass = season?.classes?.[0] || null;
    setSelectedClassId(klass?.id || null);
    if (klass) await loadClass(klass.id);
    else { setRosterLoaded(false); setSaveState(''); }
  };

  const selectClass = async (id) => {
    setSelectedClassId(id);
    await loadClass(id);
  };

  const addClass = async () => {
    if (!newClassName.trim() || !selectedSeasonId || !session?.user) return;
    const defaults = defaultClassData();
    const { data, error } = await supabase.from('bh_classes').insert({
      season_id: selectedSeasonId,
      name: newClassName.trim(),
      team1_name: defaults.teamNames.team1,
      team2_name: defaults.teamNames.team2,
      team1_color: defaults.teamColors.team1,
      team2_color: defaults.teamColors.team2,
      inventory: { jerseys: defaults.inventory, socks: defaults.sockInventory },
      created_by: session.user.id
    }).select().single();
    if (error) return alert(error.message);
    setNewClassName(''); setShowNewClass(false);
    await loadSeasons(selectedSeasonId, data.id);
  };

  const setSeasonStatus = async (status) => {
    if (!selectedSeasonId) return;
    const { error } = await supabase.from('bh_seasons').update({ status, updated_at: new Date().toISOString() }).eq('id', selectedSeasonId);
    if (error) return alert(error.message);
    await loadSeasons(selectedSeasonId, selectedClassId);
  };

  const deleteSeason = async () => {
    if (!selectedSeason) return;
    if (!window.confirm(`Permanently delete "${selectedSeason.name}" and all its classes/rosters? This cannot be undone.`)) return;
    const { error } = await supabase.from('bh_seasons').delete().eq('id', selectedSeason.id);
    if (error) return alert(error.message);
    await loadSeasons();
  };

  const deleteClass = async () => {
    if (!selectedClass) return;
    if (!window.confirm(`Permanently delete class "${selectedClass.name}" and its roster? This cannot be undone.`)) return;
    const { error } = await supabase.from('bh_classes').delete().eq('id', selectedClass.id);
    if (error) return alert(error.message);
    await loadSeasons(selectedSeasonId, null);
  };

  useEffect(() => {
    if (!session?.user || !selectedClassId || !rosterLoaded) return;
    const timer = setTimeout(async () => {
      setSaveState('Saving…');
      const groupByPlayer = {};
      friendGroups.forEach((g, i) => g.forEach(id => { groupByPlayer[id] = `G${i + 1}`; }));
      const rosterPayload = players
        .filter(p => p.name?.trim())
        .map((p, i) => ({
          ...p,
          id: String(p.id),
          friendGroup: groupByPlayer[p.id] || null,
          sortOrder: i + 1
        }));
      const [{ error: classError }, { error: rosterError }] = await Promise.all([
        supabase.from('bh_classes').update({
          team1_name: teamNames.team1,
          team2_name: teamNames.team2,
          team1_color: teamColors.team1,
          team2_color: teamColors.team2,
          inventory: { jerseys: inventory, socks: sockInventory },
          updated_at: new Date().toISOString()
        }).eq('id', selectedClassId),
        supabase.rpc('bh_save_class_roster', { p_class_id: selectedClassId, p_players: rosterPayload })
      ]);
      setSaveState(classError || rosterError ? 'Save failed' : 'Saved');
      if (classError || rosterError) console.error(classError || rosterError);
    }, 650);
    return () => clearTimeout(timer);
  }, [session?.user?.id, selectedClassId, rosterLoaded, teamNames, teamColors, inventory, sockInventory, players, friendGroups]);

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
          const isWoman = womanIdx !== -1  && ['yes','true','1','female','f','woman'].includes(cols[womanIdx]?.toLowerCase());
          const friendGroup = friendIdx !== -1 ? cols[friendIdx]?.trim() : '';
          const validSize = sizes.includes(preferredSize) ? preferredSize : 'L';
          const playerId = crypto.randomUUID();
          newPlayers.push({ id: playerId, name, rating, preferredSize: validSize, isGoalie, isWoman, team: null });
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
      'Name,Rating,Preferred Size,Goalie,Woman,Friend Group',
      'John Smith,7,L,No,No,A',
      'Jane Doe,6,M,No,Yes,A',
      'Bob Wilson,,G2XL,Yes,No,',
      'Sarah Lee,8,2XL,No,Yes,B',
      'Mike Jones,5,L,No,No,B',
      'Tom Brown,4,M,No,No,',
      'Lisa White,,G2XL,Yes,Yes,',
    ].join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;base64,${btoa(unescape(encodeURIComponent(template)))}`;
    a.download = 'bh_class_template.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Player CRUD ───────────────────────────────────────────────────────────
  const addPlayer = () => {
    const newId = crypto.randomUUID();
    setPlayers(prev => [...prev, { id: newId, name: '', rating: 5, preferredSize: 'M', isGoalie: false, isWoman: false, team: null }]);
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

  // ── Constraint-aware balance: friends → goalies → women → jerseys → skill; roster size is hard ──
  const balanceTeams = () => {
    try {
      const validPlayers = players.filter(p => p.name?.trim());
      const { team1, team2 } = buildBalancedTeams(validPlayers, friendGroups, inventory);
      const withJerseys1 = allocateJerseys(team1.map(p=>({...p,team:'team1'})), inventory.team1);
      const withJerseys2 = allocateJerseys(team2.map(p=>({...p,team:'team2'})), inventory.team2);
      const withSocks1 = allocateSocks(withJerseys1, sockInventory.team1);
      const withSocks2 = allocateSocks(withJerseys2, sockInventory.team2);
      const assigned = new Map([...withSocks1,...withSocks2].map(p=>[p.id,p]));
      setPlayers(prev => prev.map(p => assigned.has(p.id) ? { ...p, ...assigned.get(p.id) } : p));
      setSelectedForSwap(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const clearTeams = () => setPlayers(prev => prev.map(p => ({ ...p, team: null, assignedSize: undefined, assignedSockSize: undefined })));

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

  const reallocateTeamGear = (teamPlayers, team) => {
    const jerseys = allocateJerseys(teamPlayers, inventory[team]);
    return allocateSocks(jerseys, sockInventory[team]);
  };

  // ── Swap logic: manual changes stay manual; only gear is recalculated ──
  const handlePlayerClick = (clickedId) => {
    if (!selectedForSwap) { setSelectedForSwap(clickedId); return; }
    if (selectedForSwap === clickedId) { setSelectedForSwap(null); return; }
    const a = players.find(p => p.id === selectedForSwap);
    const b = players.find(p => p.id === clickedId);
    if (!a || !b) { setSelectedForSwap(null); return; }
    const swapped = players.map(p => p.id === a.id ? { ...p, team: b.team } : p.id === b.id ? { ...p, team: a.team } : p);
    const t1Players = reallocateTeamGear(swapped.filter(p => p.team === 'team1'), 'team1');
    const t2Players = reallocateTeamGear(swapped.filter(p => p.team === 'team2'), 'team2');
    const byId = new Map([...t1Players,...t2Players].map(p=>[p.id,p]));
    setPlayers(prev => prev.map(p => byId.has(p.id) ? { ...p, ...byId.get(p.id) } : p));
    setSelectedForSwap(null);
  };

  const movePlayerToTeam = (playerId, newTeam) => {
    const moved = players.map(p => p.id === playerId ? { ...p, team: newTeam } : p);
    const t1Players = reallocateTeamGear(moved.filter(p => p.team === 'team1'), 'team1');
    const t2Players = reallocateTeamGear(moved.filter(p => p.team === 'team2'), 'team2');
    const byId = new Map([...t1Players,...t2Players].map(p=>[p.id,p]));
    setPlayers(prev => prev.map(p => byId.has(p.id) ? { ...p, ...byId.get(p.id) } : p));
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
      ["#","Player Name","Team","Position","Rating","Pref. Size","Assigned Size","Socks","Woman","Notes"],
      ...allPlayers.map((p,i) => [
        i+1, p.name||`Player ${p.id}`,
        p.team==='team1'?t1name:t2name,
        p.isGoalie?'Goalie':'Skater',
        p.isGoalie?'—':p.rating,
        p.preferredSize, p.assignedSize||'TBD',
        p.assignedSockSize||'TBD', p.isWoman?'Yes':'No', ''
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
    for(let r=3;r<=7;r++){
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
    t1.forEach(p=>{const gi=friendGroups.findIndex(g=>g.includes(p.id));c+=`\n${p.name||'Unknown'} | ${p.isGoalie?'Goalie':'Skater'}${p.isGoalie?'':` | Rating: ${p.rating}`}\n  Jersey: ${p.preferredSize} → ${p.assignedSize||'TBD'}${p.isWoman?' | W':''}\n  ${gi>=0?`Friend Group ${gi+1}`:'No Group'}\n`;});
    c+=`\nTotal: ${t1.length} | Skater Rating: ${stats.team1.skaterRating} | Avg: ${stats.team1.skaterCount>0?(stats.team1.skaterRating/stats.team1.skaterCount).toFixed(2):0}\n\n================\nTEAM 2: ${teamNames.team2.toUpperCase()}\n================\n`;
    t2.forEach(p=>{const gi=friendGroups.findIndex(g=>g.includes(p.id));c+=`\n${p.name||'Unknown'} | ${p.isGoalie?'Goalie':'Skater'}${p.isGoalie?'':` | Rating: ${p.rating}`}\n  Jersey: ${p.preferredSize} → ${p.assignedSize||'TBD'}${p.isWoman?' | W':''}\n  ${gi>=0?`Friend Group ${gi+1}`:'No Group'}\n`;});
    c+=`\nTotal: ${t2.length} | Skater Rating: ${stats.team2.skaterRating} | Avg: ${stats.team2.skaterCount>0?(stats.team2.skaterRating/stats.team2.skaterCount).toFixed(2):0}\n`;
    const a=document.createElement('a'); a.href=`data:text/plain;base64,${btoa(unescape(encodeURIComponent(c)))}`;
    a.download='hockey_admin_roster.txt'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadPublicRoster = () => {
    const t1=players.filter(p=>p.team==='team1'), t2=players.filter(p=>p.team==='team2');
    let c=`HOCKEY ROSTER\nSeason/Class: ${seasonClassLabel}\nGenerated: ${new Date().toLocaleDateString()}\n\n================\nTEAM 1: ${teamNames.team1.toUpperCase()}\n================\n`;
    t1.forEach(p=>{c+=`${p.name||'Unknown'} — ${p.isGoalie?'Goalie':'Skater'}\n`;});
    c+=`\nTotal: ${t1.length} | Goalies: ${stats.team1.goalies}\n\n================\nTEAM 2: ${teamNames.team2.toUpperCase()}\n================\n`;
    t2.forEach(p=>{c+=`${p.name||'Unknown'} — ${p.isGoalie?'Goalie':'Skater'}\n`;});
    c+=`\nTotal: ${t2.length} | Goalies: ${stats.team2.goalies}\n`;
    const a=document.createElement('a'); a.href=`data:text/plain;base64,${btoa(unescape(encodeURIComponent(c)))}`;
    a.download='hockey_public_roster.txt'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const groupColors = ['bg-blue-100 border-blue-300','bg-green-100 border-green-300','bg-purple-100 border-purple-300','bg-pink-100 border-pink-300','bg-yellow-100 border-yellow-300','bg-indigo-100 border-indigo-300','bg-red-100 border-red-300','bg-orange-100 border-orange-300'];

  // ─────────────────────────────────────────────────────────────────────────
  if (authLoading) return <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-600">Loading…</div>;
  if (!session) return (
    <div className="min-h-screen grid place-items-center p-4 bg-[#0b0d12]">
      <form onSubmit={signIn} className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 space-y-5 border border-white/10">
        <div className="flex items-center gap-4 pb-2"><div className="soc-logo-mark">SOC</div><div><p className="text-xs font-extrabold tracking-[.18em] text-[#c8102e] uppercase">Shinny of Champions</p><h1 className="text-2xl font-black text-slate-900 tracking-tight">BH Team Sorter</h1><p className="text-sm text-slate-500 mt-1">Staff operations</p></div></div>
        <input type="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="Email" className="w-full soc-input px-4 py-3"/>
        <input type="password" required value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Password" className="w-full border rounded-lg px-3 py-2"/>
        {loginError && <p className="text-sm text-red-600">{loginError}</p>}
        <button type="submit" className="w-full soc-btn-primary py-3 font-extrabold">Sign in</button>
      </form>
    </div>
  );
  if (hasAccess === null) return <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-600">Checking BH access…</div>;
  if (!hasAccess) return (
    <div className="min-h-screen grid place-items-center bg-slate-100 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 text-center">
        <h1 className="text-xl font-bold text-slate-800">BH Team Sorter</h1>
        <p className="text-red-600 mt-3">This account is not authorized for the BH Team Sorter.</p>
        <button onClick={()=>{setHasAccess(null);supabase.auth.signOut();}} className="mt-5 px-4 py-2 bg-slate-900 text-white rounded-lg">Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="soc-shell">
      <header className="soc-topbar">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 flex items-center gap-4">
          <div className="soc-logo-mark">SOC</div>
          <div className="min-w-0">
            <p className="text-[11px] md:text-xs font-extrabold tracking-[.18em] text-[#d4af37] uppercase">Shinny of Champions</p>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">Beginner Hockey Team Sorter</h1>
            <p className="hidden md:block text-sm text-slate-400 mt-0.5">Build fair teams around people, positions and uniform inventory.</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <span className="soc-pill px-3 py-1.5 text-xs font-bold text-slate-300 !bg-white/5 !border-white/10">{selectedSeason?.name || 'No season'}</span>
            <button onClick={()=>supabase.auth.signOut()} className="px-3 py-2 text-sm font-bold text-white/80 hover:text-white rounded-xl hover:bg-white/10 flex items-center gap-2"><LogOut size={16}/> Sign out</button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 md:p-8">

        {/* ── Season / Class Selector ── */}
        <div className="soc-card p-5 md:p-6 mb-5">
          <h2 className="soc-card-title mb-4">Season & Class</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-600 mb-1">Season</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select value={selectedSeasonId||''} onChange={e=>selectSeason(e.target.value)} className="w-full appearance-none px-3 py-2 border rounded-lg pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {seasons.filter(s=>showArchived || s.status==='active').map(s=><option key={s.id} value={s.id}>{s.name}{s.status==='archived'?' (Archived)':''}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-3 text-slate-400 pointer-events-none"/>
                </div>
                <button onClick={()=>setShowNewSeason(!showNewSeason)} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus size={18}/></button>
              </div>
              {showNewSeason&&(<div className="flex gap-2 mt-2">
                <input autoFocus value={newSeasonName} onChange={e=>setNewSeasonName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addSeason()} placeholder="e.g. Winter 2027" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                <button onClick={addSeason} disabled={seasonBusy} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">{seasonBusy?'Adding…':'Add'}</button>
                <button onClick={()=>{setShowNewSeason(false);setNewSeasonName('');}} className="px-3 py-2 bg-slate-200 rounded-lg text-sm">Cancel</button>
              </div>)}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-600 mb-1">Class</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select value={selectedClassId||''} onChange={e=>selectClass(e.target.value)} disabled={!selectedSeason||selectedSeason.classes.length===0} className="w-full appearance-none px-3 py-2 border rounded-lg pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400">
                    {selectedSeason?.classes.length===0&&<option value="">No classes yet</option>}
                    {selectedSeason?.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-3 text-slate-400 pointer-events-none"/>
                </div>
                <button onClick={()=>setShowNewClass(!showNewClass)} disabled={!selectedSeasonId} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300"><Plus size={18}/></button>{selectedClass&&<button onClick={deleteClass} className="px-3 py-2 border border-red-200 text-red-700 rounded-lg" title="Delete class"><Trash2 size={18}/></button>}
              </div>
              {showNewClass&&(<div className="flex gap-2 mt-2">
                <input autoFocus value={newClassName} onChange={e=>setNewClassName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addClass()} placeholder="e.g. Sunday" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                <button onClick={addClass} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm">Add</button>
                <button onClick={()=>{setShowNewClass(false);setNewClassName('');}} className="px-3 py-2 bg-slate-200 rounded-lg text-sm">Cancel</button>
              </div>)}
            </div>
          </div>
          {selectedSeason&&<div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Currently editing: <strong className="text-slate-700">{selectedSeason.name}</strong></span>
            <span className="text-xs text-slate-400">{saveState}</span>
            <button onClick={()=>setShowArchived(v=>!v)} className="ml-auto px-3 py-1.5 text-sm border rounded-lg">{showArchived?'Hide archived':'Show archived'}</button>
            {selectedSeason.status==='active'?<button onClick={()=>setSeasonStatus('archived')} className="px-3 py-1.5 text-sm border rounded-lg flex items-center gap-1"><Archive size={15}/> Archive</button>:<button onClick={()=>setSeasonStatus('active')} className="px-3 py-1.5 text-sm border rounded-lg">Restore</button>}
            <button onClick={deleteSeason} className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-lg flex items-center gap-1"><Trash2 size={15}/> Delete</button>
            <button onClick={()=>supabase.auth.signOut()} className="px-3 py-1.5 text-sm border rounded-lg flex items-center gap-1"><LogOut size={15}/> Sign out</button>
          </div>}
        </div>

        {/* ── Team Names ── */}
        <div className="soc-card p-5 md:p-6 mb-5">
          <h2 className="soc-card-title mb-4">Team Names</h2>
          <div className="grid md:grid-cols-2 gap-4 soc-mobile-stack">
            {['team1','team2'].map(team=>(
              <div key={team} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60" style={{borderTop:`4px solid ${teamColors[team]}`}}>
                <label className="soc-label block mb-2">{team==='team1'?'Team 1':'Team 2'}</label>
                <div className="flex items-center gap-3"><input type="color" value={teamColors[team]} onChange={e=>setTeamColors({...teamColors,[team]:e.target.value})} className="w-10 h-10 rounded cursor-pointer border"/><input type="text" value={teamNames[team]} onChange={e=>setTeamNames({...teamNames,[team]:e.target.value})} className="flex-1 text-lg font-semibold text-slate-800 border-0 border-b-2 border-transparent focus:border-blue-500 focus:outline-none bg-transparent pb-1 transition-colors" placeholder="Enter team name"/></div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Inventory ── */}
        <div className="soc-card p-5 md:p-6 mb-5">
          <h2 className="soc-card-title mb-4 flex items-center gap-2"><Shirt className="text-blue-600"/> Inventory</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {['team1','team2'].map(team=>(
              <div key={team} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50" style={{borderTop:`4px solid ${teamColors[team]}`}}>
                <h3 className="font-extrabold text-slate-900 mb-3">{teamNames[team]}</h3>
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
        <div className="soc-card p-5 md:p-6 mb-5">
          <h2 className="soc-card-title mb-4">Import Class CSV</h2>
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
                <p className="text-xs text-slate-500 text-center">Player import template</p>
              </div>
            </div>
            {uploadError&&(<div className="p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2"><AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20}/><p className="text-sm text-red-800">{uploadError}</p></div>)}
            <div className="text-xs text-slate-500 space-y-1">
              <p><strong>Columns:</strong> Name, Rating (blank for goalies), Preferred Size, Goalie, Woman, Friend Group</p>
              <p>Team names, colours and inventory are saved with the class and do not need to be re-uploaded.</p>
            </div>
          </div>
        </div>

        {/* ── Players ── */}
        <div className="soc-card p-5 md:p-6 mb-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="soc-card-title flex items-center gap-2"><Users className="text-green-600"/> Players ({players.length})</h2>
            <button onClick={addPlayer} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">+ Add Player</button>
          </div>
          <div className="space-y-2 max-h-96 overflow-auto soc-mobile-scroll">
            {players.map(player=>{
              const gi=friendGroups.findIndex(g=>g.includes(player.id));
              return(
                <div key={player.id} className={`grid grid-cols-[minmax(130px,1fr)_64px_82px_auto_auto_auto] gap-2 items-center p-2 rounded-xl min-w-[650px] ${gi>=0?groupColors[gi%groupColors.length]:'bg-white'} ${gi>=0?'border-2':'border border-slate-200'}`}>
                  <input type="text" placeholder="Name" value={player.name} onChange={e=>updatePlayer(player.id,'name',e.target.value)} className="flex-1 px-2 py-1 border rounded"/>
                  <input type="number" min="0" max="10" step="0.5" value={player.isGoalie?'':player.rating} onChange={e=>updatePlayer(player.id,'rating',parseFloat(e.target.value)||0)} disabled={player.isGoalie} placeholder={player.isGoalie?'—':''} className="w-16 px-2 py-1 border rounded disabled:bg-slate-100 disabled:text-slate-400" title={player.isGoalie?'Goalies have no rating':'Rating (0-10)'}/>
                  <select value={player.preferredSize} onChange={e=>updatePlayer(player.id,'preferredSize',e.target.value)} className="px-2 py-1 border rounded">
                    {sizes.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={player.isGoalie} onChange={e=>updatePlayer(player.id,'isGoalie',e.target.checked)}/> G</label>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={player.isWoman} onChange={e=>updatePlayer(player.id,'isWoman',e.target.checked)}/> W</label>
                  <button onClick={()=>removePlayer(player.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><X size={18}/></button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Friend Groups ── */}
        <div className="soc-card p-5 md:p-6 mb-5">
          <h2 className="soc-card-title mb-4">Friend Groups</h2>
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
        <div className="soc-card p-5 md:p-6 mb-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={balanceTeams} className="flex-1 px-6 py-4 soc-btn-primary transition text-lg flex items-center justify-center gap-2"><Shuffle size={24}/> Balance Teams</button>
            <button onClick={clearTeams} className="px-6 py-4 border border-slate-200 text-slate-600 bg-white rounded-xl hover:bg-slate-50 transition font-bold">Clear Teams</button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="soc-card p-5 md:p-6 mb-5">
          <h2 className="soc-card-title mb-4">Team Statistics</h2>
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
        <div className="soc-card p-5 md:p-6 mb-5">
          <h2 className="soc-card-title mb-4">Export Results</h2>
          <div className="grid md:grid-cols-3 gap-3 soc-mobile-stack">
            <button onClick={downloadForExcel} className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2"><FileSpreadsheet size={20}/> Excel</button>
            <button onClick={downloadAdminRoster} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center justify-center gap-2"><FileText size={20}/> Admin PDF</button>
            <button onClick={downloadPublicRoster} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center justify-center gap-2"><Users size={20}/> Public PDF</button>
          </div>
          <p className="text-sm text-slate-600 mt-3">Excel downloads a live file — change the Team column to swap players and stats auto-update.</p>
        </div>

        {/* ── Swap UI ── */}
        {players.some(p=>p.team)&&(
          <div className="soc-card p-5 md:p-6 mb-5">
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
                  <div key={team} className="border rounded-2xl overflow-hidden shadow-sm bg-white" style={{borderColor:teamColors[team]}}>
                    <div className="soc-team-head px-4 py-3 flex items-center justify-between" style={{backgroundColor:teamColors[team]}}>
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

      </main>
    </div>
  );
};

export default HockeyTeamBalancer;
