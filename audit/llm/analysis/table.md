| Cell | R | S | R= | S= | Converted | Skipped | of which GAP | Precision | WRONG | INVALID | MISSING | Time, min | Cost, $ | Output tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **converter** | 95.3 | 62.0 | 95.3 | 62.0 | 81.7 % | 18.3 % | 24 | 100.0 % | 0 | 0 | 0 | — | — | — |
| haiku / low | 92.8 | 48.0 | 91.7 | 48.0 | 79.8 % | 20.2 % | 30 | 91.9 % | 26 | 17 | 0 | 8.6 | 0.39 | 139k |
| haiku / medium | 96.0 | 62.8 | 94.5 | 61.1 | 80.8 % | 19.2 % | 24 | 98.4 % | 9 | 0 | 0 | 6.0 | 0.28 | 99k |
| haiku / high | 96.3 | 59.6 | 94.9 | 57.9 | 81.0 % | 19.0 % | 24 | 97.8 % | 8 | 3 | 0 | 7.6 | 0.36 | 131k |
| haiku / max | 99.6 | 67.4 | 92.2 | 54.9 | 75.2 % | 24.8 % | 21 | 99.2 % | 2 | 2 | 0 | 13.5 | 0.64 | 222k |
| sonnet / low | 96.4 | 70.8 | 95.2 | 69.1 | 83.2 % | 16.8 % | 12 | 97.7 % | 8 | 4 | 0 | 5.2 | 1.03 | 58k |
| sonnet / medium | 95.8 | 78.3 | 94.5 | 76.5 | 82.7 % | 17.3 % | 14 | 97.9 % | 9 | 3 | 0 | 5.3 | 1.05 | 58k |
| sonnet / high | 95.7 | 78.5 | 94.6 | 76.8 | 82.7 % | 17.3 % | 13 | 97.9 % | 8 | 4 | 0 | 6.0 | 1.14 | 65k |
| sonnet / max | 96.5 | 80.1 | 95.3 | 78.4 | 83.8 % | 16.2 % | 7 | 98.1 % | 8 | 3 | 0 | 36.0 | 4.85 | 339k |
| opus / low | 96.5 | 83.1 | 95.3 | 81.4 | 83.3 % | 16.7 % | 10 | 98.1 % | 8 | 3 | 0 | 7.1 | 2.04 | 57k |
| opus / medium | 96.5 | 83.1 | 95.3 | 81.4 | 83.3 % | 16.7 % | 10 | 98.1 % | 8 | 3 | 0 | 8.5 | 2.33 | 66k |
| opus / high | 96.5 | 84.1 | 95.3 | 82.3 | 83.5 % | 16.5 % | 9 | 98.1 % | 8 | 3 | 0 | 10.7 | 2.83 | 85k |

Excluded:
- **opus / max**: not compared. The run was cut off by the account's 5-hour session limit (HTTP 429) after 38.7 min, $7.57 (API equivalent) and 284k output tokens (253k of them thinking). It had written 460 of 678 answers. It ran in parallel with sonnet / max, so the limit was shared; how much of it each run used is not measured.
