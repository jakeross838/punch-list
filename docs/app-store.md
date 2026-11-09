# The App Store listing

Everything App Store Connect asks for, ready to paste once Jake picks the app's name (Round 5, item 1). Until then it says Punch List, the name the app has now. Nothing here is sent to Apple until Jake says to.

## The app

- **Name:** Punch List (to change with the name: `apps/mobile/src/constants/app.ts`, `app.json`, the camera and microphone asks in `app.json`, these pages, and the pages' footer).
- **Subtitle** (30 at most): Punch lists for home builders
- **Category:** Business; the second one, Productivity.
- **Copyright:** 2026 Jake Ross
- **Support:** https://punch-list.expo.app/support/
- **Privacy Policy:** https://punch-list.expo.app/privacy/
- **Terms of Use:** https://punch-list.expo.app/terms/ (also under Me in the app). Apple's standard terms for apps apply as well, so the listing keeps Apple's own.
- **Price:** free to download; plans are agreed with each company outside the app (Round 5, item 5).

## The words

**Promotional text** (170 at most, changes without a review):

Walk the job, take a photo of each thing left to do, and send every company its own list. It works with no signal.

**Description** (4,000 at most):

Punch List is the running list of work on each of your jobs, made for home builders and their superintendents.

Walk the house and take a photo of each thing left to do. Mark it up with a circle or an arrow, say what it is, and it lands in its room with the company that does the work. Claude can fill it in from the photo, read the rooms off your plans, and write down what you say.

Every company gets its own list: on a private page that opens on any phone with no account, as a PDF in your company's look, or by text. They mark their work done, confirm when they are coming and comment, and you check it off.

See what is ready and what is waiting, and on whom: another company, the owner, or a task that has to come first. The schedule, the plans with each item pinned where it is, a job station for the site's TV, and a page for the owner keep everyone looking at the same list.

It works with no signal and catches up when you are back in range. Everything stays with your company: admins, project managers, superintendents and view only, each seeing what their role allows.

**Keywords** (100 at most, with commas and no spaces):

punch list,construction,builder,contractor,subcontractor,walkthrough,jobsite,superintendent,homes

## For App Review

- **Sign in:** with Apple, or with any email (a six digit code is emailed). Someone new names their company and is its admin. On Jobs, Add the Sample Job puts a whole job with photos, marks, companies and comments in place, to try everything on. No demo account is needed.
- **Notes:** Claude's features (Fill In From Photo, Read the Plans, Say It, Ask Claude how) need a signal. The companies' and owners' pages open on the web at punch-list.expo.app.
- **Contact:** Jake Ross, jake@rossbuilt.com, and a phone number from Jake.

## Age rating

Every question is None or No, so the rating is 4+. What people put in (photos, comments) is seen only inside their own company, by the companies they send a list to, and by an owner they give a page to: there is no public sharing, chat with strangers, or web browsing.

## App Privacy (the answers in App Store Connect)

Data is collected, none of it is used to track anyone, and all of it is linked to the person, for App Functionality only:

| Apple's type | What it is in the app |
| --- | --- |
| Contact Info: Name | People at the company, and the companies' people typed in for their lists |
| Contact Info: Email Address | The same, and the sign in |
| Contact Info: Phone Number | The same, when one is added |
| User Content: Photos or Videos | The job photos and the plans |
| User Content: Other User Content | Items, comments, checklists, the schedule, the logo |
| Identifiers: User ID | The account |
| Identifiers: Device ID | The push notification token, when notifications are on |

Not collected: location, contacts from the phone, health, financial information, browsing or search history, usage data, diagnostics, purchases, audio (Say It turns speech into words on the iPhone, and only the words leave it). The app's privacy manifest in `app.json` (`ios.privacyManifests`) says the same, with the reasons for the system calls the app and its libraries make (user defaults, file times, the time since the phone started, free space).

## Screenshots

`npm run preview:build && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx tsx tools/app-store-shots.ts` makes the six iPhone screenshots at the 6.9 inch size (1320 by 2868) in `local/app-store-shots`: Jobs, a job, a location's items, an item with its marked photo, the plans with their pins, and Send. They come from the preview's sample data, with the sample job named Bay Isles House. Take them again once the name and look are final.
