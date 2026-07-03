use criterion::{black_box, criterion_group, criterion_main, Criterion};
use gto_lab_engine::{br, eval};

fn card(rank: u8, suit: u8) -> u8 {
    eval::card(rank, suit)
}

fn bench_nlh7_eval(c: &mut Criterion) {
    let hand = [
        card(12, 0),
        card(12, 1),
        card(11, 0),
        card(10, 0),
        card(9, 0),
        card(8, 1),
        card(7, 2),
    ];
    c.bench_function("nlh7_eval", |b| {
        b.iter(|| eval::evaluate_nlh7(black_box(&hand)))
    });
}

fn bench_default_river_solve(c: &mut Criterion) {
    c.bench_function("default_river_solve", |b| {
        b.iter(|| black_box(br::river_strategy_rows()))
    });
}

criterion_group!(benches, bench_nlh7_eval, bench_default_river_solve);
criterion_main!(benches);
