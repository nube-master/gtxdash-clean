# Architecture rules

- Native USD hourly reports share pure formatting helpers under the edge-function shared directory; this keeps presentation testable without changing financial amounts.
- Web Push preserves the producer-rendered text for explicitly marked native-USD RedTrack hourly reports; reapplying BRL templates would duplicate currency symbols.
- A per-operation report may only use native RedTrack figures when that account's currency is verified as single-currency from stored event payloads; a mixed-currency account's report totals are unconverted sums and must not be shown under one currency symbol.