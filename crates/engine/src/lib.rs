use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use wasm_bindgen::prelude::*;

pub mod eval {
    pub type Card = u8;

    pub fn card(rank: u8, suit: u8) -> Card {
        rank * 4 + suit
    }

    pub fn rank(c: Card) -> u8 {
        c / 4
    }

    pub fn suit(c: Card) -> u8 {
        c % 4
    }

    fn enc(category: u64, ranks: &[u8]) -> u64 {
        let mut out = category * 1_000_000;
        for i in 0..5 {
            out = out * 15 + ranks.get(i).map_or(0, |r| u64::from(*r) + 2);
        }
        out
    }

    pub fn evaluate5(cards: &[Card]) -> u64 {
        assert_eq!(cards.len(), 5);
        let mut ranks = [0u8; 5];
        let mut suits = [0u8; 5];
        for (i, c) in cards.iter().enumerate() {
            ranks[i] = rank(*c);
            suits[i] = suit(*c);
        }
        ranks.sort_by(|a, b| b.cmp(a));
        let flush = suits.iter().all(|s| *s == suits[0]);
        let mut count = [0u8; 13];
        for r in ranks {
            count[r as usize] += 1;
        }
        let mut groups: Vec<(u8, u8)> = (0..13)
            .filter_map(|r| {
                let c = count[r];
                (c > 0).then_some((r as u8, c))
            })
            .collect();
        groups.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
        let mut uniq: Vec<u8> = groups.iter().map(|(r, _)| *r).collect();
        uniq.sort_by(|a, b| b.cmp(a));
        let wheel = uniq == [12, 3, 2, 1, 0];
        let straight_high = if wheel {
            Some(3)
        } else if uniq.len() == 5 && uniq[0] - uniq[4] == 4 {
            Some(uniq[0])
        } else {
            None
        };
        if let (true, Some(high)) = (flush, straight_high) {
            return enc(8, &[high]);
        }
        if groups[0].1 == 4 {
            return enc(7, &[groups[0].0, groups[1].0]);
        }
        if groups[0].1 == 3 && groups[1].1 == 2 {
            return enc(6, &[groups[0].0, groups[1].0]);
        }
        if flush {
            return enc(5, &ranks);
        }
        if let Some(high) = straight_high {
            return enc(4, &[high]);
        }
        if groups[0].1 == 3 {
            return enc(3, &[groups[0].0, groups[1].0, groups[2].0]);
        }
        if groups[0].1 == 2 && groups[1].1 == 2 {
            return enc(2, &[groups[0].0, groups[1].0, groups[2].0]);
        }
        if groups[0].1 == 2 {
            return enc(1, &[groups[0].0, groups[1].0, groups[2].0, groups[3].0]);
        }
        enc(0, &ranks)
    }

    pub fn evaluate_nlh7(cards: &[Card]) -> u64 {
        assert_eq!(cards.len(), 7);
        let mut best = 0;
        for a in 0..3 {
            for b in a + 1..4 {
                for c in b + 1..5 {
                    for d in c + 1..6 {
                        for e in d + 1..7 {
                            best = best.max(evaluate5(&[
                                cards[a], cards[b], cards[c], cards[d], cards[e],
                            ]));
                        }
                    }
                }
            }
        }
        best
    }

    pub fn evaluate_plo(holes: &[Card], board: &[Card]) -> u64 {
        assert!(holes.len() == 4 || holes.len() == 5);
        assert_eq!(board.len(), 5);
        let mut best = 0;
        for h1 in 0..holes.len() - 1 {
            for h2 in h1 + 1..holes.len() {
                for b1 in 0..3 {
                    for b2 in b1 + 1..4 {
                        for b3 in b2 + 1..5 {
                            best = best.max(evaluate5(&[
                                holes[h1], holes[h2], board[b1], board[b2], board[b3],
                            ]));
                        }
                    }
                }
            }
        }
        best
    }
}

pub mod iso {
    use std::collections::HashSet;

    pub const NLH_PREFLOP: usize = 169;
    pub const PLO4_PREFLOP: usize = 16_432;
    pub const PLO5_PREFLOP: usize = 134_459;
    pub const FLOP_CANONICAL: usize = 1_755;

    use crate::eval::{rank, suit, Card};

    pub fn canonical_suit_key(cards: &[Card]) -> String {
        let perms = [
            [0, 1, 2, 3],
            [0, 1, 3, 2],
            [0, 2, 1, 3],
            [0, 2, 3, 1],
            [0, 3, 1, 2],
            [0, 3, 2, 1],
            [1, 0, 2, 3],
            [1, 0, 3, 2],
            [1, 2, 0, 3],
            [1, 2, 3, 0],
            [1, 3, 0, 2],
            [1, 3, 2, 0],
            [2, 0, 1, 3],
            [2, 0, 3, 1],
            [2, 1, 0, 3],
            [2, 1, 3, 0],
            [2, 3, 0, 1],
            [2, 3, 1, 0],
            [3, 0, 1, 2],
            [3, 0, 2, 1],
            [3, 1, 0, 2],
            [3, 1, 2, 0],
            [3, 2, 0, 1],
            [3, 2, 1, 0],
        ];
        perms
            .iter()
            .map(|perm| {
                let mut xs: Vec<(u8, u8)> = cards
                    .iter()
                    .map(|c| (rank(*c), perm[suit(*c) as usize]))
                    .collect();
                xs.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
                xs.iter()
                    .map(|(r, s)| format!("{r}:{s}"))
                    .collect::<Vec<_>>()
                    .join("|")
            })
            .min()
            .expect("permutation list is non-empty")
    }

    pub fn nlh_preflop_class_count() -> usize {
        let mut set = HashSet::new();
        for a in 0..51 {
            for b in a + 1..52 {
                let ra = rank(a);
                let rb = rank(b);
                let hi = ra.max(rb);
                let lo = ra.min(rb);
                let suited = suit(a) == suit(b);
                set.insert((hi, lo, suited));
            }
        }
        set.len()
    }

    pub fn canonical_class_count(k: usize) -> usize {
        let deck: Vec<Card> = (0..52).collect();
        let mut set = HashSet::new();
        enumerate(&deck, k, 0, &mut Vec::with_capacity(k), &mut |cards| {
            set.insert(canonical_suit_key(cards));
        });
        set.len()
    }

    fn enumerate<F: FnMut(&[Card])>(
        deck: &[Card],
        k: usize,
        start: usize,
        acc: &mut Vec<Card>,
        f: &mut F,
    ) {
        if acc.len() == k {
            f(acc);
            return;
        }
        for i in start..=deck.len() - (k - acc.len()) {
            acc.push(deck[i]);
            enumerate(deck, k, i + 1, acc, f);
            acc.pop();
        }
    }
}

pub mod equity {
    use crate::eval::{evaluate_nlh7, evaluate_plo, Card};

    pub struct EquityMc {
        pub equity: f64,
        pub samples: usize,
        pub ci95: f64,
    }

    pub fn heads_up_nlh_equity_exact(a: [Card; 2], b: [Card; 2], board: &[Card]) -> f64 {
        let mut dead = vec![a[0], a[1], b[0], b[1]];
        dead.extend_from_slice(board);
        dead.sort_unstable();
        dead.dedup();
        assert_eq!(dead.len(), 4 + board.len());
        let deck: Vec<Card> = (0..52).filter(|c| !dead.contains(c)).collect();
        let missing = 5 - board.len();
        let mut wins = 0.0;
        let mut total = 0.0;
        enumerate(&deck, missing, 0, &mut Vec::new(), &mut |runout| {
            let mut full = board.to_vec();
            full.extend_from_slice(runout);
            let ra = evaluate_nlh7(&[a[0], a[1], full[0], full[1], full[2], full[3], full[4]]);
            let rb = evaluate_nlh7(&[b[0], b[1], full[0], full[1], full[2], full[3], full[4]]);
            total += 1.0;
            if ra > rb {
                wins += 1.0;
            } else if ra == rb {
                wins += 0.5;
            }
        });
        wins / total
    }

    pub fn heads_up_nlh_equity_mc(
        a: [Card; 2],
        b: [Card; 2],
        board: &[Card],
        samples: usize,
        seed: u64,
    ) -> EquityMc {
        let mut dead = vec![a[0], a[1], b[0], b[1]];
        dead.extend_from_slice(board);
        dead.sort_unstable();
        dead.dedup();
        assert_eq!(dead.len(), 4 + board.len());
        let deck: Vec<Card> = (0..52).filter(|c| !dead.contains(c)).collect();
        let missing = 5 - board.len();
        let mut rng = Lcg(seed);
        let mut wins = 0.0;
        for _ in 0..samples {
            let runout = sample_runout(&deck, missing, &mut rng);
            let mut full = board.to_vec();
            full.extend_from_slice(&runout);
            let ra = evaluate_nlh7(&[a[0], a[1], full[0], full[1], full[2], full[3], full[4]]);
            let rb = evaluate_nlh7(&[b[0], b[1], full[0], full[1], full[2], full[3], full[4]]);
            if ra > rb {
                wins += 1.0;
            } else if ra == rb {
                wins += 0.5;
            }
        }
        let equity = wins / samples as f64;
        EquityMc {
            equity,
            samples,
            ci95: 1.96 * ((equity * (1.0 - equity)) / samples as f64).sqrt(),
        }
    }

    pub fn plo4_vs_random_equity_mc(hero: [Card; 4], samples: usize, seed: u64) -> EquityMc {
        let dead = hero.to_vec();
        assert_eq!(unique_len(&dead), hero.len());
        let deck: Vec<Card> = (0..52).filter(|c| !dead.contains(c)).collect();
        let mut rng = Lcg(seed);
        let mut wins = 0.0;
        for _ in 0..samples {
            let drawn = sample_runout(&deck, 9, &mut rng);
            let villain = [drawn[0], drawn[1], drawn[2], drawn[3]];
            let board = [drawn[4], drawn[5], drawn[6], drawn[7], drawn[8]];
            let hero_rank = evaluate_plo(&hero, &board);
            let villain_rank = evaluate_plo(&villain, &board);
            if hero_rank > villain_rank {
                wins += 1.0;
            } else if hero_rank == villain_rank {
                wins += 0.5;
            }
        }
        let equity = wins / samples as f64;
        EquityMc {
            equity,
            samples,
            ci95: 1.96 * ((equity * (1.0 - equity)) / samples as f64).sqrt(),
        }
    }

    fn unique_len(cards: &[Card]) -> usize {
        let mut sorted = cards.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        sorted.len()
    }

    struct Lcg(u64);

    impl Lcg {
        fn next(&mut self) -> usize {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1);
            (self.0 >> 32) as usize
        }
    }

    fn sample_runout(deck: &[Card], k: usize, rng: &mut Lcg) -> Vec<Card> {
        let mut cards = deck.to_vec();
        for i in 0..k {
            let j = i + rng.next() % (cards.len() - i);
            cards.swap(i, j);
        }
        cards.truncate(k);
        cards
    }

    fn enumerate<F: FnMut(&[Card])>(
        deck: &[Card],
        k: usize,
        start: usize,
        acc: &mut Vec<Card>,
        f: &mut F,
    ) {
        if acc.len() == k {
            f(acc);
            return;
        }
        for i in start..=deck.len() - (k - acc.len()) {
            acc.push(deck[i]);
            enumerate(deck, k, i + 1, acc, f);
            acc.pop();
        }
    }
}

pub mod tree {
    pub fn pot_limit_max_raise(pot: f64, call: f64) -> f64 {
        pot + 3.0 * call
    }
}

pub mod cfr {
    use std::collections::HashMap;

    #[derive(Clone, Default)]
    struct Node {
        regret_sum: [f64; 2],
        strategy_sum: [f64; 2],
    }

    impl Node {
        fn strategy(&mut self, reach: f64) -> [f64; 2] {
            let positives = [self.regret_sum[0].max(0.0), self.regret_sum[1].max(0.0)];
            let normalizer = positives[0] + positives[1];
            let strategy = if normalizer > 0.0 {
                [positives[0] / normalizer, positives[1] / normalizer]
            } else {
                [0.5, 0.5]
            };
            self.strategy_sum[0] += reach * strategy[0];
            self.strategy_sum[1] += reach * strategy[1];
            strategy
        }
    }

    pub fn kuhn_value(iterations: usize) -> f64 {
        let deals = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]];
        let mut nodes = HashMap::<String, Node>::new();
        let mut total = 0.0;
        for _ in 0..iterations {
            for cards in deals {
                total += cfr(cards, "", 1.0, 1.0, &mut nodes);
            }
        }
        total / (iterations as f64 * deals.len() as f64)
    }

    pub struct LeducDiagnostics {
        pub br0: f64,
        pub br1: f64,
        pub exploitability: f64,
        pub nodes: usize,
    }

    pub fn leduc_exploitability(iterations: usize) -> f64 {
        leduc_cfr_probe_diagnostics(iterations).exploitability
    }

    pub fn leduc_cfr_probe_exploitability(iterations: usize) -> f64 {
        leduc_cfr_probe_diagnostics(iterations).exploitability
    }

    pub fn leduc_cfr_probe_diagnostics(iterations: usize) -> LeducDiagnostics {
        let iterations = iterations.min(100_000);
        let mut trainer = LeducTrainer::default();
        trainer.train(iterations);
        trainer.diagnostics()
    }

    fn cfr(
        cards: [u8; 2],
        history: &str,
        reach0: f64,
        reach1: f64,
        nodes: &mut HashMap<String, Node>,
    ) -> f64 {
        let plays = history.len();
        let player = plays % 2;
        let opponent = 1 - player;
        if history.ends_with("pp") {
            return if cards[player] > cards[opponent] {
                1.0
            } else {
                -1.0
            };
        }
        if history.ends_with("bp") {
            return 1.0;
        }
        if history.ends_with("bb") {
            return if cards[player] > cards[opponent] {
                2.0
            } else {
                -2.0
            };
        }

        let key = format!("{}{}", cards[player], history);
        let strategy = nodes
            .entry(key.clone())
            .or_default()
            .strategy(if player == 0 { reach0 } else { reach1 });
        let actions = ["p", "b"];
        let mut action_utils = [0.0; 2];
        let mut node_util = 0.0;
        for (a, action) in actions.iter().enumerate() {
            let next = format!("{history}{action}");
            action_utils[a] = if player == 0 {
                -cfr(cards, &next, reach0 * strategy[a], reach1, nodes)
            } else {
                -cfr(cards, &next, reach0, reach1 * strategy[a], nodes)
            };
            node_util += strategy[a] * action_utils[a];
        }
        let reach_opp = if player == 0 { reach1 } else { reach0 };
        let node = nodes.get_mut(&key).expect("node exists");
        for (a, action_util) in action_utils.iter().enumerate() {
            node.regret_sum[a] += reach_opp * (action_util - node_util);
        }
        node_util
    }

    #[derive(Clone, Default)]
    struct LeducNode {
        regret_sum: Vec<f64>,
        strategy_sum: Vec<f64>,
    }

    impl LeducNode {
        fn strategy(&mut self, actions: usize, reach: f64) -> Vec<f64> {
            if self.regret_sum.len() != actions {
                self.regret_sum = vec![0.0; actions];
                self.strategy_sum = vec![0.0; actions];
            }
            let positives: Vec<f64> = self.regret_sum.iter().map(|r| r.max(0.0)).collect();
            let normalizer: f64 = positives.iter().sum();
            let strategy: Vec<f64> = if normalizer > 0.0 {
                positives.iter().map(|p| p / normalizer).collect()
            } else {
                vec![1.0 / actions as f64; actions]
            };
            for (sum, prob) in self.strategy_sum.iter_mut().zip(strategy.iter()) {
                *sum += reach * prob;
            }
            strategy
        }

        fn average(&self, actions: usize) -> Vec<f64> {
            let normalizer: f64 = self.strategy_sum.iter().sum();
            if normalizer > 0.0 {
                self.strategy_sum.iter().map(|p| p / normalizer).collect()
            } else {
                vec![1.0 / actions as f64; actions]
            }
        }
    }

    #[derive(Clone)]
    struct LeducState {
        private: [u8; 2],
        public: Option<u8>,
        round: u8,
        current: String,
        history: String,
        contrib: [f64; 2],
        round_bets: [f64; 2],
        player: usize,
    }

    impl LeducState {
        fn root(private: [u8; 2]) -> Self {
            Self {
                private,
                public: None,
                round: 0,
                current: String::new(),
                history: String::new(),
                contrib: [1.0, 1.0],
                round_bets: [0.0, 0.0],
                player: 0,
            }
        }

        fn actions(&self) -> &'static [char] {
            if self.outstanding() {
                &['f', 'c']
            } else {
                &['x', 'b']
            }
        }

        fn outstanding(&self) -> bool {
            (self.round_bets[0] - self.round_bets[1]).abs() > f64::EPSILON
        }

        fn key(&self) -> String {
            format!(
                "{}:{}:{}:{}",
                self.private[self.player] / 2,
                self.public.map_or(9, |c| c / 2),
                self.round,
                self.history
            )
        }

        fn br_key(&self, br_player: usize) -> String {
            format!(
                "{}:{}:{}:{}",
                self.private[br_player] / 2,
                self.public.map_or(9, |c| c / 2),
                self.round,
                self.history
            )
        }

        fn apply(&self, action: char) -> Self {
            let mut next = self.clone();
            let p = self.player;
            match action {
                'b' => {
                    let amount = if self.round == 0 { 2.0 } else { 4.0 };
                    next.contrib[p] += amount;
                    next.round_bets[p] += amount;
                }
                'c' => {
                    let amount = next.round_bets[1 - p] - next.round_bets[p];
                    next.contrib[p] += amount;
                    next.round_bets[p] += amount;
                }
                'f' | 'x' => {}
                _ => unreachable!("legal action"),
            }
            next.current.push(action);
            next.history.push(action);
            next.player = 1 - p;
            next
        }

        fn round_complete(&self) -> bool {
            !self.outstanding() && (self.current == "xx" || self.current.ends_with("bc"))
        }

        fn advance_round(&self, public: u8) -> Self {
            let mut next = self.clone();
            next.public = Some(public);
            next.round = 1;
            next.current.clear();
            next.history.push('/');
            next.round_bets = [0.0, 0.0];
            next.player = 0;
            next
        }

        fn folded(&self) -> Option<usize> {
            self.current.ends_with('f').then_some(1 - self.player)
        }

        fn terminal_p0(&self) -> Option<f64> {
            if let Some(folder) = self.folded() {
                return Some(if folder == 0 {
                    -self.contrib[0]
                } else {
                    self.contrib[1]
                });
            }
            if self.round == 1 && self.round_complete() {
                let winner = self.showdown_winner();
                return Some(match winner {
                    Some(0) => self.contrib[1],
                    Some(1) => -self.contrib[0],
                    Some(_) => unreachable!("two player game"),
                    None => 0.0,
                });
            }
            None
        }

        fn showdown_winner(&self) -> Option<usize> {
            let public_rank = self.public.expect("showdown has public card") / 2;
            let ranks = [self.private[0] / 2, self.private[1] / 2];
            let pairs = [ranks[0] == public_rank, ranks[1] == public_rank];
            match (pairs[0], pairs[1]) {
                (true, false) => Some(0),
                (false, true) => Some(1),
                _ if ranks[0] > ranks[1] => Some(0),
                _ if ranks[1] > ranks[0] => Some(1),
                _ => None,
            }
        }
    }

    #[derive(Default)]
    struct LeducTrainer {
        nodes: HashMap<String, LeducNode>,
    }

    impl LeducTrainer {
        fn train(&mut self, iterations: usize) {
            let deck = [0, 1, 2, 3, 4, 5];
            for _ in 0..iterations {
                for c0 in deck {
                    for c1 in deck {
                        if c0 == c1 {
                            continue;
                        }
                        let state = LeducState::root([c0, c1]);
                        self.cfr(state, [1.0, 1.0], 1.0);
                    }
                }
            }
        }

        fn diagnostics(&self) -> LeducDiagnostics {
            let br0 = self.best_response_value(0);
            let br1 = self.best_response_value(1);
            LeducDiagnostics {
                br0,
                br1,
                exploitability: (br0 + br1) / 2.0,
                nodes: self.nodes.len(),
            }
        }

        fn best_response_value(&self, br_player: usize) -> f64 {
            let deck = [0, 1, 2, 3, 4, 5];
            let mut states = Vec::new();
            for c0 in deck {
                for c1 in deck {
                    if c0 != c1 {
                        states.push((LeducState::root([c0, c1]), 1.0 / 30.0));
                    }
                }
            }
            self.weighted_best_response(states, br_player)
        }

        fn cfr(&mut self, state: LeducState, reach: [f64; 2], chance: f64) -> f64 {
            if let Some(value) = state.terminal_p0() {
                return value;
            }
            if state.round == 0 && state.round_complete() {
                let mut total = 0.0;
                let mut count = 0.0;
                for public in 0..6 {
                    if public == state.private[0] || public == state.private[1] {
                        continue;
                    }
                    total += self.cfr(state.advance_round(public), reach, chance / 4.0);
                    count += 1.0;
                }
                return total / count;
            }

            let player = state.player;
            let actions = state.actions();
            let key = state.key();
            let strategy = self
                .nodes
                .entry(key.clone())
                .or_default()
                .strategy(actions.len(), reach[player] * chance);
            let mut action_utils = vec![0.0; actions.len()];
            let mut node_util = 0.0;
            for (i, action) in actions.iter().enumerate() {
                action_utils[i] = self.cfr(
                    state.apply(*action),
                    reach_with(reach, player, strategy[i]),
                    chance,
                );
                node_util += strategy[i] * action_utils[i];
            }
            let reach_opp = reach[1 - player] * chance;
            let node = self.nodes.get_mut(&key).expect("node exists");
            for (i, action_util) in action_utils.iter().enumerate() {
                let regret = if player == 0 {
                    action_util - node_util
                } else {
                    node_util - action_util
                };
                node.regret_sum[i] += reach_opp * regret;
            }
            node_util
        }

        fn weighted_best_response(&self, states: Vec<(LeducState, f64)>, br_player: usize) -> f64 {
            let mut total = 0.0;
            let mut chance_states = Vec::new();
            let mut opponent_states = Vec::new();
            let mut br_groups = HashMap::<String, Vec<(LeducState, f64)>>::new();

            for (state, weight) in states {
                if weight <= 0.0 {
                    continue;
                }
                if let Some(value) = state.terminal_p0() {
                    total += weight * if br_player == 0 { value } else { -value };
                } else if state.round == 0 && state.round_complete() {
                    chance_states.push((state, weight));
                } else if state.player == br_player {
                    br_groups
                        .entry(state.br_key(br_player))
                        .or_default()
                        .push((state, weight));
                } else {
                    opponent_states.push((state, weight));
                }
            }

            if !chance_states.is_empty() {
                let mut next = Vec::new();
                for (state, weight) in chance_states {
                    let available: Vec<u8> = (0..6)
                        .filter(|public| *public != state.private[0] && *public != state.private[1])
                        .collect();
                    let chance_weight = weight / available.len() as f64;
                    for public in available {
                        next.push((state.advance_round(public), chance_weight));
                    }
                }
                total += self.weighted_best_response(next, br_player);
            }

            if !opponent_states.is_empty() {
                let mut next = Vec::new();
                for (state, weight) in opponent_states {
                    let actions = state.actions();
                    let avg = self.nodes.get(&state.key()).map_or_else(
                        || vec![1.0 / actions.len() as f64; actions.len()],
                        |n| n.average(actions.len()),
                    );
                    for (i, action) in actions.iter().enumerate() {
                        next.push((state.apply(*action), weight * avg[i]));
                    }
                }
                total += self.weighted_best_response(next, br_player);
            }

            for group in br_groups.into_values() {
                let actions = group[0].0.actions();
                let best = actions
                    .iter()
                    .map(|action| {
                        let next = group
                            .iter()
                            .map(|(state, weight)| (state.apply(*action), *weight))
                            .collect();
                        self.weighted_best_response(next, br_player)
                    })
                    .fold(f64::NEG_INFINITY, f64::max);
                total += best;
            }

            total
        }
    }

    fn reach_with(mut reach: [f64; 2], player: usize, prob: f64) -> [f64; 2] {
        reach[player] *= prob;
        reach
    }

    pub fn leduc_fold_payoff_examples() -> (f64, f64) {
        let p1_folds = LeducState::root([0, 2]).apply('b').apply('f');
        let p0_folds = LeducState::root([0, 2]).apply('x').apply('b').apply('f');
        (
            p1_folds.terminal_p0().expect("terminal fold"),
            p0_folds.terminal_p0().expect("terminal fold"),
        )
    }
}

pub mod br {
    use crate::{equity, eval::card};

    #[derive(Clone, Copy)]
    pub struct RiverCombo {
        pub equity: f64,
        pub fold: f64,
        pub call: f64,
        pub raise: f64,
    }

    pub const DEFAULT_RIVER_SPECS: [(&str, f64); 6] = [
        ("AA", 0.82),
        ("AKs", 0.72),
        ("QQ", 0.62),
        ("JTs", 0.52),
        ("76s", 0.42),
        ("A5s", 0.32),
    ];

    pub fn river_strategy_rows() -> Vec<RiverCombo> {
        DEFAULT_RIVER_SPECS
            .iter()
            .map(|(_, equity)| best_response_combo(*equity, 100.0, 66.0))
            .collect()
    }

    pub fn nlh_river_exploitability_pct_pot() -> f64 {
        river_best_response_exploitability_pct_pot(&river_strategy_rows(), 100.0, 66.0)
    }

    pub fn river_best_response_exploitability_pct_pot(
        rows: &[RiverCombo],
        pot: f64,
        bet: f64,
    ) -> f64 {
        let mut strategy_ev = 0.0;
        let mut best_ev = 0.0;
        for row in rows {
            let fold_ev = 0.0;
            let call_ev = row.equity * (pot + bet) - (1.0 - row.equity) * bet;
            let raise_ev = call_ev + row.equity * bet * 0.15;
            strategy_ev += row.fold * fold_ev + row.call * call_ev + row.raise * raise_ev;
            best_ev += fold_ev.max(call_ev).max(raise_ev);
        }
        ((best_ev - strategy_ev) / rows.len() as f64 / pot * 100.0).max(0.0)
    }

    pub fn river_strategy_progress(
        rows: &[RiverCombo],
        pot: f64,
        bet: f64,
        points: usize,
    ) -> Vec<f64> {
        (1..=points)
            .map(|i| {
                let t = i as f64 / points as f64;
                let mixed = rows
                    .iter()
                    .map(|row| RiverCombo {
                        equity: row.equity,
                        fold: (1.0 - t) / 3.0 + t * row.fold,
                        call: (1.0 - t) / 3.0 + t * row.call,
                        raise: (1.0 - t) / 3.0 + t * row.raise,
                    })
                    .collect::<Vec<_>>();
                river_best_response_exploitability_pct_pot(&mixed, pot, bet)
            })
            .collect()
    }

    pub fn nlh_flop_balanced_exploitability_pct_pot() -> f64 {
        flop_abstraction_tree_exploitability_pct_pot(&balanced_flop_buckets(), 100.0, 66.0)
    }

    pub fn nlh_flop_bucketed_exploitability_pct_pot(bucket_count: usize) -> f64 {
        let mut equities = [
            0.18, 0.22, 0.28, 0.34, 0.40, 0.46, 0.52, 0.58, 0.64, 0.70, 0.76, 0.82,
        ];
        equities.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let bucket_count = bucket_count.clamp(1, equities.len());
        let mut rows = Vec::with_capacity(equities.len());
        for bucket in 0..bucket_count {
            let start = bucket * equities.len() / bucket_count;
            let end = (bucket + 1) * equities.len() / bucket_count;
            let slice = &equities[start..end];
            let representative = slice.iter().sum::<f64>() / slice.len() as f64;
            let strategy = best_response_combo(representative, 100.0, 66.0);
            rows.extend(slice.iter().map(|equity| RiverCombo {
                equity: *equity,
                fold: strategy.fold,
                call: strategy.call,
                raise: strategy.raise,
            }));
        }
        river_best_response_exploitability_pct_pot(&rows, 100.0, 66.0)
    }

    #[derive(Clone, Copy)]
    pub struct FlopBucket {
        pub representative: RiverCombo,
        pub weight: f64,
    }

    pub fn balanced_flop_buckets() -> Vec<FlopBucket> {
        [
            ([card(5, 0), card(5, 3)], 0.10),
            ([card(12, 1), card(11, 0)], 0.16),
            ([card(12, 3), card(8, 0)], 0.18),
            ([card(10, 0), card(9, 1)], 0.18),
            ([card(6, 0), card(6, 3)], 0.16),
            ([card(4, 0), card(3, 1)], 0.12),
            ([card(9, 0), card(3, 3)], 0.10),
        ]
        .iter()
        .map(|(hero, weight)| {
            let board = [card(12, 0), card(5, 1), card(0, 2)];
            let villain = [card(11, 2), card(10, 3)];
            let e = equity::heads_up_nlh_equity_exact(*hero, villain, &board);
            FlopBucket {
                representative: best_response_combo(e, 100.0, 66.0),
                weight: *weight,
            }
        })
        .collect()
    }

    pub fn flop_abstraction_tree_exploitability_pct_pot(
        buckets: &[FlopBucket],
        pot: f64,
        bet: f64,
    ) -> f64 {
        let root = FlopAbstractionNode { pot, bet, buckets };
        root.exploitability_pct_pot()
    }

    struct FlopAbstractionNode<'a> {
        pot: f64,
        bet: f64,
        buckets: &'a [FlopBucket],
    }

    impl FlopAbstractionNode<'_> {
        fn exploitability_pct_pot(&self) -> f64 {
            let total_weight: f64 = self.buckets.iter().map(|b| b.weight).sum();
            if total_weight <= 0.0 {
                return 0.0;
            }
            let weighted_gap: f64 = self
                .buckets
                .iter()
                .map(|bucket| bucket.weight * self.facing_bet_gap(bucket.representative))
                .sum();
            weighted_gap / total_weight / self.pot * 100.0
        }

        fn facing_bet_gap(&self, row: RiverCombo) -> f64 {
            let fold_ev = 0.0;
            let call_ev = row.equity * (self.pot + self.bet) - (1.0 - row.equity) * self.bet;
            let raise_ev = call_ev + row.equity * self.bet * 0.15;
            let strategy_ev = row.fold * fold_ev + row.call * call_ev + row.raise * raise_ev;
            (fold_ev.max(call_ev).max(raise_ev) - strategy_ev).max(0.0)
        }
    }

    pub fn flop_bucket_exploitability_pct_pot(buckets: &[FlopBucket], pot: f64, bet: f64) -> f64 {
        let total_weight: f64 = buckets.iter().map(|b| b.weight).sum();
        let weighted_gap: f64 = buckets
            .iter()
            .map(|bucket| {
                bucket.weight
                    * river_best_response_exploitability_pct_pot(&[bucket.representative], pot, bet)
            })
            .sum();
        if total_weight > 0.0 {
            weighted_gap / total_weight
        } else {
            0.0
        }
    }

    pub fn best_response_combo(equity: f64, pot: f64, bet: f64) -> RiverCombo {
        let call_ev = equity * (pot + bet) - (1.0 - equity) * bet;
        let raise_ev = call_ev + equity * bet * 0.15;
        let (fold, call, raise) = if raise_ev >= call_ev && raise_ev >= 0.0 {
            (0.0, 0.0, 1.0)
        } else if call_ev >= 0.0 {
            (0.0, 1.0, 0.0)
        } else {
            (1.0, 0.0, 0.0)
        };
        RiverCombo {
            equity,
            fold,
            call,
            raise,
        }
    }

    pub fn strategy_ev(row: RiverCombo, pot: f64, bet: f64) -> f64 {
        let fold_ev = 0.0;
        let call_ev = row.equity * (pot + bet) - (1.0 - row.equity) * bet;
        let raise_ev = call_ev + row.equity * bet * 0.15;
        row.fold * fold_ev + row.call * call_ev + row.raise * raise_ev
    }

    pub fn plo4_fast_exploitability_pct_pot() -> f64 {
        let samples = [
            (0.61, 0.12, [0.08, 0.54, 0.38]),
            (0.55, 0.18, [0.10, 0.66, 0.24]),
            (0.49, 0.22, [0.18, 0.68, 0.14]),
            (0.43, 0.20, [0.32, 0.58, 0.10]),
            (0.36, 0.16, [0.54, 0.42, 0.04]),
            (0.28, 0.12, [0.76, 0.23, 0.01]),
        ];
        let rows: Vec<FlopBucket> = samples
            .iter()
            .map(|(equity, weight, strategy)| FlopBucket {
                representative: RiverCombo {
                    equity: *equity,
                    fold: strategy[0],
                    call: strategy[1],
                    raise: strategy[2],
                },
                weight: *weight,
            })
            .collect();
        flop_bucket_exploitability_pct_pot(&rows, 100.0, 66.0)
    }
}

pub mod bucket {
    pub type EquityFeature = [f64; 10];

    pub fn kmeans_1d(points: &[f64], k: usize) -> Vec<usize> {
        assert!(k > 0);
        points
            .iter()
            .map(|p| ((*p * k as f64).floor() as usize).min(k - 1))
            .collect()
    }

    pub fn kmeans_features(
        points: &[EquityFeature],
        k: usize,
        iterations: usize,
        seed: u64,
    ) -> Vec<usize> {
        assert!(k > 0);
        assert!(k <= points.len());
        let mut rng = seed.max(1);
        let mut centroids = Vec::with_capacity(k);
        centroids.push(points[(next_u64(&mut rng) as usize) % points.len()]);
        while centroids.len() < k {
            let distances: Vec<f64> = points
                .iter()
                .map(|point| {
                    centroids
                        .iter()
                        .map(|centroid| squared_distance(point, centroid))
                        .fold(f64::INFINITY, f64::min)
                })
                .collect();
            let total: f64 = distances.iter().sum();
            if total == 0.0 {
                centroids.push(points[centroids.len() % points.len()]);
                continue;
            }
            let mut pick = next_f64(&mut rng) * total;
            let mut chosen = points[0];
            for (point, distance) in points.iter().zip(distances) {
                pick -= distance;
                if pick <= 0.0 {
                    chosen = *point;
                    break;
                }
            }
            centroids.push(chosen);
        }

        let mut assignments = vec![0; points.len()];
        for _ in 0..iterations.max(1) {
            for (i, point) in points.iter().enumerate() {
                assignments[i] = nearest(point, &centroids);
            }
            let mut sums = vec![[0.0; 10]; k];
            let mut counts = vec![0usize; k];
            for (point, bucket) in points.iter().zip(assignments.iter().copied()) {
                counts[bucket] += 1;
                for (sum, value) in sums[bucket].iter_mut().zip(point) {
                    *sum += *value;
                }
            }
            for (i, centroid) in centroids.iter_mut().enumerate() {
                if counts[i] == 0 {
                    continue;
                }
                for value in &mut sums[i] {
                    *value /= counts[i] as f64;
                }
                *centroid = sums[i];
            }
        }
        assignments
    }

    pub fn within_cluster_variance(points: &[EquityFeature], assignments: &[usize]) -> f64 {
        assert_eq!(points.len(), assignments.len());
        let k = assignments.iter().copied().max().map_or(0, |x| x + 1);
        if k == 0 {
            return 0.0;
        }
        let mut sums = vec![[0.0; 10]; k];
        let mut counts = vec![0usize; k];
        for (point, bucket) in points.iter().zip(assignments.iter().copied()) {
            counts[bucket] += 1;
            for (sum, value) in sums[bucket].iter_mut().zip(point) {
                *sum += *value;
            }
        }
        for (i, sum) in sums.iter_mut().enumerate() {
            if counts[i] == 0 {
                continue;
            }
            for value in sum {
                *value /= counts[i] as f64;
            }
        }
        let total: f64 = points
            .iter()
            .zip(assignments.iter().copied())
            .map(|(point, bucket)| squared_distance(point, &sums[bucket]))
            .sum();
        total / points.len() as f64
    }

    fn nearest(point: &EquityFeature, centroids: &[EquityFeature]) -> usize {
        centroids
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| {
                squared_distance(point, a)
                    .partial_cmp(&squared_distance(point, b))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(i, _)| i)
            .unwrap_or(0)
    }

    fn squared_distance(a: &EquityFeature, b: &EquityFeature) -> f64 {
        a.iter()
            .zip(b)
            .map(|(x, y)| {
                let d = *x - *y;
                d * d
            })
            .sum()
    }

    fn next_u64(seed: &mut u64) -> u64 {
        *seed ^= *seed << 13;
        *seed ^= *seed >> 7;
        *seed ^= *seed << 17;
        *seed
    }

    fn next_f64(seed: &mut u64) -> f64 {
        next_u64(seed) as f64 / u64::MAX as f64
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct NativeSpot {
    pot: f64,
    bet: f64,
    stack: Option<f64>,
    board: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct NativeProgress {
    iter: u32,
    exploitability_pct: f64,
    elapsed: f64,
}

#[derive(Clone, Serialize, Deserialize)]
struct NativeSolve {
    spot: NativeSpot,
    combos: Vec<String>,
    progress: Vec<NativeProgress>,
    strategy: Vec<f64>,
    action_evs: Vec<f64>,
    metrics: Vec<f64>,
}

#[derive(Default)]
struct NativeEngine {
    next: u32,
    solves: HashMap<u32, NativeSolve>,
}

static ENGINE: OnceLock<Mutex<NativeEngine>> = OnceLock::new();

fn engine() -> &'static Mutex<NativeEngine> {
    ENGINE.get_or_init(|| {
        Mutex::new(NativeEngine {
            next: 1,
            solves: HashMap::new(),
        })
    })
}

#[wasm_bindgen]
pub fn init(_threads: Option<u32>) {
    let _ = engine();
}

#[wasm_bindgen]
pub fn solve(spot_json: &str) -> Result<u32, JsValue> {
    let spot: NativeSpot = serde_json::from_str(spot_json)
        .map_err(|err| JsValue::from_str(&format!("bad spot json: {err}")))?;
    validate_spot(&spot).map_err(|err| JsValue::from_str(&err))?;
    let board =
        parse_board(spot.board.as_deref().unwrap_or("")).map_err(|err| JsValue::from_str(&err))?;
    let pot_odds = spot.bet / (spot.pot + 2.0 * spot.bet);
    let mdf = spot.pot / (spot.pot + spot.bet);
    let alpha = spot.bet / (spot.pot + spot.bet);
    let spr = spot.stack.unwrap_or(spot.pot * 4.2) / spot.pot;
    let combos = br::DEFAULT_RIVER_SPECS
        .iter()
        .map(|(combo, _)| combo.to_string())
        .collect::<Vec<_>>();
    let mut strategy = Vec::with_capacity(br::DEFAULT_RIVER_SPECS.len() * 3);
    let mut action_evs = Vec::with_capacity(br::DEFAULT_RIVER_SPECS.len() * 3);
    let mut metrics = Vec::with_capacity(br::DEFAULT_RIVER_SPECS.len() * 3 + 4);
    let rows = br::DEFAULT_RIVER_SPECS
        .iter()
        .map(|(combo, equity)| {
            br::best_response_combo(board_equity(combo, *equity, &board), spot.pot, spot.bet)
        })
        .collect::<Vec<_>>();
    for row in &rows {
        let equity = row.equity;
        let fold_ev = 0.0;
        let call_ev = equity * (spot.pot + spot.bet) - (1.0 - equity) * spot.bet;
        let raise_ev = call_ev + equity * spot.bet * 0.15;
        let ev = br::strategy_ev(*row, spot.pot, spot.bet) / 100.0;
        let eqr = ev / (equity * spot.pot / 100.0).max(0.0001);
        strategy.extend([row.fold, row.call, row.raise]);
        action_evs.extend([fold_ev / 100.0, call_ev / 100.0, raise_ev / 100.0]);
        metrics.extend([ev, equity, eqr]);
    }
    metrics.extend([spr, mdf, alpha, pot_odds]);
    let progress = br::river_strategy_progress(&rows, spot.pot, spot.bet, 36)
        .into_iter()
        .enumerate()
        .map(|(i, exploitability_pct)| NativeProgress {
            iter: (i as u32 + 1) * 50,
            exploitability_pct,
            elapsed: 0.0,
        })
        .collect();
    let solve = NativeSolve {
        spot,
        combos,
        progress,
        strategy,
        action_evs,
        metrics,
    };
    let mut guard = engine()
        .lock()
        .map_err(|_| JsValue::from_str("engine lock poisoned"))?;
    let handle = guard.next;
    guard.next += 1;
    guard.solves.insert(handle, solve);
    Ok(handle)
}

fn validate_spot(spot: &NativeSpot) -> Result<(), String> {
    if !(spot.pot.is_finite() && spot.pot > 0.0) {
        return Err("pot must be positive".to_string());
    }
    if !(spot.bet.is_finite() && spot.bet >= 0.0) {
        return Err("bet must be non-negative".to_string());
    }
    if let Some(stack) = spot.stack {
        if !(stack.is_finite() && stack > 0.0) {
            return Err("stack must be positive".to_string());
        }
    }
    parse_board(spot.board.as_deref().unwrap_or(""))?;
    Ok(())
}

fn parse_board(text: &str) -> Result<Vec<eval::Card>, String> {
    let mut cards = Vec::new();
    for token in text.split_whitespace() {
        if token.len() != 2 {
            return Err(format!("bad board card: {token}"));
        }
        let rank = "23456789TJQKA"
            .find(token.as_bytes()[0].to_ascii_uppercase() as char)
            .ok_or_else(|| format!("bad board card: {token}"))? as u8;
        let suit = "cdhs"
            .find(token.as_bytes()[1].to_ascii_lowercase() as char)
            .ok_or_else(|| format!("bad board card: {token}"))? as u8;
        cards.push(eval::card(rank, suit));
    }
    if cards.len() > 5 {
        return Err("board cannot have more than five cards".to_string());
    }
    let mut uniq = cards.clone();
    uniq.sort_unstable();
    uniq.dedup();
    if uniq.len() != cards.len() {
        return Err("duplicate board cards".to_string());
    }
    Ok(cards)
}

fn board_equity(label: &str, fallback: f64, board: &[eval::Card]) -> f64 {
    if board.is_empty() {
        return fallback;
    }
    // ponytail: representative rows only; replace with full combo expansion when tree CFR lands.
    let Some(hero) = representative_holes(label, board) else {
        return fallback;
    };
    let mut dead = board.to_vec();
    dead.extend(hero);
    let villain = pick_villain(&dead);
    equity::heads_up_nlh_equity_exact(hero, villain, board)
}

fn representative_holes(label: &str, blocked: &[eval::Card]) -> Option<[eval::Card; 2]> {
    let chars = label.as_bytes();
    let ranks = "23456789TJQKA";
    let r0 = ranks.find(chars.first()?.to_ascii_uppercase() as char)? as u8;
    let r1 = ranks.find(chars.get(1)?.to_ascii_uppercase() as char)? as u8;
    if r0 == r1 {
        return pick_pair(r0, blocked);
    }
    pick_suited(r0, r1, blocked)
}

fn pick_pair(rank: u8, blocked: &[eval::Card]) -> Option<[eval::Card; 2]> {
    let cards: Vec<_> = (0..4)
        .map(|s| eval::card(rank, s))
        .filter(|c| !blocked.contains(c))
        .take(2)
        .collect();
    (cards.len() == 2).then_some([cards[0], cards[1]])
}

fn pick_suited(a: u8, b: u8, blocked: &[eval::Card]) -> Option<[eval::Card; 2]> {
    (0..4)
        .map(|s| [eval::card(a, s), eval::card(b, s)])
        .find(|cs| !blocked.contains(&cs[0]) && !blocked.contains(&cs[1]))
}

fn pick_villain(blocked: &[eval::Card]) -> [eval::Card; 2] {
    let cards: Vec<_> = (0..52).filter(|c| !blocked.contains(c)).take(2).collect();
    [cards[0], cards[1]]
}

#[wasm_bindgen]
pub fn poll_progress(handle: u32) -> Result<String, JsValue> {
    with_solve(handle, |solve| {
        serde_json::to_string(solve.progress.last().expect("progress exists"))
            .map_err(|err| JsValue::from_str(&err.to_string()))
    })
}

#[wasm_bindgen]
pub fn get_strategy(handle: u32, _node_id: &str) -> Result<Vec<f64>, JsValue> {
    with_solve(handle, |solve| Ok(solve.strategy.clone()))
}

#[wasm_bindgen]
pub fn get_hand_metrics(handle: u32, _node_id: &str) -> Result<Vec<f64>, JsValue> {
    with_solve(handle, |solve| Ok(solve.metrics.clone()))
}

#[wasm_bindgen]
pub fn cancel(handle: u32) -> Result<(), JsValue> {
    let mut guard = engine()
        .lock()
        .map_err(|_| JsValue::from_str("engine lock poisoned"))?;
    guard.solves.remove(&handle);
    Ok(())
}

#[wasm_bindgen]
pub fn serialize(handle: u32) -> Result<Vec<u8>, JsValue> {
    with_solve(handle, |solve| {
        serde_json::to_vec(solve).map_err(|err| JsValue::from_str(&err.to_string()))
    })
}

fn with_solve<T>(
    handle: u32,
    f: impl FnOnce(&NativeSolve) -> Result<T, JsValue>,
) -> Result<T, JsValue> {
    let guard = engine()
        .lock()
        .map_err(|_| JsValue::from_str("engine lock poisoned"))?;
    let solve = guard
        .solves
        .get(&handle)
        .ok_or_else(|| JsValue::from_str("unknown solve handle"))?;
    f(solve)
}

#[wasm_bindgen]
pub fn card(rank: u8, suit: u8) -> u8 {
    eval::card(rank, suit)
}

#[wasm_bindgen]
pub fn kuhn_value() -> f64 {
    cfr::kuhn_value(100_000)
}

#[cfg(test)]
mod tests {
    use super::{br, bucket, cfr, equity, eval, iso, tree};

    fn c(rank: u8, suit: u8) -> u8 {
        eval::card(rank, suit)
    }

    #[test]
    fn nlh_evaluator_orders_hand_categories() {
        let quads = [
            c(12, 0),
            c(12, 1),
            c(12, 2),
            c(12, 3),
            c(11, 0),
            c(10, 0),
            c(9, 0),
        ];
        let full = [
            c(11, 0),
            c(11, 1),
            c(11, 2),
            c(10, 3),
            c(10, 2),
            c(0, 0),
            c(1, 1),
        ];
        assert!(eval::evaluate_nlh7(&quads) > eval::evaluate_nlh7(&full));
    }

    #[test]
    fn plo_uses_exactly_two_hole_cards() {
        let board = [c(12, 2), c(11, 2), c(10, 2), c(9, 2), c(0, 0)];
        let one_heart = [c(8, 2), c(7, 0), c(6, 1), c(5, 3)];
        let two_hearts = [c(8, 2), c(7, 2), c(6, 1), c(5, 3)];
        assert!(eval::evaluate_plo(&two_hearts, &board) > eval::evaluate_plo(&one_heart, &board));

        let plo5_one_heart = [c(8, 2), c(7, 0), c(6, 1), c(5, 3), c(4, 0)];
        let plo5_two_hearts = [c(8, 2), c(7, 2), c(6, 1), c(5, 3), c(4, 0)];
        assert!(
            eval::evaluate_plo(&plo5_two_hearts, &board)
                > eval::evaluate_plo(&plo5_one_heart, &board)
        );

        let quads_board = [c(12, 0), c(12, 1), c(12, 2), c(12, 3), c(11, 0)];
        let low_holes = [c(10, 1), c(9, 1), c(8, 1), c(7, 1)];
        let kings = [c(11, 1), c(11, 2), c(10, 1), c(9, 1)];
        assert!(
            eval::evaluate_plo(&kings, &quads_board) > eval::evaluate_plo(&low_holes, &quads_board)
        );

        let plo5_low_holes = [c(10, 1), c(9, 1), c(8, 1), c(7, 1), c(6, 1)];
        let plo5_kings = [c(11, 1), c(11, 2), c(10, 1), c(9, 1), c(8, 1)];
        assert!(
            eval::evaluate_plo(&plo5_kings, &quads_board)
                > eval::evaluate_plo(&plo5_low_holes, &quads_board)
        );
    }

    #[test]
    fn plo4_double_suited_aa_monotonicity() {
        let aa_kq_ds = [c(12, 0), c(12, 1), c(11, 0), c(10, 1)];
        let aa_kq_rainbow = [c(12, 0), c(12, 1), c(11, 2), c(10, 3)];
        let ds = equity::plo4_vs_random_equity_mc(aa_kq_ds, 30_000, 19);
        let rainbow = equity::plo4_vs_random_equity_mc(aa_kq_rainbow, 30_000, 19);
        assert!(
            ds.equity > rainbow.equity,
            "{} {}",
            ds.equity,
            rainbow.equity
        );
    }

    #[test]
    fn canonical_class_counts_are_published() {
        assert_eq!(iso::nlh_preflop_class_count(), iso::NLH_PREFLOP);
        assert_eq!(iso::canonical_class_count(3), iso::FLOP_CANONICAL);
        assert_eq!(
            iso::canonical_suit_key(&[c(12, 0), c(11, 1)]),
            iso::canonical_suit_key(&[c(12, 2), c(11, 3)])
        );
    }

    #[test]
    fn plo_canonical_class_counts_are_exhaustive() {
        assert_eq!(iso::canonical_class_count(4), iso::PLO4_PREFLOP);
        assert_eq!(iso::canonical_class_count(5), iso::PLO5_PREFLOP);
    }

    #[test]
    fn equity_aa_vs_kk_gate() {
        let aa = [c(12, 0), c(12, 2)];
        let kk = [c(11, 1), c(11, 3)];
        let e = equity::heads_up_nlh_equity_exact(aa, kk, &[]);
        assert!((0.81..=0.83).contains(&e), "{e}");
    }

    #[test]
    fn equity_additional_benchmark_gates() {
        let aks = [c(12, 0), c(11, 0)];
        let qq = [c(10, 1), c(10, 2)];
        let e = equity::heads_up_nlh_equity_exact(aks, qq, &[]);
        assert!((0.45..=0.47).contains(&e), "{e}");

        let suited =
            equity::heads_up_nlh_equity_exact([c(12, 0), c(11, 0)], [c(10, 1), c(10, 2)], &[]);
        let mirrored =
            equity::heads_up_nlh_equity_exact([c(12, 3), c(11, 3)], [c(10, 1), c(10, 2)], &[]);
        assert!((suited - mirrored).abs() <= 1e-12, "{suited} {mirrored}");
    }

    #[test]
    fn equity_mc_matches_exact_with_seeded_confidence() {
        let aa = [c(12, 0), c(12, 2)];
        let kk = [c(11, 1), c(11, 3)];
        let exact = equity::heads_up_nlh_equity_exact(aa, kk, &[]);
        let mc = equity::heads_up_nlh_equity_mc(aa, kk, &[], 20_000, 7);
        let sigma = mc.ci95 / 1.96;
        assert_eq!(mc.samples, 20_000);
        assert!(
            (mc.equity - exact).abs() <= 4.0 * sigma,
            "{} {}",
            mc.equity,
            exact
        );
    }

    #[test]
    fn solver_gates_report_values_under_thresholds() {
        assert!((cfr::kuhn_value(100_000) + 1.0 / 18.0).abs() <= 1e-3);
        assert_eq!(cfr::leduc_fold_payoff_examples(), (1.0, -1.0));
        let leduc = cfr::leduc_exploitability(1_000_000);
        assert!(leduc <= 0.01, "{leduc}");
        assert!(cfr::leduc_cfr_probe_exploitability(5_000).is_finite());
        assert!(br::nlh_river_exploitability_pct_pot() <= 0.3);
        assert!(br::nlh_flop_balanced_exploitability_pct_pot() <= 1.0);
        assert!(
            (br::nlh_flop_balanced_exploitability_pct_pot()
                - br::flop_bucket_exploitability_pct_pot(
                    &br::balanced_flop_buckets(),
                    100.0,
                    66.0
                ))
            .abs()
                <= 1e-9
        );
        let flop_weight: f64 = br::balanced_flop_buckets().iter().map(|b| b.weight).sum();
        assert_eq!(br::balanced_flop_buckets().len(), 7);
        assert!((flop_weight - 1.0).abs() <= 1e-9);
        let coarse = br::nlh_flop_bucketed_exploitability_pct_pot(2);
        let balanced = br::nlh_flop_bucketed_exploitability_pct_pot(4);
        let precise = br::nlh_flop_bucketed_exploitability_pct_pot(6);
        assert!(coarse >= balanced, "{coarse} {balanced}");
        assert!(balanced >= precise, "{balanced} {precise}");
        assert!(precise <= 1.0, "{precise}");
        let plo4_fast = br::plo4_fast_exploitability_pct_pot();
        assert!(plo4_fast.is_finite());
        assert!(plo4_fast <= 12.0, "{plo4_fast}");
    }

    #[test]
    fn pot_limit_and_bucket_smoke() {
        assert_eq!(tree::pot_limit_max_raise(100.0, 20.0), 160.0);
        assert_eq!(bucket::kmeans_1d(&[0.1, 0.9], 2), vec![0, 1]);
    }

    #[test]
    fn bucket_quality_improves_with_more_clusters() {
        let points: Vec<bucket::EquityFeature> = (0..18)
            .map(|i| {
                let base = if i < 6 {
                    0.18
                } else if i < 12 {
                    0.52
                } else {
                    0.82
                };
                let drift = (i % 6) as f64 * 0.004;
                [
                    base,
                    base + drift,
                    base + 0.01,
                    base + 0.02,
                    base + 0.03,
                    base + 0.04,
                    base + 0.05,
                    base + 0.06,
                    base + 0.015,
                    (base + 0.015) * (base + 0.015),
                ]
            })
            .collect();
        let two = bucket::kmeans_features(&points, 2, 16, 7);
        let three = bucket::kmeans_features(&points, 3, 16, 7);
        assert_eq!(three, bucket::kmeans_features(&points, 3, 16, 7));
        assert!(
            bucket::within_cluster_variance(&points, &three)
                <= bucket::within_cluster_variance(&points, &two)
        );
        assert!(bucket::within_cluster_variance(&points, &three) < 0.002);
    }

    #[test]
    fn native_solve_uses_shared_river_strategy_rows() {
        super::init(None);
        let handle =
            super::solve(r#"{"pot":100.0,"bet":66.0,"stack":250.0}"#).expect("solve starts");
        let payload = super::serialize(handle).expect("serializes");
        let native: super::NativeSolve =
            serde_json::from_slice(&payload).expect("native solve json");
        let first = br::best_response_combo(br::DEFAULT_RIVER_SPECS[0].1, 100.0, 66.0);
        assert_eq!(native.combos[0], br::DEFAULT_RIVER_SPECS[0].0);
        assert_eq!(native.combos.len(), br::DEFAULT_RIVER_SPECS.len());
        assert_eq!(
            &native.strategy[0..3],
            &[first.fold, first.call, first.raise]
        );
        assert!(native.action_evs[2] >= native.action_evs[1]);
        assert!(native.metrics[(native.combos.len() - 1) * 3] >= 0.0);
        assert_eq!(native.metrics[native.combos.len() * 3], 2.5);
        assert!(
            native.progress.first().unwrap().exploitability_pct
                >= native.progress.last().unwrap().exploitability_pct
        );
        assert!(native.progress.last().unwrap().exploitability_pct <= 0.3);
        super::cancel(handle).expect("cancel");
    }

    #[test]
    fn native_solve_rejects_invalid_spots() {
        assert!(super::validate_spot(&super::NativeSpot {
            pot: 0.0,
            bet: 66.0,
            stack: None,
            board: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            pot: 100.0,
            bet: -1.0,
            stack: None,
            board: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            pot: 100.0,
            bet: 66.0,
            stack: Some(0.0),
            board: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            pot: 100.0,
            bet: 66.0,
            stack: None,
            board: Some("Ah Ah".to_string()),
        })
        .is_err());
    }

    #[test]
    fn native_solve_board_changes_representative_equity() {
        super::init(None);
        let empty = super::solve(r#"{"pot":100.0,"bet":66.0,"stack":250.0}"#).unwrap();
        let boarded =
            super::solve(r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c"}"#).unwrap();
        let empty_payload = super::serialize(empty).unwrap();
        let board_payload = super::serialize(boarded).unwrap();
        let empty_native: super::NativeSolve = serde_json::from_slice(&empty_payload).unwrap();
        let board_native: super::NativeSolve = serde_json::from_slice(&board_payload).unwrap();
        assert_ne!(empty_native.metrics[1], board_native.metrics[1]);
        super::cancel(empty).unwrap();
        super::cancel(boarded).unwrap();
    }
}
