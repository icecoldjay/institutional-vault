import { expect } from "chai";
import { deployVaultFixture, ethers, networkHelpers } from "./helpers/fixtures.js";

describe("InstitutionalVault — access & constructor", function () {
  async function fixture() {
    return deployVaultFixture({ depositFeeBps: 0 });
  }

  it("constructor reverts on zero admin", async function () {
    const { asset, feeTreasury } = await networkHelpers.loadFixture(fixture);
    await expect(
      ethers.deployContract("InstitutionalVault", [
        await asset.getAddress(),
        "X",
        "X",
        ethers.ZeroAddress,
        feeTreasury.address,
        0,
      ]),
    )
      .to.be.revertedWithCustomError(
        await ethers.getContractFactory("InstitutionalVault"),
        "InvalidAdmin",
      );
  });

  it("constructor reverts on zero feeRecipient", async function () {
    const { asset, admin } = await networkHelpers.loadFixture(fixture);
    const factory = await ethers.getContractFactory("InstitutionalVault");
    await expect(
      ethers.deployContract("InstitutionalVault", [
        await asset.getAddress(),
        "X",
        "X",
        admin.address,
        ethers.ZeroAddress,
        0,
      ]),
    )
      .to.be.revertedWithCustomError(factory, "InvalidFeeRecipient");
  });

  it("constructor reverts when depositFeeBps > 500", async function () {
    const { asset, admin, feeTreasury } = await networkHelpers.loadFixture(fixture);
    const factory = await ethers.getContractFactory("InstitutionalVault");
    await expect(
      ethers.deployContract("InstitutionalVault", [
        await asset.getAddress(),
        "X",
        "X",
        admin.address,
        feeTreasury.address,
        501,
      ]),
    )
      .to.be.revertedWithCustomError(factory, "DepositFeeTooHigh")
      .withArgs(501, 500);
  });

  it("setFeeRecipient(0) reverts InvalidFeeRecipient", async function () {
    const { vault, admin } = await networkHelpers.loadFixture(fixture);
    await expect(vault.connect(admin).setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      vault,
      "InvalidFeeRecipient",
    );
  });

  it("non-admin cannot grantRole", async function () {
    const { vault, alice, bob } = await networkHelpers.loadFixture(fixture);
    const feeRole = await vault.FEE_ADMIN_ROLE();
    const adminRole = await vault.DEFAULT_ADMIN_ROLE();
    await expect(vault.connect(alice).grantRole(feeRole, bob.address))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(alice.address, adminRole);
  });

  it("setDepositFeeBps emits DepositFeeUpdated", async function () {
    const { vault, admin } = await networkHelpers.loadFixture(fixture);
    await expect(vault.connect(admin).setDepositFeeBps(100))
      .to.emit(vault, "DepositFeeUpdated")
      .withArgs(0, 100);
  });
});
