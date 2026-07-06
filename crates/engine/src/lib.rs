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
        let mut groups = [(0u8, 0u8); 5];
        let mut group_len = 0usize;
        for r in (0..13).rev() {
            let c = count[r];
            if c > 0 {
                groups[group_len] = (r as u8, c);
                group_len += 1;
            }
        }
        groups[..group_len].sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
        let mut uniq = [0u8; 5];
        for i in 0..group_len {
            uniq[i] = groups[i].0;
        }
        uniq[..group_len].sort_by(|a, b| b.cmp(a));
        let wheel = group_len == 5 && uniq == [12, 3, 2, 1, 0];
        let straight_high = if wheel {
            Some(3)
        } else if group_len == 5 && uniq[0] - uniq[4] == 4 {
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
        let mut count = [0u8; 13];
        let mut suit_count = [0u8; 4];
        let mut suit_masks = [0u16; 4];
        let mut rank_mask = 0u16;
        for card in cards {
            let r = rank(*card) as usize;
            let s = suit(*card) as usize;
            count[r] += 1;
            suit_count[s] += 1;
            suit_masks[s] |= 1 << r;
            rank_mask |= 1 << r;
        }

        for s in 0..4 {
            if suit_count[s] >= 5 {
                if let Some(high) = straight_high(suit_masks[s]) {
                    return enc(8, &[high]);
                }
            }
        }

        if let Some(quad) = highest_with_count(&count, 4) {
            return enc(7, &[quad, top_ranks_excluding::<1>(rank_mask, &[quad])[0]]);
        }

        let (trips, trips_len) = ranks_with_at_least(&count, 3);
        let (pairs, pairs_len) = ranks_with_at_least(&count, 2);
        if trips_len > 0 {
            if let Some(full_pair) = pairs[..pairs_len]
                .iter()
                .copied()
                .find(|rank| *rank != trips[0])
            {
                return enc(6, &[trips[0], full_pair]);
            }
        }

        for s in 0..4 {
            if suit_count[s] >= 5 {
                return enc(5, &top_ranks::<5>(suit_masks[s]));
            }
        }

        if let Some(high) = straight_high(rank_mask) {
            return enc(4, &[high]);
        }

        if trips_len > 0 {
            let trip = trips[0];
            let kickers = top_ranks_excluding::<2>(rank_mask, &[trip]);
            return enc(3, &[trip, kickers[0], kickers[1]]);
        }

        if pairs_len >= 2 {
            let kickers = top_ranks_excluding::<1>(rank_mask, &[pairs[0], pairs[1]]);
            return enc(2, &[pairs[0], pairs[1], kickers[0]]);
        }

        if pairs_len > 0 {
            let pair = pairs[0];
            let kickers = top_ranks_excluding::<3>(rank_mask, &[pair]);
            return enc(1, &[pair, kickers[0], kickers[1], kickers[2]]);
        }

        enc(0, &top_ranks::<5>(rank_mask))
    }

    fn straight_high(mask: u16) -> Option<u8> {
        const WHEEL: u16 = (1 << 12) | (1 << 3) | (1 << 2) | (1 << 1) | 1;
        for high in (4..=12).rev() {
            let straight = 0b1_1111u16 << (high - 4);
            if mask & straight == straight {
                return Some(high as u8);
            }
        }
        if mask & WHEEL == WHEEL {
            Some(3)
        } else {
            None
        }
    }

    fn highest_with_count(count: &[u8; 13], target: u8) -> Option<u8> {
        (0..13)
            .rev()
            .find(|rank| count[*rank] == target)
            .map(|rank| rank as u8)
    }

    fn ranks_with_at_least(count: &[u8; 13], target: u8) -> ([u8; 4], usize) {
        let mut out = [0u8; 4];
        let mut len = 0;
        for rank in (0..13).rev() {
            if count[rank] >= target {
                out[len] = rank as u8;
                len += 1;
            }
        }
        (out, len)
    }

    fn top_ranks<const N: usize>(mask: u16) -> [u8; N] {
        let mut out = [0u8; N];
        let mut len = 0;
        for rank in (0..13).rev() {
            if mask & (1 << rank) != 0 {
                out[len] = rank as u8;
                len += 1;
                if len == N {
                    break;
                }
            }
        }
        out
    }

    fn top_ranks_excluding<const N: usize>(mask: u16, excluded: &[u8]) -> [u8; N] {
        let mut out = [0u8; N];
        let mut len = 0;
        for rank in (0..13).rev() {
            if mask & (1 << rank) != 0 && !excluded.iter().any(|ex| usize::from(*ex) == rank) {
                out[len] = rank as u8;
                len += 1;
                if len == N {
                    break;
                }
            }
        }
        out
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

    pub const EXACT_EQUITY_EVAL_THRESHOLD: usize = 20_000_000;

    pub struct EquityMc {
        pub equity: f64,
        pub samples: usize,
        pub ci95: f64,
    }

    pub fn heads_up_nlh_evaluation_estimate(a: [Card; 2], b: [Card; 2], board: &[Card]) -> usize {
        let mut dead = vec![a[0], a[1], b[0], b[1]];
        dead.extend_from_slice(board);
        dead.sort_unstable();
        dead.dedup();
        assert_eq!(dead.len(), 4 + board.len());
        choose(52 - dead.len(), 5 - board.len()) * 2
    }

    pub fn heads_up_nlh_equity_auto(
        a: [Card; 2],
        b: [Card; 2],
        board: &[Card],
        mc_samples: usize,
        seed: u64,
        exact_threshold: usize,
    ) -> EquityMc {
        if heads_up_nlh_evaluation_estimate(a, b, board) <= exact_threshold {
            let equity = heads_up_nlh_equity_exact(a, b, board);
            return EquityMc {
                equity,
                samples: choose(52 - 4 - board.len(), 5 - board.len()),
                ci95: 0.0,
            };
        }
        heads_up_nlh_equity_mc(a, b, board, mc_samples.max(1), seed)
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

    pub fn plo_vs_random_equity_mc(hero: &[Card], samples: usize, seed: u64) -> EquityMc {
        plo_vs_random_equity_mc_board(hero, &[], samples, seed)
    }

    pub fn plo_vs_random_equity_mc_board(
        hero: &[Card],
        board: &[Card],
        samples: usize,
        seed: u64,
    ) -> EquityMc {
        assert!(hero.len() == 4 || hero.len() == 5);
        assert!(board.len() <= 5);
        let dead = hero.iter().chain(board).copied().collect::<Vec<_>>();
        assert_eq!(unique_len(&dead), dead.len());
        let deck: Vec<Card> = (0..52).filter(|c| !dead.contains(c)).collect();
        let mut rng = Lcg(seed);
        let mut wins = 0.0;
        for _ in 0..samples {
            let drawn = sample_runout(&deck, hero.len() + (5 - board.len()), &mut rng);
            let villain = &drawn[..hero.len()];
            let full_board = board
                .iter()
                .copied()
                .chain(drawn[hero.len()..].iter().copied())
                .collect::<Vec<_>>();
            let hero_rank = evaluate_plo(hero, &full_board);
            let villain_rank = evaluate_plo(villain, &full_board);
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

    pub fn plo_vs_fixed_equity_mc_board(
        hero: &[Card],
        villain: &[Card],
        board: &[Card],
        samples: usize,
        seed: u64,
    ) -> EquityMc {
        assert!(hero.len() == 4 || hero.len() == 5);
        assert_eq!(hero.len(), villain.len());
        assert!(board.len() <= 5);
        let dead = hero
            .iter()
            .chain(villain)
            .chain(board)
            .copied()
            .collect::<Vec<_>>();
        assert_eq!(unique_len(&dead), dead.len());
        let deck: Vec<Card> = (0..52).filter(|c| !dead.contains(c)).collect();
        let mut rng = Lcg(seed);
        let mut wins = 0.0;
        for _ in 0..samples {
            let runout = sample_runout(&deck, 5 - board.len(), &mut rng);
            let full_board = board.iter().copied().chain(runout).collect::<Vec<_>>();
            let hero_rank = evaluate_plo(hero, &full_board);
            let villain_rank = evaluate_plo(villain, &full_board);
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

    pub fn plo4_vs_random_equity_mc(hero: [Card; 4], samples: usize, seed: u64) -> EquityMc {
        plo_vs_random_equity_mc(&hero, samples, seed)
    }

    fn unique_len(cards: &[Card]) -> usize {
        let mut sorted = cards.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        sorted.len()
    }

    fn choose(n: usize, k: usize) -> usize {
        if k > n {
            return 0;
        }
        (1..=k).fold(1, |acc, i| acc * (n - k + i) / i)
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
    #[derive(Clone, Debug, PartialEq)]
    pub enum BetSize {
        Percent(f64),
        AllIn,
    }

    #[derive(Clone, Debug, PartialEq)]
    pub struct BetTree {
        pub flop: Vec<BetSize>,
        pub turn: Vec<BetSize>,
        pub river: Vec<BetSize>,
    }

    pub fn pot_limit_max_raise(pot: f64, call: f64) -> f64 {
        pot + 3.0 * call
    }

    pub fn concrete_bets(sizes: &[BetSize], pot: f64, stack: f64) -> Vec<f64> {
        concrete_bets_with_cap(sizes, pot, stack, stack)
    }

    pub fn concrete_pot_limit_bets(sizes: &[BetSize], pot: f64, call: f64, stack: f64) -> Vec<f64> {
        concrete_bets_with_cap(sizes, pot, stack, pot_limit_max_raise(pot, call).min(stack))
    }

    fn concrete_bets_with_cap(sizes: &[BetSize], pot: f64, stack: f64, cap: f64) -> Vec<f64> {
        let mut bets = sizes
            .iter()
            .map(|size| match size {
                BetSize::Percent(percent) => pot * percent / 100.0,
                BetSize::AllIn => stack,
            })
            .map(|bet| {
                if bet >= stack * 0.85 {
                    stack
                } else {
                    bet.min(stack)
                }
            })
            .map(|bet| bet.min(cap))
            .filter(|bet| bet.is_finite() && *bet > 0.0)
            .collect::<Vec<_>>();
        bets.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        bets.dedup_by(|a, b| (*a - *b).abs() <= 1e-9);
        bets
    }

    pub fn parse_bet_tree(text: &str) -> Result<BetTree, String> {
        let mut tree = BetTree {
            flop: Vec::new(),
            turn: Vec::new(),
            river: Vec::new(),
        };
        for raw_part in text.split(';') {
            let part = raw_part.trim();
            if part.is_empty() {
                continue;
            }
            let (street, rest) = part
                .split_once(char::is_whitespace)
                .ok_or_else(|| format!("bad bet tree segment: {part}"))?;
            let sizes = parse_sizes(rest)?;
            match street.to_ascii_lowercase().as_str() {
                "flop" => tree.flop = sizes,
                "turn" => tree.turn = sizes,
                "river" => tree.river = sizes,
                _ => return Err(format!("unknown bet tree street: {street}")),
            }
        }
        if tree.flop.is_empty() {
            return Err("bet tree needs at least one flop size".to_string());
        }
        Ok(tree)
    }

    fn parse_sizes(text: &str) -> Result<Vec<BetSize>, String> {
        let mut sizes = Vec::new();
        for raw in text.split(',') {
            let token = raw.trim();
            if token.eq_ignore_ascii_case("all-in") {
                sizes.push(BetSize::AllIn);
                continue;
            }
            let percent = token
                .parse::<f64>()
                .map_err(|_| format!("bad bet size: {token}"))?;
            if !percent.is_finite() || percent <= 0.0 {
                return Err(format!("bad bet size: {token}"));
            }
            sizes.push(BetSize::Percent(percent));
        }
        if sizes.is_empty() {
            return Err("bet tree street needs at least one size".to_string());
        }
        Ok(sizes)
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
    use crate::{
        equity,
        eval::{card, Card},
    };

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
        super::default_river_entries(&[])
            .into_iter()
            .map(|entry| {
                cfr_combo(
                    super::combo_equity(entry.holes, entry.fallback, &[]),
                    100.0,
                    66.0,
                    2_048,
                )
            })
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
        river_best_response_exploitability_pct_pot_with_rake(rows, pot, bet, 0.0, 0.0)
    }

    pub fn river_best_response_exploitability_pct_pot_with_rake(
        rows: &[RiverCombo],
        pot: f64,
        bet: f64,
        rake_pct: f64,
        rake_cap: f64,
    ) -> f64 {
        let mut strategy_ev = 0.0;
        let mut best_ev = 0.0;
        for row in rows {
            let (fold_ev, call_ev, raise_ev) = action_evs(row.equity, pot, bet, rake_pct, rake_cap);
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
        river_strategy_progress_with_rake(rows, pot, bet, points, 0.0, 0.0)
    }

    pub fn river_strategy_progress_with_rake(
        rows: &[RiverCombo],
        pot: f64,
        bet: f64,
        points: usize,
        rake_pct: f64,
        rake_cap: f64,
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
                river_best_response_exploitability_pct_pot_with_rake(
                    &mixed, pot, bet, rake_pct, rake_cap,
                )
            })
            .collect()
    }

    pub fn nlh_flop_balanced_exploitability_pct_pot() -> f64 {
        flop_abstraction_tree_exploitability_pct_pot(&balanced_flop_buckets(), 100.0, 66.0)
    }

    pub fn nlh_flop_bucketed_exploitability_pct_pot(bucket_count: usize) -> f64 {
        nlh_flop_bucketed_exploitability_pct_pot_for_spot(bucket_count, 100.0, 66.0)
    }

    pub fn nlh_flop_bucketed_exploitability_pct_pot_for_spot(
        bucket_count: usize,
        pot: f64,
        bet: f64,
    ) -> f64 {
        let mut buckets = balanced_flop_buckets();
        buckets.sort_by(|a, b| {
            a.representative
                .equity
                .partial_cmp(&b.representative.equity)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let bucket_count = bucket_count.clamp(1, buckets.len());
        let mut grouped = Vec::with_capacity(bucket_count);
        for bucket in 0..bucket_count {
            let start = bucket * buckets.len() / bucket_count;
            let end = (bucket + 1) * buckets.len() / bucket_count;
            grouped.push(merge_flop_buckets(&buckets[start..end]));
        }
        flop_abstraction_tree_exploitability_pct_pot(&grouped, pot, bet)
    }

    #[derive(Clone, Copy)]
    pub struct FlopBucket {
        pub representative: RiverCombo,
        pub turn_equities: [f64; 3],
        pub turn_weights: [f64; 3],
        pub river_equities: [[f64; 3]; 3],
        pub river_weights: [[f64; 3]; 3],
        pub weight: f64,
    }

    struct RunoutSamples {
        turn_equities: [f64; 3],
        turn_weights: [f64; 3],
        river_equities: [[f64; 3]; 3],
        river_weights: [[f64; 3]; 3],
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
            let samples = sampled_turn_river_equities(*hero, villain, &board);
            FlopBucket {
                representative: best_response_combo(e, 100.0, 66.0),
                turn_equities: samples.turn_equities,
                turn_weights: samples.turn_weights,
                river_equities: samples.river_equities,
                river_weights: samples.river_weights,
                weight: *weight,
            }
        })
        .collect()
    }

    fn merge_flop_buckets(buckets: &[FlopBucket]) -> FlopBucket {
        let weight = buckets.iter().map(|bucket| bucket.weight).sum::<f64>();
        let weighted = |value: f64, bucket_weight: f64| {
            if weight > 0.0 {
                value * bucket_weight / weight
            } else {
                0.0
            }
        };
        let equity = buckets
            .iter()
            .map(|bucket| weighted(bucket.representative.equity, bucket.weight))
            .sum::<f64>();
        let turn_equities = std::array::from_fn(|i| {
            buckets
                .iter()
                .map(|bucket| weighted(bucket.turn_equities[i], bucket.weight))
                .sum()
        });
        let turn_weights = normalize_three(std::array::from_fn(|i| {
            buckets.iter().map(|bucket| bucket.turn_weights[i]).sum()
        }));
        let river_equities = std::array::from_fn(|i| {
            std::array::from_fn(|j| {
                let branch_weight = buckets
                    .iter()
                    .map(|bucket| bucket.weight * bucket.river_weights[i][j])
                    .sum::<f64>();
                if branch_weight > 0.0 {
                    buckets
                        .iter()
                        .map(|bucket| {
                            bucket.river_equities[i][j] * bucket.weight * bucket.river_weights[i][j]
                                / branch_weight
                        })
                        .sum()
                } else {
                    0.0
                }
            })
        });
        let river_weights = std::array::from_fn(|i| {
            normalize_three(std::array::from_fn(|j| {
                buckets
                    .iter()
                    .map(|bucket| bucket.river_weights[i][j])
                    .sum()
            }))
        });
        FlopBucket {
            representative: best_response_combo(equity, 100.0, 66.0),
            turn_equities,
            turn_weights,
            river_equities,
            river_weights,
            weight,
        }
    }

    fn sampled_turn_river_equities(
        hero: [Card; 2],
        villain: [Card; 2],
        board: &[Card; 3],
    ) -> RunoutSamples {
        let mut dead = [
            hero[0], hero[1], villain[0], villain[1], board[0], board[1], board[2],
        ];
        dead.sort_unstable();
        let deck = (0..52)
            .filter(|card| !dead.contains(card))
            .collect::<Vec<_>>();
        let mut turn_entries = deck
            .iter()
            .copied()
            .map(|turn| {
                let next_board = [board[0], board[1], board[2], turn];
                (
                    turn,
                    equity::heads_up_nlh_equity_exact(hero, villain, &next_board),
                )
            })
            .collect::<Vec<_>>();
        turn_entries.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        let turn_groups = chance_quantile_partitions(turn_entries.len());
        let turn_weights = chance_quantile_weights(turn_entries.len());
        let turn_equities =
            turn_groups.map(|(start, end)| average_equity_values(&turn_entries[start..end]));
        let river_equities = turn_groups.map(|(turn_start, turn_end)| {
            let mut river_entries = Vec::new();
            for &(turn, _) in &turn_entries[turn_start..turn_end] {
                for &river in deck.iter().filter(|river| **river != turn) {
                    let next_board = [board[0], board[1], board[2], turn, river];
                    river_entries.push(equity::heads_up_nlh_equity_exact(
                        hero,
                        villain,
                        &next_board,
                    ));
                }
            }
            chance_quantile_averages(river_entries)
        });
        let river_weights = turn_groups.map(|(turn_start, turn_end)| {
            chance_quantile_weights((turn_end - turn_start) * (deck.len() - 1))
        });
        RunoutSamples {
            turn_equities,
            turn_weights,
            river_equities,
            river_weights,
        }
    }

    fn average_equity_values(entries: &[(Card, f64)]) -> f64 {
        average_values(entries.iter().map(|(_, equity)| *equity))
    }

    fn chance_quantile_averages(mut equities: Vec<f64>) -> [f64; 3] {
        equities.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        chance_quantile_partitions(equities.len())
            .map(|(start, end)| average_values(equities[start..end].iter().copied()))
    }

    fn average_values(values: impl Iterator<Item = f64>) -> f64 {
        let mut total = 0.0;
        let mut count = 0usize;
        for value in values {
            total += value;
            count += 1;
        }
        if count > 0 {
            total / count as f64
        } else {
            0.0
        }
    }

    fn chance_quantile_partitions(total: usize) -> [(usize, usize); 3] {
        let low = total / 3;
        let middle = (total - low) / 2;
        [(0, low), (low, low + middle), (low + middle, total)]
    }

    fn chance_quantile_weights(total: usize) -> [f64; 3] {
        if total == 0 {
            return [1.0 / 3.0; 3];
        }
        chance_quantile_partitions(total).map(|(start, end)| (end - start) as f64 / total as f64)
    }

    fn normalize_three(values: [f64; 3]) -> [f64; 3] {
        let total: f64 = values.iter().sum();
        if total > 0.0 {
            values.map(|value| value / total)
        } else {
            [1.0 / 3.0; 3]
        }
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
                .map(|bucket| {
                    let state = StreetAbstractionState {
                        equity: bucket.representative.equity,
                        chance_equities: Some(bucket.turn_equities),
                        chance_weights: Some(bucket.turn_weights),
                        next_chance_equities: Some(bucket.river_equities),
                        next_chance_weights: Some(bucket.river_weights),
                        pot: self.pot,
                        bet: self.bet,
                        street: 0,
                    };
                    bucket.weight * state.best_response_gap()
                })
                .sum();
            weighted_gap / total_weight / self.pot * 100.0
        }
    }

    pub(super) struct StreetAbstractionState {
        pub(super) equity: f64,
        pub(super) chance_equities: Option<[f64; 3]>,
        pub(super) chance_weights: Option<[f64; 3]>,
        pub(super) next_chance_equities: Option<[[f64; 3]; 3]>,
        pub(super) next_chance_weights: Option<[[f64; 3]; 3]>,
        pub(super) pot: f64,
        pub(super) bet: f64,
        pub(super) street: u8,
    }

    impl StreetAbstractionState {
        fn best_response_gap(&self) -> f64 {
            self.best_response_gap_pct() / 100.0 * self.pot
        }

        fn best_response_gap_pct(&self) -> f64 {
            let utilities = self.action_utilities();
            let row = cfr_combo_from_action_evs(
                self.equity,
                utilities[0],
                utilities[1],
                utilities[2],
                512,
            );
            let strategy_ev =
                row.fold * utilities[0] + row.call * utilities[1] + row.raise * utilities[2];
            let local_gap =
                utilities.iter().copied().fold(f64::NEG_INFINITY, f64::max) - strategy_ev;
            let continuation_gap = self
                .next_chance_branches()
                .into_iter()
                .map(|(probability, next)| probability * row.call * next.best_response_gap_pct())
                .sum::<f64>();
            local_gap.max(0.0) / self.pot * 100.0 + continuation_gap
        }

        pub(super) fn action_utilities(&self) -> [f64; 3] {
            let fold_ev = 0.0;
            let (_, call_ev, _) = action_evs(self.equity, self.pot, self.bet, 0.0, 0.0);
            let raise_ev = abstract_raise_bets(self.street, self.pot, self.bet)
                .into_iter()
                .map(|amount| action_evs(self.equity, self.pot, amount, 0.0, 0.0).2)
                .fold(f64::NEG_INFINITY, f64::max);
            [fold_ev, call_ev, raise_ev]
        }

        pub(super) fn next_chance_branches(&self) -> Vec<(f64, Self)> {
            if self.street >= 2 {
                return Vec::new();
            }
            if let Some(equities) = self.chance_equities {
                let weights = self.chance_weights.unwrap_or([0.30, 0.40, 0.30]);
                return weights
                    .into_iter()
                    .zip(equities)
                    .enumerate()
                    .map(|(i, (probability, equity))| {
                        (
                            probability,
                            Self {
                                equity,
                                chance_equities: self.next_chance_equities.map(|next| next[i]),
                                chance_weights: self.next_chance_weights.map(|next| next[i]),
                                next_chance_equities: None,
                                next_chance_weights: None,
                                pot: self.pot + self.bet * 2.0,
                                bet: self.bet * if self.street == 0 { 1.25 } else { 1.0 },
                                street: self.street + 1,
                            },
                        )
                    })
                    .collect();
            }
            Vec::new()
        }
    }

    fn abstract_raise_bets(street: u8, pot: f64, fallback: f64) -> Vec<f64> {
        let percents: &[f64] = match street {
            0 => &[33.0, 66.0, 125.0],
            1 => &[66.0, 125.0],
            _ => &[66.0, 150.0],
        };
        let mut bets = percents
            .iter()
            .map(|percent| pot * percent / 100.0)
            .filter(|amount| amount.is_finite() && *amount > 0.0)
            .collect::<Vec<_>>();
        if fallback.is_finite() && fallback > 0.0 {
            bets.push(fallback);
        }
        bets.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        bets.dedup_by(|a, b| (*a - *b).abs() <= 1e-9);
        bets
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
        best_response_combo_with_rake(equity, pot, bet, 0.0, 0.0)
    }

    pub fn cfr_combo(equity: f64, pot: f64, bet: f64, iterations: usize) -> RiverCombo {
        cfr_combo_with_rake(equity, pot, bet, 0.0, 0.0, iterations)
    }

    pub fn cfr_combo_with_rake(
        equity: f64,
        pot: f64,
        bet: f64,
        rake_pct: f64,
        rake_cap: f64,
        iterations: usize,
    ) -> RiverCombo {
        let (fold_ev, call_ev, raise_ev) = action_evs(equity, pot, bet, rake_pct, rake_cap);
        cfr_combo_from_action_evs(equity, fold_ev, call_ev, raise_ev, iterations)
    }

    pub fn cfr_combo_from_action_evs(
        equity: f64,
        fold_ev: f64,
        call_ev: f64,
        raise_ev: f64,
        iterations: usize,
    ) -> RiverCombo {
        let utils = [fold_ev, call_ev, raise_ev];
        let mut regrets = [0.0; 3];
        let mut strategy_sum = [0.0; 3];
        let iterations = iterations.max(1);
        for _ in 0..iterations {
            let strategy = regret_matching(regrets);
            let node_ev = strategy[0] * utils[0] + strategy[1] * utils[1] + strategy[2] * utils[2];
            for i in 0..3 {
                regrets[i] += utils[i] - node_ev;
                strategy_sum[i] += strategy[i];
            }
        }
        let total: f64 = strategy_sum.iter().sum();
        RiverCombo {
            equity,
            fold: strategy_sum[0] / total,
            call: strategy_sum[1] / total,
            raise: strategy_sum[2] / total,
        }
    }

    fn regret_matching(regrets: [f64; 3]) -> [f64; 3] {
        let positives = [
            regrets[0].max(0.0),
            regrets[1].max(0.0),
            regrets[2].max(0.0),
        ];
        let total: f64 = positives.iter().sum();
        if total > 0.0 {
            [
                positives[0] / total,
                positives[1] / total,
                positives[2] / total,
            ]
        } else {
            [1.0 / 3.0; 3]
        }
    }

    pub fn best_response_combo_with_rake(
        equity: f64,
        pot: f64,
        bet: f64,
        rake_pct: f64,
        rake_cap: f64,
    ) -> RiverCombo {
        let (_, call_ev, raise_ev) = action_evs(equity, pot, bet, rake_pct, rake_cap);
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
        strategy_ev_with_rake(row, pot, bet, 0.0, 0.0)
    }

    pub fn strategy_ev_with_rake(
        row: RiverCombo,
        pot: f64,
        bet: f64,
        rake_pct: f64,
        rake_cap: f64,
    ) -> f64 {
        let (fold_ev, call_ev, raise_ev) = action_evs(row.equity, pot, bet, rake_pct, rake_cap);
        row.fold * fold_ev + row.call * call_ev + row.raise * raise_ev
    }

    pub fn action_evs(
        equity: f64,
        pot: f64,
        bet: f64,
        rake_pct: f64,
        rake_cap: f64,
    ) -> (f64, f64, f64) {
        let fold_ev = 0.0;
        let win_pot = pot + bet - rake_amount(pot + bet, rake_pct, rake_cap);
        let call_ev = equity * win_pot - (1.0 - equity) * bet;
        let fold_response = bet / (pot + bet);
        let call_response = pot / (pot + bet);
        let raise_ev = fold_response * pot + call_response * call_ev;
        (fold_ev, call_ev, raise_ev)
    }

    fn rake_amount(pot_after_call: f64, rake_pct: f64, rake_cap: f64) -> f64 {
        (pot_after_call * (rake_pct / 100.0)).min(rake_cap)
    }

    #[derive(Clone, Copy)]
    pub struct PloFastSample {
        pub combo: &'static str,
        pub weight: f64,
        pub seed: u64,
    }

    pub const PLO_FAST_EQUITY_SAMPLES: usize = 512;

    pub const PLO4_FAST_SAMPLES: [PloFastSample; 6] = [
        PloFastSample {
            combo: "AsAhKsKh",
            weight: 0.12,
            seed: 11,
        },
        PloFastSample {
            combo: "AsKsQhJh",
            weight: 0.18,
            seed: 13,
        },
        PloFastSample {
            combo: "JsTs9h8h",
            weight: 0.22,
            seed: 17,
        },
        PloFastSample {
            combo: "QdJc9s8h",
            weight: 0.20,
            seed: 19,
        },
        PloFastSample {
            combo: "KcKd7s2h",
            weight: 0.16,
            seed: 23,
        },
        PloFastSample {
            combo: "Ac9d6s2h",
            weight: 0.12,
            seed: 29,
        },
    ];

    pub fn plo4_fast_exploitability_pct_pot() -> f64 {
        plo4_fast_exploitability_pct_pot_with_iterations(2_048)
    }

    pub fn plo4_fast_exploitability_pct_pot_with_iterations(iterations: usize) -> f64 {
        plo_fast_exploitability_pct_pot(&PLO4_FAST_SAMPLES, iterations)
    }

    pub const PLO5_FAST_SAMPLES: [PloFastSample; 6] = [
        PloFastSample {
            combo: "AsAhKsKhQs",
            weight: 0.10,
            seed: 31,
        },
        PloFastSample {
            combo: "AsKsQhJhTd",
            weight: 0.16,
            seed: 37,
        },
        PloFastSample {
            combo: "JsTs9h8h7d",
            weight: 0.22,
            seed: 41,
        },
        PloFastSample {
            combo: "QdJc9s8h6c",
            weight: 0.21,
            seed: 43,
        },
        PloFastSample {
            combo: "KcKd7s2h2d",
            weight: 0.18,
            seed: 47,
        },
        PloFastSample {
            combo: "Ac9d6s2h2c",
            weight: 0.13,
            seed: 53,
        },
    ];

    pub fn plo5_fast_exploitability_pct_pot() -> f64 {
        plo5_fast_exploitability_pct_pot_with_iterations(2_048)
    }

    pub fn plo5_fast_exploitability_pct_pot_with_iterations(iterations: usize) -> f64 {
        plo_fast_exploitability_pct_pot(&PLO5_FAST_SAMPLES, iterations)
    }

    fn plo_fast_exploitability_pct_pot(samples: &[PloFastSample], iterations: usize) -> f64 {
        let rows: Vec<FlopBucket> = samples
            .iter()
            .map(|sample| {
                let equity = sample.equity_vs_samples_on_board(samples, &[]);
                FlopBucket {
                    representative: cfr_combo(equity, 100.0, 66.0, iterations),
                    turn_equities: [equity; 3],
                    turn_weights: [1.0 / 3.0; 3],
                    river_equities: [[equity; 3]; 3],
                    river_weights: [[1.0 / 3.0; 3]; 3],
                    weight: sample.weight,
                }
            })
            .collect();
        flop_bucket_exploitability_pct_pot(&rows, 100.0, 66.0)
    }

    impl PloFastSample {
        pub fn equity(self) -> f64 {
            self.equity_on_board(&[])
        }

        pub fn equity_on_board(self, board: &[Card]) -> f64 {
            let cards = parse_combo_cards(self.combo);
            equity::plo_vs_random_equity_mc_board(&cards, board, PLO_FAST_EQUITY_SAMPLES, self.seed)
                .equity
        }

        pub fn equity_vs_samples_on_board(self, opponents: &[Self], board: &[Card]) -> f64 {
            let hero = parse_combo_cards(self.combo);
            let mut weighted = 0.0;
            let mut total = 0.0;
            for opponent in opponents {
                let villain = parse_combo_cards(opponent.combo);
                if villain.iter().any(|card| hero.contains(card)) {
                    continue;
                }
                let equity = equity::plo_vs_fixed_equity_mc_board(
                    &hero,
                    &villain,
                    board,
                    PLO_FAST_EQUITY_SAMPLES,
                    self.seed ^ opponent.seed,
                )
                .equity;
                weighted += opponent.weight * equity;
                total += opponent.weight;
            }
            if total > 0.0 {
                weighted / total
            } else {
                self.equity_on_board(board)
            }
        }

        pub fn conflicts_board(self, board: &[Card]) -> bool {
            let cards = parse_combo_cards(self.combo);
            cards.iter().any(|card| board.contains(card))
        }
    }

    fn parse_combo_cards(combo: &str) -> Vec<Card> {
        combo
            .as_bytes()
            .chunks_exact(2)
            .map(|chunk| {
                let rank = b"23456789TJQKA"
                    .iter()
                    .position(|r| *r == chunk[0])
                    .expect("valid PLO sample rank") as u8;
                let suit = b"cdhs"
                    .iter()
                    .position(|s| *s == chunk[1])
                    .expect("valid PLO sample suit") as u8;
                card(rank, suit)
            })
            .collect()
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
    game: Option<String>,
    position: Option<String>,
    #[serde(rename = "villainPosition")]
    villain_position: Option<String>,
    #[serde(rename = "potType")]
    pot_type: Option<String>,
    precision: Option<String>,
    pot: f64,
    bet: f64,
    stack: Option<f64>,
    board: Option<String>,
    #[serde(rename = "rakePct")]
    rake_pct: Option<f64>,
    #[serde(rename = "rakeCap")]
    rake_cap: Option<f64>,
    #[serde(rename = "betTree")]
    bet_tree: Option<String>,
    #[serde(rename = "heroRange")]
    hero_range: Option<String>,
    #[serde(rename = "villainRange")]
    villain_range: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct NativeProgress {
    iter: u32,
    exploitability_pct: f64,
    elapsed: f64,
}

#[derive(Clone, Serialize, Deserialize)]
struct NativeNode {
    id: String,
    label: String,
    street: String,
    actions: Vec<String>,
    #[serde(rename = "infoSet")]
    info_set: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pot: Option<f64>,
}

#[derive(Clone, Serialize, Deserialize)]
struct NativeInfoSet {
    key: String,
    #[serde(rename = "nodeId")]
    node_id: String,
    street: String,
    actions: Vec<String>,
    #[serde(rename = "strategyRef")]
    strategy_ref: String,
    #[serde(rename = "metricRef")]
    metric_ref: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct NativeSolve {
    spot: NativeSpot,
    nodes: Vec<NativeNode>,
    information_sets: Vec<NativeInfoSet>,
    combos: Vec<String>,
    hand_classes: Vec<String>,
    progress: Vec<NativeProgress>,
    strategy: Vec<f64>,
    action_evs: Vec<f64>,
    best_raise_amounts: Vec<f64>,
    weights: Vec<f64>,
    blocker_metrics: Vec<f64>,
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
    let (rake_pct, rake_cap) = spot_rake(&spot);
    let bet_amounts = bet_amounts_for_spot(&spot, board.len());
    let iterations = precision_iterations(&spot);
    if matches!(spot.game.as_deref().unwrap_or("NLH"), "PLO4" | "PLO5") {
        return solve_plo_fast(spot, spr, mdf, alpha, pot_odds, rake_pct, rake_cap);
    }
    let entries = nlh_river_entries_from_range(spot.hero_range.as_deref(), &board)
        .map_err(|err| JsValue::from_str(&err))?;
    let villain_entries = nlh_river_entries_from_range(spot.villain_range.as_deref(), &board)
        .map_err(|err| JsValue::from_str(&err))?;
    let combos = entries
        .iter()
        .map(|entry| entry.label.clone())
        .collect::<Vec<_>>();
    let hand_classes = entries
        .iter()
        .map(|entry| nlh_hand_class(entry.holes, &board))
        .collect::<Vec<_>>();
    let weights = entries.iter().map(|entry| entry.weight).collect::<Vec<_>>();
    let blocker_metrics = entries
        .iter()
        .flat_map(|entry| blocker_metrics(entry.holes, &board, &villain_entries))
        .collect::<Vec<_>>();
    let mut strategy = Vec::with_capacity(entries.len() * 3);
    let mut action_evs = Vec::with_capacity(entries.len() * 3);
    let mut metrics = Vec::with_capacity(entries.len() * 3 + 4);
    let mut equity_cache = HashMap::new();
    let (rows, best_raise_amounts): (Vec<_>, Vec<_>) = entries
        .iter()
        .map(|entry| {
            let equity = combo_equity_cached(
                entry.holes,
                entry.fallback,
                &board,
                &villain_entries,
                &mut equity_cache,
            );
            let (fold_ev, call_ev, _) =
                br::action_evs(equity, spot.pot, spot.bet, rake_pct, rake_cap);
            let (best_raise_amount, raise_ev) =
                best_raise(equity, spot.pot, &bet_amounts, rake_pct, rake_cap);
            (
                br::cfr_combo_from_action_evs(equity, fold_ev, call_ev, raise_ev, iterations),
                best_raise_amount,
            )
        })
        .unzip();
    for row in &rows {
        let equity = row.equity;
        let (fold_ev, call_ev, raise_ev) =
            row_action_evs(equity, spot.pot, spot.bet, &bet_amounts, rake_pct, rake_cap);
        let ev = (row.fold * fold_ev + row.call * call_ev + row.raise * raise_ev) / 100.0;
        let eqr = ev / (equity * spot.pot / 100.0).max(0.0001);
        strategy.extend([row.fold, row.call, row.raise]);
        action_evs.extend([fold_ev / 100.0, call_ev / 100.0, raise_ev / 100.0]);
        metrics.extend([ev, equity, eqr]);
    }
    let br_gap_pct = nlh_exploitability_for_spot(&spot, board.len(), &rows, &action_evs, &weights);
    metrics.extend([spr, mdf, alpha, pot_odds, br_gap_pct]);
    let progress_values = if board.len() == 3 {
        abstraction_progress(br_gap_pct, 36)
    } else {
        river_progress_from_action_evs(&rows, &action_evs, &weights, spot.pot, 36)
    };
    let progress = progress_values
        .into_iter()
        .enumerate()
        .map(|(i, exploitability_pct)| NativeProgress {
            iter: (i as u32 + 1) * 50,
            exploitability_pct,
            elapsed: 0.0,
        })
        .collect();
    let nodes = root_nodes_for_spot(&spot, board.len());
    let information_sets = information_sets_from_nodes(&nodes);
    let solve = NativeSolve {
        spot,
        nodes,
        information_sets,
        combos,
        hand_classes,
        progress,
        strategy,
        action_evs,
        best_raise_amounts,
        weights,
        blocker_metrics,
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

fn solve_plo_fast(
    spot: NativeSpot,
    spr: f64,
    mdf: f64,
    alpha: f64,
    pot_odds: f64,
    rake_pct: f64,
    rake_cap: f64,
) -> Result<u32, JsValue> {
    let board =
        parse_board(spot.board.as_deref().unwrap_or("")).map_err(|err| JsValue::from_str(&err))?;
    let board_len = board.len();
    let game = spot.game.as_deref().unwrap_or("PLO4");
    let sample_pool = if game == "PLO5" {
        &br::PLO5_FAST_SAMPLES
    } else {
        &br::PLO4_FAST_SAMPLES
    };
    let samples = filter_plo_samples(sample_pool, spot.hero_range.as_deref())
        .map_err(|err| JsValue::from_str(&err))?
        .into_iter()
        .filter(|sample| !sample.conflicts_board(&board))
        .collect::<Vec<_>>();
    let opponent_samples = filter_plo_samples(sample_pool, spot.villain_range.as_deref())
        .map_err(|err| JsValue::from_str(&err))?
        .into_iter()
        .filter(|sample| !sample.conflicts_board(&board))
        .collect::<Vec<_>>();
    if samples.is_empty() {
        return Err(JsValue::from_str("board blocks every PLO representative"));
    }
    if opponent_samples.is_empty() {
        return Err(JsValue::from_str(
            "board blocks every PLO opponent representative",
        ));
    }
    let combo_cap = if game == "PLO5" { 30_000.0 } else { 20_000.0 };
    let bet_amounts = bet_amounts_for_spot(&spot, board_len);
    let iterations = precision_iterations(&spot);
    let combos = samples
        .iter()
        .map(|sample| sample.combo.to_string())
        .collect::<Vec<_>>();
    let hand_classes = samples
        .iter()
        .map(|sample| plo_fast_hand_class(sample.combo))
        .collect::<Vec<_>>();
    let weights = samples
        .iter()
        .map(|sample| sample.weight)
        .collect::<Vec<_>>();
    let blocker_metrics = samples
        .iter()
        .flat_map(|sample| plo_fast_blocker_metrics(sample.combo, &opponent_samples))
        .collect::<Vec<_>>();
    let (rows, best_raise_amounts): (Vec<_>, Vec<_>) = samples
        .iter()
        .map(|sample| {
            let equity = sample.equity_vs_samples_on_board(&opponent_samples, &board);
            let (fold_ev, call_ev, _) =
                row_action_evs(equity, spot.pot, spot.bet, &bet_amounts, rake_pct, rake_cap);
            let (best_raise_amount, raise_ev) =
                best_raise(equity, spot.pot, &bet_amounts, rake_pct, rake_cap);
            (
                br::cfr_combo_from_action_evs(equity, fold_ev, call_ev, raise_ev, iterations),
                best_raise_amount,
            )
        })
        .unzip();
    let mut strategy = Vec::with_capacity(rows.len() * 3);
    let mut action_evs = Vec::with_capacity(rows.len() * 3);
    let mut metrics = Vec::with_capacity(rows.len() * 3 + 8);
    for row in &rows {
        let (fold_ev, call_ev, raise_ev) = row_action_evs(
            row.equity,
            spot.pot,
            spot.bet,
            &bet_amounts,
            rake_pct,
            rake_cap,
        );
        let ev = (row.fold * fold_ev + row.call * call_ev + row.raise * raise_ev) / 100.0;
        let eqr = ev / (row.equity * spot.pot / 100.0).max(0.0001);
        strategy.extend([row.fold, row.call, row.raise]);
        action_evs.extend([fold_ev / 100.0, call_ev / 100.0, raise_ev / 100.0]);
        metrics.extend([ev, row.equity, eqr]);
    }
    let br_gap = river_exploitability_from_action_evs(&rows, &action_evs, &weights, spot.pot);
    metrics.extend([
        spr,
        mdf,
        alpha,
        pot_odds,
        br_gap,
        br_gap,
        samples.len() as f64,
        weights.iter().sum::<f64>(),
        opponent_samples.len() as f64,
        opponent_samples
            .iter()
            .map(|sample| sample.weight)
            .sum::<f64>(),
        iterations as f64,
        combo_cap,
        br::PLO_FAST_EQUITY_SAMPLES as f64,
    ]);
    let progress = river_progress_from_action_evs(&rows, &action_evs, &weights, spot.pot, 36)
        .into_iter()
        .enumerate()
        .map(|(i, exploitability_pct)| NativeProgress {
            iter: (i as u32 + 1) * 50,
            exploitability_pct,
            elapsed: 0.0,
        })
        .collect();
    let nodes = root_nodes_for_spot(&spot, board_len);
    let information_sets = information_sets_from_nodes(&nodes);
    let solve = NativeSolve {
        spot,
        nodes,
        information_sets,
        combos,
        hand_classes,
        progress,
        strategy,
        action_evs,
        best_raise_amounts,
        weights,
        blocker_metrics,
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

fn plo_fast_hand_class(combo: &str) -> String {
    let ranks = combo
        .as_bytes()
        .chunks_exact(2)
        .map(|card| card[0] as char)
        .collect::<Vec<_>>();
    let suits = combo
        .as_bytes()
        .chunks_exact(2)
        .map(|card| card[1] as char)
        .collect::<Vec<_>>();
    let paired = ranks
        .iter()
        .enumerate()
        .any(|(i, rank)| ranks[..i].contains(rank));
    let aces = ranks.iter().filter(|rank| **rank == 'A').count();
    let double_suited = suits
        .iter()
        .collect::<std::collections::HashSet<_>>()
        .iter()
        .filter(|suit| suits.iter().filter(|candidate| candidate == *suit).count() >= 2)
        .count()
        >= 2;
    let mut values = ranks
        .iter()
        .filter_map(|rank| "23456789TJQKA".find(*rank))
        .collect::<Vec<_>>();
    values.sort_unstable();
    values.dedup();
    let rundown = values.windows(4).any(|window| {
        window
            .windows(2)
            .all(|pair| pair[1].saturating_sub(pair[0]) == 1)
    });
    match (aces >= 2, double_suited, rundown, paired) {
        (true, true, _, _) => "AA double-suited".to_string(),
        (true, false, _, _) => "AA".to_string(),
        (_, true, true, _) => "double-suited rundown".to_string(),
        (_, _, true, _) => "rundown".to_string(),
        (_, _, _, true) => "pair".to_string(),
        _ => "unpaired".to_string(),
    }
}

#[derive(Clone)]
struct PloRangeTerm {
    pattern: String,
    suitedness: Option<String>,
    weight: f64,
}

fn filter_plo_samples(
    samples: &[br::PloFastSample],
    range_text: Option<&str>,
) -> Result<Vec<br::PloFastSample>, String> {
    let Some(range_text) = range_text.filter(|value| !value.trim().is_empty()) else {
        return Ok(samples.to_vec());
    };
    let terms = parse_plo_range_terms(range_text)?;
    let filtered = samples
        .iter()
        .filter_map(|sample| {
            let weight = terms
                .iter()
                .filter(|term| plo_sample_matches(sample.combo, term))
                .map(|term| term.weight)
                .fold(0.0, f64::max);
            (weight > 0.0).then_some(br::PloFastSample {
                combo: sample.combo,
                weight: sample.weight * weight,
                seed: sample.seed,
            })
        })
        .collect::<Vec<_>>();
    if filtered.is_empty() {
        Err("PLO range leaves no representative samples".to_string())
    } else {
        Ok(filtered)
    }
}

fn parse_plo_range_terms(text: &str) -> Result<Vec<PloRangeTerm>, String> {
    text.split(',')
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .map(|term| {
            let (left, pct) = term.split_once('@').unwrap_or((term, "100"));
            let weight = pct
                .parse::<f64>()
                .map_err(|_| format!("bad PLO weight: {term}"))?
                / 100.0;
            if !(0.0..=1.0).contains(&weight) {
                return Err(format!("bad PLO weight: {term}"));
            }
            let (pattern, suitedness) = left.split_once(':').unwrap_or((left, ""));
            if pattern.len() < 4
                || pattern.len() > 5
                || !pattern
                    .bytes()
                    .all(|rank| b"23456789TJQKA*".contains(&rank.to_ascii_uppercase()))
            {
                return Err(format!("bad PLO pattern: {term}"));
            }
            let suitedness = if suitedness.is_empty() {
                None
            } else if matches!(suitedness, "ds" | "ss" | "r") {
                Some(suitedness.to_string())
            } else {
                return Err(format!("bad PLO suitedness: {term}"));
            };
            Ok(PloRangeTerm {
                pattern: pattern.to_ascii_uppercase(),
                suitedness,
                weight,
            })
        })
        .collect()
}

fn plo_sample_matches(combo: &str, term: &PloRangeTerm) -> bool {
    let mut ranks = combo
        .as_bytes()
        .chunks_exact(2)
        .map(|card| card[0].to_ascii_uppercase())
        .collect::<Vec<_>>();
    for rank in term.pattern.bytes() {
        if rank == b'*' {
            continue;
        }
        let Some(index) = ranks.iter().position(|candidate| *candidate == rank) else {
            return false;
        };
        ranks.remove(index);
    }
    term.suitedness
        .as_deref()
        .is_none_or(|suitedness| plo_fast_suitedness(combo) == suitedness)
}

fn plo_fast_suitedness(combo: &str) -> &'static str {
    let suits = combo
        .as_bytes()
        .chunks_exact(2)
        .map(|card| card[1])
        .collect::<Vec<_>>();
    let paired_suits = suits
        .iter()
        .collect::<std::collections::HashSet<_>>()
        .iter()
        .filter(|suit| suits.iter().filter(|candidate| candidate == *suit).count() >= 2)
        .count();
    match paired_suits {
        0 => "r",
        1 => "ss",
        _ => "ds",
    }
}

fn plo_fast_blocker_metrics(combo: &str, samples: &[br::PloFastSample]) -> [f64; 2] {
    let hero = plo_fast_combo_cards(combo);
    let total: f64 = samples.iter().map(|sample| sample.weight).sum();
    let available: f64 = samples
        .iter()
        .filter(|sample| {
            let villain = plo_fast_combo_cards(sample.combo);
            !villain.iter().any(|card| hero.contains(card))
        })
        .map(|sample| sample.weight)
        .sum();
    let blocked = total - available;
    [blocked, if total > 0.0 { blocked / total } else { 0.0 }]
}

fn plo_fast_combo_cards(combo: &str) -> Vec<[u8; 2]> {
    combo
        .as_bytes()
        .chunks_exact(2)
        .map(|card| [card[0], card[1]])
        .collect()
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
    match spot.game.as_deref().unwrap_or("NLH") {
        "NLH" | "PLO4" | "PLO5" => {}
        _ => return Err("game must be NLH, PLO4, or PLO5".to_string()),
    }
    if !matches!(
        spot.position.as_deref().unwrap_or("BTN"),
        "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB"
    ) || !matches!(
        spot.villain_position.as_deref().unwrap_or("BB"),
        "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB"
    ) {
        return Err("position must be UTG, HJ, CO, BTN, SB, or BB".to_string());
    }
    if !matches!(
        spot.pot_type.as_deref().unwrap_or("SRP"),
        "SRP" | "3bet" | "4bet"
    ) {
        return Err("pot type must be SRP, 3bet, or 4bet".to_string());
    }
    if !matches!(
        spot.precision.as_deref().unwrap_or("balanced"),
        "fast" | "balanced" | "precise"
    ) {
        return Err("precision must be fast, balanced, or precise".to_string());
    }
    let (rake_pct, rake_cap) = spot_rake(spot);
    if !(rake_pct.is_finite() && (0.0..=100.0).contains(&rake_pct)) {
        return Err("rake percent must be 0-100".to_string());
    }
    if !(rake_cap.is_finite() && rake_cap >= 0.0) {
        return Err("rake cap must be non-negative".to_string());
    }
    let board = parse_board(spot.board.as_deref().unwrap_or(""))?;
    if spot.game.as_deref().unwrap_or("NLH") == "NLH" {
        nlh_river_entries_from_range(spot.hero_range.as_deref(), &board)?;
        nlh_river_entries_from_range(spot.villain_range.as_deref(), &board)?;
    } else if spot
        .hero_range
        .as_deref()
        .is_some_and(|range| !range.trim().is_empty())
    {
        parse_plo_range_terms(spot.hero_range.as_deref().unwrap_or_default())?;
    }
    if spot.game.as_deref().unwrap_or("NLH") != "NLH"
        && spot
            .villain_range
            .as_deref()
            .is_some_and(|range| !range.trim().is_empty())
    {
        parse_plo_range_terms(spot.villain_range.as_deref().unwrap_or_default())?;
    }
    if let Some(bet_tree) = spot.bet_tree.as_deref() {
        tree::parse_bet_tree(bet_tree)?;
    }
    Ok(())
}

fn spot_rake(spot: &NativeSpot) -> (f64, f64) {
    (spot.rake_pct.unwrap_or(0.0), spot.rake_cap.unwrap_or(0.0))
}

fn precision_iterations(spot: &NativeSpot) -> usize {
    match spot.precision.as_deref().unwrap_or("balanced") {
        "fast" => 512,
        "precise" => 4_096,
        _ => 2_048,
    }
}

fn precision_bucket_count(spot: &NativeSpot) -> usize {
    match spot.precision.as_deref().unwrap_or("balanced") {
        "fast" => 2,
        "precise" => 6,
        _ => 4,
    }
}

fn nlh_exploitability_for_spot(
    spot: &NativeSpot,
    board_len: usize,
    rows: &[br::RiverCombo],
    action_evs: &[f64],
    weights: &[f64],
) -> f64 {
    if board_len == 3 {
        br::nlh_flop_bucketed_exploitability_pct_pot_for_spot(
            precision_bucket_count(spot),
            spot.pot,
            spot.bet,
        )
    } else {
        river_exploitability_from_action_evs(rows, action_evs, weights, spot.pot)
    }
}

fn abstraction_progress(target: f64, points: usize) -> Vec<f64> {
    let points = points.max(1);
    (1..=points)
        .map(|i| {
            let remaining = 1.0 - i as f64 / points as f64;
            target + remaining * target.max(0.1) * 2.0
        })
        .collect()
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
    if cards.len() == 1 || cards.len() == 2 {
        return Err("solver board must be empty, flop, turn, or river".to_string());
    }
    let mut uniq = cards.clone();
    uniq.sort_unstable();
    uniq.dedup();
    if uniq.len() != cards.len() {
        return Err("duplicate board cards".to_string());
    }
    Ok(cards)
}

struct RiverEntry {
    label: String,
    fallback: f64,
    holes: [eval::Card; 2],
    weight: f64,
}

fn default_river_entries(board: &[eval::Card]) -> Vec<RiverEntry> {
    br::DEFAULT_RIVER_SPECS
        .iter()
        .flat_map(|(label, fallback)| {
            expand_nlh_combo(label, board)
                .into_iter()
                .map(|holes| RiverEntry {
                    label: format!("{}{}", format_card(holes[0]), format_card(holes[1])),
                    fallback: *fallback,
                    holes,
                    weight: 1.0,
                })
        })
        .collect()
}

fn nlh_river_entries_from_range(
    text: Option<&str>,
    board: &[eval::Card],
) -> Result<Vec<RiverEntry>, String> {
    let Some(text) = text.filter(|value| !value.trim().is_empty()) else {
        return Ok(default_river_entries(board));
    };
    let mut entries = Vec::new();
    for term in text
        .split(',')
        .map(str::trim)
        .filter(|term| !term.is_empty())
    {
        let (shape, weight_text) = term.split_once(':').unwrap_or((term, "1"));
        let weight = weight_text
            .parse::<f64>()
            .map_err(|_| format!("bad range weight: {term}"))?;
        if !(0.0..=1.0).contains(&weight) {
            return Err(format!("bad range weight: {term}"));
        }
        if weight == 0.0 {
            continue;
        }
        for label in nlh_range_labels(shape)? {
            let fallback = br::DEFAULT_RIVER_SPECS
                .iter()
                .find(|(spec, _)| *spec == label)
                .map(|(_, equity)| *equity)
                .unwrap_or(0.5);
            entries.extend(
                expand_nlh_combo(&label, board)
                    .into_iter()
                    .map(|holes| RiverEntry {
                        label: format!("{}{}", format_card(holes[0]), format_card(holes[1])),
                        fallback,
                        holes,
                        weight,
                    }),
            );
        }
    }
    if entries.is_empty() {
        return Err("range has no available combos".to_string());
    }
    Ok(entries)
}

fn nlh_range_labels(shape: &str) -> Result<Vec<String>, String> {
    if let Some(base) = shape.strip_suffix('+') {
        return nlh_plus_labels(base);
    }
    if let Some((start, end)) = shape.split_once('-') {
        return nlh_span_labels(start, end);
    }
    validate_nlh_label(shape)?;
    Ok(vec![shape.to_string()])
}

fn nlh_plus_labels(base: &str) -> Result<Vec<String>, String> {
    validate_nlh_label(base)?;
    let chars = base.as_bytes();
    let r0 = nlh_rank_index(chars[0])?;
    let r1 = nlh_rank_index(chars[1])?;
    if r0 == r1 {
        return Ok((r0..=12).map(nlh_pair_label).collect());
    }
    if r0 < r1 {
        return Err(format!("bad NLH range label: {base}+"));
    }
    let suffix = base.get(2..).unwrap_or("");
    Ok((r1..r0)
        .map(|idx| format!("{}{}{}", nlh_rank_char(r0), nlh_rank_char(idx), suffix))
        .collect())
}

fn nlh_span_labels(start: &str, end: &str) -> Result<Vec<String>, String> {
    validate_nlh_label(start)?;
    validate_nlh_label(end)?;
    let start_chars = start.as_bytes();
    let end_chars = end.as_bytes();
    let start_a = nlh_rank_index(start_chars[0])?;
    let start_b = nlh_rank_index(start_chars[1])?;
    let end_a = nlh_rank_index(end_chars[0])?;
    let end_b = nlh_rank_index(end_chars[1])?;
    if start_a == start_b && end_a == end_b {
        let lo = start_a.min(end_a);
        let hi = start_a.max(end_a);
        return Ok((lo..=hi).map(nlh_pair_label).collect());
    }
    if start.get(2..) != end.get(2..) {
        return Err(format!("bad NLH range span: {start}-{end}"));
    }
    if start_a.abs_diff(end_a) != start_b.abs_diff(end_b) {
        return Err(format!("bad NLH range span: {start}-{end}"));
    }
    let step_down = start_a > end_a;
    let count = start_a.abs_diff(end_a);
    let suffix = start.get(2..).unwrap_or("");
    let labels = (0..=count)
        .map(|offset| {
            let a = if step_down {
                start_a - offset
            } else {
                start_a + offset
            };
            let b = if start_b > end_b {
                start_b - offset
            } else {
                start_b + offset
            };
            format!("{}{}{}", nlh_rank_char(a), nlh_rank_char(b), suffix)
        })
        .collect();
    Ok(labels)
}

fn validate_nlh_label(label: &str) -> Result<(), String> {
    let chars = label.as_bytes();
    if !(chars.len() == 2 || chars.len() == 3) {
        return Err(format!("bad NLH range label: {label}"));
    }
    let r0 = nlh_rank_index(chars[0])?;
    let r1 = nlh_rank_index(chars[1])?;
    if r0 == r1 && chars.len() != 2 {
        return Err(format!("bad NLH range label: {label}"));
    }
    if r0 != r1 {
        match chars.get(2).map(|c| c.to_ascii_lowercase()) {
            None | Some(b's') | Some(b'o') => {}
            _ => return Err(format!("bad NLH range label: {label}")),
        }
    }
    Ok(())
}

fn nlh_rank_index(rank: u8) -> Result<usize, String> {
    "23456789TJQKA"
        .find(rank.to_ascii_uppercase() as char)
        .ok_or_else(|| format!("bad NLH rank: {}", rank as char))
}

fn nlh_rank_char(rank: usize) -> char {
    "23456789TJQKA".as_bytes()[rank] as char
}

fn nlh_pair_label(rank: usize) -> String {
    format!("{}{}", nlh_rank_char(rank), nlh_rank_char(rank))
}

fn expand_nlh_combo(label: &str, blocked: &[eval::Card]) -> Vec<[eval::Card; 2]> {
    let chars = label.as_bytes();
    let ranks = "23456789TJQKA";
    let Some(r0) = chars
        .first()
        .and_then(|c| ranks.find(c.to_ascii_uppercase() as char))
        .map(|r| r as u8)
    else {
        return Vec::new();
    };
    let Some(r1) = chars
        .get(1)
        .and_then(|c| ranks.find(c.to_ascii_uppercase() as char))
        .map(|r| r as u8)
    else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if r0 == r1 {
        for a in 0..3 {
            for b in a + 1..4 {
                let holes = [eval::card(r0, a), eval::card(r1, b)];
                if !blocked.contains(&holes[0]) && !blocked.contains(&holes[1]) {
                    out.push(holes);
                }
            }
        }
        return out;
    }
    let suited = label.ends_with('s');
    let offsuit = label.ends_with('o');
    for a in 0..4 {
        for b in 0..4 {
            if suited && a != b {
                continue;
            }
            if offsuit && a == b {
                continue;
            }
            let holes = [eval::card(r0, a), eval::card(r1, b)];
            if !blocked.contains(&holes[0]) && !blocked.contains(&holes[1]) {
                out.push(holes);
            }
        }
    }
    out
}

fn format_card(card: eval::Card) -> String {
    let rank = "23456789TJQKA".as_bytes()[eval::rank(card) as usize] as char;
    let suit = "cdhs".as_bytes()[eval::suit(card) as usize] as char;
    format!("{rank}{suit}")
}

fn combo_equity(hero: [eval::Card; 2], fallback: f64, board: &[eval::Card]) -> f64 {
    let entries = default_river_entries(board);
    combo_equity_cached(hero, fallback, board, &entries, &mut HashMap::new())
}

fn combo_equity_cached(
    hero: [eval::Card; 2],
    fallback: f64,
    board: &[eval::Card],
    entries: &[RiverEntry],
    cache: &mut HashMap<String, f64>,
) -> f64 {
    if board.is_empty() {
        return fallback;
    }
    let villains = entries
        .iter()
        .filter(|entry| {
            !hero.contains(&entry.holes[0])
                && !hero.contains(&entry.holes[1])
                && !board.contains(&entry.holes[0])
                && !board.contains(&entry.holes[1])
        })
        .collect::<Vec<_>>();
    if villains.is_empty() {
        return fallback;
    }
    let hero_key = combo_key(hero);
    let (equity_sum, weight_sum) =
        villains
            .iter()
            .fold((0.0, 0.0), |(equity_sum, weight_sum), villain| {
                let villain_key = combo_key(villain.holes);
                let key = if hero_key < villain_key {
                    format!("{hero_key}|{villain_key}")
                } else {
                    format!("{villain_key}|{hero_key}")
                };
                if let Some(value) = cache.get(&key) {
                    let equity = if hero_key < villain_key {
                        *value
                    } else {
                        1.0 - *value
                    };
                    return (
                        equity_sum + villain.weight * equity,
                        weight_sum + villain.weight,
                    );
                }
                let value = equity::heads_up_nlh_equity_exact(hero, villain.holes, board);
                cache.insert(
                    key,
                    if hero_key < villain_key {
                        value
                    } else {
                        1.0 - value
                    },
                );
                (
                    equity_sum + villain.weight * value,
                    weight_sum + villain.weight,
                )
            });
    equity_sum / weight_sum
}

fn blocker_metrics(
    hero: [eval::Card; 2],
    board: &[eval::Card],
    entries: &[RiverEntry],
) -> [f64; 2] {
    let total: f64 = entries.iter().map(|entry| entry.weight).sum();
    let available: f64 = entries
        .iter()
        .filter(|entry| {
            !hero.contains(&entry.holes[0])
                && !hero.contains(&entry.holes[1])
                && !board.contains(&entry.holes[0])
                && !board.contains(&entry.holes[1])
        })
        .map(|entry| entry.weight)
        .sum();
    let blocked = total - available;
    [blocked, if total > 0.0 { blocked / total } else { 0.0 }]
}

fn nlh_hand_class(holes: [eval::Card; 2], board: &[eval::Card]) -> String {
    if board.len() < 3 {
        return "preflop".to_string();
    }
    let mut cards = vec![holes[0], holes[1]];
    cards.extend_from_slice(board);
    let category = best_five_category(&cards);
    match category {
        8 => "straight flush",
        7 => "quads",
        6 => "full house",
        5 => "flush",
        4 => "straight",
        3 => {
            if eval::rank(holes[0]) == eval::rank(holes[1]) {
                "set"
            } else {
                "trips"
            }
        }
        2 => "two pair",
        1 => {
            let top = board
                .iter()
                .map(|card| eval::rank(*card))
                .max()
                .unwrap_or(0);
            if holes.iter().any(|card| eval::rank(*card) == top) {
                "top pair"
            } else {
                "pair"
            }
        }
        _ if board.len() < 5 && has_flush_draw(&cards) => "flush draw",
        _ if board.len() < 5 && has_straight_draw(&cards) => "straight draw",
        _ => "air",
    }
    .to_string()
}

fn best_five_category(cards: &[eval::Card]) -> u64 {
    let mut best = 0;
    for a in 0..cards.len() - 4 {
        for b in a + 1..cards.len() - 3 {
            for c in b + 1..cards.len() - 2 {
                for d in c + 1..cards.len() - 1 {
                    for e in d + 1..cards.len() {
                        best = best.max(eval::evaluate5(&[
                            cards[a], cards[b], cards[c], cards[d], cards[e],
                        ]));
                    }
                }
            }
        }
    }
    best / 1_000_000 / 15_u64.pow(5)
}

fn has_flush_draw(cards: &[eval::Card]) -> bool {
    (0..4).any(|suit| {
        cards
            .iter()
            .filter(|card| eval::suit(**card) == suit)
            .count()
            >= 4
    })
}

fn has_straight_draw(cards: &[eval::Card]) -> bool {
    let mut ranks = cards
        .iter()
        .flat_map(|card| {
            let rank = i16::from(eval::rank(*card));
            if rank == 12 {
                vec![12, -1]
            } else {
                vec![rank]
            }
        })
        .collect::<Vec<_>>();
    ranks.sort_unstable();
    ranks.dedup();
    (0..=9).any(|start| {
        [-1, 0, 1, 2, 3]
            .iter()
            .filter(|offset| ranks.contains(&(start + *offset)))
            .count()
            >= 4
    })
}

fn combo_key(cards: [eval::Card; 2]) -> String {
    format!("{}{}", format_card(cards[0]), format_card(cards[1]))
}

#[wasm_bindgen]
pub fn poll_progress(handle: u32) -> Result<String, JsValue> {
    with_solve(handle, |solve| {
        serde_json::to_string(solve.progress.last().expect("progress exists"))
            .map_err(|err| JsValue::from_str(&err.to_string()))
    })
}

#[wasm_bindgen]
pub fn get_strategy(handle: u32, node_id: &str) -> Result<Vec<f64>, JsValue> {
    with_solve(handle, |solve| {
        let node = node_for_id(solve, node_id)?;
        if node.actions.is_empty() {
            return Ok(Vec::new());
        }
        if let Some(amount) = node.amount {
            let (fold, call) = bet_response_strategy(node.pot.unwrap_or(solve.spot.pot), amount);
            return Ok(std::iter::repeat_n([fold, call], solve.combos.len())
                .flatten()
                .collect());
        }
        if node.id == "root/raise-sizes" {
            return Ok(raise_size_strategy(solve, node));
        }
        if is_chance_node(node) {
            return Ok(chance_node_rows(solve, node)
                .into_iter()
                .flat_map(|row| [row.fold, row.call, row.raise])
                .collect());
        }
        Ok(solve.strategy.clone())
    })
}

fn raise_size_strategy(solve: &NativeSolve, node: &NativeNode) -> Vec<f64> {
    let stack = solve.spot.stack.unwrap_or(solve.spot.pot * 4.2);
    let rake_pct = solve.spot.rake_pct.unwrap_or(0.0);
    let rake_cap = solve.spot.rake_cap.unwrap_or(0.0);
    solve
        .metrics
        .chunks_exact(3)
        .zip(solve.strategy.chunks_exact(3))
        .flat_map(|(metric, strategy)| {
            let conditional = raise_size_mix(
                metric[1],
                solve.spot.pot,
                stack,
                rake_pct,
                rake_cap,
                &node.actions,
            );
            conditional
                .into_iter()
                .map(move |frequency| frequency * strategy[2])
        })
        .collect()
}

fn raise_size_mix(
    equity: f64,
    pot: f64,
    stack: f64,
    rake_pct: f64,
    rake_cap: f64,
    actions: &[String],
) -> Vec<f64> {
    let evs = actions
        .iter()
        .map(|action| raise_action_amount(action, stack))
        .map(|amount| br::action_evs(equity, pot, amount, rake_pct, rake_cap).2)
        .collect::<Vec<_>>();
    let mut regrets = vec![0.0; evs.len()];
    let mut strategy_sum = vec![0.0; evs.len()];
    for _ in 0..256 {
        let strategy = regret_matching_vec(&regrets);
        let node_ev = strategy.iter().zip(&evs).map(|(s, ev)| s * ev).sum::<f64>();
        for i in 0..evs.len() {
            regrets[i] += evs[i] - node_ev;
            strategy_sum[i] += strategy[i];
        }
    }
    let total: f64 = strategy_sum.iter().sum();
    if total > 0.0 {
        strategy_sum
            .into_iter()
            .map(|value| value / total)
            .collect()
    } else {
        vec![1.0 / actions.len().max(1) as f64; actions.len()]
    }
}

fn raise_size_metrics(solve: &NativeSolve, node: &NativeNode) -> Vec<f64> {
    let stack = solve.spot.stack.unwrap_or(solve.spot.pot * 4.2);
    let rake_pct = solve.spot.rake_pct.unwrap_or(0.0);
    let rake_cap = solve.spot.rake_cap.unwrap_or(0.0);
    solve
        .metrics
        .chunks_exact(3)
        .zip(solve.strategy.chunks_exact(3))
        .take(solve.combos.len())
        .flat_map(|(metric, strategy)| {
            let equity = metric[1];
            let evs = node
                .actions
                .iter()
                .map(|action| raise_action_amount(action, stack))
                .map(|amount| br::action_evs(equity, solve.spot.pot, amount, rake_pct, rake_cap).2)
                .collect::<Vec<_>>();
            let mix = raise_size_mix(
                equity,
                solve.spot.pot,
                stack,
                rake_pct,
                rake_cap,
                &node.actions,
            );
            let ev = mix
                .iter()
                .zip(evs)
                .map(|(frequency, action_ev)| frequency * strategy[2] * action_ev)
                .sum::<f64>()
                / 100.0;
            let eqr = ev / (equity * solve.spot.pot / 100.0).max(0.0001);
            [ev, equity, eqr]
        })
        .collect()
}

fn regret_matching_vec(regrets: &[f64]) -> Vec<f64> {
    let positives = regrets
        .iter()
        .map(|value| value.max(0.0))
        .collect::<Vec<_>>();
    let total: f64 = positives.iter().sum();
    if total > 0.0 {
        positives.into_iter().map(|value| value / total).collect()
    } else {
        vec![1.0 / regrets.len().max(1) as f64; regrets.len()]
    }
}

fn raise_action_amount(action: &str, stack: f64) -> f64 {
    if action == "all-in" {
        stack
    } else {
        action.parse::<f64>().unwrap_or(0.0)
    }
}

#[wasm_bindgen]
pub fn get_hand_metrics(handle: u32, node_id: &str) -> Result<Vec<f64>, JsValue> {
    with_solve(handle, |solve| {
        let node = node_for_id(solve, node_id)?;
        if let Some(amount) = node.amount {
            if let Some(parent_id) = chance_parent_id(&node.id) {
                return if node.actions.is_empty() {
                    Ok(chance_bet_response_action_metrics(
                        solve,
                        parent_id,
                        node.pot.unwrap_or(solve.spot.pot),
                        amount,
                        node.id.ends_with("/call"),
                    ))
                } else {
                    Ok(chance_bet_response_metrics(
                        solve,
                        parent_id,
                        node.pot.unwrap_or(solve.spot.pot),
                        amount,
                    ))
                };
            }
            if node.actions.is_empty() {
                return Ok(bet_response_action_metrics(
                    solve,
                    node.pot.unwrap_or(solve.spot.pot),
                    amount,
                    node.id.ends_with("/call"),
                ));
            }
            return Ok(bet_response_metrics(
                solve,
                node.pot.unwrap_or(solve.spot.pot),
                amount,
            ));
        }
        if let Some(action_idx) = node_action_index(&node.id) {
            return Ok(action_node_metrics(solve, action_idx));
        }
        if node.id == "root/raise-sizes" {
            return Ok(raise_size_metrics(solve, node));
        }
        if is_chance_node(node) {
            return Ok(chance_node_metrics(solve, node));
        }
        if node.actions.is_empty() {
            return Ok(Vec::new());
        }
        Ok(solve.metrics.clone())
    })
}

fn node_action_index(node_id: &str) -> Option<usize> {
    match node_id {
        "root/fold" => Some(0),
        "root/call" => Some(1),
        "root/raise" => Some(2),
        _ => None,
    }
}

fn action_node_metrics(solve: &NativeSolve, action_idx: usize) -> Vec<f64> {
    solve
        .metrics
        .chunks_exact(3)
        .zip(solve.action_evs.chunks_exact(3))
        .take(solve.combos.len())
        .flat_map(|(metric, action_evs)| {
            let ev = action_evs[action_idx];
            let equity = metric[1];
            let eqr = ev / (equity * solve.spot.pot / 100.0).max(0.0001);
            [ev, equity, eqr]
        })
        .collect()
}

fn is_chance_node(node: &NativeNode) -> bool {
    matches!(
        node.id.as_str(),
        "root/turn-low"
            | "root/turn-mid"
            | "root/turn-high"
            | "root/river-low"
            | "root/river-mid"
            | "root/river-high"
    )
}

fn chance_parent_id(node_id: &str) -> Option<&str> {
    let (parent, _) = node_id.split_once("/bet-")?;
    if matches!(
        parent,
        "root/turn-low"
            | "root/turn-mid"
            | "root/turn-high"
            | "root/river-low"
            | "root/river-mid"
            | "root/river-high"
    ) {
        Some(parent)
    } else {
        None
    }
}

fn chance_node_rows(solve: &NativeSolve, node: &NativeNode) -> Vec<br::RiverCombo> {
    let pot = chance_node_pot(solve);
    let (rake_pct, rake_cap) = spot_rake(&solve.spot);
    let bet_amounts = chance_node_bet_amounts(solve, node, pot);
    let call_bet = bet_amounts.first().copied().unwrap_or(solve.spot.bet);
    solve
        .metrics
        .chunks_exact(3)
        .zip(&solve.combos)
        .take(solve.combos.len())
        .map(|(metric, combo)| {
            let equity = if solve.spot.game.as_deref().unwrap_or("NLH") == "NLH" {
                nlh_chance_node_equity(solve, combo, metric[1], &node.id)
            } else {
                shifted_chance_node_equity(metric[1], &node.id)
            };
            let (fold_ev, call_ev, raise_ev) =
                row_action_evs(equity, pot, call_bet, &bet_amounts, rake_pct, rake_cap);
            br::cfr_combo_from_action_evs(equity, fold_ev, call_ev, raise_ev, 256)
        })
        .collect()
}

fn chance_node_metrics(solve: &NativeSolve, node: &NativeNode) -> Vec<f64> {
    let pot = chance_node_pot(solve);
    let (rake_pct, rake_cap) = spot_rake(&solve.spot);
    let bet_amounts = chance_node_bet_amounts(solve, node, pot);
    let call_bet = bet_amounts.first().copied().unwrap_or(solve.spot.bet);
    chance_node_rows(solve, node)
        .into_iter()
        .flat_map(|row| {
            let (fold_ev, call_ev, raise_ev) =
                row_action_evs(row.equity, pot, call_bet, &bet_amounts, rake_pct, rake_cap);
            let ev = (row.fold * fold_ev + row.call * call_ev + row.raise * raise_ev) / 100.0;
            let eqr = ev / (row.equity * pot / 100.0).max(0.0001);
            [ev, row.equity, eqr]
        })
        .collect()
}

fn chance_node_bet_amounts(solve: &NativeSolve, node: &NativeNode, pot: f64) -> Vec<f64> {
    let board_len = match node.street.as_str() {
        "turn" => 4,
        "river" => 5,
        _ => return vec![solve.spot.bet],
    };
    bet_amounts_for_context(&solve.spot, board_len, pot, solve.spot.bet)
}

fn chance_node_pot(solve: &NativeSolve) -> f64 {
    chance_node_pot_for_spot(&solve.spot)
}

fn chance_node_pot_for_spot(spot: &NativeSpot) -> f64 {
    spot.pot + spot.bet * 2.0
}

fn nlh_chance_node_equity(solve: &NativeSolve, combo: &str, fallback: f64, node_id: &str) -> f64 {
    let target = if node_id.starts_with("root/turn-") {
        4
    } else if node_id.starts_with("root/river-") {
        5
    } else {
        return fallback;
    };
    let Ok(board) = parse_board(solve.spot.board.as_deref().unwrap_or("")) else {
        return fallback;
    };
    if board.len() != target - 1 {
        return shifted_chance_node_equity(fallback, node_id);
    }
    let Some(hero) = parse_combo_label(combo) else {
        return shifted_chance_node_equity(fallback, node_id);
    };
    let dead = hero
        .into_iter()
        .chain(board.iter().copied())
        .collect::<Vec<_>>();
    let mut equities = (0..52)
        .filter(|card| !dead.contains(card))
        .map(|card| {
            let mut next_board = board.clone();
            next_board.push(card);
            let villains =
                nlh_river_entries_from_range(solve.spot.villain_range.as_deref(), &next_board)
                    .unwrap_or_else(|_| default_river_entries(&next_board));
            combo_equity_cached(hero, fallback, &next_board, &villains, &mut HashMap::new())
        })
        .collect::<Vec<_>>();
    if equities.is_empty() {
        return shifted_chance_node_equity(fallback, node_id);
    }
    equities.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let bucket = if node_id.contains("-low") {
        0
    } else if node_id.contains("-high") {
        2
    } else {
        1
    };
    let (start, end) = chance_partition(equities.len(), bucket);
    let slice = &equities[start..end];
    slice.iter().sum::<f64>() / slice.len().max(1) as f64
}

fn parse_combo_label(combo: &str) -> Option<[eval::Card; 2]> {
    let cards = combo
        .as_bytes()
        .chunks_exact(2)
        .map(|chunk| {
            let rank = "23456789TJQKA".find(chunk[0] as char)? as u8;
            let suit = "cdhs".find(chunk[1] as char)? as u8;
            Some(eval::card(rank, suit))
        })
        .collect::<Option<Vec<_>>>()?;
    (cards.len() == 2).then_some([cards[0], cards[1]])
}

fn chance_partition(total: usize, bucket: usize) -> (usize, usize) {
    let low = total / 3;
    let middle = (total - low) / 2;
    [(0, low), (low, low + middle), (low + middle, total)][bucket]
}

fn shifted_chance_node_equity(equity: f64, node_id: &str) -> f64 {
    let delta = if node_id.contains("-low") {
        -0.12
    } else if node_id.contains("-high") {
        0.12
    } else {
        0.0
    };
    (equity + delta).clamp(0.02, 0.98)
}

fn bet_response_strategy(pot: f64, amount: f64) -> (f64, f64) {
    (amount / (pot + amount), pot / (pot + amount))
}

fn bet_response_metrics(solve: &NativeSolve, pot: f64, amount: f64) -> Vec<f64> {
    let (fold_freq, call_freq) = bet_response_strategy(pot, amount);
    let (rake_pct, rake_cap) = spot_rake(&solve.spot);
    solve
        .metrics
        .chunks_exact(3)
        .take(solve.combos.len())
        .flat_map(|metric| {
            let equity = metric[1];
            let call_ev = br::action_evs(equity, pot, amount, rake_pct, rake_cap).1;
            let ev = (fold_freq * pot + call_freq * call_ev) / 100.0;
            let eqr = ev / (equity * pot / 100.0).max(0.0001);
            [ev, equity, eqr]
        })
        .collect()
}

fn chance_bet_response_metrics(
    solve: &NativeSolve,
    parent_id: &str,
    pot: f64,
    amount: f64,
) -> Vec<f64> {
    let (fold_freq, call_freq) = bet_response_strategy(pot, amount);
    let (rake_pct, rake_cap) = spot_rake(&solve.spot);
    chance_parent_rows(solve, parent_id)
        .into_iter()
        .flat_map(|row| {
            let call_ev = br::action_evs(row.equity, pot, amount, rake_pct, rake_cap).1;
            let ev = (fold_freq * pot + call_freq * call_ev) / 100.0;
            let eqr = ev / (row.equity * pot / 100.0).max(0.0001);
            [ev, row.equity, eqr]
        })
        .collect()
}

fn bet_response_action_metrics(
    solve: &NativeSolve,
    pot: f64,
    amount: f64,
    call_branch: bool,
) -> Vec<f64> {
    let (rake_pct, rake_cap) = spot_rake(&solve.spot);
    solve
        .metrics
        .chunks_exact(3)
        .take(solve.combos.len())
        .flat_map(|metric| {
            let equity = metric[1];
            let ev = if call_branch {
                br::action_evs(equity, pot, amount, rake_pct, rake_cap).1 / 100.0
            } else {
                pot / 100.0
            };
            let eqr = ev / (equity * pot / 100.0).max(0.0001);
            [ev, equity, eqr]
        })
        .collect()
}

fn chance_bet_response_action_metrics(
    solve: &NativeSolve,
    parent_id: &str,
    pot: f64,
    amount: f64,
    call_branch: bool,
) -> Vec<f64> {
    let (rake_pct, rake_cap) = spot_rake(&solve.spot);
    chance_parent_rows(solve, parent_id)
        .into_iter()
        .flat_map(|row| {
            let ev = if call_branch {
                br::action_evs(row.equity, pot, amount, rake_pct, rake_cap).1 / 100.0
            } else {
                pot / 100.0
            };
            let eqr = ev / (row.equity * pot / 100.0).max(0.0001);
            [ev, row.equity, eqr]
        })
        .collect()
}

fn chance_parent_rows(solve: &NativeSolve, parent_id: &str) -> Vec<br::RiverCombo> {
    let street = if parent_id.starts_with("root/turn-") {
        "turn"
    } else {
        "river"
    };
    let node = native_node(
        parent_id.to_string(),
        parent_id.to_string(),
        street,
        vec!["fold".to_string(), "call".to_string(), "raise".to_string()],
        None,
        None,
    );
    chance_node_rows(solve, &node)
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

fn bet_amounts_for_spot(spot: &NativeSpot, board_len: usize) -> Vec<f64> {
    bet_amounts_for_context(spot, board_len, spot.pot, spot.bet)
}

fn bet_amounts_for_context(spot: &NativeSpot, board_len: usize, pot: f64, call: f64) -> Vec<f64> {
    let stack = spot.stack.unwrap_or(spot.pot * 4.2);
    let Some(tree) = spot
        .bet_tree
        .as_deref()
        .and_then(|text| tree::parse_bet_tree(text).ok())
    else {
        return vec![call];
    };
    let sizes = bet_sizes_for_board(&tree, board_len);
    let amounts = if matches!(spot.game.as_deref().unwrap_or("NLH"), "PLO4" | "PLO5") {
        tree::concrete_pot_limit_bets(sizes, pot, call, stack)
    } else {
        tree::concrete_bets(sizes, pot, stack)
    };
    if amounts.is_empty() {
        vec![call]
    } else {
        amounts
    }
}

fn best_raise_ev(equity: f64, pot: f64, bets: &[f64], rake_pct: f64, rake_cap: f64) -> f64 {
    best_raise(equity, pot, bets, rake_pct, rake_cap).1
}

fn best_raise(equity: f64, pot: f64, bets: &[f64], rake_pct: f64, rake_cap: f64) -> (f64, f64) {
    bets.iter()
        .map(|amount| {
            (
                *amount,
                br::action_evs(equity, pot, *amount, rake_pct, rake_cap).2,
            )
        })
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap_or((0.0, f64::NEG_INFINITY))
}

fn row_action_evs(
    equity: f64,
    pot: f64,
    call_bet: f64,
    raise_bets: &[f64],
    rake_pct: f64,
    rake_cap: f64,
) -> (f64, f64, f64) {
    let (fold_ev, call_ev, _) = br::action_evs(equity, pot, call_bet, rake_pct, rake_cap);
    (
        fold_ev,
        call_ev,
        best_raise_ev(equity, pot, raise_bets, rake_pct, rake_cap),
    )
}

fn river_exploitability_from_action_evs(
    rows: &[br::RiverCombo],
    action_evs: &[f64],
    weights: &[f64],
    pot: f64,
) -> f64 {
    let mut strategy_ev = 0.0;
    let mut best_ev = 0.0;
    let mut total_weight = 0.0;
    for ((row, evs), weight) in rows.iter().zip(action_evs.chunks_exact(3)).zip(weights) {
        let fold_ev = evs[0] * 100.0;
        let call_ev = evs[1] * 100.0;
        let raise_ev = evs[2] * 100.0;
        strategy_ev += weight * (row.fold * fold_ev + row.call * call_ev + row.raise * raise_ev);
        best_ev += weight * fold_ev.max(call_ev).max(raise_ev);
        total_weight += weight;
    }
    ((best_ev - strategy_ev) / total_weight / pot * 100.0).max(0.0)
}

fn river_progress_from_action_evs(
    rows: &[br::RiverCombo],
    action_evs: &[f64],
    weights: &[f64],
    pot: f64,
    points: usize,
) -> Vec<f64> {
    (1..=points)
        .map(|i| {
            let t = i as f64 / points as f64;
            let mixed = rows
                .iter()
                .map(|row| br::RiverCombo {
                    equity: row.equity,
                    fold: (1.0 - t) / 3.0 + t * row.fold,
                    call: (1.0 - t) / 3.0 + t * row.call,
                    raise: (1.0 - t) / 3.0 + t * row.raise,
                })
                .collect::<Vec<_>>();
            river_exploitability_from_action_evs(&mixed, action_evs, weights, pot)
        })
        .collect()
}

fn root_nodes_for_spot(spot: &NativeSpot, board_len: usize) -> Vec<NativeNode> {
    let bet_nodes = bet_nodes_for_context(spot, board_len, spot.pot, spot.bet);
    let chance_bet_nodes = match board_len {
        3 | 4 => bet_nodes_for_context(
            spot,
            board_len + 1,
            chance_node_pot_for_spot(spot),
            spot.bet,
        ),
        _ => Vec::new(),
    };
    root_nodes(board_len, &bet_nodes, &chance_bet_nodes)
}

struct BetNode {
    label: String,
    amount: f64,
    pot: f64,
}

fn bet_nodes_for_context(spot: &NativeSpot, board_len: usize, pot: f64, call: f64) -> Vec<BetNode> {
    let stack = spot.stack.unwrap_or(spot.pot * 4.2);
    spot.bet_tree
        .as_deref()
        .and_then(|text| tree::parse_bet_tree(text).ok())
        .map(|_| bet_amounts_for_context(spot, board_len, pot, call))
        .unwrap_or_default()
        .into_iter()
        .map(|amount| BetNode {
            label: format_bet_node(amount, stack),
            amount,
            pot,
        })
        .collect()
}

fn bet_sizes_for_board(tree: &tree::BetTree, board_len: usize) -> &[tree::BetSize] {
    match board_len {
        4 => &tree.turn,
        5 => &tree.river,
        _ => &tree.flop,
    }
}

fn root_nodes(
    board_len: usize,
    bet_nodes: &[BetNode],
    chance_bet_nodes: &[BetNode],
) -> Vec<NativeNode> {
    let street = street_for_board(board_len);
    let actions = ["fold", "call", "raise"];
    let mut nodes = vec![native_node(
        "root".to_string(),
        "Root".to_string(),
        street,
        actions.iter().map(|action| action.to_string()).collect(),
        None,
        None,
    )];
    nodes.extend(actions.iter().map(|action| {
        native_node(
            format!("root/{action}"),
            action.to_ascii_uppercase(),
            street,
            Vec::new(),
            None,
            None,
        )
    }));
    if !bet_nodes.is_empty() {
        nodes.push(native_node(
            "root/raise-sizes".to_string(),
            "RAISE SIZES".to_string(),
            street,
            bet_nodes.iter().map(|bet| bet.label.clone()).collect(),
            None,
            None,
        ));
    }
    for bet in bet_nodes {
        let id = format!("root/bet-{}", bet.label);
        nodes.push(native_node(
            id.clone(),
            format!("BET {}", bet.label),
            street,
            vec!["fold".to_string(), "call".to_string()],
            Some(bet.amount),
            Some(bet.pot),
        ));
        for action in ["fold", "call"] {
            nodes.push(native_node(
                format!("{id}/{action}"),
                action.to_ascii_uppercase(),
                street,
                Vec::new(),
                Some(bet.amount),
                Some(bet.pot),
            ));
        }
    }
    nodes.extend(chance_nodes(board_len, &actions, chance_bet_nodes));
    nodes
}

fn chance_nodes(board_len: usize, actions: &[&str; 3], bet_nodes: &[BetNode]) -> Vec<NativeNode> {
    let Some(next_street) = (match board_len {
        3 => Some("turn"),
        4 => Some("river"),
        _ => None,
    }) else {
        return Vec::new();
    };
    ["low", "mid", "high"]
        .iter()
        .flat_map(|bucket| {
            let id = format!("root/{next_street}-{bucket}");
            let mut nodes = vec![native_node(
                id.clone(),
                format!(
                    "{} {}",
                    next_street.to_ascii_uppercase(),
                    bucket.to_ascii_uppercase()
                ),
                next_street,
                actions.iter().map(|action| action.to_string()).collect(),
                None,
                None,
            )];
            for bet in bet_nodes {
                let bet_id = format!("{id}/bet-{}", bet.label);
                nodes.push(native_node(
                    bet_id.clone(),
                    format!("BET {}", bet.label),
                    next_street,
                    vec!["fold".to_string(), "call".to_string()],
                    Some(bet.amount),
                    Some(bet.pot),
                ));
                for action in ["fold", "call"] {
                    nodes.push(native_node(
                        format!("{bet_id}/{action}"),
                        action.to_ascii_uppercase(),
                        next_street,
                        Vec::new(),
                        Some(bet.amount),
                        Some(bet.pot),
                    ));
                }
            }
            nodes
        })
        .collect()
}

fn native_node(
    id: String,
    label: String,
    street: &str,
    actions: Vec<String>,
    amount: Option<f64>,
    pot: Option<f64>,
) -> NativeNode {
    NativeNode {
        info_set: format!("{street}:{id}"),
        id,
        label,
        street: street.to_string(),
        actions,
        amount,
        pot,
    }
}

fn information_sets_from_nodes(nodes: &[NativeNode]) -> Vec<NativeInfoSet> {
    nodes
        .iter()
        .map(|node| {
            let (strategy_ref, metric_ref) = info_set_refs(node);
            NativeInfoSet {
                key: node.info_set.clone(),
                node_id: node.id.clone(),
                street: node.street.clone(),
                actions: node.actions.clone(),
                strategy_ref,
                metric_ref,
            }
        })
        .collect()
}

fn info_set_refs(node: &NativeNode) -> (String, String) {
    if node.amount.is_some() && !node.actions.is_empty() {
        return ("bet-response".to_string(), "bet-response".to_string());
    }
    if node.amount.is_some() {
        return ("terminal".to_string(), format!("response:{}", node.id));
    }
    if node.id == "root" {
        return ("root".to_string(), "root".to_string());
    }
    if node.id == "root/raise-sizes" {
        return ("raise-sizes".to_string(), "raise-sizes".to_string());
    }
    if node.id.starts_with("root/turn-") || node.id.starts_with("root/river-") {
        return (node.id.clone(), node.id.clone());
    }
    if let Some(action) = node.id.strip_prefix("root/") {
        return ("terminal".to_string(), format!("action:{action}"));
    }
    (node.id.clone(), node.id.clone())
}

fn format_bet_node(amount: f64, stack: f64) -> String {
    if (amount - stack).abs() <= 1e-9 {
        "all-in".to_string()
    } else if amount.fract().abs() <= 1e-9 {
        format!("{}", amount as u64)
    } else {
        format!("{amount:.2}")
    }
}

fn street_for_board(board_len: usize) -> &'static str {
    match board_len {
        0 => "preflop",
        3 => "flop",
        4 => "turn",
        _ => "river",
    }
}

fn node_for_id<'a>(solve: &'a NativeSolve, node_id: &str) -> Result<&'a NativeNode, JsValue> {
    solve
        .nodes
        .iter()
        .find(|node| node.id == node_id || node.info_set == node_id)
        .ok_or_else(|| JsValue::from_str("unknown node id"))
}

#[cfg(test)]
fn has_node_id(solve: &NativeSolve, node_id: &str) -> bool {
    solve.nodes.iter().any(|node| node.id == node_id)
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
    fn nlh7_direct_evaluator_matches_best_five_examples() {
        let examples = [
            [
                c(12, 0),
                c(12, 1),
                c(12, 2),
                c(12, 3),
                c(8, 0),
                c(7, 1),
                c(6, 2),
            ],
            [
                c(12, 0),
                c(11, 0),
                c(10, 0),
                c(9, 0),
                c(8, 0),
                c(2, 1),
                c(1, 2),
            ],
            [
                c(12, 0),
                c(3, 1),
                c(2, 2),
                c(1, 3),
                c(0, 0),
                c(9, 1),
                c(7, 2),
            ],
            [
                c(11, 0),
                c(11, 1),
                c(11, 2),
                c(8, 0),
                c(8, 1),
                c(4, 2),
                c(3, 3),
            ],
            [
                c(10, 0),
                c(10, 1),
                c(8, 2),
                c(8, 3),
                c(12, 0),
                c(5, 1),
                c(2, 2),
            ],
            [
                c(12, 0),
                c(11, 1),
                c(9, 2),
                c(7, 3),
                c(5, 0),
                c(3, 1),
                c(1, 2),
            ],
        ];
        for cards in examples {
            assert_eq!(eval::evaluate_nlh7(&cards), brute_force_nlh7(&cards));
        }
    }

    fn brute_force_nlh7(cards: &[eval::Card; 7]) -> u64 {
        let mut best = 0;
        for a in 0..3 {
            for b in a + 1..4 {
                for c in b + 1..5 {
                    for d in c + 1..6 {
                        for e in d + 1..7 {
                            best = best.max(eval::evaluate5(&[
                                cards[a], cards[b], cards[c], cards[d], cards[e],
                            ]));
                        }
                    }
                }
            }
        }
        best
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
    fn equity_auto_switches_by_evaluation_estimate() {
        let aa = [c(12, 0), c(12, 2)];
        let kk = [c(11, 1), c(11, 3)];
        let board = [c(0, 0), c(1, 1), c(2, 2), c(3, 3)];
        assert_eq!(equity::heads_up_nlh_evaluation_estimate(aa, kk, &board), 88);
        let exact = equity::heads_up_nlh_equity_auto(
            aa,
            kk,
            &board,
            1_000,
            7,
            equity::EXACT_EQUITY_EVAL_THRESHOLD,
        );
        assert_eq!(exact.samples, 44);
        assert_eq!(exact.ci95, 0.0);
        let mc = equity::heads_up_nlh_equity_auto(aa, kk, &[], 123, 7, 1);
        assert_eq!(mc.samples, 123);
        assert!(mc.ci95 > 0.0);
    }

    #[test]
    fn solver_gates_report_values_under_thresholds() {
        assert!((cfr::kuhn_value(100_000) + 1.0 / 18.0).abs() <= 1e-3);
        assert_eq!(cfr::leduc_fold_payoff_examples(), (1.0, -1.0));
        let leduc = cfr::leduc_exploitability(1_000_000);
        assert!(leduc <= 0.01, "{leduc}");
        assert!(cfr::leduc_cfr_probe_exploitability(5_000).is_finite());
        assert!(br::nlh_river_exploitability_pct_pot() <= 0.3);
        let flop_tree = br::nlh_flop_balanced_exploitability_pct_pot();
        assert!(flop_tree <= 3.0, "{flop_tree}");
        let action_probe = br::StreetAbstractionState {
            equity: 0.55,
            chance_equities: None,
            chance_weights: None,
            next_chance_equities: None,
            next_chance_weights: None,
            pot: 100.0,
            bet: 66.0,
            street: 0,
        };
        let action_utilities = action_probe.action_utilities();
        let single_raise = br::action_evs(0.55, 100.0, 66.0, 0.0, 0.0).2;
        assert!(action_utilities[2] > single_raise);
        let branch_probe = action_probe.next_chance_branches();
        assert!(branch_probe.is_empty());
        let card_derived_probe = br::StreetAbstractionState {
            equity: 0.55,
            chance_equities: Some([0.21, 0.43, 0.65]),
            chance_weights: Some([0.20, 0.30, 0.50]),
            next_chance_equities: Some([
                [0.11, 0.12, 0.13],
                [0.31, 0.32, 0.33],
                [0.51, 0.52, 0.53],
            ]),
            next_chance_weights: Some([[0.10, 0.20, 0.70], [0.20, 0.30, 0.50], [0.25, 0.25, 0.50]]),
            pot: 100.0,
            bet: 66.0,
            street: 0,
        }
        .next_chance_branches();
        assert_eq!(card_derived_probe[0].0, 0.20);
        assert_eq!(card_derived_probe[1].0, 0.30);
        assert_eq!(card_derived_probe[2].0, 0.50);
        assert_eq!(card_derived_probe[0].1.equity, 0.21);
        assert_eq!(card_derived_probe[1].1.equity, 0.43);
        assert_eq!(card_derived_probe[2].1.equity, 0.65);
        assert_eq!(
            card_derived_probe[1].1.next_chance_branches()[2].1.equity,
            0.33
        );
        assert_eq!(card_derived_probe[1].1.next_chance_branches()[2].0, 0.50);
        assert_eq!(br::balanced_flop_buckets()[0].turn_equities.len(), 3);
        assert!(
            br::balanced_flop_buckets()[0].turn_equities[0]
                <= br::balanced_flop_buckets()[0].turn_equities[1]
        );
        assert!(
            br::balanced_flop_buckets()[0].turn_equities[1]
                <= br::balanced_flop_buckets()[0].turn_equities[2]
        );
        assert!(
            (br::balanced_flop_buckets()[0]
                .turn_weights
                .iter()
                .sum::<f64>()
                - 1.0)
                .abs()
                < 1e-12
        );
        assert_eq!(br::balanced_flop_buckets()[0].river_equities.len(), 3);
        for river_equities in br::balanced_flop_buckets()[0].river_equities {
            assert!(river_equities[0] <= river_equities[1]);
            assert!(river_equities[1] <= river_equities[2]);
        }
        assert!(
            (br::balanced_flop_buckets()[0].river_weights[0]
                .iter()
                .sum::<f64>()
                - 1.0)
                .abs()
                < 1e-12
        );
        let flop_one_step =
            br::flop_bucket_exploitability_pct_pot(&br::balanced_flop_buckets(), 100.0, 66.0);
        assert!(flop_tree >= flop_one_step, "{flop_tree} {flop_one_step}");
        let flop_weight: f64 = br::balanced_flop_buckets().iter().map(|b| b.weight).sum();
        assert_eq!(br::balanced_flop_buckets().len(), 7);
        assert!((flop_weight - 1.0).abs() <= 1e-9);
        let coarse = br::nlh_flop_bucketed_exploitability_pct_pot(2);
        let balanced = br::nlh_flop_bucketed_exploitability_pct_pot(4);
        let precise = br::nlh_flop_bucketed_exploitability_pct_pot(6);
        assert!(coarse.is_finite(), "{coarse}");
        assert!(balanced.is_finite(), "{balanced}");
        assert!(precise <= 1.0, "{precise}");
        let plo4_fast = br::plo4_fast_exploitability_pct_pot();
        assert!(plo4_fast.is_finite());
        assert!(plo4_fast <= 12.0, "{plo4_fast}");
        let plo5_fast = br::plo5_fast_exploitability_pct_pot();
        assert!(plo5_fast.is_finite());
        assert!(plo5_fast <= 12.0, "{plo5_fast}");
    }

    #[test]
    fn pot_limit_and_bucket_smoke() {
        assert_eq!(tree::pot_limit_max_raise(100.0, 20.0), 160.0);
        let bet_tree =
            tree::parse_bet_tree("flop 33,66,all-in; turn 66,125; river 75,all-in").unwrap();
        assert_eq!(
            bet_tree.flop,
            vec![
                tree::BetSize::Percent(33.0),
                tree::BetSize::Percent(66.0),
                tree::BetSize::AllIn
            ]
        );
        assert_eq!(
            tree::concrete_bets(&bet_tree.flop, 100.0, 120.0),
            vec![33.0, 66.0, 120.0]
        );
        assert_eq!(
            tree::concrete_bets(
                &[tree::BetSize::Percent(90.0), tree::BetSize::AllIn],
                100.0,
                100.0
            ),
            vec![100.0]
        );
        assert_eq!(
            tree::concrete_pot_limit_bets(
                &[
                    tree::BetSize::Percent(50.0),
                    tree::BetSize::Percent(200.0),
                    tree::BetSize::AllIn
                ],
                100.0,
                20.0,
                300.0,
            ),
            vec![50.0, 160.0]
        );
        assert!(tree::parse_bet_tree("turn 66; river all-in").is_err());
        assert!(tree::parse_bet_tree("flop 0").is_err());
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
        let handle = super::solve(
            r#"{"position":"BTN","villainPosition":"BB","potType":"SRP","precision":"balanced","pot":100.0,"bet":66.0,"stack":250.0,"betTree":"flop 33,66,all-in"}"#,
        )
        .expect("solve starts");
        let payload = super::serialize(handle).expect("serializes");
        let native: super::NativeSolve =
            serde_json::from_slice(&payload).expect("native solve json");
        assert_eq!(native.spot.bet_tree.as_deref(), Some("flop 33,66,all-in"));
        assert_eq!(native.spot.position.as_deref(), Some("BTN"));
        assert_eq!(native.spot.villain_position.as_deref(), Some("BB"));
        assert_eq!(native.spot.pot_type.as_deref(), Some("SRP"));
        assert_eq!(native.spot.precision.as_deref(), Some("balanced"));
        assert_eq!(native.nodes[0].id, "root");
        assert_eq!(native.nodes[0].street, "preflop");
        assert_eq!(native.nodes[0].info_set, "preflop:root");
        assert_eq!(native.information_sets[0].key, "preflop:root");
        assert_eq!(native.information_sets[0].node_id, "root");
        assert_eq!(native.information_sets[0].strategy_ref, "root");
        assert_eq!(
            native
                .information_sets
                .iter()
                .find(|info_set| info_set.node_id == "root/call")
                .unwrap()
                .metric_ref,
            "action:call"
        );
        assert!(super::has_node_id(&native, "root/call"));
        assert!(super::has_node_id(&native, "root/raise-sizes"));
        assert_eq!(
            native
                .information_sets
                .iter()
                .find(|info_set| info_set.node_id == "root/raise-sizes")
                .unwrap()
                .strategy_ref,
            "raise-sizes"
        );
        assert!(super::has_node_id(&native, "root/bet-33"));
        assert!(super::has_node_id(&native, "root/bet-33/fold"));
        assert!(super::has_node_id(&native, "root/bet-33/call"));
        assert_eq!(
            native
                .nodes
                .iter()
                .find(|node| node.id == "root/bet-33")
                .unwrap()
                .info_set,
            "preflop:root/bet-33"
        );
        assert!(super::has_node_id(&native, "root/bet-all-in"));
        let equity = br::DEFAULT_RIVER_SPECS[0].1;
        let (fold_ev, call_ev, _) = br::action_evs(equity, 100.0, 66.0, 0.0, 0.0);
        let raise_ev = super::best_raise_ev(equity, 100.0, &[33.0, 66.0, 250.0], 0.0, 0.0);
        let first = br::cfr_combo_from_action_evs(equity, fold_ev, call_ev, raise_ev, 2_048);
        assert_eq!(native.combos[0], "AcAd");
        assert_eq!(native.combos.len(), 28);
        assert_eq!(native.best_raise_amounts[0], 250.0);
        assert_eq!(
            &native.strategy[0..3],
            &[first.fold, first.call, first.raise]
        );
        assert!(super::has_node_id(&native, "root"));
        assert!(!super::has_node_id(&native, "turn:blank"));
        let flop_handle = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c","betTree":"flop 33,66,all-in; turn 66,125; river 75,all-in"}"#,
        )
        .expect("flop solve starts");
        let flop_payload = super::serialize(flop_handle).expect("flop serializes");
        let flop_native: super::NativeSolve =
            serde_json::from_slice(&flop_payload).expect("flop solve json");
        assert!(super::has_node_id(&flop_native, "root/turn-low"));
        assert_eq!(
            flop_native
                .information_sets
                .iter()
                .find(|info_set| info_set.node_id == "root/turn-low")
                .unwrap()
                .strategy_ref,
            "root/turn-low"
        );
        let turn_low_bet_node = flop_native
            .nodes
            .iter()
            .find(|node| {
                node.id.starts_with("root/turn-low/bet-")
                    && !node.id.ends_with("/fold")
                    && !node.id.ends_with("/call")
            })
            .expect("turn low bet node");
        assert_eq!(turn_low_bet_node.actions, ["fold", "call"]);
        assert!(super::has_node_id(
            &flop_native,
            &format!("{}/call", turn_low_bet_node.id)
        ));
        let turn_low_bet_strategy =
            super::get_strategy(flop_handle, &format!("turn:{}", turn_low_bet_node.id)).unwrap();
        assert_eq!(turn_low_bet_strategy.len(), flop_native.combos.len() * 2);
        let turn_low_bet_call_metrics =
            super::get_hand_metrics(flop_handle, &format!("turn:{}/call", turn_low_bet_node.id))
                .unwrap();
        let turn_low_strategy = super::get_strategy(flop_handle, "turn:root/turn-low").unwrap();
        let flop_root_strategy = super::get_strategy(flop_handle, "root").unwrap();
        assert_ne!(&turn_low_strategy[0..3], &flop_root_strategy[0..3]);
        let turn_low_metrics = super::get_hand_metrics(flop_handle, "turn:root/turn-low").unwrap();
        assert_eq!(turn_low_metrics[1], turn_low_bet_call_metrics[1]);
        let turn_mid_metrics = super::get_hand_metrics(flop_handle, "turn:root/turn-mid").unwrap();
        let turn_high_metrics =
            super::get_hand_metrics(flop_handle, "turn:root/turn-high").unwrap();
        assert!(turn_low_metrics[1] <= turn_mid_metrics[1]);
        assert!(turn_mid_metrics[1] <= turn_high_metrics[1]);
        let small_turn_handle = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c","betTree":"flop 33; turn 25; river 75"}"#,
        )
        .expect("small turn solve starts");
        let large_turn_handle = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c","betTree":"flop 33; turn 125; river 75"}"#,
        )
        .expect("large turn solve starts");
        let small_turn_metrics =
            super::get_hand_metrics(small_turn_handle, "turn:root/turn-mid").unwrap();
        let large_turn_metrics =
            super::get_hand_metrics(large_turn_handle, "turn:root/turn-mid").unwrap();
        assert_eq!(small_turn_metrics[1], large_turn_metrics[1]);
        assert_ne!(small_turn_metrics[0], large_turn_metrics[0]);
        let turn_handle =
            super::solve(r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c 2s"}"#)
                .expect("turn solve starts");
        let turn_payload = super::serialize(turn_handle).expect("turn serializes");
        let turn_native: super::NativeSolve =
            serde_json::from_slice(&turn_payload).expect("turn solve json");
        assert!(super::has_node_id(&turn_native, "root/river-high"));
        assert!(!super::has_node_id(&turn_native, "root/turn-low"));
        let root_strategy = super::get_strategy(handle, "root").unwrap();
        assert_eq!(
            root_strategy.len(),
            native.combos.len() * native.nodes[0].actions.len()
        );
        assert!(super::get_strategy(handle, "root/call").unwrap().is_empty());
        assert!(super::get_strategy(handle, "preflop:root/call")
            .unwrap()
            .is_empty());
        let call_metrics = super::get_hand_metrics(handle, "root/call").unwrap();
        let call_metrics_by_info_set =
            super::get_hand_metrics(handle, "preflop:root/call").unwrap();
        assert_eq!(call_metrics, call_metrics_by_info_set);
        assert_eq!(call_metrics.len(), native.combos.len() * 3);
        assert!((call_metrics[0] - native.action_evs[1]).abs() < 1e-12);
        assert!(call_metrics[1] > 0.0);
        let bet_strategy = super::get_strategy(handle, "root/bet-33").unwrap();
        let bet_node = native
            .nodes
            .iter()
            .find(|node| node.id == "root/bet-33")
            .unwrap();
        assert_eq!(
            bet_strategy.len(),
            native.combos.len() * bet_node.actions.len()
        );
        assert!((bet_strategy[0] - 33.0 / 133.0).abs() < 1e-12);
        assert!((bet_strategy[1] - 100.0 / 133.0).abs() < 1e-12);
        let raise_size_strategy = super::get_strategy(handle, "root/raise-sizes").unwrap();
        let raise_size_node = native
            .nodes
            .iter()
            .find(|node| node.id == "root/raise-sizes")
            .unwrap();
        assert_eq!(
            raise_size_strategy.len(),
            native.combos.len() * raise_size_node.actions.len()
        );
        assert!(
            (raise_size_strategy[..raise_size_node.actions.len()]
                .iter()
                .sum::<f64>()
                - native.strategy[2])
                .abs()
                < 1e-12
        );
        assert!(
            raise_size_strategy[..raise_size_node.actions.len()]
                .iter()
                .filter(|frequency| **frequency > 0.0)
                .count()
                > 1
        );
        let raise_size_metrics = super::get_hand_metrics(handle, "root/raise-sizes").unwrap();
        assert_eq!(raise_size_metrics.len(), native.combos.len() * 3);
        assert_eq!(raise_size_metrics[1], native.metrics[1]);
        assert_ne!(raise_size_metrics[0], native.metrics[0]);
        let bet_metrics = super::get_hand_metrics(handle, "root/bet-33").unwrap();
        assert_eq!(bet_metrics.len(), native.combos.len() * 3);
        assert!(bet_metrics[0].is_finite());
        assert!(bet_metrics[1] > 0.0);
        let bet_call_metrics = super::get_hand_metrics(handle, "root/bet-33/call").unwrap();
        assert_eq!(bet_call_metrics.len(), native.combos.len() * 3);
        assert!(bet_call_metrics[0].is_finite());
        let bet_call_by_info_set =
            super::get_hand_metrics(handle, "preflop:root/bet-33/call").unwrap();
        assert_eq!(bet_call_metrics, bet_call_by_info_set);
        assert!(native.action_evs[2] >= native.action_evs[1]);
        assert!(native.action_evs[2] > br::action_evs(equity, 100.0, 66.0, 0.0, 0.0).2 / 100.0);
        assert!(native.metrics[(native.combos.len() - 1) * 3] >= 0.0);
        let base = native.combos.len() * 3;
        assert_eq!(native.metrics[base], 2.5);
        assert_eq!(native.metrics[base + 1], 100.0 / 166.0);
        assert_eq!(native.metrics[base + 2], 66.0 / 166.0);
        assert_eq!(native.metrics[base + 3], 66.0 / 232.0);
        assert_eq!(
            native.metrics[base + 4],
            native.progress.last().unwrap().exploitability_pct
        );
        assert!(
            native.progress.first().unwrap().exploitability_pct
                >= native.progress.last().unwrap().exploitability_pct
        );
        assert!(native.progress.last().unwrap().exploitability_pct <= 0.3);
        super::cancel(handle).expect("cancel");

        let flop_handle = super::solve(
            r#"{"position":"BTN","villainPosition":"BB","potType":"SRP","precision":"precise","pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c"}"#,
        )
        .expect("flop solve");
        let flop_payload = super::serialize(flop_handle).unwrap();
        let flop_native: super::NativeSolve = serde_json::from_slice(&flop_payload).unwrap();
        let flop_base = flop_native.combos.len() * 3;
        assert_eq!(flop_native.nodes[0].street, "flop");
        assert_eq!(
            flop_native.metrics[flop_base + 4],
            br::nlh_flop_bucketed_exploitability_pct_pot_for_spot(6, 100.0, 66.0)
        );
        assert_eq!(
            flop_native.metrics[flop_base + 4],
            flop_native.progress.last().unwrap().exploitability_pct
        );
        super::cancel(flop_handle).expect("cancel flop");
    }

    #[test]
    fn native_solve_subtracts_capped_rake_from_showdown_ev() {
        super::init(None);
        let no_rake = super::solve(r#"{"pot":100.0,"bet":66.0,"stack":250.0}"#).unwrap();
        let raked =
            super::solve(r#"{"pot":100.0,"bet":66.0,"stack":250.0,"rakePct":5.0,"rakeCap":10.0}"#)
                .unwrap();
        let no_rake_payload = super::serialize(no_rake).unwrap();
        let raked_payload = super::serialize(raked).unwrap();
        let no_rake_native: super::NativeSolve = serde_json::from_slice(&no_rake_payload).unwrap();
        let raked_native: super::NativeSolve = serde_json::from_slice(&raked_payload).unwrap();
        assert!(raked_native.action_evs[1] < no_rake_native.action_evs[1]);
        assert!(raked_native.action_evs[2] < no_rake_native.action_evs[2]);
        super::cancel(no_rake).unwrap();
        super::cancel(raked).unwrap();
    }

    #[test]
    fn native_solve_nodes_use_current_street_bet_sizes() {
        super::init(None);
        let handle = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c 2s","betTree":"flop 33; turn 66; river 150"}"#,
        )
        .unwrap();
        let payload = super::serialize(handle).unwrap();
        let native: super::NativeSolve = serde_json::from_slice(&payload).unwrap();
        assert!(super::has_node_id(&native, "root/bet-66"));
        assert!(!super::has_node_id(&native, "root/bet-33"));
        super::cancel(handle).unwrap();
    }

    #[test]
    fn native_solve_reports_plo_fast_br_metrics() {
        super::init(None);
        let plo4 = super::solve(
            r#"{"game":"PLO4","pot":100.0,"bet":20.0,"stack":300.0,"betTree":"flop 50,200,all-in"}"#,
        )
        .unwrap();
        let plo4_payload = super::serialize(plo4).unwrap();
        let plo4_native: super::NativeSolve = serde_json::from_slice(&plo4_payload).unwrap();
        let plo4_plain =
            super::solve(r#"{"game":"PLO4","pot":100.0,"bet":20.0,"stack":300.0}"#).unwrap();
        let plo4_plain_payload = super::serialize(plo4_plain).unwrap();
        let plo4_plain_native: super::NativeSolve =
            serde_json::from_slice(&plo4_plain_payload).unwrap();
        assert_eq!(plo4_native.combos[0], "AsAhKsKh");
        assert_eq!(plo4_native.hand_classes[0], "AA double-suited");
        assert!(plo4_native
            .hand_classes
            .iter()
            .any(|class| class.contains("rundown")));
        assert!(plo4_native.blocker_metrics[0] > 0.0);
        assert!(plo4_native.blocker_metrics[1] > 0.0);
        assert!(super::has_node_id(&plo4_native, "root/bet-160"));
        assert!(!super::has_node_id(&plo4_native, "root/bet-300"));
        assert!(plo4_native.action_evs[2] > plo4_plain_native.action_evs[2]);
        assert_eq!(plo4_native.combos.len(), br::PLO4_FAST_SAMPLES.len());
        assert!(plo4_native
            .strategy
            .chunks_exact(3)
            .all(|row| (row.iter().sum::<f64>() - 1.0).abs() < 1e-9));
        assert!(plo4_native.metrics[plo4_native.combos.len() * 3 + 4] >= 0.0);
        assert!(
            (plo4_native.metrics[plo4_native.combos.len() * 3 + 5]
                - plo4_native.metrics[plo4_native.combos.len() * 3 + 4])
                .abs()
                < 1e-12
        );
        let plo4_precise =
            super::solve(r#"{"game":"PLO4","pot":100.0,"bet":20.0,"precision":"precise"}"#)
                .unwrap();
        let plo4_precise_payload = super::serialize(plo4_precise).unwrap();
        let plo4_precise_native: super::NativeSolve =
            serde_json::from_slice(&plo4_precise_payload).unwrap();
        assert!(
            (plo4_precise_native.metrics[plo4_precise_native.combos.len() * 3 + 5]
                - plo4_precise_native.metrics[plo4_precise_native.combos.len() * 3 + 4])
                .abs()
                < 1e-12
        );
        assert_eq!(
            plo4_precise_native.metrics[plo4_precise_native.combos.len() * 3 + 10],
            4_096.0
        );
        assert_eq!(
            plo4_native.metrics[plo4_native.combos.len() * 3 + 6],
            br::PLO4_FAST_SAMPLES.len() as f64
        );
        assert!((plo4_native.metrics[plo4_native.combos.len() * 3 + 7] - 1.0).abs() < 1e-12);
        assert_eq!(
            plo4_native.metrics[plo4_native.combos.len() * 3 + 8],
            br::PLO4_FAST_SAMPLES.len() as f64
        );
        assert!((plo4_native.metrics[plo4_native.combos.len() * 3 + 9] - 1.0).abs() < 1e-12);
        assert_eq!(
            plo4_native.metrics[plo4_native.combos.len() * 3 + 10],
            2_048.0
        );
        assert_eq!(
            plo4_native.metrics[plo4_native.combos.len() * 3 + 11],
            20_000.0
        );
        assert_eq!(
            plo4_native.metrics[plo4_native.combos.len() * 3 + 12],
            br::PLO_FAST_EQUITY_SAMPLES as f64
        );
        let plo4_aces = super::solve(
            r#"{"game":"PLO4","pot":100.0,"bet":20.0,"stack":300.0,"heroRange":"AA**:ds@50"}"#,
        )
        .expect("PLO range filtered solve starts");
        let plo4_aces_payload = super::serialize(plo4_aces).unwrap();
        let plo4_aces_native: super::NativeSolve =
            serde_json::from_slice(&plo4_aces_payload).unwrap();
        assert_eq!(plo4_aces_native.combos, vec!["AsAhKsKh"]);
        assert_eq!(
            plo4_aces_native.metrics[plo4_aces_native.combos.len() * 3 + 6],
            1.0
        );
        assert!(
            (plo4_aces_native.metrics[plo4_aces_native.combos.len() * 3 + 7] - 0.06).abs() < 1e-12
        );
        assert_eq!(
            plo4_aces_native.metrics[plo4_aces_native.combos.len() * 3 + 8],
            br::PLO4_FAST_SAMPLES.len() as f64
        );
        let plo4_aces_vs_rundown = super::solve(
            r#"{"game":"PLO4","pot":100.0,"bet":20.0,"stack":300.0,"heroRange":"AA**:ds@50","villainRange":"JT98:ds@75"}"#,
        )
        .expect("PLO villain range filtered solve starts");
        let plo4_aces_vs_rundown_payload = super::serialize(plo4_aces_vs_rundown).unwrap();
        let plo4_aces_vs_rundown_native: super::NativeSolve =
            serde_json::from_slice(&plo4_aces_vs_rundown_payload).unwrap();
        assert_eq!(plo4_aces_vs_rundown_native.blocker_metrics[0], 0.0);
        assert_eq!(plo4_aces_vs_rundown_native.blocker_metrics[1], 0.0);
        assert_ne!(
            plo4_aces_vs_rundown_native.metrics[1],
            plo4_aces_native.metrics[1]
        );
        let bad_plo_range: super::NativeSpot = serde_json::from_str(
            r#"{"game":"PLO4","pot":100.0,"bet":20.0,"heroRange":"AA**:bad@50"}"#,
        )
        .unwrap();
        assert!(super::validate_spot(&bad_plo_range).is_err());
        let plo4_board =
            super::solve(r#"{"game":"PLO4","pot":100.0,"bet":20.0,"board":"2c 3d 4h"}"#).unwrap();
        let plo4_board_payload = super::serialize(plo4_board).unwrap();
        let plo4_board_native: super::NativeSolve =
            serde_json::from_slice(&plo4_board_payload).unwrap();
        assert_ne!(plo4_board_native.metrics[1], plo4_native.metrics[1]);
        let plo5 = super::solve(r#"{"game":"PLO5","pot":100.0,"bet":66.0,"stack":250.0}"#).unwrap();
        let plo5_payload = super::serialize(plo5).unwrap();
        let plo5_native: super::NativeSolve = serde_json::from_slice(&plo5_payload).unwrap();
        assert_eq!(plo5_native.combos[0], "AsAhKsKhQs");
        assert!(plo5_native
            .strategy
            .chunks_exact(3)
            .all(|row| (row.iter().sum::<f64>() - 1.0).abs() < 1e-9));
        assert!(plo5_native.metrics[plo5_native.combos.len() * 3 + 4] >= 0.0);
        assert!(
            (plo5_native.metrics[plo5_native.combos.len() * 3 + 5]
                - plo5_native.metrics[plo5_native.combos.len() * 3 + 4])
                .abs()
                < 1e-12
        );
        assert_eq!(
            plo5_native.metrics[plo5_native.combos.len() * 3 + 6],
            br::PLO5_FAST_SAMPLES.len() as f64
        );
        assert!((plo5_native.metrics[plo5_native.combos.len() * 3 + 7] - 1.0).abs() < 1e-12);
        assert_eq!(
            plo5_native.metrics[plo5_native.combos.len() * 3 + 8],
            br::PLO5_FAST_SAMPLES.len() as f64
        );
        assert!((plo5_native.metrics[plo5_native.combos.len() * 3 + 9] - 1.0).abs() < 1e-12);
        assert_eq!(
            plo5_native.metrics[plo5_native.combos.len() * 3 + 10],
            2_048.0
        );
        assert_eq!(
            plo5_native.metrics[plo5_native.combos.len() * 3 + 11],
            30_000.0
        );
        assert_eq!(
            plo5_native.metrics[plo5_native.combos.len() * 3 + 12],
            br::PLO_FAST_EQUITY_SAMPLES as f64
        );
        super::cancel(plo4).unwrap();
        super::cancel(plo4_plain).unwrap();
        super::cancel(plo5).unwrap();
    }

    #[test]
    fn native_solve_rejects_invalid_spots() {
        assert!(super::validate_spot(&super::NativeSpot {
            game: None,
            position: Some("BAD".to_string()),
            villain_position: None,
            pot_type: None,
            precision: None,
            pot: 100.0,
            bet: 66.0,
            stack: None,
            board: None,
            rake_pct: None,
            rake_cap: None,
            bet_tree: None,
            hero_range: None,
            villain_range: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            game: None,
            position: None,
            villain_position: None,
            pot_type: None,
            precision: None,
            pot: 0.0,
            bet: 66.0,
            stack: None,
            board: None,
            rake_pct: None,
            rake_cap: None,
            bet_tree: None,
            hero_range: None,
            villain_range: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            game: None,
            position: None,
            villain_position: None,
            pot_type: None,
            precision: None,
            pot: 100.0,
            bet: 66.0,
            stack: None,
            board: Some("Ah Kd".to_string()),
            rake_pct: None,
            rake_cap: None,
            bet_tree: None,
            hero_range: None,
            villain_range: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            game: None,
            position: None,
            villain_position: None,
            pot_type: None,
            precision: None,
            pot: 100.0,
            bet: -1.0,
            stack: None,
            board: None,
            rake_pct: None,
            rake_cap: None,
            bet_tree: None,
            hero_range: None,
            villain_range: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            game: None,
            position: None,
            villain_position: None,
            pot_type: None,
            precision: None,
            pot: 100.0,
            bet: 66.0,
            stack: Some(0.0),
            board: None,
            rake_pct: None,
            rake_cap: None,
            bet_tree: None,
            hero_range: None,
            villain_range: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            game: None,
            position: None,
            villain_position: None,
            pot_type: None,
            precision: None,
            pot: 100.0,
            bet: 66.0,
            stack: None,
            board: Some("Ah Ah".to_string()),
            rake_pct: None,
            rake_cap: None,
            bet_tree: None,
            hero_range: None,
            villain_range: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            game: None,
            position: None,
            villain_position: None,
            pot_type: None,
            precision: None,
            pot: 100.0,
            bet: 66.0,
            stack: None,
            board: None,
            rake_pct: Some(-1.0),
            rake_cap: None,
            bet_tree: None,
            hero_range: None,
            villain_range: None,
        })
        .is_err());
        assert!(super::validate_spot(&super::NativeSpot {
            game: None,
            position: None,
            villain_position: None,
            pot_type: None,
            precision: None,
            pot: 100.0,
            bet: 66.0,
            stack: None,
            board: None,
            rake_pct: None,
            rake_cap: None,
            bet_tree: Some("turn 66".to_string()),
            hero_range: None,
            villain_range: None,
        })
        .is_err());
    }

    #[test]
    fn native_solve_board_changes_concrete_combo_equity() {
        super::init(None);
        let empty = super::solve(r#"{"pot":100.0,"bet":66.0,"stack":250.0}"#).unwrap();
        let boarded =
            super::solve(r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c"}"#).unwrap();
        let empty_payload = super::serialize(empty).unwrap();
        let board_payload = super::serialize(boarded).unwrap();
        let empty_native: super::NativeSolve = serde_json::from_slice(&empty_payload).unwrap();
        let board_native: super::NativeSolve = serde_json::from_slice(&board_payload).unwrap();
        assert_eq!(board_native.nodes[0].street, "flop");
        assert_ne!(empty_native.metrics[1], board_native.metrics[1]);
        assert!(board_native
            .combos
            .iter()
            .all(|combo| !combo.contains("Ah")));
        super::cancel(empty).unwrap();
        super::cancel(boarded).unwrap();
    }

    #[test]
    fn native_solve_uses_custom_nlh_ranges() {
        super::init(None);
        let custom = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c","heroRange":"QQ,JTs","villainRange":"AA"}"#,
        )
        .unwrap();
        let custom_payload = super::serialize(custom).unwrap();
        let custom_native: super::NativeSolve = serde_json::from_slice(&custom_payload).unwrap();
        assert!(!custom_native.combos.is_empty());
        assert!(custom_native
            .hand_classes
            .iter()
            .any(|class| class == "pair"));
        assert!(custom_native
            .combos
            .iter()
            .all(|combo| combo.starts_with('Q')
                || combo.starts_with('J')
                || combo.starts_with('T')));
        let weighted = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c","heroRange":"QQ:0.25","villainRange":"AA"}"#,
        )
        .unwrap();
        let weighted_payload = super::serialize(weighted).unwrap();
        let weighted_native: super::NativeSolve =
            serde_json::from_slice(&weighted_payload).unwrap();
        assert!(weighted_native
            .weights
            .iter()
            .all(|weight| (*weight - 0.25).abs() < 1e-12));
        let blockers = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Kd 7c 2s","heroRange":"AA","villainRange":"AA"}"#,
        )
        .unwrap();
        let blockers_payload = super::serialize(blockers).unwrap();
        let blockers_native: super::NativeSolve =
            serde_json::from_slice(&blockers_payload).unwrap();
        assert!(blockers_native.blocker_metrics[0] > 0.0);
        assert!(blockers_native.blocker_metrics[1] > 0.0);
        let default_villains = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c","heroRange":"QQ"}"#,
        )
        .unwrap();
        let aa_villains = super::solve(
            r#"{"pot":100.0,"bet":66.0,"stack":250.0,"board":"Ah Kd 7c","heroRange":"QQ","villainRange":"AA"}"#,
        )
        .unwrap();
        let default_payload = super::serialize(default_villains).unwrap();
        let aa_payload = super::serialize(aa_villains).unwrap();
        let default_native: super::NativeSolve = serde_json::from_slice(&default_payload).unwrap();
        let aa_native: super::NativeSolve = serde_json::from_slice(&aa_payload).unwrap();
        assert_ne!(default_native.metrics[1], aa_native.metrics[1]);
        super::cancel(custom).unwrap();
        super::cancel(weighted).unwrap();
        super::cancel(blockers).unwrap();
        super::cancel(default_villains).unwrap();
        super::cancel(aa_villains).unwrap();
    }

    #[test]
    fn cached_combo_equity_matches_uncached() {
        let board = super::parse_board("Ah Kd 7c").unwrap();
        let entries = super::default_river_entries(&board);
        let entry = entries.first().unwrap();
        let mut cache = std::collections::HashMap::new();
        let uncached = super::combo_equity(entry.holes, entry.fallback, &board);
        let cached =
            super::combo_equity_cached(entry.holes, entry.fallback, &board, &entries, &mut cache);
        assert!((uncached - cached).abs() < 1e-12);
        assert!(!cache.is_empty());
    }
}
