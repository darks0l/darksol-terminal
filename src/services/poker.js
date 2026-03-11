import { randomUUID } from 'crypto';
import { fetchJSON } from '../utils/fetch.js';
import { getServiceURL, getConfig } from '../config/store.js';
import { isSignerRunning, fetchWithX402 } from '../utils/x402.js';

const getURL = () => getServiceURL('casino') || 'https://casino.darksol.net';

const SUITS = ['s', 'h', 'd', 'c'];
const SUIT_NAMES = { s: 'Spades', h: 'Hearts', d: 'Diamonds', c: 'Clubs' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_TO_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const VALUE_TO_RANK = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
const HAND_LABELS = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Royal Flush',
];
const STARTING_STACK = 100;
const SMALL_BLIND = 1;
const BIG_BLIND = 2;
const DEFAULT_BUY_IN_USDC = 1;
const DEFAULT_PAYOUT_USDC = 2;
const MAX_HISTORY = 20;

const games = new Map();
const history = [];
let dealerToggle = 'player';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

function shuffleDeck(deck, random = Math.random) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function parseCard(card) {
  const rank = card[0];
  const suit = card[1];
  return { card, rank, suit, value: RANK_TO_VALUE[rank] };
}

function cardList(cards) {
  return cards.map(parseCard);
}

function compareArrays(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function combinations(items, size) {
  const result = [];
  const combo = [];
  function walk(start, remaining) {
    if (remaining === 0) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i <= items.length - remaining; i++) {
      combo.push(items[i]);
      walk(i + 1, remaining - 1);
      combo.pop();
    }
  }
  walk(0, size);
  return result;
}

function pluralRank(value) {
  const name = VALUE_TO_RANK[value];
  if (name === '6') return 'Sixes';
  if (name === '5') return 'Fives';
  if (name === '4') return 'Fours';
  if (name === '3') return 'Threes';
  if (name === '2') return 'Twos';
  if (name === 'T') return 'Tens';
  if (name === 'J') return 'Jacks';
  if (name === 'Q') return 'Queens';
  if (name === 'K') return 'Kings';
  if (name === 'A') return 'Aces';
  return `${name}s`;
}

function singularRank(value) {
  const name = VALUE_TO_RANK[value];
  if (name === 'T') return 'Ten';
  if (name === 'J') return 'Jack';
  if (name === 'Q') return 'Queen';
  if (name === 'K') return 'King';
  if (name === 'A') return 'Ace';
  return name;
}

function straightHigh(values) {
  const uniq = [...new Set(values)].sort((a, b) => b - a);
  if (uniq.includes(14)) uniq.push(1);
  for (let i = 0; i <= uniq.length - 5; i++) {
    let ok = true;
    for (let j = 1; j < 5; j++) {
      if (uniq[i + j] !== uniq[i] - j) {
        ok = false;
        break;
      }
    }
    if (ok) return uniq[i] === 1 ? 5 : uniq[i];
  }
  return null;
}

function evaluateFiveCards(cards) {
  const parsed = cardList(cards).sort((a, b) => b.value - a.value);
  const values = parsed.map(c => c.value);
  const suits = parsed.map(c => c.suit);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  const isFlush = suits.every(s => s === suits[0]);
  const straight = straightHigh(values);
  const topValues = values.slice().sort((a, b) => b - a);

  if (isFlush && straight === 14) {
    return {
      category: 9,
      label: HAND_LABELS[9],
      name: 'Royal Flush',
      tiebreak: [14],
      cards,
    };
  }

  if (isFlush && straight) {
    return {
      category: 8,
      label: HAND_LABELS[8],
      name: `Straight Flush, ${singularRank(straight)} high`,
      tiebreak: [straight],
      cards,
    };
  }

  if (groups[0][1] === 4) {
    return {
      category: 7,
      label: HAND_LABELS[7],
      name: `Four of a Kind, ${pluralRank(groups[0][0])}`,
      tiebreak: [groups[0][0], groups[1][0]],
      cards,
    };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return {
      category: 6,
      label: HAND_LABELS[6],
      name: `Full House, ${pluralRank(groups[0][0])} over ${pluralRank(groups[1][0])}`,
      tiebreak: [groups[0][0], groups[1][0]],
      cards,
    };
  }

  if (isFlush) {
    return {
      category: 5,
      label: HAND_LABELS[5],
      name: `${SUIT_NAMES[suits[0]]} Flush, ${singularRank(topValues[0])} high`,
      tiebreak: topValues,
      cards,
    };
  }

  if (straight) {
    return {
      category: 4,
      label: HAND_LABELS[4],
      name: `Straight, ${singularRank(straight)} high`,
      tiebreak: [straight],
      cards,
    };
  }

  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map(([value]) => value).sort((a, b) => b - a);
    return {
      category: 3,
      label: HAND_LABELS[3],
      name: `Three of a Kind, ${pluralRank(groups[0][0])}`,
      tiebreak: [groups[0][0], ...kickers],
      cards,
    };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairValues = groups.filter(([, count]) => count === 2).map(([value]) => value).sort((a, b) => b - a);
    const kicker = groups.find(([, count]) => count === 1)[0];
    return {
      category: 2,
      label: HAND_LABELS[2],
      name: `Two Pair, ${pluralRank(pairValues[0])} and ${pluralRank(pairValues[1])}`,
      tiebreak: [...pairValues, kicker],
      cards,
    };
  }

  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map(([value]) => value).sort((a, b) => b - a);
    return {
      category: 1,
      label: HAND_LABELS[1],
      name: `One Pair, ${pluralRank(groups[0][0])}`,
      tiebreak: [groups[0][0], ...kickers],
      cards,
    };
  }

  return {
    category: 0,
    label: HAND_LABELS[0],
    name: `High Card, ${singularRank(topValues[0])}`,
    tiebreak: topValues,
    cards,
  };
}

function evaluateHand(cards) {
  if (cards.length < 5) {
    throw new Error('Need at least five cards to evaluate a hand');
  }
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const eval5 = evaluateFiveCards(combo);
    if (!best) {
      best = eval5;
      continue;
    }
    if (eval5.category > best.category || (eval5.category === best.category && compareArrays(eval5.tiebreak, best.tiebreak) > 0)) {
      best = eval5;
    }
  }
  return best;
}

function compareHands(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  return compareArrays(a.tiebreak, b.tiebreak);
}

function activePlayer(game, actor) {
  return actor === 'player' ? game.player : game.house;
}

function opponent(game, actor) {
  return actor === 'player' ? game.house : game.player;
}

function nextStreet(street) {
  if (street === 'preflop') return 'flop';
  if (street === 'flop') return 'turn';
  if (street === 'turn') return 'river';
  if (street === 'river') return 'showdown';
  return 'finished';
}

function postBlind(game, actor, amount) {
  const seat = activePlayer(game, actor);
  const paid = Math.min(seat.stack, amount);
  seat.stack -= paid;
  seat.bet += paid;
  seat.committed += paid;
  if (seat.stack === 0) seat.allIn = true;
  game.pot += paid;
}

function dealOne(game) {
  const card = game.deck.shift();
  if (!card) throw new Error('Deck exhausted');
  return card;
}

function dealHoleCards(game) {
  const order = game.dealer === 'player' ? ['player', 'house', 'player', 'house'] : ['house', 'player', 'house', 'player'];
  for (const actor of order) {
    activePlayer(game, actor).hole.push(dealOne(game));
  }
}

function burn(game) {
  game.deck.shift();
}

function dealBoard(game, count) {
  burn(game);
  for (let i = 0; i < count; i++) {
    game.community.push(dealOne(game));
  }
}

function getToCall(game, actor) {
  const seat = activePlayer(game, actor);
  const opp = opponent(game, actor);
  return Math.max(0, opp.bet - seat.bet);
}

function fixedBetSize(game) {
  return game.street === 'turn' || game.street === 'river' ? BIG_BLIND * 2 : BIG_BLIND;
}

function plannedBetSize(game, actor, intent = 'bet') {
  const seat = activePlayer(game, actor);
  const toCall = getToCall(game, actor);
  const base = fixedBetSize(game);
  const potHalf = Math.max(base, Math.round(game.pot / 2));
  const target = intent === 'raise'
    ? Math.max(base * 2, toCall + potHalf)
    : potHalf;
  return Math.max(base, Math.min(target, seat.stack));
}

function getAvailableActions(game, actor = game.currentActor) {
  if (!actor || !['player', 'house'].includes(actor)) return [];
  if (game.street === 'finished' || game.street === 'showdown') return [];
  const seat = activePlayer(game, actor);
  const toCall = getToCall(game, actor);
  const actions = [];

  if (toCall > 0) {
    actions.push('fold');
    actions.push('call');
    if (!seat.allIn && !opponent(game, actor).allIn && seat.stack > toCall && game.raisesThisStreet < 2) {
      actions.push('raise');
    }
  } else {
    actions.push('check');
    if (!seat.allIn && !opponent(game, actor).allIn && seat.stack > 0) {
      actions.push('bet');
    }
  }

  if (!seat.allIn && seat.stack > 0) {
    actions.push('all-in');
  }

  return [...new Set(actions)];
}

function rankStrength(category) {
  return category / 9;
}

function holeStrength(hole) {
  const [a, b] = cardList(hole).sort((x, y) => y.value - x.value);
  const pair = a.value === b.value;
  const suited = a.suit === b.suit;
  const gap = Math.abs(a.value - b.value);
  let score = 0;

  if (pair) score += 0.45 + (a.value / 14) * 0.4;
  else score += (a.value + b.value) / 40;

  if (suited) score += 0.08;
  if (gap === 1) score += 0.08;
  if (gap === 2) score += 0.04;
  if (a.value >= 13) score += 0.08;
  if (b.value >= 11) score += 0.05;
  if (a.value >= 10 && b.value >= 10) score += 0.08;

  return Math.min(score, 1);
}

function getDrawProfile(cards) {
  const parsed = cardList(cards);
  const suitCounts = parsed.reduce((acc, card) => {
    acc[card.suit] = (acc[card.suit] || 0) + 1;
    return acc;
  }, {});
  const flushDraw = Object.values(suitCounts).some(count => count === 4);

  const values = [...new Set(parsed.map(card => card.value))].sort((a, b) => a - b);
  if (values.includes(14)) values.unshift(1);
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] === values[i - 1] + 1) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else if (values[i] !== values[i - 1]) {
      run = 1;
    }
  }
  const openEnded = maxRun >= 4;
  const gutshot = !openEnded && maxRun >= 3;
  return { flushDraw, openEnded, gutshot };
}

function postflopStrength(hole, community) {
  const cards = [...hole, ...community];
  const made = evaluateHand(cards);
  const draw = getDrawProfile(cards);
  const holeVals = cardList(hole).map(card => card.value).sort((a, b) => b - a);
  const boardVals = cardList(community).map(card => card.value).sort((a, b) => b - a);
  const topPair = made.category === 1 && holeVals.some(value => value === boardVals[0]);

  let equity = rankStrength(made.category);
  if (topPair) equity += 0.12;
  if (draw.flushDraw) equity += 0.16;
  if (draw.openEnded) equity += 0.13;
  if (draw.gutshot) equity += 0.06;
  if (holeVals[0] >= 13 && holeVals[1] >= 10) equity += 0.04;

  return {
    made,
    draw,
    equity: Math.min(equity, 1),
  };
}

function decideHouseAction(game) {
  const actions = getAvailableActions(game, 'house');
  const toCall = getToCall(game, 'house');
  const potOdds = toCall > 0 ? toCall / (game.pot + toCall) : 0;
  const position = game.dealer === 'house'
    ? (game.street === 'preflop' ? 'button' : 'in_position')
    : (game.street === 'preflop' ? 'big_blind' : 'out_of_position');

  if (game.street === 'preflop') {
    const score = holeStrength(game.house.hole);
    const openThreshold = position === 'button' ? 0.42 : 0.58;
    const raiseThreshold = position === 'button' ? 0.68 : 0.74;
    const defendThreshold = Math.min(0.7, potOdds + (position === 'big_blind' ? 0.14 : 0.2));

    if (toCall === 0) {
      if (actions.includes('bet') && score >= openThreshold) return 'bet';
      return actions.includes('check') ? 'check' : actions[0];
    }

    if (actions.includes('raise') && score >= raiseThreshold) return 'raise';
    if (score >= defendThreshold || (actions.includes('call') && score >= 0.4 && toCall <= BIG_BLIND * 2)) return 'call';
    return actions.includes('fold') ? 'fold' : 'call';
  }

  const strength = postflopStrength(game.house.hole, game.community);
  if (toCall === 0) {
    if ((strength.equity >= 0.72 || (strength.draw.flushDraw && strength.equity >= 0.48)) && actions.includes('bet')) {
      return 'bet';
    }
    return actions.includes('check') ? 'check' : actions[0];
  }

  if (actions.includes('raise') && strength.equity >= Math.max(0.78, potOdds + 0.28)) {
    return 'raise';
  }
  if (actions.includes('call') && strength.equity >= Math.max(0.24, potOdds * 0.95)) {
    return 'call';
  }
  return actions.includes('fold') ? 'fold' : 'call';
}

function resetStreet(game) {
  game.player.bet = 0;
  game.house.bet = 0;
  game.currentBet = 0;
  game.raisesThisStreet = 0;
  game.actedThisStreet = { player: false, house: false };
}

function setCurrentActor(game, actor) {
  game.currentActor = actor;
}

async function settleRealPayout(game) {
  if (game.mode !== 'real' || game.winner !== 'player') return;
  const data = await game.deps.payoutWin({
    gameId: game.id,
    buyInUsdc: game.buyInUsdc,
    payoutUsdc: game.payoutUsdc,
    agentWallet: game.agentWallet,
    hand: game.summary,
  }, game);
  game.payment = {
    ...game.payment,
    payoutTxHash: data?.payoutTxHash || data?.txHash || null,
    payoutReceipt: data || null,
  };
}

function finishGame(game, winner, reason) {
  game.street = 'finished';
  game.currentActor = null;
  game.winner = winner;
  game.result = reason;

  const winnerSeat = winner === 'player' ? game.player : game.house;
  winnerSeat.stack += game.pot;

  if (reason === 'showdown') {
    const playerEval = evaluateHand([...game.player.hole, ...game.community]);
    const houseEval = evaluateHand([...game.house.hole, ...game.community]);
    game.player.hand = playerEval;
    game.house.hand = houseEval;
    game.summary = winner === 'player'
      ? `You win with ${playerEval.name} against ${houseEval.name}`
      : `House wins with ${houseEval.name} against ${playerEval.name}`;
  } else {
    game.summary = winner === 'player' ? 'House folded' : 'You folded';
  }

  if (game.winner === 'player' || game.winner === 'house') {
    history.unshift({
      id: game.id,
      mode: game.mode,
      winner: game.winner,
      result: game.result,
      summary: game.summary,
      pot: game.pot,
      community: game.community.slice(),
      playerHole: game.player.hole.slice(),
      houseHole: game.house.hole.slice(),
      payoutUsdc: game.mode === 'real' && game.winner === 'player' ? game.payoutUsdc : 0,
      createdAt: game.createdAt,
      completedAt: new Date().toISOString(),
    });
    history.splice(MAX_HISTORY);
  }
}

function showdown(game) {
  game.street = 'showdown';
  const playerEval = evaluateHand([...game.player.hole, ...game.community]);
  const houseEval = evaluateHand([...game.house.hole, ...game.community]);
  game.player.hand = playerEval;
  game.house.hand = houseEval;
  const cmp = compareHands(playerEval, houseEval);
  if (cmp > 0) finishGame(game, 'player', 'showdown');
  else if (cmp < 0) finishGame(game, 'house', 'showdown');
  else {
    game.street = 'finished';
    game.currentActor = null;
    game.winner = 'push';
    game.result = 'push';
    const split = Math.floor(game.pot / 2);
    game.player.stack += split;
    game.house.stack += game.pot - split;
    game.summary = `Split pot with ${playerEval.name}`;
    history.unshift({
      id: game.id,
      mode: game.mode,
      winner: 'push',
      result: 'push',
      summary: game.summary,
      pot: game.pot,
      community: game.community.slice(),
      playerHole: game.player.hole.slice(),
      houseHole: game.house.hole.slice(),
      payoutUsdc: 0,
      createdAt: game.createdAt,
      completedAt: new Date().toISOString(),
    });
    history.splice(MAX_HISTORY);
  }
}

function dealRemainingBoard(game) {
  while (game.community.length < 5) {
    if (game.community.length === 0) dealBoard(game, 3);
    else dealBoard(game, 1);
  }
}

function advanceStreet(game) {
  if (game.player.folded || game.house.folded) return;
  if (game.player.allIn || game.house.allIn) {
    dealRemainingBoard(game);
    showdown(game);
    return;
  }

  const next = nextStreet(game.street);
  if (next === 'showdown') {
    showdown(game);
    return;
  }

  game.street = next;
  resetStreet(game);
  if (next === 'flop') dealBoard(game, 3);
  else if (next === 'turn' || next === 'river') dealBoard(game, 1);

  const firstActor = game.dealer === 'player' ? 'house' : 'player';
  setCurrentActor(game, firstActor);
}

function applyActionInternal(game, actor, action) {
  if (game.currentActor !== actor) {
    throw new Error(`It is not ${actor}'s turn`);
  }
  const seat = activePlayer(game, actor);
  const opp = opponent(game, actor);
  const available = getAvailableActions(game, actor);
  if (!available.includes(action)) {
    throw new Error(`Action "${action}" is not available`);
  }

  const toCall = getToCall(game, actor);
  let amount = 0;

  if (action === 'fold') {
    seat.folded = true;
    seat.lastAction = 'fold';
    game.actionLog.push({ actor, action, street: game.street, amount: 0 });
    finishGame(game, actor === 'player' ? 'house' : 'player', 'fold');
    return;
  }

  if (action === 'check') {
    seat.lastAction = 'check';
    game.actedThisStreet[actor] = true;
    game.actionLog.push({ actor, action, street: game.street, amount: 0 });
  } else if (action === 'call') {
    amount = Math.min(seat.stack, toCall);
    seat.stack -= amount;
    seat.bet += amount;
    seat.committed += amount;
    if (seat.stack === 0) seat.allIn = true;
    game.pot += amount;
    seat.lastAction = 'call';
    game.actedThisStreet[actor] = true;
    game.actionLog.push({ actor, action, street: game.street, amount });
  } else if (action === 'bet' || action === 'raise') {
    const betSize = plannedBetSize(game, actor, action);
    amount = Math.min(seat.stack, action === 'raise' ? toCall + betSize : betSize);
    seat.stack -= amount;
    seat.bet += amount;
    seat.committed += amount;
    if (seat.stack === 0) seat.allIn = true;
    game.pot += amount;
    game.currentBet = Math.max(game.currentBet, seat.bet);
    seat.lastAction = action;
    game.raisesThisStreet += 1;
    game.actedThisStreet[actor] = true;
    game.actedThisStreet[actor === 'player' ? 'house' : 'player'] = false;
    game.actionLog.push({ actor, action, street: game.street, amount });
  } else if (action === 'all-in') {
    amount = seat.stack;
    seat.stack = 0;
    seat.bet += amount;
    seat.committed += amount;
    seat.allIn = true;
    game.pot += amount;
    seat.lastAction = 'all-in';
    if (seat.bet > opp.bet) {
      game.raisesThisStreet += 1;
      game.actedThisStreet[actor] = true;
      game.actedThisStreet[actor === 'player' ? 'house' : 'player'] = false;
    } else {
      game.actedThisStreet[actor] = true;
    }
    game.currentBet = Math.max(game.currentBet, seat.bet);
    game.actionLog.push({ actor, action, street: game.street, amount });
  }

  if (game.street === 'finished') return;

  if (seat.folded || opp.folded) return;

  if (seat.allIn && opp.allIn) {
    dealRemainingBoard(game);
    showdown(game);
    return;
  }

  if (seat.bet === opp.bet && game.actedThisStreet.player && game.actedThisStreet.house) {
    advanceStreet(game);
    return;
  }

  setCurrentActor(game, actor === 'player' ? 'house' : 'player');
}

async function autoPlayHouse(game) {
  while (game.currentActor === 'house' && game.street !== 'finished') {
    const action = decideHouseAction(game);
    applyActionInternal(game, 'house', action);
  }
  if (game.street === 'finished' && game.mode === 'real' && game.winner === 'player' && !game.payment?.payoutReceipt && !game.payment?.payoutError) {
    try {
      await settleRealPayout(game);
    } catch (err) {
      game.payment = { ...game.payment, payoutError: err.message };
    }
  }
}

function serializeGame(game) {
  const revealHouse = game.street === 'finished' || game.street === 'showdown';
  return {
    id: game.id,
    mode: game.mode,
    buyInUsdc: game.buyInUsdc,
    payoutUsdc: game.payoutUsdc,
    agentWallet: game.agentWallet || null,
    street: game.street,
    dealer: game.dealer,
    currentActor: game.currentActor,
    pot: game.pot,
    community: game.community.slice(),
    currentBet: Math.max(game.player.bet, game.house.bet),
    availableActions: getAvailableActions(game, 'player'),
    player: {
      stack: game.player.stack,
      bet: game.player.bet,
      committed: game.player.committed,
      hole: game.player.hole.slice(),
      hand: game.player.hand ? clone(game.player.hand) : null,
      lastAction: game.player.lastAction || null,
    },
    house: {
      stack: game.house.stack,
      bet: game.house.bet,
      committed: game.house.committed,
      hole: revealHouse ? game.house.hole.slice() : ['??', '??'],
      holeHidden: !revealHouse,
      hand: revealHouse && game.house.hand ? clone(game.house.hand) : null,
      lastAction: game.house.lastAction || null,
    },
    winner: game.winner || null,
    result: game.result || null,
    summary: game.summary || null,
    actionLog: game.actionLog.slice(),
    payment: game.payment ? clone(game.payment) : null,
    createdAt: game.createdAt,
  };
}

async function resolveAgentWallet(opts = {}) {
  if (opts.wallet) return opts.wallet;
  const activeWallet = getConfig('activeWallet');
  if (!activeWallet) return null;
  try {
    const { loadWallet } = await import('../wallet/keystore.js');
    return loadWallet(activeWallet).address;
  } catch {
    return null;
  }
}

function getSignerToken() {
  return process.env.DARKSOL_SIGNER_TOKEN || getConfig('signerToken') || null;
}

function buildDeps(overrides = {}) {
  return {
    fetchStats: async () => fetchJSON(`${getURL()}/api/stats`),
    isSignerRunning: async (token) => isSignerRunning(token),
    payBuyIn: async (payload) => fetchWithX402(
      `${getURL()}/api/poker/buyin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      { signerToken: payload.signerToken, autoSign: true },
    ),
    payoutWin: async (payload) => fetchJSON(`${getURL()}/api/poker/payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    ...overrides,
  };
}

async function prepareRealMode(game, opts) {
  const stats = await game.deps.fetchStats();
  const houseBalance = Number(stats?.houseBalanceUsdc || 0);
  if (houseBalance < game.payoutUsdc) {
    throw new Error('House balance too low for payouts. Try free mode!');
  }

  const signerToken = getSignerToken();
  const signerUp = await game.deps.isSignerRunning(signerToken);
  if (!signerUp) {
    throw new Error('Agent signer is required for real-mode poker. Start it with: darksol agent start <wallet-name>');
  }

  const agentWallet = await resolveAgentWallet(opts);
  if (!agentWallet) {
    throw new Error('A wallet address is required for real-mode poker payouts.');
  }

  const payment = await game.deps.payBuyIn({
    gameId: game.id,
    mode: game.mode,
    buyInUsdc: game.buyInUsdc,
    agentWallet,
    signerToken,
  }, game);

  if (payment?.error) {
    throw new Error(payment.error);
  }

  game.agentWallet = agentWallet;
  game.payment = {
    paid: !!payment?.paid,
    paymentReceipt: payment?.data || null,
  };
}

export async function pokerNewGame(opts = {}) {
  const mode = opts.mode === 'real' ? 'real' : 'free';
  const id = opts.gameId || randomUUID();
  const dealer = opts.dealer || dealerToggle;
  dealerToggle = dealerToggle === 'player' ? 'house' : 'player';

  const deck = opts.deck ? opts.deck.slice() : shuffleDeck(createDeck(), opts.random || Math.random);
  const game = {
    id,
    mode,
    buyInUsdc: Number(opts.buyInUsdc || DEFAULT_BUY_IN_USDC),
    payoutUsdc: Number(opts.payoutUsdc || DEFAULT_PAYOUT_USDC),
    createdAt: new Date().toISOString(),
    dealer,
    street: 'preflop',
    currentActor: null,
    pot: 0,
    currentBet: BIG_BLIND,
    raisesThisStreet: 0,
    actedThisStreet: { player: false, house: false },
    community: [],
    deck,
    player: { stack: STARTING_STACK, bet: 0, committed: 0, hole: [], folded: false, allIn: false, lastAction: null, hand: null },
    house: { stack: STARTING_STACK, bet: 0, committed: 0, hole: [], folded: false, allIn: false, lastAction: null, hand: null },
    actionLog: [],
    winner: null,
    result: null,
    summary: null,
    payment: null,
    agentWallet: null,
    deps: buildDeps(opts.deps),
  };

  if (mode === 'real') {
    await prepareRealMode(game, opts);
  }

  dealHoleCards(game);

  if (dealer === 'player') {
    postBlind(game, 'player', SMALL_BLIND);
    postBlind(game, 'house', BIG_BLIND);
    setCurrentActor(game, 'player');
  } else {
    postBlind(game, 'house', SMALL_BLIND);
    postBlind(game, 'player', BIG_BLIND);
    setCurrentActor(game, 'house');
  }

  games.set(id, game);
  await autoPlayHouse(game);
  return pokerStatus(id);
}

export async function pokerAction(gameId, action) {
  const game = games.get(gameId);
  if (!game) throw new Error(`Poker game not found: ${gameId}`);
  if (game.street === 'finished') return pokerStatus(gameId);
  if (game.currentActor !== 'player') throw new Error('It is not your turn');

  applyActionInternal(game, 'player', String(action || '').toLowerCase());
  await autoPlayHouse(game);
  return pokerStatus(gameId);
}

export function pokerStatus(gameId) {
  if (!gameId) {
    const active = [...games.values()].find(game => game.street !== 'finished');
    return active ? serializeGame(active) : null;
  }
  const game = games.get(gameId);
  return game ? serializeGame(game) : null;
}

export function pokerHistory() {
  return history.map(item => clone(item));
}

export const __test = {
  createDeck,
  shuffleDeck,
  evaluateFiveCards,
  evaluateHand,
  compareHands,
  holeStrength,
  postflopStrength,
  decideHouseAction,
  getAvailableActions,
  resetState: () => {
    games.clear();
    history.length = 0;
    dealerToggle = 'player';
  },
};
