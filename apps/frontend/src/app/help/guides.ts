export type Section = 'Your account' | 'Expenses' | 'Projects' | 'Donors & donations' | 'Reports' | 'Team';

export interface GuideStep {
  text: string;
  image?: string;
  alt?: string;
}

export interface Guide {
  slug: string;
  title: string;
  section: Section;
  adminOnly?: boolean;
  steps: GuideStep[];
}

export const SECTIONS: Section[] = ['Your account', 'Expenses', 'Projects', 'Donors & donations', 'Reports', 'Team'];

export const GUIDES: Guide[] = [
  {
    slug: 'sign-in',
    title: 'Sign in',
    section: 'Your account',
    steps: [
      {
        text: 'On the [login page](/login), enter your email and password, then click Login.',
        image: '/help/sign-in/login.png',
        alt: 'Login page with the Login button highlighted',
      },
      {
        text: 'Use the menu on the left to move around.',
        image: '/help/sign-in/dashboard.png',
        alt: 'Dashboard with the menu on the left',
      },
    ],
  },
  {
    slug: 'reset-password',
    title: 'Reset your password',
    section: 'Your account',
    steps: [
      {
        text: 'On the [login page](/login), click Forgot password?',
        image: '/help/reset-password/forgot-link.png',
        alt: 'Login page with Forgot password highlighted',
      },
      {
        text: 'Enter your email and click Request reset code.',
        image: '/help/reset-password/request-code.png',
        alt: 'Forgot password page with Request reset code highlighted',
      },
      { text: 'Enter the code from your email and a new password.' },
      { text: 'Click Reset Password.' },
    ],
  },
  {
    slug: 'profile',
    title: 'Edit your profile',
    section: 'Your account',
    steps: [
      {
        text: 'Go to [Profile](/profile) and click Edit Profile.',
        image: '/help/profile/edit.png',
        alt: 'Profile page with Edit Profile highlighted',
      },
      { text: 'Change your details and click Save.' },
    ],
  },
  {
    slug: 'two-factor',
    title: 'Turn on two-factor sign-in',
    section: 'Your account',
    steps: [
      {
        text: 'Go to [Profile](/profile) and click Set Up Two-Factor.',
        image: '/help/profile/two-factor.png',
        alt: 'Profile page with Set Up Two-Factor highlighted',
      },
      { text: 'Scan the code with an authenticator app.' },
      { text: 'Enter the 6-digit code and click Verify.' },
    ],
  },
  {
    slug: 'expenses',
    title: 'Submit an expense',
    section: 'Expenses',
    steps: [
      {
        text: 'Go to [Expenses](/expenses) and click New Expense.',
        image: '/help/expenses/new-button.png',
        alt: 'Expenses page with New Expense highlighted',
      },
      { text: 'Fill in the date, amount, type, project and description.' },
      {
        text: 'Upload the receipt as a PDF.',
        image: '/help/expenses/form-receipt.png',
        alt: 'Expense form with the receipt upload highlighted',
      },
      {
        text: 'Click Submit For Review.',
        image: '/help/expenses/form-submit.png',
        alt: 'Expense form with Submit For Review highlighted',
      },
    ],
  },
  {
    slug: 'review-expenses',
    title: 'Review an expense',
    section: 'Expenses',
    adminOnly: true,
    steps: [
      {
        text: 'Go to [Expenses](/expenses) and click a Pending expense.',
        image: '/help/review-expenses/pending-row.png',
        alt: 'Expenses list with a pending expense highlighted',
      },
      {
        text: 'Choose Approved or Needs Info and add a note.',
        image: '/help/review-expenses/decision.png',
        alt: 'Review form with Approved highlighted',
      },
      {
        text: 'Click Save Changes.',
        image: '/help/review-expenses/save.png',
        alt: 'Review form with Save Changes highlighted',
      },
    ],
  },
  {
    slug: 'projects',
    title: 'Add a project',
    section: 'Projects',
    adminOnly: true,
    steps: [
      {
        text: 'Go to [Projects](/projects).',
        image: '/help/projects/nav-projects.png',
        alt: 'Menu with Projects highlighted',
      },
      {
        text: 'Click Add New Project.',
        image: '/help/projects/add-button.png',
        alt: 'Projects page with Add New Project highlighted',
      },
      {
        text: 'Fill in the form and click Save.',
        image: '/help/projects/form-save.png',
        alt: 'Project form with Save highlighted',
      },
    ],
  },
  {
    slug: 'donors',
    title: 'Add a donor',
    section: 'Donors & donations',
    adminOnly: true,
    steps: [
      {
        text: 'Go to [Donors](/donors) and click New Donor.',
        image: '/help/donors/new-button.png',
        alt: 'Donors page with New Donor highlighted',
      },
      {
        text: 'Fill in the form and click Add Donor.',
        image: '/help/donors/form-add.png',
        alt: 'Donor form with Add Donor highlighted',
      },
    ],
  },
  {
    slug: 'donations',
    title: 'Record a donation',
    section: 'Donors & donations',
    adminOnly: true,
    steps: [
      {
        text: 'Go to [Donations](/donations) and click New Donation.',
        image: '/help/donations/new-button.png',
        alt: 'Donations page with New Donation highlighted',
      },
      {
        text: 'Pick the date, donor and project, enter the amount, and click Add Donation.',
        image: '/help/donations/form-add.png',
        alt: 'Donation form with Add Donation highlighted',
      },
    ],
  },
  {
    slug: 'reports',
    title: 'Create a report',
    section: 'Reports',
    adminOnly: true,
    steps: [
      {
        text: 'Go to [Reports](/reports) and click Generate.',
        image: '/help/reports/generate-button.png',
        alt: 'Reports page with Generate highlighted',
      },
      {
        text: 'Name it, pick the type, project and format, and click Generate.',
        image: '/help/reports/generate-form.png',
        alt: 'Report form with Generate highlighted',
      },
      {
        text: 'To download a report, click the arrow on its row.',
        image: '/help/reports/download.png',
        alt: 'Reports list with a download button highlighted',
      },
    ],
  },
  {
    slug: 'accounts',
    title: 'Invite a user',
    section: 'Team',
    adminOnly: true,
    steps: [
      {
        text: 'Go to [Accounts](/accounts) and click Add User.',
        image: '/help/accounts/add-button.png',
        alt: 'Accounts page with Add User highlighted',
      },
      {
        text: 'Enter their email and name, and click Add User. They get an email to sign in.',
        image: '/help/accounts/form-add.png',
        alt: 'Add User form with Add User highlighted',
      },
    ],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
