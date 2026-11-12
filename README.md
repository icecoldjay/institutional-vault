# CapitalSage — InstitutionalVault

Secure ERC-4626 tokenized vault take-home: deposit fees (≤ 500 bps), pause + RBAC, OpenZeppelin virtual-offset inflation defense.

## Requirements

- Node.js **≥ 22.13.0** (Hardhat 3)
- npm

```bash
# if you use nvm:
nvm use 22
```

## Quick start

```bash
npm install
npm test
npm run test:gas
```

## Layout

| Path | Role |
|---|---|
| `contracts/InstitutionalVault.sol` | Production vault |
| `contracts/test/MockERC20.sol` | Test underlying |
| `contracts/test/NaiveVault.sol` | Test-only vulnerable vault (differential exploit) |
| `test/` | Mocha + Ethers suite incl. **differential inflation** invariants I1–I7 |
| `ARCHITECTURE.md` | Accounting, threats, upgradeability, runbook |
| `PLAN.md` | Explainer + implementation plan |
| `assessment.md` | Original brief |

## Scripts

| Script | Command |
|---|---|
| `npm run compile` | `hardhat compile` |
| `npm test` | `hardhat test` |
| `npm run test:gas` | `hardhat test --gas-stats` |

## Design snapshot

- OpenZeppelin Contracts **5.5.0** `ERC4626` + `AccessControl` + `Pausable`
- `_decimalsOffset() = 3`
- Deposit fee only; `feeRecipient` may be the vault (retain) or an external treasury
- Non-upgradeable implementation; production UUPS recommendation in `ARCHITECTURE.md`
- Differential inflation suite: `NaiveVault` (broken) vs `InstitutionalVault` (δ=3), plus OZ-bound donation scale and solvency/fee EIP invariants (see `ARCHITECTURE.md`)
