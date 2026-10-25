# Meta Development App Setup Guide

Use this guide to create a development-only Meta app for the official WhatsApp Cloud API.
Do not paste credentials into chat, source code, documentation examples, tests, or Git.

## 1. Create the owner accounts

1. Sign in at [Meta for Developers](https://developers.facebook.com/).
2. Create or select the company Business Portfolio at [Meta Business Suite](https://business.facebook.com/).
3. Use the account and Business Portfolio that will own the application long term.

## 2. Create the development app

1. Open [My Apps](https://developers.facebook.com/apps/).
2. Select **Create App**.
3. Choose the available business-oriented use case/type.
4. Name it clearly, for example `WhatsApp SaaS Dev`.
5. Associate it with the Business Portfolio and finish creation.
6. Keep the app in **Development** mode until production release preparation.

## 3. Add WhatsApp Cloud API

1. In the app dashboard, open **Add products**.
2. Find **WhatsApp** and select **Set up**.
3. Open **WhatsApp -> API Setup** or **Getting Started**.
4. Record the test WhatsApp Business Account, test phone number, and phone-number ID shown by Meta for later development work.
5. Add your own phone number as an allowed test recipient and complete Meta's verification code.

Meta's current Cloud API onboarding reference is available in the [official Meta WhatsApp Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api).

## 4. App roles

1. Open **App roles** in the Meta app dashboard.
2. Confirm that the owner account is an Administrator.
3. Add only trusted development accounts as Developer or Tester.

## 5. Store local development values safely

Create a repository-root `.env` file locally from `.env.example`. This file is ignored by Git.
Add the values from the Meta dashboard only to this local file:

```env
META_GRAPH_API_VERSION=vXX.X
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_WEBHOOK_VERIFY_TOKEN=your_long_random_value
# Add only when testing account synchronization in TASK-033 or later.
META_DEVELOPMENT_ACCESS_TOKEN=your_temporary_development_token
```

Use the Graph API version Meta displays for the app; do not guess a version. Generate the webhook verification token yourself as a long random value.

When connecting the development test account, use the literal reference
`env://META_DEVELOPMENT_ACCESS_TOKEN` as `secret_ref`; the API resolves this reference
only on the server. It never accepts a raw provider token in a request and never returns
the token. Leave the variable empty until you are ready to test Meta synchronization.

For Railway, enter the same environment-specific values in Railway service variables. Never commit provider credentials to Git.

## 6. Defer Embedded Signup until TASK-032

Do not configure client Embedded Signup yet. It needs HTTPS routes, app configuration, and later permission/app-review work. Meta's Embedded Signup reference states that released apps need the relevant Advanced Access permissions, including `business_management` and `whatsapp_business_management`.

See [Meta's Embedded Signup collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup).

## Safe handoff checklist

### Railway trial isolation — CLAR-060 / 2026-10-18

Update CLAR-061: owner chose reusing the existing local Meta development app values for the
initial Railway test deployment instead of a separate app. The separate-app recommendation
below is historical, not a prerequisite. Local .env remains unchanged; copy required values
manually to server variables only. No access token/webhook/send or production approval implied.

Owner approved the recommended separate Meta development app for Railway testing, leaving
the existing local development app/configuration unchanged. Suggested name: WhatsApp SaaS
Railway Test. Use the dashboard's currently available WhatsApp business use case; labels can
change. Keep development mode and Meta test assets only; no production number migration,
Embedded Signup, additional app roles, webhooks, recipient verification or sends in this step.

Owner manually enters META_APP_ID, META_APP_SECRET, META_GRAPH_API_VERSION (actual supported
version shown by Meta) and a fresh independently generated META_WEBHOOK_VERIFY_TOKEN into
API and Worker Railway variables only. Corresponding values must match across these server
services. Never put them on Web or in Git/chat. Do not overwrite local .env. Leave
META_DEVELOPMENT_ACCESS_TOKEN unset until explicitly authorized provider testing.

Creation/dashboard credentials are owner-operated. Report only completion statuses. Storage,
SMTP/scanner, trial service limits, Redis readiness and browser auth topology remain separate
gates; entering Meta configuration does not authorize deployment. Official Meta onboarding
page returned429 during this review, so exact current menu labels were not independently
verified; ask for a secret-free screenshot if the dashboard differs from the generic flow.

When finished, report only these statuses to the development team:

- Meta development app created: yes/no
- WhatsApp product added: yes/no
- Test recipient verified: yes/no
- Local `.env` values added: yes/no

Never share the actual app secret, access token, webhook token, or other credential.
