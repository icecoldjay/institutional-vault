import { expect } from "chai";
import { deployVaultFixture, ethers, feeOnTotal, networkHelpers } from "./helpers/fixtures.js";

describe("InstitutionalVault — standard flows", function () {
  async function fixture() {
    return deployVaultFixture({ depositFeeBps: 100 });
  }

  it("deposit pulls assets, mints shares to receiver, emits Deposit", async function () {
    const { vault, asset, alice, bob, depositFeeBps } = await networkHelpers.loadFixture(fixture);

    const assets = ethers.parseEther("1000");
    const expectedFee = feeOnTotal(assets, depositFeeBps);
    const preview = await vault.previewDeposit(assets);
    const aliceBefore = await asset.balanceOf(alice.address);

    await expect(vault.connect(alice).deposit(assets, bob.address))
      .to.emit(vault, "Deposit")
      .withArgs(alice.address, bob.address, assets, preview);

    expect(await vault.balanceOf(bob.address)).to.equal(preview);
    expect(await asset.balanceOf(alice.address)).to.equal(aliceBefore - assets);

    // Shares reflect assets net of fee (convert ignores fees → larger than preview)
    expect(await vault.convertToShares(assets)).to.be.gt(preview);
    expect(preview).to.equal(await vault.convertToShares(assets - expectedFee));
  });

  it("mint charges previewMint assets and mints exact shares", async function () {
    const { vault, asset, alice } = await networkHelpers.loadFixture(fixture);

    const shares = ethers.parseEther("500");
    // Share decimals = asset decimals + offset(3); use share units carefully.
    // After first deposit to bootstrap non-empty rate:
    await vault.connect(alice).deposit(ethers.parseEther("10000"), alice.address);

    const sharesToMint = await vault.balanceOf(alice.address) / 10n;
    const assetsDue = await vault.previewMint(sharesToMint);
    const aliceAssetBefore = await asset.balanceOf(alice.address);

    const assetsPaid = await vault.connect(alice).mint.staticCall(sharesToMint, alice.address);
    expect(assetsPaid).to.equal(assetsDue);

    await vault.connect(alice).mint(sharesToMint, alice.address);
    expect(await asset.balanceOf(alice.address)).to.equal(aliceAssetBefore - assetsDue);
  });

  it("withdraw returns exact assets and burns previewWithdraw shares", async function () {
    const { vault, asset, alice } = await networkHelpers.loadFixture(fixture);

    await vault.connect(alice).deposit(ethers.parseEther("5000"), alice.address);
    const assetsOut = ethers.parseEther("1000");
    const sharesNeeded = await vault.previewWithdraw(assetsOut);
    const sharesBefore = await vault.balanceOf(alice.address);
    const assetBefore = await asset.balanceOf(alice.address);

    await expect(vault.connect(alice).withdraw(assetsOut, alice.address, alice.address))
      .to.emit(vault, "Withdraw")
      .withArgs(alice.address, alice.address, alice.address, assetsOut, sharesNeeded);

    expect(await vault.balanceOf(alice.address)).to.equal(sharesBefore - sharesNeeded);
    expect(await asset.balanceOf(alice.address)).to.equal(assetBefore + assetsOut);
  });

  it("redeem burns exact shares and returns previewRedeem assets", async function () {
    const { vault, asset, alice } = await networkHelpers.loadFixture(fixture);

    await vault.connect(alice).deposit(ethers.parseEther("5000"), alice.address);
    const shares = (await vault.balanceOf(alice.address)) / 4n;
    const assetsOut = await vault.previewRedeem(shares);
    const assetBefore = await asset.balanceOf(alice.address);

    await vault.connect(alice).redeem(shares, alice.address, alice.address);
    expect(await asset.balanceOf(alice.address)).to.equal(assetBefore + assetsOut);
  });

  it("previewDeposit matches deposit return in the same state", async function () {
    const { vault, alice } = await networkHelpers.loadFixture(fixture);
    const assets = ethers.parseEther("250");
    const preview = await vault.previewDeposit(assets);
    const shares = await vault.connect(alice).deposit.staticCall(assets, alice.address);
    expect(shares).to.equal(preview);
  });

  it("approved spender can withdraw/redeem on behalf of owner", async function () {
    const { vault, asset, alice, bob } = await networkHelpers.loadFixture(fixture);

    await vault.connect(alice).deposit(ethers.parseEther("5000"), alice.address);
    const shares = (await vault.balanceOf(alice.address)) / 2n;
    await vault.connect(alice).approve(bob.address, shares);

    const assetsOut = await vault.previewRedeem(shares);
    const bobAssetBefore = await asset.balanceOf(bob.address);

    await vault.connect(bob).redeem(shares, bob.address, alice.address);

    expect(await asset.balanceOf(bob.address)).to.equal(bobAssetBefore + assetsOut);
    expect(await vault.allowance(alice.address, bob.address)).to.equal(0n);
  });

  it("unauthorized spender cannot redeem owner's shares", async function () {
    const { vault, alice, bob } = await networkHelpers.loadFixture(fixture);
    await vault.connect(alice).deposit(ethers.parseEther("1000"), alice.address);
    const shares = await vault.balanceOf(alice.address);
    await expect(vault.connect(bob).redeem(shares, bob.address, alice.address)).to.revert(ethers);
  });
});
