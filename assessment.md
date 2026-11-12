CAPITALSAGE ENGINEERING RECRUITMENT ASSESSMENT
Take-Home Technical Assessment: Senior Blockchain
Engineer
Role: Senior Blockchain
Engineer
Time Estimate: 2–3
Hours
Window: 48–72
Hours
Format: Private Git
Repository
1. Overview & Objective
This assessment is designed to respect your time while giving our team clear signal on your core Solidity skills, EVM
security instincts, and testing hygiene. You are asked to build a secure, lightweight ERC-4626 Tokenized Vault with
basic access control and an inflation defense mechanism.
2. Core Task: Capped Institutional Vault (Solidity)
Implement a clean, production-ready contract ( InstitutionalVault.sol ) using Foundry or Hardhat:
ERC-4626 Standard: Implement standard vault functionality based on OpenZeppelin v5 or Solady contracts
accepting an ERC-20 underlying asset.
Inflation & Frontrunning Defense: Protect against the first-depositor share manipulation / donation attack (using
virtual shares/offset or initial dead-shares burn).
Configurable Deposit Fee: Add an admin-controlled deposit fee in basis points (bps) capped at a maximum of 500
bps (5%). Collected fees should remain in the vault or route to a fee recipient address.
Emergency Circuit Breaker: Integrate Pausable and role-based access control to allow pausing
deposits/withdrawals during incidents.
3. Testing & Verification Requirements
Provide a straightforward test suite validating the contract's critical paths:
Standard Flows: Unit tests covering deposit, mint, withdraw, and redeem logic along with fee deduction correctness.
Exploit Defense Test: A dedicated test demonstrating that your vault successfully prevents or neutralizes the firstdepositor inflation exploit.
Edge Cases: Verify zero-amount inputs, pause restrictions, and rounding behavior favoring the vault.
4. Required Deliverable: Architecture Document (ARCHITECTURE.md)
In addition to your code, provide a dedicated architecture document (or PDF) addressing the following:
System & Accounting Flow: A high-level description or diagram showing how assets and shares flow through the
vault, including deposit fee deductions and yield accounting.
Threat Modeling & Mitigation: Detailed rationale on how you mitigated the first-depositor inflation attack, potential
share dilution edge cases, and arithmetic rounding protections.
Production Readiness & Upgradeability: Explain your chosen upgradeability pattern (e.g., UUPS vs. Transparent
Proxy) for institutional deployment, storage collision prevention, and operational emergency controls.
Runbook: Single-command setup to install dependencies, run the test suite, and verify gas benchmarks.
5. Evaluation Criteria
Focus Area Weight What We Look For
Smart Contract Craft 40% Clean, readable Solidity; precise rounding; correct ERC-4626
math; gas consciousness.
Architecture & Threat Model 30% Clarity and depth in ARCHITECTURE.md , systemic thinking, and
defensible security trade-offs.
Security & Exploit Defense 20% Robust first-depositor mitigation, access controls, and thoughtful
exploit tests.
CapitalSage • Engineering Recruitment & Assessment Brief Page 1 of 2
Focus Area Weight What We Look For
Testing & Developer UX 10% Green test suite running with one command; clean git hygiene
and instructions.
6. Submission Instructions
Push your solution (contracts, test suite, and ARCHITECTURE.md ) to a private GitHub or GitLab repository and invite
our engineering team. We will review your submission and follow up with a focused 30-minute architectural and code
walkthrough.
CapitalSage • Engineering Recruitment & Assessment Brief Page 2 of 2