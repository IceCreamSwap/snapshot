# snapshot

Script and snapshot of user balance data.

# Stats

iCreamRecovery Shares: `653297`

Affected users: `2612`

Snapshot block: `4793585`

# Files

- users.json: contains a list of all users that received iCream.
- shares.json: user balance in iCream token, iCream Pool and BNB|BUSD LP.
- shares.txt: a simple list in format `wallet,user-balance` that will be used to airdrop|iCreamRecovery distribution.  

# how to run

- Install node packages:
```
yarn && node index.js
```

# how to reconstruct data

- To reconstruct users.json, uncoment the function `find_all_users()`.

- To reconstruct the user shares.json|shares.txt:
  
  - uncoment the function `query_user_balance()`, to generate shares.txt.
  - to regenate shares.json, save `shares_unique` data structure to json file instead of shares.txt.
