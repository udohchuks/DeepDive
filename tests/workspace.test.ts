import { describe, it, expect } from 'vitest';
import { checkDependencyCycles } from '../scripts/check_cycles.js';
import { checkDocs } from '../scripts/check_docs.js';
import { PACKAGE_NAME as coreName } from '@deepdive/core';
import { PACKAGE_NAME as storageName } from '@deepdive/storage';
import { PACKAGE_NAME as sandboxName } from '@deepdive/policy';
import { PACKAGE_NAME as providerName } from '@deepdive/provider';
import { PACKAGE_NAME as agentName } from '@deepdive/agent';
import { PACKAGE_NAME as vcsName } from '@deepdive/vcs';
import { PACKAGE_NAME as contentName } from '@deepdive/content';
import { PACKAGE_NAME as engineName } from '@deepdive/engine';
import { PACKAGE_NAME as greenfieldName } from '@deepdive/greenfield';
import { PACKAGE_NAME as onboardingName } from '@deepdive/onboarding';
import { APP_NAME as extensionName } from '@deepdive/vscode-extension';

describe('Workspace & Monorepo Foundation (Phase 0.1)', () => {
  it('should resolve all ten packages and the extension app by their @deepdive/* package names', () => {
    expect(coreName).toBe('@deepdive/core');
    expect(storageName).toBe('@deepdive/storage');
    expect(sandboxName).toBe('@deepdive/policy');
    expect(providerName).toBe('@deepdive/provider');
    expect(agentName).toBe('@deepdive/agent');
    expect(vcsName).toBe('@deepdive/vcs');
    expect(contentName).toBe('@deepdive/content');
    expect(engineName).toBe('@deepdive/engine');
    expect(greenfieldName).toBe('@deepdive/greenfield');
    expect(onboardingName).toBe('@deepdive/onboarding');
    expect(extensionName).toBe('@deepdive/vscode-extension');
  });

  it('should have zero dependency cycles in the package graph', () => {
    const cycleCheck = checkDependencyCycles();
    expect(cycleCheck.hasCycles, `Cycle errors: ${cycleCheck.cycleDetails.join(', ')}`).toBe(false);
    expect(cycleCheck.cycleDetails).toEqual([]);
  });

  it('should pass doc lint check for documentation presence', () => {
    const docCheck = checkDocs();
    expect(docCheck.valid, `Doc errors: ${docCheck.errors.join(', ')}`).toBe(true);
  });
});
