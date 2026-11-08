// Business events for HeyCatch (https://heycatch.ai/agents.md step 3). The
// SDK is initialised in main.tsx; this is the one place the browser side
// names an event, so the list below is the whole contract shared with the
// Flutter app (docs/REBUILD_PLAN.md section 11 in the mobile repo). Never a
// name, an amount or a handle in the properties.
import { analytics } from '@heycatch/sdk';

export type BusinessEvent =
  | { name: 'assessment_skipped' }
  | { name: 'household_quiz_completed'; group_kind: string }
  | { name: 'invite_sent'; channel: 'share' | 'email' | 'sms' | 'code' }
  | { name: 'handoff_opened'; handoff: string };

export function track(event: BusinessEvent): void {
  try {
    const { name, ...props } = event as { name: string } & Record<string, string>;
    analytics.trackEvent(name, props);
  } catch {
    // Analytics never blocks the app.
  }
}
