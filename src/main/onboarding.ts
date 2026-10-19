import type { OnboardingState, UserRole } from '../shared/contract';
import { readSettings, writeSettings, type Settings } from './settings';

function toState({ onboardingCompleted, role }: Settings): OnboardingState {
  return { completed: onboardingCompleted, role };
}

export function getOnboardingState(): OnboardingState {
  return toState(readSettings());
}

export function completeOnboarding(role: UserRole): OnboardingState {
  return toState(writeSettings({ onboardingCompleted: true, role }));
}

export function resetOnboarding(): OnboardingState {
  return toState(writeSettings({ onboardingCompleted: false }));
}
