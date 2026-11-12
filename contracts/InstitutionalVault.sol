// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title InstitutionalVault
/// @notice ERC-4626 vault with deposit fees, pause circuit breaker, and virtual-offset inflation defense.
/// @dev Fee preview / skim pattern follows OpenZeppelin's ERC-4626 fee guide:
///      https://docs.openzeppelin.com/contracts/5.x/erc4626
contract InstitutionalVault is ERC4626, AccessControl, Pausable {
    using Math for uint256;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant FEE_ADMIN_ROLE = keccak256("FEE_ADMIN_ROLE");

    uint256 private constant _BASIS_POINT_SCALE = 10_000;
    uint16 public constant MAX_DEPOSIT_FEE_BPS = 500;

    uint16 public depositFeeBps;
    address public feeRecipient;

    error InvalidAdmin();
    error InvalidFeeRecipient();
    error DepositFeeTooHigh(uint16 fee, uint16 max);

    event DepositFeeUpdated(uint16 oldFee, uint16 newFee);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin_,
        address feeRecipient_,
        uint16 depositFeeBps_
    ) ERC20(name_, symbol_) ERC4626(asset_) {
        if (admin_ == address(0)) revert InvalidAdmin();
        if (feeRecipient_ == address(0)) revert InvalidFeeRecipient();
        if (depositFeeBps_ > MAX_DEPOSIT_FEE_BPS) {
            revert DepositFeeTooHigh(depositFeeBps_, MAX_DEPOSIT_FEE_BPS);
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(FEE_ADMIN_ROLE, admin_);

        feeRecipient = feeRecipient_;
        depositFeeBps = depositFeeBps_;

        emit FeeRecipientUpdated(address(0), feeRecipient_);
        emit DepositFeeUpdated(0, depositFeeBps_);
    }

    /// @dev Virtual shares/assets offset — OZ inflation defense (δ = 3).
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    // === Admin ===

    function setDepositFeeBps(uint16 newFeeBps) external onlyRole(FEE_ADMIN_ROLE) {
        if (newFeeBps > MAX_DEPOSIT_FEE_BPS) {
            revert DepositFeeTooHigh(newFeeBps, MAX_DEPOSIT_FEE_BPS);
        }
        uint16 old = depositFeeBps;
        depositFeeBps = newFeeBps;
        emit DepositFeeUpdated(old, newFeeBps);
    }

    function setFeeRecipient(address newRecipient) external onlyRole(FEE_ADMIN_ROLE) {
        if (newRecipient == address(0)) revert InvalidFeeRecipient();
        address old = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(old, newRecipient);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // === Limits (circuit breaker) ===

    function maxDeposit(address receiver) public view override returns (uint256) {
        if (paused()) return 0;
        return super.maxDeposit(receiver);
    }

    function maxMint(address receiver) public view override returns (uint256) {
        if (paused()) return 0;
        return super.maxMint(receiver);
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        if (paused()) return 0;
        return super.maxWithdraw(owner);
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        if (paused()) return 0;
        return super.maxRedeem(owner);
    }

    // === Fee-aware previews (EIP-4626: preview MUST include fees; convert MUST NOT) ===

    function previewDeposit(uint256 assets) public view override returns (uint256) {
        uint256 fee = _feeOnTotal(assets, depositFeeBps);
        return super.previewDeposit(assets - fee);
    }

    function previewMint(uint256 shares) public view override returns (uint256) {
        uint256 assets = super.previewMint(shares);
        return assets + _feeOnRaw(assets, depositFeeBps);
    }

    // === Deposit / withdraw internals ===

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _requireNotPaused();

        uint256 fee = _feeOnTotal(assets, depositFeeBps);
        address recipient = feeRecipient;

        super._deposit(caller, receiver, assets, shares);

        if (fee > 0 && recipient != address(this)) {
            SafeERC20.safeTransfer(IERC20(asset()), recipient, fee);
        }
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        _requireNotPaused();
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // === Fee helpers (OZ ERC4626Fees formulas) ===

    /// @dev Fee to add on top of a raw amount (mint path).
    function _feeOnRaw(uint256 assets, uint256 feeBasisPoints) private pure returns (uint256) {
        return assets.mulDiv(feeBasisPoints, _BASIS_POINT_SCALE, Math.Rounding.Ceil);
    }

    /// @dev Fee portion inside an amount that already includes the fee (deposit path).
    function _feeOnTotal(uint256 assets, uint256 feeBasisPoints) private pure returns (uint256) {
        return assets.mulDiv(feeBasisPoints, feeBasisPoints + _BASIS_POINT_SCALE, Math.Rounding.Ceil);
    }
}
