# Formats

## NLH Range Text

```bnf
range      ::= term ("," term)*
term       ::= hand [":" weight] | span [":" weight] | plus [":" weight]
hand       ::= pair | ranks suitedness
pair       ::= rank rank
ranks      ::= rank rank
suitedness ::= "s" | "o" | ""
span       ::= hand "-" hand
plus       ::= hand "+"
weight     ::= number ; 0..1
rank       ::= "A"|"K"|"Q"|"J"|"T"|"9"|"8"|"7"|"6"|"5"|"4"|"3"|"2"
```

Examples: `AA, KQs, A5s:0.5, 76s-54s, AJo+, TT-77:0.25`.

## PLO Range Text

```bnf
range       ::= plo_term ("," plo_term)*
plo_term    ::= rank_pattern [":" suitedness] ["@" percent]
rank_pattern::= rank rank rank rank [rank] | "*" forms
suitedness  ::= "ds" | "ss" | "r"
percent     ::= 0..100
```

Examples: `AA**:ds@100, AA**:ss@60, JT98:ds@75`.

## JSON Schemas

All persisted documents include:

```json
{ "version": 1, "kind": "range|spot|solve-result", "payload": {} }
```

Spot cache key is `sha256(canonical-json)`.

Solve cache records:

```json
{
  "key": "sha256",
  "meta": { "version": 1, "createdAt": 0, "spot": {} },
  "blob": {
    "combos": ["AA"],
    "fold": "Uint16 probability table",
    "call": "Uint16 probability table",
    "raise": "Uint16 probability table",
    "foldEv": "Float32Array",
    "callEv": "Float32Array",
    "raiseEv": "Float32Array",
    "equity": "Uint16 probability table",
    "ev": "Float32Array",
    "eqr": "Float32Array",
    "exploitability": [],
    "metrics": {}
  }
}
```
