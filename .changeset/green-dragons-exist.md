---
'@openzeppelin/adapter-evm': patch
'@openzeppelin/adapter-midnight': patch
'@openzeppelin/adapter-polkadot': patch
'@openzeppelin/adapter-solana': patch
'@openzeppelin/adapter-stellar': patch
---

Move shared host runtime packages to peer plus dev dependencies, switch adapter lodash usage to
`lodash-es`, and validate the host dependency policy during builds to avoid duplicate runtime
installs in consumer applications.
