import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

export { ethers, networkHelpers };

export const DEFAULT_FEE_BPS = 100; // 1%
export const MAX_FEE_BPS = 500;
export const DECIMALS_OFFSET = 3n;
export const VIRTUAL_SHARES = 10n ** DECIMALS_OFFSET; // 1000
export const VIRTUAL_ASSETS = 1n;

const FUND_AMOUNT = ethers.parseEther("10000000"); // large enough for bound-scale donations

export async function deployVaultFixture(opts?: {
  depositFeeBps?: number;
  feeRecipientIsVault?: boolean;
  feeRecipient?: string;
}) {
  const [admin, feeTreasury, alice, bob, attacker, other] = await ethers.getSigners();

  const asset = await ethers.deployContract("MockERC20", ["Mock USD", "mUSD"]);
  const depositFeeBps = opts?.depositFeeBps ?? DEFAULT_FEE_BPS;

  const vault = await ethers.deployContract("InstitutionalVault", [
    await asset.getAddress(),
    "Institutional Vault Share",
    "ivSHARE",
    admin.address,
    feeTreasury.address,
    depositFeeBps,
  ]);

  if (opts?.feeRecipientIsVault) {
    await vault.connect(admin).setFeeRecipient(await vault.getAddress());
  } else if (opts?.feeRecipient) {
    await vault.connect(admin).setFeeRecipient(opts.feeRecipient);
  }

  for (const user of [alice, bob, attacker, other, admin]) {
    await asset.mint(user.address, FUND_AMOUNT);
    await asset.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
  }

  return {
    asset,
    vault,
    admin,
    feeTreasury,
    alice,
    bob,
    attacker,
    other,
    depositFeeBps,
  };
}

/** Intentionally vulnerable vault for differential inflation proofs. */
export async function deployNaiveVaultFixture() {
  const [admin, , alice, bob, attacker, other] = await ethers.getSigners();

  const asset = await ethers.deployContract("MockERC20", ["Mock USD", "mUSD"]);
  const vault = await ethers.deployContract("NaiveVault", [
    await asset.getAddress(),
    "Naive Vault Share",
    "nvSHARE",
  ]);

  for (const user of [alice, bob, attacker, other, admin]) {
    await asset.mint(user.address, FUND_AMOUNT);
    await asset.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
  }

  return { asset, vault, admin, alice, bob, attacker, other };
}

/** feeOnTotal: ceil(assets * bps / (bps + 10000)) */
export function feeOnTotal(assets: bigint, bps: number): bigint {
  if (bps === 0) return 0n;
  const scale = 10_000n;
  const b = BigInt(bps);
  return (assets * b + (b + scale) - 1n) / (b + scale);
}

/** feeOnRaw: ceil(assets * bps / 10000) */
export function feeOnRaw(assets: bigint, bps: number): bigint {
  if (bps === 0) return 0n;
  const scale = 10_000n;
  const b = BigInt(bps);
  return (assets * b + scale - 1n) / scale;
}

/** OZ effective-rate floor deposit shares (fee-free). */
export function ozPreviewDepositShares(
  assets: bigint,
  totalSupply: bigint,
  totalAssets: bigint,
  offset: bigint = DECIMALS_OFFSET,
): bigint {
  const effectiveShares = totalSupply + 10n ** offset;
  const effectiveAssets = totalAssets + VIRTUAL_ASSETS;
  return (assets * effectiveShares) / effectiveAssets;
}

/** I6: sum of convertToAssets(balances) <= totalAssets */
export async function assertSolvency(
  vault: { convertToAssets: (s: bigint) => Promise<bigint>; balanceOf: (a: string) => Promise<bigint>; totalAssets: () => Promise<bigint> },
  holders: { address: string }[],
) {
  let claims = 0n;
  for (const h of holders) {
    const bal = await vault.balanceOf(h.address);
    if (bal > 0n) {
      claims += await vault.convertToAssets(bal);
    }
  }
  const assets = await vault.totalAssets();
  if (claims > assets) {
    throw new Error(`solvency broken: claims ${claims} > totalAssets ${assets}`);
  }
}
