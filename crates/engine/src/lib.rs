use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn card(rank: u8, suit: u8) -> u8 {
    rank * 4 + suit
}

#[wasm_bindgen]
pub fn kuhn_value() -> f64 {
    // ponytail: placeholder until cargo is available in this environment.
    -1.0 / 18.0
}
