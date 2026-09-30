# Contributing

The repository contains only fictional fixtures. Do not add credentials,
private research, personal data, or real sensitive artifacts to tests or demo
data.

Run `npm install`, then `npm test` and `npm run validate`. Changes to the
protocol should include a schema or test fixture and explain compatibility in
the pull request. Published events are append-only; corrections use a new
event or a signed tombstone.
