# PropLead — Real Estate Lead & Inventory Manager

Lightweight Real Estate Lead, Follow-up & Inventory Manager built with **Angular** (frontend) and **PHP + MySQL** (backend), specifically structured for **InfinityFree** shared hosting with timezone set to **`Asia/Kolkata` (IST)**.

## Features Implemented
- **Secure Login & First-Time Admin Setup**: Token-based authentication (`users` + `user_sessions`), `password_hash()` storage, and Change Password UI.
- **Leads Management (CRUD)**:
  - Add, edit, search, filter, and delete leads.
  - **Budget Min & Max** with form & backend validations (`budget_max >= budget_min`).
  - **Mark Lead as Visited** (one-click toggle + visited timestamp in IST).
  - **Have to Take Follow-up** flag + scheduled next follow-up date/time (IST).
  - Link leads to an Inventory unit.
- **Lead Follow-ups Queue & History**:
  - Dedicated Follow-ups page (`Overdue`, `Due Today`, `Upcoming`, `All Pending`).
  - Log follow-up interactions (Call, WhatsApp, Email, Site Visit, Meeting), mark as visited, and schedule the next follow-up.
- **Inventory Management (Text-only — NO Photo/File Uploads)**:
  - Designed to stay ultra-light within InfinityFree's 5 GB limit.
  - **Unique Distinguishing Code** (`unique_code`, e.g., `T1-410C`, `INV-322B`) enforced unique in DB + API.
  - **Unit Number** (`unit_number`, e.g., `410 C`, `322 B`), Project/Title, Type, Floor/Wing, Area, Price, Location, Notes.
  - Quick inline Tag switching.
- **Tag Master**:
  - Create, edit, and delete tags (e.g. `For Sale`, `For Rent`, `Sold`, `Rented`, `Reserved`) with **Name**, **Description**, and badge color.
- **UI-Configurable Follow-up Email Reminders**:
  - Configure recipient email, sender email, reminder lead-time, and transport (**Brevo API**, **Resend API**, **SMTP**, or **PHP `mail()`**) in **Email & Security**.
  - Includes **Send Test Email**, **Send Due Reminders Now**, reminder delivery logs, and a secret-protected Cron URL (`/api/reminders/cron?key=...`).
- *(Earnings/Analytics dashboard skipped for now as requested.)*

## InfinityFree Deployment Steps
1. **Create a MySQL Database** in InfinityFree VistaPanel -> **MySQL Databases**.
2. Open **phpMyAdmin** for that database and import `backend/database/schema.sql`.
3. Build the ready-to-upload `htdocs` bundle:
   ```bash
   chmod +x build_infinityfree.sh
   ./build_infinityfree.sh
   ```
4. Copy `deploy-htdocs/config/config.example.php` to `deploy-htdocs/config/config.local.php` and fill in your InfinityFree MySQL host, database name, username, password, and a random `app_secret`.
5. Upload all contents of `deploy-htdocs/` into your InfinityFree `htdocs/` directory via FTP/File Manager.
6. Visit your domain -> you will see the **First-Time Setup** screen to create your Admin login.
7. Go to **Email & Security** in the app to configure your reminder email and copy the **Cron URL** into InfinityFree Cron Jobs (or a free scheduler like cron-job.org) to send automated follow-up reminders.

> **Note for InfinityFree Free Tier:** InfinityFree free hosting blocks outbound SMTP ports (25/465/587) and disables PHP `mail()`. Select **Brevo HTTP API** or **Resend HTTP API** in **Email & Security** so reminder emails send reliably over HTTPS (cURL).

## Local Development
1. Import `backend/database/schema.sql` into local MySQL and configure `backend/config/config.local.php`.
2. Start PHP API server:
   ```bash
   php -S 127.0.0.1:8000 -t backend/api
   ```
   *(For local PHP built-in server, copy `backend/config` & `backend/lib` paths or run router from `backend/`: `php -S 127.0.0.1:8000 backend/api/index.php`)*
3. Start Angular dev server with proxy:
   ```bash
   cd frontend
   npx ng serve --proxy-config proxy.conf.json
   ```

