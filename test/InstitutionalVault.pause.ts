import { expect } from "chai";
import { deployVaultFixture, ethers, networkHelpers } from "./helpers/fixtures.js";

describe("InstitutionalVault — pause", function () {
  async function fixture() {
    return deployVaultFixture({ depositFeeBps: 0 });
  }

  it("pause blocks deposit/mint/withdraw/redeem with ERC4626ExceededMax*", async function () {
    const { vault, admin, alice } = await networkHelpers.loadFixture(fixture);

    await vault.connect(alice).deposit(ethers.parseEther("1000"), alice.address);
    await vault.connect(admin).pause();

    // OZ public entrypoints check max* before _deposit/_withdraw
    await expect(vault.connect(alice).deposit(ethers.parseEther("1"), alice.address))
      .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxDeposit")
      .withArgs(alice.address, ethers.parseEther("1"), 0n);

    await expect(vault.connect(alice).mint(1n, alice.address))
      .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxMint")
      .withArgs(alice.address, 1n, 0n);

    await expect(vault.connect(alice).withdraw(ethers.parseEther("1"), alice.address, alice.address))
      .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxWithdraw")
      .withArgs(alice.address, ethers.parseEther("1"), 0n);

    await expect(vault.connect(alice).redeem(1n, alice.address, alice.address))
      .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxRedeem")
      .withArgs(alice.address, 1n, 0n);
  });

  it("maxDeposit/maxMint/maxWithdraw/maxRedeem return 0 while paused", async function () {
    const { vault, admin, alice } = await networkHelpers.loadFixture(fixture);
    await vault.connect(admin).pause();
    expect(await vault.maxDeposit(alice.address)).to.equal(0n);
    expect(await vault.maxMint(alice.address)).to.equal(0n);
    expect(await vault.maxWithdraw(alice.address)).to.equal(0n);
    expect(await vault.maxRedeem(alice.address)).to.equal(0n);
  });

  it("non-pauser cannot pause", async function () {
    const { vault, alice } = await networkHelpers.loadFixture(fixture);
    const pauserRole = await vault.PAUSER_ROLE();
    await expect(vault.connect(alice).pause())
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(alice.address, pauserRole);
  });

  it("unpause restores deposit flow", async function () {
    const { vault, admin, alice } = await networkHelpers.loadFixture(fixture);
    await vault.connect(admin).pause();
    await vault.connect(admin).unpause();
    await vault.connect(alice).deposit(ethers.parseEther("10"), alice.address);
    expect(await vault.balanceOf(alice.address)).to.be.gt(0n);
  });
});
