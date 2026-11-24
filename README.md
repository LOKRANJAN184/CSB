# Chendurar Sweets and Bakery (செந்தூரர் ஸ்வீட்ஸ் & பேக்கரி)
### Mobile-Friendly Shop Management Application

A modern, responsive, mobile-first management system designed specifically for bakery and sweet stall daily operations with large touch-friendly buttons, instant real-time synchronization, receipt photo capture with automated compression, and full discrepancy auditing.

---

## 🚀 Quick Access & Login Credentials

- **Application URL**: `http://localhost:5000`
- **Two Accounts (Pre-configured & Seeded)**:
  - 👑 **Owner (உரிமையாளர்)**:
    - **PIN**: `8888`
    - **Password**: `owner123`
    - **Permissions**: Full control. Edit any past or present date, view expense bill photos, add/remove staff, view complete edit history & audit log, and view monthly sales & salary reports.
  - 👔 **Shop Manager (மேலாளர்)**:
    - **PIN**: `1111`
    - **Password**: `manager123`
    - **Permissions**: Daily sales entry, multiple expenses with bill photos, daily staff attendance, add/remove staff. **Edit allowed only on the same day**; past records are view-only. **Reports and Edit History are completely removed from the Shop Manager login.**

---

## 📱 Core Features

### 1. Daily Sales Entry & Real-Time Sales Tally
- **System Sales**: Enter daily POS/system sales amount.
- **Multiple Expenses per Day**:
  - Add unlimited expense items (e.g. Milk 40L, Ghee 5kg, Packaging boxes, Cleaning supplies).
  - Each expense has an **Amount (₹)**, a **Short Note**, and a **Camera/Gallery Photo Button** (`📷 Attach Bill`).
  - Automatically calculates total expenses in real time.
- **Cash & GPay Breakdown**:
  - Total physical cash collected.
  - Total GPay/UPI digital payment collected.
- **Sales Tally Formula**:
  $$\text{System Sales} \stackrel{?}{=} \text{Expenses} + \text{Total Cash} + \text{Total GPay}$$
  - **Balanced**: Shows high-contrast green banner `✅ TALLY MATCHED! Balanced perfectly (₹0 difference)`.
  - **Discrepancy (Excess or Shortage)**: Shows high-visibility warning banner `⚠️ TALLY MISMATCH! Discrepancy of ₹X`.
  - **Non-blocking Save**: The system saves the entry even when mismatched, but clearly flags the discrepancy for both Owner and Manager.

### 2. Expense Bill Photo Capture & Compression
- Tap `📷 Attach Bill` to open the phone camera or photo gallery.
- **Double Compression Pipeline**:
  1. **Client-Side**: HTML5 Canvas scales large phone photos (8–12MP) to 1200px and pre-compresses them before upload, saving mobile data.
  2. **Server-Side (Sharp)**: Backend resizes and converts to lightweight, high-clarity WebP at 80% quality, reducing a 5–10MB phone capture to ~50–150KB.
- Photos are stored in `uploads/bills/` and only the relative URL link is persisted in MongoDB.
- Includes a full-screen **Photo Lightbox** modal with zoom and 90° rotation.

### 3. Staff Attendance
- Daily attendance marking for all active bakery staff members.
- Large 3-state segmented touch buttons (minimum 48–56px tap area):
  - `[ 🟢 Present ]`
  - `[ 🟡 Half-Day ]`
  - `[ 🔴 Absent ]`
- In-time and Out-time fields with a quick 1-tap `[ ⏱️ Now ]` timestamp button.
- Quick `[ All Present ✓ ]` button for fast morning check-in.

### 4. Staff Management & Per-Day Salary (Owner Alone)
- **Owner Alone Sets Per-Day Salary**:
  - When joining, only the **Owner** can configure the staff member's **Per Day Salary (₹/day)** (e.g. ₹600, ₹800/day).
  - The Shop Manager can add or remove staff members (providing Name, Role, Phone), but **cannot set, view, or modify staff salary rates**.
  - All salary information is completely hidden from the Manager's staff directory view.

### 5. Monthly Staff Salary Calculation (Based on Attendance)
- That month's salary for each staff member is calculated directly from their monthly attendance records:
  $$\text{Effective Payable Days} = \text{Days Present} + (0.5 \times \text{Half-Days})$$
  $$\text{Calculated Month Salary} = \text{Effective Payable Days} \times \text{Per Day Salary}$$
  - **Present**: 1 full payable day.
  - **Half-day**: 0.5 payable day.
  - **Absent**: 0 pay.
- The **Monthly Reports** view (Owner Exclusive) displays:
  - **Total Staff Monthly Salary Payout**: Sum of all staff salaries for that month.
  - **Itemized Salary Cards**: Staff Name, Role, Per Day Salary, Days Present, Half-days, Absences, Payable Days, and Calculated Month Salary with full formula breakdown.

### 5. Past Records & Calendar
- Jump to any past date using the date stepper or calendar date picker.
- Tapping any date loads that day's complete breakdown:
  - System sales, Cash, GPay, and Tally status.
  - Itemized expenses with clickable bill photo receipts.
  - Full staff attendance roster.
- **Permission Enforcement**:
  - Owner can tap `✏️ Edit This Date` to modify records for any date.
  - Shop Manager can view past dates, but can edit only today's records.

### 6. Edit History / Audit Log (Owner Exclusive)
- Every creation, modification, deletion, and photo change is logged:
  - Who made the change (Owner or Manager, name and role).
  - What module and field changed.
  - Old value vs New value.
  - Date and exact timestamp.
  - Dedicated logging for bill photo attachments, replacements, and deletions.
- Filterable by module (Sales, Expenses, Attendance, Staff).

### 7. Monthly Reports & Attendance Summary
- **Monthly Sales Aggregation**: Total System Sales, Total Cash, Total GPay, Total Expenses, and Tally Discrepancy counts.
- **Staff Attendance Summary (For Shop Manager)**:
  - Days Present, Half-days, Absences, and Effective Working Days ($\text{Present} + 0.5 \times \text{Half-Days}$).
  - **Salary calculation and wage rates are completely removed from the Shop Manager's view**.
- **Staff Salary Calculation (Owner Exclusive)**:
  - Includes daily/monthly wage rates and estimated monthly salary calculations for payroll management.
- Print-friendly layout.

### 8. Real-Time Synchronization (Socket.io)
- Real-time WebSocket connection between all active devices.
- When the Shop Manager saves sales or attendance on their phone, the Owner's screen updates immediately without refreshing.

---

## 🛠️ Architecture & Tech Stack

```
CSB PROJECT/
├── server/
│   ├── config/db.js          # MongoDB connection (Mongoose)
│   ├── models/               # User, DailySales, Attendance, Staff, AuditLog
│   ├── routes/               # auth, sales, attendance, staff, history, reports
│   ├── middleware/auth.js    # JWT & Same-day edit permission enforcement
│   ├── services/
│   │   ├── auditService.js   # Audit diff logger & Socket broadcast
│   │   └── uploadService.js  # Multer & Sharp photo compression
│   ├── socket.js             # Socket.io real-time engine
│   └── server.js             # Express app entry point & seeders
├── public/                   # Mobile-friendly web client (PWA ready)
│   ├── index.html            # Main mobile layout, large buttons & keypad
│   ├── css/styles.css        # Mobile touch CSS & animations
│   └── js/
│       ├── api.js            # REST API client with canvas compression
│       ├── socket.js         # Realtime Socket.io client listeners
│       └── app.js            # Master application state & views
├── uploads/bills/            # Compressed bill photos storage
├── data/db/                  # Local MongoDB data files
├── start.sh                  # One-command startup script
└── package.json
```

---

## 🏃 Running the Application

To start both MongoDB and the Node.js Express server:

```bash
./start.sh
```

Or run manually:
```bash
# 1. Start MongoDB
./.tools/bin/mongod --dbpath ./data/db --port 27017 --bind_ip 127.0.0.1 --fork --logpath ./data/mongod.log

# 2. Start Express server
node server/server.js
```

Open `http://localhost:5000` on any mobile or desktop browser.

