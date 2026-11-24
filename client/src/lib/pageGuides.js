/**
 * SmartStock self-guided tour definitions.
 *
 * Every page in the app has its own guide. Each guide records the real
 * elements on that page (accurate, helpful selectors) and ends with a
 * "continue to the next page or stay here" decision.
 *
 * Selector syntax supported by OnboardingGuide:
 *   - CSS selectors          -> "input[type='email']"
 *   - text=Exact label       -> "text=Net profit"
 *   - button:has-text('X')   -> "button:has-text('Add Item')"
 */

export const pageGuides = {
  register: {
    pageKey: "register",
    title: "Create your SmartStock account",
    nextPage: "/login",
    nextPageLabel: "Login",
    steps: [
      {
        title: "Tell us about your store",
        description:
          "Enter your store or business name. This is the name attached to all your inventory, sales, and reports. You can also upload a store logo (optional).",
        selector: "input[name='storeName']",
      },
      {
        title: "Activate your product key",
        description:
          "Paste the 18-character product key you received with your purchase (XXXXXX-XXXXXX-XXXXXX). It turns green the moment it is recognized as valid.",
        selector: "input[name='productKey']",
      },
      {
        title: "Continue to email verification",
        description:
          "Once your store name and product key are set, click this button to move to step 2 of registration.",
        selector: "button:has-text('Next: Verify Email')",
      },
      {
        title: "Verify your email address",
        description:
          "Type the email for this account, press Send verification code, then enter the code from your inbox and press Verify.",
        selector: "button:has-text('Send verification code')",
      },
      {
        title: "Create a strong password",
        description:
          "Use at least 8 characters with an uppercase letter, a number, and a symbol. Follow the strength meter, confirm the password, and add your phone number.",
        selector: "input[name='password']",
      },
      {
        title: "Finish & continue to login",
        description:
          "Review your details and press Create account. You will be redirected to Login to open your new workspace. When ready, use Continue below - or Stay here to review.",
        selector: "button:has-text('Create account')",
      },
    ],
  },

  login: {
    pageKey: "login",
    title: "Access your SmartStock workspaces",
    nextPage: "/dashboard",
    nextPageLabel: "the Dashboard",
    steps: [
      {
        title: "Enter your email",
        description:
          "Use the email you registered with - the system recognizes your store by this address.",
        selector: "input[type='email']",
      },
      {
        title: "Enter your password",
        description:
          "Type the password you set during registration. Use the eye icon if you want to check what you have typed.",
        selector: "input[type='password']",
      },
      {
        title: "Recover access",
        description:
          "If you forgot your password, use this link to get a reset code sent to your email.",
        selector: "a[href='/forgot-password']",
      },
      {
        title: "Stay signed in",
        description:
          "Keep Remember me checked so SmartStock keeps you signed in on this device. Uncheck it on shared or public computers.",
        selector: "text=Remember me",
      },
      {
        title: "Sign in & continue",
        description:
          "Press Login to open your workspace. Admins land on the Dashboard, while staff go straight to the Point of Sale.",
        selector: "button[type='submit']",
      },
    ],
  },

  forgotPassword: {
    pageKey: "forgot-password",
    title: "Recover your password",
    nextPage: "/login",
    nextPageLabel: "Login",
    steps: [
      {
        title: "Enter your email",
        description:
          "Type the email linked to your SmartStock account so we can send you a reset code.",
        selector: "input[type='email']",
      },
      {
        title: "Request the reset code",
        description:
          "Press this button and a verification code will be emailed to you within moments.",
        selector: "button:has-text('Send Verification Code')",
      },
      {
        title: "Enter the reset code",
        description:
          "Open your inbox, copy the code from the email, and type it into the code field below.",
        selector: "text=Enter Code",
      },
      {
        title: "Verify & continue",
        description:
          "Press Verify Code to continue - you will be taken to the Reset Password page automatically, or you can press Continue below when ready.",
        selector: "button:has-text('Verify Code')",
      },
    ],
  },

  verifyCode: {
    pageKey: "verify-reset-code",
    title: "Verify your email code",
    nextPage: "/login",
    nextPageLabel: "the Login page",
    steps: [
      {
        title: "Your email address",
        description:
          "Enter the email address you need to verify or reset.",
        selector: "input[type='email']",
      },
      {
        title: "Enter the verification code",
        description:
          "Type the code that was sent to your inbox. If you do not see it, check your spam folder.",
        selector: "input[type='text']",
      },
      {
        title: "Verify & continue",
        description:
          "Press Verify Code to continue to the password reset stage. When ready you can also press Continue below.",
        selector: "button:has-text('Verify Code')",
      },
    ],
  },

  resetPassword: {
    pageKey: "reset-password",
    title: "Create a new password",
    nextPage: "/login",
    nextPageLabel: "Login",
    steps: [
      {
        title: "Choose a new password",
        description:
          "Create a fresh password. Use the eye toggle to check what you have typed.",
        selector: "text=New Password",
      },
      {
        title: "Confirm your password",
        description:
          "Type it again exactly to confirm. If the two do not match, the reset will not go through.",
        selector: "text=Confirm Password",
      },
      {
        title: "Save & sign in",
        description:
          "Press Change Password to save your new password. You will be redirected to Login automatically - or press Continue below when ready.",
        selector: "button:has-text('Change Password')",
      },
    ],
  },


  dashboard: {
    pageKey: "dashboard",
    title: "Admin dashboard - your control room",
    nextPage: "/pos",
    nextPageLabel: "the Point of Sale",
    steps: [
      {
        title: "Act on urgent stock first",
        description:
          "Items near or below their minimum stock level are listed here. Replenish them via Inventory so sales are never interrupted.",
        selector: "text=Low Stock Alerts",
      },
      {
        title: "Check your sales targets",
        description:
          "Generate daily, weekly, or monthly targets so your store has clear, measurable goals.",
        selector: "text=Sales Targets",
      },
      {
        title: "Watch performance live",
        description:
          "This bar shows how close you are to the daily target. Green = achieved, yellow = on track, red = behind.",
        selector: "text=Target Progress",
      },
      {
        title: "Add teammates",
        description:
          "The User Management panel lets you register staff accounts so your team can use the Point of Sale.",
        selector: "text=Register User",
      },
      {
        title: "Continue or stay",
        description:
          "The Point of Sale is where your team sells every day. Press Continue to see it - or Stay here to keep exploring the dashboard.",
        selector: "text=Point of Sale",
      },
    ],
  },

  pos: {
    pageKey: "pos",
    title: "Point of sale - your cashier screen",
    nextPage: "/inventory",
    nextPageLabel: "Inventory",
    steps: [
      {
        title: "Find products instantly",
        description:
          "Type a product name here, or scan with a USB barcode scanner - matching items appear below automatically.",
        selector: "input[placeholder='Search or scan...']",
      },
      {
        title: "Open the camera scanner",
        description:
          "Press this icon to start the barcode camera. Point it at a product barcode and the item is added to the order.",
        selector: "svg.lucide-scan-line",
      },
      {
        title: "The scanner in action",
        description:
          "This is the camera feed and scan counter. Hold a barcode steady inside the frame - recognized items count up here.",
        selector: "text=Scans:",
      },
      {
        title: "Your current order",
        description:
          "Every added item lands in the cart panel. Use + / - to change quantities and the trash icon to remove items.",
        selector: "text=Cart (",
      },
      {
        title: "Complete the sale",
        description:
          "Choose the payment method (Cash, M-Pesa, or Customer credit), enter the amount received, then press Complete Sale.",
        selector: "button:has-text('Complete Sale')",
      },
      {
        title: "Print the receipt",
        description:
          "After the sale, use Print to give your customer a receipt. It comes out formatted for a receipt printer.",
        selector: "button:has-text('Print')",
      },
      {
        title: "Continue or stay",
        description:
          "Inventory is where you manage products and stock levels. Press Continue to open it - or Stay here to keep selling.",
        selector: "text=Inventory",
      },
    ],
  },

  inventory: {
    pageKey: "inventory",
    title: "Manage your inventory",
    nextPage: "/operations",
    nextPageLabel: "Business Operations",
    steps: [
      {
        title: "Find any product",
        description:
          "Type a product name or SKU to filter the list instantly, even in large catalogs.",
        selector: "input[placeholder='Search inventory...']",
      },
      {
        title: "At-a-glance stock value",
        description:
          "These cards show total stock quantity, its value, and estimated profit across your entire inventory.",
        selector: "text=Total Stock",
      },
      {
        title: "Bulk-add products",
        description:
          "Use Import CSV to upload many products at once instead of typing them one by one.",
        selector: "text=Import CSV",
      },
      {
        title: "Create a product",
        description:
          "Press Add Item to open the product form - name, pricing, units, and low-stock alert all live here.",
        selector: "button:has-text('Add Item')",
      },
      {
        title: "Complete the product form",
        description:
          "Fill in the product name and pricing. Set the quantity you have in stock and the warning threshold for low-stock alerts.",
        selector: "input[placeholder='Item name']",
      },
      {
        title: "Scan a barcode",
        description:
          "Press Scan next to SKU/Barcode to open the camera scanner and fill the product SKU automatically.",
        selector: "button:has-text('Scan')",
      },
      {
        title: "The inventory scanner",
        description:
          "This is the scanner panel. Switch on Warehouse Mode for multi-camera counting, or scan a single barcode to capture its SKU into the form.",
        selector: "text=Scanner Mode",
      },
      {
        title: "Continue or stay",
        description:
          "Business Operations covers stock movements, expenses, suppliers, and customer credit. Press Continue to open it - or Stay here.",
        selector: "text=Operations",
      },
    ],
  },


  operations: {
    pageKey: "operations",
    title: "Business operations",
    nextPage: "/sales",
    nextPageLabel: "Sales",
    steps: [
      {
        title: "Choose a workflow",
        description:
          "Use these tabs to switch between Stock, Expenses, Suppliers, and Customer credit workflows.",
        selector: "button:has-text('Stock')",
      },
      {
        title: "Record stock movement",
        description:
          "Log receipts, count adjustments, damaged stock, or customer returns so your stock numbers stay truthful.",
        selector: "button:has-text('Record movement')",
      },
      {
        title: "Track due expenses",
        description:
          "Open this tab to record rent, utilities, salaries, and other operating costs.",
        selector: "button:has-text('Expenses')",
      },
      {
        title: "Add an expense",
        description:
          "Enter the expense name, amount, and due date, then save. It appears in the expenses table with a Due status.",
        selector: "button:has-text('Save due expense')",
      },
      {
        title: "Manage supplier payments",
        description:
          "Open this tab to log supplier payments and keep a clean cash-flow record.",
        selector: "button:has-text('Suppliers')",
      },
      {
        title: "Log a supplier payment",
        description:
          "Enter the supplier, amount, and payment method (e.g., M-Pesa), then save the payment.",
        selector: "button:has-text('Record supplier payment')",
      },
      {
        title: "Collect customer balances",
        description:
          "This tab lists outstanding balances from credit sales. Enter a payment amount and record it as received.",
        selector: "button:has-text('Customer credit')",
      },
      {
        title: "Continue or stay",
        description:
          "The Sales center lets you record manual sales and review revenue summaries. Press Continue to open it - or Stay here.",
        selector: "text=Sales",
      },
    ],
  },

  sales: {
    pageKey: "sales",
    title: "Sales center",
    nextPage: "/reports",
    nextPageLabel: "Reports",
    steps: [
      {
        title: "See your day at a glance",
        description:
          "These cards show today's total sales, profit, and items sold for quick reviews.",
        selector: "text=Total Sales",
      },
      {
        title: "Record a sale",
        description:
          "Press New Sale to open the sale form and add products to the order.",
        selector: "button:has-text('New Sale')",
      },
      {
        title: "Name your customer",
        description:
          "Optional, but helpful for bookkeeping, receipts, and credit tracking.",
        selector: "input[placeholder='Customer name']",
      },
      {
        title: "Pick products",
        description:
          "Search or select a product, set the quantity, and it is ready to add to the order.",
        selector: "input[placeholder='Search item']",
      },
      {
        title: "Add to the order",
        description:
          "Press Add to Cart, then adjust quantities with the number fields if you need to.",
        selector: "button:has-text('Add to Cart')",
      },
      {
        title: "Confirm payment",
        description:
          "Check the totals (subtotal, discount, tax) and press Confirm Sale to record the transaction.",
        selector: "button:has-text('Confirm Sale')",
      },
      {
        title: "Continue or stay",
        description:
          "Reports turn your data into profit figures and sales forecasts. Press Continue to open them - or Stay here.",
        selector: "text=Reports",
      },
    ],
  },

  reports: {
    pageKey: "reports",
    title: "Financial reports & forecasts",
    nextPage: "/settings",
    nextPageLabel: "Settings",
    steps: [
      {
        title: "Choose the period",
        description:
          "Set the From and To dates to generate a financial report for that exact range.",
        selector: "input[type='date']",
      },
      {
        title: "Understand the numbers",
        description:
          "Review revenue, tax, gross profit, net profit, and outstanding balances for each currency in the period.",
        selector: "text=Net profit",
      },
      {
        title: "Forecast future demand",
        description:
          "This section estimates future monthly revenue based on your sales history.",
        selector: "text=Sales forecast",
      },
      {
        title: "Read the reasoning",
        description:
          "Open the assumptions and limitations to understand how the forecast was calculated.",
        selector: "text=Assumptions",
      },
      {
        title: "Continue or stay",
        description:
          "Settings controls your appearance, business info, types, and security. Press Continue to open it - or Stay here.",
        selector: "text=Settings",
      },
    ],
  },


  settings: {
    pageKey: "settings",
    title: "System settings",
    nextPage: "/backup",
    nextPageLabel: "Backup",
    steps: [
      {
        title: "Choose your theme",
        description:
          "Switch between Light and Dark mode here to match your working environment.",
        selector: "select",
      },
      {
        title: "Set your business type",
        description:
          "Pick the type that matches your business (retail, pharmacy, restaurant, and more) - it adjusts how the inventory form behaves.",
        selector: "text=Business Type",
      },
      {
        title: "Update business profile",
        description:
          "Edit your store name, address, phone, and email shown on receipts and records.",
        selector: "button:has-text('Edit Business Info')",
      },
      {
        title: "Choose your alerts",
        description:
          "Turn low-stock warnings and sales milestone notifications on or off to match your workflow.",
        selector: "text=Low stock alerts",
      },
      {
        title: "Secure your account",
        description:
          "Change your password regularly to keep the workspace protected.",
        selector: "button:has-text('Change Password')",
      },
      {
        title: "Continue or stay",
        description:
          "Backup protects your data with exports and restores - the last stop on this tour. Press Continue to finish, or Stay here.",
        selector: "text=Backup",
      },
    ],
  },

  backup: {
    pageKey: "backup",
    title: "Backup & restore - the final stop",
    nextPage: null,
    nextPageLabel: null,
    steps: [
      {
        title: "Create a backup",
        description:
          "Download a full backup file of your database. Make it a habit before updates or big changes.",
        selector: "button:has-text('Export Backup')",
      },
      {
        title: "Restore when needed",
        description:
          "Use Import Backup to bring a backup file back into the system after data loss or a reset.",
        selector: "button:has-text('Import Backup')",
      },
      {
        title: "You have completed the tour",
        description:
          "You now know your way around the whole system. You can reopen any guide anytime with the Help (?) buttons. Press Finish to close - or Stay here.",
        selector: "text=Keep your data safe",
      },
    ],
  },
};

