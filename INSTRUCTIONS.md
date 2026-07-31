# Infrastructure Implementation Instructions

These instructions detail the required setup for backend APIs, Webhooks, and services (RevenueCat, Gemini API, FCM, Sign In With Apple) so that engineering can enable the full application functionality.

## 1. RevenueCat (In-App Purchases & Subscriptions)

To process iOS and Android subscriptions securely, implement RevenueCat rather than Stripe.

### Steps:
1. **Create RevenueCat Project**: Sign up for RevenueCat, create a project, and add your iOS (App Store Connect) and Android (Google Play Console) apps.
2. **Configure Products & Entitlements**: Create a product/entitlement for `premium` in the RevenueCat dashboard.
3. **Set Up Firebase Extension (Optional but Recommended)**: Use the official RevenueCat Firebase extension (`Run Payments with RevenueCat`). This automatically syncs subscription status to Firestore.
4. **Backend Webhooks**: If not using the extension, configure a webhook in RevenueCat to point to your backend (e.g., `POST /api/webhooks/revenuecat`).
   - Listen for `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, and `EXPIRATION` events.
   - On receipt of a webhook, update the `subscriptionStatus` field on the corresponding user's document in the `users` Firestore collection.
5. **Client Implementation**: Ensure the frontend/mobile client initializes the RevenueCat SDK (`Purchases.configure({ apiKey: 'YOUR_API_KEY' })`) and triggers `Purchases.purchasePackage()` when the user clicks "Upgrade".

## 2. Gemini Multimodal API (Receipt Scanning)

To implement the AI-powered receipt scanning:

### Steps:
1. **Google Cloud Console**: Enable the **Gemini API** in your Google Cloud Project.
2. **Environment Variable**: Ensure the `GEMINI_API_KEY` is securely stored in your backend environment (do not expose it to the client).
3. **Backend Route**: In `server.ts`, update the `/api/scan-receipt` endpoint:
   - Accept a base64 encoded image or multipart form upload from the client.
   - Use the `@google/genai` SDK to call `gemini-2.5-flash`.
   - Pass the image and a prompt (e.g., "Extract the total amount, date, and description from this receipt. Return ONLY valid JSON with keys: 'amount' (number), 'description' (string), and 'date' (YYYY-MM-DD).").
   - Parse the response and return it to the frontend to pre-fill the form.

## 3. Firebase Cloud Messaging (FCM) API

For push notifications (e.g., when a user is added to a group or an expense is settled):

### Steps:
1. **Firebase Console**: Ensure Cloud Messaging is enabled in the Firebase Console under Project Settings -> Cloud Messaging.
2. **Generate VAPID Key**: For web push notifications, generate a Web Push certificate (VAPID key) in Firebase Console.
3. **Client Setup**: Update the frontend to request notification permissions via `Notification.requestPermission()`.
   - Use `getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' })` to get the device token.
   - Save the FCM device token in the user's Firestore document.
4. **Backend Trigger**: Create a Firebase Cloud Function or an endpoint in `server.ts` that triggers when a new notification event occurs.
   - Use `firebase-admin` to send messages to the stored device tokens: `admin.messaging().sendToDevice(token, payload)`.

## 4. Sign in with Apple

To allow iOS users to sign in seamlessly with Apple:

### Steps:
1. **Apple Developer Portal**: 
   - Register an App ID with "Sign In with Apple" capability enabled.
   - Create a Services ID (used for web authentication).
   - Generate a private key for Sign In with Apple (download the `.p8` file).
2. **Firebase Console**:
   - Go to Authentication -> Sign-in method.
   - Enable "Apple" as a provider.
   - Fill in the Services ID, Team ID, Key ID, and upload the private key you generated.
3. **Web Client Implementation**: Add the `OAuthProvider` for `apple.com` in your authentication code.
   - `const provider = new OAuthProvider('apple.com');`
   - `signInWithPopup(auth, provider);`
4. **iOS Client Implementation**: Ensure the native iOS bundle ID is registered in Firebase and Apple Developer console. The Firebase iOS SDK will handle the native Sign In with Apple flow automatically.


## 5. Gemini API (Check Your Cherries Report)

To implement the "Check Your Cherries" relationship financial assessment:

### Steps:
1. **API Keys**: Ensure `GEMINI_API_KEY` is set in your server environment variables.
2. **Backend Route**: Complete the `/api/check-your-cherries` route in `server.ts`.
3. **Data Assembly**: Receive the group's expenses, mismatch analytics data, and member income ratios.
4. **AI Prompting**: Construct a system prompt for `gemini-2.5-flash` passing the financial data. Ask the model to return a structured markdown report analyzing:
   - Who is fronting cash vs credit (using the mismatch data).
   - If the expense splitting aligns with their stated income ratio.
   - Suggestions on how to fairly adjust their default splitting percentages.
5. **Return & Render**: Return the generated string to the `FinancialAssessment` component, which renders it using markdown formatting.
