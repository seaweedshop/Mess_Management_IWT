# PlateMate setup

## Local development
1. Run `npm install`.
2. Use `platemate` as the database name. In Atlas, open **Security → Network Access → IP Access List → Add IP Address**, then add your current IP address. For a temporary local test only, you can add `0.0.0.0/0`; restrict this before production.
3. Under **Security → Database Access**, create a database user. Copy the Atlas driver connection string into `MONGODB_URI` in `.env`, replacing the username, password, and database name with `platemate`. If the password contains special characters, URL-encode it. Set `JWT_SECRET` to a long random value, and `ADMIN_EMAILS` to one or more comma-separated college emails.
4. In one terminal run `node backend/index.js`; in another run `npm run dev`. Vite proxies `/api` to the local Express server on port 3000. For the Vercel local runtime, run `vercel dev`.

Vercel deployment handles the `/api` route automatically through the small adapter in `api/index.js`.

## Example MongoDB URI

```env
MONGODB_URI=mongodb+srv://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_CLUSTER.mongodb.net/platemate?retryWrites=true&w=majority
```

You do not need to create collections manually. The app creates them when used:

- `User` is created during registration.
- `Meal` is automatically seeded with the default 7-day Odia menu the first time an authenticated user opens the menu while the `Meal` collection is empty.
- `Fee`, `Fb`, and `Ann` are created when an admin uses those features.

To trigger the default menu seed, start the app, register a student, log in, and open **Menu**. The first menu request inserts the weekly data into MongoDB. Existing menu data is never overwritten.

## Development seed accounts and payments

The app requires `@iiit-bh.ac.in` addresses, so the seed accounts use that college domain rather than Gmail. The seed generates 50 students from `b123001` through `b123050`, each with an email such as `b123001@iiit-bh.ac.in`.

Run this only against your development database:

```bash
npm run seed
```

The seed command reads `MONGODB_URI` from the root `.env` file automatically. If you still see a missing-variable error, confirm that the file is named exactly `.env` and is in `C:\my_stuff\react\messManagement-IWT`, next to `package.json`.

The script upserts 50 student accounts, one admin account, and four offline fee records per student, including paid records for the charts. It replaces the existing seeded fee records for those students so rerunning it stays deterministic. It writes the generated development credentials to `SEED_CREDENTIALS.txt`; that file is ignored by Git and must not be uploaded or used in production.

Seeded admin:

```text
Email: admin@iiit-bh.ac.in
Password: PlateMate@Admin123
```

## Vercel deployment
1. Import the repository into Vercel.
2. Keep the build command as `npm run build`; Vite outputs the frontend to `dist`.
3. In Atlas Network Access, add `0.0.0.0/0` or the supported Vercel egress range for your deployment. Add `MONGODB_URI`, `JWT_SECRET`, and `ADMIN_EMAILS` under Project Settings → Environment Variables.
4. Deploy. No payment gateway is used: fees are recorded and marked paid offline by an admin.

The first registration whose email is included in `ADMIN_EMAILS` receives the admin role. All other `@iiit-bh.ac.in` registrations are students.
