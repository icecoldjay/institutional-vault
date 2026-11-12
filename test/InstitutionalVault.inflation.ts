import { expect } from "chai";
import {
  assertSolvency,
  deployNaiveVaultFixture,
  deployVaultFixture,
  ethers,
  networkHelpers,
  ozPreviewDepositShares,
  VIRTUAL_SHARES,
} from "./helpers/fixtures.js";
import {
  BOUND_SCALE_ATTACK,
  CLASSIC_ZEROING_ATTACK,
  poisonVault,
  runDonationAttack,
} from "./helpers/inflate.js";

describe("InstitutionalVault — inflation / donation attack defense", function () {
  async function secureFixture() {
    return deployVaultFixture({ depositFeeBps: 0 });
  }

  async function secureFeeFixture() {
    return deployVaultFixture({ depositFeeBps: 100 });
  }

  async function naiveFixture() {
    return deployNaiveVaultFixture();
  }

  // --- I4: differential — naive vault is broken under classic params ---

  it("I4 naive: classic donation zeros victim deposit and attacker captures value", async function () {
    const { vault, asset, attacker, alice: victim } = await networkHelpers.loadFixture(naiveFixture);
    const { seed, donation, victimAssets } = CLASSIC_ZEROING_ATTACK;

    await vault.connect(attacker).deposit(seed, attacker.address);
    await asset.connect(attacker).transfer(await vault.getAddress(), donation);

    // shares = U * supply / totalAssets = 1e18 * 1 / (1 + 1e18) → floors to 0
    expect(await vault.previewDeposit(victimAssets)).to.equal(0n);

    await vault.connect(victim).deposit(victimAssets, victim.address);
    expect(await vault.balanceOf(victim.address)).to.equal(0n);

    const attackerShares = await vault.balanceOf(attacker.address);
    const attackerOut = await vault
      .connect(attacker)
      .redeem.staticCall(attackerShares, attacker.address, attacker.address);
    // Attacker captures seed + donation + victim's donated assets
    expect(attackerOut).to.be.gte(seed + donation + victimAssets - 1n);
  });

  // --- I1 / I2 / I3 / I6: same classic params on defended vault ---

  it("I1–I2–I6 secure: classic params — victim shares > 0, attacker unprofitable, solvent", async function () {
    const { vault, asset, attacker, alice: victim } = await networkHelpers.loadFixture(secureFixture);
    const { seed, donation, victimAssets } = CLASSIC_ZEROING_ATTACK;

    await vault.connect(attacker).deposit(seed, attacker.address);
    await asset.connect(attacker).transfer(await vault.getAddress(), donation);

    const preview = await vault.previewDeposit(victimAssets);
    expect(preview).to.be.gt(0n, "I1: victim must receive shares");

    await vault.connect(victim).deposit(victimAssets, victim.address);
    expect(await vault.balanceOf(victim.address)).to.equal(preview);

    // I3 (meaningful recovery before attacker exits): claim is a large fraction of U
    const victimClaim = await vault.convertToAssets(preview);
    expect(victimClaim).to.be.gt(0n);
    expect(victimClaim).to.be.gte(victimAssets / 2n, "I3: victim not economically wiped");

    const attackerShares = await vault.balanceOf(attacker.address);
    const attackerOut = await vault
      .connect(attacker)
      .redeem.staticCall(attackerShares, attacker.address, attacker.address);
    await vault.connect(attacker).redeem(attackerShares, attacker.address, attacker.address);

    expect(attackerOut).to.be.lt(seed + donation, "I2: attack unprofitable vs capital committed");

    await assertSolvency(vault, [attacker, victim]);
  });

  it("I3 secure: clean deposit/redeem round-trip recovers ~all assets", async function () {
    const { vault, alice } = await networkHelpers.loadFixture(secureFixture);
    const U = ethers.parseEther("42");
    await vault.connect(alice).deposit(U, alice.address);
    const shares = await vault.balanceOf(alice.address);
    const out = await vault.previewRedeem(shares);
    expect(out).to.be.gte(U - 1n);
    expect(out).to.be.lte(U);
  });

  // --- I5: OZ effective-rate identity ---

  it("I5 secure: previewDeposit matches OZ effective-rate floor (empty vault)", async function () {
    const { vault } = await networkHelpers.loadFixture(secureFixture);
    const A = 1_000_000n;
    const expected = ozPreviewDepositShares(A, 0n, 0n);
    expect(expected).to.equal(A * VIRTUAL_SHARES); // A * 1000 / 1
    expect(await vault.previewDeposit(A)).to.equal(expected);
  });

  it("I5 secure: previewDeposit matches OZ effective-rate after bootstrap + donation", async function () {
    const { vault, asset, attacker } = await networkHelpers.loadFixture(secureFixture);
    await poisonVault({ vault, asset, attacker }, 1n, ethers.parseEther("5"));
    const A = ethers.parseEther("1");
    const supply = await vault.totalSupply();
    const assets = await vault.totalAssets();
    expect(await vault.previewDeposit(A)).to.equal(ozPreviewDepositShares(A, supply, assets));
  });

  // --- Bound-scale donation (OZ 10**δ * U commentary) ---

  it("secure: bound-scale donation (~10**δ * U) still fails to zero victim", async function () {
    const { vault, asset, attacker, alice: victim } = await networkHelpers.loadFixture(secureFixture);
    const result = await runDonationAttack(
      { vault, asset, attacker, victim },
      BOUND_SCALE_ATTACK,
    );

    expect(result.victimShares).to.be.gt(0n, "still nonzero shares at OZ-scale donation");
    expect(result.attackerOut).to.be.lt(result.committed, "I2 at bound scale");
    expect(result.victimRedeemable).to.be.gt(0n);
    await assertSolvency(vault, [attacker, victim]);
  });

  // --- Fee × inflation ---

  it("secure + fee: classic attack still leaves victim shares; attacker unprofitable", async function () {
    const { vault, asset, attacker, alice: victim, feeTreasury } =
      await networkHelpers.loadFixture(secureFeeFixture);
    const { seed, donation, victimAssets } = CLASSIC_ZEROING_ATTACK;

    await vault.connect(attacker).deposit(seed, attacker.address);
    await asset.connect(attacker).transfer(await vault.getAddress(), donation);

    const treasuryBefore = await asset.balanceOf(feeTreasury.address);
    const preview = await vault.previewDeposit(victimAssets);
    expect(preview).to.be.gt(0n);

    await vault.connect(victim).deposit(victimAssets, victim.address);
    expect(await asset.balanceOf(feeTreasury.address)).to.be.gt(treasuryBefore);

    const attackerShares = await vault.balanceOf(attacker.address);
    const attackerOut = await vault
      .connect(attacker)
      .redeem.staticCall(attackerShares, attacker.address, attacker.address);
    expect(attackerOut).to.be.lt(seed + donation);
  });
});
