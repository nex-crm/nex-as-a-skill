# PR 15: Setup Scan and Compounding

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-15-setup-scan-and-compounding`
- Size target: `<500` changed lines
- Upstream PRs: `00`, `07`, `14`
- Downstream PRs: `19`

## Goal

Restore the published package setup-time scan and compounding behavior.

In `0.1.68`, setup did more than install config. It could scan files, report what happened, and trigger background compounding after meaningful scan work.

## Scope

- run a scan step at the end of setup
- support `--no-scan`
- report scan counts, skips, and errors in setup output
- trigger compounding only after a meaningful successful scan

## Out of Scope

- general scan command redesign
- new compounding backend behavior
- release changes

## Files Likely Touched

- `ts/src/features/config/handlers.ts`
- `ts/src/features/config/setup.ts`
- `ts/src/features/context/handlers.ts` or shared scan helpers
- `ts/src/lib/file-scanner.ts`
- maybe a new small compounding helper file

## Implementation Plan

1. Reuse existing scan helpers instead of duplicating scan logic inside setup.
2. Mirror the package flow:
   - install and config steps complete
   - scan runs unless skipped
   - compounding triggers only on meaningful scan output
3. Make scan failure handling explicit so setup can surface partial completion correctly.
4. Add tests for skip, empty scan, meaningful scan, and compounding trigger gating.

## Validation

- setup runs a scan by default
- `--no-scan` skips it
- setup output reports scan results clearly
- compounding triggers only after a meaningful successful scan
