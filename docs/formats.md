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

Range JSON import/export:

```json
{ "version": 1, "kind": "range", "payload": { "text": "AA, KQs:0.5" } }
```

Spot cache key is `sha256(canonical-json)`.

Spot JSON payload:

```json
{
  "version": 1,
  "kind": "spot",
  "payload": {
    "game": "NLH",
    "position": "BTN",
    "villainPosition": "BB",
    "potType": "SRP",
    "precision": "balanced",
    "pot": 100,
    "bet": 66,
    "stack": 420,
    "board": "Ah Kd 7c",
    "rakePct": 0,
    "rakeCap": 0,
    "betTree": "flop 33,66,125,all-in; turn 66,125,all-in; river 66,150,all-in"
  }
}
```

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
