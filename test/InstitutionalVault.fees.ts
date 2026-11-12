import { expect } from "chai";
import {
  DEFAULT_FEE_BPS,
  deployVaultFixture,
  ethers,
  feeOnRaw,
  feeOnTotal,
  MAX_FEE_BPS,
  networkHelpers,
} from "./helpers/fixtures.js";

async function fixtureZeroFee() {
  return deployVaultFixture({ depositFeeBps: 0 });
}

async function fixtureDefaultFee() {
  return deployVaultFixture({ depositFeeBps: DEFAULT_FEE_BPS });
}

async function fixtureMaxFee() {
  return deployVaultFixture({ depositFeeBps: MAX_FEE_BPS });
}

async function fixtureFeeRetained() {
  return deployVaultFixture({ depositFeeBps: 100, feeRecipientIsVault: true });
}

describe("InstitutionalVault — fees", function () {
  it("zero fee matches unfee'd conversion for deposit preview", async function () {
    const { vault, alice } = await networkHelpers.loadFixture(fixtureZeroFee);
    const assets = ethers.parseEther("1000");
    expect(await vault.previewDeposit(assets)).to.equal(await vault.convertToShares(assets));
    await vault.connect(alice).deposit(assets, alice.address);
  });

  it("100 bps deposit routes fee to external recipient", async function () {
    const { vault, asset, alice, feeTreasury, depositFeeBps } =
      await networkHelpers.loadFixture(fixtureDefaultFee);

    const assets = ethers.parseEther("1000");
    const fee = feeOnTotal(assets, depositFeeBps);
    const treasuryBefore = await asset.balanceOf(feeTreasury.address);

    await vault.connect(alice).deposit(assets, alice.address);

    expect(await asset.balanceOf(feeTreasury.address)).to.equal(treasuryBefore + fee);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(assets - fee);
  });

  it("500 bps max fee is accepted and charged", async function () {
    const { vault, asset, alice, feeTreasury } = await networkHelpers.loadFixture(fixtureMaxFee);
    const assets = ethers.parseEther("2000");
    const fee = feeOnTotal(assets, MAX_FEE_BPS);
    const before = await asset.balanceOf(feeTreasury.address);
    await vault.connect(alice).deposit(assets, alice.address);
    expect(await asset.balanceOf(feeTreasury.address)).to.equal(before + fee);
  });

  it("feeRecipient == vault retains fee in totalAssets (NAV up for existing holders)", async function () {
    const { vault, asset, alice, bob } = await networkHelpers.loadFixture(fixtureFeeRetained);

    await vault.connect(alice).deposit(ethers.parseEther("10000"), alice.address);
    const aliceShares = await vault.balanceOf(alice.address);
    const aliceAssetsBeforeBob = await vault.convertToAssets(aliceShares);

    const bobAssets = ethers.parseEther("10000");
    const fee = feeOnTotal(bobAssets, 100);
    await vault.connect(bob).deposit(bobAssets, bob.address);

    expect(await asset.balanceOf(await vault.getAddress())).to.equal(
      ethers.parseEther("10000") + bobAssets,
    );

    // Retained fee raises Alice's claim (virtual shares capture some; not 1:1 with fee)
    const aliceAssetsAfter = await vault.convertToAssets(aliceShares);
    expect(aliceAssetsAfter).to.be.gt(aliceAssetsBeforeBob);
    expect(aliceAssetsAfter - aliceAssetsBeforeBob).to.be.gt(0n);
    expect(aliceAssetsAfter - aliceAssetsBeforeBob).to.be.lte(fee);
  });

  it("previewMint includes deposit fee (greater than fee-free convertToAssets)", async function () {
    const { vault, alice } = await networkHelpers.loadFixture(fixtureDefaultFee);
    await vault.connect(alice).deposit(ethers.parseEther("10000"), alice.address);
    const shares = (await vault.balanceOf(alice.address)) / 20n;
    const preview = await vault.previewMint(shares);
    expect(preview).to.be.gt(await vault.convertToAssets(shares));
    const paid = await vault.connect(alice).mint.staticCall(shares, alice.address);
    expect(paid).to.equal(preview);
  });

  it("setDepositFeeBps(501) reverts DepositFeeTooHigh", async function () {
    const { vault, admin } = await networkHelpers.loadFixture(fixtureZeroFee);
    await expect(vault.connect(admin).setDepositFeeBps(501))
      .to.be.revertedWithCustomError(vault, "DepositFeeTooHigh")
      .withArgs(501, 500);
  });

  it("unauthorized fee change reverts AccessControlUnauthorizedAccount", async function () {
    const { vault, alice } = await networkHelpers.loadFixture(fixtureZeroFee);
    const feeAdminRole = await vault.FEE_ADMIN_ROLE();
    await expect(vault.connect(alice).setDepositFeeBps(100))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(alice.address, feeAdminRole);
  });

  it("mint path charges at least ideal assets plus feeOnRaw(ideal)", async function () {
    const { vault, alice } = await networkHelpers.loadFixture(fixtureDefaultFee);
    await vault.connect(alice).deposit(ethers.parseEther("50000"), alice.address);
    const toMint = (await vault.balanceOf(alice.address)) / 100n;
    const paid = await vault.previewMint(toMint);
    const ideal = await vault.convertToAssets(toMint);
    const rawFee = feeOnRaw(ideal, 100);
    expect(paid).to.be.gte(ideal + rawFee);
  });

  it("I7: convertToShares >= previewDeposit for fee bps in {0,1,100,500}", async function () {
    const { vault, admin, alice } = await networkHelpers.loadFixture(fixtureZeroFee);
    const assets = ethers.parseEther("1000");

    for (const bps of [0, 1, 100, 500]) {
      await vault.connect(admin).setDepositFeeBps(bps);
      const convert = await vault.convertToShares(assets);
      const preview = await vault.previewDeposit(assets);
      if (bps === 0) {
        expect(preview).to.equal(convert);
      } else {
        expect(convert).to.be.gte(preview);
        expect(preview).to.be.lt(convert);
      }
      // preview matches live deposit quote after fee change
      expect(await vault.connect(alice).deposit.staticCall(assets, alice.address)).to.equal(preview);
    }
  });
});
