import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { render, screen, waitFor } from '../utils';
import ImpersonationBanner from '@/app/components/ImpersonationBanner';
import { directorSubject, session } from '../rbac';

const subject = directorSubject([1], 4);
const target = session({ subject }).user!;

function userWith(mode: 'read_only' | 'full') {
  return {
    ...target,
    name: 'Sam Okafor',
    email: 'sam@branch.org',
    impersonation: {
      userId: 50,
      name: 'Hidden Staff',
      email: 'staff@branch.org',
      sessionId: 'session-1',
      mode,
      expiresAt: new Date().toISOString(),
    },
  };
}

describe('ImpersonationBanner', () => {
  it('renders nothing for an ordinary session', () => {
    const { container } = render(<ImpersonationBanner />, { subject });
    expect(container).toBeEmptyDOMElement();
  });

  it('names the user being viewed and the mode', () => {
    render(<ImpersonationBanner />, { subject, auth: { user: userWith('read_only') } });
    expect(screen.getByRole('status')).toHaveTextContent('Viewing as Sam Okafor (sam@branch.org)');
    expect(screen.getByRole('status')).toHaveTextContent('Read-only');
  });

  it('warns that full access changes are real', () => {
    render(<ImpersonationBanner />, { subject, auth: { user: userWith('full') } });
    expect(screen.getByRole('status')).toHaveTextContent('Full access: changes are real');
  });

  it('exits back to the staff console', async () => {
    const replace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ replace });
    const stopImpersonation = jest.fn().mockResolvedValue(undefined);
    render(<ImpersonationBanner />, {
      subject,
      auth: { user: userWith('read_only'), stopImpersonation },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Exit' }));

    expect(stopImpersonation).toHaveBeenCalled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/staff'));
  });
});
