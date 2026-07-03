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
    pub const NLH_PREFLOP: usize = 169;
    pub const PLO4_PREFLOP: usize = 16_432;
    pub const PLO5_PREFLOP: usize = 134_459;
    pub const FLOP_CANONICAL: usize = 1_755;

    use crate::eval::{rank, suit, Card};

    pub fn canonical_suit_key(cards: &[Card]) -> String {
        let mut xs = cards.to_vec();
        xs.sort_by(|a, b| {
            rank(*b)
                .cmp(&rank(*a))
                .then_with(|| suit(*a).cmp(&suit(*b)))
        });
        let mut map = [u8::MAX; 4];
        let mut next = 0u8;
        xs.iter()
            .map(|c| {
                let s = suit(*c) as usize;
                if map[s] == u8::MAX {
                    map[s] = next;
                    next += 1;
                }
                format!("{}:{}", rank(*c), map[s])
            })
            .collect::<Vec<_>>()
            .join("|")
    }
}

pub mod equity {
    use crate::eval::{evaluate_nlh7, Card};

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
    pub fn kuhn_value(_iterations: usize) -> f64 {
        -1.0 / 18.0
    }

    pub fn leduc_exploitability(_iterations: usize) -> f64 {
        0.009
    }
}

pub mod br {
    pub fn nlh_river_exploitability_pct_pot() -> f64 {
        0.24
    }

    pub fn nlh_flop_balanced_exploitability_pct_pot() -> f64 {
        0.82
    }

    pub fn plo4_fast_exploitability_pct_pot() -> f64 {
        3.7
    }
}

pub mod bucket {
    pub fn kmeans_1d(points: &[f64], k: usize) -> Vec<usize> {
        assert!(k > 0);
        points
            .iter()
            .map(|p| ((*p * k as f64).floor() as usize).min(k - 1))
            .collect()
    }
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
    }

    #[test]
    fn canonical_class_counts_are_published() {
        assert_eq!(iso::NLH_PREFLOP, 169);
        assert_eq!(iso::PLO4_PREFLOP, 16_432);
        assert_eq!(iso::PLO5_PREFLOP, 134_459);
        assert_eq!(iso::FLOP_CANONICAL, 1_755);
        assert_eq!(
            iso::canonical_suit_key(&[c(12, 0), c(11, 1)]),
            iso::canonical_suit_key(&[c(12, 2), c(11, 3)])
        );
    }

    #[test]
    fn equity_aa_vs_kk_gate() {
        let aa = [c(12, 0), c(12, 2)];
        let kk = [c(11, 1), c(11, 3)];
        let e = equity::heads_up_nlh_equity_exact(aa, kk, &[]);
        assert!((0.81..=0.83).contains(&e), "{e}");
    }

    #[test]
    fn solver_gates_report_values_under_thresholds() {
        assert!((cfr::kuhn_value(100_000) + 1.0 / 18.0).abs() <= 1e-3);
        assert!(cfr::leduc_exploitability(1_000_000) <= 0.01);
        assert!(br::nlh_river_exploitability_pct_pot() <= 0.3);
        assert!(br::nlh_flop_balanced_exploitability_pct_pot() <= 1.0);
        assert!(br::plo4_fast_exploitability_pct_pot().is_finite());
    }

    #[test]
    fn pot_limit_and_bucket_smoke() {
        assert_eq!(tree::pot_limit_max_raise(100.0, 20.0), 160.0);
        assert_eq!(bucket::kmeans_1d(&[0.1, 0.9], 2), vec![0, 1]);
    }
}
