import { analytics } from '@heycatch/sdk';

// HeyCatch on the server (https://heycatch.ai/agents.md, step 3). The package
// resolves its node build here. Initialized once at module scope for the
// whole server bundle; the browser side has its own init in src/main.tsx.
// Server calls send immediately and never throw; every one needs the user id
// (the Firebase uid, the same id the browser passes), because there is no
// ambient person in a webhook. The key is publishable.
analytics.init({ projectKey: 'hck_pk_X3i5WmitT5F42yX_weMf1PIith45MDeK' });

export { analytics };
