import { render, screen, fireEvent, waitFor, within } from '../utils';
import ProjectFormModal from '@/app/components/ProjectFormModal';
import { authedFetch } from '@/lib/authClient';
import type { Member, Project } from '@/types';

jest.mock('../../src/lib/authClient', () => ({
  ...jest.requireActual('../../src/lib/authClient'),
  authedFetch: jest.fn(),
}));

jest.mock('../../src/app/components/DropdownSelector', () => {
  return function MockDropdownSelector({
    options,
    value,
    onChange,
    ariaLabel,
    placeholder,
    disabled,
  }: {
    options: string[];
    value?: string;
    onChange?: (v: string) => void;
    ariaLabel?: string;
    placeholder?: string;
    disabled?: boolean;
  }) {
    return (
      <select
        aria-label={ariaLabel ?? placeholder}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  };
});

const mockFetch = authedFetch as jest.MockedFunction<typeof authedFetch>;

const STAFF = [
  { user_id: 1, name: 'Ada Lovelace', email: 'ada@branch.org' },
  { user_id: 2, name: 'Grace Hopper', email: 'grace@branch.org' },
];

const PROJECT: Project = {
  project_id: 7,
  name: 'Clean Water',
  description: 'Wells and pumps',
  total_budget: '30000',
  start_date: '2025-01-01',
  end_date: '2025-12-31',
  currency: 'USD',
  created_at: '2025-01-01T00:00:00.000Z',
};

const MEMBERS: Member[] = [
  {
    user_id: 1,
    name: 'Ada Lovelace',
    email: 'ada@branch.org',
    role: 'Director',
  },
];

function savedBody() {
  const write = mockFetch.mock.calls.find(
    ([, init]) => init?.method === 'PUT' || init?.method === 'POST',
  );
  return JSON.parse((write![1] as { body: string }).body);
}

function renderEdit() {
  return render(
    <ProjectFormModal
      open
      onClose={jest.fn()}
      onSaved={jest.fn()}
      project={PROJECT}
      members={MEMBERS}
    />,
  );
}

function renderCreate() {
  return render(
    <ProjectFormModal open onClose={jest.fn()} onSaved={jest.fn()} />,
  );
}

async function pickDate(label: string, day: number) {
  const heading = screen.getByText(new RegExp(`^${label}`));
  fireEvent.click(
    within(heading.parentElement as HTMLElement).getByRole('button'),
  );
  const dialog = await screen.findByRole('dialog', {
    name: `Choose ${label}`,
    hidden: true,
  });
  const buttons = within(dialog).getAllByRole('button', {
    name: String(day),
    hidden: true,
  });
  const inMonth =
    buttons.find((button) => !button.className.includes('opacity-50')) ??
    buttons[0];
  fireEvent.click(inMonth);
}

async function fillCreateForm(opts?: { startDay?: number; endDay?: number }) {
  fireEvent.change(screen.getByPlaceholderText('Enter project name'), {
    target: { value: 'Wells' },
  });
  fireEvent.change(screen.getByPlaceholderText('Enter total funding'), {
    target: { value: '1000' },
  });
  fireEvent.change(
    screen.getByPlaceholderText('Enter a short project description here'),
    { target: { value: 'Dig wells' } },
  );

  await pickDate('Start Date', opts?.startDay ?? 15);
  if (opts?.endDay != null) {
    await pickDate('End Date', opts.endDay);
  }

  const search = await screen.findByLabelText('Assigned Staff');
  fireEvent.change(search, { target: { value: 'Ada' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Ada Lovelace' }));
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((path: string) => {
    if (path === '/projects/assignable-staff') {
      return Promise.resolve({ staff: STAFF } as never);
    }
    return Promise.resolve(PROJECT as never);
  });
});

describe('ProjectFormModal staff roles', () => {
  it('seeds each assigned member with the role they already hold', async () => {
    renderEdit();

    const roleSelect = await screen.findByLabelText<HTMLSelectElement>(
      'Role for Ada Lovelace',
    );
    expect(roleSelect.value).toBe('Director');
  });

  it('saves the role picked for an existing member', async () => {
    renderEdit();

    const roleSelect = await screen.findByLabelText('Role for Ada Lovelace');
    fireEvent.change(roleSelect, { target: { value: 'Student' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT'),
      ).toBe(true);
    });
    expect(savedBody().members).toEqual([{ user_id: 1, role: 'Student' }]);
  });

  it('does not offer Admin, which is a user-level flag', async () => {
    renderEdit();

    const roleSelect = await screen.findByLabelText<HTMLSelectElement>(
      'Role for Ada Lovelace',
    );
    expect(
      Array.from(roleSelect.options).map((option) => option.value),
    ).toEqual(['Director', 'Student']);
  });

  it('starts a newly picked member at the default role and posts it', async () => {
    renderEdit();

    const search = await screen.findByLabelText('Assigned Staff');
    fireEvent.change(search, { target: { value: 'Grace' } });
    fireEvent.click(
      await screen.findByRole('option', { name: 'Grace Hopper' }),
    );

    const added = await screen.findByLabelText<HTMLSelectElement>(
      'Role for Grace Hopper',
    );
    expect(added.value).toBe('Student');

    fireEvent.change(added, { target: { value: 'Director' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT'),
      ).toBe(true);
    });
    expect(savedBody().members).toEqual([
      { user_id: 1, role: 'Director' },
      { user_id: 2, role: 'Director' },
    ]);
  });

  it('saves an empty roster, since admins reach every project anyway', async () => {
    renderEdit();

    const list = await screen.findByRole('list', {
      name: 'Selected Assigned Staff',
    });
    fireEvent.click(
      within(list).getByRole('button', { name: 'Remove Ada Lovelace' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT'),
      ).toBe(true);
    });
    expect(savedBody().members).toEqual([]);
  });
});

describe('ProjectFormModal end date', () => {
  it('lets you create a project without an end date', async () => {
    renderCreate();
    await fillCreateForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([, init]) => init?.method === 'POST'),
      ).toBe(true);
    });
    expect(savedBody().end_date).toBeNull();
    expect(
      screen.queryByText('Please select a date AFTER the start date'),
    ).not.toBeInTheDocument();
  });

  it('still rejects an end date before the start date', async () => {
    renderCreate();
    await fillCreateForm({ startDay: 20, endDay: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Please select a date AFTER the start date'),
    ).toBeInTheDocument();
    expect(
      mockFetch.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false);
  });
});
