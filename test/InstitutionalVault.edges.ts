import { expect } from "chai";
import {
  assertSolvency,
  deployVaultFixture,
  ethers,
  networkHelpers,
} from "./helpers/fixtures.js";

describe("InstitutionalVault — edge cases", function () {
  async function fixture() {
    return deployVaultFixture({ depositFeeBps: 0 });
  }

  async function feeFixture() {
    return deployVaultFixture({ depositFeeBps: 100 });
  }

  it("zero-asset deposit returns zero shares (and is a no-op economically)", async function () {
    const { vault, alice, asset } = await networkHelpers.loadFixture(fixture);
    const before = await asset.balanceOf(alice.address);
    const shares = await vault.connect(alice).deposit.staticCall(0n, alice.address);
    expect(shares).to.equal(0n);
    await vault.connect(alice).deposit(0n, alice.address);
    expect(await asset.balanceOf(alice.address)).to.equal(before);
    expect(await vault.balanceOf(alice.address)).to.equal(0n);
  });

  it("rounding favors the vault on deposit then full redeem", async function () {
    const { vault, asset, alice } = await networkHelpers.loadFixture(fixture);

    const deposited = ethers.parseEther("1234") + 7n; // awkward amount
    await vault.connect(alice).deposit(deposited, alice.address);
    const shares = await vault.balanceOf(alice.address);
    const redeemed = await vault.connect(alice).redeem.staticCall(shares, alice.address, alice.address);
    await vault.connect(alice).redeem(shares, alice.address, alice.address);

    // User cannot extract more than deposited (no yield); dust may remain in vault
    expect(redeemed).to.be.lte(deposited);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(deposited - redeemed);
  });

  it("tiny deposit after donation still mints shares thanks to offset", async function () {
    const { vault, asset, alice, attacker } = await networkHelpers.loadFixture(fixture);

    await vault.connect(attacker).deposit(1n, attacker.address);
    await asset.connect(attacker).transfer(await vault.getAddress(), ethers.parseEther("1000"));

    const tiny = ethers.parseEther("1");
    const shares = await vault.connect(alice).deposit.staticCall(tiny, alice.address);
    expect(shares).to.be.gt(0n);
    await vault.connect(alice).deposit(tiny, alice.address);
  });

  it("I6 multi-user solvency with awkward amounts (fee=0)", async function () {
    const { vault, alice, bob } = await networkHelpers.loadFixture(fixture);
    await vault.connect(alice).deposit(ethers.parseEther("1234") + 7n, alice.address);
    await vault.connect(bob).deposit(ethers.parseEther("99") + 1n, bob.address);
    await assertSolvency(vault, [alice, bob]);
  });

  it("I6 multi-user solvency with deposit fees", async function () {
    const { vault, alice, bob } = await networkHelpers.loadFixture(feeFixture);
    await vault.connect(alice).deposit(ethers.parseEther("5000") + 3n, alice.address);
    await vault.connect(bob).deposit(ethers.parseEther("777") + 9n, bob.address);
    await assertSolvency(vault, [alice, bob]);
  });
});
