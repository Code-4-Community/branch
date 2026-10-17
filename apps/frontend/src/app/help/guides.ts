export type Section = 'Accounts' | 'Expenses' | 'Projects' | 'Donors & donations' | 'Reports';

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
  notes?: string[];
}

export const SECTIONS: Section[] = ['Accounts', 'Expenses', 'Projects', 'Donors & donations', 'Reports'];

export const GUIDES: Guide[] = [
  {
    slug: 'sign-in',
    title: 'Sign in',
    notes: [
      'First time? Use the temporary password from your welcome email. BRANCH then asks you to pick your own.',
      'The menu only shows pages your role can use.',
      'You only see projects you are staff on. Admins see everything.',
    ],
    section: 'Accounts',
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
    notes: ['No email? Check spam, or click Resend code.'],
    section: 'Accounts',
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
      {
        text: 'Enter the code from your email and a new password, then click Reset Password.',
        image: '/help/reset-password/new-password.png',
        alt: 'Reset password form with Reset Password highlighted',
      },
    ],
  },
  {
    slug: 'profile',
    title: 'Edit your profile',
    section: 'Accounts',
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
    notes: ['Once it is on, you need a code from the app every time you sign in.'],
    section: 'Accounts',
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
    notes: [
      'An expense only counts toward a project’s spending once an admin approves it.',
      'You can submit expenses only for projects you are staff on.',
      'You can edit or delete your expense while it is Pending or Needs Info. After that, only an admin can change it.',
    ],
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
    notes: [
      'Approving adds the expense to the project’s spending and the Dashboard.',
      'Needs Info sends it back so the submitter can fix it.',
      'Only admins can read admin notes, so tell the submitter directly what is missing.',
    ],
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
    notes: [
      'Staff you add can see the project and submit expenses for it. To choose their role, see “Add staff to a project”.',
      'A project moves to Archived after its end date. Tick “still in progress” if it has none.',
      'Deleting a project also deletes its expenses, donations, staff and reports.',
    ],
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
    slug: 'project-staff',
    title: 'Add staff to a project',
    notes: [
      'Every person gets a role on the project: Director or Student. New staff start as Student.',
      'A person can hold a different role on each project.',
      'Admins see every project already, so you do not need to add them.',
      'Click the X next to a name to take them off the project.',
    ],
    section: 'Projects',
    adminOnly: true,
    steps: [
      {
        text: 'Go to [Projects](/projects) and open the project, then click Edit Project. For a new project, click Add New Project.',
        image: '/help/project-staff/edit-button.png',
        alt: 'Project page with Edit Project highlighted',
      },
      {
        text: 'Under Assigned Staff, search by name and click the person to add them.',
        image: '/help/project-staff/search.png',
        alt: 'Assigned Staff search with a matching name highlighted',
      },
      {
        text: 'In the dropdown next to their name, choose Director or Student.',
        image: '/help/project-staff/role.png',
        alt: 'Role dropdown with Director highlighted',
      },
      {
        text: 'Click Save.',
        image: '/help/project-staff/save.png',
        alt: 'Project form with Save highlighted',
      },
    ],
  },
  {
    slug: 'donors',
    title: 'Add a donor',
    notes: ['Add the donor before you record their donations.', 'Project directors can view donors but not add them.'],
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
    notes: ['Each donation goes to one project. Split a gift across projects by recording it once per project.'],
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
    notes: ['Each report covers one project.', 'Already have a report file? Click Upload Report to store it here.'],
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
    notes: [
      'Tick Admin only for people who should manage everything.',
      'Everyone else sees only the projects you add them to as staff.',
    ],
    section: 'Accounts',
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
