<<<<<<< HEAD
# pos
=======
# A One Jewelry POS

A professional Point of Sale system designed specifically for jewelry stores. Built with React 19, Vite, and Firebase with full offline-first capabilities.

## Features

### Core Features
- **Offline-First Architecture**: Works without internet using IndexedDB (Dexie)
- **Firebase Backend**: Automatic background sync when online
- **Multi-Role System**: Super Admin, Admin, Manager, Biller, Cashier
- **Dark/Light Theme**: Beautiful amber-themed UI
- **Multi-Language**: English and Urdu (RTL) support
- **PWA Support**: Installable on any device including Chromebook

### Jewelry-Specific
- Weight-based pricing (grams/tola)
- Metal purity support (24K, 22K, 21K, 18K, Silver, Platinum)
- Making charges calculation
- QR code generation for bills
- Thermal printer support

### Business Features
- Bill creation and management
- Customer database
# A One Jewelry POS

A professional Point of Sale system designed specifically for jewelry stores. Built with React 19, Vite, and Firebase with full offline-first capabilities.

## Features

### Core Features
- **Offline-First Architecture**: Works without internet using IndexedDB (Dexie)
- **Firebase Backend**: Automatic background sync when online
- **Multi-Role System**: Super Admin, Admin, Manager, Biller, Cashier
- **Dark/Light Theme**: Beautiful amber-themed UI
- **Multi-Language**: English and Urdu (RTL) support
- **PWA Support**: Installable on any device including Chromebook

### Jewelry-Specific
- Weight-based pricing (grams/tola)
- Metal purity support (24K, 22K, 21K, 18K, Silver, Platinum)
- Making charges calculation
- QR code generation for bills
- Thermal printer support

### Business Features
- Bill creation and management
- Customer database
- Payment processing (Cash, Card, Mobile, etc.)
- Shift management
- Expense tracking
- Comprehensive reports
- Activity audit logs

## Tech Stack

- **React 19** - UI framework
- **Vite 5** - Build tool
- **Firebase 11** - Backend (Auth, Firestore)
- **Dexie 4** - IndexedDB wrapper
- **React Router 7** - Routing
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Lucide React** - Icons
- **React Hot Toast** - Notifications

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Firebase project (for production)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd aone-jewelry-pos
```

2. Install dependencies:
```bash
npm install
```

3. Configure Firebase:
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Authentication (Email/Password)
   - Enable Firestore Database
   - Copy your Firebase config to `.env`:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

4. Start development server:
```bash
npm run dev
```

5. Open http://localhost:5173

### First Time Setup

1. Navigate to `/setup` (automatic redirect if no admin exists)
2. Create your Super Admin account
3. Enter your business information
4. Start using the system!

## Project Structure

```
aone-jewelry-pos/
├── public/                    # Static assets
├── src/
│   ├── assets/               # Images, sounds
│   ├── components/
│   │   ├── ui/              # Reusable UI components
│   │   ├── layout/          # Layout components
│   │   └── shared/          # Shared components
│   ├── context/             # React contexts
│   ├── db/                  # Dexie database setup
│   ├── hooks/               # Custom hooks
│   ├── lang/                # Translation files
│   ├── pages/               # Page components
│   ├── routes/              # Route components
│   ├── services/            # Firebase services
│   ├── styles/              # Global styles
│   ├── sync/                # Sync engine
│   ├── utils/               # Utility functions
│   ├── App.jsx              # Main app component
│   └── main.jsx             # Entry point
├── .env                     # Environment variables
├── index.html               # HTML template
├── package.json             # Dependencies
├── tailwind.config.js       # Tailwind configuration
├── vite.config.js           # Vite configuration
└── README.md                # This file
```

## Architecture & Rules
- `ENTERPRISE_ARCHITECTURE.md` — enterprise architecture, offline strategy, RBAC, audit, reports, and sync guidance
- `SECURITY_RULES.md` — Firebase security rule strategy for Firestore and offline operations
- `FIRESTORE_SCHEMA_VERIFICATION.md` — Firestore schema verification and field expectations

## Keyboard Shortcuts

### Biller
- `INSERT` - Lock/Unlock bill
- `F8` - Checkout
- `ESC` - Close/Cancel
- `DELETE` - Clear all items
- `-` (Minus) - Delete last item

### Cashier
- `INSERT` - Focus search
- `F2` - QR Scanner
- `F3-F5` - Filter by status
- `F9` - Refresh

### Global
- `Ctrl+L` - Logout
- `Ctrl+D` - Toggle dark mode
- `F1` - Show shortcuts help

## User Roles

| Role | Permissions |
|------|-------------|
| **Super Admin** | Full access to all features and settings |
| **Admin** | Manage users, stores, settings, view all reports |
| **Manager** | Manage shifts, cash flow, cancel/edit bills, view reports |
| **Biller** | Create bills, print invoices, view own sales |
| **Cashier** | Process payments, search bills, print receipts |

## Offline Capabilities

The app works fully offline with these features:
- Create and edit bills
- Process payments
- Manage customers
- Track expenses
- All data syncs automatically when back online

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For support, email support@aonejewelry.com or open an issue in the repository.

---

Built with ❤️ for jewelry businesses
