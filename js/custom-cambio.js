// Simple client-only lobby for Cambio using localStorage or Firebase if configured
(function () {
  const mount = document.getElementById('cambio-app');
  if (!mount) return;

  const state = {
    roomId: '',
    name: '',
    players: [],
    isHost: false,
  lastPeek: null,
  targetPoints: 100,
  };

  // Persist room globally across tabs; keep name per-tab via sessionStorage
  const CLIENT_NAME_KEY = 'cambio_client_name'; // legacy; now using session but keep key name
  const CLIENT_ROOM_KEY = 'cambio_client_room';
  const SESSION_NAME_KEY = 'cambio_client_name_session';
  try {
    // Prefer sessionStorage for per-tab identity; do not force-sync names across tabs
    state.name = sessionStorage.getItem(SESSION_NAME_KEY) || state.name;
    state.roomId = localStorage.getItem(CLIENT_ROOM_KEY) || state.roomId;
  } catch {}

  // Utilities
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'for') e.htmlFor = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.substring(2), v);
      else e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  // Basic local "sync" using localStorage polling (works without backend)
  const STORAGE_KEY = 'cambio_rooms_v1';
  const GAME_VERSION = 1;
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const SUITS = ['♣','♦','♥','♠'];
  function cardValue(rank) {
    if (rank === 'K') return -1; // per your rule
    if (rank === 'A') return 1;
  if (rank === 'J') return 0; // J is special, no numeric value for scoring
    if (rank === 'Q') return 12;
    return parseInt(rank, 10);
  }
  function newDeck() {
    // 52-card deck, no jokers
    const d = [];
    let cid = 0;
    for (const s of SUITS) for (const r of RANKS) d.push({ id: `c${cid++}`, r, s, v: cardValue(r) });
    // shuffle
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }
  function loadRooms() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }
  function saveRooms(rooms) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  }
  function getRoom(id) { return loadRooms()[id]; }
  function upsertRoom(id, data) {
    const rooms = loadRooms();
    rooms[id] = { ...(rooms[id] || {}), ...data };
    saveRooms(rooms);
  }
  function deleteRoom(id) {
    const rooms = loadRooms();
    if (rooms[id]) {
      delete rooms[id];
      saveRooms(rooms);
    }
  }

  function render() {
    mount.innerHTML = '';
    const title = el('h2', {}, 'Cambio');
    const subtitle = el('p', { class: 'dim' }, 'Create a room or join with a code. Share the code with friends.');

  const nameInput = el('input', { id: 'c-name', placeholder: 'Your name', value: state.name });
  nameInput.addEventListener('input', () => { state.name = nameInput.value; try { sessionStorage.setItem(SESSION_NAME_KEY, state.name); } catch {} });

    const createBtn = el('button', { class: 'c-btn' }, 'Create room');
    createBtn.addEventListener('click', onCreate);

  const roomInput = el('input', { id: 'c-room', placeholder: 'Room code', value: state.roomId });
  roomInput.addEventListener('input', () => { state.roomId = roomInput.value.toUpperCase(); try { localStorage.setItem(CLIENT_ROOM_KEY, state.roomId); } catch {} });

  const targetInput = el('input', { id: 'c-target', placeholder: 'Target points (e.g., 100)', value: String(state.targetPoints) });
  targetInput.addEventListener('input', () => {
    const v = parseInt(targetInput.value || '0', 10);
    state.targetPoints = (!isNaN(v) && v > 0) ? v : 100;
  });

    const joinBtn = el('button', { class: 'c-btn' }, 'Join');
    joinBtn.addEventListener('click', onJoin);

    const lobby = el('div', { class: 'c-lobby' }, [
      el('div', { class: 'c-row' }, [el('label', { for: 'c-name' }, 'Name'), nameInput]),
      el('div', { class: 'c-row' }, [el('label', { for: 'c-room' }, 'Room'), roomInput]),
      el('div', { class: 'c-row' }, [el('label', { for: 'c-target' }, 'Target points'), targetInput]),
      el('div', { class: 'c-actions' }, [createBtn, joinBtn]),
    ]);

  const activeRoom = state.roomId ? getRoom(state.roomId) : null;
  const notInRoom = activeRoom && !(activeRoom.players || []).includes(state.name);
  if (!activeRoom || (activeRoom.status || 'lobby') === 'lobby' || notInRoom) {
      mount.append(title, subtitle, lobby);
    } else {
      mount.append(title);
    }

    if (state.roomId && getRoom(state.roomId)) {
      const room = getRoom(state.roomId);
      const isHost = room.host ? room.host === state.name : state.isHost;
      state.isHost = isHost; // keep local in sync

      const playersList = el('ul', { class: 'c-list' }, (room.players || []).map((p) => el('li', {}, p)));
      const copyBtn = el('button', { class: 'c-btn' }, 'Copy code');
      copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(state.roomId); copyBtn.textContent = 'Copied!'; setTimeout(()=>copyBtn.textContent='Copy code',1200);} catch {}
      });
      const leaveBtn = el('button', { class: 'c-btn secondary' }, 'Leave room');
      leaveBtn.addEventListener('click', onLeave);

      let actionsRow;
      if ((room.status || 'lobby') === 'lobby') {
        const startBtn = el('button', { class: 'c-btn primary' }, 'Start game');
        startBtn.disabled = !isHost || (room.players || []).length < 2;
        startBtn.addEventListener('click', onStart);
        // Host-only quick solo start for testing
        const soloBtn = (isHost && (room.players || []).length < 2)
          ? el('button', { class: 'c-btn secondary' }, 'Start solo (test)')
          : null;
        if (soloBtn) soloBtn.addEventListener('click', () => onStart(true));
        actionsRow = el('div', { class: 'c-actions' }, [copyBtn, startBtn, ...(soloBtn ? [soloBtn] : []), leaveBtn]);
      } else {
        const resetBtn = isHost ? el('button', { class: 'c-btn' }, 'Reset to lobby') : null;
        if (resetBtn) resetBtn.addEventListener('click', onReset);
        actionsRow = el('div', { class: 'c-actions' }, [copyBtn, ...(resetBtn ? [resetBtn] : []), leaveBtn]);
      }

      const turnText = (room.status === 'started')
        ? ((currentPlayerName(room) === state.name) ? 'Your turn' : `Waiting for ${currentPlayerName(room)}`)
        : (room.status === 'finished') ? 'Game finished' : 'Lobby';
      const statusBadge = el('div', { class: 'muted' }, turnText);

      const header = el('div', { class: 'c-room-header' }, [
        el('h3', {}, `Room ${state.roomId}`),
        el('span', { class: 'muted' }, `Target: ${room.targetPoints || state.targetPoints}`),
        statusBadge,
      ]);
      const body = ((room.status || 'lobby') !== 'lobby')
        ? renderGame(state, room)
        : el('div', { class: 'dim' }, 'Share this code with friends.');
      const roomBox = el('div', { class: 'c-room' }, [header, body, actionsRow]);
      mount.append(roomBox);
    }
  }

  function randomCode() {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function onCreate() {
    if (!state.name.trim()) return alert('Enter your name');
    const code = randomCode();
    state.roomId = code;
    state.isHost = true;
  upsertRoom(code, { players: [state.name], host: state.name, status: 'lobby', createdAt: Date.now(), targetPoints: state.targetPoints });
  try { localStorage.setItem(CLIENT_ROOM_KEY, code); sessionStorage.setItem(SESSION_NAME_KEY, state.name); } catch {}
    render();
  }

  function onJoin() {
    if (!state.name.trim()) return alert('Enter your name');
    if (!state.roomId.trim()) return alert('Enter room code');
    const code = state.roomId.toUpperCase();
    const room = getRoom(code);
    if (!room) {
      if (!confirm('Room not found. Create it?')) return;
      state.isHost = true;
  upsertRoom(code, { players: [state.name], host: state.name, status: 'lobby', createdAt: Date.now(), targetPoints: state.targetPoints });
    } else {
      if ((room.status || 'lobby') !== 'lobby') {
        alert('Game already in progress. Ask the host to reset to lobby to join.');
        render();
        return;
      }
      if (!room.players.includes(state.name)) {
        upsertRoom(code, { players: [...room.players, state.name] });
      }
      state.isHost = false;
    }
  try { localStorage.setItem(CLIENT_ROOM_KEY, code); sessionStorage.setItem(SESSION_NAME_KEY, state.name); } catch {}
    render();
  }

  function onStart(allowSolo = false) {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room) return;
    const isHost = room.host ? room.host === state.name : state.isHost;
    if (!isHost) return alert('Only the host can start the game.');
    if (!room.players || room.players.length < 2) {
      if (!allowSolo) return alert('Need at least 2 players to start.');
    }
    // Initialize game
    const deck = newDeck();
    const players = room.players;
    const hands = {};
    for (const p of players) hands[p] = [];
  // Deal 4 cards each with fixed slots 0..3; bottom row (slots 2 and 3) initially known during peek
  for (let i = 0; i < 4; i++) for (const p of players) hands[p].push({ ...deck.pop(), knownBy: i >= 2 ? [p] : [], slot: i });
    // Start with no discard as requested
    const discard = [];
    // Pre-game peek phase: players confirm ready, then we hide initial known cards
    const ready = {};
    for (const p of players) ready[p] = false;
    upsertRoom(code, {
      version: GAME_VERSION,
      status: 'peek',
      startedAt: Date.now(),
      turn: 0,
      deck,
      discard,
      hands,
      drawn: null,
      ready,
    });
    render();
  }

  function onReset() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room) return;
    const isHost = room.host ? room.host === state.name : state.isHost;
    if (!isHost) return alert('Only the host can reset the game.');
  upsertRoom(code, { status: 'lobby', deck: null, discard: null, hands: null, drawn: null, cambio: null, finalScores: null });
    render();
  }

  function onLeave() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room) { state.roomId = ''; render(); return; }
    const newPlayers = (room.players || []).filter((p) => p !== state.name);
    if (newPlayers.length === 0) {
      deleteRoom(code);
      state.roomId = '';
      state.isHost = false;
      render();
      return;
    }
    const newHost = room.host === state.name ? newPlayers[0] : room.host;
    upsertRoom(code, { players: newPlayers, host: newHost });
    if (!newPlayers.includes(state.name)) {
      // You left the room; clear local room state
      state.roomId = '';
      state.isHost = false;
    } else {
      state.isHost = newHost === state.name;
    }
    render();
  }

  // --- Game rendering and actions ---
  function isEliminated(room, p) {
    return !!(room.eliminated && room.eliminated.includes(p));
  }
  function currentPlayerName(room) {
    const players = room.players || [];
    if (!players.length) return undefined;
    let idx = room.turn || 0;
    for (let i = 0; i < players.length; i++) {
      const p = players[idx % players.length];
      if (!isEliminated(room, p)) return p;
      idx++;
    }
    return undefined;
  }
  function ensureDeck(room) {
    if (room.deck && room.deck.length > 0) return room;
    // Reshuffle from discard, keeping top card
    const top = room.discard && room.discard.length ? room.discard[room.discard.length - 1] : null;
    const pool = (room.discard || []).slice(0, -1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    room.deck = pool;
    room.discard = top ? [top] : [];
    return room;
  }
  function advanceTurn(room) {
    const players = room.players || [];
    if (!players.length) { room.turn = 0; return; }
    let idx = ((room.turn || 0) + 1) % players.length;
    for (let i = 0; i < players.length; i++) {
      const p = players[idx];
      if (!isEliminated(room, p)) { room.turn = idx; return; }
      idx = (idx + 1) % players.length;
    }
    room.turn = idx;
  }

  function renderGame(local, room) {
    const me = local.name;
    const isMyTurn = currentPlayerName(room) === me;
    const wrap = el('div', { class: 'c-table' });
  const cambioActive = !!(room.cambio && (room.cambio.callers||[]).length) && room.status === 'started';
  const myPower = room.power && room.power.by === me ? room.power : null;

    // Peek phase banner and Ready action
    if (room.status === 'peek') {
      const readyBtn = el('button', { class: 'c-btn primary' }, room.ready?.[me] ? 'Ready ✓' : "I'm ready");
      readyBtn.disabled = !!room.ready?.[me];
      if (!readyBtn.disabled) readyBtn.addEventListener('click', onReady);
      wrap.append(el('div', { class: 'c-drawn' }, [
        el('span', { class: 'muted' }, 'Peek your first two cards, then click Ready.'),
        readyBtn,
      ]));
    }

    // Ephemeral peek banner (per-tab only)
    if (state.lastPeek) {
      wrap.append(el('div', { class: 'c-drawn' }, [
        el('span', { class: 'muted' }, `Peeked: ${state.lastPeek}`),
      ]));
    }

  // Piles (visual stacks, no text)
  const drawStack = el('div', { class: `pile-stack ${(!isMyTurn || !!room.drawn || room.status !== 'started') ? 'disabled' : 'clickable'}` });
  for (let i = 0; i < 3; i++) drawStack.append(el('div', { class: 'card-back', style: `transform: translate(${i*2}px, ${-i*2}px);` }));
  if (isMyTurn && !room.drawn && room.status === 'started') drawStack.addEventListener('click', () => onDraw());

    const topDiscard = room.discard && room.discard.length ? room.discard[room.discard.length - 1] : null;
  const discardCard = cardNode(topDiscard, true, me);
  // Allow taking top of discard as your draw on your turn
  if (isMyTurn && !room.drawn && room.status === 'started' && topDiscard) {
    discardCard.classList.add('clickable');
    discardCard.addEventListener('click', onTakeDiscard);
  }
  const discardStackWrap = el('div', { class: 'pile-stack' });
  discardStackWrap.append(el('div', { class: 'card-back', style: 'opacity:0.35;' }));
  const discardBox = el('div', { class: 'c-pile' }, [discardStackWrap, discardCard]);

    // Cambio button (only before drawing, at start of your turn)
    const cambioBtn = (isMyTurn && !room.drawn && room.status === 'started')
      ? el('button', { class: 'c-btn secondary' }, 'Cambio')
      : null;
    if (cambioBtn) cambioBtn.addEventListener('click', onCambio);
    const piles = el('div', { class: 'c-piles' }, [
      el('div', { class: 'c-pile' }, [drawStack, (cambioBtn || null)]),
      discardBox,
    ]);
    wrap.append(piles);

    // Auto-close an active reaction window after ~1.2s so play advances
  if (room.react && room.react.openedAt && (Date.now() - room.react.openedAt > 1200) && !(room.react.steal && room.react.steal.needGive) && !(room.react.trick && room.react.trick.by)) {
      closeReactionWindow();
      return wrap;
    }

    // Reaction window: if room.react is active, show a small prompt (optional)
    if (room.react && room.react.rank) {
      const meHasMatch = (room.hands?.[me] || []).some(c => c && c.r === room.react.rank);
  let msg = `Optional reaction: match ${room.react.rank}. Anyone may react. If you have it, click your card now.`;
      if (room.react.trick && room.react.trick.by) {
        if (room.react.trick.by === me) msg = `Replacement Trick active: click one of your ${room.react.rank}s to swap with the discard.`;
        else msg = `Replacement Trick in progress...`;
      }
      const children = [el('span', { class: 'muted' }, msg)];
  if (meHasMatch && !(room.react.trick && room.react.trick.by)) {
        const btn = el('button', { class: 'c-btn secondary' }, 'Replacement Trick');
        btn.addEventListener('click', onReactTrickStart);
        children.push(btn);
      }
      const prompt = el('div', { class: 'c-drawn' }, children);
      wrap.append(prompt);
    }

    if (room.drawn) {
      const drawn = room.drawn;
      const drawnNode = cardNode(drawn, true, me);
      if (isMyTurn) {
        drawnNode.classList.add('clickable');
        drawnNode.addEventListener('click', onDiscard);
      }
      const drawnRow = el('div', { class: 'c-drawn' }, [ drawnNode ]);
      wrap.append(drawnRow);
    }

    // Seats around a table (up to 4): bottom=me, right=next, top=next2, left=next3
    const seats = computeSeats(room.players || [], me);
    const seatsWrap = el('div', { class: 'c-seats' });
    ['top','left','right','bottom'].forEach((pos) => {
      const pl = seats[pos];
      if (!pl) {
        // placeholder for layout consistency
        seatsWrap.append(el('div', { class: `seat ${pos} empty` }, ''));
        return;
      }
      const seat = el('div', { class: `seat ${pos}` });
      seat.append(el('div', { class: 'c-hand-name' }, pl));
  const cardsWrap = el('div', { class: 'c-cards' });
  const hand = (room.hands?.[pl] || []);
  // Build stable slots (0..3) and extras (no slot)
  const base = [null, null, null, null];
  const extras = [];
  hand.forEach((c) => {
    if (c && (c.slot === 0 || c.slot === 1 || c.slot === 2 || c.slot === 3)) base[c.slot] = c; else if (c) extras.push(c);
  });
  const grid = el('div', { class: 'c-grid-2x2' });
  const extraRow = el('div', { class: 'c-extras' });
  base.forEach((card, pos) => {
    const isKnownToMe = !!(card && card.knownBy && card.knownBy.includes(me));
    const locked = cambioActive && (room.cambio.callers||[]).includes(pl);
  // Memory: during peek, your bottom two show; after start, show any card you personally know (from peeks)
    const show = room.status === 'peek' ? ((pl === me) && isKnownToMe) : isKnownToMe;
        const node = cardNode(card, show, me);
  if (!locked) node.addEventListener('click', () => {
          // Handle power actions first
          if (isMyTurn && myPower) {
      if (myPower.type === 'peek-own' && pl === me) {
              const hands = { ...(room.hands || {}) };
              const target = (hands[pl] || []).find(c => c && c.slot === pos);
              if (target) {
                const kb = new Set(target.knownBy || []);
                kb.add(me);
                hands[pl] = (hands[pl] || []).slice();
                const rep = hands[pl].findIndex(c => c && c.id === target.id);
                if (rep >= 0) hands[pl][rep] = { ...target, knownBy: Array.from(kb) };
  // Set ephemeral local banner; UI reveal is gated by knownBy and render logic
  try { state.lastPeek = `${target.r}${target.s}`; setTimeout(()=>{ state.lastPeek = null; render(); }, 1500); } catch {}
        upsertRoom(state.roomId, { hands, power: null });
        finishPowerTurn();
                return;
              }
            }
      if (myPower.type === 'peek-opp' && pl !== me) {
              const hands = { ...(room.hands || {}) };
              const target = (hands[pl] || []).find(c => c && c.slot === pos);
              if (target) {
        // Ephemeral only: do not persist knownBy for opponent peeks
        try { state.lastPeek = `${target.r}${target.s}`; setTimeout(()=>{ state.lastPeek = null; render(); }, 1500); } catch {}
        upsertRoom(state.roomId, { power: null });
        finishPowerTurn();
                return;
              }
            }
          }
          // If you have a drawn card, clicking a card places it (primary action)
          if (room.drawn && isMyTurn && room.status === 'started') { onPlaceSlot(pl, pos); return; }
          // If giving after a steal, only stealer can click their own card to give
          if (room.react && room.react.steal && room.react.steal.needGive && room.react.steal.by === me) {
            if (pl === me) { onReactStealGive(pos, false); return; }
            return;
          }
          // Reaction handling: if react window open and this card matches, allow reaction for anyone
          if (room.react && room.react.rank) {
            const c = hand[pos];
            if (c && c.r === room.react.rank) {
              if (pl === me) {
                if (room.react.trick && room.react.trick.by === me) { onReactTrickChoose(c.id, false); return; }
                if (room.react.trick && room.react.trick.by && room.react.trick.by !== me) return;
                onReactThrowSelf(pl, pos); return;
              }
              else {
                if (room.react.trick && room.react.trick.by) return;
                onReactStealStart(pl, c); return;
              }
            }
          }
        });
  if (!locked) {
    if ((room.drawn && isMyTurn && pl === me) || (isMyTurn && myPower)) node.classList.add('clickable');
    // Highlight reactionable cards for all players during reaction
    if (room.react && room.react.rank) {
      if (card && card.r === room.react.rank) node.classList.add('clickable');
    }
  }
        grid.append(node);
      });
  extras.forEach((card, eIdx) => {
    const isKnownToMe = !!(card && card.knownBy && card.knownBy.includes(me));
    const locked = cambioActive && (room.cambio.callers||[]).includes(pl);
    const show = room.status === 'peek' ? ((pl === me) && isKnownToMe) : isKnownToMe;
        const node = cardNode(card, show, me);
  if (!locked) node.addEventListener('click', () => {
          if (isMyTurn && myPower) {
            if (myPower.type === 'peek-own' && pl === me) {
              const hands = { ...(room.hands || {}) };
              const target = card;
              if (target) {
                const kb = new Set(target.knownBy || []);
                kb.add(me);
                const rep = (hands[pl] || []).findIndex(c => c && c.id === target.id);
                if (rep >= 0) {
                  hands[pl] = (hands[pl] || []).slice();
                  hands[pl][rep] = { ...target, knownBy: Array.from(kb) };
                }
                try { state.lastPeek = `${target.r}${target.s}`; setTimeout(()=>{ state.lastPeek = null; render(); }, 1500); } catch {}
                upsertRoom(state.roomId, { hands, power: null });
                finishPowerTurn();
                return;
              }
            }
            if (myPower.type === 'peek-opp' && pl !== me) {
              const target = card;
              if (target) {
                // Ephemeral only: do not persist knownBy for opponent peeks
                try { state.lastPeek = `${target.r}${target.s}`; setTimeout(()=>{ state.lastPeek = null; render(); }, 1500); } catch {}
                upsertRoom(state.roomId, { power: null });
                finishPowerTurn();
                return;
              }
            }
            if (myPower.type === 'peek-opp' && pl !== me) {
              const hands = { ...(room.hands || {}) };
              const target = (hands[pl] || []).find(c => c && c.slot === pos);
              if (target) {
                // Ephemeral only: do not persist knownBy for opponent peeks
                try { state.lastPeek = `${target.r}${target.s}`; setTimeout(()=>{ state.lastPeek = null; render(); }, 1500); } catch {}
                upsertRoom(state.roomId, { power: null });
                finishPowerTurn();
                return;
              }
            }
            if (myPower.type === 'jack-swap') {
              // First click: pick your card; second click: pick opponent card; perform blind swap
              const sel = myPower.sel || null;
              if (!sel && pl === me) {
                upsertRoom(state.roomId, { power: { ...myPower, sel: { player: pl, slot: pos } } });
                render();
                return;
              }
              if (sel && pl !== me) {
                const hands = { ...(room.hands || {}) };
                const myIdx = (hands[me] || []).findIndex(c => c && c.slot === sel.slot);
                const oppIdx = (hands[pl] || []).findIndex(c => c && c.slot === pos);
                if (myIdx >= 0 && oppIdx >= 0) {
                  const a = (hands[me] || []).slice();
                  const b = (hands[pl] || []).slice();
                  const tmp = a[myIdx];
                  a[myIdx] = { ...b[oppIdx], slot: sel.slot };
                  b[oppIdx] = { ...tmp, slot: pos };
                  hands[me] = a; hands[pl] = b;
                  upsertRoom(state.roomId, { hands, power: null });
                  finishPowerTurn();
                  return;
                }
              }
            }
            if (myPower.type === 'queen-peek-swap' && pl !== me) {
              // First click: peek opponent card, then optionally swap with your chosen card
              const phase = myPower.phase || 'peek';
              if (phase === 'peek') {
                const hands = { ...(room.hands || {}) };
                const target = (hands[pl] || []).find(c => c && c.slot === pos);
                if (target) {
                  const kb = new Set(target.knownBy || []);
                  kb.add(me);
                  hands[pl] = (hands[pl] || []).slice();
                  const rep = hands[pl].findIndex(c => c && c.id === target.id);
                  if (rep >= 0) hands[pl][rep] = { ...target, knownBy: Array.from(kb) };
                  try { state.lastPeek = `${target.r}${target.s}`; setTimeout(()=>{ state.lastPeek = null; render(); }, 1500); } catch {}
                  upsertRoom(state.roomId, { hands, power: { ...myPower, phase: 'choose', opp: { player: pl, slot: pos } } });
                  render();
                  return;
                }
              } else if (phase === 'choose') {
                if (pl === me) {
                  const hands = { ...(room.hands || {}) };
                  const myIdx = (hands[me] || []).findIndex(c => c && c.slot === pos);
                  const oppIdx = (hands[myPower.opp.player] || []).findIndex(c => c && c.slot === myPower.opp.slot);
                  if (myIdx >= 0 && oppIdx >= 0) {
                    const a = (hands[me] || []).slice();
                    const b = (hands[myPower.opp.player] || []).slice();
                    const tmp = a[myIdx];
                    a[myIdx] = { ...b[oppIdx], slot: pos };
                    b[oppIdx] = { ...tmp, slot: myPower.opp.slot };
                    hands[me] = a; hands[myPower.opp.player] = b;
                    upsertRoom(state.roomId, { hands, power: null });
                    finishPowerTurn();
                    return;
                  }
                }
                // Or click anywhere else (e.g., non-you) to skip swap
                upsertRoom(state.roomId, { power: null });
                finishPowerTurn();
                return;
              }
            }
          }
          if (room.drawn && isMyTurn && room.status === 'started') { onPlaceExtra(pl, card.id); return; }
          if (room.react && room.react.steal && room.react.steal.needGive && room.react.steal.by === me) {
            if (pl === me) { onReactStealGive(eIdx, true); return; }
            return;
          }
          if (room.react && room.react.rank) {
            if (card && card.r === room.react.rank) {
              if (pl === me) {
                if (room.react.trick && room.react.trick.by === me) { onReactTrickChoose(card.id, true); return; }
                if (room.react.trick && room.react.trick.by && room.react.trick.by !== me) return;
                onReactThrowSelf(pl, eIdx, true); return;
              }
              else {
                if (room.react.trick && room.react.trick.by) return;
                onReactStealStart(pl, card); return;
              }
            }
          }
        });
  if (!locked) {
    if ((room.drawn && isMyTurn && pl === me) || (isMyTurn && myPower)) node.classList.add('clickable');
    if (room.react && room.react.rank) {
      if (card && card.r === room.react.rank) node.classList.add('clickable');
    }
  }
        extraRow.append(node);
      });
      cardsWrap.append(grid, extraRow);
      seat.append(cardsWrap);
      seatsWrap.append(seat);
    });
    wrap.append(seatsWrap);

    // Show scoreboard only when finished + Play again
    if (room.status === 'finished' && Array.isArray(room.finalScores)) {
      const board = el('div', { class: 'c-scores' }, [
        el('h4', {}, 'Scores'),
        el('ul', {}, room.finalScores.map(s => el('li', {}, `${s.p}: ${s.score}`))),
      ]);
      const again = el('button', { class: 'c-btn primary' }, 'Play again');
      again.addEventListener('click', onRestart);
      wrap.append(board, el('div', { class: 'c-actions' }, [again]));
    }

    return wrap;
  }

  function computeSeats(players, me) {
    const idx = players.indexOf(me);
    if (idx < 0) return { bottom: null, right: null, top: null, left: null };
    const order = players.slice(idx).concat(players.slice(0, idx)); // [me, next, ...]
    const res = { bottom: order[0] || null, right: null, top: null, left: null };
    if (order.length === 2) {
      res.top = order[1];
    } else if (order.length === 3) {
      res.right = order[1]; res.top = order[2];
    } else if (order.length >= 4) {
      res.right = order[1]; res.top = order[2]; res.left = order[3];
    }
    return res;
  }

  function cardNode(card, show, me) {
    const label = card ? `${card.r}${card.s}` : '—';
    const node = el('div', { class: 'c-card' }, show && card ? label : '?');
    return node;
  }

  function onDraw() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room) return;
    if (currentPlayerName(room) !== state.name) return;
    ensureDeck(room);
    const drawn = room.deck.pop();
    // Remember power for future rule integration
  upsertRoom(code, { deck: room.deck, drawn: { ...drawn, power: drawn.r } });
  render();
  }

  function onPlace(targetPlayer, cardIdx) {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.drawn) return;
    if (currentPlayerName(room) !== state.name) return;
  if (room.status !== 'started') return; // cannot place during peek
  // Only replace your own cards
  if (targetPlayer !== state.name) return;
  // If Cambio active, do not allow targeting the caller by others (redundant with self-only but keep rule)
    if (room.cambio && room.cambio.caller && targetPlayer === room.cambio.caller && state.name !== room.cambio.caller) {
      alert('Cambio active: you cannot target the caller.');
      return;
    }
    const hands = room.hands || {};
    const targetHand = hands[targetPlayer] || [];
    const replaced = targetHand[cardIdx];
    // place drawn card into slot, replaced to discard
    targetHand[cardIdx] = { ...room.drawn, knownBy: [] };
    const discard = (room.discard || []).concat(replaced || []);
    hands[targetPlayer] = targetHand;
    const after = handleCambioProgress(room);
    if (!after.finished) advanceTurn(room);
  upsertRoom(code, { hands, discard, drawn: null, turn: room.turn, ...(after.patch || {}) });
  render();
  }

  function onPlaceSlot(targetPlayer, pos) {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.drawn) return;
    if (currentPlayerName(room) !== state.name) return;
    if (room.status !== 'started') return;
    if (targetPlayer !== state.name) return;
    const hands = { ...(room.hands || {}) };
    const targetHand = (hands[targetPlayer] || []).slice();
    const idx = targetHand.findIndex(c => c && c.slot === pos);
    let replaced = null;
    if (idx >= 0) { replaced = targetHand[idx]; targetHand[idx] = { ...room.drawn, knownBy: [], slot: pos }; }
    else { targetHand.push({ ...room.drawn, knownBy: [], slot: pos }); }
    const discard = (room.discard || []).concat(replaced || []);
    hands[targetPlayer] = targetHand;
  const after = handleCambioProgress(room);
  // Open reaction window on the new top discard and advance turn immediately
  const react = { rank: (discard[discard.length-1] || {}).r, openedAt: Date.now(), by: state.name, adv: true };
  advanceTurn(room);
  upsertRoom(code, { hands, discard, drawn: null, react, turn: room.turn, ...(after.patch || {}) });
    render();
  }

  function onPlaceExtra(targetPlayer, cardId) {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.drawn) return;
    if (currentPlayerName(room) !== state.name) return;
    if (room.status !== 'started') return;
  if (targetPlayer !== state.name) return;
  // Allow replacing your own extra/penalty card
  const hands = { ...(room.hands || {}) };
  const targetHand = (hands[targetPlayer] || []).slice();
  const idx = targetHand.findIndex(c => c && c.id === cardId);
  let replaced = null;
  if (idx >= 0) { replaced = targetHand[idx]; targetHand[idx] = { ...room.drawn, knownBy: [], slot: null }; }
  else { targetHand.push({ ...room.drawn, knownBy: [], slot: null }); }
  const discard = (room.discard || []).concat(replaced || []);
  hands[targetPlayer] = targetHand;
  const after = handleCambioProgress(room);
  const react = { rank: (discard[discard.length-1] || {}).r, openedAt: Date.now(), by: state.name, adv: true };
  advanceTurn(room);
  upsertRoom(code, { hands, discard, drawn: null, react, turn: room.turn, ...(after.patch || {}) });
  render();
  }

  function finishPowerTurn() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room) return;
    const after = handleCambioProgress(room);
    if (!after.finished) advanceTurn(room);
    upsertRoom(code, { power: null, turn: room.turn, ...(after.patch || {}) });
    render();
  }
  

  function onDiscard() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.drawn) return;
    if (currentPlayerName(room) !== state.name) return;
    const r = room.drawn.r;
  let power = null;
  if (r === '7' || r === '8') power = { by: state.name, type: 'peek-own' };
  else if (r === '9' || r === '10') power = { by: state.name, type: 'peek-opp' };
  else if (r === 'J') power = { by: state.name, type: 'jack-swap' };
  else if (r === 'Q') power = { by: state.name, type: 'queen-peek-swap' };
    const discard = (room.discard || []).concat(room.drawn);
    if (power) {
      const react = { rank: r, openedAt: Date.now(), by: state.name, adv: true };
      advanceTurn(room);
      upsertRoom(code, { discard, drawn: null, power, react, turn: room.turn });
      render();
      return;
    }
    const react = { rank: r, openedAt: Date.now(), by: state.name, adv: true };
    advanceTurn(room);
    upsertRoom(code, { discard, drawn: null, react, turn: room.turn });
    render();
  }

  // Reaction: normal throw of your matching card during an active reaction window
  function onReactThrowSelf(player, idx, isExtra = false) {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.react || !room.react.rank) return;
    const hand = (room.hands?.[player] || []).slice();
    const card = isExtra
      ? hand.filter(c => c && (c.slot !== 0 && c.slot !== 1 && c.slot !== 2 && c.slot !== 3))[idx]
      : hand.find(c => c && c.slot === idx);
    if (!card || card.r !== room.react.rank) {
      // penalty: draw one face-down to penalty row (extras)
      ensureDeck(room);
      const penalty = room.deck.pop();
      const newHand = hand.concat({ ...penalty, knownBy: [], slot: null });
      const hands = { ...(room.hands || {}) };
      hands[player] = newHand;
      let patch = { hands, deck: room.deck };
      if (newHand.length > 6) patch.eliminated = Array.from(new Set([...(room.eliminated || []), player]));
      upsertRoom(code, patch);
      render();
      return;
    }
    // Valid reaction: remove from hand and add to discard; close window
    const newHand = hand.filter(c => c && c.id !== card.id);
    const hands = { ...(room.hands || {}) };
    hands[player] = newHand;
    const discard = (room.discard || []).concat(card);
    // Close and advance
    upsertRoom(code, { hands, discard });
    closeReactionWindow();
  }

  function onReactStealGive(sel, isExtra) {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.react || !room.react.steal || !room.react.steal.needGive) return;
    const by = room.react.steal.by;
    if (by !== state.name) return;
    const victim = room.react.steal.victim;
    const vSlot = room.react.steal.slot;
    const hands = { ...(room.hands || {}) };
    const myHand = (hands[by] || []).slice();
    let card;
    if (isExtra) {
      const extras = myHand.filter(c => c && (c.slot !== 0 && c.slot !== 1 && c.slot !== 2 && c.slot !== 3));
      card = extras[sel];
    } else {
      card = myHand.find(c => c && c.slot === sel);
    }
    if (!card) return;
    // Remove from stealer
    const myNew = myHand.filter(c => c && c.id !== card.id);
    hands[by] = myNew;
    // Place into victim
    const vHand = (hands[victim] || []).slice();
    if (vSlot == null) {
      vHand.push({ ...card, slot: null });
    } else {
      const idx = vHand.findIndex(c => c && c.slot === vSlot);
      if (idx >= 0) vHand[idx] = { ...card, slot: vSlot };
      else vHand.push({ ...card, slot: vSlot });
    }
    hands[victim] = vHand;
    upsertRoom(code, { hands, react: { ...(room.react || {}), steal: null } });
    closeReactionWindow();
  }

  // Replacement Trick: player picks up the top discard to replace their matching
  function onReactTrickStart() {
    const code = state.roomId;
    const room = getRoom(code);
  if (!room || !room.react || !room.react.rank) return;
  // discarder can react too
    // If someone already started a trick, ignore
    if (room.react.trick && room.react.trick.by && room.react.trick.by !== state.name) return;
    // Flag trick ownership; extend window a bit so chooser has time
    const react = { ...(room.react || {}), trick: { by: state.name, at: Date.now() }, openedAt: Date.now() };
    upsertRoom(code, { react });
    render();
  }

  function onReactTrickChoose(cardId, isExtra) {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.react || !room.react.rank || !room.react.trick || room.react.trick.by !== state.name) return;
    const hands = { ...(room.hands || {}) };
    const myHand = (hands[state.name] || []).slice();
    let card = null;
    if (isExtra) {
      const extras = myHand.filter(c => c && (c.slot !== 0 && c.slot !== 1 && c.slot !== 2 && c.slot !== 3));
      card = extras.find(c => c && c.id === cardId);
    } else {
      card = myHand.find(c => c && c.id === cardId);
    }
    if (!card || card.r !== room.react.rank) {
      // Illegal trick attempt: draw penalty and close
      ensureDeck(room);
      const hands = { ...(room.hands || {}) };
      const myHand = (hands[state.name] || []).slice();
      const penalty = room.deck.pop();
      myHand.push({ ...penalty, knownBy: [], slot: null });
      hands[state.name] = myHand;
      let patch = { hands, deck: room.deck, react: null };
      if (myHand.length > 6) patch.eliminated = Array.from(new Set([...(room.eliminated || []), state.name]));
      upsertRoom(code, patch);
      render();
      return;
    }
    const top = room.discard && room.discard.length ? room.discard[room.discard.length - 1] : null;
    if (!top) { closeReactionWindow(); return; }
    // Swap: remove my matching card and put it onto discard; take top into same position
    const myNew = myHand.filter(c => c && c.id !== card.id);
    if (card.slot == null) {
      myNew.push({ ...top, slot: null });
    } else {
      const idx = myNew.findIndex(c => c && c.slot === card.slot);
      if (idx >= 0) myNew[idx] = { ...top, slot: card.slot }; else myNew.push({ ...top, slot: card.slot });
    }
    hands[state.name] = myNew;
    const discard = room.discard.slice(0, -1).concat(card); // top consumed, my match discarded
    upsertRoom(code, { hands, discard, react: { ...(room.react || {}), trick: null } });
    closeReactionWindow();
  }

  // Reaction: steal-throw (placeholder) — records an attempt; future step will execute first attempt with swap
  function onReactStealStart(victim, card) {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.react || !room.react.rank) return;
    // If a steal is already in progress by someone else, ignore
    if (room.react.steal && room.react.steal.by && room.react.steal.by !== state.name) return;
    // Remove victim's matching card now, add to discard; record slot for replacement
    const hands = { ...(room.hands || {}) };
    const vHand = (hands[victim] || []).slice();
    const idx = vHand.findIndex(c => c && c.id === card.id);
    if (idx < 0) return;
    const removed = vHand.splice(idx, 1)[0];
    hands[victim] = vHand;
    const discard = (room.discard || []).concat(removed);
    const steal = { by: state.name, victim, slot: removed.slot ?? null, cardId: removed.id, needGive: true, at: Date.now() };
    upsertRoom(code, { hands, discard, react: { ...(room.react || {}), steal } });
    render();
  }

  function closeReactionWindow() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || !room.react) { render(); return; }
    // If we already advanced the turn when opening the reaction, just clear it
    if (room.react.adv) {
      upsertRoom(code, { react: null });
      render();
      return;
    }
    // Legacy path: advance on close
    const after = handleCambioProgress(room);
    if (!after.finished) advanceTurn(room);
    upsertRoom(code, { react: null, turn: room.turn, ...(after.patch || {}) });
    render();
  }

  function onTakeDiscard() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room) return;
    if (currentPlayerName(room) !== state.name) return;
    if (room.status !== 'started') return;
    const top = room.discard && room.discard.length ? room.discard[room.discard.length - 1] : null;
    if (!top || room.drawn) return;
    const discard = room.discard.slice(0, -1);
    upsertRoom(code, { drawn: top, discard });
    render();
  }

  function onReady() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room || room.status !== 'peek') return;
    const ready = { ...(room.ready || {}) };
    ready[state.name] = true;
    // If all ready, hide initial known cards and move to started
    const allReady = (room.players || []).every((p) => ready[p]);
    if (allReady) {
      const hands = { ...(room.hands || {}) };
      for (const p of (room.players || [])) {
        hands[p] = (hands[p] || []).map((c) => (c ? { ...c, knownBy: [] } : c));
      }
      upsertRoom(code, { ready, hands, status: 'started' });
    } else {
      upsertRoom(code, { ready });
    }
    render();
  }

  // Legacy slam removed; reactions handle throws onto discard

  function onCambio() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room) return;
    if (currentPlayerName(room) !== state.name) return;
    if (room.drawn) return; // only before drawing
  // Only allowed if total sum ≤ 5
  const sum = (room.hands?.[state.name] || []).reduce((s, c) => s + (c?.v ?? 0), 0);
  if (sum > 5) { alert('Cambio allowed only if your total ≤ 5.'); return; }
  // Record callers in order; lock caller
  const callers = Array.from(new Set([...(room.cambio?.callers || []), state.name]));
  const firstRemaining = Math.max(0, (room.players || []).filter(p=>!isEliminated(room,p)).length - 1);
  const remaining = room.cambio?.remaining != null ? room.cambio.remaining : firstRemaining;
  advanceTurn(room);
  upsertRoom(code, { cambio: { callers, first: callers[0], remaining }, turn: room.turn });
  render();
  }

  function handleCambioProgress(room) {
    if (!room.cambio || !(room.cambio.callers || []).length) return { finished: false };
    const remaining = Math.max(0, (room.cambio.remaining || 0) - 1);
    if (remaining <= 0) {
      // Finish: compute sums
      const sums = (room.players || []).reduce((acc, p) => (acc[p] = (room.hands?.[p] || []).reduce((s, c) => s + (c?.v ?? 0), 0), acc), {});
      // Apply scoring rules
      const first = room.cambio.first;
      const callers = room.cambio.callers || [];
      const sorted = Object.entries(sums).sort((a,b) => a[1]-b[1]);
      const lowestSum = sorted[0][1];
      const winners = sorted.filter(([_,v]) => v===lowestSum).map(([p])=>p);
      const final = {};
      if (callers.length) {
        const challenger = callers.find(c => c !== first) || null;
        if (challenger && sums[challenger] < sums[first]) {
          // challenger beats first
          final[challenger] = 0;
          final[first] = 25;
        } else if (challenger) {
          // challenger fails
          final[challenger] = 25;
        } else {
          // only first caller
          // if first has lowest sum → 0 else normal
          if (winners.includes(first)) final[first] = 0;
        }
      }
      for (const p of (room.players || [])) {
        if (final[p] == null) final[p] = Math.max(0, sums[p] || 0);
      }
      const finalScores = Object.entries(final).map(([p,score]) => ({ p, score })).sort((a,b)=>a.score-b.score);
      return { finished: true, patch: { status: 'finished', finalScores, cambio: null } };
    }
  return { finished: false, patch: { cambio: { ...(room.cambio || {}), remaining } } };
  }

  function onRestart() {
    const code = state.roomId;
    const room = getRoom(code);
    if (!room) return;
    const deck = newDeck();
    const players = room.players || [];
    const hands = {};
  for (const p of players) hands[p] = [];
  for (let i = 0; i < 4; i++) for (const p of players) hands[p].push({ ...deck.pop(), knownBy: [], slot: i });
    upsertRoom(code, {
      version: GAME_VERSION,
      status: 'started',
      startedAt: Date.now(),
      turn: 0,
      deck,
      discard: [],
      hands,
      drawn: null,
      finalScores: null,
      cambio: null,
    });
    render();
  }

  // Listen across tabs and re-render (do not overwrite per-tab name)
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === CLIENT_ROOM_KEY) {
      try {
        state.roomId = localStorage.getItem(CLIENT_ROOM_KEY) || state.roomId;
      } catch {}
      render();
    }
  });

  render();
})();
