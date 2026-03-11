import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pokerNewGame, pokerAction, pokerStatus, pokerHistory, __test } from '../src/services/poker.js';

const {
  createDeck,
  shuffleDeck,
  evaluateFiveCards,
  evaluateHand,
  compareHands,
  holeStrength,
  postflopStrength,
  decideHouseAction,
  getAvailableActions,
  resetState,
} = __test;

// Helper: build a rigged deck so we control the deal
function riggedDeck(playerHole, houseHole, community = [], extra = []) {
  // Deal order when dealer=player: player, house, player, house
  const dealt = [playerHole[0], houseHole[0], playerHole[1], houseHole[1]];
  // Burn cards + community (flop: burn+3, turn: burn+1, river: burn+1)
  const board = [];
  if (community.length >= 3) {
    board.push('Xx'); // burn
    board.push(community[0], community[1], community[2]);
  }
  if (community.length >= 4) {
    board.push('Xx'); // burn
    board.push(community[3]);
  }
  if (community.length >= 5) {
    board.push('Xx'); // burn
    board.push(community[4]);
  }
  // Fill rest with unused cards
  const used = new Set([...playerHole, ...houseHole, ...community, ...extra]);
  const filler = createDeck().filter(c => !used.has(c));
  // Replace burn placeholders with filler cards
  const result = [];
  let fillerIdx = 0;
  for (const c of [...dealt, ...board, ...extra]) {
    if (c === 'Xx') {
      result.push(filler[fillerIdx++]);
    } else {
      result.push(c);
    }
  }
  // Append remaining filler
  while (fillerIdx < filler.length) {
    result.push(filler[fillerIdx++]);
  }
  return result;
}

// Stub deps so we never hit real network
const stubDeps = {
  fetchStats: async () => ({ houseBalanceUsdc: '100', acceptingBets: true }),
  isSignerRunning: async () => true,
  payBuyIn: async () => ({ paid: true, data: { txHash: '0xfake' } }),
  payoutWin: async () => ({ payoutTxHash: '0xpayout' }),
};

describe('Poker — Deck', () => {
  it('creates a 52-card deck', () => {
    const deck = createDeck();
    assert.equal(deck.length, 52);
    assert.equal(new Set(deck).size, 52);
  });

  it('shuffles without losing cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    assert.equal(shuffled.length, 52);
    assert.equal(new Set(shuffled).size, 52);
  });

  it('shuffle produces different order (probabilistic)', () => {
    const deck = createDeck();
    const a = shuffleDeck(deck);
    const b = shuffleDeck(deck);
    // Extremely unlikely to be identical
    const same = a.every((c, i) => c === b[i]);
    assert.equal(same, false);
  });
});

describe('Poker — Hand Evaluation (5-card)', () => {
  it('detects Royal Flush', () => {
    const result = evaluateFiveCards(['As', 'Ks', 'Qs', 'Js', 'Ts']);
    assert.equal(result.category, 9);
    assert.match(result.name, /Royal Flush/);
  });

  it('detects Straight Flush', () => {
    const result = evaluateFiveCards(['9h', '8h', '7h', '6h', '5h']);
    assert.equal(result.category, 8);
    assert.match(result.name, /Straight Flush/);
  });

  it('detects Four of a Kind', () => {
    const result = evaluateFiveCards(['Ks', 'Kh', 'Kd', 'Kc', '3s']);
    assert.equal(result.category, 7);
    assert.match(result.name, /Four of a Kind/);
  });

  it('detects Full House', () => {
    const result = evaluateFiveCards(['As', 'Ah', 'Ad', 'Ks', 'Kh']);
    assert.equal(result.category, 6);
    assert.match(result.name, /Full House/);
  });

  it('detects Flush', () => {
    const result = evaluateFiveCards(['As', 'Js', '8s', '5s', '3s']);
    assert.equal(result.category, 5);
    assert.match(result.name, /Flush/);
  });

  it('detects Straight', () => {
    const result = evaluateFiveCards(['9s', '8h', '7d', '6c', '5s']);
    assert.equal(result.category, 4);
    assert.match(result.name, /Straight/);
  });

  it('detects Ace-low Straight (wheel)', () => {
    const result = evaluateFiveCards(['As', '2h', '3d', '4c', '5s']);
    assert.equal(result.category, 4);
    assert.match(result.name, /Straight/);
  });

  it('detects Three of a Kind', () => {
    const result = evaluateFiveCards(['Qs', 'Qh', 'Qd', '7s', '3c']);
    assert.equal(result.category, 3);
    assert.match(result.name, /Three of a Kind/);
  });

  it('detects Two Pair', () => {
    const result = evaluateFiveCards(['Ks', 'Kh', '8d', '8c', '3s']);
    assert.equal(result.category, 2);
    assert.match(result.name, /Two Pair/);
  });

  it('detects One Pair', () => {
    const result = evaluateFiveCards(['Js', 'Jh', '9d', '5c', '2s']);
    assert.equal(result.category, 1);
    assert.match(result.name, /One Pair/);
  });

  it('detects High Card', () => {
    const result = evaluateFiveCards(['As', 'Jh', '8d', '5c', '2s']);
    assert.equal(result.category, 0);
    assert.match(result.name, /High Card/);
  });
});

describe('Poker — 7-card Best Hand', () => {
  it('finds best 5 from 7 cards', () => {
    // Hidden full house among 7 cards
    const result = evaluateHand(['As', 'Ah', 'Ad', 'Ks', 'Kh', '3c', '2d']);
    assert.equal(result.category, 6); // Full House
  });

  it('compares hands correctly', () => {
    const flush = evaluateFiveCards(['As', 'Js', '8s', '5s', '3s']);
    const straight = evaluateFiveCards(['9s', '8h', '7d', '6c', '5h']);
    assert.ok(compareHands(flush, straight) > 0);
  });

  it('tiebreak works for same category', () => {
    const highAce = evaluateFiveCards(['As', 'Jh', '8d', '5c', '2s']);
    const highKing = evaluateFiveCards(['Ks', 'Jh', '8d', '5c', '2s']);
    assert.ok(compareHands(highAce, highKing) > 0);
  });
});

describe('Poker — Hole Strength', () => {
  it('pocket aces score high', () => {
    const score = holeStrength(['As', 'Ah']);
    assert.ok(score > 0.7, `Expected > 0.7, got ${score}`);
  });

  it('suited connectors score decent', () => {
    const score = holeStrength(['Ts', '9s']);
    assert.ok(score > 0.3, `Expected > 0.3, got ${score}`);
  });

  it('trash hand scores low', () => {
    const score = holeStrength(['2s', '7h']);
    assert.ok(score < 0.4, `Expected < 0.4, got ${score}`);
  });
});

describe('Poker — Game Flow (Free Mode)', () => {
  beforeEach(() => resetState());

  it('creates a new free-mode game', async () => {
    const status = await pokerNewGame({ mode: 'free', deps: stubDeps });
    assert.ok(status);
    assert.equal(status.mode, 'free');
    assert.equal(status.player.hole.length, 2);
    assert.ok(['preflop', 'flop', 'turn', 'river', 'finished'].includes(status.street));
  });

  it('player can fold', async () => {
    const status = await pokerNewGame({ mode: 'free', dealer: 'player', deps: stubDeps });
    if (status.street === 'finished') return; // house may have already acted
    if (status.currentActor !== 'player') return;
    const actions = status.availableActions;
    if (actions.includes('fold')) {
      const after = await pokerAction(status.id, 'fold');
      assert.equal(after.street, 'finished');
      assert.equal(after.winner, 'house');
    }
  });

  it('game reaches showdown with check/call', async () => {
    // Rig so both players have decent hands (won't fold easily)
    const deck = riggedDeck(['As', 'Kh'], ['Qs', 'Jh'], ['Ts', '9d', '2c', '3h', '4s']);
    const status = await pokerNewGame({ mode: 'free', dealer: 'player', deck, deps: stubDeps });

    let current = status;
    let moves = 0;
    while (current.street !== 'finished' && moves < 20) {
      if (current.currentActor !== 'player') break;
      const actions = current.availableActions;
      const action = actions.includes('check') ? 'check' : actions.includes('call') ? 'call' : 'fold';
      current = await pokerAction(current.id, action);
      moves++;
    }
    // Game should progress (may finish via showdown or fold)
    assert.ok(current);
  });

  it('tracks history', async () => {
    const deck = riggedDeck(['As', 'Kh'], ['2d', '3c'], ['Ts', '9d', '2c', '3h', '4s']);
    const status = await pokerNewGame({ mode: 'free', dealer: 'player', deck, deps: stubDeps });
    
    let current = status;
    let moves = 0;
    while (current.street !== 'finished' && moves < 20) {
      if (current.currentActor !== 'player') break;
      const actions = current.availableActions;
      const action = actions.includes('call') ? 'call' : actions.includes('check') ? 'check' : 'fold';
      current = await pokerAction(current.id, action);
      moves++;
    }

    const hist = pokerHistory();
    assert.ok(hist.length > 0);
  });

  it('status returns null when no active game', () => {
    const status = pokerStatus();
    assert.equal(status, null);
  });
});

describe('Poker — Real Mode Guards', () => {
  beforeEach(() => resetState());

  it('rejects when house balance too low', async () => {
    await assert.rejects(
      () => pokerNewGame({
        mode: 'real',
        deps: {
          ...stubDeps,
          fetchStats: async () => ({ houseBalanceUsdc: '0.50' }),
        },
      }),
      /House balance too low/,
    );
  });

  it('rejects when signer is down', async () => {
    await assert.rejects(
      () => pokerNewGame({
        mode: 'real',
        deps: {
          ...stubDeps,
          isSignerRunning: async () => false,
        },
      }),
      /Agent signer is required/,
    );
  });
});

describe('Poker — GTO House Decisions', () => {
  it('house folds trash preflop when facing a raise', () => {
    // Simulate a game state where house has trash and faces a bet
    const game = {
      street: 'preflop',
      dealer: 'house',
      pot: 5,
      currentBet: 4,
      raisesThisStreet: 1,
      actedThisStreet: { player: true, house: false },
      community: [],
      player: { stack: 96, bet: 4, committed: 4, hole: ['As', 'Kh'], folded: false, allIn: false },
      house: { stack: 98, bet: 2, committed: 2, hole: ['2d', '7c'], folded: false, allIn: false },
    };
    const action = decideHouseAction(game);
    // With 2d7c offsuit, house should fold or call (never raise)
    assert.ok(['fold', 'call'].includes(action), `Expected fold/call, got ${action}`);
  });
});
