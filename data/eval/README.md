# Evaluation sets (PRD §7.6)

Read by `make eval` in `services/intelligence` (AI-6). Written by the data lane; Hindi and Marathi lines reviewed by a native speaker.

## intent.jsonl (36 lines)

| ids | locale field | language | expectedTaskId |
|---|---|---|---|
| q01–q10 | `en` | English | start-business-mumbai |
| q11–q18 | `hi` | Hindi | start-business-mumbai |
| q19–q25 | `mr` | Marathi | start-business-mumbai |
| q26–q30 | `en` | **Hinglish** (romanised Hindi + English) | start-business-mumbai |
| q31–q32 | `en` | English | new-water-connection-mumbai |
| q33–q34 | `hi` | Hindi | new-water-connection-mumbai |
| q35–q36 | `mr` | Marathi | new-water-connection-mumbai |

Hinglish lines are tagged `locale: "en"` because the request locale is only a hint (the service detects the language itself). **For per-language scoring, treat q26–q30 as Hinglish by id.**
`expectedFacts` lists only facts stated in the query itself (AI-3 keeps a fact only when its evidence is a verbatim substring).

## jurisdiction.jsonl (15 lines)

j01–j15: English, Hindi, Marathi, romanised and short-name phrasings for Mumbai, Pune, Thane, Nagpur, Nashik and state-only.
Known miss by the gazetteer alone: j01 "near Bandra station" (the gazetteer has no neighbourhoods).

## copilot.jsonl (27 lines)

| ids | taskId | answerable |
|---|---|---|
| c01–c15 | start-business-mumbai | yes (c01–c11 English, c12–c13 Hindi, c14–c15 Marathi) |
| c16–c20 | start-business-mumbai | **no**: expected "not found in official sources" |
| c21–c26 | new-water-connection-mumbai | yes (c21–c24 English, c25 Hindi, c26 Marathi) |
| c27 | new-water-connection-mumbai | **no**: the MCGM manuals mention water-charge bills but give no rate |

Every answerable question's answer was checked to be present in its `expectedSourceUrls` (official pages in `data/sources/registry.json`).
